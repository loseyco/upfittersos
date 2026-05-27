import React from 'react';
import { 
  Home, Users, Briefcase, CheckSquare, Layers, Map, 
  Layout, MessageSquare, Megaphone, Calendar, RefreshCw, X, Settings, UserCog, Car, Package,
  Clock, Trophy, ClipboardList, PenTool, Wrench, Building2, Activity, Printer, PackageOpen, ShieldCheck, BarChart3,
  Handshake, Monitor, FileSpreadsheet, QrCode
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth/store';
import type { PermissionKey } from '../../lib/auth/permissions';

export type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  group: 'boards' | 'data' | 'facility' | 'comm' | 'sync' | 'config';
  permission?: PermissionKey;
};

const ITEMS: NavItem[] = [
  { id: 'overview', label: 'My Dashboard', icon: Home, group: 'boards' },
  { id: 'quickdesk', label: 'QuickDesk (Classic)', icon: Monitor, group: 'boards', permission: 'quickdesk.view' },
  { id: 'mission_control', label: 'Mission Control', icon: Layout, group: 'boards', permission: 'mission_control.view' },
  { id: 'upfitters', label: 'Upfitters', icon: ClipboardList, group: 'boards', permission: 'foreman.view' },
  { id: 'morning_meeting', label: 'Morning Meeting', icon: Monitor, group: 'boards', permission: 'foreman.view' },
  { id: 'parts', label: 'Parts Dept', icon: Package, group: 'boards', permission: 'parts.view' },
  { id: 'printed_parts', label: 'Print Farm', icon: Printer, group: 'boards', permission: 'printed_parts.view' },
  { id: 'graphics', label: 'Graphics', icon: PenTool, group: 'boards', permission: 'graphics.view' },
  { id: 'fast', label: 'F.A.S.T', icon: Wrench, group: 'boards', permission: 'fast.view' },
  { id: 'fabrication', label: 'Fabrication', icon: Wrench, group: 'boards', permission: 'fabrication.view' },
  { id: 'office', label: 'Office', icon: Building2, group: 'boards', permission: 'office.view' },
  { id: 'live_timeclock', label: 'Live Timeclock', icon: Activity, group: 'boards', permission: 'timeclock.view' },
  { id: 'performance', label: 'Leaderboard', icon: Trophy, group: 'boards', permission: 'performance.view' },
  { id: 'reports', label: 'Reports', icon: BarChart3, group: 'boards', permission: 'reports.view' },
  { id: 'job_schedule', label: 'Schedule', icon: Calendar, group: 'boards', permission: 'jobs.view' },
  
  { id: 'jobs', label: 'Jobs', icon: Briefcase, group: 'data', permission: 'jobs.view' },
  { id: 'staff_worksheet', label: 'Staff Worksheet', icon: FileSpreadsheet, group: 'data', permission: 'staff_worksheet.view' },
  { id: 'bay_worksheet', label: 'Bay Worksheet', icon: FileSpreadsheet, group: 'data', permission: 'bay_worksheet.view' },
  { id: 'tasks', label: 'Todos', icon: CheckSquare, group: 'data', permission: 'tasks.view' },
  { id: 'vendors', label: 'Vendors & Services', icon: Handshake, group: 'data', permission: 'vendors.view' },
  { id: 'timeclock', label: 'Timeclock', icon: Clock, group: 'data', permission: 'timeclock.manage' },
  { id: 'schedule', label: 'Staff Roster', icon: Calendar, group: 'data', permission: 'reports.view' },
  { id: 'vehicles', label: 'Vehicles', icon: Car, group: 'data', permission: 'vehicles.view' },
  { id: 'qr_hub', label: 'QR Label Hub', icon: QrCode, group: 'data', permission: 'vehicles.view' },
  { id: 'customers', label: 'Customers', icon: Users, group: 'data', permission: 'customers.view' },
  { id: 'items', label: 'Parts Library', icon: PackageOpen, group: 'data', permission: 'parts.view' },
  
  { id: 'zones', label: 'Zones', icon: Layers, group: 'facility', permission: 'facility.view' },
  { id: 'bay_monitor', label: 'Bay Monitor (TV)', icon: Layout, group: 'facility', permission: 'facility.view' },
  { id: 'facility_maps', label: 'Facility Maps', icon: Map, group: 'facility', permission: 'facility.view' },
  { id: 'canvases', label: 'Canvases', icon: Layout, group: 'facility', permission: 'whiteboards.view' },
  { id: 'feedback', label: 'Feedback & Bugs', icon: MessageSquare, group: 'facility', permission: 'facility.view' },
  { id: 'messages', label: 'Messages', icon: MessageSquare, group: 'comm', permission: 'communication.view' },
  { id: 'announcements', label: 'Announcements', icon: Megaphone, group: 'comm', permission: 'communication.view' },
  { id: 'events', label: 'Events', icon: Calendar, group: 'comm', permission: 'communication.view' },
  { id: 'staff', label: 'Staff', icon: UserCog, group: 'config', permission: 'staff.view' },
  { id: 'departments', label: 'Departments', icon: Building2, group: 'config', permission: 'staff.view' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'config', permission: 'settings.view' },
  { id: 'qb_sync_status', label: 'Live Sync Monitor', icon: Activity, group: 'sync', permission: 'sync.view' },
  { id: 'qb_customers', label: 'QB Customers', icon: RefreshCw, group: 'sync', permission: 'sync.view' },
  { id: 'qb_jobs', label: 'QB Jobs', icon: RefreshCw, group: 'sync', permission: 'sync.view' },
  { id: 'qb_items', label: 'QB Items', icon: RefreshCw, group: 'sync', permission: 'sync.view' },
  { id: 'qb_invoices', label: 'QB Invoices', icon: RefreshCw, group: 'sync', permission: 'sync.view' },
  { id: 'qb_pos', label: 'QB POs', icon: RefreshCw, group: 'sync', permission: 'sync.view' },
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
  const groups = {
    boards: 'Control Boards',
    data: 'Data Management',
    facility: 'Facility',
    comm: 'Communication',
    config: 'Configuration',
    sync: 'Sync Data (Raw)'
  };

  const { user, permissions, isSuperAdmin, impersonatedStaff } = useAuthStore();
  const navigate = useNavigate();

  const SUPER_ADMIN_EMAILS = ['p.losey@saegrp.com', 'loseyp@gmail.com'];
  const canAccessGlobalAdmin = !impersonatedStaff && (isSuperAdmin || (user?.email && SUPER_ADMIN_EMAILS.includes(user.email)));

  const NavContent = () => (
    <div className="flex flex-col h-full py-6 px-4 space-y-8 overflow-y-auto no-scrollbar">
      {Object.entries(groups).map(([groupId, groupLabel]) => {
        const visibleItems = ITEMS.filter(i => {
          if (i.group !== groupId) return false;
          if (isSuperAdmin) return true;
          if (!i.permission) return true;
          return permissions[i.permission];
        });

        if (visibleItems.length === 0) return null;

        return (
          <div key={groupId} className="space-y-2">
            <div className="px-4 flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">
                {groupLabel}
              </h3>
              {groupId === 'sync' && (
                <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-500/80 uppercase tracking-wider" title="Last successful sync">
                  {activeSync ? (
                    <>
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      <span>Syncing...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className={`w-2.5 h-2.5 ${!lastSync ? 'animate-spin opacity-50' : ''}`} />
                      {(() => {
                        if (!lastSync) return 'Pending...';
                        const ts = lastSync.timestamp;
                        const date = ts instanceof Date ? ts : ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : lastSync.createdAt ? new Date(lastSync.createdAt) : new Date();
                        // Just show time if today, else date
                        return date.toLocaleDateString() === new Date().toLocaleDateString()
                          ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1">
              {visibleItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 active:scale-95 ${
                    activeTab === item.id
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${activeTab === item.id ? "text-white" : "text-zinc-400"}`} />
                  <span className="text-sm font-semibold tracking-tight">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {/* Super Admin Section */}
      {canAccessGlobalAdmin && (
        <div className="pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          <h3 className="px-4 text-[10px] font-bold text-rose-500 dark:text-rose-400 uppercase tracking-[0.2em] mb-4">
            Super Admin
          </h3>
          <div className="space-y-1">
            <button
              onClick={() => navigate('/super-admin')}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all duration-200 active:scale-95"
            >
              <ShieldCheck className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-tight">Platform Manager</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 
        transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:block
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex items-center justify-between px-8 py-6 lg:hidden border-b border-zinc-100 dark:border-zinc-900">
          <span className="text-lg font-bold tracking-tight dark:text-white">Menu</span>
          <button onClick={() => setIsOpen(false)} className="p-2 -mr-2 text-zinc-500">
            <X className="w-6 h-6" />
          </button>
        </div>
        <NavContent />
      </aside>
    </>
  );
}
