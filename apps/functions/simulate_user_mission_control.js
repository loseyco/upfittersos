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
  const effectiveUserId = 't6u4VkkNYQhwJ2hP0sLUEh3bloR2'; // Patrick Losey

  // Fetch all tasks
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

  const searchIds = [effectiveUserId];

  // 1. Filter assigned tasks (assignedStaffIds contains searchIds)
  const assignedTasks = allTasks.filter(t => {
    return t.assignedStaffIds && t.assignedStaffIds.some(id => searchIds.includes(id));
  });

  // 2. Filter completed tasks (completedByStaffId is in searchIds)
  const completedTasks = allTasks.filter(t => {
    return t.completedByStaffId && searchIds.includes(t.completedByStaffId);
  });

  // Merge assigned and completed tasks into myAssignedTasks (matching frontend merge)
  const merged = [...assignedTasks];
  completedTasks.forEach(ct => {
    if (!merged.some(m => m.id === ct.id)) {
      merged.push(ct);
    }
  });

  // Calculate doneBookHours matching frontend
  const todayStart = new Date('2026-05-29T00:00:00-05:00');
  const weekStart = new Date(todayStart);
  const day = weekStart.getDay();
  const daysToSubtract = day === 0 ? 6 : day - 1;
  weekStart.setDate(weekStart.getDate() - daysToSubtract);
  weekStart.setHours(0, 0, 0, 0);

  console.log(`Week start used: ${weekStart.toISOString()}`);

  let doneBookHours = 0;
  console.log("\n--- ONLY completed tasks THIS WEEK for Patrick ---");
  merged.forEach(t => {
    const bookTime = Number(t.bookTime || 0);
    const isCompleted = t.status === 'QC Complete' || t.status === 'QC' || t.status === 'completed';
    
    if (isCompleted) {
      const isActualCompleter = t.completedByStaffId 
        ? searchIds.includes(t.completedByStaffId)
        : t.assignedStaffIds?.some((id) => searchIds.includes(id));

      if (isActualCompleter) {
        const compDateVal = t.completedAt || t.qcCompletedAt || t.updatedAt;
        const compTime = compDateVal ? new Date(compDateVal).getTime() : 0;
        
        if (compTime >= weekStart.getTime()) {
          console.log(`- Task: "${t.title}" (ID: ${t.id}, Job: ${t.jobId})`);
          console.log(`  Book Time: ${bookTime}h`);
          console.log(`  Status: ${t.status}`);
          console.log(`  Assigned Staff: ${JSON.stringify(t.assignedStaffIds)}`);
          console.log(`  Completed By Staff: ${t.completedByStaffId}`);
          console.log(`  Completed At: ${compDateVal}`);
          doneBookHours += bookTime;
        }
      }
    }
  });

  console.log(`\nFinal Calculated doneBookHours for this week: ${doneBookHours}h`);
}

main().catch(console.error);
