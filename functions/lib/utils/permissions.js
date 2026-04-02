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
        manage_settings: true, manage_roles: true, manage_staff: true,
        view_customers: true, manage_customers: true,
        view_vehicles: true, manage_vehicles: true,
        view_jobs: true, manage_jobs: true,
        view_inventory: true, manage_inventory: true,
        manage_canvases: true, manage_tasks: true,
        view_financials: true,
        view_facility_map: true, manage_facility_map: true,
        simulate_roles: true
    },
    super_admin: {
        manage_settings: true, manage_roles: true, manage_staff: true,
        view_customers: true, manage_customers: true,
        view_vehicles: true, manage_vehicles: true,
        view_jobs: true, manage_jobs: true,
        view_inventory: true, manage_inventory: true,
        manage_canvases: true, manage_tasks: true,
        view_financials: true, super_admin_core: true,
        view_facility_map: true, manage_facility_map: true,
        simulate_roles: true
    }
};
/**
 * Robustly verify if a user has a specific granular permission using the new Identity Governance System.
 * Order of evaluation:
 * 1. Super admin? -> yes
 * 2. User document custom override? -> return explicitly mapped value
 * 3. Tenant business custom roles OR fallback defaults -> mathematically union mappings across all assigned user roles array.
 */
async function checkBackendPermission(callerUid, callerRolesParam, callerTenantId, permissionKey) {
    const rolesArray = Array.isArray(callerRolesParam) ? callerRolesParam : [callerRolesParam || 'staff'];
    if (rolesArray.includes('super_admin'))
        return true;
    try {
        const db = admin.firestore();
        // 1. Fetch user document to check for custom user-level overrides
        const userDoc = await db.collection('users').doc(callerUid).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        if (userData && userData.customPermissions && userData.customPermissions[permissionKey] !== undefined) {
            if (userData.customPermissions[permissionKey] === true)
                return true;
        }
        // 2. Fetch business document to check for custom role overrides
        let customBusinessRoles = {};
        if (callerTenantId && callerTenantId !== 'GLOBAL') {
            const businessDoc = await db.collection('businesses').doc(callerTenantId).get();
            const businessData = businessDoc.exists ? businessDoc.data() : null;
            if (businessData && businessData.customRoles) {
                customBusinessRoles = businessData.customRoles;
            }
        }
        // 3. Mathematical OR logic across all roles
        for (const r of rolesArray) {
            // First check custom business overrides mapped
            if (customBusinessRoles[r] && customBusinessRoles[r].permissions && customBusinessRoles[r].permissions[permissionKey] === true) {
                return true;
            }
            // Then fallback to default mappings
            if (exports.DEFAULT_PERMISSIONS[r] && exports.DEFAULT_PERMISSIONS[r][permissionKey] === true) {
                return true;
            }
        }
    }
    catch (err) {
        console.error("Failed to verify backend permission dynamically", err);
    }
    return false;
}
//# sourceMappingURL=permissions.js.map