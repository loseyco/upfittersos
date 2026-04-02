import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { authenticate } from '../middleware/auth.middleware';
import { checkBackendPermission } from '../utils/permissions';

export const tasksRoutes = Router();
const getDb = () => admin.firestore();

// GET /tasks?tenantId=xyz - Fetch tasks for a tenant
tasksRoutes.get('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.query.tenantId as string;

        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId query parameter is required' });
        }

        // Security check: Only members of this tenant (or super admin) can fetch tasks
        const isSuperAdmin = caller.role === 'super_admin';
        const isMemberOfTenant = caller.tenantId === tenantId;

        if (!isSuperAdmin && !isMemberOfTenant) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }

        const snapshot = await getDb().collection('tasks')
            .where('tenantId', '==', tenantId)
            .orderBy('createdAt', 'desc')
            .get();

        const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json(tasks);
    } catch (error) {
        console.error("Error fetching tasks:", error);
        return res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// POST /tasks - Create a new task
tasksRoutes.post('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const { title, type, assigneeUid, tenantId } = req.body;

        if (!title || !assigneeUid || !tenantId) {
            return res.status(400).json({ error: 'title, assigneeUid, and tenantId are required' });
        }

        // Security check: Check if user has explicit manage_tasks permission
        const hasManageTasks = await checkBackendPermission(caller.uid, caller.role, caller.tenantId, 'manage_tasks');

        // Further check that they are interacting within their own workspace unless they are a superadmin
        const isTenantBoundaryValid = caller.role === 'super_admin' || caller.tenantId === tenantId;

        if (!hasManageTasks || !isTenantBoundaryValid) {
            return res.status(403).json({ error: 'Forbidden. You do not have permission to assign tasks in this workspace.' });
        }

        const newTask = {
            title,
            type: type || 'Standard',
            assigneeUid,
            status: 'pending',
            tenantId,
            createdBy: caller.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await getDb().collection('tasks').add(newTask);
        return res.status(201).json({ id: docRef.id, ...newTask });
    } catch (error) {
        console.error("Error creating task:", error);
        return res.status(500).json({ error: 'Failed to create task' });
    }
});

// PUT /tasks/:id - Update a task
tasksRoutes.put('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const taskId = req.params.id;
        const { title, type, assigneeUid, status } = req.body;

        const taskRef = getDb().collection('tasks').doc(taskId);
        const taskDoc = await taskRef.get();

        if (!taskDoc.exists) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const taskData = taskDoc.data()!;
        const tenantId = taskData.tenantId;

        // Security check: Manager/Owner or the Assignee can update
        const hasManageTasks = await checkBackendPermission(caller.uid, caller.role, caller.tenantId, 'manage_tasks');
        const isTenantBoundaryValid = caller.role === 'super_admin' || caller.tenantId === tenantId;
        const hasAdminRights = hasManageTasks && isTenantBoundaryValid;
        
        const isAssignee = caller.uid === taskData.assigneeUid;

        if (!hasAdminRights && !isAssignee) {
            return res.status(403).json({ error: 'Forbidden. Cannot update this task.' });
        }

        const updates: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (title && hasAdminRights) updates.title = title;
        if (type && hasAdminRights) updates.type = type;
        if (assigneeUid && hasAdminRights) updates.assigneeUid = assigneeUid;
        if (status) updates.status = status; // Even the assignee can update status (e.g. to 'completed')

        await taskRef.update(updates);
        return res.json({ id: taskId, ...taskData, ...updates });
    } catch (error) {
        console.error("Error updating task:", error);
        return res.status(500).json({ error: 'Failed to update task' });
    }
});

// DELETE /tasks/:id - Delete a task
tasksRoutes.delete('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const taskId = req.params.id;

        const taskRef = getDb().collection('tasks').doc(taskId);
        const taskDoc = await taskRef.get();

        if (!taskDoc.exists) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const taskData = taskDoc.data()!;
        const tenantId = taskData.tenantId;

        // Security check: Only users with manage_tasks can delete
        const hasManageTasks = await checkBackendPermission(caller.uid, caller.role, caller.tenantId, 'manage_tasks');
        const isTenantBoundaryValid = caller.role === 'super_admin' || caller.tenantId === tenantId;
        
        const hasAdminRights = hasManageTasks && isTenantBoundaryValid;

        if (!hasAdminRights) {
            return res.status(403).json({ error: 'Forbidden. Cannot delete this task.' });
        }

        await taskRef.delete();
        return res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error("Error deleting task:", error);
        return res.status(500).json({ error: 'Failed to delete task' });
    }
});
