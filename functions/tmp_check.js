const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'saegroup-c6487' });
const db = admin.firestore();

async function check() {
    const snaps = await db.collection('jobs').orderBy('createdAt', 'desc').limit(5).get();
    snaps.forEach(doc => {
        const data = doc.data();
        console.log(`Job ${doc.id}: title=${data.title}, isChangeOrder=${data.isChangeOrder}`);
    });
}
check();
