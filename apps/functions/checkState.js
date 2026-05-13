const admin = require('firebase-admin');

try {
  admin.initializeApp();
} catch(e) {
  console.log("Init Error: ", e);
}

const db = admin.firestore();

async function run() {
  const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';
  
  console.log("Checking business doc...");
  const biz = await db.collection('businesses').doc(tenantId).get();
  console.log("Business config:", biz.data()?.qbwcInitialized, biz.data()?.lastQbSyncTime);
  
  console.log("Checking queue...");
  const queue = await db.collection('qbwc_queue').where('tenantId', '==', tenantId).get();
  console.log(`Found ${queue.size} queue items`);
  queue.forEach(d => console.log(d.id, d.data().action, d.data().status));

  console.log("Checking errors in activity feed...");
  const acts = await db.collection('businesses').doc(tenantId).collection('activity_feed').where('type', '==', 'qbwc_sync').get();
  console.log(`Found ${acts.size} activity feed items`);
  acts.forEach(d => console.log(d.data()));
}

run().catch(console.error);
