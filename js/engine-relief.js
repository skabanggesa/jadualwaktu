import { db } from "./firebase-config.js";
import { collection, getDocs, doc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * STATE UNTUK RELIEF
 */
let fullTimetable = {}; // Data dari collection 'timetables'
let teachers = [];
let dailyReliefCount = {}; // Memantau berapa kali guru sudah ganti hari ini

/**
 * 1. FUNGSI UTAMA: JANA GURU GANTI
 * @param {string} absentTeacherId - ID guru yang tidak hadir
 * @param {string} day - Hari (Isnin, Selasa, etc.)
 */
export async function generateRelief(absentTeacherId, day) {
    console.log(`Menjana Relief untuk: ${absentTeacherId} pada hari ${day}`);
    
    // A. Tarik Data Terkini
    await fetchData();
    
    // B. Cari slot yang terkesan (Di mana guru tersebut sepatutnya mengajar)
    const affectedSlots = findAffectedSlots(absentTeacherId, day);
    
    if (affectedSlots.length === 0) {
        alert("Guru ini tiada jadual mengajar pada hari tersebut.");
        return;
    }

    let reliefAssignments = [];

    // C. Untuk setiap slot yang terkesan, cari calon guru ganti
    affectedSlots.forEach(slotInfo => {
        const potentialTeacher = findBestReliefTeacher(day, slotInfo.slot, absentTeacherId);
        
        if (potentialTeacher) {
            reliefAssignments.push({
                slot: slotInfo.slot,
                classId: slotInfo.classId,
                originalSubject: slotInfo.subjectId,
                absentTeacher: absentTeacherId,
                reliefTeacher: potentialTeacher.id,
                reliefTeacherName: potentialTeacher.name
            });
            
            // Kemaskini beban relief sementara (Local)
            dailyReliefCount[potentialTeacher.id] = (dailyReliefCount[potentialTeacher.id] || 0) + 1;
        } else {
            reliefAssignments.push({
                slot: slotInfo.slot,
                classId: slotInfo.classId,
                reliefTeacher: "TIADA GURU FREE",
                reliefTeacherName: "TIADA"
            });
        }
    });

    return reliefAssignments;
}

/**
 * 2. LOGIK PENCARIAN GURU FREE
 */
function findBestReliefTeacher(day, slot, absentTeacherId) {
    // Tapis guru yang:
    // 1. Bukan guru yang bercuti itu sendiri
    // 2. Sedang FREE pada slot tersebut (Tiada dalam mana-masing jadual kelas)
    // 3. Susun mengikut jumlah relief terendah (untuk keadilan/fairness)

    const availableTeachers = teachers.filter(t => {
        if (t.id === absentTeacherId) return false;
        
        // Semak jika guru t sedang mengajar di mana-mana kelas pada slot ini
        let isTeaching = false;
        for (let classId in fullTimetable) {
            const schedule = fullTimetable[classId].data[day];
            if (schedule[slot] && schedule[slot].teacherId === t.id) {
                isTeaching = true;
                break;
            }
        }
        return !isTeaching;
    });

    // Susun mengikut siapa yang paling kurang buat relief hari ini
    availableTeachers.sort((a, b) => {
        const countA = dailyReliefCount[a.id] || 0;
        const countB = dailyReliefCount[b.id] || 0;
        return countA - countB;
    });

    return availableTeachers[0] || null; // Pulangkan yang paling 'free'
}

/**
 * 3. IDENTIFIKASI SLOT TERKESAN
 */
function findAffectedSlots(teacherId, day) {
    let affected = [];
    for (let classId in fullTimetable) {
        const daySchedule = fullTimetable[classId].data[day];
        daySchedule.forEach((cell, slotIndex) => {
            if (cell && cell.teacherId === teacherId) {
                affected.push({
                    slot: slotIndex,
                    classId: classId,
                    subjectId: cell.subjectId
                });
            }
        });
    }
    return affected;
}

/**
 * 4. PENGAMBILAN DATA
 */
async function fetchData() {
    // Ambil semua jadual kelas
    const timetableSnap = await getDocs(collection(db, "timetables"));
    timetableSnap.forEach(doc => {
        fullTimetable[doc.id] = doc.data();
    });

    // Ambil senarai semua guru
    const teachersSnap = await getDocs(collection(db, "teachers"));
    teachers = teachersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * 5. SIMPAN RELIEF KE CLOUD
 */
export async function saveReliefToCloud(day, assignments) {
    const batch = writeBatch(db);
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    const reliefRef = doc(db, "relief_records", `${dateStr}_${day}`);
    batch.set(reliefRef, {
        date: dateStr,
        day: day,
        assignments: assignments,
        createdAt: new Date()
    });

    await batch.commit();
    alert("Jadual Relief Berjaya Disimpan dan Diterbitkan!");
}