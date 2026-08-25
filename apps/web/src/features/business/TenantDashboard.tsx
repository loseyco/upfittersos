import React from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { TopNav } from '../../components/layout/TopNav';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, query, collection, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Building2, RefreshCw, ShieldAlert, X } from 'lucide-react';
import type { PermissionKey } from '../../lib/auth/permissions';
import { useState, useEffect } from 'react';
import { GenericDataGrid } from './GenericDataGrid';
import { BusinessEvents } from './BusinessEvents';
import { useParams, useNavigate } from 'react-router-dom';
import { BusinessSidebar } from './BusinessSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { OfficeDashboard } from './OfficeDashboard';
import { GlobalJobModal } from './GlobalJobModal';
import { DepartmentOverview } from './DepartmentOverview';
import { UpfittersDashboard } from './UpfittersDashboard';
import { UpfittersKanbanBoard } from './UpfittersKanbanBoard';

import { MissionControl } from './MissionControl';
import { UserMissionControl } from './UserMissionControl';
import { OverviewV3 } from './OverviewV3';
import { TimeDetailsV3 } from './TimeDetailsV3';
import { PackageIntakeModal } from './PackageIntakeModal';
import { VehicleIntakeModal } from './VehicleIntakeModal';
import { PartFormModal } from './PartFormModal';
import { FeedbackModal } from '../../components/FeedbackModal';
import { HarnessMissionControl } from './HarnessMissionControl';
import { usePageTitle } from '../../lib/hooks/usePageTitle';
import { PartsMissionControl } from './PartsMissionControl';
import { PrintedPartsMissionControl } from './PrintedPartsMissionControl';
import { PartsManager } from './PartsManager';
import { TasksManager } from './TasksManager';
import { ScheduleBoard } from './ScheduleBoard';
import { PermissionMatrixPortal } from '../super-admin/PermissionMatrixPortal';
import { ControlBoard } from './ControlBoard';

