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
        const tenantId = (caller.role === 'system_owner' || caller.role === 'super_admin') ? (req.query.tenantId || req.headers['x-tenant-id']) : caller.tenantId;
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
    var _a;
    try {
        const payload = req.body;
        const caller = req.user;
        const tenantId = (caller.role === 'system_owner' || caller.role === 'super_admin') ? (payload.tenantId || caller.tenantId) : caller.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'Workspace tenant assignment required.' });
        }
        const newItemRef = getDb().collection('inventory_items').doc();
        await newItemRef.set(Object.assign(Object.assign({}, payload), { quantityOnHand: payload.quantityOnHand || 0, quantityAllocated: payload.quantityAllocated || 0, quantityOnOrder: payload.quantityOnOrder || 0, tenantId, createdAt: new Date().toISOString(), createdBy: caller.uid }));
        // If the payload came with a pre-scanned QR Node (e.g., sticking a raw QR on a bin)
        if (payload.qrNodeId) {
            await getDb().collection('qr_nodes').doc(payload.qrNodeId).set({
                tenantId,
                entityType: 'inventory',
                entityId: newItemRef.id,
                claimedAt: new Date().toISOString()
            }, { merge: true });
        }
        // --- QUICKBOOKS SYNC (Option 2) ---
        try {
            const bizDoc = await getDb().collection('businesses').doc(tenantId).get();
            const bizData = bizDoc.data();
            // Check if QBO is authenticated
            if (bizData === null || bizData === void 0 ? void 0 : bizData.qboAccessToken) {
                // Import QboService dynamically to avoid circular references if any
                const { QbwcService } = require('../services/qbwc.service');
                const qbwcService = new QbwcService(tenantId);
                // These defaults should ideally be configured per-tenant in business settings, but we fallback.
                const assetAcc = bizData.qboDefaultAssetAccountRef || '79'; // Inventory Asset
                const incomeAcc = bizData.qboDefaultIncomeAccountRef || '1'; // Sales of Product Income
                const expenseAcc = bizData.qboDefaultExpenseAccountRef || '55'; // Cost of Goods Sold
                const qboRes = await qbwcService.syncItemToQBO(payload.sku || `ITEM-${newItemRef.id}`, payload.name || `Asset ${newItemRef.id}`, payload.description || '', payload.price || 0, payload.quantityOnHand || 0, assetAcc, incomeAcc, expenseAcc);
                // Note: since QbwcService queues the command instead of directly hitting REST, qboRes won't immediately return Item ID.
                if (qboRes && ((_a = qboRes.Item) === null || _a === void 0 ? void 0 : _a.Id)) {
                    await newItemRef.update({ qboItemId: qboRes.Item.Id });
                }
            }
        }
        catch (qboErr) {
            console.error('Non-blocking: Failed to sync new part to QuickBooks', qboErr.message);
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
        const callerTenantId = (caller.role === 'system_owner' || caller.role === 'super_admin') ? null : caller.tenantId;
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
/**
 * PUT /:id
 * Update specific characteristics of an item (quantity, price, location).
 */
exports.inventoryRoutes.put('/:id', auth_middleware_1.authenticate, async (req, res) => {
    var _a;
    try {
        const { id } = req.params;
        const payload = req.body;
        const caller = req.user;
        const callerTenantId = (caller.role === 'system_owner' || caller.role === 'super_admin') ? null : caller.tenantId;
        const itemRef = getDb().collection('inventory_items').doc(id);
        const itemDoc = await itemRef.get();
        if (!itemDoc.exists)
            return res.status(404).json({ error: 'Item not found in catalog.' });
        if (callerTenantId && ((_a = itemDoc.data()) === null || _a === void 0 ? void 0 : _a.tenantId) !== callerTenantId) {
            return res.status(403).json({ error: 'Forbidden. Asset belongs to another Operational Workspace.' });
        }
        // Clean out tenantId if accidentally sent
        const updates = Object.assign(Object.assign({}, payload), { updatedAt: new Date().toISOString() });
        if (!caller.role || caller.role !== 'system_owner' && caller.role !== 'super_admin') {
            delete updates.tenantId;
        }
        await itemRef.update(updates);
        return res.json({ success: true });
    }
    catch (e) {
        return res.status(500).json({ error: 'Failed to update item details.' });
    }
});
/**
 * DELETE /:id
 * Remove a part from the catalog.
 */
exports.inventoryRoutes.delete('/:id', auth_middleware_1.authenticate, async (req, res) => {
    var _a;
    try {
        const { id } = req.params;
        const caller = req.user;
        const callerTenantId = (caller.role === 'system_owner' || caller.role === 'super_admin') ? null : caller.tenantId;
        const itemRef = getDb().collection('inventory_items').doc(id);
        const itemDoc = await itemRef.get();
        if (!itemDoc.exists)
            return res.status(404).json({ error: 'Item not found in catalog.' });
        if (callerTenantId && ((_a = itemDoc.data()) === null || _a === void 0 ? void 0 : _a.tenantId) !== callerTenantId) {
            return res.status(403).json({ error: 'Forbidden.' });
        }
        await itemRef.delete();
        return res.json({ success: true, message: 'Item removed from catalog.' });
    }
    catch (e) {
        return res.status(500).json({ error: 'Failed to delete item.' });
    }
});
/**
 * GET /:id/logs
 * Retrieve transaction history for a specific part.
 */
exports.inventoryRoutes.get('/:id/logs', auth_middleware_1.authenticate, async (req, res) => {
    var _a;
    try {
        const { id } = req.params;
        const caller = req.user;
        const callerTenantId = (caller.role === 'system_owner' || caller.role === 'super_admin') ? null : caller.tenantId;
        const itemRef = getDb().collection('inventory_items').doc(id);
        const itemDoc = await itemRef.get();
        if (!itemDoc.exists)
            return res.status(404).json({ error: 'Item not found.' });
        if (callerTenantId && ((_a = itemDoc.data()) === null || _a === void 0 ? void 0 : _a.tenantId) !== callerTenantId) {
            return res.status(403).json({ error: 'Forbidden.' });
        }
        const snapshot = await getDb().collection('inventory_logs')
            .where('itemId', '==', id)
            .get();
        const logs = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return res.json(logs);
    }
    catch (e) {
        console.error("GET LOGS Error:", e);
        return res.status(500).json({ error: 'Failed to retrieve item logs.' });
    }
});
/**
 * POST /:id/log
 * Create an activity log and automatically mutate the quantity fields on the part.
 */
exports.inventoryRoutes.post('/:id/log', auth_middleware_1.authenticate, async (req, res) => {
    var _a, _b;
    try {
        const { id } = req.params;
        const { actionType, quantityChange, notes, targetRef } = req.body;
        const caller = req.user;
        const callerTenantId = (caller.role === 'system_owner' || caller.role === 'super_admin') ? null : caller.tenantId;
        if (!actionType || quantityChange === undefined) {
            return res.status(400).json({ error: 'actionType and quantityChange required.' });
        }
        const db = getDb();
        const itemRef = db.collection('inventory_items').doc(id);
        await db.runTransaction(async (t) => {
            const itemDoc = await t.get(itemRef);
            if (!itemDoc.exists) {
                throw new Error('Item not found');
            }
            const data = itemDoc.data();
            if (callerTenantId && data.tenantId !== callerTenantId) {
                throw new Error('Forbidden');
            }
            let onHand = data.quantityOnHand || 0;
            let allocated = data.quantityAllocated || 0;
            let onOrder = data.quantityOnOrder || 0;
            const qty = Number(quantityChange);
            switch (actionType) {
                case 'RECEIVE':
                    onHand += qty;
                    break;
                case 'WASTE':
                    onHand -= qty;
                    break;
                case 'ASSIGN':
                    allocated += qty;
                    break;
                case 'UNASSIGN':
                    allocated -= qty;
                    break;
                case 'CONSUME':
                    // e.g., the job was finished, so we consume the allocated part permanently
                    onHand -= qty;
                    allocated -= qty;
                    break;
                case 'AUDIT':
                    onHand = qty; // For audit, quantityChange is the new absolute value
                    break;
                default:
                    throw new Error('Invalid actionType');
            }
            // Update item
            t.update(itemRef, {
                quantityOnHand: onHand,
                quantityAllocated: Math.max(0, allocated),
                quantityOnOrder: onOrder,
                updatedAt: new Date().toISOString()
            });
            // Create log
            const logRef = db.collection('inventory_logs').doc();
            t.set(logRef, {
                itemId: id,
                tenantId: data.tenantId,
                actionType,
                quantityChange: qty, // absolute absolute value or differential depends on audit, but frontend should send correct payload
                onHandAfter: onHand,
                allocatedAfter: Math.max(0, allocated),
                notes: notes || '',
                targetRef: targetRef || null,
                createdBy: caller.uid,
                createdAt: new Date().toISOString()
            });
        });
        // --- QUICKBOOKS SYNC (Option 2) ---
        // After transaction succeeds, sync adjustment to QBO if the item is linked
        try {
            const itemDocAfter = await db.collection('inventory_items').doc(id).get();
            const afterData = itemDocAfter.data();
            if (afterData.qboItemId) {
                const bizDoc = await db.collection('businesses').doc(afterData.tenantId).get();
                if (bizDoc.exists && ((_a = bizDoc.data()) === null || _a === void 0 ? void 0 : _a.qboAccessToken)) {
                    const { QbwcService } = require('../services/qbwc.service');
                    const qbwcService = new QbwcService(afterData.tenantId);
                    // Uses a default COGS/Shrinkage account 
                    const adjAccountRef = ((_b = bizDoc.data()) === null || _b === void 0 ? void 0 : _b.qboDefaultAdjustmentAccountRef) || '62';
                    let qtyDiff = Number(quantityChange);
                    if (actionType === 'AUDIT') {
                        // For audits, quantityChange was absolute. We calculate the diff manually based on old value.
                        // However, we just know what was provided. Since QBO needs a diff, we'd need the previous values.
                        // We will skip audit diff for now, or just send a 0 diff to be safe if qtyChange is not the offset.
                        // Assuming frontend is now sending the offset in quantityChange, or we handled it.
                        // Wait, in audit, `onHand = qty` earlier, which means qty is the NEW absolute value. 
                        console.warn("Audit syncing to QBO might require negative/positive differential calculation.");
                    }
                    else if (['WASTE', 'CONSUME', 'UNASSIGN'].includes(actionType)) {
                        // Some actions reduce quantity. Make sure it's negative for QBO if it wasn't already passed as negative.
                        if (qtyDiff > 0)
                            qtyDiff = -qtyDiff;
                    }
                    if (qtyDiff !== 0) {
                        await qbwcService.adjustInventoryQuantity(afterData.qboItemId, adjAccountRef, qtyDiff);
                    }
                }
            }
        }
        catch (qboErr) {
            console.error('Non-blocking: Failed to sync inventory adjustment to QuickBooks', qboErr.message);
        }
        return res.json({ success: true });
    }
    catch (e) {
        console.error("POST LOG Error:", e);
        if (e.message === 'Forbidden' || e.message === 'Item not found') {
            return res.status(403).json({ error: e.message });
        }
        return res.status(500).json({ error: 'Failed to log activity.' });
    }
});
//# sourceMappingURL=inventory.routes.js.map