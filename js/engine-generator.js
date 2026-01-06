import { db } from "./firebase-config.js";
import { collection, getDocs, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- KONFIGURASI WAKTU ---
const DAYS = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
const MAX_SLOTS = { 
    "Isnin": 9, 
    "Selasa": 9, 
    "Rabu": 9, 
    "Khamis": 9, 
    "Jumaat": 8 
};

let teachers = [], subjects = [], assignments = [], classesList = [];
let timetableResult = {}, teacherDailyLoad = {};

/**
 * Memulakan proses penjanaan jadual.
 */
export async function startGenerating() {
    console.log("Menjana Jadual: Mod Keutamaan Subjek Utama (BM, BI, MT, SN)...");
    timetableResult = {}; 
    teacherDailyLoad = {};
    
    try {
        await fetchData();
        for (const cls of classesList) {
            let classAssigns = [...assignments.filter(a => a.classId === cls.id)];
            
            // --- 0. LOGIK GABUNGAN CO-TEACHING ---
            const groupedBySubject = {};
            classAssigns.forEach(a => {
                const sid = a.subjectId;
                if (!groupedBySubject[sid]) {
                    groupedBySubject[sid] = { ...a };
                } else {
                    const currentTids = groupedBySubject[sid].teacherId.split('/');
                    if (!currentTids.includes(a.teacherId)) {
                        groupedBySubject[sid].teacherId += `/${a.teacherId}`;
                    }
                }
            });
            classAssigns = Object.values(groupedBySubject);

            // --- 1. LOGIK GABUNGAN PI / PM (Parallel) ---
            const piTasks = classAssigns.filter(a => a.subjectId.includes("PI") || a.subjectId.includes("PAI"));
            const pmTask = classAssigns.find(a => a.subjectId === "PM");

            if (piTasks.length > 0 && pmTask) {
                classAssigns = classAssigns.filter(a => 
                    !a.subjectId.includes("PI") && 
                    !a.subjectId.includes("PAI") && 
                    a.subjectId !== "PM"
                );
                
                let pmSlotsRemaining = pmTask.periods || pmTask.totalSlots;
                piTasks.forEach(pi => {
                    const piSlots = pi.periods || pi.totalSlots;
                    const slotsToMerge = Math.min(piSlots, pmSlotsRemaining);
                    if (slotsToMerge > 0) {
                        classAssigns.push({
                            subjectId: `${pi.subjectId} / PM`,
                            teacherId: `${pi.teacherId}/${pmTask.teacherId}`, 
                            totalSlots: slotsToMerge,
                            isDouble: pi.isDouble || false,
                            classId: cls.id,
                            isParallel: true
                        });
                        pmSlotsRemaining -= slotsToMerge;
                    }
                });
                if (pmSlotsRemaining > 0) {
                    classAssigns.push({ ...pmTask, totalSlots: pmSlotsRemaining });
                }
            }

            // Jana grid untuk kelas ini dengan sistem fasa
            timetableResult[cls.id] = await generateClassGrid(cls.id, classAssigns);
        }
        
        await saveToCloud();
        alert("Jadual Berjaya Dijana! Subjek utama (BM, BI, MT, SN) telah diutamakan.");
    } catch (e) { 
        console.error("Ralat Penjanaan:", e); 
        alert("Gagal menjana jadual: " + e.message); 
    }
}

async function fetchData() {
    const [tS, sS, aS, cS] = await Promise.all([
        getDocs(collection(db, "teachers")),
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "assignments")),
        getDocs(collection(db, "classes"))
    ]);
    teachers = tS.docs.map(d => ({id: d.id, ...d.data()}));
    subjects = sS.docs.map(d => ({id: d.id, ...d.data()}));
    assignments = aS.docs.map(d => ({id: d.id, ...d.data()}));
    classesList = cS.docs.map(d => ({id: d.id, ...d.data()}));
}

