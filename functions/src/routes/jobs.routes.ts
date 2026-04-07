import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { authenticate } from '../middleware/auth.middleware';
import { CompanyCamService } from '../services/companyCam.service';

export const jobsRoutes = Router();
const getDb = () => admin.firestore();

// Helper to determine if the caller has at least "staff" access to the tenant
const isMemberOfTenant = (caller: any, tenantId: string) => {
    const isSuperAdmin = (caller.role === 'system_owner' || caller.role === 'super_admin');
    const isTenantMember = caller.tenantId === tenantId;
    return isSuperAdmin || isTenantMember;
};

// Helper for Manager+ level access
const isManagerOfTenant = (caller: any, tenantId: string) => {
    const isSuperAdmin = (caller.role === 'system_owner' || caller.role === 'super_admin');
    const isTenantManager = (caller.role === 'business_owner' || caller.role === 'manager') && caller.tenantId === tenantId;
    return isSuperAdmin || isTenantManager;
};

// GET /jobs?tenantId=xyz - Fetch jobs for a workspace
jobsRoutes.get('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.query.tenantId as string;

        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId query parameter is required' });
        }

        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }

        const snapshot = await getDb().collection('jobs')
            .where('tenantId', '==', tenantId)
            .get();

        let jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        
        // Sort manually by createdAt
        jobs.sort((a, b) => {
            const timeA = a.createdAt?._seconds || 0;
            const timeB = b.createdAt?._seconds || 0;
            return timeB - timeA;
        });

        return res.json(jobs);
    } catch (error) {
        console.error("Error fetching jobs:", error);
        return res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

// Helper to attempt CompanyCam sync if status is correct and link actual customer address
async function tryCompanyCamSync(jobRef: admin.firestore.DocumentReference, newJobData: any, callerUid: string, tenantId: string) {
    // Only push when the job transitions out of Pending/Estimate
    if (newJobData.status === 'Pending' || newJobData.status === 'Estimate' || newJobData.status === 'Completed') {
        return { status: 'bypassed', reason: `Awaiting status change from ${newJobData.status}` };
    }
    
    if (newJobData.skipCompanyCamSync) {
        return { status: 'bypassed', reason: 'Sync opted out by user' };
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
                const c = custDoc.data()!;
                if (c.addressStreet) street = c.addressStreet;
                if (c.addressCity) city = c.addressCity;
                if (c.addressState) state = c.addressState;
                if (c.addressZip) zip = c.addressZip;
            }
        }

        const ccService = new CompanyCamService(callerUid, tenantId);
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
            return { status: 'success', reason: 'Project created successfully' };
        }
    } catch (ccErr: any) {
        console.log(`[Push] CompanyCam sync failed for job ${jobRef.id}:`, ccErr.message);
        return { status: 'failed', reason: ccErr.message || 'Unknown error from CompanyCam' };
    }
    return { status: 'failed', reason: 'No Project ID returned' };
}

// POST /jobs - Create a new job
jobsRoutes.post('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.body.tenantId;

        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId is required' });
        }

        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }

        const {
            title, description, status, priority,
            customerId, vehicleId, assignedStaffId,
            tags, dueDate, notes, tasks, parts, laborLines,
            bookTimeTotal, actualTimeTotal, skipCompanyCamSync,
            dropoffEta, completionEta
        } = req.body;

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
            notes: notes || '',
            editLog: [],
            createdBy: caller.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await getDb().collection('jobs').add(newJob);

        // Intelligently execute conditional sync
        const syncResult = await tryCompanyCamSync(docRef, newJob, caller.uid, tenantId);

        return res.status(201).json({ 
            id: docRef.id, 
            ...newJob, 
            _ccStatus: syncResult.status, 
            _ccReason: syncResult.reason 
        });
    } catch (error) {
        console.error("Error creating job:", error);
        return res.status(500).json({ error: 'Failed to create job' });
    }
});

