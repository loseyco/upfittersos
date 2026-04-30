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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.purchaseOrdersRoutes = void 0;
const express_1 = __importDefault(require("express"));
const admin = __importStar(require("firebase-admin"));
const auth_middleware_1 = require("../middleware/auth.middleware");
exports.purchaseOrdersRoutes = express_1.default.Router();
// -------------------------------------------------------------
// SECURE MULTI-TENANT QUERY HELPER
// -------------------------------------------------------------
const getTenantCollection = (req) => {
    const tenantId = req.user.tenantId;
    if (!tenantId)
        throw new Error("Unauthorized: Tenant isolation failed");
    return admin.firestore().collection(`businesses/${tenantId}/purchase_orders`);
};
// GET / => List all Purchase Orders
exports.purchaseOrdersRoutes.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const querySnapshot = await getTenantCollection(req).orderBy('createdAt', 'desc').get();
        const docs = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        return res.json(docs);
    }
    catch (e) {
        console.error("Failed to list POs:", e);
        return res.status(500).json({ error: e.message });
    }
});
// GET /:id => Get single PO
exports.purchaseOrdersRoutes.get('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const docRef = await getTenantCollection(req).doc(req.params.id).get();
        if (!docRef.exists)
            return res.status(404).json({ error: "PO not found" });
        return res.json(Object.assign({ id: docRef.id }, docRef.data()));
    }
    catch (e) {
        console.error("Failed to get PO:", e);
        return res.status(500).json({ error: e.message });
    }
});
// POST / => Create new PO
exports.purchaseOrdersRoutes.post('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const body = req.body;
        const tenantId = req.user.tenantId;
        // Auto-generate PO Number if missing
        let poNumber = body.poNumber;
        if (!poNumber) {
            const currentYearMonth = new Date().toISOString().slice(2, 7).replace('-', '');
            // Simple sequential random generator to ensure uniqueness within month
            poNumber = `PO-${currentYearMonth}-${Math.floor(100 + Math.random() * 900)}`;
        }
        const data = Object.assign(Object.assign({}, body), { poNumber, status: body.status || 'Draft', lineItems: body.lineItems || [], tenantId, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        const docRef = await getTenantCollection(req).add(data);
        return res.status(201).json(Object.assign({ id: docRef.id }, data));
    }
    catch (e) {
        console.error("Failed to create PO:", e);
        return res.status(500).json({ error: e.message });
    }
});
// PUT /:id => Update PO
exports.purchaseOrdersRoutes.put('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const updates = Object.assign(Object.assign({}, req.body), { updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await getTenantCollection(req).doc(req.params.id).update(updates);
        return res.json({ message: "PO updated successfully" });
    }
    catch (e) {
        console.error("Failed to update PO:", e);
        return res.status(500).json({ error: e.message });
    }
});
// DELETE /:id => Delete PO
exports.purchaseOrdersRoutes.delete('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        await getTenantCollection(req).doc(req.params.id).delete();
        return res.json({ message: "PO deleted successfully" });
    }
    catch (e) {
        console.error("Failed to delete PO:", e);
        return res.status(500).json({ error: e.message });
    }
});
//# sourceMappingURL=purchase_orders.routes.js.map