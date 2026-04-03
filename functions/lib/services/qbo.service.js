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
exports.QboService = void 0;
const admin = __importStar(require("firebase-admin"));
class QboService {
    get baseUrl() {
        return this.environment === 'sandbox'
            ? 'https://sandbox-quickbooks.api.intuit.com/v3/company'
            : 'https://quickbooks.api.intuit.com/v3/company';
    }
    constructor(tenantId) {
        this.tenantId = tenantId;
        this.clientId = process.env.QBO_CLIENT_ID || '';
        this.clientSecret = process.env.QBO_CLIENT_SECRET || '';
        this.redirectUri = process.env.QBO_REDIRECT_URI || 'http://localhost:5001/saegroup-c6487/us-central1/api/qbo/callback';
        this.environment = process.env.QBO_ENVIRONMENT || 'sandbox';
        if (!tenantId) {
            throw new Error('QboService requires a valid tenantId.');
        }
    }
    // 1. Generate OAuth URL
    getAuthorizationUrl() {
        const authEndpoint = 'https://appcenter.intuit.com/connect/oauth2';
        const scope = encodeURIComponent('com.intuit.quickbooks.accounting');
        // We pass tenantId in the state parameter to know which business is connecting when Intuit redirects back
        const state = encodeURIComponent(JSON.stringify({ tenantId: this.tenantId }));
        return `${authEndpoint}?client_id=${this.clientId}&response_type=code&scope=${scope}&redirect_uri=${encodeURIComponent(this.redirectUri)}&state=${state}`;
    }
    // 2. Handle OAuth Callback and Save to Tenant's Database
    async exchangeCodeForToken(code, realmId) {
        const tokenEndpoint = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
        const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${authHeader}`
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: this.redirectUri
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to exchange QBO token: ${errorText}`);
        }
        const tokenData = await response.json();
        // Manage multi-tenant tokens inside Firestore
        await admin.firestore().collection('businesses').doc(this.tenantId).set({
            qboRealmId: realmId,
            qboAccessToken: tokenData.access_token,
            qboRefreshToken: tokenData.refresh_token,
            qboTokenExpiresAt: Date.now() + (tokenData.expires_in * 1000),
            qboRefreshTokenExpiresAt: Date.now() + (tokenData.x_refresh_token_expires_in * 1000),
        }, { merge: true });
    }
    // Refresh an expired QBO Access Token using the refresh token
    async refreshAccessToken(refreshToken) {
        const tokenEndpoint = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
        const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${authHeader}`
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            })
        });
        if (!response.ok) {
            throw new Error(`Failed to refresh QBO token: ${await response.text()}`);
        }
        const tokenData = await response.json();
        // Manage multi-tenant tokens inside Firestore
        await admin.firestore().collection('businesses').doc(this.tenantId).set({
            qboAccessToken: tokenData.access_token,
            qboRefreshToken: tokenData.refresh_token,
            qboTokenExpiresAt: Date.now() + (tokenData.expires_in * 1000),
            qboRefreshTokenExpiresAt: Date.now() + (tokenData.x_refresh_token_expires_in * 1000),
        }, { merge: true });
        return tokenData.access_token;
    }
    // 3. Retrieve Tenant's Current QBO Tokens internally
    async getTokens() {
        const doc = await admin.firestore().collection('businesses').doc(this.tenantId).get();
        if (!doc.exists) {
            throw new Error(`Business tenant ${this.tenantId} not found.`);
        }
        const data = doc.data();
        if (!(data === null || data === void 0 ? void 0 : data.qboAccessToken) || !(data === null || data === void 0 ? void 0 : data.qboRealmId)) {
            throw new Error(`QuickBooks is not connected for tenant ${this.tenantId}.`);
        }
        let accessToken = data.qboAccessToken;
        // Evaluate token expiration buffers (5 minutes before actual expiry)
        if (data.qboTokenExpiresAt && Date.now() > (data.qboTokenExpiresAt - 300000)) {
            if (data.qboRefreshToken) {
                accessToken = await this.refreshAccessToken(data.qboRefreshToken);
            }
            else {
                throw new Error(`QuickBooks token expired and no refresh token available for tenant ${this.tenantId}.`);
            }
        }
        return { realmId: data.qboRealmId, accessToken, refreshToken: data.qboRefreshToken };
    }
    // Wrapped fetch method to securely attach tokens and retry if somehow a 401 slps by
    async apiFetch(path, options, isRetry = false) {
        const tokens = await this.getTokens();
        const response = await fetch(`${this.baseUrl}/${tokens.realmId}${path}`, Object.assign(Object.assign({}, options), { headers: Object.assign({ 'Authorization': `Bearer ${tokens.accessToken}`, 'Accept': 'application/json', 'Content-Type': 'application/json' }, ((options === null || options === void 0 ? void 0 : options.headers) || {})) }));
        if (response.status === 401 && tokens.refreshToken && !isRetry) {
            try {
                await this.refreshAccessToken(tokens.refreshToken);
                return this.apiFetch(path, options, true);
            }
            catch (e) {
                throw new Error(`Failed to auto-refresh QBO token: ${e}`);
            }
        }
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`QBO API Error ${response.status}: ${text}`);
        }
        return text ? JSON.parse(text) : null;
    }
    // 4. API Wrappers: Chart of Accounts Entities (as requested by user)
    async getAccounts() {
        const query = encodeURIComponent('select * from Account maxresults 1000');
        return this.apiFetch(`/query?query=${query}`);
    }
    // 5. API Wrapper: Sync Parts Object -> QuickBooks Products/Services
    async syncItemToQBO(sku, name, description, price, qtyOnHand, assetAccountRef, incomeAccountRef, expenseAccountRef) {
        const payload = {
            "TrackQtyOnHand": true,
            "Name": name,
            "Sku": sku,
            "Description": description,
            "Active": true,
            "Type": "Inventory",
            "AssetAccountRef": { "value": assetAccountRef },
            "IncomeAccountRef": { "value": incomeAccountRef },
            "ExpenseAccountRef": { "value": expenseAccountRef },
            "InvStartDate": new Date().toISOString().split('T')[0],
            "QtyOnHand": qtyOnHand,
            "UnitPrice": price
        };
        return this.apiFetch('/item', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }
    // 6. API Wrapper: Inventory Adjustment (Increases or Decreases quantities on hand)
    async adjustInventoryQuantity(qboItemId, qboAdjAccountRef, qtyDifference) {
        if (qtyDifference === 0)
            return null; // No adjustment needed
        const payload = {
            "AccountRef": {
                "value": qboAdjAccountRef
            },
            "Line": [
                {
                    "DetailType": "ItemAdjustmentLineDetail",
                    "ItemAdjustmentLineDetail": {
                        "ItemRef": {
                            "value": qboItemId
                        },
                        // Adjust by change amount. QtyDifference is a negative or positive offset.
                        "QtyDiff": qtyDifference
                    }
                }
            ]
        };
        return this.apiFetch('/inventoryadjustment', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }
}
exports.QboService = QboService;
//# sourceMappingURL=qbo.service.js.map