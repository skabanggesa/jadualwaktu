import { db } from "./firebase-config.js";
import { collection, getDocs, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DAYS = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
const MAX_SLOTS = { "Isnin": 9, "Selasa": 9, "Rabu": 9, "Khamis": 9, "Jumaat": 8 };

let teachers = [], subjects = [], assignments = [], classesList = [];
let timetableResult = {}, teacherDailyLoad = {};

const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

export async function startGenerating() {
    console.log("Menjana Jadual: Mengoptimumkan Slot 6 & Keutamaan Subjek...");
    timetableResult = {}; 
    teacherDailyLoad = {};
    
    try {
        await fetchData();
        const randomizedClasses = shuffle([...classesList]);

        for (const cls of randomizedClasses) {
            let classAssigns = [...assignments.filter(a => a.classId === cls.id)];
            
            // --- LOGIK GABUNGAN PI / PM ---
            classAssigns = prepareAssignments(classAssigns, cls.id);

            // --- LOGIK CUBAAN SEMULA ---
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
        alert("Penjanaan Selesai! Slot 6 kini telah digunakan.");
    } catch (e) { 
        console.error("Ralat:", e); 
        alert("Gagal: " + e.message); 
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

function prepareAssignments(assigns, classId) {
    const grouped = {};
    assigns.forEach(a => {
        if (!grouped[a.subjectId]) grouped[a.subjectId] = { ...a };
        else if (!grouped[a.subjectId].teacherId.includes(a.teacherId)) {
            grouped[a.subjectId].teacherId += `/${a.teacherId}`;
        }
    });
    let processed = Object.values(grouped);

    // Baiki pengesanan PI atau PAI
    const piTasks = processed.filter(a => a.subjectId.toUpperCase().includes("PI") || a.subjectId.toUpperCase().includes("PAI"));
    const pmTask = processed.find(a => a.subjectId === "PM");

    if (piTasks.length > 0 && pmTask) {
        processed = processed.filter(a => !piTasks.includes(a) && a.subjectId !== "PM");
        let pmLeft = pmTask.periods || pmTask.totalSlots;
        piTasks.forEach(pi => {
            const piVal = pi.periods || pi.totalSlots;
            const merge = Math.min(piVal, pmLeft);
            if (merge > 0) {
                processed.push({
                    subjectId: `${pi.subjectId} / PM`,
                    teacherId: `${pi.teacherId}/${pmTask.teacherId}`,
                    totalSlots: merge,
                    isDouble: pi.isDouble,
                    classId: classId,
                    isParallel: true
                });
                pmLeft -= merge;
            }
        });
        if (pmLeft > 0) processed.push({ ...pmTask, totalSlots: pmLeft });
    }
    return processed;
}

async function generateClassGrid(classId, classAssigns) {
    const grid = {};
    DAYS.forEach(d => grid[d] = {});
    grid["Rabu"][1] = { subjectId: "PERHIMPUNAN", teacherId: "SEMUA" };

    classAssigns.forEach(a => a.left = parseInt(a.periods || a.totalSlots || 0));

    // Pengasingan Utama
    const corePriority = ["BM", "BI", "MT", "SN"];
    const coreTasks = classAssigns.filter(t => corePriority.some(p => t.subjectId.toUpperCase().includes(p)));
    const otherTasks = classAssigns.filter(t => !corePriority.some(p => t.subjectId.toUpperCase().includes(p)));

    fillTasksToGrid(grid, shuffle(coreTasks), classId, false);
    fillTasksToGrid(grid, shuffle(otherTasks), classId, true);

    return grid;
}

function fillTasksToGrid(grid, taskQueue, classId, relax) {
    taskQueue.sort((a, b) => (b.isDouble ? 1 : 0) - (a.isDouble ? 1 : 0));

    let safety = 0;
    while (taskQueue.some(a => a.left > 0) && safety < 50) {
        safety++;
        for (let day of shuffle([...DAYS])) {
            for (let a of taskQueue) {
                if (a.left <= 0) continue;

                let maxDaily = (a.subjectId.includes("BM") || a.subjectId.includes("BI")) ? 4 : 3;
                if (relax) maxDaily = 5;

                let usedToday = Object.values(grid[day]).filter(s => s && s.subjectId === a.subjectId).length;
                if (usedToday >= maxDaily) continue;

                let size = (a.isDouble && a.left >= 2) ? 2 : 1;
                let slot = findSlot(grid[day], day, size, a.teacherId, classId, a.subjectId);

                if (slot === -1 && size === 2) {
                    size = 1;
                    slot = findSlot(grid[day], day, size, a.teacherId, classId, a.subjectId);
                }

                if (slot !== -1) {
                    for (let i = 0; i < size; i++) {
                        grid[day][slot + i] = { subjectId: a.subjectId, teacherId: a.teacherId, isParallel: a.isParallel || false };
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
    // PJ mesti sebelum rehat (Pagi)
    if (sId && sId.toUpperCase().includes("PJ")) max = 5;

    for (let s = 1; s <= max - (size - 1); s++) {
        // PERBAIKAN: Hanya langkau waktu rehat sebenar (bukan slot 6)
        // Di sekolah anda, rehat adalah SEBELUM slot 6. Maka slot 6 boleh digunakan.
        // Kita hanya perlu pastikan slot yang dipilih tidak bertindih dengan data sedia ada.
        
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
    for (let cId in timetableResult) {
        const cell = timetableResult[cId][day]?.[slot];
        if (cell && cell.teacherId) {
            const existing = cell.teacherId.split('/');
            if (incoming.some(id => existing.includes(id))) return false;
        }
    }
    return true;
}

function updateTeacherLoad(tId, day, count) {
    if (tId === "SEMUA") return;
    tId.split('/').forEach(id => {
        if (!teacherDailyLoad[id]) teacherDailyLoad[id] = {};
        teacherDailyLoad[id][day] = (teacherDailyLoad[id][day] || 0) + count;
    });
}

async function saveToCloud() {
    const batch = writeBatch(db);
    for (let cId in timetableResult) {
        batch.set(doc(db, "timetables", cId), timetableResult[cId]);
    }
    await batch.commit();
}
