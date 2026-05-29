const { execSync } = require('child_process');
const https = require('https');

function getAccessToken() {
  return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
}

function postRequest(url, token, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(data));
        else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
      });
    });

    req.on('error', reject);
    req.write(postData);
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

  console.log("Querying for any staff member whose name contains Eric...");
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  
  // We'll fetch all staff members under tenant and check them
  const staffQuery = {
    structuredQuery: {
      from: [{ collectionId: 'staff' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'tenantId' },
          op: 'EQUAL',
          value: { stringValue: tenantId }
        }
      }
    }
  };

  const staffRes = await postRequest(queryUrl, token, staffQuery);
  const allStaff = [];
  
  staffRes.forEach(item => {
    if (!item.document) return;
    const doc = item.document;
    const fields = doc.fields || {};
    const data = { id: doc.name.split('/').pop() };
    for (const k in fields) {
      data[k] = extractVal(fields[k]);
    }
    allStaff.push(data);
  });

  console.log(`Found ${allStaff.length} total staff members under tenant ${tenantId}.`);
  
  const erics = allStaff.filter(s => 
    (s.firstName && s.firstName.toLowerCase().includes('eric')) || 
    (s.lastName && s.lastName.toLowerCase().includes('eric')) ||
    (s.email && s.email.toLowerCase().includes('eric'))
  );

  console.log("Matching Eric(s):");
  erics.forEach(e => {
    console.log(`DocID: ${e.id} | Name: ${e.firstName} ${e.lastName} | Email: ${e.email} | userId: ${e.userId} | DeptId: ${e.departmentId}`);
  });
}

main().catch(console.error);
