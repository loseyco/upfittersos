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
exports.scanRoutes = void 0;
const express_1 = require("express");
const admin = __importStar(require("firebase-admin"));
const auth_middleware_1 = require("../middleware/auth.middleware");
exports.scanRoutes = (0, express_1.Router)();
// Lazily evaluate Firestore to prevent fatal race conditions before index.ts calls initializeApp
const getDb = () => admin.firestore();
/**
 * GET /scan/:qrId
 * The universal resolution endpoint for all physical QR codes.
 * Returns the contextual payload (Vehicle, Inventory Item, Employee Badge) based on the scan.
 */
exports.scanRoutes.get('/:qrId', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { qrId } = req.params;
        const caller = req.user;
        const callerTenantId = caller.role === 'super_admin' ? (req.query.tenantId || req.headers['x-tenant-id']) : caller.tenantId;
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
        if ((qrData === null || qrData === void 0 ? void 0 : qrData.tenantId) !== callerTenantId && caller.role !== 'super_admin') {
            return res.status(403).json({ error: 'Forbidden. This asset belongs to a different Operational Workspace.' });
        }
        const { entityType, entityId } = qrData;
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
    }
    catch (e) {
        console.error("Universal QR Scanner Error:", e);
        return res.status(500).json({ error: 'Internal logic fault mapping physical asset.' });
    }
});
/**
 * POST /scan/register
 * Allows administrators and receiving workers to stick a raw QR code on a box/truck
 * and immediately claim it, mapping its ID to a new Firestore unit.
 */
exports.scanRoutes.post('/register', auth_middleware_1.authenticate, async (req, res) => {
    var _a;
    try {
        const { qrId, entityType, entityId } = req.body;
        const caller = req.user;
        const callerTenantId = caller.role === 'super_admin' ? (req.body.tenantId || caller.tenantId) : caller.tenantId;
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
            return res.status(409).json({ error: `Physical code [${qrId}] is already mapped to ${(_a = existingNode.data()) === null || _a === void 0 ? void 0 : _a.entityType}.` });
        }
        await qrRef.set({
            tenantId: callerTenantId,
            entityType,
            entityId,
            claimedAt: new Date().toISOString(),
            claimedBy: caller.uid
        });
        return res.json({ success: true, message: `Successfully claimed [${qrId}] for ${entityType}.` });
    }
    catch (e) {
        console.error("QR Registration Error:", e);
        return res.status(500).json({ error: 'Failed to claim physical tag.' });
    }
});
//# sourceMappingURL=scan.routes.js.map