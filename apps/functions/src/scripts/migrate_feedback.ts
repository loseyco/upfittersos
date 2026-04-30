import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
      projectId: "saegroup-c6487",
    });
}

const db = admin.firestore();

async function run() {
    console.log("Locating primary target account: p.losey@saegrp.com");
    const usersSnap = await db.collection('users').where('email', '==', 'p.losey@saegrp.com').get();
    
    if (usersSnap.empty) {
        console.error("Could not find user p.losey@saegrp.com in the users collection.");
        return;
    }
    
    const realUserDoc = usersSnap.docs[0];
    const realUser = realUserDoc.data();
    
    console.log(`Successfully acquired primary user identity: ${realUserDoc.id} | ${realUser.displayName}`);

    const feedbackSnap = await db.collection('feedback').get();
    let updatedFeedback = 0;
    let updatedComments = 0;
    
    for (const doc of feedbackSnap.docs) {
        // Always overwrite to ensure complete synchronization and cleanup
        await doc.ref.update({
            authorId: realUserDoc.id,
            authorName: realUser.displayName || 'Preston Losey',
            authorEmail: 'p.losey@saegrp.com',
            authorPhoto: realUser.photoURL || null
        });
        updatedFeedback++;
        
        // Now sync any comments in this feedback
        const commentsSnap = await doc.ref.collection('comments').get();
        for (const commentDoc of commentsSnap.docs) {
            await commentDoc.ref.update({
                authorId: realUserDoc.id,
                authorName: realUser.displayName || 'Preston Losey',
                authorPhoto: realUser.photoURL || null
            });
            updatedComments++;
        }
    }
    
    console.log(`\n========================================`);
    console.log(`MIGRATION SCRIPT COMPLETED SUCCESSFULLY.`);
    console.log(`Migrated Feedback Entries: ${updatedFeedback}`);
    console.log(`Migrated Comment Logs: ${updatedComments}`);
    console.log(`All testing traces now assigned to primary owner.`);
    console.log(`========================================\n`);
}

run().catch(console.error);
