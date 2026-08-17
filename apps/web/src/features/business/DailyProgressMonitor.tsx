import { useState, useEffect, useMemo } from 'react';
import { collection, collectionGroup, onSnapshot, query, where, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Activity, CheckCircle2, AlertTriangle, Users, 
  TrendingUp, Car, Package, ShieldCheck
} from 'lucide-react';
import { cn } from '../../lib/utils';

const isGeneralTask = (taskOrTitle?: any) => {
  if (!taskOrTitle) return false;
  if (typeof taskOrTitle === 'object') {
    const t = (taskOrTitle.title || '').toLowerCase().trim();
    const g = (taskOrTitle.taskGroup || '').toLowerCase().trim();
    return (t === 'general' || t === 'general labor') && g === 'general';
  }
  const t = (taskOrTitle || '').toString().toLowerCase().trim();
  return t === 'general' || t === 'general labor';
};

const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val.toDate === 'function') {
    try { return val.toDate(); } catch (e) {}
  }
  if (val && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

export function DailyProgressMonitor({ tenantId }: { tenantId: string }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [businessName, setBusinessName] = useState('UPFITTERS OS');

  const [now, setNow] = useState(Date.now());

  // Clock tick every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Business Name
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(doc(db, 'businesses', tenantId), (snap) => {
      if (snap.exists()) setBusinessName(snap.data().name || 'UPFITTERS OS');
    });
    return () => unsub();
  }, [tenantId]);

  // Jobs
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [tenantId]);

  // Zones (Bays)
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      setZones(list);
    });
    return () => unsub();
  }, [tenantId]);

  // Vehicles
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), (snap) => {
      setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [tenantId]);

  // Parts Requests
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/parts_requests`), (snap) => {
      setPartsRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [tenantId]);

  // Staff List
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [tenantId]);

  // Active Time Sessions (Last 7 days)
  useEffect(() => {
    if (!tenantId) return;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('clockIn.timestamp', '>=', sevenDaysAgo)
    );
    const unsub = onSnapshot(q, (snap) => {
      setActiveSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [tenantId]);

  // All Tasks across the tenant via collectionGroup
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collectionGroup(db, 'tasks'), where('tenantId', '==', tenantId));
    const unsub = onSnapshot(q, (snap) => {
      setAllTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('Failed to subscribe to tasks collectionGroup:', err);
    });
    return () => unsub();
  }, [tenantId]);

  // Map tasks by jobId
  const tasksByJobId = useMemo(() => {
    const map: Record<string, any[]> = {};
    allTasks.forEach(task => {
      const jobId = task.jobId || (task.ref ? task.ref.parent.parent?.id : null);
      if (jobId) {
        if (!map[jobId]) map[jobId] = [];
        map[jobId].push(task);
      }
    });
    return map;
  }, [allTasks]);

  // Computing Daily Metrics
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now]);

  // 1. Completed Book Hours (Today)
  const completedBookHoursToday = useMemo(() => {
    let total = 0;
    allTasks.forEach((t: any) => {
      const compDate = parseSafeDate(t.completedAt || t.qcCompletedAt || t.updatedAt);
      const isComplete = t.status === 'QC Complete' || t.status === 'QC' || t.status === 'Completed' || t.status === 'Complete' || t.completed === true;
      if (isComplete && compDate && compDate >= todayStart) {
        total += parseFloat(t.bookTime || t.estimatedHours || t.hours || 0) || 0;
      }
    });
    return Math.round(total * 10) / 10;
  }, [allTasks, todayStart]);

  // 2. Jobs Ready for QC Fully
  const readyForQcJobs = useMemo(() => {
    return jobs.filter(j => {
      if (j.status === 'QC' || j.status === 'QC Complete' || j.status === 'Ready for QC') return true;
      const tasks = (tasksByJobId[j.id] || []).filter(t => !isGeneralTask(t));
      if (tasks.length === 0) return false;
      return tasks.every(t => t.status === 'QC' || t.status === 'QC Complete' || t.status === 'Completed' || t.completed === true);
    });
  }, [jobs, tasksByJobId]);

  // 3. Jobs Ready for Customer
  const readyForCustomerJobs = useMemo(() => {
    return jobs.filter(j => j.status === 'Ready for Customer');
  }, [jobs]);

  // 4. Parts Waiting On (Active Parts Requests)
  const waitingPartsRequests = useMemo(() => {
    return partsRequests.filter(p => {
      const st = (p.status || '').toLowerCase();
      return st === 'requested' || st === 'pending' || st === 'ordered' || st === 'awaiting delivery' || st === 'waiting' || st === 'waiting on parts';
    });
  }, [partsRequests]);

  // 5. Active Bays
  const activeBays = useMemo(() => {
    return zones.filter(z => z.type === 'bay' && z.currentJobId);
  }, [zones]);

  // 6. Blocked Jobs
  const blockedJobs = useMemo(() => {
    return jobs.filter(j => j.status === 'Blocked' || j.isBlocked || (tasksByJobId[j.id] || []).some((t: any) => t.isBlocked));
  }, [jobs, tasksByJobId]);

  // 7. Clocked In Staff
  const clockedInStaff = useMemo(() => {
    const activeUserIds = new Set(activeSessions.filter(s => !s.clockOut).map(s => s.userId));
    return staffList.filter(s => activeUserIds.has(s.id));
  }, [activeSessions, staffList]);

  // Daily target default
  const targetShopHours = Math.max(30, clockedInStaff.length * 7);
  const progressPercent = targetShopHours > 0 ? Math.min(100, Math.round((completedBookHoursToday / targetShopHours) * 100)) : 0;

  // Helper to extract REAL technician names assigned to a job or its active tasks
  const getRealTechNamesForJob = (job: any, jobTasks: any[]): string => {
    const names = new Set<string>();

    if (Array.isArray(job.assignedTechs) && job.assignedTechs.length > 0) {
      job.assignedTechs.forEach((t: any) => {
        const name = typeof t === 'string' ? t : (t.name || t.displayName || t.firstName);
        if (name) names.add(name);
      });
    }

    if (job.assignedTechName && typeof job.assignedTechName === 'string') names.add(job.assignedTechName);
    if (job.techName && typeof job.techName === 'string') names.add(job.techName);

    jobTasks.forEach(task => {
      if (Array.isArray(task.assignedStaff) && task.assignedStaff.length > 0) {
        task.assignedStaff.forEach((s: any) => {
          const name = typeof s === 'string' ? s : (s.name || s.displayName || s.firstName);
          if (name) names.add(name);
        });
      }
      if (task.assignedTechName && typeof task.assignedTechName === 'string') names.add(task.assignedTechName);
    });

    activeSessions.filter(s => !s.clockOut && s.jobId === job.id).forEach(s => {
      const staffMember = staffList.find(st => st.id === s.userId);
      if (staffMember) {
        const name = staffMember.name || staffMember.displayName || `${staffMember.firstName || ''} ${staffMember.lastName || ''}`.trim();
        if (name) names.add(name);
      }
    });

    const nameList = Array.from(names).filter(n => Boolean(n) && !n.toLowerCase().includes('kathy'));
    return nameList.length > 0 ? nameList.join(', ') : 'Unassigned';
  };

  return (
    <div className="h-[100vh] w-full bg-zinc-950 text-white p-4 lg:p-6 font-sans flex flex-col justify-between overflow-hidden select-none relative">
      
      {/* Background Ambient Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[70%] rounded-full bg-indigo-600/10 blur-[130px]" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[70%] rounded-full bg-emerald-600/10 blur-[130px]" />
      </div>

      {/* Top Header Bar */}
      <header className="flex items-center justify-between shrink-0 pb-3 border-b border-zinc-800/80 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none">{businessName}</div>
            <h1 className="text-xl font-black tracking-tight text-white mt-0.5 uppercase flex items-center gap-2.5">
              Daily Progress Live Report
              <span className="text-[9px] font-extrabold px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full tracking-widest">
                LIVE SYNC
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-2xl font-mono font-black tracking-tight text-zinc-100">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">
              {new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      </header>

      {/* 5-Column Metric Cards (Zero-Scroll 4K Layout) */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0 my-3 z-10">
        
        {/* Metric 1: Completed Book Hours */}
        <div className="bg-zinc-900/50 border border-zinc-800 p-3.5 rounded-2xl backdrop-blur-md relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest">Completed Book Hours</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-white tracking-tight">{completedBookHoursToday} <span className="text-sm font-bold text-zinc-500">hrs</span></div>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-1000"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Ready for QC Fully */}
        <div className="bg-zinc-900/50 border border-zinc-800 p-3.5 rounded-2xl backdrop-blur-md relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest">Ready for QC</span>
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-black text-white tracking-tight">{readyForQcJobs.length}</div>
          <div className="text-[9px] font-bold text-zinc-500 mt-1 uppercase tracking-wider">
            All Tasks Complete
          </div>
        </div>

        {/* Metric 3: Ready for Customer */}
        <div className="bg-zinc-900/50 border border-zinc-800 p-3.5 rounded-2xl backdrop-blur-md relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest">Ready for Customer</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-white tracking-tight">{readyForCustomerJobs.length}</div>
          <div className="text-[9px] font-bold text-zinc-500 mt-1 uppercase tracking-wider">
            Staged for Delivery
          </div>
        </div>

        {/* Metric 4: Parts Waiting On */}
        <div className={cn(
          "border p-3.5 rounded-2xl backdrop-blur-md relative overflow-hidden transition-colors",
          waitingPartsRequests.length > 0 ? "bg-amber-950/20 border-amber-900/50" : "bg-zinc-900/50 border-zinc-800"
        )}>
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest">Parts Waiting On</span>
            <Package className={cn("w-4 h-4", waitingPartsRequests.length > 0 ? "text-amber-400 animate-pulse" : "text-zinc-600")} />
          </div>
          <div className={cn("text-3xl font-black tracking-tight", waitingPartsRequests.length > 0 ? "text-amber-400" : "text-white")}>
            {waitingPartsRequests.length}
          </div>
          <div className="text-[9px] font-bold text-zinc-500 mt-1 uppercase tracking-wider">
            {waitingPartsRequests.length > 0 ? "Pending Supplier / Dispatch" : "No Pending Parts"}
          </div>
        </div>

        {/* Metric 5: Active Blockers */}
        <div className={cn(
          "border p-3.5 rounded-2xl backdrop-blur-md relative overflow-hidden transition-colors",
          blockedJobs.length > 0 ? "bg-red-950/20 border-red-900/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]" : "bg-zinc-900/50 border-zinc-800"
        )}>
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest">Active Blockers</span>
            <AlertTriangle className={cn("w-4 h-4", blockedJobs.length > 0 ? "text-red-400 animate-bounce" : "text-zinc-600")} />
          </div>
          <div className={cn("text-3xl font-black tracking-tight", blockedJobs.length > 0 ? "text-red-400" : "text-white")}>
            {blockedJobs.length}
          </div>
          <div className="text-[9px] font-bold text-zinc-500 mt-1 uppercase tracking-wider">
            {blockedJobs.length > 0 ? "Immediate Action Required" : "Zero Blocker Issues"}
          </div>
        </div>

      </section>

      {/* Main Content Grid (Zero-Scroll 4K Layout) */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0 z-10 overflow-hidden my-1">
        
        {/* Left Column: Live Bays Grid (Col-Span 8) */}
        <div className="col-span-8 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Car className="w-4 h-4 text-indigo-400" /> Active Upfitting Bays ({activeBays.length} / {zones.filter(z => z.type === 'bay').length})
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 flex-1 min-h-0 overflow-y-auto pr-1 no-scrollbar">
            {zones.filter(z => z.type === 'bay').map((bay) => {
              const job = jobs.find(j => j.id === bay.currentJobId);
              const tasks = job ? (tasksByJobId[job.id] || []) : [];
              const vehicle = job ? vehicles.find(v => (job.vin && v.vin === job.vin) || v.id === job.vehicleId) : null;
              
              const nonGeneralTasks = tasks.filter((t: any) => t && !isGeneralTask(t));
              const completedTasksCount = nonGeneralTasks.filter((t: any) => t && (t.status === 'QC Complete' || t.status === 'QC' || t.status === 'Completed' || t.status === 'Complete' || t.completed === true)).length;
              const totalTasksCount = nonGeneralTasks.length;
              const taskProgress = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;
              const isJobBlocked = job?.status === 'Blocked' || tasks.some((t: any) => t.isBlocked);

              const vehicleTitle = vehicle 
                ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
                : (job?.vehicleDescription || job?.vehicleYearMakeModel || job?.vehicleName || 'N/A');

              const customerTitle = job?.customerName || job?.clientName || 'N/A';
              const realTechName = job ? getRealTechNamesForJob(job, tasks) : 'N/A';

              return (
                <div 
                  key={bay.id}
                  className={cn(
                    "p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between relative overflow-hidden backdrop-blur-sm",
                    isJobBlocked
                      ? "bg-red-950/20 border-red-800/80"
                      : bay.currentJobId 
                        ? "bg-zinc-900/60 border-zinc-800 hover:border-indigo-500/40"
                        : "bg-zinc-950/40 border-zinc-900 opacity-60"
                  )}
                >
                  <div>
                    {/* Bay Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60 mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2.5 h-2.5 rounded-full animate-pulse", bay.currentJobId ? "bg-indigo-500" : "bg-zinc-700")} />
                        <span className="font-black text-sm text-white uppercase tracking-tight">{bay.name}</span>
                      </div>
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                        isJobBlocked
                          ? "bg-red-500/20 text-red-400 border-red-500/30"
                          : bay.currentJobId
                            ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                            : "bg-zinc-800 text-zinc-500 border-zinc-700"
                      )}>
                        {isJobBlocked ? "BLOCKED" : bay.currentJobId ? "IN PROGRESS" : "AVAILABLE"}
                      </span>
                    </div>

                    {/* Vehicle & Job Information */}
                    {job ? (
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs font-extrabold text-white truncate">
                            {vehicleTitle}
                          </div>
                          <div className="text-[10px] font-bold text-zinc-400 truncate mt-0.5">
                            Cust: <span className="text-zinc-200">{customerTitle}</span> • Job #{job.jobNumber || job.id.slice(0,6)}
                          </div>
                        </div>

                        {/* Task Progress */}
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-zinc-400 uppercase tracking-wider">Progress</span>
                            <span className="text-indigo-400 font-mono">
                              {totalTasksCount > 0 ? `${completedTasksCount}/${totalTasksCount} (${taskProgress}%)` : 'No tasks'}
                            </span>
                          </div>
                          <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all duration-700",
                                isJobBlocked ? "bg-red-500" : "bg-gradient-to-r from-indigo-500 to-cyan-400"
                              )}
                              style={{ width: `${totalTasksCount > 0 ? taskProgress : 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 text-center text-zinc-600 font-bold uppercase tracking-widest text-[10px]">
                        Bay Empty
                      </div>
                    )}
                  </div>

                  {/* Footer info */}
                  {job && (
                    <div className="pt-2 mt-2 border-t border-zinc-850 flex items-center justify-between text-[10px] text-zinc-500 font-bold uppercase">
                      <span className="truncate max-w-[70%]">Tech: <strong className={cn("text-zinc-300", realTechName === 'Unassigned' && "text-zinc-500 font-normal italic")}>{realTechName}</strong></span>
                      <span className="text-indigo-400 font-mono shrink-0">{job.status || 'Active'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Ready / QC & Parts Waiting Feed (Col-Span 4) */}
        <div className="col-span-4 flex flex-col gap-3 min-h-0 overflow-hidden">
          
          {/* Panel 1: Ready for QC & Ready for Customer Jobs */}
          <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-2xl backdrop-blur-md flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Ready Jobs Staged ({readyForQcJobs.length + readyForCustomerJobs.length})
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 no-scrollbar">
              {readyForCustomerJobs.map(j => (
                <div key={j.id} className="p-2.5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-extrabold text-white block truncate">{j.vehicleDescription || j.customerName || `Job #${j.jobNumber || j.id.slice(0,6)}`}</span>
                    <span className="text-[9px] text-emerald-400 font-bold uppercase block mt-0.5">READY FOR CUSTOMER • {j.customerName || 'Client'}</span>
                  </div>
                  <span className="text-[9px] font-black px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30 shrink-0 ml-2">DELIVERY</span>
                </div>
              ))}

              {readyForQcJobs.map(j => (
                <div key={j.id} className="p-2.5 bg-cyan-950/20 border border-cyan-500/30 rounded-xl flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-extrabold text-white block truncate">{j.vehicleDescription || j.customerName || `Job #${j.jobNumber || j.id.slice(0,6)}`}</span>
                    <span className="text-[9px] text-cyan-400 font-bold uppercase block mt-0.5">ALL TASKS COMPLETE • {j.customerName || 'Client'}</span>
                  </div>
                  <span className="text-[9px] font-black px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30 shrink-0 ml-2">READY FOR QC</span>
                </div>
              ))}

              {readyForCustomerJobs.length === 0 && readyForQcJobs.length === 0 && (
                <div className="text-center py-6 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
                  No Jobs Pending QC or Customer Delivery
                </div>
              )}
            </div>
          </div>

          {/* Panel 2: Parts Waiting On Feed */}
          <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-2xl backdrop-blur-md flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                <Package className="w-4 h-4" /> Parts Waiting On ({waitingPartsRequests.length})
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 no-scrollbar">
              {waitingPartsRequests.map(p => (
                <div key={p.id} className="p-2.5 bg-amber-950/20 border border-amber-500/30 rounded-xl flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-extrabold text-zinc-100 block truncate">{p.partName || p.partNumber || p.description || 'Custom Part Request'}</span>
                    <span className="text-[9px] text-amber-400 font-bold uppercase block mt-0.5">
                      Job #{p.jobNumber || p.jobId?.slice(0,6) || 'N/A'} • Req by: {p.requestedBy || p.createdByName || 'Staff'}
                    </span>
                  </div>
                  <span className="text-[9px] font-black px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 shrink-0 ml-2 uppercase font-mono">
                    {p.status || 'PENDING'}
                  </span>
                </div>
              ))}

              {waitingPartsRequests.length === 0 && (
                <div className="text-center py-6 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
                  All Parts Fulfilled & Dispatched
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Footer Bar */}
      <footer className="shrink-0 pt-2.5 border-t border-zinc-900 flex items-center justify-between text-[11px] text-zinc-500 font-bold uppercase tracking-wider z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="shrink-0">Clocked In Staff ({clockedInStaff.length}):</span>
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-2xl no-scrollbar">
            {clockedInStaff.map(s => (
              <span key={s.id} className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md text-[9px] shrink-0">
                {s.name || s.displayName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Staff'}
              </span>
            ))}
            {clockedInStaff.length === 0 && <span className="text-zinc-600">No staff clocked in</span>}
          </div>
        </div>

        <div className="text-[9px] text-zinc-600 font-mono shrink-0">
          UPFITTERS OS • 4K ZERO-SCROLL LIVE DIGEST
        </div>
      </footer>

    </div>
  );
}
