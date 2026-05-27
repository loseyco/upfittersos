const { execSync } = require('child_process');

async function run() {
    console.log('Fetching access token...');
    const token = execSync('gcloud auth print-access-token').toString().trim();
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const projectId = 'saegroup-c6487';
    const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';
    const dbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/businesses/${tenantId}`;

    console.log('Fetching QB employees...');
    const resQb = await fetch(dbUrl + '/qb_employees?pageSize=300', { headers });
    const dataQb = await resQb.json();
    
    if (!dataQb.documents) return console.log('No QB employees found.');
    
    const inactiveQbIds = dataQb.documents
        .filter(d => {
            const f = d.fields || {};
            return f.IsActive?.stringValue === 'false' || f.isActive?.booleanValue === false;
        })
        .map(d => d.name.split('/').pop());

    console.log(`Found ${inactiveQbIds.length} inactive employees in QuickBooks.`);

    console.log('Fetching Native staff...');
    const resStaff = await fetch(dbUrl + '/staff?pageSize=500', { headers });
    const dataStaff = await resStaff.json();
    
    if (!dataStaff.documents) return console.log('No staff found.');

    const staffToArchive = dataStaff.documents.filter(d => {
        const f = d.fields || {};
        const qbId = f.quickbooksId?.stringValue;
        // Also check if they are already archived so we don't re-archive
        const isAlreadyArchived = f.isArchived?.booleanValue === true;
        return qbId && inactiveQbIds.includes(qbId) && !isAlreadyArchived;
    });

    console.log(`Found ${staffToArchive.length} staff records that need to be archived.`);

    for (const doc of staffToArchive) {
        const id = doc.name.split('/').pop();
        const firstName = doc.fields.firstName?.stringValue || '';
        const lastName = doc.fields.lastName?.stringValue || '';
        console.log(`Archiving staff ${id} (${firstName} ${lastName})...`);
        
        const patchRes = await fetch(`${dbUrl}/staff/${id}?updateMask.fieldPaths=isArchived`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
                fields: {
                    ...doc.fields,
                    isArchived: { booleanValue: true }
                }
            })
        });

        if (!patchRes.ok) {
            console.error('Failed to archive', await patchRes.text());
        }
    }
    console.log(`Cleanup completed.`);
}

run().catch(console.error);
