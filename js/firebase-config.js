// Import fungsi yang diperlukan dari SDK Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Konfigurasi yang anda berikan
const firebaseConfig = {
  apiKey: "AIzaSyB0g-vObzQefBcchZllEFyjnhAHVJI4avg",
  authDomain: "penjana-jadual-sekolah.firebaseapp.com",
  projectId: "penjana-jadual-sekolah",
  storageBucket: "penjana-jadual-sekolah.firebasestorage.app",
  messagingSenderId: "925987236686",
  appId: "1:925987236686:web:ef7b280b44ddf68ff50c1f",
  measurementId: "G-3CZR7R1KB5"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);

// Eksport instance untuk digunakan oleh fail lain
export const db = getFirestore(app);
export const auth = getAuth(app);