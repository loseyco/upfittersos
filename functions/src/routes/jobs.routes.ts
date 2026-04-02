import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { authenticate } from '../middleware/auth.middleware';

export const jobsRoutes = Router();
const getDb = () => admin.firestore();

// Helper to determine if the caller has at least "staff" access to the tenant
const isMemberOfTenant = (caller: any, tenantId: string) => {
    const isSuperAdmin = caller.role === 'super_admin';
    const isTenantMember = caller.tenantId === tenantId;
    return isSuperAdmin || isTenantMember;
};

// Helper for Manager+ level access
const isManagerOfTenant = (caller: any, tenantId: string) => {
    const isSuperAdmin = caller.role === 'super_admin';
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
            tags, dueDate, notes, parts, laborLines
        } = req.body;

        const newJob = {
            tenantId,
            title: title || 'Untitled Job',
            description: description || '',
            status: status || 'Pending', // Pending, In Progress, Completed
            priority: priority || 'Medium',
            customerId: customerId || null,
            vehicleId: vehicleId || null,
            assignedStaffId: assignedStaffId || null,
            tags: tags || [],
            parts: parts || [],
            laborLines: laborLines || [],
            dueDate: dueDate || null,
            notes: notes || '',
            createdBy: caller.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await getDb().collection('jobs').add(newJob);
        return res.status(201).json({ id: docRef.id, ...newJob });
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
            tags, dueDate, notes, parts, laborLines
        } = req.body;

        const updates: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (status !== undefined) updates.status = status;
        if (priority !== undefined) updates.priority = priority;
        if (customerId !== undefined) updates.customerId = customerId;
        if (vehicleId !== undefined) updates.vehicleId = vehicleId;
        if (assignedStaffId !== undefined) updates.assignedStaffId = assignedStaffId;
        if (tags !== undefined) updates.tags = tags;
        if (parts !== undefined) updates.parts = parts;
        if (laborLines !== undefined) updates.laborLines = laborLines;
        if (dueDate !== undefined) updates.dueDate = dueDate;
        if (notes !== undefined) updates.notes = notes;

        await jobRef.update(updates);
        return res.json({ id: jobId, ...jobData, ...updates });
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
