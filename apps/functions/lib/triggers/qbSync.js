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
exports.onQbTimeTrackingWrite = exports.onQbEmployeeWrite = exports.onQbJobWrite = exports.onQbCustomerWrite = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const parseTimestamp = (val) => {
    if (!val)
        return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : admin.firestore.Timestamp.fromDate(d);
};
/**
 * Trigger: When a document in qb_customers is created or updated.
 * Goal: Promote to the clean 'customers' collection.
 */
exports.onQbCustomerWrite = functions.firestore
    .document('businesses/{tenantId}/qb_customers/{customerId}')
    .onWrite(async (change, context) => {
    const { tenantId, customerId } = context.params;
    // If deleted, we don't necessarily delete the native customer profile
    if (!change.after.exists)
        return null;
    const data = change.after.data();
    if (!data)
        return null;
    const timeModified = parseTimestamp(data.TimeModified) || admin.firestore.FieldValue.serverTimestamp();
    const timeCreated = parseTimestamp(data.TimeCreated) || admin.firestore.FieldValue.serverTimestamp();
    // Map to V2 Customer Schema
    const mappedData = {
        firstName: data.FirstName || '',
        lastName: data.LastName || '',
        company: data.CompanyName || '',
        email: data.Email || '',
        mobilePhone: data.Phone || '',
        status: data.IsActive === 'true' ? 'Active' : 'Inactive',
        quickbooksId: data.ListID || data.qb_ListID || '',
        source: 'QuickBooks',
        tags: admin.firestore.FieldValue.arrayUnion('QuickBooks'),
        notes: 'Imported via QBWC.',
        createdAt: timeCreated,
        updatedAt: timeModified
    };
    const destRef = admin.firestore().collection('businesses').doc(tenantId).collection('customers').doc(customerId);
    try {
        await destRef.set(mappedData, { merge: true });
        console.log(`Successfully promoted QB Customer ${customerId} to native customers in tenant ${tenantId}`);
    }
    catch (err) {
        console.error(`Failed to promote customer ${customerId}`, err);
    }
    return null;
});
/**
 * Trigger: When a document in qb_jobs is created or updated.
 * Goal: Promote to 'jobs' AND extract 'vehicles'.
 */
