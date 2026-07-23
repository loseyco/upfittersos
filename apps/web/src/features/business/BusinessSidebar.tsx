import React, { useState, useEffect, useRef } from 'react';
import {
  Home, Users, Briefcase, Layers, Map,
  Layout, MessageSquare, Megaphone, Calendar, RefreshCw, X, Settings, UserCog, Car, Package,
  ClipboardList, PenTool, Wrench, Building2, Activity, Printer, ShieldCheck, ShieldAlert,
  Handshake, Monitor, FileSpreadsheet, QrCode, ChevronLeft, ChevronRight, Clock, Info,
  HelpCircle, GraduationCap, LogIn, Pizza, BookOpen, Workflow, TrendingUp, BarChart3,
  Code, MapPin, Tv
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth/store';
import type { PermissionKey } from '../../lib/auth/permissions';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useTutorialStore } from '../tutorials/useTutorialStore';
import { TUTORIALS_DATA } from '../tutorials/tutorialsData';


export type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  hub: 'dashboard' | 'upfitters' | 'parts' | 'printed_parts' | 'graphics' | 'fast' | 'fabrication' | 'harness' | 'office' | 'sales' | 'facility' | 'settings' | 'help' | 'sop' | 'development' | 'safety';
  groupLabel?: string;
  permission?: PermissionKey;
  permissions?: PermissionKey[];
};

