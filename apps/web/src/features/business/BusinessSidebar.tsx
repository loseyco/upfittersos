import React, { useState, useEffect, useRef } from 'react';
import {
  Home, Users, Briefcase, Layers, Map,
  Layout, MessageSquare, Megaphone, Calendar, RefreshCw, X, Settings, UserCog, Car, Package,
  ClipboardList, PenTool, Wrench, Building2, Activity, Printer, ShieldCheck, ShieldAlert,
  Handshake, Monitor, FileSpreadsheet, QrCode, ChevronLeft, ChevronRight, Clock, Info,
  GraduationCap, LogIn, Pizza, BookOpen, TrendingUp, BarChart3,
  Code, MapPin, Tv, Table
} from 'lucide-react';
import { useParams } from 'react-router-dom';
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
  { id: 'device_settings', label: 'Device Settings', icon: Settings, hub: 'dashboard' },
  { id: 'org_chart', label: 'Org Chart', icon: Users, hub: 'dashboard' },


  // Upfitters Dept
  { id: 'upfitters', label: 'Overview', icon: ClipboardList, hub: 'upfitters', permission: 'foreman.view' },
  { id: 'jobs_worksheet', label: 'Jobs Worksheet', icon: FileSpreadsheet, hub: 'upfitters', permission: 'jobs.view' },
  { id: 'bay_worksheet', label: 'Bay Worksheet', icon: FileSpreadsheet, hub: 'upfitters', permission: 'bay_worksheet.view' },

  // Safety Dept (In Development)
  { id: 'safety', label: 'Safety Overview', icon: ShieldCheck, hub: 'development', groupLabel: 'Safety & OSHA', permission: 'safety.view' },
  { id: 'safety_standards', label: 'OSHA Standards', icon: BookOpen, hub: 'development', groupLabel: 'Safety & OSHA', permission: 'safety.view' },
  { id: 'safety_sds', label: 'SDS Binders & HazMat', icon: FileSpreadsheet, hub: 'development', groupLabel: 'Safety & OSHA', permission: 'safety.view' },
  { id: 'safety_incidents', label: 'Incident & Near-Miss Log', icon: ClipboardList, hub: 'development', groupLabel: 'Safety & OSHA', permission: 'safety.view' },
  { id: 'safety_inspections', label: 'Audits & Checklists', icon: ShieldAlert, hub: 'development', groupLabel: 'Safety & OSHA', permission: 'safety.view' },
  { id: 'safety_training', label: 'Training & Certs', icon: GraduationCap, hub: 'development', groupLabel: 'Safety & OSHA', permission: 'safety.view' },

  // Parts Dept
  { id: 'parts', label: 'Overview', icon: Package, hub: 'parts', permission: 'parts.view' },
  { id: 'parts_worksheet', label: 'Parts Request', icon: FileSpreadsheet, hub: 'parts', permissions: ['parts_worksheet.view', 'parts.manage'] },
  { id: 'jobs_worksheet', label: 'Jobs Worksheet', icon: FileSpreadsheet, hub: 'parts', permission: 'jobs.view' },

  // Print Farm (In Development)
  { id: 'printed_parts', label: 'Print Farm Overview', icon: Printer, hub: 'development', groupLabel: 'Print Farm', permission: 'printed_parts.view' },

  // Graphics (In Development)
  { id: 'graphics', label: 'Graphics Overview', icon: PenTool, hub: 'development', groupLabel: 'Graphics Dept', permission: 'graphics.view' },

  // F.A.S.T (In Development)
  { id: 'fast', label: 'F.A.S.T Overview', icon: Activity, hub: 'development', groupLabel: 'F.A.S.T Dept', permission: 'fast.view' },

  // Fabrication (In Development)
  { id: 'fabrication', label: 'Fabrication Overview', icon: Wrench, hub: 'development', groupLabel: 'Fabrication Dept', permission: 'fabrication.view' },

  // Harness (In Development)
  { id: 'harness', label: 'Harness Overview', icon: Layers, hub: 'development', groupLabel: 'Harness Dept', permission: 'harness.view' },

  // Sales Dept (In Development)
  { id: 'sales_pipeline', label: 'Sales CRM', icon: Briefcase, hub: 'development', groupLabel: 'Sales Dept', permission: 'sales.view' },
  { id: 'sales_prospects', label: 'Prospects Directory', icon: Users, hub: 'development', groupLabel: 'Sales Dept', permission: 'sales.view' },
  { id: 'sales_activities', label: 'Meetings & Logs', icon: MessageSquare, hub: 'development', groupLabel: 'Sales Dept', permission: 'sales.view' },
  { id: 'sales_analytics', label: 'Sales Performance', icon: BarChart3, hub: 'development', groupLabel: 'Sales Dept', permission: 'sales.view' },

  // Office Dept (Main Office)
  { id: 'daily_log', label: 'Daily Operations Log', icon: Table, hub: 'office', permissions: ['office.view', 'jobs.view', 'foreman.view'] },
  { id: 'progress_digest', label: "Today's Progress", icon: Activity, hub: 'office', permissions: ['office.view', 'jobs.view', 'foreman.view'] },
  { id: 'jobs_worksheet', label: 'Jobs Worksheet', icon: FileSpreadsheet, hub: 'office', permission: 'jobs.view' },
  { id: 'live_timeclock', label: 'Live Timeclock', icon: Clock, hub: 'office', permission: 'timeclock.view' },
  { id: 'timeclock', label: 'Payroll & Attendance', icon: Clock, hub: 'office', permission: 'timeclock.manage' },
  { id: 'staff', label: 'Staff Directory', icon: UserCog, hub: 'office', permission: 'staff.view' },
  { id: 'org_chart', label: 'Org Chart', icon: Users, hub: 'office', permissions: ['office.view', 'jobs.view', 'foreman.view'] },

  // Facility & Comm (TV Monitors & Zones Config)
  { id: 'zones', label: 'Zones Config', icon: Layers, hub: 'facility', permission: 'facility.view' },
  { id: 'bay_monitor', label: 'Bay Monitor (TV)', icon: Layout, hub: 'facility', permission: 'facility.view' },
  { id: 'parking_monitor', label: 'Parking Key Monitor (TV)', icon: Layout, hub: 'facility', permission: 'facility.view' },
  { id: 'conference_monitor', label: 'Conference Room (TV)', icon: Monitor, hub: 'facility', permission: 'facility.view' },
  { id: 'timeclock_monitor', label: 'Timeclock Station (TV)', icon: QrCode, hub: 'facility', permission: 'timeclock.view' },

  // Facility Items (In Development)
  { id: 'jobs', label: 'Jobs Directory', icon: Briefcase, hub: 'development', groupLabel: 'Facility & Operations', permission: 'jobs.view' },
  { id: 'customers', label: 'Customers Directory', icon: Users, hub: 'development', groupLabel: 'Facility & Operations', permission: 'customers.view' },
  { id: 'vehicles', label: 'Vehicles Directory', icon: Car, hub: 'development', groupLabel: 'Facility & Operations', permission: 'vehicles.view' },
  { id: 'vendors', label: 'Vendors Directory', icon: Handshake, hub: 'development', groupLabel: 'Facility & Operations', permission: 'vendors.view' },
  { id: 'facility_maps', label: 'Facility Maps', icon: Map, hub: 'development', groupLabel: 'Facility & Operations', permission: 'facility.view' },
  { id: 'canvases', label: 'Canvases Gallery', icon: Layout, hub: 'development', groupLabel: 'Facility & Operations', permission: 'whiteboards.view' },
  { id: 'messages', label: 'Messages Feed', icon: MessageSquare, hub: 'development', groupLabel: 'Communication & Events', permission: 'communication.view' },
  { id: 'announcements', label: 'Announcements', icon: Megaphone, hub: 'development', groupLabel: 'Communication & Events', permission: 'communication.view' },
  { id: 'events', label: 'Events Calendar', icon: Calendar, hub: 'development', groupLabel: 'Communication & Events', permission: 'communication.view' },
  { id: 'feedback', label: 'Feedback & Dev Roadmap', icon: MessageSquare, hub: 'development', groupLabel: 'Communication & Events', permission: 'facility.view' },

  // Admin & Sync
  { id: 'staff', label: 'Staff Directory', icon: UserCog, hub: 'settings', permission: 'staff.view' },
  { id: 'departments', label: 'Departments Config', icon: Building2, hub: 'settings', permission: 'staff.view' },
  { id: 'settings', label: 'System Settings', icon: Settings, hub: 'settings', permission: 'settings.view' },
  { id: 'qb_sync_status', label: 'Live Sync Monitor', icon: Activity, hub: 'settings', permission: 'sync.view' },
  { id: 'qb_health_audit', label: 'Data Health Audit', icon: ShieldCheck, hub: 'settings', permission: 'sync.view' },

  // QB Raw Tables (In Development)
  { id: 'qb_customers', label: 'QB Customers Raw', icon: RefreshCw, hub: 'development', groupLabel: 'QuickBooks Raw Tables', permission: 'sync.view' },
  { id: 'qb_jobs', label: 'QB Jobs Raw', icon: RefreshCw, hub: 'development', groupLabel: 'QuickBooks Raw Tables', permission: 'sync.view' },
  { id: 'qb_items', label: 'QB Items Raw', icon: RefreshCw, hub: 'development', groupLabel: 'QuickBooks Raw Tables', permission: 'sync.view' },
  { id: 'qb_invoices', label: 'QB Invoices Raw', icon: RefreshCw, hub: 'development', groupLabel: 'QuickBooks Raw Tables', permission: 'sync.view' },
  { id: 'qb_pos', label: 'QB Purchase Orders Raw', icon: RefreshCw, hub: 'development', groupLabel: 'QuickBooks Raw Tables', permission: 'sync.view' },

  // Development Hub (In Development)
  { id: 'page_catalog', label: 'App Pages & Access Directory', icon: Code, hub: 'development', groupLabel: 'Analytics & Telemetry', permission: 'development.view' },
  { id: 'page_analytics', label: 'Page Views & Usage Analytics', icon: BarChart3, hub: 'development', groupLabel: 'Analytics & Telemetry', permission: 'development.view' },
  { id: 'telemetry_sheet', label: 'Telemetry & Trends (v3)', icon: TrendingUp, hub: 'development', groupLabel: 'Analytics & Telemetry', permission: 'development.view' },
  { id: 'upfitters_kanban', label: 'Upfitters Kanban Board', icon: Layers, hub: 'development', groupLabel: 'Operations & Boards', permission: 'development.view' },
  { id: 'office', label: 'Office Board', icon: Building2, hub: 'development', groupLabel: 'Operations & Boards', permission: 'development.view' },
  { id: 'job_schedule', label: 'Schedule Board', icon: Calendar, hub: 'development', groupLabel: 'Operations & Boards', permission: 'development.view' },
  { id: 'foreman_todo', label: 'Foreman Todo List', icon: ClipboardList, hub: 'development', groupLabel: 'Operations & Boards', permission: 'development.view' },
  { id: 'staff_worksheet', label: 'Staff Worksheet', icon: FileSpreadsheet, hub: 'development', groupLabel: 'Operations & Boards', permission: 'development.view' },
  { id: 'morning_meeting', label: 'Morning Meeting', icon: Monitor, hub: 'development', groupLabel: 'Operations & Boards', permission: 'development.view' },
  { id: 'weekly_meeting', label: 'Weekly Meeting Notes', icon: Printer, hub: 'development', groupLabel: 'Operations & Boards', permission: 'development.view' },
  { id: 'locations', label: 'Staff Locations', icon: MapPin, hub: 'development', groupLabel: 'Tools & Utilities', permission: 'development.view' },
  { id: 'staff_sitemap', label: 'Staff Site Map (Live)', icon: Users, hub: 'development', groupLabel: 'Tools & Utilities', permission: 'staff.view' },
  { id: 'conference_control', label: 'TV Monitor Control', icon: Tv, hub: 'development', groupLabel: 'Tools & Utilities', permission: 'development.view' },
  { id: 'qb_job_details', label: 'Job Hub (QB)', icon: Briefcase, hub: 'development', groupLabel: 'Tools & Utilities', permission: 'development.view' },
  { id: 'staff_sheet', label: 'Staff Sheet (v3)', icon: FileSpreadsheet, hub: 'development', groupLabel: 'Sheets (v3)', permission: 'development.view' },
  { id: 'time_sheet', label: 'Time Logs Sheet (v3)', icon: Clock, hub: 'development', groupLabel: 'Sheets (v3)', permission: 'development.view' },
  { id: 'vehicles_sheet', label: 'Vehicles Sheet (v3)', icon: FileSpreadsheet, hub: 'development', groupLabel: 'Sheets (v3)', permission: 'development.view' },
  { id: 'tasks_sheet', label: 'Tasks Sheet (v3)', icon: FileSpreadsheet, hub: 'development', groupLabel: 'Sheets (v3)', permission: 'development.view' },
  { id: 'wires_sheet', label: 'Wires Sheet (v3)', icon: FileSpreadsheet, hub: 'development', groupLabel: 'Sheets (v3)', permission: 'development.view' },
  { id: 'progress_digest_v3', label: 'Progress Digest (v3)', icon: Activity, hub: 'development', groupLabel: 'Sheets (v3)', permission: 'development.view' },

  // Help Hub (In Development)
  { id: 'help_overview', label: 'All Tutorials', icon: GraduationCap, hub: 'development', groupLabel: 'Help & Academy' },
  { id: 'help_clocking_in_out', label: 'Clocking In/Out (Slides)', icon: LogIn, hub: 'development', groupLabel: 'Help & Academy' },
  { id: 'help_breaks_lunches', label: 'Breaks & Lunches (Slides)', icon: Pizza, hub: 'development', groupLabel: 'Help & Academy' },

  // SOP Hub (In Development)
  { id: 'sop_overview', label: 'SOP Workflows', icon: BookOpen, hub: 'development', groupLabel: 'SOP Center' },
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
  { id: 'parts', label: 'Parts Dept', icon: Package },
  { id: 'facility', label: 'Facility', icon: Map },
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
  const { permissions, isSuperAdmin } = useAuthStore();
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
