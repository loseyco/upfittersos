"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.companyCamRoutes = void 0;
const express_1 = require("express");
const companyCam_service_1 = require("../services/companyCam.service");
const companyCamWebhook_1 = require("../middleware/companyCamWebhook");
exports.companyCamRoutes = (0, express_1.Router)();
// Middleware to ensure we are acting on behalf of a specific tenant
const requireTenant = (req, res, next) => {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;
    if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header or tenantId query parameter.' });
    }
    req.tenantId = tenantId;
    next();
};
exports.companyCamRoutes.get('/projects', requireTenant, async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const service = new companyCam_service_1.CompanyCamService(tenantId);
        const projects = await service.getProjects();
        res.json(projects);
    }
    catch (err) {
        console.error(`CompanyCam projects error for tenant:`, err);
        res.status(500).json({ error: err.message });
    }
});
// For webhooks, we attach `?tenantId=XYZ` to the webhook callback URL configured in CompanyCam
// so the webhook router knows which business it affects.
exports.companyCamRoutes.post('/webhook', companyCamWebhook_1.validateCompanyCamWebhook, requireTenant, (req, res) => {
    const tenantId = req.tenantId;
    const { event_type, payload } = req.body;
    console.log(`Received CompanyCam webhook for tenant ${tenantId}: ${event_type}`, payload === null || payload === void 0 ? void 0 : payload.id);
    // Respond with exactly 200 HTTP code so CompanyCam knows it succeeded
    res.status(200).send('Webhook received successfully');
});
//# sourceMappingURL=companyCam.routes.js.map