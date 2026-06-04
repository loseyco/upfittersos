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

  const jobIds = [
    '80000B37-1775677556',
    '80000B4B-1778686714',
    '80000B4C-1778688901',
    '80000B4E-1778710785',
    '80000B56-1779813808',
    'Sv6lQ94QLfwRMdA4r1pJ'
  ];

  console.log("=== JOB STATUSES ===");
  for (const jobId of jobIds) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/businesses/${tenantId}/jobs/${jobId}`;
    try {
      const doc = await makeRequest(url, token);
      const fields = doc.fields || {};
      const status = fields.status?.stringValue;
      const title = fields.title?.stringValue;
      const jobNumber = fields.jobNumber?.stringValue;
      console.log(`JobID: ${jobId} | Job#: ${jobNumber} | Title: ${title} | Status: ${status}`);
    } catch (e) {
      console.error(`Failed to fetch job ${jobId}:`, e.message);
    }
  }
}

main().catch(console.error);
