const { execSync } = require('child_process');
const https = require('https');

const PROJECT_ID = 'saegroup-c6487';
const DEFAULT_TENANT_ID = '7jlg4IA2G6lvDJ0S5Vbp';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function getAccessToken() {
  return execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}

function makeRequest(url) {
  const token = getAccessToken();
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

function extractVal(valObj) {
  if (!valObj) return null;
  if ('stringValue' in valObj) return valObj.stringValue;
  if ('integerValue' in valObj) return parseInt(valObj.integerValue, 10);
  if ('doubleValue' in valObj) return parseFloat(valObj.doubleValue);
  if ('booleanValue' in valObj) return valObj.booleanValue;
  if ('timestampValue' in valObj) return valObj.timestampValue;
  if ('arrayValue' in valObj) return (valObj.arrayValue.values || []).map(extractVal);
  if ('mapValue' in valObj) {
    const res = {};
    for (const k of Object.keys(valObj.mapValue.fields || {})) {
      res[k] = extractVal(valObj.mapValue.fields[k]);
    }
    return res;
  }
  return null;
}

function parseDoc(doc) {
  const fields = doc.fields || {};
  const data = { id: doc.name.split('/').pop() };
  for (const k of Object.keys(fields)) {
    data[k] = extractVal(fields[k]);
  }
  return data;
}

async function run() {
  const url = `${BASE_URL}/businesses/${DEFAULT_TENANT_ID}/time_logs?pageSize=300`;
  const res = await makeRequest(url);
  const docs = (res.documents || []).map(parseDoc);
  
  console.log(`=== TIME LOGS COLLECTION (${docs.length} docs) ===\n`);
  const patrickLogs = docs.filter(d => JSON.stringify(d).toLowerCase().includes('patrick') || JSON.stringify(d).includes('t6u4VkkNYQhwJ2hP0sLUEh3bloR2'));

  console.log(`Found ${patrickLogs.length} time_logs entries for Patrick:\n`);
  for (const doc of patrickLogs) {
    console.log(JSON.stringify(doc, null, 2));
    console.log('-'.repeat(60));
  }
}

run().catch(console.error);
