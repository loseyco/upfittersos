import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { authenticate } from '../middleware/auth.middleware';

export const vehiclesRoutes = Router();
const getDb = () => admin.firestore();

// Helper to determine if the caller has at least "staff" access to the tenant
const isMemberOfTenant = (caller: any, tenantId: string) => {
    const isSuperAdmin = caller.role === 'super_admin';
    const isTenantMember = caller.tenantId === tenantId;
    return isSuperAdmin || isTenantMember;
};

// Helper for Manager+ level access
const isManagerOfTenant = (caller: any, tenantId: string) => {
    const isSuperAdmin = caller.role === 'super_admin';
    const isTenantManager = (caller.role === 'business_owner' || caller.role === 'manager') && caller.tenantId === tenantId;
    return isSuperAdmin || isTenantManager;
};

// GET /vehicles?tenantId=xyz - Fetch vehicles for a workspace
vehiclesRoutes.get('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.query.tenantId as string;

        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId query parameter is required' });
        }

        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }

        const snapshot = await getDb().collection('vehicles')
            .where('tenantId', '==', tenantId)
            .get();

        let vehicles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        
        // Sort manually by createdAt
        vehicles.sort((a, b) => {
            const timeA = a.createdAt?._seconds || 0;
            const timeB = b.createdAt?._seconds || 0;
            return timeB - timeA;
        });

        return res.json(vehicles);
    } catch (error) {
        console.error("Error fetching vehicles:", error);
        return res.status(500).json({ error: 'Failed to fetch vehicles' });
    }
});

// POST /vehicles - Create a new vehicle
vehiclesRoutes.post('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.body.tenantId;

        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId is required' });
        }

        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }

        const {
            make, model, year, vin, licensePlate,
            color, status, customerId, notes
        } = req.body;

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
        return res.status(201).json({ id: docRef.id, ...newVehicle });
    } catch (error) {
        console.error("Error creating vehicle:", error);
        return res.status(500).json({ error: 'Failed to create vehicle' });
    }
});

// PUT /vehicles/:id - Update a vehicle
vehiclesRoutes.put('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const vehicleId = req.params.id;

        const vehicleRef = getDb().collection('vehicles').doc(vehicleId);
        const vehicleDoc = await vehicleRef.get();

        if (!vehicleDoc.exists) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        const vehicleData = vehicleDoc.data()!;
        const tenantId = vehicleData.tenantId;

        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Cannot update this vehicle.' });
        }

        const {
            make, model, year, vin, licensePlate,
            color, status, customerId, notes
        } = req.body;

        const updates: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

        if (make !== undefined) updates.make = make;
        if (model !== undefined) updates.model = model;
        if (year !== undefined) updates.year = year;
        if (vin !== undefined) updates.vin = vin;
        if (licensePlate !== undefined) updates.licensePlate = licensePlate;
        if (color !== undefined) updates.color = color;
        if (status !== undefined) updates.status = status;
        if (customerId !== undefined) updates.customerId = customerId;
        if (notes !== undefined) updates.notes = notes;

        await vehicleRef.update(updates);
        return res.json({ id: vehicleId, ...vehicleData, ...updates });
    } catch (error) {
        console.error("Error updating vehicle:", error);
        return res.status(500).json({ error: 'Failed to update vehicle' });
    }
});

// DELETE /vehicles/:id - Delete a vehicle
vehiclesRoutes.delete('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const vehicleId = req.params.id;

        const vehicleRef = getDb().collection('vehicles').doc(vehicleId);
        const vehicleDoc = await vehicleRef.get();

        if (!vehicleDoc.exists) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        const vehicleData = vehicleDoc.data()!;
        const tenantId = vehicleData.tenantId;

        // Deleting usually requires higher privileges: Manager/Owner
        if (!isManagerOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Only managers can delete vehicles.' });
        }

        await vehicleRef.delete();
        return res.json({ message: 'Vehicle deleted successfully' });
    } catch (error) {
        console.error("Error deleting vehicle:", error);
        return res.status(500).json({ error: 'Failed to delete vehicle' });
    }
});
