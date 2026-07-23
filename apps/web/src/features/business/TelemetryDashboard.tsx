import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, collectionGroup } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  TrendingUp, Clock, Users, RefreshCw, BarChart2, CheckCircle2, HelpCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface Task {
  id: string;
  jobId: string;
  title?: string;
  name?: string;
  status?: string;
  bookHours?: any;
  bookTime?: any;
  payBasis?: string;
  completedAt?: any;
  qcCompletedAt?: any;
  updatedAt?: any;
  assignedStaffIds?: string[];
  assignedStaff?: any[];
  completedByStaffId?: string;
  createdAt?: any;
}

interface TimeSession {
  id: string;
  userId: string;
  status: string;
  clockIn?: {
    timestamp: any;
  };
  clockOut?: {
    timestamp: any;
  };
  breaks?: Array<{
    start: any;
    end: any;
    isPaid?: boolean;
  }>;
  jobs?: Array<{
    id: string;
    taskId: string;
    start: any;
    end?: any;
  }>;
}

interface Staff {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  userId?: string;
}

type ZoomLevel = 'daily' | 'weekly' | 'monthly';

const getStaffColor = (index: number) => {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ec4899', // pink
    '#8b5cf6', // purple
    '#06b6d4', // cyan
    '#14b8a6', // teal
    '#f43f5e', // rose
    '#84cc16', // lime
    '#a855f7', // violet
  ];
  return colors[index % colors.length];
};

