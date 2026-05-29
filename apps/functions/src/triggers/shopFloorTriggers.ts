import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

// Helper to fetch tokens for staff in a tenant based on a specific preference
async function getStaffTokensForEvent(tenantId: string, prefKey: string, jobDepartment?: string): Promise<string[]> {
    const tokens: string[] = [];
    try {
        const staffSnap = await admin.firestore()
            .collection('businesses')
            .doc(tenantId)
            .collection('staff')
            .where('status', '==', 'active')
            .get();

        staffSnap.forEach(doc => {
            const data = doc.data();
            const prefs = data.notificationPreferences || {};
            
            // Default to true if the preference hasn't been set yet, or false if we want opt-in
            // We'll go with opt-in for these to prevent spam, or check if they are a manager
            const isManager = data.role === 'manager' || data.role === 'business_owner';
            const wantsNotification = prefs[prefKey] === true || (prefs[prefKey] === undefined && isManager);

            if (wantsNotification) {
                // If a job department is specified, check department filters
                if (jobDepartment) {
                    const deptFiltersEnabled = prefs['dept_fabrication'] || prefs['dept_fast'] || prefs['dept_graphics'] || prefs['dept_parts'];
                    if (deptFiltersEnabled) {
                        const deptKey = `dept_${jobDepartment.toLowerCase().replace(/[^a-z]/g, '')}`;
                        if (!prefs[deptKey]) {
                            return; // User has dept filters on, but NOT for this department
                        }
                    }
                }

                if (Array.isArray(data.fcmTokens) && data.fcmTokens.length > 0) {
                    tokens.push(...data.fcmTokens);
                }
            }
        });
    } catch (e) {
        console.error("Error fetching staff tokens", e);
    }
    // Return unique tokens to avoid duplicate sends
    return [...new Set(tokens)];
}

// Triggered when a zone (bay) is updated
export const onZoneUpdated = functions.firestore.onDocumentUpdated(
    'businesses/{tenantId}/zones/{zoneId}',
    async (event) => {
        const before = event.data?.before.data();
        const after = event.data?.after.data();
        const tenantId = event.params.tenantId;
        const zoneName = after?.name || 'A Bay';

        if (!before || !after) return;

        // Check if a new vehicle was put into the bay
        if (after.currentVehicleVin && after.currentVehicleVin !== before.currentVehicleVin) {
            
            // Check global business setting
            const bDoc = await admin.firestore().collection('businesses').doc(tenantId).get();
            const globalEnabled = bDoc.data()?.globalNotifyBayArrivals ?? true;
            if (!globalEnabled) return;
            
            // Determine department from zone name if possible
            let jobDepartment = undefined;
            const searchStr = zoneName.toLowerCase();
            if (searchStr.includes('fabrication')) jobDepartment = 'Fabrication';
            else if (searchStr.includes('f.a.s.t') || searchStr.includes('fast')) jobDepartment = 'FAST';
            else if (searchStr.includes('graphics')) jobDepartment = 'Graphics';
            else if (searchStr.includes('parts')) jobDepartment = 'Parts';

            const tokens = await getStaffTokensForEvent(tenantId, 'notifyBayArrivals', jobDepartment);
            
            if (tokens.length > 0) {
                let title = 'Vehicle Entered Bay';
                let body = `A vehicle was moved into ${zoneName}.`;
                
                // Try to get vehicle name
                try {
                    const vDoc = await admin.firestore().collection('businesses').doc(tenantId).collection('vehicles').doc(after.currentVehicleVin).get();
                    if (vDoc.exists) {
                        const vData = vDoc.data();
                        body = `${vData?.year || ''} ${vData?.make || ''} ${vData?.model || after.currentVehicleVin} is now in ${zoneName}.`;
                    }
                } catch (e) {}

                const payload = {
                    notification: { title, body },
                    data: { type: 'bay_arrival', tenantId, zoneId: event.params.zoneId },
                    tokens
                };
                
                await admin.messaging().sendEachForMulticast(payload);
            }
        }
    }
);