async function generateClassGrid(classId, classAssigns) {
    const grid = {};
    DAYS.forEach(d => grid[d] = {});
    
    // Tetapkan Perhimpunan dahulu
    grid["Rabu"][1] = { subjectId: "PERHIMPUNAN", teacherId: "SEMUA" };

    const formattedTasks = classAssigns.map(a => ({ 
        ...a, 
        left: parseInt(a.periods || a.totalSlots || 0) 
    }));

    // --- PENGASINGAN TUGASAN ---
    const corePriority = ["BM", "BI", "MT", "SN"];
    const coreTasks = formattedTasks.filter(t => corePriority.some(p => t.subjectId.toUpperCase().includes(p)));
    const otherTasks = formattedTasks.filter(t => !corePriority.some(p => t.subjectId.toUpperCase().includes(p)));

    // Fasa 1: Masukkan Subjek Utama Dahulu
    fillTasksToGrid(grid, coreTasks, classId);

    // Fasa 2: Masukkan Baki Subjek Lain
    fillTasksToGrid(grid, otherTasks, classId);

    return grid;
}

function fillTasksToGrid(grid, taskQueue, classId) {
    // Isih tugasan supaya yang ada 'Double Slot' didahulukan dalam fasa masing-masing
    taskQueue.sort((a, b) => (b.isDouble ? 1 : 0) - (a.isDouble ? 1 : 0));

    let safety = 0;
    while (taskQueue.some(a => a.left > 0) && safety < 100) {
        safety++;
        for (let day of DAYS) {
            for (let a of taskQueue) {
                if (a.left <= 0) continue;

                // Had harian
                let maxPerDay = (a.subjectId.includes("BM") || a.subjectId.includes("BI")) ? 4 : 3;
                let usedToday = Object.values(grid[day]).filter(s => s && s.subjectId === a.subjectId).length;
                if (usedToday >= maxPerDay) continue;

                let size = (a.isDouble && a.left >= 2) ? 2 : 1;
                let slot = findSlot(grid[day], day, size, a.teacherId, classId, a.subjectId);

                // Fallback jika slot berkembar gagal
                if (slot === -1 && size === 2) {
                    size = 1;
                    slot = findSlot(grid[day], day, size, a.teacherId, classId, a.subjectId);
                }

                if (slot !== -1) {
                    for (let i = 0; i < size; i++) {
                        grid[day][slot + i] = { 
                            subjectId: a.subjectId, 
                            teacherId: a.teacherId,
                            isParallel: a.isParallel || false 
                        };
                        updateTeacherLoad(a.teacherId, day, 1);
                    }
                    a.left -= size;
                }
            }
        }
    }
}

function findSlot(dayGrid, day, size, tId, cId, sId) {
    let max = MAX_SLOTS[day];
    if (sId && sId.toUpperCase().includes("PJ")) max = 5; // PJ Pagi Sahaja

    for (let s = 1; s <= max - (size - 1); s++) {
        if (s === 6 || (s < 6 && s + size > 6)) continue; 

        let free = true;
        for (let i = 0; i < size; i++) {
            if (dayGrid[s + i] || !isTeacherFree(tId, day, s + i)) {
                free = false; 
                break;
            }
        }
        if (free) return s;
    }
    return -1;
}

function isTeacherFree(tId, day, slot) {
    if (tId === "SEMUA") return true;
    const incomingTeachers = tId.split('/');
    
    for (let classId in timetableResult) {
        const cell = timetableResult[classId][day]?.[slot];
        if (cell && cell.teacherId) {
            const existingTeachers = cell.teacherId.split('/');
            if (incomingTeachers.some(id => existingTeachers.includes(id))) {
                return false;
            }
        }
    }
    return true;
}

function updateTeacherLoad(tId, day, count) {
    if (tId === "SEMUA") return;
    const ids = tId.split('/');
    ids.forEach(id => {
        if (!teacherDailyLoad[id]) teacherDailyLoad[id] = {};
        teacherDailyLoad[id][day] = (teacherDailyLoad[id][day] || 0) + count;
    });
}

async function saveToCloud() {
    const batch = writeBatch(db);
    for (let cId in timetableResult) {
        const ref = doc(db, "timetables", cId);
        batch.set(ref, timetableResult[cId]);
    }
    await batch.commit();
}
