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

// Login
const btnLogin = document.getElementById('btnLogin');
if (btnLogin) {
    btnLogin.onclick = async () => {
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        try {
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error) {
            alert("Akses ditolak: " + error.message);
        }
    };
}

// Logout
const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
    btnLogout.onclick = async () => {
        if (confirm("Log keluar?")) {
            await signOut(auth);
            location.reload(); 
        }
    };
}

// --- C. PENGURUSAN DATA MASTER (CRUD) ---

async function saveMasterData(col, id, data) {
    const cleanId = clean(id);
    try {
        await setDoc(doc(db, col, cleanId), data);
        alert(`Berjaya disimpan!`);
        loadAllData();
    } catch (e) {
        alert("Ralat simpan: " + e.message);
    }
}

window.deleteRecord = async (col, id) => {
    if (confirm(`Padam rekod ${id}?`)) {
        try {
            await deleteDoc(doc(db, col, id));
            alert("Rekod dipadam.");
            loadAllData();
        } catch (e) {
            alert("Ralat padam: " + e.message);
        }
    }
};

window.editTeacher = (id, name, short) => {
    document.getElementById('regTeacherId').value = id;
    document.getElementById('regTeacherName').value = name;
    document.getElementById('regTeacherShort').value = short || "";
    document.getElementById('regTeacherId').readOnly = true; 
};

window.editSubject = (id, name, slots, isDouble) => {
    document.getElementById('regSubId').value = id;
    document.getElementById('regSubName').value = name;
    document.getElementById('regSubSlots').value = slots;
    document.getElementById('regSubDouble').checked = isDouble;
    document.getElementById('regSubId').readOnly = true;
};

document.getElementById('btnSaveTeacher').onclick = () => {
    const id = document.getElementById('regTeacherId').value;
    const name = document.getElementById('regTeacherName').value;
    const short = document.getElementById('regTeacherShort').value.toUpperCase();
    if(id && name && short) {
        saveMasterData("teachers", id, { name, shortform: short });
        document.getElementById('regTeacherId').readOnly = false;
    } else alert("Lengkapkan data!");
};

document.getElementById('btnSaveSubject').onclick = () => {
    const id = document.getElementById('regSubId').value;
    const name = document.getElementById('regSubName').value;
    const slots = parseInt(document.getElementById('regSubSlots').value);
    const isDouble = document.getElementById('regSubDouble').checked;
    if(id && name) {
        saveMasterData("subjects", id, { name, slots, isDouble });
        document.getElementById('regSubId').readOnly = false;
    } else alert("Lengkapkan data!");
};

document.getElementById('btnSaveClass').onclick = () => {
    const id = document.getElementById('regClassId').value;
    const name = document.getElementById('regClassName').value;
    if(id && name) saveMasterData("classes", id, { name });
};

// --- D. PAPARAN JADUAL DATA (READ) ---

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

function renderTeacherTable() {
    const container = document.getElementById('teacherTableContainer');
    let html = `<table class="data-table"><tr><th>ID</th><th>Nama</th><th>Singkatan</th><th>Tindakan</th></tr>`;
    teachersList.forEach(t => {
        html += `<tr>
            <td>${t.id}</td>
            <td>${t.name}</td>
            <td>${t.shortform || '-'}</td>
            <td>
                <button class="btn-sm btn-edit" onclick="editTeacher('${t.id}', '${t.name}', '${t.shortform || ''}')">Edit</button>
                <button class="btn-sm btn-delete" onclick="deleteRecord('teachers', '${t.id}')">Padam</button>
            </td>
        </tr>`;
    });
    container.innerHTML = html + `</table>`;
}

function renderSubjectTable() {
    const container = document.getElementById('subjectTableContainer');
    let html = `<table class="data-table"><tr><th>ID</th><th>Subjek</th><th>Slot</th><th>Tindakan</th></tr>`;
    subjectsList.forEach(s => {
        html += `<tr>
            <td>${s.id}</td>
            <td>${s.name}</td>
            <td>${s.slots} ${s.isDouble ? '(2)' : '(1)'}</td>
            <td>
                <button class="btn-sm btn-edit" onclick="editSubject('${s.id}', '${s.name}', ${s.slots}, ${s.isDouble})">Edit</button>
                <button class="btn-sm btn-delete" onclick="deleteRecord('subjects', '${s.id}')">Padam</button>
            </td>
        </tr>`;
    });
    container.innerHTML = html + `</table>`;
}

