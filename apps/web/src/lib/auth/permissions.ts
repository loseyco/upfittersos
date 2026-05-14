export const PERMISSIONS = {
  'mission_control.view': 'View Mission Control',
  'foreman.view': 'View Upfitters',
  'vehicles.view': 'View Vehicles',
  'vehicles.manage': 'Manage Vehicles',
  'zones.view': 'View Zones',
  'zones.manage': 'Manage Zones',
  'parts.view': 'View Parts Dept',
  'parts.manage': 'Manage Parts Dept',
  'customers.view': 'View Customers',
  'customers.manage': 'Manage Customers',
  'jobs.view': 'View Jobs',
  'jobs.move_vehicle': 'Move Vehicles / Change Bay',
  'jobs.manage': 'Manage Jobs',
  'staff.view': 'View Staff',
  'staff.manage': 'Manage Staff',
  'graphics.view': 'View Graphics Board',
  'fast.view': 'View F.A.S.T Board',
  'fabrication.view': 'View Fabrication Board',
  'office.view': 'View Office Board',
  'settings.view': 'View Settings',
  'settings.manage': 'Manage Settings',
  'timeclock.view': 'View Timeclock',
  'timeclock.manage': 'Manage Timeclock',
  'timeclock.offsite': 'Clock In/Out Offsite',
  'reports.view': 'View Reports',
  'performance.view': 'View Leaderboard',
  'tasks.view': 'View Tasks',
  'tasks.manage': 'Manage Tasks',
  'facility.view': 'View Facility Tools',
  'communication.view': 'View Communication Tools',
  'sync.view': 'View Raw Sync Data',
  'sync.manage': 'Manage Sync Integrations',
  'experimental.new_modals': 'Beta: Use New Modals',
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
