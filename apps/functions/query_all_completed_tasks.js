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

  console.log("1. Fetching all staff members...");
  const staffUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/businesses/${tenantId}/staff?pageSize=100`;
  const staffRes = await makeRequest(staffUrl, token);
  
  const staffMap = {};
  if (staffRes.documents) {
    staffRes.documents.forEach(doc => {
      const fields = doc.fields || {};
      const data = { id: doc.name.split('/').pop() };
      for (const k in fields) {
        data[k] = extractVal(fields[k]);
      }
      staffMap[data.id] = data;
    });
  }

  console.log("2. Fetching all tasks...");
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

  const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
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

  console.log(`Found ${allTasks.length} total tasks.`);

  // Week start is Monday May 25, 2026
  const weekStart = new Date('2026-05-25T00:00:00-05:00');
  console.log(`Week start (Monday of this week): ${weekStart.toISOString()}`);

  const completedThisWeek = allTasks.filter(t => {
    const isCompleted = t.status === 'QC Complete' || t.status === 'QC' || t.status === 'completed';
    if (!isCompleted) return false;
    
    const compDateVal = t.completedAt || t.qcCompletedAt || t.updatedAt;
    const compTime = compDateVal ? new Date(compDateVal).getTime() : 0;
    return compTime >= weekStart.getTime();
  });

  console.log(`\nFound ${completedThisWeek.length} completed tasks this week:\n`);

  completedThisWeek.forEach(t => {
    const assignedNames = (t.assignedStaffIds || []).map(id => {
      const s = staffMap[id];
      return s ? `${s.firstName} ${s.lastName} (${id})` : id;
    });
    
    const compByName = staffMap[t.completedByStaffId] 
      ? `${staffMap[t.completedByStaffId].firstName} ${staffMap[t.completedByStaffId].lastName} (${t.completedByStaffId})`
      : t.completedByStaffId;

    console.log(`Task ID: ${t.id}`);
    console.log(`  Title: ${t.title}`);
    console.log(`  Job ID: ${t.jobId}`);
    console.log(`  Book Time: ${t.bookTime}h`);
    console.log(`  Status: ${t.status}`);
    console.log(`  Assigned Staff: ${assignedNames.join(', ') || 'None'}`);
    console.log(`  Completed By Staff: ${compByName || 'None'}`);
    console.log(`  Completed At: ${t.completedAt || t.qcCompletedAt || t.updatedAt}`);
    console.log('----------------------------------------------------');
  });
}

main().catch(console.error);
