import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  ArrowLeft, Timer, Clock, Users, Briefcase, AlertCircle, 
  CheckCircle2, Info, ChevronDown, ChevronUp, AlertTriangle, 
  Calendar, Wrench, FileText, Play, BarChart3, PieChart
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

interface JobSegment {
  sessionId: string;
  userId: string;
  userName: string;
  taskId: string | null;
  taskName: string | null;
  bookTime: number;
  payBasis: string;
  start: Date;
  end: Date | null;
  durationMs: number;
  isActive: boolean;
  clockedByName?: string;
  clockedOutByName?: string;
}

const isGeneralTask = (taskOrTitle?: any) => {
  if (!taskOrTitle) return false;
  if (typeof taskOrTitle === 'object') {
    const t = (taskOrTitle.title || '').toLowerCase().trim();
    const g = (taskOrTitle.taskGroup || '').toLowerCase().trim();
    return (t === 'general' || t === 'general labor') && g === 'general';
  }
  const t = taskOrTitle.toLowerCase().trim();
  return t === 'general' || t === 'general labor';
};

export function JobEfficiencyPage({
  tenantId,
  setDynamicTitle
}: {
  tenantId: string;
  setDynamicTitle: (title: string | null) => void;
}) {
  const { '*': splat } = useParams();
  const pathParts = (splat || '').split('/').filter(Boolean);
  const jobId = pathParts[1];

  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [allStaff, setAllStaff] = useState<any[]>([]);
  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [activeTab, setActiveTab] = useState<'overview' | 'techs' | 'tasks' | 'logs'>('overview');
  const [expandedTechs, setExpandedTechs] = useState<Record<string, boolean>>({});

  // Real-time ticking for active sessions
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  // Set page title dynamically
  useEffect(() => {
    if (job) {
      setDynamicTitle(`Efficiency Audit: #${job.jobNumber || 'Detail'}`);
    }
    return () => setDynamicTitle(null);
  }, [job, setDynamicTitle]);

  // Firestore listeners
  useEffect(() => {
    if (!jobId || !tenantId) return;

    setLoading(true);

    const unsubJob = onSnapshot(doc(db, `businesses/${tenantId}/jobs`, jobId), (snap) => {
      if (snap.exists()) {
        setJob({ id: snap.id, ...snap.data() });
      } else {
        toast.error('Job not found');
        navigate(`/business/${tenantId}/jobs`);
      }
    }, (err) => {
      console.error("Job listener error:", err);
      setLoading(false);
    });

    const unsubTasks = onSnapshot(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("Tasks listener error:", err);
    });

    const unsubStaff = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setAllStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qSessions = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('jobIds', 'array-contains', jobId)
    );
    const unsubSessions = onSnapshot(qSessions, (snap) => {
      setTimeLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Sessions listener error:", err);
      setLoading(false);
    });

    return () => {
      unsubJob();
      unsubTasks();
      unsubStaff();
      unsubSessions();
    };
  }, [jobId, tenantId, navigate]);

  // Fetch Vehicle
  useEffect(() => {
    if (!tenantId || !job?.vehicleId) {
      setVehicle(null);
      return;
    }
    let active = true;
    const fetchVehicle = async () => {
      try {
        const vId = job.vehicleId;
        const directRef = doc(db, `businesses/${tenantId}/vehicles`, vId);
        const directSnap = await getDoc(directRef);
        if (directSnap.exists() && active) {
          setVehicle({ id: directSnap.id, ...directSnap.data() });
          return;
        }
        const qVin = query(
          collection(db, `businesses/${tenantId}/vehicles`),
          where('vin', '==', vId.toUpperCase())
        );
        const snapVin = await getDocs(qVin);
        if (!snapVin.empty && active) {
          setVehicle({ id: snapVin.docs[0].id, ...snapVin.docs[0].data() });
          return;
        }
        if (active) setVehicle(null);
      } catch (err) {
        console.warn('Could not fetch vehicle details', err);
      }
    };
    fetchVehicle();
    return () => { active = false; };
  }, [tenantId, job?.vehicleId]);

  // 1. Process All Job Segments
  const segments: JobSegment[] = [];
  timeLogs.forEach(session => {
    const sessionJobs = session.jobs || [];
    sessionJobs.forEach((seg: any) => {
      if (seg.id !== jobId) return;

      const startMs = seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime();
      let endMs = now;
      let isActive = false;

      if (seg.end) {
        endMs = seg.end.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime();
      } else if (session.status === 'active' || session.status === 'on_break') {
        isActive = true;
        endMs = now;
      } else {
        const clockOutVal = session.clockOut?.timestamp;
        if (clockOutVal) {
          endMs = clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime();
        } else {
          const updatedVal = session.updatedAt || session.createdAt;
          endMs = updatedVal?.toDate ? updatedVal.toDate().getTime() : new Date(updatedVal || startMs).getTime();
        }
      }

      const durationMs = Math.max(0, endMs - startMs);

      segments.push({
        sessionId: session.id,
        userId: session.userId,
        userName: session.userName || session.staffName || 'Unknown Technician',
        taskId: seg.taskId || null,
        taskName: seg.taskName || null,
        bookTime: parseFloat(seg.bookTime) || 0,
        payBasis: seg.payBasis || 'book_time',
        start: new Date(startMs),
        end: (seg.end || !isActive) ? new Date(endMs) : null,
        durationMs,
        isActive,
        clockedByName: seg.clockedByName,
        clockedOutByName: seg.clockedOutByName
      });
    });
  });

  // Sort segments chronologically
  segments.sort((a, b) => b.start.getTime() - a.start.getTime());

  // 2. Classify time logged
  const generalSegments = segments.filter(seg => !seg.taskId || isGeneralTask(seg.taskName) || isGeneralTask(tasks.find(t => t.id === seg.taskId)));
  const hourlySegments = segments.filter(seg => seg.taskId && !isGeneralTask(seg.taskName) && (seg.payBasis === 'hourly' || tasks.find(t => t.id === seg.taskId)?.payBasis === 'hourly'));
  const bookTimeSegments = segments.filter(seg => seg.taskId && !isGeneralTask(seg.taskName) && (seg.payBasis !== 'hourly' && tasks.find(t => t.id === seg.taskId)?.payBasis !== 'hourly'));

  const totalActualMs = segments.reduce((sum, s) => sum + s.durationMs, 0);
  const totalGeneralMs = generalSegments.reduce((sum, s) => sum + s.durationMs, 0);
  const totalHourlyMs = hourlySegments.reduce((sum, s) => sum + s.durationMs, 0);
  const totalBookTimeMs = bookTimeSegments.reduce((sum, s) => sum + s.durationMs, 0);

  const totalActualHours = totalActualMs / 3600000;
  const generalHours = totalGeneralMs / 3600000;
  const hourlyHours = totalHourlyMs / 3600000;
  const productiveHours = totalBookTimeMs / 3600000;

  // Book hours sold on the job (non-general tasks: flat-rate bookTime + hourly actual clocked time)
  const totalBookHours = tasks
    .filter(t => !isGeneralTask(t))
    .reduce((sum, t) => {
      if (t.payBasis === 'hourly') {
        const taskSegments = segments.filter(seg => seg.taskId === t.id);
        const taskActualMs = taskSegments.reduce((s, seg) => s + seg.durationMs, 0);
        return sum + (taskActualMs / 3600000);
      }
      return sum + (parseFloat(t.bookTime) || 0);
    }, 0);

  const overallEfficiency = totalActualHours > 0 ? (totalBookHours / totalActualHours) * 100 : null;
  const varianceHours = totalActualHours - totalBookHours;
  const generalRatio = totalActualHours > 0 ? (generalHours / totalActualHours) * 100 : 0;

  // 3. Aggregate Task Breakdown
  const taskSummaryMap: Record<string, {
    id: string;
    title: string;
    bookTime: number;
    payBasis: string;
    status: string;
    assignedStaff: any[];
    completedByStaffName?: string;
    completedAt?: any;
    actualMs: number;
    techsClocked: Record<string, { uid: string; name: string; ms: number }>;
  }> = {};

  // Initialize from database tasks
  tasks.forEach(t => {
    taskSummaryMap[t.id] = {
      id: t.id,
      title: t.title,
      bookTime: t.payBasis === 'hourly' ? 0 : (parseFloat(t.bookTime) || 0),
      payBasis: t.payBasis || 'book_time',
      status: t.status || 'pending',
      assignedStaff: t.assignedStaff || [],
      completedByStaffName: t.completedByStaffName || t.completedBy || undefined,
      completedAt: t.completedAt || undefined,
      actualMs: 0,
      techsClocked: {}
    };
  });

  // Aggregate segment times into tasks
  segments.forEach(seg => {
    const tId = seg.taskId || 'general_unmapped';
    if (!taskSummaryMap[tId]) {
      taskSummaryMap[tId] = {
        id: tId,
        title: seg.taskName || (tId === 'general_unmapped' ? 'General Overhead / Unmapped' : 'Deleted Task'),
        bookTime: 0,
        payBasis: seg.payBasis,
        status: tId === 'general_unmapped' ? 'active' : 'N/A',
        assignedStaff: [],
        actualMs: 0,
        techsClocked: {}
      };
    }
    const tRec = taskSummaryMap[tId];
    tRec.actualMs += seg.durationMs;

    if (!tRec.techsClocked[seg.userId]) {
      tRec.techsClocked[seg.userId] = { uid: seg.userId, name: seg.userName, ms: 0 };
    }
    tRec.techsClocked[seg.userId].ms += seg.durationMs;
  });

  const taskSummaries = Object.values(taskSummaryMap).sort((a, b) => {
    if (a.id === 'general_unmapped') return -1;
    if (b.id === 'general_unmapped') return 1;
    if (isGeneralTask(a)) return -1;
    if (isGeneralTask(b)) return 1;
    return b.actualMs - a.actualMs;
  });

  // 4. Aggregate Technician Stats
  const techSummaryMap: Record<string, {
    uid: string;
    name: string;
    avatarUrl?: string;
    totalMs: number;
    generalMs: number;
    hourlyMs: number;
    bookTimeMs: number;
    completedBookHours: number;
    tasksWorked: Record<string, {
      taskId: string;
      taskTitle: string;
      ms: number;
      bookTime: number;
      payBasis: string;
      status: string;
    }>;
    segments: JobSegment[];
  }> = {};

  // Find all technicians from segments
  segments.forEach(seg => {
    const uid = seg.userId;
    if (!techSummaryMap[uid]) {
      const staffMember = allStaff.find(s => s.id === uid || s.userId === uid);
      techSummaryMap[uid] = {
        uid,
        name: seg.userName,
        avatarUrl: staffMember?.avatarUrl || undefined,
        totalMs: 0,
        generalMs: 0,
        hourlyMs: 0,
        bookTimeMs: 0,
        completedBookHours: 0,
        tasksWorked: {},
        segments: []
      };
    }

    const tSum = techSummaryMap[uid];
    tSum.totalMs += seg.durationMs;
    tSum.segments.push(seg);

    // Classification
    if (!seg.taskId || isGeneralTask(seg.taskName) || isGeneralTask(tasks.find(t => t.id === seg.taskId))) {
      tSum.generalMs += seg.durationMs;
    } else if (seg.payBasis === 'hourly' || tasks.find(t => t.id === seg.taskId)?.payBasis === 'hourly') {
      tSum.hourlyMs += seg.durationMs;
    } else {
      tSum.bookTimeMs += seg.durationMs;
    }

    if (seg.taskId) {
      if (!tSum.tasksWorked[seg.taskId]) {
        const taskDb = tasks.find(t => t.id === seg.taskId);
        tSum.tasksWorked[seg.taskId] = {
          taskId: seg.taskId,
          taskTitle: seg.taskName || 'Task',
          ms: 0,
          bookTime: taskDb?.payBasis === 'hourly' ? 0 : (parseFloat(taskDb?.bookTime) || 0),
          payBasis: taskDb?.payBasis || 'book_time',
          status: taskDb?.status || 'completed'
        };
      }
      tSum.tasksWorked[seg.taskId].ms += seg.durationMs;
    }
  });

  // Calculate completed book time credits for technicians (split-share completed tasks)
  tasks.forEach(task => {
    const isCompleted = task.status === 'QC' || task.status === 'QC Complete';
    if (!isCompleted) return;

    const bookHours = task.payBasis === 'hourly' ? 0 : (parseFloat(task.bookTime) || 0);
    if (bookHours <= 0) return;

    const assigned = task.assignedStaff || [];

    // Check if any tech actually clocked time on this task
    let totalTaskClockedMs = 0;
    const staffClockedMsMap: Record<string, number> = {};

    Object.values(techSummaryMap).forEach((tRec: any) => {
      if (tRec.tasksWorked && tRec.tasksWorked[task.id]) {
        const ms = tRec.tasksWorked[task.id].ms || 0;
        if (ms > 0) {
          staffClockedMsMap[tRec.uid] = ms;
          totalTaskClockedMs += ms;
        }
      }
    });

    if (totalTaskClockedMs > 0) {
      // Labor sessions exist for this task: credit is split STRICTLY by actual clocked time on task!
      Object.entries(staffClockedMsMap).forEach(([sId, ms]) => {
        let tRec = techSummaryMap[sId];
        if (tRec) {
          tRec.completedBookHours += bookHours * (ms / totalTaskClockedMs);
        }
      });
    } else {
      // Credited to completedByStaffId or matching name
      let completedStaffId = task.completedByStaffId;
      if (!completedStaffId && (task.completedByStaffName || task.completedBy)) {
        const compName = (task.completedByStaffName || task.completedBy || '').toLowerCase().trim();
        const found = allStaff.find(s => (s.name || '').toLowerCase().trim() === compName);
        if (found) completedStaffId = found.id;
      }

      if (completedStaffId) {
        let tRec = techSummaryMap[completedStaffId];
        if (!tRec) {
          const staffMember = allStaff.find(s => s.id === completedStaffId);
          techSummaryMap[completedStaffId] = {
            uid: completedStaffId,
            name: staffMember?.name || task.completedByStaffName || task.completedBy || 'Technician',
            avatarUrl: staffMember?.avatarUrl || undefined,
            totalMs: 0,
            generalMs: 0,
            hourlyMs: 0,
            bookTimeMs: 0,
            completedBookHours: 0,
            tasksWorked: {},
            segments: []
          };
          tRec = techSummaryMap[completedStaffId];
        }
        tRec.completedBookHours += bookHours;
      } else if (assigned.length > 0) {
        const share = bookHours / assigned.length;
        assigned.forEach((staff: any) => {
          const sId = staff.id || staff.uid;
          let tRec = techSummaryMap[sId];
          if (!tRec) {
            const staffMember = allStaff.find(s => s.id === sId || s.userId === sId);
            const name = staffMember?.name || staff.name || 'Technician';
            techSummaryMap[sId] = {
              uid: sId,
              name,
              avatarUrl: staffMember?.avatarUrl || undefined,
              totalMs: 0,
              generalMs: 0,
              hourlyMs: 0,
              bookTimeMs: 0,
              completedBookHours: 0,
              tasksWorked: {},
              segments: []
            };
            tRec = techSummaryMap[sId];
          }
          tRec.completedBookHours += share;
        });
      }
    }
  });

  const techSummariesList = Object.values(techSummaryMap).sort((a, b) => b.totalMs - a.totalMs);

  // 5. Audit Alerts (Stupid Details)
  const auditAlerts: Array<{
    type: 'warning' | 'danger' | 'info' | 'success';
    message: string;
    description: string;
    taskId?: string;
  }> = [];

  // Look for completed tasks with 0 clocked time
  tasks.forEach(t => {
    const isCompleted = t.status === 'QC' || t.status === 'QC Complete';
    const bookVal = parseFloat(t.bookTime) || 0;
    
    if (isCompleted && t.payBasis !== 'hourly') {
      const summary = taskSummaryMap[t.id];
      const actualMs = summary?.actualMs || 0;

      if (actualMs === 0 && bookVal > 0) {
        auditAlerts.push({
          type: 'warning',
          message: `Task Completed with 0h Clocked`,
          description: `"${t.title}" (${bookVal}h book) was completed by ${t.completedByStaffName || t.completedBy || 'unknown'} but has 0 minutes clocked into it. Technicians bypassed the timeclock.`,
          taskId: t.id
        });
      } else if (actualMs > 0) {
        const actualHrs = actualMs / 3600000;
        const taskEff = (bookVal / actualHrs) * 100;
        if (taskEff < 50) {
          auditAlerts.push({
            type: 'danger',
            message: `Task Efficiency Critical (${taskEff.toFixed(0)}%)`,
            description: `"${t.title}" took ${actualHrs.toFixed(1)}h actual vs. ${bookVal.toFixed(1)}h book allotment (variance of +${(actualHrs - bookVal).toFixed(1)}h).`,
            taskId: t.id
          });
        }
      }
    }
  });

  // Find general overhead spikes
  if (totalActualHours > 0 && generalRatio > 35) {
    auditAlerts.push({
      type: 'danger',
      message: `Excessive General Labor (${generalRatio.toFixed(0)}%)`,
      description: `Technicians have spent ${(generalHours).toFixed(1)}h out of ${(totalActualHours).toFixed(1)}h total clocked into "General" instead of specific bookable tasks.`
    });
  } else if (totalActualHours > 0 && generalHours > 0) {
    auditAlerts.push({
      type: 'info',
      message: `General Overhead Audit`,
      description: `General labor accounts for ${generalRatio.toFixed(0)}% (${generalHours.toFixed(1)}h) of this job's total actual time.`
    });
  }

  // Format Helper functions
  const formatDuration = (ms: number) => {
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const getEfficiencyColor = (eff: number | null) => {
    if (eff === null) return 'text-zinc-400 dark:text-zinc-500';
    if (eff >= 100) return 'text-emerald-600 dark:text-emerald-400';
    if (eff >= 75) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  const getEfficiencyBg = (eff: number | null) => {
    if (eff === null) return 'bg-zinc-105 text-zinc-500';
    if (eff >= 100) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    if (eff >= 75) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    return 'bg-rose-500/10 text-rose-600 dark:text-rose-400';
  };

  const toggleTechExpand = (uid: string) => {
    setExpandedTechs(prev => ({ ...prev, [uid]: !prev[uid] }));
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4 animate-pulse">
        <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center">
          <Timer className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
        <p className="text-zinc-500 font-medium">Analyzing job efficiency data...</p>
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(`/business/${tenantId}/job/${jobId}`)}
            className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-650 dark:text-zinc-400" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
                Job Efficiency Audit
              </h1>
              <span className="px-2.5 py-1 bg-indigo-550/10 text-indigo-650 dark:text-indigo-400 text-xs font-bold font-mono rounded-full uppercase tracking-wider">
                {job.jobNumber ? `#${job.jobNumber}` : 'No Job ID'}
              </span>
            </div>
            <p className="text-base font-semibold text-zinc-500 mt-1 flex flex-wrap items-center gap-2">
              <span>{job.title}</span>
              <span className="text-zinc-350 dark:text-zinc-700">•</span>
              <span>{job.customerName || 'Walk-in Customer'}</span>
              {vehicle && (
                <>
                  <span className="text-zinc-350 dark:text-zinc-700">•</span>
                  <span className="font-mono text-zinc-600 dark:text-zinc-400">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-sm font-bold shadow-sm transition-all"
          >
            <FileText className="w-4 h-4 text-zinc-550" />
            Print Audit
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Overall Efficiency */}
        <div className="col-span-2 sm:col-span-2 lg:col-span-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div>
            <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Overall Job Efficiency</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className={cn(
                "text-4xl font-black font-mono",
                overallEfficiency !== null ? getEfficiencyColor(overallEfficiency) : "text-zinc-450"
              )}>
                {overallEfficiency !== null ? `${overallEfficiency.toFixed(0)}%` : 'N/A'}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-150 dark:border-zinc-800/60 flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">Book hrs / Total actual hrs</span>
            <PieChart className="w-4 h-4 text-indigo-500 opacity-60" />
          </div>
        </div>

        {/* Total Book Time */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Book Time Sold</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-3xl font-black font-mono text-zinc-900 dark:text-white">{totalBookHours.toFixed(1)}</span>
              <span className="text-xs text-zinc-500 font-bold uppercase font-mono">hrs</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-150 dark:border-zinc-800/60 flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">Estimated allotment</span>
            <Briefcase className="w-4 h-4 text-emerald-500 opacity-60" />
          </div>
        </div>

        {/* Total Clocked Time */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total Actual Hours</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-3xl font-black font-mono text-zinc-900 dark:text-white">{totalActualHours.toFixed(1)}</span>
              <span className="text-xs text-zinc-500 font-bold uppercase font-mono">hrs</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-150 dark:border-zinc-800/60 flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">Total time clocked in</span>
            <Clock className="w-4 h-4 text-rose-500 opacity-60" />
          </div>
        </div>

        {/* Time Variance */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Time Variance</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className={cn(
                "text-3xl font-black font-mono",
                varianceHours > 0 ? "text-rose-650" : "text-emerald-650"
              )}>
                {varianceHours > 0 ? `+${varianceHours.toFixed(1)}` : varianceHours.toFixed(1)}
              </span>
              <span className="text-xs text-zinc-500 font-bold uppercase font-mono">hrs</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-150 dark:border-zinc-800/60 flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">Actual vs. Book time</span>
            <BarChart3 className="w-4 h-4 text-amber-500 opacity-60" />
          </div>
        </div>

        {/* General / Indirect Time */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">General Overhead</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-3xl font-black font-mono text-zinc-900 dark:text-white">{generalHours.toFixed(1)}</span>
              <span className="text-xs text-zinc-500 font-bold uppercase font-mono">hrs</span>
              <span className="text-xs text-zinc-400 ml-1">({generalRatio.toFixed(0)}%)</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-150 dark:border-zinc-800/60 flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">General clockin time</span>
            <Users className="w-4 h-4 text-indigo-500 opacity-60" />
          </div>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 no-print">
        {(['overview', 'techs', 'tasks', 'logs'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-5 py-3.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer",
              activeTab === tab
                ? "border-indigo-600 text-indigo-650 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-350"
            )}
          >
            {tab === 'overview' && 'Overview & Audits'}
            {tab === 'techs' && 'Technicians Breakdown'}
            {tab === 'tasks' && 'Task-by-Task Details'}
            {tab === 'logs' && `Chronological Logs (${segments.length})`}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Charts/Viz Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Hour Classification Donut */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
              <h3 className="text-xs font-black text-indigo-950 dark:text-zinc-200 uppercase tracking-widest mb-6 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-indigo-600" />
                Actual Clocked Time Allocation
              </h3>

              {totalActualMs === 0 ? (
                <div className="py-12 text-center text-zinc-400 italic text-sm">
                  No clock-in sessions recorded for this job yet.
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-4">
                  {/* SVG Donut */}
                  <div className="relative w-44 h-44 shrink-0">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      {/* Base Ring */}
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="var(--color-zinc-100, #e4e4e7)" strokeWidth="3" />
                      
                      {(() => {
                        let strokeOffset = 0;
                        const productivePct = (totalBookTimeMs / totalActualMs) * 100;
                        const hourlyPct = (totalHourlyMs / totalActualMs) * 100;
                        const generalPct = (totalGeneralMs / totalActualMs) * 100;

                        return (
                          <>
                            {/* Productive Tasks Ring (Emerald) */}
                            {productivePct > 0 && (
                              <circle 
                                cx="18" cy="18" r="15.915" 
                                fill="transparent" 
                                stroke="#10b981" 
                                strokeWidth="3.5" 
                                strokeDasharray={`${productivePct} ${100 - productivePct}`} 
                                strokeDashoffset={strokeOffset} 
                              />
                            )}
                            {(() => { strokeOffset -= productivePct; return null; })()}

                            {/* Hourly Tasks Ring (Amber) */}
                            {hourlyPct > 0 && (
                              <circle 
                                cx="18" cy="18" r="15.915" 
                                fill="transparent" 
                                stroke="#f59e0b" 
                                strokeWidth="3.5" 
                                strokeDasharray={`${hourlyPct} ${100 - hourlyPct}`} 
                                strokeDashoffset={strokeOffset} 
                              />
                            )}
                            {(() => { strokeOffset -= hourlyPct; return null; })()}

                            {/* General Overhead Ring (Indigo) */}
                            {generalPct > 0 && (
                              <circle 
                                cx="18" cy="18" r="15.915" 
                                fill="transparent" 
                                stroke="#6366f1" 
                                strokeWidth="3.5" 
                                strokeDasharray={`${generalPct} ${100 - generalPct}`} 
                                strokeDashoffset={strokeOffset} 
                              />
                            )}
                          </>
                        );
                      })()}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Total Time</span>
                      <span className="text-xl font-black text-zinc-800 dark:text-white font-mono mt-0.5">{totalActualHours.toFixed(1)}h</span>
                    </div>
                  </div>

                  {/* Legend Grid */}
                  <div className="space-y-4 w-full max-w-xs">
                    {/* Direct Productive */}
                    <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-850/40 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                        <div>
                          <span className="block text-xs font-bold text-zinc-700 dark:text-zinc-350">Book-Time Tasks</span>
                          <span className="text-[10px] text-zinc-405">Direct productive labor</span>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <span className="block text-xs font-bold text-zinc-800 dark:text-zinc-200">{productiveHours.toFixed(1)}h</span>
                        <span className="text-[10px] text-zinc-505">{((totalBookTimeMs / totalActualMs) * 100).toFixed(0)}%</span>
                      </div>
                    </div>

                    {/* Hourly */}
                    <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-850/40 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                        <div>
                          <span className="block text-xs font-bold text-zinc-700 dark:text-zinc-355">Hourly / Fixed Tasks</span>
                          <span className="text-[10px] text-zinc-405">Paid hourly, no book sold</span>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <span className="block text-xs font-bold text-zinc-800 dark:text-zinc-200">{hourlyHours.toFixed(1)}h</span>
                        <span className="text-[10px] text-zinc-505">{((totalHourlyMs / totalActualMs) * 100).toFixed(0)}%</span>
                      </div>
                    </div>

                    {/* General / Indirect */}
                    <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-850/40 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-indigo-555 shrink-0" />
                        <div>
                          <span className="block text-xs font-bold text-zinc-700 dark:text-zinc-355">General Overhead</span>
                          <span className="text-[10px] text-zinc-405">General shop work & cleanup</span>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <span className="block text-xs font-bold text-zinc-800 dark:text-zinc-200">{generalHours.toFixed(1)}h</span>
                        <span className="text-[10px] text-zinc-505">{generalRatio.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tasks Visual Comparison Chart */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
              <h3 className="text-xs font-black text-indigo-950 dark:text-zinc-200 uppercase tracking-widest mb-6 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                Book vs. Actual Time per Task
              </h3>
              
              {taskSummaries.length === 0 ? (
                <p className="text-zinc-450 italic text-sm text-center py-6">No tasks mapped to this job.</p>
              ) : (
                <div className="space-y-5">
                  {taskSummaries.map(t => {
                    const actualHrs = t.actualMs / 3600000;
                    const bookHrs = t.bookTime;
                    const maxVal = Math.max(bookHrs, actualHrs, 1);
                    
                    const actualPct = (actualHrs / maxVal) * 100;
                    const bookPct = (bookHrs / maxVal) * 100;
                    const isOverBudget = bookHrs > 0 && actualHrs > bookHrs;

                    return (
                      <div key={t.id} className="space-y-1.5 pb-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 last:pb-0">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="truncate max-w-[280px] dark:text-white" title={t.title}>
                            {t.title}
                          </span>
                          <div className="flex items-center gap-3 font-mono text-[11px]">
                            <span className="text-zinc-450">Book: {bookHrs.toFixed(1)}h</span>
                            <span className={cn(
                              "font-bold",
                              isOverBudget ? "text-rose-500" : actualHrs > 0 ? "text-emerald-500" : "text-zinc-400"
                            )}>
                              Actual: {actualHrs.toFixed(1)}h
                            </span>
                          </div>
                        </div>

                        {/* Bar Grid */}
                        <div className="space-y-1 bg-zinc-50 dark:bg-zinc-850/30 p-1.5 rounded-lg">
                          {/* Book Time Bar */}
                          {bookHrs > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="w-8 text-[9px] font-black text-zinc-400 uppercase text-right shrink-0">Book</span>
                              <div className="w-full bg-zinc-200 dark:bg-zinc-850 h-2 rounded-full overflow-hidden">
                                <div className="bg-zinc-400 dark:bg-zinc-550 h-full rounded-full" style={{ width: `${bookPct}%` }} />
                              </div>
                            </div>
                          )}

                          {/* Actual Logged Bar */}
                          <div className="flex items-center gap-2">
                            <span className="w-8 text-[9px] font-black text-zinc-400 uppercase text-right shrink-0">Clock</span>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-850 h-2 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full rounded-full",
                                  isOverBudget ? "bg-rose-500 animate-pulse" : "bg-emerald-500"
                                )} 
                                style={{ width: `${actualPct}%` }} 
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Audit Logs Sidebar */}
          <div className="space-y-6">
            {/* Audit Alerts */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
              <h3 className="text-xs font-black text-indigo-950 dark:text-zinc-200 uppercase tracking-widest mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-indigo-650" />
                Operations Audit Alerts
              </h3>
              
              {auditAlerts.length === 0 ? (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl flex gap-3 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <div>
                    <h5 className="text-xs font-bold">Perfect Audit Profile</h5>
                    <p className="text-[11px] mt-1 text-emerald-600/90 dark:text-emerald-505/95 leading-relaxed">
                      No efficiency anomalies, bypassed task logs, or excessive general overhead spikes detected on this job.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {auditAlerts.map((alert, idx) => (
                    <div 
                      key={idx} 
                      className={cn(
                        "p-4 border rounded-2xl flex gap-3 text-xs",
                        alert.type === 'danger' && "bg-rose-50 border-rose-100 dark:bg-rose-950/10 dark:border-rose-900/30 text-rose-800 dark:text-rose-450",
                        alert.type === 'warning' && "bg-amber-50 border-amber-100 dark:bg-amber-950/10 dark:border-amber-900/30 text-amber-800 dark:text-amber-400",
                        alert.type === 'info' && "bg-zinc-50 border-zinc-150 dark:bg-zinc-800/40 dark:border-zinc-850 text-zinc-700 dark:text-zinc-300"
                      )}
                    >
                      {alert.type === 'danger' && <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />}
                      {alert.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-550 shrink-0 mt-0.5" />}
                      {alert.type === 'info' && <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />}
                      <div>
                        <h5 className="font-bold leading-tight">{alert.message}</h5>
                        <p className="text-[11px] text-zinc-550 dark:text-zinc-400 leading-relaxed mt-1">{alert.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Metadata Box */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm text-xs space-y-4">
              <h3 className="font-black text-indigo-950 dark:text-zinc-200 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-2">
                Job Context
              </h3>
              <div className="flex justify-between items-center">
                <span className="text-zinc-405 uppercase tracking-wider text-[9px] font-black">Job Status</span>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                  job.status === 'completed' ? "bg-emerald-500/10 text-emerald-600" : "bg-indigo-500/10 text-indigo-650 dark:text-indigo-400"
                )}>
                  {job.status || 'Active'}
                </span>
              </div>
              <div className="flex justify-between items-center font-mono">
                <span className="text-zinc-405 uppercase tracking-wider text-[9px] font-black">Tasks Created</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">{tasks.length} tasks</span>
              </div>
              <div className="flex justify-between items-center font-mono">
                <span className="text-zinc-405 uppercase tracking-wider text-[9px] font-black">Logged Sessions</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">{timeLogs.length} shifts</span>
              </div>
              <div className="flex justify-between items-center font-mono">
                <span className="text-zinc-405 uppercase tracking-wider text-[9px] font-black">People Clocked</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">{techSummariesList.length} workers</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Technicians tab */}
      {activeTab === 'techs' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
          {techSummariesList.length === 0 ? (
            <div className="py-16 text-center text-zinc-400 italic text-sm">
              No technicians have clocked into this job yet.
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {techSummariesList.map(tech => {
                const isExpanded = !!expandedTechs[tech.uid];
                const actualHrs = tech.totalMs / 3600000;
                const generalHrs = tech.generalMs / 3600000;
                const directHrs = tech.bookTimeMs / 3600000;
                const earnedHrs = tech.completedBookHours;

                const directEfficiency = directHrs > 0 ? (earnedHrs / directHrs) * 100 : null;
                const overallContribution = actualHrs > 0 ? (earnedHrs / actualHrs) * 100 : null;

                return (
                  <div key={tech.uid} className="transition-all hover:bg-zinc-50/20 dark:hover:bg-zinc-800/10">
                    {/* Summary Row */}
                    <div 
                      onClick={() => toggleTechExpand(tech.uid)}
                      className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-sm font-bold text-indigo-700 dark:text-indigo-400 uppercase font-sans shrink-0">
                          {tech.name.substring(0, 2)}
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-zinc-900 dark:text-white leading-tight">
                            {tech.name}
                          </h4>
                          <p className="text-[10px] text-zinc-450 mt-1 uppercase font-black tracking-widest font-mono">
                            Logged: {actualHrs.toFixed(1)}h total • {directHrs.toFixed(1)}h tasks • {generalHrs.toFixed(1)}h general
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 self-end sm:self-center">
                        <div className="text-right">
                          <span className="block text-[8px] font-black text-zinc-405 uppercase tracking-widest">Book Hours Credited</span>
                          <span className="font-mono text-sm font-bold text-zinc-800 dark:text-zinc-200">
                            {earnedHrs.toFixed(1)}h
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="block text-[8px] font-black text-zinc-405 uppercase tracking-widest">Direct Task Efficiency</span>
                          <span className={cn(
                            "font-mono text-sm font-black",
                            directEfficiency !== null ? getEfficiencyColor(directEfficiency) : "text-zinc-450"
                          )}>
                            {directEfficiency !== null ? `${directEfficiency.toFixed(0)}%` : 'N/A'}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="block text-[8px] font-black text-zinc-405 uppercase tracking-widest">Overall Job Efficiency</span>
                          <span className={cn(
                            "font-mono text-sm font-black px-1.5 py-0.5 rounded",
                            overallContribution !== null ? getEfficiencyBg(overallContribution) : "text-zinc-450"
                          )}>
                            {overallContribution !== null ? `${overallContribution.toFixed(0)}%` : 'N/A'}
                          </span>
                        </div>

                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-zinc-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-zinc-400" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {isExpanded && (
                      <div className="bg-zinc-50 dark:bg-zinc-900/60 p-6 border-t border-zinc-100 dark:border-zinc-800/80 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Tasks worked on */}
                          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl space-y-4">
                            <h5 className="text-[10px] font-black text-indigo-950 dark:text-zinc-300 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-2 flex items-center gap-1.5">
                              <Wrench className="w-3.5 h-3.5 text-indigo-500" />
                              Tasks Clocked Into
                            </h5>
                            
                            {Object.values(tech.tasksWorked).length === 0 ? (
                              <p className="text-[11px] text-zinc-400 italic">No task-specific clock-ins. All logged time was general labor.</p>
                            ) : (
                              <div className="space-y-3 divide-y divide-zinc-50 dark:divide-zinc-900">
                                {Object.values(tech.tasksWorked).map(tWork => {
                                  const clockedHrs = tWork.ms / 3600000;
                                  const isOver = tWork.bookTime > 0 && clockedHrs > tWork.bookTime;
                                  const eff = clockedHrs > 0 && tWork.bookTime > 0 ? (tWork.bookTime / clockedHrs) * 100 : null;

                                  return (
                                    <div key={tWork.taskId} className="pt-2.5 first:pt-0 flex items-center justify-between text-xs">
                                      <div className="truncate max-w-[180px]">
                                        <span className="font-bold text-zinc-800 dark:text-zinc-200 block truncate">{tWork.taskTitle}</span>
                                        <span className="text-[9px] text-zinc-405 uppercase font-semibold">{tWork.status} • {tWork.payBasis}</span>
                                      </div>
                                      <div className="text-right font-mono">
                                        <span className="block font-bold">
                                          {clockedHrs.toFixed(2)}h clocked
                                        </span>
                                        <span className={cn(
                                          "text-[10px]",
                                          isOver ? "text-rose-500" : eff !== null ? "text-emerald-500" : "text-zinc-405"
                                        )}>
                                          {tWork.bookTime > 0 ? `${tWork.bookTime.toFixed(1)}h book (${eff ? eff.toFixed(0) : 0}%)` : 'No Book Time'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Chronological Clock-ins */}
                          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl space-y-4">
                            <h5 className="text-[10px] font-black text-indigo-950 dark:text-zinc-300 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-2 flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                              Clock-In Segments List
                            </h5>
                            <div className="max-h-[220px] overflow-y-auto space-y-2.5 pr-2">
                              {tech.segments.map((seg, sidx) => (
                                <div key={sidx} className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl flex justify-between items-start text-xs border border-zinc-150 dark:border-zinc-855">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      {seg.isActive ? (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                      ) : (
                                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-305 dark:bg-zinc-650" />
                                      )}
                                      <span className="font-bold text-zinc-800 dark:text-zinc-250 truncate max-w-[150px]">
                                        {seg.taskName || 'General Labor / Overhead'}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-zinc-405 block font-mono">
                                      {seg.start.toLocaleDateString()} {seg.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      {seg.end ? ` - ${seg.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' (Current)'}
                                    </span>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="font-bold font-mono block text-indigo-650 dark:text-indigo-400">
                                      {formatDuration(seg.durationMs)}
                                    </span>
                                    <span className="text-[9px] text-zinc-405 block mt-0.5">
                                      by {seg.clockedByName || 'Self'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tasks tab */}
      {activeTab === 'tasks' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 uppercase text-[10px] font-bold tracking-widest border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="px-6 py-4">Task Title</th>
                  <th className="px-6 py-4">Status & Type</th>
                  <th className="px-6 py-4 text-center">Book Time</th>
                  <th className="px-6 py-4 text-center">Clocked Time</th>
                  <th className="px-6 py-4 text-center">Variance</th>
                  <th className="px-6 py-4 text-center">Efficiency</th>
                  <th className="px-6 py-4">Worker Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {taskSummaries.map(tSum => {
                  const actualHrs = tSum.actualMs / 3600000;
                  const bookHrs = tSum.bookTime;
                  const isHourly = tSum.payBasis === 'hourly';
                  const isCompleted = tSum.status === 'QC' || tSum.status === 'QC Complete';

                  const variance = isHourly ? 0 : (actualHrs - bookHrs);
                  const efficiency = (bookHrs > 0 && actualHrs > 0) ? (bookHrs / actualHrs) * 100 : null;

                  const isBypassed = isCompleted && !isHourly && bookHrs > 0 && actualHrs === 0;

                  return (
                    <tr key={tSum.id} className="hover:bg-zinc-50/40 dark:hover:bg-zinc-800/10 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <span className="font-bold text-zinc-900 dark:text-white block truncate max-w-[200px]" title={tSum.title}>
                            {tSum.title}
                          </span>
                          {tSum.completedByStaffName && (
                            <span className="text-[10px] text-zinc-405 mt-1 block">
                              Completed by: {tSum.completedByStaffName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider w-fit",
                            isCompleted ? "bg-emerald-500/10 text-emerald-600" : "bg-indigo-500/10 text-indigo-650 dark:text-indigo-400"
                          )}>
                            {tSum.status}
                          </span>
                          <span className="text-[9px] text-zinc-405 font-semibold uppercase">
                            {isHourly ? 'hourly' : 'book time'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-mono font-bold text-zinc-650 dark:text-zinc-400">
                        {isHourly ? '--' : `${bookHrs.toFixed(1)}h`}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "font-mono font-bold",
                          isBypassed ? "text-rose-500 font-black animate-pulse" : actualHrs > 0 ? "text-zinc-800 dark:text-zinc-250" : "text-zinc-400"
                        )}>
                          {isBypassed ? '0.0h (Bypassed)' : `${actualHrs.toFixed(1)}h`}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-mono font-bold">
                        {isHourly ? (
                          <span className="text-zinc-405">--</span>
                        ) : variance === 0 ? (
                          <span className="text-zinc-400">0.0h</span>
                        ) : variance > 0 ? (
                          <span className="text-rose-500">+{variance.toFixed(1)}h</span>
                        ) : (
                          <span className="text-emerald-500">{variance.toFixed(1)}h</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {isHourly ? (
                          <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-450 uppercase font-black">Hourly</span>
                        ) : efficiency !== null ? (
                          <span className={cn(
                            "font-mono font-black text-xs px-2 py-0.5 rounded",
                            getEfficiencyBg(efficiency)
                          )}>
                            {efficiency.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-zinc-450">--</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {Object.values(tSum.techsClocked).length === 0 ? (
                          <span className="text-zinc-400 italic text-[11px]">No logged time</span>
                        ) : (
                          <div className="space-y-1">
                            {Object.values(tSum.techsClocked).map(tech => (
                              <div key={tech.uid} className="flex justify-between items-center gap-4 text-[11px] font-medium text-zinc-650 dark:text-zinc-400">
                                <span>{tech.name}</span>
                                <span className="font-mono font-bold">{(tech.ms / 3600000).toFixed(1)}h</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Logs tab */}
      {activeTab === 'logs' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-zinc-150 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
            <h4 className="text-xs font-black text-indigo-950 dark:text-zinc-200 uppercase tracking-widest">Timeclock Log History</h4>
            <span className="text-[10px] font-mono text-zinc-405 font-bold uppercase">{segments.length} distinct work segments</span>
          </div>
          
          {segments.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 italic text-sm">
              No clock-in records found.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {segments.map((seg, idx) => (
                <div key={idx} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-50/20 dark:hover:bg-zinc-800/10 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "p-2 rounded-xl shrink-0 border mt-0.5",
                      seg.isActive 
                        ? "bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/30 text-emerald-500"
                        : "bg-zinc-50 border-zinc-150 dark:bg-zinc-800 dark:border-zinc-850 text-zinc-400"
                    )}>
                      {seg.isActive ? (
                        <Play className="w-4 h-4 animate-pulse fill-current" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <h5 className="text-xs font-black text-zinc-900 dark:text-white flex items-center gap-2">
                        {seg.userName}
                        {seg.isActive && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 rounded-full animate-pulse">
                            Active Clock-In
                          </span>
                        )}
                      </h5>
                      <p className="text-[11px] font-semibold text-zinc-650 dark:text-zinc-400 mt-1 flex items-center gap-1.5">
                        <Wrench className="w-3 h-3 text-zinc-400" />
                        {seg.taskName || <span className="italic text-zinc-405">General labor / Overhead</span>}
                      </p>
                      
                      <div className="flex items-center gap-2 mt-2 font-mono text-[10px] text-zinc-405">
                        <span className="font-sans uppercase font-bold text-[9px] tracking-wider text-zinc-350">Timeline:</span>
                        <span>{seg.start.toLocaleDateString()} {seg.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>→</span>
                        <span>
                          {seg.end ? (
                            `${seg.end.toLocaleDateString() === seg.start.toLocaleDateString() ? '' : seg.end.toLocaleDateString() + ' '}${seg.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          ) : (
                            <span className="italic text-emerald-505 font-bold">Ongoing</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right sm:self-center">
                    <span className="block text-[8px] font-black text-zinc-450 uppercase tracking-widest">Duration</span>
                    <span className="font-mono text-sm font-black text-indigo-650 dark:text-indigo-400">
                      {formatDuration(seg.durationMs)}
                    </span>
                    <div className="text-[9px] text-zinc-405 mt-1">
                      {seg.clockedByName && (
                        <span>By {seg.clockedByName}</span>
                      )}
                      {seg.clockedOutByName && (
                        <span> • Out by {seg.clockedOutByName}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
