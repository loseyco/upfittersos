const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

async function backfillCosts() {
    console.log("Starting backfill for missing 'cost' fields...");
    let inventoryMigrated = 0;
    let jobsMigrated = 0;

    try {
        console.log("Scanning inventory_items...");
        const inventorySnapshot = await db.collection('inventory_items').get();
        for (const doc of inventorySnapshot.docs) {
            const data = doc.data();
            if (data.price !== undefined && (data.cost === undefined || data.cost === null)) {
                await doc.ref.update({
                    cost: data.price
                });
                inventoryMigrated++;
            }
        }
        console.log(`Migrated ${inventoryMigrated} inventory items.`);

        console.log("Scanning jobs...");
        const jobsSnapshot = await db.collection('jobs').get();
        for (const doc of jobsSnapshot.docs) {
            const data = doc.data();
            let needsUpdate = false;
            let updatedData = { ...data };

            if (updatedData.parts && Array.isArray(updatedData.parts)) {
                updatedData.parts = updatedData.parts.map(p => {
                    if (p.price !== undefined && (p.cost === undefined || p.cost === null)) {
                        needsUpdate = true;
                        return { ...p, cost: p.price };
                    }
                    return p;
                });
            }

            if (updatedData.tasks && Array.isArray(updatedData.tasks)) {
                updatedData.tasks = updatedData.tasks.map(t => {
                    if (t.parts && Array.isArray(t.parts)) {
                        t.parts = t.parts.map(p => {
                            if (p.price !== undefined && (p.cost === undefined || p.cost === null)) {
                                needsUpdate = true;
                                return { ...p, cost: p.price };
                            }
                            return p;
                        });
                    }
                    return t;
                });
            }

            if (needsUpdate) {
                await doc.ref.set(updatedData);
                jobsMigrated++;
            }
        }
        console.log(`Migrated ${jobsMigrated} jobs.`);

        console.log("Backfill completed successfully.");
    } catch (err) {
        console.error("Backfill failed:", err);
    }
}

backfillCosts();
