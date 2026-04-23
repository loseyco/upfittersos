import * as admin from 'firebase-admin';

admin.initializeApp();

async function checkQueue() {
  const snapshot = await admin.firestore().collection('qbwc_queue').get();
  console.log(`Total queue items: ${snapshot.size}`);
  
  if (!snapshot.empty) {
    snapshot.docs.forEach(doc => {
      console.log(`ID: ${doc.id}, Action: ${doc.data().action}, Status: ${doc.data().status}, TenantID: ${doc.data().tenantId}, CreatedAt: ${doc.data().createdAt}`);
    });
  }
}

checkQueue().catch(console.error);
