import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { authenticate } from '../middleware/auth.middleware';

export const customersRoutes = Router();
const getDb = () => admin.firestore();

// Helper to determine if the caller has at least "staff" access to the tenant
const isMemberOfTenant = (caller: any, tenantId: string) => {
    const isSuperAdmin = (caller.role === 'system_owner' || caller.role === 'super_admin');
    const isTenantMember = caller.tenantId === tenantId;
    return isSuperAdmin || isTenantMember;
};

// Helper for Manager+ level access
const isManagerOfTenant = (caller: any, tenantId: string) => {
    const isSuperAdmin = (caller.role === 'system_owner' || caller.role === 'super_admin');
    const isTenantManager = (caller.role === 'business_owner' || caller.role === 'manager') && caller.tenantId === tenantId;
    return isSuperAdmin || isTenantManager;
};

// GET /customers?tenantId=xyz - Fetch customers for a workspace
customersRoutes.get('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.query.tenantId as string;

        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId query parameter is required' });
        }

        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }

        const snapshot = await getDb().collection('customers')
            .where('tenantId', '==', tenantId)
            .get();

        let customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        
        // Sort manually by createdAt to avoid needing a Firestore composite index
        customers.sort((a, b) => {
            const timeA = a.createdAt?._seconds || 0;
            const timeB = b.createdAt?._seconds || 0;
            return timeB - timeA;
        });

        return res.json(customers);
    } catch (error) {
        console.error("Error fetching customers:", error);
        return res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// POST /customers - Create a new customer
customersRoutes.post('/', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.body.tenantId;

        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId is required' });
        }

        // Only managers/owners can create a customer, or maybe we allow all staff?
        // Let's restrict to isMemberOfTenant so any staff can log a customer for now (adjust as needed)
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }

        const {
            firstName, middleName, lastName, nickName,
            addressStreet, addressCity, addressState, addressZip,
            email, workPhone, mobilePhone, company,
            status, notes, tags, taxRate
        } = req.body;

        const newCustomer = {
            tenantId,
            firstName: firstName || '',
            middleName: middleName || '',
            lastName: lastName || '',
            nickName: nickName || '',
            addressStreet: addressStreet || '',
            addressCity: addressCity || '',
            addressState: addressState || '',
            addressZip: addressZip || '',
            email: email || '',
            workPhone: workPhone || '',
            mobilePhone: mobilePhone || '',
            company: company || '',
            status: status || 'Active', // e.g., Active, Lead, Inactive
            notes: notes || '',
            tags: tags || [],
            taxRate: (taxRate !== undefined && taxRate !== '') ? String(taxRate) : '8.25',
            createdBy: caller.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await getDb().collection('customers').add(newCustomer);
        return res.status(201).json({ id: docRef.id, ...newCustomer });
    } catch (error) {
        console.error("Error creating customer:", error);
        return res.status(500).json({ error: 'Failed to create customer' });
    }
});

// PUT /customers/:id - Update a customer
customersRoutes.put('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const customerId = req.params.id;

        const customerRef = getDb().collection('customers').doc(customerId);
        const customerDoc = await customerRef.get();

        if (!customerDoc.exists) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const customerData = customerDoc.data()!;
        const tenantId = customerData.tenantId;

        // Verify the caller is a member of the workspace the customer belongs to
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Cannot update this customer.' });
        }

        const {
            firstName, middleName, lastName, nickName,
            addressStreet, addressCity, addressState, addressZip,
            email, workPhone, mobilePhone, company,
            status, notes, tags, taxRate
        } = req.body;

        const updates: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

        if (firstName !== undefined) updates.firstName = firstName;
        if (middleName !== undefined) updates.middleName = middleName;
        if (lastName !== undefined) updates.lastName = lastName;
        if (nickName !== undefined) updates.nickName = nickName;
        if (addressStreet !== undefined) updates.addressStreet = addressStreet;
        if (addressCity !== undefined) updates.addressCity = addressCity;
        if (addressState !== undefined) updates.addressState = addressState;
        if (addressZip !== undefined) updates.addressZip = addressZip;
        if (email !== undefined) updates.email = email;
        if (workPhone !== undefined) updates.workPhone = workPhone;
        if (mobilePhone !== undefined) updates.mobilePhone = mobilePhone;
        if (company !== undefined) updates.company = company;
        if (status !== undefined) updates.status = status;
        if (notes !== undefined) updates.notes = notes;
        if (tags !== undefined) updates.tags = tags;
        if (taxRate !== undefined) updates.taxRate = String(taxRate);

        await customerRef.update(updates);
        return res.json({ id: customerId, ...customerData, ...updates });
    } catch (error) {
        console.error("Error updating customer:", error);
        return res.status(500).json({ error: 'Failed to update customer' });
    }
});

// DELETE /customers/:id - Delete a customer
customersRoutes.delete('/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
    try {
        const caller = (req as any).user;
        const customerId = req.params.id;

        const customerRef = getDb().collection('customers').doc(customerId);
        const customerDoc = await customerRef.get();

        if (!customerDoc.exists) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const customerData = customerDoc.data()!;
        const tenantId = customerData.tenantId;

        // Deleting usually requires higher privileges: Manager/Owner
        if (!isManagerOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Only managers can delete customers.' });
        }

        await customerRef.delete();
        return res.json({ message: 'Customer deleted successfully' });
    } catch (error) {
        console.error("Error deleting customer:", error);
        return res.status(500).json({ error: 'Failed to delete customer' });
    }
});
