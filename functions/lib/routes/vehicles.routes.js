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
exports.vehiclesRoutes = void 0;
const express_1 = require("express");
const admin = __importStar(require("firebase-admin"));
const auth_middleware_1 = require("../middleware/auth.middleware");
exports.vehiclesRoutes = (0, express_1.Router)();
const getDb = () => admin.firestore();
// Helper to determine if the caller has at least "staff" access to the tenant
const isMemberOfTenant = (caller, tenantId) => {
    const isSuperAdmin = (caller.role === 'system_owner' || caller.role === 'super_admin');
    const isTenantMember = caller.tenantId === tenantId;
    return isSuperAdmin || isTenantMember;
};
// Helper for Manager+ level access
const isManagerOfTenant = (caller, tenantId) => {
    const isSuperAdmin = (caller.role === 'system_owner' || caller.role === 'super_admin');
    const isTenantManager = (caller.role === 'business_owner' || caller.role === 'manager') && caller.tenantId === tenantId;
    return isSuperAdmin || isTenantManager;
};
// GET /vehicles?tenantId=xyz - Fetch vehicles for a workspace
exports.vehiclesRoutes.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.query.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId query parameter is required' });
        }
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }
        const snapshot = await getDb().collection('vehicles')
            .where('tenantId', '==', tenantId)
            .get();
        let vehicles = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        // Sort manually by createdAt
        vehicles.sort((a, b) => {
            var _a, _b;
            const timeA = ((_a = a.createdAt) === null || _a === void 0 ? void 0 : _a._seconds) || 0;
            const timeB = ((_b = b.createdAt) === null || _b === void 0 ? void 0 : _b._seconds) || 0;
            return timeB - timeA;
        });
        return res.json(vehicles);
    }
    catch (error) {
        console.error("Error fetching vehicles:", error);
        return res.status(500).json({ error: 'Failed to fetch vehicles' });
    }
});
// POST /vehicles - Create a new vehicle
exports.vehiclesRoutes.post('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.body.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId is required' });
        }
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }
        const { make, model, year, vin, licensePlate, color, status, customerId, notes } = req.body;
        const newVehicle = {
            tenantId,
            make: make || '',
            model: model || '',
            year: year || '',
            vin: vin || '',
            licensePlate: licensePlate || '',
            color: color || '',
            status: status || 'Active',
            customerId: customerId || null,
            notes: notes || '',
            createdBy: caller.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await getDb().collection('vehicles').add(newVehicle);
        return res.status(201).json(Object.assign({ id: docRef.id }, newVehicle));
    }
    catch (error) {
        console.error("Error creating vehicle:", error);
        return res.status(500).json({ error: 'Failed to create vehicle' });
    }
});
// PUT /vehicles/:id - Update a vehicle
exports.vehiclesRoutes.put('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const vehicleId = req.params.id;
        const vehicleRef = getDb().collection('vehicles').doc(vehicleId);
        const vehicleDoc = await vehicleRef.get();
        if (!vehicleDoc.exists) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        const vehicleData = vehicleDoc.data();
        const tenantId = vehicleData.tenantId;
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Cannot update this vehicle.' });
        }
        const { make, model, year, vin, licensePlate, color, status, customerId, notes } = req.body;
        const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (make !== undefined)
            updates.make = make;
        if (model !== undefined)
            updates.model = model;
        if (year !== undefined)
            updates.year = year;
        if (vin !== undefined)
            updates.vin = vin;
        if (licensePlate !== undefined)
            updates.licensePlate = licensePlate;
        if (color !== undefined)
            updates.color = color;
        if (status !== undefined)
            updates.status = status;
        if (customerId !== undefined)
            updates.customerId = customerId;
        if (notes !== undefined)
            updates.notes = notes;
        await vehicleRef.update(updates);
        return res.json(Object.assign(Object.assign({ id: vehicleId }, vehicleData), updates));
    }
    catch (error) {
        console.error("Error updating vehicle:", error);
        return res.status(500).json({ error: 'Failed to update vehicle' });
    }
});
// DELETE /vehicles/:id - Delete a vehicle
exports.vehiclesRoutes.delete('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const vehicleId = req.params.id;
        const vehicleRef = getDb().collection('vehicles').doc(vehicleId);
        const vehicleDoc = await vehicleRef.get();
        if (!vehicleDoc.exists) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        const vehicleData = vehicleDoc.data();
        const tenantId = vehicleData.tenantId;
        // Deleting usually requires higher privileges: Manager/Owner
        if (!isManagerOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Only managers can delete vehicles.' });
        }
        await vehicleRef.delete();
        return res.json({ message: 'Vehicle deleted successfully' });
    }
    catch (error) {
        console.error("Error deleting vehicle:", error);
        return res.status(500).json({ error: 'Failed to delete vehicle' });
    }
});
//# sourceMappingURL=vehicles.routes.js.map