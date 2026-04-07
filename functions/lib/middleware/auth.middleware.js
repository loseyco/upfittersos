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
exports.systemOwnerOnly = exports.superAdminOnly = exports.requireRole = exports.authenticate = void 0;
const admin = __importStar(require("firebase-admin"));
// --- Middleware: Core Authentication ---
const authenticate = async (req, res, next) => {
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        return res.status(401).send('Unauthorized');
    }
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
        const decodedIdToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedIdToken;
        return next();
    }
    catch (error) {
        return res.status(401).send('Unauthorized');
    }
};
exports.authenticate = authenticate;
// --- Middleware: General RBAC Guard ---
const requireRole = (allowedRoles) => {
    return async (req, res, next) => {
        const user = req.user;
        const userRoles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
        // System Owners and Super Admins always have skeleton-key access across the system
        if (userRoles.includes('system_owner') || userRoles.includes('super_admin')) {
            return next();
        }
        if (!userRoles.some((r) => allowedRoles.includes(r))) {
            return res.status(403).json({
                error: 'Forbidden. Insufficient role permissions.',
                required: allowedRoles,
                current: userRoles
            });
        }
        return next();
    };
};
exports.requireRole = requireRole;
// --- Middleware: Super Admin Auth ---
const superAdminOnly = async (req, res, next) => {
    const user = req.user;
    const userRoles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    if (!user || (!userRoles.includes('super_admin') && !userRoles.includes('system_owner'))) {
        return res.status(403).json({ error: 'Forbidden. Super Admin or System Owner access required.' });
    }
    return next();
};
exports.superAdminOnly = superAdminOnly;
// --- Middleware: System Owner Auth ---
const systemOwnerOnly = async (req, res, next) => {
    const user = req.user;
    const userRoles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    if (!user || !userRoles.includes('system_owner')) {
        return res.status(403).json({ error: 'Forbidden. System Owner access required.' });
    }
    return next();
};
exports.systemOwnerOnly = systemOwnerOnly;
//# sourceMappingURL=auth.middleware.js.map