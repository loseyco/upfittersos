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
exports.deliveriesRoutes = void 0;
const express_1 = __importDefault(require("express"));
const admin = __importStar(require("firebase-admin"));
const auth_middleware_1 = require("../middleware/auth.middleware");
exports.deliveriesRoutes = express_1.default.Router();
const db = admin.firestore();
// -------------------------------------------------------------
// SECURE MULTI-TENANT QUERY HELPER
// -------------------------------------------------------------
const getTenantCollection = (req) => {
    const tenantId = req.user.tenantId;
    if (!tenantId)
        throw new Error("Unauthorized: Tenant isolation failed");
    return db.collection(`businesses/${tenantId}/deliveries`);
};
const getBusinessCollection = () => db.collection('businesses');
// GET / => List all Deliveries
exports.deliveriesRoutes.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const querySnapshot = await getTenantCollection(req).orderBy('createdAt', 'desc').get();
        const docs = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        return res.json(docs);
    }
    catch (e) {
        console.error("Failed to list deliveries:", e);
        return res.status(500).json({ error: e.message });
    }
});
// GET /:id/tracking => Fetch Live EasyPost Data
exports.deliveriesRoutes.get('/:id/tracking', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const deliveryRef = await getTenantCollection(req).doc(req.params.id).get();
        if (!deliveryRef.exists)
            return res.status(404).json({ error: "Delivery not found" });
        const delivery = deliveryRef.data();
        const tenantId = req.user.tenantId;
        const businessRef = await getBusinessCollection().doc(tenantId).get();
        const businessInfo = businessRef.data();
        if (!businessInfo || !businessInfo.easyPostApiKey) {
            return res.json({ provider: "static", message: "No EasyPost integration found." });
        }
        // Live API call to EasyPost
        // Note: For full implementation, require @easypost/api library.
        // As a foundational step, we'll fetch via vanilla fetch/axios to the EasyPost endpoint.
        const apiKey = businessInfo.easyPostApiKey;
        const trackingCode = delivery === null || delivery === void 0 ? void 0 : delivery.trackingNumber;
        const carrier = delivery === null || delivery === void 0 ? void 0 : delivery.carrier;
        if (!trackingCode)
            return res.json({ provider: "easypost", message: "No tracking number." });
        const easyPostRes = await fetch(`https://api.easypost.com/v2/trackers?tracker[tracking_code]=${trackingCode}&tracker[carrier]=${carrier || ''}`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
                'Content-Type': 'application/json'
            }
        });
        const easyPostData = await easyPostRes.json();
        if (easyPostData === null || easyPostData === void 0 ? void 0 : easyPostData.error) {
            return res.status(400).json({ error: easyPostData.error.message });
        }
        return res.json({ provider: "easypost", data: easyPostData });
    }
    catch (e) {
        console.error("Failed to list deliveries:", e);
        return res.status(500).json({ error: e.message });
    }
});
// POST / => Create new Delivery
exports.deliveriesRoutes.post('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const body = req.body;
        const tenantId = req.user.tenantId;
        const data = Object.assign(Object.assign({}, body), { status: body.status || 'Expected', tenantId, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        const docRef = await getTenantCollection(req).add(data);
        return res.status(201).json(Object.assign({ id: docRef.id }, data));
    }
    catch (e) {
        console.error("Failed to create delivery:", e);
        return res.status(500).json({ error: e.message });
    }
});
// PUT /:id => Update Delivery
exports.deliveriesRoutes.put('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const updates = Object.assign(Object.assign({}, req.body), { updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await getTenantCollection(req).doc(req.params.id).update(updates);
        return res.json({ message: "Delivery updated successfully" });
    }
    catch (e) {
        console.error("Failed to update delivery:", e);
        return res.status(500).json({ error: e.message });
    }
});
// DELETE /:id => Delete Delivery
exports.deliveriesRoutes.delete('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        await getTenantCollection(req).doc(req.params.id).delete();
        return res.json({ message: "Delivery deleted successfully" });
    }
    catch (e) {
        console.error("Failed to delete delivery:", e);
        return res.status(500).json({ error: e.message });
    }
});
//# sourceMappingURL=deliveries.routes.js.map