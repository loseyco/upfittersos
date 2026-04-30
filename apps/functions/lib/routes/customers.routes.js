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
exports.customersRoutes = void 0;
const express_1 = require("express");
const admin = __importStar(require("firebase-admin"));
const auth_middleware_1 = require("../middleware/auth.middleware");
exports.customersRoutes = (0, express_1.Router)();
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
// GET /customers?tenantId=xyz - Fetch customers for a workspace
exports.customersRoutes.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.query.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId query parameter is required' });
        }
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }
        const snapshot = await getDb().collection('customers')
            .where('tenantId', '==', tenantId)
            .get();
        let customers = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        // Sort manually by createdAt to avoid needing a Firestore composite index
        customers.sort((a, b) => {
            var _a, _b;
            const timeA = ((_a = a.createdAt) === null || _a === void 0 ? void 0 : _a._seconds) || 0;
            const timeB = ((_b = b.createdAt) === null || _b === void 0 ? void 0 : _b._seconds) || 0;
            return timeB - timeA;
        });
        return res.json(customers);
    }
    catch (error) {
        console.error("Error fetching customers:", error);
        return res.status(500).json({ error: 'Failed to fetch customers' });
    }
});
// POST /customers - Create a new customer
exports.customersRoutes.post('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const tenantId = req.body.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId is required' });
        }
        // Only managers/owners can create a customer, or maybe we allow all staff?
        // Let's restrict to isMemberOfTenant so any staff can log a customer for now (adjust as needed)
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have access to this workspace.' });
        }
        const { firstName, middleName, lastName, nickName, addressStreet, addressCity, addressState, addressZip, email, workPhone, mobilePhone, company, status, notes, tags, taxRate, defaultDiscount, website } = req.body;
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
            website: website || '',
            tags: tags || [],
            taxRate: (taxRate !== undefined && taxRate !== '') ? String(taxRate) : '8.25',
            defaultDiscount: (defaultDiscount !== undefined && defaultDiscount !== '') ? Number(defaultDiscount) : 0,
            createdBy: caller.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await getDb().collection('customers').add(newCustomer);
        return res.status(201).json(Object.assign({ id: docRef.id }, newCustomer));
    }
    catch (error) {
        console.error("Error creating customer:", error);
        return res.status(500).json({ error: 'Failed to create customer' });
    }
});
// PUT /customers/:id - Update a customer
exports.customersRoutes.put('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const customerId = req.params.id;
        const customerRef = getDb().collection('customers').doc(customerId);
        const customerDoc = await customerRef.get();
        if (!customerDoc.exists) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        const customerData = customerDoc.data();
        const tenantId = customerData.tenantId;
        // Verify the caller is a member of the workspace the customer belongs to
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Cannot update this customer.' });
        }
        const { firstName, middleName, lastName, nickName, addressStreet, addressCity, addressState, addressZip, email, workPhone, mobilePhone, company, status, notes, tags, taxRate, defaultDiscount, website } = req.body;
        const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (firstName !== undefined)
            updates.firstName = firstName;
        if (middleName !== undefined)
            updates.middleName = middleName;
        if (lastName !== undefined)
            updates.lastName = lastName;
        if (nickName !== undefined)
            updates.nickName = nickName;
        if (addressStreet !== undefined)
            updates.addressStreet = addressStreet;
        if (addressCity !== undefined)
            updates.addressCity = addressCity;
        if (addressState !== undefined)
            updates.addressState = addressState;
        if (addressZip !== undefined)
            updates.addressZip = addressZip;
        if (email !== undefined)
            updates.email = email;
        if (workPhone !== undefined)
            updates.workPhone = workPhone;
        if (mobilePhone !== undefined)
            updates.mobilePhone = mobilePhone;
        if (company !== undefined)
            updates.company = company;
        if (status !== undefined)
            updates.status = status;
        if (notes !== undefined)
            updates.notes = notes;
        if (website !== undefined)
            updates.website = website;
        if (tags !== undefined)
            updates.tags = tags;
        if (taxRate !== undefined)
            updates.taxRate = String(taxRate);
        if (defaultDiscount !== undefined)
            updates.defaultDiscount = Number(defaultDiscount);
        await customerRef.update(updates);
        return res.json(Object.assign(Object.assign({ id: customerId }, customerData), updates));
    }
    catch (error) {
        console.error("Error updating customer:", error);
        return res.status(500).json({ error: 'Failed to update customer' });
    }
});
// DELETE /customers/:id - Delete a customer
exports.customersRoutes.delete('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const customerId = req.params.id;
        const customerRef = getDb().collection('customers').doc(customerId);
        const customerDoc = await customerRef.get();
        if (!customerDoc.exists) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        const customerData = customerDoc.data();
        const tenantId = customerData.tenantId;
        // Deleting usually requires higher privileges: Manager/Owner
        if (!isManagerOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden. Only managers can delete customers.' });
        }
        await customerRef.delete();
        return res.json({ message: 'Customer deleted successfully' });
    }
    catch (error) {
        console.error("Error deleting customer:", error);
        return res.status(500).json({ error: 'Failed to delete customer' });
    }
});
//# sourceMappingURL=customers.routes.js.map