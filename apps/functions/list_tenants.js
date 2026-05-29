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

async function main() {
  const token = getAccessToken();
  const projectId = 'saegroup-c6487';
  
  console.log("Fetching all businesses from Firestore...");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/businesses`;
  const res = await makeRequest(url, token);
  
  if (res.documents) {
    res.documents.forEach(doc => {
      console.log(`Document Path: ${doc.name}`);
      console.log(`Business Name:`, doc.fields?.name?.stringValue || doc.fields?.companyName?.stringValue || 'N/A');
    });
  } else {
    console.log("No businesses found!");
  }
}

main().catch(console.error);
