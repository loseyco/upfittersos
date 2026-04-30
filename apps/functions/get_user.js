const admin = require('firebase-admin');

// We need a service account key or GOOGLE_APPLICATION_CREDENTIALS
// Let's see if initializing without args works in the environment
try {
  admin.initializeApp();
} catch (e) {
  console.log("Initialize error:", e);
}

const email = 'loseyp@gmail.com';

async function main() {
  try {
    const user = await admin.auth().getUserByEmail(email);
    console.log("User UID:", user.uid);
    console.log("Current Claims:", user.customClaims);
  } catch (error) {
    console.error("Error fetching user:", error);
  }
}

main();
