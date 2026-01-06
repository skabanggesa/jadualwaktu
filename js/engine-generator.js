import { db } from "./firebase-config.js";
import { collection, getDocs, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DAYS = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
const MAX_SLOTS = { "Isnin": 9, "Selasa": 9, "Rabu": 9, "Khamis": 9, "Jumaat": 8 };

let teachers = [], subjects = [], assignments = [], classesList = [];
let timetableResult = {}, teacherDailyLoad = {};

// Fungsi bantuan untuk merawakkan senarai (Fisher-Yates Shuffle)
const shuffle = (array) => {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
};

export async function startGenerating() {
    console.log("Memulakan Penjanaan: Fasa Keutamaan & Logik Pengisian Maksimum...");
    timetableResult = {}; 
    teacherDailyLoad = {};
    
    try {
        await fetchData();
        
        // 1. Rawakkan urutan kelas supaya pengagihan guru adil
        const randomizedClasses = shuffle([...classesList]);

        for (const cls of randomizedClasses) {
            let classAssigns = [...assignments.filter(a => a.classId === cls.id)];
            
            // --- 2. LOGIK GABUNGAN (PI/PM & CO-TEACHING) ---
            classAssigns = prepareAssignments(classAssigns);

            // --- 3. LOGIK CUBAAN SEMULA (RETRY) ---
            let isComplete = false;
            let attempts = 0;
            let bestGrid = null;
            let minLeftover = 999;

            while (!isComplete && attempts < 10) {
                attempts++;
                const tempGrid = await generateClassGrid(cls.id, JSON.parse(JSON.stringify(classAssigns)));
                
                // Kira baki waktu yang gagal dimasukkan
                const currentLeftover = classAssigns.reduce((sum, a) => sum + (a.left || 0), 0);
                
                if (currentLeftover === 0) {
                    timetableResult[cls.id] = tempGrid;
                    isComplete = true;
                } else if (currentLeftover < minLeftover) {
                    minLeftover = currentLeftover;
                    bestGrid = tempGrid;
                }
            }

            if (!isComplete) {
                timetableResult[cls.id] = bestGrid;
                console.warn(`Kelas ${cls.id} tidak 100% lengkap (Baki: ${minLeftover} slot).`);
            }
        }
        
        await saveToCloud();
        alert("Jadual Berjaya Dijana! Sila semak status pengisian di bawah jadual.");
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

function prepareAssignments(assigns) {
    // Gabung Co-Teaching (Subjek sama, guru berbeza)
    const grouped = {};
    assigns.forEach(a => {
        if (!grouped[a.subjectId]) grouped[a.subjectId] = { ...a };
        else if (!grouped[a.subjectId].teacherId.includes(a.teacherId)) {
            grouped[a.subjectId].teacherId += `/${a.teacherId}`;
        }
    });
    let processed = Object.values(grouped);

    // Gabung Parallel (PI / PM)
    const piTasks = processed.filter(a => a.subjectId.includes("PI") || a.subjectId.includes("PAI"));
    const pmTask = processed.find(a => a.subjectId === "PM");

    if (piTasks.length > 0 && pmTask) {
        processed = processed.filter(a => !a.subjectId.includes("PI") && !a.subjectId.includes("PAI") && a.subjectId !== "PM");
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

    const corePriority = ["BM", "BI", "MT", "SN"];
    const coreTasks = classAssigns.filter(t => corePriority.some(p => t.subjectId.toUpperCase().includes(p)));
    const otherTasks = classAssigns.filter(t => !corePriority.some(p => t.subjectId.toUpperCase().includes(p)));

    // Fasa 1: Subjek Utama (Ketat)
    fillTasksToGrid(grid, shuffle(coreTasks), classId, false);
    // Fasa 2: Subjek Lain (Longgar)
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

                if (slot === -1 && size === 2) { // Fallback ke Single
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
    if (sId && sId.toUpperCase().includes("PJ")) max = 5; // Had PJ Pagi

    for (let s = 1; s <= max - (size - 1); s++) {
        if (s === 6 || (s < 6 && s + size > 6)) continue; // Rehat
        
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
