/**
 * SISTEM PENGURUSAN JADUAL WAKTU (ASG VER 1.0)
 * Fail: ui-render.js
 * Peranan: Menguruskan paparan grid, Drag & Drop, dan Semakan Pertindihan (Multi-Teacher).
 */

import { db } from "./firebase-config.js";
import { 
    doc, 
    getDoc, 
    getDocs, 
    collection 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- STATE GLOBAL ---
let currentTimetableData = {}; 
let teacherMapGlobal = {};     
let allTimetablesCache = {};  

export function getCurrentTimetableData() {
    return currentTimetableData;
}

/**
 * Fungsi warna subjek (Ditambah sokongan untuk mengesan subjek gabungan)
 */
function getSubjectColor(subjectId) {
    if (!subjectId) return "#ffffff";
    const sub = subjectId.toUpperCase();
    
    // Jika PAI / PM, gunakan warna cerun (gradient) atau warna neutral yang unik
    if (sub.includes("PAI") && sub.includes("PM")) return "#e2e8f0"; 

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
 * SEMAKAN PERTINDIHAN (VERSI 2.0): Menyokong ID Guru Gabungan (contoh: "G1/G2")
 */
async function checkTeacherConflict(teacherId, day, slot, currentClassId) {
    if (!teacherId || teacherId === "SEMUA") return null;

    // Pecahkan ID guru yang ingin dipindahkan (boleh jadi satu atau ramai)
    const incomingTeachers = teacherId.split("/");

    for (const classId in allTimetablesCache) {
        if (classId === currentClassId) continue; 

        const timetable = allTimetablesCache[classId];
        const cell = timetable[day]?.[slot];

        if (cell && cell.teacherId) {
            const existingTeachers = cell.teacherId.split("/");
            
            // Cari jika ada mana-mana guru dalam senarai 'incoming' bertembung dengan 'existing'
            const clashingTeacher = incomingTeachers.find(id => existingTeachers.includes(id));
            
            if (clashingTeacher) {
                const name = teacherMapGlobal[clashingTeacher] || clashingTeacher;
                return { classId, teacherName: name };
            }
        }
    }
    return null;
}

export async function renderTimetableGrid(containerId, classId) {
    const container = document.getElementById(containerId);
    if (!classId) return;

    const [docSnap, teacherSnap, allSnaps] = await Promise.all([
        getDoc(doc(db, "timetables", classId)),
        getDocs(collection(db, "teachers")),
        getDocs(collection(db, "timetables"))
    ]);

    if (!docSnap.exists()) {
        container.innerHTML = `<p style="padding:20px; color:red;">Data jadual kelas ${classId} tidak dijumpai.</p>`;
        return;
    }

    teacherMapGlobal = {};
    teacherSnap.forEach(t => {
        const data = t.data();
        teacherMapGlobal[t.id] = data.shortform || (data.name ? data.name.split(' ')[0] : t.id);
    });

    allTimetablesCache = {};
    allSnaps.forEach(d => { allTimetablesCache[d.id] = d.data(); });

    currentTimetableData = docSnap.data();
    drawGrid(containerId, classId);
}

/**
 * LUKIS GRID: Ditambah baik untuk paparan PAI/PM dan Co-Teaching
 */
function drawGrid(containerId, classId) {
    const container = document.getElementById(containerId);
    const days = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
    const times = { 1:"07:10", 2:"07:40", 3:"08:10", 4:"08:40", 5:"09:10", 6:"10:00", 7:"10:30", 8:"11:00", 9:"11:30" };

    let html = `<table class="timetable-table"><thead><tr><th>Hari / Masa</th>`;
    for (let i = 1; i <= 9; i++) {
        html += `<th>${i}<br><small>${times[i]}</small></th>`;
        if (i === 5) html += `<th class="rehat-col">REHAT<br><small>09:40</small></th>`;
    }
    html += `</tr></thead><tbody>`;

    days.forEach(day => {
        let limit = (day === "Jumaat") ? 8 : 9;
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
                    cellContent = `<span class="subject-name">PERHIMPUNAN</span>`;
                } else if (item.subjectId.includes("/")) {
                    // PAPARAN GABUNGAN (Parallel PAI/PM atau Co-Teaching)
                    const subNames = item.subjectId.split("/");
                    const tIds = item.teacherId.split("/");
                    const tNames = tIds.map(id => teacherMapGlobal[id] || id).join("/");

                    cellContent = `
                        <div class="cell-box dual-subject">
                            <span class="subject-name" style="font-size: 0.65rem; color: #1e293b; font-weight:800;">${item.subjectId}</span>
                            <span class="teacher-name" style="font-size: 0.55rem; color: #475569;">${tNames}</span>
                        </div>`;
                } else {
                    // PAPARAN BIASA
                    const tName = teacherMapGlobal[item.teacherId] || item.teacherId;
                    cellContent = `
                        <div class="cell-box">
                            <span class="subject-name" style="font-size: 0.8rem; font-weight: bold;">${item.subjectId}</span>
                            <span class="teacher-name" style="font-size: 0.65rem;">${tName}</span>
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
                    style="background-color: ${bgColor};"
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

// --- PENGENDALI DRAG & DROP ---

window.handleDragStart = (e) => {
    const cell = e.target.closest(".slot-cell");
    if (cell) {
        e.dataTransfer.setData("fromDay", cell.dataset.day);
        e.dataTransfer.setData("fromSlot", cell.dataset.slot);
        cell.classList.add("dragging");
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

    if (fromDay === toDay && fromSlot === toSlot) return;

    const itemToMove = currentTimetableData[fromDay]?.[fromSlot];
    const itemAtTarget = currentTimetableData[toDay]?.[toSlot];

    // --- SEMAK PERTINDIHAN SEBELUM SWAP ---
    if (itemToMove) {
        const conflict = await checkTeacherConflict(itemToMove.teacherId, toDay, toSlot, classId);
        if (conflict) {
            const confirmMsg = `AMARAN PERTINDIHAN GURU!\n\n` +
                               `Guru [${conflict.teacherName}] sudah mengajar di Kelas [${conflict.classId}] ` +
                               `pada hari ${toDay} slot ${toSlot}.\n\n` +
                               `Adakah anda pasti ingin meneruskan pertukaran?`;
            if (!confirm(confirmMsg)) return;
        }
    }

    // Lakukan Swap
    if (!currentTimetableData[fromDay]) currentTimetableData[fromDay] = {};
    if (!currentTimetableData[toDay]) currentTimetableData[toDay] = {};

    currentTimetableData[fromDay][fromSlot] = itemAtTarget;
    currentTimetableData[toDay][toSlot] = itemToMove;

    // Bersihkan slot kosong
    if (!currentTimetableData[fromDay][fromSlot]) delete currentTimetableData[fromDay][fromSlot];
    if (!currentTimetableData[toDay][toSlot]) delete currentTimetableData[toDay][toSlot];

    drawGrid(containerId, classId);
};
