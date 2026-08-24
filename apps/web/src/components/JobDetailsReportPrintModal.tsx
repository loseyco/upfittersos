import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Printer, 
  FileText, 
  X, 
  Users, 
  Wrench, 
  Package, 
  Timer, 
  Clock, 
  CheckCircle2, 
  RefreshCw 
} from 'lucide-react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase/config';
import { LogoQRCode } from './LogoQRCode';
import { cn } from '../lib/utils';

interface JobDetailsReportPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  tenantId: string;
  initialJobData?: any;
}

export function JobDetailsReportPrintModal({
  isOpen,
  onClose,
  jobId,
  tenantId,
  initialJobData
}: JobDetailsReportPrintModalProps) {
  const [job, setJob] = useState<any>(initialJobData || null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [takeoffs, setTakeoffs] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [businessProfile, setBusinessProfile] = useState<any>(null);

  // Load Job data and all associated subcollections
  useEffect(() => {
    if (!isOpen || !jobId || !tenantId) return;

    let isMounted = true;
    setLoading(true);

    const loadData = async () => {
      try {
        // 1. Fetch Job doc if not fully loaded
        let currentJob = initialJobData;
        if (!currentJob || !currentJob.customerName || !currentJob.title) {
          const jobSnap = await getDoc(doc(db, `businesses/${tenantId}/jobs`, jobId));
          if (jobSnap.exists()) {
            currentJob = { id: jobSnap.id, ...jobSnap.data() };
          }
        }
        if (isMounted) setJob(currentJob);

        // 2. Fetch Tasks subcollection
        const tasksSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`));
        const fetchedTasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (isMounted) setTasks(fetchedTasks);

        // 3. Fetch Parts Requests / Parts subcollection
        try {
          const partsSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs/${jobId}/parts_requests`));
          const fetchedParts = partsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (isMounted) setPartsRequests(fetchedParts);
        } catch {
          try {
            const fallbackPartsSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs/${jobId}/parts`));
            const fetchedFallbackParts = fallbackPartsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (isMounted) setPartsRequests(fetchedFallbackParts);
          } catch {}
        }

        // 4. Fetch Takeoffs subcollection
        try {
          const takeoffsSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs/${jobId}/takeoffs`));
          const fetchedTakeoffs = takeoffsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (isMounted) setTakeoffs(fetchedTakeoffs);
        } catch {}

        // 5. Fetch Time Sessions & Staff
        try {
          const sessionsSnap = await getDocs(collection(db, `businesses/${tenantId}/time_sessions`));
          const fetchedSessions = sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (isMounted) setSessions(fetchedSessions);

          const staffSnap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
          const fetchedStaff = staffSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (isMounted) setStaffList(fetchedStaff);
        } catch {}

        // 6. Fetch Business Profile for Logo / Name
        try {
          const bizSnap = await getDoc(doc(db, 'businesses', tenantId));
          if (bizSnap.exists() && isMounted) {
            setBusinessProfile(bizSnap.data());
          }
        } catch {}

      } catch (err) {
        console.error("Error loading job details for print modal:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, jobId, tenantId, initialJobData]);

  // Helpers
  const formatJobDate = (dateVal: any) => {
    if (!dateVal) return 'Not Scheduled';
    try {
      if (dateVal.toDate) return dateVal.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return new Date(dateVal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return String(dateVal);
    }
  };

  const getTaskClockedMs = (taskId: string) => {
    let dur = 0;
    sessions.forEach(session => {
      (session.jobs || []).forEach((jTask: any) => {
        if (jTask.taskId === taskId || jTask.id === taskId) {
          const start = jTask.start?.toDate ? jTask.start.toDate().getTime() : new Date(jTask.start).getTime();
          let endMs = Date.now();
          if (jTask.end) {
            endMs = jTask.end.toDate ? jTask.end.toDate().getTime() : new Date(jTask.end).getTime();
          } else if (session.status === 'completed' || session.clockOut?.timestamp) {
            const clockOutVal = session.clockOut?.timestamp;
            if (clockOutVal) {
              endMs = clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime();
            } else {
              const updatedVal = session.updatedAt || session.createdAt;
              endMs = updatedVal?.toDate ? updatedVal.toDate().getTime() : new Date(updatedVal || start).getTime();
            }
          }
          dur += Math.max(0, endMs - start);
        }
      });
    });
    return dur;
  };

  // Aggregated Stats
  const {
    totalBookHours,
    completedBookHours,
    jobProgress,
    staffStats,
    jobEfficiencyStats
  } = useMemo(() => {
    let totBook = 0;
    let compBook = 0;
    let totActualMs = 0;

    const staffMap = new Map<string, {
      id: string;
      name: string;
      totalTasks: number;
      completedTasks: number;
      clockedMs: number;
      completedBookHours: number;
    }>();

    tasks.forEach((t: any) => {
      const bookH = parseFloat(t.bookTime) || 0;
      totBook += bookH;

      const isDone = ['completed', 'QC', 'QC Complete'].includes(t.status);
      if (isDone) compBook += bookH;

      const taskActualMs = getTaskClockedMs(t.id);
      totActualMs += taskActualMs;

      // Staff breakdown
      const assignedIds: string[] = Array.isArray(t.assignedStaffIds) && t.assignedStaffIds.length > 0
        ? t.assignedStaffIds
        : (t.assignedTechId ? [t.assignedTechId] : (Array.isArray(t.assignedStaff) ? t.assignedStaff.map((s: any) => s.id) : []));

      assignedIds.forEach(sid => {
        if (!staffMap.has(sid)) {
          const found = staffList.find(s => s.id === sid || s.userId === sid);
          const name = found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name : 'Technician';
          staffMap.set(sid, {
            id: sid,
            name,
            totalTasks: 0,
            completedTasks: 0,
            clockedMs: 0,
            completedBookHours: 0
          });
        }
        const record = staffMap.get(sid)!;
        record.totalTasks += 1;
        if (isDone) {
          record.completedTasks += 1;
          const share = assignedIds.length > 0 ? (bookH / assignedIds.length) : bookH;
          record.completedBookHours += share;
        }
      });
    });

    // Add session time to staff
    sessions.forEach(session => {
      const sid = session.userId;
      if (!sid) return;
      (session.jobs || []).forEach((jTask: any) => {
        const matchingTask = tasks.find(t => t.id === jTask.taskId || t.id === jTask.id);
        if (matchingTask) {
          const start = jTask.start?.toDate ? jTask.start.toDate().getTime() : new Date(jTask.start).getTime();
          let endMs = Date.now();
          if (jTask.end) {
            endMs = jTask.end.toDate ? jTask.end.toDate().getTime() : new Date(jTask.end).getTime();
          } else if (session.status === 'completed' || session.clockOut?.timestamp) {
            const clockOutVal = session.clockOut?.timestamp;
            if (clockOutVal) {
              endMs = clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime();
            } else {
              const updatedVal = session.updatedAt || session.createdAt;
              endMs = updatedVal?.toDate ? updatedVal.toDate().getTime() : new Date(updatedVal || start).getTime();
            }
          }
          const dur = Math.max(0, endMs - start);
          if (!staffMap.has(sid)) {
            const found = staffList.find(s => s.id === sid || s.userId === sid);
            const name = found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name || session.userName : 'Technician';
            staffMap.set(sid, {
              id: sid,
              name,
              totalTasks: 0,
              completedTasks: 0,
              clockedMs: 0,
              completedBookHours: 0
            });
          }
          staffMap.get(sid)!.clockedMs += dur;
        }
      });
    });

    const staffStatsList = Array.from(staffMap.values()).map(s => ({
      ...s,
      clockedHours: s.clockedMs / 3600000,
      completedHours: s.completedBookHours
    }));

    const totalActualHours = totActualMs / 3600000;
    const variance = totalActualHours - totBook;
    const efficiency = totalActualHours > 0 ? (totBook / totalActualHours) * 100 : 0;
    const progress = totBook > 0 ? Math.round((compBook / totBook) * 100) : (tasks.length > 0 ? Math.round((tasks.filter(t => ['completed', 'QC', 'QC Complete'].includes(t.status)).length / tasks.length) * 100) : 0);

    return {
      totalBookHours: totBook,
      completedBookHours: compBook,
      jobProgress: progress,
      staffStats: staffStatsList,
      jobEfficiencyStats: {
        totalBook: totBook,
        totalActual: totalActualHours,
        variance,
        efficiency
      }
    };
  }, [tasks, sessions, staffList]);

  if (!isOpen) return null;

  const customerDisplayName = job?.customerName || job?.customer || 'Walk-in Customer';
  const jobDisplayNumber = job?.jobNumber || job?.id?.slice(0, 8);
  const vehicleDisplay = [job?.year || job?.vehicleYear, job?.make || job?.vehicleMake, job?.model || job?.vehicleModel].filter(Boolean).join(' ') || job?.vehicle || job?.vehicleName || 'Vehicle';
  const vehicleVin = job?.vin || job?.vehicleVin || job?.VIN || '';
  const businessName = businessProfile?.name || 'UpfittersOS';
  const businessLogo = businessProfile?.logoUrl || businessProfile?.logo || '';

  const pendingTasks = tasks.filter(t => !['completed', 'QC', 'QC Complete'].includes(t.status));
  const completedTasks = tasks.filter(t => ['completed', 'QC', 'QC Complete'].includes(t.status));

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-950/85 backdrop-blur-sm animate-in fade-in duration-200 job-report-modal-wrapper">
      {/* Print Style Injector */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 0.4in;
          }

          /* Hide everything outside modal */
          body > *:not(.job-report-modal-wrapper) {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .no-print,
          .no-print * {
            display: none !important;
            height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .job-report-modal-wrapper,
          .job-report-modal-container,
          .job-report-modal-container > div,
          .job-report-modal-container > div > div {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            float: none !important;
            flex: none !important;
            animation: none !important;
            transition: none !important;
            transform: none !important;
            opacity: 1 !important;
            visibility: visible !important;
          }

          #job-report-print-area {
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            position: static !important;
          }

          .print-no-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      ` }} />

      <div className="w-full max-w-4xl h-[92vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 job-report-modal-container">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/70 no-print shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <span>Job Details Sheet</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-black">
                  #{jobDisplayNumber}
                </span>
              </h3>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{customerDisplayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Details Sheet</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-zinc-100 dark:bg-zinc-950/40 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-indigo-500">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <span className="font-bold text-sm text-zinc-400">Loading full job details & specifications...</span>
            </div>
          ) : (
            <div 
              id="job-report-print-area" 
              className="bg-white text-zinc-900 p-6 sm:p-8 rounded-2xl border border-zinc-200 shadow-md font-sans mx-auto max-w-[800px]"
            >
              {/* Print Header */}
              <div className="border-b-2 border-indigo-900 pb-4 mb-6 flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-black uppercase tracking-tight text-indigo-950">JOB DETAILS SHEET</h1>
                  <p className="text-sm font-bold text-zinc-500 mt-1 uppercase tracking-wider">
                    {customerDisplayName} &bull; Job #{jobDisplayNumber}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div className="flex flex-col items-end">
                    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Report Date</div>
                    <div className="text-xs font-bold font-mono">{new Date().toLocaleDateString()}</div>
                  </div>
                  <LogoQRCode 
                    value={`${window.location.origin}/business/${tenantId}/job/${jobId}`} 
                    size={56} 
                    logoUrl={businessLogo}
                    businessName={businessName}
                    type="job"
                  />
                </div>
              </div>

              {/* Overview Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 mb-6 text-xs print-no-break">
                <div>
                  <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Job Title</span>
                  <span className="font-bold text-zinc-800">{job?.title || job?.name || 'Production Job'}</span>
                </div>
                <div>
                  <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Vehicle</span>
                  <span className="font-bold text-zinc-800 block">
                    {vehicleDisplay}
                  </span>
                  {vehicleVin && (
                    <span className="font-mono text-[10px] text-zinc-500 block truncate">
                      VIN: {vehicleVin}
                    </span>
                  )}
                </div>
                <div>
                  <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Location / Bay</span>
                  <span className="font-bold text-zinc-800">{job?.bay || job?.parkingSpot || 'Main Floor'}</span>
                </div>
                <div>
                  <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Scheduled Start</span>
                  <span className="font-bold text-zinc-800">{formatJobDate(job?.scheduledStartDate || job?.createdAt)}</span>
                </div>
                <div>
                  <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Deadline</span>
                  <span className="font-bold text-zinc-800">{formatJobDate(job?.scheduledEndDate || job?.deadline)}</span>
                </div>
                <div>
                  <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Status</span>
                  <span className="font-bold text-indigo-900 uppercase font-mono">{job?.status || 'In Progress'}</span>
                </div>
                <div className="col-span-2 sm:col-span-3 mt-2 pt-2 border-t border-indigo-100 flex items-center justify-between">
                  <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Total Job Progress</span>
                  <div className="flex items-center gap-3 w-4/5">
                    <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${jobProgress}%` }} />
                    </div>
                    <span className="font-bold font-mono text-zinc-800 text-xs whitespace-nowrap">
                      {completedBookHours.toFixed(1)}h / {totalBookHours.toFixed(1)}h ({jobProgress}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Staff Workload Section */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-6 text-xs print-no-break">
                <h3 className="text-xs font-black text-zinc-700 border-b border-zinc-200 pb-1.5 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Staff Workload Allocation
                </h3>
                {staffStats.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No staff assigned.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-zinc-200 text-zinc-400 font-bold uppercase tracking-wider text-[9px]">
                          <th className="py-1">Technician</th>
                          <th className="py-1 text-center">Tasks (Done / Total)</th>
                          <th className="py-1 text-right">Time Clocked</th>
                          <th className="py-1 text-right">Book Time Earned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {staffStats.map(s => (
                          <tr key={s.id}>
                            <td className="py-1.5 font-bold text-zinc-700">{s.name}</td>
                            <td className="py-1.5 text-center text-zinc-500 font-mono">{s.completedTasks} / {s.totalTasks}</td>
                            <td className="py-1.5 text-right font-mono font-bold text-zinc-700">
                              {s.clockedHours.toFixed(1)}h
                            </td>
                            <td className="py-1.5 text-right font-mono font-bold text-indigo-700">
                              {s.completedHours.toFixed(1)}h
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Missing / Pending Parts Section */}
              {partsRequests.length > 0 && (
                <div className="mb-6 print-no-break">
                  <h2 className="text-xs font-black text-amber-600 border-b border-amber-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    Requested Parts ({partsRequests.length})
                  </h2>
                  <div className="divide-y divide-zinc-100">
                    {partsRequests.map(p => (
                      <div key={p.id} className="py-2 flex justify-between items-center gap-4 text-xs">
                        <div>
                          <h4 className="font-bold text-zinc-800">{p.partName || p.title || p.description || 'Requested Part'}</h4>
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            Qty: {p.quantity || p.qty || 1} {p.partNumber ? `• PN: ${p.partNumber}` : ''} {p.taskTitle ? `• Task: ${p.taskTitle}` : ''}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-widest rounded border border-amber-200 shrink-0">
                          {p.status || 'requested'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Removed Parts (Takeoffs) Section */}
              {takeoffs.length > 0 && (
                <div className="mb-6 print-no-break">
                  <h2 className="text-xs font-black text-amber-600 border-b border-amber-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    Removed Parts / Takeoffs ({takeoffs.length})
                  </h2>
                  <div className="divide-y divide-zinc-100">
                    {takeoffs.map(t => (
                      <div key={t.id} className="py-2 flex justify-between items-center gap-4 text-xs">
                        <div>
                          <h4 className="font-bold text-zinc-800">{t.name || t.partName || 'Takeoff Item'}</h4>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                            {t.serialNumber && <span>S/N: <strong className="font-mono">{t.serialNumber}</strong></span>}
                            {t.location && <span>• Loc: {t.location}</span>}
                            {t.notes && <span className="italic">• {t.notes}</span>}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 text-[8px] font-black uppercase tracking-widest rounded border border-zinc-200 shrink-0">
                          {t.condition || 'Good'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Efficiency Report Summary */}
              {jobEfficiencyStats.totalActual > 0 && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-6 text-xs print-no-break">
                  <div className="flex items-center justify-between mb-3 border-b border-zinc-200 pb-2">
                    <h3 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5 text-indigo-600" />
                      Job Efficiency Metrics
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Total Book Allotment</span>
                      <span className="font-mono font-bold text-zinc-800 text-sm">{jobEfficiencyStats.totalBook.toFixed(1)}h</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Total Clocked Hours</span>
                      <span className="font-mono font-bold text-zinc-800 text-sm">{jobEfficiencyStats.totalActual.toFixed(1)}h</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Variance</span>
                      <span className={cn(
                        "font-mono font-bold text-sm",
                        jobEfficiencyStats.variance > 0.1 ? "text-rose-600" : "text-emerald-600"
                      )}>
                        {jobEfficiencyStats.variance > 0 ? `+${jobEfficiencyStats.variance.toFixed(1)}h` : `${jobEfficiencyStats.variance.toFixed(1)}h`}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Overall Efficiency</span>
                      <span className={cn(
                        "font-mono font-bold text-sm px-1.5 py-0.5 rounded",
                        jobEfficiencyStats.efficiency && jobEfficiencyStats.efficiency >= 100 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      )}>
                        {jobEfficiencyStats.efficiency ? `${jobEfficiencyStats.efficiency.toFixed(0)}%` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tasks Pending Section */}
              <div className="mb-6 print-no-break">
                <h2 className="text-xs font-black text-indigo-600 border-b border-indigo-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  What Needs to be Done ({pendingTasks.length})
                </h2>
                {pendingTasks.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">All tasks completed successfully!</p>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {pendingTasks.map(t => {
                      const loggedMs = getTaskClockedMs(t.id);
                      const clockedHours = loggedMs / 3600000;
                      const bookHours = parseFloat(t.bookTime) || 0;
                      const assignedList = (t.assignedStaff && t.assignedStaff.length > 0)
                        ? t.assignedStaff
                        : (t.assignedStaffIds || []).map((sid: string) => {
                            const found = staffList.find(s => s.id === sid || s.userId === sid);
                            return { id: sid, name: found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name : 'Technician' };
                          });

                      return (
                        <div key={t.id} className="py-2.5 flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-zinc-800">{t.title || t.name || 'Task'}</h4>
                              {t.taskGroup && (
                                <span className="px-1.5 py-0.2 bg-zinc-100 text-zinc-500 text-[8px] font-bold rounded">
                                  {t.taskGroup}
                                </span>
                              )}
                            </div>
                            {t.description && (
                              <p className="text-[10px] text-zinc-500 mt-0.5 whitespace-pre-wrap">{t.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-400">
                              {assignedList.length > 0 && (
                                <span>Techs: <strong className="text-zinc-600">{assignedList.map((a: any) => a.name).join(', ')}</strong></span>
                              )}
                              {clockedHours > 0 && (
                                <span>Clocked: <strong className="font-mono text-zinc-600">{clockedHours.toFixed(1)}h</strong></span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-xs text-zinc-800">
                              {bookHours > 0 ? `${bookHours.toFixed(1)}h Book` : 'Hourly'}
                            </div>
                            <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-[8px] font-black uppercase rounded mt-0.5 inline-block">
                              {t.status || 'Pending'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quality Control & Completed Tasks Section */}
              <div className="print-no-break">
                <h2 className="text-xs font-black text-emerald-600 border-b border-emerald-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Quality Control & Completed Tasks ({completedTasks.length})
                </h2>
                {completedTasks.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No tasks completed yet.</p>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {completedTasks.map(t => {
                      const bookHours = parseFloat(t.bookTime) || 0;
                      const completerName = t.completedByStaffName || t.completedBy || 'Technician';

                      return (
                        <div key={t.id} className="py-2.5 flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-zinc-800 line-through opacity-80">{t.title || t.name}</h4>
                              {t.taskGroup && (
                                <span className="px-1.5 py-0.2 bg-zinc-100 text-zinc-500 text-[8px] font-bold rounded">
                                  {t.taskGroup}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-400">
                              <span>Completed by: <strong className="text-zinc-600">{completerName}</strong></span>
                              {t.qcCompletedBy && (
                                <span>QC Verified: <strong className="text-emerald-700">{t.qcCompletedBy}</strong></span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-xs text-indigo-900">
                              {bookHours > 0 ? `${bookHours.toFixed(1)}h` : 'Completed'}
                            </div>
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase rounded mt-0.5 inline-block border border-emerald-200">
                              {t.status === 'QC Complete' ? 'QC Passed' : (t.status === 'QC' ? 'In QC' : 'Done')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
