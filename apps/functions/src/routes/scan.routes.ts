import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { authenticate } from '../middleware/auth.middleware';

export const scanRoutes = Router();

// Lazily evaluate Firestore to prevent fatal race conditions before index.ts calls initializeApp
const getDb = () => admin.firestore();

/**
 * GET /scan/:qrId
 * The universal resolution endpoint for all physical QR codes.
 * Returns the contextual payload (Vehicle, Inventory Item, Employee Badge) based on the scan.
 */
scanRoutes.get('/:qrId', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const { qrId } = req.params;
        const caller = (req as any).user;
        const callerTenantId = (caller.role === 'system_owner' || caller.role === 'super_admin') ? (req.query.tenantId || req.headers['x-tenant-id']) : caller.tenantId;

        if (!callerTenantId) {
            return res.status(400).json({ error: 'Missing tenant assignment.' });
        }

        // 1. Resolve the Generic QR Node
        const qrNodeDoc = await getDb().collection('qr_nodes').doc(qrId).get();
        if (!qrNodeDoc.exists) {
            return res.status(404).json({ error: 'QR Code not mapped to any physical asset.' });
        }

        const qrData = qrNodeDoc.data();

        // 2. Strong Tenant Isolation: Prevent scanning a code that belongs to a different workspace
        if (qrData?.tenantId !== callerTenantId && caller.role !== 'system_owner' && caller.role !== 'super_admin') {
            return res.status(403).json({ error: 'Forbidden. This asset belongs to a different Operational Workspace.' });
        }

        const { entityType, entityId } = qrData as { entityType: string, entityId: string };

        // 3. Dynamic Payload Aggregation
        let payload = null;

        switch (entityType) {
            case 'vehicle':
                const unitDoc = await getDb().collection('units').doc(entityId).get();
                payload = unitDoc.exists ? unitDoc.data() : null;
                break;

            case 'inventory':
                const inventoryDoc = await getDb().collection('inventory_items').doc(entityId).get();
                payload = inventoryDoc.exists ? inventoryDoc.data() : null;
                break;

            case 'work_order':
                const woDoc = await getDb().collection('work_orders').doc(entityId).get();
                payload = woDoc.exists ? woDoc.data() : null;
                break;

            default:
                return res.status(501).json({ error: `Entity type '${entityType}' is not currently supported by the scanner.` });
        }

        if (!payload) {
            return res.status(500).json({ error: `Critical Fault: The QR Node points to an entity (${entityId}) that no longer exists in the primary database.` });
        }

        // Return the resolved, contextualized data
        return res.json({
            qrId,
            entityType,
            entityId,
            data: payload
        });

    } catch (e: any) {
        console.error("Universal QR Scanner Error:", e);
        return res.status(500).json({ error: 'Internal logic fault mapping physical asset.' });
    }
});

/**
 * POST /scan/register
 * Allows administrators and receiving workers to stick a raw QR code on a box/truck 
 * and immediately claim it, mapping its ID to a new Firestore unit.
 */
scanRoutes.post('/register', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const { qrId, entityType, entityId } = req.body;
        const caller = (req as any).user;
        const callerTenantId = (caller.role === 'system_owner' || caller.role === 'super_admin') ? (req.body.tenantId || caller.tenantId) : caller.tenantId;

        if (!qrId || !entityType || !entityId) {
            return res.status(400).json({ error: 'Missing required mapping payload (qrId, entityType, entityId).' });
        }

        if (!callerTenantId) {
             return res.status(403).json({ error: 'Workspace tenantId required to claim an asset.' });
        }

        const qrRef = getDb().collection('qr_nodes').doc(qrId);
        
        // Prevent claiming an already claimed sticker unless explicitly overriding
        const existingNode = await qrRef.get();
        if (existingNode.exists) {
            return res.status(409).json({ error: `Physical code [${qrId}] is already mapped to ${existingNode.data()?.entityType}.`});
        }

        await qrRef.set({
            tenantId: callerTenantId,
            entityType,
            entityId,
            claimedAt: new Date().toISOString(),
            claimedBy: caller.uid
        });

        return res.json({ success: true, message: `Successfully claimed [${qrId}] for ${entityType}.` });

    } catch (e: any) {
        console.error("QR Registration Error:", e);
        return res.status(500).json({ error: 'Failed to claim physical tag.' });
    }
});
