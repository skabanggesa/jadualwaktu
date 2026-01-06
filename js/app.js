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
    deleteDoc,
    addDoc,
    writeBatch,
    serverTimestamp
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

let assignmentDraft = []; // Draf untuk Agihan Tugas (Simpan ke 'assignments')
let reliefDraft = [];     // Draf untuk Guru Ganti (Simpan ke 'relief_logs')

const timeMapping = {
    "1": "07:30 - 08:00", "2": "08:00 - 08:30", "3": "08:30 - 09:00",
    "4": "09:00 - 09:30", "5": "09:30 - 10:00", "6": "10:00 - 10:30",
    "7": "10:30 - 11:00", "8": "11:00 - 11:30", "9": "11:30 - 12:00",
    "10": "12:00 - 12:30", "11": "12:30 - 13:00", "12": "13:00 - 13:30"
};

const clean = (str) => (str ? str.trim().replace(/\s+/g, '') : "");

// --- B. AUTHENTICATION ---
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

// --- C. LOAD & RENDER MASTER DATA ---
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

// (Fungsi deleteRecord, saveTeacher, dll kekal sama)
window.deleteRecord = async (col, id) => {
    if (confirm(`Padam rekod ${id}?`)) {
        await deleteDoc(doc(db, col, id));
        loadAllData();
    }
};

// --- D. AGIHAN TUGAS (WORKLOAD) -> KOLEKSI 'assignments' ---

// Tambah rekod ke dalam draf lokal
const btnAddToAssignment = document.getElementById('btnAddToAssignmentDraft');
if (btnAddToAssignment) {
    btnAddToAssignment.onclick = () => {
        const tId = document.getElementById('selectTeacher').value;
        const sId = document.getElementById('selectSubject').value;
        const cId = document.getElementById('selectClass').value;
        const periods = document.getElementById('inputPeriods')?.value;

        if (!tId || !sId || !cId || !periods) return alert("Sila lengkapkan pilihan agihan.");

        assignmentDraft.push({
            teacherId: tId,
            teacherName: teachersList.find(t => t.id === tId)?.name || tId,
            subjectId: sId,
            subjectName: subjectsList.find(s => s.id === sId)?.name || sId,
            classId: cId,
            periods: parseInt(periods)
        });
        renderAssignmentDraftTable();
    };
}

function renderAssignmentDraftTable() {
    const container = document.getElementById('assignmentDraftContainer');
    if (!container) return;
    if (assignmentDraft.length === 0) { container.innerHTML = ""; return; }

    let rows = assignmentDraft.map((item, idx) => `
        <tr>
            <td>${item.teacherName}</td>
            <td>${item.subjectName}</td>
            <td>${item.classId}</td>
            <td>${item.periods}</td>
            <td><button class="btn-sm btn-delete" onclick="removeFromAssignmentDraft(${idx})">Batal</button></td>
        </tr>`).join('');

    container.innerHTML = `
        <div style="background:#f9f9f9; padding:15px; border-left:5px solid #2980b9; margin-top:20px;">
            <h3>Draf Agihan Tugas (Belum Disimpan)</h3>
            <table class="data-table">
                <thead><tr><th>Guru</th><th>Subjek</th><th>Kelas</th><th>Waktu</th><th>Aksi</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <button onclick="saveAssignmentsToCloud()" class="btn-primary" style="margin-top:10px; background:#2980b9;">
                💾 Simpan Semua ke Cloud (Koleksi: assignments)
            </button>
        </div>`;
}

window.removeFromAssignmentDraft = (idx) => {
    assignmentDraft.splice(idx, 1);
    renderAssignmentDraftTable();
};

// SIMPAN KE KOLEKSI 'assignments'
window.saveAssignmentsToCloud = async () => {
    if (assignmentDraft.length === 0) return;
    if (!confirm(`Simpan ${assignmentDraft.length} rekod ke koleksi assignments?`)) return;

    try {
        const batch = writeBatch(db);
        assignmentDraft.forEach(item => {
            // ID Dokumen: Kelas_Subjek_Guru
            const docId = `${item.classId}_${item.subjectId}_${item.teacherId}`;
            const docRef = doc(db, "assignments", docId);
            batch.set(docRef, {
                ...item,
                updatedAt: serverTimestamp()
            });
        });
        await batch.commit();
        alert("Agihan berjaya disimpan ke koleksi 'assignments'!");
        assignmentDraft = [];
        renderAssignmentDraftTable();
    } catch (e) {
        alert("Ralat simpan assignments: " + e.message);
    }
};

// --- E. GENERATE & VIEW JADUAL ---
// Nota: Engine generator biasanya membaca 'assignments' dan menulis ke 'timetables'
document.getElementById('btnGenerate').onclick = () => { if(confirm("Jana jadual baru?")) startGenerating(); };

document.getElementById('btnViewJadual').onclick = async () => {
    const val = document.getElementById('viewClassSelect').value;
    const container = document.getElementById("timetableContainer");
    if (!val) return alert("Pilih kelas!");
    container.innerHTML = "<p>⏳ Memuatkan jadual...</p>";

    if (val === "ALL") {
        container.innerHTML = ""; 
        for (const cls of classesList) {
            const classDiv = document.createElement('div');
            classDiv.style.marginBottom = "50px";
            classDiv.style.pageBreakAfter = "always"; 
            classDiv.innerHTML = `<h2 class="print-only-title" style="text-align:center;">JADUAL WAKTU KELAS: ${cls.id}</h2><div id="grid-${cls.id}"></div>`;
            container.appendChild(classDiv);
            await renderTimetableGrid(`grid-${cls.id}`, cls.id);
        }
    } else {
        container.innerHTML = `<h2 class="print-only-title" style="text-align:center;">JADUAL WAKTU KELAS: ${val}</h2><div id="single-grid"></div>`;
        await renderTimetableGrid("single-grid", val);
    }
};

