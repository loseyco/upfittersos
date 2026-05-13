const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'saegroup-c6487' });
const db = admin.firestore();
const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';

async function listStaff() {
    const staffRef = db.collection('businesses').doc(tenantId).collection('staff');
    const snapshot = await staffRef.get();
    snapshot.docs.forEach(d => {
        const data = d.data();
        console.log(`[${d.id}] ${data.firstName} ${data.lastName} - Source: ${data.source || 'Native'} - Email: ${data.email}`);
    });
}
listStaff();
