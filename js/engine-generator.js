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
    console.log("Menjana Jadual: Mengoptimumkan pengisian waktu...");
    timetableResult = {}; 
    teacherDailyLoad = {};
    
    try {
        await fetchData();
        
        // Isih kelas supaya penjanaan lebih adil (optional)
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

            // Jana grid untuk kelas ini
            timetableResult[cls.id] = await generateClassGrid(cls.id, classAssigns);
        }
        
        await saveToCloud();
        alert("Jadual Berjaya Dijana! Semakan jumlah waktu dilakukan.");
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
    
    // 1. Perhimpunan
    grid["Rabu"][1] = { subjectId: "PERHIMPUNAN", teacherId: "SEMUA" };

    let queue = classAssigns.map(a => ({ 
        ...a, 
        left: parseInt(a.periods || a.totalSlots || 0) 
    })).sort((a, b) => (b.isDouble ? 1 : 0) - (a.isDouble ? 1 : 0));

    // Iterasi berperingkat untuk memastikan pengisian maksimum
    let safety = 0;
    while (queue.some(a => a.left > 0) && safety < 50) {
        safety++;
        for (let day of DAYS) {
            for (let a of queue) {
                if (a.left <= 0) continue;

                // Had harian: Maksimum 3 slot subjek sama sehari kecuali BM/BI yang banyak waktu
                let maxPerDay = (a.subjectId.includes("BM") || a.subjectId.includes("BI")) ? 4 : 3;
                let usedToday = Object.values(grid[day]).filter(s => s.subjectId === a.subjectId).length;
                if (usedToday >= maxPerDay) continue;

                // CUBA 1: Slot Berkembar (jika isDouble)
                let size = (a.isDouble && a.left >= 2) ? 2 : 1;
                let slot = findSlot(grid[day], day, size, a.teacherId, classId, a.subjectId);

                // CUBA 2: Jika Double gagal, cuba slot tunggal (Fallback)
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
    return grid;
}

function findSlot(dayGrid, day, size, tId, cId, sId) {
    let max = MAX_SLOTS[day];
    
    // Kekangan PJ: Mesti Pagi (Slot 1-5)
    if (sId && sId.toUpperCase().includes("PJ")) {
        max = 5; 
    }

    for (let s = 1; s <= max - (size - 1); s++) {
        // Langkau waktu rehat (Slot 6)
        if (s === 6 || (s < 6 && s + size > 6)) continue; 

        let free = true;
        for (let i = 0; i < size; i++) {
            if (dayGrid[s + i] || !isTeacherFree(tId, day, s + i, cId)) {
                free = false; 
                break;
            }
        }
        if (free) return s;
    }
    return -1;
}

function isTeacherFree(tId, day, slot, currentClassId) {
    if (tId === "SEMUA") return true;
    const incomingTeachers = tId.split('/');
    
    for (let classId in timetableResult) {
        // Kita hanya semak pertembungan di kelas LAIN
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
