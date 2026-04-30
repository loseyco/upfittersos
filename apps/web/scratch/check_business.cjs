const admin = require('firebase-admin');
const path = require('path');

// Initialize with a service account if available, or just use the project ID if running where authenticated
// Since I don't have the key file path, I'll try to use the project ID.
// However, the best way is to check the businesses collection directly.

async function check() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'saegroup-c6487'
    });
  }
  const db = admin.firestore();
  const businessId = '6Jv3VUr8lwHmE19gGSAR';
  
  const doc = await db.collection('businesses').doc(businessId).get();
  if (!doc.exists) {
    console.log(`Business ${businessId} not found.`);
  } else {
    console.log(`Business Found: ${doc.data().name}`);
    console.log('Owner Email:', doc.data().ownerEmail);
  }
  process.exit();
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
