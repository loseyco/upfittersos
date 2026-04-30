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
exports.onQbJobWrite = exports.onQbCustomerWrite = void 0;
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
    // 1. Promote to Job Collection (V2 Schema)
    const jobMappedData = {
        title: data.Name || data.FullName || 'Untitled Job',
        customerId: data.parentRefId || '',
        status: data.IsActive === 'true' ? 'Active' : 'Inactive',
        quickbooksId: data.ListID || data.qb_ListID || '',
        source: 'QuickBooks',
        tags: admin.firestore.FieldValue.arrayUnion('QuickBooks'),
        notes: 'Imported via QBWC.',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const jobDestRef = admin.firestore().collection('businesses').doc(tenantId).collection('jobs').doc(jobId);
    try {
        await jobDestRef.set(jobMappedData, { merge: true });
        console.log(`Successfully promoted QB Job ${jobId} to native jobs in tenant ${tenantId}`);
    }
    catch (err) {
        console.error(`Failed to promote job ${jobId}`, err);
    }
    // 2. Vehicle Extraction Logic
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
                    vin: cf['VIN num'] || '',
                    make: cf['Vehicle Make'] || '',
                    model: cf['Vehicle Model'] || '',
                    year: cf['Vehicle Year'] || ''
                };
            }
        }
        catch (e) {
            console.error(`Failed to parse qbCustomFields JSON for job ${jobId}`, e);
        }
    }
    if (vData && (vData.vin || vData.make)) {
        const vin = vData.vin ? vData.vin.trim() : `UNKN-${jobId.substring(0, 8)}`;
        if (!vin)
            return null;
        const vehicleRef = admin.firestore().collection('businesses').doc(tenantId).collection('vehicles').doc(vin);
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
            console.log(`Successfully extracted and upserted vehicle ${vin} for job ${jobId} in tenant ${tenantId}`);
        }
        catch (err) {
            console.error(`Failed to upsert vehicle ${vin}`, err);
        }
    }
    return null;
});
//# sourceMappingURL=qbSync.js.map