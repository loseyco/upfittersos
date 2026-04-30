const admin = require('firebase-admin');

// Initialize Firebase Admin (assumes GOOGLE_APPLICATION_CREDENTIALS or default credentials are set)
admin.initializeApp({ projectId: 'saegroup-c6487' });

const db = admin.firestore();

async function check() {
    try {
        const user = await admin.auth().getUserByEmail('p.losey@saegrp.com');
        console.log(`User UID: ${user.uid}`);
        console.log(`Claims:`, user.customClaims);
        
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            console.log(`Firestore data:`, JSON.stringify(doc.data(), null, 2));
        } else {
            console.log('User doc not found in Firestore!');
        }
    } catch (e) {
        console.error(e);
    }
}

check();
