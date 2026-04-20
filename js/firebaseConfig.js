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

    /**
     * Realtime Database security rules often use `auth != null` for read/write.
     * This app authenticates users only in-app (`gtes_users` in RTDB) and never
     * signed into Firebase Auth — so on every new browser / PC, all `.once('value')`
     * calls failed with `permission_denied`.
     *
     * Sign in anonymously before any data load so rules that require an
     * authenticated Firebase user are satisfied. Custom app login is unchanged.
     *
     * Required once in Firebase Console: Authentication → Sign-in methods →
     * Anonymous → Enable.
     */
    window.firebaseAuthReady = (async () => {
        try {
            if (typeof firebase.auth !== 'function') {
                console.warn('[Firebase] Auth SDK missing — include firebase-auth-compat.js before this file.');
                return { ok: false, reason: 'no-auth-sdk' };
            }
            const auth = firebase.auth();
            if (auth.currentUser) {
                return { ok: true, uid: auth.currentUser.uid };
            }
            const cred = await auth.signInAnonymously();
            const uid = cred && cred.user ? cred.user.uid : null;
            console.log('[Firebase] Anonymous auth OK (Realtime DB rules):', uid);
            return { ok: true, uid };
        } catch (e) {
            const code = e && e.code ? e.code : '';
            console.error('[Firebase] Anonymous sign-in failed:', code, e && e.message);
            console.error(
                '[Firebase] Enable Anonymous sign-in: Console → Authentication → Sign-in method → Anonymous.'
            );
            return { ok: false, error: e };
        }
    })();
} else {
    console.error("Firebase SDK not loaded properly.");
}
