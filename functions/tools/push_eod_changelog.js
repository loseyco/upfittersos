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
            version: 'v0.1.9-beta',
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            title: 'Advanced Job Pipelines & Time Telemetry',
            description: 'Significant expansion into core business workflows including full Estimate building, active Job ticket management, and granular shop floor time syncing.',
            features: [
                'Deployed the complete Estimate Builder mapping nested Tasks, Parts, and Tech assignments into actionable Work Orders.',
                'Finalized the internal Payroll Management system with real-time currency formatting and secure timesheet locking.',
                'Implemented per-user CompanyCam OAuth syncing and robust QuickBooks Online integration for accurate per-tenant isolation.',
                'Added internal Receiving (Deliveries) module for automated tracking of incoming packages.',
                'Launched the Automated Reporting Engine enabling dynamic business intelligence digests and telemetry data.',
                'Expanded the Blueprint Logic Engine with multi-node manipulation and precise visual state tracking.',
                'Implemented customizable Staff Dashboards enabling personalized card favoriting and reordering.'
            ],
            fixes: [
                'Resolved critical multi-tenant Firestore permission failures across auditLogs and deliveries collections.',
                'Patched Estimate Builder state persistence to prevent data loss during extensive job scope edits.',
                'Fixed CompanyCam per-job sync opt-out logic responding to `skipCompanyCamSync` flags.'
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
