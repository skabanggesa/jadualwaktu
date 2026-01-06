/**
 * SISTEM PENGURUSAN JADUAL WAKTU (ASG VER 1.0)
 * Fail: ui-render.js
 * Status: DIKEMASKINI (Paparan Rehat Dibaiki)
 */

import { db } from "./firebase-config.js";
import { doc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentTimetableData = {}; 
let teacherMapGlobal = {};     
let allTimetablesCache = {};  

// EKSPORE WAJIB UNTUK app.js
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
    drawGrid(containerId, classId);
    
    const classAssigns = assignSnap.docs.map(d => d.data()).filter(a => a.classId === classId);
    renderStatus(containerId, classAssigns);
}

function drawGrid(containerId, classId) {
    const container = document.getElementById(containerId);
    const days = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
    // Masa dikemaskini untuk memasukkan waktu rehat yang jelas
    const times = { 
        1:"07:10-07:40", 2:"07:40-08:10", 3:"08:10-08:40", 4:"08:40-09:10", 5:"09:10-09:40", 
        "REHAT":"09:40-10:00",
        6:"10:00-10:30", 7:"10:30-11:00", 8:"11:00-11:30", 9:"11:30-12:00" 
    };

    let html = `<table class="timetable-table" style="width:100%; border-collapse:collapse; font-family: sans-serif;">
        <thead>
            <tr style="background:#e2e8f0; color:#334155;">
                <th style="padding:8px; border:1px solid #cbd5e1;">Hari / Masa</th>`;
    
    for (let i = 1; i <= 9; i++) {
        html += `<th style="padding:4px; border:1px solid #cbd5e1; text-align:center;">
                    Slot ${i}<br><small style="font-size:0.65rem; color:#475569;">${times[i]}</small>
                 </th>`;
        // HEADER REHAT YANG LEBIH KEMAS
        if (i === 5) {
            html += `<th class="rehat-col" style="background:#cbd5e1; color:#334155; border:1px solid #94a3b8; text-align:center; vertical-align:middle; width: 40px;">
                        REHAT<br><small style="font-size:0.6rem;">${times["REHAT"]}</small>
                     </th>`;
        }
    }
    html += `</tr></thead><tbody>`;

    days.forEach(day => {
        let limit = (day === "Jumaat") ? 8 : 9;
        html += `<tr><td style="padding:8px; border:1px solid #cbd5e1; font-weight:bold; background:#f1f5f9;">${day}</td>`;
        for (let s = 1; s <= 9; s++) {
            const item = currentTimetableData[day]?.[s];
            let cellContent = "", bgColor = "#ffffff", isDraggable = false;

            if (item) {
                isDraggable = item.subjectId !== "PERHIMPUNAN";
                bgColor = getSubjectColor(item.subjectId);
                const tNames = item.teacherId.split("/").map(id => teacherMapGlobal[id] || id).join("/");
                
                // Gaya font yang lebih kemas
                const subFontSize = item.subjectId.length > 10 || tNames.length > 15 ? "0.65rem" : "0.75rem";
                
                cellContent = `<div class="cell-box" style="display:flex; flex-direction:column; justify-content:center; height:100%;">
                    <span class="subject-name" style="font-weight:800; font-size:${subFontSize}; line-height:1.1; margin-bottom:2px;">${item.subjectId}</span>
                    <span class="teacher-name" style="font-size:0.6rem; color:#4b5563; line-height:1;">${tNames}</span>
                </div>`;
            }

            const cellStyle = `background-color:${bgColor}; border:1px solid #cbd5e1; text-align:center; height:55px; vertical-align:middle; padding:2px;`;

            if (s > limit) {
                html += `<td style="${cellStyle} background:#f1f5f9; opacity:0.5;"></td>`;
            } else {
                html += `<td class="slot-cell" data-day="${day}" data-slot="${s}" style="${cellStyle}"
                    draggable="${isDraggable}" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)"
                    ondrop="handleDrop(event, '${containerId}', '${classId}')">${cellContent}</td>`;
            }

            // SEL REHAT YANG LEBIH KEMAS (Bukan sekadar "R")
            if (s === 5) {
                html += `<td class="rehat-cell" style="background:#e2e8f0; border:1px solid #94a3b8; font-weight:bold; text-align:center; vertical-align:middle; color:#475569; font-size:0.7rem; writing-mode: vertical-lr; transform: rotate(180deg);">REHAT</td>`;
            }
        }
        html += `</tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

function renderStatus(containerId, assigns) {
    const container = document.getElementById(containerId);
    let statusHtml = `<div style="margin-top:15px; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
        <h5 style="margin:0 0 8px 0; color:#334155; font-size:0.9rem;">Status Pengisian Waktu:</h5>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">`;
    
    assigns.forEach(a => {
        let count = 0;
        Object.values(currentTimetableData).forEach(day => {
            Object.values(day).forEach(slot => {
                if (slot.subjectId === a.subjectId) count++;
            });
        });
        const required = a.periods || a.totalSlots;
        const isComplete = count >= required;
        const color = isComplete ? '#16a34a' : '#dc2626';
        const bgColor = isComplete ? '#dcfce7' : '#fee2e2';

        statusHtml += `<span style="background:${bgColor}; border:1px solid ${color}; color:${color}; padding:3px 6px; border-radius:4px; font-size:0.75rem; font-weight:600;">
            ${a.subjectId}: ${count}/${required}
        </span>`;
    });
    container.innerHTML += statusHtml + `</div></div>`;
}

// Global Drag Handlers
window.handleDragStart = (e) => {
    const cell = e.target.closest(".slot-cell");
    if(cell) {
        e.dataTransfer.setData("fromDay", cell.dataset.day);
        e.dataTransfer.setData("fromSlot", cell.dataset.slot);
        cell.style.opacity = '0.4';
    }
};

window.handleDragOver = (e) => e.preventDefault();

window.handleDragEnd = (e) => {
      const cell = e.target.closest(".slot-cell");
      if(cell) cell.style.opacity = '1';
};

window.handleDrop = async (e, containerId, classId) => {
    e.preventDefault();
    const fromDay = e.dataTransfer.getData("fromDay");
    const fromSlot = parseInt(e.dataTransfer.getData("fromSlot"));
    const targetCell = e.target.closest(".slot-cell");
    if (!targetCell) return;

    const toDay = targetCell.dataset.day, toSlot = parseInt(targetCell.dataset.slot);
    if (fromDay === toDay && fromSlot === toSlot) return;

    const itemToMove = currentTimetableData[fromDay]?.[fromSlot];
    const itemAtTarget = currentTimetableData[toDay]?.[toSlot];

    if (itemToMove) {
        const conflict = await checkTeacherConflict(itemToMove.teacherId, toDay, toSlot, classId);
        if (conflict && !confirm(`Guru [${conflict.teacherName}] sibuk di [${conflict.classId}]. Teruskan?`)) return;
    }

    if (!currentTimetableData[fromDay]) currentTimetableData[fromDay] = {};
    if (!currentTimetableData[toDay]) currentTimetableData[toDay] = {};
    currentTimetableData[fromDay][fromSlot] = itemAtTarget;
    currentTimetableData[toDay][toSlot] = itemToMove;
    
    renderTimetableGrid(containerId, classId);
};
// Tambah event listener untuk dragend
document.addEventListener('dragend', window.handleDragEnd);
