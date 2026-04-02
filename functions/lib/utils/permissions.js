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
exports.DEFAULT_PERMISSIONS = void 0;
exports.checkBackendPermission = checkBackendPermission;
const admin = __importStar(require("firebase-admin"));
exports.DEFAULT_PERMISSIONS = {
    business_owner: {
        manage_staff: true,
        manage_inventory: true,
        view_financials: true,
        manage_tasks: true,
    },
    manager: {
        manage_staff: true,
        manage_inventory: true,
        view_financials: false,
        manage_tasks: true,
    },
    department_lead: {
        manage_staff: false,
        manage_inventory: true,
        view_financials: false,
        manage_tasks: true,
    },
    parts_guy: {
        manage_staff: false,
        manage_inventory: true,
        view_financials: false,
        manage_tasks: false,
    },
    staff: {
        manage_staff: false,
        manage_inventory: false,
        view_financials: false,
        manage_tasks: false,
    },
    super_admin: {
        manage_staff: true,
        manage_inventory: true,
        view_financials: true,
        manage_tasks: true,
        super_admin_feature_x: true,
    }
};
/**
 * Robustly verify if a user has a specific granular permission using the new Identity Governance System.
 * Order of evaluation:
 * 1. Super admin? -> yes
 * 2. User document custom override? -> return explicitly mapped value
 * 3. Tenant business custom roles override? -> return value explicitly mapped to their role
 * 4. Fallback to platform-wide hardcoded role mapping -> return mapped value
 */
async function checkBackendPermission(callerUid, callerRole, callerTenantId, permissionKey) {
    var _a;
    if (callerRole === 'super_admin')
        return true;
    try {
        const db = admin.firestore();
        // 1. Fetch user document to check for custom user-level overrides
        const userDoc = await db.collection('users').doc(callerUid).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        if (userData && userData.customPermissions && userData.customPermissions[permissionKey] !== undefined) {
            return userData.customPermissions[permissionKey];
        }
        // 2. Fetch business document to check for custom role overrides
        if (callerTenantId && callerTenantId !== 'GLOBAL') {
            const businessDoc = await db.collection('businesses').doc(callerTenantId).get();
            const businessData = businessDoc.exists ? businessDoc.data() : null;
            if (businessData && businessData.customRoles && businessData.customRoles[callerRole]) {
                const rolePermissions = businessData.customRoles[callerRole].permissions;
                if (rolePermissions && rolePermissions[permissionKey] !== undefined) {
                    return rolePermissions[permissionKey];
                }
            }
        }
    }
    catch (err) {
        console.error("Failed to verify backend permission dynamically", err);
    }
    // 3. Fallback mathematically to the platform default
    const effectiveRole = callerRole || 'staff';
    return ((_a = exports.DEFAULT_PERMISSIONS[effectiveRole]) === null || _a === void 0 ? void 0 : _a[permissionKey]) || false;
}
//# sourceMappingURL=permissions.js.map