const { execSync } = require('child_process');
const https = require('https');

function getAccessToken() {
  return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
}

function makeRequest(url, token) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Authorization': `Bearer ${token}` } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(data));
        else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
      });
    }).on('error', reject);
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

  let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/businesses/${tenantId}/staff?pageSize=100`;
  const erics = [];
  let totalStaffFetched = 0;

  while (url) {
    console.log(`Fetching staff page (URL: ${url.slice(0, 100)}...)...`);
    const res = await makeRequest(url, token);
    
    if (res.documents) {
      totalStaffFetched += res.documents.length;
      res.documents.forEach(doc => {
        const fields = doc.fields || {};
        const data = { id: doc.name.split('/').pop() };
        for (const k in fields) {
          data[k] = extractVal(fields[k]);
        }
        
        const firstName = data.firstName || '';
        const lastName = data.lastName || '';
        const email = data.email || '';
        
        if (firstName.toLowerCase().includes('eric') || lastName.toLowerCase().includes('eric') || email.toLowerCase().includes('eric')) {
          erics.push(data);
        }
      });
    }

    if (res.nextPageToken) {
      url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/businesses/${tenantId}/staff?pageSize=100&pageToken=${res.nextPageToken}`;
    } else {
      url = null;
    }
  }

  console.log(`\nFetched ${totalStaffFetched} total staff members in subcollection.`);
  console.log(`Found ${erics.length} matching Eric(s) in subcollection:`);
  erics.forEach(e => {
    console.log(`DocID: ${e.id} | Name: ${e.firstName} ${e.lastName} | Email: ${e.email} | userId: ${e.userId} | DeptId: ${e.departmentId}`);
  });
}

main().catch(console.error);
