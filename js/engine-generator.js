import { db } from "./firebase-config.js";
import { collection, getDocs, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- KONFIGURASI WAKTU TAHAP 1 ---
const DAYS = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
// Isnin-Khamis: 9 slot (Tamat 12:00), Jumaat: 8 slot (Tamat 11:30)
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
 * Memulakan proses penjanaan jadual untuk semua kelas.
 */
export async function startGenerating() {
    console.log("Menjana Jadual...");
    timetableResult = {}; 
    teacherDailyLoad = {};
    
    try {
        await fetchData();
        for (const cls of classesList) {
            let classAssigns = [...assignments.filter(a => a.classId === cls.id)];
            
            // --- LOGIK GABUNGAN PI / PM ---
            const piTasks = classAssigns.filter(a => a.subjectId.startsWith("PI"));
            const pmTask = classAssigns.find(a => a.subjectId === "PM");

            if (piTasks.length > 0 && pmTask) {
                // Keluarkan PI/PM asal untuk digantikan dengan versi gabungan
                classAssigns = classAssigns.filter(a => !a.subjectId.startsWith("PI") && a.subjectId !== "PM");
                let pmSlotsRemaining = pmTask.totalSlots;

                piTasks.forEach(pi => {
                    const slotsToTake = Math.min(pi.totalSlots, pmSlotsRemaining);
                    if (slotsToTake > 0) {
                        classAssigns.push({
                            subjectId: `${pi.subjectId} / PM`,
                            teacherId: `${pi.teacherId}/${pmTask.teacherId}`,
                            totalSlots: slotsToTake,
                            isDouble: pi.isDouble,
                            classId: cls.id
                        });
                        pmSlotsRemaining -= slotsToTake;
                    }
                });
                
                // Jika masih ada baki slot PM yang tidak digabungkan dengan mana-mana PI
                if (pmSlotsRemaining > 0) {
                    classAssigns.push({ ...pmTask, totalSlots: pmSlotsRemaining });
                }
            }

            // Jana susunan untuk kelas ini
            timetableResult[cls.id] = await generateClassGrid(cls.id, classAssigns);
        }
        
        await saveToCloud();
        alert("Jadual Waktu Berjaya Dijana!");
    } catch (e) { 
        console.error("Ralat Penjanaan:", e); 
        alert("Gagal menjana jadual: " + e.message); 
    }
}

/**
 * Mengambil data mentah dari Firestore.
 */
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

/**
 * Logik utama untuk menyusun subjek ke dalam grid 5 hari.
 */
async function generateClassGrid(classId, classAssigns) {
    const grid = {};
    DAYS.forEach(d => grid[d] = {});
    
    // PERHIMPUNAN: Tetap pada hari Rabu, Slot 1
    grid["Rabu"][1] = { subjectId: "PERHIMPUNAN", teacherId: "SEMUA" };

    // Susun tugasan: Subjek 'isDouble' diutamakan dahulu supaya senang cari ruang kosong
    let queue = classAssigns.map(a => ({ ...a, left: a.totalSlots }))
                .sort((a, b) => (b.isDouble ? 1 : 0) - (a.isDouble ? 1 : 0));

    let safetyCounter = 0;
    while (queue.some(a => a.left > 0) && safetyCounter < 1000) {
        safetyCounter++;
        for (let day of DAYS) {
            for (let a of queue) {
                if (a.left <= 0) continue;
                
                // Had: Maksimum 3 slot subjek yang sama dalam satu hari
                let usedToday = Object.values(grid[day]).filter(s => s.subjectId === a.subjectId).length;
                if (usedToday >= 3) continue;

                // Tentukan saiz: Guna 2 slot (double) jika masih banyak baki, jika tidak guna 1.
                let size = (a.isDouble && a.left >= 2) ? 2 : 1;

                let slot = findSlot(grid[day], day, size, a.teacherId, classId);
                if (slot !== -1) {
                    for (let i = 0; i < size; i++) {
                        grid[day][slot + i] = { subjectId: a.subjectId, teacherId: a.teacherId };
                        updateTeacherLoad(a.teacherId, day, 1);
                    }
                    a.left -= size;
                }
            }
        }
    }
    return grid;
}

/**
 * Mencari slot kosong yang tidak bertembung dengan guru atau waktu rehat.
 */
function findSlot(dayGrid, day, size, tId, cId) {
    const max = MAX_SLOTS[day];
    
    for (let s = 1; s <= max - (size - 1); s++) {
        // Logik Rehat: 
        // 1. Slot tidak boleh bermula di waktu rehat (selepas slot 5).
        // 2. Jika subjek berkembar (size 2), ia tidak boleh bermula di slot 5 
        //    kerana slot seterusnya (slot 6) dipisahkan oleh rehat.
        if (s === 5 && size > 1) continue; 
        if (s > 5 && s <= 5) continue; // (Keselamatan tambahan)

        let free = true;
        for (let i = 0; i < size; i++) {
            // Periksa jika grid kelas sudah terisi atau guru sedang mengajar di kelas lain
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
 * Semakan pertembungan guru di kelas-kelas lain.
 */
function isTeacherFree(tId, day, slot) {
    const ids = tId.split('/'); 
    for (let classId in timetableResult) {
        const cell = timetableResult[classId][day]?.[slot];
        if (cell) {
            const cellTids = cell.teacherId.split('/');
            // Jika mana-mana guru dalam gabungan sedang mengajar, kembalikan false
            if (ids.some(id => cellTids.includes(id))) return false;
        }
    }
    return true;
}

/**
 * Mengemas kini statistik beban kerja guru secara harian.
 */
function updateTeacherLoad(tId, day, count) {
    const ids = tId.split('/');
    ids.forEach(id => {
        if (!teacherDailyLoad[id]) teacherDailyLoad[id] = {};
        teacherDailyLoad[id][day] = (teacherDailyLoad[id][day] || 0) + count;
    });
}

/**
 * Menyimpan hasil penjanaan ke Firestore.
 */
async function saveToCloud() {
    const batch = writeBatch(db);
    for (let cId in timetableResult) {
        const ref = doc(db, "timetables", cId);
        batch.set(ref, timetableResult[cId]);
    }
    await batch.commit();
}