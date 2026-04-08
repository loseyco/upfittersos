import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

async function backfillCosts() {
    console.log("Starting backfill for missing 'cost' fields...");
    let inventoryMigrated = 0;
    let jobsMigrated = 0;

    try {
        // 1. Backfill inventory_items: set cost = price where cost is missing or undefined
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

        // 2. Backfill jobs: scan tasks[] and parts[] and set cost = price
        console.log("Scanning jobs...");
        const jobsSnapshot = await db.collection('jobs').get();
        for (const doc of jobsSnapshot.docs) {
            const data = doc.data();
            let needsUpdate = false;
            let updatedData = { ...data };

            // Legacy parts array
            if (updatedData.parts && Array.isArray(updatedData.parts)) {
                updatedData.parts = updatedData.parts.map((p: any) => {
                    if (p.price !== undefined && (p.cost === undefined || p.cost === null)) {
                        needsUpdate = true;
                        return { ...p, cost: p.price };
                    }
                    return p;
                });
            }

            // Tasks parts array
            if (updatedData.tasks && Array.isArray(updatedData.tasks)) {
                updatedData.tasks = updatedData.tasks.map((t: any) => {
                    if (t.parts && Array.isArray(t.parts)) {
                        t.parts = t.parts.map((p: any) => {
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