// Triggered when a job is updated
export const onJobUpdated = functions.firestore.onDocumentUpdated(
    'businesses/{tenantId}/jobs/{jobId}',
    async (event) => {
        const before = event.data?.before.data();
        const after = event.data?.after.data();
        const tenantId = event.params.tenantId;

        if (!before || !after) return;

        // Check if status changed
        if (before.status !== after.status) {
            let prefKey = '';
            let globalPrefKey = '';
            let title = '';
            let body = `Job for ${after.customerName || 'Customer'} has been updated to ${after.status}.`;
            
            if (after.status === 'Ready for QA') {
                prefKey = 'notifyReadyForQA';
                globalPrefKey = 'globalNotifyReadyForQA';
                title = 'Job Ready for QA';
            } else if (after.status === 'Ready for Customer') {
                prefKey = 'notifyReadyForCustomer';
                globalPrefKey = 'globalNotifyReadyForCustomer';
                title = 'Job Ready for Customer';
            } else {
                return; // Ignore other status changes
            }

            // Check global business setting
            const bDoc = await admin.firestore().collection('businesses').doc(tenantId).get();
            const globalEnabled = bDoc.data()?.[globalPrefKey] ?? true;
            if (!globalEnabled) return;

            // Determine department
            let jobDepartment = undefined;
            const searchStr = `${(after.tags || []).join(' ')} ${after.title || ''} ${after.notes || ''}`.toLowerCase();
            if (searchStr.includes('fabrication')) jobDepartment = 'Fabrication';
            else if (searchStr.includes('f.a.s.t') || searchStr.includes('fast')) jobDepartment = 'FAST';
            else if (searchStr.includes('graphics')) jobDepartment = 'Graphics';
            else if (searchStr.includes('parts')) jobDepartment = 'Parts';

            const tokens = await getStaffTokensForEvent(tenantId, prefKey, jobDepartment);
            
            if (tokens.length > 0) {
                const payload = {
                    notification: { title, body },
                    data: { type: 'job_status', tenantId, jobId: event.params.jobId },
                    tokens
                };
                
                await admin.messaging().sendEachForMulticast(payload);
            }
        }
    }
);

