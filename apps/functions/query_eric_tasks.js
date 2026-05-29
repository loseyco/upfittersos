const { execSync } = require('child_process');
const https = require('https');

function getAccessToken() {
  try {
    return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
  } catch (err) {
    console.error("Failed to get gcloud access token:", err.message);
    process.exit(1);
  }
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
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
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
  
  const staffList = [];
  if (staffRes.documents) {
    staffRes.documents.forEach(doc => {
      const fields = doc.fields || {};
      const data = { id: doc.name.split('/').pop() };
      for (const k in fields) {
        data[k] = extractVal(fields[k]);
      }
      staffList.push(data);
    });
  }

  console.log(`Found ${staffList.length} staff members.`);
  const erics = staffList.filter(s => 
    (s.firstName && s.firstName.toLowerCase().includes('eric')) || 
    (s.lastName && s.lastName.toLowerCase().includes('eric')) ||
    (s.email && s.email.toLowerCase().includes('eric'))
  );

  console.log("Eric(s) found in system:");
  erics.forEach(e => {
    console.log(`- ID: ${e.id} | Name: ${e.firstName} ${e.lastName} | Email: ${e.email} | Dept: ${e.departmentId} | PayType: ${e.payType}`);
  });

  if (erics.length === 0) {
    console.log("No staff member named Eric found!");
    process.exit(0);
  }

  const ericIds = erics.map(e => e.id);

  console.log("\n2. Fetching all tasks under tenant...");
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

  console.log(`Found ${allTasks.length} total tasks in database for tenant ${tenantId}.`);

  // Today is May 28, 2026.
  // Monday of this week is May 25, 2026.
  const todayStart = new Date('2026-05-28T00:00:00-05:00');
  const weekStart = new Date(todayStart);
  const day = weekStart.getDay(); // 0 is Sunday, 1 is Monday...
  const daysToSubtract = day === 0 ? 6 : day - 1;
  weekStart.setDate(weekStart.getDate() - daysToSubtract);
  weekStart.setHours(0, 0, 0, 0);

  console.log(`\nAnalyzing tasks completed this week (since Monday, ${weekStart.toDateString()})...`);
  console.log(`Week start timestamp: ${weekStart.toISOString()}`);

  const ericsTasks = allTasks.filter(t => {
    // Is Eric assigned or the actual completer?
    const isAssigned = t.assignedStaffIds && t.assignedStaffIds.some(id => ericIds.includes(id));
    const isCompletedByEric = t.completedByStaffId && ericIds.includes(t.completedByStaffId);
    return isAssigned || isCompletedByEric;
  });

  console.log(`Found ${ericsTasks.length} tasks associated with Eric in total.`);

  let totalCompletedBookTime = 0;
  console.log("\n--- Completed/QC Tasks for Eric (All-Time) ---");
  
  const completedTasks = ericsTasks.filter(t => {
    return t.status === 'QC Complete' || t.status === 'QC' || t.status === 'completed';
  });

  completedTasks.forEach(t => {
    const compDateVal = t.completedAt || t.qcCompletedAt || t.updatedAt;
    const compTime = compDateVal ? new Date(compDateVal).getTime() : 0;
    const isThisWeek = compTime >= weekStart.getTime();

    console.log(`\nTask ID: ${t.id}`);
    console.log(`  Title: ${t.title}`);
    console.log(`  Job ID: ${t.jobId}`);
    console.log(`  Status: ${t.status}`);
    console.log(`  Book Time: ${t.bookTime}h`);
    console.log(`  Assigned: ${JSON.stringify(t.assignedStaffIds)}`);
    console.log(`  Completed By: ${t.completedByStaffId}`);
    console.log(`  Completed At: ${compDateVal} (Parsed: ${new Date(compTime).toDateString()})`);
    console.log(`  Is Completed This Week: ${isThisWeek ? 'YES' : 'NO'}`);
    
    if (isThisWeek) {
      totalCompletedBookTime += Number(t.bookTime || 0);
    }
  });

  console.log(`\nTotal Book Time Completed by Eric this week: ${totalCompletedBookTime.toFixed(2)}h`);

  console.log("\n--- Active/Incomplete Tasks for Eric ---");
  const incompleteTasks = ericsTasks.filter(t => {
    return !(t.status === 'QC Complete' || t.status === 'QC' || t.status === 'completed');
  });

  incompleteTasks.forEach(t => {
    console.log(`- [${t.status}] ${t.title} | Job ID: ${t.jobId} | Book Time: ${t.bookTime}h`);
  });
}

main().catch(console.error);
