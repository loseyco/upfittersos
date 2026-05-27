const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'saegroup-c6487'
});

async function run() {
  const email = 'monitor@saegrp.com';
  const password = 'ShopDisplay2026!';
  const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';
  const db = admin.firestore();

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
    console.log('User already exists:', userRecord.uid);
    await admin.auth().updateUser(userRecord.uid, { password });
    console.log('Password updated.');
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: 'Bay Monitor',
        emailVerified: true
      });
      console.log('User created:', userRecord.uid);
    } else {
      console.error(err);
      process.exit(1);
    }
  }

  const uid = userRecord.uid;

  // Set custom claims
  await admin.auth().setCustomUserClaims(uid, {
    tenantId: tenantId,
    role: 'staff'
  });
  console.log('Claims set.');

  // Create or update global users doc
  await db.collection('users').doc(uid).set({
    email,
    firstName: 'Bay',
    lastName: 'Monitor',
    name: 'Bay Monitor',
    isActive: true,
    businesses: {
      [tenantId]: {
        role: 'staff',
        joinedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // Create or update tenant staff doc
  await db.collection(`businesses/${tenantId}/staff`).doc(uid).set({
    userId: uid,
    email,
    name: 'Bay Monitor',
    role: 'staff',
    isActive: true,
    permissions: {
        "mission_control.view": true,
        "foreman.view": true
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  console.log('Firestore updated.');
}

run().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