export const ITEMS: NavItem[] = [
  // Dashboard Hub
  { id: 'overview', label: 'My Jobs & Todos', icon: ClipboardList, hub: 'dashboard' },
  { id: 'time_details', label: 'Time Clock', icon: Clock, hub: 'dashboard' },
  { id: 'time_details_v3', label: 'Time Clock (v3)', icon: Clock, hub: 'dashboard' },
  { id: 'device_settings', label: 'Device Settings', icon: Settings, hub: 'dashboard' },
  { id: 'org_chart', label: 'Org Chart', icon: Users, hub: 'dashboard' },


  // Upfitters Dept
  { id: 'upfitters', label: 'Overview', icon: ClipboardList, hub: 'upfitters', permission: 'foreman.view' },
  { id: 'upfitters_kanban', label: 'Upfitters Kanban Board', icon: Layers, hub: 'upfitters', permission: 'foreman.view' },
  { id: 'foreman_todo', label: 'Foreman Todo List', icon: ClipboardList, hub: 'upfitters', permission: 'foreman.view' },
  { id: 'jobs_worksheet', label: 'Jobs Worksheet', icon: FileSpreadsheet, hub: 'upfitters', permission: 'jobs.view' },
  { id: 'job_schedule', label: 'Schedule Board', icon: Calendar, hub: 'upfitters', permission: 'jobs.view' },
  { id: 'staff_worksheet', label: 'Staff Worksheet', icon: FileSpreadsheet, hub: 'upfitters', permission: 'staff_worksheet.view' },
  { id: 'bay_worksheet', label: 'Bay Worksheet', icon: FileSpreadsheet, hub: 'upfitters', permission: 'bay_worksheet.view' },
  { id: 'morning_meeting', label: 'Morning Meeting', icon: Monitor, hub: 'upfitters', permission: 'foreman.view' },
  { id: 'weekly_meeting', label: 'Weekly Meeting Notes', icon: Printer, hub: 'upfitters', permission: 'foreman.view' },

  // Safety Dept
  { id: 'safety', label: 'Safety Overview', icon: ShieldCheck, hub: 'safety', permission: 'safety.view' },
  { id: 'safety_standards', label: 'OSHA Standards', icon: BookOpen, hub: 'safety', permission: 'safety.view' },
  { id: 'safety_sds', label: 'SDS Binders & HazMat', icon: FileSpreadsheet, hub: 'safety', permission: 'safety.view' },
  { id: 'safety_incidents', label: 'Incident & Near-Miss Log', icon: ClipboardList, hub: 'safety', permission: 'safety.view' },
  { id: 'safety_inspections', label: 'Audits & Checklists', icon: ShieldAlert, hub: 'safety', permission: 'safety.view' },
  { id: 'safety_training', label: 'Training & Certs', icon: GraduationCap, hub: 'safety', permission: 'safety.view' },

  // Parts Dept
  { id: 'parts', label: 'Overview', icon: Package, hub: 'parts', permission: 'parts.view' },
  // { id: 'items', label: 'Parts Library', icon: PackageOpen, hub: 'parts', permission: 'parts.view' },
  { id: 'parts_worksheet', label: 'Parts Request', icon: FileSpreadsheet, hub: 'parts', permissions: ['parts_worksheet.view', 'parts.manage'] },
  { id: 'jobs_worksheet', label: 'Jobs Worksheet', icon: FileSpreadsheet, hub: 'parts', permission: 'jobs.view' },
  // { id: 'package_intake', label: 'Package Intake', icon: Package, hub: 'parts', permission: 'parts.view' },
  // { id: 'part_request', label: 'Add Part / Request', icon: PackagePlus, hub: 'parts', permission: 'parts.view' },

  // Print Farm Dept
  { id: 'printed_parts', label: 'Overview', icon: Printer, hub: 'printed_parts', permission: 'printed_parts.view' },

  // Graphics Dept
  { id: 'graphics', label: 'Overview', icon: PenTool, hub: 'graphics', permission: 'graphics.view' },

  // F.A.S.T Dept
  { id: 'fast', label: 'Overview', icon: Activity, hub: 'fast', permission: 'fast.view' },

  // Fabrication Dept
  { id: 'fabrication', label: 'Overview', icon: Wrench, hub: 'fabrication', permission: 'fabrication.view' },

  // Harness Dept
  { id: 'harness', label: 'Overview', icon: Layers, hub: 'harness', permission: 'harness.view' },

  // Sales Dept
  { id: 'sales_pipeline', label: 'CRM', icon: Briefcase, hub: 'sales', permission: 'sales.view' },
  { id: 'sales_prospects', label: 'Prospects Directory', icon: Users, hub: 'sales', permission: 'sales.view' },
  { id: 'sales_activities', label: 'Meetings & Logs', icon: MessageSquare, hub: 'sales', permission: 'sales.view' },
  { id: 'sales_analytics', label: 'Sales Performance', icon: BarChart3, hub: 'sales', permission: 'sales.view' },

  // Office Dept (Main Office)
  { id: 'office', label: 'Office Board', icon: Building2, hub: 'office', permission: 'office.view' },
  { id: 'progress_digest', label: "Today's Progress", icon: Activity, hub: 'office', permissions: ['office.view', 'jobs.view', 'foreman.view'] },
  { id: 'jobs_worksheet', label: 'Jobs Worksheet', icon: FileSpreadsheet, hub: 'office', permission: 'jobs.view' },
  { id: 'job_schedule', label: 'Schedule Board', icon: Calendar, hub: 'office', permission: 'jobs.view' },
  { id: 'live_timeclock', label: 'Live Timeclock', icon: Clock, hub: 'office', permission: 'timeclock.view' },
  { id: 'timeclock', label: 'Payroll & Attendance', icon: Clock, hub: 'office', permission: 'timeclock.manage' },
  { id: 'staff', label: 'Staff Directory', icon: UserCog, hub: 'office', permission: 'staff.view' },
  // { id: 'performance', label: 'Leaderboard', icon: Trophy, hub: 'office', permission: 'performance.view' },
  { id: 'org_chart', label: 'Org Chart', icon: Users, hub: 'office', permissions: ['office.view', 'jobs.view', 'foreman.view'] },
  // { id: 'vehicle_intake', label: 'Vehicle Intake', icon: Car, hub: 'office', permission: 'vehicle_intake.use' },

  // Facility & Comm
  { id: 'jobs', label: 'Jobs', icon: Briefcase, hub: 'facility', permission: 'jobs.view' },
  { id: 'customers', label: 'Customers', icon: Users, hub: 'facility', permission: 'customers.view' },
  { id: 'vehicles', label: 'Vehicles', icon: Car, hub: 'facility', permission: 'vehicles.view' },
  { id: 'vendors', label: 'Vendors', icon: Handshake, hub: 'facility', permission: 'vendors.view' },
  { id: 'morning_meeting', label: 'Morning Meeting', icon: Monitor, hub: 'facility', permission: 'foreman.view' },
  { id: 'zones', label: 'Zones Config', icon: Layers, hub: 'facility', permission: 'facility.view' },
  { id: 'bay_monitor', label: 'Bay Monitor (TV)', icon: Layout, hub: 'facility', permission: 'facility.view' },
  { id: 'parking_monitor', label: 'Parking Key Monitor (TV)', icon: Layout, hub: 'facility', permission: 'facility.view' },
  { id: 'conference_monitor', label: 'Conference Room (TV)', icon: Monitor, hub: 'facility', permission: 'facility.view' },
  { id: 'timeclock_monitor', label: 'Timeclock Station (TV)', icon: QrCode, hub: 'facility', permission: 'timeclock.view' },
  { id: 'facility_maps', label: 'Facility Maps', icon: Map, hub: 'facility', permission: 'facility.view' },
  { id: 'canvases', label: 'Canvases Gallery', icon: Layout, hub: 'facility', permission: 'whiteboards.view' },
  { id: 'messages', label: 'Messages Feed', icon: MessageSquare, hub: 'facility', permission: 'communication.view' },
  { id: 'announcements', label: 'Announcements', icon: Megaphone, hub: 'facility', permission: 'communication.view' },
  { id: 'events', label: 'Events Calendar', icon: Calendar, hub: 'facility', permission: 'communication.view' },
  { id: 'feedback', label: 'Feedback & Bugs', icon: MessageSquare, hub: 'facility', permission: 'facility.view' },
  { id: 'org_chart', label: 'Org Chart', icon: Users, hub: 'facility', permissions: ['facility.view', 'jobs.view', 'communication.view'] },

  // Admin & Sync
  { id: 'departments', label: 'Departments Config', icon: Building2, hub: 'settings', permission: 'staff.view' },
  { id: 'settings', label: 'System Settings', icon: Settings, hub: 'settings', permission: 'settings.view' },
  { id: 'qb_sync_status', label: 'Live Sync Monitor', icon: Activity, hub: 'settings', permission: 'sync.view' },
  { id: 'qb_health_audit', label: 'Data Health Audit', icon: ShieldCheck, hub: 'settings', permission: 'sync.view' },
  { id: 'qb_customers', label: 'QB Customers', icon: RefreshCw, hub: 'settings', permission: 'sync.view' },
  { id: 'qb_jobs', label: 'QB Jobs', icon: RefreshCw, hub: 'settings', permission: 'sync.view' },
  { id: 'qb_items', label: 'QB Items', icon: RefreshCw, hub: 'settings', permission: 'sync.view' },
  { id: 'qb_invoices', label: 'QB Invoices', icon: RefreshCw, hub: 'settings', permission: 'sync.view' },
  { id: 'qb_pos', label: 'QB Purchase Orders', icon: RefreshCw, hub: 'settings', permission: 'sync.view' },

  { id: 'upfitters_kanban', label: 'Upfitters Kanban Board', icon: Layers, hub: 'development', permission: 'development.view' },
  { id: 'locations', label: 'Staff Locations', icon: MapPin, hub: 'development', permission: 'development.view' },
  { id: 'conference_control', label: 'TV Monitor Control', icon: Tv, hub: 'development', permission: 'development.view' },
  { id: 'overview_v3', label: 'Overview (v3)', icon: ClipboardList, hub: 'development', permission: 'development.view' },
  { id: 'qb_job_details', label: 'Job Hub (QB)', icon: Briefcase, hub: 'development', permission: 'development.view' },
  { id: 'staff_sheet', label: 'Staff Sheet (v3)', icon: FileSpreadsheet, hub: 'development', permission: 'development.view' },
  { id: 'vehicles_sheet', label: 'Vehicles Sheet (v3)', icon: FileSpreadsheet, hub: 'development', permission: 'development.view' },
  { id: 'jobs_sheet', label: 'Jobs Sheet (v3)', icon: FileSpreadsheet, hub: 'development', permission: 'development.view' },
  { id: 'tasks_sheet', label: 'Tasks Sheet (v3)', icon: FileSpreadsheet, hub: 'development', permission: 'development.view' },
  { id: 'wires_sheet', label: 'Wires Sheet (v3)', icon: FileSpreadsheet, hub: 'development', permission: 'development.view' },
  { id: 'telemetry_sheet', label: 'Telemetry & Trends (v3)', icon: TrendingUp, hub: 'development', permission: 'development.view' },

  // Help Hub
  { id: 'help_overview', label: 'All Tutorials', icon: GraduationCap, hub: 'help', groupLabel: 'Academy Catalog' },
  
  // Interactive Slide Decks
  { id: 'help_clocking_in_out', label: 'Clocking In/Out (Slides)', icon: LogIn, hub: 'help', groupLabel: 'Interactive Slide Decks' },
  { id: 'help_breaks_lunches', label: 'Breaks & Lunches (Slides)', icon: Pizza, hub: 'help', groupLabel: 'Interactive Slide Decks' },

  // Technician Portal
  { id: 'help_my_jobs_todos', label: 'My Jobs & Todos', icon: ClipboardList, hub: 'help', groupLabel: 'Technician Portal' },
  { id: 'help_time_details', label: 'Time Clock & Attendance', icon: Clock, hub: 'help', groupLabel: 'Technician Portal' },

  // Upfitters & Operations
  { id: 'help_jobs_worksheet', label: 'Jobs Worksheet', icon: FileSpreadsheet, hub: 'help', groupLabel: 'Upfitters & Operations' },
  { id: 'help_job_schedule', label: 'Schedule Board', icon: Calendar, hub: 'help', groupLabel: 'Upfitters & Operations' },
  { id: 'help_staff_worksheet', label: 'Staff Worksheet', icon: FileSpreadsheet, hub: 'help', groupLabel: 'Upfitters & Operations' },
  { id: 'help_bay_worksheet', label: 'Bay Worksheet', icon: FileSpreadsheet, hub: 'help', groupLabel: 'Upfitters & Operations' },
  { id: 'help_morning_meeting', label: 'Morning Meeting', icon: Monitor, hub: 'help', groupLabel: 'Upfitters & Operations' },

  // Management & Office
  { id: 'help_live_timeclock', label: 'Live Timeclock Monitor', icon: Clock, hub: 'help', groupLabel: 'Management & Office' },
  { id: 'help_timeclock', label: 'Payroll & Attendance', icon: Clock, hub: 'help', groupLabel: 'Management & Office' },
  { id: 'help_qr_hub', label: 'QR Label Hub', icon: QrCode, hub: 'help', groupLabel: 'Management & Office' },
  { id: 'help_audit', label: 'Weekly Audit', icon: ClipboardList, hub: 'help', groupLabel: 'Management & Office' },
  { id: 'help_org_chart', label: 'Business Org Chart', icon: Users, hub: 'help', groupLabel: 'Management & Office' },

  // System Settings
  { id: 'help_staff', label: 'Staff Directory', icon: UserCog, hub: 'help', groupLabel: 'System Settings' },
  { id: 'help_departments', label: 'Departments Config', icon: Building2, hub: 'help', groupLabel: 'System Settings' },
  { id: 'help_settings', label: 'System Settings', icon: Settings, hub: 'help', groupLabel: 'System Settings' },
  { id: 'help_qb_sync_status', label: 'QB Sync Monitor', icon: RefreshCw, hub: 'help', groupLabel: 'System Settings' },
  { id: 'help_help_system', label: 'Help System', icon: HelpCircle, hub: 'help', groupLabel: 'System Settings' },

  // SOP Hub
  { id: 'sop_overview', label: 'SOP Workflows', icon: BookOpen, hub: 'sop' },
];

