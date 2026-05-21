import React from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { TopNav } from '../../components/layout/TopNav';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, query, collection, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Building2, Menu, RefreshCw, ShieldAlert, X } from 'lucide-react';
import type { PermissionKey } from '../../lib/auth/permissions';
import { useState, useEffect } from 'react';
import { GenericDataGrid } from './GenericDataGrid';
import { ForemanDashboard } from './ForemanDashboard';
import { BusinessEvents } from './BusinessEvents';
import { useParams, useNavigate } from 'react-router-dom';
import { BusinessSidebar } from './BusinessSidebar';
import { OfficeDashboard } from './OfficeDashboard';
import { GlobalJobModal } from './GlobalJobModal';

import { MissionControl } from './MissionControl';
import { UserMissionControl } from './UserMissionControl';
import { usePageTitle } from '../../lib/hooks/usePageTitle';
import { PartsMissionControl } from './PartsMissionControl';
import { PrintedPartsMissionControl } from './PrintedPartsMissionControl';
import { PartsManager } from './PartsManager';
import { TasksManager } from './TasksManager';
import { ScheduleBoard } from './ScheduleBoard';

import { BusinessSettings } from './BusinessSettings';
import { ZonesManager } from './ZonesManager';
import { VehiclesManager } from './VehiclesManager';
import { StaffManager, DepartmentsPage } from './StaffManager';
import { ReportsManager } from './ReportsManager';
import { StaffPerformance } from './StaffPerformance';
import { JobsManager } from './JobsManager';
import { CustomersManager } from './CustomersManager';
import { TimeClockBar } from '../timeclock/TimeClockBar';
import { TimeclockAdmin } from '../timeclock/TimeclockAdmin';
import { LiveTimeclockBoard } from '../timeclock/LiveTimeclockBoard';
import { StaffRoster } from './StaffRoster';
import { PullToRefresh } from '../../components/layout/PullToRefresh';
import { DepartmentDashboard } from './DepartmentDashboard';
import { BayMonitor } from './BayMonitor';
import { QuickBooksSyncPage } from './QuickBooksSyncPage';
import { JobDetailPage } from './JobDetailPage';
import { JobEditPage } from './JobEditPage';
import { TaskDetailPage } from './TaskDetailPage';
import { VendorsManager } from './VendorsManager';
import { FeedbackReports } from '../super-admin/FeedbackReports';

