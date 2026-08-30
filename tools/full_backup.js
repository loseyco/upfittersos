const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'saegroup-c6487';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

let cachedToken = null;
let tokenExpiresAt = 0;

function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }
  try {
    const token = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    cachedToken = token;
    tokenExpiresAt = now + 50 * 60 * 1000; // 50 mins
    return cachedToken;
  } catch (err) {
    console.error('Error: Failed to obtain gcloud access token. Ensure gcloud CLI is authenticated.');
    if (cachedToken) return cachedToken;
    process.exit(1);
  }
}

function makeRequest(url, retries = 3) {
  const token = getAccessToken();
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
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
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch (e) {
            resolve(data);
          }
        } else if (res.statusCode === 404) {
          resolve({ documents: [] });
        } else if ((res.statusCode === 401 || res.statusCode === 429 || res.statusCode >= 500) && retries > 0) {
          // Token expired or rate limit - force refresh token & retry
          cachedToken = null;
          setTimeout(() => {
            makeRequest(url, retries - 1).then(resolve).catch(reject);
          }, 1500);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      if (retries > 0) {
        setTimeout(() => {
          makeRequest(url, retries - 1).then(resolve).catch(reject);
        }, 1000);
      } else {
        reject(err);
      }
    });

    req.end();
  });
}

function extractVal(valObj) {
  if (valObj === null || valObj === undefined) return null;
  if ('stringValue' in valObj) return valObj.stringValue;
  if ('integerValue' in valObj) {
    const n = parseInt(valObj.integerValue, 10);
    return isNaN(n) ? valObj.integerValue : n;
  }
  if ('doubleValue' in valObj) return parseFloat(valObj.doubleValue);
  if ('booleanValue' in valObj) return valObj.booleanValue;
  if ('timestampValue' in valObj) return valObj.timestampValue;
  if ('nullValue' in valObj) return null;
  if ('referenceValue' in valObj) return valObj.referenceValue;
  if ('geoPointValue' in valObj) return valObj.geoPointValue;
  if ('arrayValue' in valObj) {
    const vals = valObj.arrayValue.values || [];
    return vals.map(extractVal);
  }
  if ('mapValue' in valObj) {
    const res = {};
    const fields = valObj.mapValue.fields || {};
    for (const k of Object.keys(fields)) {
      res[k] = extractVal(fields[k]);
    }
    return res;
  }
  return valObj;
}

function parseDoc(doc) {
  if (!doc || !doc.name) return null;
  const docId = doc.name.split('/').pop();
  const fields = doc.fields || {};
  const data = { id: docId, _path: doc.name, _createTime: doc.createTime, _updateTime: doc.updateTime };
  for (const k of Object.keys(fields)) {
    data[k] = extractVal(fields[k]);
  }
  return data;
}

