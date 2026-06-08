import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Play, Calendar, Users, ClipboardList, RefreshCw, Hammer, Wrench, User,
  MapPin, Clock, ListChecks, ChevronRight, AlertCircle, Printer
} from 'lucide-react';
import { 
  collection, query, where, onSnapshot, collectionGroup, orderBy
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { cn } from '../../lib/utils';
import { useWakeLock } from '../../hooks/useWakeLock';
import { StaffLink } from './StaffPerformance';

interface DepartmentOverviewProps {
  tenantId: string;
  departmentName: string;
}

export function DepartmentOverview({ tenantId, departmentName }: DepartmentOverviewProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // Data states
  const [dept, setDept] = useState<any>(null);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Wake lock
  useWakeLock(isFullscreen);

  // Tick clock to update live stopwatches and ETAs every second
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Full Screen toggle helper
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 1. Fetch Department Document
  useEffect(() => {
    if (!tenantId) return;

    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      const depts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const found = depts.find((d: any) => 
        d.name?.toLowerCase().includes(departmentName.toLowerCase()) || 
        departmentName.toLowerCase().includes(d.name?.toLowerCase() || '')
      );
      
      if (found) {
        setDept(found);
      }
    });

    return () => unsub();
  }, [tenantId, departmentName]);

  // 2. Fetch Active Jobs
  useEffect(() => {
    if (!tenantId) return;

    const q = query(collection(db, `businesses/${tenantId}/jobs`));
    const unsub = onSnapshot(q, (snap) => {
      const jobs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveJobs(jobs);
    }, (err) => console.error("Jobs listener error:", err));

    return () => unsub();
  }, [tenantId]);

  // 3. Fetch Zones (Bays/Parking spots)
  useEffect(() => {
    if (!tenantId) return;

    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/zones`), snap => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Zones listener error:", err));

    return () => unsub();
  }, [tenantId]);

  // 4. Fetch Parts Requests
  useEffect(() => {
    if (!tenantId) return;

    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/parts_requests`), snap => {
      setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Parts requests listener error:", err));

    return () => unsub();
  }, [tenantId]);

  // 5. Fetch Time Sessions (for active segments & live clock-in states)
  useEffect(() => {
    if (!tenantId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      orderBy('clockIn.timestamp', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const allSessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const activeSessions = allSessions.filter((s: any) => {
        if (s.status !== 'completed') return true;
        if (!s.clockIn?.timestamp) return false;
        const date = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
        return date >= today;
      });
      setSessions(activeSessions);
    }, (err) => {
      console.warn("Time session query scan fallback...", err);
      const fallbackQ = query(collection(db, `businesses/${tenantId}/time_sessions`));
      onSnapshot(fallbackQ, (snap) => {
        const allSessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const activeSessions = allSessions.filter((s: any) => {
          if (s.status !== 'completed') return true;
          if (!s.clockIn?.timestamp) return false;
          const date = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
          return date >= today;
        });
        setSessions(activeSessions);
      });
    });

    return () => unsub();
  }, [tenantId]);

  // 5.5 Fetch Staff Members
  useEffect(() => {
    if (!tenantId) return;

    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/staff`), snap => {
      setStaff(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Staff listener error:", err));

    return () => unsub();
  }, [tenantId]);

  // 6. Fetch All Tasks via index-free collectionGroup query
  useEffect(() => {
    if (!tenantId || !dept?.id) {
      if (!dept) setLoading(false);
      return;
    }

    const q = query(
      collectionGroup(db, 'tasks'),
      where('tenantId', '==', tenantId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const filteredDocs = snap.docs.filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`));
      const parsedTasks = filteredDocs.map(doc => {
        const pathParts = doc.ref.path.split('/');
        const jobId = pathParts[3];
        return {
          id: doc.id,
          jobId,
          refPath: doc.ref.path,
          ...doc.data()
        };
      });

      const deptTasks = parsedTasks.filter((t: any) => t.departmentId === dept.id);
      setAllTasks(deptTasks);
      setLastUpdated(new Date());
      setLoading(false);
    }, (err) => {
      console.error("Tasks collectionGroup listener error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [tenantId, dept?.id]);

  // Helpers
  const getElapsedMs = (start: any) => {
    if (!start) return 0;
    const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
    return Math.max(0, Date.now() - s);
  };

  const formatStopwatch = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Derive active clock-in tasks for this department
  const activeTechSessions = sessions.filter(s => s.status === 'active' || s.status === 'on_break');
  const activeTaskSegments = activeTechSessions.flatMap(s => {
    const jobs = s.jobs || [];
    return jobs.filter((j: any) => !j.end && j.taskId).map((j: any) => ({
      taskId: j.taskId,
      jobId: j.id,
      userId: s.userId,
      userName: s.userName || s.staffName || 'Operator',
      sessionId: s.id,
      start: j.start
    }));
  }).filter(seg => allTasks.some(t => t.id === seg.taskId));

  // Derive active clock-in tasks across ALL departments (for the job card operators list)
  const allActiveJobSegments = activeTechSessions.flatMap(s => {
    const jobs = s.jobs || [];
    return jobs.filter((j: any) => !j.end).map((j: any) => ({
      taskId: j.taskId,
      jobId: j.id,
      userId: s.userId,
      userName: s.userName || s.staffName || 'Operator',
      sessionId: s.id,
      start: j.start,
      taskTitle: j.taskName || j.name || 'Labor Task'
    }));
  });

  // Find all tasks for this department
  const deptTasks = allTasks;

  // Get active staff members assigned to this department
  const deptStaffList = staff.filter(s => 
    s.departmentId === dept?.id && 
    !s.isArchived && 
    !s.fireDate
  );

  // Map each department staff member to their active day session & active task (if any)
  const staffRoster = deptStaffList.map(s => {
    const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.displayName || s.name || s.email || 'Unnamed';
    const activeSession = sessions.find(sess => 
      sess.userId === s.id && 
      (sess.status === 'active' || sess.status === 'on_break')
    );
    
    let status: 'task' | 'idle' | 'offline' = 'offline';
    let activeTask: any = null;
    let elapsedMs = 0;
    
    if (activeSession) {
      status = 'idle';
      const activeJob = activeSession.jobs?.find((j: any) => !j.end);
      if (activeJob) {
        status = 'task';
        const task = allTasks.find(t => t.id === activeJob.taskId);
        activeTask = {
          taskId: activeJob.taskId,
          jobId: activeJob.id,
          taskTitle: task?.title || activeJob.taskTitle || 'Labor Task',
          jobTitle: jobName(activeJob.id, activeJobs),
          start: activeJob.start
        };
        elapsedMs = getElapsedMs(activeJob.start);
      }
    }
    
    return {
      id: s.id,
      name,
      status,
      activeTask,
      elapsedMs,
      role: s.role || 'Technician'
    };
  }).sort((a, b) => {
    const score = { 'task': 1, 'idle': 2, 'offline': 3 };
    if (score[a.status] !== score[b.status]) {
      return score[a.status] - score[b.status];
    }
    return a.name.localeCompare(b.name);
  });

  // Group tasks by Job ID
  const groupedJobs = activeJobs.map(job => {
    const jobDeptTasks = deptTasks.filter(t => t.jobId === job.id);
    const uncompletedJobTasks = jobDeptTasks.filter(t => t.status !== 'completed' && t.status !== 'QC Complete');
    const completedJobTasks = jobDeptTasks.filter(t => t.status === 'completed' || t.status === 'QC Complete');
    
    // Find active segments clocking this job's tasks (across all departments)
    const activeSegments = allActiveJobSegments.filter(seg => seg.jobId === job.id);
    
    // Find current bay/zone
    const currentZone = zones.find(z => z.currentJobId === job.id);

    return {
      ...job,
      tasks: jobDeptTasks,
      uncompletedTasks: uncompletedJobTasks,
      completedTasks: completedJobTasks,
      activeSegments,
      zone: currentZone
    };
  }).filter(j => j.uncompletedTasks.length > 0);

  // Prioritized sorting for the operational queue:
  // 1. Blocked jobs at the absolute top of the queue.
  // 2. Active jobs (jobs where operators are currently clocked in) next.
  // 3. Within those groups: Overdue first (earliest first), then upcoming by due date, then no due date last.
  const sortedJobs = [...groupedJobs].sort((a, b) => {
    // 1. Blocked Priority
    const isBlockedA = a.status === 'Blocked' || (a.blockers || []).some((bl: any) => bl.status === 'active');
    const isBlockedB = b.status === 'Blocked' || (b.blockers || []).some((bl: any) => bl.status === 'active');
    if (isBlockedA !== isBlockedB) {
      return isBlockedA ? -1 : 1;
    }

    // 2. Active Operators Priority
    const isActiveA = a.activeSegments.length > 0;
    const isActiveB = b.activeSegments.length > 0;
    if (isActiveA !== isActiveB) {
      return isActiveA ? -1 : 1;
    }

    // 3. Due Date & Overdue Priority
    const dueRawA = a.expectedFinishTime || a.dueDate || a.eta;
    const dueRawB = b.expectedFinishTime || b.dueDate || b.eta;
    const dateA = dueRawA ? (dueRawA.toDate ? dueRawA.toDate() : new Date(dueRawA)) : null;
    const dateB = dueRawB ? (dueRawB.toDate ? dueRawB.toDate() : new Date(dueRawB)) : null;

    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;

    const timeA = dateA.getTime();
    const timeB = dateB.getTime();

    const isOverdueA = timeA < Date.now();
    const isOverdueB = timeB < Date.now();

    if (isOverdueA !== isOverdueB) {
      return isOverdueA ? -1 : 1;
    }

    return timeA - timeB;
  });

  const getDepartmentIcon = () => {
    if (departmentName.toLowerCase().includes('fab')) {
      return <Hammer className="w-6 h-6 text-indigo-500" />;
    }
    return <Wrench className="w-6 h-6 text-indigo-500" />;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-zinc-500 font-bold uppercase tracking-wider text-xs">Loading Overview Data...</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-4 duration-500",
        isFullscreen ? "p-4 space-y-4 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar" : "space-y-8"
      )}
    >
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center">
            {getDepartmentIcon()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
              {departmentName} Overview
            </h1>
            <p className="text-sm text-zinc-500">Live operational department overview for {departmentName}.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-500/10 px-3.5 py-1.5 rounded-full border border-emerald-500/20 shadow-sm">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Dashboard</span>
            <span className="text-[10px] font-bold text-zinc-500">• {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>

          {departmentName.toLowerCase().includes('upfit') && (
            <button 
              onClick={() => navigate(`/business/${tenantId}/weekly_meeting`)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Weekly Notes
            </button>
          )}

          <button 
            onClick={toggleFullscreen}
            className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center gap-2"
          >
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">Uncompleted Tasks</p>
            <p className="text-3xl font-black text-zinc-900 dark:text-white">{deptTasks.filter(t => t.status !== 'completed' && t.status !== 'QC Complete').length}</p>
          </div>
          <div className="w-10 h-10 bg-indigo-500/10 text-indigo-500 rounded-xl flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">Active Operators</p>
            <p className="text-3xl font-black text-zinc-900 dark:text-white">{activeTaskSegments.length}</p>
          </div>
          <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center shrink-0">
            <Play className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">Queued Jobs</p>
            <p className="text-3xl font-black text-zinc-900 dark:text-white">{sortedJobs.length}</p>
          </div>
          <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Columns: Active Production Queue by Due Date */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
            <ClipboardList className="w-5 h-5 text-indigo-500" />
            Uncompleted Department Tasks Queue
          </h2>

          <div className="space-y-4">
            {sortedJobs.length === 0 ? (
              <div className="p-12 text-center bg-zinc-50 dark:bg-zinc-900 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
                <p className="text-zinc-500 italic">No open tasks assigned to the {departmentName} department.</p>
              </div>
            ) : (
              sortedJobs.map(job => {
                const dueRaw = job.expectedFinishTime || job.dueDate || job.eta;
                const dueDate = dueRaw ? (dueRaw.toDate ? dueRaw.toDate() : new Date(dueRaw)) : null;
                const isOverdue = dueDate && dueDate.getTime() < Date.now();

                // Progress math
                const totalCount = job.tasks.length;
                const completedCount = job.completedTasks.length;
                const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

                // Active Operators clocking in
                const uniqueActiveOperators = Array.from(new Set(job.activeSegments.map((seg: any) => {
                  return seg.taskTitle ? `${seg.userName} (${seg.taskTitle})` : seg.userName;
                })));

                // Parts requests filter for this job that are pending or ordered
                const jobParts = partsRequests.filter(pr => 
                  pr.jobId === job.id && 
                  (pr.status === 'pending' || pr.status === 'ordered')
                );

                // Calculate total time clocked into this job today in minutes across all daily timeclock sessions
                const totalClockedMins = sessions.reduce((sum, s) => {
                  const jobSegments = s.jobs || [];
                  const matchedSegments = jobSegments.filter((j: any) => j.id === job.id);
                  const segmentDuration = matchedSegments.reduce((segSum: number, j: any) => {
                    const startMs = j.start.seconds ? j.start.seconds * 1000 : new Date(j.start).getTime();
                    const endMs = j.end 
                      ? (j.end.seconds ? j.end.seconds * 1000 : new Date(j.end).getTime()) 
                      : Date.now();
                    return segSum + Math.max(0, endMs - startMs);
                  }, 0);
                  return sum + segmentDuration;
                }, 0) / 60000;

                return (
                  <div 
                    key={job.id}
                    onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}
                    className={cn(
                      "p-6 bg-white dark:bg-zinc-900 border rounded-2xl shadow-sm hover:shadow-md hover:scale-[1.005] transition-all cursor-pointer group flex flex-col gap-4",
                      isOverdue ? "border-red-200 dark:border-red-950/30 bg-gradient-to-tr from-red-500/[0.01] to-transparent" : "border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50"
                    )}
                  >
                    {/* Job Card Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="font-extrabold text-lg text-zinc-900 dark:text-white group-hover:text-indigo-500 transition-colors tracking-tight leading-snug">
                          {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title}
                        </h3>
                        <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-1">
                          <User className="w-3.5 h-3.5 text-zinc-400" />
                          {job.customerName || 'No Customer'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                        {dueDate ? (
                          <span className={cn(
                            "px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0 w-fit",
                            isOverdue ? "bg-red-500 text-white animate-blink" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}>
                            <Calendar className="w-3.5 h-3.5" />
                            {isOverdue ? `Overdue: ` : `Due: `}
                            {dueDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 text-[10px] font-black uppercase tracking-widest shrink-0 w-fit rounded-xl">
                            No Due Date
                          </span>
                        )}

                        <span className="px-3 py-1 bg-indigo-500/10 group-hover:bg-indigo-500 text-indigo-600 dark:text-indigo-400 group-hover:text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-0.5 border border-indigo-500/20 group-hover:border-indigo-500">
                          Manage Job <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>

                    {/* Job Compact Info Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 py-3 border-y border-zinc-100 dark:border-zinc-800/80 text-xs">
                      
                      {/* Left: Location & Active operators */}
                      <div className="space-y-2 flex flex-col justify-center">
                        <div className="flex items-center gap-2 font-bold text-zinc-600 dark:text-zinc-400">
                          <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span className="text-zinc-400 mr-0.5">Location:</span>
                          <span className={cn(
                            "font-extrabold",
                            job.zone ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400 dark:text-zinc-500 italic"
                          )}>
                            {job.zone ? job.zone.name : "Not in Bay"}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2 font-bold text-zinc-600 dark:text-zinc-400">
                          <Play className={cn("w-4 h-4 shrink-0", uniqueActiveOperators.length > 0 ? "text-emerald-500 fill-emerald-500 animate-pulse" : "text-zinc-400")} />
                          <span className="text-zinc-400 mr-0.5">Operators:</span>
                          {uniqueActiveOperators.length > 0 ? (
                            <span className="text-emerald-500 font-extrabold animate-pulse">
                               {uniqueActiveOperators.join(', ')}
                            </span>
                          ) : (
                            <span className="text-zinc-400 dark:text-zinc-600 italic">Idle</span>
                          )}
                        </div>
                      </div>

                      {/* Middle: Progress Bar */}
                      <div className="flex flex-col justify-center space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-zinc-400">
                          <span className="flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" /> Job Progress</span>
                          <span className="font-mono text-zinc-700 dark:text-zinc-300">{completedCount} / {totalCount} Done ({progressPercent}%)</span>
                        </div>
                        <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden shadow-inner">
                          <div 
                            className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-500" 
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Right: Clocked Time & ETA */}
                      <div className="space-y-2 flex flex-col justify-center">
                        {/* Clocked Today Time */}
                        <div className="flex items-center gap-2 font-bold text-zinc-600 dark:text-zinc-400">
                          <Clock className={cn("w-4 h-4 shrink-0", totalClockedMins > 0 ? "text-indigo-500" : "text-zinc-400")} />
                          <span className="text-zinc-400 mr-0.5">Clocked Today:</span>
                          <span className={cn(
                            "font-extrabold",
                            totalClockedMins > 0 ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400 dark:text-zinc-500 italic"
                          )}>
                            {totalClockedMins > 0 
                              ? (totalClockedMins >= 60 ? `${(totalClockedMins / 60).toFixed(1)} hrs` : `${Math.round(totalClockedMins)} mins`)
                              : "0 hrs"}
                          </span>
                        </div>

                        {/* ETA / Est. Finish */}
                        {(() => {
                          const etaRaw = job.expectedFinishTime || job.eta || (job.zone && job.zone.eta);
                          if (!etaRaw) return null;
                          const etaDate = typeof etaRaw.toDate === 'function' ? etaRaw.toDate() : new Date(etaRaw);

                          return (
                            <div className="flex items-center gap-2 font-bold text-zinc-600 dark:text-zinc-400">
                              <Calendar className="w-4 h-4 shrink-0 text-amber-500" />
                              <span className="text-zinc-400 mr-0.5">Est. Finish:</span>
                              <span className="text-zinc-900 dark:text-white font-extrabold">
                                {etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          );
                        })()}
                      </div>

                    </div>

                    {/* Troubleshooting / Troubleshooting Alerts */}
                    {(jobParts.length > 0 || job.status === 'Blocked' || (job.blockers || []).some((b: any) => b.status === 'active')) && (
                      <div className="flex flex-col gap-2 text-xs">
                        
                        {/* Blocker alert if blocked */}
                        {(job.status === 'Blocked' || (job.blockers || []).some((b: any) => b.status === 'active')) && (
                          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-500 px-3 py-2 rounded-xl font-bold animate-in fade-in duration-300">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                              <span className="uppercase tracking-widest text-[9px] font-black block mb-0.5">Production Blocked</span>
                              <span className="text-[11px]">{job.blocker || job.blockers?.find((b: any) => b.status === 'active')?.message || 'Job is currently blocked.'}</span>
                            </div>
                          </div>
                        )}

                        {/* Parts Awaiting */}
                        {jobParts.length > 0 && (
                          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 px-3 py-2 rounded-xl font-bold animate-in fade-in duration-300">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                              <span className="uppercase tracking-widest text-[9px] font-black block mb-0.5">Missing Parts ({jobParts.length})</span>
                              <span className="text-[11px] font-extrabold">{jobParts.map(pr => `${pr.partName} (${pr.status})`).join(', ')}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 1 Column: Department Staff Roster & Live Status */}
        <div className="space-y-6">
          <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
            <Users className="w-5 h-5 text-indigo-500" />
            Department Staff Roster
          </h2>

          <div className="space-y-4">
            {staffRoster.length === 0 ? (
              <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                <p className="text-zinc-500 italic text-sm">No staff members assigned to this department.</p>
              </div>
            ) : (
              staffRoster.map((item) => {
                if (item.status === 'task') {
                  return (
                    <div 
                      key={item.id}
                      onClick={() => navigate(`/business/${tenantId}/job/${item.activeTask.jobId}`)}
                      className="p-4 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.01] border border-emerald-500/20 dark:border-emerald-500/10 rounded-2xl cursor-pointer hover:border-emerald-500/50 shadow-sm transition-all hover:scale-[1.01] flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.1)]">
                          <Play className="w-4 h-4 fill-emerald-500 animate-pulse" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-zinc-900 dark:text-white truncate">
                              <StaffLink 
                                name={item.name} 
                                tenantId={tenantId} 
                                staffId={item.id} 
                                className="hover:text-indigo-600 hover:underline" 
                              />
                            </span>
                            <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-widest rounded animate-pulse">On Task</span>
                          </div>
                          <p className="text-xs text-indigo-500 font-extrabold truncate mt-1">{item.activeTask.taskTitle}</p>
                          <p className="text-[9px] text-zinc-400 font-bold uppercase truncate mt-0.5">Job: {item.activeTask.jobTitle}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0">
                        <span className="font-mono font-black text-xs text-emerald-500 whitespace-nowrap shadow-[0_0_8px_rgba(16,185,129,0.1)]">
                          {formatStopwatch(item.elapsedMs)}
                        </span>
                        <span className="text-[8px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mt-1">
                          Active
                        </span>
                      </div>
                    </div>
                  );
                } else if (item.status === 'idle') {
                  return (
                    <div 
                      key={item.id}
                      className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-amber-500/20 dark:border-amber-500/10 rounded-2xl flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center shrink-0">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-zinc-900 dark:text-white truncate">
                              <StaffLink 
                                name={item.name} 
                                tenantId={tenantId} 
                                staffId={item.id} 
                                className="hover:text-indigo-600 hover:underline" 
                              />
                            </span>
                            <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-500 text-[8px] font-black uppercase tracking-widest rounded">Clocked In</span>
                          </div>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-bold mt-1 italic">Idle / Not Clocked into Task</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0">
                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-500 text-[8px] font-black uppercase tracking-widest rounded animate-pulse">
                          Available
                        </span>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div 
                      key={item.id}
                      className="p-4 bg-zinc-50/50 dark:bg-zinc-900/20 border border-zinc-200/50 dark:border-zinc-800/30 rounded-2xl flex items-center justify-between gap-4 opacity-60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 rounded-xl flex items-center justify-center shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-zinc-500 dark:text-zinc-400 truncate">
                              <StaffLink 
                                name={item.name} 
                                tenantId={tenantId} 
                                staffId={item.id} 
                                className="hover:text-indigo-650 hover:underline" 
                              />
                            </span>
                            <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 text-[8px] font-black uppercase tracking-widest rounded">Offline</span>
                          </div>
                          <p className="text-xs text-zinc-400/70 dark:text-zinc-600 font-bold mt-1 uppercase tracking-wider text-[10px]">{item.role}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-[8px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
                          Clocked Out
                        </span>
                      </div>
                    </div>
                  );
                }
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function jobName(jobId: string, jobs: any[]) {
  const found = jobs.find(j => j.id === jobId);
  return found ? (found.jobNumber ? `#${found.jobNumber} ${found.title}` : found.title) : 'Unknown Job';
}
