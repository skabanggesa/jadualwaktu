/**
 * SISTEM PENGURUSAN JADUAL WAKTU (ASG VER 1.0)
 * Fail: engine-generator.js
 */

import { db } from "./firebase-config.js";
import { 
    collection, 
    getDocs, 
    writeBatch, 
    doc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- KONFIGURASI WAKTU ---
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
    console.log("Memulakan proses penjanaan...");
    timetableResult = {}; 
    teacherDailyLoad = {};
    
    try {
        await fetchData();

        if (assignments.length === 0) {
            throw new Error("Tiada data agihan tugas (assignments) ditemui dalam Cloud!");
        }

        for (const cls of classesList) {
            let classAssigns = [...assignments.filter(a => a.classId === cls.id)];
            
            // --- LOGIK GABUNGAN PI (Pendidikan Islam) / PM (Pendidikan Moral) ---
            const piTasks = classAssigns.filter(a => a.subjectId.toUpperCase().startsWith("PI"));
            const pmTask = classAssigns.find(a => a.subjectId.toUpperCase() === "PM");

            if (piTasks.length > 0 && pmTask) {
                // Keluarkan PI/PM asal untuk digantikan dengan versi gabungan
                classAssigns = classAssigns.filter(a => 
                    !a.subjectId.toUpperCase().startsWith("PI") && 
                    a.subjectId.toUpperCase() !== "PM"
                );
                
                let pmSlotsRemaining = parseInt(pmTask.periods) || 0;

                piTasks.forEach(pi => {
                    const piPeriods = parseInt(pi.periods) || 0;
                    const slotsToTake = Math.min(piPeriods, pmSlotsRemaining);
                    
                    if (slotsToTake > 0) {
                        classAssigns.push({
                            subjectId: `${pi.subjectId} / PM`,
                            teacherId: `${pi.teacherId}/${pmTask.teacherId}`,
                            periods: slotsToTake,
                            isDouble: pi.isDouble || false,
                            classId: cls.id
                        });
                        pmSlotsRemaining -= slotsToTake;
                    }
                });
                
                // Jika masih ada baki slot PM yang tidak digabungkan
                if (pmSlotsRemaining > 0) {
                    classAssigns.push({ ...pmTask, periods: pmSlotsRemaining });
                }
            }

            // Jana grid jadual untuk kelas semasa
            timetableResult[cls.id] = await generateClassGrid(cls.id, classAssigns);
        }
        
        await saveToCloud();
        alert("Jadual Waktu Berjaya Dijana dan Disimpan ke Cloud!");
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
 * Logik utama untuk menyusun subjek ke dalam grid 5 hari bagi satu kelas.
 */
async function generateClassGrid(classId, classAssigns) {
    const grid = {};
    DAYS.forEach(d => grid[d] = {});
    
    // PERHIMPUNAN: Tetap pada hari Rabu, Slot 1
    grid["Rabu"][1] = { subjectId: "PERHIMPUNAN", teacherId: "SEMUA" };

    // Sediakan giliran (queue) berdasarkan baki slot (periods)
    // Utamakan subjek berkembar (isDouble)
    let queue = classAssigns.map(a => ({ 
        ...a, 
        left: parseInt(a.periods) || 0 
    })).sort((a, b) => (b.isDouble ? 1 : 0) - (a.isDouble ? 1 : 0));

    let safetyCounter = 0;
    // Teruskan selagi ada subjek yang belum habis disusun
    while (queue.some(a => a.left > 0) && safetyCounter < 2000) {
        safetyCounter++;
        for (let day of DAYS) {
            for (let a of queue) {
                if (a.left <= 0) continue;
                
                // Had: Maksimum 3 slot subjek yang sama dalam satu hari (kecuali PI/PM gabungan)
                let usedToday = Object.values(grid[day]).filter(s => s.subjectId === a.subjectId).length;
                if (usedToday >= 3) continue;

                // Tentukan saiz slot: 2 (double) atau 1 (single)
                let size = (a.isDouble && a.left >= 2) ? 2 : 1;

                let slot = findSlot(grid[day], day, size, a.teacherId, classId);
                
                if (slot !== -1) {
                    for (let i = 0; i < size; i++) {
                        grid[day][slot + i] = { 
                            subjectId: a.subjectId, 
                            teacherId: a.teacherId 
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

/**
 * Mencari slot kosong yang tidak bertembung dengan guru, kelas, atau waktu rehat.
 */
function findSlot(dayGrid, day, size, tId, cId) {
    const max = MAX_SLOTS[day];
    
    for (let s = 1; s <= max - (size - 1); s++) {
        // Logik Rehat: Slot 6 adalah rehat (10:00 - 10:30)
        // 1. Subjek tidak boleh bermula pada slot rehat (Slot 6).
        // 2. Jika subjek berkembar (size 2), ia tidak boleh bermula pada slot 5
        //    kerana ia akan melangkau ke waktu rehat.
        if (s === 6) continue;
        if (s === 5 && size > 1) continue; 

        let isFree = true;
        for (let i = 0; i < size; i++) {
            let currentSlot = s + i;
            // Periksa jika grid kelas sudah terisi atau guru sedang mengajar di kelas lain
            if (dayGrid[currentSlot] || !isTeacherFree(tId, day, currentSlot)) {
                isFree = false; 
                break;
            }
        }
        if (isFree) return s;
    }
    return -1;
}

/**
 * Semakan pertembungan guru di semua kelas pada waktu yang sama.
 */
function isTeacherFree(tId, day, slot) {
    if (!tId || tId === "SEMUA") return true;

    const idsToCheck = tId.split('/'); 
    for (let otherClassId in timetableResult) {
        const cell = timetableResult[otherClassId][day]?.[slot];
        if (cell && cell.teacherId) {
            const cellTids = cell.teacherId.split('/');
            // Jika mana-mana guru dalam gabungan sedang mengajar di kelas lain
            if (idsToCheck.some(id => cellTids.includes(id))) return false;
        }
    }
    return true;
}

/**
 * Mengemas kini beban kerja harian guru (untuk rujukan atau logik masa hadapan).
 */
function updateTeacherLoad(tId, day, count) {
    if (!tId || tId === "SEMUA") return;
    
    const ids = tId.split('/');
    ids.forEach(id => {
        if (!teacherDailyLoad[id]) teacherDailyLoad[id] = {};
        teacherDailyLoad[id][day] = (teacherDailyLoad[id][day] || 0) + count;
    });
}

/**
 * Menyimpan hasil akhir jadual ke koleksi 'timetables' di Firestore.
 */
async function saveToCloud() {
    const batch = writeBatch(db);
    for (let cId in timetableResult) {
        const ref = doc(db, "timetables", cId);
        batch.set(ref, timetableResult[cId]);
    }
    await batch.commit();
    console.log("Data berjaya disimpan ke Firestore.");
}