export function TenantDashboard() {
  const params = useParams();
  
  const splat = params['*'] || '';
  const pathParts = splat.split('/').filter(Boolean);
  
  const activeTab = pathParts[0] || 'overview';
  const eventId = pathParts[1] || null;

  const titleMap: Record<string, string> = {
    overview: 'My Dashboard',
    mission_control: 'Mission Control',
    upfitters: 'Upfitters',
    settings: 'Settings',
    staff: 'Staff',
    reports: 'Reports',
    performance: 'Performance',
    schedule: 'Staff Roster',
    job_schedule: 'Schedule',
    timeclock: 'Timeclock',
    live_timeclock: 'Live Timeclock',
    parts: 'Parts Dept',
    printed_parts: 'Print Farm',
    items: 'Parts Library',
    office: 'Office',
    customers: 'Customers',
    jobs: 'Jobs',
    vehicles: 'Vehicles',
    zones: 'Zones',
    bay_monitor: 'Bay Monitor',
    job: 'Job Detail',
    vendors: 'Vendors & Services',
    feedback: 'Feedback & Bugs'
  };

  const pageTitle = titleMap[activeTab] || activeTab.replace('qb_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  
  usePageTitle(pageTitle);

  const { tenantId: storeTenantId, impersonatedStaff, stopImpersonating, isSuperAdmin } = useAuthStore();
  const urlTenantId = params.tenantId;
  const tenantId = (isSuperAdmin && urlTenantId) ? urlTenantId : storeTenantId;

  const navigate = useNavigate();
  
  // Legacy Redirect: foreman -> upfitters
  useEffect(() => {
    if (activeTab === 'foreman') {
      navigate(`/business/${tenantId}/upfitters`, { replace: true });
    }
  }, [activeTab, navigate, tenantId]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleTabClick = (tabId: string, state?: any) => {
    navigate(`/business/${tenantId}/${tabId}`, { state });
    setIsSidebarOpen(false);
  };



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
      const snap = await getDoc(doc(db, 'businesses', tenantId));
      if (!snap.exists()) return null;
      const data = snap.data();
      if (!data.lastQbSyncTime) return null;
      return { timestamp: new Date(data.lastQbSyncTime) };
    },
    refetchInterval: 30000, // Refetch every 30 seconds to keep the sync time up to date
    enabled: !!tenantId && tenantId !== 'GLOBAL'
  });

  const { data: activeSync } = useQuery({
    queryKey: ['qbwc-active-sync', tenantId],
    queryFn: async () => {
      if (!tenantId || tenantId === 'GLOBAL') return null;
      const q = query(
        collection(db, 'qbwc_queue'),
        where('tenantId', '==', tenantId),
        where('status', 'in', ['pending', 'processing']),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return snap.docs[0].data();
    },
    refetchInterval: 5000,
    enabled: !!tenantId && tenantId !== 'GLOBAL'
  });

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors overflow-hidden">
      <PullToRefresh onRefresh={() => window.location.reload()} />
      {activeTab !== 'bay_monitor' && (
        <BusinessSidebar 
          activeTab={activeTab} 
          setActiveTab={handleTabClick} 
          isOpen={isSidebarOpen} 
          setIsOpen={setIsSidebarOpen} 
          lastSync={lastSync}
          activeSync={activeSync}
        />
      )}

      <GlobalJobModal tenantId={tenantId!} />

      <div className="flex-1 flex flex-col min-w-0">
        {activeTab !== 'bay_monitor' && <TimeClockBar />}
        {activeTab !== 'bay_monitor' && <TopNav />}
        
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

        <main className={`flex-1 overflow-y-auto ${activeTab === 'bay_monitor' ? 'p-0' : 'p-4 md:p-8'} no-scrollbar`}>
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
          {!isLoading && activeTab !== 'bay_monitor' && activeTab !== 'job_schedule' && (
            <div className="flex items-center justify-between mb-4 md:mb-8">
              <div className="flex items-center gap-4">
                <div className="hidden md:flex w-14 h-14 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl items-center justify-center shadow-sm">
                  <Building2 className="w-7 h-7 text-indigo-500" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">
                    {activeTab === 'overview' ? 'My Dashboard' : activeTab === 'mission_control' ? business?.name : activeTab === 'upfitters' ? 'Upfitters' : activeTab.replace('qb_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </h1>
                  {activeTab !== 'overview' && (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {activeTab === 'mission_control' ? 'Tenant Overview' : `Business ${activeTab.includes('qb_') ? 'Sync' : 'Operational'} Data`}
                    </p>
                  )}
                  {activeTab === 'mission_control' && activeSync && (
                    <div className="flex items-center gap-2 mt-2">
                      <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-500 animate-pulse">
                        Sync in Progress... ({activeSync.action.replace('Query', '')})
                      </span>
                    </div>
                  )}
                  {activeTab === 'mission_control' && !activeSync && lastSync && (
                    <div className="flex items-center gap-1.5 mt-2 text-zinc-400">
                      <RefreshCw className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        QuickBooks Synced: {(() => {
                          const ts = lastSync.timestamp as any;
                          const date = ts instanceof Date ? ts : ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : new Date((lastSync as any).createdAt);
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

            {activeTab === 'upfitters' && (
              <PermissionGate permission="foreman.view">
                <ForemanDashboard tenantId={tenantId!} onTabChange={handleTabClick} />
              </PermissionGate>
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

            {activeTab === 'departments' && (
              <PermissionGate permission="staff.view">
                <DepartmentsPage tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'reports' && (
              <PermissionGate permission="reports.view">
                <ReportsManager tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'performance' && (
              <PermissionGate permission="performance.view">
                <StaffPerformance tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'schedule' && (
              <PermissionGate permission="reports.view">
                <StaffRoster tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'job_schedule' && (
              <PermissionGate permission="jobs.view">
                <ScheduleBoard tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'timeclock' && (
              <PermissionGate permission="timeclock.manage">
                <TimeclockAdmin tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'live_timeclock' && (
              <PermissionGate permission="timeclock.view">
                <LiveTimeclockBoard tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'parts' && (
              <PermissionGate permission="parts.view">
                <PartsMissionControl />
              </PermissionGate>
            )}

            {activeTab === 'printed_parts' && (
              <PermissionGate permission="printed_parts.view">
                <PrintedPartsMissionControl />
              </PermissionGate>
            )}

            {activeTab === 'graphics' && (
              <PermissionGate permission="graphics.view">
                <DepartmentDashboard 
                  tenantId={tenantId!} 
                  departmentName="Graphics" 
                  tagFilter="Graphics" 
                />
              </PermissionGate>
            )}

            {activeTab === 'fast' && (
              <PermissionGate permission="fast.view">
                <DepartmentDashboard 
                  tenantId={tenantId!} 
                  departmentName="F.A.S.T" 
                  tagFilter="F.A.S.T" 
                />
              </PermissionGate>
            )}

            {activeTab === 'fabrication' && (
              <PermissionGate permission="fabrication.view">
                <DepartmentDashboard 
                  tenantId={tenantId!} 
                  departmentName="Fabrication" 
                  tagFilter="Fabrication" 
                />
              </PermissionGate>
            )}

            {activeTab === 'office' && (
              <PermissionGate permission="office.view">
                <OfficeDashboard tenantId={tenantId!} />
              </PermissionGate>
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

            {activeTab === 'job' && !pathParts[2] && pathParts[1] !== 'create' && (
              <JobDetailPage tenantId={tenantId!} />
            )}

            {activeTab === 'job' && (pathParts[2] === 'edit' || pathParts[1] === 'create') && (
              <PermissionGate permission="jobs.manage">
                <JobEditPage tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'task' && pathParts[1] && pathParts[2] && (
              <TaskDetailPage tenantId={tenantId!} />
            )}

            {activeTab === 'items' && (
              <PermissionGate permission="parts.view">
                <PartsManager tenantId={tenantId!} />
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

            {activeTab === 'bay_monitor' && (
              <PermissionGate permission="facility.view">
                <BayMonitor tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'tasks' && (
              <PermissionGate permission="tasks.view">
                <TasksManager tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'facility_maps' && (
              <PermissionGate permission="facility.view">
                <GenericDataGrid collectionPath={`businesses/${tenantId}/facility_maps`} title="Facility Maps" />
              </PermissionGate>
            )}

            {activeTab === 'canvases' && (
              <PermissionGate permission="facility.view">
                <GenericDataGrid collectionPath={`businesses/${tenantId}/canvases`} title="Canvases" />
              </PermissionGate>
            )}

            {activeTab === 'messages' && (
              <PermissionGate permission="communication.view">
                <GenericDataGrid collectionPath={`businesses/${tenantId}/messages`} title="Messages" />
              </PermissionGate>
            )}

            {activeTab === 'announcements' && (
              <PermissionGate permission="communication.view">
                <GenericDataGrid collectionPath={`businesses/${tenantId}/announcements`} title="Announcements" />
              </PermissionGate>
            )}

            {activeTab === 'vendors' && (
              <PermissionGate permission="vendors.view">
                <VendorsManager 
                  tenantId={tenantId!} 
                  subView={pathParts[1]}
                  viewId={pathParts[2]}
                />
              </PermissionGate>
            )}

            {activeTab === 'feedback' && (
              <PermissionGate permission="facility.view">
                <FeedbackReports tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'qb_sync_status' && (
              <QuickBooksSyncPage tenantId={tenantId!} />
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

            {activeTab === 'qb_employees' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/qb_employees`} title="QuickBooks Raw Employees" />
            )}

            {activeTab === 'qb_vendors' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/qb_vendors`} title="QuickBooks Raw Vendors" />
            )}

            {activeTab === 'qb_time_tracking' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/qb_time_tracking`} title="QuickBooks Raw Time Tracking" />
            )}

            {activeTab === 'events' && (
              <PermissionGate permission="communication.view">
                <BusinessEvents tenantId={tenantId as string} eventId={eventId} />
              </PermissionGate>
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

