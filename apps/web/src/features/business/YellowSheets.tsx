import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc, addDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase/config';
import {
  FileSpreadsheet, Clock, User,
  Search, ChevronDown, ChevronRight, Calendar,
  RotateCcw, FileText, Check, ShieldCheck, Tag, Sliders, Edit3, X, Percent, Plus, Save,
  History, Building2, ExternalLink
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { resolvePermissions } from '../../lib/auth/permissions';

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

const calculateTaskActualDuration = (t: any, secondsMap?: Record<string, number>): { totalSec: number; formattedStr: string; actualHours: number } => {
  if (!t) return { totalSec: 0, formattedStr: '0m', actualHours: 0 };

  let totalSec = 0;

  if (secondsMap) {
    const mappedSecByTaskId = t.id ? (secondsMap[t.id] || 0) : 0;
    const taskNameStr = safeString(t.name || t.title || t.taskTitle, '').toLowerCase().trim();
    const mappedSecByName = (t.jobId && taskNameStr) ? (secondsMap[`${t.jobId}_${taskNameStr}`] || 0) : 0;
    totalSec = Math.max(mappedSecByTaskId, mappedSecByName);
  }

  if (totalSec === 0 && Array.isArray(t.timeSessions) && t.timeSessions.length > 0) {
    t.timeSessions.forEach((s: any) => {
      const dur = parseFloat(s.duration || s.elapsedTime || s.seconds || s.timeSpent || '0');
      if (dur > 0) {
        totalSec += (dur < 300 && s.minutes ? dur * 60 : dur);
      }
    });
  }

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

const resolveTaskNotes = (t: any): { taskNotes: string; staffNotes: string } => {
  if (!t) return { taskNotes: '', staffNotes: '' };

  let taskNotes = safeString(
    t.description || t.notes || t.note || t.instructions || t.instruction || 
    t.specNotes || t.taskNotes || t.details || t.taskDescription || t.text || t.summary, 
    ''
  );

  const staffNotesList: string[] = [];

  const directStaffNote = safeString(
    t.techNote || t.techNotes || t.staffNotes || t.staffNote || 
    t.completionNote || t.completionNotes || t.qcNote || t.qcNotes || 
    t.comment || t.comments || t.workNote || t.workNotes || t.notesText,
    ''
  );
  if (directStaffNote && directStaffNote !== taskNotes) {
    staffNotesList.push(directStaffNote);
  }

  if (Array.isArray(t.timeSessions) && t.timeSessions.length > 0) {
    t.timeSessions.forEach((s: any) => {
      const sessNote = safeString(s.notes || s.note || s.comment || s.completionNote || s.workNote, '');
      const sName = s.staffName || s.techName || s.userName || '';
      if (sessNote && !staffNotesList.includes(sessNote) && sessNote !== taskNotes) {
        staffNotesList.push(sName ? `${sName}: "${sessNote}"` : `"${sessNote}"`);
      }
    });
  }

  if (Array.isArray(t.workLogs) && t.workLogs.length > 0) {
    t.workLogs.forEach((w: any) => {
      const logNote = safeString(w.notes || w.note || w.comment || w.text, '');
      const wName = w.staffName || w.userName || '';
      if (logNote && !staffNotesList.includes(logNote) && logNote !== taskNotes) {
        staffNotesList.push(wName ? `${wName}: "${logNote}"` : `"${logNote}"`);
      }
    });
  }

  return {
    taskNotes,
    staffNotes: staffNotesList.join('\n')
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

  // Filter States
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  const [selectedDept, setSelectedDept] = useState<string>('upfitters');
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'completed_only' | 'all' | 'in_progress' | 'not_started'>('completed_only');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedJobIds, setExpandedJobIds] = useState<Record<string, boolean>>({});

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

  // Subscribe to audit logs
  useEffect(() => {
    if (!tenantId) return;
    const unsubAudit = onSnapshot(collection(db, `businesses/${tenantId}/audit_logs`), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const filtered = list.filter(l => l.category === 'yellow_sheets');
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
  const { taskActualSecondsMap, taskTimeSegmentsMap } = useMemo(() => {
    const secMap: Record<string, number> = {};
    const segMap: Record<string, Array<{
      sessionId: string;
      userName: string;
      start: Date;
      end: Date;
      durationSec: number;
      isOvernightOrLong: boolean;
      isOpen: boolean;
    }>> = {};

    const nowMs = Date.now();

    timeSessionsList.forEach(session => {
      const sUser = session.userName || session.staffName || session.userEmail || 'Tech';
      const sessionJobs = session.jobs || [];

      sessionJobs.forEach((seg: any) => {
        if (!seg) return;
        const startMs = seg.start?.toDate ? seg.start.toDate().getTime() : (parseSafeDate(seg.start)?.getTime() || 0);
        if (!startMs) return;

        const startDate = new Date(startMs);

        // Filter session start to selected date range if dateRange is set
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
          userName: sUser,
          start: startDate,
          end: endDate,
          durationSec,
          isOvernightOrLong,
          isOpen
        };

        const keys: string[] = [];
        if (seg.taskId) keys.push(seg.taskId);
        if (seg.id && (seg.taskName || seg.name)) {
          const tName = (seg.taskName || seg.name).toLowerCase().trim();
          keys.push(`${seg.id}_${tName}`);
        }

        keys.forEach(k => {
          secMap[k] = (secMap[k] || 0) + durationSec;
          if (!segMap[k]) segMap[k] = [];
          segMap[k].push(segmentObj);
        });
      });
    });

    return { taskActualSecondsMap: secMap, taskTimeSegmentsMap: segMap };
  }, [timeSessionsList, dateRange]);

  // Helper to extract detailed time segments for a specific task
  const getTaskSegments = (t: any, job: any, segmentsMap: Record<string, any[]>) => {
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

    const tTitle = safeString(t.name || t.title || t.taskTitle, '').toLowerCase().trim();
    const key = `${t.jobId || job.id}_${tTitle}`;
    if (tTitle && segmentsMap[key]) {
      segmentsMap[key].forEach(s => {
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
          list.push({
            sessionId: s.id || 'inline',
            userName: s.userName || s.techName || t.completedBy || 'Tech',
            start: sIn,
            end: endD,
            durationSec,
            isOvernightOrLong: durationSec > 10 * 3600 || (isCrossMidnight && durationSec > 4 * 3600),
            isOpen: !sOut
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

  // Helper to resolve Staff details and handle multi-tech labor assignments/splits
  const resolveTaskWorkers = (t: any, job: any): { workers: { id: string; name: string; pct: number; splitHours: number }[]; closedByManager: string } => {
    const isOfficeOrManager = (sId?: string, sName?: string) => {
      if (!sId && !sName) return false;
      const nameLower = (sName || '').toLowerCase();
      if (nameLower.includes('kathy') || nameLower.includes('couch') || nameLower.includes('admin') || nameLower.includes('manager')) {
        return true;
      }
      const found = staff.find(s => s.id === sId || s.userId === sId || s.name === sName || `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase() === nameLower);
      if (found) {
        const role = (found.role || found.department || '').toLowerCase();
        return found.isManager === true || found.isOffice === true || ['office', 'manager', 'admin', 'super_admin', 'executive', 'director'].includes(role);
      }
      return false;
    };

    const formatStaff = (sId?: string, sName?: string): { id: string; name: string } | null => {
      if (!sId && !sName) return null;
      const nameLower = (sName || '').toLowerCase();
      const found = staff.find(s => s.id === sId || s.userId === sId || s.name === sName || `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase() === nameLower);
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
          const tTitle = seg.taskName || seg.name || 'General Task';
          const key = `unassigned_${tTitle.toLowerCase().trim()}_${sUser.toLowerCase().trim()}`;
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
                userName: sUser
              }],
              notes: seg.notes || 'Unassigned shop task clock-in'
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
        const cDate = parseSafeDate(t.completedAt || t.completedDate || t.qcCompletedAt || t.closedAt);
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
        const compDate = parseSafeDate(t.completedAt || t.completedDate || t.qcCompletedAt || t.closedAt);

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

        const taskTitle = safeString(t.name || t.title || t.taskTitle, 'Task');
        const rawTaskCat = safeString(t.taskGroup || t.category || t.categoryName || t.departmentName || t.department, 'UNCATEGORIZED');
        const taskCategory = rawTaskCat.toUpperCase();
        const totalBookHours = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0');
        const bookHours = selectedStaffId !== 'all' ? activeWorkerSplitHours : totalBookHours;
        const { taskNotes, staffNotes } = resolveTaskNotes(t);
        let efficiencyPct: number | null = null;
        if (completed && actualHours > 0 && bookHours > 0) {
          efficiencyPct = Math.round((bookHours / actualHours) * 100);
        }
        const completedByNames = workers.map(w => `${w.name} (${w.pct}% • ${w.splitHours.toFixed(1)}h)`).join(', ');
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
          completedAt: compDate,
          completedBy: safeString(completedByNames, 'Technician'),
          closedByManager,
          taskNotes,
          staffNotes,
          taskSegments,
          hasOvernightSegment,
          rawTask: t
        });
      });
    });

    return result;
  }, [jobs, tasksMap, staff, vehiclesList, dateRange, statusFilter, selectedStaffId, selectedDept, searchQuery, taskActualSecondsMap]);

  // Grouped Hierarchy: Job -> Task Category -> Tasks
  const groupedJobsData = useMemo(() => {
    const jobMap: Record<string, { job: any; categories: Record<string, any[]> }> = {};

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
          categories: {}
        };
      }

      const catName = t.taskCategory;
      if (!jobMap[t.jobId].categories[catName]) {
        jobMap[t.jobId].categories[catName] = [];
      }

      jobMap[t.jobId].categories[catName].push(t);
    });

    return Object.values(jobMap);
  }, [allFilteredTasks]);

  // Helper to determine if a technician belongs to the selected department for top payout cards
  const isTechInSelectedDept = (w: any, targetDept: string, staffList: any[]) => {
    if (targetDept === 'all') return true;

    const dTarget = targetDept.toLowerCase().trim();
    const wNameLower = (w.name || '').toLowerCase();
    
    // Explicit exclusion for Dan Urban and Patrick Losey when viewing Upfitters department
    if (dTarget === 'upfitters' && (
      wNameLower.includes('patrick losey') || 
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
      const sDept = safeString(sObj.department || sObj.departmentName || sObj.departmentId || sObj.role || sObj.title, '').toLowerCase();

      const isNonUpfitterStaff = sDept.includes('office') || 
                                 sDept.includes('admin') || 
                                 sDept.includes('owner') || 
                                 sDept.includes('management') || 
                                 sDept.includes('payroll') || 
                                 sDept.includes('sales');

      if (dTarget === 'upfitters') {
        if (isNonUpfitterStaff && !sDept.includes('upfit') && !sDept.includes('install') && !sDept.includes('shop') && !sDept.includes('tech')) {
          return false;
        }
        return true;
      }

      return sDept.includes(dTarget);
    }

    return true;
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

    return Object.values(map).sort((a, b) => b.bookHours - a.bookHours);
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
                staffNotes: editStaffTechNote.trim()
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
          updatedAt: new Date()
        });
      }

      await recordAuditLog('Task Notes Edited', `Job #${task.jobNumber} (${task.taskTitle}): Updated task instructions & staff completion notes`, jobId, task.jobNumber, task.id);

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

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 bg-zinc-950 font-sans text-xs select-none gap-6 overflow-auto min-h-screen text-zinc-100">
      
      {/* Master Yellow Sheets Command Container */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        
        {/* Row 1: Header Title & Audit Log */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white uppercase tracking-wider">Yellow Sheets</h1>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Labor Payout Report
                </span>
                {!canEdit && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center gap-1" title="Read-only view mode. Requires Yellow Sheets edit permission to adjust payout hours or splits.">
                    <ShieldCheck className="w-3 h-3 text-zinc-400" /> Read-Only
                  </span>
                )}
            </div>
          </div>

          {/* Audit Log Button */}
          <div className="flex items-center gap-2 shrink-0">
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

        {/* Row 2: Fixed Operational Metrics Bar (Updates in real time with filters, never jumps!) */}
        <div className="flex items-center gap-2 font-mono text-[10px] flex-wrap bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/80">
          <div className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20" title="Completed labor book hours in the selected date range">
            <span className="font-black text-white">⚡ {summaryMetrics.totalBookHours}h</span> Book Time (Selected Period)
          </div>
          
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition",
            summaryMetrics.hasOvernightInPeriod 
              ? "text-rose-300 bg-rose-950/80 border-rose-500/50 shadow-sm" 
              : "text-indigo-400 bg-indigo-500/10 border-indigo-500/20"
          )} title={summaryMetrics.hasOvernightInPeriod ? "Warning: Actual time includes sessions that ran overnight or were left unclosed without clocking out" : "Total actual clocked time spent on completed tasks in range"}>
            <span className="font-black text-white">⏱️ {summaryMetrics.totalActualHours}h</span> Actual Time Spent
            {summaryMetrics.hasOvernightInPeriod && (
              <span className="px-1.5 py-0.2 rounded text-[8px] bg-rose-500/30 text-rose-200 border border-rose-500/50 uppercase font-black">
                ⚠️ Includes Overnight / Unclosed
              </span>
            )}
          </div>

          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono transition",
            summaryMetrics.overallEfficiency !== null && summaryMetrics.overallEfficiency >= 100 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
            summaryMetrics.overallEfficiency !== null && summaryMetrics.overallEfficiency >= 80 ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
            "text-rose-400 bg-rose-500/10 border-rose-500/20"
          )} title={`Efficiency Formula: ${summaryMetrics.totalBookHours}h Book Time Completed ÷ ${summaryMetrics.totalActualHours}h Actual Time Spent = ${summaryMetrics.overallEfficiency !== null ? summaryMetrics.overallEfficiency : 0}% Labor Efficiency`}>
            <span className="font-black text-white">📈 {summaryMetrics.overallEfficiency !== null ? `${summaryMetrics.overallEfficiency}%` : 'N/A'}</span> Eff. ({summaryMetrics.totalBookHours}h Book / {summaryMetrics.totalActualHours}h Spent)
          </div>

          <div className="flex items-center gap-1.5 text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-lg border border-teal-500/20" title="Completed task count">
            <span className="font-black text-white">✅ {summaryMetrics.totalCompletedTasks}</span> Tasks Completed
          </div>
          
          <div className="flex items-center gap-1.5 text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20" title="Total jobs with task activity">
            <span className="font-black text-white">💼 {summaryMetrics.uniqueJobsCount}</span> Active Jobs
          </div>
          
          <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20" title="Unique staff members who completed work">
            <span className="font-black text-white">👤 {summaryMetrics.uniqueTechs}</span> Techs Paid
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
                  "px-2.5 py-1 rounded font-extrabold uppercase transition",
                  dateMode === 'all' ? "bg-zinc-800 text-zinc-200" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                All Time
              </button>
            </div>

            {/* Custom Date Pickers */}
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] font-mono">
              <input
                type="date"
                value={dateRange.start ? dateRange.start.toISOString().split('T')[0] : ''}
                onChange={e => {
                  if (e.target.value) {
                    setDateMode('custom');
                    const d = new Date(e.target.value);
                    d.setHours(0, 0, 0, 0);
                    setDateRange(prev => ({ ...prev, start: d }));
                  }
                }}
                className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
              />
              <span className="text-zinc-500">to</span>
              <input
                type="date"
                value={dateRange.end ? dateRange.end.toISOString().split('T')[0] : ''}
                onChange={e => {
                  if (e.target.value) {
                    setDateMode('custom');
                    const d = new Date(e.target.value);
                    d.setHours(23, 59, 59, 999);
                    setDateRange(prev => ({ ...prev, end: d }));
                  }
                }}
                className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
              />
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

            {/* Staff Selector */}
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1">
              <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <select
                value={selectedStaffId}
                onChange={e => setSelectedStaffId(e.target.value)}
                className="bg-transparent text-white text-[11px] font-medium focus:outline-none cursor-pointer pr-1"
              >
                <option value="all" className="bg-zinc-900 text-white">All Active Staff / Technicians</option>
                {activeStaff.map(s => {
                  const sName = `${s.firstName || s.name || 'Staff'} ${s.lastName || ''}`.trim();
                  return (
                    <option key={s.id} value={s.id} className="bg-zinc-900 text-white">
                      {sName} ({s.role || s.department || 'Tech'})
                    </option>
                  );
                })}
              </select>
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

            {/* Status Filter (Completed Only, In Progress, Not Started, Show All) */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-[10px] font-mono flex-wrap">
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
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
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

      {/* Main Content Area */}
      {loading ? (
        <div className="p-12 text-center bg-zinc-900 border border-zinc-800 rounded-2xl">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-400 font-mono text-xs">Loading Yellow Sheets Data...</p>
        </div>
      ) : groupedJobsData.length === 0 ? (
        <div className="p-12 text-center bg-zinc-900 border border-zinc-800 rounded-2xl space-y-3">
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
        <div className="space-y-4">
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

            // Compute overall job efficiency from ALL completed tasks on this job (independent of status filter)
            const rawJobTasks = tasksMap[job.id] || [];
            let jobAllCompletedBookSum = 0;
            let jobAllCompletedActualSum = 0;
            rawJobTasks.forEach((t: any) => {
              if (isTaskCompleted(t)) {
                const tBook = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0');
                const { actualHours } = calculateTaskActualDuration(t, taskActualSecondsMap);
                jobAllCompletedBookSum += tBook;
                jobAllCompletedActualSum += actualHours;
              }
            });

            const jobEfficiencyPct = (jobAllCompletedActualSum > 0 && jobAllCompletedBookSum > 0)
              ? Math.round((jobAllCompletedBookSum / jobAllCompletedActualSum) * 100)
              : null;

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
                  className="p-4 bg-zinc-900/90 hover:bg-zinc-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none border-b border-zinc-800/60"
                >
                  <div className="flex items-center gap-3">
                    <button className="text-zinc-400 hover:text-white transition">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-amber-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                    </button>

                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {job.id !== 'unassigned' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openJobDetails(job.id);
                            }}
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition flex items-center gap-1 cursor-pointer"
                            title="Open Job Details Page"
                          >
                            <span>JOB #{job.jobNumber}</span>
                            <ExternalLink className="w-3 h-3 text-amber-400" />
                          </button>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase bg-zinc-800 text-zinc-300 border border-zinc-700">
                            JOB #{job.jobNumber}
                          </span>
                        )}

                        <h2 className="text-sm font-bold text-white">
                          {job.customerName}
                        </h2>

                        {job.vehicleInfo && job.vehicleInfo !== 'N/A' && (
                          <span className="text-zinc-400 text-xs">— {job.vehicleInfo}</span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {job.jobStatus}
                        </span>
                        {jobEfficiencyPct !== null && (
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase border flex items-center gap-1",
                            jobEfficiencyPct >= 100 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            jobEfficiencyPct >= 80 ? "bg-amber-500/10 text-amber-300 border-amber-500/20" :
                            "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          )} title={`Job Efficiency based on completed tasks (${jobAllCompletedBookSum.toFixed(1)}h book / ${jobAllCompletedActualSum.toFixed(1)}h actual)`}>
                            ⚡ {jobEfficiencyPct}% Eff.
                          </span>
                        )}
                      </div>
                      
                      {jobTechs.length > 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-1">
                          <User className="w-3 h-3 text-zinc-500" />
                          <span>Tech(s):</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            {jobTechs.map((techName, idx) => (
                              <span key={idx} className="bg-zinc-800 text-zinc-300 px-1.5 py-0.2 rounded text-[9px] font-medium border border-zinc-700">
                                {techName}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Job Subtotals & Add Task Button Right Side */}
                  <div className="flex items-center gap-3 font-mono text-xs shrink-0 self-end sm:self-auto">
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
                      <div className="text-amber-400 font-extrabold">{jobCompletedBookSum.toFixed(1)}h Book Time</div>
                      <div className="text-[10px] text-zinc-500">{jobCompletedTasksCount} / {jobTotalTasks} Tasks Done</div>
                    </div>
                  </div>
                </div>

                {/* Job Tasks Categories Breakdown */}
                {isExpanded && (
                  <div className="p-4 space-y-5 bg-zinc-950/40">
                    {Object.entries(categories).map(([catName, tasks]) => {
                      const catTotalHours = tasks.reduce((sum, t) => sum + (t.bookHours || 0), 0);
                      const catCompletedHours = tasks.filter(t => t.completed).reduce((sum, t) => sum + (t.bookHours || 0), 0);
                      const catCompletedCount = tasks.filter(t => t.completed).length;

                      return (
                        <div key={catName} className="space-y-3">
                          {/* Category Header */}
                          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-1.5">
                            <div className="flex items-center gap-2">
                              <Tag className="w-3.5 h-3.5 text-amber-400" />
                              <h3 className="text-xs font-black uppercase tracking-wider text-amber-400">
                                {catName}
                              </h3>
                              <span className="text-[10px] font-mono text-zinc-500">({tasks.length} {tasks.length === 1 ? 'task' : 'tasks'})</span>
                            </div>
                            <div className="flex items-center gap-2 font-mono text-[10px]">
                              <span className="font-extrabold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20" title="Completed Book Hours / Total Category Book Hours">
                                ⚡ {catCompletedHours.toFixed(1)}h / {catTotalHours.toFixed(1)}h Done
                              </span>
                              <span className="text-zinc-400 font-bold text-[9px] bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                                {catCompletedCount} / {tasks.length} Tasks
                              </span>
                            </div>
                          </div>

                          {/* Task List under Category */}
                          <div className="grid grid-cols-1 gap-2.5">
                            {tasks.map(task => {
                              const isDone = task.completed || task.isCompleted || task.isQCComplete;
                              return (
                                <div 
                                  key={task.id} 
                                  className={cn(
                                    "rounded-xl p-2.5 space-y-2 transition duration-200 border",
                                    isDone
                                      ? "bg-zinc-900/90 border-zinc-800 hover:border-zinc-700"
                                      : "bg-zinc-950/60 border-zinc-800/60"
                                  )}
                                >
                                  {/* Task Title, Book Hours & Status Row */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={cn(
                                        "px-2 py-0.5 rounded text-[9px] font-mono font-extrabold uppercase border flex items-center gap-1",
                                        task.statusCode === 'completed' || task.completed
                                          ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/50" 
                                          : task.statusCode === 'in_progress'
                                          ? "bg-amber-950/90 text-amber-300 border-amber-500/50"
                                          : "bg-zinc-800 text-zinc-300 border-zinc-600 font-bold"
                                      )}>
                                        {task.statusLabel}
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <h4 
                                          onClick={(e) => {
                                            if (task.jobId !== 'unassigned' && task.id) {
                                              e.stopPropagation();
                                              openTaskDetails(task.jobId, task.id);
                                            }
                                          }}
                                          className={cn(
                                            "text-xs font-bold text-white flex items-center gap-1",
                                            task.jobId !== 'unassigned' && task.id ? "hover:text-amber-300 cursor-pointer underline decoration-dotted underline-offset-2" : ""
                                          )}
                                          title={task.jobId !== 'unassigned' ? "Click to open Task Details page" : undefined}
                                        >
                                          <span>{task.taskTitle}</span>
                                        </h4>
                                        {task.jobId !== 'unassigned' && task.id && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openTaskDetails(task.jobId, task.id);
                                            }}
                                            className="p-0.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-amber-300 transition cursor-pointer"
                                            title="Open Task Details Page"
                                          >
                                            <ExternalLink className="w-3 h-3 text-amber-400" />
                                          </button>
                                        )}
                                      </div>
                                      
                                      {/* Book Hours Badge & Inline Edit Button */}
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] font-mono font-black text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/40" title="Payout Book Time">
                                          ⚡ {task.bookHours.toFixed(1)}h Book {selectedStaffId !== 'all' && `(Split of ${task.totalBookHours}h)`}
                                        </span>
                                        {canEdit && (
                                          <button
                                            onClick={() => {
                                              setEditingBookTimeTask({ task, jobId: task.jobId, hours: task.totalBookHours || task.bookHours });
                                              setNewBookHours(task.totalBookHours || task.bookHours || 1.0);
                                            }}
                                            className="p-1 hover:bg-amber-500/20 rounded text-amber-400 hover:text-amber-200 transition"
                                            title="Edit total payout book hours for this task (e.g. increase from 1.0h to 4.0h)"
                                          >
                                            <Edit3 className="w-3 h-3" />
                                          </button>
                                        )}

                                        {/* Actual Time Spent Badge */}
                                        {task.actualDurationStr && task.actualDurationStr !== '0m' && (
                                          <span className={cn(
                                            "text-[10px] font-mono font-black px-2 py-0.5 rounded border flex items-center gap-1",
                                            task.hasOvernightSegment
                                              ? "text-rose-300 bg-rose-950/90 border-rose-500/50 shadow-sm"
                                              : "text-indigo-300 bg-indigo-950/80 border-indigo-500/40"
                                          )} title="Actual clocked time spent working on this task across all clock in/out sessions">
                                            ⏱️ {task.actualDurationStr} Actual
                                            {task.hasOvernightSegment && (
                                              <span className="ml-1 px-1 py-0.2 rounded text-[8px] bg-rose-500/30 text-rose-200 border border-rose-500/40 uppercase font-black">
                                                ⚠️ Overnight
                                              </span>
                                            )}
                                          </span>
                                        )}

                                        {/* Task Efficiency Badge */}
                                        {task.efficiencyPct !== null && (
                                          <span className={cn(
                                            "text-[10px] font-mono font-black px-2 py-0.5 rounded border flex items-center gap-1",
                                            task.efficiencyPct >= 100 ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/50" :
                                            task.efficiencyPct >= 80 ? "bg-amber-950/90 text-amber-300 border-amber-500/50" :
                                            "bg-rose-950/90 text-rose-300 border-rose-500/50 shadow-sm"
                                          )} title={`Task Efficiency: ${task.bookHours.toFixed(1)}h book time / ${task.actualHours.toFixed(1)}h actual clocked time`}>
                                            📈 {task.efficiencyPct}% Eff.
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Completion Staff, Multi-Tech Splits, Timestamp & Inline Notes Button */}
                                    <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-300 shrink-0 flex-wrap">
                                      <div className="flex items-center gap-1.5 bg-zinc-800/90 px-2 py-0.5 rounded border border-zinc-700/80 text-zinc-200">
                                        <User className="w-3 h-3 text-indigo-400" />
                                        {task.workers && task.workers.length > 1 ? (
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-semibold text-amber-300" title={`Task split between ${task.workers.length} techs`}>
                                              Techs ({task.workers.length}): {task.workers.map((w: any) => `${w.name} (${w.pct}% • ${w.splitHours.toFixed(1)}h)`).join(', ')}
                                            </span>
                                            {canEdit && (
                                              <button
                                                onClick={() => openSplitModal(task)}
                                                className="ml-1 p-0.5 hover:bg-zinc-700 rounded text-amber-400 hover:text-amber-200 transition"
                                                title="Adjust Payout Book Time split (% of Book Time Owed)"
                                              >
                                                <Sliders className="w-3 h-3" />
                                              </button>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="font-semibold">{task.completedBy}</span>
                                        )}
                                      </div>

                                      {task.closedByManager && (
                                        <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-500/40" title={`Task marked complete by manager: ${task.closedByManager}`}>
                                          Cleared by Mgr: {task.closedByManager}
                                        </span>
                                      )}

                                      {task.completedAt && (
                                        <div className="flex items-center gap-1 text-zinc-400 font-mono text-[10px]">
                                          <Clock className="w-3 h-3 text-zinc-500" />
                                          <span>{task.completedAt.toLocaleDateString()} {task.completedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                                        </div>
                                      )}

                                      {/* Inline + Add Notes button when NO notes exist */}
                                      {canEdit && !task.taskNotes && !task.staffNotes && (
                                        <button
                                          onClick={() => {
                                            setEditingTaskNotes({ task, jobId: task.jobId });
                                            setEditTaskSpecNote('');
                                            setEditStaffTechNote('');
                                          }}
                                          className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-[10px] font-mono font-bold rounded border border-zinc-700 transition cursor-pointer flex items-center gap-1"
                                          title="Add task instructions or staff notes"
                                        >
                                          <Edit3 className="w-3 h-3 text-amber-400" />
                                          <span>+ Add Notes</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Task Notes Container - ONLY rendered when notes exist */}
                                  {(task.taskNotes || task.staffNotes) && (
                                    <div className="pt-2 border-t border-zinc-800/60 space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-mono font-bold uppercase text-amber-400 flex items-center gap-1">
                                          <FileText className="w-3 h-3" /> Task Specs & Staff Notes:
                                        </span>
                                        {canEdit && (
                                          <button
                                            onClick={() => {
                                              setEditingTaskNotes({ task, jobId: task.jobId });
                                              setEditTaskSpecNote(task.taskNotes || '');
                                              setEditStaffTechNote(task.staffNotes || '');
                                            }}
                                            className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-[10px] font-mono font-bold rounded border border-zinc-700 transition cursor-pointer flex items-center gap-1"
                                            title="Edit task description or staff tech notes for payroll"
                                          >
                                            <Edit3 className="w-3 h-3 text-amber-400" />
                                            <span>Edit Notes</span>
                                          </button>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                        {task.taskNotes && (
                                          <div className="bg-zinc-900 rounded-lg p-2 border border-zinc-700/80 text-zinc-200 font-medium">
                                            <span className="text-[9px] font-mono font-bold uppercase text-zinc-400 block mb-0.5">Task Description / Instructions:</span>
                                            <p className="whitespace-pre-wrap">{task.taskNotes}</p>
                                          </div>
                                        )}
                                        {task.staffNotes && (
                                          <div className="bg-amber-950/60 rounded-lg p-2 border border-amber-500/30 text-amber-200 font-medium">
                                            <span className="text-[9px] font-mono font-bold uppercase text-amber-300 block mb-0.5 flex items-center gap-1">
                                              <FileText className="w-3 h-3 text-amber-400" /> Tech Completion Notes:
                                            </span>
                                            <p className="whitespace-pre-wrap font-sans">{task.staffNotes}</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Detailed Clocked Start & Stop Sessions Breakdown */}
                                  {task.taskSegments && task.taskSegments.length > 0 && (
                                    <div className="pt-2 border-t border-zinc-800/60 font-mono text-[10px] space-y-1.5">
                                      <div className="flex items-center justify-between flex-wrap gap-2">
                                        <span className="font-bold text-zinc-300 flex items-center gap-1">
                                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                                          Clocked Start & Stop Sessions ({task.taskSegments.length}):
                                        </span>
                                        {task.hasOvernightSegment && (
                                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-950/90 text-rose-300 border border-rose-500/50 flex items-center gap-1">
                                            ⚠️ Overnight / Unclosed Session
                                          </span>
                                        )}
                                      </div>

                                      <div className="space-y-1">
                                        {task.taskSegments.map((seg: any, idx: number) => {
                                          const startStr = `${seg.start.toLocaleDateString([], { month: 'numeric', day: 'numeric' })} ${seg.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                                          const endStr = seg.isOpen 
                                            ? 'Active / Open' 
                                            : `${seg.end.toLocaleDateString([], { month: 'numeric', day: 'numeric' })} ${seg.end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                                          const hrs = (seg.durationSec / 3600).toFixed(1);

                                          return (
                                            <div 
                                              key={idx} 
                                              className={cn(
                                                "flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg border text-[10px] transition",
                                                seg.isOvernightOrLong 
                                                  ? "bg-rose-950/70 text-rose-200 border-rose-500/50 font-bold" 
                                                  : "bg-zinc-950/80 text-zinc-200 border-zinc-800"
                                              )}
                                            >
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-bold text-amber-300">{seg.userName}:</span>
                                                <span className="text-zinc-200 font-mono">{startStr} ➔ {endStr}</span>
                                                {seg.isOvernightOrLong && (
                                                  <span className="px-1.5 py-0.2 rounded text-[8px] bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase font-black">
                                                    ⚠️ Overnight ({hrs}h)
                                                  </span>
                                                )}
                                              </div>
                                              <span className="font-black text-amber-300 font-mono shrink-0">{hrs}h</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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
                <label className="text-xs font-bold text-amber-300 block">Tech Completion / Staff Notes (Payroll Remarks):</label>
                <textarea
                  rows={3}
                  placeholder="Technician completion notes, work remarks, or payroll review notes..."
                  value={editStaffTechNote}
                  onChange={e => setEditStaffTechNote(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs p-3 rounded-lg focus:outline-none focus:border-amber-500 font-sans"
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
                onClick={() => setShowAuditModal(false)}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Close Audit Trail
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
