const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'saegroup-c6487' });
async function check() {
    const db = admin.firestore();
    const sf = await db.collection('users').get();
    sf.docs.forEach(d => console.log(d.id, d.data()));
}
check();
