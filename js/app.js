/**
 * SISTEM PENGURUSAN JADUAL WAKTU (ASG VER 1.0)
 * Fail: app.js
 */

import { db } from "./firebase-config.js";
import { 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    writeBatch,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { startGenerating } from "./engine-generator.js";
import { renderTimetableGrid, getCurrentTimetableData } from "./ui-render.js";

// --- A. PEMUBAH UBAH GLOBAL ---
const auth = getAuth();
let teachersList = [];
let subjectsList = [];
let classesList = [];
let localAssignments = [];

// --- [PENAMBAHBAIKAN 1: PEMETAAN MASA] ---
const timeMapping = {
    "1": "07:10 - 07:40",
    "2": "07:40 - 08:10",
    "3": "08:10 - 09:40",
    "4": "08:40 - 09:10",
    "5": "09:10 - 9:40",
    "6": "9:00 - 10:00",
    "7": "10:00 - 10:30",
    "8": "10:30 - 11:00",
    "9": "11:00 - 11:30",
    "10": "11:30 - 12:00",
    "11": "12:00 - 12:30"
};

const clean = (str) => {
    if (!str) return "";
    return str.trim().replace(/\s+/g, '');
};

// --- B. PENGURUSAN AKSES & AUTHENTICATION ---
onAuthStateChanged(auth, (user) => {
    const authSection = document.getElementById('auth-section');
    const appContainer = document.getElementById('app-container');
    if (user) {
        if (appContainer) appContainer.style.display = 'block';
        if (authSection) authSection.style.display = 'none';
        loadAllData(); 
    } else {
        if (appContainer) appContainer.style.display = 'none';
        if (authSection) authSection.style.display = 'block';
    }
});

// Login & Logout
if (document.getElementById('btnLogin')) {
    document.getElementById('btnLogin').onclick = async () => {
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        try { await signInWithEmailAndPassword(auth, email, pass); } 
        catch (error) { alert("Akses ditolak: " + error.message); }
    };
}
if (document.getElementById('btnLogout')) {
    document.getElementById('btnLogout').onclick = async () => {
        if (confirm("Log keluar?")) { await signOut(auth); location.reload(); }
    };
}

// --- C. PENGURUSAN DATA MASTER ---
async function loadAllData() {
    console.log("Memuatkan data dari Firestore...");
    const [snapT, snapS, snapC] = await Promise.all([
        getDocs(collection(db, "teachers")),
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "classes"))
    ]);
    teachersList = snapT.docs.map(d => ({ id: d.id, ...d.data() }));
    subjectsList = snapS.docs.map(d => ({ id: d.id, ...d.data() }));
    classesList = snapC.docs.map(d => ({ id: d.id, ...d.data() }));
    populateDropdowns();
    renderTeacherTable();
    renderSubjectTable();
    console.log("Data Guru Ditemui:", teachersList.length);
}

async function saveMasterData(col, id, data) {
    try {
        await setDoc(doc(db, col, clean(id)), data);
        alert(`Berjaya disimpan!`);
        loadAllData();
    } catch (e) { alert("Ralat simpan: " + e.message); }
}

window.deleteRecord = async (col, id) => {
    if (confirm(`Padam rekod ${id}?`)) {
        await deleteDoc(doc(db, col, id));
        loadAllData();
    }
};

// Button Handlers for Master Data
document.getElementById('btnSaveTeacher').onclick = () => {
    const id = document.getElementById('regTeacherId').value;
    const name = document.getElementById('regTeacherName').value;
    const short = document.getElementById('regTeacherShort').value.toUpperCase();
    
    // --- [PENAMBAHBAIKAN 2: FUNGSI PENGECUALIAN] ---
    // Kita tambah status 'canRelief' (default true). 
    // Anda boleh tambah checkbox di HTML untuk set ini secara manual.
    const canRelief = true; 

    if(id && name) {
        saveMasterData("teachers", id, { 
            name, 
            shortform: short,
            canRelief: canRelief 
        });
    }
};

document.getElementById('btnSaveSubject').onclick = () => {
    const id = document.getElementById('regSubId').value;
    const name = document.getElementById('regSubName').value;
    const slots = parseInt(document.getElementById('regSubSlots').value);
    const isDouble = document.getElementById('regSubDouble').checked;
    if(id && name) saveMasterData("subjects", id, { name, slots, isDouble });
};

document.getElementById('btnSaveClass').onclick = () => {
    const id = document.getElementById('regClassId').value;
    const name = document.getElementById('regClassName').value;
    if(id && name) saveMasterData("classes", id, { name });
};