exports.onQbJobWrite = functions.firestore
    .document('businesses/{tenantId}/qb_jobs/{jobId}')
    .onWrite(async (change, context) => {
    const { tenantId, jobId } = context.params;
    // If deleted, we don't necessarily delete the native job or vehicle
    if (!change.after.exists)
        return null;
    const data = change.after.data();
    if (!data)
        return null;
    // 1. Vehicle Extraction Logic (Run first so we can link it to the job)
    let vData = null;
    if (data.vehicle) {
        try {
            vData = typeof data.vehicle === 'string' ? JSON.parse(data.vehicle) : data.vehicle;
        }
        catch (e) {
            console.error(`Failed to parse vehicle JSON for job ${jobId}`, e);
        }
    }
    else if (data.qbCustomFields) {
        try {
            const cf = typeof data.qbCustomFields === 'string' ? JSON.parse(data.qbCustomFields) : data.qbCustomFields;
            if (cf['VIN num'] || cf['Vehicle Make']) {
                vData = {
                    vin: (cf['VIN num'] || '').trim().toUpperCase(),
                    make: (cf['Vehicle Make'] || '').trim(),
                    model: (cf['Vehicle Model'] || '').trim(),
                    year: (cf['Vehicle Year'] || '').trim()
                };
            }
        }
        catch (e) {
            console.error(`Failed to parse qbCustomFields JSON for job ${jobId}`, e);
        }
    }
    const vin = (vData === null || vData === void 0 ? void 0 : vData.vin) || null;
    const qbJobNumber = data.JobNumber || (data.Name && /^\d+$/.test(data.Name) ? data.Name : null);
    // Extract customer name from FullName (format: "Customer:JobName" or "Parent:Customer:Job")
    let qbCustomerName = null;
    if (data.FullName && data.FullName.includes(':')) {
        const parts = data.FullName.split(':');
        qbCustomerName = parts[0]; // Take the top-level customer
    }
    else if (data.CompanyName) {
        qbCustomerName = data.CompanyName;
    }
    const timeModified = parseTimestamp(data.TimeModified) || admin.firestore.FieldValue.serverTimestamp();
    const timeCreated = parseTimestamp(data.TimeCreated) || admin.firestore.FieldValue.serverTimestamp();
    // 2. Promote to Job Collection (V2 Schema)
    const jobMappedData = {
        title: data.Name || data.FullName || 'Untitled Job',
        jobNumber: qbJobNumber || null,
        customerName: qbCustomerName || data.CompanyName || null,
        customerId: data.parentRefId || '',
        status: data.IsActive === 'true' ? 'Active' : 'Inactive',
        quickbooksId: data.ListID || data.qb_ListID || '',
        source: 'QuickBooks',
        tags: admin.firestore.FieldValue.arrayUnion('QuickBooks'),
        notes: 'Imported via QBWC.',
        vehicleId: vin, // Store the link!
        createdAt: timeCreated,
        updatedAt: timeModified
    };
    let jobDestRef = admin.firestore().collection('businesses').doc(tenantId).collection('jobs').doc(jobId);
    let matchedDoc = null;
    // 1. Try matching by Job Number first
    if (qbJobNumber) {
        try {
            const existingQuery = await admin.firestore().collection('businesses').doc(tenantId).collection('jobs')
                .where('jobNumber', '==', String(qbJobNumber))
                .limit(1)
                .get();
            if (!existingQuery.empty) {
                matchedDoc = existingQuery.docs[0];
                jobDestRef = matchedDoc.ref;
                console.log(`Merging QB Job ${jobId} into existing job ${jobDestRef.id} via job number ${qbJobNumber}`);
            }
        }
        catch (err) {
            console.error(`Failed to check for existing job with number ${qbJobNumber}`, err);
        }
    }
    // 2. Fallback to matching by title/name (case-sensitive exact match)
    if (!matchedDoc) {
        try {
            const titleMatches = [data.Name, data.FullName].filter(Boolean);
            for (const t of titleMatches) {
                const titleQuery = await admin.firestore().collection('businesses').doc(tenantId).collection('jobs')
                    .where('title', '==', t)
                    .limit(1)
                    .get();
                if (!titleQuery.empty) {
                    matchedDoc = titleQuery.docs[0];
                    jobDestRef = matchedDoc.ref;
                    console.log(`Merging QB Job ${jobId} into existing job ${jobDestRef.id} via title matching "${t}"`);
                    break;
                }
            }
        }
        catch (err) {
            console.error(`Failed to check for existing job by title matching`, err);
        }
    }
    // Check existing document and tasks for setup requirements
    let wasAttention = false;
    let currentStatus = jobMappedData.status;
    let hasTasks = false;
    try {
        const [existingDoc, tasksSnap] = await Promise.all([
            jobDestRef.get(),
            jobDestRef.collection('tasks').limit(1).get()
        ]);
        if (existingDoc.exists) {
            const existingData = existingDoc.data();
            wasAttention = (existingData === null || existingData === void 0 ? void 0 : existingData.needsAttention) === true;
            currentStatus = (existingData === null || existingData === void 0 ? void 0 : existingData.status) || currentStatus;
        }
        hasTasks = !tasksSnap.empty;
    }
    catch (err) {
        console.error(`Failed to fetch existing job details for attention check on ${jobId}`, err);
    }
    const hasVin = !!(vin || jobMappedData.vehicleId);
    const hasStatus = !!(currentStatus && currentStatus !== 'Open');
    const needsAttentionReasons = [];
    if (!hasVin)
        needsAttentionReasons.push('VIN/Vehicle');
    if (!hasTasks)
        needsAttentionReasons.push('Tasks/Crew');
    if (!hasStatus)
        needsAttentionReasons.push('Workflow Status');
    const needsAttention = needsAttentionReasons.length > 0;
    jobMappedData.needsAttention = needsAttention;
    jobMappedData.needsAttentionReasons = needsAttentionReasons;
    try {
        await jobDestRef.set(jobMappedData, { merge: true });
        console.log(`Successfully promoted QB Job ${jobId} to native jobs in tenant ${tenantId}`);
        // Log alert to activity feed if attention flag was newly raised
        if (needsAttention && !wasAttention) {
            const feedRef = admin.firestore().collection('businesses').doc(tenantId).collection('activity_feed').doc();
            await feedRef.set({
                type: 'qb_sync_attention',
                title: 'Job Sync Setup Required',
                message: `Job "${jobMappedData.title}" was synced from QuickBooks but is missing: ${needsAttentionReasons.join(', ')}.`,
                severity: 'warning',
                jobId: jobDestRef.id,
                createdAt: new Date().toISOString(),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Logged sync setup required alert for job ${jobDestRef.id}`);
        }
    }
    catch (err) {
        console.error(`Failed to promote job ${jobId}`, err);
    }
    // 3. Upsert Vehicle Record
    if (vData && (vData.vin || vData.make)) {
        const vehicleVin = vin || `UNKN-${jobId.substring(0, 8)}`;
        if (!vehicleVin)
            return null;
        const vehicleRef = admin.firestore().collection('businesses').doc(tenantId).collection('vehicles').doc(vehicleVin);
        const vehiclePayload = {
            vin: vData.vin || '',
            make: vData.make || '',
            model: vData.model || '',
            year: vData.year || '',
            lastSeenJobId: jobId,
            jobTitle: jobMappedData.title,
            customerId: jobMappedData.customerId,
            source: 'QuickBooks',
            tags: admin.firestore.FieldValue.arrayUnion('QuickBooks'),
            createdAt: timeCreated,
            updatedAt: timeModified
        };
        try {
            await vehicleRef.set(vehiclePayload, { merge: true });
            console.log(`Successfully extracted and upserted vehicle ${vehicleVin} for job ${jobId} in tenant ${tenantId}`);
        }
        catch (err) {
            console.error(`Failed to upsert vehicle ${vehicleVin}`, err);
        }
    }
    return null;
});
/**
 * Trigger: When a document in qb_employees is created or updated.
 * Goal: Promote to 'staff' collection and resolve emails.
 */
exports.onQbEmployeeWrite = functions.firestore
    .document('businesses/{tenantId}/qb_employees/{employeeId}')
    .onWrite(async (change, context) => {
    const { tenantId, employeeId } = context.params;
    if (!change.after.exists)
        return null;
    const data = change.after.data();
    if (!data)
        return null;
    // 1. Promote to Staff Collection
    let staffRef = admin.firestore().collection('businesses').doc(tenantId).collection('staff').doc(employeeId);
    // Resolve email if missing (already defined below, but we need it for searching)
    let resolvedEmail = data.email || data.Email || '';
    const firstName = data.firstName || data.FirstName || '';
    const lastName = data.lastName || data.LastName || '';
    const fullName = (data.name || data.Name || `${firstName} ${lastName}`).trim();
    if (!resolvedEmail && fullName) {
        // Search root users collection for a matching name
        const userQuery = admin.firestore().collection('users')
            .where('displayName', '==', fullName)
            .limit(1);
        const userSnap = await userQuery.get();
        if (!userSnap.empty) {
            resolvedEmail = userSnap.docs[0].data().email || '';
            console.log(`Resolved email ${resolvedEmail} for employee ${fullName} via users collection`);
        }
        else if (firstName && lastName) {
            // Try searching by first/last combo if displayName search failed
            const userQueryAlt = admin.firestore().collection('users')
                .where('firstName', '==', firstName)
                .where('lastName', '==', lastName)
                .limit(1);
            const userSnapAlt = await userQueryAlt.get();
            if (!userSnapAlt.empty) {
                resolvedEmail = userSnapAlt.docs[0].data().email || '';
                console.log(`Resolved email ${resolvedEmail} for employee ${fullName} via firstName/lastName search`);
            }
        }
    }
    // SEARCH FOR EXISTING STAFF TO PREVENT DUPLICATES
    if (resolvedEmail) {
        const existingQuery = await admin.firestore().collection('businesses').doc(tenantId).collection('staff')
            .where('email', '==', resolvedEmail.toLowerCase())
            .limit(1)
            .get();
        if (!existingQuery.empty) {
            staffRef = existingQuery.docs[0].ref;
            console.log(`Found existing staff member by email: ${resolvedEmail}. Merging into doc ${staffRef.id}`);
        }
    }
    if (staffRef.id === employeeId && firstName && lastName) {
        // If still using QB ID, try one more search by case-insensitive name
        const allStaffSnap = await admin.firestore().collection('businesses').doc(tenantId).collection('staff').get();
        const existingNameMatch = allStaffSnap.docs.find(doc => {
            const d = doc.data();
            return d.firstName && d.lastName &&
                d.firstName.toLowerCase() === firstName.toLowerCase() &&
                d.lastName.toLowerCase() === lastName.toLowerCase();
        });
        if (existingNameMatch) {
            staffRef = existingNameMatch.ref;
            console.log(`Found existing staff member by name: ${firstName} ${lastName}. Merging into doc ${staffRef.id}`);
        }
    }
    const isQbActive = data.isActive === true || data.isActive === 'true' || data.IsActive === 'true' || data.IsActive === true;
    const staffMappedData = {
        firstName: data.firstName || data.FirstName || '',
        lastName: data.lastName || data.LastName || '',
        email: resolvedEmail.toLowerCase(),
        phone: data.phone || data.Phone || '',
        role: 'staff', // Default role
        hireDate: data.HiredDate || data.hiredDate || null,
        fireDate: data.ReleasedDate || data.releasedDate || null,
        quickbooksId: data.ListID || data.listId || '',
        source: 'QuickBooks',
        tags: admin.firestore.FieldValue.arrayUnion('QuickBooks'),
        notes: admin.firestore.FieldValue.arrayUnion('Imported via QBWC.'),
        isArchived: !isQbActive,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    try {
        await staffRef.set(staffMappedData, { merge: true });
        console.log(`Successfully promoted QB Employee ${employeeId} to staff in tenant ${tenantId}`);
    }
    catch (err) {
        console.error(`Failed to promote employee ${employeeId}`, err);
    }
    return null;
});
/**
 * Helper to parse QB duration
 */
function parseQBDuration(dur) {
    if (!dur)
        return 0;
    let hours = 0, minutes = 0, seconds = 0;
    const hMatch = dur.match(/(\d+)H/);
    const mMatch = dur.match(/(\d+)M/);
    const sMatch = dur.match(/(\d+)S/);
    if (hMatch)
        hours = parseInt(hMatch[1], 10);
    if (mMatch)
        minutes = parseInt(mMatch[1], 10);
    if (sMatch)
        seconds = parseInt(sMatch[1], 10);
    if (dur.includes(':')) {
        const parts = dur.split(':');
        hours = parseInt(parts[0], 10) || 0;
        minutes = parseInt(parts[1], 10) || 0;
        seconds = parseInt(parts[2], 10) || 0;
    }
    return (hours * 3600000) + (minutes * 60000) + (seconds * 1000);
}
/**
 * Trigger: When a document in qb_time_tracking is created or updated.
 * Goal: Promote to native 'time_sessions' collection.
 */
exports.onQbTimeTrackingWrite = functions.firestore
    .document('businesses/{tenantId}/qb_time_tracking/{timeId}')
    .onWrite(async (change, context) => {
    var _a, _b;
    const { tenantId, timeId } = context.params;
    if (!change.after.exists) {
        // If deleted in QB, delete the corresponding native session to keep it clean.
        try {
            await admin.firestore().collection('businesses').doc(tenantId).collection('time_sessions').doc('qb_time_' + timeId).delete();
        }
        catch (e) { }
        return null;
    }
    const data = change.after.data();
    if (!data || !data.duration || !data.txnDate)
        return null;
    const durationMs = parseQBDuration(data.duration);
    if (durationMs === 0)
        return null;
    // 1. Resolve User (Technician) Schedule
    let startTimeStr = '08:00'; // Default fallback
    let uName = data.entityName || 'Unknown QB Staff';
    let resolvedUserId = data.entityRef || uName;
    try {
        // Try to find native staff member by name or ListID
        const staffRef = admin.firestore().collection('businesses').doc(tenantId).collection('staff');
        let staffSnap = await staffRef.where('quickbooksId', '==', data.entityRef).limit(1).get();
        if (staffSnap.empty && data.entityName) {
            // Fallback to name search
            const nameParts = data.entityName.split(' ');
            if (nameParts.length >= 2) {
                staffSnap = await staffRef
                    .where('firstName', '==', nameParts[0])
                    .where('lastName', '==', nameParts.slice(1).join(' '))
                    .limit(1).get();
            }
        }
        if (!staffSnap.empty) {
            const staffData = staffSnap.docs[0].data();
            resolvedUserId = staffSnap.docs[0].id;
            uName = (staffData.firstName + ' ' + staffData.lastName).trim();
            // Resolve Schedule
            if ((_a = staffData.individualSchedule) === null || _a === void 0 ? void 0 : _a.startTime) {
                startTimeStr = staffData.individualSchedule.startTime;
            }
            else if (staffData.departmentId) {
                const deptSnap = await admin.firestore().collection('businesses').doc(tenantId).collection('departments').doc(staffData.departmentId).get();
                if (deptSnap.exists) {
                    const deptData = deptSnap.data();
                    if ((_b = deptData === null || deptData === void 0 ? void 0 : deptData.defaultSchedule) === null || _b === void 0 ? void 0 : _b.startTime) {
                        startTimeStr = deptData.defaultSchedule.startTime;
                    }
                }
            }
        }
    }
    catch (e) {
        console.error('Failed to resolve staff schedule for ' + uName, e);
    }
    // 2. Resolve Job (CustomerRef)
    let jId = data.customerRef || data.customerName || 'qb_general';
    let jTitle = data.customerName || 'QB Job';
    try {
        // Find native job
        const jobsSnap = await admin.firestore().collection('businesses').doc(tenantId).collection('jobs')
            .where('quickbooksId', '==', data.customerRef)
            .limit(1).get();
        if (!jobsSnap.empty) {
            jId = jobsSnap.docs[0].id;
            jTitle = jobsSnap.docs[0].data().title || jTitle;
        }
        else {
            // Try finding by name
            const jobsNameSnap = await admin.firestore().collection('businesses').doc(tenantId).collection('jobs')
                .where('title', '==', jTitle)
                .limit(1).get();
            if (!jobsNameSnap.empty) {
                jId = jobsNameSnap.docs[0].id;
            }
        }
    }
    catch (e) {
        console.error('Failed to resolve job for ' + jTitle, e);
    }
    // 3. Construct Simulated Timestamps
    const [startHourStr, startMinStr] = startTimeStr.split(':');
    const startHour = parseInt(startHourStr, 10);
    const startMin = parseInt(startMinStr, 10);
    // Parse YYYY-MM-DD
    const [yearStr, monthStr, dayStr] = data.txnDate.split('-');
    const clockInTime = new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr));
    clockInTime.setHours(startHour || 8, startMin || 0, 0, 0);
    const clockOutTime = new Date(clockInTime.getTime() + durationMs);
    // 4. Upsert Time Session
    const sessionPayload = {
        userId: resolvedUserId,
        userName: uName,
        clockIn: { timestamp: admin.firestore.Timestamp.fromDate(clockInTime), location: 'QuickBooks Import' },
        clockOut: { timestamp: admin.firestore.Timestamp.fromDate(clockOutTime), location: 'QuickBooks Import' },
        jobs: [
            {
                id: jId,
                name: jTitle,
                taskId: data.itemServiceRef || null,
                taskName: data.itemServiceName || null,
                start: admin.firestore.Timestamp.fromDate(clockInTime),
                end: admin.firestore.Timestamp.fromDate(clockOutTime)
            }
        ],
        jobIds: [jId],
        source: 'QuickBooks',
        notes: 'Imported via QBWC.',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    try {
        await admin.firestore()
            .collection('businesses')
            .doc(tenantId)
            .collection('time_sessions')
            .doc('qb_time_' + timeId)
            .set(sessionPayload, { merge: true });
        console.log('Successfully mapped QB time ' + timeId + ' to native session for ' + uName);
    }
    catch (e) {
        console.error('Failed to map QB time ' + timeId, e);
    }
    return null;
});
//# sourceMappingURL=qbSync.js.map