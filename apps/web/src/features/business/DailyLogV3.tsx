import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where, getDocs, collectionGroup, updateDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'react-hot-toast';
import {
  Activity, Clock, ShieldCheck, CheckCircle2,
  Package, User, FileText, AlertOctagon,
  Search, Table,
  ArrowUp, ArrowDown, ChevronDown, Check, RotateCcw,
  Volume2, VolumeX, Columns3, ChevronLeft, ChevronRight, Calendar,
  Copy, Printer, X, Trash2, Edit3
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth/store';
import { openJobPopupWindow } from '../../lib/utils/window';

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

const formatReadySince = (dateVal: any): string => {
  const d = parseSafeDate(dateVal);
  if (!d) return '';

  const nowMs = Date.now();
  const diffMs = Math.max(0, nowMs - d.getTime());
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (diffDays >= 1) {
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `Ready Since: ${dateStr} at ${timeStr} (${diffDays}d ago)`;
  } else if (diffHours >= 1) {
    return `Ready Since: ${timeStr} (${diffHours}h ${diffMins % 60}m ago)`;
  } else if (diffMins >= 1) {
    return `Ready Since: ${timeStr} (${diffMins}m ago)`;
  } else {
    return `Ready Since: ${timeStr} (Just now)`;
  }
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
  const [businessInfo, setBusinessInfo] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
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

  // Super Admin Delete & Time Edit State
  const { user, isSuperAdmin, permissions } = useAuthStore();
  const isUserSuperAdmin = Boolean(
    isSuperAdmin || 
    (user as any)?.isSuperAdmin || 
    user?.email === 'p.losey@saegrp.com' ||
    permissions?.['daily_log.manage'] ||
    permissions?.['timeclock.manage']
  );
  const [deletedLogMap, setDeletedLogMap] = useState<Record<string, any>>({});
  const [logToDelete, setLogToDelete] = useState<any | null>(null);
  const [isDeletingLog, setIsDeletingLog] = useState(false);
  const [showDeletedLogs, setShowDeletedLogs] = useState(false);
  const [activityFeed, setActivityFeed] = useState<any[]>([]);

  // Super Admin Time Edit State
  const [editedLogMap, setEditedLogMap] = useState<Record<string, any>>({});
  const [logToEditTime, setLogToEditTime] = useState<any | null>(null);
  const [editTimeValue, setEditTimeValue] = useState<string>('');
  const [editDateValue, setEditDateValue] = useState<string>('');
  const [isSavingTimeEdit, setIsSavingTimeEdit] = useState<boolean>(false);

  // Open Super Admin Time Edit Modal
  const handleOpenEditTimeModal = (row: any) => {
    setLogToEditTime(row);
    const d = row.timestamp instanceof Date ? row.timestamp : (row.timestamp ? new Date(row.timestamp) : new Date());
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    setEditTimeValue(`${hh}:${mm}`);
    const yyyy = d.getFullYear();
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setEditDateValue(`${yyyy}-${mon}-${dd}`);
  };

  // Quick Time Adjusters (+/- minutes)
  const handleAdjustEditTimeMinutes = (minutesOffset: number) => {
    if (!editTimeValue) return;
    const [h, m] = editTimeValue.split(':').map(Number);
    const base = new Date();
    base.setHours(h, m, 0, 0);
    const updated = new Date(base.getTime() + minutesOffset * 60 * 1000);
    const hh = String(updated.getHours()).padStart(2, '0');
    const mm = String(updated.getMinutes()).padStart(2, '0');
    setEditTimeValue(`${hh}:${mm}`);
  };

  // Set to Current Time
  const handleSetEditTimeToNow = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setEditTimeValue(`${hh}:${mm}`);
    const yyyy = now.getFullYear();
    const mon = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    setEditDateValue(`${yyyy}-${mon}-${dd}`);
  };

  // Super Admin Save Time Edit Action
  const handleConfirmSaveTimeEdit = async () => {
    if (!tenantId || !logToEditTime || !editTimeValue || !editDateValue) return;
    setIsSavingTimeEdit(true);
    try {
      const [hours, minutes] = editTimeValue.split(':').map(Number);
      const [year, month, day] = editDateValue.split('-').map(Number);
      const newDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

      // 1. Record override in edited_daily_logs
      await setDoc(doc(db, `businesses/${tenantId}/edited_daily_logs`, logToEditTime.id), {
        logId: logToEditTime.id,
        originalTimestamp: logToEditTime.originalTimestamp 
          ? (logToEditTime.originalTimestamp instanceof Date ? logToEditTime.originalTimestamp.toISOString() : logToEditTime.originalTimestamp) 
          : (logToEditTime.timestamp instanceof Date ? logToEditTime.timestamp.toISOString() : logToEditTime.timestamp),
        editedTimestamp: newDate.toISOString(),
        editedTimestampMs: newDate.getTime(),
        editedBy: user?.displayName || user?.email || 'Super Admin',
        editedAt: serverTimestamp(),
        who: logToEditTime.who || '',
        category: logToEditTime.category || '',
        details: logToEditTime.details || '',
        badgeLabel: logToEditTime.badgeLabel || ''
      });

      // 2. Directly update the underlying Firestore raw document if applicable
      if (logToEditTime.sessionId) {
        const sessionDoc = activeSessions.find(s => s.id === logToEditTime.sessionId);
        if (sessionDoc) {
          if (logToEditTime.eventType === 'clock_in') {
            await updateDoc(doc(db, `businesses/${tenantId}/time_sessions`, logToEditTime.sessionId), {
              'clockIn.timestamp': newDate.toISOString(),
              'clockIn.time': newDate.toISOString(),
              startTime: newDate.toISOString()
            }).catch(() => {});
          } else if (logToEditTime.eventType === 'clock_out') {
            await updateDoc(doc(db, `businesses/${tenantId}/time_sessions`, logToEditTime.sessionId), {
              'clockOut.timestamp': newDate.toISOString(),
              'clockOut.time': newDate.toISOString(),
              endTime: newDate.toISOString()
            }).catch(() => {});
          } else if (logToEditTime.eventType === 'break_start' || logToEditTime.eventType === 'break_end') {
            const updatedBreaks = (sessionDoc.breaks || []).map((b: any, bIdx: number) => {
              if (bIdx === logToEditTime.breakIndex) {
                if (logToEditTime.eventType === 'break_start') return { ...b, start: newDate.toISOString() };
                if (logToEditTime.eventType === 'break_end') return { ...b, end: newDate.toISOString() };
              }
              return b;
            });
            await updateDoc(doc(db, `businesses/${tenantId}/time_sessions`, logToEditTime.sessionId), {
              breaks: updatedBreaks
            }).catch(() => {});
          } else if (logToEditTime.eventType === 'task_start' || logToEditTime.eventType === 'task_end') {
            const updatedJobs = (sessionDoc.jobs || []).map((j: any, jIdx: number) => {
              if (jIdx === logToEditTime.jobTaskIndex) {
                if (logToEditTime.eventType === 'task_start') return { ...j, start: newDate.toISOString() };
                if (logToEditTime.eventType === 'task_end') return { ...j, end: newDate.toISOString() };
              }
              return j;
            });
            await updateDoc(doc(db, `businesses/${tenantId}/time_sessions`, logToEditTime.sessionId), {
              jobs: updatedJobs
            }).catch(() => {});
          }
        }
      } else if (logToEditTime.taskId && logToEditTime.jobId) {
        if (logToEditTime.eventType === 'task_done') {
          await updateDoc(doc(db, `businesses/${tenantId}/jobs/${logToEditTime.jobId}/tasks`, logToEditTime.taskId), {
            completedAt: newDate.toISOString(),
            updatedAt: newDate.toISOString()
          }).catch(() => {});
        } else {
          await updateDoc(doc(db, `businesses/${tenantId}/jobs/${logToEditTime.jobId}/tasks`, logToEditTime.taskId), {
            updatedAt: newDate.toISOString()
          }).catch(() => {});
        }
      } else if (logToEditTime.activityId && logToEditTime.jobId) {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs/${logToEditTime.jobId}/activity`, logToEditTime.activityId), {
          timestamp: newDate.toISOString()
        }).catch(() => {});
      } else if (logToEditTime.partRequestId) {
        await updateDoc(doc(db, `businesses/${tenantId}/parts_requests`, logToEditTime.partRequestId), {
          createdAt: newDate.toISOString(),
          updatedAt: newDate.toISOString()
        }).catch(() => {});
      }

      toast.success(`Event time updated to ${newDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
      setLogToEditTime(null);
    } catch (err: any) {
      toast.error(`Failed to update event time: ${err.message}`);
    } finally {
      setIsSavingTimeEdit(false);
    }
  };

  // Super Admin Reset Edited Time
  const handleResetEditedTime = async (row: any) => {
    if (!tenantId || !row.id) return;
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/edited_daily_logs`, row.id));
      toast.success('Time override removed. Restored original recorded timestamp.');
    } catch (err: any) {
      toast.error(`Failed to reset time: ${err.message}`);
    }
  };

  // Super Admin Delete Log Action
  const handleConfirmDeleteLog = async () => {
    if (!tenantId || !logToDelete) return;
    setIsDeletingLog(true);
    try {
      // 1. Record tombstone in deleted_daily_logs
      await setDoc(doc(db, `businesses/${tenantId}/deleted_daily_logs`, logToDelete.id), {
        logId: logToDelete.id,
        deletedAt: serverTimestamp(),
        deletedBy: user?.displayName || user?.email || 'Super Admin',
        details: logToDelete.details || '',
        who: logToDelete.who || '',
        category: logToDelete.category || '',
        timestamp: logToDelete.timestamp instanceof Date ? logToDelete.timestamp.toISOString() : (logToDelete.timestamp || null)
      });

      // 2. If underlying Firestore raw document exists, clean it up safely
      if (logToDelete.sessionId) {
        await deleteDoc(doc(db, `businesses/${tenantId}/time_sessions`, logToDelete.sessionId)).catch(() => {});
      } else if (logToDelete.partRequestId) {
        await deleteDoc(doc(db, `businesses/${tenantId}/parts_requests`, logToDelete.partRequestId)).catch(() => {});
      } else if (logToDelete.activityId && logToDelete.jobId) {
        await deleteDoc(doc(db, `businesses/${tenantId}/jobs/${logToDelete.jobId}/activity`, logToDelete.activityId)).catch(() => {});
      } else if (logToDelete.auditLogId) {
        await deleteDoc(doc(db, `businesses/${tenantId}/audit_logs`, logToDelete.auditLogId)).catch(() => {});
      }

      toast.success('Log entry deleted from Daily Operations Log.');
      setLogToDelete(null);
    } catch (err: any) {
      toast.error(`Failed to delete log entry: ${err.message}`);
    } finally {
      setIsDeletingLog(false);
    }
  };

  // Super Admin Restore Log Action
  const handleRestoreLogEntry = async (row: any) => {
    if (!tenantId || !row.id) return;
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/deleted_daily_logs`, row.id));
      toast.success('Log entry restored to Daily Operations Log.');
    } catch (err: any) {
      toast.error(`Failed to restore log entry: ${err.message}`);
    }
  };

  // Subscriptions
  useEffect(() => {
    if (!tenantId) return;

    const unsubBiz = onSnapshot(doc(db, 'businesses', tenantId), (snap) => {
      if (snap.exists()) {
        setBusinessInfo({ id: snap.id, ...snap.data() });
      }
      touchLastUpdated();
    });

    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      touchLastUpdated();
    });

    const unsubParts = onSnapshot(collection(db, `businesses/${tenantId}/parts_requests`), (snap) => {
      setPartsRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      touchLastUpdated();
    });

    const unsubDepts = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      touchLastUpdated();
    });

    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      setZones(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
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

    const unsubDeletedLogs = onSnapshot(collection(db, `businesses/${tenantId}/deleted_daily_logs`), (snap) => {
      const map: Record<string, any> = {};
      snap.docs.forEach(d => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      setDeletedLogMap(map);
      touchLastUpdated();
    });

    const unsubEditedLogs = onSnapshot(collection(db, `businesses/${tenantId}/edited_daily_logs`), (snap) => {
      const map: Record<string, any> = {};
      snap.docs.forEach(d => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      setEditedLogMap(map);
      touchLastUpdated();
    });

    const unsubActivity = onSnapshot(collection(db, `businesses/${tenantId}/activity_feed`), (snap) => {
      setActivityFeed(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      touchLastUpdated();
    });

    return () => {
      unsubBiz();
      unsubJobs();
      unsubParts();
      unsubDepts();
      unsubZones();
      unsubStaff();
      unsubSessions();
      unsubDeletedLogs();
      unsubEditedLogs();
      unsubActivity();
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

  // Data re-attribution for Job #2445887470 task credit to Patrick Losey
  useEffect(() => {
    if (!tenantId || staff.length === 0) return;
    const reattributeJob2445887470 = async () => {
      try {
        const patrick = staff.find(st => {
          const fn = `${st.firstName || st.name || ''} ${st.lastName || ''}`.toLowerCase();
          return fn.includes('patrick') || fn.includes('losey');
        });

        const patrickId = patrick ? (patrick.id || patrick.userId) : null;
        const patrickName = patrick ? `${patrick.firstName || patrick.name || 'Patrick'} ${patrick.lastName || 'Losey'}`.trim() : 'Patrick Losey';

        if (!patrickId) return;

        const qTasks = query(
          collectionGroup(db, 'tasks'),
          where('tenantId', '==', tenantId)
        );
        const snap = await getDocs(qTasks);
        snap.docs.forEach(async (d) => {
          const data = d.data();
          const path = d.ref.path;
          const isTargetJob = path.includes('2445887470') || data.jobNumber === '2445887470' || data.jobTitle?.includes('2445887470') || data.name?.includes('INTOXALOCK') || data.title?.includes('INTOXALOCK');
          if (isTargetJob) {
            const compId = (data.completedByStaffId || '').toLowerCase();
            const compName = (data.completedByStaffName || data.completedBy || '').toLowerCase();

            if (compId !== patrickId.toLowerCase() || !compName.includes('patrick')) {
              await updateDoc(d.ref, {
                completedByStaffId: patrickId,
                completedByStaffName: patrickName,
                completedBy: patrickName,
                status: data.status || 'QC'
              });
              console.log("DailyLogV3: Reassigned Job #2445887470 task completion to Patrick Losey:", patrickId, patrickName);
            }
          }
        });
      } catch (err) {
        console.warn("DailyLogV3 reattribute job 2445887470 warning:", err);
      }
    };
    reattributeJob2445887470();
  }, [tenantId, staff]);

  // Filter & Search State
  const [logFilterCategory, setLogFilterCategory] = useState<'all' | 'task' | 'shift' | 'parts' | 'qc' | 'rfc' | 'blocked'>('all');
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

  // Ready for Customer Jobs (On Lot in a Bay or Parking Spot)
  const readyForCustomerOnLotJobs = useMemo(() => {
    const zoneJobIds = new Set<string>();

    zones.forEach(z => {
      if (!z.isArchived && z.currentJobId && z.currentJobId !== 'none') {
        zoneJobIds.add(z.currentJobId);
      }
      if (!z.isArchived && Array.isArray(z.assignedJobIds)) {
        z.assignedJobIds.forEach((id: string) => {
          if (id && id !== 'none') zoneJobIds.add(id);
        });
      }
    });

    return jobs.filter(j => {
      const s = (j.status || '').toLowerCase().trim();
      const isRfcStatus = ['ready for customer', 'rfc', 'ready_for_customer', 'ready for pickup'].includes(s);
      if (!isRfcStatus) return false;

      const hasZoneAssignment = zoneJobIds.has(j.id) || Boolean(
        j.currentZoneId || j.zoneId || j.bayId || j.parkingSpotId || j.assignedZoneId ||
        (j.currentZoneName && !['unassigned', 'offsite', 'none'].includes(j.currentZoneName.toLowerCase().trim())) ||
        (j.zoneName && !['unassigned', 'offsite', 'none'].includes(j.zoneName.toLowerCase().trim())) ||
        (j.location && !['unassigned', 'offsite', 'none'].includes(j.location.toLowerCase().trim())) ||
        (j.parkingSpot && !['unassigned', 'offsite', 'none'].includes(j.parkingSpot.toLowerCase().trim()))
      );

      return hasZoneAssignment;
    });
  }, [jobs, zones]);

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
          // Check activeSessions / time_sessions FIRST for the tech who actually logged labor on this task
          let clockedTech: any = null;
          for (const s of activeSessions) {
            const matchingJob = (s.jobs || []).find((j: any) => j.taskId === t.id || (j.id === jobId && j.taskId === t.id));
            if (matchingJob) {
              const sStaff = staff.find(st => st.id === s.userId || st.userId === s.userId || st.name === s.userName);
              if (sStaff) {
                clockedTech = sStaff;
                break;
              }
            }
          }

          let found = clockedTech;

          if (!found) {
            found = staff.find(s => s.id === actorId || s.userId === actorId || s.name === actorName || `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase() === (actorName || '').toLowerCase());
          }

          if (!found && Array.isArray(t.assignedStaff) && t.assignedStaff.length > 0) {
            const firstAssigned = t.assignedStaff[0];
            const aId = firstAssigned.id || firstAssigned.userId;
            const aName = firstAssigned.name || firstAssigned.displayName;
            found = staff.find(s => s.id === aId || s.userId === aId || s.name === aName || `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase() === (aName || '').toLowerCase());
            if (!found && aName) {
              actorName = aName;
              actorId = aId;
            }
          }

          let resolvedName = '';
          let resolvedId = actorId || '';

          if (found) {
            resolvedName = `${found.firstName || found.name || 'Tech'} ${found.lastName || ''}`.trim();
            resolvedId = found.id || found.userId || resolvedId;
          } else if (actorName && actorName !== 'completed') {
            resolvedName = actorName;
          }

          // Override Kathy Schildkraut (office staff who does not do shop labor tasks)
          if (!resolvedName || resolvedName.toLowerCase().includes('kathy') || resolvedName === 'Technician') {
            const jobTech = job?.assignedTechName || job?.techName || job?.assignedTech;
            if (jobTech && typeof jobTech === 'string' && !jobTech.toLowerCase().includes('kathy')) {
              resolvedName = jobTech;
            } else if (Array.isArray(t.assignedStaff) && t.assignedStaff.length > 0) {
              resolvedName = t.assignedStaff[0].name || t.assignedStaff[0].displayName || 'Technician';
            } else if (Array.isArray(job?.assignedTechs) && job.assignedTechs.length > 0) {
              resolvedName = job.assignedTechs[0].name || job.assignedTechs[0].displayName || 'Technician';
            } else {
              resolvedName = 'Technician';
            }
          }

          return {
            name: resolvedName,
            id: resolvedId
          };
        };

        // Event 0: Task Created / Added
        const taskCreatedDate = parseSafeDate(t.createdAt || t.createdDate);
        if (taskCreatedDate && isSameSelectedDate(taskCreatedDate) && !isFinished) {
          const creatorInfo = resolveTaskStaff(t.createdByStaffId || t.createdById || t.createdBy, t.createdByStaffName || t.createdByName || t.createdBy);
          feed.push({
            id: `task_created_${t.id}_${taskCreatedDate.getTime()}`,
            category: 'task',
            badgeLabel: 'TASK ADDED',
            badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            timestamp: taskCreatedDate,
            timeStr: taskCreatedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            who: creatorInfo.name,
            staffId: creatorInfo.id,
            duration: bookTimeVal > 0 ? `${bookTimeVal}h Book` : '--',
            jobId,
            taskId: t.id,
            jobNumber: job?.jobNumber || 'N/A',
            jobTitle: job?.title || 'Upfit Job',
            customerName: job?.customerName || job?.customer || '',
            vehicleInfo,
            details: `Task Added: ${taskTitle} ${bookTimeVal > 0 ? `(${bookTimeVal}h Book)` : ''}`,
            note: typeof (t.description || t.notes) === 'string' ? (t.description || t.notes).trim() : '',
            status: 'TASK ADDED'
          });
        }

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
          const breakLabel = isLunch ? 'Lunch' : 'Break';
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



      // Helper to resolve staff member name and ID for specific event actor
      const resolveEventActor = (actorId?: string, actorName?: string, fallbackInfo?: { name: string; id: string }) => {
        let name = '';
        let id = actorId || '';

        const candidateName = (actorName && actorName.trim()) ? actorName.trim() : (actorId && !actorId.includes('@') && actorId.length < 50 && !actorId.match(/^[a-zA-Z0-9]{20,}$/) ? actorId.trim() : '');
        const candidateId = actorId || '';

        const found = staff.find(s => {
          if (candidateId && (s.id === candidateId || s.userId === candidateId)) return true;
          const fullName = `${s.firstName || s.name || ''} ${s.lastName || ''}`.trim();
          if (candidateName && (fullName.toLowerCase() === candidateName.toLowerCase() || s.name?.toLowerCase() === candidateName.toLowerCase() || s.email?.toLowerCase() === candidateName.toLowerCase())) return true;
          if (candidateId && (fullName.toLowerCase() === candidateId.toLowerCase() || s.name?.toLowerCase() === candidateId.toLowerCase() || s.email?.toLowerCase() === candidateId.toLowerCase())) return true;
          return false;
        });

        if (found) {
          name = `${found.firstName || found.name || 'Staff'} ${found.lastName || ''}`.trim();
          id = found.id || found.userId || '';
        } else if (candidateName && candidateName !== 'Package Intake' && candidateName !== 'System' && candidateName !== 'Unknown') {
          name = candidateName;
        } else if (candidateId && candidateId.includes(' ')) {
          name = candidateId;
        } else {
          name = candidateId;
        }

        // Clean up email/UID name if it contains email format or resolve Patrick
        if (name && name.includes('@')) {
          if (name.toLowerCase() === 'p.losey@saegrp.com' || name.toLowerCase() === 'loseyp@gmail.com') {
            name = 'Patrick Losey';
          } else {
            const emailPart = name.split('@')[0];
            const parts = emailPart.split(/[._-]/);
            name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
          }
        } else if (name && (name.toLowerCase() === 'p.losey' || name.toLowerCase() === 'loseyp')) {
          name = 'Patrick Losey';
        }

        if (!name || name.toLowerCase().includes('kathy')) {
          return fallbackInfo || { name: 'Staff', id: '' };
        }

        return { name, id };
      };

      // Initial Requester
      const initialRequester = resolveEventActor(
        p.requestedById || p.requestedByStaffId || p.createdBy || p.userId || p.requestedBy,
        p.requestedByName || p.requestedBy || p.createdByName,
        undefined
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
      const isDirectReceive = Boolean(
        p.isDirectReceive ||
        p.isIntake ||
        (statusLower === 'received' && !p.requestedAt && (p.requestedBy === 'Package Intake' || !p.orderedAt))
      );

      // State 1: Request Created (Requested) - Skip if directly received/intaked
      const createdAt = p.createdAt || p.requestedAt;
      if (createdAt && !isDirectReceive) {
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
      if (orderedAt && orderedAt !== createdAt && !isDirectReceive) {
        const orderedActor = resolveEventActor(
          p.orderedBy || p.orderedByStaffId || p.orderedById || p.statusChangedBy || p.updatedBy,
          p.orderedByName || p.orderedBy || p.statusChangedByName || p.updatedByName,
          undefined
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
      const receivedAt = p.receivedAt || p.receivedDate || (statusLower === 'received' ? p.statusChangedAt || p.updatedAt || p.createdAt : null);
      if (receivedAt && (isDirectReceive || (receivedAt !== createdAt && receivedAt !== orderedAt))) {
        const receivedActor = resolveEventActor(
          p.receivedBy || p.receivedByStaffId || p.receivedById || p.statusChangedBy || p.updatedBy,
          p.receivedByName || p.receivedBy || p.statusChangedByName || p.updatedByName,
          undefined
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
          p.stagedBy || p.stagedByStaffId || p.deliveredBy || p.putAwayBy || p.statusChangedBy || p.updatedBy,
          p.stagedByName || p.stagedBy || p.deliveredByName || p.deliveredBy || p.statusChangedByName || p.updatedByName,
          undefined
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
            undefined
          );

          if (['ordered'].includes(statusLower)) {
            statusText = 'ORDERED';
            detailsText = `Part Moved to Ordered: ${partTitle}`;
            fallbackActor = resolveEventActor(p.orderedBy || p.orderedById || p.updatedBy, p.orderedByName || p.orderedBy || p.updatedByName, undefined);
          } else if (['received'].includes(statusLower)) {
            statusText = 'RECEIVED';
            detailsText = `Part Received into Shop: ${partTitle}`;
            fallbackActor = resolveEventActor(p.receivedBy || p.receivedById || p.updatedBy, p.receivedByName || p.receivedBy || p.updatedByName, undefined);
          } else if (['fulfilled', 'delivered', 'staged', 'with_vehicle', 'with vehicle'].includes(statusLower)) {
            statusText = 'WITH VEHICLE';
            detailsText = `Part Moved to Vehicle / Tech: ${partTitle}`;
            fallbackActor = resolveEventActor(p.stagedBy || p.deliveredBy || p.updatedBy, p.stagedByName || p.deliveredByName || p.updatedByName, undefined);
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

        let techWho = j.assignedTechName && !j.assignedTechName.toLowerCase().includes('kathy') ? j.assignedTechName : '';
        if (!techWho && jTasks.length > 0) {
          const completers = new Set<string>();
          jTasks.forEach((t: any) => {
            if (t.completedByStaffName && !t.completedByStaffName.toLowerCase().includes('kathy') && t.completedByStaffName !== 'completed') {
              completers.add(t.completedByStaffName);
            } else if (Array.isArray(t.assignedStaff)) {
              t.assignedStaff.forEach((s: any) => {
                if (s.name && !s.name.toLowerCase().includes('kathy')) completers.add(s.name);
              });
            }
          });
          if (completers.size > 0) {
            techWho = Array.from(completers).join(', ');
          }
        }
        if (!techWho) {
          techWho = 'Technician';
        }

        feed.push({
          id: `qc_${j.id}_${jDate.getTime()}`,
          category: 'qc',
          badgeLabel: 'QC QUEUE',
          badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          timestamp: jDate,
          timeStr: jDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          who: techWho,
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

    // 5. Ready for Customer Jobs
    jobs.forEach(j => {
      const statusLower = (j.status || '').toLowerCase();
      const isRfc = statusLower === 'ready for customer' || j.status === 'Ready for Customer';
      if (!isRfc) return;

      const rfcDate = parseSafeDate(j.readyForCustomerAt || j.qcApprovedAt || j.statusChangedAt || j.updatedAt);
      if (rfcDate && isSameSelectedDate(rfcDate)) {
        const jTasks = combinedTasksMap[j.id] || (Array.isArray(j.tasks) ? j.tasks : []);
        let staffActor = j.readyForCustomerBy || j.qcApprovedByName || j.qcApprovedBy || j.updatedByName;
        
        if (!staffActor && jTasks.length > 0) {
          const completers = new Set<string>();
          jTasks.forEach((t: any) => {
            if (t.completedByStaffName && !t.completedByStaffName.toLowerCase().includes('kathy') && t.completedByStaffName !== 'completed') {
              completers.add(t.completedByStaffName);
            }
          });
          if (completers.size > 0) {
            staffActor = Array.from(completers).join(', ');
          }
        }
        if (!staffActor || staffActor === 'Shop Manager') {
          staffActor = (j.assignedTechName && !j.assignedTechName.toLowerCase().includes('kathy')) ? j.assignedTechName : 'Patrick Losey';
        }

        const techStaff = staff.find(s => s.id === j.assignedTechId || s.name === staffActor || `${s.firstName || ''} ${s.lastName || ''}`.trim() === staffActor);
        const staffId = techStaff?.id || j.assignedTechId || '';

        feed.push({
          id: `rfc_${j.id}_${rfcDate.getTime()}`,
          category: 'qc',
          badgeLabel: 'READY FOR CUSTOMER',
          badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          timestamp: rfcDate,
          timeStr: rfcDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          who: staffActor,
          staffId,
          duration: '--',
          jobId: j.id,
          jobNumber: j.jobNumber || 'N/A',
          jobTitle: j.title || 'Upfit Job',
          customerName: j.customerName || j.customer || '',
          vehicleInfo: j.vehicleYearMakeModel || j.vehicle || '',
          details: `QC Passed — Vehicle upfit completed & Ready for Customer Pickup!`,
          note: j.qcNotes || j.notes || '',
          status: 'READY FOR CUSTOMER'
        });
      }
    });

    // 5b. Customer Picked Up / Delivered to Customer / With Customer Jobs
    jobs.forEach(j => {
      const isDelivered = j.delivered === true || j.isDelivered === true || j.status === 'Completed' || (j.parkingSpot === 'With Customer') || (j.location === 'With Customer');
      const pickupDate = parseSafeDate(j.pickedUpAt || j.deliveredAt || (isDelivered ? j.completedAt || j.updatedAt : null));

      if (isDelivered && pickupDate && isSameSelectedDate(pickupDate)) {
        const rawActor = j.pickedUpBy || j.markedWithCustomerBy || j.deliveredBy || j.completedBy || j.updatedByName || j.assignedTechName || 'Patrick Losey';
        const foundStaff = staff.find(s => s.name === rawActor || `${s.firstName || ''} ${s.lastName || ''}`.trim() === rawActor || s.id === j.pickedUpById);
        const whoName = foundStaff ? (foundStaff.name || `${foundStaff.firstName || ''} ${foundStaff.lastName || ''}`.trim()) : rawActor;

        feed.push({
          id: `pickup_${j.id}_${pickupDate.getTime()}`,
          category: 'qc',
          badgeLabel: 'DELIVERED',
          badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          timestamp: pickupDate,
          timeStr: pickupDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          who: whoName,
          staffId: foundStaff?.id || j.pickedUpById || '',
          duration: '--',
          jobId: j.id,
          jobNumber: j.jobNumber || 'N/A',
          jobTitle: j.title || 'Upfit Job',
          customerName: j.customerName || j.customer || '',
          vehicleInfo: j.vehicleYearMakeModel || j.vehicle || '',
          details: `Vehicle handed off to customer & marked With Customer${j.previousParkingSpot ? ` (Cleared from ${j.previousParkingSpot})` : ''}`,
          note: j.deliveryNotes || j.notes || '',
          status: 'WITH CUSTOMER'
        });
      }
    });

    // 6. Job-level Blocker Events
    jobs.forEach(j => {
      const blockers = Array.isArray(j.blockers) ? j.blockers : [];
      const vehicleInfo = j.vehicleYearMakeModel || j.vehicleName || j.vehicleId || j.vehicleVin || j.vehicle || '';
      
      blockers.forEach((b: any, idx: number) => {
        const msg = b.message || b.reason || b.note || 'Job Blocked';
        
        // Created Blocker Event
        if (b.createdAt) {
          const createdDate = parseSafeDate(b.createdAt);
          if (createdDate && isSameSelectedDate(createdDate)) {
            const whoName = b.createdBy || b.createdByName || (j.assignedTechName && !j.assignedTechName.toLowerCase().includes('kathy') ? j.assignedTechName : 'Shop Foreman');
            const foundStaff = staff.find(s => s.name === whoName || `${s.firstName || ''} ${s.lastName || ''}`.trim() === whoName);

            feed.push({
              id: `job_blocker_created_${j.id}_${idx}_${createdDate.getTime()}`,
              category: 'task',
              badgeLabel: 'BLOCKED',
              badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
              timestamp: createdDate,
              timeStr: createdDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              who: whoName,
              staffId: foundStaff?.id || b.createdById || '',
              duration: '--',
              jobId: j.id,
              jobNumber: j.jobNumber || 'N/A',
              jobTitle: j.title || 'Upfit Job',
              customerName: j.customerName || j.customer || '',
              vehicleInfo,
              details: `Job Blocked: ${j.title || 'Job'} — "${msg}"`,
              note: msg,
              status: 'BLOCKED'
            });
          }
        }

        // Resolved Blocker Event
        if (b.resolvedAt || b.clearedAt || b.status === 'resolved' || b.status === 'cleared') {
          const resolvedDate = parseSafeDate(b.resolvedAt || b.clearedAt || b.updatedAt || j.updatedAt);
          if (resolvedDate && isSameSelectedDate(resolvedDate)) {
            const whoName = b.resolvedBy || b.clearedBy || b.resolvedByName || 'Staff';
            const foundStaff = staff.find(s => s.name === whoName || `${s.firstName || ''} ${s.lastName || ''}`.trim() === whoName);

            feed.push({
              id: `job_blocker_resolved_${j.id}_${idx}_${resolvedDate.getTime()}`,
              category: 'task',
              badgeLabel: 'RESOLVED',
              badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
              timestamp: resolvedDate,
              timeStr: resolvedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              who: whoName,
              staffId: foundStaff?.id || b.resolvedById || '',
              duration: '--',
              jobId: j.id,
              jobNumber: j.jobNumber || 'N/A',
              jobTitle: j.title || 'Upfit Job',
              customerName: j.customerName || j.customer || '',
              vehicleInfo,
              details: `Blocker Resolved: ${j.title || 'Job'} — "${msg}"`,
              note: msg,
              status: 'RESOLVED'
            });
          }
        }
      });
    });

    // 7. Task-level Blocker Events
    Object.entries(combinedTasksMap).forEach(([jobId, tasks]) => {
      const job = jobs.find(j => j.id === jobId);
      const vehicleInfo = job?.vehicleYearMakeModel || job?.vehicleName || job?.vehicleId || job?.vehicleVin || job?.vehicle || '';

      tasks.forEach(t => {
        const blockers = Array.isArray(t.blockers) ? t.blockers : [];
        blockers.forEach((b: any, idx: number) => {
          const msg = b.message || b.reason || b.note || 'Work Blocked';
          // Created Blocker event
          if (b.createdAt) {
            const createdDate = parseSafeDate(b.createdAt);
            if (createdDate && isSameSelectedDate(createdDate)) {
              const whoName = b.createdBy || b.createdByName || (Array.isArray(t.assignedStaff) && t.assignedStaff[0]?.name) || 'Technician';
              const foundStaff = staff.find(s => s.name === whoName || `${s.firstName || ''} ${s.lastName || ''}`.trim() === whoName);

              feed.push({
                id: `blocker_created_${t.id}_${idx}_${createdDate.getTime()}`,
                category: 'task',
                badgeLabel: 'BLOCKED',
                badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                timestamp: createdDate,
                timeStr: createdDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                who: whoName,
                staffId: foundStaff?.id || b.createdById || '',
                duration: '--',
                jobId,
                taskId: t.id,
                jobNumber: job?.jobNumber || 'N/A',
                jobTitle: job?.title || 'Upfit Job',
                customerName: job?.customerName || job?.customer || '',
                vehicleInfo,
                details: `Task Blocked: ${t.name || t.title || 'Task'} — "${msg}"`,
                note: msg,
                status: 'BLOCKED'
              });
            }
          }

          // Resolved Blocker event
          if (b.resolvedAt || b.clearedAt || b.status === 'resolved' || b.status === 'cleared') {
            const resolvedDate = parseSafeDate(b.resolvedAt || b.clearedAt || b.updatedAt || t.updatedAt);
            if (resolvedDate && isSameSelectedDate(resolvedDate)) {
              const whoName = b.resolvedBy || b.resolvedByName || (Array.isArray(t.assignedStaff) && t.assignedStaff[0]?.name) || 'Staff';
              const foundStaff = staff.find(s => s.name === whoName || `${s.firstName || ''} ${s.lastName || ''}`.trim() === whoName);

              feed.push({
                id: `blocker_resolved_${t.id}_${idx}_${resolvedDate.getTime()}`,
                category: 'task',
                badgeLabel: 'RESOLVED',
                badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
                timestamp: resolvedDate,
                timeStr: resolvedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                who: whoName,
                staffId: foundStaff?.id || b.resolvedById || '',
                duration: '--',
                jobId,
                taskId: t.id,
                jobNumber: job?.jobNumber || 'N/A',
                jobTitle: job?.title || 'Upfit Job',
                customerName: job?.customerName || job?.customer || '',
                vehicleInfo,
                details: `Blocker Resolved: ${t.name || t.title || 'Task'} — "${msg}"`,
                note: msg,
                status: 'RESOLVED'
              });
            }
          }
        });
      });
    });

    // 8. Job Creation & QuickBooks Sync Events
    jobs.forEach(j => {
      const createdDate = parseSafeDate(j.createdAt || j.createdDate || j.TimeCreated || j.createdAtTimestamp);
      if (createdDate && isSameSelectedDate(createdDate)) {
        const isQuickBooks = j.source === 'QuickBooks' || Boolean(j.quickbooksId) || Boolean(j.TimeModified && j.source !== 'Manual');
        const badgeLabel = isQuickBooks ? 'QB SYNC' : 'JOB CREATED';
        const badgeClass = isQuickBooks ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20';

        let creatorActorId = j.createdByStaffId || j.createdById || j.createdByUserId || j.userId || j.createdBy || '';
        let creatorActorName = j.createdByStaffName || j.createdByName || j.createdByNameText || '';

        let foundCreator = staff.find(s => {
          if (creatorActorId && (s.id === creatorActorId || s.userId === creatorActorId)) return true;
          const fullName = `${s.firstName || s.name || ''} ${s.lastName || ''}`.trim().toLowerCase();
          if (creatorActorName && (fullName === creatorActorName.toLowerCase() || s.name?.toLowerCase() === creatorActorName.toLowerCase() || s.email?.toLowerCase() === creatorActorName.toLowerCase())) return true;
          if (creatorActorId && (fullName === creatorActorId.toLowerCase() || s.name?.toLowerCase() === creatorActorId.toLowerCase() || s.email?.toLowerCase() === creatorActorId.toLowerCase())) return true;
          return false;
        });

        if (!foundCreator && j.assignedTechId) {
          foundCreator = staff.find(s => s.id === j.assignedTechId || s.userId === j.assignedTechId);
        }

        let whoName = '';
        let whoId = '';

        if (foundCreator) {
          whoName = `${foundCreator.firstName || foundCreator.name || 'Staff'} ${foundCreator.lastName || ''}`.trim();
          whoId = foundCreator.id || foundCreator.userId || '';
        } else if (creatorActorName && !creatorActorName.includes('@')) {
          whoName = creatorActorName;
          whoId = creatorActorId;
        } else if (isQuickBooks) {
          whoName = 'QuickBooks Sync';
          whoId = 'quickbooks_sync';
        } else {
          whoName = j.assignedTechName && !j.assignedTechName.toLowerCase().includes('kathy') ? j.assignedTechName : 'Upfitters OS';
          whoId = j.assignedTechId || '';
        }

        const vehicleInfo = j.vehicleYearMakeModel || j.vehicleName || j.vehicleId || j.vehicleVin || j.vehicle || '';
        const sourceStr = isQuickBooks ? 'QuickBooks' : (j.source || 'Upfitters OS');

        feed.push({
          id: `job_created_${j.id}_${createdDate.getTime()}`,
          category: 'task',
          badgeLabel,
          badgeClass,
          timestamp: createdDate,
          timeStr: createdDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          who: whoName,
          staffId: whoId,
          duration: '--',
          jobId: j.id,
          jobNumber: j.jobNumber || 'N/A',
          jobTitle: j.title || 'Upfit Job',
          customerName: j.customerName || j.customer || '',
          vehicleInfo,
          details: `Job #${j.jobNumber || 'N/A'} created in ${sourceStr}: ${j.title || 'New Job'}`,
          note: j.notes || j.description || `Created via ${sourceStr}`,
          status: isQuickBooks ? 'QB SYNCED' : 'CREATED'
        });
      }
    });

    // 9. Vehicle Movements & Location Changes
    activityFeed.forEach(act => {
      const actDate = parseSafeDate(act.timestamp || act.createdAt || act.date);
      if (actDate && isSameSelectedDate(actDate)) {
        const type = (act.type || '').toLowerCase();
        const title = (act.title || '').toLowerCase();
        const msg = act.message || '';
        const isMoved = type === 'location_changed' || title.includes('vehicle moved') || title.includes('location') || msg.toLowerCase().includes('moved vehicle');

        if (isMoved) {
          const staffName = act.author || act.staffName || 'Staff';
          const staffRec = staff.find(s => s.name === staffName || s.displayName === staffName || s.email === staffName);
          const job = jobs.find(j => j.id === act.metadata?.jobId) || jobs.find(j => j.jobNumber === act.metadata?.jobNumber);
          const vehicleInfo = job?.vehicleYearMakeModel || job?.vehicleName || job?.vehicleId || job?.vehicleVin || job?.vehicle || '';

          feed.push({
            id: `act_move_${act.id}_${actDate.getTime()}`,
            category: 'shift',
            badgeLabel: 'VEHICLE MOVED',
            badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
            timestamp: actDate,
            timeStr: actDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            who: staffName,
            staffId: staffRec?.id || act.staffId || '',
            duration: '--',
            jobId: act.metadata?.jobId || job?.id || '',
            jobNumber: act.metadata?.jobNumber || job?.jobNumber || 'N/A',
            jobTitle: act.metadata?.jobTitle || job?.title || 'Upfit Job',
            customerName: job?.customerName || job?.customer || '',
            vehicleInfo,
            details: msg || `Moved vehicle to ${act.metadata?.newZone || 'new spot'}`,
            note: act.metadata?.previousZone ? `From ${act.metadata.previousZone} → ${act.metadata.newZone}` : (act.metadata?.notes || ''),
            status: 'VEHICLE MOVED'
          });
        }
      }
    });

    return feed.map(item => {
      if (editedLogMap[item.id]) {
        const editData = editedLogMap[item.id];
        const editTime = editData.editedTimestampMs ? new Date(editData.editedTimestampMs) : new Date(editData.editedTimestamp);
        return {
          ...item,
          originalTimestamp: item.timestamp,
          timestamp: editTime,
          timeStr: editTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          isTimeEdited: true,
          editedBy: editData.editedBy || 'Super Admin'
        };
      }
      return item;
    }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [tasksMap, jobs, staff, activeSessions, partsRequests, readyForQcJobs, selectedDate, editedLogMap, activityFeed]);

  // Unique Filter Options
  const [selectedCustomerFilters, setSelectedCustomerFilters] = useState<string[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');

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

  const uniqueCustomers = useMemo(() => {
    const customers = new Set<string>();
    unifiedDailyLogFeed.forEach(item => {
      if (item.customerName && item.customerName.trim() && item.customerName !== 'N/A' && item.customerName !== '--') {
        customers.add(item.customerName.trim());
      }
    });
    return Array.from(customers).sort();
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

  const toggleCustomerFilter = (cust: string) => {
    setSelectedCustomerFilters(prev => 
      prev.includes(cust) ? prev.filter(c => c !== cust) : [...prev, cust]
    );
  };

  const hasActiveColumnFilters = selectedWhoFilters.length > 0 || selectedStatusFilters.length > 0 || selectedCustomerFilters.length > 0 || notesOnlyFilter;
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
    setSelectedCustomerFilters([]);
    setCustomerSearchQuery('');
    setNotesOnlyFilter(false);
    resetSort();
  };

  // Filtered & Sorted Master Daily Log
  const filteredDailyLog = useMemo(() => {
    const filtered = unifiedDailyLogFeed.filter(item => {
      // Exclude deleted logs unless Super Admin toggle is active
      if (!showDeletedLogs && deletedLogMap[item.id]) return false;
      if (showDeletedLogs && !deletedLogMap[item.id]) return false;

      // Customer column filter
      if (selectedCustomerFilters.length > 0) {
        const itemCustomer = (item.customerName || '').trim();
        if (!selectedCustomerFilters.includes(itemCustomer)) return false;
      }

      // Top card category filter
      if (logFilterCategory !== 'all') {
        if (logFilterCategory === 'qc') {
          if (item.status !== 'READY FOR QC') return false;
        } else if (logFilterCategory === 'rfc') {
          if (item.status !== 'READY FOR CUSTOMER') return false;
        } else if (logFilterCategory === 'blocked') {
          if (!['BLOCKED', 'RESOLVED'].includes(item.status)) return false;
        } else if (logFilterCategory === 'task') {
          if (item.category !== 'task' || ['BLOCKED', 'RESOLVED'].includes(item.status)) return false;
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
    const pendingPartsCount = partsRequests.filter(p => ['pending', 'requested', 'ordered'].includes((p.status || '').toLowerCase().trim())).length;

    return {
      totalBookHours: totalBookHours.toFixed(1),
      totalTechsToday,
      totalClockedHours,
      pendingPartsCount
    };
  }, [unifiedDailyLogFeed, activeSessions, partsRequests, selectedDate]);

  // Active Task & Job Blockers List (For Vehicles Parked On Site / In a Bay Only)
  const activeBlockersList = useMemo(() => {
    const list: { id: string; jobId?: string; taskName?: string; label: string; reason: string; createdBy?: string; createdAtStr?: string }[] = [];

    // Collect all job IDs assigned to active bay/parking spot zones
    const zoneJobIds = new Set<string>();

    zones.forEach(z => {
      if (!z.isArchived && z.currentJobId && z.currentJobId !== 'none') {
        zoneJobIds.add(z.currentJobId);
      }
      if (!z.isArchived && Array.isArray(z.assignedJobIds)) {
        z.assignedJobIds.forEach((id: string) => {
          if (id && id !== 'none') zoneJobIds.add(id);
        });
      }
    });

    jobs.forEach(j => {
      const s = (j.status || '').toLowerCase().trim();
      if (['closed', 'completed', 'delivered', 'archived', 'cancelled'].includes(s)) return;

      const hasZoneAssignment = Boolean(
        j.currentZoneId || j.zoneId || j.bayId || j.parkingSpotId || j.assignedZoneId ||
        (j.currentZoneName && !['unassigned', 'offsite', 'none'].includes(j.currentZoneName.toLowerCase().trim())) ||
        (j.zoneName && !['unassigned', 'offsite', 'none'].includes(j.zoneName.toLowerCase().trim())) ||
        (j.location && !['unassigned', 'offsite', 'none'].includes(j.location.toLowerCase().trim())) ||
        (j.parkingSpot && !['unassigned', 'offsite', 'none'].includes(j.parkingSpot.toLowerCase().trim()))
      );

      if (hasZoneAssignment) {
        zoneJobIds.add(j.id);
      }
    });

    const extractBlockerDetails = (item: any, fallbackReason: string) => {
      let message = '';
      let createdBy = '';
      let createdAtStr = '';

      if (Array.isArray(item.blockers) && item.blockers.length > 0) {
        const activeB = item.blockers.find((b: any) => b.status === 'active' || (!b.resolvedAt && (b.message || b.reason || b.note || b.details)));
        const targetB = activeB || item.blockers[item.blockers.length - 1];
        if (targetB) {
          const raw = targetB.message || targetB.reason || targetB.note || targetB.details || targetB.description || targetB.issue || '';
          if (raw && typeof raw === 'string' && raw.trim() && raw.trim().toLowerCase() !== 'job status: blocked') {
            message = raw.trim();
          }
          createdBy = targetB.createdBy || targetB.author || targetB.userName || targetB.user || '';
          if (targetB.createdAt) {
            const d = parseSafeDate(targetB.createdAt);
            if (d) {
              createdAtStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            }
          }
        }
      }

      if (!message) {
        const directNote = item.blockReason || item.blockedReason || item.blockNote || item.blockerNote || item.issueNote || item.reason || item.note || item.notes || item.details || item.message;
        if (directNote && typeof directNote === 'string' && directNote.trim() && directNote.trim().toLowerCase() !== 'job status: blocked') {
          message = directNote.trim();
        }
      }

      if (!createdBy && item.blockedBy) {
        createdBy = item.blockedBy;
      }

      return {
        reason: message || fallbackReason,
        createdBy: createdBy ? createdBy.trim() : '',
        createdAtStr
      };
    };
    
    // 1. Check tasks in tasksMap for active blockers (only on-site / in-bay vehicles)
    Object.entries(tasksMap).forEach(([jobId, tasks]: [string, any[]]) => {
      if (!zoneJobIds.has(jobId)) return;

      const job = jobs.find(j => j.id === jobId);
      tasks.forEach((t: any) => {
        if (!isTaskCompleted(t)) {
          const s = (t.status || '').toLowerCase().trim();
          const isExplicitBlocked = t.isBlocked === true || t.is_blocked === true || t.blocked === true || s === 'blocked' || s === 'task blocked';
          const activeBlockerObj = Array.isArray(t.blockers) ? t.blockers.find((b: any) => b.status === 'active' || (!b.resolvedAt && (b.message || b.reason || b.note))) : null;
          
          if (isExplicitBlocked || activeBlockerObj) {
            const { reason, createdBy, createdAtStr } = extractBlockerDetails(t, 'Task Blocked / On Hold');
            const jobLabel = job ? `[Job #${job.jobNumber || 'N/A'}] ` : '';
            const tName = t.name || t.title || 'Task';
            list.push({
              id: t.id || `task_${Math.random()}`,
              jobId: job?.id,
              taskName: tName,
              label: `${jobLabel}${tName} (Task Blocked)`,
              reason,
              createdBy,
              createdAtStr
            });
          }
        }
      });
    });

    // 2. Check jobs for active job-level blockers (only on-site / in-bay vehicles)
    jobs.forEach((j: any) => {
      if (!zoneJobIds.has(j.id)) return;

      const s = (j.status || '').toLowerCase().trim();
      const isExplicitBlocked = s === 'blocked' || j.isBlocked === true;
      const activeBlockerObj = Array.isArray(j.blockers) ? j.blockers.find((b: any) => b.status === 'active' || (!b.resolvedAt && (b.message || b.reason || b.note))) : null;

      if (isExplicitBlocked || activeBlockerObj) {
        const { reason, createdBy, createdAtStr } = extractBlockerDetails(j, 'No detailed blocker note specified');
        list.push({
          id: j.id,
          jobId: j.id,
          taskName: 'Entire Job',
          label: `[Job #${j.jobNumber || 'N/A'}] ${j.customerName || j.title || 'Upfit Job'} (Job Blocked)`,
          reason,
          createdBy,
          createdAtStr
        });
      }
    });

    return list;
  }, [tasksMap, jobs, zones]);

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
    const taskCount = unifiedDailyLogFeed.filter(f => f.category === 'task' && !['BLOCKED', 'RESOLVED'].includes(f.status)).length;
    const shiftCount = unifiedDailyLogFeed.filter(f => f.category === 'shift').length;
    const partsCount = unifiedDailyLogFeed.filter(f => f.category === 'parts').length;
    const qcCount = unifiedDailyLogFeed.filter(f => f.status === 'READY FOR QC').length;
    const rfcCount = unifiedDailyLogFeed.filter(f => f.status === 'READY FOR CUSTOMER').length;
    const blockedCount = unifiedDailyLogFeed.filter(f => ['BLOCKED', 'RESOLVED'].includes(f.status)).length;
    return { taskCount, shiftCount, partsCount, qcCount, rfcCount, blockedCount, total: unifiedDailyLogFeed.length };
  }, [unifiedDailyLogFeed]);

  // Per-Staff Member Statistics for Selected Date
  const staffMemberStats = useMemo(() => {
    const staffMap: Record<string, {
      id: string;
      name: string;
      role: string;
      dept: string;
      clockIn: Date | null;
      clockOut: Date | null;
      isCurrentlyClockedIn: boolean;
      totalShiftSec: number;
      totalBreakSec: number;
      lunchSec: number;
      paidBreakSec: number;
      totalTaskSec: number;
      completedTasks: Array<{
        taskId: string;
        taskTitle: string;
        jobNumber: string;
        customerName: string;
        bookHours: number;
        durationStr: string;
      }>;
      completedBookHours: number;
      activeTasks: Array<{
        taskTitle: string;
        jobNumber: string;
      }>;
      notesCount: number;
      photosCount: number;
    }> = {};

    const resolveDepartmentName = (sMember?: any, _roleFallback?: string, deptFallback?: string) => {
      if (sMember?.departmentId) {
        const foundDept = departments.find(d => d.id === sMember.departmentId);
        if (foundDept?.name) return foundDept.name;
      }
      if (sMember?.deptName && typeof sMember.deptName === 'string' && sMember.deptName.trim()) {
        return sMember.deptName.trim();
      }
      if (sMember?.departmentName && typeof sMember.departmentName === 'string' && sMember.departmentName.trim()) {
        return sMember.departmentName.trim();
      }
      if (sMember?.department && typeof sMember.department === 'string' && sMember.department.trim()) {
        return sMember.department.trim();
      }
      if (deptFallback && typeof deptFallback === 'string' && deptFallback.trim()) {
        return deptFallback.trim();
      }
      return 'Unassigned';
    };

    const resolveRoleName = (sMember?: any, roleFallback?: string) => {
      if (sMember?.role && typeof sMember.role === 'string' && sMember.role.trim()) {
        return sMember.role.trim();
      }
      if (sMember?.jobTitle && typeof sMember.jobTitle === 'string' && sMember.jobTitle.trim()) {
        return sMember.jobTitle.trim();
      }
      if (roleFallback && typeof roleFallback === 'string' && roleFallback.trim()) {
        return roleFallback.trim();
      }
      return 'Staff';
    };

    const getOrAddStaffEntry = (id: string, name: string, roleFallback?: string, deptFallback?: string) => {
      const cleanedName = (name || '').trim();
      const sMember = staff.find(s => s.id === id || s.userId === id || `${s.firstName || s.name || ''} ${s.lastName || ''}`.trim().toLowerCase() === cleanedName.toLowerCase());
      const staffKey = sMember?.id || id || cleanedName || 'unknown_staff';

      if (!staffMap[staffKey]) {
        const resolvedName = sMember ? `${sMember.firstName || sMember.name || 'Staff'} ${sMember.lastName || ''}`.trim() : cleanedName || 'Staff Member';
        const deptName = resolveDepartmentName(sMember, roleFallback, deptFallback);
        const roleName = resolveRoleName(sMember, roleFallback);

        staffMap[staffKey] = {
          id: staffKey,
          name: resolvedName,
          role: roleName,
          dept: deptName,
          clockIn: null,
          clockOut: null,
          isCurrentlyClockedIn: false,
          totalShiftSec: 0,
          totalBreakSec: 0,
          lunchSec: 0,
          paidBreakSec: 0,
          totalTaskSec: 0,
          completedTasks: [],
          completedBookHours: 0,
          activeTasks: [],
          notesCount: 0,
          photosCount: 0,
        };
      }
      return staffMap[staffKey];
    };

    activeSessions.forEach(s => {
      const sMember = staff.find(st => st.id === s.userId || st.userId === s.userId);
      const name = sMember ? `${sMember.firstName || sMember.name} ${sMember.lastName || ''}`.trim() : (s.userName || 'Staff Member');

      if (name.toLowerCase().includes('kathy')) return;

      const entry = getOrAddStaffEntry(s.userId || s.id, name, s.role, s.deptName);

      const cIn = parseSafeDate(s.clockIn || s.startTime);
      const cOut = parseSafeDate(s.clockOut || s.endTime);

      if (cIn && isSameSelectedDate(cIn)) {
        if (!entry.clockIn || cIn < entry.clockIn) {
          entry.clockIn = cIn;
        }
        if (cOut && isSameSelectedDate(cOut)) {
          if (!entry.clockOut || cOut > entry.clockOut) {
            entry.clockOut = cOut;
          }
        } else if (!cOut) {
          entry.isCurrentlyClockedIn = true;
        }
      }

      if (cIn && isSameSelectedDate(cIn)) {
        const shiftEnd = (cOut && isSameSelectedDate(cOut)) ? cOut : (entry.isCurrentlyClockedIn ? new Date() : null);
        if (shiftEnd) {
          const shiftSec = Math.max(0, Math.floor((shiftEnd.getTime() - cIn.getTime()) / 1000));
          entry.totalShiftSec += shiftSec;
        }
      }

      if (Array.isArray(s.breaks)) {
        s.breaks.forEach((b: any) => {
          const bStart = parseSafeDate(b.start || b.startTime);
          const bEnd = parseSafeDate(b.end || b.endTime) || (bStart && isSameSelectedDate(bStart) ? new Date() : null);
          if (bStart && isSameSelectedDate(bStart) && bEnd) {
            const bSec = Math.max(0, Math.floor((bEnd.getTime() - bStart.getTime()) / 1000));
            const isLunch = (b.type || '').toLowerCase() === 'lunch';
            if (isLunch) {
              entry.lunchSec += bSec;
            } else {
              entry.paidBreakSec += bSec;
            }
            entry.totalBreakSec += bSec;
          }
        });
      }

      if (Array.isArray(s.jobs)) {
        s.jobs.forEach((jTask: any) => {
          const tStart = parseSafeDate(jTask.start || jTask.startTime);
          const tEnd = parseSafeDate(jTask.end || jTask.endTime || jTask.stop) || (tStart && isSameSelectedDate(tStart) ? new Date() : null);
          if (tStart && isSameSelectedDate(tStart) && tEnd) {
            const tSec = Math.max(0, Math.floor((tEnd.getTime() - tStart.getTime()) / 1000));
            entry.totalTaskSec += tSec;
          }
          if (tStart && isSameSelectedDate(tStart) && (!jTask.end && !jTask.endTime && !jTask.stop)) {
            const job = jobs.find(j => j.id === jTask.jobId || j.id === jTask.id);
            entry.activeTasks.push({
              taskTitle: jTask.taskName || jTask.name || 'Labor Task',
              jobNumber: job?.jobNumber || 'N/A'
            });
          }
        });
      }
    });

    unifiedDailyLogFeed.forEach(f => {
      if (!f.who || f.who === 'Staff' || f.who.toLowerCase().includes('kathy')) return;

      const entry = getOrAddStaffEntry(f.staffId || '', f.who);

      if (f.category === 'task' && f.badgeLabel === 'TASK DONE') {
        if (!entry.completedTasks.some(ct => ct.taskId === f.taskId)) {
          const taskObj = f.taskId ? Object.values(tasksMap).flat().find((t: any) => t.id === f.taskId) : null;
          const bookH = parseFloat(taskObj?.bookTime || taskObj?.estimatedHours || taskObj?.hours || '0') || 0;

          entry.completedTasks.push({
            taskId: f.taskId || f.id,
            taskTitle: f.details || 'Task Completed',
            jobNumber: f.jobNumber || 'N/A',
            customerName: f.customerName || '',
            bookHours: bookH,
            durationStr: f.duration || '--'
          });
          entry.completedBookHours += bookH;
        }
      } else if (f.badgeLabel === 'TASK NOTE') {
        entry.notesCount += 1;
      } else if (f.badgeLabel === 'TASK PHOTO') {
        entry.photosCount += 1;
      }
    });

    return Object.values(staffMap).filter(st =>
      st.clockIn !== null ||
      st.completedTasks.length > 0 ||
      st.totalTaskSec > 0 ||
      st.notesCount > 0 ||
      st.photosCount > 0
    );
  }, [staff, departments, activeSessions, unifiedDailyLogFeed, tasksMap, jobs, selectedDate]);

  // Shop Lot Backlog & Remaining Workload Metrics (Vehicles in a Bay or Parking Spot Only)
  const lotSummary = useMemo(() => {
    const zoneJobIds = new Set<string>();

    zones.forEach(z => {
      if (!z.isArchived && z.currentJobId && z.currentJobId !== 'none') {
        zoneJobIds.add(z.currentJobId);
      }
      if (!z.isArchived && Array.isArray(z.assignedJobIds)) {
        z.assignedJobIds.forEach((id: string) => {
          if (id && id !== 'none') zoneJobIds.add(id);
        });
      }
    });

    jobs.forEach(j => {
      const s = (j.status || '').toLowerCase().trim();
      if (['closed', 'completed', 'delivered', 'archived', 'cancelled'].includes(s)) return;

      const hasZoneAssignment = Boolean(
        j.currentZoneId || j.zoneId || j.bayId || j.parkingSpotId || j.assignedZoneId ||
        (j.currentZoneName && !['unassigned', 'offsite', 'none'].includes(j.currentZoneName.toLowerCase().trim())) ||
        (j.zoneName && !['unassigned', 'offsite', 'none'].includes(j.zoneName.toLowerCase().trim())) ||
        (j.location && !['unassigned', 'offsite', 'none'].includes(j.location.toLowerCase().trim())) ||
        (j.parkingSpot && !['unassigned', 'offsite', 'none'].includes(j.parkingSpot.toLowerCase().trim()))
      );

      if (hasZoneAssignment) {
        zoneJobIds.add(j.id);
      }
    });

    const activeLotJobs = jobs.filter(j => zoneJobIds.has(j.id));

    let totalLotBookHours = 0;
    let completedLotBookHours = 0;
    let timeSpentOnLotSec = 0;

    activeLotJobs.forEach(j => {
      const subTasks = tasksMap[j.id] || [];
      const embeddedTasks = Array.isArray(j.tasks) ? j.tasks : [];
      const existingIds = new Set(subTasks.map((t: any) => t.id).filter(Boolean));
      const extraEmbedded = embeddedTasks.filter((t: any) => t && (t.id || t.name || t.title) && (!t.id || !existingIds.has(t.id)));
      const jTasks = [...subTasks, ...extraEmbedded];

      let jobBookH = 0;
      let jobCompBookH = 0;

      jTasks.forEach((t: any) => {
        const val = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0') || 0;
        jobBookH += val;
        if (isTaskCompleted(t)) {
          jobCompBookH += val;
        }

        let taskSec = 0;
        if (typeof t.elapsedTime === 'number' && t.elapsedTime > 0) {
          taskSec = t.elapsedTime > 1000000 ? Math.floor(t.elapsedTime / 1000) : t.elapsedTime;
        } else if (typeof t.actualHours === 'number' && t.actualHours > 0) {
          taskSec = Math.floor(t.actualHours * 3600);
        } else if (typeof t.actualTime === 'number' && t.actualTime > 0) {
          taskSec = t.actualTime > 1000000 ? Math.floor(t.actualTime / 1000) : t.actualTime;
        }

        if (taskSec > 0 && taskSec < 720000) {
          timeSpentOnLotSec += taskSec;
        }
      });

      if (jobBookH === 0 && j.estimatedHours) {
        jobBookH = parseFloat(j.estimatedHours) || 0;
      }

      totalLotBookHours += jobBookH;
      completedLotBookHours += jobCompBookH;
    });

    // Add currently active (running) live task sessions right now
    const nowMs = Date.now();
    activeSessions.forEach(s => {
      if (s.status === 'active' && Array.isArray(s.jobs)) {
        s.jobs.forEach((jTask: any) => {
          if (!jTask.end && !jTask.endTime && !jTask.stop) {
            const matchingJob = activeLotJobs.find(j => j.id === jTask.jobId || j.id === jTask.id);
            if (matchingJob) {
              const tStart = parseSafeDate(jTask.start || jTask.startTime);
              if (tStart) {
                const sec = Math.max(0, Math.floor((nowMs - tStart.getTime()) / 1000));
                if (sec < 57600) {
                  timeSpentOnLotSec += sec;
                }
              }
            }
          }
        });
      }
    });

    const remainingLotBookHours = Math.max(0, totalLotBookHours - completedLotBookHours);

    return {
      activeVehicleCount: activeLotJobs.length,
      totalLotBookHours,
      completedLotBookHours,
      remainingLotBookHours,
      timeSpentOnLotSec
    };
  }, [jobs, zones, tasksMap, activeSessions]);

  // Generate Clean Plain-Text Report for Selected Date
  const generateDailyReportText = () => {
    const nowTimeStr = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const dateTag = isSelectedDateToday
      ? 'Today'
      : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const formattedDateStr = `${selectedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })} as of ${nowTimeStr}`;

    const touchedJobIds = Array.from(new Set(unifiedDailyLogFeed.map(f => f.jobId).filter(id => id && id !== 'N/A')));
    const touchedJobsList = jobs.filter(j => touchedJobIds.includes(j.id));

    const businessName = businessInfo?.name || businessInfo?.businessName || businessInfo?.companyName || 'Main Shop Operations';

    let report = `================================================================================\n`;
    report += `           UPFITTERS OS — DAILY OPERATIONS & TOUCHED JOBS REPORT\n`;
    report += `================================================================================\n`;
    report += `Date: ${formattedDateStr}\n`;
    report += `Business: ${businessName}\n\n`;

    report += `--------------------------------------------------------------------------------\n`;
    report += `1. DAILY OPERATIONS METRICS (${dateTag.toUpperCase()})\n`;
    report += `--------------------------------------------------------------------------------\n`;
    report += `• Jobs Touched (${dateTag}):       ${touchedJobIds.length} Jobs\n`;
    report += `• Completed Book Hours:    ${topSummary.totalBookHours} hrs\n`;
    report += `• Total Techs (${dateTag}):        ${topSummary.totalTechsToday} Techs\n`;
    report += `• Total Clocked Hours:     ${topSummary.totalClockedHours} hrs\n`;
    report += `• Tasks Finished (${dateTag}):     ${metrics.taskCount} Tasks\n`;
    report += `• Active Task Blockers:     ${activeBlockersList.length} Tasks Blocked\n`;
    if (activeBlockersList.length > 0) {
      activeBlockersList.forEach(b => {
        const metaParts: string[] = [];
        if (b.createdBy) metaParts.push(`Added by ${b.createdBy}`);
        if (b.createdAtStr) metaParts.push(`at ${b.createdAtStr}`);
        const metaStr = metaParts.length > 0 ? ` (${metaParts.join(' ')})` : '';

        report += `    - ${b.label}\n`;
        report += `      * Blocker: "${b.reason}"${metaStr}\n`;
      });
    }
    report += `• Unfulfilled Parts (Shop): ${topSummary.pendingPartsCount} Pending Parts\n`;
    report += `• Jobs Ready for QC:        ${readyForQcJobs.length} Jobs\n`;
    if (readyForQcJobs.length > 0) {
      readyForQcJobs.forEach(j => {
        const readyDate = j.readyForQcAt || j.qcReadyAt || j.statusChangedAt || j.statusUpdatedAt || j.updatedAt;
        const readySinceStr = formatReadySince(readyDate);
        report += `    - [Job #${j.jobNumber || 'N/A'}] ${j.customerName || j.title || 'Upfit Vehicle'}${readySinceStr ? ` — ${readySinceStr}` : ''}\n`;
      });
    }
    report += `• Jobs Ready for Customer:  ${readyForCustomerOnLotJobs.length} Jobs (On Lot / Parked)\n`;
    if (readyForCustomerOnLotJobs.length > 0) {
      readyForCustomerOnLotJobs.forEach(j => {
        const z = zones.find(zone => !zone.isArchived && (zone.currentJobId === j.id || (Array.isArray(zone.assignedJobIds) && zone.assignedJobIds.includes(j.id))));
        const loc = z?.name || j.currentZoneName || j.zoneName || j.location || j.parkingSpot || 'Parked on Lot';
        const readyDate = j.readyForCustomerAt || j.rfcAt || j.qcApprovedAt || j.statusChangedAt || j.statusUpdatedAt || j.updatedAt;
        const readySinceStr = formatReadySince(readyDate);
        report += `    - [Job #${j.jobNumber || 'N/A'}] ${j.customerName || j.title || 'Upfit Vehicle'} (Location: ${loc})${readySinceStr ? ` — ${readySinceStr}` : ''}\n`;
      });
    }
    report += `\n`;

    // Calculate 4 Shop Efficiency Metrics for Selected Date
    const totalStaffTaskSec = staffMemberStats.reduce((sum, st) => sum + st.totalTaskSec, 0);
    const totalStaffTaskHours = totalStaffTaskSec / 3600;
    const completedBookH = parseFloat(topSummary.totalBookHours || '0') || 0;
    const totalClockedH = parseFloat(topSummary.totalClockedHours || '0') || 0;

    const overallShopEff = totalClockedH > 0 ? ((completedBookH / totalClockedH) * 100).toFixed(1) + '%' : '--';
    const techLaborEff = totalStaffTaskHours > 0 ? ((completedBookH / totalStaffTaskHours) * 100).toFixed(1) + '%' : '--';
    const wrenchTimePct = totalClockedH > 0 ? ((totalStaffTaskHours / totalClockedH) * 100).toFixed(1) + '%' : '--';
    const techCount = topSummary.totalTechsToday || staffMemberStats.length || 1;
    const targetCapacityHours = techCount * 8;
    const targetPace = targetCapacityHours > 0 ? ((completedBookH / targetCapacityHours) * 100).toFixed(1) + '%' : '--';

    report += `• SHOP EFFICIENCY & LABOR UTILIZATION (${dateTag.toUpperCase()}):\n`;
    report += `  - Overall Shop Efficiency (Book / Shift):    ${overallShopEff} (${completedBookH.toFixed(1)}h Book / ${totalClockedH.toFixed(1)}h Shift)\n`;
    report += `  - Tech Labor Efficiency (Book / Task Time): ${techLaborEff} (${completedBookH.toFixed(1)}h Book / ${totalStaffTaskHours.toFixed(1)}h Task)\n`;
    report += `  - Shop Wrench Time % (Task Time / Shift):   ${wrenchTimePct} (${totalStaffTaskHours.toFixed(1)}h Task / ${totalClockedH.toFixed(1)}h Shift)\n`;
    report += `  - Daily Capacity Pace (${completedBookH.toFixed(1)}h / ${targetCapacityHours.toFixed(1)}h Goal):   ${targetPace} of Daily Shop Target\n\n`;

    report += `• SHOP LOT BACKLOG & WORKLOAD ESTIMATE:\n`;
    report += `  - Vehicles / Active Jobs on Lot: ${lotSummary.activeVehicleCount} Vehicles\n`;
    report += `  - Total Scheduled Book Time:    ${lotSummary.totalLotBookHours.toFixed(1)} hrs\n`;
    report += `  - Completed Task Book Time:     ${lotSummary.completedLotBookHours.toFixed(1)} hrs\n`;
    report += `  - Actual Time Spent to Date:    ${formatSecDuration(lotSummary.timeSpentOnLotSec)}\n`;
    report += `  - REMAINING BOOK TIME ON LOT:   ${lotSummary.remainingLotBookHours.toFixed(1)} hrs Remaining Work\n\n`;

    report += `--------------------------------------------------------------------------------\n`;
    report += `2. STAFF MEMBER PERFORMANCE & ACTIVITY STATS (BY DEPARTMENT)\n`;
    report += `--------------------------------------------------------------------------------\n\n`;

    if (staffMemberStats.length === 0) {
      report += `No staff member activity recorded for ${formattedDateStr}.\n\n`;
    } else {
      // Group staff members by Department
      const deptGroups: Record<string, typeof staffMemberStats> = {};
      staffMemberStats.forEach(st => {
        const deptName = (st.dept || 'Shop Operations').trim().toUpperCase();
        if (!deptGroups[deptName]) deptGroups[deptName] = [];
        deptGroups[deptName].push(st);
      });

      Object.entries(deptGroups).forEach(([deptName, members]) => {
        let deptShiftSec = 0;
        let deptTaskSec = 0;
        let deptBookH = 0;
        let deptCompTasksCount = 0;

        members.forEach(st => {
          deptShiftSec += st.totalShiftSec;
          deptTaskSec += st.totalTaskSec;
          deptBookH += st.completedBookHours;
          deptCompTasksCount += st.completedTasks.length;
        });

        const deptShiftH = deptShiftSec / 3600;
        const deptTaskH = deptTaskSec / 3600;
        const deptLaborEffStr = deptTaskH > 0 
          ? `${Math.round((deptBookH / deptTaskH) * 100)}% (${deptBookH.toFixed(1)}h Book / ${deptTaskH.toFixed(1)}h Actual)`
          : (deptBookH > 0 ? `${deptBookH.toFixed(1)}h Book Earned` : '--');

        report += `================================================================================\n`;
        report += `DEPARTMENT: ${deptName} (${members.length} Active Staff)\n`;
        report += `• Dept Subtotals:       ${members.length} Staff | ${deptShiftH.toFixed(1)}h Shift Clocked | ${deptTaskH.toFixed(1)}h Task Time | ${deptBookH.toFixed(1)}h Book Earned (${deptCompTasksCount} Tasks)\n`;
        report += `• Dept Efficiency Rate: ${deptLaborEffStr}\n`;
        report += `================================================================================\n\n`;

        members.forEach(st => {
          const clockInStr = st.clockIn ? st.clockIn.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'N/A';
          const clockOutStr = st.clockOut
            ? st.clockOut.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : (st.isCurrentlyClockedIn ? 'Active (Clocked In)' : 'N/A');

          const shiftDurationStr = formatSecDuration(st.totalShiftSec);

          const breakParts: string[] = [];
          if (st.lunchSec > 0) breakParts.push(`${Math.round(st.lunchSec / 60)}m Lunch`);
          if (st.paidBreakSec > 0) breakParts.push(`${Math.round(st.paidBreakSec / 60)}m Break`);
          const totalBreakMins = Math.round(st.totalBreakSec / 60);
          const breakStr = totalBreakMins > 0
            ? `${totalBreakMins}m Total${breakParts.length > 0 ? ` (${breakParts.join(', ')})` : ''}`
            : 'No Breaks Logged';

          const taskLaborStr = formatSecDuration(st.totalTaskSec);

          let taskTimePctStr = '--';
          if (st.totalShiftSec > 0 && st.totalTaskSec > 0) {
            const pct = Math.min(100, Math.round((st.totalTaskSec / st.totalShiftSec) * 100));
            taskTimePctStr = `${pct}% of shift`;
          }

          let efficiencyStr = '--';
          if (st.completedBookHours > 0 && st.totalTaskSec > 0) {
            const actualHours = st.totalTaskSec / 3600;
            const effPct = Math.round((st.completedBookHours / actualHours) * 100);
            efficiencyStr = `${effPct}% (${st.completedBookHours.toFixed(1)}h Book / ${actualHours.toFixed(1)}h Actual)`;
          } else if (st.completedBookHours > 0) {
            efficiencyStr = `${st.completedBookHours.toFixed(1)} Book Hours Earned`;
          }

          report += `• ${st.name} (${st.role || 'Technician'})\n`;
          report += `  - Shift Clock-In:   ${clockInStr} | Clock-Out: ${clockOutStr} (${shiftDurationStr} Shift)\n`;
          report += `  - Break Time:       ${breakStr}\n`;
          report += `  - Time on Task:     ${taskLaborStr} Total Task Labor (${taskTimePctStr})\n`;
          report += `  - Tasks Completed:  ${st.completedTasks.length} Tasks (${st.completedBookHours.toFixed(1)} Book Hours Earned)\n`;
          report += `  - Efficiency Rate:  ${efficiencyStr}\n`;

          if (st.completedTasks.length > 0) {
            report += `  - Tasks Finished:\n`;
            st.completedTasks.forEach(ct => {
              report += `      * ${ct.taskTitle} [Job #${ct.jobNumber}${ct.customerName ? ` - ${ct.customerName}` : ''}] ${ct.bookHours > 0 ? `(${ct.bookHours}h Book)` : ''}\n`;
            });
          }

          if (st.activeTasks.length > 0) {
            report += `  - Active Task:      ${st.activeTasks.map(at => `${at.taskTitle} [Job #${at.jobNumber}]`).join(', ')}\n`;
          }

          report += `\n`;
        });
      });
    }

    report += `--------------------------------------------------------------------------------\n`;
    report += `3. JOBS TOUCHED TODAY (STATUS & PROGRESS)\n`;
    report += `--------------------------------------------------------------------------------\n\n`;

    if (touchedJobsList.length === 0) {
      report += `No job activity recorded for ${formattedDateStr}.\n\n`;
    } else {
      touchedJobsList.forEach(j => {
        const jFeed = unifiedDailyLogFeed.filter(f => f.jobId === j.id);
        const jTechsList = Array.from(new Set(jFeed.map(f => f.who).filter(Boolean)));
        const jTechs = jTechsList.join(', ') || j.assignedTechName || 'Shop Crew';
        const assignedTechCount = Math.max(1, jTechsList.length || (j.assignedTechs ? j.assignedTechs.length : 1));

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

        const jobBlockerNotes = activeBlockersList.filter(b => b.jobId === j.id || b.id === j.id);

        report += `[Job #${j.jobNumber || 'N/A'}] — ${j.customerName || j.title || 'Upfit Job'}\n`;
        report += `• Status: ${j.status || 'In Progress'}\n`;
        report += `• Assigned Tech(s): ${jTechs}\n`;
        report += `• Task Progress: ${completedTaskCount} / ${totalTaskCount} Tasks Done (${pctComplete}%)\n`;
        report += `• Hours Breakdown: ${doneBookHours.toFixed(1)}h Done | ${remainingBookHours.toFixed(1)}h Remaining (Total: ${totalBookHours.toFixed(1)}h Book)\n`;
        report += `• Single-Job ETA: ${etaText}\n`;
        if (doneTasksDetails) report += `• Completed Today: ${doneTasksDetails}\n`;
        if (jobBlockerNotes.length > 0) {
          const notesStr = jobBlockerNotes.map(b => `${b.taskName || 'Job'}: "${b.reason}"`).join('; ');
          report += `• Blocker Note(s): ${notesStr}\n`;
        }
        if (partsSummary) report += `• Parts Status: ${partsSummary}\n`;
        report += `\n`;
      });
    }

    report += `================================================================================\n`;
    return report;
  };

  // Generate Styled HTML Report for Rich-Text Email Copying (Gmail / Outlook)
  const generateDailyReportHtml = () => {
    const baseUrl = window.location.origin;
    const nowTimeStr = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const formattedDateStr = `${selectedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })} as of ${nowTimeStr}`;

    const dateTag = isSelectedDateToday
      ? 'Today'
      : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const touchedJobIds = Array.from(new Set(unifiedDailyLogFeed.map(f => f.jobId).filter(id => id && id !== 'N/A')));
    const touchedJobsList = jobs.filter(j => touchedJobIds.includes(j.id));
    const businessName = businessInfo?.name || businessInfo?.businessName || businessInfo?.companyName || 'Main Shop Operations';

    const makeJobLink = (jobId?: string, label?: string) => {
      if (!jobId || jobId === 'N/A') return label || '';
      return `<a href="${baseUrl}/business/${tenantId}/job/${jobId}" style="color: #2563eb; font-weight: bold; text-decoration: underline;">${label || jobId}</a>`;
    };

    const makeTaskLink = (jobId?: string, taskId?: string, label?: string) => {
      if (!jobId || !taskId) return label || '';
      return `<a href="${baseUrl}/business/${tenantId}/task/${jobId}/${taskId}" style="color: #2563eb; text-decoration: underline;">${label || 'Task'}</a>`;
    };

    let html = `<div style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #0f172a; max-width: 780px; padding: 12px;">`;
    
    // Header
    html += `<div style="background-color: #0f172a; color: #ffffff; padding: 16px 20px; border-radius: 8px; font-family: monospace; font-size: 15px; font-weight: bold;">`;
    html += `UPFITTERS OS — DAILY OPERATIONS & TOUCHED JOBS REPORT<br/>`;
    html += `<span style="font-size: 12px; font-weight: normal; color: #94a3b8;">Date: ${formattedDateStr} | Business: ${businessName}</span>`;
    html += `</div><br/>`;

    // 1. Daily Operations Metrics
    html += `<h3 style="font-size: 14px; font-weight: bold; border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 8px; color: #1e293b;">1. DAILY OPERATIONS METRICS (${dateTag.toUpperCase()})</h3>`;
    html += `<ul style="list-style-type: square; padding-left: 20px; margin: 0 0 16px 0;">`;
    html += `<li><strong>Jobs Touched (${dateTag}):</strong> ${touchedJobIds.length} Jobs</li>`;
    html += `<li><strong>Completed Book Hours:</strong> ${topSummary.totalBookHours} hrs</li>`;
    html += `<li><strong>Total Techs (${dateTag}):</strong> ${topSummary.totalTechsToday} Techs</li>`;
    html += `<li><strong>Total Clocked Hours:</strong> ${topSummary.totalClockedHours} hrs</li>`;
    html += `<li><strong>Tasks Finished (${dateTag}):</strong> ${metrics.taskCount} Tasks</li>`;
    
    html += `<li><strong>Active Task Blockers:</strong> ${activeBlockersList.length} Tasks Blocked</li>`;
    if (activeBlockersList.length > 0) {
      html += `<ul style="margin: 4px 0 8px 16px; padding-left: 16px;">`;
      activeBlockersList.forEach(b => {
        const metaParts: string[] = [];
        if (b.createdBy) metaParts.push(`Added by ${b.createdBy}`);
        if (b.createdAtStr) metaParts.push(`at ${b.createdAtStr}`);
        const metaStr = metaParts.length > 0 ? ` (${metaParts.join(' ')})` : '';
        const jobLinkHtml = b.jobId ? makeJobLink(b.jobId, b.label) : b.label;

        html += `<li style="margin-bottom: 6px;">${jobLinkHtml}<br/>`;
        html += `<span style="color: #dc2626; font-size: 12px;">↳ Blocker: "${b.reason}"${metaStr}</span></li>`;
      });
      html += `</ul>`;
    }

    html += `<li><strong>Unfulfilled Parts (Shop):</strong> <a href="${baseUrl}/business/${tenantId}/parts" style="color: #2563eb; font-weight: bold; text-decoration: underline;">${topSummary.pendingPartsCount} Pending Parts</a></li>`;
    html += `<li><strong>Jobs Ready for QC:</strong> ${readyForQcJobs.length} Jobs</li>`;
    if (readyForQcJobs.length > 0) {
      html += `<ul style="margin: 4px 0 8px 16px; padding-left: 16px;">`;
      readyForQcJobs.forEach(j => {
        const readyDate = j.readyForQcAt || j.qcReadyAt || j.statusChangedAt || j.statusUpdatedAt || j.updatedAt;
        const readySinceStr = formatReadySince(readyDate);
        const jobLinkHtml = makeJobLink(j.id, `[Job #${j.jobNumber || 'N/A'}] ${j.customerName || j.title || 'Upfit Vehicle'}`);
        html += `<li style="margin-bottom: 4px;">${jobLinkHtml} ${readySinceStr ? `<br/><span style="color: #475569; font-size: 11px;">↳ ${readySinceStr}</span>` : ''}</li>`;
      });
      html += `</ul>`;
    }
    
    html += `<li><strong>Jobs Ready for Customer:</strong> ${readyForCustomerOnLotJobs.length} Jobs (On Lot / Parked)</li>`;
    if (readyForCustomerOnLotJobs.length > 0) {
      html += `<ul style="margin: 4px 0 8px 16px; padding-left: 16px;">`;
      readyForCustomerOnLotJobs.forEach(j => {
        const z = zones.find(zone => !zone.isArchived && (zone.currentJobId === j.id || (Array.isArray(zone.assignedJobIds) && zone.assignedJobIds.includes(j.id))));
        const loc = z?.name || j.currentZoneName || j.zoneName || j.location || j.parkingSpot || 'Parked on Lot';
        const readyDate = j.readyForCustomerAt || j.rfcAt || j.qcApprovedAt || j.statusChangedAt || j.statusUpdatedAt || j.updatedAt;
        const readySinceStr = formatReadySince(readyDate);
        const jobLinkHtml = makeJobLink(j.id, `[Job #${j.jobNumber || 'N/A'}] ${j.customerName || j.title || 'Upfit Vehicle'}`);
        html += `<li style="margin-bottom: 4px;">${jobLinkHtml} <span style="color: #475569;">(Location: ${loc})</span>${readySinceStr ? `<br/><span style="color: #16a34a; font-size: 11px; font-weight: bold;">↳ ${readySinceStr}</span>` : ''}</li>`;
      });
      html += `</ul>`;
    }
    html += `</ul>`;

    // Efficiency
    const totalStaffTaskSec = staffMemberStats.reduce((sum, st) => sum + st.totalTaskSec, 0);
    const totalStaffTaskHours = totalStaffTaskSec / 3600;
    const completedBookH = parseFloat(topSummary.totalBookHours || '0') || 0;
    const totalClockedH = parseFloat(topSummary.totalClockedHours || '0') || 0;

    const overallShopEff = totalClockedH > 0 ? ((completedBookH / totalClockedH) * 100).toFixed(1) + '%' : '--';
    const techLaborEff = totalStaffTaskHours > 0 ? ((completedBookH / totalStaffTaskHours) * 100).toFixed(1) + '%' : '--';
    const wrenchTimePct = totalClockedH > 0 ? ((totalStaffTaskHours / totalClockedH) * 100).toFixed(1) + '%' : '--';
    const techCount = topSummary.totalTechsToday || staffMemberStats.length || 1;
    const targetCapacityHours = techCount * 8;
    const targetPace = targetCapacityHours > 0 ? ((completedBookH / targetCapacityHours) * 100).toFixed(1) + '%' : '--';

    html += `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 16px;">`;
    html += `<strong style="color: #0f172a; font-size: 13px;">SHOP EFFICIENCY & LABOR UTILIZATION (${dateTag.toUpperCase()}):</strong><br/>`;
    html += `• <strong>Overall Shop Efficiency (Book / Shift):</strong> ${overallShopEff} (${completedBookH.toFixed(1)}h Book / ${totalClockedH.toFixed(1)}h Shift)<br/>`;
    html += `• <strong>Tech Labor Efficiency (Book / Task Time):</strong> ${techLaborEff} (${completedBookH.toFixed(1)}h Book / ${totalStaffTaskHours.toFixed(1)}h Task)<br/>`;
    html += `• <strong>Shop Wrench Time % (Task Time / Shift):</strong> ${wrenchTimePct} (${totalStaffTaskHours.toFixed(1)}h Task / ${totalClockedH.toFixed(1)}h Shift)<br/>`;
    html += `• <strong>Daily Capacity Pace (${completedBookH.toFixed(1)}h / ${targetCapacityHours.toFixed(1)}h Goal):</strong> ${targetPace} of Daily Target`;
    html += `</div>`;

    // Shop Lot Backlog
    html += `<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; margin-bottom: 16px;">`;
    html += `<strong style="color: #166534; font-size: 13px;">SHOP LOT BACKLOG & WORKLOAD ESTIMATE:</strong><br/>`;
    html += `• <strong>Vehicles / Active Jobs on Lot:</strong> ${lotSummary.activeVehicleCount} Vehicles<br/>`;
    html += `• <strong>Total Scheduled Book Time:</strong> ${lotSummary.totalLotBookHours.toFixed(1)} hrs<br/>`;
    html += `• <strong>Completed Task Book Time:</strong> ${lotSummary.completedLotBookHours.toFixed(1)} hrs<br/>`;
    html += `• <strong>Actual Time Spent to Date:</strong> ${formatSecDuration(lotSummary.timeSpentOnLotSec)}<br/>`;
    html += `• <strong style="color: #15803d;">REMAINING BOOK TIME ON LOT: ${lotSummary.remainingLotBookHours.toFixed(1)} hrs Remaining Work</strong>`;
    html += `</div>`;

    // 2. Staff Member Performance
    html += `<h3 style="font-size: 14px; font-weight: bold; border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 8px; color: #1e293b;">2. STAFF MEMBER PERFORMANCE & ACTIVITY STATS (BY DEPARTMENT)</h3>`;

    if (staffMemberStats.length === 0) {
      html += `<p style="color: #64748b;">No staff member activity recorded for ${formattedDateStr}.</p>`;
    } else {
      const deptGroups: Record<string, typeof staffMemberStats> = {};
      staffMemberStats.forEach(st => {
        const deptName = (st.dept || 'Unassigned').trim().toUpperCase();
        if (!deptGroups[deptName]) deptGroups[deptName] = [];
        deptGroups[deptName].push(st);
      });

      Object.entries(deptGroups).forEach(([deptName, members]) => {
        let deptShiftSec = 0;
        let deptTaskSec = 0;
        let deptBookH = 0;
        let deptCompTasksCount = 0;

        members.forEach(st => {
          deptShiftSec += st.totalShiftSec;
          deptTaskSec += st.totalTaskSec;
          deptBookH += st.completedBookHours;
          deptCompTasksCount += st.completedTasks.length;
        });

        const deptShiftH = deptShiftSec / 3600;
        const deptTaskH = deptTaskSec / 3600;
        const deptLaborEffStr = deptTaskH > 0 
          ? `${Math.round((deptBookH / deptTaskH) * 100)}% (${deptBookH.toFixed(1)}h Book / ${deptTaskH.toFixed(1)}h Actual)`
          : (deptBookH > 0 ? `${deptBookH.toFixed(1)}h Book Earned` : '--');

        html += `<div style="background-color: #334155; color: #ffffff; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; margin: 14px 0 6px 0;">`;
        html += `DEPARTMENT: ${deptName} (${members.length} Active Staff)<br/>`;
        html += `<span style="font-size: 11px; font-weight: normal; color: #cbd5e1;">Subtotals: ${members.length} Staff | ${deptShiftH.toFixed(1)}h Shift | ${deptTaskH.toFixed(1)}h Task Time | ${deptBookH.toFixed(1)}h Book (${deptCompTasksCount} Tasks) | Eff: ${deptLaborEffStr}</span>`;
        html += `</div>`;

        members.forEach(st => {
          const clockInStr = st.clockIn ? st.clockIn.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'N/A';
          const clockOutStr = st.clockOut
            ? st.clockOut.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : (st.isCurrentlyClockedIn ? 'Active (Clocked In)' : 'N/A');

          const shiftDurationStr = formatSecDuration(st.totalShiftSec);
          const taskLaborStr = formatSecDuration(st.totalTaskSec);

          let efficiencyStr = '--';
          if (st.completedBookHours > 0 && st.totalTaskSec > 0) {
            const actualHours = st.totalTaskSec / 3600;
            const effPct = Math.round((st.completedBookHours / actualHours) * 100);
            efficiencyStr = `${effPct}% (${st.completedBookHours.toFixed(1)}h Book / ${actualHours.toFixed(1)}h Actual)`;
          } else if (st.completedBookHours > 0) {
            efficiencyStr = `${st.completedBookHours.toFixed(1)} Book Hours Earned`;
          }

          html += `<div style="margin-left: 6px; margin-bottom: 12px; padding-left: 10px; border-left: 3px solid #cbd5e1;">`;
          html += `<strong style="font-size: 13px;"><a href="${baseUrl}/business/${tenantId}/staff" style="color: #0f172a; text-decoration: none;">${st.name}</a></strong> <span style="color: #64748b;">(${st.role || 'Staff'})</span><br/>`;
          html += `• <strong>Shift:</strong> ${clockInStr} - ${clockOutStr} (${shiftDurationStr})<br/>`;
          html += `• <strong>Time on Task:</strong> ${taskLaborStr} Total Task Labor<br/>`;
          html += `• <strong>Tasks Completed:</strong> ${st.completedTasks.length} Tasks (${st.completedBookHours.toFixed(1)} Book Hours Earned)<br/>`;
          html += `• <strong>Efficiency:</strong> ${efficiencyStr}<br/>`;

          if (st.completedTasks.length > 0) {
            html += `<span style="font-weight: bold;">• Tasks Finished:</span><br/>`;
            html += `<ul style="margin: 2px 0 4px 16px; padding-left: 12px;">`;
            st.completedTasks.forEach(ct => {
              const matchingJob = jobs.find(j => (j.jobNumber || j.id) === ct.jobNumber || j.id === ct.taskId);
              const targetJobId = matchingJob?.id || ct.taskId;
              const taskLinkHtml = makeTaskLink(targetJobId, ct.taskId, ct.taskTitle);
              const jobLinkHtml = ct.jobNumber ? makeJobLink(targetJobId, `[Job #${ct.jobNumber}${ct.customerName ? ` - ${ct.customerName}` : ''}]`) : '';
              html += `<li style="margin-bottom: 3px;">${taskLinkHtml} ${jobLinkHtml} ${ct.bookHours > 0 ? `(${ct.bookHours}h Book)` : ''}</li>`;
            });
            html += `</ul>`;
          }

          if (st.activeTasks.length > 0) {
            html += `• <strong>Active Tasks:</strong> ${st.activeTasks.map(at => {
              const matchingJ = jobs.find(j => (j.jobNumber || j.id) === at.jobNumber);
              return `${at.taskTitle} ${matchingJ ? makeJobLink(matchingJ.id, `[Job #${at.jobNumber}]`) : `[Job #${at.jobNumber}]`}`;
            }).join(', ')}<br/>`;
          }

          html += `</div>`;
        });
      });
    }

    // 3. Jobs Touched Today
    html += `<h3 style="font-size: 14px; font-weight: bold; border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; margin-top: 16px; margin-bottom: 8px; color: #1e293b;">3. JOBS TOUCHED TODAY (STATUS & PROGRESS)</h3>`;

    if (touchedJobsList.length === 0) {
      html += `<p style="color: #64748b;">No jobs logged activity on ${formattedDateStr}.</p>`;
    } else {
      html += `<ul style="list-style-type: none; padding: 0; margin: 0;">`;
      touchedJobsList.forEach(j => {
        const jobLinkHtml = makeJobLink(j.id, `[Job #${j.jobNumber || 'N/A'}] ${j.customerName || j.title || 'Upfit Job'}`);
        html += `<li style="margin-bottom: 8px; padding: 8px 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">`;
        html += `<strong style="font-size: 13px;">${jobLinkHtml}</strong> | Status: <strong>${j.status || 'Active'}</strong><br/>`;

        const subTasks = tasksMap[j.id] || [];
        const embeddedTasks = Array.isArray(j.tasks) ? j.tasks : [];
        const existingIds = new Set(subTasks.map((t: any) => t.id).filter(Boolean));
        const extraEmbedded = embeddedTasks.filter((t: any) => t && (t.id || t.name || t.title) && (!t.id || !existingIds.has(t.id)));
        const jTasks = [...subTasks, ...extraEmbedded];

        if (jTasks.length > 0) {
          const compCount = jTasks.filter(isTaskCompleted).length;
          const pct = Math.round((compCount / jTasks.length) * 100);
          html += `<span style="font-size: 11px; color: #475569;">Progress: ${compCount} / ${jTasks.length} tasks completed (${pct}%)</span>`;
        }

        html += `</li>`;
      });
      html += `</ul>`;
    }

    html += `</div>`;
    return html;
  };

  const handleCopyReport = async () => {
    const plainText = generateDailyReportText();
    const htmlText = generateDailyReportHtml();

    try {
      const blobText = new Blob([plainText], { type: 'text/plain' });
      const blobHtml = new Blob([htmlText], { type: 'text/html' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': blobText,
          'text/html': blobHtml
        })
      ]);
      setCopiedReport(true);
      toast.success('Report copied with active links! Ready to paste into Gmail.');
      setTimeout(() => setCopiedReport(false), 2500);
    } catch (err) {
      await navigator.clipboard.writeText(plainText);
      setCopiedReport(true);
      toast.success('Report text copied!');
      setTimeout(() => setCopiedReport(false), 2500);
    }
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

            {/* Super Admin Deleted Logs Toggle */}
            {isUserSuperAdmin && Object.keys(deletedLogMap).length > 0 && (
              <button
                onClick={() => setShowDeletedLogs(prev => !prev)}
                className={cn(
                  "px-2.5 py-1 rounded-lg border flex items-center gap-1.5 font-bold text-[9px] transition cursor-pointer",
                  showDeletedLogs
                    ? "bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-950/40"
                    : "bg-zinc-950 text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                )}
                title="Super Admin: Toggle Deleted Logs View"
              >
                <Trash2 className="w-3 h-3" />
                <span>{showDeletedLogs ? 'Viewing Deleted' : `Deleted (${Object.keys(deletedLogMap).length})`}</span>
              </button>
            )}

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
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2 flex-1">
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

            {/* Ready for Customer */}
            <button
              onClick={() => setLogFilterCategory('rfc')}
              className={cn(
                "px-3 py-1.5 rounded-xl flex items-center justify-between transition border shadow-sm cursor-pointer group text-left",
                logFilterCategory === 'rfc'
                  ? "bg-emerald-950/50 border-emerald-500/80 ring-1 ring-emerald-500/30"
                  : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60"
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-[9px] uppercase text-zinc-300 truncate">
                <CheckCircle2 className={cn("w-3 h-3 shrink-0 transition", logFilterCategory === 'rfc' ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300")} />
                <span className="truncate">READY FOR CUSTOMER</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                <span className="text-xs font-black text-emerald-400">{metrics.rfcCount}</span>
                <span className={cn("text-[8px] font-mono font-bold px-1 py-0.2 rounded border uppercase", logFilterCategory === 'rfc' ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "text-zinc-500 border-zinc-800 group-hover:text-zinc-400")}>
                  {logFilterCategory === 'rfc' ? 'Active' : 'Filter'}
                </span>
              </div>
            </button>

            {/* Blocked Events */}
            <button
              onClick={() => setLogFilterCategory('blocked')}
              className={cn(
                "px-3 py-1.5 rounded-xl flex items-center justify-between transition border shadow-sm cursor-pointer group text-left",
                logFilterCategory === 'blocked'
                  ? "bg-rose-950/50 border-rose-500/80 ring-1 ring-rose-500/30"
                  : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60"
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-[9px] uppercase text-zinc-300 truncate">
                <AlertOctagon className={cn("w-3 h-3 shrink-0 transition", logFilterCategory === 'blocked' ? "text-rose-400" : "text-zinc-500 group-hover:text-zinc-300")} />
                <span className="truncate">BLOCKED</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                <span className="text-xs font-black text-rose-400">{metrics.blockedCount}</span>
                <span className={cn("text-[8px] font-mono font-bold px-1 py-0.2 rounded border uppercase", logFilterCategory === 'blocked' ? "bg-rose-500/20 text-rose-300 border-rose-500/30" : "text-zinc-500 border-zinc-800 group-hover:text-zinc-400")}>
                  {logFilterCategory === 'blocked' ? 'Active' : 'Filter'}
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

                {/* JOB / CUSTOMER Header */}
                {visibleColumns.job && (
                  <th className="py-2 px-3 border-r border-zinc-800/80 w-60 relative">
                    <div className="flex items-center justify-between gap-1">
                      <button 
                        onClick={() => handleSortToggle('job')}
                        className={cn("flex items-center gap-1 font-black hover:text-white transition", selectedCustomerFilters.length > 0 && "text-indigo-400")}
                      >
                        <span>JOB / CUSTOMER</span>
                        {selectedCustomerFilters.length > 0 && (
                          <span className="text-[8px] bg-indigo-500/20 text-indigo-300 px-1 rounded font-mono">
                            ({selectedCustomerFilters.length})
                          </span>
                        )}
                        {sortColumn === 'job' && (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-teal-400" /> : <ArrowDown className="w-3 h-3 text-teal-400" />
                        )}
                      </button>
                      <button 
                        onClick={() => setActiveHeaderDropdown(prev => prev === 'job' ? null : 'job')}
                        className={cn("p-1 hover:bg-zinc-800 rounded", selectedCustomerFilters.length > 0 ? "text-indigo-400" : "text-zinc-500 hover:text-white")}
                        title="Filter Customers & Sort Jobs"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    {activeHeaderDropdown === 'job' && (
                      <div className="absolute left-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2.5 z-30 font-sans text-[11px] normal-case font-normal text-zinc-200">
                        <div className="space-y-1 pb-2 border-b border-zinc-800">
                          <button
                            onClick={() => { setSortColumn('job'); setSortDirection('asc'); setActiveHeaderDropdown(null); }}
                            className="w-full text-left px-2 py-1 rounded hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <ArrowUp className="w-3 h-3 text-indigo-400" /> Sort Job # A-Z
                          </button>
                          <button
                            onClick={() => { setSortColumn('job'); setSortDirection('desc'); setActiveHeaderDropdown(null); }}
                            className="w-full text-left px-2 py-1 rounded hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <ArrowDown className="w-3 h-3 text-indigo-400" /> Sort Job # Z-A
                          </button>
                        </div>

                        <div className="pt-2">
                          <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 mb-1.5">
                            <span>Filter by Customer:</span>
                            {selectedCustomerFilters.length > 0 && (
                              <button onClick={() => setSelectedCustomerFilters([])} className="text-indigo-400 hover:underline">Clear</button>
                            )}
                          </div>

                          {/* Typeahead Search Input */}
                          <div className="relative mb-2">
                            <Search className="w-3 h-3 absolute left-2 top-2 text-zinc-500" />
                            <input
                              type="text"
                              value={customerSearchQuery}
                              onChange={(e) => setCustomerSearchQuery(e.target.value)}
                              placeholder="Type to search customers..."
                              className="w-full pl-7 pr-2 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-zinc-600 font-sans"
                              autoFocus
                            />
                            {customerSearchQuery && (
                              <button onClick={() => setCustomerSearchQuery('')} className="absolute right-2 top-1.5 text-zinc-500 hover:text-white">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                            {uniqueCustomers.length === 0 ? (
                              <div className="text-[10px] text-zinc-500 italic py-1">No customers in today's log</div>
                            ) : (
                              uniqueCustomers
                                .filter(c => !customerSearchQuery.trim() || c.toLowerCase().includes(customerSearchQuery.toLowerCase()))
                                .map(cust => (
                                  <label key={cust} className="flex items-center gap-2 text-zinc-300 hover:text-white cursor-pointer select-none py-0.5">
                                    <input
                                      type="checkbox"
                                      checked={selectedCustomerFilters.includes(cust)}
                                      onChange={() => toggleCustomerFilter(cust)}
                                      className="rounded bg-zinc-950 border-zinc-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                                    />
                                    <span className="truncate font-medium text-[11px]">{cust}</span>
                                  </label>
                                ))
                            )}
                          </div>
                        </div>
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

                {/* Super Admin Actions Column */}
                {isUserSuperAdmin && (
                  <th className="py-2 px-2.5 text-center font-mono font-black text-zinc-500 uppercase tracking-wider text-[9px] w-14">
                    Action
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
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 font-mono font-bold whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={row.isTimeEdited ? "text-amber-400 font-extrabold" : "text-teal-400"}>
                            {row.timeStr}
                          </span>
                          {row.isTimeEdited && (
                            <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30" title={`Edited by ${row.editedBy || 'Super Admin'}`}>
                              EDITED
                            </span>
                          )}
                          {isUserSuperAdmin && (
                            <button
                              onClick={() => handleOpenEditTimeModal(row)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-700 text-zinc-500 hover:text-amber-300 rounded transition cursor-pointer"
                              title="Super Admin: Edit Event Time"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
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

                    {/* Who (Clickable Staff Profile Link - Popup Window) */}
                    {visibleColumns.who && (
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 font-sans font-bold text-white truncate max-w-[170px]">
                        {row.staffId ? (
                          <button
                            onClick={(e) => openJobPopupWindow(`/business/${tenantId}/staff/${row.staffId}`, row.staffId, e)}
                            className="flex items-center gap-1.5 text-white hover:text-indigo-400 hover:underline transition truncate text-left group/user cursor-pointer"
                            title={`Open ${row.who}'s Staff Profile`}
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


                    {/* Job / Task Link (Clickable Link - Centered Standalone Window Frame) */}
                    {visibleColumns.job && (
                      <td className="py-1.5 px-3 border-r border-zinc-800/60 font-sans truncate max-w-[220px]">
                        {(row.jobId && row.jobId !== 'N/A' && row.jobNumber && row.jobNumber !== 'N/A') ? (
                          <div>
                            <button
                              onClick={(e) => {
                                const targetUrl = (row.taskId && row.taskId !== 'N/A')
                                  ? `/business/${tenantId}/task/${row.jobId}/${row.taskId}`
                                  : `/business/${tenantId}/job/${row.jobId}`;
                                openJobPopupWindow(targetUrl, row.jobId, e);
                              }}
                              className="font-bold text-indigo-300 hover:text-white hover:underline text-[10px] truncate text-left block cursor-pointer"
                              title={row.taskId ? `Open Task Details for Job #${row.jobNumber}` : `Open Job #${row.jobNumber} Details`}
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

                    {/* Activity & Details (Clickable to Task Detail Page in Standalone Window if Task Event) */}
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
                            onClick={(e) => openJobPopupWindow(`/business/${tenantId}/task/${row.jobId}/${row.taskId}`, row.jobId, e)}
                            className="font-medium text-xs leading-tight truncate text-left hover:text-indigo-300 hover:underline transition block w-full cursor-pointer"
                            title="Open Task Details"
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
                          row.status === 'READY FOR CUSTOMER' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                          row.status === 'BLOCKED' && "bg-rose-500/10 text-rose-400 border-rose-500/20",
                          row.status === 'RESOLVED' && "bg-teal-500/10 text-teal-400 border-teal-500/20",
                          row.status === 'IN PROGRESS' && "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
                          row.status === 'Active Shift' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                          row.status === 'Shift Completed' && "bg-zinc-800 text-zinc-400 border-zinc-700",
                          row.status === 'ON LUNCH' && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                          row.status === 'ON BREAK' && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                          !['REQUESTED', 'ORDERED', 'RECEIVED', 'WITH VEHICLE', 'DELIVERED', 'STAGED', 'FULFILLED', 'READY FOR QC', 'READY FOR CUSTOMER', 'BLOCKED', 'RESOLVED', 'IN PROGRESS', 'Active Shift', 'Shift Completed', 'ON LUNCH', 'ON BREAK'].includes(row.status) && "bg-zinc-950 text-zinc-400 border-zinc-800"
                        )}>
                          {row.status}
                        </span>
                      </td>
                    )}

                    {/* Super Admin Action Cell */}
                    {isUserSuperAdmin && (
                      <td className="py-1.5 px-2 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEditTimeModal(row)}
                            className="p-1 rounded-lg hover:bg-amber-500/20 text-zinc-500 hover:text-amber-400 transition cursor-pointer opacity-40 group-hover:opacity-100"
                            title="Super Admin: Edit Event Time"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {deletedLogMap[row.id] ? (
                            <button
                              onClick={() => handleRestoreLogEntry(row)}
                              className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold hover:bg-emerald-500/20 cursor-pointer"
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              onClick={() => setLogToDelete(row)}
                              className="p-1 rounded-lg hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition cursor-pointer opacity-40 group-hover:opacity-100"
                              title="Super Admin: Delete Log Entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
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

      {/* Super Admin Time Adjustment Modal */}
      {logToEditTime && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5 text-amber-400">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-zinc-100">Adjust Event Timestamp</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">Super Admin Override</p>
                </div>
              </div>
              <button onClick={() => setLogToEditTime(null)} className="text-zinc-500 hover:text-white p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Event Summary */}
            <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500 font-bold uppercase">Event Type</span>
                <span className={cn("px-2 py-0.5 rounded text-[9px] font-mono font-black border uppercase", logToEditTime.badgeClass)}>
                  {logToEditTime.badgeLabel}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500 font-bold uppercase">Technician</span>
                <span className="font-bold text-zinc-200">{logToEditTime.who || 'Unassigned'}</span>
              </div>
              {logToEditTime.jobNumber && logToEditTime.jobNumber !== 'N/A' && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500 font-bold uppercase">Job</span>
                  <span className="font-bold text-indigo-400">Job #{logToEditTime.jobNumber}</span>
                </div>
              )}
              <div className="pt-2 border-t border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 font-bold uppercase block mb-0.5">Details</span>
                <p className="text-zinc-200 font-medium text-xs truncate">{logToEditTime.details}</p>
              </div>
            </div>

            {/* Date & Time Pickers */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                    Event Date
                  </label>
                  <input
                    type="date"
                    value={editDateValue}
                    onChange={(e) => setEditDateValue(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                    Event Time
                  </label>
                  <input
                    type="time"
                    step="60"
                    value={editTimeValue}
                    onChange={(e) => setEditTimeValue(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-zinc-950 border border-zinc-800 text-amber-400 text-xs font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] text-zinc-500 font-mono uppercase mr-1">Quick:</span>
                <button
                  type="button"
                  onClick={() => handleAdjustEditTimeMinutes(-15)}
                  className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono rounded-lg transition cursor-pointer"
                >
                  -15m
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustEditTimeMinutes(-5)}
                  className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono rounded-lg transition cursor-pointer"
                >
                  -5m
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustEditTimeMinutes(5)}
                  className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono rounded-lg transition cursor-pointer"
                >
                  +5m
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustEditTimeMinutes(15)}
                  className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono rounded-lg transition cursor-pointer"
                >
                  +15m
                </button>
                <button
                  type="button"
                  onClick={handleSetEditTimeToNow}
                  className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-mono rounded-lg transition cursor-pointer font-bold"
                >
                  Now
                </button>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-zinc-800 gap-2">
              {editedLogMap[logToEditTime.id] ? (
                <button
                  type="button"
                  onClick={() => {
                    handleResetEditedTime(logToEditTime);
                    setLogToEditTime(null);
                  }}
                  className="px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore Original</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLogToEditTime(null)}
                  disabled={isSavingTimeEdit}
                  className="h-10 px-4 text-xs font-bold text-zinc-400 hover:text-white rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSaveTimeEdit}
                  disabled={isSavingTimeEdit}
                  className="h-10 px-5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs rounded-xl active:scale-95 transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-950/40 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>{isSavingTimeEdit ? 'Saving...' : 'Save New Time'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Super Admin Delete Confirmation Modal */}
      {logToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5 text-rose-400">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-zinc-100">Delete Log Entry</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">Super Admin Override</p>
                </div>
              </div>
              <button onClick={() => setLogToDelete(null)} className="text-zinc-500 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500 font-bold uppercase">Time</span>
                <span className="font-mono text-teal-400 font-bold">{logToDelete.timeStr}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500 font-bold uppercase">Staff</span>
                <span className="font-bold text-zinc-200">{logToDelete.who || 'Unassigned'}</span>
              </div>
              {logToDelete.jobNumber && logToDelete.jobNumber !== 'N/A' && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500 font-bold uppercase">Job</span>
                  <span className="font-bold text-indigo-400">Job #{logToDelete.jobNumber}</span>
                </div>
              )}
              <div className="pt-2 border-t border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 font-bold uppercase block mb-0.5">Details</span>
                <p className="text-zinc-200 font-medium">{logToDelete.details}</p>
                {logToDelete.note && (
                  <p className="text-zinc-400 italic text-[11px] mt-1 bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                    "{logToDelete.note}"
                  </p>
                )}
              </div>
            </div>

            <p className="text-xs text-zinc-400">
              Are you sure you want to remove this log entry from the Daily Operations Log?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setLogToDelete(null)}
                disabled={isDeletingLog}
                className="h-10 px-4 text-xs font-bold text-zinc-400 hover:text-white rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteLog}
                disabled={isDeletingLog}
                className="h-10 px-5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs rounded-xl active:scale-95 transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-rose-950/40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingLog ? 'Deleting...' : 'Delete Log Entry'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
