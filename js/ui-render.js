import { db } from "./firebase-config.js";
import { doc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentTimetableData = {}; 
let teacherMapGlobal = {};     
let allTimetablesCache = {};  

export function getCurrentTimetableData() { return currentTimetableData; }

function getSubjectColor(subjectId) {
    if (!subjectId) return "#ffffff";
    const sub = subjectId.toUpperCase();
    if (sub.includes("/") && (sub.includes("PI") || sub.includes("PM"))) return "#e2e8f0"; 
    const colorMap = {
        "BM": "#ffadad", "BI": "#a0c4ff", "MT": "#b9fbc0", "SN": "#bdb2ff",
        "PI": "#9bf6ff", "PM": "#fdffb6", "BA": "#ffc6ff", "PJ": "#ffd6a5",
        "PK": "#ffafcc", "PERHIMPUNAN": "#ffffff"
    };
    for (let key in colorMap) { if (sub.includes(key)) return colorMap[key]; }
    return "#f8fafc"; 
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
        teacherMapGlobal[t.id] = d.shortform || (d.name ? d.name.split(' ')[0] : t.id);
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
            let cellContent = "", bgColor = "#ffffff", isDraggable = false;

            if (item) {
                isDraggable = item.subjectId !== "PERHIMPUNAN";
                bgColor = getSubjectColor(item.subjectId);
                const teacherDisplay = item.teacherId.split("/").map(id => teacherMapGlobal[id] || id).join("/");
                const fontSize = item.subjectId.length > 10 ? "0.6rem" : "0.75rem";
                cellContent = `<div class="cell-box">
                    <span class="subject-name" style="font-size:${fontSize}; font-weight:bold; display:block;">${item.subjectId}</span>
                    <span class="teacher-name" style="font-size:0.55rem; opacity:0.8;">${teacherDisplay}</span>
                </div>`;
            }

            if (s > limit) html += `<td style="background:#f1f5f9;"></td>`;
            else html += `<td class="slot-cell" data-day="${day}" data-slot="${s}" style="background-color:${bgColor};"
                draggable="${isDraggable}" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)"
                ondrop="handleDrop(event, '${containerId}', '${classId}')">${cellContent}</td>`;
            
            if (s === 5) html += `<td class="rehat-cell">REHAT</td>`;
        }
        html += `</tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

function renderStatus(containerId, assigns) {
    const container = document.getElementById(containerId);
    let statusHtml = `<div class="status-panel" style="margin-top:20px; border:1px solid #ccc; padding:15px; border-radius:8px; background:#fff;">
        <h4 style="margin:0 0 10px 0;">Semakan Waktu Terisi:</h4><div style="display:flex; flex-wrap:wrap; gap:8px;">`;
    
    assigns.forEach(a => {
        let count = 0;
        Object.values(currentTimetableData).forEach(day => {
            Object.values(day).forEach(slot => {
                if (slot.subjectId && slot.subjectId.includes(a.subjectId)) count++;
            });
        });
        const required = a.periods || a.totalSlots;
        const color = count < required ? '#ef4444' : '#22c55e';
        statusHtml += `<div style="color:${color}; border:1px solid ${color}; padding:5px 10px; border-radius:6px; font-size:0.75rem; font-weight:bold; background:${color}10;">
            ${a.subjectId}: ${count}/${required}
        </div>`;
    });
    container.innerHTML += statusHtml + `</div></div>`;
}

window.handleDragStart = (e) => {
    const cell = e.target.closest(".slot-cell");
    e.dataTransfer.setData("fromDay", cell.dataset.day);
    e.dataTransfer.setData("fromSlot", cell.dataset.slot);
};
window.handleDragOver = (e) => e.preventDefault();
window.handleDrop = async (e, containerId, classId) => {
    e.preventDefault();
    const fromDay = e.dataTransfer.getData("fromDay");
    const fromSlot = parseInt(e.dataTransfer.getData("fromSlot"));
    const targetCell = e.target.closest(".slot-cell");
    if (!targetCell) return;
    const toDay = targetCell.dataset.day, toSlot = parseInt(targetCell.dataset.slot);
    
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
