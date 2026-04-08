import * as admin from 'firebase-admin';
const app = admin.initializeApp({ projectId: 'saegroup-c6487' });
const db = admin.firestore();

async function run() {
    console.log("Checking customer collection");
    const snap = await db.collection('customers').limit(1).get();
    if (snap.empty) {
        console.log("No customers found");
        return;
    }
    const doc = snap.docs[0];
    console.log("Customer ID:", doc.id);
    console.log("Before update:", doc.data());

    await doc.ref.update({ defaultDiscount: 42 });
    
    const after = await doc.ref.get();
    console.log("After update:", after.data());
    process.exit(0);
}
run();
