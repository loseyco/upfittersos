import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

// Look for a service account key inside functions or elsewhere, 
// usually people have one in functions/serviceAccountKey.json
const keyPath = './functions/service-account.json'; 

if (fs.existsSync(keyPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    initializeApp({
        credential: cert(serviceAccount)
    });
} else {
    initializeApp(); // Might work if GOOGLE_APPLICATION_CREDENTIALS is set
}

const db = getFirestore();

async function run() {
    const docSnap = await db.collection('jobs').doc('xDaPQezPPr8DXIzaKuil').get();
    if (docSnap.exists) {
        const data = docSnap.data();
        console.log("Job data:", JSON.stringify(data, null, 2));
    } else {
        console.log("Job not found.");
    }
}
run();
