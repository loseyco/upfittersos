import * as admin from 'firebase-admin';

export type PermissionKey = 
  | 'manage_staff'
  | 'manage_inventory'
  | 'view_financials'
  | 'manage_tasks'
  | 'super_admin_feature_x';

export const DEFAULT_PERMISSIONS: Record<string, Partial<Record<PermissionKey, boolean>>> = {
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
export async function checkBackendPermission(callerUid: string, callerRole: string, callerTenantId: string, permissionKey: PermissionKey): Promise<boolean> {
  if (callerRole === 'super_admin') return true;

  try {
    const db = admin.firestore();

    // 1. Fetch user document to check for custom user-level overrides
    const userDoc = await db.collection('users').doc(callerUid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    if (userData && userData.customPermissions && userData.customPermissions[permissionKey] !== undefined) {
      return userData.customPermissions[permissionKey] as boolean;
    }

    // 2. Fetch business document to check for custom role overrides
    if (callerTenantId && callerTenantId !== 'GLOBAL') {
      const businessDoc = await db.collection('businesses').doc(callerTenantId).get();
      const businessData = businessDoc.exists ? businessDoc.data() : null;
      if (businessData && businessData.customRoles && businessData.customRoles[callerRole]) {
        const rolePermissions = businessData.customRoles[callerRole].permissions;
        if (rolePermissions && rolePermissions[permissionKey] !== undefined) {
          return rolePermissions[permissionKey] as boolean;
        }
      }
    }

  } catch (err) {
    console.error("Failed to verify backend permission dynamically", err);
  }

  // 3. Fallback mathematically to the platform default
  const effectiveRole = callerRole || 'staff';
  return DEFAULT_PERMISSIONS[effectiveRole]?.[permissionKey] || false;
}
