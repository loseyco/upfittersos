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
exports.inventoryRoutes = void 0;
const express_1 = require("express");
const admin = __importStar(require("firebase-admin"));
const auth_middleware_1 = require("../middleware/auth.middleware");
exports.inventoryRoutes = (0, express_1.Router)();
// Lazily evaluate Firestore
const getDb = () => admin.firestore();
/**
 * GET /inventory
 * Retrieve all physical items belonging to the authorized Tenant's Workspace.
 */
exports.inventoryRoutes.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = caller.role === 'super_admin' ? (req.query.tenantId || req.headers['x-tenant-id']) : caller.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'Tenant context required.' });
        }
        const snapshot = await getDb().collection('inventory_items').where('tenantId', '==', tenantId).get();
        const items = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        return res.json(items);
    }
    catch (e) {
        return res.status(500).json({ error: 'Failed to retrieve inventory catalog.' });
    }
});
/**
 * POST /inventory
 * Register a new part (sku, bin location) into the workspace catalog.
 */
exports.inventoryRoutes.post('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const payload = req.body;
        const caller = req.user;
        const tenantId = caller.role === 'super_admin' ? (payload.tenantId || caller.tenantId) : caller.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'Workspace tenant assignment required.' });
        }
        const newItemRef = getDb().collection('inventory_items').doc();
        await newItemRef.set(Object.assign(Object.assign({}, payload), { tenantId, createdAt: new Date().toISOString(), createdBy: caller.uid }));
        // If the payload came with a pre-scanned QR Node (e.g., sticking a raw QR on a bin)
        if (payload.qrNodeId) {
            await getDb().collection('qr_nodes').doc(payload.qrNodeId).set({
                tenantId,
                entityType: 'inventory',
                entityId: newItemRef.id,
                claimedAt: new Date().toISOString()
            }, { merge: true });
        }
        return res.json({ success: true, id: newItemRef.id });
    }
    catch (e) {
        return res.status(500).json({ error: 'Failed to log inventory item.' });
    }
});
/**
 * GET /inventory/:id
 * Retrieve specific details regarding a part in the catalog.
 */
exports.inventoryRoutes.get('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const caller = req.user;
        const callerTenantId = caller.role === 'super_admin' ? null : caller.tenantId;
        const itemDoc = await getDb().collection('inventory_items').doc(id).get();
        if (!itemDoc.exists)
            return res.status(404).json({ error: 'Item not found in catalog.' });
        const data = itemDoc.data();
        if (callerTenantId && (data === null || data === void 0 ? void 0 : data.tenantId) !== callerTenantId) {
            return res.status(403).json({ error: 'Forbidden. Asset belongs to another Operational Workspace.' });
        }
        return res.json(Object.assign({ id: itemDoc.id }, data));
    }
    catch (e) {
        return res.status(500).json({ error: 'Failed to resolve item details.' });
    }
});
//# sourceMappingURL=inventory.routes.js.map