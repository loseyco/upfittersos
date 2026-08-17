import { useState, useEffect, useMemo, Fragment } from 'react';
import { db } from '../../lib/firebase/config';
import { 
  collection, onSnapshot, doc, deleteDoc, updateDoc, deleteField
} from 'firebase/firestore';
import { 
  Clock, Calendar, ChevronDown, ChevronRight, ChevronLeft,
  Check, X, Search, Plus, Trash2, Edit2, MapPin,
  Maximize2, Minimize2, Square, Coffee, Pizza, Wrench, AlertCircle,
  Download, Table, Layers, User, Briefcase, FileSpreadsheet
} from 'lucide-react';
import { TimeSessionEditorModal } from '../timeclock/TimeSessionEditorModal';
import { SearchableSelect } from './SearchableSelect';
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

const formatDateShort = (date: Date) => {
  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
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
  
  // Display View Mode: 'excel' (Flat Excel Grid) vs 'tree' (Hierarchical Tree)
  const [viewMode, setViewMode] = useState<'excel' | 'tree'>('excel');

  // Expand/collapse states
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Search / Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('all');
  const [selectedDeptId, setSelectedDeptId] = useState('all');
  const [selectedEntryType, setSelectedEntryType] = useState<string>('all');
  const [dateRangePreset, setDateRangePreset] = useState<'pay_period' | 'today' | 'yesterday' | 'current_week' | 'prev_week' | '30_days' | 'custom' | 'all'>('pay_period');
  const [offsetWeeks, setOffsetWeeks] = useState(0);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Calculate Pay Period Date Range
  const currentPayPeriod = useMemo(() => {
    const today = new Date();
    const startOfWeek = getPayrollWeekStart(today, 0);
    const targetStart = new Date(startOfWeek);
    targetStart.setDate(startOfWeek.getDate() + (offsetWeeks * 7));
    targetStart.setHours(0, 0, 0, 0);
    
    const targetEnd = new Date(targetStart);
    targetEnd.setDate(targetStart.getDate() + 6);
    targetEnd.setHours(23, 59, 59, 999);

    const formatShortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const label = `${formatShortDate(targetStart)} - ${formatShortDate(targetEnd)}`;

    return {
      startMs: targetStart.getTime(),
      endMs: targetEnd.getTime(),
      label
    };
  }, [offsetWeeks]);

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

  // Active staff filter (Strict status, archive & fireDate checks)
  const activeStaff = useMemo(() => {
    return staff.filter(st => {
      // 1. Explicit archive checks
      if (st.isArchived === true || st.archived === true) return false;

      // 2. Fire date / termination date set
      if (st.fireDate && st.fireDate.toString().trim() !== '') return false;

      // 3. Explicit boolean active flags
      if (st.active === false || st.isActive === false) return false;

      // 4. Status string check
      if (st.status) {
        const s = st.status.toString().toLowerCase().trim();
        if (['inactive', 'disabled', 'terminated', 'archived', 'fired', 'offboarding', 'former'].includes(s)) {
          return false;
        }
      }

      // 5. Employment status check
      if (st.employmentStatus) {
        const es = st.employmentStatus.toString().toLowerCase().trim();
        if (['inactive', 'disabled', 'terminated', 'archived', 'fired'].includes(es)) {
          return false;
        }
      }

      // 6. Name validation
      const firstName = (st.firstName || st.name || '').trim();
      const lastName = (st.lastName || '').trim();
      if (!firstName && !lastName) return false;

      return true;
    }).sort((a, b) => {
      const nameA = `${a.firstName || a.name || ''} ${a.lastName || ''}`.trim();
      const nameB = `${b.firstName || b.name || ''} ${b.lastName || ''}`.trim();
      return nameA.localeCompare(nameB);
    });
  }, [staff]);

  const staffSelectOptions = useMemo(() => {
    return [
      { id: 'all', label: `All Active Staff (${activeStaff.length})` },
      ...activeStaff.map(st => {
        const sName = `${st.firstName || st.name || ''} ${st.lastName || ''}`.trim() || 'Staff Member';
        const sRole = st.jobTitle || st.role || st.department || 'Tech';
        return {
          id: st.id,
          label: `${sName} (${sRole})`
        };
      })
    ];
  }, [activeStaff]);

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

  // Filter sessions by selected Date Range, Staff, Department, and Search Term
  const filteredSessions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let minTime = 0;
    let maxTime = Infinity;
    
    if (dateRangePreset === 'pay_period') {
      minTime = currentPayPeriod.startMs;
      maxTime = currentPayPeriod.endMs;
    } else if (dateRangePreset === 'today') {
      minTime = today.getTime();
      maxTime = today.getTime() + (24 * 60 * 60 * 1000) - 1;
    } else if (dateRangePreset === 'yesterday') {
      const yest = new Date(today);
      yest.setDate(today.getDate() - 1);
      minTime = yest.getTime();
      maxTime = today.getTime() - 1;
    } else if (dateRangePreset === 'current_week') {
      minTime = getPayrollWeekStart(today, 0).getTime();
    } else if (dateRangePreset === 'prev_week') {
      const startW2 = getPayrollWeekStart(today, 0);
      minTime = startW2.getTime() - (7 * 24 * 60 * 60 * 1000);
      maxTime = startW2.getTime() - 1;
    } else if (dateRangePreset === '30_days') {
      minTime = today.getTime() - (30 * 24 * 60 * 60 * 1000);
    } else if (dateRangePreset === 'custom') {
      if (customStartDate) {
        const sD = new Date(customStartDate);
        sD.setHours(0, 0, 0, 0);
        minTime = sD.getTime();
      }
      if (customEndDate) {
        const eD = new Date(customEndDate);
        eD.setHours(23, 59, 59, 999);
        maxTime = eD.getTime();
      }
    }

    return sessions.filter(s => {
      if (!s.clockIn?.timestamp) return false;
      const ts = getMs(s.clockIn.timestamp);
      if (dateRangePreset !== 'all' && (ts < minTime || ts > maxTime)) return false;

      // Filter by Staff Member
      if (selectedStaffId !== 'all' && s.userId !== selectedStaffId) {
        const tech = staff.find(st => st.id === selectedStaffId || st.userId === selectedStaffId);
        if (!tech || (s.userId !== tech.id && s.userId !== tech.userId)) return false;
      }

      // Filter by department
      const tech = staff.find(st => st.id === s.userId || st.userId === s.userId);
      if (selectedDeptId !== 'all' && tech?.departmentId !== selectedDeptId) return false;

      // Filter by Search Term (Job #, Customer, Staff Name, Task Name, Notes)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const techName = tech ? `${tech.firstName} ${tech.lastName}`.toLowerCase() : (s.userName || '').toLowerCase();
        const techRole = (tech?.jobTitle || '').toLowerCase();
        
        const jobMatches = (s.jobs || []).some((j: any) => {
          const jobDetail = jobs[j.id];
          const jobNumStr = (jobDetail?.jobNumber || '').toLowerCase();
          const custStr = (jobDetail?.customerName || '').toLowerCase();
          const jName = (j.name || '').toLowerCase();
          const tName = (j.taskName || '').toLowerCase();
          const jNotes = (j.notes || '').toLowerCase();
          return jName.includes(query) || tName.includes(query) || jobNumStr.includes(query) || custStr.includes(query) || jNotes.includes(query);
        });

        const gapMatches = Object.values(s.gapNotes || {}).some((note: any) => (note || '').toLowerCase().includes(query));
        const staffNoteMatches = (s.staffNote || '').toLowerCase().includes(query) || (s.notes || '').toLowerCase().includes(query);
        
        return techName.includes(query) || techRole.includes(query) || jobMatches || gapMatches || staffNoteMatches;
      }

      return true;
    });
  }, [sessions, staff, jobs, dateRangePreset, currentPayPeriod, customStartDate, customEndDate, selectedStaffId, selectedDeptId, searchTerm]);

  // Aggregate Metrics Cards
  const kpiMetrics = useMemo(() => {
    let totalShiftMs = 0;
    let totalBilledMs = 0;
    let totalBookTimeMs = 0;
    let totalBreakMs = 0;
    let totalGapMs = 0;
    const activeStaffIds = new Set<string>();

    filteredSessions.forEach(s => {
      if (s.userId) activeStaffIds.add(s.userId);
      const sesTotalMs = calculateSessionMs(s);
      const bMs = calculateBreaksMs(s);
      const workMs = Math.max(0, sesTotalMs - bMs);
      
      totalShiftMs += workMs;
      totalBreakMs += bMs;

      // Hourly Billed Job labor & Book Time
      (s.jobs || []).forEach((j: any) => {
        const js = getMs(j.start);
        const je = j.end ? getMs(j.end) : (s.clockOut?.timestamp ? getMs(s.clockOut.timestamp) : currentTime);
        totalBilledMs += Math.max(0, je - js);

        const jobDetail = jobs[j.id];
        let taskBookTime = 0;
        if (jobDetail?.tasks) {
          const rawTasks = Array.isArray(jobDetail.tasks) ? jobDetail.tasks : Object.values(jobDetail.tasks);
          const matchedTask = rawTasks.find((t: any) => 
            (j.taskId && t.id === j.taskId) || 
            (j.taskName && (t.name || t.title || t.taskTitle) === j.taskName)
          );
          if (matchedTask) {
            taskBookTime = parseFloat(matchedTask.bookTime || matchedTask.estimatedHours || matchedTask.hours || '0');
          }
        }
        if (!taskBookTime && j.bookTime) {
          taskBookTime = parseFloat(j.bookTime || '0');
        }

        totalBookTimeMs += Math.max(0, taskBookTime * 3600 * 1000);
      });

      // Unallocated gaps
      const gaps = calculateSessionGaps(s, currentTime);
      gaps.forEach(g => {
        totalGapMs += Math.max(0, g.end - g.start);
      });
    });

    const totalProducedMs = totalBookTimeMs + totalBilledMs;
    const efficiencyPct = totalShiftMs > 0 ? Math.round((totalBilledMs / totalShiftMs) * 100) : 0;
    const bookEfficiencyPct = totalShiftMs > 0 ? Math.round((totalBookTimeMs / totalShiftMs) * 100) : 0;
    const producedEfficiencyPct = totalShiftMs > 0 ? Math.round((totalProducedMs / totalShiftMs) * 100) : 0;
    const gapPct = totalShiftMs > 0 ? Math.round((totalGapMs / totalShiftMs) * 100) : 0;

    return {
      totalShiftMs,
      totalBilledMs,
      totalBookTimeMs,
      totalProducedMs,
      totalBreakMs,
      totalGapMs,
      activeStaffCount: activeStaffIds.size,
      totalSessionsCount: filteredSessions.length,
      efficiencyPct,
      bookEfficiencyPct,
      producedEfficiencyPct,
      gapPct
    };
  }, [filteredSessions, jobs, currentTime]);

  // Flat Excel Row Model for High-Density Grid
  const flatExcelRows = useMemo(() => {
    const rows: Array<{
      id: string;
      sessionId: string;
      rawSession: any;
      date: Date;
      dateStr: string;
      staffName: string;
      staffRole: string;
      departmentName: string;
      entryType: 'Shift' | 'Job Labor' | 'Break' | 'Unallocated';
      jobNumber: string;
      customerName: string;
      jobId?: string;
      taskName: string;
      startTime: number;
      endTime?: number;
      durationMs: number;
      isLive: boolean;
      locationOrNotes: string;
    }> = [];

    filteredSessions.forEach(ses => {
      const tech = staff.find(st => st.id === ses.userId || st.userId === ses.userId);
      const dept = departments.find(d => d.id === tech?.departmentId);
      const staffName = tech ? `${tech.firstName} ${tech.lastName}`.trim() : (ses.userName || 'Staff Member');
      const staffRole = tech?.jobTitle || 'Technician';
      const departmentName = dept?.name || 'General';
      const sesStartMs = getMs(ses.clockIn?.timestamp);
      const sesEndMs = ses.clockOut?.timestamp ? getMs(ses.clockOut.timestamp) : currentTime;
      const d = new Date(sesStartMs);
      const dateStr = formatDateShort(d);

      // 1. Shift Overview Row (Punch In/Out)
      rows.push({
        id: `ses-${ses.id}`,
        sessionId: ses.id,
        rawSession: ses,
        date: d,
        dateStr,
        staffName,
        staffRole,
        departmentName,
        entryType: 'Shift',
        jobNumber: '--',
        customerName: '--',
        taskName: ses.status === 'active' ? 'Active Shift Punch' : 'Completed Shift Punch',
        startTime: sesStartMs,
        endTime: ses.clockOut?.timestamp ? sesEndMs : undefined,
        durationMs: Math.max(0, sesEndMs - sesStartMs - calculateBreaksMs(ses)),
        isLive: ses.status !== 'completed',
        locationOrNotes: ses.clockIn?.location || (ses.isRemote ? 'Remote' : 'On-Site')
      });

      // 2. Job Labor Rows
      (ses.jobs || []).forEach((j: any, jIdx: number) => {
        const js = getMs(j.start);
        const je = j.end ? getMs(j.end) : (ses.clockOut?.timestamp ? sesEndMs : currentTime);
        const jobDetail = jobs[j.id];
        const jobNumStr = jobDetail?.jobNumber ? `#${jobDetail.jobNumber}` : '';
        const custStr = jobDetail?.customerName || '';

        rows.push({
          id: `job-${ses.id}-${jIdx}`,
          sessionId: ses.id,
          rawSession: ses,
          date: new Date(js),
          dateStr: formatDateShort(new Date(js)),
          staffName,
          staffRole,
          departmentName,
          entryType: 'Job Labor',
          jobNumber: jobNumStr || j.name || 'Job',
          customerName: custStr,
          jobId: j.id,
          taskName: j.taskName || 'General Labor',
          startTime: js,
          endTime: j.end ? je : undefined,
          durationMs: Math.max(0, je - js),
          isLive: !j.end && ses.status === 'active',
          locationOrNotes: j.notes || ''
        });
      });

      // 3. Break Rows
      (ses.breaks || []).forEach((b: any, bIdx: number) => {
        const bs = getMs(b.start);
        const be = b.end ? getMs(b.end) : currentTime;
        rows.push({
          id: `brk-${ses.id}-${bIdx}`,
          sessionId: ses.id,
          rawSession: ses,
          date: new Date(bs),
          dateStr: formatDateShort(new Date(bs)),
          staffName,
          staffRole,
          departmentName,
          entryType: 'Break',
          jobNumber: '--',
          customerName: '--',
          taskName: b.type === 'lunch' ? 'Lunch Break' : 'Rest Break',
          startTime: bs,
          endTime: b.end ? be : undefined,
          durationMs: Math.max(0, be - bs),
          isLive: !b.end && ses.status === 'on_break',
          locationOrNotes: b.isPaid ? 'Paid Break' : 'Unpaid Break'
        });
      });

      // 4. Unallocated Gap Rows
      const gaps = calculateSessionGaps(ses, currentTime);
      gaps.forEach((gap, gIdx) => {
        const savedNote = ses.gapNotes?.[`gap_${gap.start}`] || '';
        rows.push({
          id: `gap-${ses.id}-${gIdx}`,
          sessionId: ses.id,
          rawSession: ses,
          date: new Date(gap.start),
          dateStr: formatDateShort(new Date(gap.start)),
          staffName,
          staffRole,
          departmentName,
          entryType: 'Unallocated',
          jobNumber: '--',
          customerName: '--',
          taskName: 'Unallocated Time Gap',
          startTime: gap.start,
          endTime: gap.end,
          durationMs: Math.max(0, gap.end - gap.start),
          isLive: false,
          locationOrNotes: savedNote || 'Tech clocked in but not active on job'
        });
      });
    });

    // Sort rows newest first
    return rows.sort((a, b) => b.startTime - a.startTime);
  }, [filteredSessions, staff, departments, jobs, currentTime]);

  // Filter rows by selected Entry Type
  const displayExcelRows = useMemo(() => {
    if (selectedEntryType === 'all') return flatExcelRows;
    if (selectedEntryType === 'Produced' || selectedEntryType === 'Book Time') return flatExcelRows.filter(r => r.entryType === 'Job Labor');
    return flatExcelRows.filter(r => r.entryType.toLowerCase() === selectedEntryType.toLowerCase());
  }, [flatExcelRows, selectedEntryType]);

  // Grouping by Date YYYY-MM-DD for Tree View
  const groupedDays = useMemo(() => {
    const groups: Record<string, { date: Date; sessions: any[] }> = {};

    filteredSessions.forEach(s => {
      const ts = getMs(s.clockIn.timestamp);
      const d = new Date(ts);
      const dateStr = d.toISOString().split('T')[0];

      if (!groups[dateStr]) {
        groups[dateStr] = {
          date: d,
          sessions: []
        };
      }
      groups[dateStr].sessions.push(s);
    });

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(key => {
        const group = groups[key];
        let totalClockedMs = 0;
        let totalBilledMs = 0;
        const uniqueTechIds = new Set<string>();

        group.sessions.forEach(s => {
          if (s.userId) uniqueTechIds.add(s.userId);
          const totalMs = calculateSessionMs(s);
          const breakMs = calculateBreaksMs(s);
          const workMs = Math.max(0, totalMs - breakMs);
          totalClockedMs += workMs;

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
  }, [filteredSessions, currentTime]);

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

  // CSV Export Handler
  const handleExportCSV = () => {
    if (flatExcelRows.length === 0) {
      toast.error("No time entries to export for current filters");
      return;
    }

    const headers = [
      "Date",
      "Staff Member",
      "Role",
      "Department",
      "Entry Type",
      "Job Number",
      "Customer",
      "Task / Activity",
      "Start Time",
      "End Time",
      "Hours (Decimal)",
      "Notes / Location"
    ];

    const csvLines = [headers.join(",")];

    flatExcelRows.forEach(r => {
      const sTimeStr = new Date(r.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const eTimeStr = r.endTime ? new Date(r.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (r.isLive ? 'ACTIVE NOW' : '--:--');
      const decimalHours = (r.durationMs / 3600000).toFixed(2);
      
      const line = [
        `"${r.dateStr}"`,
        `"${r.staffName.replace(/"/g, '""')}"`,
        `"${r.staffRole.replace(/"/g, '""')}"`,
        `"${r.departmentName.replace(/"/g, '""')}"`,
        `"${r.entryType}"`,
        `"${r.jobNumber.replace(/"/g, '""')}"`,
        `"${r.customerName.replace(/"/g, '""')}"`,
        `"${r.taskName.replace(/"/g, '""')}"`,
        `"${sTimeStr}"`,
        `"${eTimeStr}"`,
        `"${decimalHours}"`,
        `"${(r.locationOrNotes || '').replace(/"/g, '""')}"`
      ].join(",");

      csvLines.push(line);
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvLines.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `time_clock_sheet_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${flatExcelRows.length} time clock entries to CSV`);
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
          ? "fixed inset-0 z-50 bg-zinc-950 p-6 h-screen w-screen overflow-auto custom-scrollbar gap-4" 
          : "flex-1 p-4 sm:p-6 gap-6 custom-scrollbar"
      )}
    >
      
      {/* Top Header & Search Control Bar */}
      <div className="flex flex-col gap-4 bg-zinc-900 border border-zinc-800 p-4 sm:p-5 rounded-2xl shadow-xl relative z-30 shrink-0">
        
        {/* Title row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  Time Clock Sheet
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono font-bold">
                    Master Excel View
                  </span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">Filterable Excel-style master log of staff time clock punches, job labor, tasks, and breaks.</p>
              </div>
            </div>
          </div>

          {/* Action buttons (View mode, CSV Export, Add manual entry, Full screen) */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* View mode toggle */}
            <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800">
              <button 
                onClick={() => setViewMode('excel')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer",
                  viewMode === 'excel'
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-850"
                )}
              >
                <Table className="w-3.5 h-3.5" />
                Flat Excel Grid
              </button>
              <button 
                onClick={() => setViewMode('tree')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer",
                  viewMode === 'tree'
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-850"
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                Hierarchical Tree
              </button>
            </div>

            {/* Export CSV */}
            <button 
              onClick={handleExportCSV}
              className="flex px-3.5 py-2 bg-zinc-950 hover:bg-zinc-800 text-zinc-200 hover:text-white font-bold rounded-xl border border-zinc-800 transition items-center gap-1.5 cursor-pointer text-xs shadow-sm"
              title="Download CSV spreadsheet file"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              Export CSV
            </button>

            {/* Add Manual Time Entry */}
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

        {/* Filter controls row */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-zinc-800/80">
          
          {/* Searchable Staff Member Filter */}
          <SearchableSelect
            options={staffSelectOptions}
            value={selectedStaffId}
            onChange={(val) => setSelectedStaffId(val || 'all')}
            getLabel={(opt) => opt.label}
            getValue={(opt) => opt.id}
            placeholder="Select Staff..."
            searchPlaceholder="Type to filter staff..."
            icon={<User className="w-4 h-4 text-zinc-400" />}
            className="min-w-[240px]"
            theme="indigo"
          />

          {/* Department Filter */}
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5">
            <Briefcase className="w-4 h-4 text-zinc-400 shrink-0" />
            <select 
              value={selectedDeptId} 
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="bg-transparent text-zinc-200 font-bold transition outline-none cursor-pointer pr-2 text-xs"
            >
              <option value="all" className="bg-zinc-900 text-white">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id} className="bg-zinc-900 text-white">{d.name}</option>
              ))}
            </select>
          </div>

          {/* Entry Type Filter */}
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5">
            <Clock className="w-4 h-4 text-zinc-400 shrink-0" />
            <select 
              value={selectedEntryType} 
              onChange={(e) => setSelectedEntryType(e.target.value)}
              className="bg-transparent text-zinc-200 font-bold transition outline-none cursor-pointer pr-2 text-xs"
            >
              <option value="all" className="bg-zinc-900 text-white">All Entry Types</option>
              <option value="Unallocated" className="bg-zinc-900 text-white">Unallocated Only</option>
              <option value="Job Labor" className="bg-zinc-900 text-white">Billed Job Labor Only</option>
              <option value="Shift" className="bg-zinc-900 text-white">Shift Punches Only</option>
              <option value="Break" className="bg-zinc-900 text-white">Breaks & Lunches Only</option>
            </select>
          </div>

          {/* Date Preset Filter */}
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-zinc-400 shrink-0" />
            <select 
              value={dateRangePreset} 
              onChange={(e) => setDateRangePreset(e.target.value as any)}
              className="bg-transparent text-zinc-200 font-bold transition outline-none cursor-pointer pr-2 text-xs"
            >
              <option value="pay_period" className="bg-zinc-900 text-white">By Pay Period</option>
              <option value="today" className="bg-zinc-900 text-white">Today</option>
              <option value="yesterday" className="bg-zinc-900 text-white">Yesterday</option>
              <option value="current_week" className="bg-zinc-900 text-white">Current Payroll Week</option>
              <option value="prev_week" className="bg-zinc-900 text-white">Previous Payroll Week</option>
              <option value="30_days" className="bg-zinc-900 text-white">Last 30 Days</option>
              <option value="custom" className="bg-zinc-900 text-white">Custom Date Range</option>
              <option value="all" className="bg-zinc-900 text-white">All History</option>
            </select>
          </div>

          {/* Pay Period Stepper Pill Widget */}
          {dateRangePreset === 'pay_period' && (
            <div className="flex items-center gap-2.5 bg-zinc-950/90 border border-zinc-800 rounded-full px-4 py-1 shadow-inner select-none transition-all">
              <button 
                onClick={() => setOffsetWeeks(w => w - 1)}
                className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800/80 rounded-full transition cursor-pointer"
                title="Previous Pay Period"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <div className="flex flex-col items-center px-2">
                <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 leading-none">PAY PERIOD</span>
                <span className="text-xs font-bold text-white font-mono leading-tight mt-0.5">{currentPayPeriod.label}</span>
              </div>

              <button 
                onClick={() => setOffsetWeeks(w => w + 1)}
                className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800/80 rounded-full transition cursor-pointer"
                title="Next Pay Period"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {offsetWeeks !== 0 && (
                <button
                  onClick={() => setOffsetWeeks(0)}
                  className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-indigo-400 transition cursor-pointer ml-1"
                  title="Reset to current week"
                >
                  Current
                </button>
              )}
            </div>
          )}

          {/* Custom Date Pickers */}
          {dateRangePreset === 'custom' && (
            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1 text-xs">
              <span className="text-zinc-500 font-bold">From</span>
              <input 
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-transparent text-white font-mono outline-none border-b border-zinc-700 px-1"
              />
              <span className="text-zinc-500 font-bold">To</span>
              <input 
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-transparent text-white font-mono outline-none border-b border-zinc-700 px-1"
              />
            </div>
          )}

          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search Staff, Job #, Customer, Task, or Notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition text-white placeholder:text-zinc-500 text-xs"
            />
          </div>
        </div>

        {/* Aggregate Metric KPI Cards (4 clean metrics) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-800/80">
          <div 
            onClick={() => setSelectedEntryType('all')}
            className={cn(
              "p-3 rounded-xl border transition cursor-pointer select-none",
              selectedEntryType === 'all'
                ? "bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/30"
                : "bg-zinc-950/60 border-zinc-850 hover:border-zinc-750"
            )}
            title="Click to view all entries"
          >
            <span className="text-[9px] uppercase font-black tracking-widest text-zinc-500 block">Total Shift Hours</span>
            <div className="text-base font-bold font-mono text-white mt-1">
              {formatDecimalHours(kpiMetrics.totalShiftMs)}
            </div>
          </div>

          <div 
            onClick={() => setSelectedEntryType(prev => prev === 'Book Time' ? 'all' : 'Book Time')}
            className={cn(
              "p-3 rounded-xl border transition cursor-pointer select-none",
              selectedEntryType === 'Book Time'
                ? "bg-emerald-500/15 border-emerald-500/60 ring-2 ring-emerald-500/30"
                : "bg-zinc-950/60 border-zinc-850 hover:border-zinc-750 hover:bg-zinc-950"
            )}
            title="Click to filter Book Time Completed entries"
          >
            <span className="text-[9px] uppercase font-black tracking-widest text-zinc-500 block">Book Time Completed</span>
            <div className="text-base font-bold font-mono text-emerald-400 mt-1">
              {formatDecimalHours(kpiMetrics.totalBookTimeMs)}
            </div>
          </div>

          <div 
            onClick={() => setSelectedEntryType(prev => prev === 'Job Labor' ? 'all' : 'Job Labor')}
            className={cn(
              "p-3 rounded-xl border transition cursor-pointer select-none",
              selectedEntryType === 'Job Labor'
                ? "bg-indigo-500/15 border-indigo-500/60 ring-2 ring-indigo-500/30"
                : "bg-zinc-950/60 border-zinc-850 hover:border-zinc-750 hover:bg-zinc-950"
            )}
            title="Click to filter Hourly Job Labor entries"
          >
            <span className="text-[9px] uppercase font-black tracking-widest text-zinc-500 block">Hourly Task Labor</span>
            <div className="text-base font-bold font-mono text-indigo-400 mt-1">
              {formatDecimalHours(kpiMetrics.totalBilledMs)}
            </div>
          </div>

          <div 
            onClick={() => setSelectedEntryType(prev => (prev === 'Unallocated' || prev === 'Gap') ? 'all' : 'Unallocated')}
            className={cn(
              "p-3 rounded-xl border transition cursor-pointer select-none",
              (selectedEntryType === 'Unallocated' || selectedEntryType === 'Gap')
                ? "bg-rose-500/15 border-rose-500/60 ring-2 ring-rose-500/30"
                : "bg-zinc-950/60 border-zinc-850 hover:border-zinc-750 hover:bg-zinc-950"
            )}
            title="Click to filter Unallocated entries"
          >
            <span className="text-[9px] uppercase font-black tracking-widest text-zinc-500 block">Unallocated Time</span>
            <div className="text-base font-bold font-mono text-rose-400 mt-1">
              {formatDecimalHours(kpiMetrics.totalGapMs)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className={cn("overflow-x-auto custom-scrollbar", isFullScreen ? "max-h-[calc(100vh-14rem)] overflow-y-auto" : "")}>
          
          {/* VIEW MODE 1: FLAT EXCEL GRID */}
          {viewMode === 'excel' && (
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="bg-zinc-950 text-zinc-400 uppercase text-[9px] font-black tracking-widest border-b border-zinc-800 sticky top-0 z-20">
                <tr>
                  <th className="px-4 py-3.5" style={{ width: '9%' }}>Date</th>
                  <th className="px-4 py-3.5" style={{ width: '16%' }}>Staff Member</th>
                  <th className="px-4 py-3.5" style={{ width: '10%' }}>Entry Type</th>
                  <th className="px-4 py-3.5" style={{ width: '15%' }}>Job # & Customer</th>
                  <th className="px-4 py-3.5" style={{ width: '16%' }}>Task / Activity</th>
                  <th className="px-4 py-3.5 font-mono" style={{ width: '9%' }}>Start Time</th>
                  <th className="px-4 py-3.5 font-mono" style={{ width: '9%' }}>End Time</th>
                  <th className="px-4 py-3.5 text-right font-mono" style={{ width: '8%' }}>Hours</th>
                  <th className="px-4 py-3.5" style={{ width: '12%' }}>Notes / Status</th>
                  <th className="px-4 py-3.5 text-right" style={{ width: '6%' }}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850 text-xs">
                {displayExcelRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-12 py-16 text-center text-zinc-500 italic">
                      No time clock records found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  displayExcelRows.map((row) => {
                    let typeBadgeClass = "bg-zinc-800 text-zinc-300 border-zinc-700";
                    let typeIcon = <Clock className="w-3 h-3" />;

                    if (row.entryType === 'Shift') {
                      typeBadgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                      typeIcon = <Check className="w-3 h-3" />;
                    } else if (row.entryType === 'Job Labor') {
                      typeBadgeClass = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
                      typeIcon = <Wrench className="w-3 h-3" />;
                    } else if (row.entryType === 'Break') {
                      typeBadgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                      typeIcon = <Coffee className="w-3 h-3" />;
                    } else if (row.entryType === 'Unallocated' || (row.entryType as string) === 'Gap') {
                      typeBadgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                      typeIcon = <AlertCircle className="w-3 h-3" />;
                    }

                    return (
                      <tr key={row.id} className="hover:bg-zinc-850/60 transition-colors">
                        {/* Date */}
                        <td className="px-4 py-3 font-mono font-bold text-zinc-300 whitespace-nowrap">
                          {row.dateStr}
                        </td>

                        {/* Staff Member */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-bold text-white flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-zinc-800 text-[10px] flex items-center justify-center font-bold text-zinc-300 shrink-0">
                              {row.staffName[0]}
                            </div>
                            <div className="min-w-0">
                              <span className="truncate block leading-tight">{row.staffName}</span>
                              <span className="text-[9px] text-zinc-500 uppercase font-bold block">{row.departmentName}</span>
                            </div>
                          </div>
                        </td>

                        {/* Entry Type */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border", typeBadgeClass)}>
                            {typeIcon}
                            {row.entryType}
                          </span>
                        </td>

                        {/* Job & Customer */}
                        <td className="px-4 py-3">
                          {row.jobId ? (
                            <a 
                              href={`/business/${tenantId}/jobs/${row.jobId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-indigo-400 hover:text-indigo-300 underline decoration-dotted truncate block"
                            >
                              {row.jobNumber} {row.customerName && `• ${row.customerName}`}
                            </a>
                          ) : (
                            <span className="text-zinc-400 font-medium truncate block">
                              {row.jobNumber} {row.customerName !== '--' && `• ${row.customerName}`}
                            </span>
                          )}
                        </td>

                        {/* Task / Activity */}
                        <td className="px-4 py-3 font-medium text-zinc-200 truncate max-w-[200px]" title={row.taskName}>
                          {row.taskName}
                        </td>

                        {/* Start Time */}
                        <td className="px-4 py-3 font-mono text-zinc-300 whitespace-nowrap">
                          {formatClockTime(row.startTime)}
                        </td>

                        {/* End Time */}
                        <td className="px-4 py-3 font-mono text-zinc-300 whitespace-nowrap">
                          {row.endTime ? (
                            formatClockTime(row.endTime)
                          ) : row.isLive ? (
                            <span className="text-emerald-400 animate-pulse font-bold uppercase text-[9px]">Active</span>
                          ) : (
                            '--:--'
                          )}
                        </td>

                        {/* Hours (Decimal) */}
                        <td className="px-4 py-3 text-right font-mono font-bold text-white whitespace-nowrap">
                          {formatDecimalHours(row.durationMs)}
                        </td>

                        {/* Notes / Location */}
                        <td className="px-4 py-3 truncate max-w-[220px]" title={row.locationOrNotes}>
                          {(() => {
                            const rawNote = (row.locationOrNotes || '').trim();
                            const isDefault = !rawNote || 
                              rawNote === '--' || 
                              rawNote === 'Tech clocked in but not active on job' || 
                              rawNote === 'Paid Break' || 
                              rawNote === 'Unpaid Break' ||
                              rawNote === 'Remote';

                            if (isDefault) {
                              return (
                                <span className="text-zinc-500 italic text-[11px]">
                                  {rawNote || '--'}
                                </span>
                              );
                            }

                            return (
                              <span className="text-white font-bold text-xs not-italic bg-zinc-800/90 px-2.5 py-1 rounded-lg border border-zinc-700/80 inline-block truncate max-w-full shadow-md text-zinc-100">
                                {rawNote}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              onClick={() => setEditingSession(row.rawSession)}
                              className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded transition"
                              title="Edit time session"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDeleteSession(row.sessionId, row.staffName)}
                              className="p-1 bg-zinc-800/60 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 rounded transition"
                              title="Delete shift session"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {/* VIEW MODE 2: HIERARCHICAL TREE GRID */}
          {viewMode === 'tree' && (
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-zinc-950 text-zinc-400 uppercase text-[9px] font-black tracking-widest border-b border-zinc-800 sticky top-0 z-20">
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
                          <td className="px-6 py-4 text-zinc-400 font-medium">
                            {day.activeTechCount} Technicians Active
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-white">
                            {formatDecimalHours(day.totalClockedMs)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-indigo-400">
                            {formatDecimalHours(day.totalBilledMs)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-amber-500">
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

                        {/* LEVEL 2: DAY TECHNICIANS */}
                        {isDayExpanded && day.sessions.map(session => {
                          const isSessionExpanded = expandedSessions.has(session.id);
                          const tech = staff.find(st => st.id === session.userId || st.userId === session.userId);
                          const dept = departments.find(d => d.id === tech?.departmentId);
                          const displayName = tech ? `${tech.firstName} ${tech.lastName}`.trim() : (session.userName || 'Unknown Staff');
                          
                          const totalMs = calculateSessionMs(session);
                          const breakMs = calculateBreaksMs(session);
                          const workMs = Math.max(0, totalMs - breakMs);

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

                              {/* LEVEL 3: TIMELINE */}
                              {isSessionExpanded && (
                                <tr key={`timeline-${session.id}`}>
                                  <td colSpan={8} className="px-12 py-4 bg-zinc-950/20 border-l-4 border-indigo-500/70">
                                    <div className="p-4 rounded-xl bg-zinc-950/50 border border-zinc-850 space-y-4 max-w-4xl">
                                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                                        <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Chronological Shift Timeline logs</span>
                                        {session.isRemote && (
                                          <span className="flex items-center gap-1 text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded uppercase font-bold">
                                            <MapPin className="w-3 h-3" /> Remote Shift
                                          </span>
                                        )}
                                      </div>

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
                                                <div className={cn(
                                                  "w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                                                  circleColor
                                                )}>
                                                  {iconNode}
                                                </div>

                                                <div className="flex flex-col gap-1 min-w-0">
                                                  <span className="text-[10px] font-bold text-zinc-400 font-mono block leading-none">
                                                    {new Date(event.timeStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    {event.timeEnd && ` - ${new Date(event.timeEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                                    {!event.timeEnd && (event.type === 'labor' || event.type === 'break') && " - ACTIVE NOW"}
                                                  </span>

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

                                                  {event.notes && (
                                                    <p className="text-[10px] text-zinc-400 italic mt-1 bg-zinc-900/60 p-2 rounded border border-zinc-800 max-w-lg">
                                                      "{event.notes}"
                                                    </p>
                                                  )}

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
                                                          className="text-[9px] font-bold text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
                                                        >
                                                          <Edit2 className="w-3 h-3 text-zinc-500" />
                                                          {event.notes ? "Edit Gap Note" : "Write Explanatory Gap Note"}
                                                        </button>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              </div>

                                              {eventDuration > 0 && (
                                                <span className="font-mono font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded shrink-0">
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
          )}

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
