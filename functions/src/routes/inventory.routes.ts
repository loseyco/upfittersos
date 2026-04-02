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
