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
  Camera,
  MessageSquare,
  AlertTriangle,
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

const getConditionPrintColor = (condition: string) => {
  switch(condition) {
    case 'Good': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'Broken': return 'text-rose-700 bg-rose-50 border-rose-200';
    case 'Missing Parts': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Needs Repair': return 'text-orange-700 bg-orange-50 border-orange-200';
    default: return 'text-zinc-700 bg-zinc-50 border-zinc-200';
  }
};

function formatDateSafe(val: any, includeTime: boolean = false): string {
  if (!val) return 'N/A';
  try {
    let d: Date | null = null;
    if (typeof val === 'object' && 'seconds' in val && typeof val.seconds === 'number') {
      d = new Date(val.seconds * 1000);
    } else if (typeof val === 'object' && 'toDate' in val && typeof val.toDate === 'function') {
      d = val.toDate();
    } else if (val instanceof Date) {
      d = val;
    } else if (typeof val === 'string' || typeof val === 'number') {
      d = new Date(val);
    }

    if (!d || isNaN(d.getTime())) return 'N/A';

    return includeTime 
      ? d.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
  } catch {
    return 'N/A';
  }
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
  const [timeSessions, setTimeSessions] = useState<any[]>([]);
  const [allStaff, setAllStaff] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [vehicle, setVehicle] = useState<any>(null);
  const [businessProfile, setBusinessProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Load Job data and all associated subcollections
  useEffect(() => {
    if (!isOpen || !jobId || !tenantId) return;

    let isMounted = true;
    setLoading(true);

    const loadData = async () => {
      try {
        // 1. Fetch Job doc
        let currentJob = initialJobData;
        const jobSnap = await getDoc(doc(db, `businesses/${tenantId}/jobs`, jobId));
        if (jobSnap.exists()) {
          currentJob = { id: jobSnap.id, ...jobSnap.data() };
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
          if (isMounted) setTimeSessions(fetchedSessions);

          const staffSnap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
          const fetchedStaff = staffSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (isMounted) setAllStaff(fetchedStaff);
        } catch {}

        // 6. Fetch Chat Messages subcollection
        try {
          const chatSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs/${jobId}/messages`));
          const fetchedChat = chatSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (isMounted) setChatMessages(fetchedChat);
        } catch {}

        // 7. Fetch Linked Vehicle Doc if vehicleId exists
        if (currentJob?.vehicleId) {
          try {
            const vehicleSnap = await getDoc(doc(db, `businesses/${tenantId}/vehicles`, currentJob.vehicleId));
            if (vehicleSnap.exists() && isMounted) {
              setVehicle({ id: vehicleSnap.id, ...vehicleSnap.data() });
            }
          } catch {}
        }

        // 8. Fetch Business Profile for Logo / Name
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

  // Helper for task logged time
  const getTaskClockedMs = (taskId: string) => {
    let dur = 0;
    timeSessions.forEach(session => {
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

  // QC Notes derivation for report
  const qcNotes = useMemo(() => {
    return tasks.flatMap((task: any) => 
      (task.task_notes || [])
        .filter((note: any) => (note.message || '').startsWith('[QC '))
        .map((note: any) => {
          const isPass = (note.message || '').startsWith('[QC VERIFIED]');
          const cleanMessage = (note.message || '')
            .replace('[QC VERIFIED]', '')
            .replace('[QC FAILED]', '')
            .trim();
          return {
            id: note.id || `${task.id}_${note.createdAt}`,
            taskId: task.id,
            taskTitle: task.title || task.name,
            isPass,
            message: cleanMessage,
            images: note.images || [],
            createdAt: note.createdAt,
            createdByName: note.createdByName || note.userName || 'Inspector'
          };
        })
    ).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tasks]);

  const qcPhotoNotes = useMemo(() => qcNotes.filter((qc: any) => qc.images && qc.images.length > 0), [qcNotes]);

  // Staff Workload Allocation Stats for report
  const staffStats = useMemo(() => {
    const statsMap: Record<string, {
      name: string;
      id: string;
      totalHours: number;
      completedHours: number;
      totalTasks: number;
      completedTasks: number;
      clockedHours: number;
    }> = {};

    tasks.forEach(task => {
      const isCompleted = ['QC', 'QC Complete', 'completed', 'Completed'].includes(task.status);
      const actualMs = getTaskClockedMs(task.id);
      const taskActualHours = actualMs / 3600000;
      const bookTime = task.payBasis === 'hourly' ? taskActualHours : (parseFloat(task.bookTime) || 0);

      const assignedStaff = (task.assignedStaff && task.assignedStaff.length > 0)
        ? task.assignedStaff
        : (task.assignedStaffIds || []).map((sid: string) => {
            const found = allStaff.find(s => s.id === sid || s.userId === sid);
            return { id: sid, name: found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name : 'Technician' };
          });

      if (assignedStaff.length === 0) {
        const staffId = 'unassigned';
        const staffName = 'Unassigned';
        if (!statsMap[staffId]) {
          statsMap[staffId] = {
            name: staffName,
            id: staffId,
            totalHours: 0,
            completedHours: 0,
            totalTasks: 0,
            completedTasks: 0,
            clockedHours: 0
          };
        }
        statsMap[staffId].totalHours += bookTime;
        statsMap[staffId].totalTasks += 1;
        statsMap[staffId].clockedHours += taskActualHours;
        if (isCompleted) {
          statsMap[staffId].completedHours += bookTime;
          statsMap[staffId].completedTasks += 1;
        }
      } else {
        const portionBook = bookTime / assignedStaff.length;
        const portionClocked = taskActualHours / assignedStaff.length;

        assignedStaff.forEach((staff: any) => {
          const staffId = staff.id || staff.uid;
          const staffName = staff.name || staff.displayName || 'Technician';

          if (!statsMap[staffId]) {
            statsMap[staffId] = {
              name: staffName,
              id: staffId,
              totalHours: 0,
              completedHours: 0,
              totalTasks: 0,
              completedTasks: 0,
              clockedHours: 0
            };
          }

          statsMap[staffId].totalHours += portionBook;
          statsMap[staffId].totalTasks += 1;
          statsMap[staffId].clockedHours += portionClocked;
          if (isCompleted) {
            statsMap[staffId].completedHours += portionBook;
            statsMap[staffId].completedTasks += 1;
          }
        });
      }
    });

    return Object.values(statsMap);
  }, [tasks, timeSessions, allStaff]);

  // Overall Job Efficiency Stats for report
  const jobEfficiencyStats = useMemo(() => {
    const totalBook = tasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);
    let totalActualMs = 0;
    tasks.forEach(t => {
      totalActualMs += getTaskClockedMs(t.id);
    });
    const totalActual = totalActualMs / 3600000;
    const variance = totalActual - totalBook;
    const efficiency = totalActual > 0 ? (totalBook / totalActual) * 100 : (totalBook > 0 ? 100 : 0);

    return { totalBook, totalActual, variance, efficiency };
  }, [tasks, timeSessions]);

  const totalBookHours = useMemo(() => tasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0), [tasks]);
  const completedBookHours = useMemo(() => tasks.filter(t => ['completed', 'QC Complete', 'QC'].includes(t.status)).reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0), [tasks]);
  const jobProgress = useMemo(() => totalBookHours > 0 ? Math.min(100, Math.round((completedBookHours / totalBookHours) * 100)) : (tasks.length > 0 ? Math.round((tasks.filter(t => ['completed', 'QC Complete', 'QC'].includes(t.status)).length / tasks.length) * 100) : 0), [totalBookHours, completedBookHours, tasks]);
  const formatJobDate = (dateVal: any) => dateVal ? formatDateSafe(dateVal) : 'N/A';

  if (!isOpen) return null;

  const customerDisplayName = job?.customerName || job?.customer || 'Walk-in Customer';
  const jobDisplayNumber = job?.jobNumber || job?.id?.slice(0, 8);
  const vehicleYearMakeModel = [
    vehicle?.year || job?.year || job?.vehicleYear,
    vehicle?.make || job?.make || job?.vehicleMake,
    vehicle?.model || job?.model || job?.vehicleModel
  ].filter(Boolean).join(' ') || job?.vehicleYearMakeModel || job?.vehicle || job?.vehicleName || 'Not Specified';
  const vehicleVinRaw = vehicle?.vin || job?.vin || job?.vehicleVin || job?.VIN || '';

  const businessName = businessProfile?.name || 'UpfittersOS';
  const businessLogo = businessProfile?.logoUrl || businessProfile?.logo || '';

  const etaString = job?.etaString || (job?.scheduledEndDate ? formatDateSafe(job?.scheduledEndDate) : 'Pending Schedule');

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200 job-report-modal-wrapper">
      {/* Print Style Injector */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 0.4in;
          }

          /* 1. Hide everything under body that isn't the modal wrapper */
          body > *:not(.job-report-modal-wrapper) {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* 2. Hide any headers/buttons/sidebars marked no-print inside the modal */
          .no-print,
          .no-print * {
            display: none !important;
            height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* 3. Reset the modal wrapper and ALL intermediate layout containers to simple block containers with auto-height and no animation/transform offsets */
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

          /* 4. Style the print card itself to take full width naturally starting at the top of Page 1 */
          #job-report-print-area {
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            position: static !important;
            animation: none !important;
            transition: none !important;
            transform: none !important;
          }

          /* 5. Prevent splitting cards in half */
          .print-no-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      ` }} />

      <div className="w-full max-w-4xl h-[90vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 job-report-modal-container">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 no-print shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Job Details Sheet</h3>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Preview or Print</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Report Preview */}
          <div className="flex-1 overflow-y-auto p-6 bg-zinc-100 dark:bg-zinc-950/40 custom-scrollbar">
            <div className="mb-3 flex justify-between items-center no-print">
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Document Preview</span>
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Print Details Sheet
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-indigo-500">
                <RefreshCw className="w-8 h-8 animate-spin" />
                <span className="font-bold text-sm text-zinc-400">Loading full job details & specifications...</span>
              </div>
            ) : (
              /* Printable Area Wrapper */
              <div 
                id="job-report-print-area" 
                className="bg-white text-zinc-900 p-8 rounded-2xl border border-zinc-200 shadow-md font-sans mx-auto max-w-[800px]"
              >
                {/* Print Header */}
                <div className="border-b-2 border-indigo-900 pb-4 mb-6 flex justify-between items-start">
                  <div>
                    <h1 className="text-2xl font-black uppercase tracking-tight text-indigo-950">JOB DETAILS SHEET</h1>
                    <p className="text-sm font-bold text-zinc-500 mt-1 uppercase tracking-wider">
                      {customerDisplayName || 'Walk-in Customer'} &bull; Job #{jobDisplayNumber}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div className="flex flex-col items-end">
                      <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Report Date</div>
                      <div className="text-xs font-bold font-mono">{new Date().toLocaleDateString()}</div>
                    </div>
                    <LogoQRCode 
                      value={`${window.location.origin}/business/${tenantId}/job/${jobId}`} 
                      size={60} 
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
                      {vehicleYearMakeModel || 'Not Specified'}
                    </span>
                    {vehicleVinRaw && (
                      <span className="font-mono text-[10px] text-zinc-500 block truncate">
                        VIN: {vehicleVinRaw}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Scheduled Bay</span>
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
                    <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Dynamic ETA</span>
                    <span className="font-bold text-indigo-900">{etaString}</span>
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
                              <td className="py-2 font-bold text-zinc-700">{s.name}</td>
                              <td className="py-2 text-center text-zinc-500">{s.completedTasks} / {s.totalTasks}</td>
                              <td className="py-2 text-right font-mono font-bold text-zinc-700">
                                {s.clockedHours.toFixed(1)}h
                              </td>
                              <td className="py-2 text-right font-mono font-bold text-indigo-700">
                                {s.completedHours.toFixed(1)}h
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Missing Parts Section */}
                <div className="mb-6 print-no-break">
                  <h2 className="text-xs font-black text-amber-600 border-b border-amber-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    Missing / Pending Parts
                  </h2>
                  {partsRequests.filter(p => p.status !== 'received' && p.status !== 'delivered' && p.status !== 'fulfilled' && p.status !== 'inventoried').length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">No parts pending requests.</p>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {partsRequests.filter(p => p.status !== 'received' && p.status !== 'delivered' && p.status !== 'fulfilled' && p.status !== 'inventoried').map(p => (
                        <div key={p.id} className="py-2.5 flex justify-between items-center gap-4">
                          <div>
                            <h4 className="text-xs font-bold text-zinc-800">{p.partName || p.title || p.description}</h4>
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              Qty: {p.quantity || 1} &bull; {p.taskTitle ? `Task: ${p.taskTitle}` : 'General Part'}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-widest rounded border border-amber-200">
                            {p.status || 'requested'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Removed Parts (Takeoffs) Section */}
                <div className="mb-6 print-no-break">
                  <h2 className="text-xs font-black text-amber-600 border-b border-amber-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    Removed Parts (Takeoffs)
                  </h2>
                  {takeoffs.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">No removed parts logged.</p>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {takeoffs.map(t => (
                        <div key={t.id} className="py-2.5 flex justify-between items-start gap-4">
                          <div className="flex gap-3">
                            {t.photoUrls && t.photoUrls.length > 0 && (
                              <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200">
                                <img src={t.photoUrls[0]} alt={t.name} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div>
                              <h4 className="text-xs font-bold text-zinc-800">{t.name || t.partName}</h4>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                                {t.serialNumber && (
                                  <>
                                    <span>S/N: <span className="font-mono">{t.serialNumber}</span></span>
                                    <span>&bull;</span>
                                  </>
                                )}
                                {t.location && (
                                  <>
                                    <span>Loc: {t.location}</span>
                                    {t.notes && <span>&bull;</span>}
                                  </>
                                )}
                                {t.notes && (
                                  <span className="italic">Note: {t.notes}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className={cn(
                            "px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded border shrink-0",
                            getConditionPrintColor(t.condition)
                          )}>
                            {t.condition || 'Good'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Efficiency Report Summary */}
                {jobEfficiencyStats.totalActual > 0 && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-6 text-xs print-no-break">
                    <div className="flex items-center justify-between mb-3 border-b border-zinc-200 pb-2">
                      <h3 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-1.5">
                        <Timer className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
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
                    What Needs to be Done
                  </h2>
                  {tasks.filter(t => t.status !== 'QC' && t.status !== 'QC Complete' && t.status !== 'completed').length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">All tasks completed successfully!</p>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {tasks.filter(t => t.status !== 'QC' && t.status !== 'QC Complete' && t.status !== 'completed').map(t => {
                        const loggedMs = getTaskClockedMs(t.id);
                        const clockedHours = loggedMs / 3600000;
                        const bookHours = parseFloat(t.bookTime) || 0;
                        const isOverBook = bookHours > 0 && clockedHours > bookHours;
                        const diff = clockedHours - bookHours;
                        const assignedList = (t.assignedStaff && t.assignedStaff.length > 0)
                          ? t.assignedStaff
                          : (t.assignedStaffIds || []).map((sid: string) => {
                              const found = allStaff.find(s => s.id === sid || s.userId === sid);
                              return { id: sid, name: found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name : 'Technician' };
                            });
                        
                        return (
                          <div key={t.id} className="py-2.5 flex justify-between items-start gap-4">
                            <div>
                              <h4 className="text-xs font-bold text-zinc-800">{t.title || t.name}</h4>
                              {(t.description || t.notes) && <p className="text-[10px] text-zinc-400 mt-0.5">{t.description || t.notes}</p>}
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest">
                                  Assigned: {assignedList.length === 0 ? (
                                    'Unassigned'
                                  ) : (
                                    assignedList.map((s: any) => s.name).join(', ')
                                  )}
                                </span>
                                {bookHours > 0 && (
                                  <>
                                    <span className="text-zinc-300">•</span>
                                    <span className="text-[9px] text-zinc-400 font-semibold font-mono">Budget: {bookHours}h &bull; Actual: {clockedHours.toFixed(1)}h</span>
                                    {isOverBook && (
                                      <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[8px] font-black uppercase tracking-widest border border-rose-100 flex items-center gap-0.5">
                                        <AlertTriangle className="w-2.5 h-2.5" />
                                        +{diff.toFixed(1)}h Over
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            <span className="font-mono text-xs font-bold text-indigo-600">
                              {bookHours > 0 ? `${clockedHours.toFixed(1)}h / ${bookHours.toFixed(1)}h` : `${clockedHours.toFixed(1)}h`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Awaiting QC Section */}
                <div className="mb-6 print-no-break">
                  <h2 className="text-xs font-black text-amber-600 border-b border-amber-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    Awaiting QC Inspection
                  </h2>
                  {tasks.filter(t => t.status === 'QC').length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">No tasks awaiting QC.</p>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {tasks.filter(t => t.status === 'QC').map(t => {
                        const loggedMs = getTaskClockedMs(t.id);
                        const clockedHours = loggedMs / 3600000;
                        const assignedList = (t.assignedStaff && t.assignedStaff.length > 0)
                          ? t.assignedStaff
                          : (t.assignedStaffIds || []).map((sid: string) => {
                              const found = allStaff.find(s => s.id === sid || s.userId === sid);
                              return { id: sid, name: found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name : 'Technician' };
                            });
                        
                        return (
                          <div key={t.id} className="py-2.5 flex justify-between items-start gap-4">
                            <div>
                              <h4 className="text-xs font-bold text-zinc-800">{t.title || t.name}</h4>
                              {(t.description || t.notes) && <p className="text-[10px] text-zinc-400 mt-0.5">{t.description || t.notes}</p>}
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                                  Completed by: {t.completedByStaffName || t.completedBy || (assignedList.length === 0 ? 'Unassigned' : assignedList.map((s: any) => s.name).join(', '))}
                                </span>
                                <span className="text-zinc-300">•</span>
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-widest rounded border border-amber-200">
                                  Ready for QC
                                </span>
                              </div>
                            </div>
                            <span className="font-mono text-xs font-bold text-zinc-500">{clockedHours.toFixed(1)}h</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* QC Verified (Without Photos) Section */}
                <div className="mb-6 print-no-break">
                  <h2 className="text-xs font-black text-emerald-600 border-b border-emerald-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    QC Verified (Without Photos)
                  </h2>
                  {tasks.filter(t => (t.status === 'QC Complete' || t.status === 'completed') && !qcNotes.some(q => q.taskId === t.id && q.images.length > 0)).length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">No tasks verified without photos.</p>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {tasks.filter(t => (t.status === 'QC Complete' || t.status === 'completed') && !qcNotes.some(q => q.taskId === t.id && q.images.length > 0)).map(t => {
                        const loggedMs = getTaskClockedMs(t.id);
                        const clockedHours = loggedMs / 3600000;
                        const qcNote = qcNotes.find((q: any) => q.taskId === t.id);
                        const qcByName = t.qcCompletedBy || qcNote?.createdByName;
                        const assignedList = (t.assignedStaff && t.assignedStaff.length > 0)
                          ? t.assignedStaff
                          : (t.assignedStaffIds || []).map((sid: string) => {
                              const found = allStaff.find(s => s.id === sid || s.userId === sid);
                              return { id: sid, name: found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name : 'Technician' };
                            });

                        return (
                          <div key={t.id} className="py-2.5 flex justify-between items-start gap-4">
                            <div>
                              <h4 className="text-xs font-bold text-zinc-800">{t.title || t.name}</h4>
                              {(t.description || t.notes) && <p className="text-[10px] text-zinc-400 mt-0.5">{t.description || t.notes}</p>}
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest">
                                  Completed by: {t.completedByStaffName || t.completedBy || (assignedList.length === 0 ? 'Unassigned' : assignedList.map((s: any) => s.name).join(', '))}
                                </span>
                                {qcByName && (
                                  <>
                                    <span className="text-zinc-300">•</span>
                                    <span className="text-[9px] font-bold text-indigo-700 uppercase tracking-widest">
                                      QC'd by: {qcByName}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <span className="font-mono text-xs font-bold text-emerald-600">{clockedHours.toFixed(1)}h</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Quality Control (QC) Section */}
                {qcPhotoNotes.length > 0 && (
                  <div className="mb-6 print-no-break">
                    <h2 className="text-xs font-black text-indigo-900 border-b border-indigo-200 pb-1 mb-4 uppercase tracking-widest flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                      Quality Control (QC) Inspection
                    </h2>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {qcPhotoNotes.map((qc: any) => (
                        <div 
                          key={qc.id} 
                          className="border border-zinc-200 rounded-xl overflow-hidden flex flex-col bg-zinc-50/50 print:break-inside-avoid print:bg-white"
                          style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                        >
                          {/* Photo (if any) */}
                          {qc.images && qc.images.length > 0 ? (
                            <div className="aspect-[4/3] bg-zinc-100 overflow-hidden border-b border-zinc-200">
                              <img 
                                src={qc.images[0]} 
                                alt="QC Verification" 
                                className="object-cover w-full h-full"
                              />
                            </div>
                          ) : (
                            <div className="aspect-[4/3] bg-zinc-50 border-b border-zinc-100 flex flex-col items-center justify-center text-zinc-400 gap-1 print:hidden">
                              <Camera className="w-6 h-6 opacity-30" />
                              <span className="text-[9px] font-medium">No photo attached</span>
                            </div>
                          )}

                          {/* Card Content */}
                          <div className="p-3 flex-1 flex flex-col justify-between space-y-2 text-[11px]">
                            <div className="space-y-1">
                              <div className="flex justify-between items-start gap-1.5">
                                <h4 className="font-bold text-zinc-800 line-clamp-2 leading-tight">
                                  {qc.taskTitle}
                                </h4>
                                <span className={cn(
                                  "text-[9px] px-1.5 py-0.5 rounded font-black uppercase border tracking-wider shrink-0",
                                  qc.isPass 
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                    : "bg-rose-50 text-rose-700 border-rose-200"
                                )}>
                                  {qc.isPass ? 'Passed' : 'Failed'}
                                </span>
                              </div>

                              {qc.message && (
                                <p className="text-zinc-600 leading-relaxed whitespace-pre-wrap mt-1 print:line-clamp-none">
                                  {qc.message}
                                </p>
                              )}
                            </div>

                            <div className="border-t border-zinc-100 pt-1.5 text-[9px] text-zinc-400 flex flex-col">
                              <span>Inspector: <strong className="text-zinc-600 font-bold">{qc.createdByName}</strong></span>
                              <span>Date: {new Date(qc.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active Job Notes Section */}
                <div className="mb-6 print-no-break">
                  <h2 className="text-xs font-black text-indigo-600 border-b border-indigo-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Active Job Notes
                  </h2>
                  {(!job?.work_notes || job?.work_notes.length === 0) && !job?.notes && !job?.description ? (
                    <p className="text-xs text-zinc-400 italic">No job notes recorded.</p>
                  ) : (
                    <div className="divide-y divide-zinc-150 space-y-2">
                      {job?.description && (
                        <div className="py-2">
                          <p className="text-xs text-zinc-800 leading-relaxed font-medium">{job.description}</p>
                          <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-1">Scope Description</p>
                        </div>
                      )}
                      {job?.notes && (
                        <div className="py-2">
                          <p className="text-xs text-zinc-800 leading-relaxed font-medium">{job.notes}</p>
                          <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-1">General Notes</p>
                        </div>
                      )}
                      {(job?.work_notes || []).map((note: any) => (
                        <div key={note.id || note.createdAt} className="py-2.5">
                          <p className="text-xs text-zinc-800 leading-relaxed font-medium">{note.message || note.text}</p>
                          <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-1.5">
                            Added by {note.createdBy || note.userName || 'Staff'} &bull; {formatDateSafe(note.createdAt, true)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Job Chat / General Notes Section */}
                <div className="mb-6 print-no-break">
                  <h2 className="text-xs font-black text-indigo-900 border-b border-indigo-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Job Chat (Team Log)
                  </h2>
                  {chatMessages.filter((m: any) => !m.isSystem).length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">No chat messages recorded.</p>
                  ) : (
                    <div className="divide-y divide-zinc-150">
                      {chatMessages.filter((m: any) => !m.isSystem).map((msg: any) => {
                        const dateObj = msg.createdAt 
                          ? (typeof msg.createdAt.toDate === 'function' ? msg.createdAt.toDate() : new Date(msg.createdAt))
                          : null;
                        const formattedTime = dateObj 
                          ? dateObj.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                          : '';
                        return (
                          <div key={msg.id} className="py-2.5">
                            <p className="text-xs text-zinc-800 leading-relaxed font-medium whitespace-pre-wrap">{msg.message}</p>
                            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-1.5">
                              Posted by {msg.senderName} &bull; {formattedTime}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Print QR Codes Footer */}
                <div className="mt-8 pt-6 border-t-2 border-zinc-200 flex justify-end items-center gap-8 print-no-break">
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-800">Scan to View Job</h4>
                      <p className="text-[9px] text-zinc-400 mt-0.5 font-medium">Open in UpfittersOS</p>
                    </div>
                    <LogoQRCode 
                      value={`${window.location.origin}/business/${tenantId}/job/${jobId}`} 
                      size={60} 
                      logoUrl={businessLogo}
                      businessName={businessName}
                      type="job"
                    />
                  </div>

                  {(job?.companyCamId || job?.companyCamProjectId) && (
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <h4 className="text-xs font-bold text-zinc-800">Scan for Photos</h4>
                        <p className="text-[9px] text-zinc-400 mt-0.5 font-medium">Open CompanyCam</p>
                      </div>
                      <LogoQRCode 
                        value={(() => {
                          const cc = job.companyCamId || job.companyCamProjectId;
                          return cc.startsWith('http') ? cc : `https://app.companycam.com/projects/${cc}`;
                        })()} 
                        size={60} 
                        type="general"
                      />
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
