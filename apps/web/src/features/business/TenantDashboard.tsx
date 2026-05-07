import React from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { TopNav } from '../../components/layout/TopNav';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, query, collection, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Building2, Menu, RefreshCw, ShieldAlert, X } from 'lucide-react';
import type { PermissionKey } from '../../lib/auth/permissions';
import { useState } from 'react';
import { GenericDataGrid } from './GenericDataGrid';
import { ForemanDashboard } from './ForemanDashboard';
import { BusinessEvents } from './BusinessEvents';
import { useParams, useNavigate } from 'react-router-dom';
import { BusinessSidebar } from './BusinessSidebar';

import { MissionControl } from './MissionControl';
import { UserMissionControl } from './UserMissionControl';
import { usePageTitle } from '../../lib/hooks/usePageTitle';
import { PartsMissionControl } from './PartsMissionControl';

import { BusinessSettings } from './BusinessSettings';
import { ZonesManager } from './ZonesManager';
import { VehiclesManager } from './VehiclesManager';
import { StaffManager } from './StaffManager';
import { ReportsManager } from './ReportsManager';
import { StaffPerformance } from './StaffPerformance';
import { JobsManager } from './JobsManager';
import { CustomersManager } from './CustomersManager';
import { TimeClockBar } from '../timeclock/TimeClockBar';
import { TimeclockAdmin } from '../timeclock/TimeclockAdmin';
import { LiveTimeclockBoard } from '../timeclock/LiveTimeclockBoard';
import { StaffRoster } from './StaffRoster';
import { PullToRefresh } from '../../components/layout/PullToRefresh';

