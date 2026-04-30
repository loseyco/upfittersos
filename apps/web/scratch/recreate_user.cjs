const admin = require('firebase-admin');

async function recreateUser() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'saegroup-c6487'
    });
  }
  
  const uid = 'Hd34ox7cd9bVDGbdvnXnBAo2k1T2';
  const email = 'qbtest@losey.co';
  const tenantId = '6Jv3VUr8lwHmE19gGSAR';
  const password = 'Upfitters123!';

  try {
    // 1. Create the Auth User with the exact UID from Firestore
    await admin.auth().createUser({
      uid: uid,
      email: email,
      password: password,
      displayName: 'QuickBooks Test Owner'
    });
    console.log(`Successfully created user ${email} with UID ${uid}`);

    // 2. Set the Custom Claims so they can access the business
    await admin.auth().setCustomUserClaims(uid, {
      role: 'business_owner',
      tenantId: tenantId
    });
    console.log(`Set custom claims: role=business_owner, tenantId=${tenantId}`);

    console.log('\n--- LOGIN READY ---');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);

  } catch (err) {
    console.error('Failed to recreate user:', err);
  }
  process.exit();
}

recreateUser().catch(err => {
  console.error(err);
  process.exit(1);
});
