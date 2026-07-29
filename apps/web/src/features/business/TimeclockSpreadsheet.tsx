import { useState, useEffect, useMemo, Fragment } from 'react';
import { db } from '../../lib/firebase/config';
import { 
  collection, onSnapshot, doc, deleteDoc, updateDoc, deleteField
} from 'firebase/firestore';
import { 
  Clock, Calendar, ChevronDown, ChevronRight, 
  Check, X, Search, Plus, Trash2, Edit2, MapPin,
  Maximize2, Minimize2, Square, Coffee, Pizza, Wrench, AlertCircle
} from 'lucide-react';
import { TimeSessionEditorModal } from '../timeclock/TimeSessionEditorModal';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

// Helper to calculate payroll week starting date
const getPayrollWeekStart = (d: Date, weekEndDay: number) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const startDay = (weekEndDay + 1) % 7;
  let diff = day - startDay;
  if (diff < 0) diff += 7;
  
  const start = new Date(date);
  start.setDate(date.getDate() - diff);
  return start;
};

// Convert firestore timestamp or date string to milliseconds
const getMs = (val: any) => {
  if (!val) return Date.now();
  if (val.seconds !== undefined) return val.seconds * 1000;
  if (val.toDate !== undefined) return val.toDate().getTime();
  return new Date(val).getTime();
};

const formatDecimalHours = (ms: number) => {
  return `${(ms / 3600000).toFixed(2)}h`;
};

