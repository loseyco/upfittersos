"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.qboRoutes = void 0;
const express_1 = require("express");
const qbo_service_1 = require("../services/qbo.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
exports.qboRoutes = (0, express_1.Router)();
// Helper to extract the tenant from the request headers or query
const getTenantId = (req) => req.headers['x-tenant-id'] || req.query.tenantId;
// 1. Kick-off OAuth Flow (Redirects user to Intuit)
exports.qboRoutes.get('/auth', auth_middleware_1.authenticate, (req, res) => {
    const caller = req.user;
    const tenantId = caller.role === 'super_admin' ? getTenantId(req) : caller.tenantId;
    if (!tenantId) {
        res.status(400).json({ error: 'Missing tenantId or you are not bound to a workspace.' });
        return;
    }
    const service = new qbo_service_1.QboService(tenantId);
    res.redirect(service.getAuthorizationUrl());
});
// 2. OAuth Callback (Intuit redirects here after user signs in - must remain unauthenticated as it's hit by Intuit directly)
exports.qboRoutes.get('/callback', async (req, res) => {
    try {
        const code = req.query.code;
        const realmId = req.query.realmId; // The QuickBooks Company ID
        const state = req.query.state; // The custom state we passed in step 1
        if (!code || !realmId || !state) {
            res.status(400).send('Missing required Intuit OAuth parameters.');
            return;
        }
        // Decode state to figure out which tenant is completing the auth flow
        const { tenantId } = JSON.parse(decodeURIComponent(state));
        const service = new qbo_service_1.QboService(tenantId);
        await service.exchangeCodeForToken(code, realmId);
        res.send('<html><body><h2>QuickBooks successfully connected!</h2><p>You can close this window and return to the SAE Group Upfitter OS.</p></body></html>');
    }
    catch (err) {
        console.error('QBO OAuth Error:', err);
        res.status(500).send(`<html><body><h2>Error connecting QuickBooks</h2><p>${err.message}</p></body></html>`);
    }
});
// 3. Example Endpoint: Fetch Accounts
exports.qboRoutes.get('/accounts', auth_middleware_1.authenticate, async (req, res) => {
    try {
        // With authentication in place, we extract the tenantId securely from their verified JWT token, ensuring they NEVER fetch another tenant's data.
        const caller = req.user;
        const tenantId = caller.role === 'super_admin' ? getTenantId(req) : caller.tenantId;
        if (!tenantId) {
            res.status(400).json({ error: 'Missing tenantId parameter or header.' });
            return;
        }
        const service = new qbo_service_1.QboService(tenantId);
        const accounts = await service.getAccounts();
        res.json(accounts);
    }
    catch (err) {
        console.error(`QBO accounts error for tenant:`, err);
        res.status(500).json({ error: err.message });
    }
});
//# sourceMappingURL=qbo.routes.js.map