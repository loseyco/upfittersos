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
  | 'manage_qa'
  | 'manage_tasks'
  | 'manage_timesheets'
  | 'view_financials'
  | 'view_facility_map'
  | 'manage_facility_map'
  | 'simulate_roles'
  | 'view_meetings'
  | 'manage_meetings'
  | 'view_areas'
  | 'manage_areas'
  | 'bypass_kiosk_timeclock'
  | 'view_audit_logs'
  | 'view_deliveries'
  | 'manage_deliveries'
  | 'super_admin_core';

export const DEFAULT_PERMISSIONS: Record<string, Partial<Record<PermissionKey, boolean>>> = {
  business_owner: {
    manage_settings: true, manage_roles: true, manage_staff: true,
    view_customers: true, manage_customers: true,
    view_vehicles: true, manage_vehicles: true,
    view_jobs: true, manage_jobs: true,
    view_areas: true, manage_areas: true,
    view_inventory: true, manage_inventory: true,
    manage_canvases: true, manage_qa: true, manage_tasks: true,
    view_meetings: true, manage_meetings: true, bypass_kiosk_timeclock: true,
    manage_timesheets: true, view_financials: true, view_audit_logs: true,
    view_facility_map: true, manage_facility_map: true, 
    view_deliveries: true, manage_deliveries: true,
    simulate_roles: true
  },
  system_owner: {
    manage_settings: true, manage_roles: true, manage_staff: true,
    view_customers: true, manage_customers: true,
    view_vehicles: true, manage_vehicles: true,
    view_jobs: true, manage_jobs: true,
    view_inventory: true, manage_inventory: true,
    view_areas: true, manage_areas: true,
    manage_canvases: true, manage_qa: true, manage_tasks: true,
    view_meetings: true, manage_meetings: true, bypass_kiosk_timeclock: true,
    manage_timesheets: true, view_financials: true, super_admin_core: true,
    view_facility_map: true, manage_facility_map: true, view_audit_logs: true,
    view_deliveries: true, manage_deliveries: true,
    simulate_roles: true
  },
  super_admin: {
    manage_settings: true, manage_roles: true, manage_staff: true,
    view_customers: true, manage_customers: true,
    view_vehicles: true, manage_vehicles: true,
    view_jobs: true, manage_jobs: true,
    view_inventory: true, manage_inventory: true,
    view_areas: true, manage_areas: true,
    manage_canvases: true, manage_qa: true, manage_tasks: true,
    view_meetings: true, manage_meetings: true, bypass_kiosk_timeclock: true,
    manage_timesheets: true, view_financials: true, super_admin_core: true,
    view_facility_map: true, manage_facility_map: true, view_audit_logs: true,
    view_deliveries: true, manage_deliveries: true,
    simulate_roles: true
  }
};


export const PERMISSION_LABELS: Record<PermissionKey, { label: string, description: string }> = {
  manage_settings: { label: "Business Settings", description: "Manage billing, identity, and integrations." },
  manage_roles: { label: "Roles & Access", description: "Create and modify security permissions." },
  manage_staff: { label: "Staff Directory", description: "Invite staff and edit their profiles." },
  view_customers: { label: "View Customers", description: "Read-only access to customer CRM." },
  manage_customers: { label: "Manage Customers", description: "Create, edit, and delete CRM records." },
  view_vehicles: { label: "View Fleet", description: "Read-only access to vehicle registry." },
  manage_vehicles: { label: "Manage Fleet", description: "Register, modify, and retire vehicles." },
  view_jobs: { label: "View Jobs", description: "Read-only access to work orders." },
  manage_jobs: { label: "Manage Jobs", description: "Create, dispatch, and close work orders." },
  view_inventory: { label: "View Inventory", description: "Read-only access to WMS." },
  manage_inventory: { label: "Manage Inventory", description: "Update counts, register SKUs." },
  manage_canvases: { label: "Logic Workflows", description: "Edit Infinity Whiteboard flows." },
  manage_qa: { label: "Quality Assurance", description: "Inspect and approve shop output." },
  manage_tasks: { label: "Assign Tasks", description: "Create and dispatch tasks to other staff." },
  manage_timesheets: { label: "Manage Time & Payroll", description: "View and edit timesheets and process payroll runs." },
  view_meetings: { label: "View Meetings", description: "Read-only access to meeting notes and events." },
  manage_meetings: { label: "Manage Meetings", description: "Create and edit meetings and their notes." },
  view_areas: { label: "View Areas", description: "Read-only access to facility areas and zones." },
  manage_areas: { label: "Manage Areas", description: "Create and modify rooms, bays, and operational areas." },
  view_financials: { label: "View Financials", description: "See margin and cost analytics." },
  view_facility_map: { label: "View Facility Map", description: "View the business interactive mapping layout." },
  manage_facility_map: { label: "Manage Facility Map", description: "Edit map geometry, add objects, and update coordinates." },
  simulate_roles: { label: "Simulate Roles", description: "Impersonate custom roles to verify permissions." },
  bypass_kiosk_timeclock: { label: "Remote Clock-In", description: "Bypass physical barcode kiosk scanning requirements." },
  view_audit_logs: { label: "View Audit Logs", description: "Access security telemetry and internal audit history." },
  view_deliveries: { label: "View Deliveries", description: "Read-only access to tracked packages and shipments." },
  manage_deliveries: { label: "Manage Deliveries", description: "Log new incoming packages and update package statuses." },
  super_admin_core: { label: "Super Admin Core", description: "Global platform diagnostics." }
};
