const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'saegroup-c6487'
});

async function run() {
  try {
    const uid = 'ZLP4ZfV0yFYCpwFkLjhAINUHNGa2';
    const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';

    console.log("Setting claims...");
    await admin.auth().setCustomUserClaims(uid, {
      tenantId: tenantId,
      role: 'staff'
    });
    console.log("Claims set!");

    console.log("Updating firestore...");
    await admin.firestore().doc(`businesses/${tenantId}/staff/${uid}`).set({
      userId: uid,
      email: 'monitor@saegrp.com',
      name: 'Bay Monitor',
      role: 'staff',
      isActive: true,
      permissions: {
        'mission_control.view': true,
        'foreman.view': true
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log("SUCCESS");
  } catch(e) {
    console.error(e);
  }
}

run();
