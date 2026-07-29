export const PERMISSIONS = {
  'quickdesk.view': 'View QuickDesk (Classic)',
  'mission_control.view': 'View Mission Control',
  'foreman.view': 'Upfitters Hub (Main Menu)',
  'vehicles.view': 'View Vehicles',
  'vehicles.manage': 'Manage Vehicles',
  'zones.view': 'View Zones',
  'zones.manage': 'Manage Zones',
  'parts.view': 'Parts Dept Hub (Main Menu)',
  'parts.manage': 'Manage Parts Dept',
  'printed_parts.view': 'View Print Farm Board',
  'printed_parts.manage': 'Manage Print Farm Board',
  'customers.view': 'View Customers',
  'customers.manage': 'Manage Customers',
  'jobs.view': 'View Jobs',
  'jobs.move_vehicle': 'Move Vehicles / Change Bay',
  'jobs.manage': 'Manage Jobs',
  'jobs.qc': 'Perform Quality Control (QA/QC)',
  'staff.view': 'View Staff',
  'staff.manage': 'Manage Staff',
  'permission_matrix.view': 'View Permission Matrix Portal',
  'permission_matrix.manage': 'Manage Permission Matrix & Overrides',
  'graphics.view': 'View Graphics Board',
  'fast.view': 'View F.A.S.T Board',
  'fabrication.view': 'View Fabrication Board',
  'harness.view': 'View Harness Board',
  'office.view': 'Main Office Hub (Main Menu)',
  'settings.view': 'Admin & Sync Hub (Main Menu)',
  'settings.manage': 'Manage Settings',
  'timeclock.view': 'View Timeclock',
  'timeclock.manage': 'Manage Timeclock',
  'timeclock.approve': 'Approve Timecard Changes',
  'timeclock.no_review_required': 'Skip Timeclock Verification (Auto-Approve Edits)',
  'timeclock.offsite': 'Clock In/Out Offsite',
  'reports.view': 'View Reports',
  'performance.view': 'View Leaderboard',
  'tasks.view': 'View Tasks',
  'tasks.manage': 'Manage Tasks',
  'tasks.clock_others': 'Clock Staff In/Out of Tasks',
  'facility.view': 'View Facility Tools',
  'communication.view': 'View Communication Tools',
  'whiteboards.view': 'View Whiteboards',
  'whiteboards.manage': 'Manage Whiteboards',
  'sync.view': 'View Raw Sync Data',
  'sync.manage': 'Download QuickBooks Connector',
  'experimental.new_modals': 'Beta: Use New Modals',
  'vendors.view': 'View Vendors & Services',
  'vendors.manage': 'Manage Vendors & Services',
  'staff_worksheet.view': 'View Staff Worksheet',
  'bay_worksheet.view': 'View Bay Worksheet',
  'parts_worksheet.view': 'View Parts Worksheet',
  'package_intake.use': 'Perform Package Intake',
  'part_request.use': 'Add Part / Part Request',
  'vehicle_intake.use': 'Perform Vehicle Intake',
  'incident_log.use': 'Log System Feedback & Incidents',
  'sales.view': 'View Sales & CRM',
  'sales.manage': 'Manage Sales & CRM',
  'dashboard.customize': 'Customize Personal Dashboard',
  'development.view': 'View In-Development Features',
  'safety.view': 'View Safety & OSHA Center',
  'safety.manage': 'Manage Safety & OSHA Compliance',
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
