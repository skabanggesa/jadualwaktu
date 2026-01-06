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
import { renderTimetableGrid } from "./ui-render.js";

// --- A. PEMUBAH UBAH GLOBAL & MAPPING ---
const auth = getAuth();
let teachersList = [];
let subjectsList = [];
let classesList = [];
let assignmentsList = []; // Data rasmi dari Cloud
let assignmentDraft = [];  // Draf sementara sebelum simpan ke Cloud

const timeMapping = {
    "1": "07:10 - 07:40",
    "2": "07:40 - 08:10",
    "3": "08:10 - 08:40",
    "4": "08:40 - 09:10",
    "5": "09:10 - 09:40",
    "6": "09:40 - 10:00",
    "7": "10:00 - 10:30",
    "8": "10:30 - 11:00",
    "9": "11:00 - 11:30",
    "10": "11:30 - 12:00",
    "11": "12:00 - 12:30"
};

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

// --- C. PENGURUSAN DATA MASTER ---
async function loadAllData() {
    console.log("Memuatkan data dari Firestore...");
    try {
        const [snapT, snapS, snapC, snapA] = await Promise.all([
            getDocs(collection(db, "teachers")),
            getDocs(collection(db, "subjects")),
            getDocs(collection(db, "classes")),
            getDocs(collection(db, "assignments")) // Muat data agihan tugas
        ]);

        teachersList = snapT.docs.map(d => ({ id: d.id, ...d.data() }));
        subjectsList = snapS.docs.map(d => ({ id: d.id, ...d.data() }));
        classesList = snapC.docs.map(d => ({ id: d.id, ...d.data() }));
        assignmentsList = snapA.docs.map(d => ({ id: d.id, ...d.data() }));
        
        populateDropdowns();
        renderTeacherTable();
        renderSubjectTable();
        console.log("Data dimuatkan: ", { teachersList, assignmentsList });
    } catch (err) {
        console.error("Gagal memuatkan data:", err);
    }
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
    if(id && name) {
        setDoc(doc(db, "teachers", clean(id)), { name, shortform: short, canRelief: true })
        .then(() => { alert("Simpan Berjaya!"); loadAllData(); });
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

        if (!tId || !sId || !cId || !periods) {
            return alert("Sila lengkapkan pilihan Guru, Kelas, Subjek dan Slot!");
        }

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

    let html = `<table style="width:100%; border-collapse: collapse; font-size: 13px;">
        <thead style="background:#f1f5f9;">
            <tr><th>Guru</th><th>Kelas & Subjek</th><th>Slot</th><th>Aksi</th></tr>
        </thead><tbody>`;

    assignmentDraft.forEach((item, idx) => {
        html += `<tr style="border-bottom: 1px solid #eee;">
            <td style="padding:8px;">${item.teacherName}</td>
            <td style="padding:8px;">${item.classId} - ${item.subjectName}</td>
            <td style="padding:8px; text-align:center;">${item.periods}</td>
            <td style="padding:8px; text-align:center;">
                <button onclick="removeFromAssignmentDraft(${idx})" style="color:red; background:none; border:none; cursor:pointer;">&times;</button>
            </td>
        </tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

window.removeFromAssignmentDraft = (idx) => {
    assignmentDraft.splice(idx, 1);
    renderAssignmentDraftTable();
};

const btnSync = document.getElementById('btnSyncCloud');
if (btnSync) {
    btnSync.onclick = async () => {
        if (assignmentDraft.length === 0) return alert("Tiada draf untuk disimpan!");
        if (!confirm(`Simpan ${assignmentDraft.length} rekod ke Cloud?`)) return;

        try {
            btnSync.disabled = true;
            btnSync.innerText = "⏳ Sedang Menyimpan...";
            const batch = writeBatch(db);
            assignmentDraft.forEach(item => {
                const docId = `${item.classId}_${item.subjectId}_${item.teacherId}`;
                batch.set(doc(db, "assignments", docId), { ...item, updatedAt: serverTimestamp() });
            });
            await batch.commit();
            alert("✅ Berjaya simpan ke Cloud!");
            assignmentDraft = [];
            renderAssignmentDraftTable();
            loadAllData(); // Refresh data global
        } catch (error) {
            alert("Ralat simpan: " + error.message);
        } finally {
            btnSync.disabled = false;
            btnSync.innerText = "💾 SIMPAN SEMUA KE CLOUD";
        }
    };
}

// --- E. RENDER MASTER TABLES & DROPDOWNS ---
function renderTeacherTable() {
    const container = document.getElementById('teacherTableContainer');
    if(!container) return;
    let html = `<table class="data-table"><tr><th>ID</th><th>Nama</th><th>Tindakan</th></tr>`;
    teachersList.forEach(t => {
        html += `<tr><td>${t.id}</td><td>${t.name}</td>
        <td><button class="btn-sm btn-delete" onclick="deleteRecord('teachers', '${t.id}')">Padam</button></td></tr>`;
    });
    container.innerHTML = html + `</table>`;
}

function renderSubjectTable() {
    const container = document.getElementById('subjectTableContainer');
    if(!container) return;
    let html = `<table class="data-table"><tr><th>ID</th><th>Subjek</th><th>Tindakan</th></tr>`;
    subjectsList.forEach(s => {
        html += `<tr><td>${s.id}</td><td>${s.name}</td>
        <td><button class="btn-sm btn-delete" onclick="deleteRecord('subjects', '${s.id}')">Padam</button></td></tr>`;
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
    fill('absentTeacherSelect', teachersList, "Guru");
}

// --- F. GENERATE & VIEW JADUAL ---

// FIX: Pastikan data assignments dihantar ke generator
document.getElementById('btnGenerate').onclick = () => { 
    if(confirm("Jana jadual baru? Berdasarkan data Agihan Tugas di Cloud.")) {
        if (assignmentsList.length === 0) {
            return alert("Ralat: Tiada data agihan tugas ditemui. Sila simpan agihan ke Cloud dahulu!");
        }
        startGenerating(assignmentsList, teachersList, classesList); 
    } 
};

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

const btnPrint = document.getElementById('btnPrintJadual');
if (btnPrint) { btnPrint.onclick = () => window.print(); }

// --- G. GURU GANTI (RELIEF) ---
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
                if ((slot.teacherId || slot.teacher) === absentTeacherId) {
                    slotsToReplace.push({ slotKey, slotIndex: parseInt(slotKey)-1, classId, subject: slot.subjectId || slot.subject });
                }
            });
        }
    });

    if (slotsToReplace.length === 0) {
        resultArea.innerHTML = `<p style="text-align:center; color:orange;">Tiada kelas pada hari ${selectedDay}.</p>`;
        return;
    }

    let tableRows = "";
    slotsToReplace.sort((a,b) => a.slotIndex - b.slotIndex).forEach(item => {
        let candidates = findEligibleRelief(item.slotIndex, selectedDay, teacherSchedules)
                        .filter(c => c.id !== absentTeacherId);
        candidates.sort((a,b) => (b.isEligible - a.isEligible) || (dailyReliefCount[a.id] - dailyReliefCount[b.id]));
        const selected = candidates[0];
        if (selected) dailyReliefCount[selected.id]++;

        tableRows += `<tr>
            <td style="border:1px solid #000; text-align:center;">${timeMapping[item.slotKey] || item.slotKey}</td>
            <td style="border:1px solid #000; text-align:center;">${item.classId}</td>
            <td style="border:1px solid #000; text-align:center;">${item.subject}</td>
            <td style="border:1px solid #000; padding:5px;">${selected ? `<b>${selected.name}</b><br><small>${selected.reason}</small>` : 'TIADA GURU'}</td>
        </tr>`;
    });

    resultArea.innerHTML = `<div style="padding:20px; background:#fff; border:1px solid #ccc;">
        <h2 style="text-align:center;">SLIP GURU GANTI (RELIEF)</h2>
        <p style="text-align:center;">Tarikh: ${reliefDateVal} (${selectedDay.toUpperCase()}) | Guru: ${teachersList.find(t=>t.id===absentTeacherId)?.name}</p>
        <table style="width:100%; border-collapse:collapse;">
            <thead><tr style="background:#eee;"><th>Waktu</th><th>Kelas</th><th>Subjek</th><th>Guru Ganti</th></tr></thead>
            <tbody>${tableRows}</tbody>
        </table>
        <button onclick="window.print()" class="no-print" style="margin-top:15px; width:100%; padding:10px; background:#27ae60; color:white; border:none; border-radius:4px; cursor:pointer;">🖨️ Cetak Slip</button>
    </div>`;
};

// --- H. HELPERS ---
function mapSchedulesByTeacher(allTimetables) {
    const map = {};
    const days = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
    teachersList.forEach(t => { map[t.id] = {}; days.forEach(d => { map[t.id][d] = Array(12).fill(null); }); });

    Object.keys(allTimetables).forEach(classId => {
        const classTable = allTimetables[classId];
        Object.keys(classTable).forEach(day => {
            const dayData = classTable[day];
            if (dayData) {
                Object.keys(dayData).forEach(slotKey => {
                    const tId = dayData[slotKey].teacherId || dayData[slotKey].teacher;
                    if (tId && map[tId] && map[tId][day]) map[tId][day][parseInt(slotKey)-1] = { classId };
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
        results.push({ id: t.id, name: t.name, isEligible, reason: isEligible ? "Masa Kosong" : "Rehat Wajib (2 Jam Berturut)" });
    });
    return results;
}
