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
    console.log("Menjana Jadual dengan Logik PAI/PM & Co-Teaching...");
    timetableResult = {}; 
    teacherDailyLoad = {};
    
    try {
        await fetchData();
        for (const cls of classesList) {
            let classAssigns = [...assignments.filter(a => a.classId === cls.id)];
            
            // --- 1. LOGIK GABUNGAN PAI (QURAN/ULUM) & PM ---
            // Mencari tugasan yang mengandungi PAI atau PM
            const piTasks = classAssigns.filter(a => a.subjectId.includes("PAI"));
            const pmTask = classAssigns.find(a => a.subjectId === "PM");

            if (piTasks.length > 0 && pmTask) {
                // Keluarkan rekod asal untuk digantikan dengan versi gabungan (Parallel)
                classAssigns = classAssigns.filter(a => !a.subjectId.includes("PAI") && a.subjectId !== "PM");
                
                let pmSlotsRemaining = pmTask.periods || pmTask.totalSlots;

                piTasks.forEach(pi => {
                    const piSlots = pi.periods || pi.totalSlots;
                    const slotsToMerge = Math.min(piSlots, pmSlotsRemaining);
                    
                    if (slotsToMerge > 0) {
                        classAssigns.push({
                            subjectId: `${pi.subjectId} / PM`,
                            teacherId: `${pi.teacherId}/${pmTask.teacherId}`, // Gabung ID Guru
                            totalSlots: slotsToMerge,
                            isDouble: pi.isDouble || false,
                            classId: cls.id,
                            isParallel: true
                        });
                        pmSlotsRemaining -= slotsToMerge;
                    }
                });
                
                // Jika ada baki slot PM yang tidak selari dengan mana-mana PAI
                if (pmSlotsRemaining > 0) {
                    classAssigns.push({ ...pmTask, totalSlots: pmSlotsRemaining });
                }
            }

            // Jana grid untuk kelas ini
            timetableResult[cls.id] = await generateClassGrid(cls.id, classAssigns);
        }
        
        await saveToCloud();
        alert("Jadual Waktu (Versi PAI/PM Selari) Berjaya Dijana!");
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
    
    // PERHIMPUNAN: Tetap Rabu Slot 1
    grid["Rabu"][1] = { subjectId: "PERHIMPUNAN", teacherId: "SEMUA" };

    let queue = classAssigns.map(a => ({ ...a, left: (a.periods || a.totalSlots) }))
                .sort((a, b) => (b.isDouble ? 1 : 0) - (a.isDouble ? 1 : 0));

    let safety = 0;
    while (queue.some(a => a.left > 0) && safety < 1000) {
        safety++;
        for (let day of DAYS) {
            for (let a of queue) {
                if (a.left <= 0) continue;
                
                let usedToday = Object.values(grid[day]).filter(s => s.subjectId === a.subjectId).length;
                if (usedToday >= 3) continue;

                let size = (a.isDouble && a.left >= 2) ? 2 : 1;
                let slot = findSlot(grid[day], day, size, a.teacherId, classId);

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

function findSlot(dayGrid, day, size, tId, cId) {
    const max = MAX_SLOTS[day];
    for (let s = 1; s <= max - (size - 1); s++) {
        // Langkau waktu rehat (Slot 6 biasanya rehat)
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

/**
 * --- 2. SEMAKAN PERTEMBUNGAN CO-TEACHING ---
 * Memastikan semua guru dalam senarai (split by '/') tidak sibuk.
 */
function isTeacherFree(tId, day, slot) {
    if (tId === "SEMUA") return true;
    const incomingTeachers = tId.split('/'); // Pecahkan ID jika ada ramai guru
    
    for (let classId in timetableResult) {
        const cell = timetableResult[classId][day]?.[slot];
        if (cell && cell.teacherId) {
            const existingTeachers = cell.teacherId.split('/');
            // Jika ada mana-mana guru yang bertembung
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
