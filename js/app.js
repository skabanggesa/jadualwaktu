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
    updateDoc,
    deleteDoc,
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

// --- A. PEMUBAH UBAH GLOBAL & MAPPING ---
const auth = getAuth();
let teachersList = [];
let subjectsList = [];
let classesList = [];
let assignmentsList = []; 
let assignmentDraft = [];

const timeMapping = {
    "1": "07:10", "2": "07:40", "3": "08:10", "4": "08:40", "5": "09:10",
    "6": "10:00", "7": "10:30", "8": "11:00", "9": "11:30"
};

// Keutamaan Role (Semakin rendah nombor, semakin tinggi keutamaan untuk dipilih jadi relief)
const rolePriority = { "GURU": 1, "PK1": 2, "PKHEM": 2, "PKKK": 2, "GB": 3 };

const clean = (str) => (str ? str.trim().replace(/\s+/g, '') : "");

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

// --- C. PENGURUSAN DATA MASTER & EDIT ---

async function runMigrationIfNeeded(teachers) {
    const batch = writeBatch(db);
    let needsMigration = false;
    teachers.forEach(t => {
        if (!t.role) {
            batch.update(doc(db, "teachers", t.id), { role: "GURU" });
            needsMigration = true;
        }
    });
    if (needsMigration) {
        await batch.commit();
        console.log("Migrasi Role Selesai.");
    }
}

async function loadAllData() {
    try {
        const [snapT, snapS, snapC, snapA] = await Promise.all([
            getDocs(collection(db, "teachers")),
            getDocs(collection(db, "subjects")),
            getDocs(collection(db, "classes")),
            getDocs(collection(db, "assignments"))
        ]);

        teachersList = snapT.docs.map(d => ({ id: d.id, ...d.data() }));
        await runMigrationIfNeeded(teachersList);
        
        subjectsList = snapS.docs.map(d => ({ id: d.id, ...d.data() }));
        classesList = snapC.docs.map(d => ({ id: d.id, ...d.data() }));
        assignmentsList = snapA.docs.map(d => ({ id: d.id, ...d.data() }));
        
        populateDropdowns();
        populateAbsentChecklist(); 
        renderTeacherTable();
        renderSubjectTable();
    } catch (err) {
        console.error("Gagal memuatkan data:", err);
    }
}

