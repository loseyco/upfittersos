const { execSync } = require('child_process');

async function run() {
    console.log('Fetching access token...');
    const token = execSync('gcloud auth print-access-token').toString().trim();
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const projectId = 'saegroup-c6487';
    const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';
    const urlBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/businesses/${tenantId}/staff`;

    console.log('Fetching staff...');
    const res = await fetch(urlBase + '?pageSize=500', { headers });
    const data = await res.json();
    
    if (!data.documents) return console.log('No documents found.');
    
    const staffList = data.documents.map(d => ({
        name: d.name,
        id: d.name.split('/').pop(),
        fields: d.fields || {}
    }));

    const nativeStaff = staffList.filter(s => s.fields.source?.stringValue !== 'QuickBooks');
    const qbStaff = staffList.filter(s => s.fields.source?.stringValue === 'QuickBooks');

    console.log(`Native records: ${nativeStaff.length}`);
    console.log(`QuickBooks records: ${qbStaff.length}`);

    let mergeCount = 0;

    for (const qbMember of qbStaff) {
        const email = (qbMember.fields.email?.stringValue || '').toLowerCase();
        const firstName = qbMember.fields.firstName?.stringValue || '';
        const lastName = qbMember.fields.lastName?.stringValue || '';

        const match = nativeStaff.find(n => {
            const nEmail = (n.fields.email?.stringValue || '').toLowerCase();
            const nFirstName = n.fields.firstName?.stringValue || '';
            const nLastName = n.fields.lastName?.stringValue || '';
            
            return (email && nEmail === email) || 
                   (firstName && lastName && nFirstName.toLowerCase() === firstName.toLowerCase() && nLastName.toLowerCase() === lastName.toLowerCase());
        });

        if (match) {
            console.log(`Merging QuickBooks duplicate [${qbMember.id}] (${firstName} ${lastName}) into Native record [${match.id}]`);
            
            const qbId = qbMember.fields.quickbooksId?.stringValue || qbMember.fields.ListID?.stringValue || qbMember.id;
            const listId = qbMember.fields.ListID?.stringValue || qbMember.id;

            const nativePatch = {
                fields: {
                    ...match.fields,
                    source: { stringValue: 'QuickBooks' },
                    quickbooksId: { stringValue: qbId },
                    ListID: { stringValue: listId }
                }
            };

            console.log(`Updating Native doc ${match.id}...`);
            const patchRes = await fetch(`${urlBase}/${match.id}?updateMask.fieldPaths=source&updateMask.fieldPaths=quickbooksId&updateMask.fieldPaths=ListID`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(nativePatch)
            });
            
            if (!patchRes.ok) {
                console.error('Failed to patch', await patchRes.text());
                continue;
            }

            console.log(`Deleting QB doc ${qbMember.id}...`);
            const delRes = await fetch(`${urlBase}/${qbMember.id}`, {
                method: 'DELETE',
                headers
            });

            if (!delRes.ok) {
                console.error('Failed to delete', await delRes.text());
            }

            mergeCount++;
        }
    }
    console.log(`Merge completed. ${mergeCount} records consolidated.`);
}

run().catch(console.error);
