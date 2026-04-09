const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'saegroup-c6487' });
const db = admin.firestore();

async function test() {
   try {
       const ref = db.collection('test').doc('test1');
       await ref.set({ time: 'now' });
       
       await db.runTransaction(async (t) => {
           t.update(ref, {
               time: admin.firestore.FieldValue.serverTimestamp()
           });
       });
       console.log("SUCCESS");
   } catch (e) {
       console.error("FAIL", e);
   }
}
test();