// --- D. RENDER TABLES & DROPDOWNS ---
function renderTeacherTable() {
    const container = document.getElementById('teacherTableContainer');
    let html = `<table class="data-table"><tr><th>ID</th><th>Nama</th><th>Singkatan</th><th>Tindakan</th></tr>`;
    teachersList.forEach(t => {
        html += `<tr><td>${t.id}</td><td>${t.name}</td><td>${t.shortform || '-'}</td>
        <td><button class="btn-sm btn-delete" onclick="deleteRecord('teachers', '${t.id}')">Padam</button></td></tr>`;
    });
    container.innerHTML = html + `</table>`;
}

function renderSubjectTable() {
    const container = document.getElementById('subjectTableContainer');
    let html = `<table class="data-table"><tr><th>ID</th><th>Subjek</th><th>Slot</th><th>Tindakan</th></tr>`;
    subjectsList.forEach(s => {
        html += `<tr><td>${s.id}</td><td>${s.name}</td><td>${s.slots} ${s.isDouble ? '(2)' : '(1)'}</td>
        <td><button class="btn-sm btn-delete" onclick="deleteRecord('subjects', '${s.id}')">Padam</button></td></tr>`;
    });
    container.innerHTML = html + `</table>`;
}

function populateDropdowns() {
    const fill = (elId, list, label) => {
        const el = document.getElementById(elId);
        if(!el) return;
        el.innerHTML = `<option value="">-- Pilih ${label} --</option>` +
            list.map(i => `<option value="${i.id}">${i.name || i.id}</option>`).join('');
    };
    fill('selectTeacher', teachersList, "Guru");
    fill('selectSubject', subjectsList, "Subjek");
    fill('selectClass', classesList, "Kelas");
    fill('viewClassSelect', classesList, "Kelas");
    fill('absentTeacherSelect', teachersList, "Guru");
}

// --- E. GENERATE & VIEW JADUAL ---
document.getElementById('btnGenerate').onclick = () => { if(confirm("Jana jadual baru?")) startGenerating(); };

document.getElementById('btnViewJadual').onclick = async () => {
    const val = document.getElementById('viewClassSelect').value;
    if (!val) return;
    await renderTimetableGrid("timetableContainer", val);
};

document.getElementById('btnSaveManual').onclick = async () => {
    const classId = document.getElementById('viewClassSelect').value;
    if (!classId) return alert("Pilih kelas!");
    const data = getCurrentTimetableData(); 
    await setDoc(doc(db, "timetables", classId), data);
    alert("Disimpan ke Firestore!");
};

// --- F. GURU GANTI (RELIEF) - LOGIK AUTOMATIK & MESRA GURU ---

document.getElementById('btnIdentifyRelief').onclick = async () => {
    const absentTeacherId = document.getElementById('absentTeacherSelect').value;
    const reliefDateVal = document.getElementById('reliefDate').value;
    
    if (!absentTeacherId || !reliefDateVal) {
        return alert("Sila pilih guru dan tarikh ketidakhadiran.");
    }

    const dateObj = new Date(reliefDateVal);
    const dayNames = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
    const selectedDay = dayNames[dateObj.getDay()];

    if (selectedDay === "Sabtu" || selectedDay === "Ahad") {
        return alert("Tarikh yang dipilih adalah hari minggu. Sila pilih hari persekolahan.");
    }

    const resultArea = document.getElementById('reliefResultArea');
    resultArea.innerHTML = "<p>⏳ Menjana agihan relief secara automatik...</p>";

    const snap = await getDocs(collection(db, "timetables"));
    const allTimetables = {};
    snap.forEach(doc => { allTimetables[doc.id] = doc.data(); });

    const teacherSchedules = mapSchedulesByTeacher(allTimetables);
    
    const dailyReliefCount = {};
    teachersList.forEach(t => dailyReliefCount[t.id] = 0);

    const slotsToReplace = [];
    Object.keys(allTimetables).forEach(classId => {
        const dayData = allTimetables[classId][selectedDay];
        if (dayData && typeof dayData === 'object') {
            Object.keys(dayData).forEach(slotKey => {
                const slot = dayData[slotKey];
                if (slot && (slot.teacherId === absentTeacherId || slot.teacher === absentTeacherId)) {
                    slotsToReplace.push({ 
                        slotKey: slotKey, 
                        slotIndex: parseInt(slotKey) - 1,
                        classId: classId, 
                        subject: slot.subjectId || slot.subject 
                    });
                }
            });
        }
    });

    if (slotsToReplace.length === 0) {
        resultArea.innerHTML = `<p style="color:orange; text-align:center;">Tiada slot mengajar ditemui untuk guru ini pada hari ${selectedDay}.</p>`;
        return;
    }

    slotsToReplace.sort((a, b) => a.slotIndex - b.slotIndex);

    let html = `<div id="printableReliefArea" class="relief-print-wrapper">
                <div style="text-align:center; border-bottom:2px solid #333; margin-bottom:15px; padding-bottom:10px;">
                    <h2 style="margin:0;">SLIP GURU GANTI (RELIEF)</h2>
                    <p style="margin:5px 0;">Tarikh: <b>${reliefDateVal} (${selectedDay.toUpperCase()})</b></p>
                    <p style="margin:0;">Guru Tidak Hadir: <b>${teachersList.find(t => t.id === absentTeacherId)?.name || absentTeacherId}</b></p>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th width="20%">Waktu</th>
                            <th width="15%">Kelas</th>
                            <th width="15%">Subjek Asal</th>
                            <th width="50%">Guru Ganti Dilantik</th>
                        </tr>
                    </thead>
                    <tbody>`;

    slotsToReplace.forEach(item => {
        let candidates = findEligibleRelief(item.slotIndex, selectedDay, teacherSchedules);
        
        candidates = candidates.filter(c => c.id !== absentTeacherId);

        candidates.sort((a, b) => {
            if (a.isEligible !== b.isEligible) return b.isEligible - a.isEligible;
            return dailyReliefCount[a.id] - dailyReliefCount[b.id];
        });

        const selected = candidates[0];
        if (selected) dailyReliefCount[selected.id]++;

        // --- [PENGGUNAAN PEMETAAN MASA DI SINI] ---
        const timeDisplay = timeMapping[item.slotKey] || `Slot ${item.slotKey}`;

        html += `<tr>
            <td style="text-align:center;"><b>${timeDisplay}</b></td>
            <td style="text-align:center;"><b>${item.classId}</b></td>
            <td style="text-align:center;">${item.subject}</td>
            <td>
                ${selected ? `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span><b>${selected.name}</b> <br><small style="color:gray;">(${selected.reason})</small></span>
                        <span class="status-badge ${selected.isEligible ? 'status-eligible' : 'status-rest'}">
                            ${selected.isEligible ? 'LAYAK' : 'PENAT'}
                        </span>
                    </div>
                ` : '<span style="color:red;">TIADA GURU KOSONG</span>'}
            </td>
        </tr>`;
    });

    html += `</tbody></table>
            <div style="margin-top:20px; text-align:right;" class="no-print">
                <button onclick="window.printRelief()" class="btn-print" style="padding:10px 20px; background:#2ecc71; color:white; border:none; border-radius:5px; cursor:pointer;">
                    🖨️ Cetak Slip Relief
                </button>
            </div>
            </div>`;

    resultArea.innerHTML = html;
};

