const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';
const userId = 't6u4VkkNYQhwJ2hP0sLUEh3bloR2';

async function run() {
  console.log(`Searching for all tasks assigned to user ${userId} under tenant ${tenantId}...`);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(todayStart);
  const day = weekStart.getDay(); // 0 is Sunday, 1 is Monday, etc.
  const daysToSubtract = day === 0 ? 6 : day - 1;
  weekStart.setDate(weekStart.getDate() - daysToSubtract);

  console.log(`weekStart (Monday of this week): ${weekStart.toISOString()} (${weekStart.getTime()})`);

  // Query all tasks assigned to the user
  const tasksSnap = await db.collectionGroup('tasks')
    .where('tenantId', '==', tenantId)
    .where('assignedStaffIds', 'array-contains', userId)
    .get();

  console.log(`Found ${tasksSnap.size} assigned tasks.`);

  let doneBookHours = 0;
  let scheduledBookHours = 0;

  tasksSnap.forEach(doc => {
    const t = doc.data();
    const jobId = doc.ref.path.split('/')[3];
    const bookTime = Number(t.bookTime || 0);
    const isCompleted = t.status === 'QC Complete' || t.status === 'QC' || t.status === 'completed';

    console.log(`\n--- Task Doc: ${doc.id} (Job: ${jobId}) ---`);
    console.log(`Title: ${t.title}`);
    console.log(`Status: ${t.status}`);
    console.log(`BookTime: ${t.bookTime}`);
    console.log(`completedAt:`, t.completedAt ? (t.completedAt.toDate ? t.completedAt.toDate().toISOString() : t.completedAt) : null);
    console.log(`qcCompletedAt:`, t.qcCompletedAt ? (t.qcCompletedAt.toDate ? t.qcCompletedAt.toDate().toISOString() : t.qcCompletedAt) : null);
    console.log(`updatedAt:`, t.updatedAt ? (t.updatedAt.toDate ? t.updatedAt.toDate().toISOString() : t.updatedAt) : null);
    console.log(`createdAt:`, t.createdAt ? (t.createdAt.toDate ? t.createdAt.toDate().toISOString() : t.createdAt) : null);

    if (isCompleted) {
      const compDateVal = t.status === 'QC Complete' 
        ? (t.qcCompletedAt || t.completedAt || t.updatedAt) 
        : (t.completedAt || t.updatedAt);
      
      const compTime = compDateVal 
        ? (compDateVal.toDate ? compDateVal.toDate().getTime() : new Date(compDateVal).getTime()) 
        : 0;

      console.log(`  => compDateVal used:`, compDateVal ? (compDateVal.toDate ? compDateVal.toDate().toISOString() : compDateVal) : null);
      console.log(`  => compTime parsed: ${new Date(compTime).toISOString()} (${compTime})`);
      console.log(`  => compTime >= weekStart? ${compTime >= weekStart.getTime()}`);

      if (compTime >= weekStart.getTime()) {
        doneBookHours += bookTime;
        console.log(`  => ADDED to doneBookHours!`);
      }
    } else {
      scheduledBookHours += bookTime;
    }
  });

  console.log(`\n--- Summary ---`);
  console.log(`doneBookHours: ${doneBookHours}h`);
  console.log(`scheduledBookHours: ${scheduledBookHours}h`);
  process.exit(0);
}

run().catch(console.error);
