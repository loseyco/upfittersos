const admin = require('firebase-admin');

async function checkUid() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'saegroup-c6487'
    });
  }
  const uid = 'Hd34ox7cd9bVDGbdvnXnBAo2k1T2';
  try {
    const user = await admin.auth().getUser(uid);
    console.log('User Found in Auth:', user.email);
    console.log('UID:', user.uid);
    console.log('Custom Claims:', user.customClaims);
  } catch (e) {
    console.log(`UID ${uid} NOT found in Firebase Auth.`);
  }
  process.exit();
}

checkUid().catch(err => {
  console.error(err);
  process.exit(1);
});
