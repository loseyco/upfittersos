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
exports.onQbEmployeeWrite = exports.onQbJobWrite = exports.onQbCustomerWrite = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    let jobDestRef = admin.firestore().collection('businesses').doc(tenantId).collection('jobs').doc(jobId);
    // If we have a job number, try to find an existing native job to merge with
    if (qbJobNumber) {
        try {
            const existingQuery = await admin.firestore().collection('businesses').doc(tenantId).collection('jobs')
                .where('jobNumber', '==', String(qbJobNumber))
                .limit(1)
                .get();
            if (!existingQuery.empty) {
                // If we find an existing job by number, we use its ref instead of creating a new ListID-based one
                jobDestRef = existingQuery.docs[0].ref;
                console.log(`Merging QB Job ${jobId} into existing job ${jobDestRef.id} via job number ${qbJobNumber}`);
            }
        }
        catch (err) {
            console.error(`Failed to check for existing job with number ${qbJobNumber}`, err);
        }
    }
    try {
        await jobDestRef.set(jobMappedData, { merge: true });
        console.log(`Successfully promoted QB Job ${jobId} to native jobs in tenant ${tenantId}`);
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
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
        // If still using QB ID, try one more search by name
        const existingNameQuery = await admin.firestore().collection('businesses').doc(tenantId).collection('staff')
            .where('firstName', '==', firstName)
            .where('lastName', '==', lastName)
            .limit(1)
            .get();
        if (!existingNameQuery.empty) {
            staffRef = existingNameQuery.docs[0].ref;
            console.log(`Found existing staff member by name: ${firstName} ${lastName}. Merging into doc ${staffRef.id}`);
        }
    }
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
//# sourceMappingURL=qbSync.js.map