export function TenantDashboard() {
  usePageTitle('Dashboard');
  const { tenantId, impersonatedStaff, stopImpersonating } = useAuthStore();
  const navigate = useNavigate();
  const params = useParams();
  
  const splat = params['*'] || '';
  const pathParts = splat.split('/').filter(Boolean);
  
  const activeTab = pathParts[0] || 'overview';
  const eventId = pathParts[1] || null;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleTabClick = (tabId: string) => {
    navigate(`/business/${tenantId}/${tabId}`);
    setIsSidebarOpen(false);
  };



  const getSource = (row: any) => {
    const isQB = row.tags?.includes('QuickBooks') || 
                 row.notes?.includes('Imported via QBWC') || 
                 !!row.ListID || !!row.qb_ListID || 
                 !!row.quickbooksId;
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
        isQB ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20'
      }`}>
        {isQB ? 'QuickBooks' : 'Native'}
      </span>
    );
  };

  const itemColumns = [
    { key: 'name', label: 'Item Name' },
    { key: 'sku', label: 'SKU' },
    { 
      key: 'price', 
      label: 'Price',
      format: (val: any) => {
        const num = Number(val || 0);
        return <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">${num.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>;
      }
    },
    { 
      key: 'quantityOnHand', 
      label: 'Stock',
      format: (val: any) => <span className={`font-bold ${Number(val) <= 0 ? 'text-red-500' : 'text-zinc-600 dark:text-zinc-400'}`}>{val ?? 0}</span>
    },
    { key: 'source', label: 'Source', format: (_: any, row: any) => getSource(row) }
  ];

  const { data: business, isLoading } = useQuery({
    queryKey: ['tenant-dashboard-business', tenantId],
    queryFn: async () => {
      if (!tenantId || tenantId === 'GLOBAL') return null;
      const snap = await getDoc(doc(db, 'businesses', tenantId));
      if (!snap.exists()) return null;
      const data = snap.data();
      const qbData = Object.entries(data)
        .filter(([key]) => key.startsWith('qb_'))
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {} as Record<string, any>);
      return { id: snap.id, name: data.name, qbData, rawData: data } as any;
    },
    enabled: !!tenantId && tenantId !== 'GLOBAL'
  });

  const { data: lastSync } = useQuery({
    queryKey: ['last-qb-sync', tenantId],
    queryFn: async () => {
      if (!tenantId || tenantId === 'GLOBAL') return null;
      const q = query(
        collection(db, 'businesses', tenantId, 'activity_feed'),
        where('type', '==', 'qbwc_sync'),
        orderBy('timestamp', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return snap.docs[0].data();
    },
    enabled: !!tenantId && tenantId !== 'GLOBAL'
  });

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors overflow-hidden">
      <PullToRefresh onRefresh={() => window.location.reload()} />
      <BusinessSidebar 
        activeTab={activeTab} 
        setActiveTab={handleTabClick} 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TimeClockBar />
        <TopNav />
        
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-zinc-500 active:scale-95 transition-transform"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="font-bold tracking-tight truncate max-w-[200px]">
              {business?.name || 'Dashboard'}
            </h1>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar">
          {impersonatedStaff && (
            <div className="mb-8 bg-emerald-600 text-white rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-emerald-500/20 animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-80">Impersonation Mode</p>
                  <p className="text-sm font-bold">Viewing platform as <span className="underline decoration-2 underline-offset-4">{impersonatedStaff.name}</span></p>
                </div>
              </div>
              <button 
                onClick={stopImpersonating}
                className="px-4 py-2 bg-white text-emerald-600 rounded-xl text-xs font-black hover:bg-emerald-50 transition-all flex items-center gap-2"
              >
                <X className="w-3.5 h-3.5" />
                Stop Viewing As
              </button>
            </div>
          )}
          {!isLoading && (
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="hidden md:flex w-14 h-14 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl items-center justify-center shadow-sm">
                  <Building2 className="w-7 h-7 text-indigo-500" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">
                    {activeTab === 'overview' ? 'My Dashboard' : activeTab === 'mission_control' ? business?.name : activeTab === 'foreman' ? 'Shop' : activeTab.replace('qb_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </h1>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {activeTab === 'overview' ? 'Personal Workflow' : activeTab === 'mission_control' ? 'Tenant Overview' : `Business ${activeTab.includes('qb_') ? 'Sync' : 'Operational'} Data`}
                  </p>
                  {activeTab === 'mission_control' && lastSync && (
                    <div className="flex items-center gap-1.5 mt-2 text-zinc-400">
                      <RefreshCw className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        QuickBooks Synced: {(() => {
                          const ts = lastSync.timestamp;
                          const date = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : new Date(lastSync.createdAt);
                          return date.toLocaleString();
                        })()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              

            </div>
          )}

          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {activeTab === 'overview' && (
              <UserMissionControl tenantId={tenantId!} />
            )}

            {activeTab === 'mission_control' && (
              <PermissionGate permission="mission_control.view">
                <MissionControl tenantId={tenantId!} onTabChange={handleTabClick} />
              </PermissionGate>
            )}

            {activeTab === 'foreman' && (
              <ForemanDashboard tenantId={tenantId!} onTabChange={handleTabClick} />
            )}

            {activeTab === 'settings' && (
              <PermissionGate permission="settings.view">
                <BusinessSettings tenantId={tenantId!} initialData={business?.rawData} />
              </PermissionGate>
            )}

            {activeTab === 'staff' && (
              <PermissionGate permission="staff.view">
                <StaffManager tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'reports' && (
              <PermissionGate permission="reports.view">
                <ReportsManager tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'performance' && (
              <PermissionGate permission="reports.view">
                <StaffPerformance tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'schedule' && (
              <PermissionGate permission="reports.view">
                <StaffRoster tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'timeclock' && (
              <PermissionGate permission="timeclock.manage">
                <TimeclockAdmin tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'live_timeclock' && (
              <LiveTimeclockBoard tenantId={tenantId!} />
            )}

            {activeTab === 'parts' && (
              <PermissionGate permission="parts.view">
                <PartsMissionControl />
              </PermissionGate>
            )}

            {activeTab === 'graphics' && (
              <div className="p-12 text-center text-zinc-500 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <h2 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-white">Graphics Department</h2>
                <p>Mission Control Board coming soon...</p>
              </div>
            )}

            {activeTab === 'fabrication' && (
              <div className="p-12 text-center text-zinc-500 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <h2 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-white">F.A.S.T Fabrication</h2>
                <p>Mission Control Board coming soon...</p>
              </div>
            )}

            {activeTab === 'office' && (
              <div className="p-12 text-center text-zinc-500 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <h2 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-white">Office</h2>
                <p>Mission Control Board coming soon...</p>
              </div>
            )}

            {activeTab === 'customers' && (
              <PermissionGate permission="customers.view">
                <CustomersManager tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'jobs' && (
              <PermissionGate permission="jobs.view">
                <JobsManager tenantId={tenantId!} jobId={pathParts[1]} />
              </PermissionGate>
            )}

            {activeTab === 'items' && (
              <PermissionGate permission="parts.view">
                <GenericDataGrid 
                  collectionPath={`businesses/${tenantId}/inventory_items`} 
                  title="Upfitters Inventory" 
                  columns={itemColumns}
                />
              </PermissionGate>
            )}

            {activeTab === 'vehicles' && (
              <PermissionGate permission="vehicles.view">
                <VehiclesManager tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'zones' && (
              <PermissionGate permission="zones.view">
                <ZonesManager tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'tasks' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/tasks`} title="Tasks" />
            )}

            {activeTab === 'facility_maps' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/facility_maps`} title="Facility Maps" />
            )}

            {activeTab === 'canvases' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/canvases`} title="Canvases" />
            )}

            {activeTab === 'messages' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/messages`} title="Messages" />
            )}

            {activeTab === 'announcements' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/announcements`} title="Announcements" />
            )}

            {activeTab === 'qb_customers' && (
              <GenericDataGrid 
                collectionPath={`businesses/${tenantId}/qb_jobs`} 
                title="QuickBooks Raw Customers" 
                localFilter={(item) => {
                  const sl = Number(item.qb_Sublevel ?? item.Sublevel ?? 0);
                  return sl <= 1;
                }}
              />
            )}

            {activeTab === 'qb_jobs' && (
              <GenericDataGrid 
                collectionPath={`businesses/${tenantId}/qb_jobs`} 
                title="QuickBooks Raw Jobs" 
                localFilter={(item) => {
                  const sl = Number(item.qb_Sublevel ?? item.Sublevel ?? 0);
                  return sl >= 2;
                }}
              />
            )}

            {activeTab === 'qb_items' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/qb_items`} title="QuickBooks Raw Items" />
            )}

            {activeTab === 'qb_invoices' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/qb_invoices`} title="QuickBooks Raw Invoices" />
            )}

            {activeTab === 'qb_pos' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/qb_purchase_orders`} title="QuickBooks Raw Purchase Orders" />
            )}

            {activeTab === 'events' && (
              <BusinessEvents tenantId={tenantId as string} eventId={eventId} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function PermissionGate({ 
  permission, 
  children 
}: { 
  permission?: PermissionKey, 
  children: React.ReactNode 
}) {
  const { permissions, isSuperAdmin } = useAuthStore();
  if (isSuperAdmin) return <>{children}</>;
  if (!permission) return <>{children}</>;
  if (permissions[permission]) return <>{children}</>;
  return (
    <div className="p-12 text-center animate-in fade-in duration-500">
      <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <ShieldAlert className="w-10 h-10 text-rose-500" />
      </div>
      <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-2">Access Restricted</h3>
      <p className="text-zinc-500 max-w-sm mx-auto">
        Your account does not have the required permissions to access this department. Please contact your administrator for elevated access.
      </p>
    </div>
  );
}

