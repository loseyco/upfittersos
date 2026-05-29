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

  const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const tasksQuery = {
    structuredQuery: {
      from: [{ collectionId: 'tasks', allDescendants: true }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'tenantId' },
          op: 'EQUAL',
          value: { stringValue: tenantId }
        }
      }
    }
  };

  const tasksRes = await postRequest(queryUrl, token, tasksQuery);
  const allTasks = [];
  tasksRes.forEach(item => {
    if (!item.document) return;
    const doc = item.document;
    const fields = doc.fields || {};
    const nameParts = doc.name.split('/');
    const jobId = nameParts[nameParts.indexOf('jobs') + 1];
    const data = { 
      id: doc.name.split('/').pop(),
      jobId: jobId,
      path: doc.name
    };
    for (const k in fields) {
      data[k] = extractVal(fields[k]);
    }
    allTasks.push(data);
  });

  console.log(`Searching 341 tasks for any references to Eric (J7Z1TyMJeDaKgUYDA3Da73qNqbf1, 8000054F-1597940227, 8000099C-1723496373)...`);

  const ericIds = ['J7Z1TyMJeDaKgUYDA3Da73qNqbf1', '8000054F-1597940227', '8000099C-1723496373'];

  allTasks.forEach(t => {
    const jsonStr = JSON.stringify(t);
    const hasEricRef = ericIds.some(id => jsonStr.includes(id)) || jsonStr.toLowerCase().includes('eric');
    
    if (hasEricRef) {
      console.log(`\nFound matching task: "${t.title}" (ID: ${t.id}, Job: ${t.jobId})`);
      console.log(`  Status: ${t.status}`);
      console.log(`  Book Time: ${t.bookTime}h`);
      console.log(`  Assigned: ${JSON.stringify(t.assignedStaffIds)}`);
      console.log(`  Completed By: ${t.completedByStaffId} (${t.completedByStaffName})`);
      console.log(`  QC Completed By: ${t.qcCompletedBy}`);
    }
  });
}

main().catch(console.error);
