const admin = require('firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

admin.initializeApp({ projectId: 'saegroup-c6487' });
const db = admin.firestore();

async function run() {
  console.log("Connecting to emulator db...");
  const jobsSnap = await db.collection('jobs').get();
  const batch = db.batch();
  let count = 0;
  
  jobsSnap.forEach(doc => {
    // Keep PJ's Test Job and UpfittersOS
    if (!doc.id.startsWith('S8TF') && !doc.id.startsWith('DCZJ')) {
      batch.update(doc.ref, { status: 'Archived', archived: true });
      count++;
    }
  });

  if(count > 0) {
    await batch.commit();
    console.log('Archived ' + count + ' jobs.');
  } else {
    console.log('No jobs to archive.');
  }
}

run().catch(console.error);
