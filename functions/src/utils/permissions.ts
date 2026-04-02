import * as admin from 'firebase-admin';

export type PermissionKey = 
  | 'manage_settings'
  | 'manage_roles'
  | 'manage_staff'
  | 'view_customers'
  | 'manage_customers'
  | 'view_vehicles'
  | 'manage_vehicles'
  | 'view_jobs'
  | 'manage_jobs'
  | 'view_inventory'
  | 'manage_inventory'
  | 'manage_canvases'
  | 'manage_tasks'
  | 'view_financials'
  | 'view_facility_map'
  | 'manage_facility_map'
  | 'simulate_roles'
  | 'super_admin_core';

export const DEFAULT_PERMISSIONS: Record<string, Partial<Record<PermissionKey, boolean>>> = {
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
export async function checkBackendPermission(callerUid: string, callerRolesParam: string | string[], callerTenantId: string, permissionKey: PermissionKey): Promise<boolean> {
  const rolesArray = Array.isArray(callerRolesParam) ? callerRolesParam : [callerRolesParam || 'staff'];
  
  if (rolesArray.includes('super_admin')) return true;

  try {
    const db = admin.firestore();

    // 1. Fetch user document to check for custom user-level overrides
    const userDoc = await db.collection('users').doc(callerUid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    if (userData && userData.customPermissions && userData.customPermissions[permissionKey] !== undefined) {
      if (userData.customPermissions[permissionKey] === true) return true;
    }

    // 2. Fetch business document to check for custom role overrides
    let customBusinessRoles: any = {};
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
        if (DEFAULT_PERMISSIONS[r] && DEFAULT_PERMISSIONS[r][permissionKey] === true) {
            return true;
        }
    }

  } catch (err) {
    console.error("Failed to verify backend permission dynamically", err);
  }

  return false;
}
