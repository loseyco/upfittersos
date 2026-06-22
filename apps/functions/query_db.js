const admin = require('firebase-admin');

// Initialize with application default credentials (using Firebase CLI auth)
admin.initializeApp({
  projectId: 'saegroup-c6487'
});

const db = admin.firestore();
const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';

async function run() {
  try {
    const start = new Date('2026-06-08T00:00:00');
    const end = new Date('2026-06-14T23:59:59');

    console.log(`Fetching sessions from ${start.toISOString()} to ${end.toISOString()}...`);
    const snap = await db.collection(`businesses/${tenantId}/time_sessions`)
      .where('clockIn.timestamp', '>=', start)
      .where('clockIn.timestamp', '<=', end)
      .get();

    console.log(`Found ${snap.size} sessions.`);
    
    snap.docs.forEach(doc => {
      const data = doc.data();
      // Look for Adrian Benitez
      if (data.userName && data.userName.toLowerCase().includes('adrian')) {
        console.log(`\n========================================`);
        console.log(`Session ID: ${doc.id}`);
        console.log(`User: ${data.userName} (ID: ${data.userId})`);
        console.log(`Clock In: ${data.clockIn?.timestamp?.toDate()?.toISOString() || data.clockIn?.timestamp}`);
        console.log(`Clock Out: ${data.clockOut?.timestamp?.toDate()?.toISOString() || data.clockOut?.timestamp}`);
        console.log(`Breaks:`, JSON.stringify(data.breaks || [], null, 2));
        console.log(`Jobs:`);
        (data.jobs || []).forEach((j, idx) => {
          console.log(`  - Job ${idx}:`);
          console.log(`    Id: ${j.id}`);
          console.log(`    Name: ${j.name}`);
          console.log(`    Task: ${j.taskName}`);
          console.log(`    Start: ${j.start?.toDate ? j.start.toDate().toISOString() : j.start}`);
          console.log(`    End: ${j.end?.toDate ? j.end.toDate().toISOString() : j.end}`);
          console.log(`    Book Time: ${j.bookTime}`);
        });
      }
    });
  } catch (err) {
    console.error('Error running script:', err);
  }
}

run();
