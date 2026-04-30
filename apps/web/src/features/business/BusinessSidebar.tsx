import React from 'react';
import { 
  Home, Users, Briefcase, Box, CheckSquare, Layers, Map, 
  Layout, MessageSquare, Megaphone, Calendar, RefreshCw, X, Settings, UserCog, Car
} from 'lucide-react';

export type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  group: 'ops' | 'facility' | 'comm' | 'sync' | 'config';
};

const ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: Home, group: 'ops' },
  { id: 'customers', label: 'Customers', icon: Users, group: 'ops' },
  { id: 'jobs', label: 'Jobs', icon: Briefcase, group: 'ops' },
  { id: 'vehicles', label: 'Vehicles', icon: Car, group: 'ops' },
  { id: 'items', label: 'Inventory', icon: Box, group: 'ops' },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare, group: 'ops' },
  { id: 'shipments', label: 'Shipments', icon: Box, group: 'ops' },
  { id: 'zones', label: 'Zones', icon: Layers, group: 'facility' },
  { id: 'facility_maps', label: 'Facility Maps', icon: Map, group: 'facility' },
  { id: 'canvases', label: 'Canvases', icon: Layout, group: 'facility' },
  { id: 'messages', label: 'Messages', icon: MessageSquare, group: 'comm' },
  { id: 'announcements', label: 'Announcements', icon: Megaphone, group: 'comm' },
  { id: 'events', label: 'Events', icon: Calendar, group: 'comm' },
  { id: 'staff', label: 'Staff', icon: UserCog, group: 'config' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'config' },
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
    ops: 'Operations',
    facility: 'Facility',
    comm: 'Communication',
    config: 'Configuration',
    sync: 'Sync Data (Raw)'
  };

  const NavContent = () => (
    <div className="flex flex-col h-full py-6 px-4 space-y-8 overflow-y-auto no-scrollbar">
      {Object.entries(groups).map(([groupId, groupLabel]) => (
        <div key={groupId} className="space-y-2">
          <h3 className="px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-4">
            {groupLabel}
          </h3>
          <div className="space-y-1">
            {ITEMS.filter(i => i.group === groupId).map(item => (
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
      ))}
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
        transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:block
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
