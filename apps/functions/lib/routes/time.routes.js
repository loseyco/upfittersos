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
exports.timeRoutes = void 0;
const express_1 = require("express");
const admin = __importStar(require("firebase-admin"));
const auth_middleware_1 = require("../middleware/auth.middleware");
exports.timeRoutes = (0, express_1.Router)({ mergeParams: true });
const getDb = () => admin.firestore();
// Helper to check basic tenant access
const isMemberOfTenant = (caller, tenantId) => {
    const isSuperAdmin = (caller.role === 'system_owner' || caller.role === 'super_admin');
    const isTenantMember = caller.tenantId === tenantId;
    return isSuperAdmin || isTenantMember;
};
// GET /businesses/:id/time_logs - Support filtering by userId and status
exports.timeRoutes.get('/:id/time_logs', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.params.id;
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const { userId, status } = req.query;
        // Build base query
        let query = getDb().collection('businesses').doc(tenantId).collection('time_logs');
        if (userId) {
            query = query.where('userId', '==', userId);
        }
        if (status) {
            query = query.where('status', '==', status);
        }
        const snapshot = await query.get();
        const logs = snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        // Sort descending by clock-in time natively in logic to avoid need for firestore index for this quick feature
        logs.sort((a, b) => {
            const timeA = new Date(a.clockIn || 0).getTime();
            const timeB = new Date(b.clockIn || 0).getTime();
            return timeB - timeA;
        });
        return res.json(logs);
    }
    catch (error) {
        console.error("Error fetching time logs:", error);
        return res.status(500).json({ error: 'Failed to fetch time logs' });
    }
});
// POST /businesses/:id/time_logs
exports.timeRoutes.post('/:id/time_logs', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.params.id;
        if (!isMemberOfTenant(caller, tenantId))
            return res.status(403).json({ error: 'Forbidden' });
        const data = req.body;
        const ref = await getDb().collection('businesses').doc(tenantId).collection('time_logs').add(data);
        return res.status(201).json(Object.assign({ id: ref.id }, data));
    }
    catch (error) {
        console.error("Error creating time log:", error);
        return res.status(500).json({ error: 'Failed to create time log' });
    }
});
// PUT /businesses/:id/time_logs/:logId
exports.timeRoutes.put('/:id/time_logs/:logId', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.params.id;
        if (!isMemberOfTenant(caller, tenantId))
            return res.status(403).json({ error: 'Forbidden' });
        const logId = req.params.logId;
        await getDb().collection('businesses').doc(tenantId).collection('time_logs').doc(logId).update(req.body);
        return res.json({ success: true });
    }
    catch (error) {
        console.error("Error updating time log:", error);
        return res.status(500).json({ error: 'Failed to update time log' });
    }
});
// GET /businesses/:id/time_off_requests
exports.timeRoutes.get('/:id/time_off_requests', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.params.id;
        if (!isMemberOfTenant(caller, tenantId))
            return res.status(403).json({ error: 'Forbidden' });
        const { userId } = req.query;
        let query = getDb().collection('businesses').doc(tenantId).collection('time_off_requests');
        if (userId)
            query = query.where('userId', '==', userId);
        const snapshot = await query.get();
        const requests = snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        // Sort descending by creation timestamp native array map
        requests.sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
        });
        return res.json(requests);
    }
    catch (error) {
        console.error("Error fetching time off requests:", error);
        return res.status(500).json({ error: 'Failed to fetch time off requests' });
    }
});
// POST /businesses/:id/time_off_requests
exports.timeRoutes.post('/:id/time_off_requests', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.params.id;
        if (!isMemberOfTenant(caller, tenantId))
            return res.status(403).json({ error: 'Forbidden' });
        const data = req.body;
        const ref = await getDb().collection('businesses').doc(tenantId).collection('time_off_requests').add(data);
        return res.status(201).json(Object.assign({ id: ref.id }, data));
    }
    catch (error) {
        console.error("Error creating time off request:", error);
        return res.status(500).json({ error: 'Failed to create time off request' });
    }
});
// PUT /businesses/:id/time_off_requests/:requestId
exports.timeRoutes.put('/:id/time_off_requests/:requestId', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.params.id;
        if (!isMemberOfTenant(caller, tenantId))
            return res.status(403).json({ error: 'Forbidden' });
        const requestId = req.params.requestId;
        await getDb().collection('businesses').doc(tenantId).collection('time_off_requests').doc(requestId).update(req.body);
        return res.json({ success: true });
    }
    catch (error) {
        console.error("Error updating time off request:", error);
        return res.status(500).json({ error: 'Failed to update time off request' });
    }
});
// POST /businesses/:id/payroll_runs
exports.timeRoutes.post('/:id/payroll_runs', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.params.id;
        // Strict Authorization: Only admin or super_admin can run payroll
        if (!isMemberOfTenant(caller, tenantId) || (caller.role !== 'admin' && caller.role !== 'workspace_admin' && caller.role !== 'system_owner' && caller.role !== 'super_admin')) {
            return res.status(403).json({ error: 'Forbidden. Only administrators can finalize payroll sequences.' });
        }
        const { startDate, endDate, totals, timeLogIds, timeOffRequestIds } = req.body;
        const db = getDb();
        const batch = db.batch();
        // 1. Create the immutable Payroll Run snapshot
        const runRef = db.collection('businesses').doc(tenantId).collection('payroll_runs').doc();
        batch.set(runRef, {
            startDate,
            endDate,
            totals,
            timeLogIds: timeLogIds || [],
            timeOffRequestIds: timeOffRequestIds || [],
            createdAt: new Date().toISOString(),
            createdBy: caller.uid,
            status: 'locked'
        });
        // 2. Mark all grouped Time Logs as finalized/paid so they cannot be altered or double-paid
        if (timeLogIds && Array.isArray(timeLogIds)) {
            timeLogIds.forEach(id => {
                const logRef = db.collection('businesses').doc(tenantId).collection('time_logs').doc(id);
                batch.update(logRef, { status: 'paid', payrollRunId: runRef.id });
            });
        }
        // 3. Mark all grouped Time Off Requests as paid
        if (timeOffRequestIds && Array.isArray(timeOffRequestIds)) {
            timeOffRequestIds.forEach(id => {
                const reqRef = db.collection('businesses').doc(tenantId).collection('time_off_requests').doc(id);
                batch.update(reqRef, { status: 'paid', payrollRunId: runRef.id });
            });
        }
        // Execute transaction atomically
        await batch.commit();
        return res.status(201).json({ success: true, id: runRef.id });
    }
    catch (error) {
        console.error("Error finalizing payroll:", error);
        return res.status(500).json({ error: 'Failed to finalize payroll sequence' });
    }
});
//# sourceMappingURL=time.routes.js.map