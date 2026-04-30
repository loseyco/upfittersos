import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { authenticate } from '../middleware/auth.middleware';

export const unitRoutes = Router();
// Lazily evaluate Firestore
const getDb = () => admin.firestore();

/**
 * GET /units
 * Retrieve all vehicles/chassis belonging to the authorized Tenant's Workspace.
 */
unitRoutes.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const caller = (req as any).user;
        const tenantId = (caller.role === 'system_owner' || caller.role === 'super_admin') ? (req.query.tenantId || req.headers['x-tenant-id']) : caller.tenantId;

        if (!tenantId) {
            return res.status(400).json({ error: 'Tenant context required.' });
        }

        const snapshot = await getDb().collection('units').where('tenantId', '==', tenantId).get();
        const units = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return res.json(units);
    } catch (e: any) {
        console.error("Failed to fetch units:", e);
        return res.status(500).json({ error: 'Failed to retrieve vehicle lineup.' });
    }
});

/**
 * POST /units
 * Register a newly arrived chassis into the system.
 */
unitRoutes.post('/', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const payload = req.body;
        const caller = (req as any).user;
        const tenantId = (caller.role === 'system_owner' || caller.role === 'super_admin') ? (payload.tenantId || caller.tenantId) : caller.tenantId;

        if (!tenantId) {
            return res.status(400).json({ error: 'Workspace tenant assignment required.' });
        }

        if (!payload.vin) {
             return res.status(400).json({ error: 'VIN is required for chassis intake.' });
        }

        const newUnitRef = getDb().collection('units').doc();
        await newUnitRef.set({
            ...payload,
            tenantId,
            status: payload.status || 'Intake',
            createdAt: new Date().toISOString(),
            createdBy: caller.uid
        });

        // If the payload came with a pre-scanned QR Node, automatically link them!
        if (payload.qrNodeId) {
            await getDb().collection('qr_nodes').doc(payload.qrNodeId).set({
                tenantId,
                entityType: 'vehicle',
                entityId: newUnitRef.id,
                claimedAt: new Date().toISOString()
            }, { merge: true });
        }

        return res.json({ success: true, id: newUnitRef.id });
    } catch (e: any) {
        console.error("Failed to register unit:", e);
        return res.status(500).json({ error: 'Chassis intake execution failed.' });
    }
});

/**
 * GET /units/:id
 * Retrieve specific details regarding a vehicle.
 */
unitRoutes.get('/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const caller = (req as any).user;
        const callerTenantId = (caller.role === 'system_owner' || caller.role === 'super_admin') ? null : caller.tenantId;

        const unitDoc = await getDb().collection('units').doc(id).get();
        if (!unitDoc.exists) return res.status(404).json({ error: 'Unit not found.' });
        
        const unitData = unitDoc.data();
        if (callerTenantId && unitData?.tenantId !== callerTenantId) {
            return res.status(403).json({ error: 'Forbidden. Asset belongs to another Operational Workspace.' });
        }

        return res.json({ id: unitDoc.id, ...unitData });
    } catch (e: any) {
         return res.status(500).json({ error: 'Failed to resolve specific asset telemetry.' });
    }
});
