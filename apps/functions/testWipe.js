const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function run() {
    const tenantId = '6Jv3VUr8lwHmE19gGSAR';
    console.log('Starting wipe for tenant', tenantId);

    const collectionsToWipe = ['qb_customers', 'customers', 'qb_jobs', 'jobs', 'qb_items', 'inventory_items'];
    const wipeBatch = db.batch();
    let totalDeleted = 0;

    for (const collName of collectionsToWipe) {
        const snap = await db.collection(`businesses/${tenantId}/${collName}`).get();
        console.log(`Found ${snap.size} docs in ${collName}`);
        snap.forEach(doc => {
            wipeBatch.delete(doc.ref);
            totalDeleted++;
        });
    }

    const queueSnap = await db.collection('qbwc_queue').where('tenantId', '==', tenantId).get();
    console.log(`Found ${queueSnap.size} docs in qbwc_queue`);
    queueSnap.forEach(doc => {
        wipeBatch.delete(doc.ref);
        totalDeleted++;
    });

    console.log("Updating businesses doc...");
    await db.collection('businesses').doc(tenantId).update({ 
        qbwcInitialized: false,
        lastQbSyncTime: admin.firestore.FieldValue.delete()
    });

    console.log("Committing batch with size", totalDeleted);
    await wipeBatch.commit();
    console.log("Done! Wiped", totalDeleted, "records.");
}

run().catch(console.error);
