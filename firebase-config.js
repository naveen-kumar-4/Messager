// Firebase Compat style - no imports needed, firebase is a global variable

const firebaseConfig = {
    apiKey: "AIzaSyBtRfqJynTXQGz08OUtvMYKuvJfdOLlpJA",
    authDomain: "messager-12.firebaseapp.com",
    projectId: "messager-12",
    storageBucket: "messager-12.firebasestorage.app",
    messagingSenderId: "416465242989",
    appId: "1:416465242989:web:18f9ce9db24ce67d1c6864",
    measurementId: "G-JVXSG825V3"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
