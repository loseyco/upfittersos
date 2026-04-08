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
exports.jobsRoutes = void 0;
const express_1 = require("express");
const admin = __importStar(require("firebase-admin"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const companyCam_service_1 = require("../services/companyCam.service");
exports.jobsRoutes = (0, express_1.Router)();
const getDb = () => admin.firestore();
// Helper to determine if the caller has at least "staff" access to the tenant
const isMemberOfTenant = (caller, tenantId) => {
    const isSuperAdmin = (caller.role === 'system_owner' || caller.role === 'super_admin');
    const isTenantMember = caller.tenantId === tenantId;
    return isSuperAdmin || isTenantMember;
};
// Helper for Manager+ level access
const isManagerOfTenant = (caller, tenantId) => {
    const isSuperAdmin = (caller.role === 'system_owner' || caller.role === 'super_admin');
    const isTenantManager = (caller.role === 'business_owner' || caller.role === 'manager') && caller.tenantId === tenantId;
    return isSuperAdmin || isTenantManager;
};
// GET /jobs?tenantId=xyz - Fetch jobs for a workspace
exports.jobsRoutes.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.query.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId query parameter is required' });
        }
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }
        const snapshot = await getDb().collection('jobs')
            .where('tenantId', '==', tenantId)
            .get();
        let jobs = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        // Sort manually by createdAt
        jobs.sort((a, b) => {
            var _a, _b;
            const timeA = ((_a = a.createdAt) === null || _a === void 0 ? void 0 : _a._seconds) || 0;
            const timeB = ((_b = b.createdAt) === null || _b === void 0 ? void 0 : _b._seconds) || 0;
            return timeB - timeA;
        });
        return res.json(jobs);
    }
    catch (error) {
        console.error("Error fetching jobs:", error);
        return res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});
