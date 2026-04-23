const admin = require('firebase-admin');

// Ensure we initialize with standard default credentials so this runs in his environment
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}

const db = admin.firestore();
const tenantId = '6Jv3VUr8lwHmE19gGSAR';

async function migrateData() {
    try {
        console.log("Migrating Customers...");
        const customersSnap = await db.collection('businesses').doc(tenantId).collection('customers').get();
        if (!customersSnap.empty) {
            const batch = db.batch();
            customersSnap.forEach(doc => {
                const newRef = db.collection('customers').doc(doc.id);
                batch.set(newRef, doc.data(), { merge: true });
            });
            await batch.commit();
            console.log(`Migrated ${customersSnap.size} customers to root.`);
        } else {
            console.log("No customers found in subcollection.");
        }

        console.log("Migrating Inventory Items...");
        const inventorySnap = await db.collection('businesses').doc(tenantId).collection('inventory_items').get();
        if (!inventorySnap.empty) {
            const batch = db.batch();
            inventorySnap.forEach(doc => {
                const newRef = db.collection('inventory_items').doc(doc.id);
                batch.set(newRef, doc.data(), { merge: true });
            });
            await batch.commit();
            console.log(`Migrated ${inventorySnap.size} inventory items to root.`);
        } else {
            console.log("No inventory items found in subcollection.");
        }

        console.log("Done!");
    } catch (e) {
        console.error("Migration error:", e);
    }
}

migrateData();
