import { auth, db } from "./firebase-config.js";
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. Fungsi Log Masuk
export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error("Ralat Log Masuk:", error.message);
        return { success: false, error: error.message };
    }
}

// 2. Fungsi Log Keluar
export async function logoutUser() {
    try {
        await signOut(auth);
        window.location.href = "index.html"; // Kembali ke laman login
    } catch (error) {
        console.error("Ralat Log Keluar:", error.message);
    }
}

// 3. Semak Peranan Pengguna (Admin vs Guru)
export async function getUserRole(uid) {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            return userDoc.data().role; // Mengembalikan "admin" atau "teacher"
        } else {
            return "teacher"; // Default jika tiada data
        }
    } catch (error) {
        console.error("Ralat ambil peranan:", error);
        return null;
    }
}

// 4. Pantau Status Auth & Kawalan Akses
export function monitorAuthState(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const role = await getUserRole(user.uid);
            callback(user, role);
        } else {
            callback(null, null);
        }
    });
}