function populateDropdowns() {
    const fill = (elId, list, label) => {
        const el = document.getElementById(elId);
        if(!el) return;
        const extra = elId === 'viewClassSelect' ? '<option value="ALL">[ SEMUA KELAS ]</option>' : '';
        el.innerHTML = `<option value="">-- Pilih ${label} --</option>` + extra +
            list.map(i => `<option value="${i.id}">${i.name || i.id}</option>`).join('');
    };
    fill('selectTeacher', teachersList, "Guru");
    fill('selectSubject', subjectsList, "Subjek");
    fill('selectClass', classesList, "Kelas");
    fill('viewClassSelect', classesList, "Kelas");
    fill('absentTeacherSelect', teachersList, "Guru");
}

// --- E. AGIHAN TUGAS ---

document.getElementById('btnAddLocal').onclick = () => {
    const tId = document.getElementById('selectTeacher').value;
    const cId = document.getElementById('selectClass').value;
    const sId = document.getElementById('selectSubject').value;
    const slots = parseInt(document.getElementById('inputSlots').value);
    
    if(!tId || !cId || !sId || isNaN(slots)) return alert("Isi semua!");

    localAssignments.push({ teacherId: tId, classId: cId, subjectId: sId, totalSlots: slots });
    renderLocalList();
};

function renderLocalList() {
    const listUI = document.getElementById('localListUI');
    listUI.innerHTML = localAssignments.map((a, i) => 
        `<li style="padding:8px; border-bottom:1px solid #eee;">
            ${a.classId} : ${a.subjectId} (${a.totalSlots} slot) 
            <button onclick="window.delLocal(${i})" style="color:red; float:right;">Hapus</button>
        </li>`
    ).join('');
}
window.delLocal = (i) => { localAssignments.splice(i, 1); renderLocalList(); };

document.getElementById('btnSyncCloud').onclick = async () => {
    if(localAssignments.length === 0) return;
    const batch = writeBatch(db);
    localAssignments.forEach(a => {
        const ref = doc(db, "assignments", clean(`${a.classId}_${a.subjectId}_${a.teacherId}`));
        batch.set(ref, a);
    });
    await batch.commit();
    alert("Berjaya Sync!");
    localAssignments = [];
    renderLocalList();
};

// --- F. JANA & PAPAR ---

document.getElementById('btnGenerate').onclick = () => {
    if(confirm("Jana jadual baru?")) startGenerating();
};

document.getElementById('btnViewJadual').onclick = async () => {
    const container = document.getElementById('timetableContainer');
    const val = document.getElementById('viewClassSelect').value;
    if (!val) return;

    container.innerHTML = ""; 
    if (val === "ALL") {
        for (const cls of classesList) {
            const div = document.createElement('div');
            div.innerHTML = `<h2 style="text-align:center; page-break-before:always;">KELAS: ${cls.id}</h2><div id="grid-${cls.id}"></div>`;
            container.appendChild(div);
            await renderTimetableGrid(`grid-${cls.id}`, cls.id);
        }
    } else {
        await renderTimetableGrid("timetableContainer", val);
    }
};

document.getElementById('btnPrintJadual').onclick = () => window.print();

document.getElementById('btnSaveManual').onclick = async () => {
    const classId = document.getElementById('viewClassSelect').value;
    if (!classId || classId === "ALL") return alert("Pilih satu kelas!");
    const data = getCurrentTimetableData(); 
    await setDoc(doc(db, "timetables", classId), data);
    alert("Disimpan manual!");
};


// --- G. GURU GANTI (RELIEF) - MESRA GURU ---

