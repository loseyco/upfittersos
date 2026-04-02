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
exports.tasksRoutes = void 0;
const express_1 = require("express");
const admin = __importStar(require("firebase-admin"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const permissions_1 = require("../utils/permissions");
exports.tasksRoutes = (0, express_1.Router)();
const getDb = () => admin.firestore();
// GET /tasks?tenantId=xyz - Fetch tasks for a tenant
exports.tasksRoutes.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.query.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId query parameter is required' });
        }
        // Security check: Only members of this tenant (or super admin) can fetch tasks
        const callerRoles = Array.isArray(caller.roles) ? caller.roles : (caller.role ? [caller.role] : []);
        const isSuperAdmin = callerRoles.includes('super_admin');
        const isMemberOfTenant = caller.tenantId === tenantId;
        if (!isSuperAdmin && !isMemberOfTenant) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }
        const snapshot = await getDb().collection('tasks')
            .where('tenantId', '==', tenantId)
            .get();
        const tasks = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        // Sort in memory to avoid requiring a composite index in Firestore
        tasks.sort((a, b) => {
            var _a, _b, _c, _d;
            const timeA = (_b = (_a = a.createdAt) === null || _a === void 0 ? void 0 : _a._seconds) !== null && _b !== void 0 ? _b : 0;
            const timeB = (_d = (_c = b.createdAt) === null || _c === void 0 ? void 0 : _c._seconds) !== null && _d !== void 0 ? _d : 0;
            return timeB - timeA;
        });
        return res.json(tasks);
    }
    catch (error) {
        console.error("Error fetching tasks:", error);
        return res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});
// POST /tasks - Create a new task
exports.tasksRoutes.post('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const { title, type, assigneeUid, tenantId } = req.body;
        if (!title || !assigneeUid || !tenantId) {
            return res.status(400).json({ error: 'title, assigneeUid, and tenantId are required' });
        }
        // Security check: Check if user has explicit manage_tasks permission
        const callerRoles = Array.isArray(caller.roles) ? caller.roles : (caller.role ? [caller.role] : []);
        const hasManageTasks = await (0, permissions_1.checkBackendPermission)(caller.uid, callerRoles, caller.tenantId, 'manage_tasks');
        // Further check that they are interacting within their own workspace unless they are a superadmin
        const isTenantBoundaryValid = callerRoles.includes('super_admin') || caller.tenantId === tenantId;
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
        return res.status(201).json(Object.assign({ id: docRef.id }, newTask));
    }
    catch (error) {
        console.error("Error creating task:", error);
        return res.status(500).json({ error: 'Failed to create task' });
    }
});
// PUT /tasks/:id - Update a task
exports.tasksRoutes.put('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const taskId = req.params.id;
        const { title, type, assigneeUid, status, feedback } = req.body;
        const taskRef = getDb().collection('tasks').doc(taskId);
        const taskDoc = await taskRef.get();
        if (!taskDoc.exists) {
            return res.status(404).json({ error: 'Task not found' });
        }
        const taskData = taskDoc.data();
        const tenantId = taskData.tenantId;
        // Security check: Manager/Owner or the Assignee can update
        const callerRoles = Array.isArray(caller.roles) ? caller.roles : (caller.role ? [caller.role] : []);
        const hasManageTasks = await (0, permissions_1.checkBackendPermission)(caller.uid, callerRoles, caller.tenantId, 'manage_tasks');
        const isTenantBoundaryValid = callerRoles.includes('super_admin') || caller.tenantId === tenantId;
        const hasAdminRights = hasManageTasks && isTenantBoundaryValid;
        const isAssignee = caller.uid === taskData.assigneeUid;
        if (!hasAdminRights && !isAssignee) {
            return res.status(403).json({ error: 'Forbidden. Cannot update this task.' });
        }
        const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (title && hasAdminRights)
            updates.title = title;
        if (type && hasAdminRights)
            updates.type = type;
        if (assigneeUid && hasAdminRights)
            updates.assigneeUid = assigneeUid;
        if (status)
            updates.status = status; // Even the assignee can update status (e.g. to 'completed')
        if (feedback && (hasAdminRights || isAssignee))
            updates.feedback = feedback;
        await taskRef.update(updates);
        return res.json(Object.assign(Object.assign({ id: taskId }, taskData), updates));
    }
    catch (error) {
        console.error("Error updating task:", error);
        return res.status(500).json({ error: 'Failed to update task' });
    }
});
// DELETE /tasks/:id - Delete a task
exports.tasksRoutes.delete('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const taskId = req.params.id;
        const taskRef = getDb().collection('tasks').doc(taskId);
        const taskDoc = await taskRef.get();
        if (!taskDoc.exists) {
            return res.status(404).json({ error: 'Task not found' });
        }
        const taskData = taskDoc.data();
        const tenantId = taskData.tenantId;
        // Security check: Only users with manage_tasks can delete
        const callerRoles = Array.isArray(caller.roles) ? caller.roles : (caller.role ? [caller.role] : []);
        const hasManageTasks = await (0, permissions_1.checkBackendPermission)(caller.uid, callerRoles, caller.tenantId, 'manage_tasks');
        const isTenantBoundaryValid = callerRoles.includes('super_admin') || caller.tenantId === tenantId;
        const hasAdminRights = hasManageTasks && isTenantBoundaryValid;
        if (!hasAdminRights) {
            return res.status(403).json({ error: 'Forbidden. Cannot delete this task.' });
        }
        await taskRef.delete();
        return res.json({ message: 'Task deleted successfully' });
    }
    catch (error) {
        console.error("Error deleting task:", error);
        return res.status(500).json({ error: 'Failed to delete task' });
    }
});
//# sourceMappingURL=tasks.routes.js.map