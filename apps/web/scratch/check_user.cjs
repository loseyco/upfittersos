const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'saegroup-c6487'
});

async function checkUser() {
  try {
    const email = 'j.briggs@saegrp.com';
    const user = await admin.auth().getUserByEmail(email);
    console.log('User UID:', user.uid);
    console.log('Custom Claims:', user.customClaims);
  } catch (error) {
    console.error('Error fetching user:', error);
  }
}

checkUser().then(() => process.exit(0));
