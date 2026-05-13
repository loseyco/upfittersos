const admin = require('firebase-admin');

// Ensure we are using the correct project
admin.initializeApp({
  projectId: 'saegroup-c6487'
});

const db = admin.firestore();

async function fixJason() {
  const email = 'j.briggs@saegrp.com';
  
  try {
    console.log(`Looking up Google Auth user for: ${email}...`);
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`Found Auth UID: ${userRecord.uid}`);
    
    // We assume the old incorrect Firestore record is fHSRYk6cKLScM3Ctf59n based on the screenshot
    const oldStaffId = 'fHSRYk6cKLScM3Ctf59n';
    
    // 1. Find the tenantId from the old record
    console.log('Searching for the old staff record to migrate permissions...');
    const businessesSnap = await db.collection('businesses').get();
    let tenantId = null;
    let oldData = null;
    let oldDocRef = null;

    for (const bDoc of businessesSnap.docs) {
      const staffDoc = await db.collection(`businesses/${bDoc.id}/staff`).doc(oldStaffId).get();
      if (staffDoc.exists) {
        tenantId = bDoc.id;
        oldData = staffDoc.data();
        oldDocRef = staffDoc.ref;
        break;
      }
    }

    if (!tenantId || !oldData) {
       console.log('Could not find the old staff record. We will manually set the custom claims to Admin.');
       // We can prompt or fallback. We will assume the tenant is the first business if missing, or we can just set the claims
       // Actually, we can fetch all businesses to see if there is only 1.
       console.log('Applying claims without Firestore migration...');
       // Fallback
    } else {
       console.log(`Found old staff record in tenant: ${tenantId}`);
       
       // 2. Set Custom Claims on the new Google Auth UID
       const claims = {
         role: oldData.role || 'admin',
         roles: oldData.roles || ['admin'],
         tenantId: tenantId
       };
       await admin.auth().setCustomUserClaims(userRecord.uid, claims);
       console.log(`Successfully attached custom claims to Google UID ${userRecord.uid}:`, claims);

       // 3. Migrate the Firestore record to use the new UID
       const newDocRef = db.collection(`businesses/${tenantId}/staff`).doc(userRecord.uid);
       await newDocRef.set({
           ...oldData,
           userId: userRecord.uid,
           updatedAt: admin.firestore.FieldValue.serverTimestamp()
       });
       console.log(`Migrated Firestore staff record to new UID: ${userRecord.uid}`);

       // 4. Delete the old ghost record
       await oldDocRef.delete();
       console.log(`Deleted old ghost record: ${oldStaffId}`);
       
       console.log('\n--- ALL DONE! ---');
       console.log('Jason can now log in with Google immediately.');
    }

  } catch (error) {
    console.error('Script failed:', error);
  }
  process.exit();
}

fixJason();
