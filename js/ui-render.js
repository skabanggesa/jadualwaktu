import { db } from "./firebase-config.js";
import { doc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentTimetableData = {}; 
let teacherMapGlobal = {};     
let allTimetablesCache = {};  

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
        html += `<th>${i}</th>`;
        if (i === 5) html += `<th class="rehat-col">REHAT</th>`;
    }
    html += `</tr></thead><tbody>`;

    days.forEach(day => {
        html += `<tr><td><strong>${day}</strong></td>`;
        for (let s = 1; s <= 9; s++) {
            const item = currentTimetableData[day]?.[s];
            let cellContent = "", bgColor = "#ffffff";

            if (item) {
                bgColor = item.subjectId.includes("PJ") ? "#ffd6a5" : "#f1f5f9";
                if (item.subjectId === "PERHIMPUNAN") bgColor = "#ffffff";
                
                const tNames = item.teacherId.split("/").map(id => teacherMapGlobal[id] || id).join("/");
                cellContent = `<div style="font-size:0.7rem;"><b>${item.subjectId}</b><br>${tNames}</div>`;
            }

            if ((day === "Jumaat" && s > 8) || s > 9) {
                html += `<td style="background:#eee;"></td>`;
            } else {
                html += `<td class="slot-cell" style="background-color:${bgColor}; border:1px solid #ddd; height:50px; text-align:center;">${cellContent}</td>`;
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
        <h4 style="margin:0 0 10px 0;">Semakan Jumlah Waktu:</h4><div style="display:flex; flex-wrap:wrap; gap:8px;">`;
    
    assigns.forEach(a => {
        let count = 0;
        Object.values(currentTimetableData).forEach(day => {
            Object.values(day).forEach(slot => {
                if (slot.subjectId === a.subjectId) count++;
            });
        });
        const color = count < (a.periods || a.totalSlots) ? 'red' : 'green';
        statusHtml += `<span style="padding:2px 6px; border:1px solid ${color}; color:${color}; border-radius:3px; font-size:0.8rem;">
            ${a.subjectId}: ${count}/${a.periods || a.totalSlots}
        </span>`;
    });
    container.innerHTML += statusHtml + `</div></div>`;
}