// Helper to attempt CompanyCam sync if status is correct and link actual customer address
async function tryCompanyCamSync(jobRef, newJobData, callerUid, tenantId) {
    if (newJobData.skipCompanyCamSync) {
        return { status: 'bypassed', reason: 'Sync opted out by user' };
    }
    // Safety: only push to CompanyCam if it is a vehicle job, ignoring pure internal projects (like 'Website')
    if (!newJobData.vehicleId) {
        return { status: 'bypassed', reason: 'Safety Check: Job is missing an assigned vehicle.' };
    }
    // If we already linked it, we don't need to recreate it.
    if (newJobData.companyCamProjectId) {
        return { status: 'bypassed', reason: 'Already synced to CompanyCam' };
    }
    let street = 'No Address Provided';
    let city = 'Unknown';
    let state = 'NA';
    let zip = '00000';
    try {
        // Fetch actual customer address securely from Firestore
        if (newJobData.customerId) {
            const custDoc = await getDb().collection('customers').doc(newJobData.customerId).get();
            if (custDoc.exists) {
                const c = custDoc.data();
                if (c.addressStreet)
                    street = c.addressStreet;
                if (c.addressCity)
                    city = c.addressCity;
                if (c.addressState)
                    state = c.addressState;
                if (c.addressZip)
                    zip = c.addressZip;
            }
        }
        const ccService = new companyCam_service_1.CompanyCamService(callerUid, tenantId);
        const ccPayload = {
            name: String(newJobData.title).substring(0, 50),
            status: 'active',
            address: {
                street_address_1: street,
                city: city,
                state: state,
                postal_code: zip
            }
        };
        const ccProj = await ccService.createProject(ccPayload);
        if (ccProj && ccProj.id) {
            await jobRef.update({ companyCamProjectId: String(ccProj.id) });
            return { status: 'success', reason: 'Project created successfully', projectId: String(ccProj.id) };
        }
    }
    catch (ccErr) {
        console.log(`[Push] CompanyCam sync failed for job ${jobRef.id}:`, ccErr.message);
        return { status: 'failed', reason: ccErr.message || 'Unknown error from CompanyCam' };
    }
    return { status: 'failed', reason: 'No Project ID returned' };
}
// POST /jobs - Create a new job
exports.jobsRoutes.post('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.body.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId is required' });
        }
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }
        const { title, description, status, priority, customerId, vehicleId, assignedStaffId, tags, dueDate, notes, tasks, parts, laborLines, bookTimeTotal, actualTimeTotal, skipCompanyCamSync, dropoffEta, completionEta, sopSupplies, shipping, discount, desiredDropoffDate, desiredPickupDate, salesNotes, customerMeetingNotes, salesQuestions } = req.body;
        const newJob = {
            tenantId,
            title: title || 'Untitled Job',
            description: description || '',
            status: status || 'Pending', // Pending, In Progress, Completed
            priority: priority || 'Medium',
            skipCompanyCamSync: typeof skipCompanyCamSync === 'boolean' ? skipCompanyCamSync : false,
            customerId: customerId || null,
            vehicleId: vehicleId || null,
            assignedStaffId: assignedStaffId || null,
            tags: tags || [],
            parts: parts || [], // Legacy fallback, to be phased out
            laborLines: laborLines || [], // Legacy fallback, to be phased out
            tasks: tasks || [], // Modern structure: Job > Tasks > (Parts / Labor / Assignments)
            bookTimeTotal: bookTimeTotal || 0,
            actualTimeTotal: actualTimeTotal || 0,
            dueDate: dueDate || null,
            dropoffEta: dropoffEta || null,
            completionEta: completionEta || null,
            sopSupplies: sopSupplies !== undefined ? Number(sopSupplies) : 0,
            shipping: shipping !== undefined ? Number(shipping) : 0,
            discount: discount !== undefined ? Number(discount) : 0,
            desiredDropoffDate: desiredDropoffDate || null,
            desiredPickupDate: desiredPickupDate || null,
            salesNotes: salesNotes || '',
            customerMeetingNotes: customerMeetingNotes || '',
            salesQuestions: salesQuestions || [],
            notes: notes || '',
            editLog: [],
            createdBy: caller.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await getDb().collection('jobs').add(newJob);
        return res.status(201).json(Object.assign({ id: docRef.id }, newJob));
    }
    catch (error) {
        console.error("Error creating job:", error);
        return res.status(500).json({ error: 'Failed to create job' });
    }
});
// PUT /jobs/:id - Update a job
exports.jobsRoutes.put('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const jobId = req.params.id;
        const jobRef = getDb().collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) {
            return res.status(404).json({ error: 'Job not found' });
        }
        const jobData = jobDoc.data();
        const tenantId = jobData.tenantId;
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Cannot update this job.' });
        }
        const { title, description, status, priority, customerId, vehicleId, assignedStaffId, tags, dueDate, notes, tasks, parts, laborLines, bookTimeTotal, actualTimeTotal, skipCompanyCamSync, archived, dropoffEta, completionEta, editLog, sopSupplies, shipping, discount, desiredDropoffDate, desiredPickupDate, salesNotes, customerMeetingNotes, salesQuestions, lockedTaxRate } = req.body;
        const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (title !== undefined)
            updates.title = title;
        if (description !== undefined)
            updates.description = description;
        if (status !== undefined)
            updates.status = status;
        if (priority !== undefined)
            updates.priority = priority;
        if (skipCompanyCamSync !== undefined)
            updates.skipCompanyCamSync = skipCompanyCamSync;
        if (customerId !== undefined)
            updates.customerId = customerId;
        if (vehicleId !== undefined)
            updates.vehicleId = vehicleId;
        if (assignedStaffId !== undefined)
            updates.assignedStaffId = assignedStaffId;
        if (tags !== undefined)
            updates.tags = tags;
        if (parts !== undefined)
            updates.parts = parts;
        if (laborLines !== undefined)
            updates.laborLines = laborLines;
        if (tasks !== undefined)
            updates.tasks = tasks;
        if (bookTimeTotal !== undefined)
            updates.bookTimeTotal = bookTimeTotal;
        if (actualTimeTotal !== undefined)
            updates.actualTimeTotal = actualTimeTotal;
        if (dueDate !== undefined)
            updates.dueDate = dueDate;
        if (dropoffEta !== undefined)
            updates.dropoffEta = dropoffEta;
        if (completionEta !== undefined)
            updates.completionEta = completionEta;
        if (notes !== undefined)
            updates.notes = notes;
        if (archived !== undefined)
            updates.archived = archived;
        if (editLog !== undefined)
            updates.editLog = editLog;
        if (sopSupplies !== undefined)
            updates.sopSupplies = Number(sopSupplies);
        if (shipping !== undefined)
            updates.shipping = Number(shipping);
        if (discount !== undefined)
            updates.discount = Number(discount);
        if (desiredDropoffDate !== undefined)
            updates.desiredDropoffDate = desiredDropoffDate;
        if (desiredPickupDate !== undefined)
            updates.desiredPickupDate = desiredPickupDate;
        if (salesNotes !== undefined)
            updates.salesNotes = salesNotes;
        if (customerMeetingNotes !== undefined)
            updates.customerMeetingNotes = customerMeetingNotes;
        if (salesQuestions !== undefined)
            updates.salesQuestions = salesQuestions;
        if (lockedTaxRate !== undefined)
            updates.lockedTaxRate = lockedTaxRate;
        await jobRef.update(updates);
        const updatedJobData = Object.assign(Object.assign({}, jobData), updates);
        return res.json(Object.assign({ id: jobId }, updatedJobData));
    }
    catch (error) {
        console.error("Error updating job:", error);
        return res.status(500).json({ error: 'Failed to update job' });
    }
});
// DELETE /jobs/:id - Delete a job
exports.jobsRoutes.delete('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const jobId = req.params.id;
        const jobRef = getDb().collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) {
            return res.status(404).json({ error: 'Job not found' });
        }
        const jobData = jobDoc.data();
        const tenantId = jobData.tenantId;
        if (!isManagerOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Only managers can delete jobs.' });
        }
        await jobRef.delete();
        return res.json({ message: 'Job deleted successfully' });
    }
    catch (error) {
        console.error("Error deleting job:", error);
        return res.status(500).json({ error: 'Failed to delete job' });
    }
});
// POST /jobs/:id/companycam-sync - Manual exact sync trigger
exports.jobsRoutes.post('/:id/companycam-sync', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const jobId = req.params.id;
        const jobRef = getDb().collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) {
            return res.status(404).json({ error: 'Job not found' });
        }
        const jobData = jobDoc.data();
        const tenantId = jobData.tenantId;
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Cannot sync this job.' });
        }
        // We temporarily forge the status to bypass the "Pending" trap inside the helper
        const forgedJobData = Object.assign(Object.assign({}, jobData), { status: 'In Progress' });
        const syncResult = await tryCompanyCamSync(jobRef, forgedJobData, caller.uid, tenantId);
        if (syncResult.status === 'failed') {
            return res.status(400).json({ error: syncResult.reason });
        }
        return res.json({ message: 'Sync successful', _ccStatus: syncResult.status, _ccReason: syncResult.reason, projectId: syncResult.projectId });
    }
    catch (error) {
        console.error("Error manual syncing job:", error);
        return res.status(500).json({ error: 'Failed to trigger sync' });
    }
});
// GET /jobs/:id/companycam-photos - Fetch photos from the linked CompanyCam project natively or via CompanyCam
exports.jobsRoutes.get('/:id/companycam-photos', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const jobId = req.params.id;
        const jobRef = getDb().collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) {
            return res.status(404).json({ error: 'Job not found' });
        }
        const jobData = jobDoc.data();
        const tenantId = jobData.tenantId;
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Cannot view photos for this job.' });
        }
        if (!jobData.companyCamProjectId) {
            // Return natively stored media
            const nativeMedia = (jobData.media || []).map((m, idx) => {
                if (typeof m === 'string') {
                    // String URL
                    return { id: `native_${idx}`, uris: [{ uri: m }], creator_name: 'Native Upload' };
                }
                else if (m && m.url) {
                    // Object with URL
                    return { id: m.ccId || `native_${idx}`, uris: [{ uri: m.url }], creator_name: m.uploadedBy || 'Native Upload' };
                }
                return m;
            });
            return res.json(nativeMedia);
        }
        const ccService = new companyCam_service_1.CompanyCamService(caller.uid, tenantId);
        const photos = await ccService.getProjectPhotos(jobData.companyCamProjectId);
        return res.json(photos);
    }
    catch (error) {
        console.error("Error fetching job photos:", error);
        return res.status(500).json({ error: error.message || 'Failed to fetch photos' });
    }
});
// POST /jobs/:id/companycam-photos - Push photo URLs to CompanyCam or save natively
exports.jobsRoutes.post('/:id/companycam-photos', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const jobId = req.params.id;
        const { urls } = req.body;
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid photo URLs' });
        }
        const jobRef = getDb().collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) {
            return res.status(404).json({ error: 'Job not found' });
        }
        const jobData = jobDoc.data();
        const tenantId = jobData.tenantId;
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        // 1. Safely sync native URLs directly to the Job document in Firestore 
        const FieldValue = admin.firestore.FieldValue;
        const mediaObjects = urls.map(url => ({
            url,
            source: 'native_upload',
            ccId: `native_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            uploadedBy: caller.name || caller.email || 'Staff'
        }));
        await jobRef.update({
            media: FieldValue.arrayUnion(...mediaObjects)
        });
        // 2. Send to CompanyCam if synced
        let result = null;
        if (jobData.companyCamProjectId) {
            try {
                const ccService = new companyCam_service_1.CompanyCamService(caller.uid, tenantId);
                result = await ccService.createPhotos(jobData.companyCamProjectId, urls);
            }
            catch (ccErr) {
                console.error("Failed to push native upload to CompanyCam:", ccErr);
            }
        }
        return res.json({ message: 'Upload initiated successfully', result });
    }
    catch (error) {
        console.error("Error uploading photos:", error);
        return res.status(500).json({ error: error.message || 'Failed to upload photos' });
    }
});
// POST /jobs/:id/sync-media - Background polling to backup CC photos into UpfitterOS
exports.jobsRoutes.post('/:id/sync-media', auth_middleware_1.authenticate, async (req, res) => {
    var _a, _b;
    try {
        const caller = req.user;
        const jobId = req.params.id;
        const jobRef = getDb().collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists)
            return res.status(404).json({ error: 'Job not found' });
        const jobData = jobDoc.data();
        if (!isMemberOfTenant(caller, jobData.tenantId))
            return res.status(403).json({ error: 'Forbidden' });
        if (!jobData.companyCamProjectId)
            return res.json({ message: 'Not synced' });
        const ccService = new companyCam_service_1.CompanyCamService(caller.uid, jobData.tenantId);
        const ccPhotos = await ccService.getProjectPhotos(jobData.companyCamProjectId).catch(() => []);
        const downloadedIds = jobData.ccDownloadedIds || [];
        const { getStorage } = require('firebase-admin/storage');
        const bucket = getStorage().bucket();
        const { FieldValue } = require('firebase-admin/firestore');
        let newDownloads = 0;
        for (const photo of ccPhotos) {
            if (downloadedIds.includes(photo.id.toString()))
                continue;
            // It's a new photo taken by a tech in CC! Let's back it up.
            const uri = (_b = (_a = photo.uris) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri;
            if (!uri)
                continue;
            try {
                const fetch = require('node-fetch');
                const imageRes = await fetch(uri);
                if (!imageRes.ok)
                    continue;
                const buffer = await imageRes.buffer();
                const fileName = `job_media/${jobData.tenantId}/${jobId}/cc_${photo.id}.jpg`;
                const file = bucket.file(fileName);
                await file.save(buffer, { contentType: 'image/jpeg' });
                // Construct the public unauthenticated read URL configured in our storage rules
                const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
                // Add to database
                await jobRef.update({
                    media: FieldValue.arrayUnion({
                        url: publicUrl,
                        ccId: photo.id.toString(),
                        source: 'companycam'
                    }),
                    ccDownloadedIds: FieldValue.arrayUnion(photo.id.toString())
                });
                newDownloads++;
            }
            catch (err) {
                console.error(`Failed to ingest CC photo ${photo.id}`, err);
            }
        }
        return res.json({ message: 'Sync complete', ingested: newDownloads });
    }
    catch (error) {
        console.error("Error background syncing photos:", error);
        return res.status(500).json({ error: error.message || 'Failed to sync' });
    }
});
// DELETE /jobs/:id/media/:mediaId - Delete a photo strictly from both ecosystems
exports.jobsRoutes.delete('/:id/media/:mediaId', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const { id: jobId, mediaId: ccId } = req.params;
        const jobRef = getDb().collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists)
            return res.status(404).json({ error: 'Job not found' });
        const jobData = jobDoc.data();
        if (!isMemberOfTenant(caller, jobData.tenantId))
            return res.status(403).json({ error: 'Forbidden' });
        // 1. Delete from CompanyCam (if linked AND not purely native)
        if (jobData.companyCamProjectId && !ccId.toString().startsWith('native_')) {
            const ccService = new companyCam_service_1.CompanyCamService(caller.uid, jobData.tenantId);
            try {
                // We must use 'any' to bypass typing if delete method isn't explicitly defined yet, 
                // but fetch handles it gracefully!
                await ccService.fetch(`/photos/${ccId}`, { method: 'DELETE' });
            }
            catch (e) {
                console.error("CC Delete threw an error, possibly already deleted there", e);
            }
        }
        // 2. Remove from local Firebase Storage
        const { getStorage } = require('firebase-admin/storage');
        const bucket = getStorage().bucket();
        const fileName = `job_media/${jobData.tenantId}/${jobId}/cc_${ccId}.jpg`;
        await bucket.file(fileName).delete().catch(() => { }); // ignore 404s if it wasn't a CC ingestion
        // 3. Scrub from Firestore Database
        const currentMedia = jobData.media || [];
        const filteredMedia = currentMedia.filter((m) => m.ccId !== ccId && m !== ccId && m.url !== ccId);
        const currentDownloaded = jobData.ccDownloadedIds || [];
        const filteredDownloaded = currentDownloaded.filter((id) => id !== ccId);
        await jobRef.update({
            media: filteredMedia,
            ccDownloadedIds: filteredDownloaded
        });
        return res.json({ message: 'Photo explicitly destroyed in both systems' });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to delete' });
    }
});
//# sourceMappingURL=jobs.routes.js.map