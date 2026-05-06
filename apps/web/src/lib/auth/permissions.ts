export const PERMISSIONS = {
  'mission_control.view': 'View Mission Control',
  'vehicles.view': 'View Vehicles',
  'vehicles.manage': 'Manage Vehicles',
  'zones.view': 'View Zones',
  'zones.manage': 'Manage Zones',
  'parts.view': 'View Parts Dept',
  'parts.manage': 'Manage Parts Dept',
  'customers.view': 'View Customers',
  'customers.manage': 'Manage Customers',
  'jobs.view': 'View Jobs',
  'jobs.manage': 'Manage Jobs',
  'staff.view': 'View Staff',
  'staff.manage': 'Manage Staff',
  'settings.view': 'View Settings',
  'settings.manage': 'Manage Settings',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export type PermissionSet = {
  [K in PermissionKey]?: boolean;
};

export function resolvePermissions(
  deptPermissions: PermissionSet = {},
  individualPermissions: PermissionSet = {}
): PermissionSet {
  const resolved: PermissionSet = { ...deptPermissions };
  
  Object.entries(individualPermissions).forEach(([key, value]) => {
    if (value !== undefined) {
      resolved[key as PermissionKey] = value;
    }
  });
  
  return resolved;
}
