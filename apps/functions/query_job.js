const https = require('https');

const apiKey = 'AIzaSyCXCkX5ddcni6L-tYsFHsZIUowwQrvtBwM';

function getAuthToken() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      email: 'monitor@saegrp.com',
      password: 'ShopDisplay2026!',
      returnSecureToken: true
    });

    const req = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path: `/v1/accounts:signInWithPassword?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.idToken) {
            resolve(parsed.idToken);
          } else {
            reject(new Error("Sign in failed: " + data));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function fetchFirestore(idToken, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/saegroup-c6487/databases/(default)/documents${path}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    const idToken = await getAuthToken();
    const businessId = '7jlg4IA2G6lvDJ0S5Vbp';
    
    console.log("Fetching vehicle 1UXMMYMVE7J8AOVABYSP...");
    const vehicle1 = await fetchFirestore(idToken, `/businesses/${businessId}/vehicles/1UXMMYMVE7J8AOVABYSP`);
    console.log("Vehicle 1 raw:", JSON.stringify(vehicle1, null, 2));

    console.log("Fetching vehicle 1uXmmYmVE7J8AoVaBYsP...");
    const vehicle2 = await fetchFirestore(idToken, `/businesses/${businessId}/vehicles/1uXmmYmVE7J8AoVaBYsP`);
    console.log("Vehicle 2 raw:", JSON.stringify(vehicle2, null, 2));

  } catch (e) {
    console.error("Error:", e);
  }
}

main();