async function fetchCollectionPaginated(collectionPath) {
  const allDocs = [];
  let pageToken = '';
  do {
    const url = `${BASE_URL}/${collectionPath}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    try {
      const res = await makeRequest(url);
      const docs = (res.documents || []).map(parseDoc).filter(Boolean);
      allDocs.push(...docs);
      pageToken = res.nextPageToken || '';
    } catch (err) {
      console.error(`  Warning: Failed to fetch ${collectionPath}:`, err.message);
      break;
    }
  } while (pageToken);

  return allDocs;
}

// Helper for concurrency
async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item, array));
    ret.push(p);
    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

async function runFullBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(__dirname, `../SAEBackpus/FULL_FIREBASE_BACKUP_${timestamp.slice(0, 10)}`);
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log(`=======================================================`);
  console.log(`🚀 STARTING COMPREHENSIVE CLOUD FIRESTORE BACKUP`);
  console.log(`📂 Output Directory: ${backupDir}`);
  console.log(`=======================================================\n`);

  const manifest = {
    backupDate: new Date().toISOString(),
    projectId: PROJECT_ID,
    collections: {},
    totalDocuments: 0
  };

  const masterDatabaseDump = {};

  // 1. Fetch Top-Level Collections
  const topLevelCollections = [
    'businesses',
    'users',
    'feedback_reports',
    'tenant_settings',
    'settings',
    'quickbooks_sync',
    'changelogs'
  ];

  for (const col of topLevelCollections) {
    process.stdout.write(`Fetching top-level collection '${col}'... `);
    const docs = await fetchCollectionPaginated(col);
    masterDatabaseDump[col] = docs;
    manifest.collections[col] = docs.length;
    manifest.totalDocuments += docs.length;
    
    fs.writeFileSync(
      path.join(backupDir, `${col}.json`),
      JSON.stringify(docs, null, 2),
      'utf8'
    );
    console.log(`✅ ${docs.length} documents`);
  }

  // 2. Fetch Deep Business Subcollections
  const businesses = masterDatabaseDump['businesses'] || [];
  console.log(`\nDiscovered ${businesses.length} Business Tenant(s) to deeply traverse.`);

  for (const b of businesses) {
    const bId = b.id;
    console.log(`\n🏢 Backing up Business Tenant: ${b.name || b.id} (${bId})`);
    const tenantDir = path.join(backupDir, `tenant_${bId}`);
    if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true });

    const businessSubcollections = [
      'staff',
      'time_sessions',
      'vehicles',
      'departments',
      'zones',
      'inventory',
      'parts',
      'items',
      'whiteboards',
      'settings',
      'audit_logs',
      'triage',
      'customer_portals',
      'qr_codes'
    ];

    masterDatabaseDump[`business_${bId}`] = { ...b, subcollections: {} };

    for (const subCol of businessSubcollections) {
      process.stdout.write(`  ├─ ${subCol}... `);
      const docs = await fetchCollectionPaginated(`businesses/${bId}/${subCol}`);
      masterDatabaseDump[`business_${bId}`].subcollections[subCol] = docs;
      manifest.collections[`businesses/${bId}/${subCol}`] = docs.length;
      manifest.totalDocuments += docs.length;

      fs.writeFileSync(
        path.join(tenantDir, `${subCol}.json`),
        JSON.stringify(docs, null, 2),
        'utf8'
      );
      console.log(`✅ ${docs.length} documents`);
    }

    // 3. Deep Jobs & Tasks Subcollections
    process.stdout.write(`  ├─ Fetching Jobs... `);
    const jobs = await fetchCollectionPaginated(`businesses/${bId}/jobs`);
    masterDatabaseDump[`business_${bId}`].subcollections['jobs'] = jobs;
    manifest.collections[`businesses/${bId}/jobs`] = jobs.length;
    manifest.totalDocuments += jobs.length;

    fs.writeFileSync(
      path.join(tenantDir, `jobs.json`),
      JSON.stringify(jobs, null, 2),
      'utf8'
    );
    console.log(`✅ ${jobs.length} jobs found.`);

    // Subcollections inside each job
    const jobSubcollectionsToFetch = [
      'tasks',
      'takeoffs',
      'blockers',
      'photos',
      'parts_requests',
      'history',
      'qc_logs',
      'notes'
    ];

    console.log(`  └─ Fetching subcollections for ${jobs.length} jobs in concurrent batches...`);
    const allTenantTasks = [];
    const allTenantTakeoffs = [];
    const allTenantPartsRequests = [];
    const allTenantHistory = [];

    let processedCount = 0;

    await asyncPool(15, jobs, async (job) => {
      job.subcollections = {};
      
      for (const jSub of jobSubcollectionsToFetch) {
        const subDocs = await fetchCollectionPaginated(`businesses/${bId}/jobs/${job.id}/${jSub}`);
        job.subcollections[jSub] = subDocs;

        if (jSub === 'tasks' && subDocs.length > 0) {
          allTenantTasks.push(...subDocs.map(t => ({ ...t, jobId: job.id, jobNumber: job.jobNumber })));
        } else if (jSub === 'takeoffs' && subDocs.length > 0) {
          allTenantTakeoffs.push(...subDocs.map(t => ({ ...t, jobId: job.id, jobNumber: job.jobNumber })));
        } else if (jSub === 'parts_requests' && subDocs.length > 0) {
          allTenantPartsRequests.push(...subDocs.map(t => ({ ...t, jobId: job.id, jobNumber: job.jobNumber })));
        } else if (jSub === 'history' && subDocs.length > 0) {
          allTenantHistory.push(...subDocs.map(t => ({ ...t, jobId: job.id, jobNumber: job.jobNumber })));
        }
      }

      processedCount++;
      if (processedCount % 100 === 0 || processedCount === jobs.length) {
        console.log(`     Progress: ${processedCount}/${jobs.length} jobs subcollections processed...`);
      }
    });

    manifest.collections[`businesses/${bId}/all_tasks`] = allTenantTasks.length;
    manifest.collections[`businesses/${bId}/all_takeoffs`] = allTenantTakeoffs.length;
    manifest.collections[`businesses/${bId}/all_parts_requests`] = allTenantPartsRequests.length;
    manifest.collections[`businesses/${bId}/all_history`] = allTenantHistory.length;

    manifest.totalDocuments += allTenantTasks.length + allTenantTakeoffs.length + allTenantPartsRequests.length + allTenantHistory.length;

    fs.writeFileSync(path.join(tenantDir, `all_tasks_aggregated.json`), JSON.stringify(allTenantTasks, null, 2), 'utf8');
    fs.writeFileSync(path.join(tenantDir, `all_takeoffs_aggregated.json`), JSON.stringify(allTenantTakeoffs, null, 2), 'utf8');
    fs.writeFileSync(path.join(tenantDir, `all_parts_requests_aggregated.json`), JSON.stringify(allTenantPartsRequests, null, 2), 'utf8');
    fs.writeFileSync(path.join(tenantDir, `all_history_aggregated.json`), JSON.stringify(allTenantHistory, null, 2), 'utf8');
    fs.writeFileSync(path.join(tenantDir, `jobs_with_subcollections.json`), JSON.stringify(jobs, null, 2), 'utf8');
  }

  // 4. Save Master Dump & Manifest
  console.log(`\nWriting Master Database Dump and Backup Manifest...`);
  fs.writeFileSync(path.join(backupDir, `master_database_dump.json`), JSON.stringify(masterDatabaseDump, null, 2), 'utf8');
  fs.writeFileSync(path.join(backupDir, `manifest.json`), JSON.stringify(manifest, null, 2), 'utf8');

  // Copy Auth Export into Backup Directory
  const authSource = path.resolve(__dirname, '../SAEBackpus/auth_users_export_2026-08-30.json');
  if (fs.existsSync(authSource)) {
    fs.copyFileSync(authSource, path.join(backupDir, 'auth_users.json'));
    console.log(`✅ Copied auth_users.json into backup package.`);
  }

  console.log(`\n=======================================================`);
  console.log(`🎉 FULL FIRESTORE BACKUP COMPLETED SUCCESSFULLY!`);
  console.log(`📊 Total Documents Saved: ${manifest.totalDocuments}`);
  console.log(`📁 Backup Location: ${backupDir}`);
  console.log(`=======================================================\n`);
}

runFullBackup().catch(err => {
  console.error("Backup failed with error:", err);
  process.exit(1);
});
