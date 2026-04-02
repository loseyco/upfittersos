import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "saegroup-c6487.firebaseapp.com",
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || "saegroup-c6487",
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "saegroup-c6487.firebasestorage.app",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
    measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-YE512JER64",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seed() {
    try {
        console.log("Seeding changelog collection...");
        await addDoc(collection(db, 'changelogs'), {
            version: 'v0.1.0-alpha',
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            title: 'Platform Documentation Expansion',
            description: 'Major additions to the documentation hub providing guidance to staff on how to use the ecosystem features.',
            features: [
                'Added the Staff Onboarding Manual with guidance on directories and assignment tracking.',
                'Added the Global Feedback Guide covering automated screenshots and idea pitching.',
                'Deployed the interactive Changelog component to track platform evolution.'
            ],
            fixes: [
                'Standardized dynamic application name to UpfitterOS globally.'
            ],
            createdAt: serverTimestamp()
        });
        console.log("Seeding complete!");
        process.exit(0);
    } catch (e) {
        console.error("Failed to seed:", e);
        process.exit(1);
    }
}

seed();
