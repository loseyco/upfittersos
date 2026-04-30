const admin = require('firebase-admin');

async function checkUser() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'saegroup-c6487'
    });
  }
  const email = 'qbtest@losey.co';
  try {
    const user = await admin.auth().getUserByEmail(email);
    console.log('User Found in Auth:', user.email);
    console.log('UID:', user.uid);
    console.log('Custom Claims:', user.customClaims);
  } catch (e) {
    console.log(`User ${email} NOT found in Firebase Auth.`);
  }
  process.exit();
}

checkUser().catch(err => {
  console.error(err);
  process.exit(1);
});
