import React from 'react';
import { 
  Home, Users, Briefcase, CheckSquare, Layers, Map, 
  Layout, MessageSquare, Megaphone, Calendar, RefreshCw, X, Settings, UserCog, Car, Package,
  Clock, Trophy, ClipboardList, PenTool, Wrench, Building2, Activity, Printer, PackageOpen
} from 'lucide-react';
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
  { id: 'mission_control', label: 'Mission Control', icon: Layout, group: 'boards', permission: 'mission_control.view' },
  { id: 'foreman', label: 'Upfitters', icon: ClipboardList, group: 'boards' },
  { id: 'parts', label: 'Parts Dept', icon: Package, group: 'boards', permission: 'parts.view' },
  { id: 'printed_parts', label: 'Print Farm', icon: Printer, group: 'boards', permission: 'parts.view' },
  { id: 'graphics', label: 'Graphics', icon: PenTool, group: 'boards' },
  { id: 'fabrication', label: 'F.A.S.T Fabrication', icon: Wrench, group: 'boards' },
  { id: 'office', label: 'Office', icon: Building2, group: 'boards' },
  { id: 'live_timeclock', label: 'Live Timeclock', icon: Activity, group: 'boards' },
  { id: 'performance', label: 'Leaderboard', icon: Trophy, group: 'boards', permission: 'reports.view' },
  
  { id: 'jobs', label: 'Jobs', icon: Briefcase, group: 'data', permission: 'jobs.view' },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare, group: 'data' },
  { id: 'timeclock', label: 'Timeclock', icon: Clock, group: 'data', permission: 'timeclock.manage' },
  { id: 'schedule', label: 'Staff Roster', icon: Calendar, group: 'data', permission: 'reports.view' },
  { id: 'vehicles', label: 'Vehicles', icon: Car, group: 'data', permission: 'vehicles.view' },
  { id: 'customers', label: 'Customers', icon: Users, group: 'data', permission: 'customers.view' },
  { id: 'items', label: 'Parts Library', icon: PackageOpen, group: 'data', permission: 'parts.view' },
  
  { id: 'zones', label: 'Zones', icon: Layers, group: 'facility', permission: 'zones.view' },
  { id: 'facility_maps', label: 'Facility Maps', icon: Map, group: 'facility' },
  { id: 'canvases', label: 'Canvases', icon: Layout, group: 'facility' },
  { id: 'messages', label: 'Messages', icon: MessageSquare, group: 'comm' },
  { id: 'announcements', label: 'Announcements', icon: Megaphone, group: 'comm' },
  { id: 'events', label: 'Events', icon: Calendar, group: 'comm' },
  { id: 'staff', label: 'Staff', icon: UserCog, group: 'config', permission: 'staff.view' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'config', permission: 'settings.view' },
  { id: 'qb_customers', label: 'QB Customers', icon: RefreshCw, group: 'sync' },
  { id: 'qb_jobs', label: 'QB Jobs', icon: RefreshCw, group: 'sync' },
  { id: 'qb_items', label: 'QB Items', icon: RefreshCw, group: 'sync' },
  { id: 'qb_invoices', label: 'QB Invoices', icon: RefreshCw, group: 'sync' },
  { id: 'qb_pos', label: 'QB POs', icon: RefreshCw, group: 'sync' },
];

export function BusinessSidebar({ 
  activeTab, 
  setActiveTab,
  isOpen,
  setIsOpen
}: { 
  activeTab: string; 
  setActiveTab: (id: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}) {
  const groups = {
    boards: 'Control Boards',
    data: 'Data Management',
    facility: 'Facility',
    comm: 'Communication',
    config: 'Configuration',
    sync: 'Sync Data (Raw)'
  };

  const { permissions, isSuperAdmin } = useAuthStore();

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
            <h3 className="px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-4">
              {groupLabel}
            </h3>
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
