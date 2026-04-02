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
exports.jobsRoutes = (0, express_1.Router)();
const getDb = () => admin.firestore();
// Helper to determine if the caller has at least "staff" access to the tenant
const isMemberOfTenant = (caller, tenantId) => {
    const isSuperAdmin = caller.role === 'super_admin';
    const isTenantMember = caller.tenantId === tenantId;
    return isSuperAdmin || isTenantMember;
};
// Helper for Manager+ level access
const isManagerOfTenant = (caller, tenantId) => {
    const isSuperAdmin = caller.role === 'super_admin';
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
        const { title, description, status, priority, customerId, vehicleId, assignedStaffId, tags, dueDate, notes, parts, laborLines } = req.body;
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
        const { title, description, status, priority, customerId, vehicleId, assignedStaffId, tags, dueDate, notes, parts, laborLines } = req.body;
        const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (title !== undefined)
            updates.title = title;
        if (description !== undefined)
            updates.description = description;
        if (status !== undefined)
            updates.status = status;
        if (priority !== undefined)
            updates.priority = priority;
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
        if (dueDate !== undefined)
            updates.dueDate = dueDate;
        if (notes !== undefined)
            updates.notes = notes;
        await jobRef.update(updates);
        return res.json(Object.assign(Object.assign({ id: jobId }, jobData), updates));
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
//# sourceMappingURL=jobs.routes.js.map