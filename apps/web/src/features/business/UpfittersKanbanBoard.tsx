import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Clock, Users, RefreshCw, MapPin, ListChecks,
  Maximize, Minimize, Search, CheckCircle2,
  Layers, ArrowUpRight, Eye, Activity, Columns, Rows,
  ArrowUpDown, Building2
} from 'lucide-react';
import { 
  collection, query, where, onSnapshot, collectionGroup
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

interface UpfittersKanbanBoardProps {
  tenantId: string;
}

type Timeframe = 'today' | 'week' | 'month';
type LayoutMode = 'vertical' | 'horizontal';
type SortOption = 'status' | 'name' | 'backlog' | 'queued' | 'completed';

// Color map helper for job badges
const getJobColor = (jobId: string) => {
  const colors = [
    { bg: 'bg-teal-500/15 text-teal-400 border-teal-500/30', badge: 'bg-teal-500' },
    { bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', badge: 'bg-emerald-500' },
    { bg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', badge: 'bg-cyan-500' },
    { bg: 'bg-sky-500/15 text-sky-400 border-sky-500/30', badge: 'bg-sky-500' },
    { bg: 'bg-purple-500/15 text-purple-400 border-purple-500/30', badge: 'bg-purple-500' },
    { bg: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30', badge: 'bg-fuchsia-500' },
    { bg: 'bg-pink-500/15 text-pink-400 border-pink-500/30', badge: 'bg-pink-500' },
    { bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30', badge: 'bg-rose-500' },
    { bg: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30', badge: 'bg-indigo-500' },
  ];
  let hash = 0;
  const str = jobId || '';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

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

export function UpfittersKanbanBoard({ tenantId }: UpfittersKanbanBoardProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('status');
  const [timeframe, setTimeframe] = useState<Timeframe>('today');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('vertical');
  const [groupByDept, setGroupByDept] = useState<boolean>(false);

  // Ticker for stopwatch elapsed timer updates every second
  useEffect(() => {
    const timer = setInterval(() => {}, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => {
        toast.error(`Could not enter fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // 1. Fetch departments
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      const depts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDepartments(depts);
    });
    return () => unsub();
  }, [tenantId]);

  // 2. Fetch Jobs
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      setAllJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [tenantId]);

  // 3. Fetch Zones / Bays
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [tenantId]);

  // 4. Fetch Staff (Active non-archived staff)
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      const activeStaff = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((s: any) => !s.isArchived && !s.fireDate);
      setStaff(activeStaff);
      setLoading(false);
    });
    return () => unsub();
  }, [tenantId]);

  // 5. Fetch ALL Time Sessions (Unfiltered so active sessions are never missed)
  useEffect(() => {
    if (!tenantId) return;
    const q = collection(db, `businesses/${tenantId}/time_sessions`);
    const unsub = onSnapshot(q, (snap) => {
      setSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [tenantId]);

  // 6. Fetch Tasks (CollectionGroup)
  useEffect(() => {
    if (!tenantId) return;
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

      setAllTasks(parsedTasks);
      setLoading(false);
    }, (err) => {
      console.warn("Tasks listener fallback:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [tenantId]);

  // Map staff with tasks into structured Kanban lanes
  const upfittersData = useMemo(() => {
    // Filter staff by department if selected
    const relevantStaff = staff.filter((s: any) => {
      if (selectedDeptId === 'all') return true;
      const targetDept = departments.find(d => d.id === selectedDeptId);
      if (s.departmentId === selectedDeptId) return true;
      if (targetDept?.name && s.department?.toLowerCase() === targetDept.name.toLowerCase()) return true;
      return false;
    });

    return relevantStaff.map(member => {
      const memberDept = departments.find(d => d.id === member.departmentId) || { name: member.department || 'General' };
      
      // Comprehensive active session check matching UpfittersDashboard
      const activeSession = sessions.find(s => {
        if (s.clockOut || s.clockOutTimestamp) return false;
        const matchUser = s.userId === member.id || 
                          s.userId === member.uid || 
                          (member.userId && s.userId === member.userId) ||
                          (member.uid && s.userId === member.uid) ||
                          s.staffId === member.id ||
                          (s.userEmail && member.email && s.userEmail.toLowerCase() === member.email.toLowerCase());
        const isActiveStatus = s.status === 'active' || s.status === 'on_break' || (!s.status && !s.clockOut);
        return matchUser && isActiveStatus;
      });

      let activeTask: any = null;
      let activeJob: any = null;
      let activeZone: any = null;
      let activeSegmentStart: any = null;

      if (activeSession) {
        // Look in jobs array (segments used in UpfittersDashboard) or taskSegments array
        const activeSegment = (activeSession.jobs || []).find((j: any) => !j.end) ||
                              (activeSession.taskSegments || []).find((seg: any) => !seg.end);

        const currentTaskId = activeSegment?.taskId || activeSegment?.id || activeSession.currentTaskId || activeSession.taskId;
        const currentJobId = activeSegment?.jobId || activeSegment?.id || activeSession.currentJobId || activeSession.jobId;

        activeSegmentStart = activeSegment?.start || activeSession.clockIn?.timestamp;

        if (currentTaskId) {
          activeTask = allTasks.find(t => t.id === currentTaskId);
        }

        if (currentJobId) {
          activeJob = allJobs.find(j => j.id === currentJobId || j.jobNumber === currentJobId);
        }

        if (!activeTask) {
          const taskTitle = activeSegment?.taskName || activeSegment?.name || activeSegment?.taskTitle || activeSession.currentTaskTitle || activeSession.taskTitle || 'Production Task';
          activeTask = {
            id: currentTaskId || 'active_seg',
            title: taskTitle,
            jobId: currentJobId || activeSession.jobId,
            bookTime: activeSegment?.bookTime || activeSession.bookTime || 0
          };
        }

        if (!activeJob && activeSegment?.jobNumber) {
          activeJob = {
            id: currentJobId || 'active_job',
            jobNumber: activeSegment.jobNumber,
            customerName: activeSegment.customerName || 'Customer',
            title: activeSegment.jobTitle || 'Vehicle Upfit'
          };
        }

        if (activeJob) {
          activeZone = zones.find(z => z.currentJobId === activeJob.id);
        }
      }

      // Queued tasks assigned to this upfitter that are not completed
      const queuedTasks = allTasks.filter(t => {
        if (t.status === 'completed' || t.status === 'QC' || t.status === 'QC Complete') return false;
        if (activeTask && t.id === activeTask.id) return false;
        
        const isAssigned = (t.assignedStaffIds?.includes(member.id) || 
          t.assignedStaff?.some((as: any) => as.id === member.id || as.uid === member.id));
        
        return isAssigned;
      }).map(t => {
        const job = allJobs.find(j => j.id === t.jobId);
        const zone = job ? zones.find(z => z.currentJobId === job.id) : null;
        return {
          ...t,
          job,
          zone
        };
      });

      // Completed tasks by this upfitter within selected timeframe
      const completedTasks = allTasks.filter(t => {
        if (t.status !== 'completed' && t.status !== 'QC' && t.status !== 'QC Complete') return false;
        const isAssigned = (t.assignedStaffIds?.includes(member.id) || 
          t.assignedStaff?.some((as: any) => as.id === member.id || as.uid === member.id) ||
          t.completedBy === member.id);
        return isAssigned;
      }).map(t => {
        const job = allJobs.find(j => j.id === t.jobId);
        return {
          ...t,
          job
        };
      });

      const queuedBookHours = queuedTasks.reduce((acc, t) => acc + (parseFloat(t.bookTime) || 0), 0);

      return {
        member,
        memberDept,
        activeSession,
        activeTask,
        activeJob,
        activeZone,
        activeSegmentStart,
        queuedTasks,
        queuedBookHours,
        completedTasks
      };
    });
  }, [staff, selectedDeptId, departments, allTasks, sessions, allJobs, zones]);

  // Filter & Sort Upfitters
  const processedUpfitters = useMemo(() => {
    let list = [...upfittersData];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(({ member, memberDept, activeTask, activeJob, queuedTasks, completedTasks }) => {
        const nameMatch = `${member.firstName || ''} ${member.lastName || ''}`.toLowerCase().includes(q);
        const roleMatch = (member.role || '').toLowerCase().includes(q);
        const deptMatch = (memberDept.name || '').toLowerCase().includes(q);
        const activeTaskMatch = activeTask?.title?.toLowerCase().includes(q);
        const activeJobMatch = activeJob?.jobNumber?.toLowerCase().includes(q) || activeJob?.title?.toLowerCase().includes(q) || activeJob?.customerName?.toLowerCase().includes(q);
        const queuedMatch = queuedTasks.some((t: any) => t.title?.toLowerCase().includes(q) || t.job?.jobNumber?.toLowerCase().includes(q));
        const completedMatch = completedTasks.some((t: any) => t.title?.toLowerCase().includes(q) || t.job?.jobNumber?.toLowerCase().includes(q));

        return nameMatch || roleMatch || deptMatch || activeTaskMatch || activeJobMatch || queuedMatch || completedMatch;
      });
    }

    // Per Person Sorting
    list.sort((a, b) => {
      if (sortBy === 'status') {
        const aOnlineScore = a.activeSession ? (a.activeTask ? 3 : 2) : 1;
        const bOnlineScore = b.activeSession ? (b.activeTask ? 3 : 2) : 1;
        if (bOnlineScore !== aOnlineScore) return bOnlineScore - aOnlineScore;
        return (a.member.firstName || '').localeCompare(b.member.firstName || '');
      }
      if (sortBy === 'name') {
        return (a.member.firstName || '').localeCompare(b.member.firstName || '');
      }
      if (sortBy === 'backlog') {
        return b.queuedBookHours - a.queuedBookHours;
      }
      if (sortBy === 'queued') {
        return b.queuedTasks.length - a.queuedTasks.length;
      }
      if (sortBy === 'completed') {
        return b.completedTasks.length - a.completedTasks.length;
      }
      return 0;
    });

    return list;
  }, [upfittersData, searchQuery, sortBy]);

  // Group by department if enabled
  const groupedUpfitters = useMemo(() => {
    if (!groupByDept) return null;
    const groups: { [deptName: string]: typeof processedUpfitters } = {};
    processedUpfitters.forEach(item => {
      const dName = item.memberDept.name || 'Unassigned';
      if (!groups[dName]) groups[dName] = [];
      groups[dName].push(item);
    });
    return groups;
  }, [processedUpfitters, groupByDept]);

  // Summary counters
  const summaryCounters = useMemo(() => {
    let workingOnCount = 0;
    let queuedCount = 0;
    let completedCount = 0;

    upfittersData.forEach(item => {
      if (item.activeSession) workingOnCount++;
      queuedCount += item.queuedTasks.length;
      completedCount += item.completedTasks.length;
    });

    return { workingOnCount, queuedCount, completedCount };
  }, [upfittersData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] text-zinc-400">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mb-3" />
        <p className="text-sm font-medium">Loading Upfitters Kanban Board...</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn(
      "flex flex-col min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 transition-all duration-300",
      isFullscreen && "fixed inset-0 z-50 overflow-y-auto"
    )}>
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">Upfitters Kanban Board</h1>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  In Development
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Real-time active, queued, and completed production tasks per technician
              </p>
            </div>
          </div>
        </div>

        {/* Header Right Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Summary Stat Pills */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-1 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-emerald-400 font-semibold border-r border-zinc-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{summaryCounters.workingOnCount} Working</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-amber-400 font-semibold border-r border-zinc-800">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>{summaryCounters.queuedCount} Queued</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-cyan-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span>{summaryCounters.completedCount} Done</span>
            </div>
          </div>

          {/* Department Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs">
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer font-medium"
            >
              <option value="all" className="bg-zinc-900 text-zinc-200">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id} className="bg-zinc-900 text-zinc-200">
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer font-medium"
            >
              <option value="status" className="bg-zinc-900 text-zinc-200">Sort: Clocked In First</option>
              <option value="name" className="bg-zinc-900 text-zinc-200">Sort: Name (A-Z)</option>
              <option value="backlog" className="bg-zinc-900 text-zinc-200">Sort: Backlog Hours (High to Low)</option>
              <option value="queued" className="bg-zinc-900 text-zinc-200">Sort: Queued Tasks (Most First)</option>
              <option value="completed" className="bg-zinc-900 text-zinc-200">Sort: Completed Tasks (Most First)</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[180px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search technician..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Layout Mode Switcher */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setLayoutMode('vertical')}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium",
                layoutMode === 'vertical' ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30" : "text-zinc-400 hover:text-zinc-200"
              )}
              title="Vertical Kanban Columns per Upfitter"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Vertical</span>
            </button>
            <button
              onClick={() => setLayoutMode('horizontal')}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium",
                layoutMode === 'horizontal' ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30" : "text-zinc-400 hover:text-zinc-200"
              )}
              title="Horizontal Swimlanes per Upfitter"
            >
              <Rows className="w-3.5 h-3.5" />
              <span>Swimlanes</span>
            </button>
          </div>

          {/* Group by Dept Toggle */}
          <button
            onClick={() => setGroupByDept(prev => !prev)}
            className={cn(
              "px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all",
              groupByDept ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"
            )}
          >
            Group Depts
          </button>

          {/* Timeframe Selector */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setTimeframe('today')}
              className={cn("px-2 py-1 rounded-md transition-all font-medium", timeframe === 'today' ? "bg-zinc-800 text-white font-semibold" : "text-zinc-400 hover:text-zinc-200")}
            >
              Today
            </button>
            <button
              onClick={() => setTimeframe('week')}
              className={cn("px-2 py-1 rounded-md transition-all font-medium", timeframe === 'week' ? "bg-zinc-800 text-white font-semibold" : "text-zinc-400 hover:text-zinc-200")}
            >
              Week
            </button>
            <button
              onClick={() => setTimeframe('month')}
              className={cn("px-2 py-1 rounded-md transition-all font-medium", timeframe === 'month' ? "bg-zinc-800 text-white font-semibold" : "text-zinc-400 hover:text-zinc-200")}
            >
              Month
            </button>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {processedUpfitters.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 mt-6 bg-zinc-900/40 border border-dashed border-zinc-800 rounded-xl text-center">
          <Users className="w-10 h-10 text-zinc-600 mb-3" />
          <p className="text-base font-semibold text-zinc-300">No Technicians Found</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm">
            {searchQuery ? `No technician or task matching "${searchQuery}"` : "No staff matching the selected department filter"}
          </p>
        </div>
      ) : groupByDept && groupedUpfitters ? (
        /* GROUPED BY DEPARTMENT VIEW */
        <div className="space-y-8 mt-6">
          {Object.entries(groupedUpfitters).map(([deptName, groupItems]) => (
            <div key={deptName} className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
                <Building2 className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-bold text-white">{deptName}</h2>
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {groupItems.length} technicians
                </span>
              </div>

              {layoutMode === 'vertical' ? (
                <div className="overflow-x-auto pb-4">
                  <div className="flex gap-5 items-start min-w-max">
                    {groupItems.map(item => renderUpfitterVerticalColumn(item, tenantId, navigate, timeframe))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {groupItems.map(item => renderUpfitterHorizontalSwimlane(item, tenantId, navigate, timeframe))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : layoutMode === 'vertical' ? (
        /* VERTICAL KANBAN COLUMNS LAYOUT (Default) */
        <div className="flex-1 mt-6 overflow-x-auto pb-6">
          <div className="flex gap-5 items-start min-w-max">
            {processedUpfitters.map(item => renderUpfitterVerticalColumn(item, tenantId, navigate, timeframe))}
          </div>
        </div>
      ) : (
        /* HORIZONTAL SWIMLANES LAYOUT */
        <div className="flex-1 mt-6 space-y-6">
          {processedUpfitters.map(item => renderUpfitterHorizontalSwimlane(item, tenantId, navigate, timeframe))}
        </div>
      )}
    </div>
  );
}

// Render Vertical Column for an Upfitter
function renderUpfitterVerticalColumn(
  item: any,
  tenantId: string,
  navigate: any,
  timeframe: string
) {
  const { member, memberDept, activeSession, activeTask, activeJob, activeZone, activeSegmentStart, queuedTasks, queuedBookHours, completedTasks } = item;
  const isOnline = !!activeSession;
  const elapsedMs = getElapsedMs(activeSegmentStart || activeSession?.clockIn?.timestamp);

  return (
    <div 
      key={member.id}
      className="w-[360px] min-w-[340px] shrink-0 bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-4 flex flex-col space-y-4 shadow-xl hover:border-zinc-700/80 transition-all"
    >
      {/* Upfitter Column Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 flex items-center justify-center text-xs font-bold text-emerald-400 shadow-inner">
              {member.avatarUrl ? (
                <img src={member.avatarUrl} alt={member.firstName} className="w-full h-full rounded-xl object-cover" />
              ) : (
                `${(member.firstName || '')[0] || ''}${(member.lastName || '')[0] || ''}`
              )}
            </div>
            <span className={cn(
              "absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-zinc-900",
              isOnline ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"
            )} />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold text-white">
                {member.firstName} {member.lastName}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn(
                "inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border",
                isOnline ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-zinc-800 text-zinc-400 border-zinc-700"
              )}>
                {isOnline ? "Clocked In" : "Off Shift"}
              </span>
              <span className="text-[10px] text-zinc-400 truncate max-w-[130px]">
                {memberDept.name}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate(`/business/${tenantId}/staff/${member.id}`)}
          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg border border-zinc-700/60 transition-colors"
          title="View Staff Profile"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Section 1: WORKING ON */}
      <div className="bg-zinc-950/90 border border-emerald-500/20 rounded-xl p-3 flex flex-col">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-500/20">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Working On</span>
          </div>
          {isOnline && (
            <span className="font-mono text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
              {formatStopwatch(elapsedMs)}
            </span>
          )}
        </div>

        {activeSession ? (
          activeTask || activeJob ? (
            <div className="bg-gradient-to-br from-emerald-950/30 to-zinc-900 border border-emerald-500/30 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                {activeJob && (
                  <span className={cn("px-2 py-0.5 rounded text-[11px] font-bold border", getJobColor(activeJob.id).bg)}>
                    Job #{activeJob.jobNumber || activeJob.id.substring(0, 6)}
                  </span>
                )}
                {activeZone && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[10px] font-medium border border-zinc-700">
                    <MapPin className="w-2.5 h-2.5 text-emerald-400" />
                    {activeZone.name}
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-xs font-bold text-white">
                  {activeTask?.title || 'Active Production Task'}
                </h3>
                {activeJob && (
                  <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">
                    {activeJob.customerName || 'Customer'} • {activeJob.title || 'Vehicle Upfit'}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  Book: <strong className="text-zinc-200">{activeTask?.bookTime || '1.0'} hrs</strong>
                </span>
                {activeJob && activeJob.id !== 'active_job' && (
                  <button
                    onClick={() => navigate(`/business/${tenantId}/job/${activeJob.id}`)}
                    className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5"
                  >
                    <span>Details</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 text-center bg-zinc-900/40 rounded-xl border border-dashed border-zinc-800">
              <Activity className="w-5 h-5 text-emerald-500/60 mx-auto mb-1 animate-pulse" />
              <p className="text-[11px] font-semibold text-zinc-300">Clocked into Shop Floor</p>
              <p className="text-[10px] text-zinc-500">No specific task selected</p>
            </div>
          )
        ) : (
          <div className="p-3 text-center bg-zinc-900/20 rounded-xl border border-dashed border-zinc-800">
            <Clock className="w-5 h-5 text-zinc-600 mx-auto mb-1" />
            <p className="text-[11px] font-medium text-zinc-500">Not Clocked In</p>
          </div>
        )}
      </div>

      {/* Section 2: IN QUEUE */}
      <div className="bg-zinc-950/90 border border-amber-500/20 rounded-xl p-3 flex flex-col flex-1">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-amber-500/20">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <ListChecks className="w-3.5 h-3.5" />
            <span>In Queue ({queuedTasks.length})</span>
          </div>
          <span className="text-[11px] text-amber-400 font-semibold">
            {queuedBookHours.toFixed(1)}h Total
          </span>
        </div>

        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {queuedTasks.length === 0 ? (
            <div className="p-4 text-center text-zinc-500 text-[11px]">
              <CheckCircle2 className="w-5 h-5 text-zinc-700 mx-auto mb-1" />
              <span>Queue empty for this upfitter</span>
            </div>
          ) : (
            queuedTasks.map((t: any) => (
              <div 
                key={t.id}
                className="bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 rounded-lg p-2.5 space-y-1 transition-all"
              >
                <div className="flex items-center justify-between gap-1">
                  {t.job && (
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold border", getJobColor(t.job.id).bg)}>
                      Job #{t.job.jobNumber || t.job.id.substring(0, 6)}
                    </span>
                  )}
                  <span className="text-[10px] font-medium text-zinc-400">
                    {t.bookTime || 0} hrs
                  </span>
                </div>
                <h4 className="text-[11px] font-bold text-zinc-200 line-clamp-1">
                  {t.title}
                </h4>
                {t.job && (
                  <p className="text-[10px] text-zinc-400 line-clamp-1">
                    {t.job.customerName || 'Customer'}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Section 3: COMPLETED */}
      <div className="bg-zinc-950/90 border border-cyan-500/20 rounded-xl p-3 flex flex-col">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-cyan-500/20">
          <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Completed ({completedTasks.length})</span>
          </div>
          <span className="text-[10px] text-zinc-400 uppercase font-semibold">
            {timeframe}
          </span>
        </div>

        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
          {completedTasks.length === 0 ? (
            <div className="p-4 text-center text-zinc-500 text-[11px]">
              <Clock className="w-5 h-5 text-zinc-700 mx-auto mb-1" />
              <span>No tasks completed in this timeframe</span>
            </div>
          ) : (
            completedTasks.map((t: any) => (
              <div 
                key={t.id}
                className="bg-zinc-900/80 border border-zinc-800/80 rounded-lg p-2 space-y-1 opacity-90 hover:opacity-100 transition-opacity"
              >
                <div className="flex items-center justify-between">
                  {t.job && (
                    <span className="text-[10px] font-bold text-cyan-400">
                      Job #{t.job.jobNumber || t.job.id.substring(0, 6)}
                    </span>
                  )}
                  <span className="text-[9px] text-zinc-500">
                    Est: {t.bookTime || 0}h
                  </span>
                </div>
                <h4 className="text-[11px] font-semibold text-zinc-300 line-clamp-1">
                  {t.title}
                </h4>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Render Horizontal Swimlane for an Upfitter
function renderUpfitterHorizontalSwimlane(
  item: any,
  tenantId: string,
  navigate: any,
  timeframe: string
) {
  const { member, memberDept, activeSession, activeTask, activeJob, activeZone, activeSegmentStart, queuedTasks, queuedBookHours, completedTasks } = item;
  const isOnline = !!activeSession;
  const elapsedMs = getElapsedMs(activeSegmentStart || activeSession?.clockIn?.timestamp);

  return (
    <div 
      key={member.id}
      className="bg-zinc-900/60 border border-zinc-800/90 rounded-2xl p-4 md:p-5 transition-all duration-200 hover:border-zinc-700/80 shadow-lg"
    >
      {/* Employee Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-zinc-800/60">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 flex items-center justify-center text-sm font-bold text-emerald-400 shadow-inner">
              {member.avatarUrl ? (
                <img src={member.avatarUrl} alt={member.firstName} className="w-full h-full rounded-xl object-cover" />
              ) : (
                `${(member.firstName || '')[0] || ''}${(member.lastName || '')[0] || ''}`
              )}
            </div>
            <span className={cn(
              "absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-zinc-900",
              isOnline ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"
            )} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white leading-snug">
                {member.firstName} {member.lastName}
              </h2>
              <span className={cn(
                "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border",
                isOnline ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-zinc-800/80 text-zinc-400 border-zinc-700"
              )}>
                {isOnline ? "Clocked In" : "Off Shift"}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                {memberDept.name}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {member.role || 'Specialist'} • {queuedTasks.length} tasks queued ({queuedBookHours.toFixed(1)} hrs backlog)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => navigate(`/business/${tenantId}/staff/${member.id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg border border-zinc-700/60 transition-colors font-medium"
          >
            <Eye className="w-3.5 h-3.5 text-zinc-400" />
            <span>View Profile</span>
          </button>
        </div>
      </div>

      {/* 3-Column Horizontal Swimlane Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Column 1: WORKING ON */}
        <div className="bg-zinc-950/80 border border-emerald-500/20 rounded-xl p-3.5 flex flex-col">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-emerald-500/20">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Working On</span>
            </div>
            {isOnline && (
              <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {formatStopwatch(elapsedMs)}
              </span>
            )}
          </div>

          {activeSession ? (
            activeTask || activeJob ? (
              <div className="bg-gradient-to-br from-emerald-950/30 to-zinc-900 border border-emerald-500/30 rounded-xl p-3.5 space-y-3 flex-1">
                <div className="flex items-center justify-between gap-2">
                  {activeJob && (
                    <span className={cn("px-2.5 py-1 rounded-lg text-xs font-bold border", getJobColor(activeJob.id).bg)}>
                      Job #{activeJob.jobNumber || activeJob.id.substring(0, 6)}
                    </span>
                  )}
                  {activeZone && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[11px] font-medium border border-zinc-700">
                      <MapPin className="w-3 h-3 text-emerald-400" />
                      {activeZone.name}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white">
                    {activeTask?.title || 'Active Production Task'}
                  </h3>
                  {activeJob && (
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
                      {activeJob.customerName || 'Customer'} • {activeJob.title || 'Vehicle Upfit'}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    Book Time: <strong className="text-zinc-200">{activeTask?.bookTime || '1.0'} hrs</strong>
                  </span>
                  {activeJob && activeJob.id !== 'active_job' && (
                    <button
                      onClick={() => navigate(`/business/${tenantId}/job/${activeJob.id}`)}
                      className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5"
                    >
                      <span>Details</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-zinc-900/40 rounded-xl border border-dashed border-zinc-800">
                <Activity className="w-6 h-6 text-emerald-500/60 mb-2 animate-pulse" />
                <p className="text-xs font-semibold text-zinc-300">Clocked into Shop Floor</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">No specific production task selected</p>
              </div>
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-zinc-900/20 rounded-xl border border-dashed border-zinc-800">
              <Clock className="w-6 h-6 text-zinc-600 mb-2" />
              <p className="text-xs font-medium text-zinc-500">Not Clocked In</p>
            </div>
          )}
        </div>

        {/* Column 2: IN QUEUE */}
        <div className="bg-zinc-950/80 border border-amber-500/20 rounded-xl p-3.5 flex flex-col">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-amber-500/20">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <ListChecks className="w-4 h-4 text-amber-400" />
              <span>In Queue ({queuedTasks.length})</span>
            </div>
            <span className="text-xs text-amber-400 font-semibold">
              {queuedBookHours.toFixed(1)}h Total
            </span>
          </div>

          <div className="flex-1 space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
            {queuedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-500 text-xs">
                <CheckCircle2 className="w-6 h-6 text-zinc-700 mb-1.5" />
                <span>Queue empty for this upfitter</span>
              </div>
            ) : (
              queuedTasks.map((t: any) => (
                <div 
                  key={t.id}
                  className="bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 rounded-xl p-3 space-y-2 transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    {t.job && (
                      <span className={cn("px-2 py-0.5 rounded text-[11px] font-bold border", getJobColor(t.job.id).bg)}>
                        Job #{t.job.jobNumber || t.job.id.substring(0, 6)}
                      </span>
                    )}
                    <span className="text-[11px] font-medium text-zinc-400">
                      {t.bookTime || 0} hrs
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-zinc-200 line-clamp-1">
                    {t.title}
                  </h4>
                  {t.job && (
                    <p className="text-[11px] text-zinc-400 line-clamp-1">
                      {t.job.customerName || 'Customer'}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 3: LAST COMPLETED */}
        <div className="bg-zinc-950/80 border border-cyan-500/20 rounded-xl p-3.5 flex flex-col">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>Completed ({completedTasks.length})</span>
            </div>
            <span className="text-[11px] text-zinc-400 uppercase font-semibold">
              {timeframe}
            </span>
          </div>

          <div className="flex-1 space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
            {completedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-500 text-xs">
                <Clock className="w-6 h-6 text-zinc-700 mb-1.5" />
                <span>No tasks completed in this timeframe</span>
              </div>
            ) : (
              completedTasks.map((t: any) => (
                <div 
                  key={t.id}
                  className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-3 space-y-1.5 opacity-90 hover:opacity-100 transition-opacity"
                >
                  <div className="flex items-center justify-between">
                    {t.job && (
                      <span className="text-[10px] font-bold text-cyan-400">
                        Job #{t.job.jobNumber || t.job.id.substring(0, 6)}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500">
                      Est: {t.bookTime || 0}h
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-300 line-clamp-1">
                    {t.title}
                  </h4>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
