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
exports.CompanyCamService = void 0;
const admin = __importStar(require("firebase-admin"));
class CompanyCamService {
    constructor(tenantId) {
        this.tenantId = tenantId;
        this.baseUrl = 'https://api.companycam.com/v2';
        if (!tenantId) {
            throw new Error('CompanyCamService requires a valid tenantId.');
        }
    }
    // Dynamically fetch the tenant's CompanyCam API tokens from Firestore
    async getTenantTokens() {
        const doc = await admin.firestore().collection('businesses').doc(this.tenantId).get();
        if (!doc.exists) {
            throw new Error(`Business tenant ${this.tenantId} not found.`);
        }
        const data = doc.data();
        if (!(data === null || data === void 0 ? void 0 : data.companyCamToken)) {
            throw new Error(`CompanyCam is not configured for tenant ${this.tenantId}.`);
        }
        return {
            access: data.companyCamToken,
            refresh: data.companyCamRefreshToken || '' // Might not exist for legacy static tokens
        };
    }
    // Refreshes the token and saves the new ones to Firestore
    async refreshToken(refreshToken) {
        if (!refreshToken)
            throw new Error("No refresh token available");
        const clientId = process.env.COMPANYCAM_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID';
        const clientSecret = process.env.COMPANYCAM_CLIENT_SECRET || 'PLACEHOLDER_SECRET';
        const response = await fetch('https://app.companycam.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            })
        });
        if (!response.ok) {
            throw new Error(`Failed to refresh token: ${response.statusText}`);
        }
        const data = await response.json();
        // Save new tokens
        await admin.firestore().collection('businesses').doc(this.tenantId).update({
            companyCamToken: data.access_token,
            companyCamRefreshToken: data.refresh_token
        });
        return data.access_token;
    }
    async fetch(endpoint, options, isRetry = false) {
        const tokens = await this.getTenantTokens();
        const response = await fetch(`${this.baseUrl}${endpoint}`, Object.assign(Object.assign({}, options), { headers: Object.assign({ 'Authorization': `Bearer ${tokens.access}`, 'Content-Type': 'application/json' }, ((options === null || options === void 0 ? void 0 : options.headers) || {})) }));
        // If unauthorized, and we have a refresh token, and this is the first attempt: retry
        if (response.status === 401 && tokens.refresh && !isRetry) {
            try {
                await this.refreshToken(tokens.refresh);
                return this.fetch(endpoint, options, true); // Retry
            }
            catch (e) {
                console.error("Token refresh failed", e);
                throw new Error(`CompanyCam API authorization failed and could not be refreshed.`);
            }
        }
        if (!response.ok) {
            throw new Error(`CompanyCam API error: ${response.statusText}`);
        }
        return response.json();
    }
    // --- OAUTH HELPERS ---
    static async exchangeCodeForToken(tenantId, code, redirectUri) {
        const clientId = process.env.COMPANYCAM_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID';
        const clientSecret = process.env.COMPANYCAM_CLIENT_SECRET || 'PLACEHOLDER_SECRET';
        const response = await fetch('https://app.companycam.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            })
        });
        if (!response.ok) {
            const errObj = await response.json().catch(() => ({}));
            throw new Error(`Failed to exchange code: ${errObj.error_description || response.statusText}`);
        }
        const data = await response.json();
        // Save tokens securely in Firestore
        await admin.firestore().collection('businesses').doc(tenantId).update({
            companyCamToken: data.access_token,
            companyCamRefreshToken: data.refresh_token
        });
        return { success: true };
    }
    // API Wrappers
    async getProjects() {
        return this.fetch('/projects');
    }
    async createProject(payload) {
        return this.fetch('/projects', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    }
}
exports.CompanyCamService = CompanyCamService;
//# sourceMappingURL=companyCam.service.js.map