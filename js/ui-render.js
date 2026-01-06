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
    const times = { 1:"07:10", 2:"07:40", 3:"08:10", 4:"08:40", 5:"09:10", 6:"10:00", 7:"10:30", 8:"11:00", 9:"11:30" };

    let html = `<table class="timetable-table"><thead><tr><th>Hari</th>`;
    for (let i = 1; i <= 9; i++) {
        html += `<th>${i}<br><small>${times[i]}</small></th>`;
        if (i === 5) html += `<th class="rehat-col">REHAT</th>`;
    }
    html += `</tr></thead><tbody>`;

    days.forEach(day => {
        let limit = (day === "Jumaat") ? 8 : 9;
        html += `<tr><td><strong>${day}</strong></td>`;
        for (let s = 1; s <= 9; s++) {
            const item = currentTimetableData[day]?.[s];
            let cellContent = "", bgColor = "#ffffff", isDraggable = false;

            if (item) {
                isDraggable = item.subjectId !== "PERHIMPUNAN";
                bgColor = getSubjectColor(item.subjectId);
                const tNames = item.teacherId.split("/").map(id => teacherMapGlobal[id] || id).join("/");
                cellContent = `<div class="cell-box">
                    <span class="subject-name" style="font-weight:bold; font-size:0.75rem;">${item.subjectId}</span><br>
                    <span class="teacher-name" style="font-size:0.6rem;">${tNames}</span>
                </div>`;
            }

            if (s > limit) {
                html += `<td style="background:#eee;"></td>`;
            } else {
                html += `<td class="slot-cell" data-day="${day}" data-slot="${s}" style="background-color:${bgColor}; border:1px solid #ddd; text-align:center; height:50px;"
                    draggable="${isDraggable}" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)"
                    ondrop="handleDrop(event, '${containerId}', '${classId}')">${cellContent}</td>`;
            }
            if (s === 5) html += `<td class="rehat-cell" style="background:#f8f9fa; font-weight:bold; text-align:center;">R</td>`;
        }
        html += `</tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

function renderStatus(containerId, assigns) {
    const container = document.getElementById(containerId);
    let statusHtml = `<div style="margin-top:20px; padding:10px; background:#fff; border:1px solid #ddd; border-radius:5px;">
        <h4 style="margin:0 0 10px 0;">Status Pengisian:</h4><div style="display:flex; flex-wrap:wrap; gap:8px;">`;
    
    assigns.forEach(a => {
        let count = 0;
        Object.values(currentTimetableData).forEach(day => {
            Object.values(day).forEach(slot => {
                if (slot.subjectId === a.subjectId) count++;
            });
        });
        const color = count < (a.periods || a.totalSlots) ? 'red' : 'green';
        statusHtml += `<span style="border:1px solid ${color}; color:${color}; padding:2px 6px; border-radius:3px; font-size:0.75rem;">
            ${a.subjectId}: ${count}/${a.periods || a.totalSlots}
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
    }
};

window.handleDragOver = (e) => e.preventDefault();

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
    
    drawGrid(containerId, classId);
};
