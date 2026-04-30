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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.areasRoutes = void 0;
const express_1 = require("express");
const admin = __importStar(require("firebase-admin"));
const auth_middleware_1 = require("../middleware/auth.middleware");
exports.areasRoutes = (0, express_1.Router)();
const getDb = () => admin.firestore();
// Helper to determine if the caller has access to the workspace
const isMemberOfTenant = (caller, tenantId) => {
    const isSuperAdmin = (caller.role === 'system_owner' || caller.role === 'super_admin');
    const isTenantMember = caller.tenantId === tenantId;
    return isSuperAdmin || isTenantMember;
};
const isManagerOfTenant = (caller, tenantId) => {
    const isSuperAdmin = (caller.role === 'system_owner' || caller.role === 'super_admin');
    const isTenantManager = (caller.role === 'business_owner' || caller.role === 'manager') && caller.tenantId === tenantId;
    return isSuperAdmin || isTenantManager;
};
// GET /areas?tenantId=xyz - Fetch areas mapped from business_zones
exports.areasRoutes.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.query.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId query parameter is required' });
        }
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }
        const snapshot = await getDb().collection('business_zones')
            .where('tenantId', '==', tenantId)
            .get();
        let areas = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        areas.sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
        });
        return res.json(areas);
    }
    catch (error) {
        console.error("Error fetching areas from zones view:", error);
        return res.status(500).json({ error: 'Failed to fetch areas' });
    }
});
// POST /areas - Create a new area as an unmapped zone that can be placed later
exports.areasRoutes.post('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.body.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId is required' });
        }
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }
        const { label, type, color, status, capacity, notes, floorId, wallHeight } = req.body;
        const newId = `zone_${Date.now()}`;
        const timestamp = new Date().toISOString();
        const activityLogEntry = {
            timestamp,
            actor: caller.displayName || caller.email || 'Unknown Staff',
            action: `Created area record`
        };
        const newArea = {
            id: newId,
            tenantId,
            type: type || 'Bay',
            color: color || '#3b82f6',
            label: label || 'New Unassigned Area',
            wallHeight: wallHeight || 10,
            floorId: floorId || 'default',
            status: status || 'Active',
            capacity: capacity || '',
            notes: notes || '',
            points: [], // Implicitly unmapped geometrically
            width: 0,
            height: 0,
            createdBy: caller.displayName || caller.email || 'Unknown Staff',
            lastModifiedBy: caller.displayName || caller.email || 'Unknown Staff',
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        await getDb().collection('business_zones').doc(newId).set(Object.assign(Object.assign({}, newArea), { activityLogs: admin.firestore.FieldValue.arrayUnion(activityLogEntry) }));
        return res.status(201).json(Object.assign(Object.assign({}, newArea), { activityLogs: [activityLogEntry] }));
    }
    catch (error) {
        console.error("Error creating area mapped to zone:", error);
        return res.status(500).json({ error: 'Failed to create area record' });
    }
});
// PUT /areas/:id - Update an area
exports.areasRoutes.put('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const areaId = req.params.id;
        const areaRef = getDb().collection('business_zones').doc(areaId);
        const areaDoc = await areaRef.get();
        if (!areaDoc.exists) {
            return res.status(404).json({ error: 'Area not found' });
        }
        const areaData = areaDoc.data();
        const tenantId = areaData.tenantId;
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Cannot update this area.' });
        }
        const { label, type, color, status, capacity, notes, wallHeight, floorId } = req.body;
        const updates = {
            updatedAt: new Date().toISOString(),
            lastModifiedBy: caller.displayName || caller.email || 'Unknown Staff',
        };
        if (label !== undefined) {
            updates.label = label;
            updates.activityLogs = admin.firestore.FieldValue.arrayUnion({
                timestamp: new Date().toISOString(),
                actor: caller.displayName || caller.email || 'Unknown Staff',
                action: `Updated label`
            });
        }
        if (type !== undefined)
            updates.type = type;
        if (color !== undefined)
            updates.color = color;
        if (status !== undefined)
            updates.status = status;
        if (capacity !== undefined)
            updates.capacity = capacity;
        if (notes !== undefined)
            updates.notes = notes;
        if (wallHeight !== undefined)
            updates.wallHeight = wallHeight;
        if (floorId !== undefined)
            updates.floorId = floorId;
        await areaRef.update(updates);
        // Strip out the FieldValue from the updates we return to the client
        const { activityLogs } = updates, safeUpdates = __rest(updates, ["activityLogs"]);
        return res.json(Object.assign(Object.assign({ id: areaId }, areaData), safeUpdates));
    }
    catch (error) {
        console.error("Error updating area in zones db:", error);
        return res.status(500).json({ error: 'Failed to update area' });
    }
});
// DELETE /areas/:id - Delete an area/zone
exports.areasRoutes.delete('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const areaId = req.params.id;
        const areaRef = getDb().collection('business_zones').doc(areaId);
        const areaDoc = await areaRef.get();
        if (!areaDoc.exists) {
            return res.status(404).json({ error: 'Area not found' });
        }
        const areaData = areaDoc.data();
        const tenantId = areaData.tenantId;
        if (!isManagerOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Only managers can delete areas.' });
        }
        await areaRef.delete();
        return res.json({ message: 'Area deleted successfully from active map' });
    }
    catch (error) {
        console.error("Error deleting area:", error);
        return res.status(500).json({ error: 'Failed to delete area' });
    }
});
//# sourceMappingURL=areas.routes.js.map