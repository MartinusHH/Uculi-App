// Copy this file to firebase-config.js and fill in your Firebase project values.
// firebase-config.js is gitignored and is required for auth, sync, and cloud features.
// Only the project id and auth domain are filled in here. Do not put keys in this example.
//
// Local emulator testing:
// 1. Copy this file to firebase-config.js (demo values are fine for emulators).
// 2. Start emulators: npx firebase emulators:start --only auth,firestore
// 3. Open http://127.0.0.1:5173/app.html?emulator=1 (or your local static server).
window.UCULI_FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY",
    authDomain: "mholt-uculi.firebaseapp.com",
    projectId: "mholt-uculi",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
