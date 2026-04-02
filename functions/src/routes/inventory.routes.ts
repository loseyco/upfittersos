import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { authenticate } from '../middleware/auth.middleware';

export const inventoryRoutes = Router();
// Lazily evaluate Firestore
const getDb = () => admin.firestore();

/**
 * GET /inventory
 * Retrieve all physical items belonging to the authorized Tenant's Workspace.
 */
inventoryRoutes.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const caller = (req as any).user;
        const tenantId = caller.role === 'super_admin' ? (req.query.tenantId || req.headers['x-tenant-id']) : caller.tenantId;

        if (!tenantId) {
            return res.status(400).json({ error: 'Tenant context required.' });
        }

        const snapshot = await getDb().collection('inventory_items').where('tenantId', '==', tenantId).get();
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return res.json(items);
    } catch (e: any) {
        return res.status(500).json({ error: 'Failed to retrieve inventory catalog.' });
    }
});

/**
 * POST /inventory
 * Register a new part (sku, bin location) into the workspace catalog.
 */
inventoryRoutes.post('/', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const payload = req.body;
        const caller = (req as any).user;
        const tenantId = caller.role === 'super_admin' ? (payload.tenantId || caller.tenantId) : caller.tenantId;

        if (!tenantId) {
            return res.status(400).json({ error: 'Workspace tenant assignment required.' });
        }

        const newItemRef = getDb().collection('inventory_items').doc();
        await newItemRef.set({
            ...payload,
            quantityOnHand: payload.quantityOnHand || 0,
            quantityAllocated: payload.quantityAllocated || 0,
            quantityOnOrder: payload.quantityOnOrder || 0,
            tenantId,
            createdAt: new Date().toISOString(),
            createdBy: caller.uid
        });

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
    } catch (e: any) {
        return res.status(500).json({ error: 'Failed to log inventory item.' });
    }
});

/**
 * GET /inventory/:id
 * Retrieve specific details regarding a part in the catalog.
 */
inventoryRoutes.get('/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const caller = (req as any).user;
        const callerTenantId = caller.role === 'super_admin' ? null : caller.tenantId;

        const itemDoc = await getDb().collection('inventory_items').doc(id).get();
        if (!itemDoc.exists) return res.status(404).json({ error: 'Item not found in catalog.' });
        
        const data = itemDoc.data();
        if (callerTenantId && data?.tenantId !== callerTenantId) {
            return res.status(403).json({ error: 'Forbidden. Asset belongs to another Operational Workspace.' });
        }

        return res.json({ id: itemDoc.id, ...data });
    } catch (e: any) {
         return res.status(500).json({ error: 'Failed to resolve item details.' });
    }
});

/**
 * PUT /:id
 * Update specific characteristics of an item (quantity, price, location).
 */
inventoryRoutes.put('/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const payload = req.body;
        const caller = (req as any).user;
        const callerTenantId = caller.role === 'super_admin' ? null : caller.tenantId;

        const itemRef = getDb().collection('inventory_items').doc(id);
        const itemDoc = await itemRef.get();
        
        if (!itemDoc.exists) return res.status(404).json({ error: 'Item not found in catalog.' });
        if (callerTenantId && itemDoc.data()?.tenantId !== callerTenantId) {
            return res.status(403).json({ error: 'Forbidden. Asset belongs to another Operational Workspace.' });
        }

        // Clean out tenantId if accidentally sent
        const updates = { ...payload, updatedAt: new Date().toISOString() };
        if (!caller.role || caller.role !== 'super_admin') {
            delete updates.tenantId;
        }

        await itemRef.update(updates);
        return res.json({ success: true });
    } catch (e: any) {
         return res.status(500).json({ error: 'Failed to update item details.' });
    }
});

/**
 * DELETE /:id
 * Remove a part from the catalog.
 */
inventoryRoutes.delete('/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const caller = (req as any).user;
        const callerTenantId = caller.role === 'super_admin' ? null : caller.tenantId;

        const itemRef = getDb().collection('inventory_items').doc(id);
        const itemDoc = await itemRef.get();
        if (!itemDoc.exists) return res.status(404).json({ error: 'Item not found in catalog.' });
        if (callerTenantId && itemDoc.data()?.tenantId !== callerTenantId) {
            return res.status(403).json({ error: 'Forbidden.' });
        }

        await itemRef.delete();
        return res.json({ success: true, message: 'Item removed from catalog.' });
    } catch (e: any) {
        return res.status(500).json({ error: 'Failed to delete item.' });
    }
});

/**
 * GET /:id/logs
 * Retrieve transaction history for a specific part.
 */
inventoryRoutes.get('/:id/logs', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const caller = (req as any).user;
        const callerTenantId = caller.role === 'super_admin' ? null : caller.tenantId;

        const itemRef = getDb().collection('inventory_items').doc(id);
        const itemDoc = await itemRef.get();
        if (!itemDoc.exists) return res.status(404).json({ error: 'Item not found.' });
        if (callerTenantId && itemDoc.data()?.tenantId !== callerTenantId) {
            return res.status(403).json({ error: 'Forbidden.' });
        }

        const snapshot = await getDb().collection('inventory_logs')
            .where('itemId', '==', id)
            .get();

        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        logs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return res.json(logs);
    } catch (e: any) {
        console.error("GET LOGS Error:", e);
        return res.status(500).json({ error: 'Failed to retrieve item logs.' });
    }
});

/**
 * POST /:id/log
 * Create an activity log and automatically mutate the quantity fields on the part.
 */
inventoryRoutes.post('/:id/log', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { actionType, quantityChange, notes, targetRef } = req.body;
        const caller = (req as any).user;
        const callerTenantId = caller.role === 'super_admin' ? null : caller.tenantId;

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
            const data = itemDoc.data() as any;

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

        return res.json({ success: true });
    } catch (e: any) {
        console.error("POST LOG Error:", e);
        if (e.message === 'Forbidden' || e.message === 'Item not found') {
            return res.status(403).json({ error: e.message });
        }
        return res.status(500).json({ error: 'Failed to log activity.' });
    }
});
