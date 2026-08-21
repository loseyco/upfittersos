import React, { useState, useEffect } from 'react';
import { LayoutGrid, MoreHorizontal, X, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../lib/auth/store';
import { ITEMS, HUBS } from './BusinessSidebar';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tabId: string) => void;
  onOpenSidebar: () => void;
}

export function MobileBottomNav({ activeTab, setActiveTab, onOpenSidebar }: MobileBottomNavProps) {
  const { permissions, isSuperAdmin } = useAuthStore();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Close "More" sheet on active tab change
  useEffect(() => {
    setIsMoreOpen(false);
  }, [activeTab]);

  // Determine current active hub
  const activeHub = React.useMemo(() => {
    if (activeTab === 'job' || activeTab === 'task') return 'upfitters';
    if (activeTab === 'prospect' || activeTab === 'lead') return 'sales';
    if (activeTab?.startsWith('safety')) return 'safety';
    if (activeTab?.startsWith('help_')) return 'help';
    if (activeTab?.startsWith('sop_')) return 'sop';
    if (['time_sheet', 'yellowsheets', 'yellowsheet', 'live_timeclock', 'timeclock', 'payroll_audit_worksheet'].includes(activeTab)) return 'payroll';
    const activeItem = ITEMS.find(item => item.id === activeTab);
    return activeItem ? activeItem.hub : 'dashboard';
  }, [activeTab]);

  // Filter items visible to user based on permissions
  const visibleItems = React.useMemo(() => {
    return ITEMS.filter(item => {
      if (item.hub === 'development' && !isSuperAdmin && !permissions['development.view']) return false;
      if (isSuperAdmin) return true;
      if (item.permissions) {
        return item.permissions.some(p => permissions[p]);
      }
      if (!item.permission) return true;
      return permissions[item.permission];
    });
  }, [permissions, isSuperAdmin]);

  // Filter sub-menu items for current hub
  const currentHubItems = React.useMemo(() => {
    return visibleItems.filter(item => item.hub === activeHub);
  }, [visibleItems, activeHub]);

  const hubInfo = HUBS.find(h => h.id === activeHub);

  // If items count > 4, split into primary items (first 3) + overflow items
  const hasOverflow = currentHubItems.length > 4;
  
  // Ensure the active item is visible in primary bar if it's in overflow
  const primaryItems = React.useMemo(() => {
    if (!hasOverflow) return currentHubItems;
    const activeIndex = currentHubItems.findIndex(item => item.id === activeTab);
    if (activeIndex >= 3) {
      // Active item is in overflow, place it in position 3 so it's directly reachable
      const items = [...currentHubItems.slice(0, 2), currentHubItems[activeIndex]];
      return items;
    }
    return currentHubItems.slice(0, 3);
  }, [currentHubItems, hasOverflow, activeTab]);

  const isMoreActive = hasOverflow && currentHubItems.findIndex(item => item.id === activeTab) >= 3;

  return (
    <>
      <nav 
        aria-label="Mobile Navigation Bar"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-955/95 dark:bg-zinc-955/95 backdrop-blur-xl border-t border-zinc-800/80 shadow-2xl print-hidden select-none pb-safe"
      >
        <div className="flex items-center h-16 px-1.5 gap-1 justify-between max-w-lg mx-auto">
          {/* Main Departments Drawer Toggle Button */}
          <button
            type="button"
            onClick={onOpenSidebar}
            className="flex flex-col items-center justify-center shrink-0 min-w-[54px] px-1.5 py-1 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/50 active:scale-95 transition-all duration-150"
          >
            <div className="relative p-1 rounded-lg bg-zinc-800/80 text-zinc-300">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-medium tracking-tight mt-0.5 text-zinc-400">
              Depts
            </span>
          </button>

          {/* Vertical Divider */}
          <div className="h-7 w-px bg-zinc-800/80 shrink-0 mx-0.5" />

          {/* Primary Sub-menu Items for Current Department */}
          <div className="flex items-center flex-1 justify-around min-w-0 gap-1 py-1">
            {primaryItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex flex-col items-center justify-center flex-1 min-w-0 px-1 py-1 rounded-xl transition-all duration-200 active:scale-95 ${
                    isActive
                      ? 'text-indigo-400 bg-indigo-500/15 border border-indigo-500/30 shadow-sm shadow-indigo-500/10'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 transition-transform duration-200 ${isActive ? 'scale-110 text-indigo-400' : ''}`} />
                  <span className={`text-[10px] tracking-tight truncate max-w-full mt-0.5 px-0.5 ${
                    isActive ? 'font-bold text-indigo-300' : 'font-normal'
                  }`}>
                    {item.label}
                  </span>
                </button>
              );
            })}

            {/* "More..." Button if there are > 4 items */}
            {hasOverflow && (
              <button
                type="button"
                onClick={() => setIsMoreOpen(true)}
                className={`flex flex-col items-center justify-center flex-1 min-w-0 px-1 py-1 rounded-xl transition-all duration-200 active:scale-95 ${
                  isMoreActive && !isMoreOpen
                    ? 'text-indigo-400 bg-indigo-500/15 border border-indigo-500/30'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 border border-transparent'
                }`}
              >
                <div className="relative">
                  <MoreHorizontal className="w-4 h-4" />
                </div>
                <span className="text-[10px] tracking-tight truncate max-w-full mt-0.5 font-normal">
                  More ({currentHubItems.length - 3})
                </span>
              </button>
            )}

            {currentHubItems.length === 0 && (
              <div className="text-[11px] text-zinc-500 px-3 truncate">
                {hubInfo?.label || 'Dashboard'}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Slide-Up Bottom Sheet for Overflow Items */}
      {isMoreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="fixed inset-0" 
            onClick={() => setIsMoreOpen(false)} 
            aria-hidden="true"
          />

          <div className="relative z-10 bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-5 shadow-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-200 pb-safe">
            {/* Grab Handle */}
            <div className="w-12 h-1.5 bg-zinc-700/60 rounded-full mx-auto mb-4" />

            {/* Sheet Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-indigo-400">
                  {hubInfo?.label || 'Department Navigation'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                  {currentHubItems.length} items
                </span>
              </div>
              <button
                onClick={() => setIsMoreOpen(false)}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of All Sub-Items in Department */}
            <div className="overflow-y-auto no-scrollbar space-y-1 py-1">
              {currentHubItems.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMoreOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all ${
                      isActive
                        ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 font-bold'
                        : 'bg-zinc-800/40 hover:bg-zinc-800 border border-transparent text-zinc-200 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${isActive ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-sm">{item.label}</span>
                    </div>
                    <ChevronRight className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-zinc-600'}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