// --- F. GURU GANTI (RELIEF) ---
// Fungsi ini membaca data 'timetables' (hasil yang sudah dijana)
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
        if (dayData && typeof dayData === 'object') {
            Object.keys(dayData).forEach(slotKey => {
                const slot = dayData[slotKey];
                const currentTeacher = slot.teacherId || slot.teacher;
                if (slot && currentTeacher === absentTeacherId) {
                    slotsToReplace.push({ 
                        slotKey, 
                        slotIndex: parseInt(slotKey)-1, 
                        classId, 
                        subject: slot.subjectId || slot.subject 
                    });
                }
            });
        }
    });

    if (slotsToReplace.length === 0) {
        resultArea.innerHTML = `<p style="text-align:center; color:orange;">Tiada kelas untuk guru tersebut pada hari ${selectedDay}.</p>`;
        return;
    }

    slotsToReplace.sort((a, b) => a.slotIndex - b.slotIndex);

    let htmlSuggestions = `<h3>Cadangan Agihan Relief</h3>
    <table class="data-table">
        <tr><th>Waktu</th><th>Kelas</th><th>Subjek</th><th>Calon Guru Ganti</th><th>Tindakan</th></tr>`;

    slotsToReplace.forEach(item => {
        let candidates = findEligibleRelief(item.slotIndex, selectedDay, teacherSchedules);
        candidates = candidates.filter(c => c.id !== absentTeacherId);
        candidates.sort((a, b) => (b.isEligible - a.isEligible) || (dailyReliefCount[a.id] - dailyReliefCount[b.id]));

        const bestCandidate = candidates[0];
        const timeStr = timeMapping[item.slotKey] || `Slot ${item.slotKey}`;

        htmlSuggestions += `
            <tr>
                <td>${timeStr}</td><td>${item.classId}</td><td>${item.subject}</td>
                <td>${bestCandidate ? `<b>${bestCandidate.name}</b> <br><small>(${bestCandidate.reason})</small>` : 'TIADA'}</td>
                <td>
                    <button class="btn-sm" onclick="addToReliefDraft('${item.slotKey}', '${item.classId}', '${item.subject}', '${bestCandidate?.id}', '${bestCandidate?.name}')">
                        + Draf Relief
                    </button>
                </td>
            </tr>`;
    });

    resultArea.innerHTML = htmlSuggestions + `</table><div id="reliefDraftContainer"></div>`;
    renderReliefDraftUI();
};

window.addToReliefDraft = (slotKey, classId, subject, tId, tName) => {
    if (!tId || tId === "undefined") return alert("Pilih guru ganti!");
    reliefDraft.push({ slotKey, classId, subject, teacherId: tId, teacherName: tName, timeStr: timeMapping[slotKey] });
    renderReliefDraftUI();
};

function renderReliefDraftUI() {
    const container = document.getElementById('reliefDraftContainer');
    if (reliefDraft.length === 0) { container.innerHTML = ""; return; }
    let rows = reliefDraft.map((d, index) => `
        <tr><td>${d.timeStr}</td><td>${d.classId}</td><td>${d.subject}</td><td>${d.teacherName}</td>
        <td><button onclick="removeFromReliefDraft(${index})">❌</button></td></tr>`).join('');
    container.innerHTML = `<h4>Draf Slip Relief</h4><table class="data-table">${rows}</table>
    <button onclick="saveReliefToCloud()" class="btn-primary">💾 Simpan Relief Logs</button>`;
}

window.removeFromReliefDraft = (idx) => { reliefDraft.splice(idx, 1); renderReliefDraftUI(); };

window.saveReliefToCloud = async () => {
    const date = document.getElementById('reliefDate').value;
    const teacher = document.getElementById('absentTeacherSelect').value;
    await addDoc(collection(db, "relief_logs"), { date, absentTeacherId: teacher, assignments: reliefDraft, createdAt: serverTimestamp() });
    alert("Relief disimpan!"); reliefDraft = []; renderReliefDraftUI();
};

// --- G. HELPERS (Dropdowns, Tables, Mapping) ---
function populateDropdowns() {
    const fill = (id, list, label, all=false) => {
        const el = document.getElementById(id); if(!el) return;
        let opt = `<option value="">-- ${label} --</option>`;
        if(all) opt += `<option value="ALL">SEMUA</option>`;
        opt += list.map(i => `<option value="${i.id}">${i.name || i.id}</option>`).join('');
        el.innerHTML = opt;
    };
    fill('selectTeacher', teachersList, "Guru");
    fill('selectSubject', subjectsList, "Subjek");
    fill('selectClass', classesList, "Kelas");
    fill('viewClassSelect', classesList, "Kelas", true); 
    fill('absentTeacherSelect', teachersList, "Guru");
}

function renderTeacherTable() { /* Sama seperti kod anda */ }
function renderSubjectTable() { /* Sama seperti kod anda */ }

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
        results.push({ id: t.id, name: t.name, isEligible, reason: isEligible ? "Masa Kosong" : "Rehat Wajib" });
    });
    return results;
}
