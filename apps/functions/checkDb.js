const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function check() {
  const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';
  const biz = await db.collection('businesses').doc(tenantId).get();
  console.log('Business Config:', biz.data().qbwcInitialized, biz.data().lastQbSyncTime);
  
  const queue = await db.collection('qbwc_queue').where('tenantId', '==', tenantId).get();
  console.log('Queue items:', queue.size);
  queue.forEach(doc => {
    console.log(doc.id, doc.data().status, doc.data().action);
  });
}
check().catch(console.error).finally(() => process.exit(0));
