import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, Shield, BarChart3, AlertTriangle, Settings, 
  X, Copy, RefreshCw, Trash2, Search, Moon, Sun, 
  UserCheck, ShieldAlert, Cpu, Database, EyeOff, Check, AlertCircle
} from 'lucide-react';
import { collection, query, limit, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { PERMISSIONS, type PermissionKey, type PermissionSet } from '../../lib/auth/permissions';
import { toast } from 'sonner';

// Define the shape of log entries
interface ConsoleLogEntry {
  type: 'log' | 'warn' | 'error';
  message: string;
  timestamp: Date;
}

export function DebugPortal() {
  const { 
    user, 
    tenantId, 
    permissions, 
    setPermissions,
    isSuperAdmin, 
    impersonatedStaff, 
    impersonate, 
    stopImpersonating 
  } = useAuthStore();

  const location = useLocation();
  const queryClient = useQueryClient();

  // Open / Close state persisted in LocalStorage
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('upfitters_debug_bar_open');
    return saved === 'true';
  });

  const [activeTab, setActiveTab] = useState<'permissions' | 'telemetry' | 'console' | 'utilities'>('permissions');
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffSearch, setStaffSearch] = useState('');
  const [feedbackReports, setFeedbackReports] = useState<any[]>([]);
  const [permSearch, setPermSearch] = useState('');
  
  // Track mounting time
  const mountTimeRef = useRef(new Date());
  const [uptime, setUptime] = useState('0s');

  // Verify auth visibility rules
  const isAuthorized = useMemo(() => {
    if (!user) return false;
    const email = user.email?.toLowerCase();
    const storeOriginalSuper = useAuthStore.getState().originalIsSuperAdmin;
    return (
      isSuperAdmin || 
      !!storeOriginalSuper || 
      !!impersonatedStaff ||
      (email && ['loseyp@gmail.com', 'p.losey@saegrp.com'].includes(email))
    );
  }, [user, isSuperAdmin, impersonatedStaff]);

  // Persist open/closed state
  useEffect(() => {
    localStorage.setItem('upfitters_debug_bar_open', String(isOpen));
  }, [isOpen]);

  // Rolling capture of console errors and warnings
  useEffect(() => {
    if (!isAuthorized) return;

    const originalError = console.error;
    const originalWarn = console.warn;
    const originalLog = console.log;

    const formatMessage = (args: any[]): string => {
      return args.map(arg => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return '[Circular Object]';
          }
        }
        return String(arg);
      }).join(' ');
    };

    console.error = (...args: any[]) => {
      const msg = formatMessage(args);
      setLogs(prev => [{ type: 'error' as const, message: msg, timestamp: new Date() }, ...prev].slice(0, 50));
      originalError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      const msg = formatMessage(args);
      setLogs(prev => [{ type: 'warn' as const, message: msg, timestamp: new Date() }, ...prev].slice(0, 50));
      originalWarn.apply(console, args);
    };

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      console.log = originalLog;
    };
  }, [isAuthorized]);

  // Track page uptime timer
  useEffect(() => {
    const timer = setInterval(() => {
      const diffMs = new Date().getTime() - mountTimeRef.current.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      if (diffSecs < 60) {
        setUptime(`${diffSecs}s`);
      } else {
        const mins = Math.floor(diffSecs / 60);
        const secs = diffSecs % 60;
        setUptime(`${mins}m ${secs}s`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch active staff list for current tenant
  useEffect(() => {
    if (!isAuthorized || !tenantId || tenantId === 'GLOBAL') {
      setStaffList([]);
      return;
    }

    const q = query(collection(db, `businesses/${tenantId}/staff`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter((s: any) => !s.isArchived)
      .sort((a: any, b: any) => {
        const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
        const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setStaffList(list);
    }, (err) => {
      console.error('Debug Portal: Error loading staff members:', err);
    });

    return () => unsubscribe();
  }, [isAuthorized, tenantId]);

  // Fetch recent feedback/incident reports
  useEffect(() => {
    if (!isAuthorized) return;

    const q = query(collection(db, 'feedback_reports'), orderBy('createdAt', 'desc'), limit(15));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setFeedbackReports(list);
    }, (err) => {
      if (err.code === 'permission-denied') {
        console.warn('Debug Portal: Feedback reports require elevated system-level rules');
      } else {
        console.error('Debug Portal: Error loading feedback reports:', err);
      }
    });

    return () => unsubscribe();
  }, [isAuthorized]);

  // Quick impersonation templates for standard roles
  const mockRoles = useMemo(() => {
    const technician: PermissionSet = {
      'jobs.view': true,
      'tasks.view': true,
      'timeclock.view': true,
      'part_request.use': true
    };
    
    const foreman: PermissionSet = {
      'jobs.view': true,
      'jobs.manage': true,
      'jobs.move_vehicle': true,
      'tasks.view': true,
      'tasks.manage': true,
      'tasks.clock_others': true,
      'foreman.view': true,
      'timeclock.view': true,
      'timeclock.manage': true,
      'staff_worksheet.view': true,
      'bay_worksheet.view': true,
      'parts_worksheet.view': true
    };

    const office: PermissionSet = {
      'quickdesk.view': true,
      'mission_control.view': true,
      'vehicles.view': true,
      'vehicles.manage': true,
      'zones.view': true,
      'zones.manage': true,
      'parts.view': true,
      'parts.manage': true,
      'customers.view': true,
      'customers.manage': true,
      'jobs.view': true,
      'jobs.manage': true,
      'staff.view': true,
      'staff.manage': true,
      'office.view': true,
      'settings.view': true,
      'settings.manage': true,
      'timeclock.view': true,
      'timeclock.manage': true,
      'reports.view': true,
      'tasks.view': true,
      'tasks.manage': true,
      'whiteboards.view': true,
      'whiteboards.manage': true
    };

    return [
      { name: 'Technician', permissions: technician },
      { name: 'Foreman', permissions: foreman },
      { name: 'Office Board / Admin', permissions: office }
    ];
  }, []);

  // Filter permission keys based on search input
  const filteredPermissionKeys = useMemo(() => {
    const keys = Object.keys(PERMISSIONS) as PermissionKey[];
    if (!permSearch.trim()) return keys;
    const queryStr = permSearch.toLowerCase();
    return keys.filter(key => 
      key.toLowerCase().includes(queryStr) || 
      PERMISSIONS[key].toLowerCase().includes(queryStr)
    );
  }, [permSearch]);

  // Filter staff based on search input
  const filteredStaffList = useMemo(() => {
    if (!staffSearch.trim()) return staffList;
    const queryStr = staffSearch.toLowerCase();
    return staffList.filter((s: any) => {
      const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
      const email = (s.email || '').toLowerCase();
      return fullName.includes(queryStr) || email.includes(queryStr);
    });
  }, [staffList, staffSearch]);

  // Dynamically analyze the required permission for the current view
  const currentViewRequirement = useMemo(() => {
    const pathname = location.pathname;
    const splat = pathname.split('/business/')[1] || '';
    const activeTab = splat.split('/')[1] || 'overview';

    const tabPermissionMap: Record<string, PermissionKey> = {
      quickdesk: 'quickdesk.view',
      mission_control: 'mission_control.view',
      upfitters: 'foreman.view',
      settings: 'settings.view',
      staff: 'staff.view',
      departments: 'staff.view',
      reports: 'reports.view',
      performance: 'performance.view',
      schedule: 'reports.view',
      job_schedule: 'jobs.view',
      control_board: 'jobs.view',
      timeclock: 'timeclock.manage',
      live_timeclock: 'timeclock.view',
      parts: 'parts.view',
      printed_parts: 'printed_parts.view',
      harness: 'harness.view',
      graphics: 'graphics.view',
      fast: 'fast.view',
      fabrication: 'fabrication.view',
      office: 'office.view',
      customers: 'customers.view',
      jobs: 'jobs.view',
      vehicles: 'vehicles.view',
      qr_hub: 'vehicles.view',
      zones: 'zones.view',
      bay_monitor: 'facility.view',
      morning_meeting: 'foreman.view',
      staff_worksheet: 'staff_worksheet.view',
      bay_worksheet: 'bay_worksheet.view',
      parts_worksheet: 'parts_worksheet.view',
      tasks: 'tasks.view',
      canvases: 'whiteboards.view',
      vendors: 'vendors.view'
    };

    return {
      tab: activeTab,
      requiredKey: tabPermissionMap[activeTab] || null
    };
  }, [location.pathname]);

  // Utility logic
  const handleTogglePermission = (key: PermissionKey) => {
    const newPerms = { ...permissions, [key]: !permissions[key] };
    setPermissions(newPerms);
    toast.success(`Session permission override: ${key} = ${newPerms[key] ? 'TRUE' : 'FALSE'}`);
  };

  const handleImpersonateUser = (staff: any) => {
    const deptPerms = staff.departmentPermissions || {};
    const indPerms = staff.individualPermissions || {};
    
    // Resolve full permission set
    const staffPerms: PermissionSet = { ...deptPerms };
    Object.entries(indPerms).forEach(([k, v]) => {
      if (v !== undefined) {
        staffPerms[k as PermissionKey] = !!v;
      }
    });

    impersonate({
      id: staff.id,
      name: `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'Unknown Staff',
      permissions: staffPerms,
      type: 'staff'
    });
    toast.success(`Impersonating ${staff.firstName || 'Staff'}`);
  };

  const handleImpersonateRole = (roleName: string, perms: PermissionSet) => {
    impersonate({
      id: `role_${roleName.toLowerCase()}`,
      name: `${roleName} (Mock Role)`,
      permissions: perms,
      type: 'role'
    });
    toast.success(`Now impersonating role: ${roleName}`);
  };

  const handleClearCache = () => {
    queryClient.clear();
    toast.success('Query client cache cleared successfully.');
  };

  const handleClearLocalStorage = () => {
    if (confirm('Clear all local storage variables? You will be logged out.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleToggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    toast.success(`Dark theme toggled to: ${document.documentElement.classList.contains('dark') ? 'ACTIVE' : 'INACTIVE'}`);
  };

  const handleCopyState = () => {
    const activeQueries = queryClient.getQueryCache().getAll().map(q => ({
      key: q.queryKey,
      status: q.state.status
    }));

    const stateDump = {
      app: 'Upfitters OS Developer Suite',
      user: {
        uid: user?.uid,
        email: user?.email,
        displayName: user?.displayName
      },
      auth: {
        isSuperAdmin,
        tenantId,
        impersonated: !!impersonatedStaff,
        impersonatedDetail: impersonatedStaff
      },
      currentView: currentViewRequirement,
      activePermissions: permissions,
      queryCount: activeQueries.length,
      queries: activeQueries,
      environment: {
        uptime,
        screen: `${window.innerWidth}x${window.innerHeight} (${window.devicePixelRatio}dpr)`,
        online: navigator.onLine,
        connection: (navigator as any).connection ? {
          type: (navigator as any).connection.effectiveType,
          downlink: (navigator as any).connection.downlink
        } : 'Unavailable'
      }
    };

    navigator.clipboard.writeText(JSON.stringify(stateDump, null, 2));
    toast.success('Formatted developer state copied to clipboard!');
  };

  if (!isAuthorized) return null;

  return (
    <>
      {/* ⚡ FLOATING LAUNCHER PILL */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 z-50 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-4 py-3 rounded-full shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center gap-2 group border border-indigo-400/20"
        >
          <Terminal size={16} className="animate-pulse text-indigo-200" />
          <span className="text-[10px] font-black tracking-widest uppercase select-none">Debug Portal</span>
        </button>
      )}

      {/* 💻 EXPANDED DRAWER */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 24, stiffness: 180 }}
            className="fixed bottom-0 left-0 right-0 z-[999] h-[55vh] min-h-[420px] max-h-[85vh] bg-zinc-950/98 backdrop-blur-md border-t border-zinc-800 shadow-2xl flex flex-col font-sans select-text text-zinc-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                  <h2 className="text-xs font-black tracking-widest uppercase text-white">
                    Upfitters OS Debug Console
                  </h2>
                </div>

                {impersonatedStaff && (
                  <div className="flex items-center gap-2 px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/20">
                    <UserCheck size={11} />
                    Impersonating: {impersonatedStaff.name}
                    <button 
                      onClick={stopImpersonating}
                      className="ml-1 text-white hover:text-emerald-300 font-extrabold underline underline-offset-2"
                    >
                      Stop
                    </button>
                  </div>
                )}

                {isSuperAdmin && !impersonatedStaff && (
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold rounded-full border border-indigo-500/20">
                    <ShieldAlert size={11} />
                    Super Admin Portal Mode
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[10px] text-zinc-500 font-mono">
                  Uptime: {uptime} | Tenant: {tenantId || 'GLOBAL'}
                </span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-zinc-800 bg-zinc-900/30 px-6 py-1.5 gap-2 shrink-0">
              <button
                onClick={() => setActiveTab('permissions')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'permissions' 
                    ? 'bg-zinc-800 text-white shadow' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Shield size={14} />
                Permissions & Impersonation
              </button>
              <button
                onClick={() => setActiveTab('telemetry')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'telemetry' 
                    ? 'bg-zinc-800 text-white shadow' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <BarChart3 size={14} />
                Telemetry & TanStack Queries
              </button>
              <button
                onClick={() => setActiveTab('console')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'console' 
                    ? 'bg-zinc-800 text-white shadow' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <AlertTriangle size={14} />
                Diagnostics & Log stream
              </button>
              <button
                onClick={() => setActiveTab('utilities')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'utilities' 
                    ? 'bg-zinc-800 text-white shadow' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Settings size={14} />
                Quick Utilities
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-zinc-950">
              
              {/* TAB 1: PERMISSIONS & IMPERSONATION */}
              {activeTab === 'permissions' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                  {/* Left Column: Impersonate Staff */}
                  <div className="flex flex-col gap-4 border-r border-zinc-800 pr-6">
                    <div>
                      <h3 className="text-sm font-bold text-white mb-1">
                        Masquerade & Impersonation
                      </h3>
                      <p className="text-xs text-zinc-400">
                        View Upfitters OS as a specific employee to audit visual limits.
                      </p>
                    </div>

                    {tenantId && tenantId !== 'GLOBAL' ? (
                      <div className="flex flex-col gap-3 flex-1 min-h-0">
                        <div className="relative">
                          <Search className="absolute top-2.5 left-3 w-4 h-4 text-zinc-500" />
                          <input
                            type="text"
                            placeholder="Search active staff members..."
                            value={staffSearch}
                            onChange={(e) => setStaffSearch(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>

                        <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-900 max-h-[160px] lg:max-h-none">
                          {filteredStaffList.length > 0 ? (
                            filteredStaffList.map((s: any) => (
                              <div 
                                key={s.id}
                                className="flex items-center justify-between p-2 hover:bg-zinc-900 transition-colors"
                              >
                                <div className="min-w-0 pr-2">
                                  <p className="text-xs font-bold text-white truncate">
                                    {s.firstName} {s.lastName}
                                  </p>
                                  <p className="text-[10px] text-zinc-500 truncate capitalize">
                                    {s.role || 'Staff'} {s.departmentName ? `• ${s.departmentName}` : ''}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleImpersonateUser(s)}
                                  disabled={impersonatedStaff?.id === s.id}
                                  className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold transition-all disabled:opacity-50"
                                >
                                  Impersonate
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="p-4 text-center text-xs text-zinc-500">
                              No staff matches found.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-zinc-900/50 border border-zinc-800/80 rounded-xl text-center flex flex-col items-center justify-center gap-2 my-auto">
                        <EyeOff className="w-8 h-8 text-zinc-500" />
                        <p className="text-xs text-zinc-400 font-bold">Impersonate Unavailable</p>
                        <p className="text-[10px] text-zinc-500 max-w-[200px]">
                          Select a Tenant / Business dashboard first (staff are fetched per tenant scope).
                        </p>
                      </div>
                    )}

                    <div className="border-t border-zinc-800 pt-3">
                      <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2">
                        Quick Mock Roles (Generic Rules)
                      </h4>
                      <div className="flex flex-col gap-1.5">
                        {mockRoles.map((r, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-zinc-300 font-medium">{r.name}</span>
                            <button
                              onClick={() => handleImpersonateRole(r.name, r.permissions)}
                              className="px-2 py-0.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded text-[10px] font-bold"
                            >
                              Activate
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Middle & Right Column combined: Permission Checklist */}
                  <div className="flex flex-col gap-4 lg:col-span-2 h-full min-h-0">
                    <div className="flex items-center justify-between shrink-0">
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          Live Permission Matrix
                          {currentViewRequirement.requiredKey && (
                            <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black px-2 py-0.5 rounded uppercase">
                              Required: {currentViewRequirement.requiredKey}
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Inspect permissions in real-time. Toggle checkboxes to immediately overlay custom states on the UI.
                        </p>
                      </div>

                      <div className="relative w-48">
                        <Search className="absolute top-2 left-2.5 w-3.5 h-3.5 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Filter permissions..."
                          value={permSearch}
                          onChange={(e) => setPermSearch(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-900/10 p-4 max-h-[220px] lg:max-h-none">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredPermissionKeys.map((key) => {
                          const hasPerm = permissions[key] === true;
                          return (
                            <div 
                              key={key}
                              onClick={() => handleTogglePermission(key)}
                              className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer select-none transition-all ${
                                hasPerm 
                                  ? 'bg-indigo-600/10 border-indigo-500/30 hover:bg-indigo-600/20' 
                                  : 'bg-zinc-900/40 border-zinc-800/60 hover:bg-zinc-900'
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <p className="text-[11px] font-bold text-zinc-100 truncate">
                                  {key}
                                </p>
                                <p className="text-[9px] text-zinc-400 truncate">
                                  {PERMISSIONS[key]}
                                </p>
                              </div>
                              
                              <div className="shrink-0 flex items-center">
                                {hasPerm ? (
                                  <div className="w-4.5 h-4.5 bg-indigo-600 border border-indigo-500 rounded flex items-center justify-center text-white">
                                    <Check size={11} strokeWidth={3} />
                                  </div>
                                ) : (
                                  <div className="w-4.5 h-4.5 border border-zinc-700 hover:border-zinc-500 rounded" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TELEMETRY & TANSTACK QUERIES */}
              {activeTab === 'telemetry' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                  {/* Left Column: Client Telemetry */}
                  <div className="flex flex-col gap-4 border-r border-zinc-800 pr-6">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-violet-400" />
                      Client Diagnostics
                    </h3>

                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                        <span className="text-zinc-400">Current Tab / Route</span>
                        <span className="text-white font-mono font-bold truncate max-w-[200px]" title={location.pathname}>
                          {location.pathname}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                        <span className="text-zinc-400">Target View Tab</span>
                        <span className="text-indigo-400 font-bold uppercase">
                          {currentViewRequirement.tab || 'Overview'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                        <span className="text-zinc-400">Screen Resolution</span>
                        <span className="text-white font-mono">
                          {window.innerWidth}x{window.innerHeight} ({window.devicePixelRatio}x dpr)
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                        <span className="text-zinc-400">Firebase User ID</span>
                        <span className="text-white font-mono truncate max-w-[150px]" title={user?.uid}>
                          {user?.uid || 'Not Authenticated'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                        <span className="text-zinc-400">Operator Email</span>
                        <span className="text-emerald-400 font-mono truncate max-w-[150px]" title={user?.email || ''}>
                          {user?.email || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                        <span className="text-zinc-400">PWA Online State</span>
                        <span className={`font-black ${navigator.onLine ? 'text-emerald-500' : 'text-red-500'}`}>
                          {navigator.onLine ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                      <div className="flex justify-between pb-1.5">
                        <span className="text-zinc-400">Network Speed Type</span>
                        <span className="text-amber-400 font-mono uppercase">
                          {(navigator as any).connection?.effectiveType || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Middle & Right Column: React Query Monitor */}
                  <div className="flex flex-col gap-4 lg:col-span-2 h-full min-h-0">
                    <div className="flex items-center justify-between shrink-0">
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Database className="w-4 h-4 text-indigo-400" />
                          TanStack Query Store Cache
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Active query collections and document fetch states for the current route.
                        </p>
                      </div>

                      <button
                        onClick={handleClearCache}
                        className="flex items-center gap-1.5 px-3 py-1 border border-red-500/20 hover:bg-red-500/10 text-red-400 rounded-lg text-xs font-bold transition-all"
                      >
                        <Trash2 size={12} />
                        Flush Cache
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-900/10">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-zinc-900/60 border-b border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                            <th className="px-4 py-2">Query Key Path</th>
                            <th className="px-4 py-2">Cache Status</th>
                            <th className="px-4 py-2 text-right">Data Updated At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900 font-mono">
                          {queryClient.getQueryCache().getAll().map((q, idx) => (
                            <tr key={idx} className="hover:bg-zinc-900/30 transition-colors">
                              <td className="px-4 py-2 max-w-[320px] truncate text-zinc-200">
                                {JSON.stringify(q.queryKey)}
                              </td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 text-[10px] font-black rounded-full uppercase border ${
                                  q.state.fetchStatus === 'fetching' 
                                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse'
                                    : q.state.status === 'success' 
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                      : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                }`}>
                                  {q.state.fetchStatus === 'fetching' ? 'fetching' : q.state.status}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right text-zinc-500 text-[10px]">
                                {new Date(q.state.dataUpdatedAt).toLocaleTimeString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: DIAGNOSTICS & LOG STREAM */}
              {activeTab === 'console' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full min-h-0">
                  {/* Left Column: Captured Console Logs */}
                  <div className="flex flex-col gap-4 h-full min-h-0">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-emerald-400" />
                        Captured Logs & Warnings
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Diagnostics captured automatically from this active browser session.
                      </p>
                    </div>

                    <div className="flex-1 overflow-y-auto border border-zinc-800 bg-black/60 rounded-lg p-4 font-mono text-[10px] space-y-2">
                      {logs.length > 0 ? (
                        logs.map((log, idx) => (
                          <div 
                            key={idx} 
                            className={`p-2 border rounded border-zinc-900 ${
                              log.type === 'error' 
                                ? 'bg-red-500/5 text-red-400 border-l-2 border-l-red-500' 
                                : 'bg-amber-500/5 text-amber-400 border-l-2 border-l-amber-500'
                            }`}
                          >
                            <div className="flex justify-between font-bold text-[9px] opacity-80 mb-1">
                              <span className="uppercase">{log.type}</span>
                              <span>{log.timestamp.toLocaleTimeString()}</span>
                            </div>
                            <p className="break-all whitespace-pre-wrap leading-relaxed">{log.message}</p>
                          </div>
                        ))
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-1.5 py-8">
                          <Check className="w-5 h-5 text-emerald-500" />
                          <span>Console clean. No issues captured.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Feedback Reports */}
                  <div className="flex flex-col gap-4 h-full min-h-0">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-violet-400" />
                        Recent System Feedback Reports
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Bugs and incident reports recorded globally in Firestore.
                      </p>
                    </div>

                    <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-lg p-3 bg-zinc-900/10 space-y-2">
                      {feedbackReports.length > 0 ? (
                        feedbackReports.map((report) => (
                          <div 
                            key={report.id}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs"
                          >
                            <div className="flex justify-between items-center mb-1.5 border-b border-zinc-800 pb-1">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                report.type === 'bug' 
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                                  : report.type === 'feature'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-zinc-800 text-zinc-300'
                              }`}>
                                {report.type || 'feedback'}
                              </span>
                              <span className="text-[10px] text-zinc-500">
                                {report.createdAt?.toDate ? report.createdAt.toDate().toLocaleString() : 'Just Now'}
                              </span>
                            </div>
                            <p className="text-zinc-200 leading-relaxed font-medium mb-1.5">{report.description}</p>
                            <div className="flex justify-between text-[10px] text-zinc-500">
                              <span>Reporter: <strong className="text-zinc-400">{report.userEmail || 'Anonymous'}</strong></span>
                              <span className="truncate max-w-[150px]">Path: {report.route || '/'}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-xs text-zinc-500">
                          No feedback reports recorded.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: QUICK UTILITIES */}
              {activeTab === 'utilities' && (
                <div className="h-full flex flex-col gap-6">
                  <div>
                    <h3 className="text-sm font-bold text-white mb-1">
                      Quick Developer Operations
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Force overrides, local cleanup tools, and state copy facilities.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Action 1 */}
                    <button 
                      onClick={handleCopyState}
                      className="p-4 bg-zinc-900 border border-zinc-800 hover:border-violet-500/50 rounded-xl text-left hover:bg-zinc-900/80 transition-all group flex flex-col gap-2"
                    >
                      <Copy className="w-5 h-5 text-violet-400 group-hover:scale-105 transition-transform" />
                      <span className="text-xs font-bold text-white">Copy System State</span>
                      <span className="text-[10px] text-zinc-400 leading-normal">
                        Copies a full state dump containing user profiles, permissions, tabs, and connection stats.
                      </span>
                    </button>

                    {/* Action 2 */}
                    <button 
                      onClick={handleClearCache}
                      className="p-4 bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 rounded-xl text-left hover:bg-zinc-900/80 transition-all group flex flex-col gap-2"
                    >
                      <RefreshCw className="w-5 h-5 text-indigo-400 group-hover:rotate-45 transition-transform" />
                      <span className="text-xs font-bold text-white">Flush Queries Cache</span>
                      <span className="text-[10px] text-zinc-400 leading-normal">
                        Clears the TanStack query client cache and triggers structural data re-fetches for operational stability.
                      </span>
                    </button>

                    {/* Action 3 */}
                    <button 
                      onClick={handleToggleTheme}
                      className="p-4 bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 rounded-xl text-left hover:bg-zinc-900/80 transition-all group flex flex-col gap-2"
                    >
                      <div className="flex gap-1.5 text-amber-400">
                        <Sun className="w-4 h-4" />
                        <Moon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white">Force Theme Switch</span>
                      <span className="text-[10px] text-zinc-400 leading-normal">
                        Toggles light/dark root document class names instantly, bypassing system matching preferences.
                      </span>
                    </button>

                    {/* Action 4 */}
                    <button 
                      onClick={handleClearLocalStorage}
                      className="p-4 bg-zinc-900 border border-zinc-800 hover:border-red-500/50 rounded-xl text-left hover:bg-zinc-900/80 transition-all group flex flex-col gap-2"
                    >
                      <Trash2 className="w-5 h-5 text-red-400 group-hover:scale-105 transition-transform" />
                      <span className="text-xs font-bold text-white text-red-400">Wipe LocalStorage</span>
                      <span className="text-[10px] text-zinc-400 leading-normal">
                        Completely deletes cached sidebar states, device keys, tokens, and initiates root site reload.
                      </span>
                    </button>
                  </div>

                  <div className="mt-auto border-t border-zinc-900 pt-4 flex justify-between items-center text-[10px] text-zinc-500">
                    <span>Upfitters OS developer suite v3.2.0 • build static: ready</span>
                    <span>Pairing with Google Gemini Agent</span>
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
