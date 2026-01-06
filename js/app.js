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

// --- PEMETAAN MASA (Slot 1 = 07:30, dll) ---
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

const clean = (str) => str ? str.trim().replace(/\s+/g, '') : "";

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

document.getElementById('btnSaveTeacher').onclick = () => {
    const id = document.getElementById('regTeacherId').value;
    const name = document.getElementById('regTeacherName').value;
    const short = document.getElementById('regTeacherShort').value.toUpperCase();
    if(id && name) saveMasterData("teachers", id, { name, shortform: short, canRelief: true });
};

// ... (Kod btnSaveSubject dan btnSaveClass dikekalkan sama)

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
    fill('viewClassSelect', classesList, "Kelas"); // Filter Kelas
    fill('absentTeacherSelect', teachersList, "Guru");
}

// --- E. GENERATE & VIEW JADUAL ---
document.getElementById('btnGenerate').onclick = () => { if(confirm("Jana jadual baru?")) startGenerating(); };

document.getElementById('btnViewJadual').onclick = async () => {
    const val = document.getElementById('viewClassSelect').value;
    if (!val) return alert("Sila pilih kelas!");
    await renderTimetableGrid("timetableContainer", val);
};

// Butang Cetak Jadual Waktu Kelas
window.printTimetable = () => {
    window.print();
};

document.getElementById('btnSaveManual').onclick = async () => {
    const classId = document.getElementById('viewClassSelect').value;
    if (!classId) return alert("Pilih kelas!");
    const data = getCurrentTimetableData(); 
    await setDoc(doc(db, "timetables", classId), data);
    alert("Disimpan ke Firestore!");
};

// --- F. GURU GANTI (RELIEF) ---
document.getElementById('btnIdentifyRelief').onclick = async () => {
    const absentTeacherId = document.getElementById('absentTeacherSelect').value;
    const reliefDateVal = document.getElementById('reliefDate').value;
    
    if (!absentTeacherId || !reliefDateVal) return alert("Sila pilih guru dan tarikh.");

    const dateObj = new Date(reliefDateVal);
    const dayNames = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
    const selectedDay = dayNames[dateObj.getDay()];

    const resultArea = document.getElementById('reliefResultArea');
    resultArea.innerHTML = "<p>⏳ Menjana agihan relief...</p>";

    const snap = await getDocs(collection(db, "timetables"));
    const allTimetables = {};
    snap.forEach(doc => { allTimetables[doc.id] = doc.data(); });

    const teacherSchedules = mapSchedulesByTeacher(allTimetables);
    const dailyReliefCount = {};
    teachersList.forEach(t => dailyReliefCount[t.id] = 0);

    const slotsToReplace = [];
    Object.keys(allTimetables).forEach(classId => {
        const dayData = allTimetables[classId][selectedDay];
        if (dayData) {
            Object.keys(dayData).forEach(slotKey => {
                const slot = dayData[slotKey];
                if (slot && (slot.teacherId === absentTeacherId || slot.teacher === absentTeacherId)) {
                    slotsToReplace.push({ slotKey, slotIndex: parseInt(slotKey)-1, classId, subject: slot.subjectId || slot.subject });
                }
            });
        }
    });

    if (slotsToReplace.length === 0) {
        resultArea.innerHTML = `<p style="color:orange;">Tiada kelas untuk diganti.</p>`;
        return;
    }

    slotsToReplace.sort((a, b) => a.slotIndex - b.slotIndex);

    let html = `
        <div id="printableReliefArea">
            <div class="print-header">
                <h2>SLIP GURU GANTI (RELIEF)</h2>
                <p>Tarikh: <b>${reliefDateVal} (${selectedDay.toUpperCase()})</b> | Guru Tidak Hadir: <b>${absentTeacherId}</b></p>
            </div>
            <table class="data-table">
                <thead>
                    <tr><th>Waktu</th><th>Kelas</th><th>Subjek</th><th>Guru Ganti</th></tr>
                </thead>
                <tbody>`;

    slotsToReplace.forEach(item => {
        let candidates = findEligibleRelief(item.slotIndex, selectedDay, teacherSchedules);
        candidates = candidates.filter(c => c.id !== absentTeacherId);
        candidates.sort((a, b) => (b.isEligible - a.isEligible) || (dailyReliefCount[a.id] - dailyReliefCount[b.id]));

        const selected = candidates[0];
        if (selected) dailyReliefCount[selected.id]++;

        // PAPAR MASA SEBENAR (Contoh: Slot 1 -> 07:30 - 08:00)
        const timeStr = timeMapping[item.slotKey] || `Slot ${item.slotKey}`;

        html += `
            <tr>
                <td style="text-align:center;"><b>${timeStr}</b></td>
                <td style="text-align:center;">${item.classId}</td>
                <td style="text-align:center;">${item.subject}</td>
                <td>${selected ? `<b>${selected.name}</b> <br><small>(${selected.reason})</small>` : 'TIADA GURU'}</td>
            </tr>`;
    });

    html += `</tbody></table>
            <button onclick="window.print()" class="btn-print no-print" style="margin-top:10px;">🖨️ Cetak Slip Relief</button>
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
                    if (tId && map[tId] && map[tId][day]) {
                        map[tId][day][idx] = { classId, subjectId: slot.subjectId };
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
        const schedule = teacherSchedules[t.id]?.[day];
        if (!schedule || schedule[slotIdx] !== null) return;
        let isEligible = !(slotIdx >= 2 && schedule[slotIdx - 1] && schedule[slotIdx - 2]);
        results.push({ id: t.id, name: t.name, isEligible, reason: isEligible ? "Masa Kosong" : "2 Jam Berturut" });
    });
    return results;
}

