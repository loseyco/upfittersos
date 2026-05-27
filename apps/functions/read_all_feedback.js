const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  console.log("=== FEEDBACK REPORTS (feedback_reports) ===");
  try {
    const snapshot = await db.collection('feedback_reports').get();
    if (snapshot.empty) {
      console.log("No feedback_reports found.");
    } else {
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(JSON.stringify({ id: doc.id, collection: 'feedback_reports', ...data }, null, 2));
        console.log('---');
      });
    }
  } catch (err) {
    console.error("Error retrieving feedback_reports:", err);
  }

  console.log("\n=== FEEDBACK (feedback) ===");
  try {
    const snapshot = await db.collection('feedback').get();
    if (snapshot.empty) {
      console.log("No feedback found.");
    } else {
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(JSON.stringify({ id: doc.id, collection: 'feedback', ...data }, null, 2));
        console.log('---');
      });
    }
  } catch (err) {
    console.error("Error retrieving feedback:", err);
  }
}

main().catch(console.error).finally(() => process.exit(0));
