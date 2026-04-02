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
    // Dynamically fetch the tenant's CompanyCam API token from Firestore
    async getTenantToken() {
        const doc = await admin.firestore().collection('businesses').doc(this.tenantId).get();
        if (!doc.exists) {
            throw new Error(`Business tenant ${this.tenantId} not found.`);
        }
        const data = doc.data();
        if (!(data === null || data === void 0 ? void 0 : data.companyCamToken)) {
            throw new Error(`CompanyCam is not configured for tenant ${this.tenantId}.`);
        }
        return data.companyCamToken;
    }
    async fetch(endpoint, options) {
        const token = await this.getTenantToken();
        const response = await fetch(`${this.baseUrl}${endpoint}`, Object.assign(Object.assign({}, options), { headers: Object.assign({ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, ((options === null || options === void 0 ? void 0 : options.headers) || {})) }));
        if (!response.ok) {
            throw new Error(`CompanyCam API error: ${response.statusText}`);
        }
        return response.json();
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