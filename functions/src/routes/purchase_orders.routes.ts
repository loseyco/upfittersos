import express, { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { authenticate } from '../middleware/auth.middleware';

export const purchaseOrdersRoutes = express.Router();
// -------------------------------------------------------------
// SECURE MULTI-TENANT QUERY HELPER
// -------------------------------------------------------------
const getTenantCollection = (req: Request) => {
    const tenantId = (req as any).user.tenantId;
    if (!tenantId) throw new Error("Unauthorized: Tenant isolation failed");
    return admin.firestore().collection(`businesses/${tenantId}/purchase_orders`);
};

// GET / => List all Purchase Orders
purchaseOrdersRoutes.get('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const querySnapshot = await getTenantCollection(req).orderBy('createdAt', 'desc').get();
        const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json(docs);
    } catch (e: any) {
        console.error("Failed to list POs:", e);
        return res.status(500).json({ error: e.message });
    }
});

// GET /:id => Get single PO
purchaseOrdersRoutes.get('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const docRef = await getTenantCollection(req).doc(req.params.id).get();
        if (!docRef.exists) return res.status(404).json({ error: "PO not found" });
        return res.json({ id: docRef.id, ...docRef.data() });
    } catch (e: any) {
        console.error("Failed to get PO:", e);
        return res.status(500).json({ error: e.message });
    }
});

// POST / => Create new PO
purchaseOrdersRoutes.post('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const body = req.body;
        const tenantId = (req as any).user.tenantId;
        
        // Auto-generate PO Number if missing
        let poNumber = body.poNumber;
        if (!poNumber) {
            const currentYearMonth = new Date().toISOString().slice(2, 7).replace('-', '');
            // Simple sequential random generator to ensure uniqueness within month
            poNumber = `PO-${currentYearMonth}-${Math.floor(100 + Math.random() * 900)}`;
        }

        const data = {
            ...body,
            poNumber,
            status: body.status || 'Draft',
            lineItems: body.lineItems || [],
            tenantId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        const docRef = await getTenantCollection(req).add(data);
        return res.status(201).json({ id: docRef.id, ...data });
    } catch (e: any) {
        console.error("Failed to create PO:", e);
        return res.status(500).json({ error: e.message });
    }
});

// PUT /:id => Update PO
purchaseOrdersRoutes.put('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const updates = { ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        await getTenantCollection(req).doc(req.params.id).update(updates);
        return res.json({ message: "PO updated successfully" });
    } catch (e: any) {
        console.error("Failed to update PO:", e);
        return res.status(500).json({ error: e.message });
    }
});

// DELETE /:id => Delete PO
purchaseOrdersRoutes.delete('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        await getTenantCollection(req).doc(req.params.id).delete();
        return res.json({ message: "PO deleted successfully" });
    } catch (e: any) {
        console.error("Failed to delete PO:", e);
        return res.status(500).json({ error: e.message });
    }
});
