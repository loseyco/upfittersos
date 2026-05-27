const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

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
    const options = {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
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
  
  const allReports = [];

  console.log("Fetching feedback_reports...");
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/feedback_reports?pageSize=100`;
    const res = await makeRequest(url, token);
    if (res.documents) {
      res.documents.forEach(doc => {
        const fields = doc.fields || {};
        const data = { id: doc.name.split('/').pop(), collection: 'feedback_reports' };
        for (const k in fields) {
          data[k] = extractVal(fields[k]);
        }
        allReports.push(data);
      });
    }
  } catch (err) {
    console.error("Error fetching feedback_reports:", err.message);
  }

  console.log("Fetching feedback...");
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/feedback?pageSize=100`;
    const res = await makeRequest(url, token);
    if (res.documents) {
      res.documents.forEach(doc => {
        const fields = doc.fields || {};
        const data = { id: doc.name.split('/').pop(), collection: 'feedback' };
        for (const k in fields) {
          data[k] = extractVal(fields[k]);
        }
        allReports.push(data);
      });
    }
  } catch (err) {
    console.error("Error fetching feedback:", err.message);
  }

  const outputPath = path.join(__dirname, 'all_feedback.json');
  fs.writeFileSync(outputPath, JSON.stringify(allReports, null, 2));
  console.log(`Saved ${allReports.length} feedback items to ${outputPath}`);
}

main();
