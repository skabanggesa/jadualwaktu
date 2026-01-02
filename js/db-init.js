import { db } from "./firebase-config.js";
import { collection, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function initializeDatabase() {
    const batch = writeBatch(db);

    // 1. DATA SUBJEK (Master Data)
    const subjects = [
        { id: "BM", name: "Bahasa Melayu", slots: 10, isDouble: true, roomId: null, timeLimit: null },
        { id: "BI", name: "Bahasa Inggeris", slots: 8, isDouble: true, roomId: null, timeLimit: null },
        { id: "MAT", name: "Matematik", slots: 6, isDouble: true, roomId: null, timeLimit: null },
        { id: "SN", name: "Sains", slots: 4, isDouble: true, roomId: "makmal", timeLimit: null },
        { id: "PJ", name: "Pendidikan Jasmani", slots: 2, isDouble: false, roomId: "padang", timeLimit: "slot_1_to_4" },
        { id: "PK", name: "Pendidikan Kesihatan", slots: 1, isDouble: false, roomId: "kelas", timeLimit: null },
        { id: "PI", name: "Pendidikan Islam", slots: 6, isDouble: true, roomId: "surau", isParallel: true },
        { id: "PM", name: "Pendidikan Moral", slots: 6, isDouble: true, roomId: "kelas", isParallel: true },
        { id: "RBT", name: "RBT", slots: 2, isDouble: true, roomId: "bilik_rbt", timeLimit: null },
        { id: "SEJ", name: "Sejarah", slots: 2, isDouble: true, roomId: null, timeLimit: null },
        { id: "MZ", name: "Muzik", slots: 1, isDouble: false, roomId: "bilik_muzik", timeLimit: null },
        { id: "PSV", name: "Seni Visual", slots: 2, isDouble: true, roomId: "bilik_seni", timeLimit: null }
    ];

    subjects.forEach(sub => {
        const ref = doc(db, "subjects", sub.id);
        batch.set(ref, sub);
    });

    // 2. DATA BILIK KHAS
    const rooms = ["Kelas", "Makmal", "Padang", "Surau", "Bilik RBT", "Bilik Seni", "Bilik Muzik"];
    rooms.forEach(roomName => {
        const roomId = roomName.toLowerCase().replace(/\s+/g, '_');
        const ref = doc(db, "rooms", roomId);
        batch.set(ref, { name: roomName });
    });

    // 3. DATA GURU
    const teachers = [
        { id: "G01", name: "Allawee Hj Sidek", role: "teacher" },
        { id: "G02", name: "Ahmad Jemain", role: "teacher" },
        { id: "G03", name: "Suzie Abdullah", role: "teacher" },
        { id: "G04", name: "Yasmin Huzaimah Aladdin", role: "teacher" },
        { id: "G05", name: "Edi Harianto Suyadi", role: "teacher" }
    ];

    teachers.forEach(teacher => {
        const ref = doc(db, "teachers", teacher.id);
        batch.set(ref, {
            name: teacher.name,
            role: teacher.role,
            createdAt: new Date()
        });
    });

    // --- BAHAGIAN BARU: 4. DATA KELAS ---
    const classes = [
        { id: "1Cemerlang", name: "1 Cemerlang" },
        { id: "1Gemilang", name: "1 Gemilang" },
        { id: "2Cemerlang", name: "2 Cemerlang" },
        { id: "2Gemilang", name: "2 Gemilang" },
        { id: "3Cemerlang", name: "3 Cemerlang" },
        { id: "3Gemilang", name: "3 Gemilang" },
        { id: "4Cemerlang", name: "4 Cemerlang" },
        { id: "4Gemilang", name: "4 Gemilang" },
        { id: "5Cemerlang", name: "5 Cemerlang" },
        { id: "5Gemilang", name: "5 Gemilang" },
        { id: "6Cemerlang", name: "6 Cemerlang" },
        { id: "6Gemilang", name: "6 Gemilang" }
    ];

    classes.forEach(cls => {
        const ref = doc(db, "classes", cls.id);
        batch.set(ref, { name: cls.name });
    });

    // PROSES SIMPAN
    try {
        await batch.commit();
        alert("Setup Database Selesai! Koleksi 'classes' telah ditambah.");
        return true;
    } catch (error) {
        console.error("Gagal menjana koleksi: ", error);
        alert("Ralat semasa setup database.");
        return false;
    }
}