export type HubType = {
  id: 'dashboard' | 'upfitters' | 'safety' | 'parts' | 'printed_parts' | 'graphics' | 'fast' | 'fabrication' | 'harness' | 'office' | 'sales' | 'facility' | 'settings' | 'help' | 'sop' | 'development';
  label: string;
  icon: React.ElementType;
};

export const HUBS: HubType[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'office', label: 'Main Office', icon: Building2 },
  { id: 'upfitters', label: 'Upfitters', icon: ClipboardList },
  { id: 'safety', label: 'Safety & OSHA', icon: ShieldAlert },
  { id: 'parts', label: 'Parts Dept', icon: Package },
  { id: 'printed_parts', label: 'Print Farm', icon: Printer },
  { id: 'graphics', label: 'Graphics', icon: PenTool },
  { id: 'fast', label: 'F.A.S.T', icon: Activity },
  { id: 'fabrication', label: 'Fabrication', icon: Wrench },
  { id: 'harness', label: 'Harness Dept', icon: Layers },
  { id: 'sales', label: 'Sales Dept', icon: TrendingUp },
  { id: 'facility', label: 'Facility', icon: Map },
  { id: 'help', label: 'Help Center', icon: HelpCircle },
  { id: 'sop', label: 'SOP Center', icon: Workflow },
  { id: 'settings', label: 'Admin & Sync', icon: Settings },
  { id: 'development', label: 'In Development', icon: Code },
];

