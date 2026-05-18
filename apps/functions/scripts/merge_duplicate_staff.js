const admin = require('firebase-admin');

const { execSync } = require('child_process');
const token = execSync('gcloud auth print-access-token').toString().trim();
const credential = {
    getAccessToken: () => Promise.resolve({
        access_token: token,
        expires_in: 3600
    })
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: credential,
        projectId: 'saegroup-c6487'
    });
}
const db = admin.firestore();

const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';

async function mergeDuplicateStaff() {
    console.log(`Starting merge for duplicate staff in tenant: ${tenantId}`);
    
    try {
        const staffRef = db.collection('businesses').doc(tenantId).collection('staff');
        const snapshot = await staffRef.get();
        
        const staffList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log(`Found ${staffList.length} total staff records.`);

        const nativeStaff = staffList.filter(s => s.source !== 'QuickBooks');
        const qbStaff = staffList.filter(s => s.source === 'QuickBooks');

        console.log(`Native records: ${nativeStaff.length}`);
        console.log(`QuickBooks records: ${qbStaff.length}`);

        let mergeCount = 0;

        for (const qbMember of qbStaff) {
            const email = (qbMember.email || '').toLowerCase();
            const firstName = qbMember.firstName || '';
            const lastName = qbMember.lastName || '';
            
            // Try to find a matching Native record
            const match = nativeStaff.find(n => {
                const nEmail = (n.email || '').toLowerCase();
                const nFirstName = n.firstName || '';
                const nLastName = n.lastName || '';
                
                return (email && nEmail === email) || 
                       (firstName && lastName && nFirstName.toLowerCase() === firstName.toLowerCase() && nLastName.toLowerCase() === lastName.toLowerCase());
            });

            if (match) {
                console.log(`Merging QuickBooks record [${qbMember.id}] (${qbMember.firstName} ${qbMember.lastName}) into Native record [${match.id}]`);
                
                // 1. Update Native record with QB data
                await staffRef.doc(match.id).update({
                    quickbooksId: qbMember.quickbooksId || qbMember.ListID || qbMember.id,
                    ListID: qbMember.ListID || qbMember.id,
                    source: 'QuickBooks',
                    tags: admin.firestore.FieldValue.arrayUnion('QuickBooks'),
                    notes: admin.firestore.FieldValue.arrayUnion('Merged with QuickBooks record via cleanup script.'),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // 2. Delete the duplicate QuickBooks record
                await staffRef.doc(qbMember.id).delete();
                
                mergeCount++;
            }
        }

        console.log(`Merge completed. ${mergeCount} records consolidated.`);
    } catch (err) {
        console.error("Merge failed:", err);
    }
}

mergeDuplicateStaff();
