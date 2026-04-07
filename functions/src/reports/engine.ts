import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Trigger every hour to check for reports that need generating
export const generateAutomatedReports = functions.pubsub.schedule('0 * * * *').onRun(async (context) => {
    const db = admin.firestore();
    
    // 1. Determine current hour in target locale
    // We'll use Central Time (America/Chicago) as default based on system context
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const currentTimeString = formatter.format(now); // e.g. "07:00"
    const currentHourString = currentTimeString.split(':')[0]; 

    console.log(`[Reporting Engine] Running at hour ${currentHourString}:00`);

    // 2. Fetch all active report configs natively
    const configsSnap = await db.collection('report_configs')
        .where('isActive', '==', true)
        .get();

    if (configsSnap.empty) {
        console.log('[Reporting Engine] No active configs found.');
        return null;
    }

    const configsConfiguredThisHour = configsSnap.docs.filter(doc => {
        const configTime = doc.data().scheduleTime || '07:00';
        const configHour = configTime.split(':')[0];
        return configHour === currentHourString;
    });

    if (configsConfiguredThisHour.length === 0) {
        console.log(`[Reporting Engine] No active configs scheduled for hour ${currentHourString}.`);
        return null;
    }

    console.log(`[Reporting Engine] Found ${configsConfiguredThisHour.length} config(s) scheduled for this hour.`);

    // 3. Process each config
    const startOfPast24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const doc of configsConfiguredThisHour) {
        const configStr = doc.data();
        const tenantId = configStr.tenantId;
        const requestedMetrics: string[] = configStr.metrics || [];

        const collectedData: any = {};
        const summaryBullets: string[] = [];

        // --- Metric: New Jobs ---
        if (requestedMetrics.includes('new_jobs')) {
            const jobsSnap = await db.collection('jobs')
                .where('tenantId', '==', tenantId)
                .where('createdAt', '>=', startOfPast24h)
                .get();
            collectedData['new_jobs'] = jobsSnap.docs.map(j => ({ id: j.id, title: j.data().title }));
            summaryBullets.push(`<li><b>New Jobs Created:</b> ${jobsSnap.size}</li>`);
        }

        // --- Metric: Active Users / App Sign-ins ---
        if (requestedMetrics.includes('active_users')) {
            const auditSnap = await db.collection('auditLogs')
                .where('tenantId', '==', tenantId)
                .where('action', '==', 'LOGIN')
                .where('timestamp', '>=', startOfPast24h)
                .get();
            // unique UIDs
            const uniqueLogins = new Set(auditSnap.docs.map(a => a.data().actorUid));
            collectedData['active_users'] = uniqueLogins.size;
            summaryBullets.push(`<li><b>Unique User Logins:</b> ${uniqueLogins.size}</li>`);
        }

        // --- Metric: Page Views ---
        if (requestedMetrics.includes('page_views')) {
            const pvSnap = await db.collection('auditLogs')
                .where('tenantId', '==', tenantId)
                .where('action', '==', 'PAGE_VIEW')
                .where('timestamp', '>=', startOfPast24h)
                .get();
            collectedData['page_views'] = pvSnap.size;
            summaryBullets.push(`<li><b>Platform Page Views:</b> ${pvSnap.size}</li>`);
        }

        // --- Metric: New Vehicles ---
        if (requestedMetrics.includes('new_vehicles')) {
            const vSnap = await db.collection('vehicles')
                .where('tenantId', '==', tenantId)
                .where('createdAt', '>=', startOfPast24h)
                .get();
            collectedData['new_vehicles'] = vSnap.docs.map(v => ({ id: v.id, name: v.data().name }));
            summaryBullets.push(`<li><b>New Fleet Vehicles Added:</b> ${vSnap.size}</li>`);
        }

        // Generate final summary HTML
        let finalSummary = `
            <p>Here is your automated report digest for ${now.toLocaleDateString()}:</p>
            <ul>${summaryBullets.join('')}</ul>
            <p>Data reflects the previous 24-hour period.</p>
        `;

        // Save generated report snapshot
        const generatedReportData = {
            tenantId,
            configId: doc.id,
            runAt: now.getTime(),
            summary: finalSummary,
            data: collectedData
        };

        const newReportRef = await db.collection('generated_reports').add(generatedReportData);
        console.log(`[Reporting Engine] Generated Report ID ${newReportRef.id} for config ${doc.id}`);

        // Construct Dashboard Deep Link
        // Determine base URL dynamically or fallback to dev environment
        const baseUrl = process.env.PUBLIC_APP_URL || 'https://dev.upfittersos.com';
        const deepLinkUrl = `${baseUrl}/business/reports/${newReportRef.id}`;

        const emailActionHtml = `
            ${finalSummary}
            <br>
            <a href="${deepLinkUrl}" style="display:inline-block;padding:12px 24px;background-color:#9333ea;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:20px;">
                View Full Details on Upfitters OS
            </a>
            <br>
            <p style="font-size:10px;color:#9ca3af;margin-top:30px;">This automated digest was generated by the System Reporting Engine on behalf of ${doc.data().creatorEmail}.</p>
        `;

        // Dispatch Email using Gmail API (DWD)
        try { // Use the creatorEmail from the config so it appears they sent it to the recipients
             if(configStr.creatorEmail && configStr.recipients && configStr.recipients.length > 0) {
                 console.log(`[Reporting Engine] Domain-Wide-Delegation logic paused. Email template for ${configStr.creatorEmail} queued for manual copy/paste (Size: ${emailActionHtml.length}).`);
                 /*
                 await sendEmailAsUser(
                    configStr.creatorEmail, 
                    configStr.recipients, 
                    `[Automated Digest] ${configStr.name}`, 
                    emailActionHtml
                 );
                 */
             }
        } catch (e) {
             console.error("[Reporting Engine] Failed to dispatch DWD email", e);
        }
    }

    return null;
});
