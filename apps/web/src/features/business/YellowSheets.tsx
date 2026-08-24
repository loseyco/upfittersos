import { useEffect, useMemo, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase/config';
import {
  FileSpreadsheet, Clock, User,
  Search, ChevronDown, ChevronRight, ChevronLeft, Calendar,
  RotateCcw, FileText, Check, ShieldCheck, Tag, Sliders, Edit3, X, Percent, Plus, Save,
  History, Building2, ExternalLink, Printer
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { resolvePermissions } from '../../lib/auth/permissions';
import { SearchableSelect } from './SearchableSelect';

// Yellow Sheets Labor Payout Breakdown - Updated 2026-07-30 T10:01
interface YellowSheetsProps {
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

const isTaskCompleted = (t: any) => {
  if (!t) return false;
  if (t.completed === true || t.isCompleted === true) return true;
  const s = (t.status || '').toLowerCase().trim();
  return ['completed', 'complete', 'qc', 'qc complete', 'ready for qc', 'ready_for_qc', 'closed', 'done'].includes(s);
};

const safeString = (val: any, fallback: string = ''): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    if (typeof val.name === 'string') return val.name;
    if (typeof val.title === 'string') return val.title;
    if (typeof val.label === 'string') return val.label;
    const parts = [val.year, val.make, val.model].filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
    if (val.vin) return `VIN: ${val.vin}`;
  }
  return fallback;
};

const formatVehicleInfo = (job: any, vehiclesList: any[] = []): string => {
  if (!job) return 'N/A';

  // 1. Direct explicit strings on job doc
  if (typeof job.vehicleYearMakeModel === 'string' && job.vehicleYearMakeModel.trim()) return job.vehicleYearMakeModel.trim();
  if (typeof job.vehicleName === 'string' && job.vehicleName.trim()) return job.vehicleName.trim();
  if (typeof job.vehicleDescription === 'string' && job.vehicleDescription.trim()) return job.vehicleDescription.trim();
  if (typeof job.vehicleDetails === 'string' && job.vehicleDetails.trim()) return job.vehicleDetails.trim();
  if (typeof job.vehicleInfo === 'string' && job.vehicleInfo.trim()) return job.vehicleInfo.trim();

  // 2. Direct year, make, model fields on job doc
  const directParts = [job.year || job.vehicleYear, job.make || job.vehicleMake, job.model || job.vehicleModel].filter(Boolean);
  if (directParts.length > 0) return directParts.join(' ');

  // 3. job.vehicle property (string OR object)
  if (job.vehicle) {
    if (typeof job.vehicle === 'string' && job.vehicle.trim()) return job.vehicle.trim();
    if (typeof job.vehicle === 'object') {
      const { year, make, model, vin, name, description } = job.vehicle;
      if (name && typeof name === 'string' && name.trim()) return name.trim();
      if (description && typeof description === 'string' && description.trim()) return description.trim();
      const parts = [year, make, model].filter(Boolean);
      if (parts.length > 0) return parts.join(' ');
      if (vin) return `VIN: ${vin}`;
    }
  }

  // 4. Linked vehicle lookup by vehicleId / vehicleVin / vin from vehicles collection
  const targetVinOrId = job.vehicleId || job.vehicleVin || job.vin;
  if (targetVinOrId && Array.isArray(vehiclesList) && vehiclesList.length > 0) {
    const found = vehiclesList.find(v => v.id === targetVinOrId || v.vin === targetVinOrId || v.vehicleId === targetVinOrId);
    if (found) {
      const parts = [found.year, found.make, found.model].filter(Boolean);
      if (parts.length > 0) return parts.join(' ');
      if (found.name) return found.name;
      if (found.description) return found.description;
      if (found.vin) return `VIN: ${found.vin}`;
    }
  }

  // 5. Fallback VIN directly on job
  if (job.vehicleVin) return `VIN: ${job.vehicleVin}`;
  if (job.vin) return `VIN: ${job.vin}`;

  return 'N/A';
};

const getTaskCategoryDisplay = (t: any): string => {
  if (!t) return '';
  const cat = t.taskCategory || t.taskGroup || t.category || t.categoryName || t.departmentName || t.department || '';
  if (cat && typeof cat === 'string' && cat.trim() && cat.toUpperCase() !== 'UNCATEGORIZED') {
    return cat.trim();
  }
  return '';
};

const calculateTaskActualDuration = (t: any, secondsMap?: Record<string, number>): { totalSec: number; formattedStr: string; actualHours: number } => {
  if (!t) return { totalSec: 0, formattedStr: '0m', actualHours: 0 };

  let totalSec = 0;

  // 1. Primary: exact task ID match
  if (secondsMap && t.id && secondsMap[t.id]) {
    totalSec = secondsMap[t.id];
  }

  // 2. Secondary: inline timeSessions on task
  if (totalSec === 0 && Array.isArray(t.timeSessions) && t.timeSessions.length > 0) {
    t.timeSessions.forEach((s: any) => {
      const dur = parseFloat(s.duration || s.elapsedTime || s.seconds || s.timeSpent || '0');
      if (dur > 0) {
        totalSec += (dur < 300 && s.minutes ? dur * 60 : dur);
      }
    });
  }

  // 3. Tertiary: task document actual time attributes
  if (totalSec === 0) {
    const rawActual = parseFloat(t.actualTime || t.actualHours || t.actualDuration || t.duration || t.totalDuration || t.clockedHours || t.timeSpent || '0');
    if (rawActual > 0) {
      totalSec = rawActual < 50 ? rawActual * 3600 : rawActual;
    }
  }

  if (totalSec <= 0) return { totalSec: 0, formattedStr: '0m', actualHours: 0 };

  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.round((totalSec % 3600) / 60);
  const actualHours = totalSec / 3600;

  let formattedStr = '';
  if (hrs > 0 && mins > 0) formattedStr = `${hrs}h ${mins}m`;
  else if (hrs > 0) formattedStr = `${hrs}h`;
  else formattedStr = `${mins}m`;

  return { totalSec, formattedStr, actualHours };
};

const formatTaskStatusLabel = (t: any, hasTimeOnIt: boolean = false): { label: string; statusCode: 'completed' | 'in_progress' | 'not_started'; isQCComplete: boolean; isReadyForQC: boolean; isCompleted: boolean } => {
  if (!t) return { label: 'NOT STARTED', statusCode: 'not_started', isQCComplete: false, isReadyForQC: false, isCompleted: false };

  const rawStatus = (t.status || '').toString().toLowerCase().trim();
  const isCompleted = t.completed === true || t.isCompleted === true || ['completed', 'complete', 'qc', 'ready for qc', 'ready_for_qc', 'qc complete', 'qc_complete', 'closed', 'done'].includes(rawStatus);

  if (isCompleted) {
    return { label: 'COMPLETED', statusCode: 'completed', isQCComplete: true, isReadyForQC: false, isCompleted: true };
  }

  if (hasTimeOnIt || rawStatus.includes('progress') || rawStatus.includes('working') || rawStatus.includes('started')) {
    return { label: 'IN PROGRESS', statusCode: 'in_progress', isQCComplete: false, isReadyForQC: false, isCompleted: false };
  }

  return { label: 'NOT STARTED', statusCode: 'not_started', isQCComplete: false, isReadyForQC: false, isCompleted: false };
};

export const resolveTaskNotes = (t: any) => {
  if (!t) return { taskNotes: '', staffNotes: '', payrollNotes: '', allNotesSummary: '' };

  const isUnassigned = t.jobId === 'unassigned' || t.id?.toString().startsWith('unassigned_');

  // 1. Task Notes / Work Order Specs (Only for real work orders - never for unassigned shop labor)
  const taskNotesList: string[] = [];
  if (!isUnassigned) {
    [
      t.instructions,
      t.instruction,
      t.specNotes,
      t.specs,
      t.spec,
      t.taskSpec,
      t.taskNotes
    ].forEach(cand => {
      const s = safeString(cand, '').trim();
      if (s && !taskNotesList.includes(s) && !taskNotesList.some(n => n.includes(s))) {
        taskNotesList.push(s);
      }
    });
  }

  // 2. Staff Notes / Technician Remarks (Work logs, completion notes, time session remarks, shop labor descriptions)
  const staffNotesList: string[] = [];

  const candidateStaffNotes = isUnassigned
    ? [
        t.staffNotes,
        t.staffNote,
        t.notes,
        t.note,
        t.description,
        t.taskDescription,
        t.details,
        t.techNotes,
        t.techNote,
        t.completionNotes,
        t.completionNote,
        t.comments,
        t.comment
      ]
    : [
        t.staffNotes,
        t.staffNote,
        t.techNotes,
        t.techNote,
        t.completionNotes,
        t.completionNote,
        t.workNote,
        t.workNotes,
        t.comments,
        t.comment,
        t.description,
        t.notes,
        t.note
      ];

  candidateStaffNotes.forEach(cand => {
    const s = safeString(cand, '').trim();
    if (s && !taskNotesList.includes(s) && !staffNotesList.includes(s) && !staffNotesList.some(n => n.includes(s))) {
      staffNotesList.push(s);
    }
  });

  // Time session remarks & unassigned clock-in notes
  if (Array.isArray(t.timeSessions) && t.timeSessions.length > 0) {
    t.timeSessions.forEach((s: any) => {
      const sessNote = safeString(s.notes || s.note || s.comment || s.completionNote || s.workNote, '').trim();
      const sName = s.staffName || s.techName || s.userName || '';
      if (sessNote && !taskNotesList.includes(sessNote) && sessNote !== 'Unassigned shop task clock-in') {
        const entry = sName ? `${sName}: "${sessNote}"` : `"${sessNote}"`;
        if (!staffNotesList.some(n => n.includes(sessNote))) {
          staffNotesList.push(entry);
        }
      }
    });
  }

  if (Array.isArray(t.workLogs) && t.workLogs.length > 0) {
    t.workLogs.forEach((w: any) => {
      const logNote = safeString(w.notes || w.note || w.comment || w.text, '').trim();
      const wName = w.staffName || w.userName || '';
      if (logNote && !taskNotesList.includes(logNote)) {
        const entry = wName ? `${wName}: "${logNote}"` : `"${logNote}"`;
        if (!staffNotesList.some(n => n.includes(logNote))) {
          staffNotesList.push(entry);
        }
      }
    });
  }

  if (Array.isArray(t.blockers) && t.blockers.length > 0) {
    t.blockers.forEach((b: any) => {
      const bMsg = safeString(b.message || b.reason || b.note || '', '').trim();
      if (bMsg && !staffNotesList.some(n => n.includes(bMsg))) {
        staffNotesList.push(`[Blocker] ${bMsg}`);
      }
    });
  }

  // 3. Payroll Notes
  const payrollNotes = safeString(t.payrollNotes || t.payrollNote || t.payrollRemarks, '');

  const resolvedTaskNotes = taskNotesList.join('\n');
  const resolvedStaffNotes = staffNotesList.join('\n');

  // Combined notes for Staff Labor & Payout Report
  const combinedParts: string[] = [];
  if (resolvedStaffNotes) {
    combinedParts.push(resolvedStaffNotes);
  }
  if (resolvedTaskNotes && resolvedTaskNotes !== resolvedStaffNotes) {
    combinedParts.push(`Spec: ${resolvedTaskNotes}`);
  }
  if (payrollNotes) {
    combinedParts.push(`[Payroll] ${payrollNotes}`);
  }

  return {
    taskNotes: resolvedTaskNotes,
    staffNotes: resolvedStaffNotes,
    payrollNotes,
    allNotesSummary: combinedParts.join('\n')
  };
};

// Helper to color task rows based on efficiency vs. book time (red/yellow/green/yellow/red theme - ultra subtle 50% dimmed)
export const getTaskRowColorStyles = (bookHours?: number | null, actualHours?: number | null, defaultBg: string = '#ffffff') => {
  const bH = typeof bookHours === 'number' ? bookHours : parseFloat(bookHours as any || '0');
  const aH = typeof actualHours === 'number' ? actualHours : parseFloat(actualHours as any || '0');

  if (!bH || bH <= 0 || !aH || aH <= 0) {
    return { backgroundColor: defaultBg, WebkitPrintColorAdjust: 'exact' as const, printColorAdjust: 'exact' as const };
  }

  const eff = Math.round((bH / aH) * 100);

  // 1. Audit / Needs Review (<60% Over Time or >200% Under-Clocked or <2m on >=0.5h task) -> Soft Rose
  if (eff < 60 || eff > 200 || (aH < 0.05 && bH >= 0.5)) {
    return {
      backgroundColor: '#fff1f2', // Soft Pastel Rose (~50% dimmed)
      WebkitPrintColorAdjust: 'exact' as const,
      printColorAdjust: 'exact' as const
    };
  }

  // 2. On Target / Sweet Spot (85% - 115%) -> Soft Mint Green
  if (eff >= 85 && eff <= 115) {
    return {
      backgroundColor: '#f0fdf4', // Soft Pastel Mint Green (~50% dimmed)
      WebkitPrintColorAdjust: 'exact' as const,
      printColorAdjust: 'exact' as const
    };
  }

  // 3. Moderate Variance (60% - 84% Behind or 116% - 200% Ahead) -> Soft Amber / Yellow
  return {
    backgroundColor: '#fefce8', // Soft Pastel Yellow (~50% dimmed)
    WebkitPrintColorAdjust: 'exact' as const,
    printColorAdjust: 'exact' as const
  };
};

// On-Screen Dark Glassmorphic Row Pace Style Helper (For Live Screen UI)
const getScreenTaskRowStyles = (bookHours: number | undefined, actualHours: number | undefined, isEven: boolean) => {
  const b = Number(bookHours) || 0;
  const a = Number(actualHours) || 0;
  const baseClass = isEven ? 'bg-zinc-900/60' : 'bg-zinc-950/40';

  if (b <= 0 && a <= 0) {
    return { className: baseClass, badge: null };
  }
  if (a <= 0) {
    return { className: baseClass, badge: null };
  }

  const eff = Math.round((b / a) * 100);

  // Severe Under-Clocked: worked <2 mins on a >=0.5h task, or eff > 200%
  if ((b >= 0.5 && a < 0.033) || eff > 200) {
    return {
      className: 'bg-rose-950/20 hover:bg-rose-950/30 border-l-2 border-l-rose-500',
      badge: { text: eff > 200 ? `${eff}% Rushed / Review` : '<2m Under-Clocked', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' }
    };
  }
  // Severe Delay / Bottleneck (<60%)
  if (eff < 60) {
    return {
      className: 'bg-rose-950/20 hover:bg-rose-950/30 border-l-2 border-l-rose-500',
      badge: { text: `${eff}% Bottleneck`, color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' }
    };
  }
  // On-Target Sweet Spot (85%–115%)
  if (eff >= 85 && eff <= 115) {
    return {
      className: 'bg-emerald-950/20 hover:bg-emerald-950/30 border-l-2 border-l-emerald-500',
      badge: { text: `${eff}% On Target`, color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' }
    };
  }
  // Pace Variance (60–84% or 116–200%)
  return {
    className: 'bg-amber-950/15 hover:bg-amber-950/25 border-l-2 border-l-amber-500',
    badge: { text: `${eff}% Variance`, color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' }
  };
};

export function YellowSheets({ tenantId }: YellowSheetsProps) {
  // Firestore Subscriptions State
  const [jobs, setJobs] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [vehiclesList, setVehiclesList] = useState<any[]>([]);
  const [tasksMap, setTasksMap] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Date Range State (Default: Last Week - Mon to Sun)
  const [dateMode, setDateMode] = useState<'last_week' | 'this_week' | 'today' | 'last_30' | 'all' | 'custom'>('last_week');
  
  const getInitialDateRange = () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon
    // Last week Monday
    const prevMon = new Date(now);
    const diffToMon = (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + 7;
    prevMon.setDate(now.getDate() - diffToMon);
    prevMon.setHours(0, 0, 0, 0);

    // Last week Sunday
    const prevSun = new Date(prevMon);
    prevSun.setDate(prevMon.getDate() + 6);
    prevSun.setHours(23, 59, 59, 999);

    return { start: prevMon, end: prevSun };
  };

  const navigate = useNavigate();

  const openJobDetails = (jobId: string) => {
    if (!jobId || jobId === 'unassigned') return;
    navigate(`/business/${tenantId}/job/${jobId}`);
  };

  const openTaskDetails = (jobId: string, taskId: string) => {
    if (!jobId || !taskId || jobId === 'unassigned') return;
    navigate(`/business/${tenantId}/task/${jobId}/${taskId}`);
  };

  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>(getInitialDateRange());
  const [offsetWeeks, setOffsetWeeks] = useState<number>(-1);

  const getPayPeriodDates = (offset: number) => {
    const now = new Date();
    const day = now.getDay();
    const diffToMon = now.getDate() - (day === 0 ? 6 : day - 1);
    const mon = new Date(now.setDate(diffToMon));
    mon.setHours(0, 0, 0, 0);
    mon.setDate(mon.getDate() + (offset * 7));

    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    sun.setHours(23, 59, 59, 999);

    return { start: mon, end: sun };
  };

  const handleStepPayPeriod = (direction: 'prev' | 'next' | 'current') => {
    let newOffset = offsetWeeks;
    if (direction === 'prev') newOffset -= 1;
    else if (direction === 'next') newOffset += 1;
    else if (direction === 'current') newOffset = 0;

    setOffsetWeeks(newOffset);
    setDateMode('last_week');
    setDateRange(getPayPeriodDates(newOffset));
  };

  const formatPayPeriodRangeText = (start: Date | null, end: Date | null) => {
    if (!start || !end) return '';
    const sMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const sDay = start.getDate();
    const eMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const eDay = end.getDate();
    return `${sMonth} ${sDay} - ${eMonth} ${eDay}`;
  };

  // Filter States
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  const [selectedDept, setSelectedDept] = useState<string>('upfitters');
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'completed_only' | 'all' | 'in_progress' | 'not_started'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedJobIds, setExpandedJobIds] = useState<Record<string, boolean>>({});
  const [expandedTaskSessions, setExpandedTaskSessions] = useState<Record<string, boolean>>({});
  const [printJobId, setPrintJobId] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<'jobs' | 'staff' | 'cover_only' | 'full'>('jobs');
  const [triageFilter, setTriageFilter] = useState<'all' | 'bottlenecks' | 'under_clocked' | 'splits'>('all');

  const [editingShiftSession, setEditingShiftSession] = useState<any>(null);
  const [savingShiftSession, setSavingShiftSession] = useState<boolean>(false);

  const [addingShiftStaff, setAddingShiftStaff] = useState<any>(null);
  const [newShiftDate, setNewShiftDate] = useState<string>('');
  const [newShiftClockIn, setNewShiftClockIn] = useState<string>('07:30');
  const [newShiftClockOut, setNewShiftClockOut] = useState<string>('16:00');
  const [newShiftBreakMins, setNewShiftBreakMins] = useState<number>(30);
  const [newShiftNotes, setNewShiftNotes] = useState<string>('');
  const [savingNewShift, setSavingNewShift] = useState<boolean>(false);

  const [deletingShiftSession, setDeletingShiftSession] = useState<any>(null);
  const [deletingShiftLoading, setDeletingShiftLoading] = useState<boolean>(false);

  // Multi-Tech Custom Split Adjustment Modal State
  const [editingSplitTask, setEditingSplitTask] = useState<{ task: any; jobId: string } | null>(null);
  const [customSplitPcts, setCustomSplitPcts] = useState<Record<string, number>>({});
  const [savingSplit, setSavingSplit] = useState<boolean>(false);

  // Book Time Adjustment Modal State
  const [editingBookTimeTask, setEditingBookTimeTask] = useState<{ task: any; jobId: string; hours: number } | null>(null);
  const [newBookHours, setNewBookHours] = useState<number>(0);
  const [savingBookHours, setSavingBookHours] = useState<boolean>(false);

  // Task Notes Editing Modal State
  const [editingTaskNotes, setEditingTaskNotes] = useState<{ task: any; jobId: string } | null>(null);
  const [editTaskSpecNote, setEditTaskSpecNote] = useState<string>('');
  const [editStaffTechNote, setEditStaffTechNote] = useState<string>('');
  const [editPayrollNote, setEditPayrollNote] = useState<string>('');
  const [savingTaskNotes, setSavingTaskNotes] = useState<boolean>(false);

  // Add Task Modal State
  const [addingTaskForJob, setAddingTaskForJob] = useState<{ jobId: string; jobNumber: string; customerName: string } | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [newTaskCategory, setNewTaskCategory] = useState<string>('UPFITTING');
  const [newTaskBookHours, setNewTaskBookHours] = useState<number>(1.0);
  const [newTaskTechIds, setNewTaskTechIds] = useState<string[]>([]);
  const [newTaskNotes, setNewTaskNotes] = useState<string>('');
  const [savingNewTask, setSavingNewTask] = useState<boolean>(false);

  // Audit Trail Log State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);

  // Subscribe to audit logs (Filtered to today onwards for production audit trail reset)
  useEffect(() => {
    if (!tenantId) return;
    const unsubAudit = onSnapshot(collection(db, `businesses/${tenantId}/audit_logs`), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const filtered = list.filter(l => {
        if (l.category !== 'yellow_sheets') return false;
        const ts = parseSafeDate(l.timestamp);
        return ts ? ts >= todayStart : false;
      });
      filtered.sort((a, b) => (parseSafeDate(b.timestamp)?.getTime() || 0) - (parseSafeDate(a.timestamp)?.getTime() || 0));
      setAuditLogs(filtered);
    });
    return () => unsubAudit();
  }, [tenantId]);

  const recordAuditLog = async (action: string, details: string, jobId?: string, jobNumber?: string, taskId?: string) => {
    try {
      const userEmail = auth.currentUser?.email || 'Admin';
      const userDisp = auth.currentUser?.displayName || '';
      const matched = staff.find(s => s.userId === auth.currentUser?.uid || s.email === userEmail);
      const userName = matched ? `${matched.firstName || matched.name || ''} ${matched.lastName || ''}`.trim() : (userDisp || userEmail);

      await addDoc(collection(db, `businesses/${tenantId}/audit_logs`), {
        category: 'yellow_sheets',
        action,
        details,
        jobId: jobId || '',
        jobNumber: jobNumber || '',
        taskId: taskId || '',
        changedBy: userName,
        changedByEmail: userEmail,
        timestamp: new Date()
      });
    } catch (e) {
      console.error('Failed to log Yellow Sheets audit entry:', e);
    }
  };

  // Current Staff Permission Resolution
  const currentUserEmail = auth.currentUser?.email || '';
  const currentUserUid = auth.currentUser?.uid || '';
  const currentStaff = useMemo(() => {
    return staff.find(s => s.userId === currentUserUid || (s.email && s.email.toLowerCase() === currentUserEmail.toLowerCase()));
  }, [staff, currentUserUid, currentUserEmail]);

  const canEdit = useMemo(() => {
    // If no staff record bound or loading, default to true for authenticated users
    if (!currentStaff) return true;

    // Check super admin or owner/admin/manager/payroll/foreman/lead roles
    const roleLower = (currentStaff.role || '').toLowerCase();
    const deptLower = (currentStaff.department || '').toLowerCase();
    
    if (currentStaff.isSuperAdmin === true || currentStaff.isAdmin === true) return true;

    // Resolve permissions from department + individual staff overrides
    const deptObj = currentStaff.departmentId ? staff.find(s => s.id === currentStaff.departmentId) : null;
    const resolved = resolvePermissions(deptObj?.permissions || {}, currentStaff.permissions || {});

    // If explicitly revoked via permission matrix/override, deny edit access
    if (resolved['yellow_sheets.manage'] === false) return false;

    // Allow edit access if granted explicitly or if user has manager/lead/office/admin/timeclock/jobs management access
    const isGranted = resolved['yellow_sheets.manage'] === true || 
                      resolved['timeclock.manage'] === true || 
                      resolved['jobs.manage'] === true;

    const isManagerOrLead = roleLower.includes('admin') || 
                            roleLower.includes('manager') || 
                            roleLower.includes('owner') || 
                            roleLower.includes('payroll') || 
                            roleLower.includes('foreman') || 
                            roleLower.includes('lead') || 
                            roleLower.includes('tech') || 
                            deptLower.includes('office') || 
                            deptLower.includes('admin');

    // Default to true for shop staff unless explicitly revoked
    return isGranted || isManagerOrLead || (resolved as Record<string, boolean>)['yellow_sheets.manage'] !== false;
  }, [currentStaff, staff]);

  // Subscribe to jobs, staff, vehicles, and time_sessions
  const [timeSessionsList, setTimeSessionsList] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId) return;

    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      setLoading(false);
    });

    const unsubStaff = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), (snap) => {
      setVehiclesList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubTimeSessions = onSnapshot(collection(db, `businesses/${tenantId}/time_sessions`), (snap) => {
      setTimeSessionsList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubDepts = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      setDepartmentsList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    return () => {
      unsubJobs();
      unsubStaff();
      unsubVehicles();
      unsubTimeSessions();
      unsubDepts();
    };
  }, [tenantId]);

  // Aggregated actual clocked seconds and detailed start/stop segments per task
  const { taskActualSecondsMap, taskTimeSegmentsMap, taskWorkerActualSecondsMap } = useMemo(() => {
    const secMap: Record<string, number> = {};
    const workerSecMap: Record<string, number> = {};
    const segMap: Record<string, Array<{
      sessionId: string;
      staffId: string;
      userName: string;
      start: Date;
      end: Date;
      durationSec: number;
      isOvernightOrLong: boolean;
      isOpen: boolean;
    }>> = {};

    // Count task title occurrences per job to detect duplicate titles (e.g. multiple "Light Head" tasks)
    jobs.forEach(j => {
      const jTasks = Array.isArray(j.tasks) ? j.tasks : (tasksMap[j.id] || []);
      jTasks.forEach((t: any) => {
        const tTitle = safeString(t.name || t.title || t.taskTitle, '').toLowerCase().trim();
        if (tTitle) {
          const key = `${j.id}_${tTitle}_count`;
          secMap[key] = (secMap[key] || 0) + 1;
        }
      });
    });

    const nowMs = Date.now();

    timeSessionsList.forEach(session => {
      const sUser = session.userName || session.staffName || session.userEmail || 'Tech';
      const staffId = session.staffId || session.userId || '';
      const sUserNorm = sUser.trim().toLowerCase();

      // Find staff in staff list for robust worker identification
      const matchingStaffDoc = staff.find(s => 
        (staffId && (s.id === staffId || s.userId === staffId || s.uid === staffId)) ||
        (sUserNorm && (
          (s.name && s.name.trim().toLowerCase() === sUserNorm) ||
          (`${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase() === sUserNorm)
        ))
      );

      const sessionJobs = session.jobs || [];

      sessionJobs.forEach((seg: any) => {
        if (!seg) return;
        const startMs = seg.start?.toDate ? seg.start.toDate().getTime() : (parseSafeDate(seg.start)?.getTime() || 0);
        if (!startMs) return;

        const startDate = new Date(startMs);
        // Isolate task time spent strictly to the selected pay period date range
        if (dateRange.start && startDate < dateRange.start) return;
        if (dateRange.end && startDate > dateRange.end) return;

        let endMs = nowMs;
        let isOpen = false;

        if (seg.end) {
          endMs = seg.end.toDate ? seg.end.toDate().getTime() : (parseSafeDate(seg.end)?.getTime() || nowMs);
        } else if (session.status === 'active' || session.status === 'on_break') {
          endMs = nowMs;
          isOpen = true;
        } else {
          const clockOutVal = session.clockOut?.timestamp || session.clockOut;
          if (clockOutVal) {
            endMs = clockOutVal.toDate ? clockOutVal.toDate().getTime() : (parseSafeDate(clockOutVal)?.getTime() || startMs);
          } else {
            isOpen = true;
          }
        }

        const durationSec = Math.max(0, (endMs - startMs) / 1000);
        const endDate = new Date(endMs);

        const isCrossMidnight = startDate.toDateString() !== endDate.toDateString();
        const isOvernightOrLong = durationSec > 14 * 3600 || (isCrossMidnight && durationSec > 4 * 3600);

        const segmentObj = {
          sessionId: session.id,
          staffId,
          userName: sUser,
          start: startDate,
          end: endDate,
          durationSec,
          isOvernightOrLong,
          isOpen
        };

        const keys: string[] = [];
        if (seg.taskId) keys.push(seg.taskId);
        if (seg.id && !keys.includes(seg.id)) keys.push(seg.id);
        if (seg.task_id && !keys.includes(seg.task_id)) keys.push(seg.task_id);

        keys.forEach(k => {
          secMap[k] = (secMap[k] || 0) + durationSec;

          const workerKeys = new Set<string>();
          if (staffId) workerKeys.add(staffId);
          if (sUserNorm) workerKeys.add(sUserNorm);
          if (matchingStaffDoc) {
            if (matchingStaffDoc.id) workerKeys.add(matchingStaffDoc.id);
            if (matchingStaffDoc.userId) workerKeys.add(matchingStaffDoc.userId);
            if (matchingStaffDoc.uid) workerKeys.add(matchingStaffDoc.uid);
            const fullName = `${matchingStaffDoc.firstName || ''} ${matchingStaffDoc.lastName || ''}`.trim().toLowerCase();
            if (fullName) workerKeys.add(fullName);
          }

          workerKeys.forEach(wk => {
            workerSecMap[`${k}_${wk}`] = (workerSecMap[`${k}_${wk}`] || 0) + durationSec;
          });

          if (!segMap[k]) segMap[k] = [];
          segMap[k].push(segmentObj);
        });
      });
    });

    return { taskActualSecondsMap: secMap, taskTimeSegmentsMap: segMap, taskWorkerActualSecondsMap: workerSecMap };
  }, [timeSessionsList, jobs, tasksMap, staff, dateRange]);

  // Helper to extract detailed time segments for a specific task
  const getTaskSegments = (t: any, _job: any, segmentsMap: Record<string, any[]>) => {
    const list: any[] = [];
    const addedKeys = new Set<string>();

    const tId = t.id;
    if (tId && segmentsMap[tId]) {
      segmentsMap[tId].forEach(s => {
        const k = `${s.sessionId}_${s.start.getTime()}`;
        if (!addedKeys.has(k)) {
          addedKeys.add(k);
          list.push(s);
        }
      });
    }



    if (Array.isArray(t.timeSessions)) {
      t.timeSessions.forEach((s: any) => {
        const sIn = parseSafeDate(s.clockIn || s.timestamp || s.startTime || s.start);
        const sOut = parseSafeDate(s.clockOut || s.endTime || s.end);
        if (!sIn) return;

        const endD = sOut || new Date();
        const durationSec = Math.max(0, (endD.getTime() - sIn.getTime()) / 1000);
        const k = `inline_${sIn.getTime()}`;

        if (!addedKeys.has(k)) {
          addedKeys.add(k);
          const isCrossMidnight = sIn.toDateString() !== endD.toDateString();
          const sessNote = safeString(s.notes || s.note || s.comment || s.completionNote || s.workNote, '');
          list.push({
            sessionId: s.id || 'inline',
            userName: s.userName || s.techName || t.completedBy || 'Tech',
            start: sIn,
            end: endD,
            durationSec,
            isOvernightOrLong: durationSec > 10 * 3600 || (isCrossMidnight && durationSec > 4 * 3600),
            isOpen: !sOut,
            note: sessNote
          });
        }
      });
    }

    return list.sort((a, b) => b.start.getTime() - a.start.getTime());
  };

  // Active Staff Filtered List (Excludes archived, inactive, and deleted staff)
  const activeStaff = useMemo(() => {
    return staff
      .filter(s => {
        if (!s) return false;
        if (s.isArchived === true || s.archived === true) return false;
        if (s.active === false || s.isActive === false) return false;
        const statusLower = (s.status || '').toLowerCase();
        if (statusLower === 'archived' || statusLower === 'inactive' || statusLower === 'deleted' || statusLower === 'former') return false;
        return true;
      })
      .sort((a, b) => {
        const nameA = `${a.firstName || a.name || ''} ${a.lastName || ''}`.trim();
        const nameB = `${b.firstName || b.name || ''} ${b.lastName || ''}`.trim();
        return nameA.localeCompare(nameB);
      });
  }, [staff]);

  // Subscribe to tasks for all jobs
  const activeJobIds = useMemo(() => {
    return jobs.map(j => j.id).filter(Boolean);
  }, [jobs]);

  useEffect(() => {
    if (!tenantId || activeJobIds.length === 0) return;

    const unsubs: (() => void)[] = [];
    activeJobIds.forEach(jobId => {
      const unsub = onSnapshot(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), (snap) => {
        const taskList = snap.docs.map(d => ({ id: d.id, jobId, ...d.data() }));
        setTasksMap(prev => ({ ...prev, [jobId]: taskList }));
      });
      unsubs.push(unsub);
    });

    return () => unsubs.forEach(u => u());
  }, [tenantId, activeJobIds]);

  // Handle Preset Date Range Toggles
  const applyDatePreset = (preset: 'last_week' | 'this_week' | 'today' | 'last_30' | 'all') => {
    setDateMode(preset);
    const now = new Date();

    if (preset === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      setDateRange({ start, end });
    } else if (preset === 'this_week') {
      const day = now.getDay();
      const diffToMon = day === 0 ? 6 : day - 1;
      const start = new Date(now);
      start.setDate(now.getDate() - diffToMon);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      setDateRange({ start, end });
    } else if (preset === 'last_week') {
      setDateRange(getInitialDateRange());
    } else if (preset === 'last_30') {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      setDateRange({ start, end });
    } else if (preset === 'all') {
      setDateRange({ start: null, end: null });
    }
  };

  // Helper to resolve Staff details and handle multi-tech labor assignments/splits strictly by Database User/Staff ID
  const resolveTaskWorkers = (t: any, job: any): { workers: { id: string; name: string; pct: number; splitHours: number }[]; closedByManager: string } => {
    const findActiveStaff = (sId?: string, sName?: string) => {
      if (!sId && !sName) return null;
      const sIdNorm = (sId || '').trim().toLowerCase();
      const sNameNorm = (sName || '').trim().toLowerCase();

      // 1. Strict primary lookup: Database ID / userId on ACTIVE staff
      if (sIdNorm) {
        const found = staff.find(s => !s.isArchived && s.status !== 'inactive' && (s.id.toLowerCase() === sIdNorm || (s.userId && s.userId.toLowerCase() === sIdNorm)));
        if (found) return found;
      }

      // 2. Exact full name match on ACTIVE staff only
      if (sNameNorm) {
        const found = staff.find(s => {
          if (s.isArchived || s.status === 'inactive') return false;
          const full1 = `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase();
          const full2 = (s.name || '').trim().toLowerCase();
          return full1 === sNameNorm || full2 === sNameNorm;
        });
        if (found) return found;
      }

      // 3. Fallback to active staff by first name only if unambiguous
      if (sNameNorm) {
        const activeMatches = staff.filter(s => !s.isArchived && s.status !== 'inactive' && (
          (s.firstName && s.firstName.trim().toLowerCase() === sNameNorm) ||
          (s.lastName && s.lastName.trim().toLowerCase() === sNameNorm)
        ));
        if (activeMatches.length === 1) return activeMatches[0];
        if (activeMatches.length > 1) {
          const upfitter = activeMatches.find(s => (s.department || '').toLowerCase().includes('upfit') || s.departmentId === 'GojhQmZXMBCw24fg3GNB');
          if (upfitter) return upfitter;
          return activeMatches[0];
        }
      }

      // 4. Exact ID fallback on any staff document (strictly by ID, NEVER by loose name to archived)
      if (sIdNorm) {
        const fallback = staff.find(s => s.id.toLowerCase() === sIdNorm || (s.userId && s.userId.toLowerCase() === sIdNorm));
        if (fallback) return fallback;
      }

      return null;
    };

    const isOfficeOrManager = (sId?: string, sName?: string) => {
      if (!sId && !sName) return false;
      const found = findActiveStaff(sId, sName);
      if (found) {
        const role = (found.role || found.department || '').toLowerCase();
        return found.isManager === true || found.isOffice === true || ['office', 'manager', 'admin', 'super_admin', 'executive', 'director'].includes(role);
      }
      const nameLower = (sName || '').toLowerCase();
      return nameLower.includes('kathy') || nameLower.includes('couch') || nameLower.includes('admin') || nameLower.includes('manager');
    };

    const formatStaff = (sId?: string, sName?: string): { id: string; name: string } | null => {
      if (!sId && !sName) return null;
      const found = findActiveStaff(sId, sName);
      if (found) {
        return {
          id: found.id || found.userId || sId || '',
          name: `${found.firstName || found.name || ''} ${found.lastName || ''}`.trim()
        };
      }
      if (sName) return { id: sId || '', name: sName };
      return null;
    };

    const workerMap = new Map<string, { id: string; name: string }>();

    // 1. Check t.assignedStaff (Array of objects or strings)
    if (Array.isArray(t.assignedStaff) && t.assignedStaff.length > 0) {
      t.assignedStaff.forEach((s: any) => {
        if (typeof s === 'string') {
          const parsed = formatStaff(undefined, s);
          if (parsed && !isOfficeOrManager(parsed.id, parsed.name)) {
            workerMap.set(parsed.name, parsed);
          }
        } else if (s && typeof s === 'object') {
          const parsed = formatStaff(s.id || s.uid, s.name || s.displayName || `${s.firstName || ''} ${s.lastName || ''}`.trim());
          if (parsed && !isOfficeOrManager(parsed.id, parsed.name)) {
            workerMap.set(parsed.name, parsed);
          }
        }
      });
    }

    // 2. Check t.assignedStaffIds / t.assignedStaffNames
    if (Array.isArray(t.assignedStaffIds) && t.assignedStaffIds.length > 0) {
      t.assignedStaffIds.forEach((id: string) => {
        const parsed = formatStaff(id, undefined);
        if (parsed && !isOfficeOrManager(parsed.id, parsed.name)) {
          workerMap.set(parsed.name, parsed);
        }
      });
    }
    if (Array.isArray(t.assignedStaffNames) && t.assignedStaffNames.length > 0) {
      t.assignedStaffNames.forEach((name: string) => {
        const parsed = formatStaff(undefined, name);
        if (parsed && !isOfficeOrManager(parsed.id, parsed.name)) {
          workerMap.set(parsed.name, parsed);
        }
      });
    }

    // 3. Check t.assignedTo / t.assignedTech
    const singleAssigned = formatStaff(t.assignedTo || t.assignedStaffId || t.assignedTechId || t.techId, t.assignedToName || t.assignedTechName || t.assignedTech || t.techName);
    if (singleAssigned && !isOfficeOrManager(singleAssigned.id, singleAssigned.name)) {
      workerMap.set(singleAssigned.name, singleAssigned);
    }

    // 4. Check time sessions or workers
    if (Array.isArray(t.timeSessions) && t.timeSessions.length > 0) {
      t.timeSessions.forEach((sess: any) => {
        const parsed = formatStaff(sess.staffId || sess.userId || sess.techId, sess.staffName || sess.techName || sess.userName);
        if (parsed && !isOfficeOrManager(parsed.id, parsed.name)) {
          workerMap.set(parsed.name, parsed);
        }
      });
    }

    // 5. Check completedBy if no assigned techs found
    const completedParsed = formatStaff(t.completedByStaffId || t.completedBy, t.completedByStaffName || (typeof t.completedBy === 'string' ? t.completedBy : ''));
    if (workerMap.size === 0 && completedParsed && !isOfficeOrManager(completedParsed.id, completedParsed.name)) {
      workerMap.set(completedParsed.name, completedParsed);
    }

    // 6. Check jobTech if still empty
    const jobTechName = job?.assignedTechName || job?.techName || job?.assignedTech;
    const jobTechId = job?.assignedTechId || job?.assignedTechStaffId;
    const jobTechParsed = formatStaff(jobTechId, jobTechName);
    if (workerMap.size === 0 && jobTechParsed && !isOfficeOrManager(jobTechParsed.id, jobTechParsed.name)) {
      workerMap.set(jobTechParsed.name, jobTechParsed);
    }

    // Manager close-out identification
    let closedByManager = '';
    const closedParsed = formatStaff(t.closedByStaffId || t.closedBy || t.approvedBy || t.qcCompletedBy, t.closedByStaffName || (typeof t.closedBy === 'string' ? t.closedBy : ''));
    if (completedParsed && isOfficeOrManager(completedParsed.id, completedParsed.name)) {
      closedByManager = completedParsed.name;
    } else if (closedParsed && isOfficeOrManager(closedParsed.id, closedParsed.name)) {
      closedByManager = closedParsed.name;
    }

    let finalWorkers = Array.from(workerMap.values());
    if (finalWorkers.length === 0) {
      finalWorkers = [{ id: '', name: completedParsed?.name || jobTechName || 'Technician' }];
    }

    // Collect all actual clock-ins for this task
    const clockedNames = new Set<string>();
    const tSegments = getTaskSegments(t, job, taskActualSecondsMap ? taskTimeSegmentsMap : {});
    tSegments.forEach((seg: any) => {
      if (seg.userName) clockedNames.add(seg.userName.trim().toLowerCase());
    });
    if (Array.isArray(t.timeSessions)) {
      t.timeSessions.forEach((sess: any) => {
        const name = sess.staffName || sess.techName || sess.userName;
        if (name) clockedNames.add(name.trim().toLowerCase());
      });
    }

    // RULE: If any staff actually clocked into this task, exclude assigned staff who DID NOT clock into it
    if (clockedNames.size > 0) {
      const clockedWorkers = finalWorkers.filter(w => {
        const wNameLower = (w.name || '').trim().toLowerCase();
        return Array.from(clockedNames).some(cn => cn === wNameLower || cn.includes(wNameLower) || wNameLower.includes(cn));
      });
      if (clockedWorkers.length > 0) {
        finalWorkers = clockedWorkers;
      }
    }

    const totalBookHours = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0');
    
    // Check if customSplit / manualSplit exists on task
    const customSplit = t.customSplit || t.manualSplit || null; // e.g. { 'Adrian Benitez': 70, 'Chris Auney': 30 }

    // Check actual clocked time sessions for time-ratio split
    let totalClockedSec = 0;
    const workerClockedSec: Record<string, number> = {};
    if (Array.isArray(t.timeSessions) && t.timeSessions.length > 0) {
      t.timeSessions.forEach((sess: any) => {
        const name = sess.staffName || sess.techName || sess.userName;
        const dur = parseFloat(sess.duration || sess.elapsedTime || '0');
        if (name && dur > 0) {
          workerClockedSec[name] = (workerClockedSec[name] || 0) + dur;
          totalClockedSec += dur;
        }
      });
    }

    const workersWithSplit = finalWorkers.map(w => {
      let pct = 100 / finalWorkers.length; // Default equal

      if (customSplit && typeof customSplit === 'object') {
        const matchedPct = customSplit[w.name] ?? customSplit[w.id];
        if (typeof matchedPct === 'number' && !isNaN(matchedPct)) {
          pct = matchedPct;
        }
      } else if (totalClockedSec > 0 && workerClockedSec[w.name]) {
        pct = (workerClockedSec[w.name] / totalClockedSec) * 100;
      }

      const splitHours = (totalBookHours * pct) / 100;

      return {
        ...w,
        pct: Math.round(pct),
        splitHours
      };
    });

    return {
      workers: workersWithSplit,
      closedByManager: (closedByManager && !workersWithSplit.some(w => w.name === closedByManager)) ? closedByManager : ''
    };
  };

  // Master Flattened & Filtered Task Dataset
  const allFilteredTasks = useMemo(() => {
    const result: any[] = [];

    // Combine subcollection tasks AND embedded job.tasks arrays AND unassigned tasks/sessions
    const combinedTasksMap: Record<string, any[]> = { ...tasksMap };
    jobs.forEach(j => {
      if (Array.isArray(j.tasks) && j.tasks.length > 0) {
        const existing = combinedTasksMap[j.id] || [];
        const existingIds = new Set(existing.map((t: any) => t.id));
        const embedded = j.tasks
          .filter((t: any) => t && (t.id || t.name || t.title) && !existingIds.has(t.id))
          .map((t: any, idx: number) => ({ id: t.id || `embedded_${idx}`, jobId: j.id, ...t }));
        combinedTasksMap[j.id] = [...existing, ...embedded];
      }
    });

    // Ingest unassigned clock-in segments from timeSessionsList
    const unassignedTasksFromSessions: any[] = [];
    const unassignedKeys = new Set<string>();

    timeSessionsList.forEach(session => {
      const sUser = session.userName || session.staffName || session.userEmail || 'Tech';
      const sessionJobs = session.jobs || [];

      sessionJobs.forEach((seg: any) => {
        if (!seg) return;
        const isUnassigned = !seg.id || seg.id === 'unassigned' || seg.jobId === 'unassigned' || (seg.name && seg.name.toLowerCase().includes('unassigned')) || (seg.taskName && seg.taskName.toLowerCase().includes('unassigned'));

        if (isUnassigned) {
          const rawNote = seg.notes || seg.taskName || seg.name || '';
          const hasSpecificNote = rawNote && rawNote !== 'Unassigned shop task clock-in' && rawNote.toLowerCase() !== 'unassigned';
          const isLongDesc = (seg.taskName && seg.taskName.length > 25) || (seg.name && seg.name.length > 25);
          const tTitle = isLongDesc 
            ? (seg.category || seg.department || 'Shop Labor') 
            : (seg.taskName || seg.name || 'General Labor');

          const key = `unassigned_${tTitle.toLowerCase().trim()}_${rawNote.slice(0, 30).toLowerCase().trim()}_${sUser.toLowerCase().trim()}`;
          if (!unassignedKeys.has(key)) {
            unassignedKeys.add(key);
            unassignedTasksFromSessions.push({
              id: key,
              jobId: 'unassigned',
              name: tTitle,
              taskTitle: tTitle,
              taskGroup: seg.category || seg.department || 'UNCATEGORIZED',
              bookTime: parseFloat(seg.bookTime || '0'),
              completed: true,
              completedAt: parseSafeDate(seg.end || seg.start || session.clockOut),
              completedBy: sUser,
              timeSessions: [{
                clockIn: parseSafeDate(seg.start),
                clockOut: parseSafeDate(seg.end || session.clockOut),
                userName: sUser,
                notes: hasSpecificNote ? rawNote : ''
              }],
              staffNotes: hasSpecificNote ? rawNote : '',
              notes: '',
              specNotes: '',
              instructions: ''
            });
          }
        }
      });
    });

    if (unassignedTasksFromSessions.length > 0) {
      const existingUnassigned = combinedTasksMap['unassigned'] || [];
      const existingIds = new Set(existingUnassigned.map((t: any) => t.id));
      const newUnassigned = unassignedTasksFromSessions.filter(t => !existingIds.has(t.id));
      combinedTasksMap['unassigned'] = [...existingUnassigned, ...newUnassigned];
    }

    // 2. Identify Job IDs that have completed task activity in the selected date range
    const activeJobIdsWithCompletedInRange = new Set<string>();

    Object.entries(combinedTasksMap).forEach(([jobId, tasks]) => {
      const hasCompletedInRange = tasks.some(t => {
        const completed = isTaskCompleted(t);
        if (!completed) return false;
        const cDate = parseSafeDate(t.completedAt || t.completedDate || t.finishedAt);
        if (cDate) {
          const afterStart = !dateRange.start || cDate >= dateRange.start;
          const beforeEnd = !dateRange.end || cDate <= dateRange.end;
          if (afterStart && beforeEnd) return true;
        }
        if (Array.isArray(t.timeSessions) && t.timeSessions.length > 0) {
          return t.timeSessions.some((s: any) => {
            const d = parseSafeDate(s.clockIn || s.timestamp || s.date || s.startTime || s.clockOut);
            return d && (!dateRange.start || d >= dateRange.start) && (!dateRange.end || d <= dateRange.end);
          });
        }
        return false;
      });

      if (hasCompletedInRange || (!dateRange.start && !dateRange.end)) {
        activeJobIdsWithCompletedInRange.add(jobId);
      }
    });

    // 3. Process tasks for active jobs
    Object.entries(combinedTasksMap).forEach(([jobId, tasks]) => {
      let job = jobs.find(j => j.id === jobId);
      if (!job && (jobId === 'unassigned' || jobId === 'UNASSIGNED' || jobId === 'none')) {
        job = {
          id: 'unassigned',
          jobNumber: 'UNASSIGNED',
          customerName: 'Unassigned Shop Tasks',
          title: 'Unassigned & Overhead Work',
          vehicleInfo: 'N/A',
          status: 'Active'
        };
      }
      if (!job) return;

      // Skip jobs that had no completed task activity in this pay period
      if (!activeJobIdsWithCompletedInRange.has(jobId)) return;

      tasks.forEach(t => {
        const completed = isTaskCompleted(t);
        const compDate = parseSafeDate(t.completedAt || t.completedDate || t.finishedAt);

        // Check if this task was completed within the selected pay period date range
        let completedInPayPeriod = false;
        if (completed) {
          if (!dateRange.start && !dateRange.end) {
            completedInPayPeriod = true;
          } else if (compDate) {
            const afterStart = !dateRange.start || compDate >= dateRange.start;
            const beforeEnd = !dateRange.end || compDate <= dateRange.end;
            if (afterStart && beforeEnd) completedInPayPeriod = true;
          }
          if (!completedInPayPeriod && Array.isArray(t.timeSessions) && t.timeSessions.length > 0) {
            completedInPayPeriod = t.timeSessions.some((s: any) => {
              const d = parseSafeDate(s.clockIn || s.timestamp || s.date || s.startTime || s.clockOut);
              return d && (!dateRange.start || d >= dateRange.start) && (!dateRange.end || d <= dateRange.end);
            });
          }
        }

        const { formattedStr: actualDurationStr, actualHours } = calculateTaskActualDuration(t, taskActualSecondsMap);
        const hasTimeOnIt = actualHours > 0 || (!!actualDurationStr && actualDurationStr !== '0m');
        const { label: statusLabel, statusCode, isQCComplete, isReadyForQC } = formatTaskStatusLabel(t, hasTimeOnIt);

        // Status Filter Routing
        if (statusFilter === 'completed_only' && !completedInPayPeriod) return;
        if (statusFilter === 'in_progress' && (completed || statusCode !== 'in_progress')) return;
        if (statusFilter === 'not_started' && (completed || statusCode !== 'not_started')) return;

        // Staff Filter (Intelligent Multi-Tech Labor Attribution)
        const { workers, closedByManager } = resolveTaskWorkers(t, job);

        // Department Filter Routing (defaults to 'upfitters')
        if (selectedDept !== 'all') {
          const dTarget = selectedDept.toLowerCase().trim();
          const tCat = safeString(t.taskGroup || t.category || t.categoryName || t.departmentName || t.department, '').toLowerCase();

          const workerDeptMatches = workers.some((w: any) => {
            const sObj = staff.find(s => s.id === w.id || s.userId === w.id || `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase() === (w.name || '').toLowerCase());
            if (!sObj) return false;
            const sDept = safeString(sObj.department || sObj.departmentName || sObj.departmentId, '').toLowerCase();
            return sDept.includes(dTarget) || (dTarget === 'upfitters' && (sDept.includes('upfit') || sDept.includes('shop') || sDept.includes('install')));
          });

          if (!workerDeptMatches) {
            if (dTarget === 'upfitters') {
              const isOtherDept = tCat.includes('graphic') || tCat.includes('fabricat') || tCat.includes('harness') || tCat.includes('office') || tCat.includes('parts');
              if (isOtherDept && !tCat.includes('upfit') && !tCat.includes('install')) return;
            } else if (!tCat.includes(dTarget)) {
              return;
            }
          }
        }
        
        let activeWorkerSplitHours = 0;

        if (selectedStaffId !== 'all') {
          const matchStaff = staff.find(s => s.id === selectedStaffId || s.userId === selectedStaffId);
          const filterName = matchStaff ? `${matchStaff.firstName || ''} ${matchStaff.lastName || ''}`.trim().toLowerCase() : '';

          const matchedWorker = workers.find(w => {
            const currentStaffId = (w.id || '').toLowerCase();
            const currentStaffName = (w.name || '').toLowerCase();
            return (currentStaffId && currentStaffId === selectedStaffId.toLowerCase()) || (filterName && currentStaffName.includes(filterName));
          });

          if (!matchedWorker) return;
          activeWorkerSplitHours = matchedWorker.splitHours;
        }

        // Search Filter (Job #, Customer, Vehicle, Task Title, Category, Notes, Tech Names)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const jobNum = safeString(job.jobNumber).toLowerCase();
          const cust = safeString(job.customerName || job.customer).toLowerCase();
          const veh = formatVehicleInfo(job, vehiclesList).toLowerCase();
          const title = safeString(t.name || t.title || t.taskTitle).toLowerCase();
          const cat = safeString(t.taskGroup || t.category || t.categoryName || t.departmentName || t.department).toLowerCase();
          const note = safeString(t.note || t.notes || t.description || t.techNote || t.staffNotes).toLowerCase();
          const techNames = workers.map(w => w.name.toLowerCase()).join(' ');
          const completedByStr = safeString(t.completedBy || t.completedByStaffName || t.assignedToName || t.assignedTechName || '').toLowerCase();

          const isMatch = jobNum.includes(q) || 
                          cust.includes(q) || 
                          veh.includes(q) || 
                          title.includes(q) || 
                          cat.includes(q) || 
                          note.includes(q) || 
                          techNames.includes(q) || 
                          completedByStr.includes(q);

          if (!isMatch) return;
        }

        let taskTitle = safeString(t.name || t.title || t.taskTitle, 'Task');
        if (taskTitle.length > 25 || jobId === 'unassigned') {
          if (taskTitle.length > 25) {
            const rawCat = safeString(t.taskGroup || t.category || t.categoryName || t.departmentName || t.department, 'Shop Labor');
            taskTitle = (rawCat && rawCat.toUpperCase() !== 'UNCATEGORIZED') ? rawCat : 'Shop Labor';
          }
        }
        const rawTaskCat = safeString(t.taskGroup || t.category || t.categoryName || t.departmentName || t.department, 'UNCATEGORIZED');
        const taskCategory = rawTaskCat.toUpperCase();
        const totalBookHours = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0');
        const bookHours = selectedStaffId !== 'all' ? activeWorkerSplitHours : totalBookHours;
        const { taskNotes, staffNotes, payrollNotes: resolvedPayrollNotes, allNotesSummary } = resolveTaskNotes(t);
        const payrollNotes = t.payrollNotes || resolvedPayrollNotes || '';
        let efficiencyPct: number | null = null;
        if (completed && actualHours > 0 && bookHours > 0) {
          efficiencyPct = Math.round((bookHours / actualHours) * 100);
        }
        const completedByNames = workers.map(w => w.name).join(', ');
        const taskSegments = getTaskSegments(t, job, taskTimeSegmentsMap);
        const hasOvernightSegment = taskSegments.some(s => s.isOvernightOrLong);

        result.push({
          id: t.id,
          jobId,
          jobNumber: safeString(job.jobNumber, 'N/A'),
          jobTitle: safeString(job.title || job.name, 'Upfit Job'),
          customerName: safeString(job.customerName || job.customer, 'N/A'),
          vehicleInfo: formatVehicleInfo(job, vehiclesList),
          jobStatus: safeString(job.status, 'In Progress'),
          taskTitle,
          taskCategory,
          totalBookHours,
          bookHours,
          actualDurationStr,
          actualHours,
          efficiencyPct,
          workers,
          completed,
          completedInPayPeriod,
          statusLabel,
          statusCode,
          isQCComplete,
          isReadyForQC,
          status: statusLabel,
          completedAt: parseSafeDate(t.completedAt || t.completedDate),
          completedBy: safeString(completedByNames, 'Technician'),
          closedByManager,
          taskNotes,
          staffNotes,
          payrollNotes,
          allNotesSummary,
          taskSegments,
          hasOvernightSegment,
          rawTask: t
        });
      });
    });

    return result;
  }, [jobs, tasksMap, staff, vehiclesList, dateRange, statusFilter, selectedStaffId, selectedDept, searchQuery, taskActualSecondsMap]);

  // Grouped Hierarchy: Job -> Task Category -> Tasks (Supports screen filtering & full job printout)
  const groupedJobsData = useMemo(() => {
    const jobMap: Record<string, { job: any; categories: Record<string, any[]>; allJobCategories: Record<string, any[]> }> = {};

    // 1. Map filtered tasks for screen display
    allFilteredTasks.forEach(t => {
      if (!jobMap[t.jobId]) {
        jobMap[t.jobId] = {
          job: {
            id: t.jobId,
            jobNumber: t.jobNumber,
            jobTitle: t.jobTitle,
            customerName: t.customerName,
            vehicleInfo: t.vehicleInfo,
            jobStatus: t.jobStatus
          },
          categories: {},
          allJobCategories: {}
        };
      }

      const catName = t.taskCategory;
      if (!jobMap[t.jobId].categories[catName]) {
        jobMap[t.jobId].categories[catName] = [];
      }

      jobMap[t.jobId].categories[catName].push(t);
    });

    // 2. Map complete task list per job for printing full Yellow Sheet
    Object.keys(jobMap).forEach(jId => {
      const jobObj = jobs.find(j => j.id === jId);
      if (!jobObj) return;

      const rawTasks = Array.isArray(jobObj.tasks) ? jobObj.tasks : (tasksMap[jId] || []);
      rawTasks.forEach((t: any, idx: number) => {
        const completed = isTaskCompleted(t);
        const { formattedStr: actualDurationStr, actualHours } = calculateTaskActualDuration(t, taskActualSecondsMap);
        const hasTimeOnIt = actualHours > 0 || (!!actualDurationStr && actualDurationStr !== '0m');
        const { label: statusLabel, statusCode } = formatTaskStatusLabel(t, hasTimeOnIt);
        const { workers } = resolveTaskWorkers(t, jobObj);
        const taskTitle = safeString(t.name || t.title || t.taskTitle, 'Task');
        const rawTaskCat = safeString(t.taskGroup || t.category || t.categoryName || t.departmentName || t.department, 'UNCATEGORIZED');
        const taskCategory = rawTaskCat.toUpperCase();
        const bookHours = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0');
        const { taskNotes, staffNotes, payrollNotes: resolvedPayrollNotes, allNotesSummary } = resolveTaskNotes(t);
        const payrollNotes = t.payrollNotes || resolvedPayrollNotes || '';
        const completedByNames = workers.map(w => w.name).join(', ');

        const printTaskObj = {
          id: t.id || `embedded_${idx}`,
          jobId: jId,
          taskTitle,
          taskCategory,
          bookHours,
          actualDurationStr: (actualHours > 0 ? `${actualHours.toFixed(1)}h` : (actualDurationStr && actualDurationStr !== '0m' ? actualDurationStr : '—')),
          actualHours,
          completed,
          statusLabel,
          statusCode,
          completedAt: parseSafeDate(t.completedAt || t.completedDate),
          completedBy: safeString(completedByNames, 'Technician'),
          taskNotes,
          staffNotes,
          payrollNotes,
          allNotesSummary
        };

        if (!jobMap[jId].allJobCategories[taskCategory]) {
          jobMap[jId].allJobCategories[taskCategory] = [];
        }
        jobMap[jId].allJobCategories[taskCategory].push(printTaskObj);
      });
    });

    return Object.values(jobMap);
  }, [allFilteredTasks, jobs, tasksMap, staff, vehiclesList, taskActualSecondsMap]);

  // Grouped Hierarchy: Staff Member -> Tasks (Supports printing individual payout reports)
  const groupedStaffData = useMemo(() => {
    const staffMap: Record<string, {
      staffId: string;
      staffName: string;
      tasks: any[];
      totalBookHours: number;
      totalActualHours: number;
      totalShiftHours?: number;
      shifts?: any[];
    }> = {};

    allFilteredTasks.forEach(task => {
      // For Staff Payout Sheets, strictly only include tasks completed in the selected timeline/pay period
      if (!task.completedInPayPeriod) return;

      // Find worker split info
      if (task.workers && task.workers.length > 0) {
        task.workers.forEach((w: any) => {
          // Filter by staff dropdown
          if (selectedStaffId !== 'all' && w.id !== selectedStaffId) {
            return;
          }

          if (!staffMap[w.id]) {
            staffMap[w.id] = {
              staffId: w.id,
              staffName: w.name,
              tasks: [],
              totalBookHours: 0,
              totalActualHours: 0,
              totalShiftHours: 0,
              shifts: []
            };
          }

          const wId = (w.id || '').toLowerCase();
          const wNameNorm = (w.name || '').trim().toLowerCase();
          const staffDoc = staff.find(s => 
            (wId && (s.id.toLowerCase() === wId || (s.userId && s.userId.toLowerCase() === wId))) ||
            (wNameNorm && (
              (s.name && s.name.trim().toLowerCase() === wNameNorm) ||
              (`${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase() === wNameNorm)
            ))
          );

          // Calculate actual hours for this specific worker on this task
          let workerActualSec = 0;

          if (task.id) {
            const possibleWorkerKeys = [w.id, wNameNorm];
            if (staffDoc) {
              if (staffDoc.id) possibleWorkerKeys.push(staffDoc.id);
              if (staffDoc.userId) possibleWorkerKeys.push(staffDoc.userId);
              if (staffDoc.uid) possibleWorkerKeys.push(staffDoc.uid);
              const fullName = `${staffDoc.firstName || ''} ${staffDoc.lastName || ''}`.trim().toLowerCase();
              if (fullName) possibleWorkerKeys.push(fullName);
            }

            for (const wk of possibleWorkerKeys) {
              if (wk && taskWorkerActualSecondsMap[`${task.id}_${wk}`]) {
                workerActualSec = taskWorkerActualSecondsMap[`${task.id}_${wk}`];
                break;
              }
            }
          }

          // Fallback 1: check taskSegments (from getTaskSegments) for matching worker segments
          if (workerActualSec === 0 && Array.isArray(task.taskSegments) && task.taskSegments.length > 0) {
            task.taskSegments.forEach((s: any) => {
              const sStaffId = (s.staffId || s.userId || '').toLowerCase();
              const sUserNorm = (s.userName || s.staffName || s.techName || '').trim().toLowerCase();
              let isMatch = false;
              if (wId && sStaffId && sStaffId === wId) isMatch = true;
              if (!isMatch && staffDoc) {
                if (staffDoc.id && sStaffId === staffDoc.id.toLowerCase()) isMatch = true;
                if (staffDoc.userId && sStaffId === staffDoc.userId.toLowerCase()) isMatch = true;
              }
              if (!isMatch && wNameNorm && sUserNorm) {
                if (sUserNorm === wNameNorm || sUserNorm.includes(wNameNorm) || wNameNorm.includes(sUserNorm)) isMatch = true;
              }
              if (isMatch) {
                workerActualSec += (s.durationSec || 0);
              }
            });
          }

          // Fallback 2: if task has inline timeSessions on rawTask
          if (workerActualSec === 0 && task.rawTask && Array.isArray(task.rawTask.timeSessions)) {
            task.rawTask.timeSessions.forEach((s: any) => {
              const sStaffId = (s.staffId || s.userId || s.techId || '').toLowerCase();
              const sUserNorm = (s.userName || s.staffName || s.techName || '').trim().toLowerCase();
              let isMatch = false;
              if (wId && sStaffId && sStaffId === wId) isMatch = true;
              if (!isMatch && staffDoc) {
                if (staffDoc.id && sStaffId === staffDoc.id.toLowerCase()) isMatch = true;
                if (staffDoc.userId && sStaffId === staffDoc.userId.toLowerCase()) isMatch = true;
              }
              if (!isMatch && wNameNorm && sUserNorm) {
                if (sUserNorm === wNameNorm || sUserNorm.includes(wNameNorm) || wNameNorm.includes(sUserNorm)) isMatch = true;
              }
              if (isMatch) {
                const sIn = parseSafeDate(s.clockIn || s.timestamp || s.startTime || s.start);
                const sOut = parseSafeDate(s.clockOut || s.endTime || s.end);
                if (sIn && sOut) {
                  workerActualSec += Math.max(0, (sOut.getTime() - sIn.getTime()) / 1000);
                } else {
                  const dur = parseFloat(s.duration || s.elapsedTime || s.seconds || s.timeSpent || '0');
                  if (dur > 0) {
                    workerActualSec += (dur < 300 && s.minutes ? dur * 60 : dur);
                  }
                }
              }
            });
          }

          // Fallback 3: If no segment-level match was found, but the task has actual time recorded (e.g. task.actualHours > 0)
          if (workerActualSec === 0 && task.actualHours > 0) {
            if (task.workers.length === 1) {
              workerActualSec = task.actualHours * 3600;
            } else {
              workerActualSec = (task.actualHours * 3600 * (w.pct || (100 / task.workers.length))) / 100;
            }
          }

          const workerActualHours = workerActualSec / 3600;

          staffMap[w.id].tasks.push({
            ...task,
            splitBookHours: w.splitHours,
            workerActualHours
          });
        });
      } else {
        // If task has no workers associated, put under 'unassigned' if selectedStaffId is 'all'
        if (selectedStaffId === 'all') {
          const unassignedId = 'unassigned';
          if (!staffMap[unassignedId]) {
            staffMap[unassignedId] = {
              staffId: unassignedId,
              staffName: 'Unassigned',
              tasks: [],
              totalBookHours: 0,
              totalActualHours: 0,
            };
          }

          staffMap[unassignedId].tasks.push({
            ...task,
            splitBookHours: task.bookHours,
            workerActualHours: task.actualHours
          });
        }
      }
    });

    // Sum totals per staff member (Earned Book Time strictly sums tasks completed in the selected pay period)
    Object.values(staffMap).forEach(group => {
      group.totalBookHours = group.tasks.reduce((sum, t) => sum + (t.completedInPayPeriod ? (t.splitBookHours || 0) : 0), 0);
      group.totalActualHours = group.tasks.reduce((sum, t) => sum + (t.workerActualHours || 0), 0);

      // Calculate total shift time on clock for staff member in the pay period
      const gStaffId = (group.staffId || '').toLowerCase();
      const gStaffName = (group.staffName || '').trim().toLowerCase();
      const staffDoc = staff.find(s => 
        (gStaffId && (s.id.toLowerCase() === gStaffId || (s.userId && s.userId.toLowerCase() === gStaffId))) ||
        (gStaffName && (
          (s.name && s.name.trim().toLowerCase() === gStaffName) ||
          (`${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase() === gStaffName)
        ))
      );

      let shiftSec = 0;
      const shiftsList: any[] = [];

      timeSessionsList.forEach(session => {
        const sStaffId = (session.staffId || session.userId || '').toLowerCase();
        const sUserNorm = (session.userName || session.staffName || session.userEmail || '').trim().toLowerCase();

        let isMatch = false;
        if (gStaffId && sStaffId && sStaffId === gStaffId) isMatch = true;
        if (!isMatch && staffDoc) {
          if (staffDoc.id && sStaffId === staffDoc.id.toLowerCase()) isMatch = true;
          if (staffDoc.userId && sStaffId === staffDoc.userId.toLowerCase()) isMatch = true;
        }
        if (!isMatch && gStaffName && sUserNorm) {
          if (sUserNorm === gStaffName || sUserNorm.includes(gStaffName) || gStaffName.includes(sUserNorm)) isMatch = true;
        }

        if (!isMatch) return;

        const cIn = parseSafeDate(session.clockIn?.timestamp || session.clockIn || session.createdAt);
        if (!cIn) return;

        if (dateRange.start && cIn < dateRange.start) return;
        if (dateRange.end && cIn > dateRange.end) return;

        const cOutVal = session.clockOut?.timestamp || session.clockOut;
        const cOut = parseSafeDate(cOutVal) || new Date();

        let dur = Math.max(0, (cOut.getTime() - cIn.getTime()) / 1000);
        let breakSec = 0;

        if (Array.isArray(session.breaks)) {
          session.breaks.forEach((b: any) => {
            if (b.isPaid === false || b.type === 'lunch') {
              const bStart = parseSafeDate(b.start);
              const bEnd = parseSafeDate(b.end) || cOut;
              if (bStart && bEnd) {
                const bDur = Math.max(0, (bEnd.getTime() - bStart.getTime()) / 1000);
                breakSec += bDur;
                dur -= bDur;
              }
            }
          });
        }

        const netDur = Math.max(0, dur);
        shiftSec += netDur;

        shiftsList.push({
          id: session.id,
          date: cIn,
          dateStr: cIn.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' }),
          clockInStr: cIn.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          clockOutStr: (session.status === 'active' || session.status === 'on_break') ? 'Active (On Clock)' : cOut.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          breakDurationMin: Math.round(breakSec / 60),
          shiftHours: netDur / 3600,
          status: session.status || 'closed',
          notes: session.notes || session.note || ''
        });
      });

      (group as any).totalShiftHours = shiftSec / 3600;
      (group as any).shifts = shiftsList.sort((a, b) => a.date.getTime() - b.date.getTime());
    });

    // Sort by name
    return Object.values(staffMap).sort((a, b) => a.staffName.localeCompare(b.staffName));
  }, [allFilteredTasks, selectedStaffId, taskWorkerActualSecondsMap, staff, timeSessionsList, dateRange]);

  // Construct active filters summary label to show on print layouts
  const activeFiltersSummary = useMemo(() => {
    const parts: string[] = [];
    // Only warn about date filtering if status filter is completed_only (since otherwise all tasks are printed)
    if (statusFilter === 'completed_only' && (dateRange.start || dateRange.end)) {
      const startStr = dateRange.start ? dateRange.start.toLocaleDateString() : 'Start';
      const endStr = dateRange.end ? dateRange.end.toLocaleDateString() : 'End';
      parts.push(`Date: ${startStr} - ${endStr}`);
    }
    if (selectedStaffId !== 'all') {
      const member = staff.find(s => s.id === selectedStaffId);
      parts.push(`Staff: ${member ? `${member.firstName} ${member.lastName}` : selectedStaffId}`);
    }
    if (selectedDept !== 'all') {
      parts.push(`Dept: ${selectedDept}`);
    }
    if (searchQuery.trim()) {
      parts.push(`Search: "${searchQuery}"`);
    }
    if (statusFilter !== 'all') {
      parts.push(`Status: ${statusFilter.toUpperCase().replace('_', ' ')}`);
    }
    return parts.join(' | ');
  }, [dateRange, selectedStaffId, selectedDept, searchQuery, statusFilter, staff]);

  // Construct active filters summary label for staff payout print layouts (excludes status/staff/dept/date filters)
  const activeStaffFiltersSummary = useMemo(() => {
    const parts: string[] = [];
    if (searchQuery.trim()) {
      parts.push(`Search: "${searchQuery}"`);
    }
    return parts.join(' | ');
  }, [searchQuery]);

  // Helper to determine if a technician belongs to the selected department for top payout cards and cover sheet
  const isTechInSelectedDept = (w: any, targetDept: string, staffList: any[]) => {
    if (targetDept === 'all') return true;

    const dTarget = targetDept.toLowerCase().trim();
    const wNameLower = (w.name || '').toLowerCase();
    
    // Explicit exclusion for Dan Urban when viewing Upfitters department (Dan is dedicated Fabrication)
    if (dTarget === 'upfitters' && (
      wNameLower.includes('daniel urban') || 
      wNameLower.includes('dan urban')
    )) {
      return false;
    }

    const sObj = staffList.find(s => 
      s.id === w.id || 
      s.userId === w.id || 
      `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase() === wNameLower
    );

    if (sObj) {
      const deptDoc = sObj.departmentId ? departmentsList.find(d => d.id === sObj.departmentId) : null;
      const sDept = safeString(sObj.department || sObj.departmentName || deptDoc?.name || sObj.role || sObj.title, '').toLowerCase();

      const isNonUpfitterStaff = sDept.includes('office') || 
                                 sDept.includes('admin') || 
                                 sDept.includes('owner') || 
                                 sDept.includes('management') || 
                                 sDept.includes('payroll') || 
                                 sDept.includes('fabrication') ||
                                 sDept.includes('graphics') ||
                                 sDept.includes('parts') ||
                                 sDept.includes('facility') ||
                                 sDept.includes('sales');

      if (dTarget === 'upfitters') {
        if (isNonUpfitterStaff && !sDept.includes('upfit') && !sDept.includes('install') && !sDept.includes('foreman') && !sDept.includes('shop')) {
          return false;
        }
        return true;
      }

      return sDept.includes(dTarget);
    }

    return dTarget === 'all' || dTarget === 'upfitters';
  };

  // Per-Tech Book Hours Summary for the selected time period
  const techPayrollSummary = useMemo(() => {
    const map: Record<string, { id: string; name: string; bookHours: number; actualHours: number; tasksCompleted: number; jobsSet: Set<string> }> = {};

    allFilteredTasks.forEach(t => {
      if (!t.completedInPayPeriod) return; // ONLY count tasks completed IN THIS PAY PERIOD for payroll payout

      const tActual = t.actualHours || 0;
      const workerCount = (t.workers || []).length || 1;

      (t.workers || []).forEach((w: any) => {
        if (!w.name) return;

        // Exclude archived staff from technician payout summary
        const sObj = staff.find(s => 
          s.id === w.id || 
          s.userId === w.id || 
          `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase() === (w.name || '').toLowerCase().trim()
        );
        if (sObj?.isArchived) return;

        // Exclude non-upfitters (like Dan Urban and Patrick Losey) from top Payout Breakdown Cards when filtering by Upfitters
        if (!isTechInSelectedDept(w, selectedDept, staff)) return;

        const key = w.id || w.name;
        if (!map[key]) {
          map[key] = {
            id: w.id || key,
            name: w.name,
            bookHours: 0,
            actualHours: 0,
            tasksCompleted: 0,
            jobsSet: new Set<string>()
          };
        }
        const splitPct = w.pct ? w.pct / 100 : 1 / workerCount;
        map[key].bookHours += w.splitHours || 0;
        map[key].actualHours += (tActual * splitPct);
        map[key].tasksCompleted += 1;
        map[key].jobsSet.add(t.jobId);
      });
    });

    return Object.values(map)
      .filter(tp => tp.bookHours > 0 || tp.actualHours > 0)
      .filter(tp => {
        const sObj = staff.find(s => s.id === tp.id || `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase() === tp.name.toLowerCase().trim());
        if (sObj?.isArchived) return false;
        return true;
      })
      .sort((a, b) => b.bookHours - a.bookHours);
  }, [allFilteredTasks, selectedDept, staff]);

  // Summary Metrics (Strictly for tasks completed in selected pay period for filtered department staff)
  const summaryMetrics = useMemo(() => {
    const tasksInPeriod = allFilteredTasks.filter(t => t.completedInPayPeriod);
    const totalCompletedTasks = tasksInPeriod.length;

    // Sum book & actual hours strictly from techPayrollSummary (matching filtered department techs)
    const totalBookHours = techPayrollSummary.reduce((sum, tp) => sum + tp.bookHours, 0);
    const totalActualHours = techPayrollSummary.reduce((sum, tp) => sum + tp.actualHours, 0);

    const uniqueJobsCount = new Set(allFilteredTasks.map(t => t.jobId)).size;
    const uniqueTechs = techPayrollSummary.length;

    const overallEfficiency = (totalActualHours > 0 && totalBookHours > 0)
      ? Math.round((totalBookHours / totalActualHours) * 100)
      : null;

    const hasOvernightInPeriod = tasksInPeriod.some(t => t.hasOvernightSegment);

    return {
      totalCompletedTasks,
      totalBookHours: totalBookHours.toFixed(1),
      totalActualHours: totalActualHours.toFixed(1),
      overallEfficiency,
      uniqueJobsCount,
      uniqueTechs,
      hasOvernightInPeriod
    };
  }, [allFilteredTasks, techPayrollSummary]);

  // Staff Summary Cover Page Data (All staff with book hours, clocked-in shift hours, efficiency %, task counts, and job lists)
  const coverPageStaffData = useMemo(() => {
    const map: Record<string, {
      id: string;
      name: string;
      role: string;
      dept: string;
      clockedShiftHours: number;
      earnedBookHours: number;
      actualJobHours: number;
      shiftEfficiencyPct: number | null;
      taskEfficiencyPct: number | null;
      tasksCount: number;
      jobsList: string[];
    }> = {};

    // 1. Process staff from groupedStaffData (staff who have logged tasks/time)
    groupedStaffData.forEach(s => {
      const staffDoc = staff.find(st => 
        !st.isArchived && (
          st.id === s.staffId || 
          st.userId === s.staffId || 
          (st.name && st.name.toLowerCase().trim() === s.staffName.toLowerCase().trim()) ||
          (`${st.firstName || ''} ${st.lastName || ''}`.trim().toLowerCase() === s.staffName.toLowerCase().trim())
        )
      );

      if (staffDoc?.isArchived) return;

      const deptDoc = staffDoc?.departmentId ? departmentsList.find(d => d.id === staffDoc.departmentId) : null;
      const dept = staffDoc?.department || staffDoc?.departmentName || deptDoc?.name || 'Upfitting';
      let role = staffDoc?.jobTitle || staffDoc?.role || staffDoc?.title || '';
      if (!role) {
        role = dept.toLowerCase().includes('upfit') ? 'Upfitter' : dept;
      }

      const jobsSet = new Set<string>();
      (s.tasks || []).forEach((t: any) => {
        const job = jobs.find(j => j.id === t.jobId);
        const jNum = job ? (job.jobNumber || job.number) : t.jobNumber;
        if (jNum) jobsSet.add(`#${jNum}`);
      });

      const shiftH = (s as any).totalShiftHours || 0;
      const bookH = s.totalBookHours || 0;
      const actualJobH = s.totalActualHours || 0;
      const shiftEff = (shiftH > 0 && bookH > 0) ? Math.round((bookH / shiftH) * 100) : null;
      const taskEff = (actualJobH > 0 && bookH > 0) ? Math.round((bookH / actualJobH) * 100) : null;

      const key = (staffDoc?.id || s.staffId || s.staffName).toLowerCase().trim();

      map[key] = {
        id: staffDoc?.id || s.staffId,
        name: staffDoc?.name || `${staffDoc?.firstName || ''} ${staffDoc?.lastName || ''}`.trim() || s.staffName,
        role,
        dept,
        clockedShiftHours: shiftH,
        earnedBookHours: bookH,
        actualJobHours: actualJobH,
        shiftEfficiencyPct: shiftEff,
        taskEfficiencyPct: taskEff,
        tasksCount: (s.tasks || []).filter((t: any) => t.completedInPayPeriod).length,
        jobsList: Array.from(jobsSet)
      };
    });

    // 2. Include EVERY active employee in the organization
    staff.forEach(st => {
      if (st.isArchived || st.status === 'inactive') return;
      const stName = (st.name || `${st.firstName || ''} ${st.lastName || ''}`.trim());
      if (!stName || stName.toLowerCase() === 'unassigned') return;
      
      const key = (st.id || st.userId || stName).toLowerCase().trim();
      if (!map[key]) {
        let shiftSec = 0;
        timeSessionsList.forEach(session => {
          const sStaffId = (session.staffId || session.userId || '').toLowerCase();
          const sUserNorm = (session.userName || session.staffName || session.userEmail || '').trim().toLowerCase();
          const isMatch = (st.id && sStaffId === st.id.toLowerCase()) || 
                          (st.userId && sStaffId === st.userId.toLowerCase()) || 
                          (sUserNorm && (sUserNorm === stName.toLowerCase() || sUserNorm.includes(stName.toLowerCase())));
          if (!isMatch) return;
          const cIn = parseSafeDate(session.clockIn?.timestamp || session.clockIn || session.createdAt);
          if (!cIn) return;
          if (dateRange.start && cIn < dateRange.start) return;
          if (dateRange.end && cIn > dateRange.end) return;
          const cOutVal = session.clockOut?.timestamp || session.clockOut;
          const cOut = parseSafeDate(cOutVal) || new Date();
          let dur = Math.max(0, (cOut.getTime() - cIn.getTime()) / 1000);
          if (Array.isArray(session.breaks)) {
            session.breaks.forEach((b: any) => {
              if (b.isPaid === false || b.type === 'lunch') {
                const bStart = parseSafeDate(b.start);
                const bEnd = parseSafeDate(b.end) || cOut;
                if (bStart && bEnd) dur -= Math.max(0, (bEnd.getTime() - bStart.getTime()) / 1000);
              }
            });
          }
          shiftSec += Math.max(0, dur);
        });

        const shiftH = shiftSec / 3600;
        const stDeptDoc = st.departmentId ? departmentsList.find(d => d.id === st.departmentId) : null;
        const stDept = st.department || st.departmentName || stDeptDoc?.name || 'Shop Floor';
        let stRole = st.jobTitle || st.role || st.title || '';
        if (!stRole) {
          stRole = stDept.toLowerCase().includes('upfit') ? 'Upfitter' : stDept;
        }

        map[key] = {
          id: st.id,
          name: stName,
          role: stRole,
          dept: stDept,
          clockedShiftHours: shiftH,
          earnedBookHours: 0,
          actualJobHours: 0,
          shiftEfficiencyPct: null,
          taskEfficiencyPct: null,
          tasksCount: 0,
          jobsList: []
        };
      }
    });

    return Object.values(map).sort((a, b) => b.earnedBookHours - a.earnedBookHours || b.clockedShiftHours - a.clockedShiftHours || a.name.localeCompare(b.name));
  }, [groupedStaffData, staff, jobs, timeSessionsList, dateRange, departmentsList]);

  const totalCoverBookHours = useMemo(() => coverPageStaffData.reduce((sum, s) => sum + s.earnedBookHours, 0), [coverPageStaffData]);
  const totalCoverShiftHours = useMemo(() => coverPageStaffData.reduce((sum, s) => sum + s.clockedShiftHours, 0), [coverPageStaffData]);
  const totalCoverActualJobHours = useMemo(() => coverPageStaffData.reduce((sum, s) => sum + s.actualJobHours, 0), [coverPageStaffData]);
  const totalCoverTasks = useMemo(() => coverPageStaffData.reduce((sum, s) => sum + s.tasksCount, 0), [coverPageStaffData]);
  
  // Sum shift hours strictly for technicians who completed book time jobs
  const totalBookTechShiftHours = useMemo(() => {
    return coverPageStaffData
      .filter(s => s.earnedBookHours > 0)
      .reduce((sum, s) => sum + s.clockedShiftHours, 0);
  }, [coverPageStaffData]);

  // Sum actual job task hours strictly for technicians who completed book time jobs
  const totalBookTechTaskHours = useMemo(() => {
    return coverPageStaffData
      .filter(s => s.earnedBookHours > 0)
      .reduce((sum, s) => sum + s.actualJobHours, 0);
  }, [coverPageStaffData]);

  // 1. Shift Efficiency (Book Time vs Total Shift Time on Clock)
  const totalShiftEfficiency = useMemo(() => {
    if (totalBookTechShiftHours > 0 && totalCoverBookHours > 0) {
      return Math.round((totalCoverBookHours / totalBookTechShiftHours) * 100);
    }
    return null;
  }, [totalBookTechShiftHours, totalCoverBookHours]);

  // 2. Task Efficiency (Book Time vs Actual Time Logged on Tasks)
  const totalTaskEfficiency = useMemo(() => {
    if (totalBookTechTaskHours > 0 && totalCoverBookHours > 0) {
      return Math.round((totalCoverBookHours / totalBookTechTaskHours) * 100);
    }
    return null;
  }, [totalBookTechTaskHours, totalCoverBookHours]);

  // Expand / Collapse All
  const toggleExpandAll = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    groupedJobsData.forEach(item => {
      next[item.job.id] = expand;
    });
    setExpandedJobIds(next);
  };

  const toggleJobExpanded = (jobId: string) => {
    setExpandedJobIds(prev => ({ ...prev, [jobId]: !prev[jobId] }));
  };

  // Open Multi-Tech Custom Split Adjustment Modal
  const openSplitModal = (taskItem: any) => {
    const initialPcts: Record<string, number> = {};
    (taskItem.workers || []).forEach((w: any) => {
      initialPcts[w.name] = w.pct;
    });
    setCustomSplitPcts(initialPcts);
    setEditingSplitTask({ task: taskItem, jobId: taskItem.jobId });
  };

  const handleSaveCustomSplit = async () => {
    if (!editingSplitTask) return;
    setSavingSplit(true);
    try {
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${editingSplitTask.jobId}/tasks`, editingSplitTask.task.id);
      await updateDoc(taskRef, {
        customSplit: customSplitPcts,
        splitMode: 'custom'
      });

      const splitDesc = Object.entries(customSplitPcts).map(([name, pct]) => `${name}: ${pct}%`).join(', ');
      await recordAuditLog('Labor Split Adjusted', `Job #${editingSplitTask.task.jobNumber} (${editingSplitTask.task.taskTitle}): Custom split updated to [${splitDesc}]`, editingSplitTask.jobId, editingSplitTask.task.jobNumber, editingSplitTask.task.id);

      setEditingSplitTask(null);
    } catch (e) {
      console.error('Failed to save task split:', e);
    } finally {
      setSavingSplit(false);
    }
  };

  // Save Book Time / Payout Hours Adjustment
  const handleSaveBookTimeHours = async () => {
    if (!editingBookTimeTask) return;
    setSavingBookHours(true);
    try {
      const { task, jobId } = editingBookTimeTask;
      if (task.id.startsWith('embedded_')) {
        const job = jobs.find(j => j.id === jobId);
        if (job && Array.isArray(job.tasks)) {
          const updatedTasks = job.tasks.map((t: any, idx: number) => {
            const tId = t.id || `embedded_${idx}`;
            if (tId === task.id) {
              return { ...t, bookTime: newBookHours, estimatedHours: newBookHours, hours: newBookHours };
            }
            return t;
          });
          await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), { tasks: updatedTasks });
        }
      } else {
        const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, task.id);
        await updateDoc(taskRef, {
          bookTime: newBookHours,
          estimatedHours: newBookHours,
          hours: newBookHours
        });
      }

      await recordAuditLog('Book Hours Adjusted', `Job #${task.jobNumber} (${task.taskTitle}): Payout book hours updated from ${task.totalBookHours || 0}h to ${newBookHours}h`, jobId, task.jobNumber, task.id);

      setEditingBookTimeTask(null);
    } catch (e) {
      console.error('Failed to update task book hours:', e);
    } finally {
      setSavingBookHours(false);
    }
  };

  // Save Task Description & Staff Notes Edit
  const handleSaveTaskNotes = async () => {
    if (!editingTaskNotes) return;
    setSavingTaskNotes(true);
    try {
      const { task, jobId } = editingTaskNotes;
      if (task.id.startsWith('embedded_')) {
        const job = jobs.find(j => j.id === jobId);
        if (job && Array.isArray(job.tasks)) {
          const updatedTasks = job.tasks.map((t: any, idx: number) => {
            const tId = t.id || `embedded_${idx}`;
            if (tId === task.id) {
              return { 
                ...t, 
                description: editTaskSpecNote.trim(),
                notes: editTaskSpecNote.trim(),
                techNote: editStaffTechNote.trim(),
                staffNotes: editStaffTechNote.trim(),
                payrollNotes: editPayrollNote.trim()
              };
            }
            return t;
          });
          await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), { tasks: updatedTasks });
        }
      } else {
        const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, task.id);
        await updateDoc(taskRef, {
          description: editTaskSpecNote.trim(),
          notes: editTaskSpecNote.trim(),
          techNote: editStaffTechNote.trim(),
          staffNotes: editStaffTechNote.trim(),
          payrollNotes: editPayrollNote.trim(),
          updatedAt: new Date()
        });
      }

      await recordAuditLog('Task Notes Edited', `Job #${task.jobNumber} (${task.taskTitle}): Updated task instructions, staff notes & payroll notes`, jobId, task.jobNumber, task.id);

      setEditingTaskNotes(null);
    } catch (e) {
      console.error('Failed to save task notes:', e);
    } finally {
      setSavingTaskNotes(false);
    }
  };

  // Save New Task to Job for Payout
  const handleCreateNewTask = async () => {
    if (!addingTaskForJob || !newTaskTitle.trim()) return;
    setSavingNewTask(true);
    try {
      const { jobId } = addingTaskForJob;
      const assignedStaff = activeStaff
        .filter(s => newTaskTechIds.includes(s.id))
        .map(s => ({ id: s.id, name: `${s.firstName || s.name || ''} ${s.lastName || ''}`.trim() }));

      const newTaskDoc = {
        name: newTaskTitle.trim(),
        title: newTaskTitle.trim(),
        taskGroup: newTaskCategory.trim() || 'UPFITTING',
        category: newTaskCategory.trim() || 'UPFITTING',
        bookTime: newTaskBookHours,
        estimatedHours: newTaskBookHours,
        hours: newTaskBookHours,
        completed: true,
        status: 'QC Complete',
        completedAt: new Date(),
        assignedStaff,
        assignedStaffIds: newTaskTechIds,
        assignedStaffNames: assignedStaff.map(s => s.name),
        completedBy: assignedStaff.map(s => s.name).join(', ') || 'Technician',
        description: newTaskNotes.trim(),
        notes: newTaskNotes.trim(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), newTaskDoc);

      await recordAuditLog('Task Added for Payout', `Job #${addingTaskForJob.jobNumber}: Added completed payout task "${newTaskTitle.trim()}" (${newTaskBookHours}h)`, jobId, addingTaskForJob.jobNumber);

      setAddingTaskForJob(null);
      setNewTaskTitle('');
      setNewTaskBookHours(1.0);
      setNewTaskTechIds([]);
      setNewTaskNotes('');
    } catch (e) {
      console.error('Failed to add task to job:', e);
    } finally {
      setSavingNewTask(false);
    }
  };

  const handlePrintFull = () => {
    setPrintMode('full');
    setPrintJobId(null);
    setTimeout(() => {
      window.print();
    }, 50);
  };

  
  const handleSaveShiftSession = async () => {
    if (!editingShiftSession) return;
    setSavingShiftSession(true);
    try {
      const { session, clockInTime, clockOutTime, breakMinutes, notes, editReason, staffName, date } = editingShiftSession;
      
      const startParts = clockInTime.split(':');
      const endParts = clockOutTime.split(':');
      
      const st = new Date(date);
      st.setHours(parseInt(startParts[0]), parseInt(startParts[1]), 0, 0);
      
      const et = new Date(date);
      et.setHours(parseInt(endParts[0]), parseInt(endParts[1]), 0, 0);
      
      await updateDoc(doc(db, `businesses/${tenantId}/time_sessions`, session.id), {
        start: st,
        end: et,
        'clockOut.timestamp': et,
        breakDurationMin: breakMinutes,
        notes: notes
      });
      
      await recordAuditLog(
        'Time Clock Shift Edited',
        `${staffName} (${date}): Adjusted shift to ${clockInTime}-${clockOutTime} (-${breakMinutes}m break). Reason: ${editReason}`
      );
      
      setEditingShiftSession(null);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingShiftSession(false);
    }
  };

  const handleCreateManualShift = async () => {
    if (!addingShiftStaff || !newShiftDate) return;
    setSavingNewShift(true);
    try {
      const { staffId, staffName } = addingShiftStaff;
      const startParts = newShiftClockIn.split(':');
      const endParts = newShiftClockOut.split(':');
      
      const st = new Date(newShiftDate);
      st.setHours(parseInt(startParts[0]), parseInt(startParts[1]), 0, 0);
      
      const et = new Date(newShiftDate);
      et.setHours(parseInt(endParts[0]), parseInt(endParts[1]), 0, 0);
      
      await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
        staffId,
        userName: staffName,
        start: st,
        end: et,
        clockOut: { timestamp: et },
        breakDurationMin: newShiftBreakMins,
        notes: newShiftNotes,
        status: 'completed',
        type: 'manual_entry'
      });
      
      await recordAuditLog(
        'Manual Shift Added',
        `${staffName} (${newShiftDate}): Added manual shift ${newShiftClockIn}-${newShiftClockOut} (-${newShiftBreakMins}m break). Notes: ${newShiftNotes}`
      );
      
      setAddingShiftStaff(null);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNewShift(false);
    }
  };

  const handleDeleteShiftSession = async () => {
    if (!deletingShiftSession) return;
    setDeletingShiftLoading(true);
    try {
      const { sessionId, staffName, dateStr, hours } = deletingShiftSession;
      await deleteDoc(doc(db, `businesses/${tenantId}/time_sessions`, sessionId));
      await recordAuditLog(
        'Time Clock Shift Deleted',
        `${staffName} (${dateStr}): Voided/deleted ${hours.toFixed(1)}h shift entry`
      );
      setDeletingShiftSession(null);
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingShiftLoading(false);
    }
  };

  const handlePrintStaff = () => {
    setPrintMode('staff');
    setPrintJobId(null);
    setTimeout(() => {
      window.print();
    }, 50);
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 bg-zinc-955 font-sans text-xs select-none gap-6 overflow-auto min-h-screen text-zinc-100 print:p-0 print:bg-white print:text-black print:overflow-visible print:min-h-0">
      
      {/* Master Yellow Sheets Command Container (Screen Only) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 print:hidden">
        
        {/* Row 1: Header Title & Audit Log */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-tight text-white flex items-center gap-2 flex-wrap">
                <span>Yellow Sheets & Payroll Labor Reconciliation</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-mono border border-amber-500/30">
                  {summaryMetrics.totalBookHours}h Total Book Time
                </span>
              </h1>
                {!canEdit && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center gap-1" title="Read-only view mode. Requires Yellow Sheets edit permission to adjust payout hours or splits.">
                    <ShieldCheck className="w-3 h-3 text-zinc-400" /> Read-Only
                  </span>
                )}
            </div>
          </div>

          {/* Header Action Buttons: Print Yellow Sheets, Print Staff Sheets, Audit Log */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* 1. Print Yellow Sheets (Cover Page + All Job Sheets) */}
            <button
              onClick={handlePrintFull}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg font-black transition cursor-pointer text-[11px] shadow-md shadow-amber-500/20"
              title={`Print complete Yellow Sheets package: Cover Summary Page (Page 1) + all ${groupedJobsData.length} Job Sheets`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Yellow Sheets ({groupedJobsData.length} Jobs)</span>
            </button>

            {/* 2. Print Staff Sheets */}
            <button
              onClick={handlePrintStaff}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-extrabold transition cursor-pointer text-[11px] shadow-md shadow-indigo-600/10"
              title={`Print staff payout/labor reports for each technician shown based on active filters`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Staff Sheets ({groupedStaffData.length})</span>
            </button>

            <button
              onClick={() => setShowAuditModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg border border-amber-500/20 font-bold transition cursor-pointer text-[11px]"
              title="View full audit log of all book hours, splits, and note edits"
            >
              <History className="w-3.5 h-3.5 text-amber-400" />
              <span>Audit Log ({auditLogs.length})</span>
            </button>
          </div>
        </div>

        {/* Row 2: Filter Toolbar */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1">
          
          {/* Date Range Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-amber-400" /> Date:
            </span>
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-[10px] font-mono">
              <button
                onClick={() => applyDatePreset('last_week')}
                className={cn(
                  "px-2.5 py-1 rounded font-extrabold uppercase transition",
                  dateMode === 'last_week' ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                Last Week (Payroll)
              </button>
              <button
                onClick={() => applyDatePreset('this_week')}
                className={cn(
                  "px-2.5 py-1 rounded font-extrabold uppercase transition",
                  dateMode === 'this_week' ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                This Week
              </button>
              <button
                onClick={() => applyDatePreset('today')}
                className={cn(
                  "px-2.5 py-1 rounded font-extrabold uppercase transition",
                  dateMode === 'today' ? "bg-teal-500/20 text-teal-300 border border-teal-500/30" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                Today
              </button>
              <button
                onClick={() => applyDatePreset('last_30')}
                className={cn(
                  "px-2.5 py-1 rounded font-extrabold uppercase transition",
                  dateMode === 'last_30' ? "bg-zinc-800 text-zinc-200" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                30 Days
              </button>
              <button
                onClick={() => applyDatePreset('all')}
                className={cn(
                  "px-2.5 py-1 rounded font-extrabold uppercase transition cursor-pointer",
                  dateMode === 'all' ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                All Time
              </button>
            </div>

            {/* Pay Period Stepper Pill Widget */}
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 shadow-inner">
              <button
                onClick={() => handleStepPayPeriod('prev')}
                className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition cursor-pointer"
                title="Previous Pay Period"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center px-2 min-w-[120px]">
                <span className="text-[9px] uppercase font-black tracking-widest text-zinc-500">Pay Period</span>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {formatPayPeriodRangeText(dateRange.start, dateRange.end)}
                </span>
              </div>

              <button
                onClick={() => handleStepPayPeriod('next')}
                className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition cursor-pointer"
                title="Next Pay Period"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {offsetWeeks !== 0 && (
                <button
                  onClick={() => handleStepPayPeriod('current')}
                  className="ml-1 px-2 py-0.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[9px] font-mono font-bold rounded uppercase transition cursor-pointer"
                  title="Jump to current pay period"
                >
                  Current
                </button>
              )}
            </div>
          </div>

          {/* Filters: Department, Staff Member & Search */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Department Selector (Defaults to Upfitters) */}
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1">
              <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                className="bg-transparent text-white text-[11px] font-bold focus:outline-none cursor-pointer pr-1"
                title="Filter Yellow Sheets tasks by Department (Defaults to Upfitters)"
              >
                <option value="upfitters" className="bg-zinc-900 text-amber-300 font-bold">🏢 Dept: Upfitters (Default)</option>
                <option value="all" className="bg-zinc-900 text-zinc-200">🏢 All Departments</option>
                <option value="graphics" className="bg-zinc-900 text-zinc-200">🎨 Graphics & Vinyl</option>
                <option value="fabrication" className="bg-zinc-900 text-zinc-200">🔧 Fabrication & Metal</option>
                <option value="harness" className="bg-zinc-900 text-zinc-200">⚡ Harness & Wiring</option>
                <option value="office" className="bg-zinc-900 text-zinc-200">💼 Office & Admin</option>
                <option value="parts" className="bg-zinc-900 text-zinc-200">📦 Parts & Warehouse</option>
                {departmentsList.map(d => {
                  const dNameLower = (d.name || '').toLowerCase();
                  if (['upfitters', 'graphics', 'fabrication', 'harness', 'office', 'parts'].includes(dNameLower)) return null;
                  return (
                    <option key={d.id} value={dNameLower} className="bg-zinc-900 text-zinc-200">
                      🏢 Dept: {d.name}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Searchable Staff Selector */}
            <div className="w-[240px]">
              <SearchableSelect
                options={[{ id: 'all', name: 'All Active Staff / Technicians', role: '' }, ...activeStaff]}
                value={selectedStaffId === 'all' ? null : selectedStaffId}
                onChange={val => setSelectedStaffId(val || 'all')}
                getLabel={s => s.id === 'all' ? 'All Active Staff / Technicians' : `${s.firstName || s.name || 'Staff'} ${s.lastName || ''}`.trim()}
                getValue={s => s.id}
                placeholder="All Active Staff / Technicians"
                searchPlaceholder="Type to filter staff..."
                theme="amber"
                icon={<User className="w-3.5 h-3.5" />}
                className="w-full text-[11px]"
              />
            </div>

            {/* Clear Staff Filter Button */}
            {selectedStaffId !== 'all' && (
              <button
                onClick={() => setSelectedStaffId('all')}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-mono font-bold rounded-lg border border-amber-500/30 transition cursor-pointer"
                title="Clear staff filter and show all technicians"
              >
                <X className="w-3.5 h-3.5 text-amber-400" />
                <span>Clear Staff Filter</span>
              </button>
            )}

            {/* Status Filter (Show All, Completed Only, In Progress, Not Started) */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-[10px] font-mono flex-wrap">
              <button
                onClick={() => setStatusFilter('all')}
                className={cn(
                  "px-2 py-0.5 rounded font-extrabold uppercase transition cursor-pointer",
                  statusFilter === 'all' ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-zinc-400 hover:text-zinc-200"
                )}
                title="Show all tasks across all statuses"
              >
                Show All
              </button>
              <button
                onClick={() => setStatusFilter('completed_only')}
                className={cn(
                  "px-2 py-0.5 rounded font-extrabold uppercase transition cursor-pointer",
                  statusFilter === 'completed_only' ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-zinc-400 hover:text-zinc-200"
                )}
                title="Show tasks completed in the selected date range for payroll"
              >
                Completed Only
              </button>
              <button
                onClick={() => setStatusFilter('in_progress')}
                className={cn(
                  "px-2 py-0.5 rounded font-extrabold uppercase transition cursor-pointer",
                  statusFilter === 'in_progress' ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-zinc-400 hover:text-zinc-200"
                )}
                title="Show uncompleted tasks with clocked time spent"
              >
                In Progress
              </button>
              <button
                onClick={() => setStatusFilter('not_started')}
                className={cn(
                  "px-2 py-0.5 rounded font-extrabold uppercase transition cursor-pointer",
                  statusFilter === 'not_started' ? "bg-zinc-800 text-zinc-200 border border-zinc-700" : "text-zinc-400 hover:text-zinc-200"
                )}
                title="Show uncompleted tasks with no time spent"
              >
                Not Started
              </button>
            </div>

            {/* Triage Filter Pills */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-[10px] font-mono flex-wrap">
              <button
                onClick={() => setTriageFilter('all')}
                className={cn(
                  "px-2 py-0.5 rounded font-extrabold uppercase transition cursor-pointer",
                  triageFilter === 'all' ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-zinc-400 hover:text-zinc-200"
                )}
                title="Show all tasks"
              >
                All
              </button>
              <button
                onClick={() => setTriageFilter('bottlenecks')}
                className={cn(
                  "px-2 py-0.5 rounded font-extrabold uppercase transition cursor-pointer flex items-center gap-1",
                  triageFilter === 'bottlenecks' ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "text-zinc-400 hover:text-zinc-200"
                )}
                title="Show tasks that took significantly longer than book time (<60% efficiency)"
              >
                <span>🔴 Bottlenecks</span>
              </button>
              <button
                onClick={() => setTriageFilter('under_clocked')}
                className={cn(
                  "px-2 py-0.5 rounded font-extrabold uppercase transition cursor-pointer flex items-center gap-1",
                  triageFilter === 'under_clocked' ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-zinc-400 hover:text-zinc-200"
                )}
                title="Show tasks with <2 minutes worked or >200% efficiency (under-clocked review)"
              >
                <span>⚠️ Review</span>
              </button>
              <button
                onClick={() => setTriageFilter('splits')}
                className={cn(
                  "px-2 py-0.5 rounded font-extrabold uppercase transition cursor-pointer flex items-center gap-1",
                  triageFilter === 'splits' ? "bg-teal-500/20 text-teal-300 border border-teal-500/30" : "text-zinc-400 hover:text-zinc-200"
                )}
                title="Show tasks worked on by 2 or more technicians"
              >
                <span>👥 Splits</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search job, tech, task..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-white pl-8 pr-3 py-1 rounded-lg text-[11px] focus:outline-none focus:border-amber-500/50 w-44 sm:w-56"
              />
            </div>

            {/* Expand / Collapse Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => toggleExpandAll(true)}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono font-bold rounded border border-zinc-700 transition cursor-pointer"
                title="Expand All Jobs"
              >
                Expand All
              </button>
              <button
                onClick={() => toggleExpandAll(false)}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono font-bold rounded border border-zinc-700 transition cursor-pointer"
                title="Collapse All Jobs"
              >
                Collapse All
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Per-Tech Payroll Summary Breakdown Cards Row */}
      {techPayrollSummary.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3 print:hidden">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <User className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-black uppercase tracking-wider text-white">Technician Payout Summary (Selected Date Range)</h2>
              <span className="text-[10px] text-zinc-400 italic font-mono bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800/80">
                💡 Click a person to show only tasks completed by that person
              </span>
            </div>
            <span className="text-[10px] font-mono text-zinc-400">
              {dateMode === 'last_week' ? 'Last Week (Payroll)' : dateMode === 'this_week' ? 'This Week' : dateMode === 'today' ? 'Today' : dateRange.start ? `${dateRange.start.toLocaleDateString()} - ${dateRange.end?.toLocaleDateString()}` : 'All Time'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {techPayrollSummary.map(tech => {
                const isSelected = selectedStaffId !== 'all' && (selectedStaffId === tech.id || tech.name.toLowerCase().includes(selectedStaffId.toLowerCase()));
                const techEff = (tech.actualHours > 0 && tech.bookHours > 0) ? Math.round((tech.bookHours / tech.actualHours) * 100) : null;

                return (
                  <div
                    key={tech.name}
                    onClick={() => {
                      const match = activeStaff.find(s => s.id === tech.id || `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase() === tech.name.toLowerCase());
                      setSelectedStaffId(isSelected ? 'all' : (match ? match.id : 'all'));
                    }}
                    className={cn(
                      "p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 select-none",
                      isSelected
                        ? "bg-amber-500/15 border-amber-500/40 ring-1 ring-amber-500/30"
                        : "bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/80"
                    )}
                    title={isSelected ? "Click to reset staff filter" : `Click to filter view to ${tech.name}`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-[11px] flex items-center justify-center shrink-0 border border-indigo-500/30">
                          {tech.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-white truncate max-w-[120px]">{tech.name}</h3>
                          <p className="text-[10px] font-mono text-zinc-400">
                            {tech.tasksCompleted} {tech.tasksCompleted === 1 ? 'task' : 'tasks'} • {tech.jobsSet.size} {tech.jobsSet.size === 1 ? 'job' : 'jobs'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono">
                      <div className="text-xs font-black text-amber-400">⚡ {tech.bookHours.toFixed(1)}h Book</div>
                      {tech.actualHours > 0 && (
                        <div className="text-[10px] text-indigo-300 font-bold">⏱️ {tech.actualHours.toFixed(1)}h Spent</div>
                      )}
                      {techEff !== null && (
                        <div className={cn(
                          "text-[9px] font-black uppercase mt-0.5",
                          techEff >= 100 ? "text-emerald-400" : techEff >= 80 ? "text-amber-400" : "text-rose-400"
                        )}>
                          📈 {techEff}% Eff.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Main Content Area (Screen Only) */}
      {loading ? (
        <div className="p-12 text-center bg-zinc-900 border border-zinc-800 rounded-2xl print:hidden">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-400 font-mono text-xs">Loading Yellow Sheets Data...</p>
        </div>
      ) : groupedJobsData.length === 0 ? (
        <div className="p-12 text-center bg-zinc-900 border border-zinc-800 rounded-2xl space-y-3 print:hidden">
          <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No Completed Tasks Found</h3>
          <p className="text-zinc-400 max-w-md mx-auto text-xs">
            No completed tasks match your selected date range or staff filter. Try selecting "Last Week" or "All Time" above.
          </p>
          <button
            onClick={() => {
              applyDatePreset('all');
              setSelectedStaffId('all');
              setSearchQuery('');
            }}
            className="px-4 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold rounded-lg transition inline-flex items-center gap-1.5 text-xs cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="space-y-4 print:hidden">
          {/* List Header & Expand/Collapse All Controls */}
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-[11px] font-mono text-zinc-400">
              Showing {groupedJobsData.length} Job{groupedJobsData.length !== 1 ? 's' : ''} ({summaryMetrics.totalCompletedTasks} Completed Tasks)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  groupedJobsData.forEach(item => { next[item.job.id] = true; });
                  setExpandedJobIds(next);
                }}
                className="text-[10px] font-mono font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded border border-amber-500/20 transition cursor-pointer"
              >
                + Expand All
              </button>
              <button
                onClick={() => setExpandedJobIds({})}
                className="text-[10px] font-mono font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded border border-zinc-700 transition cursor-pointer"
              >
                − Collapse All
              </button>
            </div>
          </div>


          {groupedJobsData.map(item => {
            const { job, categories } = item;
            const isExpanded = expandedJobIds[job.id] === true; // Default collapsed on page load

            const jobTotalTasks = Object.values(categories).reduce((sum, list) => sum + list.length, 0);
            const jobCompletedTasksList = Object.values(categories).flatMap(list => list).filter(t => t.completed);
            const jobCompletedTasksCount = jobCompletedTasksList.length;
            const jobCompletedBookSum = jobCompletedTasksList.reduce((s, t) => s + (t.bookHours || 0), 0);

            // Techs who completed work on this job
            const jobTechs = Array.from(new Set(
              Object.values(categories)
                .flatMap(list => list)
                .flatMap(t => (t.workers || []).map((w: any) => w.name))
                .filter(Boolean)
            ));

            return (
              <div key={job.id} className="bg-zinc-900 border border-zinc-800/90 rounded-2xl overflow-hidden shadow-lg transition duration-200 hover:border-zinc-700/80">
                
                {/* Job Card Header */}
                <div 
                  onClick={() => toggleJobExpanded(job.id)}
                  className="p-3.5 bg-zinc-900 hover:bg-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none border-b border-zinc-800"
                >
                  <div className="flex items-center gap-3">
                    <button className="text-zinc-400 hover:text-white transition">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-amber-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                    </button>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black uppercase text-amber-400 font-mono">JOB #{job.jobNumber}</span>
                        <span className="text-sm font-bold text-white">— {job.customerName}</span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400 mt-0.5 flex-wrap">
                        {job.vehicleInfo && job.vehicleInfo !== 'N/A' && (
                          <span>Vehicle: <strong className="text-zinc-200">{job.vehicleInfo}</strong></span>
                        )}
                        <span>Status: <strong className="text-zinc-300 uppercase">{job.jobStatus}</strong></span>
                        {jobTechs.length > 0 && (
                          <span>Tech(s): <strong className="text-amber-300">{jobTechs.join(', ')}</strong></span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Job Subtotals & Action Buttons Right Side */}
                  <div className="flex items-center gap-3 font-mono text-xs shrink-0 self-end sm:self-auto">
                    {/* Print Specific Job Yellow Sheet Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrintMode('jobs');
                        setPrintJobId(job.id);
                        setTimeout(() => {
                          window.print();
                        }, 50);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[10px] font-mono font-black rounded-lg transition cursor-pointer shadow-sm shadow-amber-500/10"
                      title={`Print Yellow Sheet specifically for Job #${job.jobNumber}`}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Job Yellow Sheet</span>
                    </button>

                    {job.id !== 'unassigned' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openJobDetails(job.id);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-mono font-bold rounded-lg border border-zinc-700 transition cursor-pointer"
                        title="Open full Job Details page"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                        <span>Open Job</span>
                      </button>
                    )}

                    {canEdit && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddingTaskForJob({ jobId: job.id, jobNumber: job.jobNumber, customerName: job.customerName });
                          setNewTaskBookHours(1.0);
                          setNewTaskTitle('');
                          setNewTaskNotes('');
                          setNewTaskTechIds(activeStaff.slice(0, 1).map(s => s.id));
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-mono font-black rounded-lg border border-amber-500/30 transition cursor-pointer"
                        title="Add a new task directly to this job for payout"
                      >
                        <Plus className="w-3.5 h-3.5 text-amber-400" />
                        <span>Add Task</span>
                      </button>
                    )}

                    <div className="text-right">
                      <div className="text-amber-400 font-extrabold text-xs">Total Book Time: {jobCompletedBookSum.toFixed(1)}h</div>
                      <div className="text-[10px] text-zinc-500">{jobCompletedTasksCount} / {jobTotalTasks} Tasks Done</div>
                    </div>
                  </div>
                </div>

                {/* Job Tasks Categories Breakdown */}
                {isExpanded && (
                  <div className="p-4 space-y-5 bg-zinc-950/40">
                    {Object.entries(categories).map(([catName, tasks]) => {
                      const catTotalHours = tasks.reduce((sum, t) => sum + (t.bookHours || 0), 0);

                      return (
                        <div key={catName} className="space-y-3">
                          {/* Category Header */}
                          <div className="flex items-center justify-between border-b border-zinc-800 pb-1 font-mono text-[11px] font-bold uppercase text-amber-400">
                            <div className="flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5 text-amber-400" />
                              <span>CATEGORY: {catName}</span>
                              <span className="text-[10px] text-zinc-500 font-normal">({tasks.length} {tasks.length === 1 ? 'task' : 'tasks'})</span>
                            </div>
                          <span>CATEGORY BOOK HOURS: {catTotalHours.toFixed(1)}H</span>
                          </div>

                          {/* Task Table matching exact print structure */}
                          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/80">
                            <table className="w-full text-left border-collapse font-mono text-xs">
                              <thead>
                                <tr className="bg-zinc-900 text-zinc-400 border-b border-zinc-800 font-extrabold uppercase text-[10px]">
                                  <th className="p-2.5 w-[24%]">TASK</th>
                                  <th className="p-2.5 w-[9%] text-right">BOOK HOURS</th>
                                  <th className="p-2.5 w-[11%] text-right">TIME SPENT</th>
                                  <th className="p-2.5 w-[18%]">TECH</th>
                                  <th className="p-2.5 w-[20%]">TASK SPEC NOTES</th>
                                  <th className="p-2.5 w-[18%]">PAYROLL NOTES</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800/80">
                                {tasks.map((task, idx) => {
                                  const isDone = task.completed || task.isCompleted || task.isQCComplete;
                                  const taskKey = `${task.jobId}_${task.id}`;
                                  const hasSessions = task.taskSegments && task.taskSegments.length > 0;
                                  const paceStyles = getScreenTaskRowStyles(task.bookHours, task.actualHours, idx % 2 === 0);
                                  const hasStaffNotes = !!(task.staffNotes && task.staffNotes.trim() && task.staffNotes.trim() !== '—');

                                  return (
                                    <Fragment key={task.id || idx}>
                                      <tr className={cn("transition", isDone ? paceStyles.className : "bg-zinc-950/20 opacity-50 hover:opacity-100")}>
                                        <td className="p-2.5 font-bold text-white align-top">
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className={cn(
                                                "px-1.5 py-0.2 rounded text-[8px] font-mono font-black uppercase border",
                                                task.statusCode === 'completed' || task.completed
                                                  ? "bg-emerald-950 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10" 
                                                  : task.statusCode === 'in_progress'
                                                  ? "bg-amber-950/80 text-amber-400 border-amber-500/30"
                                                  : "bg-zinc-900 text-zinc-500 border-zinc-800"
                                              )}>
                                                {task.statusLabel}
                                              </span>
                                              {paceStyles.badge && (
                                                <span className={cn("px-1.5 py-0.2 rounded text-[8px] font-mono font-black border", paceStyles.badge.color)}>
                                                  {paceStyles.badge.text}
                                                </span>
                                              )}
                                              <span 
                                                onClick={(e) => {
                                                  if (task.jobId !== 'unassigned' && task.id) {
                                                    e.stopPropagation();
                                                    openTaskDetails(task.jobId, task.id);
                                                  }
                                                }}
                                                className={cn("text-xs font-bold", isDone ? "text-white" : "text-zinc-400", task.jobId !== 'unassigned' && task.id ? "hover:text-amber-300 cursor-pointer underline decoration-dotted" : "")}
                                              >
                                                {task.taskTitle}
                                              </span>
                                              {getTaskCategoryDisplay(task) && (
                                                <span className="text-[9px] font-mono font-bold text-amber-500/80 uppercase tracking-wider block mt-0.5">
                                                  {getTaskCategoryDisplay(task)}
                                                </span>
                                              )}
                                            </div>

                                            {/* Collapsible Clocked Sessions Drawer Button */}
                                            {hasSessions && (
                                              <div className="pt-1">
                                                <button
                                                  onClick={() => setExpandedTaskSessions(prev => ({ ...prev, [taskKey]: !prev[taskKey] }))}
                                                  className="text-[9px] font-mono font-bold text-zinc-400 hover:text-amber-300 flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 transition cursor-pointer"
                                                >
                                                  {expandedTaskSessions[taskKey] ? <ChevronDown className="w-3 h-3 text-amber-400" /> : <ChevronRight className="w-3 h-3 text-zinc-400" />}
                                                  <Clock className="w-3 h-3 text-amber-400" />
                                                  <span>Sessions ({task.taskSegments.length})</span>
                                                </button>

                                                {expandedTaskSessions[taskKey] && (
                                                  <div className="mt-1.5 space-y-1 pl-1 text-[9px] font-mono">
                                                    {task.taskSegments.map((seg: any, sIdx: number) => {
                                                      const startStr = `${seg.start.toLocaleDateString([], { month: 'numeric', day: 'numeric' })} ${seg.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                                                      const endStr = seg.isOpen ? 'Active' : `${seg.end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                                                      const hrs = (seg.durationSec / 3600).toFixed(1);
                                                      return (
                                                        <div key={sIdx} className="bg-zinc-900/90 p-1 rounded border border-zinc-800 text-zinc-300">
                                                          <div className="flex justify-between items-center">
                                                            <span>{seg.userName}: {startStr} ➔ {endStr}</span>
                                                            <span className="font-bold text-amber-400">{hrs}h</span>
                                                          </div>
                                                          {seg.note && <div className="text-amber-200/80 italic text-[9px]">"{seg.note}"</div>}
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </td>

                                        <td className={cn("p-2.5 text-right font-black align-top", isDone ? "text-amber-300" : "text-zinc-500")}>
                                          <div className="flex items-center justify-end gap-1">
                                            <span>{task.bookHours?.toFixed(1)}h</span>
                                            {canEdit && (
                                              <button
                                                onClick={() => {
                                                  setEditingBookTimeTask({ task, jobId: task.jobId, hours: task.totalBookHours || task.bookHours });
                                                  setNewBookHours(task.totalBookHours || task.bookHours || 1.0);
                                                }}
                                                className="p-0.5 hover:bg-zinc-800 rounded text-amber-400 hover:text-amber-200 transition"
                                              >
                                                <Edit3 className="w-3 h-3" />
                                              </button>
                                            )}
                                          </div>
                                        </td>

                                        {/* TIME SPENT ON TASK */}
                                        <td className="p-2.5 text-right font-mono text-xs align-top">
                                          {task.actualHours > 0 ? (
                                            <div>
                                              <div className="font-bold text-teal-300">{task.actualDurationStr}</div>
                                              {task.efficiencyPct !== null && (
                                                <div className={cn(
                                                  "text-[10px] font-black",
                                                  task.efficiencyPct >= 85 ? "text-emerald-400" : task.efficiencyPct >= 60 ? "text-amber-400" : "text-rose-400"
                                                )}>
                                                  {task.efficiencyPct}% eff
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            <span className="text-zinc-600">—</span>
                                          )}
                                        </td>

                                        <td className={cn("p-2.5 font-semibold align-top", isDone ? "text-zinc-200" : "text-zinc-500 font-normal")}>
                                          <div className="flex items-center gap-1 flex-wrap">
                                            {isDone ? (
                                              <>
                                                <span>{task.completedBy || 'Technician'}</span>
                                                {task.completedAt && (
                                                  <span className="text-[9px] font-mono text-zinc-400 block w-full font-normal">
                                                    {task.completedAt.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })} {task.completedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                                  </span>
                                                )}
                                                {canEdit && task.workers && task.workers.length > 1 && (
                                                  <button
                                                    onClick={() => openSplitModal(task)}
                                                    className="p-0.5 hover:bg-zinc-800 rounded text-amber-400 hover:text-amber-200 transition"
                                                    title="Adjust split"
                                                  >
                                                    <Sliders className="w-3 h-3" />
                                                  </button>
                                                )}
                                              </>
                                            ) : (
                                              <span className="text-zinc-500 font-mono text-xs">—</span>
                                            )}
                                          </div>
                                        </td>

                                        <td className={cn("p-2.5 align-top whitespace-pre-wrap", isDone ? "text-zinc-300" : "text-zinc-500")}>
                                          {task.taskNotes || '—'}
                                        </td>

                                        <td className={cn("p-2.5 align-top whitespace-pre-wrap", isDone ? "text-zinc-300" : "text-zinc-500")}>
                                          <div className="space-y-1">
                                            <span>{task.payrollNotes || '—'}</span>
                                            {canEdit && (
                                              <div>
                                                <button
                                                  onClick={() => {
                                                    setEditingTaskNotes({ task, jobId: task.jobId });
                                                    setEditTaskSpecNote(task.taskNotes || '');
                                                    setEditStaffTechNote(task.staffNotes || '');
                                                    setEditPayrollNote(task.payrollNotes || '');
                                                  }}
                                                  className="text-[9px] font-mono font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 rounded border border-zinc-700 transition cursor-pointer mt-1"
                                                >
                                                  <Edit3 className="w-2.5 h-2.5" />
                                                  <span>Edit Notes</span>
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      </tr>

                                      {/* Indented Staff Notes Full-Width Child Sub-Row */}
                                      {hasStaffNotes && (
                                        <tr className="bg-zinc-950/70 border-b border-zinc-800/80">
                                          <td colSpan={6} className="py-1 px-3 pl-8 text-[11px] font-mono text-zinc-300 border-l-2 border-l-indigo-500/60">
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-bold text-indigo-400">↳ 💬 STAFF NOTE:</span>
                                                <span className="italic text-zinc-200">
                                                  {task.staffNotes.split(/\r?\n+/).map((s: string) => s.trim()).filter(Boolean).join(' | ')}
                                                </span>
                                              </div>
                                              {canEdit && (
                                                <button
                                                  onClick={() => {
                                                    setEditingTaskNotes({ task, jobId: task.jobId });
                                                    setEditTaskSpecNote(task.taskNotes || '');
                                                    setEditStaffTechNote(task.staffNotes || '');
                                                    setEditPayrollNote(task.payrollNotes || '');
                                                  }}
                                                  className="text-[9px] font-mono text-zinc-400 hover:text-amber-300 flex items-center gap-0.5"
                                                  title="Edit staff note"
                                                >
                                                  <Edit3 className="w-2.5 h-2.5" />
                                                  <span>Edit</span>
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* Modern Excel Printable Container */}
      <div id="yellow-sheets-print-area" className="hidden print:block font-sans text-[11px] text-black bg-white p-4 space-y-6">
        {/* ========================================================================= */}
        {/* 📄 COVER / SUMMARY PAGE (FITS EXACTLY ON 1 LANDSCAPE SHEET)               */}
        {/* ========================================================================= */}
        {(printMode === 'full' || printMode === 'staff' || (printMode === 'jobs' && printJobId === null)) && (
          <div 
            className="yellow-sheet-cover-page"
            style={{
              pageBreakBefore: 'avoid',
              breakBefore: 'avoid',
              pageBreakAfter: 'always',
              breakAfter: 'page',
              pageBreakInside: 'avoid',
              breakInside: 'avoid',
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            {/* Top 8px Yellow Stripe */}
            <div 
              style={{
                height: '8px',
                backgroundColor: '#eab308',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact'
              }}
            />

            {/* Header Block */}
            <div className="border-2 border-black p-2 bg-zinc-50 mb-1.5 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span 
                    className="px-2 py-0.5 font-black text-[9px] uppercase font-mono tracking-wider text-black border border-black"
                    style={{ backgroundColor: '#fde047', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                  >
                    EXECUTIVE SUMMARY & COVER PAGE
                  </span>
                  <h1 className="text-sm font-black text-black tracking-tight uppercase">
                    Yellow Sheets — Payroll & Shop Summary
                  </h1>
                </div>
                <p className="text-[10px] font-bold text-gray-800 mt-0.5">
                  Pay Period / Date Range: <span className="font-mono text-black underline font-black">{formatPayPeriodRangeText(dateRange.start, dateRange.end)}</span>
                  {activeFiltersSummary && <span className="text-[9px] text-gray-600 ml-2">({activeFiltersSummary})</span>}
                </p>
              </div>
              <div className="text-right font-mono text-[9px]">
                <p className="font-black text-black uppercase text-[10px]">UPFITTERS OS</p>
                <p className="text-gray-700">Printed: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
              </div>
            </div>

            {/* KPI Summary Bar (5 Metrics across) */}
            <div className="grid grid-cols-5 gap-1.5 mb-1">
              <div className="border border-black bg-zinc-100 p-1 text-center">
                <div className="text-[8px] font-mono font-bold uppercase text-gray-700">Total Completed Book Time</div>
                <div className="text-sm font-black text-black font-mono">{totalCoverBookHours.toFixed(1)}h</div>
              </div>
              <div className="border border-black bg-zinc-100 p-1 text-center">
                <div className="text-[8px] font-mono font-bold uppercase text-gray-700">Total Clocked Hours</div>
                <div className="text-sm font-black text-black font-mono">{totalCoverShiftHours.toFixed(1)}h</div>
                <div className="text-[7.5px] text-gray-600 font-mono">({totalBookTechShiftHours.toFixed(1)}h Tech Shift)</div>
              </div>
              <div className="border border-black bg-zinc-100 p-1 text-center">
                <div className="text-[8px] font-mono font-bold uppercase text-gray-700">Shift Efficiency (On Clock)</div>
                <div className="text-sm font-black text-black font-mono">
                  {totalShiftEfficiency !== null ? `${totalShiftEfficiency}%` : 'N/A'}
                </div>
                <div className="text-[7.5px] text-gray-600 font-mono">
                  {totalCoverBookHours.toFixed(1)}h Book ÷ {totalBookTechShiftHours.toFixed(1)}h Shift
                </div>
              </div>
              <div className="border border-black bg-zinc-100 p-1 text-center">
                <div className="text-[8px] font-mono font-bold uppercase text-gray-700">Task Efficiency (On Job)</div>
                <div className="text-sm font-black text-black font-mono">
                  {totalTaskEfficiency !== null ? `${totalTaskEfficiency}%` : 'N/A'}
                </div>
                <div className="text-[7.5px] text-gray-600 font-mono">
                  {totalCoverBookHours.toFixed(1)}h Book ÷ {totalBookTechTaskHours.toFixed(1)}h Task Time
                </div>
              </div>
              <div className="border border-black bg-zinc-100 p-1 text-center">
                <div className="text-[8px] font-mono font-bold uppercase text-gray-700">Jobs & Tasks Done</div>
                <div className="text-sm font-black text-black font-mono">{summaryMetrics.uniqueJobsCount} Jobs</div>
                <div className="text-[7.5px] text-gray-600 font-mono">{summaryMetrics.totalCompletedTasks} Tasks Done</div>
              </div>
            </div>

            {/* Explanatory Note */}
            <div className="text-[8px] font-mono text-gray-600 mb-1.5 px-0.5 italic">
              * Note: Efficiency is calculated strictly on staff with completed book time. Shift Eff % = Completed Book Time ÷ Total Clocked Shift Hours. Task Eff % = Completed Book Time ÷ Actual Time Spent on Tasks.
            </div>

            {/* Staff Breakdown Table */}
            <div className="mb-2">
              <div className="bg-zinc-200 border border-black px-2 py-0.5 font-mono font-bold text-[9.5px] uppercase text-black flex justify-between">
                <span>STAFF PAYROLL & BOOK TIME SUMMARY</span>
                <span>{coverPageStaffData.length} Staff Members</span>
              </div>
              <table className="w-full text-left border-collapse border border-black text-[9.5px] font-mono">
                <thead>
                  <tr className="bg-zinc-100 text-black border-b border-black font-bold uppercase text-[8px]">
                    <th className="border border-black p-1 w-[17%]">Staff Member</th>
                    <th className="border border-black p-1 w-[12%]">Role / Dept</th>
                    <th className="border border-black p-1 w-[10%] text-right">Clocked Hours</th>
                    <th className="border border-black p-1 w-[11%] text-right">Completed Book</th>
                    <th className="border border-black p-1 w-[10%] text-right">Shift Eff (Clock)</th>
                    <th className="border border-black p-1 w-[10%] text-right">Task Time (Job)</th>
                    <th className="border border-black p-1 w-[10%] text-right">Task Eff (Job)</th>
                    <th className="border border-black p-1 w-[6%] text-center">Tasks</th>
                    <th className="border border-black p-1 w-[14%]">Jobs Worked</th>
                  </tr>
                </thead>
                <tbody>
                  {coverPageStaffData.map((st, idx) => {
                    return (
                      <tr key={st.id || idx} className={idx % 2 === 0 ? 'bg-zinc-50' : 'bg-white'}>
                        <td className="border border-black p-1 font-bold text-black truncate">
                          {st.name}
                        </td>
                        <td className="border border-black p-1 text-gray-800 truncate text-[9px]">
                          {st.role}
                        </td>
                        <td className="border border-black p-1 text-right font-black text-black">
                          {st.clockedShiftHours > 0 ? `${st.clockedShiftHours.toFixed(1)}h` : '0.0h'}
                        </td>
                        <td className="border border-black p-1 text-right font-black text-black">
                          {st.earnedBookHours > 0 ? `${st.earnedBookHours.toFixed(1)}h` : '0.0h'}
                        </td>
                        <td className="border border-black p-1 text-right font-bold">
                          {st.shiftEfficiencyPct !== null ? (
                            <span className={st.shiftEfficiencyPct >= 100 ? 'text-black font-black' : 'text-gray-800'}>
                              {st.shiftEfficiencyPct}%
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="border border-black p-1 text-right text-gray-800">
                          {st.actualJobHours > 0 ? `${st.actualJobHours.toFixed(1)}h` : '—'}
                        </td>
                        <td className="border border-black p-1 text-right font-bold">
                          {st.taskEfficiencyPct !== null ? (
                            <span className={st.taskEfficiencyPct >= 100 ? 'text-black font-black' : 'text-gray-800'}>
                              {st.taskEfficiencyPct}%
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="border border-black p-1 text-center font-bold text-black">
                          {st.tasksCount}
                        </td>
                        <td className="border border-black p-1 text-gray-800 truncate text-[8px]">
                          {st.jobsList.length > 0 ? st.jobsList.join(', ') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr 
                    className="border-t-2 border-black font-black text-black text-[9.5px]"
                    style={{ backgroundColor: '#fef08a', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                  >
                    <td className="border border-black p-1 uppercase" colSpan={2}>
                      TOTALS ({coverPageStaffData.length} Staff)
                    </td>
                    <td className="border border-black p-1 text-right">
                      {totalCoverShiftHours.toFixed(1)}h
                    </td>
                    <td className="border border-black p-1 text-right">
                      {totalCoverBookHours.toFixed(1)}h
                    </td>
                    <td className="border border-black p-1 text-right">
                      {totalShiftEfficiency !== null ? (
                        <span>
                          <strong className="text-black font-black">{totalShiftEfficiency}%</strong>
                          <span className="text-[7px] text-gray-600 block font-normal font-mono">({totalBookTechShiftHours.toFixed(1)}h shift)</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="border border-black p-1 text-right">
                      {totalCoverActualJobHours.toFixed(1)}h
                    </td>
                    <td className="border border-black p-1 text-right">
                      {totalTaskEfficiency !== null ? (
                        <span>
                          <strong className="text-black font-black">{totalTaskEfficiency}%</strong>
                          <span className="text-[7px] text-gray-600 block font-normal font-mono">({totalBookTechTaskHours.toFixed(1)}h task)</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {totalCoverTasks}
                    </td>
                    <td className="border border-black p-1 text-[8px]">
                      {summaryMetrics.uniqueJobsCount} Unique Jobs
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Verification & Sign-off Block */}
            <div className="border border-black p-1.5 bg-zinc-50 grid grid-cols-3 gap-3 text-[8.5px] font-mono">
              <div>
                <span className="font-bold text-gray-700 block">Report Prepared By:</span>
                <div className="border-b border-black mt-2.5" />
              </div>
              <div>
                <span className="font-bold text-gray-700 block">Payroll Processed Date & Sign:</span>
                <div className="border-b border-black mt-2.5" />
              </div>
            </div>
          </div>
        )}

        {(printMode === 'jobs' || printMode === 'full') ? (
          groupedJobsData
            .filter(jobData => printJobId === null || jobData.job.id === printJobId)
            .map((jobData) => {
            const { job, categories: categoriesToPrint } = jobData;
            const totalJobBookHours = Object.values(categoriesToPrint).flatMap((tasks: any) => tasks).reduce((sum: number, t: any) => sum + (t.bookHours || 0), 0);

            return (
              <div key={job.id} className="yellow-sheet-job-card mb-8">
                {/* 10px Yellow Strip across the top of printed sheets */}
                <div 
                  style={{
                    height: '10px',
                    backgroundColor: '#eab308',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact'
                  }}
                />
                {/* Job Info Box */}
                <div className="border-2 border-black p-3 bg-zinc-50 mb-3 flex justify-between items-start">
                  <div>
                    <h1 className="text-lg font-black text-black">JOB #{job.jobNumber} — {job.customerName}</h1>
                    {job.vehicleInfo && job.vehicleInfo !== 'N/A' && (
                      <p className="text-xs font-bold text-gray-900">Vehicle: {job.vehicleInfo}</p>
                    )}
                    <p className="text-[10px] font-mono text-gray-800">Status: {job.jobStatus}</p>
                    {statusFilter !== 'all' && activeFiltersSummary && (
                      <p className="text-[9px] font-bold text-red-700 uppercase tracking-wide mt-1">
                        ⚠️ FILTERED VIEW: {activeFiltersSummary} (Not a full sheet)
                      </p>
                    )}
                  </div>
                  <div className="text-right font-mono text-[11px]">
                    <p className="text-[10px] text-gray-800 font-bold">YELLOW SHEET REPORT</p>
                    <p className="text-sm font-black text-black">Total Book Time: {totalJobBookHours.toFixed(1)}h</p>
                  </div>
                </div>

                {/* Breakdown by Category */}
                {Object.entries(categoriesToPrint).map(([catName, catTasks]) => {
                  const catBookHours = catTasks.reduce((sum, t) => sum + (t.bookHours || 0), 0);

                  return (
                    <div key={catName} className="space-y-1">
                      {/* Category Header */}
                      <div className="bg-zinc-200 border border-black px-2 py-1 flex justify-between items-center font-mono font-bold text-[10px] uppercase text-black">
                        <span>CATEGORY: {catName}</span>
                        <span>Category Book Hours: {catBookHours.toFixed(1)}h</span>
                      </div>

                      {/* Tasks Excel Table */}
                      <table className="w-full text-left border-collapse border border-black text-[10px] font-mono">
                        <thead>
                          <tr className="bg-zinc-100 text-black border-b border-black font-bold uppercase">
                            <th className="border border-black p-1.5 w-[22%]">Task</th>
                            <th className="border border-black p-1.5 w-[14%]">Time Completed</th>
                            <th className="border border-black p-1.5 w-[8%] text-right">Book</th>
                            <th className="border border-black p-1.5 w-[8%] text-right">Time Spent</th>
                            <th className="border border-black p-1.5 w-[16%]">Tech</th>
                            <th className="border border-black p-1.5 w-[16%]">Task Notes</th>
                            <th className="border border-black p-1.5 w-[16%]">Payroll Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {catTasks.map((t, idx) => {
                            const rowStyle = getTaskRowColorStyles(t.bookHours, t.actualHours, idx % 2 === 0 ? '#f9fafb' : '#ffffff');
                            const hasStaffNotes = !!(t.staffNotes && t.staffNotes.trim() && t.staffNotes.trim() !== '—');

                            return (
                              <Fragment key={t.id || idx}>
                                <tr style={rowStyle} className={hasStaffNotes ? "border-t border-black" : "border-b border-black"}>
                                  <td className="border border-black p-1.5 font-bold text-black">
                                    <div>{t.taskTitle}</div>
                                    {getTaskCategoryDisplay(t) && (
                                      <div className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">
                                        {getTaskCategoryDisplay(t)}
                                      </div>
                                    )}
                                  </td>
                                  <td className="border border-black p-1.5 text-black">
                                    {t.completed ? (
                                      t.completedAt ? (
                                        <span className="font-mono text-[10px] font-medium text-black">
                                          {t.completedAt.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })}{' '}
                                          {t.completedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-bold text-gray-400">COMPLETED</span>
                                      )
                                    ) : (
                                      <span className={cn(
                                        "px-1 py-0.5 rounded text-[10px] font-bold uppercase border",
                                        t.statusCode === 'in_progress' ? "bg-amber-200 text-amber-950 border-amber-600 font-bold" :
                                        "bg-gray-200 text-gray-800 border-gray-400"
                                      )}>
                                        {t.statusLabel}
                                      </span>
                                    )}
                                  </td>
                                  <td className="border border-black p-1.5 text-right font-black text-black">{t.bookHours?.toFixed(1)}h</td>
                                  <td className="border border-black p-1.5 text-right text-black font-medium">{t.actualDurationStr || (t.actualHours > 0 ? `${t.actualHours.toFixed(1)}h` : '—')}</td>
                                  <td className="border border-black p-1.5 font-semibold text-black">
                                    {t.completed ? (
                                      <p>{t.completedBy || 'Technician'}</p>
                                    ) : (
                                      <span className="text-gray-400 font-normal">—</span>
                                    )}
                                  </td>
                                  <td className="border border-black p-1.5 text-black whitespace-pre-wrap">{t.taskNotes || '—'}</td>
                                  <td className="border border-black p-1.5 text-black whitespace-pre-wrap">{t.payrollNotes || '—'}</td>
                                </tr>
                                {hasStaffNotes && (
                                  <tr style={rowStyle} className="border-b border-black">
                                    <td colSpan={7} className="border border-black px-2 py-0.5">
                                      <div className="flex items-center gap-1.5 text-[8.5px] font-mono text-black leading-tight pl-8">
                                        <span className="text-gray-600 font-bold shrink-0">↳ 💬 STAFF NOTE:</span>
                                        <span className="italic text-gray-800">{t.staffNotes.split(/\r?\n+/).map((s: string) => s.trim()).filter(Boolean).join(' | ')}</span>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}

                {/* Pace Color Legend */}
                <div className="text-[7.5px] font-mono text-gray-600 mt-2 flex items-center justify-between border-t border-gray-300 pt-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-black">Pace Audit:</span>
                    <span className="inline-flex items-center gap-1"><span style={{ backgroundColor: '#f0fdf4', width: 9, height: 9, border: '1px solid #86efac', display: 'inline-block' }} /> <strong>On Target</strong> (85%–115%)</span>
                    <span className="inline-flex items-center gap-1"><span style={{ backgroundColor: '#fefce8', width: 9, height: 9, border: '1px solid #fde047', display: 'inline-block' }} /> <strong>Pace Variance</strong> (60–84% / 116–200%)</span>
                    <span className="inline-flex items-center gap-1"><span style={{ backgroundColor: '#fff1f2', width: 9, height: 9, border: '1px solid #fda4af', display: 'inline-block' }} /> <strong>Needs Review</strong> (&lt;60% Bottleneck / &gt;200% Under-Clocked)</span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          groupedStaffData.map((staffData) => {
            const { staffId, staffName, tasks, totalBookHours, totalActualHours, totalShiftHours } = staffData as any;
            const taskEfficiency = totalActualHours > 0 ? Math.round((totalBookHours / totalActualHours) * 100) : null;
            const shiftEfficiency = (totalShiftHours || 0) > 0 ? Math.round((totalBookHours / totalShiftHours) * 100) : null;

            return (
              <div key={staffId} className="yellow-sheet-job-card mb-8">
                {/* 10px Yellow Strip across the top of printed sheets */}
                <div 
                  style={{
                    height: '10px',
                    backgroundColor: '#eab308',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact'
                  }}
                />
                {/* Staff Info Box */}
                <div className="border-2 border-black p-3 bg-zinc-50 mb-3 flex justify-between items-start">
                  <div>
                    <h1 className="text-lg font-black text-black">LABOR & PAYOUT REPORT — {staffName.toUpperCase()}</h1>
                    <p className="text-xs font-bold text-gray-900">
                      Period: {dateRange.start ? dateRange.start.toLocaleDateString() : 'All'} to {dateRange.end ? dateRange.end.toLocaleDateString() : 'All'}
                    </p>
                    {activeStaffFiltersSummary && (
                      <p className="text-[9px] font-bold text-red-700 uppercase tracking-wide mt-1">
                        ⚠️ FILTER DETAILS: {activeStaffFiltersSummary}
                      </p>
                    )}
                  </div>
                  <div className="text-right font-mono text-[11px] leading-tight space-y-0.5">
                    <p className="text-[10px] text-gray-800 font-bold tracking-wider">STAFF REPORT</p>
                    <p className="text-xs font-black text-black">Completed Book Time: {totalBookHours.toFixed(1)}h</p>
                    <p className="text-xs font-bold text-gray-900">
                      Time Spent on Book Time: {totalActualHours > 0 ? (totalActualHours < 0.1 ? `${Math.max(1, Math.round(totalActualHours * 60))}m` : `${totalActualHours.toFixed(1)}h`) : '0.0h'}
                      {taskEfficiency !== null ? ` (${taskEfficiency}%)` : ''}
                    </p>
                    <p className="text-xs font-bold text-gray-900">
                      Time on Clock: {(totalShiftHours || 0) > 0 ? ((totalShiftHours || 0) < 0.1 ? `${Math.max(1, Math.round((totalShiftHours || 0) * 60))}m` : `${(totalShiftHours || 0).toFixed(1)}h`) : '0.0h'}
                      {shiftEfficiency !== null ? ` (${shiftEfficiency}%)` : ''}
                    </p>
                  </div>
                </div>

                {/* Tasks Table */}
                <table className="w-full text-left border-collapse border border-black text-[10px] font-mono">
                  <thead>
                    <tr className="bg-zinc-100 text-black border-b border-black font-bold uppercase">
                      <th className="border border-black p-1.5 w-[18%]">Job</th>
                      <th className="border border-black p-1.5 w-[22%]">Task</th>
                      <th className="border border-black p-1.5 w-[14%]">Time Completed</th>
                      <th className="border border-black p-1.5 w-[8%] text-right">Book</th>
                      <th className="border border-black p-1.5 w-[8%] text-right">Clocked</th>
                      <th className="border border-black p-1.5 w-[8%] text-right">Eff %</th>
                      <th className="border border-black p-1.5 w-[11%]">Task Notes</th>
                      <th className="border border-black p-1.5 w-[11%]">Payroll Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t: any, idx: number) => {
                      const eff = t.workerActualHours > 0 ? Math.round((t.splitBookHours / t.workerActualHours) * 100) : null;
                      const jobInfo = `#${t.jobNumber} ${t.customerName}`;
                      const rowStyle = getTaskRowColorStyles(t.splitBookHours || t.bookHours, t.workerActualHours || t.actualHours, idx % 2 === 0 ? '#f9fafb' : '#ffffff');
                      const hasStaffNotes = !!(t.staffNotes && t.staffNotes.trim() && t.staffNotes.trim() !== '—');

                      return (
                        <Fragment key={t.id || idx}>
                          <tr style={rowStyle} className={hasStaffNotes ? "border-t border-black" : "border-b border-black"}>
                            <td className="border border-black p-1.5 font-bold text-black truncate max-w-[140px]" title={jobInfo}>{jobInfo}</td>
                            <td className="border border-black p-1.5 font-bold text-black">
                              <div>{t.taskTitle}</div>
                              {getTaskCategoryDisplay(t) && (
                                <div className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">
                                  {getTaskCategoryDisplay(t)}
                                </div>
                              )}
                            </td>
                            <td className="border border-black p-1.5 text-black">
                              {t.completed && t.completedAt ? (
                                <span className="font-mono text-[10px] font-medium text-black">
                                  {t.completedAt.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })}{' '}
                                  {t.completedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                </span>
                              ) : t.completed ? (
                                <span className="text-[9px] font-bold text-gray-500">COMPLETED</span>
                              ) : (
                                <span className="text-[9px] text-gray-600 uppercase font-bold">{t.statusLabel}</span>
                              )}
                            </td>
                            <td className="border border-black p-1.5 text-right font-black text-black">
                              {t.splitBookHours?.toFixed(1)}h
                              {t.workers && t.workers.length > 1 && (
                                <span className="text-[8px] text-gray-600 block font-normal">
                                  ({t.workers.find((w: any) => w.id === staffId)?.pct}%)
                                </span>
                              )}
                            </td>
                            <td className="border border-black p-1.5 text-right text-black">
                              {t.workerActualHours > 0 ? (
                                t.workerActualHours < 0.1 ? `${Math.max(1, Math.round(t.workerActualHours * 60))}m` : `${t.workerActualHours.toFixed(1)}h`
                              ) : '—'}
                            </td>
                            <td className="border border-black p-1.5 text-right font-bold text-black">
                              {eff !== null ? `${eff}%` : '—'}
                            </td>
                            <td className="border border-black p-1.5 text-black whitespace-pre-wrap">{t.taskNotes || '—'}</td>
                            <td className="border border-black p-1.5 text-black whitespace-pre-wrap">{t.payrollNotes || '—'}</td>
                          </tr>
                          {hasStaffNotes && (
                            <tr style={rowStyle} className="border-b border-black">
                              <td colSpan={8} className="border border-black px-2 py-0.5">
                                <div className="flex items-center gap-1.5 text-[8.5px] font-mono text-black leading-tight pl-8">
                                  <span className="text-gray-600 font-bold shrink-0">↳ 💬 STAFF NOTE:</span>
                                  <span className="italic text-gray-800">{t.staffNotes.split(/\r?\n+/).map((s: string) => s.trim()).filter(Boolean).join(' | ')}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pace Color Legend */}
                <div className="text-[7.5px] font-mono text-gray-600 mt-2 flex items-center justify-between border-t border-gray-300 pt-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-black">Pace Audit:</span>
                    <span className="inline-flex items-center gap-1"><span style={{ backgroundColor: '#f0fdf4', width: 9, height: 9, border: '1px solid #86efac', display: 'inline-block' }} /> <strong>On Target</strong> (85%–115%)</span>
                    <span className="inline-flex items-center gap-1"><span style={{ backgroundColor: '#fefce8', width: 9, height: 9, border: '1px solid #fde047', display: 'inline-block' }} /> <strong>Pace Variance</strong> (60–84% / 116–200%)</span>
                    <span className="inline-flex items-center gap-1"><span style={{ backgroundColor: '#fff1f2', width: 9, height: 9, border: '1px solid #fda4af', display: 'inline-block' }} /> <strong>Needs Review</strong> (&lt;60% Bottleneck / &gt;200% Under-Clocked)</span>
                  </div>
                </div>

                {/* Time Clock Shift Sessions Table */}
                <div className="mt-4 border border-black">
                  <div 
                    className="flex items-center justify-between px-2 py-1 border-b border-black font-bold uppercase text-[9px] tracking-wider text-black"
                    style={{ backgroundColor: '#f4f4f5', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-black" />
                      <span>TIME CLOCK SHIFT SESSIONS ({staffData.shifts?.length || 0} Shifts in Period)</span>
                    </div>
                    <span className="font-mono font-black text-black">TOTAL SHIFT TIME: {(totalShiftHours || 0).toFixed(1)}h</span>
                  </div>
                  <table className="w-full text-left border-collapse text-[9px] font-mono">
                    <thead>
                      <tr className="bg-zinc-100 text-black border-b border-black font-bold uppercase text-[8.5px]">
                        <th className="border border-black p-1 w-[16%]">Date</th>
                        <th className="border border-black p-1 w-[14%]">Clock In</th>
                        <th className="border border-black p-1 w-[14%]">Clock Out</th>
                        <th className="border border-black p-1 w-[12%] text-center">Unpaid Break</th>
                        <th className="border border-black p-1 w-[12%] text-right">Shift Hours</th>
                        <th className="border border-black p-1 w-[32%]">Notes / Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffData.shifts && staffData.shifts.length > 0 ? (
                        staffData.shifts.map((sh: any, sIdx: number) => (
                          <tr key={sh.id || sIdx} className={sIdx % 2 === 0 ? 'bg-zinc-50' : 'bg-white'}>
                            <td className="border border-black p-1 font-bold text-black">{sh.dateStr}</td>
                            <td className="border border-black p-1 text-black font-medium">{sh.clockInStr}</td>
                            <td className="border border-black p-1 text-black font-medium">{sh.clockOutStr}</td>
                            <td className="border border-black p-1 text-center text-gray-700">{sh.breakDurationMin > 0 ? `${sh.breakDurationMin}m` : '0m'}</td>
                            <td className="border border-black p-1 text-right font-black text-black">{sh.shiftHours.toFixed(1)}h</td>
                            <td className="border border-black p-1 text-black truncate max-w-[200px]">{sh.notes || '—'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="border border-black p-2 text-center text-gray-500 italic">
                            No time clock shift records logged in this pay period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr 
                        className="border-t-2 border-black font-black text-black text-[9.5px]"
                        style={{ backgroundColor: '#fef08a', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                      >
                        <td colSpan={4} className="border border-black p-1 uppercase text-right">
                          Total Shift Time On Clock:
                        </td>
                        <td className="border border-black p-1 text-right text-black font-black font-mono">
                          {(totalShiftHours || 0).toFixed(1)}h
                        </td>
                        <td className="border border-black p-1 text-[8px] text-gray-800">
                          Reconciled against {totalBookHours.toFixed(1)}h completed book time
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal 1: Multi-Tech Custom Split Adjustment Modal */}
      {editingSplitTask && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-black uppercase text-white tracking-wider">Adjust Payout Book Time Split</h3>
              </div>
              <button 
                onClick={() => setEditingSplitTask(null)}
                className="text-zinc-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-bold text-white">{editingSplitTask.task.taskTitle}</p>
              <p className="text-[10px] text-amber-400 font-mono">
                Total Book Time Owed: {editingSplitTask.task.totalBookHours} hrs
              </p>
              <p className="text-[10px] text-zinc-400">
                This splits the <strong>Book Time Owed (Labor Payout)</strong> for payroll. It does not alter actual clocked time sessions.
              </p>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-400">Presets:</span>
              <button
                onClick={() => {
                  const workers = editingSplitTask.task.workers || [];
                  const equalPct = Math.round(100 / workers.length);
                  const next: Record<string, number> = {};
                  workers.forEach((w: any) => next[w.name] = equalPct);
                  setCustomSplitPcts(next);
                }}
                className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono font-bold rounded border border-zinc-700 transition"
              >
                Equal 50/50
              </button>
              {editingSplitTask.task.workers?.length === 2 && (
                <button
                  onClick={() => {
                    const workers = editingSplitTask.task.workers || [];
                    setCustomSplitPcts({
                      [workers[0].name]: 70,
                      [workers[1].name]: 30
                    });
                  }}
                  className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-mono font-bold rounded border border-amber-500/30 transition"
                >
                  Seniority 70/30
                </button>
              )}
            </div>

            {/* Workers Percentage Controls */}
            <div className="space-y-3 pt-2">
              {editingSplitTask.task.workers?.map((w: any) => {
                const currentPct = customSplitPcts[w.name] ?? w.pct;
                const calcHours = ((editingSplitTask.task.totalBookHours * currentPct) / 100).toFixed(1);

                return (
                  <div key={w.name} className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-indigo-400" /> {w.name}
                      </span>
                      <span className="text-xs font-mono font-extrabold text-amber-400">
                        {calcHours} hrs Payout ({currentPct}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={currentPct}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setCustomSplitPcts(prev => ({
                            ...prev,
                            [w.name]: val
                          }));
                        }}
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={currentPct}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            setCustomSplitPcts(prev => ({
                              ...prev,
                              [w.name]: val
                            }));
                          }}
                          className="w-12 bg-zinc-900 border border-zinc-800 text-white text-center font-mono font-bold text-xs py-0.5 rounded focus:outline-none focus:border-amber-500"
                        />
                        <Percent className="w-3 h-3 text-zinc-500" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                onClick={() => setEditingSplitTask(null)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomSplit}
                disabled={savingSplit}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5"
              >
                {savingSplit ? (
                  <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Save Split</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Task Total Book Hours / Payout Adjustment Modal */}
      {editingBookTimeTask && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-black uppercase text-white tracking-wider">Edit Payout Book Hours</h3>
              </div>
              <button 
                onClick={() => setEditingBookTimeTask(null)}
                className="text-zinc-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-bold text-white">{editingBookTimeTask.task.taskTitle}</p>
              <p className="text-[10px] text-zinc-400">
                Adjust total book time payout owed for this task (e.g. increase from 1.0h to 4.0h based on review).
              </p>
            </div>

            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-300">Book Hours Owed (Payout):</label>
                <span className="text-xs font-mono font-extrabold text-amber-400">{newBookHours.toFixed(1)} hrs</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="100"
                  value={newBookHours}
                  onChange={e => setNewBookHours(parseFloat(e.target.value) || 0)}
                  className="flex-1 bg-zinc-900 border border-zinc-800 text-white font-mono font-bold text-sm px-3 py-1.5 rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Quick Hours Preset Adjust Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] font-mono text-zinc-500">Quick Adjust:</span>
                {[1, 2, 3, 4, 5, 8].map(h => (
                  <button
                    key={h}
                    onClick={() => setNewBookHours(h)}
                    className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-[10px] font-mono font-bold rounded border border-zinc-700 transition"
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                onClick={() => setEditingBookTimeTask(null)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBookTimeHours}
                disabled={savingBookHours}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5"
              >
                {savingBookHours ? (
                  <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save Book Hours</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Edit Task Notes & Staff Completion Notes Modal */}
      {editingTaskNotes && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-black uppercase text-white tracking-wider">Edit Task & Staff Notes</h3>
              </div>
              <button 
                onClick={() => setEditingTaskNotes(null)}
                className="text-zinc-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-bold text-white">{editingTaskNotes.task.taskTitle}</p>
              <p className="text-[10px] text-zinc-400">
                Payroll Admins and Managers can edit or add task specification details and technician completion notes below.
              </p>
            </div>

            <div className="space-y-3">
              {/* Task Spec Description */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-300 block">Task Description / Instructions (Specs):</label>
                <textarea
                  rows={3}
                  placeholder="Task instructions, customer specs, or labor details..."
                  value={editTaskSpecNote}
                  onChange={e => setEditTaskSpecNote(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs p-3 rounded-lg focus:outline-none focus:border-amber-500 font-sans"
                />
              </div>

              {/* Tech / Staff Notes */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-amber-300 block">Tech Completion / Staff Notes:</label>
                <textarea
                  rows={2}
                  placeholder="Technician completion notes or work remarks..."
                  value={editStaffTechNote}
                  onChange={e => setEditStaffTechNote(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs p-3 rounded-lg focus:outline-none focus:border-amber-500 font-sans"
                />
              </div>

              {/* Payroll Notes */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-indigo-300 block">Payroll Notes (Internal Payroll Remarks):</label>
                <textarea
                  rows={2}
                  placeholder="Internal payroll admin notes, payout adjustments, or approval remarks..."
                  value={editPayrollNote}
                  onChange={e => setEditPayrollNote(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs p-3 rounded-lg focus:outline-none focus:border-indigo-500 font-sans"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                onClick={() => setEditingTaskNotes(null)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTaskNotes}
                disabled={savingTaskNotes}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5"
              >
                {savingTaskNotes ? (
                  <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save Notes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Add New Task to Job for Payout */}
      {addingTaskForJob && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-black uppercase text-white tracking-wider">Add Task for Payout</h3>
              </div>
              <button 
                onClick={() => setAddingTaskForJob(null)}
                className="text-zinc-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300 uppercase font-mono">
                  JOB #{addingTaskForJob.jobNumber}
                </span>
                <span className="text-xs font-bold text-white">{addingTaskForJob.customerName}</span>
              </div>
              <p className="text-[10px] text-zinc-400">
                Add a completed task directly to this job so it is included in Yellow Sheets payout.
              </p>
            </div>

            <div className="space-y-3">
              {/* Task Title */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-300">Task Title / Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Custom Radio Wiring & Relay Setup"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Task Category & Book Hours */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-300">Task Category</label>
                  <select
                    value={newTaskCategory}
                    onChange={e => setNewTaskCategory(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="UPFITTING">UPFITTING</option>
                    <option value="ELECTRICAL">ELECTRICAL</option>
                    <option value="LIGHTING">LIGHTING</option>
                    <option value="FABRICATION">FABRICATION</option>
                    <option value="DECAL">DECAL / GRAPHICS</option>
                    <option value="MISC">MISC</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-300">Book Hours Owed *</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.1"
                    max="100"
                    value={newTaskBookHours}
                    onChange={e => setNewTaskBookHours(parseFloat(e.target.value) || 0)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white font-mono font-bold text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Assign Active Technician(s) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-300">Assigned Technician(s) for Payout</label>
                <div className="max-h-32 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-lg p-2 space-y-1">
                  {activeStaff.map(s => {
                    const sName = `${s.firstName || s.name || 'Staff'} ${s.lastName || ''}`.trim();
                    const isChecked = newTaskTechIds.includes(s.id);

                    return (
                      <label key={s.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-zinc-900 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setNewTaskTechIds(prev => [...prev, s.id]);
                            } else {
                              setNewTaskTechIds(prev => prev.filter(id => id !== s.id));
                            }
                          }}
                          className="accent-amber-400 rounded cursor-pointer"
                        />
                        <span className="text-xs font-medium text-white">{sName}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">({s.role || 'Tech'})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Task Description / Notes */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-300">Notes / Details (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Discussed with manager - approved 4 hours labor payout"
                  value={newTaskNotes}
                  onChange={e => setNewTaskNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                onClick={() => setAddingTaskForJob(null)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewTask}
                disabled={savingNewTask || !newTaskTitle.trim()}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingNewTask ? (
                  <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Add Task to Yellow Sheets</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Yellow Sheets Audit Trail Log Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-black uppercase text-white tracking-wider">Yellow Sheets Audit Trail</h3>
                  <p className="text-[10px] text-zinc-400">Complete record of book hours adjustments, split modifications, notes edits, and added tasks</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAuditModal(false)}
                className="text-zinc-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-8 text-center bg-zinc-950 rounded-xl border border-zinc-800/80 space-y-2">
                <History className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400 font-medium">No audit entries recorded yet.</p>
                <p className="text-[10px] text-zinc-500">Every change made to book hours, splits, or notes will be permanently logged here.</p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto space-y-2.5 pr-1">
                {auditLogs.map((log, idx) => {
                  const logDate = parseSafeDate(log.timestamp);
                  const dateStr = logDate ? `${logDate.toLocaleDateString()} ${logDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'N/A';

                  return (
                    <div key={log.id || idx} className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase border",
                            log.action?.includes('Hours') ? "bg-amber-500/10 text-amber-300 border-amber-500/20" :
                            log.action?.includes('Split') ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" :
                            log.action?.includes('Added') ? "bg-teal-500/10 text-teal-300 border-teal-500/20" :
                            "bg-zinc-800 text-zinc-300 border-zinc-700"
                          )}>
                            {log.action || 'Audit Log'}
                          </span>
                          {log.jobNumber && (
                            <span className="text-[10px] font-mono font-bold text-amber-400">
                              JOB #{log.jobNumber}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500">{dateStr}</span>
                      </div>

                      <p className="text-zinc-200 font-sans text-xs pt-0.5">{log.details}</p>

                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 pt-1 border-t border-zinc-900">
                        <User className="w-3 h-3 text-indigo-400" />
                        <span>Changed by: <strong className="text-white">{log.changedBy || log.changedByEmail || 'Admin'}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-end border-t border-zinc-800 pt-3">
              <button
                onClick={() => {
                  setShowAuditModal(false);
                }}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Close Audit Trail
              </button>
            </div>
          </div>
        </div>
      )}

      
      {/* Modal 6: Edit Time Clock Shift */}
      {editingShiftSession && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-black text-white">Edit Shift - {editingShiftSession.staffName}</h3>
              <button onClick={() => setEditingShiftSession(null)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-zinc-300">Clock In</label>
                <input type="time" value={editingShiftSession.clockInTime} onChange={e => setEditingShiftSession({...editingShiftSession, clockInTime: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-2 text-xs" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-300">Clock Out</label>
                <input type="time" value={editingShiftSession.clockOutTime} onChange={e => setEditingShiftSession({...editingShiftSession, clockOutTime: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-2 text-xs" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-300">Break Deduction (mins)</label>
                <input type="number" value={editingShiftSession.breakMinutes} onChange={e => setEditingShiftSession({...editingShiftSession, breakMinutes: parseInt(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-2 text-xs" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-300">Edit Reason *</label>
                <input type="text" placeholder="Reason for editing" value={editingShiftSession.editReason} onChange={e => setEditingShiftSession({...editingShiftSession, editReason: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-2 text-xs" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-300">Notes</label>
                <input type="text" value={editingShiftSession.notes} onChange={e => setEditingShiftSession({...editingShiftSession, notes: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-2 text-xs" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <button onClick={() => setEditingShiftSession(null)} className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded text-xs">Cancel</button>
              <button onClick={handleSaveShiftSession} disabled={savingShiftSession || !editingShiftSession.editReason.trim()} className="px-4 py-1.5 bg-amber-500 text-zinc-950 font-bold rounded text-xs">Save Shift</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 7: Add Manual Shift */}
      {addingShiftStaff && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-black text-white">Add Shift - {addingShiftStaff.staffName}</h3>
              <button onClick={() => setAddingShiftStaff(null)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-zinc-300">Date *</label>
                <input type="date" value={newShiftDate} onChange={e => setNewShiftDate(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-2 text-xs" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-300">Clock In</label>
                <input type="time" value={newShiftClockIn} onChange={e => setNewShiftClockIn(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-2 text-xs" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-300">Clock Out</label>
                <input type="time" value={newShiftClockOut} onChange={e => setNewShiftClockOut(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-2 text-xs" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-300">Lunch Deduction (mins)</label>
                <input type="number" value={newShiftBreakMins} onChange={e => setNewShiftBreakMins(parseInt(e.target.value) || 0)} className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-2 text-xs" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-300">Reason / Notes</label>
                <input type="text" placeholder="Forgotten clock in, etc." value={newShiftNotes} onChange={e => setNewShiftNotes(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-2 text-xs" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <button onClick={() => setAddingShiftStaff(null)} className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded text-xs">Cancel</button>
              <button onClick={handleCreateManualShift} disabled={savingNewShift || !newShiftDate} className="px-4 py-1.5 bg-amber-500 text-zinc-950 font-bold rounded text-xs">Create Shift</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 8: Delete Shift Confirmation */}
      {deletingShiftSession && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-center">
            <h3 className="text-sm font-black text-rose-500">Delete Shift Record?</h3>
            <p className="text-xs text-zinc-400">
              Are you sure you want to permanently delete the {deletingShiftSession.hours.toFixed(1)}h shift for {deletingShiftSession.staffName} on {deletingShiftSession.dateStr}? This action cannot be undone and will be logged in the audit trail.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <button onClick={() => setDeletingShiftSession(null)} className="px-4 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg text-xs">Cancel</button>
              <button onClick={handleDeleteShiftSession} disabled={deletingShiftLoading} className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs">Delete Shift</button>
            </div>
          </div>
        </div>
      )}
{/* Global CSS for Print Media to ensure clean landscape Excel spreadsheet printing */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 0.3in;
          }
          body * {
            visibility: hidden !important;
          }
          #yellow-sheets-print-area, #yellow-sheets-print-area * {
            visibility: visible !important;
          }
          #yellow-sheets-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .yellow-sheet-cover-page {
            page-break-before: avoid !important;
            break-before: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            display: block !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .yellow-sheet-job-card {
            page-break-before: always !important;
            break-before: page !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .yellow-sheet-job-card:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      `}</style>



    </div>
  );
}
