import express, { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { authenticate } from '../middleware/auth.middleware';

export const deliveriesRoutes = express.Router();
// -------------------------------------------------------------
// SECURE MULTI-TENANT QUERY HELPER
// -------------------------------------------------------------
const getTenantCollection = (req: Request) => {
    const tenantId = (req as any).user.tenantId;
    if (!tenantId) throw new Error("Unauthorized: Tenant isolation failed");
    return admin.firestore().collection(`businesses/${tenantId}/deliveries`);
};

const getBusinessCollection = () => admin.firestore().collection('businesses');

// GET / => List all Deliveries
deliveriesRoutes.get('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const querySnapshot = await getTenantCollection(req).orderBy('createdAt', 'desc').get();
        const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json(docs);
    } catch (e: any) {
        console.error("Failed to list deliveries:", e);
        return res.status(500).json({ error: e.message });
    }
});

// GET /:id/tracking => Fetch Live EasyPost Data
deliveriesRoutes.get('/:id/tracking', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const deliveryRef = await getTenantCollection(req).doc(req.params.id).get();
        if (!deliveryRef.exists) return res.status(404).json({ error: "Delivery not found" });
        const delivery = deliveryRef.data();

        const tenantId = (req as any).user.tenantId;
        const businessRef = await getBusinessCollection().doc(tenantId).get();
        const businessInfo = businessRef.data();

        if (!businessInfo || !businessInfo.easyPostApiKey) {
            return res.json({ provider: "static", message: "No EasyPost integration found." });
        }

        // Live API call to EasyPost
        // Note: For full implementation, require @easypost/api library.
        // As a foundational step, we'll fetch via vanilla fetch/axios to the EasyPost endpoint.
        const apiKey = businessInfo.easyPostApiKey;
        const trackingCode = delivery?.trackingNumber;
        const carrier = delivery?.carrier;

        if (!trackingCode) return res.json({ provider: "easypost", message: "No tracking number." });

        const easyPostRes = await fetch(`https://api.easypost.com/v2/trackers?tracker[tracking_code]=${trackingCode}&tracker[carrier]=${carrier || ''}`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
                'Content-Type': 'application/json'
            }
        });

        const easyPostData = await easyPostRes.json();
        
        if (easyPostData?.error) {
            return res.status(400).json({ error: easyPostData.error.message });
        }

        return res.json({ provider: "easypost", data: easyPostData });

    } catch (e: any) {
        console.error("Failed to list deliveries:", e);
        return res.status(500).json({ error: e.message });
    }
});

// POST / => Create new Delivery
deliveriesRoutes.post('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const body = req.body;
        const tenantId = (req as any).user.tenantId;

        const data = {
            ...body,
            status: body.status || 'Expected',
            tenantId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        const docRef = await getTenantCollection(req).add(data);
        return res.status(201).json({ id: docRef.id, ...data });
    } catch (e: any) {
        console.error("Failed to create delivery:", e);
        return res.status(500).json({ error: e.message });
    }
});

// PUT /:id => Update Delivery
deliveriesRoutes.put('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const updates = { ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        await getTenantCollection(req).doc(req.params.id).update(updates);
        return res.json({ message: "Delivery updated successfully" });
    } catch (e: any) {
        console.error("Failed to update delivery:", e);
        return res.status(500).json({ error: e.message });
    }
});

// DELETE /:id => Delete Delivery
deliveriesRoutes.delete('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        await getTenantCollection(req).doc(req.params.id).delete();
        return res.json({ message: "Delivery deleted successfully" });
    } catch (e: any) {
        console.error("Failed to delete delivery:", e);
        return res.status(500).json({ error: e.message });
    }
});
