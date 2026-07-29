import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { resolvePermissions, type PermissionSet } from '../../lib/auth/permissions';
import { 
  Search, 
  ExternalLink, 
  Building2, 
  Users, 
  Compass, 
  ArrowRight
} from 'lucide-react';

const HUB_NAMES: Record<string, string> = {
  dashboard: '🏠 Dashboard',
  office: '🏢 Main Office',
  upfitters: '📋 Upfitters',
  parts: '📦 Parts Dept',
  facility: '🗺️ Facility',
  settings: '⚙️ Admin & Sync',
  development: '💻 In Development'
};

interface Department {
  id: string;
  name: string;
  permissions?: PermissionSet;
}

interface StaffMember {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  displayName?: string;
  email?: string;
  departmentId?: string;
  role?: string;
  title?: string;
  isSuperAdmin?: boolean;
  individualPermissions?: PermissionSet;
  isArchived?: boolean;
}

interface PageCatalogItem {
  id: string;
  title: string;
  hub: string;
  groupLabel?: string;
  route: string;
  permission?: string;
  permissions?: string[];
  altAccessPaths: string[];
  description: string;
}

const MASTER_APP_PAGES: PageCatalogItem[] = [
  // Dashboard Pages
  {
    id: 'overview',
    title: 'My Jobs & Todos',
    hub: 'dashboard',
    route: 'overview',
    altAccessPaths: ['Default Login Home Page', 'Clicking Top Nav Brand Logo', 'Global Search (Ctrl+K)'],
    description: 'Personalized dashboard displaying staff assigned jobs, active tasks, timeclock widget, and labor checklists.'
  },
  {
    id: 'time_details',
    title: 'Time Clock & My Timesheet',
    hub: 'dashboard',
    route: 'time_details',
    altAccessPaths: ['Clicking Time Clock Widget on Top Bar', 'Clicking Clock In / Out Banner', 'My Jobs & Todos Header link'],
    description: 'Individual timeclock details, labor entry log, break/lunch buttons, and weekly work summary.'
  },
  {
    id: 'device_settings',
    title: 'Device & Kiosk Settings',
    hub: 'dashboard',
    route: 'device_settings',
    altAccessPaths: ['Clicking Kiosk Mode Icon on Top Nav', 'Kiosk Station Setup Link'],
    description: 'Local browser settings for TV kiosk mode, printer setup, and station auto-lock configuration.'
  },
  {
    id: 'org_chart',
    title: 'Company Org Chart',
    hub: 'dashboard',
    route: 'org_chart',
    altAccessPaths: ['Main Office Submenu', 'Staff Directory Profile Cards'],
    description: 'Interactive organizational hierarchy tree showing management structure and department teams.'
  },

  // Main Office Pages
  {
    id: 'daily_log',
    title: 'Daily Operations Log',
    hub: 'office',
    permission: 'office.view',
    permissions: ['office.view', 'jobs.view', 'foreman.view'],
    route: 'daily_log',
    altAccessPaths: ['Main Office Hub', 'QuickDesk Dashboard Action', 'Morning Meeting Report Print Button'],
    description: 'Master daily log feed capturing active jobs, vehicle status changes, task activity, and daily printout summaries.'
  },
  {
    id: 'progress_digest',
    title: "Today's Progress Digest",
    hub: 'office',
    permission: 'office.view',
    permissions: ['office.view', 'jobs.view', 'foreman.view'],
    route: 'progress_digest',
    altAccessPaths: ['Main Office Hub', 'Daily Operations Log Header Button'],
    description: 'Real-time job progress cards, task completion percentages, and active shop floor workload.'
  },
  {
    id: 'jobs_worksheet',
    title: 'Jobs Worksheet (Spreadsheet)',
    hub: 'office',
    permission: 'jobs.view',
    route: 'jobs_worksheet',
    altAccessPaths: ['Upfitters Sidebar Submenu', 'Parts Dept Sidebar Submenu', 'Job Detail Page Navigation'],
    description: 'Full-featured interactive spreadsheet for viewing, filtering, editing, and managing all shop jobs.'
  },
  {
    id: 'live_timeclock',
    title: 'Live Timeclock Monitor',
    hub: 'office',
    permission: 'timeclock.view',
    route: 'live_timeclock',
    altAccessPaths: ['Main Office Submenu', 'Payroll & Attendance Header Action'],
    description: 'Live shop floor dashboard showing who is currently clocked in, active task timer, and break status.'
  },
  {
    id: 'timeclock',
    title: 'Payroll & Attendance Manager',
    hub: 'office',
    permission: 'timeclock.manage',
    route: 'timeclock',
    altAccessPaths: ['Main Office Submenu', 'Staff Member Time Audit Button'],
    description: 'Payroll manager for approving timecards, editing timestamps, adding manual time entries, and exporting pay periods.'
  },
  {
    id: 'staff',
    title: 'Staff Directory',
    hub: 'office',
    permission: 'staff.view',
    route: 'staff',
    altAccessPaths: ['Admin & Sync Sidebar Submenu', 'Org Chart Member Click', 'Global Search (Ctrl+K)'],
    description: 'Staff directory for searching employees, viewing profile cards, managing permissions, and setting up accounts.'
  },

  // Upfitters Pages
  {
    id: 'upfitters',
    title: 'Upfitters Shop Overview',
    hub: 'upfitters',
    permission: 'foreman.view',
    route: 'upfitters',
    altAccessPaths: ['Shop Foreman Dashboard', 'Legacy /foreman Redirect'],
    description: 'Foreman shop floor hub for managing bay assignments, vehicle status, and technician job routing.'
  },
  {
    id: 'bay_worksheet',
    title: 'Bay Assignment Worksheet',
    hub: 'upfitters',
    permission: 'bay_worksheet.view',
    route: 'bay_worksheet',
    altAccessPaths: ['Upfitters Sidebar Submenu', 'Facility Bay Monitor TV'],
    description: 'Visual grid mapping shop bays to assigned vehicles, lead technicians, and current upfit progress.'
  },

  // Parts Dept Pages
  {
    id: 'parts',
    title: 'Parts Dept Overview',
    hub: 'parts',
    permission: 'parts.view',
    route: 'parts',
    altAccessPaths: ['Parts Dept Hub Button', 'Global Search (Ctrl+K)'],
    description: 'Parts inventory overview, pending orders, staging status, and inventory search.'
  },
  {
    id: 'parts_worksheet',
    title: 'Parts Request & Intake Worksheet',
    hub: 'parts',
    permission: 'parts_worksheet.view',
    permissions: ['parts_worksheet.view', 'parts.manage'],
    route: 'parts_worksheet',
    altAccessPaths: ['Parts Dept Submenu', 'Job Detail Page "Request Part" Button'],
    description: 'Part request queue for upfitters requesting shop materials, receiving packages, and tracking purchase orders.'
  },

  // Facility Pages
  {
    id: 'zones',
    title: 'Zones Config',
    hub: 'facility',
    permission: 'facility.view',
    route: 'zones',
    altAccessPaths: ['Facility Hub Submenu', 'TV Kiosk Zone Setup'],
    description: 'Facility zone manager for defining shop bays, parking lots, conference rooms, and TV display assignments.'
  },
  {
    id: 'bay_monitor',
    title: 'Bay Monitor (TV Display)',
    hub: 'facility',
    permission: 'facility.view',
    route: 'bay_monitor',
    altAccessPaths: ['Shop Floor TV Kiosk Route', 'Facility Submenu'],
    description: 'Full-screen high-contrast TV kiosk display showing active bay assignments for shop floor monitors.'
  },
  {
    id: 'parking_monitor',
    title: 'Parking Key Monitor (TV Display)',
    hub: 'facility',
    permission: 'facility.view',
    route: 'parking_monitor',
    altAccessPaths: ['Key Wall TV Kiosk Route', 'Facility Submenu'],
    description: 'Full-screen TV kiosk display tracking vehicle parking locations, key tag IDs, and intake status.'
  },
  {
    id: 'conference_monitor',
    title: 'Conference Room (TV Display)',
    hub: 'facility',
    permission: 'facility.view',
    route: 'conference_monitor',
    altAccessPaths: ['Conference Room TV Kiosk Route', 'Facility Submenu'],
    description: 'Full-screen TV monitor view for team meetings, job schedules, and operational announcements.'
  },
  {
    id: 'timeclock_monitor',
    title: 'Timeclock Station (TV Display)',
    hub: 'facility',
    permission: 'timeclock.view',
    route: 'timeclock_monitor',
    altAccessPaths: ['Timeclock Tablet/TV Kiosk Route', 'Facility Submenu'],
    description: 'Kiosk view for shop floor timeclock tablets enabling QR scan and PIN clock-ins.'
  },

  // Admin & Sync Pages
  {
    id: 'departments',
    title: 'Departments Config',
    hub: 'settings',
    permission: 'staff.view',
    route: 'departments',
    altAccessPaths: ['Admin & Sync Submenu', 'Staff Manager Header Link'],
    description: 'Department permissions manager for setting up roles, default permissions, and staff groupings.'
  },
  {
    id: 'settings',
    title: 'System Settings',
    hub: 'settings',
    permission: 'settings.view',
    route: 'settings',
    altAccessPaths: ['Admin & Sync Submenu', 'Global Search (Ctrl+K)'],
    description: 'Core system configuration, business logo, timezone settings, and QuickBooks integration credentials.'
  },
  {
    id: 'qb_sync_status',
    title: 'QuickBooks Live Sync Monitor',
    hub: 'settings',
    permission: 'sync.view',
    route: 'qb_sync_status',
    altAccessPaths: ['Admin & Sync Submenu', 'Sync Status Badge on Top Bar'],
    description: 'Real-time telemetry monitor for tracking active QuickBooks Desktop sync requests, queue health, and logs.'
  },
  {
    id: 'qb_health_audit',
    title: 'Data Health Audit',
    hub: 'settings',
    permission: 'sync.view',
    route: 'qb_health_audit',
    altAccessPaths: ['Admin & Sync Submenu', 'Live Sync Monitor Link'],
    description: 'Diagnostic audit tool for verifying customer, job, item, and invoice data integrity with QuickBooks.'
  },

  // Standalone Detail Pages (Accessible via direct click / URL)
  {
    id: 'job_detail',
    title: 'Job Detail Page',
    hub: 'development',
    groupLabel: 'Standalone Detail Views',
    permission: 'jobs.view',
    route: 'job/:jobId',
    altAccessPaths: [
      'Clicking Job Number on Daily Operations Log',
      'Clicking Job Row on Jobs Worksheet',
      'Clicking Job Card on Upfitters Overview',
      'Global Search (Ctrl+K) Job Result'
    ],
    description: 'Complete 360-degree job page featuring task lists, upfit specifications, parts status, time logs, and QA/QC inspection.'
  },
  {
    id: 'task_detail',
    title: 'Task Detail Page',
    hub: 'development',
    groupLabel: 'Standalone Detail Views',
    permission: 'jobs.view',
    route: 'task/:jobId/:taskId',
    altAccessPaths: [
      'Clicking Task Activity Item on Daily Operations Log',
      'Clicking Task Row on My Jobs & Todos',
      'Clicking Task Card on Upfitters Kanban Board'
    ],
    description: 'Direct task page featuring labor instructions, checklist items, assigned technicians, time logs, and clock-in actions.'
  },

  // In Development Pages
  {
    id: 'page_analytics',
    title: 'Page Views & Usage Analytics',
    hub: 'development',
    groupLabel: 'Analytics & Telemetry',
    permission: 'development.view',
    route: 'page_analytics',
    altAccessPaths: ['In Development Submenu', 'Telemetry & Trends Link'],
    description: 'Real-time telemetry tracking page views, duration per route, and per-user activity breakdowns.'
  },
  {
    id: 'feedback',
    title: 'Feedback & Dev Roadmap',
    hub: 'development',
    groupLabel: 'Communication & Events',
    permission: 'facility.view',
    route: 'feedback',
    altAccessPaths: ['In Development Submenu', 'Clicking "?" Site Icon on Top Nav'],
    description: '0-5 priority roadmap manager for feature requests/bugs submitted via the "?" site icon with 1-click task conversion.'
  },
  {
    id: 'staff_sitemap',
    title: 'Staff Site Map (Live)',
    hub: 'development',
    groupLabel: 'Tools & Utilities',
    permission: 'staff.view',
    route: 'staff_sitemap',
    altAccessPaths: ['In Development Submenu', 'App Pages & Access Directory link'],
    description: 'Live Firestore permission inspector showing exact page availability and click paths for every staff member.'
  },
  {
    id: 'safety',
    title: 'Safety Overview',
    hub: 'development',
    groupLabel: 'Safety & OSHA',
    permission: 'safety.view',
    route: 'safety',
    altAccessPaths: ['In Development Submenu', 'Safety & OSHA Category Header'],
    description: 'Safety compliance center, OSHA recordkeeping, incident reporting, and safety audit checklists.'
  },
  {
    id: 'sales_pipeline',
    title: 'Sales CRM & Pipeline',
    hub: 'development',
    groupLabel: 'Sales Dept',
    permission: 'sales.view',
    route: 'sales_pipeline',
    altAccessPaths: ['In Development Submenu', 'Sales Dept Category Header'],
    description: 'Sales CRM pipeline tracking prospects, quotes, deals, meeting notes, and sales analytics.'
  }
];

