import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, query, orderBy, limit, doc, getDoc, updateDoc, addDoc, serverTimestamp, onSnapshot 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Search, FileSpreadsheet, LogOut, Coffee, ExternalLink, ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';
import { cn } from '../../lib/utils';
import { TimeSessionEditorModal } from '../timeclock/TimeSessionEditorModal';


interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  userId?: string;
  techNumber?: string;
  notes?: string;
  isArchived?: boolean;
  fireDate?: any;
  departmentId?: string;
}

interface TimeSession {
  id: string;
  userId: string;
  userName?: string;
  clockIn: { timestamp: any; location?: string; onSite?: boolean; };
  clockOut?: { timestamp: any; location?: string; onSite?: boolean; };
  breaks: Array<{ type: 'lunch' | 'normal'; start: any; end?: any; isPaid: boolean; }>;
  jobs?: Array<{ id: string; name: string; start: any; end?: any; taskId?: string; taskName?: string; }>;
  status: string;
}

export function StaffWorksheet({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const { permissions, isSuperAdmin } = useAuthStore();
  const canManage = isSuperAdmin || permissions['timeclock.manage'] || permissions['staff.manage'];

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [now, setNow] = useState(Date.now());
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<TimeSession | null>(null);

  // Live Subscription Data
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [jobsList, setJobsList] = useState<any[]>([]);
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [zonesList, setZonesList] = useState<any[]>([]);
  const [tasksMap, setTasksMap] = useState<Record<string, any[]>>({});
  
  // Excel Column Resizing State
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    name: 180,
    bay: 120,
    status: 120,
    activeJob: 200,
    activeTask: 180,
    hours: 100
  });

  const startColResizing = (e: React.PointerEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[colKey];

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setColWidths(prev => ({
        ...prev,
        [colKey]: Math.max(60, startWidth + deltaX)
      }));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const renderResizeHandle = (colKey: string) => (
    <div
      onPointerDown={(e) => startColResizing(e, colKey)}
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors z-30 select-none"
      style={{ touchAction: 'none' }}
    />
  );

  // Subscriptions setup
  useEffect(() => {
    if (!tenantId) return;

    // 1. Listen to staff
    const unsubStaff = onSnapshot(query(collection(db, `businesses/${tenantId}/staff`)), (snap) => {
      const activeStaff = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as StaffMember))
        .filter(s => !s.isArchived && !s.fireDate && s.departmentId);
      setStaffList(activeStaff);
    });

    // 2. Listen to jobs
    const unsubJobs = onSnapshot(query(collection(db, `businesses/${tenantId}/jobs`)), (snap) => {
      setJobsList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    // 3. Listen to zones (bays)
    const unsubZones = onSnapshot(query(collection(db, `businesses/${tenantId}/zones`)), (snap) => {
      setZonesList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    // 4. Listen to timeclock sessions for today
    const qSessions = query(collection(db, `businesses/${tenantId}/time_sessions`), orderBy('clockIn.timestamp', 'desc'), limit(200));
    const unsubSessions = onSnapshot(qSessions, (snap) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allSessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeSession));
      const todaySessions = allSessions.filter(s => {
        if (!s.clockIn?.timestamp) return false;
        const date = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
        return date >= today || s.status !== 'completed';
      });
      setSessions(todaySessions);
    });

    return () => {
      unsubStaff();
      unsubJobs();
      unsubSessions();
      unsubZones();
    };
  }, [tenantId]);

  // Active Job IDs that we need tasks for
  const activeJobIds = useMemo(() => {
    const ids = new Set<string>();
    sessions.forEach(s => {
      if (s.status !== 'completed') {
        const activeJob = s.jobs?.find(j => !j.end);
        if (activeJob && activeJob.id && activeJob.id !== 'none') {
          ids.add(activeJob.id);
        }
      }
    });
    return Array.from(ids);
  }, [sessions]);

  // Subscribe to tasks for each active jobId
  useEffect(() => {
    if (!tenantId || activeJobIds.length === 0) {
      setTasksMap({});
      return;
    }

    const unsubs = activeJobIds.map(jobId => {
      const q = query(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`));
      return onSnapshot(q, (snap) => {
        const jobTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setTasksMap(prev => ({
          ...prev,
          [jobId]: jobTasks
        }));
      }, (err) => {
        console.warn(`Could not subscribe to tasks for job ${jobId}:`, err);
      });
    });

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [tenantId, activeJobIds]);

  const getTasksForStaffAndJob = (staffMember: StaffMember, jobId: string) => {
    const jobTasks = tasksMap[jobId] || [];
    const effectiveUserId = staffMember.userId || staffMember.id;
    
    return jobTasks.filter((task: any) => {
      const isAssigned = 
        task.assignedStaffIds?.includes(effectiveUserId) || 
        task.assignedStaffIds?.includes(staffMember.id) ||
        task.assignedStaff?.some((s: any) => (s.uid || s.id) === effectiveUserId) ||
        task.assignedStaff?.some((s: any) => (s.uid || s.id) === staffMember.id);
      
      if (task.title === 'General' || task.title === 'general') return true;

      return isAssigned;
    });
  };

  // Keep live time ticking every minute
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Helper calculation functions
  const calculateDuration = (start: any, end: any) => {
    if (!start) return 0;
    const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
    const e = end ? (end.toDate ? end.toDate().getTime() : new Date(end).getTime()) : now;
    return Math.max(0, e - s);
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  // Staff list matching search and filters
  const filteredStaff = useMemo(() => {
    const filtered = staffList.filter(s => {
      const fullName = `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase();
      const matchesSearch = fullName.includes(searchTerm.toLowerCase());

      // Status resolving
      const activeSession = sessions.find(sess => sess.userId === s.userId || sess.userId === s.id);
      let status = 'out';
      if (activeSession && activeSession.status !== 'completed') {
        status = activeSession.status === 'on_break' ? 'break' : 'in';
      }

      const matchesStatus = selectedStatusFilter === 'all' || 
        (selectedStatusFilter === 'in' && status === 'in') ||
        (selectedStatusFilter === 'break' && status === 'break') ||
        (selectedStatusFilter === 'out' && status === 'out');

      return matchesSearch && matchesStatus;
    });

    // Sort: Clocked In ('in') first, then On Break ('break'), then Clocked Out ('out')
    return [...filtered].sort((a, b) => {
      const activeSessionA = sessions.find(sess => sess.userId === a.userId || sess.userId === a.id);
      const activeSessionB = sessions.find(sess => sess.userId === b.userId || sess.userId === b.id);

      let statusA = 'out';
      if (activeSessionA && activeSessionA.status !== 'completed') {
        statusA = activeSessionA.status === 'on_break' ? 'break' : 'in';
      }

      let statusB = 'out';
      if (activeSessionB && activeSessionB.status !== 'completed') {
        statusB = activeSessionB.status === 'on_break' ? 'break' : 'in';
      }

      const statusWeight: Record<string, number> = {
        in: 0,
        break: 1,
        out: 2
      };

      if (statusWeight[statusA] !== statusWeight[statusB]) {
        return statusWeight[statusA] - statusWeight[statusB];
      }

      const nameA = `${a.firstName || ''} ${a.lastName || ''}`.toLowerCase();
      const nameB = `${b.firstName || ''} ${b.lastName || ''}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [staffList, sessions, searchTerm, selectedStatusFilter]);

  // Timeclock Status Transitions
  const handleStatusChange = async (staff: StaffMember, activeSession: TimeSession | undefined, action: string) => {
    if (!canManage) return;
    const staffId = staff.id;
    const userId = staff.userId || staff.id;
    const staffName = `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'Technician';
    
    setIsUpdating(staffId);
    try {
      // 1. CLOCK IN
      if (action === 'in' && !activeSession) {
        await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
          userId: userId,
          userName: staffName,
          staffName: staffName,
          clockIn: {
            timestamp: serverTimestamp(),
            onSite: true,
            lat: null,
            lng: null
          },
          isRemote: false,
          status: 'active',
          breaks: [],
          createdAt: serverTimestamp()
        });
        toast.success(`Clocked in ${staffName}`);
      }

      // 2. CLOCK OUT
      else if (action === 'out' && activeSession) {
        const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
        const sessionSnap = await getDoc(sessionRef);
        const sessionData = sessionSnap.data();
        
        const breaks = [...(sessionData?.breaks || [])];
        if (activeSession.status === 'on_break') {
          const lastBreak = breaks[breaks.length - 1];
          if (lastBreak && !lastBreak.end) {
            lastBreak.end = new Date();
          }
        }
        
        const jobs = [...(sessionData?.jobs || [])];
        const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
        if (lastJob && !lastJob.end) {
          lastJob.end = new Date();
        }

        await updateDoc(sessionRef, {
          status: 'completed',
          clockOut: {
            timestamp: serverTimestamp(),
            onSite: true,
            lat: null,
            lng: null
          },
          breaks,
          jobs,
          updatedAt: serverTimestamp()
        });
        toast.success(`Clocked out ${staffName}`);
      }

      // 3. START LUNCH/BREAK
      else if ((action === 'break' || action === 'lunch') && activeSession && activeSession.status !== 'on_break') {
        const type = action === 'lunch' ? 'lunch' : 'normal';
        const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
        const sessionSnap = await getDoc(sessionRef);
        const sessionData = sessionSnap.data();

        const breaks = [...(sessionData?.breaks || [])];
        const jobs = [...(sessionData?.jobs || [])];
        
        const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
        let suspendedJob = null;
        if (lastJob && !lastJob.end) {
          lastJob.end = new Date();
          suspendedJob = {
            id: lastJob.id,
            name: lastJob.name,
            taskId: lastJob.taskId || null,
            taskName: lastJob.taskName || null
          };
        }

        breaks.push({
          type,
          start: new Date(),
          isPaid: type === 'normal',
          suspendedJob
        });

        await updateDoc(sessionRef, {
          breaks,
          jobs,
          status: 'on_break',
          updatedAt: serverTimestamp()
        });
        toast.success(`${staffName} is now on break`);
      }

      // 4. RESUME FROM BREAK
      else if (action === 'resume' && activeSession && activeSession.status === 'on_break') {
        const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
        const sessionSnap = await getDoc(sessionRef);
        const sessionData = sessionSnap.data();

        const breaks = [...(sessionData?.breaks || [])];
        const jobs = [...(sessionData?.jobs || [])];
        
        let suspendedJob = null;
        if (breaks.length > 0) {
          const lastBreak = breaks[breaks.length - 1];
          lastBreak.end = new Date();
          suspendedJob = lastBreak.suspendedJob;
        }

        if (suspendedJob) {
          jobs.push({
            id: suspendedJob.id,
            name: suspendedJob.name,
            taskId: suspendedJob.taskId || null,
            taskName: suspendedJob.taskName || null,
            start: new Date()
          });
        }

        await updateDoc(sessionRef, {
          breaks,
          jobs,
          jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
          status: 'active',
          updatedAt: serverTimestamp()
        });
        toast.success(`Resumed work for ${staffName}`);
      }

    } catch (err: any) {
      toast.error(`Action failed: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  // Job clock assignment changer
  const handleJobChange = async (activeSession: TimeSession, newJobId: string) => {
    if (!canManage) return;
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists()) return;
      
      const sessionData = sessionSnap.data();
      const jobs = [...(sessionData.jobs || [])];

      // End all active job segments
      jobs.forEach((j: any) => {
        if (!j.end) {
          j.end = new Date();
        }
      });

      // Switch to new job if selected
      if (newJobId && newJobId !== 'none') {
        const selectedJob = jobsList.find(j => j.id === newJobId);
        const jobName = selectedJob ? (selectedJob.jobNumber ? `#${selectedJob.jobNumber} - ${selectedJob.title}` : selectedJob.title) : 'Job';
        
        jobs.push({
          id: newJobId,
          name: jobName,
          taskId: null,
          taskName: null,
          start: new Date()
        });

        await updateDoc(sessionRef, {
          jobs,
          jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
          updatedAt: serverTimestamp()
        });

        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, newJobId), {
          lastWorkedAt: serverTimestamp()
        });

        toast.success(`Assigned to ${jobName}`);
      } else {
        await updateDoc(sessionRef, {
          jobs,
          jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
          updatedAt: serverTimestamp()
        });
        toast.success('Switched to Indirect General Labor.');
      }
    } catch (err: any) {
      toast.error(`Failed to assign job: ${err.message}`);
    }
  };

  // Parallel Job Clock-in (adds a job segment without auto-closing others)
  const handleClockIntoJob = async (activeSession: TimeSession, jobId: string) => {
    if (!canManage) return;
    if (jobId === 'none') return;
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists()) return;

      const sessionData = sessionSnap.data();
      const jobs = [...(sessionData.jobs || [])];

      // Check if already clocked into this job
      const isAlreadyIn = jobs.some((j: any) => !j.end && j.id === jobId);
      if (isAlreadyIn) {
        toast.info('Already clocked into this job.');
        return;
      }

      const selectedJob = jobsList.find(j => j.id === jobId);
      const jobName = selectedJob ? (selectedJob.jobNumber ? `#${selectedJob.jobNumber} - ${selectedJob.title}` : selectedJob.title) : 'Job';

      jobs.push({
        id: jobId,
        name: jobName,
        taskId: null,
        taskName: null,
        start: new Date()
      });

      await updateDoc(sessionRef, {
        jobs,
        jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
        updatedAt: serverTimestamp()
      });

      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        lastWorkedAt: serverTimestamp()
      });

      toast.success(`Clocked into ${jobName}`);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to clock into job');
    }
  };

  // Clock out of a single job segment (marks a job's segment as ended)
  const handleClockOutOfJobSegment = async (activeSession: TimeSession, jobId: string) => {
    if (!canManage) return;
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists()) return;

      const sessionData = sessionSnap.data();
      const jobs = [...(sessionData.jobs || [])];

      // End active segment matching this jobId
      let closedCount = 0;
      jobs.forEach((j: any) => {
        if (!j.end && j.id === jobId) {
          j.end = new Date();
          closedCount++;
        }
      });

      if (closedCount > 0) {
        await updateDoc(sessionRef, {
          jobs,
          updatedAt: serverTimestamp()
        });
        toast.success(`Clocked out of job`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to clock out of job segment');
    }
  };

  // Switch task name inline for a specific jobId segment
  const handleTaskChangeSelect = async (activeSession: TimeSession, jobId: string, taskId: string, taskName: string) => {
    if (!canManage) return;
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists()) return;

      const sessionData = sessionSnap.data();
      const jobs = [...(sessionData.jobs || [])];

      const activeJob = jobs.find((j: any) => !j.end && j.id === jobId);
      if (!activeJob) {
        toast.error('Technician is not currently clocked into this active Job.');
        return;
      }

      let bookTime = 0;
      if (taskId && taskId !== 'none') {
        try {
          const taskSnap = await getDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId));
          if (taskSnap.exists()) {
            bookTime = parseFloat(taskSnap.data().bookTime) || 0;
          }
        } catch (err) {
          console.warn('Could not fetch task bookTime', err);
        }
      }

      activeJob.taskId = taskId === 'none' ? null : taskId;
      activeJob.taskName = taskName || null;
      activeJob.bookTime = bookTime;

      await updateDoc(sessionRef, {
        jobs,
        updatedAt: serverTimestamp()
      });
      toast.success(`Switched active task to "${taskName}"`);
    } catch (err: any) {
      toast.error(`Task update failed: ${err.message}`);
    }
  };

  // Clock Out All Active Technicians
  const handleClockOutAll = async () => {
    if (!canManage) return;
    const activeStaff = sessions.filter(s => s.status !== 'completed');
    if (activeStaff.length === 0) {
      toast.info('No active technicians are clocked in.');
      return;
    }

    if (!window.confirm(`Are you sure you want to FORCE CLOCK-OUT all ${activeStaff.length} active technicians?`)) return;

    let successCount = 0;
    try {
      await Promise.all(activeStaff.map(async (session) => {
        const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, session.id);
        const sessionSnap = await getDoc(sessionRef);
        const sessionData = sessionSnap.data();
        
        const breaks = [...(sessionData?.breaks || [])];
        if (session.status === 'on_break') {
          const lastBreak = breaks[breaks.length - 1];
          if (lastBreak && !lastBreak.end) {
            lastBreak.end = new Date();
          }
        }
        
        const jobs = [...(sessionData?.jobs || [])];
        const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
        if (lastJob && !lastJob.end) {
          lastJob.end = new Date();
        }

        await updateDoc(sessionRef, {
          status: 'completed',
          clockOut: {
            timestamp: serverTimestamp(),
            onSite: true,
            lat: null,
            lng: null
          },
          breaks,
          jobs,
          updatedAt: serverTimestamp()
        });
        successCount++;
      }));
      toast.success(`Successfully clocked out ${successCount} technicians.`);
    } catch (err: any) {
      toast.error(`Reconciliation failed: ${err.message}`);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950 font-sans text-xs select-none">
      
      {/* ----------------------------------------------------
          TOP WORKBOARD HEADER
      ---------------------------------------------------- */}
      <div className="flex flex-col gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:py-5 sm:px-6 rounded-2xl shadow-sm mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-500" />
              Staff Worksheet
            </h2>
            <p className="text-sm text-zinc-500 mt-1">Excel-style live manager worksheet. Click fields directly to make fast, auto-synced changes.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={handleClockOutAll}
              className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-md active:scale-95 shrink-0"
              title="Force end shifts for all clocked in technicians"
            >
              <LogOut className="w-4 h-4" /> Clock Out All Active
            </button>
            <div className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Connected
            </div>
          </div>
        </div>

        {/* Filters and Inputs Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full border-t border-zinc-100 dark:border-zinc-800 pt-3">
          
          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search staff by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 transition dark:text-white"
            />
          </div>

          {/* Timeclock status Filter */}
          <div className="relative w-full sm:w-44">
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 transition dark:text-white"
            >
              <option value="all">All Clock Statuses</option>
              <option value="in">Clocked In (Active)</option>
              <option value="break">On Break / Lunch</option>
              <option value="out">Clocked Out</option>
            </select>
          </div>

          {/* Legend */}
          <div className="hidden lg:flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ml-auto select-none">
            <span>Grid Row Hints:</span>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/10 dark:bg-emerald-950/20 border border-emerald-500/20" /> Active</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/10 dark:bg-amber-950/20 border border-amber-500/20" /> Break</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-zinc-100 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-800" /> Out</div>
          </div>
        </div>
      </div>

      {/* Mobile Swipe Hint */}
      <div className="md:hidden flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl mb-3 font-bold text-[10px] uppercase tracking-wider animate-pulse border border-indigo-500/15">
        <span>↔ Swipe table horizontally to view all columns</span>
      </div>

      {/* ----------------------------------------------------
          SPREADSHEET GRID VIEW CONTAINER
      ---------------------------------------------------- */}
      <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-2xl shadow-sm relative no-scrollbar min-h-[500px]">
        <table className="w-full text-left border-collapse table-fixed">
          
          {/* Header Row */}
          <thead>
            <tr className="bg-zinc-150 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-extrabold uppercase select-none sticky top-0 z-40">
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.name }}>
                Technician Name {renderResizeHandle('name')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.bay }}>
                Active Bay(s) {renderResizeHandle('bay')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.status }}>
                Shift Status {renderResizeHandle('status')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.activeJob }}>
                Active Job Assignment {renderResizeHandle('activeJob')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.activeTask }}>
                Active Task / Memo {renderResizeHandle('activeTask')}
              </th>
              <th className="p-2.5 relative align-middle text-center" style={{ width: colWidths.hours }}>
                Hours Today {renderResizeHandle('hours')}
              </th>
            </tr>
          </thead>

          {/* Grid Rows */}
          <tbody>
            {filteredStaff.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-16 text-center text-zinc-400 dark:text-zinc-500 font-medium italic">
                  No staff members match the selected filter configuration.
                </td>
              </tr>
            ) : (
              filteredStaff.map((staff) => {
                // Find session associated with the technician
                const activeSession = sessions.find(s => s.userId === staff.userId || s.userId === staff.id);
                
                // Clock details
                const totalMs = activeSession ? calculateDuration(activeSession.clockIn.timestamp, activeSession.clockOut?.timestamp) : 0;
                const breakMs = activeSession?.breaks?.reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0) || 0;
                const workMs = activeSession ? Math.max(0, totalMs - breakMs) : 0;

                // Status configuration
                let clockStatus = 'out';
                let rowHighlightClass = 'bg-white dark:bg-zinc-950';
                
                if (activeSession && activeSession.status !== 'completed') {
                  if (activeSession.status === 'on_break') {
                    clockStatus = 'break';
                    rowHighlightClass = 'bg-amber-500/[0.04] dark:bg-amber-500/[0.02] hover:bg-amber-500/[0.08]';
                  } else {
                    clockStatus = 'in';
                    rowHighlightClass = 'bg-emerald-500/[0.04] dark:bg-emerald-500/[0.02] hover:bg-emerald-500/[0.08]';
                  }
                } else {
                  rowHighlightClass = 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40';
                }

                // Active job and task calculations
                const activeJobSegments = activeSession?.jobs?.filter((j: any) => !j.end) || [];

                // Active Bays calculation
                const activeBays: any[] = [];
                if (clockStatus === 'in' && activeSession?.jobs) {
                  const activeJobs = activeSession.jobs.filter((j: any) => !j.end);
                  const jobDocs = activeJobs.map(aj => jobsList.find(jl => jl.id === aj.id)).filter(Boolean);
                  const resolvedBays = jobDocs
                    .map(job => {
                      if (!job) return null;
                      // 1. Match by job.bayId
                      if (job.bayId) {
                        const match = zonesList.find(z => z.id === job.bayId || z.name === job.bayId);
                        if (match) return match;
                      }
                      // 2. Match by zone.currentJobId
                      const matchByJob = zonesList.find(z => z.currentJobId === job.id);
                      if (matchByJob) return matchByJob;

                      return null;
                    })
                    .filter(Boolean);
                  resolvedBays.forEach(bay => {
                    if (bay && !activeBays.some(b => b.id === bay.id)) {
                      activeBays.push(bay);
                    }
                  });
                  // Sort alphabetically with natural numeric ordering (e.g. 10 is after 9)
                  activeBays.sort((a, b) => 
                    (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
                  );
                }

                return (
                  <tr 
                    key={staff.id} 
                    className={cn(
                      "border-b border-zinc-200 dark:border-zinc-800/80 transition-colors font-medium text-zinc-800 dark:text-zinc-300",
                      rowHighlightClass,
                      isUpdating === staff.id && "opacity-60 pointer-events-none"
                    )}
                  >
                    {/* 1. Name */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle font-bold text-zinc-900 dark:text-white">
                      <div className="flex items-center gap-2 px-1 min-w-0">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                          clockStatus === 'in' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-450" :
                          clockStatus === 'break' ? "bg-amber-500/10 text-amber-600 dark:text-amber-450" :
                          "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                        )}>
                          {(staff.firstName?.[0] || '') + (staff.lastName?.[0] || '') || 'T'}
                        </div>
                        <span className="truncate" title={`${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'Technician'}>
                          {`${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'Technician'}
                        </span>
                        {staff.techNumber && (
                          <span className="text-[9px] text-zinc-400 font-extrabold bg-zinc-100 dark:bg-zinc-800/80 px-1 rounded ml-auto shrink-0">
                            #{staff.techNumber}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 2. Active Bay(s) */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      <div className="flex flex-wrap gap-1 items-center px-1 min-w-0">
                        {activeBays.length === 0 ? (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-650 italic px-1">--</span>
                        ) : (
                          activeBays.map(bay => (
                            <span 
                              key={bay.id} 
                              className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded border border-indigo-500/20 leading-none shrink-0"
                              title={`Working in ${bay.name}`}
                            >
                              {bay.name}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    {/* 2. Shift Status Selection */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      <select
                        value={clockStatus}
                        onChange={(e) => {
                          const action = e.target.value;
                          if (action === 'out') {
                            handleStatusChange(staff, activeSession, 'out');
                          } else if (action === 'in') {
                            if (activeSession && activeSession.status === 'on_break') {
                              handleStatusChange(staff, activeSession, 'resume');
                            } else {
                              handleStatusChange(staff, activeSession, 'in');
                            }
                          } else if (action === 'break') {
                            handleStatusChange(staff, activeSession, 'break');
                          } else if (action === 'lunch') {
                            handleStatusChange(staff, activeSession, 'lunch');
                          }
                        }}
                        disabled={!canManage}
                        className={cn(
                          "w-full bg-transparent border-none outline-none focus:ring-0 focus:border-0 font-bold p-1 text-xs dark:bg-zinc-900 rounded cursor-pointer",
                          clockStatus === 'in' ? "text-emerald-600 dark:text-emerald-455" :
                          clockStatus === 'break' ? "text-amber-600 dark:text-amber-455" :
                          "text-zinc-500"
                        )}
                      >
                        <option value="out">Clocked Out</option>
                        <option value="in">Clocked In (Active)</option>
                        <option value="break">Short Break</option>
                        <option value="lunch">Lunch Break</option>
                      </select>
                    </td>

                    {/* 3. Active Job assignment changer */}
                    <td className="p-1.5 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      {clockStatus === 'out' ? (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-600 italic px-2">Clock in first</span>
                      ) : clockStatus === 'break' ? (
                        <span className="text-[10px] text-amber-500/80 font-bold uppercase px-2 flex items-center gap-1">
                          <Coffee className="w-3.5 h-3.5" /> Suspended (Break)
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1.5 w-full">
                          {activeJobSegments.length > 0 && (
                            <div className="flex flex-col gap-1">
                              {activeJobSegments.map((segment: any, sIdx: number) => {
                                const jobDoc = jobsList.find(j => j.id === segment.id);
                                const displayName = jobDoc
                                  ? (jobDoc.jobNumber ? `#${jobDoc.jobNumber} - ${jobDoc.title}` : jobDoc.title)
                                  : (segment.name || 'Job');

                                return (
                                  <div 
                                    key={`${segment.id}-${sIdx}`} 
                                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/85 dark:border-indigo-900/30 text-xs font-semibold text-zinc-850 dark:text-zinc-200 min-w-0"
                                  >
                                    <span className="truncate flex-1" title={displayName}>
                                      {displayName}
                                    </span>
                                    <button
                                      onClick={() => navigate(`/business/${tenantId}/job/${segment.id}`)}
                                      className="p-0.5 text-zinc-400 hover:text-indigo-500 rounded transition shrink-0"
                                      title="View Job Details"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                    {canManage && (
                                      <button
                                        onClick={() => handleClockOutOfJobSegment(activeSession!, segment.id)}
                                        className="p-0.5 text-zinc-400 hover:text-rose-500 rounded transition shrink-0"
                                        title="Clock Out of Job"
                                      >
                                        <LogOut className="w-3 h-3 text-rose-500/70" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="h-7 w-full">
                            <ExcelSearchableSelect
                              options={[
                                ...(activeJobSegments.length === 0 ? [{ id: 'none', title: 'General / Indirect Labor' }] : []),
                                ...jobsList.filter(j => j.status !== 'Closed' && j.status !== 'Completed')
                              ]}
                              value=""
                              onChange={(val) => {
                                if (val === 'none') {
                                  handleJobChange(activeSession!, 'none');
                                } else {
                                  handleClockIntoJob(activeSession!, val);
                                }
                              }}
                              getLabel={(j) => j.id === 'none' ? j.title : (j.jobNumber ? `#${j.jobNumber} - ${j.title}` : j.title)}
                              getValue={(j) => j.id}
                              placeholder={activeJobSegments.length > 0 ? "+ Clock into job..." : "Choose Job..."}
                              disabled={!canManage}
                            />
                          </div>
                        </div>
                      )}
                    </td>

                    {/* 4. Active Task selector */}
                    <td className="p-1.5 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      {clockStatus === 'out' ? (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-650 italic px-2">--</span>
                      ) : clockStatus === 'break' ? (
                        <span className="text-[10px] text-zinc-450 dark:text-zinc-650 italic px-2">--</span>
                      ) : activeJobSegments.length === 0 ? (
                        <span className="text-[10px] text-zinc-450 dark:text-zinc-500 px-2 italic">Shop General</span>
                      ) : (
                        <div className="flex flex-col gap-1.5 w-full">
                          {activeJobSegments.map((segment: any, sIdx: number) => {
                            const assignedTasks = getTasksForStaffAndJob(staff, segment.id);
                            const activeTaskId = segment.taskId || 'none';

                            return (
                              <div key={`${segment.id}-${sIdx}`} className="flex items-center gap-1.5 w-full h-7">
                                <select
                                  value={activeTaskId}
                                  onChange={(e) => {
                                    const selectedId = e.target.value;
                                    if (selectedId === 'none') {
                                      handleTaskChangeSelect(activeSession!, segment.id, 'none', 'General');
                                    } else {
                                      const selectedTask = assignedTasks.find(t => t.id === selectedId);
                                      handleTaskChangeSelect(activeSession!, segment.id, selectedId, selectedTask?.title || 'Task');
                                    }
                                  }}
                                  disabled={!canManage}
                                  className="flex-1 bg-transparent border-none outline-none focus:ring-0 focus:border-0 font-bold p-1 text-xs text-zinc-850 dark:text-zinc-350 dark:bg-zinc-900 rounded cursor-pointer truncate"
                                >
                                  <option value="none">General / Unassigned</option>
                                  {assignedTasks.map(t => (
                                    <option key={t.id} value={t.id}>
                                      {t.title}
                                    </option>
                                  ))}
                                  {activeTaskId !== 'none' && !assignedTasks.some(t => t.id === activeTaskId) && (
                                    <option value={activeTaskId}>
                                      {segment.taskName || 'Active Task'}
                                    </option>
                                  )}
                                </select>
                                {activeTaskId && activeTaskId !== 'none' && (
                                  <button
                                    onClick={() => navigate(`/business/${tenantId}/task/${segment.id}/${activeTaskId}`)}
                                    className="p-1 text-zinc-400 hover:text-indigo-500 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0"
                                    title="View Task Details"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {/* A spacer to match the height of the "+ Clock into job" dropdown in the Active Job Assignment column */}
                          <div className="h-7 w-full shrink-0" />
                        </div>
                      )}
                    </td>

                    {/* 5. Worked Hours today */}
                    <td 
                      className={cn(
                        "p-1.5 align-middle text-center font-mono text-xs font-bold transition-colors select-none",
                        activeSession && canManage 
                          ? "cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-950/15" 
                          : "text-zinc-400 dark:text-zinc-650"
                      )}
                      title={activeSession && canManage ? "Click to edit time entry" : undefined}
                      onClick={() => {
                        if (activeSession && canManage) {
                          setEditingSession(activeSession);
                        }
                      }}
                    >
                      {activeSession ? (
                        <div className="flex flex-col items-center">
                          <span className={cn(
                            "font-extrabold",
                            clockStatus === 'in' ? "text-indigo-600 dark:text-indigo-400" :
                            clockStatus === 'break' ? "text-amber-500" :
                            "text-zinc-500 dark:text-zinc-450"
                          )}>
                            {formatDuration(workMs)}
                          </span>
                          {breakMs > 0 && (
                            <span className="text-[9px] text-amber-500 font-bold">
                              Break: {formatDuration(breakMs)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="italic">--</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {editingSession && (
        <TimeSessionEditorModal
          tenantId={tenantId}
          session={editingSession as any}
          onClose={() => setEditingSession(null)}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}

interface ExcelSearchableSelectProps<T> {
  options: T[];
  value: string;
  onChange: (value: string) => void;
  getLabel: (option: T) => string;
  getValue: (option: T) => string;
  placeholder?: string;
  disabled?: boolean;
}

function ExcelSearchableSelect<T>({
  options,
  value,
  onChange,
  getLabel,
  getValue,
  placeholder = 'Select...',
  disabled = false
}: ExcelSearchableSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => getValue(o) === value);
  const filteredOptions = options.filter(o => {
    const label = getLabel(o);
    if (label && label.toLowerCase().includes(search.toLowerCase())) return true;
    
    // Deep search for Job objects
    if (o && typeof o === 'object') {
      const obj = o as any;
      const searchStr = search.toLowerCase();
      
      if (obj.customerName && String(obj.customerName).toLowerCase().includes(searchStr)) return true;
      if (obj.vin && String(obj.vin).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleVin && String(obj.vehicleVin).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleName && String(obj.vehicleName).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleMake && String(obj.vehicleMake).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleModel && String(obj.vehicleModel).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleYear && String(obj.vehicleYear).toLowerCase().includes(searchStr)) return true;
      if (obj.jobNumber && String(obj.jobNumber).toLowerCase().includes(searchStr)) return true;
      if (obj.title && String(obj.title).toLowerCase().includes(searchStr)) return true;
    }
    
    return false;
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        onChange(getValue(filteredOptions[0]));
      }
      setIsOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full font-sans select-none">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setSearch('');
          }
        }}
        className={cn(
          "w-full h-full text-left px-2 py-1 text-xs font-bold bg-transparent border-none outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800/60 rounded flex items-center justify-between cursor-pointer group",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span className="truncate pr-2 dark:text-zinc-350">
          {selectedOption ? (getLabel(selectedOption) || '') : placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[240px] max-w-[320px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-[150] overflow-hidden">
          <div className="p-1.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by Job, Cust, Veh, VIN..."
              className="w-full bg-transparent border-none outline-none text-xs dark:text-white placeholder-zinc-400"
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const optVal = getValue(option);
                const isSelected = optVal === value;
                return (
                  <button
                    key={optVal}
                    type="button"
                    onClick={() => {
                      onChange(optVal);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={cn(
                      "w-full px-2 py-1.5 text-left text-xs font-semibold rounded-lg transition-colors",
                      isSelected 
                        ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400" 
                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850"
                    )}
                  >
                    <div className="flex flex-col min-w-0 text-left w-full">
                      <span className="truncate text-xs font-bold leading-tight">{getLabel(option) || ''}</span>
                      {option && typeof option === 'object' && ('customerName' in option || 'vehicleName' in option || 'vin' in option || 'vehicleVin' in option) && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] font-medium text-zinc-400 dark:text-zinc-500 mt-1 max-w-full leading-none">
                          {(option as any).customerName && (
                            <span className="truncate max-w-[130px] bg-zinc-100 dark:bg-zinc-800/80 px-1 py-0.5 rounded text-[8px] font-bold">Cust: {(option as any).customerName}</span>
                          )}
                          {((option as any).vehicleName || (option as any).vehicleMake) && (
                            <span className="truncate max-w-[130px]">Veh: {((option as any).vehicleName || `${(option as any).vehicleYear || ''} ${(option as any).vehicleMake || ''} ${(option as any).vehicleModel || ''}`).trim()}</span>
                          )}
                          {((option as any).vin || (option as any).vehicleVin) && (
                            <span className="shrink-0 font-mono text-[8px] uppercase">VIN: {String((option as any).vin || (option as any).vehicleVin).slice(-8)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center text-[10px] text-zinc-400 italic">No matches found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
