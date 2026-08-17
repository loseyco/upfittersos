const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'saegroup-c6487';
const DEFAULT_TENANT_ID = '7jlg4IA2G6lvDJ0S5Vbp';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/**
 * Obtain GCP bearer access token via gcloud CLI
 */
function getAccessToken() {
  try {
    return execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (err) {
    console.error('Error: Failed to obtain gcloud access token. Ensure gcloud CLI is authenticated.');
    process.exit(1);
  }
}

/**
 * Make HTTPS request to Firestore REST API
 */
function makeRequest(url, method = 'GET', body = null) {
  const token = getAccessToken();
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
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
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Recursively convert Firestore REST Value objects into standard JS objects/primitives
 */
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

/**
 * Format a raw Firestore document object into clean key-value object with `id`
 */
function parseDoc(doc) {
  if (!doc || !doc.name) return null;
  const docId = doc.name.split('/').pop();
  const fields = doc.fields || {};
  const data = { id: docId };
  for (const k of Object.keys(fields)) {
    data[k] = extractVal(fields[k]);
  }
  if (doc.createTime) data._createTime = doc.createTime;
  if (doc.updateTime) data._updateTime = doc.updateTime;
  return data;
}

/**
 * Resolve target path to full Firestore collection path
 */
function resolveCollectionPath(target) {
  if (!target) return `businesses/${DEFAULT_TENANT_ID}/jobs`;
  if (target.startsWith('/') || target.startsWith('businesses/')) {
    return target.replace(/^\//, '');
  }
  return `businesses/${DEFAULT_TENANT_ID}/${target}`;
}

/**
 * List/fetch documents from a collection with optional limit & page token
 */
async function fetchCollectionDocs(collectionPath, limit = 0) {
  let allDocs = [];
  let pageToken = '';
  do {
    const url = `${BASE_URL}/${collectionPath}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
    const res = await makeRequest(url);
    const docs = (res.documents || []).map(parseDoc);
    allDocs = allDocs.concat(docs);
    pageToken = res.nextPageToken || '';
    if (limit > 0 && allDocs.length >= limit) break;
  } while (pageToken);
  return limit > 0 ? allDocs.slice(0, limit) : allDocs;
}

/**
 * Commands
 */

async function cmdOverview() {
  const collections = ['jobs', 'staff', 'time_sessions', 'vehicles', 'tasks', 'inventory', 'purchase_orders', 'customers', 'qbwc_queue'];
  console.log(`=== LIVE FIRESTORE OVERVIEW (Tenant: ${DEFAULT_TENANT_ID}) ===\n`);
  
  const results = {};
  for (const col of collections) {
    try {
      const colPath = `businesses/${DEFAULT_TENANT_ID}/${col}`;
      const docs = await fetchCollectionDocs(colPath, 300);
      results[col] = docs.length;
      console.log(`  • ${col.padEnd(20)} : ${docs.length} documents (sample up to 300)`);
    } catch (err) {
      console.log(`  • ${col.padEnd(20)} : Error (${err.message.split(':')[0]})`);
    }
  }
  console.log('\nUse "node tools/live-db.js list <collection>" or "node tools/live-db.js search <query>" for details.');
}

async function cmdCount(collectionArg) {
  const colPath = resolveCollectionPath(collectionArg);
  const docs = await fetchCollectionDocs(colPath, 300);
  console.log(`Collection: ${colPath}`);
  console.log(`Count (up to 300 sample): ${docs.length}`);
}

async function cmdList(collectionArg, limit = 10) {
  const colPath = resolveCollectionPath(collectionArg);
  const docs = await fetchCollectionDocs(colPath, limit);
  console.log(`=== Collection: ${colPath} (Showing ${docs.length} docs) ===\n`);
  console.log(JSON.stringify(docs, null, 2));
}

async function cmdGet(docPathArg) {
  let fullPath = docPathArg;
  if (!fullPath.includes('/')) {
    fullPath = `businesses/${DEFAULT_TENANT_ID}/jobs/${docPathArg}`;
  } else if (!fullPath.startsWith('businesses/')) {
    fullPath = `businesses/${DEFAULT_TENANT_ID}/${fullPath}`;
  }
  const url = `${BASE_URL}/${fullPath}`;
  try {
    const rawDoc = await makeRequest(url);
    const doc = parseDoc(rawDoc);
    console.log(`=== Document: ${fullPath} ===\n`);
    console.log(JSON.stringify(doc, null, 2));
  } catch (err) {
    console.error(`Document not found or error: ${err.message}`);
  }
}

async function cmdQuery(collectionArg, field, value, limit = 20) {
  const colPath = resolveCollectionPath(collectionArg);
  const docs = await fetchCollectionDocs(colPath, 300);
  
  const filtered = docs.filter(doc => {
    if (!field) return true;
    const docVal = String(doc[field] || '').toLowerCase();
    return docVal === String(value).toLowerCase();
  }).slice(0, limit);

  console.log(`=== Query ${colPath} where ${field} == "${value}" (${filtered.length} matches) ===\n`);
  console.log(JSON.stringify(filtered, null, 2));
}

async function cmdSearch(searchTerm, collectionArg = null, limit = 20) {
  const term = String(searchTerm).toLowerCase();
  const collections = collectionArg 
    ? [collectionArg]
    : ['jobs', 'staff', 'time_sessions', 'vehicles', 'tasks', 'inventory', 'customers'];

  console.log(`=== Live Search for "${searchTerm}" ===\n`);
  const matches = [];

  for (const col of collections) {
    const colPath = resolveCollectionPath(col);
    try {
      const docs = await fetchCollectionDocs(colPath, 150);
      for (const doc of docs) {
        const jsonStr = JSON.stringify(doc).toLowerCase();
        if (jsonStr.includes(term)) {
          matches.push({ collection: col, doc });
          if (matches.length >= limit) break;
        }
      }
    } catch (e) {
      // ignore collection errors
    }
    if (matches.length >= limit) break;
  }

  console.log(`Found ${matches.length} matching document(s):\n`);
  console.log(JSON.stringify(matches, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ? args[0].toLowerCase() : 'overview';

  try {
    switch (command) {
      case 'overview':
        await cmdOverview();
        break;
      case 'count':
        await cmdCount(args[1]);
        break;
      case 'list': {
        const limitArg = args.find(a => a.startsWith('--limit='));
        const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10;
        await cmdList(args[1], limit);
        break;
      }
      case 'get':
        if (!args[1]) {
          console.error('Usage: node tools/live-db.js get <docPathOrId>');
          process.exit(1);
        }
        await cmdGet(args[1]);
        break;
      case 'query': {
        // Usage: node tools/live-db.js query <collection> <field> <value> [--limit=N]
        const col = args[1];
        const field = args[2];
        const val = args[3];
        const limitArg = args.find(a => a.startsWith('--limit='));
        const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 20;
        await cmdQuery(col, field, val, limit);
        break;
      }
      case 'search': {
        const term = args[1];
        if (!term) {
          console.error('Usage: node tools/live-db.js search <searchTerm> [collection]');
          process.exit(1);
        }
        await cmdSearch(term, args[2]);
        break;
      }
      default:
        console.log(`Unknown command "${command}". Available commands: overview, count, list, get, query, search`);
        break;
    }
  } catch (err) {
    console.error('Fatal error executing live-db command:', err.message || err);
    process.exit(1);
  }
}

main();