export function AppPageDirectory({ tenantId }: { tenantId: string }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHub, setSelectedHub] = useState<string>('ALL');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('ALL');

  // Fetch live departments from Firestore
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['live-departments', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Department));
    },
    enabled: !!tenantId
  });

  // Fetch live staff members from Firestore
  const { data: staffMembers = [] } = useQuery<StaffMember[]>({
    queryKey: ['live-staff', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() } as StaffMember))
        .filter(s => !s.isArchived);
    },
    enabled: !!tenantId
  });

  const deptMap = useMemo(() => {
    const map: Record<string, Department> = {};
    departments.forEach(d => { map[d.id] = d; });
    return map;
  }, [departments]);

  // Compute per-page access matrices
  const pageAccessMatrix = useMemo(() => {
    return MASTER_APP_PAGES.map(page => {
      const allowedDepts: Department[] = [];
      const authorizedStaff: { id: string; name: string; email: string; deptName: string; isSuper: boolean }[] = [];

      staffMembers.forEach(staff => {
        const isSuper = staff.isSuperAdmin || (staff.email && ['p.losey@saegrp.com', 'loseyp@gmail.com'].includes(staff.email));
        const dept = deptMap[staff.departmentId || ''] || {};
        const deptPerms = dept.permissions || {};
        const indPerms = staff.individualPermissions || {};

        const resolvedPerms = resolvePermissions(deptPerms, indPerms);

        let canAccess = false;
        const resolvedMap = resolvedPerms as Record<string, boolean | undefined>;
        if (isSuper) {
          canAccess = true;
        } else if (!page.permission && !page.permissions) {
          canAccess = true;
        } else if (page.permission) {
          canAccess = !!resolvedMap[page.permission];
        } else if (page.permissions) {
          canAccess = page.permissions.some(p => !!resolvedMap[p]);
        }

        if (canAccess) {
          const fullName = `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || staff.name || staff.displayName || staff.email || 'Staff Member';
          authorizedStaff.push({
            id: staff.id,
            name: fullName,
            email: staff.email || '',
            deptName: dept.name || 'Unassigned',
            isSuper: !!isSuper
          });
        }
      });

      departments.forEach(dept => {
        const deptPerms = (dept.permissions || {}) as Record<string, boolean | undefined>;
        let canAccess = false;
        if (!page.permission && !page.permissions) {
          canAccess = true;
        } else if (page.permission) {
          canAccess = !!deptPerms[page.permission];
        } else if (page.permissions) {
          canAccess = page.permissions.some(p => !!deptPerms[p]);
        }

        if (canAccess) {
          allowedDepts.push(dept);
        }
      });

      return {
        ...page,
        allowedDepts,
        authorizedStaff
      };
    });
  }, [staffMembers, departments, deptMap]);

  const filteredPages = useMemo(() => {
    return pageAccessMatrix.filter(page => {
      const matchesSearch = 
        page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        page.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        page.altAccessPaths.some(p => p.toLowerCase().includes(searchQuery.toLowerCase())) ||
        page.authorizedStaff.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.email.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesHub = selectedHub === 'ALL' || page.hub === selectedHub;
      const matchesDept = selectedDeptId === 'ALL' || page.allowedDepts.some(d => d.id === selectedDeptId);

      return matchesSearch && matchesHub && matchesDept;
    });
  }, [pageAccessMatrix, searchQuery, selectedHub, selectedDeptId]);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 font-sans text-zinc-100 select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2 flex items-center gap-3">
            App Pages & Access Directory <span className="text-indigo-400 font-normal">/ Master Sitemap</span>
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm">
            Centralized directory of all pages in UpfittersOS, detailing menu locations, alternative access routes, allowed departments, and authorized staff.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-zinc-950 p-4 rounded-2xl border border-zinc-800/80">
          <div className="text-center px-4 border-r border-zinc-800">
            <div className="text-2xl font-black text-white">{MASTER_APP_PAGES.length}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-extrabold">Total App Pages</div>
          </div>
          <div className="text-center px-4">
            <div className="text-2xl font-black text-indigo-400">{staffMembers.length}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-extrabold">Active Staff</div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col lg:flex-row gap-3 bg-zinc-900/90 p-3 rounded-2xl border border-zinc-800 sticky top-4 z-20 backdrop-blur-xl shadow-xl">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" size={16} />
          <input
            type="text"
            placeholder="Search page name, description, staff name, or navigation path..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-11 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Hub Filter */}
          <select
            value={selectedHub}
            onChange={(e) => setSelectedHub(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Hubs (7 Main Hubs)</option>
            <option value="dashboard">🏠 Dashboard</option>
            <option value="office">🏢 Main Office</option>
            <option value="upfitters">📋 Upfitters</option>
            <option value="parts">📦 Parts Dept</option>
            <option value="facility">🗺️ Facility</option>
            <option value="settings">⚙️ Admin & Sync</option>
            <option value="development">💻 In Development</option>
          </select>

          {/* Department Filter */}
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Departments ({departments.length})</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Pages Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {filteredPages.map((page) => {
          const targetUrl = `/business/${tenantId}/${page.route}`;

          return (
            <div 
              key={page.id}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-between space-y-5 shadow-xl transition-all hover:border-indigo-500/40"
            >
              <div className="space-y-4">
                {/* Header & Launch Button */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-black uppercase tracking-wider">
                        {HUB_NAMES[page.hub] || page.hub}
                      </span>
                      {page.groupLabel && (
                        <span className="px-2 py-0.5 rounded-lg bg-zinc-950 text-zinc-400 border border-zinc-800 text-[9px] font-bold font-mono">
                          {page.groupLabel}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-black text-white">{page.title}</h3>
                  </div>

                  <a
                    href={targetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl transition shadow flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    🚀 Open Page <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                  {page.description}
                </p>

                {/* Direct Menu Location */}
                <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-800/80 space-y-1">
                  <div className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-indigo-400" /> Primary Sidebar Menu Location
                  </div>
                  <div className="text-xs font-mono font-bold text-indigo-300">
                    {HUB_NAMES[page.hub] || page.hub} {page.groupLabel ? `➜ [${page.groupLabel}]` : ''} ➜ {page.title}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">URL Route: {targetUrl}</div>
                </div>

                {/* Alternative Access Routes */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-amber-400" /> How Else You Can Get There (Alternative Access)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {page.altAccessPaths.map((path, idx) => (
                      <span key={idx} className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-semibold">
                        {path}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Department & Staff Access */}
              <div className="pt-4 border-t border-zinc-800/80 space-y-3">
                {/* Allowed Departments */}
                <div className="space-y-1">
                  <div className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-400" /> Allowed Departments ({page.allowedDepts.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {page.allowedDepts.map(d => (
                      <span key={d.id} className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] font-bold">
                        {d.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Authorized Staff Members */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-400" /> Authorized Real Staff ({page.authorizedStaff.length})
                    </span>
                    <span className="text-zinc-500 font-mono text-[9px]">
                      {Math.round((page.authorizedStaff.length / Math.max(1, staffMembers.length)) * 100)}% of team
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto no-scrollbar">
                    {page.authorizedStaff.map(s => (
                      <span key={s.id} className="px-2 py-0.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-[10px] font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                        {s.name} {s.isSuper && <span className="text-[8px] text-rose-400 font-bold">(Super)</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredPages.length === 0 && (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-zinc-800 rounded-3xl text-zinc-500 text-xs">
            No pages found matching your search query.
          </div>
        )}
      </div>
    </div>
  );
}