import { BusinessSettings } from './BusinessSettings';
import { ZonesManager } from './ZonesManager';
import { VehiclesManager } from './VehiclesManager';
import { VehicleDetailPage } from './VehicleDetailPage';
import { QRManager } from './QRManager';
import { StaffManager, DepartmentsPage } from './StaffManager';
import { StaffSitemapInspector } from './StaffSitemapInspector';
import { AppPageDirectory } from './AppPageDirectory';
import { StaffProfilePage } from './StaffProfilePage';
import { OrgChartPage } from './OrgChartPage';
import { ReportsManager } from './ReportsManager';
import { AuditManager } from './AuditManager';
import { PayrollAuditWorksheet } from './PayrollAuditWorksheet';
import { StaffPerformance } from './StaffPerformance';
import { JobsManager } from './JobsManager';
import { CustomersManager } from './CustomersManager';
import { TimeClockBar } from '../timeclock/TimeClockBar';
import { TimeclockAdmin } from '../timeclock/TimeclockAdmin';
import { LiveTimeclockBoard } from '../timeclock/LiveTimeclockBoard';
import { StaffRoster } from './StaffRoster';
import { PullToRefresh } from '../../components/layout/PullToRefresh';
import { DepartmentDashboard } from './DepartmentDashboard';
import { ConferenceControlPanel } from './ConferenceControlPanel';
import { UnifiedMonitor } from './UnifiedMonitor';
import { QuickBooksSyncPage } from './QuickBooksSyncPage';
import { QuickBooksAudit } from './QuickBooksAudit';
import { QBJobDetailsPlaceholder } from './QBJobDetailsPlaceholder';
import { JobDetailPage } from './JobDetailPage';
import { JobDetailPageV3 } from './JobDetailPageV3';
import { JobEfficiencyPage } from './JobEfficiencyPage';
import { JobEditPage } from './JobEditPage';
import { JobQCPage } from './JobQCPage';
import { JobIntakeFormPage } from './JobIntakeFormPage';
import { TaskDetailPage } from './TaskDetailPage';
import { VendorsManager } from './VendorsManager';
import { FeedbackReports } from '../super-admin/FeedbackReports';
import { QuickDesk } from './QuickDesk';
import { MorningMeetingBoard } from './MorningMeetingBoard';
import { CanvasGalleryTab } from './CanvasGalleryTab';
import { WorkflowCanvasTab } from './WorkflowCanvasTab';
import { StaffWorksheet } from './StaffWorksheet';
import { BayWorksheet } from './BayWorksheet';
import { PartsWorksheet } from './PartsWorksheet';
import { ProgressDigest } from './ProgressDigest';
import { WeeklyMeetingNotes } from './WeeklyMeetingNotes';
import { TuesdayMeetingReport } from './TuesdayMeetingReport';
import { ForemanTodoList } from './ForemanTodoList';
import { TutorialModal } from '../tutorials/TutorialModal';
import { HelpCenter } from '../tutorials/HelpCenter';
import { SOPCenter } from '../sops/SOPCenter';
import { SalesCrmManager } from './sales/SalesCrmManager';
import { ProspectDetailPage } from './sales/ProspectDetailPage';
import { StaffLocationsPage } from './StaffLocationsPage';
import { StaffSpreadsheet } from './StaffSpreadsheet';
import { TimeclockSpreadsheet } from './TimeclockSpreadsheet';
import { VehicleSpreadsheet } from './VehicleSpreadsheet';
import { JobSpreadsheet } from './JobSpreadsheet';
import { TasksSpreadsheet } from './TasksSpreadsheet';
import { WiresSpreadsheet } from './WiresSpreadsheet';
import { TelemetryDashboard } from './TelemetryDashboard';
import { ProgressDigestV3 } from './ProgressDigestV3';
import { DailyLogV3 } from './DailyLogV3';
import { YellowSheets } from './YellowSheets';
import { TaskCompletionAudit } from './TaskCompletionAudit';
import { WireScanPage } from './WireScanPage';
import { PageAnalyticsDashboard } from './PageAnalyticsDashboard';
import { usePageAnalytics } from '../../lib/telemetry/usePageAnalytics';
import { SafetyManager } from './safety/SafetyManager';
import { getCurrentLocation, updateStaffLastLocation } from '../../lib/locationService';
import { UpfittersDesktopOS } from '../desktop/UpfittersDesktopOS';
import { OfficeJobsOverviewSheet } from './OfficeJobsOverviewSheet';

