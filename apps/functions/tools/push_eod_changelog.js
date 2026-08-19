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
            version: 'v0.1.12-beta',
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            title: 'Real-Time Cross-Tab Timeclock Sync & Window Wakeup Engine',
            description: 'Implemented real-time bidirectional Firestore session synchronization, BroadcastChannel cross-tab communication, and window focus/visibility wakeup hooks to eliminate stale clock status across multiple browser tabs.',
            features: [
                'Deployed BroadcastChannel cross-tab synchronization broadcasting clock status, breaks, and shifts in sub-millisecond real time.',
                'Replaced one-off mount queries in TimeClockBar and UserMissionControl with continuous Firestore onSnapshot listeners.',
                'Added window focus and document visibilitychange wakeup listeners that instantly verify Firestore ground truth when switching back to background tabs.',
                'Added dynamic session fallback in useJobClock ensuring uninterrupted job clocking even during network reconnects or tab rehydration.'
            ],
            fixes: [
                'Resolved stale clock-in / clock-out state desynchronization when opening old browser tabs or background windows.'
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
