import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import {
  Activity, Clock, Wrench, ShieldCheck, Sparkles, CheckCircle2,
  AlertTriangle, Package, Users, User, FileText,
  ChevronRight, Filter, ExternalLink, ArrowRight, Search, Table
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';

interface ProgressDigestV3Props {
  tenantId: string;
}

const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val === 'object' && !val.toDate && !val.seconds && !(val instanceof Date)) {
    if (val.timestamp) val = val.timestamp;
    else if (val.time) val = val.time;
    else if (val.date) val = val.date;
  }
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

const formatElapsedMs = (diffMs: number) => {
  if (diffMs <= 0 || isNaN(diffMs)) return '0m';
  const totalSecs = Math.floor(diffMs / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m ${secs}s`;
};

const isTaskCompleted = (t: any) => {
  if (!t) return false;
  if (t.completed === true || t.isCompleted === true) return true;
  const s = (t.status || '').toLowerCase().trim();
  return ['completed', 'complete', 'qc', 'qc complete', 'closed', 'done'].includes(s);
};

const isToday = (dateVal: any) => {
  if (!dateVal) return false;
  let d: Date | null = null;
  if (typeof dateVal.toDate === 'function') {
    try { d = dateVal.toDate(); } catch (e) {}
  } else if (dateVal.seconds) {
    d = new Date(dateVal.seconds * 1000);
  } else {
    d = new Date(dateVal);
  }
  if (!d || isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
};

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
}

function MiniEfficiencySparkline({ data, width = 74, height = 18 }: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <div className="w-[74px] h-[18px] flex items-center justify-center text-[8px] text-zinc-600 font-mono italic">
        -- trend --
      </div>
    );
  }

  const maxVal = Math.max(125, ...data);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - ((val - minVal) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const lastVal = data[data.length - 1];
  const strokeColor = lastVal >= 100 ? '#10b981' : lastVal >= 75 ? '#6366f1' : lastVal > 0 ? '#f59e0b' : '#71717a';

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1].split(',')[0]}
          cy={points[points.length - 1].split(',')[1]}
          r="2"
          fill={strokeColor}
        />
      )}
    </svg>
  );
}

export function ProgressDigestV3({ tenantId }: ProgressDigestV3Props) {
  const navigate = useNavigate();

  // Selected Department Filter ('all' or deptId)
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'working' | 'idle' | 'off'>('all');

  // Subscribed State & Last Updated Timestamp
  const [jobs, setJobs] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [tasksMap, setTasksMap] = useState<Record<string, any[]>>({});
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const touchLastUpdated = () => setLastUpdated(new Date());

  // Subscriptions
  useEffect(() => {
    if (!tenantId) return;

    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      touchLastUpdated();
    });

    const unsubParts = onSnapshot(collection(db, `businesses/${tenantId}/parts_requests`), (snap) => {
      setPartsRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      touchLastUpdated();
    });

    const unsubStaff = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      touchLastUpdated();
    });

    const unsubDepts = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      touchLastUpdated();
    });

    const unsubSessions = onSnapshot(collection(db, `businesses/${tenantId}/time_sessions`), (snap) => {
      setActiveSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      touchLastUpdated();
    });

    return () => {
      unsubJobs();
      unsubParts();
      unsubStaff();
      unsubDepts();
      unsubSessions();
    };
  }, [tenantId]);

  // Subscribe to tasks for all active jobs
  const activeJobIds = useMemo(() => {
    return jobs.map(j => j.id);
  }, [jobs]);

  useEffect(() => {
    if (!tenantId || activeJobIds.length === 0) return;
    const unsubs = activeJobIds.map(jobId => {
      return onSnapshot(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), (snap) => {
        const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setTasksMap(prev => ({ ...prev, [jobId]: tasks }));
        touchLastUpdated();
      });
    });
    return () => unsubs.forEach(unsub => unsub());
  }, [tenantId, activeJobIds]);

  // Roster Scope Filter ('today' | 'active' | 'all') - Defaults to 'today'
  const [rosterScope, setRosterScope] = useState<'today' | 'active' | 'all'>('today');

  // Live Timer Ticker (ticks every second for real-time task & shift duration counters)
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute Department Roster & Live Labor
  const roster = useMemo(() => {
    const allProcessed = staff.map(st => {
      const isArchivedOrFired = Boolean(
        st.isArchived || 
        st.fireDate || 
        st.isDeviceAccount || 
        st.isKiosk || 
        ['inactive', 'terminated', 'disabled'].includes((st.status || '').toLowerCase())
      );

      // Sessions today or active session
      const userSessions = activeSessions.filter(s => s.userId === st.userId || s.userId === st.id);
      const activeSession = userSessions.find(s => ['active', 'on_break'].includes(s.status));
      const hasClockedInToday = Boolean(
        activeSession || 
        userSessions.some(s => isToday(s.clockIn) || isToday(s.startTime) || isToday(s.clockInTime))
      );

      const activeJob = activeSession?.jobs?.[activeSession.jobs.length - 1];
      const isWorkingOnTask = activeJob && !activeJob.end;

      // Start Timestamps
      const taskStartMs = parseSafeDate(activeJob?.start || activeJob?.startTime)?.getTime() || 0;
      const shiftStartMs = parseSafeDate(activeSession?.clockIn || activeSession?.startTime || activeSession?.createdAt)?.getTime() || 0;

      // Find department name
      const dept = departments.find(d => d.id === st.departmentId);

      // Tasks completed today strictly by this staff member
      let completedCountToday = 0;
      let completedBookHoursToday = 0;

      const stNameLower = ((st.firstName || st.name || '') + ' ' + (st.lastName || '')).toLowerCase().trim();

      Object.entries(tasksMap).forEach(([, tasks]) => {
        tasks.forEach(t => {
          const isFinished = isTaskCompleted(t);
          const finishedToday = isToday(t.completedAt || t.completedDate || t.qcCompletedAt || t.closedAt || t.statusChangedAt || t.updatedAt || t.timestamp);
          
          const isCompletedByStaff = Boolean(
            (t.completedByStaffId && (t.completedByStaffId === st.id || t.completedByStaffId === st.userId)) ||
            (t.completedBy && (t.completedBy === st.id || t.completedBy === st.userId || t.completedBy === st.email)) ||
            (t.assignedTo && (t.assignedTo === st.id || t.assignedTo === st.userId)) ||
            (t.completedByStaffName && stNameLower.includes(t.completedByStaffName.toLowerCase().trim())) ||
            (t.completedBy && typeof t.completedBy === 'string' && stNameLower.includes(t.completedBy.toLowerCase().trim()))
          );

          if (isFinished && finishedToday && isCompletedByStaff) {
            completedCountToday++;
            const bTime = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0');
            if (!isNaN(bTime) && bTime > 0) {
              completedBookHoursToday += bTime;
            }
          }
        });
      });

      // Sort Priority Score:
      // Working on task (3e12 + taskStartMs) > Clocked in idle (2e12 + shiftStartMs) > Clocked Out (1e12)
      let sortScore = 1000000000000;
      if (activeSession && activeSession.status === 'active') {
        if (isWorkingOnTask && taskStartMs > 0) {
          sortScore = 3000000000000 + taskStartMs;
        } else if (isWorkingOnTask) {
          sortScore = 3000000000000;
        } else if (shiftStartMs > 0) {
          sortScore = 2000000000000 + shiftStartMs;
        } else {
          sortScore = 2000000000000;
        }
      }

      // Calculate total shift hours today & hourly trend (from 7 AM to current hour)
      let shiftMsToday = 0;
      userSessions.forEach(s => {
        const sClockIn = parseSafeDate(s.clockIn || s.startTime || s.createdAt)?.getTime();
        const sClockOut = parseSafeDate(s.clockOut || s.endTime)?.getTime();
        const isActive = ['active', 'on_break'].includes(s.status);
        if (sClockIn && (isActive || isToday(sClockIn))) {
          const endMs = isActive ? Date.now() : (sClockOut || Date.now());
          shiftMsToday += Math.max(0, endMs - sClockIn);
        }
      });

      const shiftHoursToday = Number((shiftMsToday / 3600000).toFixed(1));
      const shiftEfficiencyPct = shiftHoursToday > 0 && completedBookHoursToday > 0
        ? Math.round((completedBookHoursToday / shiftHoursToday) * 100)
        : 0;

      // Hourly Trend Points (from 7 AM to current hour)
      const currentHour = new Date().getHours();
      const trendPoints: number[] = [];

      for (let h = 7; h <= Math.max(7, currentHour); h++) {
        const hourTargetDate = new Date();
        hourTargetDate.setHours(h, 59, 59, 999);
        const targetMs = hourTargetDate.getTime();

        // Shift hours up to hour h
        let shiftMsAtH = 0;
        userSessions.forEach(s => {
          const sClockIn = parseSafeDate(s.clockIn || s.startTime || s.createdAt)?.getTime();
          const sClockOut = parseSafeDate(s.clockOut || s.endTime)?.getTime();
          if (sClockIn && isToday(sClockIn) && sClockIn <= targetMs) {
            const endMs = Math.min(targetMs, sClockOut || Date.now());
            shiftMsAtH += Math.max(0, endMs - sClockIn);
          }
        });
        const shiftHrsAtH = shiftMsAtH / 3600000;

        // Completed book hours up to hour h
        let bookHrsAtH = 0;
        Object.entries(tasksMap).forEach(([, tasks]) => {
          tasks.forEach(t => {
            const isFinished = isTaskCompleted(t);
            const compDate = parseSafeDate(t.completedAt || t.completedDate || t.qcCompletedAt || t.closedAt || t.statusChangedAt || t.updatedAt || t.timestamp);
            if (isFinished && compDate && isToday(compDate) && compDate.getTime() <= targetMs) {
              const isCompletedByStaff = Boolean(
                (t.completedByStaffId && (t.completedByStaffId === st.id || t.completedByStaffId === st.userId)) ||
                (t.completedBy && (t.completedBy === st.id || t.completedBy === st.userId || t.completedBy === st.email)) ||
                (t.assignedTo && (t.assignedTo === st.id || t.assignedTo === st.userId)) ||
                (t.completedByStaffName && stNameLower.includes(t.completedByStaffName.toLowerCase().trim())) ||
                (t.completedBy && typeof t.completedBy === 'string' && stNameLower.includes(t.completedBy.toLowerCase().trim()))
              );
              if (isCompletedByStaff) {
                const bTime = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0');
                if (!isNaN(bTime) && bTime > 0) bookHrsAtH += bTime;
              }
            }
          });
        });

        const effAtH = shiftHrsAtH > 0 ? Math.round((bookHrsAtH / shiftHrsAtH) * 100) : 0;
        trendPoints.push(effAtH);
      }

      return {
        ...st,
        deptName: dept?.name || 'General / Unassigned',
        clockStatus: activeSession ? (activeSession.status === 'on_break' ? 'break' : 'clocked_in') : 'clocked_out',
        activeSession,
        activeJob,
        isWorkingOnTask,
        taskStartMs,
        shiftStartMs,
        completedCountToday,
        completedBookHoursToday: Number(completedBookHoursToday.toFixed(2)),
        shiftHoursToday,
        shiftEfficiencyPct,
        trendPoints,
        isArchivedOrFired,
        hasClockedInToday,
        sortScore
      };
    });

    return allProcessed.filter(st => {
      if (rosterScope === 'all') return true;
      if (rosterScope === 'active') return !st.isArchivedOrFired;
      // Default 'today': only non-archived staff who clocked in today or currently active
      return !st.isArchivedOrFired && st.hasClockedInToday;
    });
  }, [staff, activeSessions, departments, tasksMap, rosterScope]);

  // Filter Roster by Selected Department & Status Filter AND Sort Most Recently Clocked In First
  const filteredRoster = useMemo(() => {
    return roster
      .filter(st => {
        if (selectedDeptId !== 'all' && st.departmentId !== selectedDeptId) return false;
        if (selectedStatusFilter === 'working') return st.clockStatus === 'clocked_in' && st.isWorkingOnTask;
        if (selectedStatusFilter === 'idle') return st.clockStatus === 'clocked_in' && !st.isWorkingOnTask;
        if (selectedStatusFilter === 'off') return st.clockStatus === 'clocked_out';
        return true;
      })
      .sort((a, b) => b.sortScore - a.sortScore);
  }, [roster, selectedDeptId, selectedStatusFilter]);

  // Stream of Today's Completed Tasks with Rich Technician, Job, & Vehicle Details
  const completedTasksFeed = useMemo(() => {
    const feed: any[] = [];
    Object.entries(tasksMap).forEach(([jobId, tasks]) => {
      const job = jobs.find(j => j.id === jobId);
      tasks.forEach(t => {
        const isFinished = isTaskCompleted(t);
        const compDate = parseSafeDate(t.completedAt || t.completedDate || t.qcCompletedAt || t.closedAt || t.statusChangedAt || t.updatedAt || t.timestamp);
        const finishedToday = isToday(compDate);

        if (isFinished && finishedToday) {
          // Find technician name
          const completedByStaff = staff.find(s => 
            s.id === t.completedByStaffId || 
            s.userId === t.completedByStaffId || 
            s.id === t.completedBy || 
            s.userId === t.completedBy ||
            s.id === t.assignedTo ||
            s.userId === t.assignedTo
          );

          const techName = t.completedByStaffName || 
            (completedByStaff ? `${completedByStaff.firstName || completedByStaff.name || 'Tech'} ${completedByStaff.lastName || ''}`.trim() : (t.completedBy || 'Technician'));

          // Vehicle info
          const vehicleInfo = job?.vehicleYearMakeModel || job?.vehicleName || job?.vehicleId || job?.vehicleVin || job?.vehicle || '';

          // Completion time & task note string
          const completionTime = compDate ? compDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
          const bookTimeVal = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0');
          const taskNote = t.note || t.notes || t.qcNote || t.techNote || t.completionNote || t.completionNotes || t.description || '';

          feed.push({
            ...t,
            jobId,
            jobNumber: job?.jobNumber || 'N/A',
            jobTitle: job?.title || 'Upfit Job',
            customerName: job?.customerName || job?.customer || '',
            vehicleInfo,
            techName,
            completionTime,
            taskNote: typeof taskNote === 'string' ? taskNote.trim() : '',
            bookTimeVal: isNaN(bookTimeVal) ? 0 : bookTimeVal,
            compMs: compDate?.getTime() || 0
          });
        }
      });
    });

    return feed.sort((a, b) => b.compMs - a.compMs);
  }, [tasksMap, jobs, staff]);

  // Jobs Ready for QC
  const readyForQcJobs = useMemo(() => {
    return jobs.filter(j => ['ready for qc', 'qc', 'ready_for_qc'].includes((j.status || '').toLowerCase().trim()));
  }, [jobs]);

  // Blocked / Missing Parts Jobs
  const partsBlockedJobs = useMemo(() => {
    return jobs.filter(j => {
      const jobParts = partsRequests.filter(p => p.jobId === j.id);
      return jobParts.some(p => ['pending', 'ordered'].includes((p.status || '').toLowerCase().trim()));
    }).map(j => {
      const jobParts = partsRequests.filter(p => p.jobId === j.id);
      const pendingParts = jobParts.filter(p => ['pending', 'ordered'].includes((p.status || '').toLowerCase().trim()));
      return { ...j, pendingParts };
    });
  }, [jobs, partsRequests]);

  // Filter for Daily Activity Log Table
  const [logFilterCategory, setLogFilterCategory] = useState<'all' | 'task' | 'shift' | 'parts' | 'qc'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  // Unified Excel-Style Daily Log Stream (Tasks, Shifts, Parts, QC Queue)
  const unifiedDailyLogFeed = useMemo(() => {
    const feed: any[] = [];

    // 1. Finished Tasks
    Object.entries(tasksMap).forEach(([jobId, tasks]) => {
      const job = jobs.find(j => j.id === jobId);
      tasks.forEach(t => {
        const isFinished = isTaskCompleted(t);
        const compDate = parseSafeDate(t.completedAt || t.completedDate || t.qcCompletedAt || t.closedAt || t.statusChangedAt || t.updatedAt || t.timestamp);
        if (isFinished && compDate && isToday(compDate)) {
          const completedByStaff = staff.find(s => 
            s.id === t.completedByStaffId || s.userId === t.completedByStaffId || s.id === t.completedBy || s.userId === t.completedBy || s.id === t.assignedTo || s.userId === t.assignedTo
          );
          const techName = t.completedByStaffName || (completedByStaff ? `${completedByStaff.firstName || completedByStaff.name || 'Tech'} ${completedByStaff.lastName || ''}`.trim() : (t.completedBy || 'Technician'));
          const vehicleInfo = job?.vehicleYearMakeModel || job?.vehicleName || job?.vehicleId || job?.vehicleVin || job?.vehicle || '';
          const bookTimeVal = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0');
          const taskNote = t.note || t.notes || t.qcNote || t.techNote || t.completionNote || t.completionNotes || t.description || '';

          feed.push({
            id: `task_${t.id}_${compDate.getTime()}`,
            category: 'task',
            badgeLabel: 'TASK DONE',
            badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
            timestamp: compDate,
            timeStr: compDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            who: techName,
            jobId,
            jobNumber: job?.jobNumber || 'N/A',
            jobTitle: job?.title || 'Upfit Job',
            customerName: job?.customerName || job?.customer || '',
            vehicleInfo,
            details: `${t.name || t.title || 'Task'} ${bookTimeVal > 0 ? `(${bookTimeVal}h Book)` : ''}`,
            note: typeof taskNote === 'string' ? taskNote.trim() : '',
            status: t.status || 'QC'
          });
        }
      });
    });

    // 2. Timeclock Sessions (Clock In / Clock Out / Task Start)
    activeSessions.forEach(s => {
      const stMember = staff.find(st => st.id === s.userId || st.userId === s.userId);
      const who = stMember ? `${stMember.firstName || stMember.name || 'Staff'} ${stMember.lastName || ''}`.trim() : 'Staff Member';

      // Clock In Event
      const clockInDate = parseSafeDate(s.clockIn || s.startTime || s.createdAt);
      if (clockInDate && isToday(clockInDate)) {
        feed.push({
          id: `shift_in_${s.id}_${clockInDate.getTime()}`,
          category: 'shift',
          badgeLabel: 'CLOCK IN',
          badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          timestamp: clockInDate,
          timeStr: clockInDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          who,
          jobId: '',
          jobNumber: '--',
          jobTitle: 'Timeclock Shift',
          customerName: '',
          vehicleInfo: '',
          details: `Clocked into shift (${s.deptName || stMember?.deptName || 'General'})`,
          note: '',
          status: 'Active Shift'
        });
      }

      // Clock Out Event
      const clockOutDate = parseSafeDate(s.clockOut || s.endTime);
      if (clockOutDate && isToday(clockOutDate)) {
        feed.push({
          id: `shift_out_${s.id}_${clockOutDate.getTime()}`,
          category: 'shift',
          badgeLabel: 'CLOCK OUT',
          badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700',
          timestamp: clockOutDate,
          timeStr: clockOutDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          who,
          jobId: '',
          jobNumber: '--',
          jobTitle: 'Timeclock Shift',
          customerName: '',
          vehicleInfo: '',
          details: `Clocked out of shift`,
          note: '',
          status: 'Shift Completed'
        });
      }

      // Task Clock-ins inside session
      if (Array.isArray(s.jobs)) {
        s.jobs.forEach((jTask: any, idx: number) => {
          const taskStart = parseSafeDate(jTask.start || jTask.startTime);
          if (taskStart && isToday(taskStart)) {
            const job = jobs.find(j => j.id === jTask.id || j.id === jTask.jobId);
            feed.push({
              id: `task_start_${s.id}_${idx}_${taskStart.getTime()}`,
              category: 'shift',
              badgeLabel: 'TASK START',
              badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
              timestamp: taskStart,
              timeStr: taskStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              who,
              jobId: jTask.id || jTask.jobId || '',
              jobNumber: job?.jobNumber || 'N/A',
              jobTitle: jTask.name || job?.title || 'Job Task',
              customerName: job?.customerName || '',
              vehicleInfo: job?.vehicleYearMakeModel || '',
              details: `Clocked into task: ${jTask.taskName || jTask.name || 'Labor Task'}`,
              note: '',
              status: 'In Progress'
            });
          }
        });
      }
    });

    // 3. Parts Requests Activity
    partsRequests.forEach(p => {
      const pDate = parseSafeDate(p.createdAt || p.updatedAt || p.requestedAt);
      if (pDate && isToday(pDate)) {
        const job = jobs.find(j => j.id === p.jobId);
        const reqStaff = staff.find(s => s.id === p.requestedBy || s.userId === p.requestedBy);
        const who = p.requestedByName || (reqStaff ? `${reqStaff.firstName || reqStaff.name} ${reqStaff.lastName || ''}`.trim() : 'Parts Dept');

        feed.push({
          id: `part_${p.id}_${pDate.getTime()}`,
          category: 'parts',
          badgeLabel: 'PARTS',
          badgeClass: p.status === 'received' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          timestamp: pDate,
          timeStr: pDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          who,
          jobId: p.jobId || '',
          jobNumber: job?.jobNumber || 'N/A',
          jobTitle: job?.title || 'Upfit Job',
          customerName: job?.customerName || '',
          vehicleInfo: job?.vehicleYearMakeModel || '',
          details: `Part: ${p.partName || p.name || 'Requested Part'} ${p.partNumber ? `(#${p.partNumber})` : ''} - Qty: ${p.quantity || 1}`,
          note: p.notes || p.note || '',
          status: (p.status || 'pending').toUpperCase()
        });
      }
    });

    // 4. Ready for QC Jobs
    readyForQcJobs.forEach(j => {
      const jDate = parseSafeDate(j.updatedAt || j.statusChangedAt || j.createdAt);
      if (jDate && isToday(jDate)) {
        feed.push({
          id: `qc_${j.id}_${jDate.getTime()}`,
          category: 'qc',
          badgeLabel: 'QC QUEUE',
          badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          timestamp: jDate,
          timeStr: jDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          who: j.assignedTechName || 'Shop Foreman',
          jobId: j.id,
          jobNumber: j.jobNumber || 'N/A',
          jobTitle: j.title || 'Upfit Job',
          customerName: j.customerName || '',
          vehicleInfo: j.vehicleYearMakeModel || '',
          details: `Vehicle upfit completed — moved to Ready for QC Inspection`,
          note: '',
          status: 'READY FOR QC'
        });
      }
    });

    return feed.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [tasksMap, jobs, staff, activeSessions, partsRequests, readyForQcJobs]);

  const filteredDailyLog = useMemo(() => {
    return unifiedDailyLogFeed.filter(item => {
      if (logFilterCategory !== 'all' && item.category !== logFilterCategory) return false;
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase().trim();
        const searchStr = `${item.who} ${item.jobNumber} ${item.jobTitle} ${item.customerName} ${item.vehicleInfo} ${item.details} ${item.note} ${item.status}`.toLowerCase();
        if (!searchStr.includes(q)) return false;
      }
      return true;
    });
  }, [unifiedDailyLogFeed, logFilterCategory, logSearchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const clockedInCount = roster.filter(r => r.clockStatus === 'clocked_in' || r.clockStatus === 'break').length;
    const workingOnTaskCount = roster.filter(r => r.clockStatus === 'clocked_in' && r.isWorkingOnTask).length;
    const idleCount = clockedInCount - workingOnTaskCount;
    const completedTasksCount = completedTasksFeed.length;
    const readyForQcCount = readyForQcJobs.length;
    const partsBlockedCount = partsBlockedJobs.length;

    return {
      clockedInCount,
      workingOnTaskCount,
      idleCount,
      completedTasksCount,
      readyForQcCount,
      partsBlockedCount,
      totalStaff: roster.length
    };
  }, [roster, completedTasksFeed, readyForQcJobs, partsBlockedJobs]);

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 bg-zinc-950 font-sans text-xs select-none gap-6 overflow-auto min-h-screen text-zinc-100">
      
      {/* Executive Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-5 rounded-2xl shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400 shrink-0 animate-pulse" />
            <h1 className="text-xl font-black text-white uppercase tracking-wider">Progress Digest (v3)</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Live Command Center
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time overview for Shop Owner & VP of Operations: Live labor roster, task assignments, completed work feed, QC queue, and parts status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-xl border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Updated {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </div>

      {/* KPI Stat Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Clocked In */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col justify-between h-24 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 font-bold text-[10px] uppercase">
            <span>Staff Clocked In</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {metrics.clockedInCount} <span className="text-xs font-normal text-zinc-500">/ {metrics.totalStaff}</span>
          </div>
          <div className="text-[9px] text-emerald-400 font-semibold">{metrics.workingOnTaskCount} working on active tasks</div>
        </div>

        {/* Working on Task */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col justify-between h-24 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 font-bold text-[10px] uppercase">
            <span>Active Technicians</span>
            <Wrench className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {metrics.workingOnTaskCount}
          </div>
          <div className="text-[9px] text-amber-400 font-semibold">{metrics.idleCount} unallocated / idle</div>
        </div>

        {/* Tasks Completed Today */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col justify-between h-24 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 font-bold text-[10px] uppercase">
            <span>Completed Today</span>
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {metrics.completedTasksCount}
          </div>
          <div className="text-[9px] text-zinc-400 font-semibold">Tasks finished today</div>
        </div>

        {/* Ready for QC */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col justify-between h-24 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 font-bold text-[10px] uppercase">
            <span>Ready for QC</span>
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {metrics.readyForQcCount}
          </div>
          <div className="text-[9px] text-purple-400 font-semibold">Pending inspection</div>
        </div>

        {/* Parts Blockers */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col justify-between h-24 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 font-bold text-[10px] uppercase">
            <span>Parts Blockers</span>
            <Package className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {metrics.partsBlockedCount}
          </div>
          <div className="text-[9px] text-rose-400 font-semibold">Jobs waiting on parts</div>
        </div>

        {/* Active Shop Jobs */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col justify-between h-24 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 font-bold text-[10px] uppercase">
            <span>Active Jobs</span>
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {jobs.filter(j => ['active', 'in progress', 'open'].includes(j.status?.toLowerCase())).length}
          </div>
          <div className="text-[9px] text-zinc-400 font-semibold">Jobs in shop</div>
        </div>
      </div>

      {/* Roster Header & Department Filter Bar */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
              <div>
                <h2 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  Live Staff & Department Roster ({filteredRoster.length})
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">Real-time breakdown of who is clocked in, what task they are on, and today's task outputs.</p>
              </div>

              {/* Roster Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Roster Scope Pills */}
                <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => setRosterScope('today')}
                    className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition", rosterScope === 'today' ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-white")}
                    title="Staff clocked in or active today"
                  >
                    Clocked In Today
                  </button>
                  <button
                    onClick={() => setRosterScope('active')}
                    className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition", rosterScope === 'active' ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white")}
                    title="Active, non-archived staff members"
                  >
                    Active Staff
                  </button>
                  <button
                    onClick={() => setRosterScope('all')}
                    className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition", rosterScope === 'all' ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white")}
                    title="All staff (including archived/terminated)"
                  >
                    All ({staff.length})
                  </button>
                </div>

                {/* Status Filter Pills */}
                <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => setSelectedStatusFilter('all')}
                    className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition", selectedStatusFilter === 'all' ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white")}
                  >
                    All Status
                  </button>
                  <button
                    onClick={() => setSelectedStatusFilter('working')}
                    className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition", selectedStatusFilter === 'working' ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-white")}
                  >
                    Working ({metrics.workingOnTaskCount})
                  </button>
                  <button
                    onClick={() => setSelectedStatusFilter('idle')}
                    className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition", selectedStatusFilter === 'idle' ? "bg-amber-600 text-white" : "text-zinc-400 hover:text-white")}
                  >
                    Idle ({metrics.idleCount})
                  </button>
                </div>
              </div>
            </div>

            {/* Department Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-zinc-500 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Department:
              </span>
              <button
                onClick={() => setSelectedDeptId('all')}
                className={cn(
                  "px-3 py-1 rounded-xl text-[10px] font-extrabold uppercase border transition",
                  selectedDeptId === 'all'
                    ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                    : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                )}
              >
                All Departments
              </button>
              {departments.map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDeptId(d.id)}
                  className={cn(
                    "px-3 py-1 rounded-xl text-[10px] font-extrabold uppercase border transition",
                    selectedDeptId === d.id
                      ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                      : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                  )}
                >
                  {d.name}
                </button>
              ))}
            </div>

            {/* Staff Cards List (Consolidated High-Density Grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 pt-1">
              {filteredRoster.length === 0 ? (
                <div className="col-span-3 p-8 text-center text-zinc-500 italic">No staff found matching the selected filters.</div>
              ) : (
                filteredRoster.map(st => {
                  const taskElapsedText = st.isWorkingOnTask && st.taskStartMs > 0 
                    ? formatElapsedMs(nowMs - st.taskStartMs) 
                    : null;
                  const shiftElapsedText = st.clockStatus === 'clocked_in' && st.shiftStartMs > 0 
                    ? formatElapsedMs(nowMs - st.shiftStartMs) 
                    : null;

                  return (
                    <div 
                      key={st.id} 
                      className={cn(
                        "p-3 rounded-xl border transition flex flex-col justify-between gap-2 shadow-sm",
                        st.clockStatus === 'clocked_in' 
                          ? (st.isWorkingOnTask ? "bg-zinc-950/90 border-emerald-500/30 hover:border-emerald-500/60" : "bg-amber-500/5 border-amber-500/20")
                          : "bg-zinc-950/40 border-zinc-900 opacity-60"
                      )}
                    >
                      {/* Top Header: Name, Dept, Shift Badge */}
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                          <div className="font-extrabold text-xs text-white truncate flex items-center gap-1">
                            {st.firstName || st.name || 'Technician'} {st.lastName || ''}
                          </div>
                          <div className="text-[9px] font-semibold text-indigo-400 truncate">{st.deptName}</div>
                        </div>

                        {/* Status & Shift Time */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {shiftElapsedText && (
                            <span className="text-[9px] font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                              Shift {shiftElapsedText}
                            </span>
                          )}
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[8px] font-black uppercase border",
                            st.clockStatus === 'clocked_in'
                              ? (st.isWorkingOnTask ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse" : "bg-amber-500/10 text-amber-400 border-amber-500/20")
                              : "bg-zinc-800 text-zinc-500 border-zinc-700"
                          )}>
                            {st.clockStatus === 'clocked_in' ? (st.isWorkingOnTask ? 'Active' : 'Idle') : 'Off'}
                          </span>
                        </div>
                      </div>

                      {/* Active Job & Task */}
                      {st.clockStatus === 'clocked_in' && (
                        <div className="p-2 rounded-lg bg-zinc-900/90 border border-zinc-800/80 space-y-0.5 text-[10px]">
                          {st.isWorkingOnTask ? (
                            <>
                              <div className="font-bold text-indigo-400 flex items-center justify-between gap-1">
                                <span className="truncate">Job: {st.activeJob.name || st.activeJob.id}</span>
                                {taskElapsedText && (
                                  <span className="text-emerald-400 font-mono text-[9px] font-extrabold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0 flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5 animate-spin text-emerald-400" /> {taskElapsedText}
                                  </span>
                                )}
                              </div>
                              <div className="font-bold text-white truncate text-[10px]">
                                {st.activeJob.taskName || 'Working on assigned task'}
                              </div>
                            </>
                          ) : (
                            <div className="font-bold text-amber-400 flex items-center gap-1 text-[10px] py-0.5">
                              <AlertTriangle className="w-3 h-3 shrink-0 text-amber-400" />
                              Not clocked into a job task
                            </div>
                          )}
                        </div>
                      )}

                      {/* Consolidated Shift Efficiency & Completed Work Strip */}
                      <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-between text-[9px] gap-1.5">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <MiniEfficiencySparkline data={st.trendPoints} width={50} height={14} />
                          <span className="font-mono text-zinc-400">
                            {st.completedBookHoursToday}h / {st.shiftHoursToday}h
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-zinc-500">{st.completedCountToday} Done</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded font-mono font-black text-[9px] border",
                            st.shiftEfficiencyPct >= 100 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            st.shiftEfficiencyPct >= 75 ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                            st.shiftEfficiencyPct > 0 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                            "bg-zinc-800 text-zinc-500 border-zinc-700"
                          )}>
                            {st.shiftEfficiencyPct > 0 ? `${st.shiftEfficiencyPct}%` : '--'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        {/* Operational Status Queues: QC & Parts Blockers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Ready for QC Queue */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-xs font-black uppercase text-purple-400 tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                QC Inspection Queue ({readyForQcJobs.length})
              </h3>
              <button 
                onClick={() => navigate(`/business/${tenantId}/jobs_sheet`)}
                className="text-[10px] font-bold text-indigo-400 hover:underline flex items-center gap-1"
              >
                View Jobs Sheet <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {readyForQcJobs.length === 0 ? (
                <div className="p-6 text-center text-zinc-500 italic text-xs">No vehicles currently pending QC inspection.</div>
              ) : (
                readyForQcJobs.map(job => (
                  <div 
                    key={job.id} 
                    className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 hover:border-purple-500/40 transition flex flex-col gap-2 cursor-pointer"
                    onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-extrabold text-xs text-white">
                          Job #{job.jobNumber || job.id} - {job.title}
                        </div>
                        <div className="text-[10px] text-zinc-400">{job.customerName || 'Customer'}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Ready QC
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-purple-500/10 pt-2 text-[10px] text-purple-300">
                      <span>Vehicle VIN: {job.vehicleId || 'N/A'}</span>
                      <span className="font-bold hover:underline flex items-center gap-1">
                        Inspect <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Parts Status & Bottlenecks */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-xs font-black uppercase text-rose-400 tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4" />
                Parts Status & Blockers ({partsBlockedJobs.length})
              </h3>
              <button 
                onClick={() => navigate(`/business/${tenantId}/parts_worksheet`)}
                className="text-[10px] font-bold text-indigo-400 hover:underline flex items-center gap-1"
              >
                Parts Worksheet <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {partsBlockedJobs.length === 0 ? (
                <div className="p-6 text-center text-zinc-500 italic text-xs">All active jobs have parts fulfilled!</div>
              ) : (
                partsBlockedJobs.map(job => (
                  <div 
                    key={job.id}
                    className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20 hover:border-rose-500/40 transition flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-extrabold text-xs text-white">
                          Job #{job.jobNumber || job.id} - {job.title}
                        </div>
                        <div className="text-[10px] text-zinc-400">{job.customerName || 'Customer'}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {job.pendingParts.length} Parts Pending
                      </span>
                    </div>

                    <div className="space-y-1 pt-1 border-t border-rose-500/10">
                      {job.pendingParts.map((p: any, pIdx: number) => (
                        <div key={pIdx} className="text-[10px] text-zinc-300 flex items-center justify-between">
                          <span className="truncate">• {p.partName || p.description || 'Part'}</span>
                          <span className="font-mono text-[9px] font-bold uppercase text-amber-400">{p.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Full-Width Excel-Style Daily Operations Activity Log Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-4 mt-6">
          {/* Table Header Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-3">
              <Table className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <h2 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
                  Daily Operations Master Log ({filteredDailyLog.length} Records)
                </h2>
                <p className="text-[10px] text-zinc-400">Excel-style live master log of task completions, shift timeclocks, parts requests, & QC queue moves</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search daily log..."
                  value={logSearchQuery}
                  onChange={e => setLogSearchQuery(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 text-white text-[11px] rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-500 w-48 font-mono"
                />
              </div>

              {/* Category Filter Tabs */}
              <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-[10px] font-bold">
                <button
                  onClick={() => setLogFilterCategory('all')}
                  className={cn("px-2.5 py-1 rounded-lg transition", logFilterCategory === 'all' ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white")}
                >
                  All ({unifiedDailyLogFeed.length})
                </button>
                <button
                  onClick={() => setLogFilterCategory('task')}
                  className={cn("px-2.5 py-1 rounded-lg transition", logFilterCategory === 'task' ? "bg-teal-600 text-white" : "text-zinc-400 hover:text-white")}
                >
                  Tasks
                </button>
                <button
                  onClick={() => setLogFilterCategory('shift')}
                  className={cn("px-2.5 py-1 rounded-lg transition", logFilterCategory === 'shift' ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-white")}
                >
                  Timeclock
                </button>
                <button
                  onClick={() => setLogFilterCategory('parts')}
                  className={cn("px-2.5 py-1 rounded-lg transition", logFilterCategory === 'parts' ? "bg-amber-600 text-white" : "text-zinc-400 hover:text-white")}
                >
                  Parts
                </button>
                <button
                  onClick={() => setLogFilterCategory('qc')}
                  className={cn("px-2.5 py-1 rounded-lg transition", logFilterCategory === 'qc' ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white")}
                >
                  QC
                </button>
              </div>
            </div>
          </div>

          {/* Excel-Style Thin-Row Spreadsheet Table */}
          <div className="overflow-x-auto border border-zinc-800 rounded-xl max-h-[480px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-[11px] font-sans select-text">
              <thead className="bg-zinc-950 text-zinc-400 font-mono text-[9px] uppercase tracking-wider sticky top-0 z-10 border-b border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3 border-r border-zinc-800/80 w-24">TIME</th>
                  <th className="py-2.5 px-3 border-r border-zinc-800/80 w-28">CATEGORY</th>
                  <th className="py-2.5 px-3 border-r border-zinc-800/80 w-44">TECHNICIAN / USER</th>
                  <th className="py-2.5 px-3 border-r border-zinc-800/80 w-56">JOB & VEHICLE</th>
                  <th className="py-2.5 px-3 border-r border-zinc-800/80">ACTIVITY & DETAILS</th>
                  <th className="py-2.5 px-3 border-r border-zinc-800/80 w-64">NOTES</th>
                  <th className="py-2.5 px-3 border-r border-zinc-800/80 w-28">STATUS</th>
                  <th className="py-2.5 px-3 text-center w-16">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-200">
                {filteredDailyLog.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-500 italic font-sans text-xs">
                      No activity records found matching the selected filters today.
                    </td>
                  </tr>
                ) : (
                  filteredDailyLog.map(row => (
                    <tr key={row.id} className="hover:bg-zinc-800/40 transition group text-[11px] h-9">
                      {/* Time */}
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 font-mono font-bold text-teal-400 whitespace-nowrap">
                        {row.timeStr}
                      </td>

                      {/* Category Badge */}
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 whitespace-nowrap">
                        <span className={cn("px-2 py-0.5 rounded text-[8px] font-mono font-black border uppercase", row.badgeClass)}>
                          {row.badgeLabel}
                        </span>
                      </td>

                      {/* Who */}
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 font-sans font-bold text-white truncate max-w-[170px]">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span className="truncate">{row.who}</span>
                        </div>
                      </td>

                      {/* Job & Vehicle */}
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 font-sans truncate max-w-[220px]">
                        {row.jobId ? (
                          <div>
                            <div className="font-bold text-indigo-300 text-[10px] truncate">
                              Job #{row.jobNumber} - {row.jobTitle}
                            </div>
                            {row.vehicleInfo && (
                              <div className="text-[9px] text-zinc-400 font-mono truncate">
                                🚗 {row.vehicleInfo}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-500 font-mono text-[10px]">-- Shop Shift --</span>
                        )}
                      </td>

                      {/* Activity & Details */}
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 font-sans text-zinc-200">
                        <div className="font-medium text-xs leading-tight truncate">{row.details}</div>
                      </td>

                      {/* Dedicated Notes Column */}
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 font-sans text-zinc-300">
                        {row.note ? (
                          <div className="flex items-center gap-1.5 text-[10px] text-indigo-300 font-medium bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 max-w-[260px]">
                            <FileText className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span className="truncate italic">{row.note}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-600 font-mono text-[9px]">--</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 whitespace-nowrap">
                        <span className="text-[9px] font-mono font-bold uppercase text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                          {row.status}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-1.5 px-3 text-center whitespace-nowrap">
                        {row.jobId ? (
                          <button
                            onClick={() => navigate(`/business/${tenantId}/job/${row.jobId}`)}
                            className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition"
                            title="View Job Details"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-zinc-600">--</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

    </div>
  );
}
