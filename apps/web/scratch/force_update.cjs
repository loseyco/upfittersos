const { execSync } = require('child_process');

async function run() {
  try {
    // 1. Get access token from gcloud
    console.log("Fetching gcloud token...");
    const token = execSync('gcloud auth print-access-token').toString().trim();
    if (!token) throw new Error("No token returned");
    
    const uid = 'ZLP4ZfV0yFYCpwFkLjhAINUHNGa2';
    const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';
    const projectId = 'saegroup-c6487';

    // 2. Set Custom Claims
    console.log("Setting custom claims via Identity Toolkit...");
    const claimsRes = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        localId: uid,
        customAttributes: JSON.stringify({ tenantId: tenantId, role: 'staff' })
      })
    });
    
    if (!claimsRes.ok) {
      console.error("Identity Toolkit error:", await claimsRes.text());
    } else {
      console.log("Claims updated successfully!");
    }

    // 3. Update Firestore Document
    console.log("Updating Firestore staff document...");
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/businesses/${tenantId}/staff/${uid}`;
    
    const docData = {
      fields: {
        userId: { stringValue: uid },
        email: { stringValue: 'monitor@saegrp.com' },
        name: { stringValue: 'Bay Monitor' },
        role: { stringValue: 'staff' },
        isActive: { booleanValue: true },
        permissions: {
          mapValue: {
            fields: {
              "mission_control.view": { booleanValue: true },
              "foreman.view": { booleanValue: true }
            }
          }
        }
      }
    };

    const fsRes = await fetch(`${firestoreUrl}?updateMask=userId,email,name,role,isActive,permissions`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(docData)
    });

    if (!fsRes.ok) {
      console.error("Firestore error:", await fsRes.text());
    } else {
      console.log("Firestore document updated successfully!");
    }

  } catch(e) {
    console.error(e);
  }
}

run();