const formatClockTime = (ts: any) => {
  if (!ts) return '--:--';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDateFull = (date: Date) => {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

// Calculate total session time in ms
const calculateSessionMs = (session: any) => {
  const clockInVal = session.clockIn?.timestamp;
  const clockOutVal = session.clockOut?.timestamp;
  if (!clockInVal) return 0;
  
  const sMs = getMs(clockInVal);
  let eMs = Date.now();
  if (clockOutVal) {
    eMs = getMs(clockOutVal);
  } else if (session.status === 'completed') {
    const updatedVal = session.updatedAt || session.createdAt;
    eMs = getMs(updatedVal);
  }
  return Math.max(0, eMs - sMs);
};

// Calculate total break time in ms
const calculateBreaksMs = (session: any) => {
  return (session.breaks || []).reduce((acc: number, b: any) => {
    const bs = getMs(b.start);
    const be = b.end ? getMs(b.end) : Date.now();
    return acc + Math.max(0, be - bs);
  }, 0);
};

// Calculate unallocated time intervals for a session
const calculateSessionGaps = (ses: any, currentTime: number) => {
  const clockInVal = ses.clockIn?.timestamp;
  if (!clockInVal) return [];

  const sStartMs = getMs(clockInVal);
  const sEndMs = ses.clockOut?.timestamp ? getMs(ses.clockOut.timestamp) : currentTime;

  const occupied: { start: number; end: number }[] = [];
  
  // 1. Add breaks
  (ses.breaks || []).forEach((b: any) => {
    const bs = getMs(b.start);
    const be = b.end ? getMs(b.end) : (ses.status === 'on_break' ? currentTime : bs);
    occupied.push({ start: bs, end: be });
  });

  // 2. Add jobs clocked labor
  (ses.jobs || []).forEach((j: any) => {
    const js = getMs(j.start);
    let je = j.end ? getMs(j.end) : null;
    if (!je) {
      if (ses.clockOut?.timestamp) {
        je = getMs(ses.clockOut.timestamp);
      } else if (ses.status === 'active' && !j.end) {
        je = currentTime;
      }
    }
    if (je) {
      occupied.push({ start: js, end: je });
    }
  });

  // Sort occupied intervals by start time
  occupied.sort((a, b) => a.start - b.start);

  // Merge overlapping occupied intervals
  const mergedOccupied: { start: number; end: number }[] = [];
  occupied.forEach(interval => {
    if (mergedOccupied.length === 0) {
      mergedOccupied.push(interval);
    } else {
      const last = mergedOccupied[mergedOccupied.length - 1];
      if (interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
      } else {
        mergedOccupied.push(interval);
      }
    }
  });

  // Subtract merged occupied intervals from [sStartMs, sEndMs] to find gaps
  const gaps: { start: number; end: number }[] = [];
  let lastEnd = sStartMs;

  mergedOccupied.forEach(occ => {
    if (occ.start > lastEnd) {
      gaps.push({ start: lastEnd, end: occ.start });
    }
    lastEnd = Math.max(lastEnd, occ.end);
  });

  if (lastEnd < sEndMs) {
    gaps.push({ start: lastEnd, end: sEndMs });
  }

  // Filter out gaps smaller than 1 minute
  return gaps.filter(gap => (gap.end - gap.start) >= 60000);
};

interface TimeclockSpreadsheetProps {
  tenantId: string;
}

export function TimeclockSpreadsheet({ tenantId }: TimeclockSpreadsheetProps) {
  // Data subscriptions
  const [sessions, setSessions] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [jobs, setJobs] = useState<Record<string, any>>({});
  
  // Expand/collapse states
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Search / Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('all');
  const [dateRangePreset, setDateRangePreset] = useState<'30_days' | 'current_week' | 'prev_week' | 'all'>('30_days');

  // Modals
  const [editingSession, setEditingSession] = useState<any | null>(null);
  const [editingGapKey, setEditingGapKey] = useState<string | null>(null);
  const [gapNoteValue, setGapNoteValue] = useState('');
  
  // Current time for active timers
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Listen for Time Sessions
  useEffect(() => {
    if (!tenantId) return;
    const q = collection(db, `businesses/${tenantId}/time_sessions`);
    const unsubscribe = onSnapshot(q, (snap) => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Error loading time sessions:", err));
    return () => unsubscribe();
  }, [tenantId]);

  // Listen for Staff
  useEffect(() => {
    if (!tenantId) return;
    const q = collection(db, `businesses/${tenantId}/staff`);
    const unsubscribe = onSnapshot(q, (snap) => {
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Error loading staff:", err));
    return () => unsubscribe();
  }, [tenantId]);

  // Listen for Departments
  useEffect(() => {
    if (!tenantId) return;
    const q = collection(db, `businesses/${tenantId}/departments`);
    const unsubscribe = onSnapshot(q, (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Error loading departments:", err));
    return () => unsubscribe();
  }, [tenantId]);

  // Listen for Jobs
  useEffect(() => {
    if (!tenantId) return;
    const q = collection(db, `businesses/${tenantId}/jobs`);
    const unsubscribe = onSnapshot(q, (snap) => {
      const map: Record<string, any> = {};
      snap.docs.forEach(d => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      setJobs(map);
    }, (err) => console.error("Error loading jobs:", err));
    return () => unsubscribe();
  }, [tenantId]);

  // Date limit helpers
  const filteredSessionsByDate = useMemo(() => {
    const today = new Date();
    let minTime = 0;
    
    if (dateRangePreset === '30_days') {
      minTime = today.getTime() - (30 * 24 * 60 * 60 * 1000);
    } else if (dateRangePreset === 'current_week') {
      minTime = getPayrollWeekStart(today, 0).getTime();
    } else if (dateRangePreset === 'prev_week') {
      const startW2 = getPayrollWeekStart(today, 0);
      minTime = startW2.getTime() - (7 * 24 * 60 * 60 * 1000);
    }

    return sessions.filter(s => {
      if (!s.clockIn?.timestamp) return false;
      const ts = getMs(s.clockIn.timestamp);
      if (dateRangePreset !== 'all' && ts < minTime) return false;

      // Filter by department
      const tech = staff.find(st => st.id === s.userId || st.userId === s.userId);
      if (selectedDeptId !== 'all' && tech?.departmentId !== selectedDeptId) return false;

      // Filter by Search Term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const techName = tech ? `${tech.firstName} ${tech.lastName}`.toLowerCase() : (s.userName || '').toLowerCase();
        const techRole = (tech?.jobTitle || '').toLowerCase();
        const jobMatches = (s.jobs || []).some((j: any) => (j.name || '').toLowerCase().includes(query) || (j.taskName || '').toLowerCase().includes(query));
        
        return techName.includes(query) || techRole.includes(query) || jobMatches;
      }

      return true;
    });
  }, [sessions, staff, dateRangePreset, selectedDeptId, searchTerm]);

  // Grouping by Date YYYY-MM-DD
  const groupedDays = useMemo(() => {
    const groups: Record<string, { date: Date; sessions: any[] }> = {};

    filteredSessionsByDate.forEach(s => {
      const ts = getMs(s.clockIn.timestamp);
      const d = new Date(ts);
      const dateStr = d.toISOString().split('T')[0]; // local ISO-like day YYYY-MM-DD

      if (!groups[dateStr]) {
        groups[dateStr] = {
          date: d,
          sessions: []
        };
      }
      groups[dateStr].sessions.push(s);
    });

    // Convert to sorted array (newest day first)
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(key => {
        const group = groups[key];
        
        // Calculations for the day overall
        let totalClockedMs = 0;
        let totalBilledMs = 0;
        const uniqueTechIds = new Set<string>();

        group.sessions.forEach(s => {
          if (s.userId) uniqueTechIds.add(s.userId);
          const totalMs = calculateSessionMs(s);
          const breakMs = calculateBreaksMs(s);
          const workMs = Math.max(0, totalMs - breakMs);
          totalClockedMs += workMs;

          // Billed/Job time clocked
          (s.jobs || []).forEach((j: any) => {
            const js = getMs(j.start);
            let je = j.end ? getMs(j.end) : null;
            if (!je) {
              if (s.clockOut?.timestamp) {
                je = getMs(s.clockOut.timestamp);
              } else if (s.status === 'active' && !j.end) {
                je = currentTime;
              }
            }
            if (je) {
              totalBilledMs += Math.max(0, je - js);
            }
          });
        });

        const totalIdleMs = Math.max(0, totalClockedMs - totalBilledMs);
        const shopAllocationPercent = totalClockedMs > 0 ? Math.round((totalBilledMs / totalClockedMs) * 100) : 0;

        return {
          dateStr: key,
          date: group.date,
          sessions: group.sessions,
          activeTechCount: uniqueTechIds.size,
          totalClockedMs,
          totalBilledMs,
          totalIdleMs,
          shopAllocationPercent
        };
      });
  }, [filteredSessionsByDate, currentTime]);

  const toggleDay = (dateStr: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const toggleSession = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const handleDeleteSession = async (sessionId: string, userName: string) => {
    if (window.confirm(`Are you sure you want to permanently delete this time log for ${userName}?`)) {
      try {
        await deleteDoc(doc(db, `businesses/${tenantId}/time_sessions`, sessionId));
        toast.success("Time clock session deleted");
      } catch (err) {
        toast.error("Failed to delete session");
      }
    }
  };

  // Gap Notes save handler
  const saveGapNote = async (sessionId: string, gapStart: number) => {
    try {
      const ref = doc(db, `businesses/${tenantId}/time_sessions`, sessionId);
      await updateDoc(ref, {
        [`gapNotes.gap_${gapStart}`]: gapNoteValue.trim() || deleteField()
      });
      toast.success("Gap note updated");
      setEditingGapKey(null);
    } catch (e) {
      toast.error("Failed to update note");
    }
  };

  const buildChronologicalTimeline = (ses: any) => {
    const shiftStart = getMs(ses.clockIn?.timestamp);
    const shiftEnd = ses.clockOut?.timestamp ? getMs(ses.clockOut.timestamp) : currentTime;

    const list: Array<{
      id: string;
      type: 'shift_start' | 'shift_end' | 'break' | 'labor' | 'gap';
      timeStart: number;
      timeEnd?: number;
      label: string;
      subLabel?: string;
      isPaid?: boolean;
      breakType?: string;
      notes?: string;
      taskId?: string;
      jobId?: string;
    }> = [];

    list.push({
      id: `start-${ses.id}`,
      type: 'shift_start',
      timeStart: shiftStart,
      label: 'Shift Started',
      subLabel: ses.clockIn?.location || (ses.isRemote ? 'Remote' : 'On-Site')
    });

    if (ses.clockOut?.timestamp) {
      list.push({
        id: `end-${ses.id}`,
        type: 'shift_end',
        timeStart: shiftEnd,
        label: 'Shift Completed',
        subLabel: ses.clockOut?.location || 'Punch out'
      });
    }

    // Breaks
    (ses.breaks || []).forEach((b: any, bIdx: number) => {
      const bs = getMs(b.start);
      const be = b.end ? getMs(b.end) : currentTime;
      list.push({
        id: `break-${ses.id}-${bIdx}`,
        type: 'break',
        timeStart: bs,
        timeEnd: be,
        label: b.type === 'lunch' ? 'Lunch Break' : 'Rest Break',
        subLabel: b.isPaid ? 'Paid' : 'Unpaid',
        isPaid: b.isPaid,
        breakType: b.type
      });
    });

    // Jobs Clocked Labor
    (ses.jobs || []).forEach((j: any, jIdx: number) => {
      const js = getMs(j.start);
      const je = j.end ? getMs(j.end) : shiftEnd;
      
      const jobDetail = jobs[j.id];
      const jobNumStr = jobDetail?.jobNumber ? `#${jobDetail.jobNumber}` : '';
      const custStr = jobDetail?.customerName || '';
      
      list.push({
        id: `labor-${ses.id}-${jIdx}`,
        type: 'labor',
        timeStart: js,
        timeEnd: je,
        label: `${jobNumStr} ${custStr}`.trim() || j.name || 'Job Clock',
        subLabel: j.taskName || 'General task contribution',
        notes: j.notes || '',
        taskId: j.taskId,
        jobId: j.id
      });
    });

    // Unallocated time gaps
    const gaps = calculateSessionGaps(ses, currentTime);
    gaps.forEach((gap, gIdx) => {
      const savedNote = ses.gapNotes?.[`gap_${gap.start}`] || '';
      list.push({
        id: `gap-${ses.id}-${gIdx}`,
        type: 'gap',
        timeStart: gap.start,
        timeEnd: gap.end,
        label: 'Unallocated Time Gap',
        subLabel: 'Tech clocked in but not active on a job',
        notes: savedNote
      });
    });

    // Sort chronologically ascending
    return list.sort((a, b) => a.timeStart - b.timeStart);
  };

  const getFormatDurationText = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div 
      className={cn(
        "flex flex-col text-zinc-100 font-sans text-xs select-none transition-all duration-200",
        isFullScreen 
          ? "fixed inset-0 z-50 bg-zinc-950 p-6 h-screen w-screen overflow-auto gap-4" 
          : "flex-1 p-4 sm:p-6 gap-6 overflow-auto"
      )}
    >
      
      {/* Top Header & Search Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-lg relative overflow-hidden shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            Time Logs Sheet (v3)
          </h2>
          <p className="text-xs text-zinc-400 mt-1">Hierarchical tree-grid overview of active shifts, task segments, and unallocated gaps.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Department Filter */}
          <select 
            value={selectedDeptId} 
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 font-bold transition outline-none"
          >
            <option value="all">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          {/* Date Preset Filter */}
          <select 
            value={dateRangePreset} 
            onChange={(e) => setDateRangePreset(e.target.value as any)}
            className="px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 font-bold transition outline-none"
          >
            <option value="30_days">Last 30 Days</option>
            <option value="current_week">Current Week</option>
            <option value="prev_week">Previous Week</option>
            <option value="all">All History</option>
          </select>

          {/* Search Box */}
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search tech name or job..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition text-white"
            />
          </div>

          {/* Add Manual Record */}
          <button 
            onClick={() => setEditingSession({})}
            className="flex px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition items-center gap-1.5 border border-indigo-500/20 cursor-pointer text-xs"
          >
            <Plus className="w-4 h-4" />
            Add Time Entry
          </button>

          {/* Full Screen Toggle */}
          <button 
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-2 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl transition cursor-pointer"
            title={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Hierarchical Tree Grid */}
      <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className={cn("overflow-x-auto overflow-y-auto", isFullScreen ? "max-h-[calc(100vh-8rem)]" : "max-h-[70vh]")}>
          <table className="w-full text-left border-collapse min-w-[900px]">
            {/* Header */}
            <thead className="bg-zinc-950 text-zinc-500 uppercase text-[9px] font-black tracking-widest border-b border-zinc-800 sticky top-0 z-20">
              <tr>
                <th className="px-6 py-4" style={{ width: '4%' }}></th>
                <th className="px-6 py-4" style={{ width: '25%' }}>Hierarchy Item / Technician</th>
                <th className="px-6 py-4" style={{ width: '15%' }}>Shift Duration</th>
                <th className="px-6 py-4 text-right" style={{ width: '13%' }}>Total Clocked</th>
                <th className="px-6 py-4 text-right" style={{ width: '13%' }}>Billed Job Hours</th>
                <th className="px-6 py-4 text-right" style={{ width: '13%' }}>Unallocated/Idle</th>
                <th className="px-6 py-4 text-right" style={{ width: '10%' }}>Allocation %</th>
                <th className="px-6 py-4" style={{ width: '10%' }}></th>
              </tr>
            </thead>

            {/* Tree Rows */}
            <tbody className="divide-y divide-zinc-850">
              {groupedDays.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-12 py-16 text-center text-zinc-500 italic text-sm">
                    No time clock sessions found for the selected filters.
                  </td>
                </tr>
              ) : (
                groupedDays.map(day => {
                  const isDayExpanded = expandedDays.has(day.dateStr);
                  
                  return (
                    <Fragment key={day.dateStr}>
                      {/* LEVEL 1: DAY OVERALL ROW */}
                      <tr 
                        key={day.dateStr} 
                        onClick={() => toggleDay(day.dateStr)}
                        className="bg-zinc-950/40 hover:bg-zinc-950/80 cursor-pointer font-bold text-zinc-300 transition-colors"
                      >
                        <td className="px-6 py-4 text-center">
                          {isDayExpanded ? (
                            <ChevronDown className="w-4 h-4 text-zinc-400 inline" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-zinc-400 inline" />
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-white">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-zinc-400" />
                            {formatDateFull(day.date)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-zinc-450">
                          {day.activeTechCount} Technicians Active
                        </td>
                        <td className="px-6 py-4 text-right font-mono">
                          {formatDecimalHours(day.totalClockedMs)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-indigo-400">
                          {formatDecimalHours(day.totalBilledMs)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-amber-500">
                          {formatDecimalHours(day.totalIdleMs)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-black border",
                            day.shopAllocationPercent >= 80 
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                              : day.shopAllocationPercent >= 60 
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          )}>
                            {day.shopAllocationPercent}%
                          </span>
                        </td>
                        <td className="px-6 py-4"></td>
                      </tr>

                      {/* LEVEL 2: DAY TECHNICIANS (Expanded) */}
                      {isDayExpanded && day.sessions.map(session => {
                        const isSessionExpanded = expandedSessions.has(session.id);
                        
                        const tech = staff.find(st => st.id === session.userId || st.userId === session.userId);
                        const dept = departments.find(d => d.id === tech?.departmentId);
                        const displayName = tech ? `${tech.firstName} ${tech.lastName}`.trim() : (session.userName || 'Unknown Staff');
                        
                        // Session totals
                        const totalMs = calculateSessionMs(session);
                        const breakMs = calculateBreaksMs(session);
                        const workMs = Math.max(0, totalMs - breakMs);

                        // Billed job hours
                        let taskMs = 0;
                        (session.jobs || []).forEach((j: any) => {
                          const js = getMs(j.start);
                          const je = j.end ? getMs(j.end) : (session.clockOut?.timestamp ? getMs(session.clockOut.timestamp) : currentTime);
                          taskMs += Math.max(0, je - js);
                        });

                        const idleMs = Math.max(0, workMs - taskMs);
                        const allocationPct = workMs > 0 ? Math.round((taskMs / workMs) * 100) : 0;

                        return (
                          <Fragment key={session.id}>
                            <tr 
                              key={session.id}
                              onClick={() => toggleSession(session.id)}
                              className="hover:bg-zinc-800/40 cursor-pointer text-zinc-300 transition-colors border-l-4 border-indigo-500/50"
                            >
                              <td className="px-6 py-3 text-center pl-8">
                                {isSessionExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 inline" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500 inline" />
                                )}
                              </td>
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-[10px] text-zinc-300">
                                    {displayName[0] || 'T'}
                                  </div>
                                  <div>
                                    <span className="font-bold text-zinc-100">{displayName}</span>
                                    <div className="text-[9px] text-zinc-500 uppercase font-black">{tech?.jobTitle || 'Technician'} • {dept?.name || 'Unassigned'}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-1.5 font-mono text-zinc-400 font-bold">
                                  {formatClockTime(session.clockIn?.timestamp)} 
                                  <span>→</span> 
                                  {session.status === 'completed' 
                                    ? formatClockTime(session.clockOut?.timestamp) 
                                    : <span className="text-emerald-500 animate-pulse uppercase tracking-wider text-[9px] font-black">Active</span>
                                  }
                                </div>
                              </td>
                              <td className="px-6 py-3 text-right font-mono">
                                {formatDecimalHours(workMs)}
                              </td>
                              <td className="px-6 py-3 text-right font-mono text-indigo-400">
                                {formatDecimalHours(taskMs)}
                              </td>
                              <td className="px-6 py-3 text-right font-mono text-amber-500">
                                {formatDecimalHours(idleMs)}
                              </td>
                              <td className="px-6 py-3 text-right font-mono">
                                <span className={cn(
                                  "font-bold text-[10px]",
                                  allocationPct >= 80 
                                    ? "text-emerald-500" 
                                    : allocationPct >= 60 
                                      ? "text-amber-500" 
                                      : "text-rose-500"
                                )}>
                                  {allocationPct}%
                                </span>
                              </td>
                              <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-2.5">
                                  <button 
                                    onClick={() => setEditingSession(session)}
                                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition"
                                    title="Edit Shift & Segments"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteSession(session.id, displayName)}
                                    className="p-1.5 bg-zinc-800/60 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 rounded-lg transition"
                                    title="Delete Shift Log"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* LEVEL 3: TIMELINE (Expanded) */}
                            {isSessionExpanded && (
                              <tr key={`timeline-${session.id}`}>
                                <td colSpan={8} className="px-12 py-4 bg-zinc-950/20 border-l-4 border-indigo-500/70">
                                  <div className="p-4 rounded-xl bg-zinc-950/50 border border-zinc-850 space-y-4 max-w-4xl">
                                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                                      <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Chronological Shift Timeline logs (V3)</span>
                                      {session.isRemote && (
                                        <span className="flex items-center gap-1 text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded uppercase font-bold">
                                          <MapPin className="w-3 h-3" /> Remote Shift
                                        </span>
                                      )}
                                    </div>

                                    {/* Timeline items (Gridpass list style) */}
                                    <div className="divide-y divide-zinc-800">
                                      {buildChronologicalTimeline(session).map((event) => {
                                        const eventDuration = event.timeEnd ? (event.timeEnd - event.timeStart) : 0;
                                        
                                        let circleColor = "bg-zinc-800 text-zinc-400";
                                        let iconNode = <Clock className="w-3.5 h-3.5" />;

                                        if (event.type === 'shift_start') {
                                          circleColor = "bg-zinc-800 text-emerald-500 border border-emerald-500/25";
                                          iconNode = <Check className="w-3.5 h-3.5" />;
                                        } else if (event.type === 'shift_end') {
                                          circleColor = "bg-zinc-800 text-rose-500 border border-rose-500/25";
                                          iconNode = <Square className="w-3.5 h-3.5 fill-current" />;
                                        } else if (event.type === 'break') {
                                          circleColor = "bg-amber-500/10 text-amber-500 border border-amber-500/20";
                                          iconNode = event.breakType === 'lunch' ? <Pizza className="w-3.5 h-3.5" /> : <Coffee className="w-3.5 h-3.5" />;
                                        } else if (event.type === 'labor') {
                                          circleColor = "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
                                          iconNode = <Wrench className="w-3.5 h-3.5" />;
                                        } else if (event.type === 'gap') {
                                          circleColor = "bg-amber-500/10 text-amber-500 border border-amber-500/25";
                                          iconNode = <AlertCircle className="w-3.5 h-3.5 animate-pulse" />;
                                        }

                                        return (
                                          <div 
                                            key={event.id} 
                                            className="py-3 flex items-center justify-between gap-4 hover:bg-zinc-800/20 transition-colors select-text"
                                          >
                                            <div className="flex items-center gap-3.5 min-w-0">
                                              {/* Colored Circle Icon */}
                                              <div className={cn(
                                                "w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                                                circleColor
                                              )}>
                                                {iconNode}
                                              </div>

                                              <div className="flex flex-col gap-1 min-w-0">
                                                {/* Time display */}
                                                <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 font-mono block leading-none">
                                                  {new Date(event.timeStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                  {event.timeEnd && ` - ${new Date(event.timeEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                                  {!event.timeEnd && (event.type === 'labor' || event.type === 'break') && " - ACTIVE NOW"}
                                                </span>

                                                {/* Label */}
                                                {event.jobId ? (
                                                  <a 
                                                    href={`/business/${tenantId}/jobs/${event.jobId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs font-black text-white hover:text-indigo-400 underline decoration-dotted transition-colors leading-tight uppercase truncate block"
                                                  >
                                                    {event.label}
                                                  </a>
                                                ) : (
                                                  <h4 className="text-xs font-black text-white leading-tight uppercase truncate">
                                                    {event.label}
                                                  </h4>
                                                )}

                                                {/* SubLabel & Pill tags */}
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="text-[10px] text-zinc-500 font-bold uppercase leading-none">
                                                    {event.subLabel}
                                                  </span>
                                                  {event.type === 'labor' && (
                                                    <span className="text-[8px] px-1 py-0.5 rounded font-black tracking-widest uppercase leading-none bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                                      Job Labor
                                                    </span>
                                                  )}
                                                  {event.type === 'gap' && (
                                                    <span className="text-[8px] px-1 py-0.5 rounded font-black tracking-widest uppercase leading-none bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                                      Idle Gap
                                                    </span>
                                                  )}
                                                </div>

                                                {/* Notes */}
                                                {event.notes && (
                                                  <p className="text-[10px] text-zinc-400 italic mt-1 bg-zinc-900/60 p-2 rounded border border-zinc-800 max-w-lg">
                                                    "{event.notes}"
                                                  </p>
                                                )}

                                                {/* Gap Notes Inline Editor */}
                                                {event.type === 'gap' && (
                                                  <div className="mt-2.5">
                                                    {editingGapKey === `${session.id}_${event.timeStart}` ? (
                                                      <div className="flex items-center gap-2 max-w-md">
                                                        <input 
                                                          type="text"
                                                          value={gapNoteValue}
                                                          onChange={(e) => setGapNoteValue(e.target.value)}
                                                          placeholder="Why was there a gap? e.g. Waiting on parts..."
                                                          className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-medium outline-none"
                                                          onKeyDown={(e) => {
                                                            if (e.key === 'Enter') saveGapNote(session.id, event.timeStart);
                                                            if (e.key === 'Escape') setEditingGapKey(null);
                                                          }}
                                                        />
                                                        <button 
                                                          onClick={() => saveGapNote(session.id, event.timeStart)}
                                                          className="p-1.5 bg-emerald-650 hover:bg-emerald-700 text-white rounded-lg transition"
                                                        >
                                                          <Check className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button 
                                                          onClick={() => setEditingGapKey(null)}
                                                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition"
                                                        >
                                                          <X className="w-3.5 h-3.5" />
                                                        </button>
                                                      </div>
                                                    ) : (
                                                      <button 
                                                        onClick={() => {
                                                          setEditingGapKey(`${session.id}_${event.timeStart}`);
                                                          setGapNoteValue(event.notes || '');
                                                        }}
                                                        className="text-[9px] font-bold text-zinc-450 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
                                                      >
                                                        <Edit2 className="w-3 h-3 text-zinc-500" />
                                                        {event.notes ? "Edit Gap Note" : "Write Explanatory Gap Note"}
                                                      </button>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            </div>

                                            {/* Duration Label */}
                                            {eventDuration > 0 && (
                                              <span className="font-mono font-bold text-zinc-350 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded shrink-0">
                                                {getFormatDurationText(eventDuration)}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor Modal Integration */}
      {editingSession && (
        <TimeSessionEditorModal
          session={editingSession}
          tenantId={tenantId}
          onClose={() => setEditingSession(null)}
          onSaved={() => setEditingSession(null)}
        />
      )}
    </div>
  );
}
