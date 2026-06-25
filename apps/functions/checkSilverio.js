const { execSync } = require('child_process');
const https = require('https');

function getAccessToken() {
  try {
    return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
  } catch (err) {
    console.error('Failed to get gcloud access token. Make sure you are logged in via gcloud auth login.');
    throw err;
  }
}

function makeRequest(url, method, token, payload = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (payload) {
      req.write(JSON.stringify(payload));
    }
    req.end();
  });
}

function extractVal(valObj) {
  if (!valObj) return null;
  if ('stringValue' in valObj) return valObj.stringValue;
  if ('integerValue' in valObj) return parseInt(valObj.integerValue);
  if ('doubleValue' in valObj) return parseFloat(valObj.doubleValue);
  if ('booleanValue' in valObj) return valObj.booleanValue;
  if ('timestampValue' in valObj) return valObj.timestampValue;
  if ('nullValue' in valObj) return null;
  if ('arrayValue' in valObj) {
    const vals = valObj.arrayValue.values || [];
    return vals.map(extractVal);
  }
  if ('mapValue' in valObj) {
    const res = {};
    const fields = valObj.mapValue.fields || {};
    for (const k in fields) {
      res[k] = extractVal(fields[k]);
    }
    return res;
  }
  return valObj;
}

async function main() {
  const token = getAccessToken();
  const projectId = 'saegroup-c6487';
  const email = 's.benitez@saegrp.com';

  console.log('--- Checking Firebase Auth User ---');
  try {
    const authUrl = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`;
    const authRes = await makeRequest(authUrl, 'POST', token, { email: [email] });
    console.log('Auth Lookup Result:', JSON.stringify(authRes, null, 2));
  } catch (err) {
    console.error('Error fetching auth user:', err.message);
  }

  console.log('\n--- Checking Firestore Staff Collection Group ---');
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    
    // Query Firestore for staff matching email/name
    const queryPayload = {
      structuredQuery: {
        from: [{ collectionId: 'staff', allDescendants: true }]
      }
    };
    
    const results = await makeRequest(firestoreUrl, 'POST', token, queryPayload);
    console.log(`Query returned ${results.length} documents.`);
    
    results.forEach((r) => {
      if (r.document) {
        const fields = r.document.fields || {};
        const data = {};
        for (const k in fields) {
          data[k] = extractVal(fields[k]);
        }
        
        const matches = (
          (data.email && data.email.toLowerCase().includes('benitez')) ||
          (data.firstName && data.firstName.toLowerCase().includes('silverio')) ||
          (data.lastName && data.lastName.toLowerCase().includes('benitez'))
        );
        
        if (matches) {
          console.log(`Found Staff Doc ID: ${r.document.name.split('/').pop()}`);
          console.log(`Path: ${r.document.name}`);
          console.log(`Data:`, JSON.stringify(data, null, 2));
        }
      }
    });
  } catch (err) {
    console.error('Error querying Firestore:', err);
  }
}

main().catch(console.error);
