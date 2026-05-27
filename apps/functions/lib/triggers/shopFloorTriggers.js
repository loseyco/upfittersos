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
exports.onJobActivityWritten = exports.onJobChatMessageWritten = exports.onJobTaskWritten = exports.onActivityFeedCreated = exports.checkStaleBays = exports.onJobUpdated = exports.onZoneUpdated = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
// Helper to fetch tokens for staff in a tenant based on a specific preference
async function getStaffTokensForEvent(tenantId, prefKey, jobDepartment) {
    const tokens = [];
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
    }
    catch (e) {
        console.error("Error fetching staff tokens", e);
    }
    // Return unique tokens to avoid duplicate sends
    return [...new Set(tokens)];
}
// Triggered when a zone (bay) is updated
exports.onZoneUpdated = functions.firestore.onDocumentUpdated('businesses/{tenantId}/zones/{zoneId}', async (event) => {
    var _a, _b, _c, _d;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    const tenantId = event.params.tenantId;
    const zoneName = (after === null || after === void 0 ? void 0 : after.name) || 'A Bay';
    if (!before || !after)
        return;
    // Check if a new vehicle was put into the bay
    if (after.currentVehicleVin && after.currentVehicleVin !== before.currentVehicleVin) {
        // Check global business setting
        const bDoc = await admin.firestore().collection('businesses').doc(tenantId).get();
        const globalEnabled = (_d = (_c = bDoc.data()) === null || _c === void 0 ? void 0 : _c.globalNotifyBayArrivals) !== null && _d !== void 0 ? _d : true;
        if (!globalEnabled)
            return;
        // Determine department from zone name if possible
        let jobDepartment = undefined;
        const searchStr = zoneName.toLowerCase();
        if (searchStr.includes('fabrication'))
            jobDepartment = 'Fabrication';
        else if (searchStr.includes('f.a.s.t') || searchStr.includes('fast'))
            jobDepartment = 'FAST';
        else if (searchStr.includes('graphics'))
            jobDepartment = 'Graphics';
        else if (searchStr.includes('parts'))
            jobDepartment = 'Parts';
        const tokens = await getStaffTokensForEvent(tenantId, 'notifyBayArrivals', jobDepartment);
        if (tokens.length > 0) {
            let title = 'Vehicle Entered Bay';
            let body = `A vehicle was moved into ${zoneName}.`;
            // Try to get vehicle name
            try {
                const vDoc = await admin.firestore().collection('businesses').doc(tenantId).collection('vehicles').doc(after.currentVehicleVin).get();
                if (vDoc.exists) {
                    const vData = vDoc.data();
                    body = `${(vData === null || vData === void 0 ? void 0 : vData.year) || ''} ${(vData === null || vData === void 0 ? void 0 : vData.make) || ''} ${(vData === null || vData === void 0 ? void 0 : vData.model) || after.currentVehicleVin} is now in ${zoneName}.`;
                }
            }
            catch (e) { }
            const payload = {
                notification: { title, body },
                data: { type: 'bay_arrival', tenantId, zoneId: event.params.zoneId },
                tokens
            };
            await admin.messaging().sendEachForMulticast(payload);
        }
    }
});
// Triggered when a job is updated
exports.onJobUpdated = functions.firestore.onDocumentUpdated('businesses/{tenantId}/jobs/{jobId}', async (event) => {
    var _a, _b, _c, _d;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    const tenantId = event.params.tenantId;
    if (!before || !after)
        return;
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
        }
        else if (after.status === 'Ready for Customer') {
            prefKey = 'notifyReadyForCustomer';
            globalPrefKey = 'globalNotifyReadyForCustomer';
            title = 'Job Ready for Customer';
        }
        else {
            return; // Ignore other status changes
        }
        // Check global business setting
        const bDoc = await admin.firestore().collection('businesses').doc(tenantId).get();
        const globalEnabled = (_d = (_c = bDoc.data()) === null || _c === void 0 ? void 0 : _c[globalPrefKey]) !== null && _d !== void 0 ? _d : true;
        if (!globalEnabled)
            return;
        // Determine department
        let jobDepartment = undefined;
        const searchStr = `${(after.tags || []).join(' ')} ${after.title || ''} ${after.notes || ''}`.toLowerCase();
        if (searchStr.includes('fabrication'))
            jobDepartment = 'Fabrication';
        else if (searchStr.includes('f.a.s.t') || searchStr.includes('fast'))
            jobDepartment = 'FAST';
        else if (searchStr.includes('graphics'))
            jobDepartment = 'Graphics';
        else if (searchStr.includes('parts'))
            jobDepartment = 'Parts';
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
});
// Scheduled function to check for stale bays (runs every 15 minutes)
exports.checkStaleBays = functions.scheduler.onSchedule('every 15 minutes', async (event) => {
    var _a;
    try {
        const businessesSnap = await admin.firestore().collection('businesses').where('status', '==', 'active').get();
        const now = Date.now();
        for (const businessDoc of businessesSnap.docs) {
            const tenantId = businessDoc.id;
            const bData = businessDoc.data();
            // Check global business setting
            const globalEnabled = (_a = bData.globalNotifyStaleBays) !== null && _a !== void 0 ? _a : true;
            if (!globalEnabled)
                continue;
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
            const staleBays = [];
            zonesSnap.forEach(zoneDoc => {
                const zData = zoneDoc.data();
                const lastUpdatedRaw = zData.updatedAt || zData.createdAt;
                if (!lastUpdatedRaw)
                    return;
                const lastUpdatedDate = typeof lastUpdatedRaw.toDate === 'function' ? lastUpdatedRaw.toDate() : new Date(lastUpdatedRaw.seconds ? lastUpdatedRaw.seconds * 1000 : lastUpdatedRaw);
                if (zData.currentVehicleVin && (now - lastUpdatedDate.getTime()) > thresholdMs) {
                    staleCount++;
                    staleBays.push(zData.name || 'A Bay');
                }
            });
            if (staleCount > 0) {
                // Group stale bays by department to send targeted alerts if possible
                const deptMap = {};
                staleBays.forEach(bay => {
                    let dept = 'global';
                    const searchStr = bay.toLowerCase();
                    if (searchStr.includes('fabrication'))
                        dept = 'Fabrication';
                    else if (searchStr.includes('f.a.s.t') || searchStr.includes('fast'))
                        dept = 'FAST';
                    else if (searchStr.includes('graphics'))
                        dept = 'Graphics';
                    else if (searchStr.includes('parts'))
                        dept = 'Parts';
                    if (!deptMap[dept])
                        deptMap[dept] = [];
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
    }
    catch (e) {
        console.error("Error checking stale bays", e);
    }
});
// Triggered when an activity feed item is created (used for Blockers and Missing Parts)
exports.onActivityFeedCreated = functions.firestore.onDocumentCreated('businesses/{tenantId}/activity_feed/{feedId}', async (event) => {
    var _a, _b;
    const docSnap = event.data;
    if (!docSnap)
        return;
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
        }
        else if (isParts) {
            globalPrefKey = 'globalNotifyMissingParts';
            staffPrefKey = 'notifyMissingParts';
            notificationType = 'parts_requested';
        }
        else if (isGeneralUpdate) {
            globalPrefKey = 'globalNotifyBayUpdates';
            staffPrefKey = 'notifyBayUpdates';
            notificationType = 'bay_updated';
        }
        // Check global business setting
        const bDoc = await admin.firestore().collection('businesses').doc(tenantId).get();
        const globalEnabled = (_b = (_a = bDoc.data()) === null || _a === void 0 ? void 0 : _a[globalPrefKey]) !== null && _b !== void 0 ? _b : true;
        if (!globalEnabled)
            return;
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
});
// Triggered when a job's task is created, updated, or deleted
exports.onJobTaskWritten = functions.firestore.onDocumentWritten('businesses/{tenantId}/jobs/{jobId}/tasks/{taskId}', async (event) => {
    const { tenantId, jobId } = event.params;
    const db = admin.firestore();
    try {
        await db.doc(`businesses/${tenantId}/jobs/${jobId}`).update({
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Updated job ${jobId} updatedAt due to task write`);
    }
    catch (e) {
        console.error(`Error updating job ${jobId} updatedAt on task write:`, e);
    }
});
// Triggered when a job's chat message is created, updated, or deleted
exports.onJobChatMessageWritten = functions.firestore.onDocumentWritten('businesses/{tenantId}/jobs/{jobId}/chat_messages/{messageId}', async (event) => {
    const { tenantId, jobId } = event.params;
    const db = admin.firestore();
    try {
        await db.doc(`businesses/${tenantId}/jobs/${jobId}`).update({
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Updated job ${jobId} updatedAt due to chat message write`);
    }
    catch (e) {
        console.error(`Error updating job ${jobId} updatedAt on chat message write:`, e);
    }
});
// Triggered when a job's activity is created, updated, or deleted
exports.onJobActivityWritten = functions.firestore.onDocumentWritten('businesses/{tenantId}/jobs/{jobId}/activity/{activityId}', async (event) => {
    const { tenantId, jobId } = event.params;
    const db = admin.firestore();
    try {
        await db.doc(`businesses/${tenantId}/jobs/${jobId}`).update({
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Updated job ${jobId} updatedAt due to activity write`);
    }
    catch (e) {
        console.error(`Error updating job ${jobId} updatedAt on activity write:`, e);
    }
});
//# sourceMappingURL=shopFloorTriggers.js.map