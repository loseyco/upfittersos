import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { authenticate } from '../middleware/auth.middleware';
import { checkBackendPermission } from '../utils/permissions';

export const taskTemplatesRoutes = Router();
const getDb = () => admin.firestore();

// GET /task_templates?tenantId=xyz
taskTemplatesRoutes.get('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.query.tenantId as string;

        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId is required' });
        }

        const callerRoles = Array.isArray(caller.roles) ? caller.roles : (caller.role ? [caller.role] : []);
        const isSuperAdmin = (callerRoles.includes('system_owner') || callerRoles.includes('super_admin'));
        const isMemberOfTenant = caller.tenantId === tenantId;

        if (!isSuperAdmin && !isMemberOfTenant) {
            return res.status(403).json({ error: 'Forbidden.' });
        }

        const snapshot = await getDb().collection('task_templates')
            .where('tenantId', '==', tenantId)
            .get();

        const templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json(templates);
    } catch (error) {
        console.error("Error fetching task templates:", error);
        return res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

// POST /task_templates
taskTemplatesRoutes.post('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const { title, description, bookTime, laborRate, parts, notes, sops, directions, tenantId } = req.body;

        if (!title || !tenantId) {
            return res.status(400).json({ error: 'title and tenantId are required' });
        }

        const callerRoles = Array.isArray(caller.roles) ? caller.roles : (caller.role ? [caller.role] : []);
        const hasManageJobs = await checkBackendPermission(caller.uid, callerRoles, caller.tenantId, 'manage_jobs');
        const isTenantBoundaryValid = (callerRoles.includes('system_owner') || callerRoles.includes('super_admin')) || caller.tenantId === tenantId;

        if (!hasManageJobs || !isTenantBoundaryValid) {
            return res.status(403).json({ error: 'Forbidden. manage_jobs permission required.' });
        }

        const newTemplate = {
            title,
            description: description || '',
            bookTime: bookTime || 1,
            laborRate: laborRate || 150,
            parts: parts || [],
            notes: notes || '',
            sops: sops || '',
            directions: directions || '',
            tenantId,
            createdBy: caller.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await getDb().collection('task_templates').add(newTemplate);
        return res.status(201).json({ id: docRef.id, ...newTemplate });
    } catch (error) {
        console.error("Error creating template:", error);
        return res.status(500).json({ error: 'Failed to create template' });
    }
});

// PUT /task_templates/:id
taskTemplatesRoutes.put('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const templateId = req.params.id;
        const { title, description, bookTime, laborRate, parts, notes, sops, directions } = req.body;

        const docRef = getDb().collection('task_templates').doc(templateId);
        const snapshot = await docRef.get();

        if (!snapshot.exists) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const templateData = snapshot.data()!;
        const tenantId = templateData.tenantId;

        const callerRoles = Array.isArray(caller.roles) ? caller.roles : (caller.role ? [caller.role] : []);
        const hasManageJobs = await checkBackendPermission(caller.uid, callerRoles, caller.tenantId, 'manage_jobs');
        const isTenantBoundaryValid = (callerRoles.includes('system_owner') || callerRoles.includes('super_admin')) || caller.tenantId === tenantId;

        if (!hasManageJobs || !isTenantBoundaryValid) {
            return res.status(403).json({ error: 'Forbidden.' });
        }

        const updates: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (bookTime !== undefined) updates.bookTime = bookTime;
        if (laborRate !== undefined) updates.laborRate = laborRate;
        if (parts !== undefined) updates.parts = parts;
        if (notes !== undefined) updates.notes = notes;
        if (sops !== undefined) updates.sops = sops;
        if (directions !== undefined) updates.directions = directions;

        await docRef.update(updates);
        return res.json({ id: templateId, ...templateData, ...updates });
    } catch (error) {
        console.error("Error updating template:", error);
        return res.status(500).json({ error: 'Failed to update template' });
    }
});

// DELETE /task_templates/:id
taskTemplatesRoutes.delete('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const templateId = req.params.id;

        const docRef = getDb().collection('task_templates').doc(templateId);
        const snapshot = await docRef.get();

        if (!snapshot.exists) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const templateData = snapshot.data()!;
        const tenantId = templateData.tenantId;

        const callerRoles = Array.isArray(caller.roles) ? caller.roles : (caller.role ? [caller.role] : []);
        const hasManageJobs = await checkBackendPermission(caller.uid, callerRoles, caller.tenantId, 'manage_jobs');
        const isTenantBoundaryValid = (callerRoles.includes('system_owner') || callerRoles.includes('super_admin')) || caller.tenantId === tenantId;

        if (!hasManageJobs || !isTenantBoundaryValid) {
            return res.status(403).json({ error: 'Forbidden.' });
        }

        await docRef.delete();
        return res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        console.error("Error deleting template:", error);
        return res.status(500).json({ error: 'Failed to delete template' });
    }
});