// FUNGSI EDIT GURU
window.editTeacher = (id) => {
    const teacher = teachersList.find(t => t.id === id);
    if (teacher) {
        document.getElementById('regTeacherId').value = teacher.id;
        document.getElementById('regTeacherId').disabled = true; // Kunci ID
        document.getElementById('regTeacherName').value = teacher.name;
        document.getElementById('regTeacherShort').value = teacher.shortform || "";
        document.getElementById('regTeacherRole').value = teacher.role || "GURU";

        const btn = document.getElementById('btnSaveTeacher');
        btn.innerText = "KEMASKINI DATA GURU";
        btn.style.backgroundColor = "#059669"; 
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

window.deleteRecord = async (col, id) => {
    if (confirm(`Padam rekod ${id}?`)) {
        await deleteDoc(doc(db, col, id));
        loadAllData();
    }
};

document.getElementById('btnSaveTeacher').onclick = async function() {
    const idInput = document.getElementById('regTeacherId');
    const id = idInput.value;
    const name = document.getElementById('regTeacherName').value;
    const short = document.getElementById('regTeacherShort').value.toUpperCase();
    const role = document.getElementById('regTeacherRole').value;
    
    if(id && name) {
        this.disabled = true;
        await setDoc(doc(db, "teachers", clean(id)), { 
            name, 
            shortform: short, 
            role: role,
            canRelief: true 
        }, { merge: true });

        alert("Berjaya Disimpan/Dikemaskini!"); 
        
        // Reset Borang
        idInput.value = "";
        idInput.disabled = false;
        document.getElementById('regTeacherName').value = "";
        document.getElementById('regTeacherShort').value = "";
        this.innerText = "Simpan";
        this.style.backgroundColor = "";
        this.disabled = false;
        
        loadAllData(); 
    } else {
        alert("ID dan Nama diperlukan!");
    }
};

// --- D. AGIHAN TUGAS (WORKLOAD) ---
const btnAddToDraft = document.getElementById('btnAddLocal');
if (btnAddToDraft) {
    btnAddToDraft.onclick = () => {
        const tId = document.getElementById('selectTeacher').value;
        const sId = document.getElementById('selectSubject').value;
        const cId = document.getElementById('selectClass').value;
        const periods = document.getElementById('inputSlots').value; 

        if (!tId || !sId || !cId || !periods) return alert("Lengkapkan semua pilihan!");

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
    const container = document.getElementById('localListUI');
    if (!container) return;
    if (assignmentDraft.length === 0) { 
        container.innerHTML = "<p style='padding:10px; color:#666; text-align:center;'>Tiada draf agihan.</p>"; 
        return; 
    }
    let html = `<table style="width:100%; font-size: 13px; border-collapse:collapse;"><thead style="background:#f1f5f9;"><tr><th style="padding:10px; text-align:left;">Guru</th><th style="padding:10px; text-align:left;">Kelas & Subjek</th><th style="padding:10px; text-align:center;">Slot</th><th style="padding:10px; text-align:center;">Aksi</th></tr></thead><tbody>`;
    assignmentDraft.forEach((item, idx) => {
        html += `<tr style="border-bottom: 1px solid #eee;"><td style="padding:8px;">${item.teacherName}</td><td style="padding:8px;">${item.classId} - ${item.subjectName}</td><td style="padding:8px; text-align:center;">${item.periods}</td><td style="padding:8px; text-align:center;"><button onclick="removeFromAssignmentDraft(${idx})" style="color:red; background:none; border:none; cursor:pointer;">&times;</button></td></tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

window.removeFromAssignmentDraft = (idx) => {
    assignmentDraft.splice(idx, 1);
    renderAssignmentDraftTable();
};

document.getElementById('btnSyncCloud').onclick = async function() {
    if (assignmentDraft.length === 0) return alert("Tiada draf!");
    this.disabled = true;
    const batch = writeBatch(db);
    assignmentDraft.forEach(item => {
        const docId = `${item.classId}_${item.subjectId}_${item.teacherId}`;
        batch.set(doc(db, "assignments", docId), { ...item, updatedAt: serverTimestamp() });
    });
    await batch.commit();
    alert("Berjaya disimpan!");
    assignmentDraft = [];
    renderAssignmentDraftTable();
    loadAllData();
    this.disabled = false;
};

// --- E. RENDER TABLES & DROPDOWNS ---
function renderTeacherTable() {
    const container = document.getElementById('teacherTableContainer');
    if(!container) return;
    let html = `<table class="data-table"><tr><th>ID</th><th>Nama</th><th>Jawatan</th><th style="text-align:center;">Aksi</th></tr>`;
    teachersList.forEach(t => {
        html += `<tr>
            <td><b>${t.id}</b></td>
            <td>${t.name}</td>
            <td><span class="status-badge status-eligible">${t.role || 'GURU'}</span></td>
            <td style="text-align:center;">
                <button class="btn-sm" style="background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer; padding:4px 8px;" onclick="editTeacher('${t.id}')">✏️ Edit</button>
                <button class="btn-sm btn-delete" onclick="deleteRecord('teachers', '${t.id}')">Padam</button>
            </td>
        </tr>`;
    });
    container.innerHTML = html + `</table>`;
}

function renderSubjectTable() {
    const container = document.getElementById('subjectTableContainer');
    if(!container) return;
    let html = `<table class="data-table"><tr><th>ID</th><th>Subjek</th><th>Tindakan</th></tr>`;
    subjectsList.forEach(s => {
        html += `<tr><td>${s.id}</td><td>${s.name}</td><td><button class="btn-sm btn-delete" onclick="deleteRecord('subjects', '${s.id}')">Padam</button></td></tr>`;
    });
    container.innerHTML = html + `</table>`;
}

function populateDropdowns() {
    const fill = (elId, list, label, includeAll = false) => {
        const el = document.getElementById(elId);
        if(!el) return;
        let options = `<option value="">-- Pilih ${label} --</option>`;
        if(includeAll) options += `<option value="ALL">-- SEMUA KELAS --</option>`;
        options += list.map(i => `<option value="${i.id}">${i.name ? `${i.name} (${i.id})` : i.id}</option>`).join('');
        el.innerHTML = options;
    };
    fill('selectTeacher', teachersList, "Guru");
    fill('selectSubject', subjectsList, "Subjek");
    fill('selectClass', classesList, "Kelas");
    fill('viewClassSelect', classesList, "Kelas", true);
}

function populateAbsentChecklist() {
    const container = document.getElementById('absentTeacherChecklist');
    if (!container) return;
    
    // Grid Layout Cantik
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(auto-fill, minmax(200px, 1fr))";
    container.style.gap = "10px";
    container.style.padding = "10px";

    if (teachersList.length === 0) return;

    container.innerHTML = teachersList.map(t => `
        <label style="display:flex; align-items:center; background:#fff; padding:10px; border:1px solid #ddd; border-radius:6px; cursor:pointer;">
            <input type="checkbox" class="absent-check" value="${t.id}" style="margin-right:10px; transform:scale(1.2);">
            <div style="line-height:1.2;">
                <div style="font-weight:bold; font-size:13px;">${t.name}</div>
                <small style="color:#666;">${t.id} • ${t.role || 'GURU'}</small>
            </div>
        </label>
    `).join('');
}

// --- F. JANA & PAPAR JADUAL ---
document.getElementById('btnGenerate').onclick = async () => { if(confirm("Jana jadual baru?")) await startGenerating(); };

document.getElementById('btnViewJadual').onclick = async () => {
    const val = document.getElementById('viewClassSelect').value;
    const container = document.getElementById("timetableContainer");
    if (!val) return alert("Pilih kelas.");
    container.innerHTML = "⏳ Memuatkan...";
    if (val === "ALL") {
        container.innerHTML = ""; 
        for (const cls of classesList) {
            const div = document.createElement('div');
            div.style.marginBottom = "50px";
            div.innerHTML = `<h2 style="text-align:center;">KELAS: ${cls.id}</h2><div id="grid-${cls.id}"></div>`;
            container.appendChild(div);
            await renderTimetableGrid(`grid-${cls.id}`, cls.id);
        }
    } else {
        container.innerHTML = `<h2 style="text-align:center;">KELAS: ${val}</h2><div id="single-grid"></div>`;
        await renderTimetableGrid("single-grid", val);
    }
};

document.getElementById('btnSaveManual').onclick = async () => {
    const classId = document.getElementById('viewClassSelect').value;
    if (!classId || classId === "ALL") return alert("Pilih satu kelas spesifik.");
    const tableData = getCurrentTimetableData(); 
    await setDoc(doc(db, "timetables", classId), tableData);
    alert("Tersimpan!");
};

document.getElementById('btnPrintJadual').onclick = () => window.print();

// --- G. GURU GANTI (RELIEF) ---
document.getElementById('btnIdentifyRelief').onclick = async () => {
    const checkedBoxes = document.querySelectorAll('.absent-check:checked');
    const absentTeacherIds = Array.from(checkedBoxes).map(cb => cb.value);
    const reliefDateVal = document.getElementById('reliefDate').value;

    if (absentTeacherIds.length === 0 || !reliefDateVal) return alert("Pilih tarikh dan guru.");

    const selectedDay = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"][new Date(reliefDateVal).getDay()];
    const resultArea = document.getElementById('reliefResultArea');
    resultArea.innerHTML = "⏳ Menjana...";

    const snap = await getDocs(collection(db, "timetables"));
    const allTimetables = {};
    snap.forEach(doc => { allTimetables[doc.id] = doc.data(); });

    const teacherSchedules = mapSchedulesByTeacher(allTimetables);
    const dailyReliefCount = {};
    teachersList.forEach(t => dailyReliefCount[t.id] = 0);

    let allSlotsToReplace = [];
    absentTeacherIds.forEach(absentId => {
        Object.keys(allTimetables).forEach(classId => {
            const dayData = allTimetables[classId][selectedDay];
            if (dayData) {
                Object.entries(dayData).forEach(([slotKey, slot]) => {
                    if (slot.teacherId.split('/').includes(absentId)) {
                        allSlotsToReplace.push({ 
                            slotKey, 
                            slotIndex: parseInt(slotKey)-1, 
                            classId, 
                            subject: slot.subjectId, 
                            absentName: teachersList.find(t => t.id === absentId)?.name 
                        });
                    }
                });
            }
        });
    });

    if (allSlotsToReplace.length === 0) {
        resultArea.innerHTML = `<p style="text-align:center; color:orange;">Tiada kelas untuk diganti.</p>`;
        return;
    }

    allSlotsToReplace.sort((a,b) => a.slotIndex - b.slotIndex);

    let tableRows = "";
    allSlotsToReplace.forEach(item => {
        let candidates = findEligibleRelief(item.slotIndex, selectedDay, teacherSchedules)
                        .filter(c => !absentTeacherIds.includes(c.id));
        
        candidates.sort((a,b) => {
            if (b.isEligible !== a.isEligible) return b.isEligible - a.isEligible;
            const pA = rolePriority[a.role] || 1;
            const pB = rolePriority[b.role] || 1;
            if (pA !== pB) return pA - pB;
            return dailyReliefCount[a.id] - dailyReliefCount[b.id];
        });
        
        const selected = candidates[0];
        if (selected) dailyReliefCount[selected.id]++;

        tableRows += `<tr>
            <td style="border:1px solid #000; text-align:center; padding:5px;">${timeMapping[item.slotKey]}</td>
            <td style="border:1px solid #000; text-align:center; padding:5px;">${item.classId}</td>
            <td style="border:1px solid #000; padding:5px;">${item.subject}<br><small>(${item.absentName})</small></td>
            <td style="border:1px solid #000; padding:5px;">${selected ? `<b>${selected.name}</b><br><small style="color:blue;">${selected.role} - ${selected.reason}</small>` : '<span style="color:red;">TIADA GURU</span>'}</td>
        </tr>`;
    });

    resultArea.innerHTML = `
        <div class="relief-print-wrapper" style="padding:20px; background:#fff; border:1px solid #ccc;">
            <h2 style="text-align:center; margin:0;">SLIP GURU GANTI (RELIEF)</h2>
            <p style="text-align:center; margin-bottom:15px;">Tarikh: ${reliefDateVal} (${selectedDay.toUpperCase()})</p>
            <table style="width:100%; border-collapse:collapse;">
                <thead><tr style="background:#eee;"><th style="border:1px solid #000; width:80px;">Waktu</th><th style="border:1px solid #000; width:70px;">Kelas</th><th style="border:1px solid #000;">Subjek</th><th style="border:1px solid #000;">Guru Ganti</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
            <button onclick="window.print()" class="btn-success no-print" style="margin-top:15px; width:100%; padding:10px;">🖨️ Cetak</button>
        </div>`;
};

// --- H. HELPERS ---
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
            if (dayData) {
                Object.keys(dayData).forEach(slotKey => {
                    const tId = dayData[slotKey].teacherId;
                    if (tId && map[tId] && map[tId][day]) {
                        map[tId][day][parseInt(slotKey)-1] = { classId };
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
        let isEligible = !(slotIdx >= 2 && schedule[slotIdx-1] && schedule[slotIdx-2]);
        results.push({ 
            id: t.id, name: t.name, role: t.role || "GURU", isEligible, 
            reason: isEligible ? "Masa Kosong" : "Rehat Wajib" 
        });
    });
    return results;
}
