"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.companyCamRoutes = void 0;
const express_1 = require("express");
const companyCam_service_1 = require("../services/companyCam.service");
const companyCamWebhook_1 = require("../middleware/companyCamWebhook");
const auth_middleware_1 = require("../middleware/auth.middleware");
exports.companyCamRoutes = (0, express_1.Router)();
// Middleware to ensure we are acting on behalf of a specific tenant
const requireTenant = (req, res, next) => {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;
    if (!tenantId) {
        res.status(400).json({ error: 'Missing x-tenant-id header or tenantId query parameter.' });
        return;
    }
    req.tenantId = tenantId;
    next();
};
// --- OAUTH FLOW ENDPOINTS ---
exports.companyCamRoutes.get('/oauth/url', auth_middleware_1.authenticate, (req, res) => {
    const caller = req.user;
    // We strictly identify the user based on token. We don't need tenant validation for the OAuth URL itself.
    if (!caller || !caller.uid) {
        res.status(401).json({ error: 'Unauthenticated.' });
        return;
    }
    const clientId = process.env.COMPANYCAM_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID';
    // We will pass the redirectUri from the frontend since it knows its own domain (prod vs localhost)
    const redirectUri = req.query.redirectUri;
    if (!redirectUri) {
        res.status(400).json({ error: 'redirectUri query parameter is required.' });
        return;
    }
    const scopes = 'read+write'; // We can add 'destroy' if needed, generally read+write is safest
    const authUrl = `https://app.companycam.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes}`;
    res.json({ url: authUrl });
});
exports.companyCamRoutes.post('/oauth/exchange', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const userId = caller.uid;
        if (!userId) {
            res.status(401).json({ error: 'User mapping failed or unauthorized.' });
            return;
        }
        const { code, redirectUri, tenantId } = req.body;
        if (!code || !redirectUri || !tenantId) {
            res.status(400).json({ error: 'code, redirectUri, and tenantId are required in body.' });
            return;
        }
        await companyCam_service_1.CompanyCamService.exchangeCodeForToken(userId, tenantId, code, redirectUri);
        res.json({ success: true });
    }
    catch (err) {
        console.error(`CompanyCam OAuth Exchange error:`, err);
        res.status(500).json({ error: err.message });
    }
});
// --- EXISTING ENDPOINTS ---
exports.companyCamRoutes.get('/projects', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const caller = req.user;
        const userId = caller.uid;
        const tenantId = req.query.tenantId || caller.tenantId;
        if (!userId || !tenantId) {
            res.status(401).json({ error: 'Missing userId or tenantId.' });
            return;
        }
        const service = new companyCam_service_1.CompanyCamService(userId, tenantId);
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