export function TelemetryDashboard({ tenantId }: { tenantId: string }) {
  const [zoom, setZoom] = useState<ZoomLevel>('weekly');
  const [viewMode, setViewMode] = useState<'aggregated' | 'technicians'>('aggregated');
  const [visibleStaffIds, setVisibleStaffIds] = useState<string[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  // Tooltip tracking states
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    label: string;
    book: number;
    actual: number;
  } | null>(null);

  const [hoveredTechPoint, setHoveredTechPoint] = useState<{
    x: number;
    y: number;
    label: string;
    techName: string;
    val: number;
    color: string;
  } | null>(null);

  const [hoveredShiftPoint, setHoveredShiftPoint] = useState<{
    x: number;
    y: number;
    label: string;
    shift: number;
    task: number;
  } | null>(null);

  // 1. Listen to Tasks (CollectionGroup for all jobs)
  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collectionGroup(db, 'tasks'),
      where('tenantId', '==', tenantId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const filtered = snap.docs.filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`));
      setTasks(filtered.map(doc => {
        const parts = doc.ref.path.split('/');
        const jobId = parts[3];
        return { id: doc.id, jobId, ...doc.data() } as Task;
      }));
    });
    return unsub;
  }, [tenantId]);

  // 2. Listen to Time Sessions
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/time_sessions`), (snap) => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as TimeSession)));
    });
    return unsub;
  }, [tenantId]);

  // 3. Listen to Staff
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
        .filter(s => !s.isArchived && !s.fireDate);
      setStaff(list);
      setVisibleStaffIds(list.map(s => s.id));
      setLoading(false);
    });
    return unsub;
  }, [tenantId]);

  // Helper to parse timestamps safely
  const parseTimestamp = (val: any): Date | null => {
    if (!val) return null;
    if (val.toDate) return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  // Helper to calculate exact task actual hours logged in time sessions
  const getTaskLoggedHours = (jobId: string, taskId: string, sList: TimeSession[]) => {
    let totalMs = 0;
    sList.forEach(session => {
      const segments = session.jobs || [];
      segments.forEach((seg: any) => {
        if (seg.id === jobId && seg.taskId === taskId) {
          const start = seg.start?.seconds ? seg.start.seconds * 1000 : new Date(seg.start).getTime();
          let end = 0;
          if (seg.end) {
            end = seg.end.seconds ? seg.end.seconds * 1000 : new Date(seg.end).getTime();
          } else {
            if (session.status === 'active' || session.status === 'on_break') {
              end = Date.now();
            } else {
              const clockOutVal = session.clockOut?.timestamp;
              if (clockOutVal) {
                end = clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime();
              } else {
                end = start;
              }
            }
          }
          totalMs += Math.max(0, end - start);
        }
      });
    });
    return totalMs / 3600000;
  };

  // Helper to calculate time session shift duration minus unpaid breaks
  const getMondayString = (d: Date): string => {
    const date = new Date(d.valueOf());
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toDateString();
  };

  // Helper to calculate time session shift duration minus unpaid breaks
  const getSessionShiftHours = (s: TimeSession): number => {
    if (!s.clockIn?.timestamp) return 0;
    const start = parseTimestamp(s.clockIn.timestamp)?.getTime() || 0;
    let end = s.clockOut?.timestamp 
      ? (parseTimestamp(s.clockOut.timestamp)?.getTime() || Date.now())
      : Date.now();

    // Prevent forgotten clock-out spikes on previous days
    if (!s.clockOut?.timestamp) {
      const startDay = new Date(start);
      startDay.setHours(0, 0, 0, 0);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (startDay.getTime() < todayStart.getTime()) {
        end = start + 8 * 3600 * 1000; // Cap at 8 hours
      }
    }

    const breakMs = s.breaks?.reduce((acc, b) => {
      if (b.isPaid) return acc;
      const bStart = parseTimestamp(b.start)?.getTime() || 0;
      const bEnd = parseTimestamp(b.end)?.getTime() || end;
      return acc + Math.max(0, bEnd - bStart);
    }, 0) || 0;

    return Math.max(0, (end - start - breakMs) / 3600000);
  };

  // Helper to calculate active task seconds for a time session
  const getSessionTaskHours = (s: TimeSession): number => {
    const segments = s.jobs || [];
    let totalMs = 0;
    segments.forEach((seg: any) => {
      const start = seg.start?.seconds ? seg.start.seconds * 1000 : new Date(seg.start).getTime();
      let end = start;
      if (seg.end) {
        end = seg.end.seconds ? seg.end.seconds * 1000 : new Date(seg.end).getTime();
      } else {
        if (s.status === 'active' || s.status === 'on_break') {
          const startDay = new Date(start);
          startDay.setHours(0, 0, 0, 0);
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          if (startDay.getTime() < todayStart.getTime()) {
            end = start + 8 * 3600 * 1000; // Cap at 8 hours
          } else {
            end = Date.now();
          }
        } else {
          const clockOutVal = s.clockIn?.timestamp;
          end = clockOutVal ? (parseTimestamp(clockOutVal)?.getTime() || start) : start;
        }
      }
      totalMs += Math.max(0, end - start);
    });
    return totalMs / 3600000;
  };

  // Helper to format ISO week numbers
  const getWeekNumber = (d: Date): string => {
    const tempDate = new Date(d.valueOf());
    tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
    const yearStart = new Date(tempDate.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((tempDate.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7);
    return `Wk ${weekNo} (${tempDate.getFullYear()})`;
  };

  // Main aggregated stats & graphs data
  const telemetryData = useMemo(() => {
    const now = new Date();
    
    // 1. Filter completed tasks
    const completedTasksList = tasks.filter(t => {
      const isComp = ['completed', 'qc', 'qc complete'].includes((t.status || '').toLowerCase());
      const compDate = parseTimestamp(t.qcCompletedAt || t.completedAt || t.createdAt);
      return isComp && compDate !== null;
    }).map(t => {
      const compDate = parseTimestamp(t.qcCompletedAt || t.completedAt || t.createdAt)!;
      const bTime = parseFloat(t.bookHours ?? t.bookTime) || 0;
      const actualTime = getTaskLoggedHours(t.jobId, t.id, sessions);
      const isHourly = t.payBasis === 'hourly' || bTime === 0;
      const resolvedBook = isHourly ? actualTime : bTime;
      
      return {
        id: t.id,
        completedAt: compDate,
        bookHours: resolvedBook,
        actualHours: actualTime,
        assignedStaffIds: t.assignedStaffIds || (t.assignedStaff || []).map((s: any) => s.id || s.uid),
        completedByStaffId: t.completedByStaffId || ''
      };
    });

    // 2. Define timeframe buckets based on zoom level
    const timeBuckets: Record<string, { 
      label: string; 
      book: number; 
      actual: number; 
      shiftHours: number; 
      taskHours: number; 
      date: Date;
      staffBook: Record<string, number>;
    }> = {};
    const labelList: string[] = [];

    if (zoom === 'daily') {
      // Last 14 days
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const key = d.toDateString();
        timeBuckets[key] = { label, book: 0, actual: 0, shiftHours: 0, taskHours: 0, date: d, staffBook: {} };
        labelList.push(key);
      }
    } else if (zoom === 'weekly') {
      // Last 12 weeks
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
        const label = getWeekNumber(d);
        const key = getMondayString(d);
        timeBuckets[key] = { label, book: 0, actual: 0, shiftHours: 0, taskHours: 0, date: d, staffBook: {} };
        labelList.push(key);
      }
    } else {
      // Last 12 months
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleDateString([], { month: 'short', year: '2-digit' });
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        timeBuckets[key] = { label, book: 0, actual: 0, shiftHours: 0, taskHours: 0, date: d, staffBook: {} };
        labelList.push(key);
      }
    }

    // Populate book vs actual in buckets
    completedTasksList.forEach(t => {
      let bucketKey = '';
      const date = t.completedAt;

      if (zoom === 'daily') {
        bucketKey = date.toDateString();
      } else if (zoom === 'weekly') {
        bucketKey = getMondayString(date);
        // Find closest week match if not exact
        if (!timeBuckets[bucketKey]) {
          const matched = Object.keys(timeBuckets).find(k => {
            const bucketDate = timeBuckets[k].date;
            const diffDays = Math.abs(date.getTime() - bucketDate.getTime()) / 86400000;
            return diffDays <= 7;
          });
          if (matched) bucketKey = matched;
        }
      } else {
        bucketKey = `${date.getFullYear()}-${date.getMonth()}`;
      }

      if (timeBuckets[bucketKey]) {
        timeBuckets[bucketKey].book += t.bookHours;
        timeBuckets[bucketKey].actual += t.actualHours;

        // Accumulate for each assigned staff member
        const ids = t.assignedStaffIds || [];
        if (t.completedByStaffId && !ids.includes(t.completedByStaffId)) {
          ids.push(t.completedByStaffId);
        }
        ids.forEach(id => {
          if (!timeBuckets[bucketKey].staffBook[id]) {
            timeBuckets[bucketKey].staffBook[id] = 0;
          }
          timeBuckets[bucketKey].staffBook[id] += t.bookHours;
        });
      }
    });

    // Populate shift and task hours in buckets
    sessions.forEach(s => {
      if (!s.clockIn?.timestamp) return;
      const date = parseTimestamp(s.clockIn.timestamp)!;
      let bucketKey = '';

      if (zoom === 'daily') {
        bucketKey = date.toDateString();
      } else if (zoom === 'weekly') {
        bucketKey = getMondayString(date);
        if (!timeBuckets[bucketKey]) {
          const matched = Object.keys(timeBuckets).find(k => {
            const bucketDate = timeBuckets[k].date;
            const diffDays = Math.abs(date.getTime() - bucketDate.getTime()) / 86400000;
            return diffDays <= 7;
          });
          if (matched) bucketKey = matched;
        }
      } else {
        bucketKey = `${date.getFullYear()}-${date.getMonth()}`;
      }

      if (timeBuckets[bucketKey]) {
        timeBuckets[bucketKey].shiftHours += getSessionShiftHours(s);
        timeBuckets[bucketKey].taskHours += getSessionTaskHours(s);
      }
    });

    // 3. Compile staff stats leaderboard
    const staffStats: Record<string, { name: string; completedBook: number; completedActual: number }> = {};
    staff.forEach(member => {
      const name = `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.displayName || 'Technician';
      staffStats[member.id] = { name, completedBook: 0, completedActual: 0 };
    });

    completedTasksList.forEach(t => {
      const ids = t.assignedStaffIds || [];
      if (t.completedByStaffId && !ids.includes(t.completedByStaffId)) {
        ids.push(t.completedByStaffId);
      }
      ids.forEach(id => {
        if (staffStats[id]) {
          staffStats[id].completedBook += t.bookHours;
          staffStats[id].completedActual += t.actualHours;
        }
      });
    });

    const staffList = Object.values(staffStats)
      .filter(s => s.completedBook > 0 || s.completedActual > 0)
      .sort((a, b) => b.completedBook - a.completedBook);

    // Flat list of telemetry graph coordinates
    const graphPoints = labelList.map(key => {
      const b = timeBuckets[key] || { label: 'N/A', book: 0, actual: 0, shiftHours: 0, taskHours: 0, staffBook: {} };
      return {
        label: b.label,
        book: b.book,
        actual: b.actual,
        shift: b.shiftHours,
        task: b.taskHours,
        staffBook: b.staffBook
      };
    });

    // Cumulative stats
    const totalBook = completedTasksList.reduce((sum, t) => sum + t.bookHours, 0);
    const totalActual = completedTasksList.reduce((sum, t) => sum + t.actualHours, 0);
    const totalShift = sessions.reduce((sum, s) => sum + getSessionShiftHours(s), 0);
    const totalTask = sessions.reduce((sum, s) => sum + getSessionTaskHours(s), 0);

    return {
      graphPoints,
      staffList,
      totalBook,
      totalActual,
      totalShift,
      totalTask
    };
  }, [zoom, tasks, sessions, staff]);

  // SVG dimensions configs
  const width = 600;
  const height = 240;
  const padding = 40;

  // Render line graph helper
  const drawLines = (data: typeof telemetryData.graphPoints) => {
    if (data.length === 0) return { pathBook: '', pathActual: '', points: [], maxVal: 10 };

    const maxVal = Math.max(...data.map(d => Math.max(d.book, d.actual)), 10);
    const xStep = (width - padding * 2) / (data.length - 1 || 1);
    
    const points: Array<{ x: number; y: number; book: number; actual: number; label: string }> = [];
    let pathBook = '';
    let pathActual = '';

    data.forEach((pt, i) => {
      const x = padding + i * xStep;
      // Invert Y coordinates since SVG starts from top left
      const yBook = height - padding - (pt.book / maxVal) * (height - padding * 2);
      const yActual = height - padding - (pt.actual / maxVal) * (height - padding * 2);

      points.push({ x, y: yBook, book: pt.book, actual: pt.actual, label: pt.label });

      if (i === 0) {
        pathBook = `M ${x} ${yBook}`;
        pathActual = `M ${x} ${yActual}`;
      } else {
        pathBook += ` L ${x} ${yBook}`;
        pathActual += ` L ${x} ${yActual}`;
      }
    });

    return { pathBook, pathActual, points, maxVal };
  };

  // Draw staff individual lines helper
  const drawTechnicianLines = (
    data: typeof telemetryData.graphPoints, 
    staffList: Staff[]
  ) => {
    const activeStaff = staffList.filter(s => visibleStaffIds.includes(s.id));
    if (data.length === 0 || activeStaff.length === 0) {
      return { lines: [], maxVal: 10 };
    }

    let maxVal = 10;
    data.forEach(pt => {
      activeStaff.forEach(s => {
        const val = pt.staffBook[s.id] || 0;
        if (val > maxVal) maxVal = val;
      });
    });

    const xStep = (width - padding * 2) / (data.length - 1 || 1);
    
    const lines = activeStaff.map((s) => {
      // Find staff index in the main list to maintain color consistency
      const sIdx = staffList.findIndex(x => x.id === s.id);
      const color = getStaffColor(sIdx === -1 ? 0 : sIdx);
      const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.displayName || 'Technician';
      
      let path = '';
      const points: Array<{ x: number; y: number; val: number; label: string; staffName: string }> = [];

      data.forEach((pt, i) => {
        const x = padding + i * xStep;
        const val = pt.staffBook[s.id] || 0;
        const y = height - padding - (val / maxVal) * (height - padding * 2);

        points.push({ x, y, val, label: pt.label, staffName: name });

        if (i === 0) {
          path = `M ${x} ${y}`;
        } else {
          path += ` L ${x} ${y}`;
        }
      });

      return {
        staffId: s.id,
        name,
        color,
        path,
        points
      };
    });

    return { lines, maxVal };
  };

  const drawShiftLines = (data: typeof telemetryData.graphPoints) => {
    if (data.length === 0) return { pathShift: '', pathTask: '', points: [], maxVal: 10 };

    const maxVal = Math.max(...data.map(d => Math.max(d.shift, d.task)), 10);
    const xStep = (width - padding * 2) / (data.length - 1 || 1);
    
    const points: Array<{ x: number; y: number; shift: number; task: number; label: string }> = [];
    let pathShift = '';
    let pathTask = '';

    data.forEach((pt, i) => {
      const x = padding + i * xStep;
      const yShift = height - padding - (pt.shift / maxVal) * (height - padding * 2);
      const yTask = height - padding - (pt.task / maxVal) * (height - padding * 2);

      points.push({ x, y: yShift, shift: pt.shift, task: pt.task, label: pt.label });

      if (i === 0) {
        pathShift = `M ${x} ${yShift}`;
        pathTask = `M ${x} ${yTask}`;
      } else {
        pathShift += ` L ${x} ${yShift}`;
        pathTask += ` L ${x} ${yTask}`;
      }
    });

    return { pathShift, pathTask, points, maxVal };
  };

  const { pathBook, pathActual, points: bookPoints, maxVal: maxValHours } = drawLines(telemetryData.graphPoints);
  const { lines: techLines, maxVal: maxValTechHours } = drawTechnicianLines(telemetryData.graphPoints, staff);
  const { pathShift, pathTask, points: shiftPoints, maxVal: maxValShift } = drawShiftLines(telemetryData.graphPoints);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-zinc-500 font-bold uppercase tracking-wider text-xs">Loading Telemetry Board...</p>
      </div>
    );
  }

  const overallEfficiency = telemetryData.totalActual > 0
    ? Math.round((telemetryData.totalBook / telemetryData.totalActual) * 100)
    : 0;

  const overallCoverage = telemetryData.totalShift > 0
    ? Math.round((telemetryData.totalTask / telemetryData.totalShift) * 100)
    : 0;

  const xStepVal = (width - padding * 2) / (telemetryData.graphPoints.length - 1 || 1);

  return (
    <div className="space-y-6 pb-20 select-none">
      
      {/* Zoom & View Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-zinc-900/60 backdrop-blur-md border border-zinc-850 rounded-xl p-3.5 shadow-md">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-400 animate-pulse" />
          <span className="text-sm font-black text-white uppercase tracking-wider">Historical Telemetry</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Aggregated vs Individual selector */}
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-850">
            <button
              onClick={() => {
                setViewMode('aggregated');
                setHoveredPoint(null);
                setHoveredTechPoint(null);
              }}
              className={cn(
                "px-3 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer",
                viewMode === 'aggregated'
                  ? "bg-indigo-650 text-white shadow-md shadow-indigo-600/10"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              Aggregated Shop
            </button>
            <button
              onClick={() => {
                setViewMode('technicians');
                setHoveredPoint(null);
                setHoveredTechPoint(null);
              }}
              className={cn(
                "px-3 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer",
                viewMode === 'technicians'
                  ? "bg-indigo-650 text-white shadow-md shadow-indigo-600/10"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              Compare Staff
            </button>
          </div>

          {/* Time zoom switcher */}
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-850">
            {(['daily', 'weekly', 'monthly'] as ZoomLevel[]).map(level => (
              <button
                key={level}
                onClick={() => {
                  setZoom(level);
                  setHoveredPoint(null);
                  setHoveredTechPoint(null);
                  setHoveredShiftPoint(null);
                }}
                className={cn(
                  "px-3 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer",
                  zoom === level 
                    ? "bg-zinc-800 text-white shadow-md" 
                    : "text-zinc-400 hover:text-white"
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/40 border border-zinc-850 rounded-xl p-4 space-y-2 relative overflow-hidden group hover:border-emerald-500/20 transition-all">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Book Hours Completed</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black font-mono text-emerald-400 leading-none">
              {telemetryData.totalBook.toFixed(1)}
            </span>
            <span className="text-xs text-zinc-500 font-bold uppercase">hrs</span>
          </div>
          <div className="w-10 h-10 bg-emerald-500/5 text-emerald-400 rounded-lg flex items-center justify-center border border-emerald-500/10 absolute right-4 top-2">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-850 rounded-xl p-4 space-y-2 relative overflow-hidden group hover:border-violet-500/20 transition-all">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Actual Hours Spent</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black font-mono text-violet-400 leading-none">
              {telemetryData.totalActual.toFixed(1)}
            </span>
            <span className="text-xs text-zinc-500 font-bold uppercase">hrs</span>
          </div>
          <div className="w-10 h-10 bg-violet-500/5 text-violet-400 rounded-lg flex items-center justify-center border border-violet-500/10 absolute right-4 top-2">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-850 rounded-xl p-4 space-y-2 relative overflow-hidden group hover:border-indigo-500/20 transition-all">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block flex items-center gap-1.5">
            Production Efficiency
            <span title="Calculated as Book Hours divided by Actual Hours">
              <HelpCircle className="w-3.5 h-3.5 text-zinc-500 cursor-help" />
            </span>
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className={cn(
              "text-3xl font-black font-mono leading-none",
              overallEfficiency >= 100 ? "text-emerald-400" :
              overallEfficiency >= 85 ? "text-indigo-400" : "text-amber-450"
            )}>
              {overallEfficiency}%
            </span>
          </div>
          <div className="w-10 h-10 bg-indigo-500/5 text-indigo-400 rounded-lg flex items-center justify-center border border-indigo-500/10 absolute right-4 top-2">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-850 rounded-xl p-4 space-y-2 relative overflow-hidden group hover:border-blue-500/20 transition-all">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block flex items-center gap-1.5">
            Labor Coverage Ratio
            <span title="Ratio of shift time spent actively tracking work on jobs">
              <HelpCircle className="w-3.5 h-3.5 text-zinc-500 cursor-help" />
            </span>
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black font-mono text-blue-400 leading-none">
              {overallCoverage}%
            </span>
          </div>
          <div className="w-10 h-10 bg-blue-500/5 text-blue-400 rounded-lg flex items-center justify-center border border-blue-500/10 absolute right-4 top-2">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Graphs Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Line graph: Book vs Actual Completed OR Technician Comparison */}
        <div className="bg-zinc-900/40 border border-zinc-850 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-emerald-400" />
                {viewMode === 'aggregated' ? 'Completed Production Hours (Flat-Rate)' : 'Technician Book Hours Comparison'}
              </span>
              
              {viewMode === 'aggregated' && (
                <div className="flex items-center gap-3 text-[10px] font-bold">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
                    Completed Book
                  </span>
                  <span className="flex items-center gap-1.5 text-violet-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block"></span>
                    Logged Actual
                  </span>
                </div>
              )}
            </div>
            
            {/* SVG Plot */}
            <div className="relative w-full h-[240px] bg-zinc-950/60 rounded-lg border border-zinc-900 overflow-hidden flex items-center justify-center">
              {telemetryData.graphPoints.length < 2 ? (
                <span className="text-xs text-zinc-550 font-bold uppercase tracking-wider">No completed hours data for this timeframe</span>
              ) : (
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
                  {/* Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                    const y = padding + ratio * (height - padding * 2);
                    const currentMax = viewMode === 'aggregated' ? (maxValHours || 10) : (maxValTechHours || 10);
                    const labelVal = Math.round(currentMax * (1 - ratio));
                    return (
                      <g key={i} className="opacity-15">
                        <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#fff" strokeWidth={1} strokeDasharray="4 4" />
                        <text x={padding - 8} y={y + 4} fill="#fff" fontSize={9} fontWeight="bold" textAnchor="end" className="font-mono">{labelVal}</text>
                      </g>
                    );
                  })}

                  {/* Aggregated view lines */}
                  {viewMode === 'aggregated' && (
                    <g>
                      <path d={pathBook} fill="none" stroke="#10b981" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_2px_8px_rgba(16,185,129,0.3)]" />
                      <path d={pathActual} fill="none" stroke="#8b5cf6" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_2px_8px_rgba(139,92,246,0.3)]" />

                      {bookPoints.map((pt, i) => (
                        <g key={i}>
                          <circle 
                            cx={pt.x} 
                            cy={pt.y} 
                            r={4} 
                            fill="#10b981" 
                            stroke="#09090b" 
                            strokeWidth={2}
                            className="cursor-pointer hover:r-6 transition-all"
                            onMouseEnter={() => {
                              setHoveredPoint({
                                x: pt.x,
                                y: pt.y,
                                label: pt.label,
                                book: pt.book,
                                actual: pt.actual
                              });
                            }}
                            onMouseLeave={() => setHoveredPoint(null)}
                          />
                          <circle 
                            cx={pt.x} 
                            cy={height - padding - (pt.actual / (maxValHours || 10)) * (height - padding * 2)} 
                            r={4} 
                            fill="#8b5cf6" 
                            stroke="#09090b" 
                            strokeWidth={2}
                            className="cursor-pointer hover:r-6 transition-all"
                            onMouseEnter={() => {
                              setHoveredPoint({
                                x: pt.x,
                                y: height - padding - (pt.actual / (maxValHours || 10)) * (height - padding * 2),
                                label: pt.label,
                                book: pt.book,
                                actual: pt.actual
                              });
                            }}
                            onMouseLeave={() => setHoveredPoint(null)}
                          />
                        </g>
                      ))}
                    </g>
                  )}

                  {/* Technician Comparison Lines */}
                  {viewMode === 'technicians' && techLines.map((line) => (
                    <g key={line.staffId}>
                      <path 
                        d={line.path} 
                        fill="none" 
                        stroke={line.color} 
                        strokeWidth={2.5} 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        className="transition-all duration-300"
                        style={{ filter: `drop-shadow(0 2px 4px ${line.color}22)` }}
                      />
                      
                      {line.points.map((pt, i) => (
                        <circle 
                          key={i}
                          cx={pt.x} 
                          cy={pt.y} 
                          r={3.5} 
                          fill={line.color} 
                          stroke="#09090b" 
                          strokeWidth={2}
                          className="cursor-pointer hover:r-5 transition-all"
                          onMouseEnter={() => {
                            setHoveredTechPoint({
                              x: pt.x,
                              y: pt.y,
                              label: pt.label,
                              techName: pt.staffName,
                              val: pt.val,
                              color: line.color
                            });
                          }}
                          onMouseLeave={() => setHoveredTechPoint(null)}
                        />
                      ))}
                    </g>
                  ))}

                  {/* SVG Aggregated Tooltip */}
                  {viewMode === 'aggregated' && hoveredPoint && (
                    <g>
                      <rect 
                        x={Math.max(padding, Math.min(width - padding - 130, hoveredPoint.x - 65))} 
                        y={Math.max(10, hoveredPoint.y - 65)} 
                        width={130} 
                        height={55} 
                        rx={6} 
                        fill="#18181b" 
                        stroke="#27272a" 
                        strokeWidth={1}
                        className="shadow-2xl" 
                      />
                      <text 
                        x={Math.max(padding + 6, Math.min(width - padding - 124, hoveredPoint.x - 59))} 
                        y={Math.max(10, hoveredPoint.y - 65) + 15} 
                        fill="#fff" 
                        fontSize={9} 
                        fontWeight="black"
                        className="uppercase tracking-wider"
                      >
                        {hoveredPoint.label}
                      </text>
                      <text 
                        x={Math.max(padding + 6, Math.min(width - padding - 124, hoveredPoint.x - 59))} 
                        y={Math.max(10, hoveredPoint.y - 65) + 30} 
                        fill="#10b981" 
                        fontSize={9} 
                        fontWeight="bold"
                      >
                        Completed: {hoveredPoint.book.toFixed(1)}h
                      </text>
                      <text 
                        x={Math.max(padding + 6, Math.min(width - padding - 124, hoveredPoint.x - 59))} 
                        y={Math.max(10, hoveredPoint.y - 65) + 45} 
                        fill="#a78bfa" 
                        fontSize={9} 
                        fontWeight="bold"
                      >
                        Logged: {hoveredPoint.actual.toFixed(1)}h
                      </text>
                    </g>
                  )}

                  {/* SVG Technician Tooltip */}
                  {viewMode === 'technicians' && hoveredTechPoint && (
                    <g>
                      <rect 
                        x={Math.max(padding, Math.min(width - padding - 140, hoveredTechPoint.x - 70))} 
                        y={Math.max(10, hoveredTechPoint.y - 50)} 
                        width={140} 
                        height={40} 
                        rx={6} 
                        fill="#18181b" 
                        stroke="#27272a" 
                        strokeWidth={1}
                        className="shadow-2xl" 
                      />
                      <text 
                        x={Math.max(padding + 6, Math.min(width - padding - 134, hoveredTechPoint.x - 64))} 
                        y={Math.max(10, hoveredTechPoint.y - 50) + 14} 
                        fill="#fff" 
                        fontSize={8.5} 
                        fontWeight="black"
                        className="uppercase tracking-wider"
                      >
                        {hoveredTechPoint.techName} ({hoveredTechPoint.label})
                      </text>
                      <text 
                        x={Math.max(padding + 6, Math.min(width - padding - 134, hoveredTechPoint.x - 64))} 
                        y={Math.max(10, hoveredTechPoint.y - 50) + 28} 
                        fill={hoveredTechPoint.color} 
                        fontSize={9} 
                        fontWeight="black"
                      >
                        Completed: {hoveredTechPoint.val.toFixed(1)} hrs
                      </text>
                    </g>
                  )}

                  {/* X Axis Labels */}
                  {telemetryData.graphPoints.map((pt, i) => {
                    if (telemetryData.graphPoints.length > 10 && i % 2 !== 0) return null;
                    const x = padding + i * xStepVal;
                    return (
                      <text key={i} x={x} y={height - padding + 16} fill="#71717a" fontSize={8} fontWeight="bold" textAnchor="middle">{pt.label}</text>
                    );
                  })}
                </svg>
              )}
            </div>
            
            {/* Legend for technician comparison */}
            {viewMode === 'technicians' && (
              <div className="mt-4 pt-3.5 border-t border-zinc-900/50 flex flex-wrap gap-2 items-center justify-center">
                {staff.map((s, index) => {
                  const color = getStaffColor(index);
                  const isVisible = visibleStaffIds.includes(s.id);
                  const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.displayName || 'Technician';
                  
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        if (isVisible) {
                          setVisibleStaffIds(prev => prev.filter(id => id !== s.id));
                        } else {
                          setVisibleStaffIds(prev => [...prev, s.id]);
                        }
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer",
                        isVisible 
                          ? "bg-zinc-950/60 border-zinc-800 text-white" 
                          : "bg-transparent border-transparent text-zinc-550 opacity-30 hover:opacity-60"
                      )}
                    >
                      <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: color }}></span>
                      <span>{name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Line graph: Shift vs Active Task Hours */}
        <div className="bg-zinc-900/40 border border-zinc-850 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-400" />
                Shift Attendance vs Active Work
              </span>
              <div className="flex items-center gap-3 text-[10px] font-bold">
                <span className="flex items-center gap-1.5 text-blue-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block"></span>
                  Clocked Shift
                </span>
                <span className="flex items-center gap-1.5 text-amber-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                  Active Work
                </span>
              </div>
            </div>
            
            {/* SVG Plot */}
            <div className="relative w-full h-[240px] bg-zinc-950/60 rounded-lg border border-zinc-900 overflow-hidden flex items-center justify-center">
              {telemetryData.graphPoints.length < 2 ? (
                <span className="text-xs text-zinc-550 font-bold uppercase tracking-wider">No time sessions data for this timeframe</span>
              ) : (
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
                  {/* Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                    const y = padding + ratio * (height - padding * 2);
                    const labelVal = Math.round((maxValShift || 10) * (1 - ratio));
                    return (
                      <g key={i} className="opacity-15">
                        <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#fff" strokeWidth={1} strokeDasharray="4 4" />
                        <text x={padding - 8} y={y + 4} fill="#fff" fontSize={9} fontWeight="bold" textAnchor="end" className="font-mono">{labelVal}</text>
                      </g>
                    );
                  })}

                  {/* Lines */}
                  <path d={pathShift} fill="none" stroke="#60a5fa" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_2px_8px_rgba(96,165,250,0.3)]" />
                  <path d={pathTask} fill="none" stroke="#f59e0b" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_2px_8px_rgba(245,158,11,0.3)]" />

                  {/* Interactive Nodes */}
                  {shiftPoints.map((pt, i) => (
                    <g key={i}>
                      <circle 
                        cx={pt.x} 
                        cy={pt.y} 
                        r={4} 
                        fill="#60a5fa" 
                        stroke="#09090b" 
                        strokeWidth={2}
                        className="cursor-pointer hover:r-6 transition-all"
                        onMouseEnter={() => {
                          setHoveredShiftPoint({
                            x: pt.x,
                            y: pt.y,
                            label: pt.label,
                            shift: pt.shift,
                            task: pt.task
                          });
                        }}
                        onMouseLeave={() => setHoveredShiftPoint(null)}
                      />
                      <circle 
                        cx={pt.x} 
                        cy={height - padding - (pt.task / (maxValShift || 10)) * (height - padding * 2)} 
                        r={4} 
                        fill="#f59e0b" 
                        stroke="#09090b" 
                        strokeWidth={2}
                        className="cursor-pointer hover:r-6 transition-all"
                        onMouseEnter={() => {
                          setHoveredShiftPoint({
                            x: pt.x,
                            y: height - padding - (pt.task / (maxValShift || 10)) * (height - padding * 2),
                            label: pt.label,
                            shift: pt.shift,
                            task: pt.task
                          });
                        }}
                        onMouseLeave={() => setHoveredShiftPoint(null)}
                      />
                    </g>
                  ))}

                  {/* SVG Tooltip */}
                  {hoveredShiftPoint && (
                    <g>
                      <rect 
                        x={Math.max(padding, Math.min(width - padding - 130, hoveredShiftPoint.x - 65))} 
                        y={Math.max(10, hoveredShiftPoint.y - 65)} 
                        width={130} 
                        height={55} 
                        rx={6} 
                        fill="#18181b" 
                        stroke="#27272a" 
                        strokeWidth={1}
                        className="shadow-2xl" 
                      />
                      <text 
                        x={Math.max(padding + 6, Math.min(width - padding - 124, hoveredShiftPoint.x - 59))} 
                        y={Math.max(10, hoveredShiftPoint.y - 65) + 15} 
                        fill="#fff" 
                        fontSize={9} 
                        fontWeight="black"
                        className="uppercase tracking-wider"
                      >
                        {hoveredShiftPoint.label}
                      </text>
                      <text 
                        x={Math.max(padding + 6, Math.min(width - padding - 124, hoveredShiftPoint.x - 59))} 
                        y={Math.max(10, hoveredShiftPoint.y - 65) + 30} 
                        fill="#60a5fa" 
                        fontSize={9} 
                        fontWeight="bold"
                      >
                        Clocked Shift: {hoveredShiftPoint.shift.toFixed(1)}h
                      </text>
                      <text 
                        x={Math.max(padding + 6, Math.min(width - padding - 124, hoveredShiftPoint.x - 59))} 
                        y={Math.max(10, hoveredShiftPoint.y - 65) + 45} 
                        fill="#fbbf24" 
                        fontSize={9} 
                        fontWeight="bold"
                      >
                        Active Work: {hoveredShiftPoint.task.toFixed(1)}h
                      </text>
                    </g>
                  )}

                  {/* X Axis Labels */}
                  {telemetryData.graphPoints.map((pt, i) => {
                    if (telemetryData.graphPoints.length > 10 && i % 2 !== 0) return null;
                    const x = padding + i * xStepVal;
                    return (
                      <text key={i} x={x} y={height - padding + 16} fill="#71717a" fontSize={8} fontWeight="bold" textAnchor="middle">{pt.label}</text>
                    );
                  })}
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Staff Telemetry Bar Chart */}
      <div className="bg-zinc-900/40 border border-zinc-850 rounded-xl p-5 space-y-4 shadow-lg">
        <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
          <Users className="w-4 h-4 text-indigo-400" />
          Technician Production Telemetry (Completed Book Hours)
        </span>

        {telemetryData.staffList.length === 0 ? (
          <div className="py-10 text-center text-xs text-zinc-550 font-bold uppercase tracking-wider">
            No production records completed by staff yet
          </div>
        ) : (
          <div className="space-y-4">
            {telemetryData.staffList.map((st, index) => {
              const maxStaffBook = Math.max(...telemetryData.staffList.map(s => s.completedBook), 1);
              const percentage = Math.min(100, Math.round((st.completedBook / maxStaffBook) * 100));

              return (
                <div key={index} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold items-center">
                    <span className="text-zinc-200">{st.name}</span>
                    <span className="text-zinc-400 font-mono">
                      <strong className="text-emerald-400">{st.completedBook.toFixed(1)} hrs</strong> completed Book &bull; {st.completedActual.toFixed(1)} hrs Logged
                    </span>
                  </div>
                  <div className="h-3.5 bg-zinc-950 rounded-lg overflow-hidden border border-zinc-900 flex items-center px-1">
                    <div 
                      className="h-2 rounded bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all duration-1000"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed Hours Matrix Table */}
      <div className="bg-zinc-900/40 border border-zinc-850 rounded-xl p-5 space-y-4 shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Completed Book Hours Matrix
          </span>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
            Interval: {zoom}
          </span>
        </div>

        <div className="overflow-x-auto border border-zinc-850 rounded-lg bg-zinc-950/20">
          <table className="min-w-full divide-y divide-zinc-900 font-sans text-left">
            <thead>
              <tr className="bg-zinc-900/40">
                <th className="px-4 py-3 text-xs font-black text-zinc-450 uppercase tracking-wider sticky left-0 bg-zinc-900 backdrop-blur border-r border-zinc-850 z-10 min-w-[160px]">
                  Technician
                </th>
                {telemetryData.graphPoints.map((pt, i) => (
                  <th key={i} className="px-3 py-3 text-xs font-black text-zinc-450 uppercase tracking-wider text-center min-w-[70px]">
                    {pt.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {staff.map((s) => {
                const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.displayName || 'Technician';
                return (
                  <tr key={s.id} className="hover:bg-zinc-900/10">
                    <td className="px-4 py-2.5 text-xs font-bold text-zinc-200 sticky left-0 bg-zinc-900 backdrop-blur border-r border-zinc-850 z-10">
                      {name}
                    </td>
                    {telemetryData.graphPoints.map((pt, i) => {
                      const hours = pt.staffBook[s.id] || 0;
                      return (
                        <td key={i} className="px-3 py-2.5 text-center text-xs align-middle">
                          {hours >= 8 ? (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-black font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {hours.toFixed(1)}h
                            </span>
                          ) : hours >= 4 ? (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-black font-mono text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {hours.toFixed(1)}h
                            </span>
                          ) : hours > 0 ? (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-bold font-mono text-[10px] bg-zinc-800 text-zinc-350 border border-zinc-700/25">
                              {hours.toFixed(1)}h
                            </span>
                          ) : (
                            <span className="text-zinc-700 font-mono">--</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