// --- G. HELPER FUNCTIONS ---

function mapSchedulesByTeacher(allTimetables) {
    const map = {};
    const days = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];

    teachersList.forEach(t => { 
        map[t.id] = {}; 
        days.forEach(d => { map[t.id][d] = Array(12).fill(null); });
    });

    Object.keys(allTimetables).forEach(classId => {
        const classTable = allTimetables[classId];
        Object.keys(classTable).forEach(day => {
            const dayData = classTable[day];
            if (dayData && typeof dayData === 'object') {
                Object.keys(dayData).forEach(slotKey => {
                    const slot = dayData[slotKey];
                    const idx = parseInt(slotKey) - 1;
                    const tId = slot.teacherId || slot.teacher;
                    if (slot && tId && map[tId] && map[tId][day]) {
                        map[tId][day][idx] = { classId, subjectId: slot.subjectId || slot.subject };
                    }
                });
            }
        });
    });
    return map;
}

function findEligibleRelief(slotIdx, day, teacherSchedules) {
    let results = [];
    teachersList.forEach(t => {
        // --- [PENAMBAHBAIKAN 2: LOGIK PENGECUALIAN] ---
        // Jika guru ditanda tidak boleh relief dalam pangkalan data, abaikan mereka.
        if (t.canRelief === false) return;

        const schedule = teacherSchedules[t.id]?.[day];
        if (!schedule) return;
        if (schedule[slotIdx] !== null) return; 

        let isEligible = true;
        let reason = "Masa Kosong";
        if (slotIdx >= 2 && schedule[slotIdx - 1] && schedule[slotIdx - 2]) {
            isEligible = false;
            reason = "Penat (2 Jam Berturut-turut)";
        }
        results.push({ id: t.id, name: t.name, isEligible, reason });
    });
    return results;
}

// --- H. FUNGSI CETAK ---
window.printRelief = () => {
    const printContents = document.getElementById('printableReliefArea').innerHTML;
    const originalContents = document.body.innerHTML;

    const printStyle = `
        <style>
            @media print {
                .no-print { display: none !important; }
                body { padding: 20px; font-family: Arial, sans-serif; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #333; padding: 12px; text-align: left; }
                th { background-color: #f2f2f2 !important; -webkit-print-color-adjust: exact; }
                .status-badge { display: none; }
            }
        </style>
    `;

    document.body.innerHTML = printStyle + printContents;
    window.print();
    document.body.innerHTML = originalContents;
    window.location.reload(); 
};
