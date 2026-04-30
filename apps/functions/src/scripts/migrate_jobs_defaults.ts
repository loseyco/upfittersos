// Ensure we hit production database
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
      projectId: "saegroup-c6487",
    });
}

const db = admin.firestore();

async function run() {
    console.log("Migrating jobs to add default sopSupplies and shipping...");
    const jobsSnap = await db.collection('jobs').get();
    
    let updatedJobs = 0;
    
    for (const doc of jobsSnap.docs) {
        const data = doc.data();
        let needsUpdate = false;
        const updates: any = {};
        
        if (data.sopSupplies === undefined) {
            updates.sopSupplies = 0;
            needsUpdate = true;
        }
        
        if (data.shipping === undefined) {
            updates.shipping = 0;
            needsUpdate = true;
        }
        
        if (needsUpdate) {
            await doc.ref.update(updates);
            updatedJobs++;
        }
    }
    
    console.log(`\n========================================`);
    console.log(`MIGRATION SCRIPT COMPLETED SUCCESSFULLY.`);
    console.log(`Migrated Jobs: ${updatedJobs}`);
    console.log(`========================================\n`);
}

run().catch(console.error);
