// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyC4LAIOoHCpzIemtkF8hx7OO7-14fcgv7c",
    authDomain: "mjs-primelogic.firebaseapp.com",
    databaseURL: "https://mjs-primelogic-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "mjs-primelogic",
    storageBucket: "mjs-primelogic.firebasestorage.app",
    messagingSenderId: "655561950311",
    appId: "1:655561950311:web:5ab176de856267010780c2",
    measurementId: "G-5S4YR5MGKN"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    console.log("🔥 Firebase Realtime Database Initialized!");
    
    // Make database reference available globally
    window.db = firebase.database();
} else {
    console.error("Firebase SDK not loaded properly.");
}
