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

export const PERMISSION_LABELS: Record<PermissionKey, { label: string, description: string }> = {
  manage_staff: { label: "Manage Staff", description: "Can add, edit, and remove team members." },
  manage_inventory: { label: "Manage Inventory", description: "Can modify physical assets and units." },
  view_financials: { label: "View Financials", description: "Can see confidential info like pay rates and MRR." },
  manage_tasks: { label: "Manage Tasks", description: "Can assign and oversee tasks for everyone." },
  super_admin_feature_x: { label: "Super Admin Diagnostic", description: "Diagnostic and elevated platform access." }
};
