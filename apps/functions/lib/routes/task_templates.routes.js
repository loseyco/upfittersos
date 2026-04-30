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
exports.taskTemplatesRoutes = void 0;
const express_1 = require("express");
const admin = __importStar(require("firebase-admin"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const permissions_1 = require("../utils/permissions");
exports.taskTemplatesRoutes = (0, express_1.Router)();
const getDb = () => admin.firestore();
// GET /task_templates?tenantId=xyz
exports.taskTemplatesRoutes.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.query.tenantId;
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
        const templates = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        return res.json(templates);
    }
    catch (error) {
        console.error("Error fetching task templates:", error);
        return res.status(500).json({ error: 'Failed to fetch templates' });
    }
});
// POST /task_templates
exports.taskTemplatesRoutes.post('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const { title, description, bookTime, laborRate, parts, notes, sops, directions, tenantId } = req.body;
        if (!title || !tenantId) {
            return res.status(400).json({ error: 'title and tenantId are required' });
        }
        const callerRoles = Array.isArray(caller.roles) ? caller.roles : (caller.role ? [caller.role] : []);
        const hasManageJobs = await (0, permissions_1.checkBackendPermission)(caller.uid, callerRoles, caller.tenantId, 'manage_jobs');
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
        return res.status(201).json(Object.assign({ id: docRef.id }, newTemplate));
    }
    catch (error) {
        console.error("Error creating template:", error);
        return res.status(500).json({ error: 'Failed to create template' });
    }
});
// PUT /task_templates/:id
exports.taskTemplatesRoutes.put('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const templateId = req.params.id;
        const { title, description, bookTime, laborRate, parts, notes, sops, directions } = req.body;
        const docRef = getDb().collection('task_templates').doc(templateId);
        const snapshot = await docRef.get();
        if (!snapshot.exists) {
            return res.status(404).json({ error: 'Template not found' });
        }
        const templateData = snapshot.data();
        const tenantId = templateData.tenantId;
        const callerRoles = Array.isArray(caller.roles) ? caller.roles : (caller.role ? [caller.role] : []);
        const hasManageJobs = await (0, permissions_1.checkBackendPermission)(caller.uid, callerRoles, caller.tenantId, 'manage_jobs');
        const isTenantBoundaryValid = (callerRoles.includes('system_owner') || callerRoles.includes('super_admin')) || caller.tenantId === tenantId;
        if (!hasManageJobs || !isTenantBoundaryValid) {
            return res.status(403).json({ error: 'Forbidden.' });
        }
        const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (title !== undefined)
            updates.title = title;
        if (description !== undefined)
            updates.description = description;
        if (bookTime !== undefined)
            updates.bookTime = bookTime;
        if (laborRate !== undefined)
            updates.laborRate = laborRate;
        if (parts !== undefined)
            updates.parts = parts;
        if (notes !== undefined)
            updates.notes = notes;
        if (sops !== undefined)
            updates.sops = sops;
        if (directions !== undefined)
            updates.directions = directions;
        await docRef.update(updates);
        return res.json(Object.assign(Object.assign({ id: templateId }, templateData), updates));
    }
    catch (error) {
        console.error("Error updating template:", error);
        return res.status(500).json({ error: 'Failed to update template' });
    }
});
// DELETE /task_templates/:id
exports.taskTemplatesRoutes.delete('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const templateId = req.params.id;
        const docRef = getDb().collection('task_templates').doc(templateId);
        const snapshot = await docRef.get();
        if (!snapshot.exists) {
            return res.status(404).json({ error: 'Template not found' });
        }
        const templateData = snapshot.data();
        const tenantId = templateData.tenantId;
        const callerRoles = Array.isArray(caller.roles) ? caller.roles : (caller.role ? [caller.role] : []);
        const hasManageJobs = await (0, permissions_1.checkBackendPermission)(caller.uid, callerRoles, caller.tenantId, 'manage_jobs');
        const isTenantBoundaryValid = (callerRoles.includes('system_owner') || callerRoles.includes('super_admin')) || caller.tenantId === tenantId;
        if (!hasManageJobs || !isTenantBoundaryValid) {
            return res.status(403).json({ error: 'Forbidden.' });
        }
        await docRef.delete();
        return res.json({ message: 'Template deleted successfully' });
    }
    catch (error) {
        console.error("Error deleting template:", error);
        return res.status(500).json({ error: 'Failed to delete template' });
    }
});
//# sourceMappingURL=task_templates.routes.js.map