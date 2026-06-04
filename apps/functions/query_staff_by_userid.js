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

  const adrianDocId = 'guD1vlbwo44sSpWaPtnh';
  const adrianUid = '3xYvYIOXGVNyaHxfUYXh0LjyRlx1';
  
  // Use Firestore REST runQuery
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  
  const queryPayload = {
    structuredQuery: {
      from: [{ collectionId: 'tasks', allDescendants: true }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'tenantId' },
                op: 'EQUAL',
                value: { stringValue: tenantId }
              }
            },
            {
              fieldFilter: {
                field: { fieldPath: 'assignedStaffIds' },
                op: 'ARRAY_CONTAINS',
                value: { stringValue: adrianUid }
              }
            }
          ]
        }
      }
    }
  };

  const makePostRequest = (url, token, payload) => {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
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
      req.write(JSON.stringify(payload));
      req.end();
    });
  };

  console.log("Querying tasks containing UID...");
  const resUid = await makePostRequest(url, token, queryPayload);
  console.log(`Found ${resUid.length} results.`);
  resUid.forEach((r, idx) => {
    if (r.document) {
      const fields = r.document.fields || {};
      console.log(`[${idx}] JobID: ${r.document.name.split('/')[8]} | Task: ${fields.title?.stringValue} | Status: ${fields.status?.stringValue}`);
    }
  });

  console.log("\nQuerying tasks containing DocID...");
  queryPayload.structuredQuery.where.compositeFilter.filters[1].fieldFilter.value.stringValue = adrianDocId;
  const resDoc = await makePostRequest(url, token, queryPayload);
  console.log(`Found ${resDoc.length} results.`);
  resDoc.forEach((r, idx) => {
    if (r.document) {
      const fields = r.document.fields || {};
      console.log(`[${idx}] JobID: ${r.document.name.split('/')[8]} | Task: ${fields.title?.stringValue} | Status: ${fields.status?.stringValue}`);
    }
  });
}

main().catch(console.error);
