const admin = require('firebase-admin');
admin.initializeApp({ projectId: "saegroup-c6487" });
const db = admin.firestore();

async function main() {
    console.log("Fetching feedback...");
    try {
        const snapshot = await db.collection('feedback').where('type', 'in', ['bug', 'feature']).get();
        if (snapshot.empty) {
            console.log("No bugs found.");
            return;
        }
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`[${data.type}] ID: ${doc.id}`);
            console.log(`Title: ${data.title}`);
            console.log(`Status: ${data.status}`);
            console.log(`Description: ${data.description}`);
            console.log('-------------------------');
        });
    } catch (err) {
        console.error("Error retrieving bugs:", err);
    }
}
main();
