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

// 1. Simpan Data (Create/Update)
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

// 2. Padam Data (Delete)
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

// 3. Kemaskini (Edit - Isi semula borang)
window.editTeacher = (id, name, short) => {
    document.getElementById('regTeacherId').value = id;
    document.getElementById('regTeacherName').value = name;
    document.getElementById('regTeacherShort').value = short || "";
    document.getElementById('regTeacherId').readOnly = true; // Elakkan tukar ID semasa edit
};

window.editSubject = (id, name, slots, isDouble) => {
    document.getElementById('regSubId').value = id;
    document.getElementById('regSubName').value = name;
    document.getElementById('regSubSlots').value = slots;
    document.getElementById('regSubDouble').checked = isDouble;
    document.getElementById('regSubId').readOnly = true;
};

// Event Listeners Simpan
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