document.getElementById('btnIdentifyRelief').onclick = async () => {
    const absentTeacherId = document.getElementById('absentTeacherSelect').value;
    if (!absentTeacherId) return alert("Pilih guru yang tidak hadir.");

    const resultArea = document.getElementById('reliefResultArea');
    resultArea.innerHTML = "<p>Sedang memproses data relief...</p>";

    // 1. Ambil data jadual semua kelas dari Firestore
    const snap = await getDocs(collection(db, "timetables"));
    const allTimetables = {};
    snap.forEach(doc => { allTimetables[doc.id] = doc.data(); });

    // 2. Petakan jadual mengikut guru (Teacher-Centric)
    const teacherSchedules = mapSchedulesByTeacher(allTimetables);

    // 3. Kenalpasti slot (PENTING: Nama hari mesti sepadan dengan Firestore "Isnin")
    const days = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
    let html = `<div class="relief-print-wrapper">
                <h3 style="text-align:center; border-bottom:2px solid #333; padding-bottom:10px;">
                    CADANGAN GURU GANTI: ${teachersList.find(t => t.id === absentTeacherId)?.name || absentTeacherId}
                </h3>`;

    let totalSlotsFound = 0;

days.forEach(day => {
        const slotsToReplace = [];
        Object.keys(allTimetables).forEach(classId => {
            const dayData = allTimetables[classId][day];
            
            if (dayData && Array.isArray(dayData)) {
                dayData.forEach((slot, index) => {
                    // 1. Debugging: Tengok perbandingan ID di Console
                    if (slot) {
                        console.log(`Semak: ${day}, Guru di DB: [${slot.teacherId}], Guru Dicari: [${absentTeacherId}]`);
                    }
                    
                    // 2. Logik Carian: Simpan slot jika ID sepadan
                    if (slot && slot.teacherId === absentTeacherId) {
                        slotsToReplace.push({ 
                            slotIndex: index, 
                            classId: classId, 
                            subject: slot.subjectId 
                        });
                        totalSlotsFound++; // Pastikan let totalSlotsFound = 0; ada di atas days.forEach
                    }
                }); // Tutup dayData.forEach
            }
        }); // Tutup Object.keys.forEach

        // Sambungan bina HTML untuk hari tersebut
        if (slotsToReplace.length > 0) {
            html += `<h4 style="background:#e2e8f0; padding:8px; margin-top:20px;">HARI: ${day.toUpperCase()}</h4>
                     <table class="data-table">
                        <tr>
                            <th width="15%">Waktu / Slot</th>
                            <th width="15%">Kelas</th>
                            <th width="70%">Cadangan Guru Ganti (Paling Layak Di Atas)</th>
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
    }); // Tutup days.forEach

    if (totalSlotsFound === 0) {
        html += `<p style="text-align:center; color:orange; padding:20px;">Tiada slot mengajar ditemui untuk guru ini pada hari-hari tersebut.</p>`;
    }

    html += `</div><button class="btn-outline-primary" onclick="window.print()" style="margin-top:20px; width:100%;">Cetak Senarai Relief</button>`;
    resultArea.innerHTML = html;
};

/**
 * Membina objek jadual untuk setiap guru
 */
function mapSchedulesByTeacher(allTimetables) {
    const map = {};
    const days = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];

    // Inisialisasi map untuk semua guru
    teachersList.forEach(t => { 
        map[t.id] = {}; 
        days.forEach(d => {
            map[t.id][d] = Array(12).fill(null);
        });
    });

    // Isi map berdasarkan jadual kelas
    Object.keys(allTimetables).forEach(classId => {
        const classTable = allTimetables[classId];
        Object.keys(classTable).forEach(day => {
            if (Array.isArray(classTable[day])) {
                classTable[day].forEach((slot, idx) => {
                    if (slot && slot.teacherId && map[slot.teacherId] && map[slot.teacherId][day]) {
                        map[slot.teacherId][day][idx] = { 
                            classId: classId, 
                            subjectId: slot.subjectId 
                        };
                    }
                });
            }
        });
    });
    return map; 
}

/**
 * Logik Mesra Guru: Cari siapa yang layak untuk relief
 */
function findEligibleRelief(slotIdx, day, teacherSchedules) {
    let results = [];

    teachersList.forEach(t => {
        const teacherData = teacherSchedules[t.id];
        if (!teacherData || !teacherData[day]) return;

        const schedule = teacherData[day];
        
        // 1. Cek jika guru sedang mengajar di slot ini
        if (schedule[slotIdx] !== null) return; 

        // 2. Cek Logik Mesra Guru: 2 Sesi Berturut-turut
        let isEligible = true;
        let reason = "Masa Kosong";

        if (slotIdx >= 2) {
            const s1 = schedule[slotIdx - 1];
            const s2 = schedule[slotIdx - 2];
            
            if (s1 !== null && s2 !== null) {
                isEligible = false;
                reason = `Penat: Baru selesai kelas ${s2.classId} & ${s1.classId}`;
            }
        }

        results.push({
            id: t.id,
            name: t.name,
            isEligible: isEligible,
            reason: reason
        });
    });

    return results.sort((a, b) => b.isEligible - a.isEligible);
}




