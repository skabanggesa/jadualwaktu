/**
 * SISTEM PENGURUSAN JADUAL WAKTU (ASG VER 1.0)
 * Fail: ui-render.js
 */

import { db } from "./firebase-config.js";
import { doc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- STATE GLOBAL ---
let currentTimetableData = {}; 
let teacherMapGlobal = {};     
let allTimetablesCache = {};  
let currentAssignments = []; // Simpan assignments secara global untuk kemaskini status

export function getCurrentTimetableData() {
    return currentTimetableData;
}

function getSubjectColor(subjectId) {
    if (!subjectId) return "#ffffff";
    const sub = subjectId.toUpperCase();
    const colorMap = {
        "BM": "#ffadad", "BI": "#a0c4ff", "MT": "#b9fbc0", "SN": "#bdb2ff",
        "PI": "#9bf6ff", "PM": "#fdffb6", "BA": "#ffc6ff", "PJ": "#ffd6a5",
        "PK": "#ffafcc", "PERHIMPUNAN": "#ffffff"
    };
    for (let key in colorMap) { if (sub.includes(key)) return colorMap[key]; }
    return "#f1f5f9"; 
}

async function checkTeacherConflict(teacherId, day, slot, currentClassId) {
    if (!teacherId || teacherId === "SEMUA") return null;
    const incoming = teacherId.split("/");
    for (const classId in allTimetablesCache) {
        if (classId === currentClassId) continue; 
        const cell = allTimetablesCache[classId][day]?.[slot];
        if (cell && cell.teacherId) {
            const clashing = incoming.find(id => cell.teacherId.split("/").includes(id));
            if (clashing) return { classId, teacherName: teacherMapGlobal[clashing] || clashing };
        }
    }
    return null;
}

export async function renderTimetableGrid(containerId, classId) {
    const container = document.getElementById(containerId);
    if (!classId) return;

    // Ambil data dari Firestore hanya sekali semasa mula
    const [docSnap, teacherSnap, allSnaps, assignSnap] = await Promise.all([
        getDoc(doc(db, "timetables", classId)),
        getDocs(collection(db, "teachers")),
        getDocs(collection(db, "timetables")),
        getDocs(collection(db, "assignments"))
    ]);

    teacherMapGlobal = {};
    teacherSnap.forEach(t => {
        const d = t.data();
        teacherMapGlobal[t.id] = d.shortform || t.id;
    });

    allTimetablesCache = {};
    allSnaps.forEach(d => { allTimetablesCache[d.id] = d.data(); });

    currentTimetableData = docSnap.exists() ? docSnap.data() : {};
    
    // Simpan assignments untuk kegunaan renderStatus kemudian
    currentAssignments = assignSnap.docs
        .map(d => d.data())
        .filter(a => a.classId === classId);

    // Lukis grid buat kali pertama
    refreshUI(containerId, classId);
}

// Fungsi pembantu untuk melukis semula Grid + Status tanpa fetch database
function refreshUI(containerId, classId) {
    drawGrid(containerId, classId);
    renderStatus(containerId, currentAssignments);
}

function drawGrid(containerId, classId) {
    const container = document.getElementById(containerId);
    const days = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
    const times = { 
        1:"07:10", 2:"07:40", 3:"08:10", 4:"08:40", 5:"09:10", 
        "REHAT":"09:40",
        6:"10:00", 7:"10:30", 8:"11:00", 9:"11:30" 
    };

    let html = `<table class="timetable-table" style="width:100%; border-collapse:collapse;">
        <thead>
            <tr style="background:#f1f5f9;">
                <th style="padding:10px; border:1px solid #cbd5e1;">Hari / Masa</th>`;
    
    for (let i = 1; i <= 9; i++) {
        html += `<th style="padding:5px; border:1px solid #cbd5e1; text-align:center;">
                    ${i}<br><small style="color:#64748b;">${times[i]}</small>
                 </th>`;
        if (i === 5) {
            html += `<th style="background:#e2e8f0; border:1px solid #cbd5e1; width:30px;">REHAT</th>`;
        }
    }
    html += `</tr></thead><tbody>`;

    days.forEach(day => {
        let limit = (day === "Jumaat") ? 8 : 9;
        html += `<tr><td style="padding:10px; border:1px solid #cbd5e1; font-weight:bold; background:#f8fafc;">${day}</td>`;
        
        for (let s = 1; s <= 9; s++) {
            const item = currentTimetableData[day]?.[s];
            let cellContent = "", bgColor = "#ffffff", isDraggable = false;

            if (item) {
                isDraggable = item.subjectId !== "PERHIMPUNAN";
                bgColor = getSubjectColor(item.subjectId);
                const tNames = item.teacherId.split("/").map(id => teacherMapGlobal[id] || id).join("/");
                
                cellContent = `<div style="display:flex; flex-direction:column; justify-content:center; pointer-events:none;">
                    <span style="font-weight:bold; font-size:0.75rem;">${item.subjectId}</span>
                    <span style="font-size:0.6rem; color:#475569;">${tNames}</span>
                </div>`;
            }

            const cellStyle = `background-color:${bgColor}; border:1px solid #cbd5e1; text-align:center; height:55px; vertical-align:middle; padding:2px; cursor:${isDraggable ? 'grab' : 'default'};`;

            if (s > limit) {
                html += `<td style="${cellStyle} background:#f1f5f9;"></td>`;
            } else {
                html += `<td class="slot-cell" data-day="${day}" data-slot="${s}" style="${cellStyle}"
                    draggable="${isDraggable}" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)"
                    ondrop="handleDrop(event, '${containerId}', '${classId}')">${cellContent}</td>`;
            }

            if (s === 5) {
                html += `<td style="background:#f1f5f9; border:1px solid #cbd5e1; text-align:center; vertical-align:middle; color:#64748b; font-weight:bold; font-size:0.65rem; writing-mode:vertical-lr; transform:rotate(180deg);">REHAT</td>`;
            }
        }
        html += `</tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

function renderStatus(containerId, assigns) {
    const container = document.getElementById(containerId);
    let statusHtml = `<div style="margin-top:15px; padding:12px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
        <h5 style="margin:0 0 10px 0; color:#1e293b;">Semakan Jumlah Waktu:</h5>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">`;
    
    assigns.forEach(a => {
        let count = 0;
        Object.values(currentTimetableData).forEach(day => {
            Object.values(day).forEach(slot => {
                if (slot && slot.subjectId === a.subjectId) count++;
            });
        });
        const required = a.periods || a.totalSlots;
        const color = count < required ? '#e11d48' : '#16a34a';
        const bgColor = count < required ? '#fff1f2' : '#f0fdf4';

        statusHtml += `<span style="background:${bgColor}; border:1px solid ${color}; color:${color}; padding:4px 8px; border-radius:5px; font-size:0.7rem; font-weight:600;">
            ${a.subjectId}: ${count}/${required}
        </span>`;
    });
    container.innerHTML += statusHtml + `</div></div>`;
}

// --- DRAG & DROP HANDLERS (STABIL) ---
window.handleDragStart = (e) => {
    const cell = e.target.closest(".slot-cell");
    if(cell) {
        e.dataTransfer.setData("fromDay", cell.dataset.day);
        e.dataTransfer.setData("fromSlot", cell.dataset.slot);
        cell.style.opacity = '0.5';
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

    // Jika drop di tempat yang sama, abaikan
    if (fromDay === toDay && fromSlot === toSlot) return;

    const itemToMove = currentTimetableData[fromDay]?.[fromSlot];
    const itemAtTarget = currentTimetableData[toDay]?.[toSlot];

    // Semak pertembungan guru di lokasi baru
    if (itemToMove) {
        const conflict = await checkTeacherConflict(itemToMove.teacherId, toDay, toSlot, classId);
        if (conflict) {
            if (!confirm(`AMARAN: Guru [${conflict.teacherName}] sudah ada kelas di [${conflict.classId}]. Teruskan?`)) {
                refreshUI(containerId, classId); // Reset opacity
                return;
            }
        }
    }

    // LAKUKAN SWAP SECARA LOKAL
    if (!currentTimetableData[fromDay]) currentTimetableData[fromDay] = {};
    if (!currentTimetableData[toDay]) currentTimetableData[toDay] = {};

    currentTimetableData[fromDay][fromSlot] = itemAtTarget || null;
    currentTimetableData[toDay][toSlot] = itemToMove;

    // Padam property jika null supaya database bersih
    if (!currentTimetableData[fromDay][fromSlot]) delete currentTimetableData[fromDay][fromSlot];

    // Refresh UI tanpa fetch database (Kunci kejayaan Drag & Drop)
    refreshUI(containerId, classId);
};
