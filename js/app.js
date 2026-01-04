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
    if(id && name) saveMasterData("teachers", id, { name, shortform: short });
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

// --- F. GURU GANTI (RELIEF) - LOGIK MESRA GURU ---

document.getElementById('btnIdentifyRelief').onclick = async () => {
    console.log("Butang Relief diklik.");
    const absentTeacherId = document.getElementById('absentTeacherSelect').value;
    if (!absentTeacherId) return alert("Pilih guru yang tidak hadir.");

    const resultArea = document.getElementById('reliefResultArea');
    resultArea.innerHTML = "<p>⏳ Sedang memproses data relief...</p>";

    const snap = await getDocs(collection(db, "timetables"));
    const allTimetables = {};
    snap.forEach(doc => { allTimetables[doc.id] = doc.data(); });
    
    console.log("Data Timetables dimuatkan:", Object.keys(allTimetables).length, "kelas found.");

    const teacherSchedules = mapSchedulesByTeacher(allTimetables);

    const days = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
    let html = `<div class="relief-print-wrapper">
                <h3 style="text-align:center; border-bottom:2px solid #333; padding-bottom:10px;">
                    CADANGAN GURU GANTI: ${teachersList.find(t => t.id === absentTeacherId)?.name || absentTeacherId}
                </h3>`;

    let totalSlotsToReplace = 0;

    days.forEach(day => {
        const slotsToReplace = [];
        
        Object.keys(allTimetables).forEach(classId => {
            const dayData = allTimetables[classId][day];
            
            // DIBETULKAN: Gunakan Object.keys kerana data Isnin/Selasa di DB adalah Object, bukan Array
            if (dayData && typeof dayData === 'object') {
                Object.keys(dayData).forEach(slotKey => {
                    const slot = dayData[slotKey];
                    const index = parseInt(slotKey) - 1; // Slot 1 jadi index 0

                    if (slot && (slot.teacherId === absentTeacherId || slot.teacher === absentTeacherId)) {
                        slotsToReplace.push({ 
                            slotIndex: index, 
                            classId: classId, 
                            subject: slot.subjectId || slot.subject 
                        });
                        totalSlotsToReplace++;
                    }
                });
            }
        });

        if (slotsToReplace.length > 0) {
            html += `<h4 style="background:#e2e8f0; padding:8px; margin-top:20px;">HARI: ${day.toUpperCase()}</h4>
                     <table class="data-table">
                        <tr>
                            <th width="15%">Waktu / Slot</th>
                            <th width="15%">Kelas</th>
                            <th width="70%">Cadangan Guru Ganti (Paling Layak)</th>
                        </tr>`;

            slotsToReplace.sort((a,b) => a.slotIndex - b.slotIndex).forEach(item => {
                const candidates = findEligibleRelief(item.slotIndex, day, teacherSchedules);
                
                html += `<tr>
                    <td>Slot ${item.slotIndex + 1}</td>
                    <td><b>${item.classId}</b><br><small>${item.subject}</small></td>
                    <td>`;
                
                if (candidates.length === 0) {
                    html += `<span style="color:red;">Tiada guru kosong.</span>`;
                } else {
                    candidates.forEach(c => {
                        const statusClass = c.isEligible ? 'status-eligible' : 'status-rest';
                        const statusLabel = c.isEligible ? 'LAYAK' : 'REHAT WAJIB';
                        html += `<div style="margin-bottom:5px; border-bottom:1px solid #f1f1f1; padding-bottom:2px;">
                                    <span class="status-badge ${statusClass}">${statusLabel}</span> 
                                    <b>${c.name}</b> <small style="color:#666;">(${c.reason})</small>
                                 </div>`;
                    });
                }
                html += `</td></tr>`;
            });
            html += `</table>`;
        }
    });

    if (totalSlotsToReplace === 0) {
        console.log("Tiada slot ditemui untuk guru:", absentTeacherId);
        html += `<p style="text-align:center; padding:20px; color:orange;">Tiada slot mengajar ditemui untuk guru ini dalam pangkalan data.</p>`;
    }

    resultArea.innerHTML = html + `</div>`;
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
            // DIBETULKAN: Map data dari Object ke Array mengikut slotKey
            if (dayData && typeof dayData === 'object') {
                Object.keys(dayData).forEach(slotKey => {
                    const slot = dayData[slotKey];
                    const idx = parseInt(slotKey) - 1;
                    if (slot && (slot.teacherId || slot.teacher) && map[slot.teacherId || slot.teacher] && map[slot.teacherId || slot.teacher][day]) {
                        map[slot.teacherId || slot.teacher][day][idx] = { classId, subjectId: slot.subjectId || slot.subject };
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
    return results.sort((a, b) => b.isEligible - a.isEligible);
}
