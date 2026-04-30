const admin = require('firebase-admin');

admin.initializeApp({
  projectId: "saegroup-c6487" 
});

const db = admin.firestore();

async function backdateQA() {
    try {
        console.log("Looking for Intoxalock job...");
        const jobsRef = db.collection('jobs');
        // Let's just find a job with a task that is "Ready for QA"
        const snapshot = await jobsRef.get();
        let updatedCount = 0;
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            let needsUpdate = false;
            const updatedTasks = (data.tasks || []).map(task => {
                if (task.status === 'Ready for QA' && task.title && task.title.includes('Device Removal')) {
                    // Backdate by 3 hours
                    const pastTime = new Date(Date.now() - (1000 * 60 * 60 * 2.5)); // 2.5 hours ago
                    task.readyForQaAt = pastTime.toISOString();
                    needsUpdate = true;
                    console.log(`Backdated task in job: ${data.title}`);
                }
                return task;
            });
            
            if (needsUpdate) {
                await doc.ref.update({ tasks: updatedTasks });
                updatedCount++;
            }
        }
        console.log(`Successfully updated ${updatedCount} jobs with a backdated QA time.`);
        process.exit(0);
    } catch (e) {
        console.error("Failed:", e);
        process.exit(1);
    }
}

backdateQA();
