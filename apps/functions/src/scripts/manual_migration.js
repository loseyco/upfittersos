const admin = require('firebase-admin');

// Initialize with explicit Project ID
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'saegroup-c6487'
    });
}

const db = admin.firestore();
const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';

async function migrate() {
    console.log(`🚀 Starting manual migration for tenant: ${tenantId}...`);
    
    try {
        const zonesSnap = await db.collection('business_zones').get();
        console.log(`Found ${zonesSnap.size} legacy zones in root.`);
        
        let migratedCount = 0;
        for (const zoneDoc of zonesSnap.docs) {
            const data = zoneDoc.data();
            
            // Filter by tenantId if it exists, or just migrate everything to this tenant for now if it's their project
            if (data.tenantId && data.tenantId !== tenantId) continue;
            
            const newRef = db.collection('businesses').doc(tenantId).collection('zones').doc(zoneDoc.id);
            
            const name = data.label || data.name || 'Unnamed Bay';
            const type = (data.type || 'bay').toLowerCase();

            const migratedData = {
                ...data,
                name,
                type,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                migratedFromRoot: true
            };
            
            // Normalize current vehicle assignment
            if (data.currentVehicleVin) {
                migratedData.currentVehicleVin = data.currentVehicleVin.toUpperCase();
                
                // Also ensure vehicle record exists
                const vehicleRef = db.collection('businesses').doc(tenantId).collection('vehicles').doc(data.currentVehicleVin.toUpperCase());
                await vehicleRef.set({
                    vin: data.currentVehicleVin.toUpperCase(),
                    tenantId,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    source: 'Migration Script'
                }, { merge: true });
            }
            
            await newRef.set(migratedData, { merge: true });
            migratedCount++;
            console.log(`✅ Migrated: ${name} (${zoneDoc.id})`);
        }
        
        console.log(`\n🎉 Migration complete! Successfully moved ${migratedCount} zones.`);
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
}

migrate();
