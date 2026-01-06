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
    addDoc,
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
let assignmentDraft = []; // Simpan draf agihan tugas secara lokal sebelum ke Cloud

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

// Logic Login/Logout sedia ada
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

// --- D. AGIHAN TUGAS (WORKLOAD) -> KOLEKSI 'assignments' ---

// 1. Fungsi Tambah ke Draf Lokal
// Diselaraskan dengan HTML: id="btnAddLocal" dan id="inputSlots"
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

        // Simpan data ke dalam array draf
        assignmentDraft.push({
            teacherId: tId,
            teacherName: teachersList.find(t => t.id === tId)?.name || tId,
            subjectId: sId,
            subjectName: subjectsList.find(s => s.id === sId)?.name || sId,
            classId: cId,
            periods: parseInt(periods)
        });

        // Kemaskini paparan senarai draf
        renderAssignmentDraftTable();
    };
}

// 2. Fungsi Papar Senarai Draf
// Diselaraskan dengan HTML: id="localListUI"
function renderAssignmentDraftTable() {
    const container = document.getElementById('localListUI');
    if (!container) return;
    
    if (assignmentDraft.length === 0) { 
        container.innerHTML = "<p style='padding:10px; color:#666; text-align:center;'>Tiada draf agihan.</p>"; 
        return; 
    }

    // Membina jadual untuk paparan yang lebih kemas
    let html = `
        <table style="width:100%; border-collapse: collapse; font-size: 13px;">
            <thead style="background:#f1f5f9; position: sticky; top: 0;">
                <tr>
                    <th style="padding:10px; border-bottom:1px solid #ddd; text-align:left;">Guru</th>
                    <th style="padding:10px; border-bottom:1px solid #ddd; text-align:left;">Kelas & Subjek</th>
                    <th style="padding:10px; border-bottom:1px solid #ddd; text-align:center;">Slot</th>
                    <th style="padding:10px; border-bottom:1px solid #ddd; text-align:center;">Aksi</th>
                </tr>
            </thead>
            <tbody>`;

    assignmentDraft.forEach((item, idx) => {
        html += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding:8px;">${item.teacherName}</td>
                <td style="padding:8px;">${item.classId} - ${item.subjectName}</td>
                <td style="padding:8px; text-align:center;">${item.periods}</td>
                <td style="padding:8px; text-align:center;">
                    <button onclick="removeFromAssignmentDraft(${idx})" style="color:#e74c3c; cursor:pointer; background:none; border:none; font-size:16px;">&times;</button>
                </td>
            </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

// Fungsi buang draf (window supaya boleh diakses dari onclick string)
window.removeFromAssignmentDraft = (idx) => {
    assignmentDraft.splice(idx, 1);
    renderAssignmentDraftTable();
};

// 3. Fungsi Simpan Semua ke Cloud
// Diselaraskan dengan HTML: id="btnSyncCloud"
const btnSync = document.getElementById('btnSyncCloud');
if (btnSync) {
    btnSync.onclick = async () => {
        if (assignmentDraft.length === 0) return alert("Tiada draf untuk disimpan!");
        if (!confirm(`Simpan ${assignmentDraft.length} rekod agihan ke Cloud?`)) return;

        try {
            btnSync.disabled = true;
            btnSync.innerText = "⏳ Sedang Menyimpan...";

            const batch = writeBatch(db);
            assignmentDraft.forEach(item => {
                // ID Dokumen unik: Kelas_Subjek_Guru
                const docId = `${item.classId}_${item.subjectId}_${item.teacherId}`;
                const docRef = doc(db, "assignments", docId);
                batch.set(docRef, {
                    ...item,
                    updatedAt: serverTimestamp()
                });
            });

            await batch.commit();
            alert("✅ Semua agihan berjaya disimpan ke Cloud!");
            
            // Kosongkan draf selepas berjaya simpan
            assignmentDraft = [];
            renderAssignmentDraftTable();
        } catch (error) {
            console.error("Ralat Firebase:", error);
            alert("Gagal simpan: " + error.message);
        } finally {
            btnSync.disabled = false;
            btnSync.innerText = "💾 SIMPAN SEMUA KE CLOUD";
        }
    };
}

// --- E. RENDER TABLES & DROPDOWNS ---
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
        
        options += list.map(i => {
            const displayName = i.name ? `${i.name} (${i.id})` : i.id;
            return `<option value="${i.id}">${displayName}</option>`;
        }).join('');
        el.innerHTML = options;
    };
    fill('selectTeacher', teachersList, "Guru");
    fill('selectSubject', subjectsList, "Subjek");
    fill('selectClass', classesList, "Kelas");
    fill('viewClassSelect', classesList, "Kelas", true);
    fill('absentTeacherSelect', teachersList, "Guru");
}

// --- F. GENERATE & VIEW JADUAL ---
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

const btnPrint = document.getElementById('btnPrintJadual');
if (btnPrint) {
    btnPrint.onclick = () => { window.print(); };
}

window.printTimetable = () => { window.print(); };

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
        if (dayData && typeof dayData === 'object') {
            Object.keys(dayData).forEach(slotKey => {
                const slot = dayData[slotKey];
                const currentTeacher = slot.teacherId || slot.teacher;
                if (slot && currentTeacher === absentTeacherId) {
                    slotsToReplace.push({ 
                        slotKey: slotKey, 
                        slotIndex: parseInt(slotKey)-1, 
                        classId: classId, 
                        subject: slot.subjectId || slot.subject 
                    });
                }
            });
        }
    });

    if (slotsToReplace.length === 0) {
        resultArea.innerHTML = `<p style="text-align:center; color:orange;">Tiada kelas ditemui pada hari ${selectedDay}.</p>`;
        return;
    }

    slotsToReplace.sort((a, b) => a.slotIndex - b.slotIndex);

    let tableRows = "";
    slotsToReplace.forEach(item => {
        let candidates = findEligibleRelief(item.slotIndex, selectedDay, teacherSchedules);
        candidates = candidates.filter(c => c.id !== absentTeacherId);
        candidates.sort((a, b) => (b.isEligible - a.isEligible) || (dailyReliefCount[a.id] - dailyReliefCount[b.id]));

        const selected = candidates[0];
        if (selected) dailyReliefCount[selected.id]++;

        const timeStr = timeMapping[item.slotKey] || `Slot ${item.slotKey}`;

        tableRows += `
            <tr>
                <td style="text-align:center; border:1px solid #000;"><b>${timeStr}</b></td>
                <td style="text-align:center; border:1px solid #000;">${item.classId}</td>
                <td style="text-align:center; border:1px solid #000;">${item.subject}</td>
                <td style="border:1px solid #000; padding:5px;">${selected ? `<b>${selected.name}</b> <br><small>(${selected.reason})</small>` : 'TIADA GURU'}</td>
            </tr>`;
    });

    resultArea.innerHTML = `
        <div id="printableReliefArea" style="padding:20px; background:#fff; border:1px solid #ccc;">
            <div style="text-align:center; border-bottom:2px solid #000; margin-bottom:15px; padding-bottom:10px;">
                <h2 style="margin:0;">SLIP GURU GANTI (RELIEF)</h2>
                <p>Tarikh: <b>${reliefDateVal} (${selectedDay.toUpperCase()})</b></p>
                <p>Guru Tidak Hadir: <b>${teachersList.find(t => t.id === absentTeacherId)?.name || absentTeacherId}</b></p>
            </div>
            <table style="width:100%; border-collapse: collapse;">
                <thead>
                    <tr style="background:#f2f2f2;">
                        <th style="border:1px solid #000; padding:8px;">Waktu</th>
                        <th style="border:1px solid #000; padding:8px;">Kelas</th>
                        <th style="border:1px solid #000; padding:8px;">Subjek Asal</th>
                        <th style="border:1px solid #000; padding:8px;">Guru Ganti Dilantik</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
            <button onclick="window.print()" class="no-print" style="margin-top:20px; width:100%; padding:10px; background:#27ae60; color:white; border:none; border-radius:5px; cursor:pointer;">
                🖨️ Cetak Slip Relief
            </button>
        </div>`;
};

// --- H. HELPER FUNCTIONS ---
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
        results.push({ id: t.id, name: t.name, isEligible, reason: isEligible ? "Masa Kosong" : "Rehat Wajib (2 Jam Berturut)" });
    });
    return results;
}

