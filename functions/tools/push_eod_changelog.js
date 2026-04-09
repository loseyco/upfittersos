const admin = require('firebase-admin');

// Initialize with Application Default Credentials
admin.initializeApp({
  projectId: "saegroup-c6487" // hardcoding just in case ADC doesn't infer it correctly, but usually ADC provides everything
});

const db = admin.firestore();

async function pushChangelog() {
    try {
        console.log("Pushing End-of-Day Changelog via Admin SDK...");
        await db.collection('changelogs').add({
            version: 'v0.1.10-beta',
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            title: 'Purchase Orders, Facility Mapping & Quoting Upgrades',
            description: 'Major feature additions to the estimating workflow, interactive facility map navigation, logistics coordination, and comprehensive staff tracking elements.',
            features: [
                'Introduced complete Purchase Order tracking workflow with dynamic delivery receiving integration.',
                'Overhauled the Estimate Builder into an optimized 2-column layout for smoother part cost editing and profit tracking.',
                'Deployed granular Facility Area Profiles allowing interactive real-time map occupancy reporting and deep-linking.',
                'Completed native CompanyCam integration facilitating user-uploaded images and instantaneous optimistic syncs within job profiles.',
                'Updated the TimeClock app to report transparent Pay Period statistics alongside comprehensive staff department routing.',
                'Built new wholesale cost matrices and conditional line-item discounts enhancing robust financial planning for all projects.'
            ],
            fixes: [
                'Resolved compilation boundaries generated during complex CSS structure modifications of core interfaces.'
            ],
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log("Successfully pushed changelog!");
        process.exit(0);
    } catch (e) {
        console.error("Failed to push changelog:", e);
        process.exit(1);
    }
}

pushChangelog();