export function TenantDashboard() {
  const params = useParams();
  
  const splat = params['*'] || '';
  const pathParts = splat.split('/').filter(Boolean);
  
  const activeTab = pathParts[0] || 'overview';
  const eventId = pathParts[1] || null;

  const titleMap: Record<string, string> = {
    overview: 'My Jobs & Todos',
    overview_classic: 'My Jobs & Todos (Classic)',
    locations: 'Staff Locations',
    staff_sheet: 'Staff Sheet (v3)',
    time_sheet: 'Time Clock Sheet',
    vehicles_sheet: 'Vehicles Sheet (v3)',
    jobs_sheet: 'Jobs Sheet (v3)',
    tasks_sheet: 'Tasks Sheet (v3)',
    wires_sheet: 'Wires Sheet (v3)',
    progress_digest_v3: 'Progress Digest (v3)',
    daily_log: 'Daily Operations Log',
    yellowsheets: 'Yellow Sheets',
    yellowsheet: 'Yellow Sheets',
    page_analytics: 'Page Views & Usage Analytics',
    telemetry_sheet: 'Telemetry & Trends (v3)',
    wire_scan: 'Wire Wall Scanner',
    time_details: 'Time Clock',
    device_settings: 'Device Settings',
    quickdesk: 'QuickDesk (Classic)',
    mission_control: 'Mission Control',
    upfitters: 'Upfitters',
    morning_meeting: 'Morning Meeting Board',
    settings: 'Settings',
    staff: 'Staff',
    org_chart: 'Org Chart',
    reports: 'Reports',
    performance: 'Performance',
    schedule: 'Staff Roster',
    job_schedule: 'Schedule',
    control_board: 'Control Board',
    timeclock: 'Payroll & Attendance',
    live_timeclock: 'Live Timeclock',
    parts: 'Parts Dept',
    printed_parts: 'Print Farm',
    harness: 'Harness Dept',
    sales: 'CRM',
    sales_pipeline: 'CRM',
    sales_prospects: 'Prospects Directory',
    sales_activities: 'Meetings & Logs',
    sales_analytics: 'Sales Performance',
    prospect: 'Lead Detail',
    lead: 'Lead Detail',
    items: 'Parts Library',
    office: 'Office',
    customers: 'Customers',
    jobs: 'Jobs',
    vehicles: 'Vehicles',
    vehicle: 'Vehicle Detail',
    qr_hub: 'QR Label Hub',
    zones: 'Zones',
    bay_monitor: 'Bay Monitor',
    parking_monitor: 'Parking Key Monitor',
    conference_monitor: 'Conference Room Monitor',
    conference_control: 'TV Monitor Control',
    monitor: 'TV Monitor Screen',
    timeclock_monitor: 'Timeclock Station',
    job: 'Job Detail',
    tasks: 'Todos',
    vendors: 'Vendors & Services',
    feedback: 'Feedback & Bugs',
    staff_worksheet: 'Staff Worksheet',
    bay_worksheet: 'Bay Worksheet',
    parts_worksheet: 'Parts Worksheet',
    jobs_worksheet: 'Jobs Worksheet',
    jobs_overview: 'Jobs Overview Sheet',
    package_intake: 'Package Intake',
    part_request: 'Add Part / Request',
    vehicle_intake: 'Vehicle Intake',
    log_issue: 'Log Feedback & Incidents',
    weekly_meeting: 'Weekly Meeting Notes',
    audit: 'Weekly Audit',
    help_overview: 'Help Center',
    help_clocking_in_out: 'Clocking In & Out Guide',
    help_breaks_lunches: 'Breaks & Lunches Guide',
    sop_overview: 'SOP Workflows',
    qb_health_audit: 'Data Health Audit',
    safety: 'Safety & OSHA Center',
    safety_standards: 'OSHA Standards Directory',
    safety_sds: 'SDS & HazMat Binders',
    safety_incidents: 'Incident & Near-Miss Log',
    safety_inspections: 'Audits & Checklists',
    safety_training: 'Training & Certifications'
  };

  const [dynamicTitle, setDynamicTitle] = useState<string | null>(null);

  useEffect(() => {
    setDynamicTitle(null);
  }, [splat]);

  const pageTitle = dynamicTitle || titleMap[activeTab] || (
    activeTab.startsWith('help_') 
      ? activeTab.replace('help_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + " Guide"
      : activeTab.replace('qb_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  );
  
  usePageTitle(pageTitle);

  const { tenantId: storeTenantId, impersonatedStaff, stopImpersonating, isSuperAdmin, user } = useAuthStore();
  const urlTenantId = params.tenantId;
  let tenantId = (isSuperAdmin && urlTenantId) ? urlTenantId : storeTenantId;
  if (urlTenantId && storeTenantId && urlTenantId.toLowerCase() === storeTenantId.toLowerCase()) {
    tenantId = storeTenantId;
  }

  // Automatic Page Telemetry Tracker
  usePageAnalytics(activeTab, tenantId || undefined);

  const navigate = useNavigate();
  
  // Legacy Redirect: daily_log_v3 -> daily_log
  useEffect(() => {
    if (activeTab === 'daily_log_v3') {
      navigate(`/business/${tenantId}/daily_log`, { replace: true });
    }
  }, [activeTab, navigate, tenantId]);

  // Legacy Redirect: foreman -> upfitters
  useEffect(() => {
    if (activeTab === 'foreman') {
      navigate(`/business/${tenantId}/upfitters`, { replace: true });
    }
  }, [activeTab, navigate, tenantId]);

  // Plural to Singular Jobs Redirect: redirect /jobs/:jobId to /job/:jobId
  useEffect(() => {
    if (activeTab === 'jobs' && pathParts[1]) {
      navigate(`/business/${tenantId}/job/${pathParts[1]}`, { replace: true });
    }
  }, [activeTab, pathParts, tenantId, navigate]);

  // Periodic background geolocation tracking for active users (even if not clocked in)
  useEffect(() => {
    if (!tenantId || tenantId === 'GLOBAL' || !user?.uid || impersonatedStaff) return;

    const trackActiveLocation = async () => {
      try {
        const location = await getCurrentLocation(5000, false);
        if (location.lat !== null && location.lng !== null) {
          await updateStaffLastLocation(
            tenantId,
            user.uid,
            user.email,
            location,
            "App Active"
          );
        }
      } catch (e) {
        console.error("Error in background geolocation tracking:", e);
      }
    };

    // Track on initial mount/activation
    trackActiveLocation();

    // Track every 5 minutes if browser tab is active/visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        trackActiveLocation();
      }
    }, 300000);

    return () => clearInterval(interval);
  }, [tenantId, user?.uid, impersonatedStaff]);
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

  const TABS_WITH_SHELL_HEADER = [
    'mission_control',
    'settings',
    'staff',
    'org_chart',
    'departments',
    'device_settings',
    'package_intake',
    'part_request',
    'vehicle_intake',
    'log_issue',
    'quickdesk',
    'qr_hub',
    'zones'
  ];

  if (activeTab === 'wire_scan') {
    return <WireScanPage />;
  }

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-955 text-zinc-900 dark:text-zinc-100 transition-colors overflow-hidden">
      <PullToRefresh onRefresh={() => window.location.reload()} />
      {activeTab !== 'bay_monitor' && activeTab !== 'timeclock_monitor' && activeTab !== 'parking_monitor' && activeTab !== 'conference_monitor' && (
        <>
          <BusinessSidebar 
            activeTab={activeTab} 
            setActiveTab={handleTabClick} 
            isOpen={isSidebarOpen} 
            setIsOpen={setIsSidebarOpen} 
            lastSync={lastSync}
            activeSync={activeSync}
          />
          <MobileBottomNav 
            activeTab={activeTab} 
            setActiveTab={handleTabClick} 
            onOpenSidebar={() => setIsSidebarOpen(true)} 
          />
        </>
      )}

      <GlobalJobModal tenantId={tenantId!} />
      <TutorialModal />

      <div className="flex-1 flex flex-col min-w-0">
        {activeTab !== 'bay_monitor' && activeTab !== 'timeclock_monitor' && activeTab !== 'parking_monitor' && activeTab !== 'conference_monitor' && (
          <div className="print-hidden shrink-0">
            <TimeClockBar />
          </div>
        )}
        {activeTab !== 'bay_monitor' && activeTab !== 'timeclock_monitor' && activeTab !== 'parking_monitor' && activeTab !== 'conference_monitor' && (
          <div className="print-hidden shrink-0">
            <TopNav onMenuClick={() => setIsSidebarOpen(true)} />
          </div>
        )}

        <main className={`flex-1 overflow-y-auto ${(activeTab === 'bay_monitor' || activeTab === 'timeclock_monitor' || activeTab === 'parking_monitor' || activeTab === 'conference_monitor') ? 'p-0' : activeTab === 'jobs_overview' ? 'p-1 sm:p-2 pb-16' : 'p-4 pb-24 md:p-8'} no-scrollbar`}>
          {impersonatedStaff && (
            <div className="mb-8 bg-emerald-600 text-white rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-emerald-500/20 animate-in slide-in-from-top-4 duration-300 print-hidden">
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
          {!isLoading && TABS_WITH_SHELL_HEADER.includes(activeTab) && (
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
              <OverviewV3 tenantId={tenantId!} />
            )}

            {activeTab === 'overview_classic' && (
              <UserMissionControl tenantId={tenantId!} viewMode="jobs" />
            )}

            {activeTab === 'time_details' && (
              <TimeDetailsV3 tenantId={tenantId!} />
            )}

            {activeTab === 'device_settings' && (
              <UserMissionControl tenantId={tenantId!} viewMode="device" />
            )}

            {activeTab.startsWith('help_') && (
              <HelpCenter activeTab={activeTab} />
            )}

            {activeTab.startsWith('sop_') && (
              <SOPCenter activeTab={activeTab} />
            )}

            {activeTab === 'package_intake' && (
              <PermissionGate permission="package_intake.use">
                <PackageIntakeModal isPage={true} />
              </PermissionGate>
            )}

            {activeTab === 'part_request' && (
              <PermissionGate permission="part_request.use">
                <PartFormModal isPage={true} tenantId={tenantId!} user={user} onClose={() => navigate(-1)} onSuccess={() => navigate(-1)} />
              </PermissionGate>
            )}

            {activeTab === 'vehicle_intake' && (
              <PermissionGate permission="vehicle_intake.use">
                <VehicleIntakeModal isPage={true} tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'log_issue' && (
              <PermissionGate permission="incident_log.use">
                <FeedbackModal isPage={true} />
              </PermissionGate>
            )}

            {activeTab === 'desktop' && (
              <UpfittersDesktopOS tenantId={tenantId!} />
            )}

            {activeTab === 'quickdesk' && (
              <PermissionGate permission="quickdesk.view">
                <QuickDesk tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'mission_control' && (
              <PermissionGate permission="mission_control.view">
                <MissionControl tenantId={tenantId!} onTabChange={handleTabClick} />
              </PermissionGate>
            )}

            {activeTab === 'upfitters' && (
              <PermissionGate permission="foreman.view">
                <UpfittersDashboard tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'upfitters_kanban' && (
              <PermissionGate permission="foreman.view">
                <UpfittersKanbanBoard tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'foreman_todo' && (
              <PermissionGate permission="foreman.view">
                <ForemanTodoList tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'settings' && (
              <PermissionGate permission="settings.view">
                <BusinessSettings tenantId={tenantId!} initialData={business?.rawData} />
              </PermissionGate>
            )}

            {activeTab === 'staff' && (
              pathParts[1] ? (
                <StaffProfilePage tenantId={tenantId!} staffId={pathParts[1]} setDynamicTitle={setDynamicTitle} />
              ) : (
                <PermissionGate permission="staff.view">
                  <StaffManager tenantId={tenantId!} />
                </PermissionGate>
              )
            )}

            {activeTab === 'permission_matrix' && (
              <PermissionGate permission="permission_matrix.view">
                <PermissionMatrixPortal tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'org_chart' && (
              <OrgChartPage tenantId={tenantId!} />
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

            {activeTab === 'audit' && (
              <PermissionGate permission="reports.view">
                <AuditManager tenantId={tenantId!} />
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

            {activeTab === 'control_board' && (
              <PermissionGate permission="jobs.view">
                <ControlBoard tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'timeclock' && (
              <PermissionGate permissions={["timeclock.manage", "payroll.view"]}>
                <TimeclockAdmin tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'live_timeclock' && (
              <PermissionGate permissions={["timeclock.view", "timeclock.manage", "payroll.view"]}>
                <LiveTimeclockBoard tenantId={tenantId!} />
              </PermissionGate>
            )}

            {(activeTab === 'safety' || activeTab === 'safety_standards' || activeTab === 'safety_sds' || activeTab === 'safety_incidents' || activeTab === 'safety_inspections' || activeTab === 'safety_training') && (
              <PermissionGate permission="safety.view">
                <SafetyManager tenantId={tenantId!} activeTab={activeTab} />
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

            {activeTab === 'harness' && (
              <PermissionGate permission="harness.view">
                <HarnessMissionControl tenantId={tenantId!} />
              </PermissionGate>
            )}

            {(activeTab === 'sales' || activeTab === 'sales_pipeline' || activeTab === 'sales_prospects' || activeTab === 'sales_activities' || activeTab === 'sales_analytics') && !pathParts[1] && (
              <PermissionGate permission="sales.view">
                <SalesCrmManager tenantId={tenantId!} activeTab={activeTab} />
              </PermissionGate>
            )}

            {(activeTab === 'prospect' || activeTab === 'lead' || (activeTab === 'sales' && pathParts[1])) && (
              <PermissionGate permission="sales.view">
                <ProspectDetailPage tenantId={tenantId!} setDynamicTitle={setDynamicTitle} />
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
                <DepartmentOverview tenantId={tenantId!} departmentName="Fabrication" />
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
              <PermissionGate permissions={["jobs.view", "jobs.manage"]}>
                <JobDetailPage tenantId={tenantId!} setDynamicTitle={setDynamicTitle} />
              </PermissionGate>
            )}

            {activeTab === 'jobv3' && (
              <PermissionGate permissions={["jobs.view", "jobs.manage"]}>
                <JobDetailPageV3 tenantId={tenantId!} setDynamicTitle={setDynamicTitle} />
              </PermissionGate>
            )}

            {activeTab === 'job' && pathParts[2] === 'efficiency' && (
              <PermissionGate permissions={["jobs.view", "jobs.manage", "reports.view"]}>
                <JobEfficiencyPage tenantId={tenantId!} setDynamicTitle={setDynamicTitle} />
              </PermissionGate>
            )}

            {activeTab === 'job' && pathParts[2] === 'qc' && (
              <PermissionGate permission="jobs.qc">
                <JobQCPage tenantId={tenantId!} setDynamicTitle={setDynamicTitle} />
              </PermissionGate>
            )}

            {activeTab === 'job' && pathParts[2] === 'intake' && (
              <PermissionGate permission="vehicle_intake.use">
                <JobIntakeFormPage tenantId={tenantId!} setDynamicTitle={setDynamicTitle} />
              </PermissionGate>
            )}

            {activeTab === 'job' && (pathParts[2] === 'edit' || pathParts[1] === 'create') && (
              <PermissionGate permission="jobs.manage">
                <JobEditPage tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'task' && pathParts[1] && pathParts[2] && (
              <TaskDetailPage tenantId={tenantId!} setDynamicTitle={setDynamicTitle} />
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

            {activeTab === 'vehicle' && pathParts[1] && (
              <PermissionGate permission="vehicles.view">
                <VehicleDetailPage tenantId={tenantId!} setDynamicTitle={setDynamicTitle} />
              </PermissionGate>
            )}

            {activeTab === 'qr_hub' && (
              <PermissionGate permission="vehicles.view">
                <QRManager tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'zones' && (
              <PermissionGate permission="zones.view">
                <ZonesManager tenantId={tenantId!} />
              </PermissionGate>
            )}

            {(activeTab === 'monitor' || activeTab === 'bay_monitor' || activeTab === 'parking_monitor' || activeTab === 'conference_monitor' || activeTab === 'timeclock_monitor') && (
              <PermissionGate permissions={['facility.view', 'timeclock.view']}>
                <UnifiedMonitor tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'morning_meeting' && (
              <PermissionGate permission="foreman.view">
                <MorningMeetingBoard tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'staff_worksheet' && (
              <PermissionGate permission="staff_worksheet.view">
                <StaffWorksheet tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'bay_worksheet' && (
              <PermissionGate permission="bay_worksheet.view">
                <BayWorksheet tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'parts_worksheet' && (
              <PermissionGate permissions={["parts_worksheet.view", "parts.manage"]}>
                <PartsWorksheet tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'jobs_worksheet' && (
              <PermissionGate permission="jobs.view">
                <JobSpreadsheet tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'jobs_overview' && (
              <PermissionGate permissions={["office.view", "jobs.view", "foreman.view"]}>
                <OfficeJobsOverviewSheet tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'progress_digest' && (
              <PermissionGate permissions={["office.view", "jobs.view", "foreman.view"]}>
                <ProgressDigest tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'weekly_meeting' && (
              <PermissionGate permissions={["office.view", "foreman.view"]}>
                <WeeklyMeetingNotes tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'tuesday_meeting_report' && (
              <PermissionGate permissions={["jobs.view", "foreman.view", "office.view"]}>
                <TuesdayMeetingReport tenantId={tenantId!} />
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
              <PermissionGate permission="whiteboards.view">
                {pathParts[1] ? (
                  <WorkflowCanvasTab 
                    tenantId={tenantId!} 
                    canvasId={pathParts[1]} 
                    onBack={() => navigate(`/business/${tenantId}/canvases`)} 
                  />
                ) : (
                  <CanvasGalleryTab 
                    tenantId={tenantId!} 
                    onOpenCanvas={(canvasId) => navigate(`/business/${tenantId}/canvases/${canvasId}`)} 
                  />
                )}
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

            {activeTab === 'qb_health_audit' && (
              <PermissionGate permission="sync.view">
                <QuickBooksAudit tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'qb_job_details' && (
              <QBJobDetailsPlaceholder tenantId={tenantId!} />
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

            {activeTab === 'locations' && (
              <PermissionGate permission="development.view">
                <StaffLocationsPage tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'conference_control' && (
              <PermissionGate permissions={['facility.view', 'development.view']}>
                <ConferenceControlPanel tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'staff_sheet' && (
              <PermissionGate permission="development.view">
                <StaffSpreadsheet tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'time_sheet' && (
              <PermissionGate permissions={['office.view', 'timeclock.view', 'timeclock.manage', 'foreman.view']}>
                <TimeclockSpreadsheet tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'vehicles_sheet' && (
              <PermissionGate permission="development.view">
                <VehicleSpreadsheet tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'jobs_sheet' && (
              <PermissionGate permission="development.view">
                <JobSpreadsheet tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'tasks_sheet' && (
              <PermissionGate permission="development.view">
                <TasksSpreadsheet tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'wires_sheet' && (
              <PermissionGate permission="development.view">
                <WiresSpreadsheet tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'progress_digest_v3' && (
              <PermissionGate permission="development.view">
                <ProgressDigestV3 tenantId={tenantId!} />
              </PermissionGate>
            )}

            {(activeTab === 'daily_log' || activeTab === 'daily_log_v3') && (
              <PermissionGate permissions={['office.view', 'foreman.view', 'development.view']}>
                <DailyLogV3 tenantId={tenantId!} />
              </PermissionGate>
            )}

            {(activeTab === 'completed_tasks' || activeTab === 'completed-tasks' || activeTab === 'task_completions') && (
              <PermissionGate permissions={['payroll.view', 'timeclock.view', 'jobs.view', 'office.view', 'foreman.view', 'development.view']}>
                <TaskCompletionAudit />
              </PermissionGate>
            )}

            {(activeTab === 'yellowsheets' || activeTab === 'yellowsheet') && (
              <PermissionGate permissions={['yellow_sheets.view', 'yellow_sheets.manage', 'office.view', 'foreman.view', 'development.view', 'timeclock.manage', 'payroll.view']}>
                <YellowSheets tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'payroll_audit_worksheet' && (
              <PermissionGate permissions={['yellow_sheets.view', 'office.view', 'foreman.view', 'development.view', 'reports.view', 'timeclock.manage', 'payroll.view']}>
                <PayrollAuditWorksheet tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'page_catalog' && (
              <PermissionGate permission="development.view">
                <AppPageDirectory tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'page_analytics' && (
              <PermissionGate permission="development.view">
                <PageAnalyticsDashboard tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'telemetry_sheet' && (
              <PermissionGate permission="development.view">
                <TelemetryDashboard tenantId={tenantId!} />
              </PermissionGate>
            )}

            {activeTab === 'staff_sitemap' && (
              <PermissionGate permission="staff.view">
                <StaffSitemapInspector tenantId={tenantId!} />
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
  permissions: permissionList,
  children 
}: { 
  permission?: PermissionKey, 
  permissions?: PermissionKey[],
  children: React.ReactNode 
}) {
  const { permissions: userPermissions, isSuperAdmin } = useAuthStore();
  if (isSuperAdmin) return <>{children}</>;
  if (permission && userPermissions[permission]) return <>{children}</>;
  if (permissionList && permissionList.some(p => userPermissions[p])) return <>{children}</>;
  if (!permission && !permissionList) return <>{children}</>;
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