// PUT /jobs/:id - Update a job
jobsRoutes.put('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const jobId = req.params.id;

        const jobRef = getDb().collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();

        if (!jobDoc.exists) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const jobData = jobDoc.data()!;
        const tenantId = jobData.tenantId;

        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Cannot update this job.' });
        }

        const {
            title, description, status, priority,
            customerId, vehicleId, assignedStaffId,
            tags, dueDate, notes, tasks, parts, laborLines,
            bookTimeTotal, actualTimeTotal, skipCompanyCamSync,
            archived, dropoffEta, completionEta, editLog
        } = req.body;

        const updates: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (status !== undefined) updates.status = status;
        if (priority !== undefined) updates.priority = priority;
        if (skipCompanyCamSync !== undefined) updates.skipCompanyCamSync = skipCompanyCamSync;
        if (customerId !== undefined) updates.customerId = customerId;
        if (vehicleId !== undefined) updates.vehicleId = vehicleId;
        if (assignedStaffId !== undefined) updates.assignedStaffId = assignedStaffId;
        if (tags !== undefined) updates.tags = tags;
        if (parts !== undefined) updates.parts = parts;
        if (laborLines !== undefined) updates.laborLines = laborLines;
        if (tasks !== undefined) updates.tasks = tasks;
        if (bookTimeTotal !== undefined) updates.bookTimeTotal = bookTimeTotal;
        if (actualTimeTotal !== undefined) updates.actualTimeTotal = actualTimeTotal;
        if (dueDate !== undefined) updates.dueDate = dueDate;
        if (dropoffEta !== undefined) updates.dropoffEta = dropoffEta;
        if (completionEta !== undefined) updates.completionEta = completionEta;
        if (notes !== undefined) updates.notes = notes;
        if (archived !== undefined) updates.archived = archived;
        if (editLog !== undefined) updates.editLog = editLog;

        await jobRef.update(updates);
        
        // Re-construct the full job data for the sync logic
        const updatedJobData = { ...jobData, ...updates };
        
        // Let the intelligent sync decide if it needs to push (e.g. status changed from Pending to In Progress)
        const syncResult = await tryCompanyCamSync(jobRef, updatedJobData, caller.uid, tenantId);

        return res.json({ 
            id: jobId, 
            ...updatedJobData,
            _ccStatus: syncResult.status,
            _ccReason: syncResult.reason
        });
    } catch (error) {
        console.error("Error updating job:", error);
        return res.status(500).json({ error: 'Failed to update job' });
    }
});

// DELETE /jobs/:id - Delete a job
jobsRoutes.delete('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const jobId = req.params.id;

        const jobRef = getDb().collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();

        if (!jobDoc.exists) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const jobData = jobDoc.data()!;
        const tenantId = jobData.tenantId;

        if (!isManagerOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Only managers can delete jobs.' });
        }

        await jobRef.delete();
        return res.json({ message: 'Job deleted successfully' });
    } catch (error) {
        console.error("Error deleting job:", error);
        return res.status(500).json({ error: 'Failed to delete job' });
    }
});

// POST /jobs/:id/companycam-sync - Manual exact sync trigger
jobsRoutes.post('/:id/companycam-sync', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const jobId = req.params.id;

        const jobRef = getDb().collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();

        if (!jobDoc.exists) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const jobData = jobDoc.data()!;
        const tenantId = jobData.tenantId;

        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Cannot sync this job.' });
        }

        // We temporarily forge the status to bypass the "Pending" trap inside the helper
        const forgedJobData = { ...jobData, status: 'In Progress' };
        
        const syncResult = await tryCompanyCamSync(jobRef, forgedJobData, caller.uid, tenantId);

        if (syncResult.status === 'failed') {
            return res.status(400).json({ error: syncResult.reason });
        }

        return res.json({ message: 'Sync successful', _ccStatus: syncResult.status, _ccReason: syncResult.reason });
    } catch (error) {
        console.error("Error manual syncing job:", error);
        return res.status(500).json({ error: 'Failed to trigger sync' });
    }
});
