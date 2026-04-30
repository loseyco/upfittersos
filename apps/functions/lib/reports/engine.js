"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAutomatedReports = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
// Trigger every hour to check for reports that need generating
exports.generateAutomatedReports = functions.pubsub.schedule('0 * * * *').onRun(async (context) => {
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
        const requestedMetrics = configStr.metrics || [];
        const collectedData = {};
        const summaryBullets = [];
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
        // --- Metric: Platform Build Logs (Changelogs) ---
        if (requestedMetrics.includes('changelogs')) {
            const clSnap = await db.collection('changelogs')
                .orderBy('createdAt', 'desc')
                .limit(1)
                .get();
            if (!clSnap.empty) {
                const latestLog = clSnap.docs[0].data();
                collectedData['changelogs'] = latestLog;
                let changelogHtml = `
                    <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 24px; margin-top: 24px; font-family: sans-serif;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                            <h3 style="color: #a855f7; margin: 0; font-size: 18px;">🚀 Platform Build Log - ${latestLog.version || 'Latest'}</h3>
                            <span style="background-color: #3b0764; color: #d8b4fe; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: bold;">${latestLog.date || now.toLocaleDateString()}</span>
                        </div>
                        <h4 style="color: #f4f4f5; margin: 0 0 12px 0; font-size: 16px;">${latestLog.title || 'System Updates'}</h4>
                        <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">${latestLog.description || ''}</p>
                `;
                if (latestLog.features && latestLog.features.length > 0) {
                    changelogHtml += `<h5 style="color: #f4f4f5; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 16px 0 8px 0;">✨ System Updates & Features</h5>`;
                    changelogHtml += `<ul style="color: #a1a1aa; font-size: 14px; line-height: 1.6; padding-left: 20px; margin: 0;">`;
                    latestLog.features.forEach((feature) => {
                        changelogHtml += `<li style="margin-bottom: 6px;">${feature}</li>`;
                    });
                    changelogHtml += `</ul>`;
                }
                if (latestLog.fixes && latestLog.fixes.length > 0) {
                    changelogHtml += `<h5 style="color: #f4f4f5; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 8px 0;">🔧 Fixes & Optimizations</h5>`;
                    changelogHtml += `<ul style="color: #a1a1aa; font-size: 14px; line-height: 1.6; padding-left: 20px; margin: 0;">`;
                    latestLog.fixes.forEach((fix) => {
                        changelogHtml += `<li style="margin-bottom: 6px;">${fix}</li>`;
                    });
                    changelogHtml += `</ul>`;
                }
                changelogHtml += `</div>`;
                summaryBullets.push(changelogHtml);
            }
        }
        // Generate final summary HTML using a modern, premium design
        // Extract standard bullet points vs the changelog custom HTML
        const standardBullets = summaryBullets.filter(b => b.startsWith('<li>'));
        const customBlocks = summaryBullets.filter(b => !b.startsWith('<li>'));
        let finalSummary = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #09090b; padding: 40px 20px; border-radius: 16px; border: 1px solid #27272a;">
                
                <div style="text-align: center; margin-bottom: 32px;">
                    <h1 style="color: #fff; font-size: 28px; margin: 0; font-weight: 800; letter-spacing: -0.5px;">Upfitters<span style="color: #a855f7;">OS</span></h1>
                    <p style="color: #71717a; font-size: 14px; margin-top: 8px; text-transform: uppercase; letter-spacing: 2px;">Daily Operations Update</p>
                </div>

                <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                    <p style="color: #d4d4d8; font-size: 16px; line-height: 1.6; margin-top: 0;">
                        For production tasks, continuing using <a href="https://upfittersos.com" style="color: #c084fc; text-decoration: none;">upfittersos.com</a> as the stable environment. Experimental features are at <a href="https://dev.upfittersos.com" style="color: #c084fc; text-decoration: none;">dev.upfittersos.com</a>.
                    </p>
                    <hr style="border: none; border-top: 1px solid #27272a; margin: 20px 0;">
                    
                    <h3 style="color: #f4f4f5; font-size: 16px; margin: 0 0 16px 0;">Data Snapshot (${now.toLocaleDateString()})</h3>
                    ${standardBullets.length > 0 ? `
                        <ul style="color: #a1a1aa; font-size: 15px; line-height: 1.8; padding-left: 20px; margin: 0;">
                            ${standardBullets.join('')}
                        </ul>
                    ` : '<p style="color: #71717a; font-size: 14px; font-style: italic; margin: 0;">No 24-hour metrics requested.</p>'}
                </div>

                ${customBlocks.join('')}
        `;
        // Save generated report snapshot
        const generatedReportData = {
            tenantId,
            configId: doc.id,
            runAt: now.getTime(),
            summary: finalSummary + '</div>', // Temporary closing for DB storage
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
            
            <div style="text-align: center; margin-top: 32px;">
                <a href="${deepLinkUrl}" style="display: inline-block; padding: 14px 28px; background-color: #9333ea; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; transition: background-color 0.2s;">
                    View Full Details on Upfitters OS
                </a>
            </div>
            
            <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px dashed #27272a;">
                <p style="font-size: 11px; color: #52525b; line-height: 1.5; margin: 0;">
                    This automated digest was generated by the System Reporting Engine.<br>
                    Sent on behalf of ${doc.data().creatorEmail || 'Upfitters OS'}.
                </p>
            </div>
            </div> <!-- Close Main Container -->
        `;
        // Dispatch Email using Gmail API (DWD)
        try { // Use the creatorEmail from the config so it appears they sent it to the recipients
            if (configStr.creatorEmail && configStr.recipients && configStr.recipients.length > 0) {
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
        }
        catch (e) {
            console.error("[Reporting Engine] Failed to dispatch DWD email", e);
        }
    }
    return null;
});
//# sourceMappingURL=engine.js.map