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
            version: 'v0.1.11-beta',
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            title: 'Job Details V3 Printout, Task Assignment Clock-In Gating & Dedicated History Hub',
            description: 'Comprehensive enhancements to the Job Details V3 interface, technician assignment verification, automated task clock-outs, active bay duration tracking, and full chronological timeline audit logs.',
            features: [
                'Added print-ready Job Details Sheet matching classic shop traveler specifications.',
                'Enforced active staff roster filtering across multi-staff task assignment pickers with selected staff pinned to top.',
                'Restricted task clock-in and task completion actions to assigned technicians with automated clock-out on completion.',
                'Integrated continuous bay telemetry calculation preserving uninterrupted shop floor durations across job edits.',
                'Launched top-level dedicated Job History & Audit Log tab and overview timeline card streaming real-time actions.',
                'Standardized operator attribution across all job/task mutations for consistent Daily Operations Log reporting.'
            ],
            fixes: [
                'Resolved bay occupancy timer reset anomaly on job document updates.',
                'Fixed auto-clock-out cascades when starting lunch, break, or ending shift.'
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
