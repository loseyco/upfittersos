const { execSync } = require('child_process');
const https = require('https');

function getAccessToken() {
  return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
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
  const tenantId = '7jlg4IA2G6lvDJ0S5Vbp';
  const email = 's.benitez@saegrp.com';

  console.log(`--- Resolving permissions for ${email} ---`);
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    
    // Find staff document
    const queryPayload = {
      structuredQuery: {
        from: [{ collectionId: 'staff' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'email' },
            op: 'EQUAL',
            value: { stringValue: email }
          }
        }
      }
    };
    
    const results = await makeRequest(firestoreUrl, 'POST', token, queryPayload);
    if (results.length === 0 || !results[0].document) {
      console.log('No staff document found in businesses/staff!');
      return;
    }
    
    const staffDoc = results[0].document;
    const fields = staffDoc.fields || {};
    const staffData = {};
    for (const k in fields) {
      staffData[k] = extractVal(fields[k]);
    }
    
    console.log('Staff document found:', JSON.stringify(staffData, null, 2));
    
    // Fetch department
    if (staffData.departmentId) {
      const deptUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/businesses/${tenantId}/departments/${staffData.departmentId}`;
      const deptRes = await makeRequest(deptUrl, 'GET', token);
      const deptFields = deptRes.fields || {};
      const deptData = {};
      for (const k in deptFields) {
        deptData[k] = extractVal(deptFields[k]);
      }
      console.log('Department found:', JSON.stringify(deptData, null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main().catch(console.error);
