/**
 * SISTEM PENGURUSAN JADUAL WAKTU (ASG VER 1.0)
 * Fail: ui-render.js
 * Peranan: Menguruskan paparan grid (Tahap 1), Drag & Drop, dan Semakan Pertindihan Guru.
 */

import { db } from "./firebase-config.js";
import { 
    doc, 
    getDoc, 
    getDocs, 
    collection 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- STATE GLOBAL ---
let currentTimetableData = {}; // Data jadual kelas yang sedang dipaparkan
let teacherMapGlobal = {};     // Peta ID Guru ke Nama Pendek
let allTimetablesCache = {};  // Cache semua jadual untuk semakan pertindihan

/**
 * Mengambil data jadual waktu terkini (untuk kegunaan app.js semasa simpanan manual).
 */
export function getCurrentTimetableData() {
    return currentTimetableData;
}

/**
 * Fungsi warna subjek (Kekal dari fail asal anda)
 */
function getSubjectColor(subjectId) {
    if (!subjectId) return "#ffffff";
    const sub = subjectId.toUpperCase();
    const colorMap = {
        "BM": "#ffadad", "BI": "#a0c4ff", "MT": "#b9fbc0", "SN": "#bdb2ff",
        "PI": "#9bf6ff", "PM": "#fdffb6", "BA": "#ffc6ff", "PJ": "#ffd6a5",
        "PK": "#ffafcc", "RBT": "#dee2e6", "MZ": "#fffffc", "DSV": "#f1c0e8",
        "PERHIMPUNAN": "#ffffff"
    };
    for (let key in colorMap) {
        if (sub.includes(key)) return colorMap[key];
    }
    return "#f8fafc"; 
}

/**
 * LOGIK BARU: Menyemak jika guru bertindih di kelas lain pada slot yang sama.
 */
async function checkTeacherConflict(teacherId, day, slot, currentClassId) {
    if (!teacherId || teacherId.includes("/")) return null; // Abaikan jika tiada guru atau subjek gabungan

    // Semak dalam cache semua jadual yang dimuatkan
    for (const classId in allTimetablesCache) {
        if (classId === currentClassId) continue; 

        const timetable = allTimetablesCache[classId];
        if (timetable[day] && timetable[day][slot]) {
            // Jika ID guru sama dengan guru yang ingin diletakkan
            if (timetable[day][slot].teacherId === teacherId) {
                return classId; // Konflik ditemui di kelas ini
            }
        }
    }
    return null;
}

/**
 * Mengambil data dari Firestore dan memulakan lukisan grid.
 */
export async function renderTimetableGrid(containerId, classId) {
    const container = document.getElementById(containerId);
    if (!classId) return;

    // Ambil data jadual kelas, senarai guru, dan SEMUA jadual lain (untuk conflict check)
    const [docSnap, teacherSnap, allSnaps] = await Promise.all([
        getDoc(doc(db, "timetables", classId)),
        getDocs(collection(db, "teachers")),
        getDocs(collection(db, "timetables"))
    ]);

    if (!docSnap.exists()) {
        container.innerHTML = `<p style="padding:20px; color:red;">Data jadual bagi kelas ${classId} tidak dijumpai.</p>`;
        return;
    }

    // Bina peta nama guru (Nama depan sahaja)
teacherMapGlobal = {};
teacherSnap.forEach(t => {
    const data = t.data();
    // Gunakan shortform jika ada, jika tiada guna nama depan (split)
    teacherMapGlobal[t.id] = data.shortform || (data.name ? data.name.split(' ')[0] : t.id);
});

    // Simpan semua jadual ke dalam cache untuk semakan pantas
    allTimetablesCache = {};
    allSnaps.forEach(d => { allTimetablesCache[d.id] = d.data(); });

    currentTimetableData = docSnap.data();
    drawGrid(containerId, classId);
}

/**
 * Membina jadual HTML mengikut spesifikasi waktu Tahap 1 (Kekal dari fail asal)
 */
function drawGrid(containerId, classId) {
    const container = document.getElementById(containerId);
    const days = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
    
    // Konfigurasi Masa Tahap 1
    const times = { 
        1:"07:10", 2:"07:40", 3:"08:10", 4:"08:40", 5:"09:10", 
        6:"10:00", 7:"10:30", 8:"11:00", 9:"11:30" 
    };

    let html = `<table class="timetable-table"><thead><tr><th>Hari / Masa</th>`;
    for (let i = 1; i <= 9; i++) {
        html += `<th>${i}<br><small>${times[i]}</small></th>`;
        if (i === 5) html += `<th class="rehat-col">REHAT<br><small>09:40</small></th>`;
    }
    html += `</tr></thead><tbody>`;

    days.forEach(day => {
        let limit = (day === "Jumaat") ? 8 : 9; // Jumaat 8 slot sahaja
        html += `<tr><td><strong>${day}</strong></td>`;
        
        for (let s = 1; s <= 9; s++) {
            const item = currentTimetableData[day]?.[s];
            let cellContent = "";
            let bgColor = "#ffffff";
            let isDraggable = false;

            if (item) {
                isDraggable = item.subjectId !== "PERHIMPUNAN";
                bgColor = getSubjectColor(item.subjectId);

                if (item.subjectId === "PERHIMPUNAN") {
                    cellContent = `<span class="subject-name">P</span>`;
                } else if (item.subjectId.includes("/")) {
                    const tids = item.teacherId.split("/");
                    const t1 = teacherMapGlobal[tids[0]] || tids[0];
                    const t2 = teacherMapGlobal[tids[1]] || tids[1];
                    cellContent = `
                        <div class="cell-box">
                            <span class="subject-name" style="font-size: 0.65rem;">${item.subjectId}</span>
                            <span class="teacher-name" style="font-size: 0.55rem;">${t1}/${t2}</span>
                        </div>`;
                } else {
                    const tName = teacherMapGlobal[item.teacherId] || item.teacherId;
                    cellContent = `
                        <div class="cell-box">
                            <span class="subject-name" style="font-size: 0.75rem; font-weight: bold;">${item.subjectId}</span>
                            <span class="teacher-name" style="font-size: 0.6rem;">${tName}</span>
                        </div>`;
                }
            }

            if (s > limit) {
                html += `<td class="empty-slot" style="background:#f1f5f9;"></td>`;
            } else {
                html += `<td 
                    class="slot-cell" 
                    data-day="${day}" 
                    data-slot="${s}"
                    style="background-color: ${bgColor}; padding: 4px 2px;"
                    draggable="${isDraggable}"
                    ondragstart="handleDragStart(event)"
                    ondragover="handleDragOver(event)"
                    ondrop="handleDrop(event, '${containerId}', '${classId}')"
                >${cellContent}</td>`;
            }

            if (s === 5) html += `<td class="rehat-cell">REHAT</td>`;
        }
        html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

// --- PENGENDALI DRAG & DROP DENGAN SEMAKAN PERTINDIHAN ---

window.handleDragStart = (e) => {
    const cell = e.target.closest(".slot-cell");
    if (cell) {
        e.dataTransfer.setData("fromDay", cell.dataset.day);
        e.dataTransfer.setData("fromSlot", cell.dataset.slot);
        e.target.classList.add("dragging");
    }
};

window.handleDragOver = (e) => {
    e.preventDefault(); 
};

window.handleDrop = async (e, containerId, classId) => {
    e.preventDefault();
    
    const fromDay = e.dataTransfer.getData("fromDay");
    const fromSlot = parseInt(e.dataTransfer.getData("fromSlot"));
    
    const targetCell = e.target.closest(".slot-cell");
    if (!targetCell) return;

    const toDay = targetCell.dataset.day;
    const toSlot = parseInt(targetCell.dataset.slot);

    // Jika lepaskan pada tempat yang sama, abaikan
    if (fromDay === toDay && fromSlot === toSlot) return;

    const itemToMove = currentTimetableData[fromDay]?.[fromSlot];
    const itemAtTarget = currentTimetableData[toDay]?.[toSlot];

    // --- LOGIK SEMAKAN PERTINDIHAN GURU ---
    if (itemToMove) {
        const conflictInClass = await checkTeacherConflict(itemToMove.teacherId, toDay, toSlot, classId);
        if (conflictInClass) {
            const confirmMove = confirm(
                `AMARAN PERTINDIHAN!\n\n` +
                `Guru ${itemToMove.teacherId} sudah mempunyai jadual di kelas ${conflictInClass} ` +
                `pada hari ${toDay} slot ${toSlot}.\n\n` +
                `Adakah anda tetap ingin meneruskan pertukaran ini?`
            );
            if (!confirmMove) return; // Batal pertukaran jika pengguna pilih 'Cancel'
        }
    }

    // Lakukan pertukaran (Swap)
    if (!currentTimetableData[fromDay]) currentTimetableData[fromDay] = {};
    if (!currentTimetableData[toDay]) currentTimetableData[toDay] = {};

    currentTimetableData[fromDay][fromSlot] = itemAtTarget;
    currentTimetableData[toDay][toSlot] = itemToMove;

    // Bersihkan slot yang kosong
    if (!currentTimetableData[fromDay][fromSlot]) delete currentTimetableData[fromDay][fromSlot];
    if (!currentTimetableData[toDay][toSlot]) delete currentTimetableData[toDay][toSlot];

    // Lukis semula grid
    drawGrid(containerId, classId);
};