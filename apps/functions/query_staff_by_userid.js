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

  const staffUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/businesses/${tenantId}/staff?pageSize=100`;
  const staffRes = await makeRequest(staffUrl, token);
  
  if (staffRes.documents) {
    staffRes.documents.forEach(doc => {
      const fields = doc.fields || {};
      const firstName = fields.firstName?.stringValue || '';
      const lastName = fields.lastName?.stringValue || '';
      const userId = fields.userId?.stringValue || 'N/A';
      const email = fields.email?.stringValue || '';
      
      if (firstName.toLowerCase().includes('eric') || lastName.toLowerCase().includes('eric') || email.toLowerCase().includes('eric')) {
        console.log(`DocID: ${doc.name.split('/').pop()} | Name: ${firstName} ${lastName} | userId field: ${userId} | email: ${email}`);
      }
    });
  }
}

main().catch(console.error);
