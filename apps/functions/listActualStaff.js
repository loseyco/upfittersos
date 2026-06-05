const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'saegroup-c6487' });

const db = admin.firestore();
const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';

async function run() {
  console.log("=== DEPARTMENTS ===");
  const deptsSnap = await db.collection('businesses').doc(tenantId).collection('departments').get();
  const departments = {};
  deptsSnap.forEach(doc => {
    const data = doc.data();
    departments[doc.id] = data.name;
    console.log(`ID: ${doc.id} | Name: ${data.name}`);
  });

  console.log("\n=== STAFF MEMBERS ===");
  const staffSnap = await db.collection('businesses').doc(tenantId).collection('staff').get();
  staffSnap.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id} | Name: ${data.firstName} ${data.lastName} | Email: ${data.email} | Dept: ${departments[data.departmentId] || 'None'} | Title: ${data.jobTitle} | Role: ${data.role} | Tech#: ${data.techNumber}`);
  });
}

run().catch(console.error).finally(() => process.exit(0));
