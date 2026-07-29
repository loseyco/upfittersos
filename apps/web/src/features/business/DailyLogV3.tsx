import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import {
  Activity, Clock, ShieldCheck, CheckCircle2,
  Package, User, FileText,
  Search, Table,
  ArrowUp, ArrowDown, ChevronDown, Check, RotateCcw,
  Volume2, VolumeX, Columns3, ChevronLeft, ChevronRight, Calendar,
  Copy, Printer, X
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface DailyLogV3Props {
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
  return ['completed', 'complete', 'qc', 'qc complete', 'closed', 'done'].includes(s);
};

const playEventChime = (type: 'task' | 'shift' | 'parts' | 'qc') => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'task') {
      // Pleasant double chime (C5 -> G5)
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.12); // G5
      gain2.gain.setValueAtTime(0.2, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.4);
    } else if (type === 'shift') {
      // Clean single tone (E5)
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, now); // E5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'parts') {
      // Attention alert chime (A4 -> E5)
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'qc') {
      // Triumphant double chime (G5 -> C6)
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(783.99, now); // G5
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.2);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046.50, now + 0.1); // C6
      gain2.gain.setValueAtTime(0.25, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.45);
    }
  } catch (e) {
    console.warn('Audio chime error:', e);
  }
};

export function DailyLogV3({ tenantId }: DailyLogV3Props) {
  // Subscribed State & Last Updated Timestamp
  const [jobs, setJobs] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [tasksMap, setTasksMap] = useState<Record<string, any[]>>({});
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const touchLastUpdated = () => setLastUpdated(new Date());

  // Date Selector State (Default: Today)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const isSelectedDateToday = useMemo(() => {
    const today = new Date();
    return (
      selectedDate.getDate() === today.getDate() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getFullYear() === today.getFullYear()
    );
  }, [selectedDate]);

  const isSameSelectedDate = (dateVal: Date | null) => {
    if (!dateVal) return false;
    return (
      dateVal.getDate() === selectedDate.getDate() &&
      dateVal.getMonth() === selectedDate.getMonth() &&
      dateVal.getFullYear() === selectedDate.getFullYear()
    );
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };

  const handleNextDay = () => {
    if (isSelectedDateToday) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };

  const handleResetToday = () => {
    setSelectedDate(new Date());
  };

  // Sound Chime Preference State
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('daily_log_v3_sound') !== 'disabled';
  });

  const toggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('daily_log_v3_sound', next ? 'enabled' : 'disabled');
      if (next) playEventChime('task'); // Test chime
      return next;
    });
  };

  // Column Visibility State (Persisted in localStorage per tenant/user)
  const DEFAULT_COLUMNS = {
    time: true,
    category: true,
    who: true,
    job: true,
    details: true,
    note: true,
    status: true
  };

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`daily_log_v3_columns_${tenantId}`);
      return saved ? { ...DEFAULT_COLUMNS, ...JSON.parse(saved) } : DEFAULT_COLUMNS;
    } catch (e) {
      return DEFAULT_COLUMNS;
    }
  });

  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);

  const toggleColumnVisibility = (colKey: string) => {
    setVisibleColumns(prev => {
      const updated = { ...prev, [colKey]: !prev[colKey] };
      localStorage.setItem(`daily_log_v3_columns_${tenantId}`, JSON.stringify(updated));
      return updated;
    });
  };

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

    const unsubSessions = onSnapshot(collection(db, `businesses/${tenantId}/time_sessions`), (snap) => {
      setActiveSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      touchLastUpdated();
    });

    return () => {
      unsubJobs();
      unsubParts();
      unsubStaff();
      unsubSessions();
    };
  }, [tenantId]);

  // Subscribe to tasks for all active jobs
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
        touchLastUpdated();
      });
      unsubs.push(unsub);
    });

    return () => unsubs.forEach(u => u());
  }, [tenantId, activeJobIds]);

  // Filter & Search State
  const [logFilterCategory, setLogFilterCategory] = useState<'all' | 'task' | 'shift' | 'parts' | 'qc'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  // Excel Column Sorting & Filtering State
  const [sortColumn, setSortColumn] = useState<'time' | 'category' | 'who' | 'job' | 'details' | 'note' | 'status' | null>('time');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [selectedWhoFilters, setSelectedWhoFilters] = useState<string[]>([]);
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<string[]>([]);
  const [notesOnlyFilter, setNotesOnlyFilter] = useState<boolean>(false);
  const [activeHeaderDropdown, setActiveHeaderDropdown] = useState<string | null>(null);
  const [hoveredCardTooltip, setHoveredCardTooltip] = useState<{ text: string; x: number; y: number; title?: string } | null>(null);

  // Daily Operations Report Modal State
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  // Helper to format duration nicely (e.g. 45m, 1h 20m, Active (15m))
  const formatDuration = (startRaw: any, endRaw: any, isOngoing: boolean = false) => {
    const startDate = parseSafeDate(startRaw);
    if (!startDate) return '--';
    const endDate = parseSafeDate(endRaw) || (isOngoing ? new Date() : null);
    if (!endDate) return '--';

    const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
    const totalMins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m${isOngoing ? ' (Active)' : ''}`;
    }
    return `${mins}m${isOngoing ? ' (Active)' : ''}`;
  };

  const formatSecDuration = (totalSec?: number) => {
    if (!totalSec || totalSec <= 0) return '--';
    const totalMins = Math.floor(totalSec / 60);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  // Ready for QC Jobs
  const readyForQcJobs = useMemo(() => {
    return jobs.filter(j => ['ready for qc', 'qc', 'ready_for_qc'].includes((j.status || '').toLowerCase().trim()));
  }, [jobs]);

  // Unified Master Log Feed
  const unifiedDailyLogFeed = useMemo(() => {
    const feed: any[] = [];

    // Combine subcollection tasks AND embedded job.tasks arrays
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

    // 1. Task Lifecycle Events (Done, Blocked, Note, Photo)
    Object.entries(combinedTasksMap).forEach(([jobId, tasks]) => {
      const job = jobs.find(j => j.id === jobId);
      tasks.forEach(t => {
        const isFinished = isTaskCompleted(t);
        const taskTitle = t.name || t.title || 'Task';
        const bookTimeVal = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0');
        const vehicleInfo = job?.vehicleYearMakeModel || job?.vehicleName || job?.vehicleId || job?.vehicleVin || job?.vehicle || '';

        // Helper to resolve staff member for task action
        const resolveTaskStaff = (actorId?: string, actorName?: string) => {
          const found = staff.find(s => s.id === actorId || s.userId === actorId || s.name === actorName || `${s.firstName || ''} ${s.lastName || ''}`.trim() === actorName);
          let resolvedName = '';
          let resolvedId = actorId || '';

          if (found) {
            resolvedName = `${found.firstName || found.name || 'Tech'} ${found.lastName || ''}`.trim();
            resolvedId = found.id || found.userId || resolvedId;
          } else if (actorName) {
            resolvedName = actorName;
          }

          // Override Kathy Schildkraut (office staff who does not do shop labor tasks)
          if (!resolvedName || resolvedName.toLowerCase().includes('kathy')) {
            const jobTech = job?.assignedTechName || job?.techName || job?.assignedTech;
            if (jobTech && typeof jobTech === 'string' && !jobTech.toLowerCase().includes('kathy')) {
              resolvedName = jobTech;
            } else {
              resolvedName = 'Technician';
            }
          }

          return {
            name: resolvedName,
            id: resolvedId
          };
        };

        // Event 1: Task Finished / Done
        const compDate = parseSafeDate(t.completedAt || t.completedDate || t.qcCompletedAt || t.closedAt);
        if (isFinished && compDate && isSameSelectedDate(compDate)) {
          const staffInfo = resolveTaskStaff(t.completedByStaffId || t.completedBy || t.assignedTo, t.completedByStaffName);
          const rawStatus = (t.status || 'READY FOR QC').toUpperCase();
          const taskStatus = ['QC', 'READY_FOR_QC'].includes(rawStatus) ? 'READY FOR QC' : rawStatus;
          const taskNote = t.note || t.notes || t.qcNote || t.techNote || t.completionNote || t.completionNotes || t.description || '';
          const durationStr = taskStatus === 'READY FOR QC'
            ? formatDuration(compDate, new Date(), true)
            : (t.elapsedTime ? formatSecDuration(t.elapsedTime) : (bookTimeVal > 0 ? `${bookTimeVal}h Est` : '--'));

          feed.push({
            id: `task_done_${t.id}_${compDate.getTime()}`,
            category: 'task',
            badgeLabel: 'TASK DONE',
            badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
            timestamp: compDate,
            timeStr: compDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            who: staffInfo.name,
            staffId: staffInfo.id,
            duration: durationStr,
            jobId,
            taskId: t.id,
            jobNumber: job?.jobNumber || 'N/A',
            jobTitle: job?.title || 'Upfit Job',
            customerName: job?.customerName || job?.customer || '',
            vehicleInfo,
            details: `${taskTitle} ${bookTimeVal > 0 ? `(${bookTimeVal}h Book)` : ''}`,
            note: typeof taskNote === 'string' ? taskNote.trim() : '',
            status: taskStatus
          });
        }

        // Event 2: Task Blocked / On Hold / Issue
        const statusLower = (t.status || '').toLowerCase().trim();
        const isBlockedFlag = t.isBlocked === true || t.is_blocked === true || ['blocked', 'on_hold', 'hold', 'issue', 'needs_part', 'needs_parts', 'waiting_parts', 'waiting'].includes(statusLower);
        
        if (isBlockedFlag) {
          const blockedDate = parseSafeDate(t.blockedAt || t.blockedDate || t.blocked_at || t.holdAt || t.statusChangedAt || t.updatedAt || t.createdAt);
          if (blockedDate && isSameSelectedDate(blockedDate)) {
            const staffInfo = resolveTaskStaff(t.blockedBy || t.updatedBy || t.assignedTo, t.blockedByName || t.updatedByName);
            const blockNote = t.blockedReason || t.blockReason || t.issue || t.reason || t.note || t.notes || '';
            feed.push({
              id: `task_blocked_${t.id}_${blockedDate.getTime()}`,
              category: 'task',
              badgeLabel: 'TASK BLOCKED',
              badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20',
              timestamp: blockedDate,
              timeStr: blockedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              who: staffInfo.name,
              staffId: staffInfo.id,
              duration: '--',
              jobId,
              taskId: t.id,
              jobNumber: job?.jobNumber || 'N/A',
              jobTitle: job?.title || 'Upfit Job',
              customerName: job?.customerName || job?.customer || '',
              vehicleInfo,
              details: `Task Blocked: ${taskTitle}`,
              note: typeof blockNote === 'string' ? blockNote.trim() : '',
              status: statusLower === 'on_hold' || statusLower === 'hold' ? 'ON HOLD' : 'BLOCKED'
            });
          }
        }

        // Event 3: Task Note Added
        const noteEvents = Array.isArray(t.notesHistory) ? t.notesHistory : (Array.isArray(t.comments) ? t.comments : []);
        if (noteEvents.length > 0) {
          noteEvents.forEach((n: any, nIdx: number) => {
            const nDate = parseSafeDate(n.createdAt || n.timestamp || n.date);
            if (nDate && isSameSelectedDate(nDate)) {
              const staffInfo = resolveTaskStaff(n.userId || n.authorId || n.createdBy, n.userName || n.authorName || n.createdByName);
              feed.push({
                id: `task_note_${t.id}_${nIdx}_${nDate.getTime()}`,
                category: 'task',
                badgeLabel: 'TASK NOTE',
                badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
                timestamp: nDate,
                timeStr: nDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                who: staffInfo.name,
                staffId: staffInfo.id,
                duration: '--',
                jobId,
                jobNumber: job?.jobNumber || 'N/A',
                jobTitle: job?.title || 'Upfit Job',
                customerName: job?.customerName || job?.customer || '',
                vehicleInfo,
                details: `Note Added to Task: ${taskTitle}`,
                note: n.text || n.content || n.note || n.comment || '',
                status: 'NOTE ADDED'
              });
            }
          });
        } else {
          // Single note timestamp check
          const noteDate = parseSafeDate(t.noteAddedAt || t.lastNoteAt);
          if (noteDate && isSameSelectedDate(noteDate) && (t.note || t.notes)) {
            const staffInfo = resolveTaskStaff(t.noteAddedBy || t.updatedBy, t.noteAddedByName || t.updatedByName);
            feed.push({
              id: `task_note_single_${t.id}_${noteDate.getTime()}`,
              category: 'task',
              badgeLabel: 'TASK NOTE',
              badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
              timestamp: noteDate,
              timeStr: noteDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              who: staffInfo.name,
              staffId: staffInfo.id,
              duration: '--',
              jobId,
              jobNumber: job?.jobNumber || 'N/A',
              jobTitle: job?.title || 'Upfit Job',
              customerName: job?.customerName || job?.customer || '',
              vehicleInfo,
              details: `Note Added to Task: ${taskTitle}`,
              note: t.note || t.notes || '',
              status: 'NOTE ADDED'
            });
          }
        }

        // Event 4: Photo Taken / Uploaded on Task
        const photoEvents = Array.isArray(t.photos) ? t.photos : (Array.isArray(t.attachments) ? t.attachments : []);
        if (photoEvents.length > 0) {
          photoEvents.forEach((p: any, pIdx: number) => {
            const pDate = parseSafeDate(p.uploadedAt || p.createdAt || p.timestamp);
            if (pDate && isSameSelectedDate(pDate)) {
              const staffInfo = resolveTaskStaff(p.uploadedBy || p.userId || p.createdBy, p.uploadedByName || p.userName || p.createdByName);
              feed.push({
                id: `task_photo_${t.id}_${pIdx}_${pDate.getTime()}`,
                category: 'task',
                badgeLabel: 'TASK PHOTO',
                badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
                timestamp: pDate,
                timeStr: pDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                who: staffInfo.name,
                staffId: staffInfo.id,
                duration: '--',
                jobId,
                jobNumber: job?.jobNumber || 'N/A',
                jobTitle: job?.title || 'Upfit Job',
                customerName: job?.customerName || job?.customer || '',
                vehicleInfo,
                details: `Photo Uploaded to Task: ${taskTitle}`,
                note: p.caption || p.note || p.name || '',
                status: 'PHOTO ADDED'
              });
            }
          });
        } else {
          // Single photo timestamp check
          const photoDate = parseSafeDate(t.photoUploadedAt || t.lastPhotoAt);
          if (photoDate && isSameSelectedDate(photoDate)) {
            const staffInfo = resolveTaskStaff(t.photoUploadedBy || t.updatedBy, t.photoUploadedByName || t.updatedByName);
            feed.push({
              id: `task_photo_single_${t.id}_${photoDate.getTime()}`,
              category: 'task',
              badgeLabel: 'TASK PHOTO',
              badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
              timestamp: photoDate,
              timeStr: photoDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              who: staffInfo.name,
              staffId: staffInfo.id,
              duration: '--',
              jobId,
              jobNumber: job?.jobNumber || 'N/A',
              jobTitle: job?.title || 'Upfit Job',
              customerName: job?.customerName || job?.customer || '',
              vehicleInfo,
              details: `Photo Uploaded to Task: ${taskTitle}`,
              note: t.photoNote || t.caption || '',
              status: 'PHOTO ADDED'
            });
          }
        }
      });
    });

    // 2. Timeclock Sessions
    activeSessions.forEach(s => {
      const stMember = staff.find(st => st.id === s.userId || st.userId === s.userId);
      const who = stMember ? `${stMember.firstName || stMember.name || 'Staff'} ${stMember.lastName || ''}`.trim() : 'Staff Member';
      const staffId = stMember?.id || s.userId || '';
      const shiftDurationStr = formatDuration(s.clockIn || s.startTime, s.clockOut || s.endTime, !s.clockOut && !s.endTime);

      // Clock In Event
      const clockInDate = parseSafeDate(s.clockIn || s.startTime || s.createdAt);
      if (clockInDate && isSameSelectedDate(clockInDate)) {
        feed.push({
          id: `shift_in_${s.id}_${clockInDate.getTime()}`,
          category: 'shift',
          badgeLabel: 'CLOCK IN',
          badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          timestamp: clockInDate,
          timeStr: clockInDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          who,
          staffId,
          duration: shiftDurationStr,
          jobId: '',
          jobNumber: '--',
          jobTitle: 'Timeclock Shift',
          customerName: '',
          vehicleInfo: '',
          details: `Clocked into shift (${s.deptName || stMember?.deptName || 'General'})`,
          note: s.notes || s.note || '',
          status: 'Active Shift'
        });
      }

      // Clock Out Event
      const clockOutDate = parseSafeDate(s.clockOut || s.endTime);
      if (clockOutDate && isSameSelectedDate(clockOutDate)) {
        feed.push({
          id: `shift_out_${s.id}_${clockOutDate.getTime()}`,
          category: 'shift',
          badgeLabel: 'CLOCK OUT',
          badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700',
          timestamp: clockOutDate,
          timeStr: clockOutDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          who,
          staffId,
          duration: shiftDurationStr,
          jobId: '',
          jobNumber: '--',
          jobTitle: 'Timeclock Shift',
          customerName: '',
          vehicleInfo: '',
          details: `Clocked out of shift (Total shift: ${shiftDurationStr})`,
          note: '',
          status: 'Shift Completed'
        });
      }

      // Breaks & Lunch Breaks inside session
      if (Array.isArray(s.breaks)) {
        s.breaks.forEach((b: any, bIdx: number) => {
          const bStart = parseSafeDate(b.start || b.startTime);
          const bEnd = parseSafeDate(b.end || b.endTime);
          const isLunch = (b.type || '').toLowerCase() === 'lunch';
          const breakLabel = isLunch ? 'Lunch' : 'Rest Break';
          const bDurationStr = formatDuration(b.start || b.startTime, b.end || b.endTime, !bEnd);

          // Break Start Event
          if (bStart && isSameSelectedDate(bStart)) {
            feed.push({
              id: `break_start_${s.id}_${bIdx}_${bStart.getTime()}`,
              category: 'shift',
              badgeLabel: isLunch ? 'LUNCH START' : 'BREAK START',
              badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
              timestamp: bStart,
              timeStr: bStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              who,
              staffId,
              duration: bDurationStr,
              jobId: '',
              jobNumber: '--',
              jobTitle: 'Timeclock',
              customerName: '',
              vehicleInfo: '',
              details: `Went on ${breakLabel}${b.isPaid ? ' (Paid)' : ''}`,
              note: b.notes || b.note || '',
              status: isLunch ? 'ON LUNCH' : 'ON BREAK'
            });
          }

          // Break End Event
          if (bEnd && isSameSelectedDate(bEnd)) {
            feed.push({
              id: `break_end_${s.id}_${bIdx}_${bEnd.getTime()}`,
              category: 'shift',
              badgeLabel: isLunch ? 'LUNCH END' : 'BREAK END',
              badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
              timestamp: bEnd,
              timeStr: bEnd.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              who,
              staffId,
              duration: bDurationStr,
              jobId: '',
              jobNumber: '--',
              jobTitle: 'Timeclock',
              customerName: '',
              vehicleInfo: '',
              details: `Returned from ${breakLabel} (${bDurationStr})`,
              note: b.notes || b.note || '',
              status: 'Active Shift'
            });
          }
        });
      }

      // Task Clock-ins & Task Clock-outs / Idle inside session
      if (Array.isArray(s.jobs)) {
        s.jobs.forEach((jTask: any, idx: number) => {
          const taskStart = parseSafeDate(jTask.start || jTask.startTime);
          const taskEnd = parseSafeDate(jTask.end || jTask.endTime || jTask.stop);
          const taskDurationStr = formatDuration(jTask.start || jTask.startTime, jTask.end || jTask.endTime || jTask.stop, !taskEnd);

          // Task Start
          if (taskStart && isSameSelectedDate(taskStart)) {
            const job = jobs.find(j => j.id === jTask.id || j.id === jTask.jobId);
            feed.push({
              id: `task_start_${s.id}_${idx}_${taskStart.getTime()}`,
              category: 'shift',
              badgeLabel: 'TASK START',
              badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
              timestamp: taskStart,
              timeStr: taskStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              who,
              staffId,
              duration: taskDurationStr,
              jobId: jTask.jobId || jTask.id || '',
              taskId: jTask.taskId || jTask.id || '',
              jobNumber: job?.jobNumber || 'N/A',
              jobTitle: jTask.name || job?.title || 'Job Task',
              customerName: job?.customerName || '',
              vehicleInfo: job?.vehicleYearMakeModel || '',
              details: `Clocked into task: ${jTask.taskName || jTask.name || 'Labor Task'}`,
              note: jTask.note || jTask.notes || '',
              status: 'In Progress'
            });
          }

          // Task End / Idle Event
          if (taskEnd && isSameSelectedDate(taskEnd)) {
            const job = jobs.find(j => j.id === jTask.id || j.id === jTask.jobId);
            const endedDurationStr = formatDuration(jTask.start || jTask.startTime, taskEnd, false);
            feed.push({
              id: `task_end_${s.id}_${idx}_${taskEnd.getTime()}`,
              category: 'shift',
              badgeLabel: 'TASK END',
              badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
              timestamp: taskEnd,
              timeStr: taskEnd.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              who,
              staffId,
              duration: endedDurationStr,
              jobId: jTask.jobId || jTask.id || '',
              taskId: jTask.taskId || jTask.id || '',
              jobNumber: job?.jobNumber || 'N/A',
              jobTitle: jTask.name || job?.title || 'Job Task',
              customerName: job?.customerName || '',
              vehicleInfo: job?.vehicleYearMakeModel || '',
              details: `Clocked out of task: ${jTask.taskName || jTask.name || 'Labor Task'} (${endedDurationStr})`,
              note: jTask.note || jTask.notes || '',
              status: 'TASK END'
            });
          }
        });
      }
    });

    // 3. Parts Requests & Lifecycle State Transitions
    partsRequests.forEach(p => {
      const job = jobs.find(j => j.id === p.jobId);
      const partTitle = `${p.partName || p.name || 'Part'} ${p.partNumber ? `(#${p.partNumber})` : ''}`.trim();
      const qtyStr = p.quantity ? ` (Qty: ${p.quantity})` : '';

      // Find Matt in the staff directory as the primary Parts Manager fallback
      const mattStaff = staff.find(s => {
        const fullName = `${s.firstName || s.name || ''} ${s.lastName || ''}`.toLowerCase();
        return fullName.includes('matt');
      }) || staff.find(s => (s.role || '').toLowerCase().includes('part') || (s.dept || '').toLowerCase().includes('part'));

      const mattFallback = {
        name: mattStaff ? `${mattStaff.firstName || mattStaff.name || 'Matt'} ${mattStaff.lastName || ''}`.trim() : 'Matt',
        id: mattStaff?.id || mattStaff?.userId || ''
      };

      // Helper to resolve staff member name and ID for specific event actor
      const resolveEventActor = (actorId?: string, actorName?: string, fallbackInfo: { name: string; id: string } = mattFallback) => {
        let name = '';
        let id = actorId || '';

        if (actorName && actorName.trim()) {
          const found = staff.find(s => s.id === actorId || s.userId === actorId || s.name === actorName || `${s.firstName || ''} ${s.lastName || ''}`.trim() === actorName);
          name = actorName.trim();
          id = found?.id || found?.userId || actorId || '';
        } else if (actorId) {
          const found = staff.find(s => s.id === actorId || s.userId === actorId);
          if (found) {
            name = `${found.firstName || found.name || 'Staff'} ${found.lastName || ''}`.trim();
            id = found.id || found.userId || '';
          }
        }

        if (!name || name.toLowerCase().includes('kathy')) {
          return fallbackInfo;
        }

        return { name, id };
      };

      // Initial Requester
      const initialRequester = resolveEventActor(
        p.requestedBy || p.createdBy || p.userId,
        p.requestedByName || p.createdByName,
        mattFallback
      );

      // Helper to push a parts feed event with specific staff attribution
      const addPartEvent = (
        eventId: string,
        rawDate: any,
        badgeLabel: string,
        badgeClass: string,
        statusText: string,
        detailsText: string,
        actorInfo: { name: string; id: string }
      ) => {
        const eventDate = parseSafeDate(rawDate);
        if (eventDate && isSameSelectedDate(eventDate)) {
          feed.push({
            id: `part_${p.id}_${eventId}_${eventDate.getTime()}`,
            category: 'parts',
            badgeLabel,
            badgeClass,
            timestamp: eventDate,
            timeStr: eventDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            who: actorInfo.name,
            staffId: actorInfo.id,
            jobId: p.jobId || '',
            jobNumber: job?.jobNumber || 'N/A',
            jobTitle: job?.title || 'Upfit Job',
            customerName: job?.customerName || '',
            vehicleInfo: job?.vehicleYearMakeModel || '',
            details: detailsText,
            note: p.notes || p.note || p.reason || '',
            status: statusText.toUpperCase()
          });
        }
      };

      const statusLower = (p.status || 'pending').toLowerCase().trim();

      // State 1: Request Created (Requested)
      const createdAt = p.createdAt || p.requestedAt;
      if (createdAt) {
        addPartEvent(
          'req',
          createdAt,
          'PARTS',
          'bg-amber-500/10 text-amber-400 border-amber-500/20',
          'REQUESTED',
          `Part Requested: ${partTitle}${qtyStr}`,
          initialRequester
        );
      }

      // State 2: Moved to Ordered
      const orderedAt = p.orderedAt || p.orderedDate || (statusLower === 'ordered' ? p.statusChangedAt || p.updatedAt : null);
      if (orderedAt && orderedAt !== createdAt) {
        const orderedActor = resolveEventActor(
          p.orderedBy || p.orderedByStaffId || p.statusChangedBy || p.updatedBy,
          p.orderedByName || p.statusChangedByName || p.updatedByName,
          mattFallback
        );
        addPartEvent(
          'ord',
          orderedAt,
          'PARTS',
          'bg-amber-500/10 text-amber-400 border-amber-500/20',
          'ORDERED',
          `Part Moved to Ordered: ${partTitle}${p.poNumber ? ` (PO #${p.poNumber})` : ''}`,
          orderedActor
        );
      }

      // State 3: Moved to Received
      const receivedAt = p.receivedAt || p.receivedDate || (statusLower === 'received' ? p.statusChangedAt || p.updatedAt : null);
      if (receivedAt && receivedAt !== createdAt && receivedAt !== orderedAt) {
        const receivedActor = resolveEventActor(
          p.receivedBy || p.receivedByStaffId || p.statusChangedBy || p.updatedBy,
          p.receivedByName || p.statusChangedByName || p.updatedByName,
          mattFallback
        );
        addPartEvent(
          'rec',
          receivedAt,
          'PARTS',
          'bg-amber-500/10 text-amber-400 border-amber-500/20',
          'RECEIVED',
          `Part Received into Shop: ${partTitle}`,
          receivedActor
        );
      }

      // State 4: Moved to With Vehicle / Staged / Delivered / Fulfilled
      const vehicleAt = p.stagedAt || p.deliveredAt || p.putAwayAt || (['fulfilled', 'delivered', 'staged', 'with_vehicle', 'with vehicle'].includes(statusLower) ? p.statusChangedAt || p.updatedAt : null);
      if (vehicleAt && vehicleAt !== createdAt && vehicleAt !== orderedAt && vehicleAt !== receivedAt) {
        const vehicleActor = resolveEventActor(
          p.stagedBy || p.deliveredBy || p.putAwayBy || p.statusChangedBy || p.updatedBy,
          p.stagedByName || p.deliveredByName || p.statusChangedByName || p.updatedByName,
          mattFallback
        );
        addPartEvent(
          'veh',
          vehicleAt,
          'PARTS',
          'bg-amber-500/10 text-amber-400 border-amber-500/20',
          'WITH VEHICLE',
          `Part Moved to Vehicle / Tech: ${partTitle}`,
          vehicleActor
        );
      }

      // Fallback: If no distinct lifecycle timestamps exist besides updatedAt, format current status transition
      if (!createdAt && !orderedAt && !receivedAt && !vehicleAt) {
        const fallbackDate = parseSafeDate(p.updatedAt || p.statusChangedAt || p.timestamp);
        if (fallbackDate && isSameSelectedDate(fallbackDate)) {
          let statusText = statusLower.toUpperCase();
          let detailsText = `Part: ${partTitle}${qtyStr}`;

          let fallbackActor = resolveEventActor(
            p.statusChangedBy || p.updatedBy,
            p.statusChangedByName || p.updatedByName,
            mattFallback
          );

          if (['ordered'].includes(statusLower)) {
            statusText = 'ORDERED';
            detailsText = `Part Moved to Ordered: ${partTitle}`;
            fallbackActor = resolveEventActor(p.orderedBy || p.updatedBy, p.orderedByName || p.updatedByName, mattFallback);
          } else if (['received'].includes(statusLower)) {
            statusText = 'RECEIVED';
            detailsText = `Part Received into Shop: ${partTitle}`;
            fallbackActor = resolveEventActor(p.receivedBy || p.updatedBy, p.receivedByName || p.updatedByName, mattFallback);
          } else if (['fulfilled', 'delivered', 'staged', 'with_vehicle', 'with vehicle'].includes(statusLower)) {
            statusText = 'WITH VEHICLE';
            detailsText = `Part Moved to Vehicle / Tech: ${partTitle}`;
            fallbackActor = resolveEventActor(p.stagedBy || p.deliveredBy || p.updatedBy, p.stagedByName || p.deliveredByName || p.updatedByName, mattFallback);
          }

          addPartEvent('status', fallbackDate, 'PARTS', 'bg-amber-500/10 text-amber-400 border-amber-500/20', statusText, detailsText, fallbackActor);
        }
      }
    });

    // 4. Ready for QC Jobs (Only when ALL tasks on job are completed)
    readyForQcJobs.forEach(j => {
      const jTasks = combinedTasksMap[j.id] || (Array.isArray(j.tasks) ? j.tasks : []);
      const areAllTasksDone = jTasks.length > 0 ? jTasks.every((t: any) => isTaskCompleted(t)) : true;
      if (!areAllTasksDone) return; // Skip if job still has incomplete tasks

      const jDate = parseSafeDate(j.updatedAt || j.statusChangedAt || j.createdAt);
      if (jDate && isSameSelectedDate(jDate)) {
        const techStaff = staff.find(s => s.id === j.assignedTechId || s.name === j.assignedTechName);
        const staffId = techStaff?.id || j.assignedTechId || '';
        const timeInQcStr = formatDuration(jDate, new Date(), true);

        feed.push({
          id: `qc_${j.id}_${jDate.getTime()}`,
          category: 'qc',
          badgeLabel: 'QC QUEUE',
          badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          timestamp: jDate,
          timeStr: jDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          who: (j.assignedTechName && !j.assignedTechName.toLowerCase().includes('kathy')) ? j.assignedTechName : 'Shop Foreman',
          staffId,
          duration: timeInQcStr,
          jobId: j.id,
          jobNumber: j.jobNumber || 'N/A',
          jobTitle: j.title || 'Upfit Job',
          customerName: j.customerName || '',
          vehicleInfo: j.vehicleYearMakeModel || '',
          details: `Vehicle upfit completed — moved to Ready for QC Inspection`,
          note: j.qcNotes || j.notes || '',
          status: 'READY FOR QC'
        });
      }
    });

    return feed.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [tasksMap, jobs, staff, activeSessions, partsRequests, readyForQcJobs, selectedDate]);

  // Unique Filter Options
  const uniqueStaffNames = useMemo(() => {
    const names = new Set<string>();
    unifiedDailyLogFeed.forEach(item => { if (item.who) names.add(item.who); });
    return Array.from(names).sort();
  }, [unifiedDailyLogFeed]);

  const uniqueStatuses = useMemo(() => {
    const statuses = new Set<string>();
    unifiedDailyLogFeed.forEach(item => { if (item.status) statuses.add(item.status); });
    return Array.from(statuses).sort();
  }, [unifiedDailyLogFeed]);

  const handleSortToggle = (col: 'time' | 'category' | 'who' | 'job' | 'details' | 'note' | 'status') => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const toggleWhoFilter = (name: string) => {
    setSelectedWhoFilters(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const toggleStatusFilter = (status: string) => {
    setSelectedStatusFilters(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const hasActiveColumnFilters = selectedWhoFilters.length > 0 || selectedStatusFilters.length > 0 || notesOnlyFilter;
  const isCustomSorted = sortColumn !== 'time' || sortDirection !== 'desc';

  const resetSort = () => {
    setSortColumn('time');
    setSortDirection('desc');
  };

  const clearAllFilters = () => {
    setLogFilterCategory('all');
    setLogSearchQuery('');
    setSelectedWhoFilters([]);
    setSelectedStatusFilters([]);
    setNotesOnlyFilter(false);
    resetSort();
  };

  // Filtered & Sorted Master Daily Log
  const filteredDailyLog = useMemo(() => {
    const filtered = unifiedDailyLogFeed.filter(item => {
      // Top card category filter
      if (logFilterCategory !== 'all') {
        if (logFilterCategory === 'qc') {
          if (item.category !== 'qc' && item.status !== 'READY FOR QC') return false;
        } else if (item.category !== logFilterCategory) {
          return false;
        }
      }
      // Search query filter
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase().trim();
        const searchStr = `${item.who} ${item.jobNumber} ${item.jobTitle} ${item.customerName} ${item.vehicleInfo} ${item.details} ${item.note} ${item.status}`.toLowerCase();
        if (!searchStr.includes(q)) return false;
      }
      // Staff column filter
      if (selectedWhoFilters.length > 0 && !selectedWhoFilters.includes(item.who)) return false;
      // Status column filter
      if (selectedStatusFilters.length > 0 && !selectedStatusFilters.includes(item.status)) return false;
      // Notes column filter
      if (notesOnlyFilter && !item.note) return false;

      return true;
    });

    if (!sortColumn) return filtered;

    return [...filtered].sort((a, b) => {
      let compA: any;
      let compB: any;

      if (sortColumn === 'time') {
        compA = a.timestamp.getTime();
        compB = b.timestamp.getTime();
      } else if (sortColumn === 'category') {
        compA = a.badgeLabel;
        compB = b.badgeLabel;
      } else if (sortColumn === 'who') {
        compA = a.who;
        compB = b.who;
      } else if (sortColumn === 'job') {
        compA = a.jobNumber;
        compB = b.jobNumber;
      } else if (sortColumn === 'details') {
        compA = a.details;
        compB = b.details;
      } else if (sortColumn === 'note') {
        compA = a.note ? 1 : 0;
        compB = b.note ? 1 : 0;
      } else if (sortColumn === 'status') {
        compA = a.status;
        compB = b.status;
      }

      if (compA < compB) return sortDirection === 'asc' ? -1 : 1;
      if (compA > compB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [
    unifiedDailyLogFeed,
    logFilterCategory,
    logSearchQuery,
    selectedWhoFilters,
    selectedStatusFilters,
    notesOnlyFilter,
    sortColumn,
    sortDirection
  ]);

  // Top Operational Summary Subtotals
  const topSummary = useMemo(() => {
    let totalBookHours = 0;
    unifiedDailyLogFeed.filter(item => item.category === 'task').forEach(t => {
      if (t.details) {
        const match = t.details.match(/\(([\d.]+)h Book\)/);
        if (match) totalBookHours += parseFloat(match[1]);
      }
    });

    const totalTechsToday = new Set(
      activeSessions
        .filter(s => {
          const d = parseSafeDate(s.clockIn || s.startTime || s.createdAt);
          return d && isSameSelectedDate(d);
        })
        .map(s => s.userId || s.staffId)
        .filter(Boolean)
    ).size || activeSessions.length;

    let totalClockedSec = 0;
    activeSessions.forEach(s => {
      const inDate = parseSafeDate(s.clockIn || s.startTime);
      if (inDate && isSameSelectedDate(inDate)) {
        const outDate = parseSafeDate(s.clockOut || s.endTime) || new Date();
        const sec = Math.max(0, Math.floor((outDate.getTime() - inDate.getTime()) / 1000));
        totalClockedSec += sec;
      }
    });
    const totalClockedHours = (totalClockedSec / 3600).toFixed(1);
    const pendingPartsCount = partsRequests.filter(p => (p.status || 'pending').toLowerCase() === 'pending').length;

    return {
      totalBookHours: totalBookHours.toFixed(1),
      totalTechsToday,
      totalClockedHours,
      pendingPartsCount
    };
  }, [unifiedDailyLogFeed, activeSessions, partsRequests, selectedDate]);

  // Sound Chime Trigger on New Event Arrival
  const [prevFeedIds, setPrevFeedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (unifiedDailyLogFeed.length > 0) {
      const currentIds = new Set(unifiedDailyLogFeed.map(item => item.id));
      if (prevFeedIds.size > 0 && soundEnabled) {
        const newItems = unifiedDailyLogFeed.filter(item => !prevFeedIds.has(item.id));
        if (newItems.length > 0) {
          playEventChime(newItems[0].category as any);
        }
      }
      setPrevFeedIds(currentIds);
    }
  }, [unifiedDailyLogFeed, soundEnabled]);

  // KPI Metrics
  const metrics = useMemo(() => {
    const taskCount = unifiedDailyLogFeed.filter(f => f.category === 'task').length;
    const shiftCount = unifiedDailyLogFeed.filter(f => f.category === 'shift').length;
    const partsCount = unifiedDailyLogFeed.filter(f => f.category === 'parts').length;
    const qcCount = unifiedDailyLogFeed.filter(f => f.category === 'qc' || f.status === 'READY FOR QC').length;
    return { taskCount, shiftCount, partsCount, qcCount, total: unifiedDailyLogFeed.length };
  }, [unifiedDailyLogFeed]);

  // Generate Clean Plain-Text Report for Selected Date
  const generateDailyReportText = () => {
    const nowTimeStr = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const formattedDateStr = `${selectedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })} as of ${nowTimeStr}`;

    const touchedJobIds = Array.from(new Set(unifiedDailyLogFeed.map(f => f.jobId).filter(id => id && id !== 'N/A')));
    const touchedJobsList = jobs.filter(j => touchedJobIds.includes(j.id));

    let report = `================================================================================\n`;
    report += `           UPFITTERS OS — DAILY OPERATIONS & TOUCHED JOBS REPORT\n`;
    report += `================================================================================\n`;
    report += `Date: ${formattedDateStr}\n`;
    report += `Facility: Main Shop Operations\n\n`;

    report += `--------------------------------------------------------------------------------\n`;
    report += `1. DAILY OPERATIONS METRICS\n`;
    report += `--------------------------------------------------------------------------------\n`;
    report += `• Jobs Touched Today:       ${touchedJobIds.length} Jobs\n`;
    report += `• Completed Book Hours:    ${topSummary.totalBookHours} hrs\n`;
    report += `• Total Techs Today:        ${topSummary.totalTechsToday} Techs\n`;
    report += `• Total Clocked Hours:     ${topSummary.totalClockedHours} hrs\n`;
    report += `• Tasks Finished Today:     ${metrics.taskCount} Tasks\n`;
    report += `• Active Task Blockers:     ${unifiedDailyLogFeed.filter(f => f.status === 'TASK BLOCKED' || f.status === 'BLOCKED').length} Tasks Blocked\n`;
    report += `• Unfulfilled Parts (Shop): ${topSummary.pendingPartsCount} Pending Parts\n`;
    report += `• Jobs Ready for QC:        ${readyForQcJobs.length} Jobs\n\n`;

    report += `--------------------------------------------------------------------------------\n`;
    report += `2. JOBS TOUCHED TODAY (STATUS & PROGRESS)\n`;
    report += `--------------------------------------------------------------------------------\n\n`;

    if (touchedJobsList.length === 0) {
      report += `No job activity recorded for ${formattedDateStr}.\n\n`;
    } else {
      touchedJobsList.forEach(j => {
        const jFeed = unifiedDailyLogFeed.filter(f => f.jobId === j.id);
        const jTechsList = Array.from(new Set(jFeed.map(f => f.who).filter(Boolean)));
        const jTechs = jTechsList.join(', ') || j.assignedTechName || 'Shop Crew';
        const assignedTechCount = Math.max(1, jTechsList.length || (j.assignedTechs ? j.assignedTechs.length : 1));

        // Task & Book Hours Progress (Combines subcollection tasks AND embedded j.tasks)
        const subTasks = tasksMap[j.id] || [];
        const embeddedTasks = Array.isArray(j.tasks) ? j.tasks : [];
        const existingIds = new Set(subTasks.map((t: any) => t.id).filter(Boolean));
        const extraEmbedded = embeddedTasks.filter((t: any) => t && (t.id || t.name || t.title) && (!t.id || !existingIds.has(t.id)));
        const jTasks = [...subTasks, ...extraEmbedded];

        const totalTaskCount = jTasks.length;
        const completedTaskCount = jTasks.filter((t: any) => isTaskCompleted(t)).length;

        let doneBookHours = 0;
        let totalBookHours = 0;
        jTasks.forEach((t: any) => {
          const val = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0') || 0;
          totalBookHours += val;
          if (isTaskCompleted(t)) doneBookHours += val;
        });

        if (totalBookHours === 0 && j.estimatedHours) {
          totalBookHours = parseFloat(j.estimatedHours) || 0;
        }

        const remainingBookHours = Math.max(0, totalBookHours - doneBookHours);
        const pctComplete = totalTaskCount > 0 ? Math.round((completedTaskCount / totalTaskCount) * 100) : (remainingBookHours === 0 ? 100 : 0);

        // Single-Job ETA Calculation
        let etaText = 'N/A';
        if (completedTaskCount === totalTaskCount && totalTaskCount > 0) {
          etaText = 'COMPLETE / READY FOR QC';
        } else if (remainingBookHours === 0) {
          etaText = totalTaskCount > 0 ? `${completedTaskCount}/${totalTaskCount} Tasks Complete` : 'In Progress';
        } else {
          const hoursNeeded = remainingBookHours / assignedTechCount;
          if (hoursNeeded <= 3) {
            etaText = `Today (~${hoursNeeded.toFixed(1)}h remaining with ${assignedTechCount} tech${assignedTechCount > 1 ? 's' : ''})`;
          } else if (hoursNeeded <= 8) {
            etaText = `By End of Shift (~${hoursNeeded.toFixed(1)}h work remaining)`;
          } else {
            const daysNeeded = Math.ceil(hoursNeeded / 7.5);
            etaText = `~${daysNeeded} Day${daysNeeded > 1 ? 's' : ''} (${remainingBookHours.toFixed(1)}h total remaining work)`;
          }
        }

        const doneTasksDetails = jFeed.filter(f => f.category === 'task').map(f => f.details).join('; ');
        const partsForJob = partsRequests.filter(p => p.jobId === j.id);
        const partsSummary = partsForJob.map(p => {
          const name = p.partName || p.partTitle || p.name || p.title || p.itemDescription || p.description;
          const num = p.partNumber || p.sku || p.partNum;
          let label = name || (num ? `#${num}` : 'Part');
          if (name && num && !name.toLowerCase().includes(String(num).toLowerCase())) {
            label = `${name} (#${num})`;
          }
          const qtyStr = p.quantity ? ` x${p.quantity}` : '';
          return `${label}${qtyStr} (${(p.status || 'pending').toUpperCase()})`;
        }).join(', ');

        report += `[Job #${j.jobNumber || 'N/A'}] — ${j.customerName || j.title || 'Upfit Job'}\n`;
        report += `• Status: ${j.status || 'In Progress'}\n`;
        report += `• Assigned Tech(s): ${jTechs}\n`;
        report += `• Task Progress: ${completedTaskCount} / ${totalTaskCount} Tasks Done (${pctComplete}%)\n`;
        report += `• Hours Breakdown: ${doneBookHours.toFixed(1)}h Done | ${remainingBookHours.toFixed(1)}h Remaining (Total: ${totalBookHours.toFixed(1)}h Book)\n`;
        report += `• Single-Job ETA: ${etaText}\n`;
        if (doneTasksDetails) report += `• Completed Today: ${doneTasksDetails}\n`;
        if (partsSummary) report += `• Parts Status: ${partsSummary}\n`;
        report += `\n`;
      });
    }

    report += `================================================================================\n`;
    return report;
  };

  const handleCopyReport = () => {
    const reportText = generateDailyReportText();
    navigator.clipboard.writeText(reportText);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  const handlePrintReport = () => {
    const reportText = generateDailyReportText();
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(`
        <html>
          <head>
            <title>Daily Operations Report - ${selectedDate.toLocaleDateString()}</title>
            <style>
              body { font-family: monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; padding: 20px; color: #000; }
              @media print { body { padding: 0; } }
            </style>
          </head>
          <body>${reportText}</body>
        </html>
      `);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => printWin.print(), 250);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 bg-zinc-950 font-sans text-xs select-none gap-6 overflow-auto min-h-screen text-zinc-100">
      
      {/* Ultra-Compact Unified Command Header & Table Container */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-lg space-y-3">
        {/* Header Toolbar Row 1: Title, Subtotals & Global Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Table className="w-5 h-5 text-indigo-400 shrink-0" />
              <h1 className="text-base font-black text-white uppercase tracking-wider">Daily Operations Log</h1>
            </div>

            {/* Top Operational Subtotals (No Scrolling Required) */}
            <div className="flex items-center gap-2 font-mono text-[10px] flex-wrap">
              <div className="flex items-center gap-1 text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-md border border-teal-500/20" title="Completed labor book hours today">
                <span className="font-extrabold text-white">⚡ {topSummary.totalBookHours}h</span> Book Time
              </div>
              <div className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20" title="Total unique technicians who clocked in today">
                <span className="font-extrabold text-white">👤 {topSummary.totalTechsToday}</span> Total Techs Today
              </div>
              <div className="flex items-center gap-1 text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20" title="Total actual timeclock shift hours logged today">
                <span className="font-extrabold text-white">⏱️ {topSummary.totalClockedHours}h</span> Total Clocked Hours
              </div>
              <button 
                onClick={() => window.open(`/business/${tenantId}/parts_worksheet`, '_blank')}
                className="flex items-center gap-1 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/20 transition cursor-pointer group" 
                title="View unfulfilled parts in Parts Worksheet (Opens in New Tab)"
              >
                <span className="font-extrabold text-white">📦 {topSummary.pendingPartsCount}</span> 
                <span className="group-hover:underline">Unfulfilled Parts (Shop)</span>
              </button>

              {logFilterCategory !== 'all' && (
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-extrabold uppercase bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  Showing: {
                    logFilterCategory === 'task' ? 'TASKS DONE ONLY' :
                    logFilterCategory === 'shift' ? 'TIMECLOCKS & SHIFTS ONLY' :
                    logFilterCategory === 'parts' ? 'PARTS REQUESTS ONLY' :
                    logFilterCategory === 'qc' ? 'READY FOR QC ONLY' :
                    'ALL RECORDS'
                  }
                </span>
              )}
              {hasActiveColumnFilters && (
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-extrabold uppercase bg-teal-500/10 text-teal-300 border border-teal-500/20">
                  Column Filters Active
                </span>
              )}
            </div>
          </div>

          {/* Date Selector, Sound Toggle & Column Selector Controls */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Date Selector Navigation */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 font-mono text-[10px]">
              <button
                onClick={handlePrevDay}
                className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition"
                title="Previous Day"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-1 px-1.5">
                <Calendar className="w-3 h-3 text-indigo-400" />
                <input
                  type="date"
                  value={selectedDate.toISOString().split('T')[0]}
                  onChange={e => {
                    if (e.target.value) {
                      const parts = e.target.value.split('-');
                      setSelectedDate(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
                    }
                  }}
                  className="bg-transparent text-white font-bold font-mono focus:outline-none cursor-pointer text-[10px]"
                />
              </div>

              <button
                onClick={handleNextDay}
                disabled={isSelectedDateToday}
                className={cn(
                  "p-1 rounded transition",
                  isSelectedDateToday ? "text-zinc-700 cursor-not-allowed" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                )}
                title="Next Day"
              >
                <ChevronRight className="w-3 h-3" />
              </button>

              {!isSelectedDateToday && (
                <button
                  onClick={handleResetToday}
                  className="ml-1 text-[8px] font-bold uppercase bg-indigo-500/20 text-indigo-300 px-1 py-0.5 rounded border border-indigo-500/30 hover:bg-indigo-500/30 transition"
                >
                  Today
                </button>
              )}
            </div>

            {/* Sound Toggle */}
            <button
              onClick={toggleSound}
              className={cn(
                "px-2 py-1 rounded-lg border flex items-center gap-1 font-bold text-[9px] transition",
                soundEnabled
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20"
                  : "bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-zinc-300"
              )}
              title="Toggle Web Audio Chimes on Live Events"
            >
              {soundEnabled ? <Volume2 className="w-3 h-3 text-emerald-400" /> : <VolumeX className="w-3 h-3 text-zinc-500" />}
              <span>{soundEnabled ? 'Chime ON' : 'Chime OFF'}</span>
            </button>

            {/* Daily Operations Report Action Button */}
            <button
              onClick={() => setShowReportModal(true)}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[9px] flex items-center gap-1.5 transition shadow cursor-pointer"
              title="Generate, Copy & Print Daily Operations Report"
            >
              <FileText className="w-3 h-3 text-white" />
              <span>Daily Report</span>
            </button>

            {/* Column Visibility Selector */}
            <div className="relative">
              <button
                onClick={() => setIsColumnPickerOpen(prev => !prev)}
                className={cn(
                  "px-2 py-1 rounded-lg border flex items-center gap-1 font-bold text-[9px] transition",
                  isColumnPickerOpen
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                    : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                )}
                title="Show/Hide Columns"
              >
                <Columns3 className="w-3 h-3 text-indigo-400" />
                <span>Columns ⚙️</span>
              </button>

              {isColumnPickerOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2.5 z-30 font-sans text-[11px] text-zinc-200">
                  <div className="text-[10px] font-bold uppercase text-zinc-400 pb-2 mb-2 border-b border-zinc-800">
                    Visible Columns:
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white select-none">
                      <input
                        type="checkbox"
                        checked={visibleColumns.time}
                        onChange={() => toggleColumnVisibility('time')}
                        className="rounded bg-zinc-950 border-zinc-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>TIME</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white select-none">
                      <input
                        type="checkbox"
                        checked={visibleColumns.category}
                        onChange={() => toggleColumnVisibility('category')}
                        className="rounded bg-zinc-950 border-zinc-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>CATEGORY</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white select-none">
                      <input
                        type="checkbox"
                        checked={visibleColumns.who}
                        onChange={() => toggleColumnVisibility('who')}
                        className="rounded bg-zinc-950 border-zinc-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>STAFF / USER</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white select-none">
                      <input
                        type="checkbox"
                        checked={visibleColumns.job}
                        onChange={() => toggleColumnVisibility('job')}
                        className="rounded bg-zinc-950 border-zinc-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>JOB</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white select-none">
                      <input
                        type="checkbox"
                        checked={visibleColumns.details}
                        onChange={() => toggleColumnVisibility('details')}
                        className="rounded bg-zinc-950 border-zinc-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>ACTIVITY & DETAILS</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white select-none">
                      <input
                        type="checkbox"
                        checked={visibleColumns.note}
                        onChange={() => toggleColumnVisibility('note')}
                        className="rounded bg-zinc-950 border-zinc-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>NOTES</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white select-none">
                      <input
                        type="checkbox"
                        checked={visibleColumns.status}
                        onChange={() => toggleColumnVisibility('status')}
                        className="rounded bg-zinc-950 border-zinc-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>STATUS</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Live Update Pulse Pill */}
            <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {/* Toolbar Row 2: Filter Pills, Search Bar & Reset Buttons */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1">
          {/* Consolidated Single-Row KPI Filter Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 flex-1">
            {/* Total Records (All) */}
            <button
              onClick={() => setLogFilterCategory('all')}
              className={cn(
                "px-3 py-1.5 rounded-xl flex items-center justify-between transition border shadow-sm cursor-pointer group text-left",
                logFilterCategory === 'all'
                  ? "bg-indigo-950/50 border-indigo-500/80 ring-1 ring-indigo-500/30"
                  : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60"
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-[9px] uppercase text-zinc-300 truncate">
                <Activity className={cn("w-3 h-3 shrink-0 transition", logFilterCategory === 'all' ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-300")} />
                <span className="truncate">ALL ACTIVITY</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                <span className="text-xs font-black text-white">{metrics.total}</span>
                <span className={cn("text-[8px] font-mono font-bold px-1 py-0.2 rounded border uppercase", logFilterCategory === 'all' ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "text-zinc-500 border-zinc-800 group-hover:text-zinc-400")}>
                  {logFilterCategory === 'all' ? 'Active' : 'Filter'}
                </span>
              </div>
            </button>

            {/* Tasks Completed */}
            <button
              onClick={() => setLogFilterCategory('task')}
              className={cn(
                "px-3 py-1.5 rounded-xl flex items-center justify-between transition border shadow-sm cursor-pointer group text-left",
                logFilterCategory === 'task'
                  ? "bg-teal-950/50 border-teal-500/80 ring-1 ring-teal-500/30"
                  : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60"
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-[9px] uppercase text-zinc-300 truncate">
                <CheckCircle2 className={cn("w-3 h-3 shrink-0 transition", logFilterCategory === 'task' ? "text-teal-400" : "text-zinc-500 group-hover:text-zinc-300")} />
                <span className="truncate">TASKS DONE</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                <span className="text-xs font-black text-teal-400">{metrics.taskCount}</span>
                <span className={cn("text-[8px] font-mono font-bold px-1 py-0.2 rounded border uppercase", logFilterCategory === 'task' ? "bg-teal-500/20 text-teal-300 border-teal-500/30" : "text-zinc-500 border-zinc-800 group-hover:text-zinc-400")}>
                  {logFilterCategory === 'task' ? 'Active' : 'Filter'}
                </span>
              </div>
            </button>

            {/* Shift Timeclocks */}
            <button
              onClick={() => setLogFilterCategory('shift')}
              className={cn(
                "px-3 py-1.5 rounded-xl flex items-center justify-between transition border shadow-sm cursor-pointer group text-left",
                logFilterCategory === 'shift'
                  ? "bg-emerald-950/50 border-emerald-500/80 ring-1 ring-emerald-500/30"
                  : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60"
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-[9px] uppercase text-zinc-300 truncate">
                <Clock className={cn("w-3 h-3 shrink-0 transition", logFilterCategory === 'shift' ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300")} />
                <span className="truncate">TIMECLOCK</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                <span className="text-xs font-black text-emerald-400">{metrics.shiftCount}</span>
                <span className={cn("text-[8px] font-mono font-bold px-1 py-0.2 rounded border uppercase", logFilterCategory === 'shift' ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "text-zinc-500 border-zinc-800 group-hover:text-zinc-400")}>
                  {logFilterCategory === 'shift' ? 'Active' : 'Filter'}
                </span>
              </div>
            </button>

            {/* Parts Requests */}
            <button
              onClick={() => setLogFilterCategory('parts')}
              className={cn(
                "px-3 py-1.5 rounded-xl flex items-center justify-between transition border shadow-sm cursor-pointer group text-left",
                logFilterCategory === 'parts'
                  ? "bg-amber-950/50 border-amber-500/80 ring-1 ring-amber-500/30"
                  : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60"
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-[9px] uppercase text-zinc-300 truncate">
                <Package className={cn("w-3 h-3 shrink-0 transition", logFilterCategory === 'parts' ? "text-amber-400" : "text-zinc-500 group-hover:text-zinc-300")} />
                <span className="truncate">PARTS</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                <span className="text-xs font-black text-amber-400">{metrics.partsCount}</span>
                <span className={cn("text-[8px] font-mono font-bold px-1 py-0.2 rounded border uppercase", logFilterCategory === 'parts' ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "text-zinc-500 border-zinc-800 group-hover:text-zinc-400")}>
                  {logFilterCategory === 'parts' ? 'Active' : 'Filter'}
                </span>
              </div>
            </button>

            {/* Ready for QC */}
            <button
              onClick={() => setLogFilterCategory('qc')}
              className={cn(
                "px-3 py-1.5 rounded-xl flex items-center justify-between transition border shadow-sm cursor-pointer group text-left",
                logFilterCategory === 'qc'
                  ? "bg-purple-950/50 border-purple-500/80 ring-1 ring-purple-500/30"
                  : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60"
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-[9px] uppercase text-zinc-300 truncate">
                <ShieldCheck className={cn("w-3 h-3 shrink-0 transition", logFilterCategory === 'qc' ? "text-purple-400" : "text-zinc-500 group-hover:text-zinc-300")} />
                <span className="truncate">READY FOR QC</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                <span className="text-xs font-black text-purple-400">{metrics.qcCount}</span>
                <span className={cn("text-[8px] font-mono font-bold px-1 py-0.2 rounded border uppercase", logFilterCategory === 'qc' ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "text-zinc-500 border-zinc-800 group-hover:text-zinc-400")}>
                  {logFilterCategory === 'qc' ? 'Active' : 'Filter'}
                </span>
              </div>
            </button>
          </div>

          {/* Search Input & Reset Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search daily log..."
                value={logSearchQuery}
                onChange={e => setLogSearchQuery(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-white text-[11px] rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-500 w-56 sm:w-64 font-mono"
              />
            </div>

            {isCustomSorted && (
              <button
                onClick={resetSort}
                className="text-[10px] font-bold text-teal-300 hover:text-white bg-teal-500/10 border border-teal-500/20 hover:border-teal-500/40 px-2.5 py-1.5 rounded-lg transition flex items-center gap-1.5"
                title="Reset sorting to Default (Newest First)"
              >
                <RotateCcw className="w-3 h-3 text-teal-400" />
                Reset Sort ({sortColumn?.toUpperCase()})
              </button>
            )}

            {(logFilterCategory !== 'all' || hasActiveColumnFilters || logSearchQuery) && (
              <button
                onClick={clearAllFilters}
                className="text-[10px] font-bold text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 rounded-lg transition"
              >
                Reset All Filters
              </button>
            )}
          </div>
        </div>

        {/* Click outside overlay for popover dropdowns */}
        {activeHeaderDropdown && (
          <div 
            className="fixed inset-0 z-15 bg-transparent cursor-default"
            onClick={() => setActiveHeaderDropdown(null)}
          />
        )}

        {/* Spreadsheet Table (Full Page Inline Rendering) */}
        <div className="overflow-x-auto border border-zinc-800 rounded-xl relative">
          <table className="w-full text-left border-collapse text-[11px] font-sans select-text">
            <thead className="bg-zinc-950 text-zinc-400 font-mono text-[9px] uppercase tracking-wider sticky top-0 z-20 border-b border-zinc-800 select-none">
              <tr>
                {/* TIME Header */}
                {visibleColumns.time && (
                  <th className="py-2 px-3 border-r border-zinc-800/80 w-28 relative">
                    <div className="flex items-center justify-between gap-1">
                      <button 
                        onClick={() => handleSortToggle('time')}
                        className="flex items-center gap-1 font-black hover:text-white transition"
                      >
                        <span>TIME</span>
                        {sortColumn === 'time' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-teal-400" /> : <ArrowDown className="w-3 h-3 text-teal-400" />
                        )}
                      </button>
                      <button 
                        onClick={() => setActiveHeaderDropdown(prev => prev === 'time' ? null : 'time')}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white"
                        title="Filter & Sort Options"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    {activeHeaderDropdown === 'time' && (
                      <div className="absolute left-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2 z-30 font-sans text-[11px] normal-case font-normal text-zinc-200">
                        <button
                          onClick={() => { setSortColumn('time'); setSortDirection('desc'); setActiveHeaderDropdown(null); }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 flex items-center gap-2"
                        >
                          <ArrowDown className="w-3 h-3 text-indigo-400" /> Sort Newest to Oldest
                        </button>
                        <button
                          onClick={() => { setSortColumn('time'); setSortDirection('asc'); setActiveHeaderDropdown(null); }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 flex items-center gap-2"
                        >
                          <ArrowUp className="w-3 h-3 text-indigo-400" /> Sort Oldest to Newest
                        </button>
                      </div>
                    )}
                  </th>
                )}



                {/* CATEGORY Header */}
                {visibleColumns.category && (
                  <th className="py-2 px-3 border-r border-zinc-800/80 w-32 relative">
                    <div className="flex items-center justify-between gap-1">
                      <button 
                        onClick={() => handleSortToggle('category')}
                        className="flex items-center gap-1 font-black hover:text-white transition"
                      >
                        <span>CATEGORY</span>
                        {sortColumn === 'category' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-teal-400" /> : <ArrowDown className="w-3 h-3 text-teal-400" />
                        )}
                      </button>
                      <button 
                        onClick={() => setActiveHeaderDropdown(prev => prev === 'category' ? null : 'category')}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white"
                        title="Filter & Sort Options"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    {activeHeaderDropdown === 'category' && (
                      <div className="absolute left-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2 z-30 font-sans text-[11px] normal-case font-normal text-zinc-200">
                        <button
                          onClick={() => { setSortColumn('category'); setSortDirection('asc'); setActiveHeaderDropdown(null); }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 flex items-center gap-2"
                        >
                          <ArrowUp className="w-3 h-3 text-indigo-400" /> Sort Category A-Z
                        </button>
                        <button
                          onClick={() => { setSortColumn('category'); setSortDirection('desc'); setActiveHeaderDropdown(null); }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 flex items-center gap-2"
                        >
                          <ArrowDown className="w-3 h-3 text-indigo-400" /> Sort Category Z-A
                        </button>
                      </div>
                    )}
                  </th>
                )}

                {/* TECHNICIAN / USER Header */}
                {visibleColumns.who && (
                  <th className="py-2 px-3 border-r border-zinc-800/80 w-48 relative">
                    <div className="flex items-center justify-between gap-1">
                      <button 
                        onClick={() => handleSortToggle('who')}
                        className={cn("flex items-center gap-1 font-black hover:text-white transition", selectedWhoFilters.length > 0 && "text-indigo-400")}
                      >
                        <span>STAFF / USER</span>
                        {selectedWhoFilters.length > 0 && <span className="text-[8px] bg-indigo-500/20 text-indigo-300 px-1 rounded">({selectedWhoFilters.length})</span>}
                        {sortColumn === 'who' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-teal-400" /> : <ArrowDown className="w-3 h-3 text-teal-400" />
                        )}
                      </button>
                      <button 
                        onClick={() => setActiveHeaderDropdown(prev => prev === 'who' ? null : 'who')}
                        className={cn("p-1 hover:bg-zinc-800 rounded", selectedWhoFilters.length > 0 ? "text-indigo-400" : "text-zinc-500 hover:text-white")}
                        title="Filter & Sort Options"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    {activeHeaderDropdown === 'who' && (
                      <div className="absolute left-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2.5 z-30 font-sans text-[11px] normal-case font-normal text-zinc-200">
                        <div className="space-y-1 pb-2 border-b border-zinc-800">
                          <button
                            onClick={() => { setSortColumn('who'); setSortDirection('asc'); setActiveHeaderDropdown(null); }}
                            className="w-full text-left px-2 py-1 rounded hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <ArrowUp className="w-3 h-3 text-indigo-400" /> Sort Name A to Z
                          </button>
                          <button
                            onClick={() => { setSortColumn('who'); setSortDirection('desc'); setActiveHeaderDropdown(null); }}
                            className="w-full text-left px-2 py-1 rounded hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <ArrowDown className="w-3 h-3 text-indigo-400" /> Sort Name Z to A
                          </button>
                        </div>

                        <div className="pt-2">
                          <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 mb-1.5">
                            <span>Filter Staff:</span>
                            {selectedWhoFilters.length > 0 && (
                              <button onClick={() => setSelectedWhoFilters([])} className="text-indigo-400 hover:underline">Clear</button>
                            )}
                          </div>
                          <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                            {uniqueStaffNames.map(name => (
                              <label key={name} className="flex items-center gap-2 text-zinc-300 hover:text-white cursor-pointer select-none py-0.5">
                                <input
                                  type="checkbox"
                                  checked={selectedWhoFilters.includes(name)}
                                  onChange={() => toggleWhoFilter(name)}
                                  className="rounded bg-zinc-950 border-zinc-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                                />
                                <span className="truncate">{name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </th>
                )}

                {/* JOB Header */}
                {visibleColumns.job && (
                  <th className="py-2 px-3 border-r border-zinc-800/80 w-56 relative">
                    <div className="flex items-center justify-between gap-1">
                      <button 
                        onClick={() => handleSortToggle('job')}
                        className="flex items-center gap-1 font-black hover:text-white transition"
                      >
                        <span>JOB</span>
                        {sortColumn === 'job' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-teal-400" /> : <ArrowDown className="w-3 h-3 text-teal-400" />
                        )}
                      </button>
                      <button 
                        onClick={() => setActiveHeaderDropdown(prev => prev === 'job' ? null : 'job')}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white"
                        title="Filter & Sort Options"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    {activeHeaderDropdown === 'job' && (
                      <div className="absolute left-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2 z-30 font-sans text-[11px] normal-case font-normal text-zinc-200">
                        <button
                          onClick={() => { setSortColumn('job'); setSortDirection('asc'); setActiveHeaderDropdown(null); }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 flex items-center gap-2"
                        >
                          <ArrowUp className="w-3 h-3 text-indigo-400" /> Sort Job # A-Z
                        </button>
                        <button
                          onClick={() => { setSortColumn('job'); setSortDirection('desc'); setActiveHeaderDropdown(null); }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 flex items-center gap-2"
                        >
                          <ArrowDown className="w-3 h-3 text-indigo-400" /> Sort Job # Z-A
                        </button>
                      </div>
                    )}
                  </th>
                )}

                {/* ACTIVITY & DETAILS Header */}
                {visibleColumns.details && (
                  <th className="py-2 px-3 border-r border-zinc-800/80 w-80 lg:w-96 relative">
                    <div className="flex items-center justify-between gap-1">
                      <button 
                        onClick={() => handleSortToggle('details')}
                        className="flex items-center gap-1 font-black hover:text-white transition"
                      >
                        <span>ACTIVITY & DETAILS</span>
                        {sortColumn === 'details' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-teal-400" /> : <ArrowDown className="w-3 h-3 text-teal-400" />
                        )}
                      </button>
                    </div>
                  </th>
                )}

                {/* NOTES Header */}
                {visibleColumns.note && (
                  <th className="py-2 px-3 border-r border-zinc-800/80 w-64 relative">
                    <div className="flex items-center justify-between gap-1">
                      <button 
                        onClick={() => handleSortToggle('note')}
                        className={cn("flex items-center gap-1 font-black hover:text-white transition", notesOnlyFilter && "text-indigo-400")}
                      >
                        <span>NOTES</span>
                        {notesOnlyFilter && <span className="text-[8px] bg-indigo-500/20 text-indigo-300 px-1 rounded">(Has Note)</span>}
                        {sortColumn === 'note' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-teal-400" /> : <ArrowDown className="w-3 h-3 text-teal-400" />
                        )}
                      </button>
                      <button 
                        onClick={() => setActiveHeaderDropdown(prev => prev === 'note' ? null : 'note')}
                        className={cn("p-1 hover:bg-zinc-800 rounded", notesOnlyFilter ? "text-indigo-400" : "text-zinc-500 hover:text-white")}
                        title="Filter Notes"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    {activeHeaderDropdown === 'note' && (
                      <div className="absolute left-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2 z-30 font-sans text-[11px] normal-case font-normal text-zinc-200">
                        <button
                          onClick={() => { setNotesOnlyFilter(prev => !prev); setActiveHeaderDropdown(null); }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 flex items-center justify-between"
                        >
                          <span>Show Records With Notes Only</span>
                          {notesOnlyFilter && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                        </button>
                      </div>
                    )}
                  </th>
                )}

                {/* STATUS Header */}
                {visibleColumns.status && (
                  <th className="py-2 px-3 w-32 relative">
                    <div className="flex items-center justify-between gap-1">
                      <button 
                        onClick={() => handleSortToggle('status')}
                        className={cn("flex items-center gap-1 font-black hover:text-white transition", selectedStatusFilters.length > 0 && "text-indigo-400")}
                      >
                        <span>STATUS</span>
                        {selectedStatusFilters.length > 0 && <span className="text-[8px] bg-indigo-500/20 text-indigo-300 px-1 rounded">({selectedStatusFilters.length})</span>}
                        {sortColumn === 'status' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-teal-400" /> : <ArrowDown className="w-3 h-3 text-teal-400" />
                        )}
                      </button>
                      <button 
                        onClick={() => setActiveHeaderDropdown(prev => prev === 'status' ? null : 'status')}
                        className={cn("p-1 hover:bg-zinc-800 rounded", selectedStatusFilters.length > 0 ? "text-indigo-400" : "text-zinc-500 hover:text-white")}
                        title="Filter Statuses"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    {activeHeaderDropdown === 'status' && (
                      <div className="absolute right-0 top-full mt-1 w-52 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2.5 z-30 font-sans text-[11px] normal-case font-normal text-zinc-200">
                        <div className="space-y-1 pb-2 border-b border-zinc-800">
                          <button
                            onClick={() => { setSortColumn('status'); setSortDirection('asc'); setActiveHeaderDropdown(null); }}
                            className="w-full text-left px-2 py-1 rounded hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <ArrowUp className="w-3 h-3 text-indigo-400" /> Sort Status A-Z
                          </button>
                          <button
                            onClick={() => { setSortColumn('status'); setSortDirection('desc'); setActiveHeaderDropdown(null); }}
                            className="w-full text-left px-2 py-1 rounded hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <ArrowDown className="w-3 h-3 text-indigo-400" /> Sort Status Z-A
                          </button>
                        </div>

                        <div className="pt-2">
                          <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 mb-1.5">
                            <span>Filter Status:</span>
                            {selectedStatusFilters.length > 0 && (
                              <button onClick={() => setSelectedStatusFilters([])} className="text-indigo-400 hover:underline">Clear</button>
                            )}
                          </div>
                          <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                            {uniqueStatuses.map(st => (
                              <label key={st} className="flex items-center gap-2 text-zinc-300 hover:text-white cursor-pointer select-none py-0.5">
                                <input
                                  type="checkbox"
                                  checked={selectedStatusFilters.includes(st)}
                                  onChange={() => toggleStatusFilter(st)}
                                  className="rounded bg-zinc-950 border-zinc-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                                />
                                <span className="truncate uppercase text-[10px] font-mono font-bold">{st}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-200">
              {filteredDailyLog.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length || 1} className="py-12 text-center text-zinc-500 italic font-sans text-xs">
                    No activity records found matching the selected filters for {selectedDate.toLocaleDateString()}.
                  </td>
                </tr>
              ) : (
                filteredDailyLog.map(row => (
                  <tr key={row.id} className="hover:bg-zinc-800/40 transition group text-[11px] h-9">
                    {/* Time */}
                    {visibleColumns.time && (
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 font-mono font-bold text-teal-400 whitespace-nowrap">
                        {row.timeStr}
                      </td>
                    )}



                    {/* Category Badge */}
                    {visibleColumns.category && (
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 whitespace-nowrap">
                        <span className={cn("px-2 py-0.5 rounded text-[8px] font-mono font-black border uppercase", row.badgeClass)}>
                          {row.badgeLabel}
                        </span>
                      </td>
                    )}

                    {/* Who (Clickable Staff Profile Link - New Tab) */}
                    {visibleColumns.who && (
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 font-sans font-bold text-white truncate max-w-[170px]">
                        {row.staffId ? (
                          <button
                            onClick={() => window.open(`/business/${tenantId}/staff/${row.staffId}`, '_blank')}
                            className="flex items-center gap-1.5 text-white hover:text-indigo-400 hover:underline transition truncate text-left group/user"
                            title={`Open ${row.who}'s Staff Profile in New Tab`}
                          >
                            <User className="w-3 h-3 text-indigo-400 shrink-0 group-hover/user:text-indigo-300" />
                            <span className="truncate">{row.who}</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-zinc-500 shrink-0" />
                            <span className="truncate">{row.who}</span>
                          </div>
                        )}
                      </td>
                    )}


                    {/* Job / Task Link (Clickable Link - New Tab: Direct to Task if present, or Job) */}
                    {visibleColumns.job && (
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 font-sans truncate max-w-[220px]">
                        {(row.jobId && row.jobId !== 'N/A' && row.jobNumber && row.jobNumber !== 'N/A') ? (
                          <div>
                            <button
                              onClick={() => {
                                const targetUrl = (row.taskId && row.taskId !== 'N/A')
                                  ? `/business/${tenantId}/task/${row.jobId}/${row.taskId}`
                                  : `/business/${tenantId}/job/${row.jobId}`;
                                window.open(targetUrl, '_blank');
                              }}
                              className="font-bold text-indigo-300 hover:text-white hover:underline text-[10px] truncate text-left block"
                              title={row.taskId ? `Open Task Details for Job #${row.jobNumber} in New Tab` : `Open Job #${row.jobNumber} Details in New Tab`}
                            >
                              Job #{row.jobNumber}{row.customerName ? ` - ${row.customerName}` : (row.jobTitle ? ` - ${row.jobTitle}` : '')}
                            </button>
                          </div>
                        ) : (
                          <span className="text-zinc-500 font-mono text-[10px]">
                            {row.jobTitle && row.jobTitle !== 'Job Task' && row.jobTitle !== 'Timeclock Shift' ? row.jobTitle : 'Timeclock'}
                          </span>
                        )}
                      </td>
                    )}

                    {/* Activity & Details (Clickable to Task Detail Page if Task Event) */}
                    {visibleColumns.details && (
                      <td 
                        onMouseEnter={(e) => {
                          const target = e.currentTarget as HTMLElement;
                          const child = target.firstElementChild as HTMLElement;
                          const isOverflow = (child ? child.scrollWidth > child.clientWidth : false) || target.scrollWidth > target.clientWidth;
                          if (isOverflow) {
                            const rect = target.getBoundingClientRect();
                            setHoveredCardTooltip({
                              text: row.details,
                              x: rect.left,
                              y: rect.bottom + 4,
                              title: 'Activity Details'
                            });
                          }
                        }}
                        onMouseLeave={() => setHoveredCardTooltip(null)}
                        className="py-1.5 px-3 border-r border-zinc-800/60 font-sans text-zinc-200 truncate max-w-[280px] lg:max-w-[360px]"
                      >
                        {(row.taskId && row.jobId && row.jobId !== 'N/A') ? (
                          <button
                            onClick={() => window.open(`/business/${tenantId}/task/${row.jobId}/${row.taskId}`, '_blank')}
                            className="font-medium text-xs leading-tight truncate text-left hover:text-indigo-300 hover:underline transition block w-full"
                            title="Open Task Details Page in New Tab"
                          >
                            {row.details}
                          </button>
                        ) : (
                          <div className="font-medium text-xs leading-tight truncate">{row.details}</div>
                        )}
                      </td>
                    )}

                    {/* Dedicated Notes Column */}
                    {visibleColumns.note && (
                      <td 
                        onMouseEnter={(e) => {
                          if (!row.note) return;
                          const target = e.currentTarget as HTMLElement;
                          const child = target.querySelector('span.truncate') as HTMLElement || target.firstElementChild as HTMLElement;
                          const isOverflow = (child ? child.scrollWidth > child.clientWidth : false) || target.scrollWidth > target.clientWidth;
                          if (isOverflow) {
                            const rect = target.getBoundingClientRect();
                            setHoveredCardTooltip({
                              text: row.note,
                              x: rect.left,
                              y: rect.bottom + 4,
                              title: 'Task Note'
                            });
                          }
                        }}
                        onMouseLeave={() => setHoveredCardTooltip(null)}
                        className="py-1.5 px-3 border-r border-zinc-800/60 font-sans text-zinc-300"
                      >
                        {row.note ? (
                          <div className="flex items-center gap-1.5 text-[10px] text-indigo-300 font-medium bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 max-w-[260px]">
                            <FileText className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span className="truncate italic">{row.note}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-600 font-mono text-[9px]">--</span>
                        )}
                      </td>
                    )}

                    {/* Status Column with Dynamic Color Coding */}
                    {visibleColumns.status && (
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <span className={cn(
                          "text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded border",
                          row.status === 'REQUESTED' && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                          row.status === 'ORDERED' && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                          row.status === 'RECEIVED' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                          ['WITH VEHICLE', 'DELIVERED', 'STAGED', 'FULFILLED'].includes(row.status) && "bg-purple-500/10 text-purple-400 border-purple-500/20",
                          row.status === 'READY FOR QC' && "bg-purple-500/10 text-purple-400 border-purple-500/20",
                          row.status === 'IN PROGRESS' && "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
                          row.status === 'Active Shift' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                          row.status === 'Shift Completed' && "bg-zinc-800 text-zinc-400 border-zinc-700",
                          !['REQUESTED', 'ORDERED', 'RECEIVED', 'WITH VEHICLE', 'DELIVERED', 'STAGED', 'FULFILLED', 'READY FOR QC', 'IN PROGRESS', 'Active Shift', 'Shift Completed'].includes(row.status) && "bg-zinc-950 text-zinc-400 border-zinc-800"
                        )}>
                          {row.status}
                        </span>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Hover Tooltip Card */}
      {hoveredCardTooltip && (
        <div 
          style={{
            left: Math.min(window.innerWidth - 340, Math.max(16, hoveredCardTooltip.x)),
            top: Math.min(window.innerHeight - 140, hoveredCardTooltip.y)
          }}
          className="fixed z-50 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-xl p-3 shadow-2xl max-w-sm text-xs font-sans text-zinc-100 pointer-events-none animate-in fade-in duration-150 space-y-1"
        >
          {hoveredCardTooltip.title && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 border-b border-zinc-800 pb-1">
              {hoveredCardTooltip.title}
            </div>
          )}
          <div className="leading-relaxed font-medium text-zinc-200 break-words whitespace-pre-wrap">
            {hoveredCardTooltip.text}
          </div>
        </div>
      )}

      {/* Daily Operations & Touched Jobs Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-wider">Daily Operations Report</h2>
                  <p className="text-[10px] text-zinc-400 font-mono">
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyReport}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer",
                    copiedReport ? "bg-emerald-600 text-white" : "bg-indigo-600 hover:bg-indigo-500 text-white"
                  )}
                >
                  {copiedReport ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedReport ? 'Copied!' : 'Copy Report'}</span>
                </button>
                <button
                  onClick={handlePrintReport}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-zinc-300" />
                  <span>Print Report</span>
                </button>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Monospace Text Report */}
            <div className="p-4 overflow-y-auto flex-1 bg-zinc-950">
              <pre className="font-mono text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap select-all bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80">
                {generateDailyReportText()}
              </pre>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