// Scheduled function to check for stale bays (runs every 15 minutes)
export const checkStaleBays = functions.scheduler.onSchedule('every 15 minutes', async (event) => {
    try {
        const businessesSnap = await admin.firestore().collection('businesses').where('status', '==', 'active').get();
        const now = Date.now();

        for (const businessDoc of businessesSnap.docs) {
            const tenantId = businessDoc.id;
            const bData = businessDoc.data();
            
            // Check global business setting
            const globalEnabled = bData.globalNotifyStaleBays ?? true;
            if (!globalEnabled) continue;

            const thresholdHours = bData.monitorStaleThreshold || 24;
            const thresholdMs = thresholdHours * 60 * 60 * 1000;

            const zonesSnap = await admin.firestore()
                .collection('businesses')
                .doc(tenantId)
                .collection('zones')
                .where('isArchived', '==', false)
                .where('type', '==', 'bay')
                .get();

            let staleCount = 0;
            const staleBays: string[] = [];

            zonesSnap.forEach(zoneDoc => {
                const zData = zoneDoc.data();
                const lastUpdatedRaw = zData.updatedAt || zData.createdAt;
                if (!lastUpdatedRaw) return;
                
                const lastUpdatedDate = typeof lastUpdatedRaw.toDate === 'function' ? lastUpdatedRaw.toDate() : new Date(lastUpdatedRaw.seconds ? lastUpdatedRaw.seconds * 1000 : lastUpdatedRaw);
                
                if (zData.currentVehicleVin && (now - lastUpdatedDate.getTime()) > thresholdMs) {
                    staleCount++;
                    staleBays.push(zData.name || 'A Bay');
                }
            });

            if (staleCount > 0) {
                // Group stale bays by department to send targeted alerts if possible
                const deptMap: Record<string, string[]> = {};
                staleBays.forEach(bay => {
                    let dept = 'global';
                    const searchStr = bay.toLowerCase();
                    if (searchStr.includes('fabrication')) dept = 'Fabrication';
                    else if (searchStr.includes('f.a.s.t') || searchStr.includes('fast')) dept = 'FAST';
                    else if (searchStr.includes('graphics')) dept = 'Graphics';
                    else if (searchStr.includes('parts')) dept = 'Parts';

                    if (!deptMap[dept]) deptMap[dept] = [];
                    deptMap[dept].push(bay);
                });

                for (const [dept, bays] of Object.entries(deptMap)) {
                    const tokens = await getStaffTokensForEvent(tenantId, 'notifyStaleBays', dept === 'global' ? undefined : dept);
                    if (tokens.length > 0) {
                        const payload = {
                            notification: { 
                                title: 'Stale Bays Alert', 
                                body: `${bays.length} bay(s) (${bays.join(', ')}) have been occupied without updates for over ${thresholdHours} hours.` 
                            },
                            data: { type: 'stale_bays', tenantId },
                            tokens
                        };
                        
                        await admin.messaging().sendEachForMulticast(payload);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error checking stale bays", e);
    }
});

// Triggered when an activity feed item is created (used for Blockers and Missing Parts)
export const onActivityFeedCreated = functions.firestore.onDocumentCreated(
    'businesses/{tenantId}/activity_feed/{feedId}',
    async (event) => {
        const docSnap = event.data;
        if (!docSnap) return;

        const data = docSnap.data();
        const tenantId = event.params.tenantId;

        // Ensure we only trigger for specific titles to prevent spam
        const isBlocker = data.title === 'Blocker Added';
        const isParts = data.title === 'Parts Requested';
        const isGeneralUpdate = data.title === 'Bay Updated' || data.title === 'Note Added' || data.title === 'ETA Updated';

        if (isBlocker || isParts || isGeneralUpdate) {
            let globalPrefKey = '';
            let staffPrefKey = '';
            let notificationType = '';

            if (isBlocker) {
                globalPrefKey = 'globalNotifyBlockers';
                staffPrefKey = 'notifyBlockers';
                notificationType = 'blocker_added';
            } else if (isParts) {
                globalPrefKey = 'globalNotifyMissingParts';
                staffPrefKey = 'notifyMissingParts';
                notificationType = 'parts_requested';
            } else if (isGeneralUpdate) {
                globalPrefKey = 'globalNotifyBayUpdates';
                staffPrefKey = 'notifyBayUpdates';
                notificationType = 'bay_updated';
            }

            // Check global business setting
            const bDoc = await admin.firestore().collection('businesses').doc(tenantId).get();
            const globalEnabled = bDoc.data()?.[globalPrefKey] ?? true;
            if (!globalEnabled) return;

            // Fetch tokens - we won't filter by department here since these are urgent issues,
            // or we could try to extract department from the message, but these are generally universal issues
            // that managers should know about regardless of department.
            const tokens = await getStaffTokensForEvent(tenantId, staffPrefKey);

            if (tokens.length > 0) {
                const payload = {
                    notification: { 
                        title: data.title, 
                        body: data.message || `A new issue was reported.`
                    },
                    data: { type: notificationType, tenantId },
                    tokens
                };
                
                await admin.messaging().sendEachForMulticast(payload);
            }
        }
    }
);

// Triggered when a job's task is created, updated, or deleted
export const onJobTaskWritten = functions.firestore.onDocumentWritten(
    'businesses/{tenantId}/jobs/{jobId}/tasks/{taskId}',
    async (event) => {
        const { tenantId, jobId } = event.params;
        const db = admin.firestore();
        try {
            await db.doc(`businesses/${tenantId}/jobs/${jobId}`).update({
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Updated job ${jobId} updatedAt due to task write`);

            // Proactive Server-Side Progression & Regression Sync
            const jobRef = db.collection('businesses').doc(tenantId).collection('jobs').doc(jobId);
            const jobSnap = await jobRef.get();
            if (!jobSnap.exists) return;

            const jobData = jobSnap.data();
            const currentJobStatus = jobData?.status;
            if (!currentJobStatus) return;

            // Fetch all tasks for this job
            const tasksSnap = await jobRef.collection('tasks').get();
            const tasks = tasksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const nonGeneralTasks = tasks.filter((t: any) => t.title !== 'General');
            if (nonGeneralTasks.length === 0) return;

            const allQCReady = nonGeneralTasks.every((t: any) => t.status === 'QC' || t.status === 'QC Complete');
            const allQCComplete = nonGeneralTasks.every((t: any) => t.status === 'QC Complete');

            let newStatus: string | null = null;

            // 1. Forward progression (Active, Open, Ready for QA)
            if (['Active', 'Open', 'Ready for QA'].includes(currentJobStatus)) {
                if (allQCComplete) {
                    newStatus = 'Ready for Customer';
                } else if (allQCReady) {
                    newStatus = 'Ready for QA';
                }
            }

            // 2. Backward regression (Ready for Customer, Ready for QA)
            if (['Ready for Customer', 'Ready for QA'].includes(currentJobStatus)) {
                if (!allQCReady) {
                    newStatus = 'Active';
                } else if (currentJobStatus === 'Ready for Customer' && !allQCComplete) {
                    newStatus = 'Ready for QA';
                }
            }

            if (newStatus && newStatus !== currentJobStatus) {
                await jobRef.update({
                    status: newStatus,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`Auto-synced job ${jobId} status from ${currentJobStatus} to ${newStatus} on task write`);
            }
        } catch (e) {
            console.error(`Error updating job ${jobId} updatedAt or syncing status on task write:`, e);
        }
    }
);

// Triggered when a job's chat message is created, updated, or deleted
export const onJobChatMessageWritten = functions.firestore.onDocumentWritten(
    'businesses/{tenantId}/jobs/{jobId}/chat_messages/{messageId}',
    async (event) => {
        const { tenantId, jobId } = event.params;
        const db = admin.firestore();
        try {
            await db.doc(`businesses/${tenantId}/jobs/${jobId}`).update({
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Updated job ${jobId} updatedAt due to chat message write`);
        } catch (e) {
            console.error(`Error updating job ${jobId} updatedAt on chat message write:`, e);
        }
    }
);

// Triggered when a job's activity is created, updated, or deleted
export const onJobActivityWritten = functions.firestore.onDocumentWritten(
    'businesses/{tenantId}/jobs/{jobId}/activity/{activityId}',
    async (event) => {
        const { tenantId, jobId } = event.params;
        const db = admin.firestore();
        try {
            await db.doc(`businesses/${tenantId}/jobs/${jobId}`).update({
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Updated job ${jobId} updatedAt due to activity write`);
        } catch (e) {
            console.error(`Error updating job ${jobId} updatedAt on activity write:`, e);
        }
    }
);
