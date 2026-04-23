const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // assuming it exists or default adc
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'saegroup-c6487'
});

async function run() {
    const db = admin.firestore();
    const doc = await db.collection('businesses').doc('test-tenant').get();
    console.log("Business Data:", doc.data());
}
run().catch(console.error);
