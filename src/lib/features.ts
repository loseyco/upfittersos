// Codebase Feature Registry - Active
export type FeatureVersion = 'disabled' | 'alpha' | 'beta' | 'live';

export interface AppFeature {
  id: string;
  name: string;
  description: string;
  availableVersions: FeatureVersion[];
}

export const APP_FEATURES: AppFeature[] = [
  // Front-End Operations Hub
  { id: 'time', name: 'Time & Attendance', description: 'Record hours, timesheets, and time off.', availableVersions: ['disabled', 'alpha'] },
  { id: 'meetings', name: 'Meeting Workspace', description: 'Active meetings and recorded minutes.', availableVersions: ['disabled', 'alpha'] },
  { id: 'tasks', name: 'My Tasks', description: 'Administrative and executive tasks.', availableVersions: ['disabled', 'alpha'] },
  { id: 'scanner', name: 'Universal Scanner', description: 'QR sticker resolution.', availableVersions: ['disabled', 'alpha'] },
  { id: 'facility_map', name: 'Facility Map', description: 'Interactive floorplan of the business campus.', availableVersions: ['disabled', 'alpha'] },
  { id: 'ops', name: 'Mission Control', description: 'Live operations overview.', availableVersions: ['disabled', 'alpha'] },
  { id: 'canvases', name: 'Workflow Whiteboards', description: 'Logic canvases for operational procedures.', availableVersions: ['disabled', 'alpha'] },
  { id: 'feedback', name: 'Idea & Bug Board', description: 'Submit feedback and feature requests.', availableVersions: ['disabled', 'alpha'] },
  { id: 'tech', name: 'Technician Portal', description: 'Clock into assigned jobs and view vehicle details.', availableVersions: ['disabled', 'alpha'] },
  { id: 'check_in', name: 'Vehicle Intake', description: 'Physical intake hub for capturing VINs and condition media.', availableVersions: ['disabled', 'alpha'] },
  { id: 'messenger', name: 'Real-Time Messenger', description: 'Internal team chat and push notification dispatch.', availableVersions: ['disabled', 'alpha', 'beta', 'live'] },

  // Back-End Business Admin Suite
  { id: 'roles', name: 'Identity & Access Rules', description: 'Manage permissions and roles.', availableVersions: ['disabled', 'alpha'] },
  { id: 'staff', name: 'Staff Directory', description: 'Internal employee database.', availableVersions: ['disabled', 'alpha'] },
  { id: 'customers', name: 'CRM (Customers)', description: 'Customer and lead management.', availableVersions: ['disabled', 'alpha'] },
  { id: 'vehicles', name: 'Fleet Management', description: 'Vehicle and asset tracking.', availableVersions: ['disabled', 'alpha'] },
  { id: 'jobs', name: 'Job Processing', description: 'Administrative work and service orders.', availableVersions: ['disabled', 'alpha'] },
  { id: 'areas', name: 'Area Management', description: 'Physical zone registry and tracking.', availableVersions: ['disabled', 'alpha'] },
  { id: 'inventory', name: 'Warehouse (WMS)', description: 'Parts and materials inventory.', availableVersions: ['disabled', 'alpha'] },
  { id: 'finances', name: 'Finances & Billing', description: 'Invoicing, expenses, and payroll calculations.', availableVersions: ['disabled', 'alpha'] },
  { id: 'reports', name: 'Analytics & Reports', description: 'Business intelligence and reporting.', availableVersions: ['disabled', 'alpha'] },
  { id: 'notices', name: 'Global Notices', description: 'Business-wide announcements.', availableVersions: ['disabled', 'alpha'] },
  { id: 'companycam', name: 'CompanyCam Sync', description: 'OAuth integration with CompanyCam.', availableVersions: ['disabled', 'alpha'] },
  { id: 'audit', name: 'Security & Audit Logs', description: 'Internal telemetry and CRUD action history.', availableVersions: ['disabled', 'alpha'] },
  { id: 'deliveries', name: 'Receiving (Deliveries)', description: 'Log and track incoming packages.', availableVersions: ['disabled', 'alpha'] },
  { id: 'estimate_builder', name: 'Job Manager', description: 'Construct and manage accurate job scopes with line items.', availableVersions: ['disabled', 'alpha'] }
];

export const DEFAULT_FEATURE_STATE: Record<string, FeatureVersion> = {
  time: 'disabled',
  meetings: 'disabled',
  tasks: 'disabled',
  scanner: 'disabled',
  facility_map: 'disabled',
  ops: 'disabled',
  canvases: 'disabled',
  feedback: 'disabled',
  tech: 'disabled',
  check_in: 'disabled',
  roles: 'disabled',
  staff: 'disabled',
  customers: 'disabled',
  vehicles: 'disabled',
  jobs: 'disabled',
  areas: 'disabled',
  inventory: 'disabled',
  finances: 'disabled',
  reports: 'disabled',
  notices: 'disabled',
  companycam: 'disabled',
  audit: 'disabled',
  deliveries: 'disabled',
  estimate_builder: 'disabled',
  messenger: 'disabled'
};
