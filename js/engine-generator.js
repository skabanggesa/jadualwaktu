/**
 * SISTEM PENGURUSAN JADUAL WAKTU (ASG VER 1.0)
 * Fail: engine-generator.js
 * Kemaskini: Sokongan 10 Slot Tahap 2
 */

import { db } from "./firebase-config.js";
import { collection, getDocs, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DAYS = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];

let teachers = [], assignments = [], classesList = [];
let timetableResult = {}; 

const shuffle = (array) => {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
};

// Fungsi untuk menentukan had slot secara dinamik
function getMaxSlots(day, classId) {
    const isTahap2 = ["4", "5", "6"].includes(classId.charAt(0));
    
    if (day === "Jumaat") return 8; // Semua tahap tamat 11:30
    if (day === "Khamis") return 9; // Semua tahap tamat 12:00
    
    // Isnin, Selasa, Rabu
    if (isTahap2) return 10; // Tahap 2 tamat 12:30
    return 9; // Tahap 1 tamat 12:00
}

export async function startGenerating() {
    console.log("Menjana Jadual: Mengira slot Tahap 1 & 2...");
    timetableResult = {}; 
    
    try {
        await fetchData();
        const randomizedClasses = shuffle([...classesList]);

        for (const cls of randomizedClasses) {
            let classAssigns = prepareAssignments([...assignments.filter(a => a.classId === cls.id)]);
            
            let isComplete = false;
            let attempts = 0;
            let bestGrid = null;
            let minLeftover = 999;

            while (!isComplete && attempts < 15) {
                attempts++;
                const tempGrid = await generateClassGrid(cls.id, JSON.parse(JSON.stringify(classAssigns)));
                const currentLeftover = classAssigns.reduce((sum, a) => sum + (a.left || 0), 0);
                
                if (currentLeftover === 0) {
                    timetableResult[cls.id] = tempGrid;
                    isComplete = true;
                } else if (currentLeftover < minLeftover) {
                    minLeftover = currentLeftover;
                    bestGrid = tempGrid;
                }
            }
            if (!isComplete) timetableResult[cls.id] = bestGrid;
        }
        await saveToCloud();
        alert("Jadual Berjaya Dijana termasuk Slot 10 untuk Tahap 2!");
    } catch (e) { console.error(e); }
}

async function fetchData() {
    const [tS, aS, cS] = await Promise.all([
        getDocs(collection(db, "teachers")),
        getDocs(collection(db, "assignments")),
        getDocs(collection(db, "classes"))
    ]);
    teachers = tS.docs.map(d => ({id: d.id, ...d.data()}));
    assignments = aS.docs.map(d => ({id: d.id, ...d.data()}));
    classesList = cS.docs.map(d => ({id: d.id, ...d.data()}));
}

function prepareAssignments(assigns) {
    const grouped = {};
    assigns.forEach(a => {
        if (!grouped[a.subjectId]) {
            grouped[a.subjectId] = { ...a, left: parseInt(a.periods || a.totalSlots || 0) };
        } else if (!grouped[a.subjectId].teacherId.includes(a.teacherId)) {
            grouped[a.subjectId].teacherId += `/${a.teacherId}`;
        }
    });
    return Object.values(grouped);
}

async function generateClassGrid(classId, classAssigns) {
    const grid = {};
    DAYS.forEach(d => grid[d] = {});
    
    // Perhimpunan tetap slot 1 Rabu
    grid["Rabu"][1] = { subjectId: "PERHIMPUNAN", teacherId: "SEMUA" };

    // Fasa 1: Subjek Utama + PJ (Priority)
    const corePriority = ["BM", "BI", "MT", "SN", "PJ"]; 
    const coreTasks = classAssigns.filter(t => corePriority.some(p => t.subjectId.toUpperCase().includes(p)));
    const otherTasks = classAssigns.filter(t => !corePriority.some(p => t.subjectId.toUpperCase().includes(p)));

    fillTasksToGrid(grid, shuffle(coreTasks), classId, false);
    fillTasksToGrid(grid, shuffle(otherTasks), classId, true);

    return grid;
}

function fillTasksToGrid(grid, taskQueue, classId, relax) {
    taskQueue.sort((a, b) => (b.isDouble ? 1 : 0) - (a.isDouble ? 1 : 0));

    let safety = 0;
    while (taskQueue.some(a => a.left > 0) && safety < 60) {
        safety++;
        for (let day of shuffle([...DAYS])) {
            for (let a of taskQueue) {
                if (a.left <= 0) continue;

                let size = (a.isDouble && a.left >= 2) ? 2 : 1;
                
                // Cuba ikut kekangan (PJ pagi dsb)
                let slot = findSlot(grid[day], day, size, a.teacherId, classId, a.subjectId, false);

                // Jika gagal, cuba tanpa had pagi (ignoreStrict)
                if (slot === -1) {
                    slot = findSlot(grid[day], day, size, a.teacherId, classId, a.subjectId, true);
                }

                if (slot !== -1) {
                    for (let i = 0; i < size; i++) {
                        grid[day][slot + i] = { subjectId: a.subjectId, teacherId: a.teacherId };
                    }
                    a.left -= size;
                }
            }
        }
    }
}

function findSlot(dayGrid, day, size, tId, cId, sId, ignoreStrict) {
    let max = getMaxSlots(day, cId);
    
    // Syarat PJ: Cuba slot 1-5 dahulu jika tidak 'ignoreStrict'
    if (!ignoreStrict && sId && sId.toUpperCase().includes("PJ")) {
        max = 5; 
    }

    for (let s = 1; s <= max - (size - 1); s++) {
        // Jangan langgar waktu rehat (Slot 5 & 6)
        if (s === 5 && size > 1) continue; 

        let free = true;
        for (let i = 0; i < size; i++) {
            if (dayGrid[s + i] || !isTeacherFree(tId, day, s + i)) {
                free = false; break;
            }
        }
        if (free) return s;
    }
    return -1;
}

function isTeacherFree(tId, day, slot) {
    if (tId === "SEMUA") return true;
    const incoming = tId.split('/');
    for (let cid in timetableResult) {
        const cell = timetableResult[cid][day]?.[slot];
        if (cell && cell.teacherId) {
            const existing = cell.teacherId.split('/');
            if (incoming.some(id => existing.includes(id))) return false;
        }
    }
    return true;
}

async function saveToCloud() {
    const batch = writeBatch(db);
    for (let cId in timetableResult) {
        batch.set(doc(db, "timetables", cId), timetableResult[cId]);
    }
    await batch.commit();
}
