const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';

async function run() {
  console.log(`Analyzing completed tasks on Tuesday (2026-07-14) under tenant ${tenantId}...`);

  const startOfTuesday = new Date('2026-07-14T00:00:00Z');
  const endOfTuesday = new Date('2026-07-14T23:59:59Z');

  // Query all tasks for the tenant
  const tasksSnap = await db.collectionGroup('tasks')
    .where('tenantId', '==', tenantId)
    .get();

  console.log(`Total tasks found in database: ${tasksSnap.size}`);

  const tuesdayTasks = [];

  tasksSnap.forEach(doc => {
    const data = doc.data();
    const status = (data.status || '').toLowerCase();
    
    // Check if task is completed
    if (['completed', 'qc', 'qc complete'].includes(status)) {
      // Check when it was completed
      // Falling back to createdAt (which is what the chart currently uses)
      const compDateVal = data.qcCompletedAt || data.completedAt || data.createdAt;
      if (!compDateVal) return;
      const compDate = compDateVal.toDate ? compDateVal.toDate() : new Date(compDateVal);
      
      // Let's filter to Tuesday
      if (compDate >= startOfTuesday && compDate <= endOfTuesday) {
        tuesdayTasks.push({
          id: doc.id,
          title: data.title,
          status: data.status,
          bookTime: data.bookTime,
          assignedStaff: data.assignedStaff || [],
          qcCompletedAt: data.qcCompletedAt ? (data.qcCompletedAt.toDate ? data.qcCompletedAt.toDate().toISOString() : data.qcCompletedAt) : null,
          completedAt: data.completedAt ? (data.completedAt.toDate ? data.completedAt.toDate().toISOString() : data.completedAt) : null,
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
          updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt) : null,
          completedByStaffName: data.completedByStaffName || null
        });
      }
    }
  });

  console.log(`\nFound ${tuesdayTasks.length} tasks completed on Tuesday:`);
  tuesdayTasks.forEach((t, idx) => {
    console.log(`\n[${idx + 1}] Title: "${t.title}"`);
    console.log(`    Status: ${t.status} | Book Time: ${t.bookTime}`);
    console.log(`    Assigned Techs:`, JSON.stringify(t.assignedStaff));
    console.log(`    qcCompletedAt: ${t.qcCompletedAt}`);
    console.log(`    completedAt:   ${t.completedAt}`);
    console.log(`    createdAt:     ${t.createdAt}`);
    console.log(`    updatedAt:     ${t.updatedAt}`);
  });

  process.exit(0);
}

run().catch(console.error);