export function BusinessSidebar({
  activeTab,
  setActiveTab,
  isOpen,
  setIsOpen,
  lastSync,
  activeSync
}: {
  activeTab: string;
  setActiveTab: (id: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  lastSync?: any;
  activeSync?: any;
}) {
  const { user, permissions, isSuperAdmin, impersonatedStaff } = useAuthStore();
  const navigate = useNavigate();
  const params = useParams();

  let tenantId = (isSuperAdmin && params.tenantId) ? params.tenantId : useAuthStore.getState().tenantId;

  // Retrieve custom white-label business logo
  const { data: business } = useQuery({
    queryKey: ['business', tenantId],
    queryFn: async () => {
      if (!tenantId || tenantId === 'GLOBAL') return null;
      const snap = await getDoc(doc(db, 'businesses', tenantId as string));
      return snap.exists() ? { id: snap.id, ...snap.data() } as { id: string; name: string; logoUrl?: string } : null;
    },
    enabled: !!tenantId && tenantId !== 'GLOBAL'
  });

  const SUPER_ADMIN_EMAILS = ['p.losey@saegrp.com', 'loseyp@gmail.com'];
  const canAccessGlobalAdmin = !impersonatedStaff && (isSuperAdmin || (user?.email && SUPER_ADMIN_EMAILS.includes(user.email)));

  // Sidebar Pinned (expanded) state
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    const saved = localStorage.getItem('upfitters_sidebar_pinned');
    return saved !== null ? saved === 'true' : true;
  });

  // Track the selected Hub (Tier 1)
  const [activeHub, setActiveHub] = useState<'dashboard' | 'upfitters' | 'safety' | 'parts' | 'printed_parts' | 'graphics' | 'fast' | 'fabrication' | 'harness' | 'office' | 'sales' | 'facility' | 'settings' | 'help' | 'sop' | 'development'>(() => {
    if (activeTab === 'job' || activeTab === 'task') return 'facility';
    if (activeTab === 'prospect' || activeTab === 'lead') return 'sales';
    if (activeTab?.startsWith('safety')) return 'safety';
    if (activeTab?.startsWith('help_')) return 'help';
    if (activeTab?.startsWith('sop_')) return 'sop';
    const activeItem = ITEMS.find(item => item.id === activeTab);
    return activeItem ? activeItem.hub : 'dashboard';
  });

  // Keep Tier 1 active hub synchronized when activeTab changes
  useEffect(() => {
    setActiveHub(current => {
      if (activeTab === 'job' || activeTab === 'task') return 'facility';
      if (activeTab === 'prospect' || activeTab === 'lead') return 'sales';
      if (activeTab?.startsWith('safety')) return 'safety';
      if (activeTab?.startsWith('help_')) return 'help';
      if (activeTab?.startsWith('sop_')) return 'sop';
      const currentHubItems = ITEMS.filter(item => item.hub === current);
      const isTabInCurrentHub = currentHubItems.some(item => item.id === activeTab);
      
      if (isTabInCurrentHub) {
        return current;
      }
      
      const activeItem = ITEMS.find(item => item.id === activeTab);
      return activeItem ? activeItem.hub : current;
    });
  }, [activeTab]);

  // Manage hover flyout menus when unpinned (collapsed)
  const [hoveredHub, setHoveredHub] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleMouseEnterHub = (hubId: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredHub(hubId);
  };

  const handleMouseLeaveHub = () => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredHub(null);
    }, 150) as unknown as number;
  };

  const handleMouseEnterFlyout = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  const handleMouseLeaveFlyout = () => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredHub(null);
    }, 150) as unknown as number;
  };

  const togglePin = () => {
    const newVal = !isPinned;
    setIsPinned(newVal);
    localStorage.setItem('upfitters_sidebar_pinned', String(newVal));
  };

  // Filter items based on active role permissions
  const visibleItems = ITEMS.filter(item => {
    if (item.hub === 'development' && !isSuperAdmin && !permissions['development.view']) return false;
    if (isSuperAdmin) return true;
    if (item.permissions) {
      return item.permissions.some(p => permissions[p]);
    }
    if (!item.permission) return true;
    return permissions[item.permission];
  });

  // Filter hubs so we only show them if they contain at least one visible item
  const visibleHubs = HUBS.filter(hub => {
    return visibleItems.some(item => item.hub === hub.id);
  });

  const getSubmenuItemsForHub = (hubId: string) => {
    return visibleItems.filter(item => item.hub === hubId);
  };

  const renderSubmenuContent = (hubId: HubType['id'], isOverlay = false) => {
    const hubItems = getSubmenuItemsForHub(hubId);

    // Extract unique groups
    const groups = Array.from(new Set(hubItems.map(item => item.groupLabel || 'Pages')));

    return (
      <div className="flex-1 overflow-y-auto no-scrollbar py-6 px-4">
        {/* Submenu Title */}
        <div className="px-3 mb-6 flex items-center justify-between">
          <h2 className="text-xs font-black text-white uppercase tracking-[0.25em]">
            {HUBS.find(h => h.id === hubId)?.label}
          </h2>
          {hubId === 'settings' && (
            <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-500/80 uppercase tracking-wider" title="Last successful sync">
              {activeSync ? (
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <RefreshCw className={`w-2.5 h-2.5 ${!lastSync ? 'animate-spin opacity-50' : ''}`} />
              )}
              {(() => {
                if (!lastSync) return '';
                const ts = lastSync.timestamp;
                const date = ts instanceof Date ? ts : ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : lastSync.createdAt ? new Date(lastSync.createdAt) : new Date();
                return date.toLocaleDateString() === new Date().toLocaleDateString()
                  ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
              })()}
            </div>
          )}
        </div>

        {/* Grouped Links */}
        <div className="space-y-6">
          {groups.map(group => {
            const groupItems = hubItems.filter(item => (item.groupLabel || 'Pages') === group);
            if (groupItems.length === 0) return null;

            return (
              <div key={group} className="space-y-1.5">
                {group !== 'Pages' && (
                  <h3 className="px-3 text-[9px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-2">
                    {group}
                  </h3>
                )}
                {groupItems.map(item => {
                  const isActive = activeTab === item.id || (item.id === 'jobs' && activeTab === 'job') || (item.id === 'tasks' && activeTab === 'task');
                  return (
                    <div key={item.id} className="flex items-center gap-1 w-full">
                      <button
                        onClick={() => {
                          setActiveTab(item.id);
                          if (isOverlay) {
                            setIsOpen(false);
                          }
                        }}
                        className={`flex-1 flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-all duration-200 active:scale-95 text-left min-w-0 ${isActive
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40"
                          }`}
                      >
                        <item.icon className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? "text-white" : "text-zinc-500"}`} />
                        <span className="text-xs font-semibold tracking-wide truncate">{item.label}</span>
                      </button>
                      {(() => {
                        const helpKey = item.id === 'overview' ? 'my_jobs_todos' : item.id;
                        const hasTutorial = item.hub !== 'help' && item.hub !== 'sop' && !!TUTORIALS_DATA[helpKey];
                        if (!hasTutorial) return null;
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              useTutorialStore.getState().openTutorial(helpKey);
                            }}
                            className={`p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-all shrink-0 cursor-pointer active:scale-90 ${
                              isActive ? 'text-zinc-300 hover:text-white' : ''
                            }`}
                            title={`How to use ${item.label}`}
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Super Admin Section */}
        {hubId === 'settings' && canAccessGlobalAdmin && (
          <div className="pt-5 mt-5 border-t border-zinc-800/80 space-y-2">
            <h3 className="px-3 text-[9px] font-extrabold text-rose-500 dark:text-rose-400 uppercase tracking-[0.18em] mb-2">
              Super Admin
            </h3>
            <button
              onClick={() => {
                navigate('/super-admin');
                if (isOverlay) setIsOpen(false);
              }}
              className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-rose-400 hover:text-rose-200 hover:bg-rose-950/20 transition-all duration-200 active:scale-95 text-left"
            >
              <ShieldCheck className="w-4 h-4 text-rose-500" />
              <span className="text-xs font-semibold tracking-wide">Platform Manager</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* ========================================================================= */}
      {/* 📱 MOBILE SIDEBAR DRAWER (SPLIT DOUBLE COLUMN)                          */}
      {/* ========================================================================= */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] bg-zinc-950/80 backdrop-blur-sm lg:hidden transition-opacity duration-300 animate-in fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-[100] w-[296px] bg-zinc-950 border-r border-zinc-800/60
        transform transition-transform duration-300 ease-in-out lg:hidden flex print-hidden no-print
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Tier 1 - Primary Mobile Hubs */}
        <div className="w-[72px] bg-zinc-950 border-r border-zinc-800/40 flex flex-col items-center py-6 gap-6 h-full select-none">
          {/* Custom Brand Logo */}
          <div className="w-10 h-10 flex items-center justify-center bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm relative overflow-hidden group shrink-0">
            {business?.logoUrl ? (
              <img src={business.logoUrl} className="w-6 h-6 object-contain" alt="Logo" />
            ) : (
              <span className="text-xs font-black text-indigo-400 tracking-tighter">UF</span>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center gap-2.5 w-full px-2 overflow-y-auto no-scrollbar">
            {visibleHubs.map(hub => {
              const isActive = activeHub === hub.id;
              return (
                <button
                  key={hub.id}
                  onClick={() => setActiveHub(hub.id)}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 relative group shrink-0 active:scale-90 ${isActive
                    ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/60"
                    }`}
                  title={hub.label}
                >
                  <hub.icon className="w-5 h-5 shrink-0" />
                  {isActive && <div className="absolute left-0 top-1/4 bottom-1/4 w-[2px] bg-indigo-500 rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tier 2 - Mobile Subpages Column */}
        <div className="flex-1 bg-zinc-900 flex flex-col h-full relative">
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          {renderSubmenuContent(activeHub, true)}
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 💻 DESKTOP DUAL SIDEBAR                                                   */}
      {/* ========================================================================= */}
      <aside className={`
        hidden lg:flex h-screen sticky top-0 z-40 select-none shrink-0 border-r border-zinc-900 bg-zinc-950 transition-all duration-300 print-hidden no-print
        ${isPinned ? "w-[316px]" : "w-[76px]"}
      `}>
        {/* Tier 1 Column (Slim Persistent Icons) */}
        <div className="w-[76px] h-full flex flex-col items-center py-6 border-r border-zinc-900 bg-zinc-950 relative">
          {/* Custom Brand Logo */}
          <div className="w-10 h-10 flex items-center justify-center bg-zinc-900/80 rounded-xl border border-zinc-800 shadow-sm relative overflow-hidden group mb-8 shrink-0">
            {business?.logoUrl ? (
              <img src={business.logoUrl} className="w-6 h-6 object-contain" alt="Logo" />
            ) : (
              <span className="text-xs font-black text-indigo-400 tracking-tighter">UF</span>
            )}
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>

          {/* Primary Hub Icons */}
          <div className="flex-1 flex flex-col items-center gap-3 w-full px-2 overflow-y-auto no-scrollbar">
            {visibleHubs.map(hub => {
              const isActive = activeHub === hub.id;
              return (
                <div
                  key={hub.id}
                  className="relative w-full flex justify-center shrink-0"
                  onMouseEnter={() => handleMouseEnterHub(hub.id)}
                  onMouseLeave={handleMouseLeaveHub}
                >
                  <button
                    onClick={() => {
                      setActiveHub(hub.id);
                      if (!isPinned) {
                        togglePin(); // auto expand when clicking an icon if collapsed
                      }
                    }}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 relative group active:scale-[0.93] ${isActive
                      ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner"
                      : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50"
                      }`}
                  >
                    <hub.icon className={`w-[22px] h-[22px] shrink-0 transition-transform duration-300 group-hover:scale-105 ${isActive ? 'text-indigo-400' : 'text-zinc-400 group-hover:text-zinc-100'}`} />
                    {isActive && <div className="absolute left-0 top-1/4 bottom-1/4 w-[3px] bg-indigo-500 rounded-full" />}
                  </button>

                  {/* Absolute Flyout Hover Menu (Only visible when unpinned/collapsed) */}
                  {!isPinned && hoveredHub === hub.id && (
                    <div
                      onMouseEnter={handleMouseEnterFlyout}
                      onMouseLeave={handleMouseLeaveFlyout}
                      className="absolute left-[72px] top-0 w-[240px] bg-zinc-900 border border-zinc-800 shadow-2xl rounded-2xl overflow-hidden py-1 z-[60] animate-in fade-in slide-in-from-left-3 duration-200"
                    >
                      {renderSubmenuContent(hub.id, false)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pin/Collapse toggle button in Slim Column if collapsed */}
          {!isPinned && (
            <button
              onClick={togglePin}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50 transition-all shrink-0 duration-200 mt-auto"
              title="Expand Navigation"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Tier 2 Column (Collapsible Details Pane) */}
        {isPinned && (
          <div className="flex-1 h-full bg-zinc-900/95 backdrop-blur-md flex flex-col relative animate-in fade-in slide-in-from-left-3 duration-300">
            {/* Collapse pin button inside Tier 2 top bar */}
            <button
              onClick={togglePin}
              className="absolute top-5 right-4 p-2 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800/40 transition-all duration-200"
              title="Collapse Navigation"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Sidebar Active Hub Content */}
            {renderSubmenuContent(activeHub, false)}
          </div>
        )}
      </aside>
    </>
  );
}
