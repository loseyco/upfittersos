import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { db } from '../../lib/firebase/config';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, 
  getDoc, addDoc, serverTimestamp, getDocs, orderBy, limit, collectionGroup, deleteField, deleteDoc
} from 'firebase/firestore';
import { 
  Clock, Play, Square, Coffee, Pizza, 
  ChevronLeft, ChevronRight,
  Wrench, RefreshCw, AlertCircle, Check, X,
  Loader2, Plus, Calendar, Terminal, Copy, Bug, Info
} from 'lucide-react';
import { useTimeclockStore } from '../../lib/store/timeclockStore';
import { useJobClock } from '../timeclock/useJobClock';
import { getCurrentLocation, updateStaffLastLocation, calculateDistance } from '../../lib/locationService';
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

// Formats duration in ms to h/m/s for active timer
const formatTimer = (ms: number) => {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Formats duration in ms to short human readable hours/minutes
const formatDurationText = (ms: number) => {
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

// Formats duration in ms to decimal hours (e.g. 1.25h)
const formatDecimalHours = (ms: number) => {
  return `${(ms / 3600000).toFixed(2)}h`;
};

// Formats a timestamp into clock time (e.g. 08:30 AM)
const formatClockTime = (ts: any) => {
  if (!ts) return '--:--';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Calculate total session time in ms
const calculateSessionMs = (session: any) => {
  const clockInVal = session.clockIn?.timestamp;
  const clockOutVal = session.clockOut?.timestamp;
  if (!clockInVal) return 0;
  
  const sMs = clockInVal.seconds ? clockInVal.seconds * 1000 : new Date(clockInVal).getTime();
  let eMs = Date.now();
  if (clockOutVal) {
    eMs = clockOutVal.seconds ? clockOutVal.seconds * 1000 : new Date(clockOutVal).getTime();
  } else if (session.status === 'completed') {
    const updatedVal = session.updatedAt || session.createdAt;
    eMs = updatedVal?.seconds ? updatedVal.seconds * 1000 : new Date(updatedVal).getTime();
  }
  return Math.max(0, eMs - sMs);
};

// Calculate total break time in ms
const calculateBreaksMs = (session: any) => {
  return (session.breaks || []).reduce((acc: number, b: any) => {
    const bs = b.start?.seconds ? b.start.seconds * 1000 : new Date(b.start).getTime();
    const be = b.end ? (b.end.seconds ? b.end.seconds * 1000 : new Date(b.end).getTime()) : Date.now();
    return acc + Math.max(0, be - bs);
  }, 0);
};

// Parse task completed date safely - Strictly based on floor completion, never QC inspection timestamp
const getCompletedDateMs = (t: any) => {
  const val = t.completedAt || t.completedDate || t.finishedAt;
  if (!val) return null;
  if (val.seconds !== undefined) return val.seconds * 1000;
  if (val.toDate !== undefined) return val.toDate().getTime();
  return new Date(val).getTime();
};

// Calculate unallocated time intervals for a session
const calculateSessionGaps = (ses: any, currentTime: number) => {
  const getMs = (val: any) => {
    if (!val) return Date.now();
    if (val.seconds !== undefined) return val.seconds * 1000;
    if (val.toDate !== undefined) return val.toDate().getTime();
    return new Date(val).getTime();
  };

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
    if (je && je > js && js <= sEndMs) {
      occupied.push({ start: Math.max(js, sStartMs), end: Math.min(je, sEndMs) });
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

// Combine a time string (HH:MM) with a base timestamp's date
const parseLocalTimeInput = (timeStr: string, baseDateMs: number) => {
  const d = new Date(baseDateMs);
  const [hrs, mins] = timeStr.split(':').map(Number);
  d.setHours(hrs, mins, 0, 0);
  return d;
};

interface TimelineEvent {
  id: string;
  type: 'shift_start' | 'shift_end' | 'break' | 'labor' | 'task_completed' | 'gap';
  timeStart: number;
  timeEnd?: number;
  label: string;
  subLabel?: string;
  locationOnSite?: boolean;
  breakType?: 'lunch' | 'normal';
  jobId?: string;
  taskId?: string;
  taskName?: string;
  payBasis?: string;
  bookTime?: number;
  isSessionActive?: boolean;
  remoteReason?: string;
  bayName?: string;
  sessionId?: string;
  jobIndex?: number;
  breakIndex?: number;
  segmentNote?: string;
  taskNotes?: string;
}

export function TimeDetailsV3({ tenantId }: { tenantId: string }) {
  const { user, impersonatedStaff, permissions = {}, isSuperAdmin } = useAuthStore();
  const { activeSessionId, setStatus: setClockStatus, reset: resetClock } = useTimeclockStore();

  // Parse URL search parameters for sharing/auditing
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), [window.location.search]);
  const urlStaffId = searchParams.get('staffId');

  // Offset in weeks to browse previous pay periods
  const [offsetWeeks, setOffsetWeeks] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlOffset = params.get('offsetWeeks');
    return urlOffset ? parseInt(urlOffset, 10) || 0 : 0;
  });

  // Track the offsetWeeks value back into the URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (offsetWeeks === 0) {
      params.delete('offsetWeeks');
    } else {
      params.set('offsetWeeks', offsetWeeks.toString());
    }
    const newRelativePathQuery = window.location.pathname + '?' + params.toString();
    window.history.replaceState(null, '', newRelativePathQuery);
  }, [offsetWeeks]);
  
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [staffMember, setStaffMember] = useState<any>(null);
  const [business, setBusiness] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [editRequests, setEditRequests] = useState<any[]>([]);
  const [myAssignedTasks, setMyAssignedTasks] = useState<any[]>([]);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [isClockProcessing, setIsClockProcessing] = useState(false);
  const [editingGapKey, setEditingGapKey] = useState<string | null>(null);
  const [isAddingMissingShift, setIsAddingMissingShift] = useState(false);


  const saveGapNote = async (sessionId: string, gapStart: number, noteText: string) => {
    if (!tenantId || !sessionId) return;
    try {
      const docRef = doc(db, `businesses/${tenantId}/time_sessions`, sessionId);
      await updateDoc(docRef, {
        [`gapNotes.gap_${gapStart}`]: noteText || deleteField()
      });
      toast.success("Note saved successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save note");
    }
  };

  // Gap allocation & Labor/Segment editing states
  const [allocatingGap, setAllocatingGap] = useState<{ sessionId: string, start: number, end: number } | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  
  const [editingSegment, setEditingSegment] = useState<{
    sessionId: string;
    type: 'labor' | 'shift_start' | 'shift_end' | 'break';
    title: string;
    subTitle?: string;
    start: number;
    end?: number;
    jobIndex?: number;
    jobId?: string;
    taskId?: string;
    note?: string;
    breakIndex?: number;
  } | null>(null);

  // Super Admin Debug Inspector State
  const [inspectorData, setInspectorData] = useState<{
    title: string;
    type: string;
    evt?: any;
    taskDoc?: any;
    sessionDoc?: any;
    calculations?: any;
    timestamp?: string;
  } | null>(null);

  const openInspector = (title: string, type: string, evt?: any, taskDoc?: any, sessionDoc?: any, extraCalc?: any) => {
    let foundTask = taskDoc;
    if (!foundTask && evt?.taskId) {
      foundTask = myAssignedTasks.find(t => t.id === evt.taskId);
    }
    let foundSession = sessionDoc;
    if (!foundSession && evt?.sessionId) {
      foundSession = sessions.find(s => s.id === evt.sessionId);
    }

    const clockedStaffList: any[] = [];
    let totalTaskClockedMs = 0;
    let currentStaffClockedMs = 0;

    if (foundTask && sessions.length > 0) {
      const staffMap = new Map<string, { staffId: string; staffName: string; durationMs: number }>();
      sessions.forEach(s => {
        const sStaffId = s.userId || s.staffId || '';
        const sStaffName = s.userName || s.staffName || 'Tech';
        (s.jobs || []).forEach((j: any) => {
          if ((j.taskId && j.taskId === foundTask.id) || (j.id === foundTask.jobId && j.taskName === foundTask.title)) {
            const startMs = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
            const endMs = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : Date.now();
            const durMs = Math.max(0, endMs - startMs);
            
            const key = sStaffId || sStaffName;
            const existing = staffMap.get(key) || { staffId: sStaffId, staffName: sStaffName, durationMs: 0 };
            existing.durationMs += durMs;
            staffMap.set(key, existing);
          }
        });
      });

      const currentTargetName = (staffMember ? `${staffMember.firstName || staffMember.name || ''} ${staffMember.lastName || ''}` : '').trim().toLowerCase();
      const currentTargetId = staffMember?.id || effectiveUserUid;

      staffMap.forEach(item => {
        clockedStaffList.push(item);
        totalTaskClockedMs += item.durationMs;
        if (item.staffId === currentTargetId || item.staffName.toLowerCase() === currentTargetName) {
          currentStaffClockedMs += item.durationMs;
        }
      });
    }

    const rawBookTime = parseFloat(foundTask?.bookTime || evt?.bookTime || 0) || 0;
    const shareRatioPct = totalTaskClockedMs > 0 ? (currentStaffClockedMs / totalTaskClockedMs) * 100 : (clockedStaffList.length > 0 ? 0 : 100);
    const earnedCreditHours = (rawBookTime * shareRatioPct) / 100;

    setInspectorData({
      title,
      type,
      evt,
      taskDoc: foundTask,
      sessionDoc: foundSession,
      calculations: {
        currentStaffId: staffMember?.id || effectiveUserUid,
        currentStaffName: staffMember ? `${staffMember.firstName || staffMember.name || ''} ${staffMember.lastName || ''}`.trim() : 'Tech',
        assignedStaffIds: foundTask?.assignedStaffIds || [],
        completedByStaffId: foundTask?.completedByStaffId || foundTask?.completedBy || null,
        completedByStaffName: foundTask?.completedByStaffName || null,
        clockedStaffList,
        totalTaskClockedMs,
        currentStaffClockedMs,
        shareRatioPct,
        earnedCreditHours,
        bookTimeRaw: rawBookTime,
        payBasis: foundTask?.payBasis || evt?.payBasis || 'book_time',
        ...extraCalc
      },
      timestamp: new Date().toISOString()
    });
  };

  const myAssignedJobs = useMemo(() => {
    const jobIds = Array.from(new Set(myAssignedTasks.map(t => t.jobId)));
    return jobIds
      .map(id => allJobs.find(j => j.id === id))
      .filter((j): j is any => {
        if (!j) return false;

        // Check if the job is physically in a bay or parking spot
        const isInBayOrSpot = !!j.bayId || zones.some(z => z.currentJobId === j.id);

        // Allowed statuses: Open, Active, Almost Ready, Blocked, On Hold, Ready for QC, Ready for Customer, Completed
        const allowedStatuses = [
          'Open', 'Active', 'Almost Ready', 'Blocked', 'On Hold',
          'Ready for QC', 'Ready for Customer', 'Completed'
        ];
        const hasMatchingStatus = allowedStatuses.includes(j.status);

        return hasMatchingStatus || isInBayOrSpot;
      });
  }, [myAssignedTasks, allJobs, zones]);

  const jobTasks = useMemo(() => {
    if (!selectedJobId) return [];
    return myAssignedTasks.filter(t => t.jobId === selectedJobId);
  }, [selectedJobId, myAssignedTasks]);

  const targetStaffId = urlStaffId || (impersonatedStaff?.type === 'staff' ? impersonatedStaff.id : null);
  const effectiveUserId = targetStaffId || user?.uid;
  const effectiveUserUid = staffMember?.userId || (!targetStaffId ? user?.uid : '');

  const isOwnSession = effectiveUserUid === user?.uid;
  const hasAutoApprovePermission = isSuperAdmin || !!permissions['timeclock.no_review_required'];
  const canApprove = (hasAutoApprovePermission || !!permissions['timeclock.approve']) && (!isOwnSession || hasAutoApprovePermission);

  const saveJobsEdit = async (session: any, updatedJobs: any[], editReason: string) => {
    const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, session.id);

    const updates: any = {
      jobs: updatedJobs,
      jobIds: Array.from(new Set(updatedJobs.map((j: any) => j.id))),
      manuallyEdited: true,
      updatedAt: serverTimestamp()
    };

    if (canApprove) {
      updates.verificationStatus = 'verified';
      updates.approvedBy = user!.displayName || user!.email || 'Admin';
    } else {
      updates.verificationStatus = 'pending';
      updates.approvedBy = '';
    }

    await updateDoc(sessionRef, updates);

    if (!canApprove) {
      const q = query(
        collection(db, `businesses/${tenantId}/time_edit_requests`),
        where('sessionId', '==', session.id),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(q);

      const requestData = {
        sessionId: session.id,
        userId: session.userId || effectiveUserUid,
        userName: session.userName || staffMember?.name || user?.displayName || user?.email || 'Technician',
        note: editReason || 'Gap allocated or labor segment edited',
        status: 'pending',
        originalClockIn: session.clockIn.timestamp,
        originalClockOut: session.clockOut?.timestamp || null,
        proposedClockIn: session.clockIn.timestamp,
        proposedClockOut: session.clockOut?.timestamp || null,
        originalBreaks: session.breaks || [],
        proposedBreaks: session.breaks || [],
        originalJobs: session.jobs || [],
        proposedJobs: updatedJobs,
        updatedAt: serverTimestamp()
      };

      if (snap.empty) {
        await addDoc(collection(db, `businesses/${tenantId}/time_edit_requests`), {
          ...requestData,
          createdAt: serverTimestamp()
        });
      } else {
        const docRef = doc(db, `businesses/${tenantId}/time_edit_requests`, snap.docs[0].id);
        await updateDoc(docRef, requestData);
      }
    }
  };

  const handleAllocateGap = async () => {
    if (!allocatingGap || !selectedJobId || !selectedTaskId) return;

    try {
      const session = sessions.find(s => s.id === allocatingGap.sessionId);
      if (!session) return;

      const fullJob = allJobs.find(job => job.id === selectedJobId);
      const selectedTask = myAssignedTasks.find(t => t.id === selectedTaskId);
      if (!fullJob || !selectedTask) return;

      const jobs = [...(session.jobs || [])];
      
      const newSegment = {
        id: selectedJobId,
        name: fullJob.title || 'JOB',
        taskId: selectedTaskId,
        taskName: selectedTask.title || 'Labor',
        bookTime: selectedTask.bookTime || 0,
        payBasis: selectedTask.payBasis || 'book_time',
        start: new Date(allocatingGap.start),
        end: new Date(allocatingGap.end)
      };

      jobs.push(newSegment);

      const reason = `Allocated gap ${formatClockTime(allocatingGap.start)}-${formatClockTime(allocatingGap.end)} to task: ${selectedTask.title}`;

      await saveJobsEdit(session, jobs, reason);

      toast.success(canApprove ? "Gap allocated successfully" : "Gap allocation request submitted for approval");
      setAllocatingGap(null);
      setSelectedJobId('');
      setSelectedTaskId('');
    } catch (err) {
      console.error(err);
      toast.error("Failed to allocate gap.");
    }
  };

  const handleSaveSegmentEdit = async (
    startDateTimeStr: string,
    endDateTimeStr: string,
    noteStr: string
  ) => {
    if (!editingSegment) return;

    try {
      const session = sessions.find(s => s.id === editingSegment.sessionId);
      if (!session) return;

      const newStart = new Date(startDateTimeStr);
      const newEnd = new Date(endDateTimeStr || startDateTimeStr);

      const nowMs = Date.now();
      if (newStart.getTime() > nowMs + 60000) {
        toast.error("Start time cannot be set in the future.");
        return;
      }
      if (editingSegment.type !== 'shift_start' && editingSegment.type !== 'shift_end' && editingSegment.end && newEnd.getTime() > nowMs + 60000) {
        toast.error("Stop time cannot be set in the future.");
        return;
      }

      if (newStart.getTime() > newEnd.getTime() && editingSegment.type !== 'shift_start' && editingSegment.type !== 'shift_end') {
        toast.error("Stop time cannot be earlier than start time.");
        return;
      }

      // Enforce strict boundary checks for Shift Clock In and Shift Clock Out
      if (editingSegment.type === 'shift_start') {
        let earliestMs = Infinity;
        let earliestName = '';
        (session.jobs || []).forEach((j: any) => {
          const jStart = getMs(j.start);
          if (jStart < earliestMs) {
            earliestMs = jStart;
            earliestName = j.taskName || j.name || 'task';
          }
        });
        (session.breaks || []).forEach((b: any) => {
          const bStart = getMs(b.start);
          if (bStart < earliestMs) {
            earliestMs = bStart;
            earliestName = 'break';
          }
        });

        if (earliestMs !== Infinity && newStart.getTime() > earliestMs) {
          toast.error(`Shift Clock In cannot be set later than the first ${earliestName} (${formatClockTime(earliestMs)}).`);
          return;
        }
      }

      if (editingSegment.type === 'shift_end') {
        let latestMs = 0;
        let latestName = '';
        (session.jobs || []).forEach((j: any) => {
          const jEnd = j.end ? getMs(j.end) : currentTime;
          if (jEnd > latestMs) {
            latestMs = jEnd;
            latestName = j.taskName || j.name || 'task';
          }
        });
        (session.breaks || []).forEach((b: any) => {
          const bEnd = b.end ? getMs(b.end) : currentTime;
          if (bEnd > latestMs) {
            latestMs = bEnd;
            latestName = 'break';
          }
        });

        if (latestMs !== 0 && newStart.getTime() < latestMs) {
          toast.error(`Shift Clock Out cannot be set earlier than the last ${latestName} end (${formatClockTime(latestMs)}).`);
          return;
        }
      }

      // Enforce strict segment boundary checks for labor tasks and breaks
      if (editingSegment.type === 'labor' || editingSegment.type === 'break') {
        const origStartMs = editingSegment.start;

        // 0. Prevent setting start time earlier than Shift Clock In
        if (session.clockIn?.timestamp) {
          const shiftStartMs = getMs(session.clockIn.timestamp);
          if (newStart.getTime() < shiftStartMs) {
            toast.error(`Start time cannot be set earlier than Shift Clock In (${formatClockTime(shiftStartMs)}).`);
            return;
          }
        }

        // 0b. Prevent extending stop time past Shift Clock Out
        if (session.clockOut?.timestamp) {
          const shiftEndMs = getMs(session.clockOut.timestamp);
          if (newEnd.getTime() > shiftEndMs) {
            toast.error(`Stop time cannot extend past Shift Clock Out (${formatClockTime(shiftEndMs)}).`);
            return;
          }
        }

        // 1. Prevent extending stop time past next activity's start time
        let nextActivity: any = null;
        let nextActivityStartMs = Infinity;

        (session.jobs || []).forEach((j: any, idx: number) => {
          if (editingSegment.type === 'labor' && idx === editingSegment.jobIndex) return;
          const jStartMs = getMs(j.start);
          if (jStartMs >= origStartMs && jStartMs < nextActivityStartMs) {
            nextActivityStartMs = jStartMs;
            nextActivity = { name: j.taskName || j.name || 'task', start: jStartMs };
          }
        });

        (session.breaks || []).forEach((b: any, idx: number) => {
          if (editingSegment.type === 'break' && idx === editingSegment.breakIndex) return;
          const bStartMs = getMs(b.start);
          if (bStartMs >= origStartMs && bStartMs < nextActivityStartMs) {
            nextActivityStartMs = bStartMs;
            nextActivity = { name: 'break', start: bStartMs };
          }
        });

        if (newEnd.getTime() > nextActivityStartMs) {
          toast.error(`Stop time cannot extend past the start of ${nextActivity?.name || 'next activity'} (${formatClockTime(nextActivityStartMs)}).`);
          return;
        }

        // 2. Prevent setting start time earlier than previous activity's end time
        let prevActivity: any = null;
        let prevActivityEndMs = 0;

        (session.jobs || []).forEach((j: any, idx: number) => {
          if (editingSegment.type === 'labor' && idx === editingSegment.jobIndex) return;
          const jStartMs = getMs(j.start);
          const jEndMs = j.end ? getMs(j.end) : currentTime;
          if (jStartMs < origStartMs && jEndMs > prevActivityEndMs) {
            prevActivityEndMs = jEndMs;
            prevActivity = { name: j.taskName || j.name || 'task', end: jEndMs };
          }
        });

        (session.breaks || []).forEach((b: any, idx: number) => {
          if (editingSegment.type === 'break' && idx === editingSegment.breakIndex) return;
          const bStartMs = getMs(b.start);
          const bEndMs = b.end ? getMs(b.end) : currentTime;
          if (bStartMs < origStartMs && bEndMs > prevActivityEndMs) {
            prevActivityEndMs = bEndMs;
            prevActivity = { name: 'break', end: bEndMs };
          }
        });

        if (newStart.getTime() < prevActivityEndMs) {
          toast.error(`Start time cannot be set earlier than the end of ${prevActivity?.name || 'previous activity'} (${formatClockTime(prevActivityEndMs)}).`);
          return;
        }
      }

      let updatedClockIn = session.clockIn;
      let updatedClockOut = session.clockOut;
      let updatedJobs = [...(session.jobs || [])];
      let updatedBreaks = [...(session.breaks || [])];

      if (editingSegment.type === 'labor' && editingSegment.jobIndex !== undefined && editingSegment.jobIndex >= 0) {
        if (editingSegment.jobIndex < updatedJobs.length) {
          updatedJobs[editingSegment.jobIndex] = {
            ...updatedJobs[editingSegment.jobIndex],
            start: newStart,
            end: newEnd,
            note: noteStr.trim() || null
          };
        }
      } else if (editingSegment.type === 'shift_start') {
        updatedClockIn = { ...session.clockIn, timestamp: newStart };
      } else if (editingSegment.type === 'shift_end') {
        if (session.clockOut) {
          updatedClockOut = { ...session.clockOut, timestamp: newStart };
        }
      } else if (editingSegment.type === 'break' && editingSegment.breakIndex !== undefined && editingSegment.breakIndex >= 0) {
        if (editingSegment.breakIndex < updatedBreaks.length) {
          updatedBreaks[editingSegment.breakIndex] = {
            ...updatedBreaks[editingSegment.breakIndex],
            start: newStart,
            end: newEnd
          };
        }
      }

      const updates: any = {
        clockIn: updatedClockIn,
        jobs: updatedJobs,
        breaks: updatedBreaks,
        manuallyEdited: true,
        updatedAt: serverTimestamp()
      };
      if (updatedClockOut !== undefined) {
        updates.clockOut = updatedClockOut;
      }

      if (canApprove) {
        updates.verificationStatus = 'verified';
        updates.approvedBy = user!.displayName || user!.email || 'Admin';
      } else {
        updates.verificationStatus = 'pending';
        updates.approvedBy = '';
      }

      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, session.id);
      await updateDoc(sessionRef, updates);

      if (!canApprove) {
        const q = query(
          collection(db, `businesses/${tenantId}/time_edit_requests`),
          where('sessionId', '==', session.id),
          where('status', '==', 'pending')
        );
        const snap = await getDocs(q);

        // Detect if edited labor segment overlaps with other task segments
        let overlapDetected = false;
        if (editingSegment.type === 'labor' && editingSegment.jobIndex !== undefined) {
          const checkStart = newStart.getTime();
          const checkEnd = newEnd.getTime();
          updatedJobs.forEach((j: any, idx: number) => {
            if (idx === editingSegment.jobIndex) return;
            const jStart = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
            const jEnd = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : currentTime;

            if (Math.max(checkStart, jStart) < Math.min(checkEnd, jEnd)) {
              overlapDetected = true;
            }
          });
        }

        const baseNote = noteStr.trim() || `Edited ${editingSegment.title}`;
        const finalNote = overlapDetected ? `[OVERLAP DETECTED] ${baseNote}` : baseNote;

        const requestData = {
          sessionId: session.id,
          userId: session.userId || effectiveUserUid,
          userName: session.userName || staffMember?.name || user?.displayName || user?.email || 'Technician',
          note: finalNote,
          status: 'pending',
          originalClockIn: session.clockIn?.timestamp,
          originalClockOut: session.clockOut?.timestamp || null,
          proposedClockIn: updatedClockIn?.timestamp,
          proposedClockOut: updatedClockOut?.timestamp || null,
          originalBreaks: session.breaks || [],
          proposedBreaks: updatedBreaks,
          originalJobs: session.jobs || [],
          proposedJobs: updatedJobs,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        if (snap.empty) {
          await addDoc(collection(db, `businesses/${tenantId}/time_edit_requests`), requestData);
        } else {
          const docRef = doc(db, `businesses/${tenantId}/time_edit_requests`, snap.docs[0].id);
          await updateDoc(docRef, requestData);
        }
      }

      toast.success(canApprove ? "Time segment updated" : "Time change request submitted for review & verification");
      setEditingSegment(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save segment changes.");
    }
  };

  const handleDeleteSegment = async () => {
    if (!editingSegment) return;

    try {
      const session = sessions.find(s => s.id === editingSegment.sessionId);
      if (!session) return;

      if (editingSegment.type === 'labor' && editingSegment.jobIndex !== undefined) {
        const jobs = [...(session.jobs || [])];
        let removedSegmentName = '';
        if (editingSegment.jobIndex >= 0 && editingSegment.jobIndex < jobs.length) {
          removedSegmentName = jobs[editingSegment.jobIndex].taskName || jobs[editingSegment.jobIndex].name || 'Labor segment';
          jobs.splice(editingSegment.jobIndex, 1);
        }
        await saveJobsEdit(session, jobs, `Deleted labor segment: ${removedSegmentName}`);
        toast.success(canApprove ? "Labor segment deleted" : "Segment deletion request submitted for approval");
      } else if (editingSegment.type === 'break' && editingSegment.breakIndex !== undefined) {
        const breaks = [...(session.breaks || [])];
        if (editingSegment.breakIndex >= 0 && editingSegment.breakIndex < breaks.length) {
          breaks.splice(editingSegment.breakIndex, 1);
        }
        const updates: any = {
          breaks,
          manuallyEdited: true,
          updatedAt: serverTimestamp(),
          verificationStatus: canApprove ? 'verified' : 'pending'
        };
        await updateDoc(doc(db, `businesses/${tenantId}/time_sessions`, session.id), updates);
        if (!canApprove) {
          await addDoc(collection(db, `businesses/${tenantId}/time_edit_requests`), {
            sessionId: session.id,
            userId: session.userId || effectiveUserUid,
            userName: session.userName || staffMember?.name || user?.displayName || user?.email || 'Technician',
            note: `Deleted break entry`,
            status: 'pending',
            proposedBreaks: breaks,
            createdAt: serverTimestamp()
          });
        }
        toast.success(canApprove ? "Break deleted" : "Break deletion request submitted for verification");
      } else if (editingSegment.type === 'shift_start' || editingSegment.type === 'shift_end') {
        const sessionClockInMs = getMs(session.clockIn.timestamp);
        const sessionClockOutMs = session.clockOut?.timestamp ? getMs(session.clockOut.timestamp) : null;

        // Check if there is an adjacent session in the same day (within 10 minutes) that can be merged
        const adjacentSession = sessions.find(other => {
          if (other.id === session.id) return false;
          const otherClockInMs = getMs(other.clockIn.timestamp);
          const otherClockOutMs = other.clockOut?.timestamp ? getMs(other.clockOut.timestamp) : null;

          if (editingSegment.type === 'shift_end' && sessionClockOutMs) {
            return Math.abs(otherClockInMs - sessionClockOutMs) < 600000;
          }
          if (editingSegment.type === 'shift_start') {
            return otherClockOutMs && Math.abs(sessionClockInMs - otherClockOutMs) < 600000;
          }
          return false;
        });

        if (adjacentSession) {
          // Perform Smart Merge of split shift sessions into one continuous shift
          const primarySession = editingSegment.type === 'shift_end' ? session : adjacentSession;
          const secondarySession = editingSegment.type === 'shift_end' ? adjacentSession : session;

          const mergedJobs = [...(primarySession.jobs || []), ...(secondarySession.jobs || [])];
          const mergedBreaks = [...(primarySession.breaks || []), ...(secondarySession.breaks || [])];
          const mergedClockOut = secondarySession.clockOut || primarySession.clockOut || null;

          const updates: any = {
            jobs: mergedJobs,
            breaks: mergedBreaks,
            clockOut: mergedClockOut,
            manuallyEdited: true,
            updatedAt: serverTimestamp(),
            verificationStatus: canApprove ? 'verified' : 'pending'
          };

          const primaryRef = doc(db, `businesses/${tenantId}/time_sessions`, primarySession.id);
          await updateDoc(primaryRef, updates);

          const secondaryRef = doc(db, `businesses/${tenantId}/time_sessions`, secondarySession.id);
          await deleteDoc(secondaryRef);

          if (!canApprove) {
            await addDoc(collection(db, `businesses/${tenantId}/time_edit_requests`), {
              sessionId: primarySession.id,
              userId: primarySession.userId || effectiveUserUid,
              userName: primarySession.userName || staffMember?.name || user?.displayName || user?.email || 'Technician',
              note: `Merged accidental split shift (${formatClockTime(sessionClockInMs)})`,
              status: 'pending',
              action: 'merge_shifts',
              proposedClockIn: primarySession.clockIn?.timestamp,
              proposedClockOut: mergedClockOut?.timestamp || null,
              proposedJobs: mergedJobs,
              proposedBreaks: mergedBreaks,
              createdAt: serverTimestamp()
            });
          }

          toast.success(canApprove ? "Merged split shifts into a single continuous shift" : "Shift merge request submitted for verification");
        } else if (editingSegment.type === 'shift_end') {
          // If no adjacent session, removing shift_end removes clockOut timestamp (making shift open/active)
          const updates: any = {
            clockOut: deleteField(),
            manuallyEdited: true,
            updatedAt: serverTimestamp(),
            verificationStatus: canApprove ? 'verified' : 'pending'
          };
          await updateDoc(doc(db, `businesses/${tenantId}/time_sessions`, session.id), updates);

          if (!canApprove) {
            await addDoc(collection(db, `businesses/${tenantId}/time_edit_requests`), {
              sessionId: session.id,
              userId: session.userId || effectiveUserUid,
              userName: session.userName || staffMember?.name || user?.displayName || user?.email || 'Technician',
              note: `Removed shift clock-out time`,
              status: 'pending',
              action: 'remove_clockout',
              createdAt: serverTimestamp()
            });
          }

          toast.success(canApprove ? "Shift clock-out removed" : "Clock-out removal request submitted for verification");
        } else {
          // Delete entire shift session doc
          if (canApprove) {
            await deleteDoc(doc(db, `businesses/${tenantId}/time_sessions`, session.id));
            toast.success("Shift deleted");
          } else {
            await addDoc(collection(db, `businesses/${tenantId}/time_edit_requests`), {
              sessionId: session.id,
              userId: session.userId || effectiveUserUid,
              userName: session.userName || staffMember?.name || user?.displayName || user?.email || 'Technician',
              note: `Requested deletion of shift session`,
              status: 'pending',
              action: 'delete_shift',
              createdAt: serverTimestamp()
            });
            toast.success("Shift deletion request submitted for manager review");
          }
        }
      }
      setEditingSegment(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete segment.");
    }
  };

  const handleCreateMissingShift = async (shiftDateStr: string, clockInStr: string, clockOutStr: string, noteStr: string) => {
    if (!tenantId || !effectiveUserUid) return;

    try {
      const targetDate = new Date(shiftDateStr + 'T00:00:00');
      const clockInDate = parseLocalTimeInput(clockInStr, targetDate.getTime());
      const clockOutDate = parseLocalTimeInput(clockOutStr, targetDate.getTime());

      if (clockInDate.getTime() >= clockOutDate.getTime()) {
        toast.error("Clock Out time must be after Clock In time.");
        return;
      }

      const newSessionData = {
        userId: effectiveUserUid,
        userName: staffMember?.name || user?.displayName || user?.email || 'Technician',
        clockIn: {
          timestamp: clockInDate,
          location: 'Manual Entry'
        },
        clockOut: {
          timestamp: clockOutDate,
          location: 'Manual Entry'
        },
        jobs: [],
        breaks: [],
        verificationStatus: canApprove ? 'verified' : 'pending',
        manuallyCreated: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), newSessionData);

      if (!canApprove) {
        await addDoc(collection(db, `businesses/${tenantId}/time_edit_requests`), {
          sessionId: docRef.id,
          userId: effectiveUserUid,
          userName: staffMember?.name || user?.displayName || user?.email || 'Technician',
          note: noteStr.trim() || `Added missing shift for ${shiftDateStr}`,
          status: 'pending',
          action: 'add_shift',
          proposedClockIn: clockInDate,
          proposedClockOut: clockOutDate,
          createdAt: serverTimestamp()
        });
        toast.success("Missing shift logged and sent for manager verification.");
      } else {
        toast.success("Missing shift added successfully.");
      }

      setIsAddingMissingShift(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add missing shift.");
    }
  };

  const { clockOutOfJob, isProcessing: isJobClocking } = useJobClock(
    tenantId,
    activeSessionId,
    effectiveUserUid
  );

  // Keep live time ticking
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch business/tenant details
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(doc(db, `businesses/${tenantId}`), (snap) => {
      if (snap.exists()) {
        setBusiness(snap.id ? { id: snap.id, ...snap.data() } : snap.data());
      }
    });
    return unsub;
  }, [tenantId]);

  // Track staff record
  useEffect(() => {
    if (!tenantId) return;

    if (targetStaffId) {
      const docRef = doc(db, `businesses/${tenantId}/staff`, targetStaffId);
      const unsub = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const sd = docSnap.data();
          setStaffMember({ id: docSnap.id, ...sd, name: `${sd.firstName || ''} ${sd.lastName || ''}`.trim() });
        }
      });
      return unsub;
    } else if (user?.uid) {
      const q = query(collection(db, `businesses/${tenantId}/staff`), where('userId', '==', user.uid));
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const sd = snap.docs[0].data();
          setStaffMember({ id: snap.docs[0].id, ...sd, name: `${sd.firstName || ''} ${sd.lastName || ''}`.trim() });
        } else {
          const emailQuery = query(collection(db, `businesses/${tenantId}/staff`), where('email', '==', user?.email?.toLowerCase() || ''));
          getDocs(emailQuery).then((esnap) => {
            if (!esnap.empty) {
              const sd = esnap.docs[0].data();
              setStaffMember({ id: esnap.docs[0].id, ...sd, name: `${sd.firstName || ''} ${sd.lastName || ''}`.trim() });
            }
          });
        }
      });
      return unsub;
    }
  }, [tenantId, targetStaffId, user?.uid]);

  // Real-time listener for jobs
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/jobs`), orderBy('jobNumber', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setAllJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [tenantId]);

  // Real-time listener for zones
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/zones`));
    const unsub = onSnapshot(q, (snap) => {
      setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [tenantId]);

  // Real-time listener for user time sessions
  useEffect(() => {
    if (!tenantId || !effectiveUserUid) return;

    const searchIds = [effectiveUserUid];
    if (staffMember?.id) searchIds.push(staffMember.id);

    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('userId', 'in', searchIds),
      orderBy('clockIn.timestamp', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(q, (snap) => {
      setSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.warn("Time sessions index fallback:", err);
      const fallbackQ = query(collection(db, `businesses/${tenantId}/time_sessions`));
      onSnapshot(fallbackQ, (snap) => {
        const filtered = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as any))
          .filter(s => searchIds.includes(s.userId))
          .sort((a, b) => {
            const aTs = a.clockIn?.timestamp?.seconds ? a.clockIn.timestamp.seconds * 1000 : new Date(a.clockIn?.timestamp || 0).getTime();
            const bTs = b.clockIn?.timestamp?.seconds ? b.clockIn.timestamp.seconds * 1000 : new Date(b.clockIn?.timestamp || 0).getTime();
            return bTs - aTs;
          });
        setSessions(filtered);
      });
    });

    return unsub;
  }, [tenantId, effectiveUserUid, staffMember?.id]);

  // Real-time listener for user time edit requests
  useEffect(() => {
    if (!tenantId || !effectiveUserUid) return;
    const searchIds = [effectiveUserUid];
    if (staffMember?.id) searchIds.push(staffMember.id);

    const q = query(
      collection(db, `businesses/${tenantId}/time_edit_requests`),
      where('userId', 'in', searchIds)
    );

    const unsub = onSnapshot(q, (snap) => {
      setEditRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Time edit requests listener warning:", err);
    });

    return unsub;
  }, [tenantId, effectiveUserUid, staffMember?.id]);

  // Real-time listener for user assigned & completed tasks
  useEffect(() => {
    if (!tenantId || !effectiveUserUid) return;
    const searchIds = [effectiveUserUid];
    if (staffMember?.id) searchIds.push(staffMember.id);

    const qAssigned = query(
      collectionGroup(db, 'tasks'),
      where('tenantId', '==', tenantId),
      where('assignedStaffIds', 'array-contains-any', searchIds)
    );

    let assignedTasks: any[] = [];
    let completedTasks: any[] = [];
    let unsubCompleted: (() => void) | null = null;

    const handleUpdate = () => {
      const mergedMap = new Map();
      assignedTasks.forEach(t => mergedMap.set(t.id, t));
      completedTasks.forEach(t => mergedMap.set(t.id, t));
      setMyAssignedTasks(Array.from(mergedMap.values()));
    };

    const unsubAssigned = onSnapshot(qAssigned, (snap) => {
      assignedTasks = snap.docs
        .filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`))
        .map(doc => ({
          ...doc.data(),
          id: doc.id,
          jobId: doc.ref.path.split('/')[3]
        }));
      handleUpdate();
    }, (err) => {
      console.error("Failed to load assigned tasks:", err);
    });

    if (staffMember?.id) {
      const qCompleted = query(
        collectionGroup(db, 'tasks'),
        where('tenantId', '==', tenantId),
        where('completedByStaffId', '==', staffMember.id)
      );
      unsubCompleted = onSnapshot(qCompleted, (snap) => {
        completedTasks = snap.docs
          .filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`))
          .map(doc => ({
            ...doc.data(),
            id: doc.id,
            jobId: doc.ref.path.split('/')[3]
          }));
        handleUpdate();
      }, (err) => {
        console.error("Failed to load completed tasks:", err);
      });
    } else {
      handleUpdate();
    }
    
    return () => {
      unsubAssigned();
      if (unsubCompleted) unsubCompleted();
    };
  }, [tenantId, effectiveUserUid, staffMember?.id]);

  // Data re-attribution for Job #2445887470 task credit to Patrick Losey
  useEffect(() => {
    if (!tenantId) return;
    const reattributeJob2445887470 = async () => {
      try {
        const staffSnap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
        const patrickDoc = staffSnap.docs.find(dDoc => {
          const d = dDoc.data();
          const fullName = `${d.firstName || d.name || ''} ${d.lastName || ''}`.toLowerCase();
          return fullName.includes('patrick') || fullName.includes('losey');
        });

        const patrickId = patrickDoc ? patrickDoc.id : (staffMember?.id || effectiveUserUid);
        const patrickData = patrickDoc ? patrickDoc.data() : null;
        const patrickName = patrickData ? `${patrickData.firstName || patrickData.name || 'Patrick'} ${patrickData.lastName || 'Losey'}`.trim() : 'Patrick Losey';

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
            const assignedIds = Array.isArray(data.assignedStaffIds) ? data.assignedStaffIds : [];

            if (compId !== patrickId.toLowerCase() || !compName.includes('patrick') || assignedIds.some((id: string) => id !== patrickId)) {
              await updateDoc(d.ref, {
                completedByStaffId: patrickId,
                completedByStaffName: patrickName,
                completedBy: patrickName,
                assignedTo: patrickId,
                assignedTechId: patrickId,
                assignedTechName: patrickName,
                assignedStaffIds: [patrickId],
                assignedStaff: [{ id: patrickId, userId: patrickId, name: patrickName, displayName: patrickName }],
                status: data.status || 'QC'
              });
              console.log("Reassigned Job #2445887470 task completion & assignment completely to Patrick Losey:", patrickId, patrickName);
            }
          }
        });
      } catch (err) {
        console.warn("Reattribute job 2445887470 warning:", err);
      }
    };
    reattributeJob2445887470();
  }, [tenantId, effectiveUserUid, staffMember?.id]);

  // Calculate Pay Period Dates based on Business payroll setting
  const payrollDetails = useMemo(() => {
    const today = new Date();
    today.setDate(today.getDate() - (offsetWeeks * 7));
    
    const weekEndDay = business?.payrollWeekEndDay !== undefined ? Number(business.payrollWeekEndDay) : 0;
    const weekStart = getPayrollWeekStart(today, weekEndDay);
    
    return {
      weekStart,
      weekEnd: new Date(new Date(weekStart).setDate(weekStart.getDate() + 6))
    };
  }, [business, offsetWeeks]);

  // Active Session helper
  const activeSession = useMemo(() => {
    return sessions.find(s => s.status === 'active' || s.status === 'on_break');
  }, [sessions]);

  // Derived current Clock Status
  const clockStatus = useMemo(() => {
    if (!activeSession) return 'clocked_out';
    if (activeSession.status === 'on_break') {
      const activeBreak = activeSession.breaks?.find((b: any) => !b.end);
      if (activeBreak?.type === 'lunch') return 'on_lunch';
      return 'on_break';
    }
    return 'clocked_in';
  }, [activeSession]);

  // Active Clock-In timestamp helper
  const clockStartTime = useMemo(() => {
    if (!activeSession) return null;
    const activeBreak = activeSession.breaks?.find((b: any) => !b.end);
    if (activeBreak) {
      return activeBreak.start?.seconds ? activeBreak.start.seconds * 1000 : new Date(activeBreak.start).getTime();
    }
    return activeSession.clockIn?.timestamp?.seconds 
      ? activeSession.clockIn.timestamp.seconds * 1000 
      : new Date(activeSession.clockIn.timestamp).getTime();
  }, [activeSession]);

  // Calculate live worked time in milliseconds
  const getLiveWorkedMs = () => {
    if (!activeSession || clockStatus === 'clocked_out') return 0;
    
    const clockInVal = activeSession.clockIn?.timestamp;
    const startMs = clockInVal?.seconds ? clockInVal.seconds * 1000 : new Date(clockInVal).getTime();
    const totalElapsed = currentTime - startMs;
    
    // Sum completed breaks
    const completedBreaksMs = (activeSession.breaks || []).reduce((acc: number, b: any) => {
      if (!b.end) return acc;
      const bs = b.start?.seconds ? b.start.seconds * 1000 : new Date(b.start).getTime();
      const be = b.end?.seconds ? b.end.seconds * 1000 : new Date(b.end).getTime();
      return acc + (be - bs);
    }, 0);

    // If currently on break, subtract the current break elapsed time too
    let activeBreakMs = 0;
    const activeBreak = activeSession.breaks?.find((b: any) => !b.end);
    if (activeBreak) {
      const abs = activeBreak.start?.seconds ? activeBreak.start.seconds * 1000 : new Date(activeBreak.start).getTime();
      activeBreakMs = currentTime - abs;
    }

    return Math.max(0, totalElapsed - completedBreaksMs - activeBreakMs);
  };

  // Currently tracking task info
  const activeSegments = useMemo(() => {
    if (!activeSession?.jobs) return [];
    return activeSession.jobs.filter((j: any) => !j.end).map((j: any) => {
      const fullJob = allJobs.find(job => job.id === j.id);
      const zone = zones.find(z => z.id === fullJob?.bayId);
      return {
        ...j,
        jobNumber: fullJob?.jobNumber || '',
        jobTitle: fullJob?.title || j.name || 'Job',
        zoneName: zone?.name || fullJob?.zoneName || ''
      };
    });
  }, [activeSession, allJobs, zones]);

  // Filter sessions for the selected payroll period
  const filteredSessions = useMemo(() => {
    const { weekStart, weekEnd } = payrollDetails;
    return sessions.filter(session => {
      const sessionDate = session.clockIn?.timestamp?.toDate 
        ? session.clockIn.timestamp.toDate() 
        : new Date(session.clockIn?.timestamp);
      if (!sessionDate) return false;
      
      const t = sessionDate.getTime();
      const endOfDayEnd = new Date(weekEnd);
      endOfDayEnd.setHours(23, 59, 59, 999);
      
      return t >= weekStart.getTime() && t <= endOfDayEnd.getTime();
    });
  }, [sessions, payrollDetails]);

  // Group sessions by calendar date string (e.g. "7/22/2026")
  const groupedDays = useMemo(() => {
    const groups: { [dateStr: string]: { date: Date; sessions: any[] } } = {};
    
    filteredSessions.forEach(session => {
      const sessionDate = session.clockIn?.timestamp?.toDate 
        ? session.clockIn.timestamp.toDate() 
        : new Date(session.clockIn?.timestamp);
      if (!sessionDate) return;
      
      const dateStr = sessionDate.toLocaleDateString();
      if (!groups[dateStr]) {
        groups[dateStr] = {
          date: sessionDate,
          sessions: []
        };
      }
      groups[dateStr].sessions.push(session);
    });

    // Sort days descending
    return Object.values(groups).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filteredSessions]);

  // Process shift sessions logs into structured daily timelines
  const metricsData = useMemo(() => {
    let periodShiftMs = 0;
    let periodHourlyMs = 0;
    let periodBookMs = 0;
    let periodUnallocatedMs = 0;

    filteredSessions.forEach(session => {
      const totalMs = calculateSessionMs(session);
      const breakMs = calculateBreaksMs(session);
      const netShiftMs = totalMs - breakMs;
      
      const isManual = (session.clockIn?.location === 'Manual Entry' || session.clockOut?.location === 'Manual Entry') && !session.manuallyEdited;
      if (!isManual) {
        periodShiftMs += netShiftMs;
      }

      // Sum unallocated gaps
      const gaps = calculateSessionGaps(session, currentTime);
      gaps.forEach(gap => {
        periodUnallocatedMs += (gap.end - gap.start);
      });

      // Sum task clocked time (TIME ON TASK)
      (session.jobs || []).forEach((j: any) => {
        const isUnassigned = j.id === 'unassigned' || j.taskId === 'unassigned' || (j.name || '').toLowerCase().includes('unassigned');
        if (!isUnassigned) {
          const start = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
          const end = j.end 
            ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) 
            : (session.clockOut?.timestamp 
                ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate().getTime() : new Date(session.clockOut.timestamp).getTime())
                : currentTime);
          periodHourlyMs += Math.max(0, end - start);
        }
      });
    });

    // Sum book time task completions independent of shift session bounds!
    const { weekStart, weekEnd } = payrollDetails;
    const startOfWeekMs = weekStart.getTime();
    const endOfWeekMs = new Date(weekEnd).setHours(23, 59, 59, 999);

    myAssignedTasks.forEach((t: any) => {
      const isCompleted = ['completed', 'QC', 'QC Complete'].includes(t.status);
      if (!isCompleted) return;

      const compMs = getCompletedDateMs(t);
      if (!compMs || compMs < startOfWeekMs || compMs > endOfWeekMs) return;

      const staffId = staffMember?.id || staffMember?.userId || effectiveUserUid;
      const sName = (staffMember?.name || staffMember?.displayName || '').trim().toLowerCase();
      
      const isCompleter = (t.completedByStaffId && (t.completedByStaffId === staffId || t.completedByStaffId === staffMember?.userId)) ||
                        (t.completedByStaffName && t.completedByStaffName.trim().toLowerCase() === sName);

      const isAssigned = (Array.isArray(t.assignedStaffIds) && t.assignedStaffIds.includes(staffId)) ||
                        (Array.isArray(t.assignedStaff) && t.assignedStaff.some((st: any) => st.id === staffId || st.id === staffMember?.userId));

      if (isCompleter || isAssigned) {
        let totalTaskClockedMs = 0;
        let currentStaffTaskClockedMs = 0;

        if (Array.isArray(sessions)) {
          sessions.forEach((session: any) => {
            const isCurrentTech = session.userId === staffId || session.userId === staffMember?.userId || session.userId === staffMember?.id;
            (session.jobs || []).forEach((jTask: any) => {
              if (jTask.taskId === t.id || jTask.id === t.id) {
                const start = jTask.start?.toDate ? jTask.start.toDate().getTime() : new Date(jTask.start).getTime();
                let endMs = Date.now();
                if (jTask.end) {
                  endMs = jTask.end.toDate ? jTask.end.toDate().getTime() : new Date(jTask.end).getTime();
                } else if (session.status === 'completed' || session.clockOut?.timestamp) {
                  const clockOutVal = session.clockOut?.timestamp;
                  if (clockOutVal) {
                    endMs = clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime();
                  } else {
                    const updatedVal = session.updatedAt || session.createdAt;
                    endMs = updatedVal?.toDate ? updatedVal.toDate().getTime() : new Date(updatedVal || start).getTime();
                  }
                }
                const dur = Math.max(0, endMs - start);
                totalTaskClockedMs += dur;
                if (isCurrentTech) {
                  currentStaffTaskClockedMs += dur;
                }
              }
            });
          });
        }

        let shareRatio = 0;
        if (totalTaskClockedMs > 0) {
          shareRatio = currentStaffTaskClockedMs / totalTaskClockedMs;
        } else {
          if (isCompleter) {
            shareRatio = 1;
          } else if (isAssigned && !t.completedByStaffId && !t.completedByStaffName) {
            const assignedCount = (Array.isArray(t.assignedStaff) && t.assignedStaff.length > 0) ? t.assignedStaff.length : (t.assignedStaffIds?.length || 1);
            const splitPercent = t.splitPercent || (100 / assignedCount);
            shareRatio = splitPercent / 100;
          }
        }

        if (shareRatio > 0) {
          const taskBookHours = (parseFloat(t.bookTime) || 0) * shareRatio;
          periodBookMs += taskBookHours * 3600000;
        }
      }
    });

    return {
      totalShiftHours: periodShiftMs / 3600000,
      totalHourlyHours: periodHourlyMs / 3600000,
      totalBookHours: periodBookMs / 3600000,
      totalUnallocatedHours: periodUnallocatedMs / 3600000
    };
  }, [filteredSessions, myAssignedTasks, currentTime]);

  // Compile unified chronological timeline events for a session
  const buildSessionTimeline = (ses: any) => {
    const list: TimelineEvent[] = [];
    const sStartMs = getMs(ses.clockIn?.timestamp);
    const sEndMs = ses.clockOut?.timestamp ? getMs(ses.clockOut.timestamp) : currentTime;

    const getDistanceLabel = (locLat: any, locLng: any) => {
      if (locLat === undefined || locLng === undefined || locLat === null || locLng === null) return '';
      const siteLat = parseFloat(business?.siteLat);
      const siteLng = parseFloat(business?.siteLng);
      if (isNaN(siteLat) || isNaN(siteLng)) return '';

      const distMeters = calculateDistance(
        parseFloat(locLat), parseFloat(locLng),
        siteLat, siteLng
      );
      const miles = distMeters * 0.000621371;
      return ` (${miles.toFixed(1)} mi from shop)`;
    };


    // 1. Shift clock in
    const inCap = ses.clockIn?.device || 'device';
    const inLocLabel = ses.clockIn?.onSite ? 'At Shop' : 'Remote';
    const inDistSuffix = (!ses.clockIn?.onSite && ses.clockIn?.lat !== undefined) 
      ? getDistanceLabel(ses.clockIn.lat, ses.clockIn.lng) 
      : '';
    const inRemoteDetails = !ses.clockIn?.onSite 
      ? (ses.clockIn?.lat !== undefined ? `OFFSITE${inDistSuffix}` : "NO GPS DATA (PERMISSIONS DENIED OR ON PC)") 
      : (ses.clockIn?.type === 'ip' ? "NO GPS DATA (PERMISSIONS DENIED OR ON PC)" : '');

    list.push({
      id: `in-${ses.id}`,
      type: 'shift_start',
      timeStart: sStartMs,
      label: 'SHIFT STARTED',
      subLabel: `CLOCKED IN ${inLocLabel.toUpperCase()} VIA ${inCap.toUpperCase()}`,
      locationOnSite: ses.clockIn?.onSite,
      remoteReason: inRemoteDetails || undefined,
      sessionId: ses.id
    });

    // 2. Shift clock out
    if (ses.clockOut?.timestamp) {
      const outCap = ses.clockOut?.device || 'device';
      const outLocLabel = ses.clockOut?.onSite ? 'At Shop' : 'Remote';
      const outDistSuffix = (!ses.clockOut?.onSite && ses.clockOut?.lat !== undefined) 
        ? getDistanceLabel(ses.clockOut.lat, ses.clockOut.lng) 
        : '';
      const outRemoteDetails = !ses.clockOut?.onSite 
        ? (ses.clockOut?.lat !== undefined ? `OFFSITE${outDistSuffix}` : "NO GPS DATA (PERMISSIONS DENIED OR ON PC)") 
        : (ses.clockOut?.type === 'ip' ? "NO GPS DATA (PERMISSIONS DENIED OR ON PC)" : '');

      list.push({
        id: `out-${ses.id}`,
        type: 'shift_end',
        timeStart: getMs(ses.clockOut.timestamp),
        label: 'SHIFT ENDED',
        subLabel: `CLOCKED OUT ${outLocLabel.toUpperCase()} VIA ${outCap.toUpperCase()}`,
        locationOnSite: ses.clockOut?.onSite,
        remoteReason: outRemoteDetails || undefined,
        sessionId: ses.id
      });
    }

    // 3. Break intervals
    (ses.breaks || []).forEach((b: any, bIdx: number) => {
      const bStartMs = getMs(b.start);
      const bEndMs = b.end ? getMs(b.end) : (ses.status === 'on_break' ? currentTime : bStartMs);
      
      list.push({
        id: `break-${ses.id}-${bIdx}`,
        type: 'break',
        timeStart: bStartMs,
        timeEnd: bEndMs,
        label: 'ON BREAK',
        subLabel: (b.type || 'break').toUpperCase(),
        sessionId: ses.id,
        breakIndex: bIdx
      });
    });

    // 4. Job task clocked labor intervals
    (ses.jobs || []).forEach((j: any, jIdx: number) => {
      const jobStartMs = getMs(j.start);
      let jobEndMs = j.end ? getMs(j.end) : null;
      if (!jobEndMs) {
        if (ses.clockOut?.timestamp) {
          jobEndMs = getMs(ses.clockOut.timestamp);
        } else if (ses.status === 'active' && !j.end) {
          jobEndMs = currentTime;
        }
      }
      
      // GUARD: Ignore corrupted job segments that start after session clock out or end before start
      if (jobStartMs >= sEndMs || (jobEndMs && jobEndMs < jobStartMs)) {
        return;
      }
      
      const fullJob = allJobs.find(job => job.id === j.id);
      const zone = zones.find(z => z.id === fullJob?.bayId);
      const bayName = zone?.name || fullJob?.zoneName || '';
      
      list.push({
        id: `labor-${ses.id}-${jIdx}`,
        type: 'labor',
        timeStart: jobStartMs,
        timeEnd: jobEndMs || undefined,
        label: `JOB #${fullJob?.jobNumber || j.jobNumber || j.name || 'N/A'} - ${fullJob?.title?.toUpperCase() || j.name?.toUpperCase() || 'JOB'}`,
        subLabel: (j.taskName || 'GENERAL LABOR').toUpperCase(),
        jobId: j.id,
        taskId: j.taskId,
        taskName: j.taskName,
        payBasis: j.payBasis || 'book_time',
        bookTime: j.bookTime || 0,
        isSessionActive: ses.status === 'active',
        bayName: bayName || undefined,
        jobIndex: jIdx,
        segmentNote: j.note || '',
        sessionId: ses.id
      });
    });

    // 5. Unallocated time gaps
    const gaps = calculateSessionGaps(ses, currentTime);
    gaps.forEach((gap, gIdx) => {
      list.push({
        id: `gap-${ses.id}-${gIdx}`,
        type: 'gap',
        timeStart: gap.start,
        timeEnd: gap.end,
        label: 'UNALLOCATED TIME (NOT CLOCKED INTO JOB)',
        subLabel: 'UNALLOCATED TIME',
        sessionId: ses.id
      });
    });

    // Sort chronologically ascending
    return list.sort((a, b) => a.timeStart - b.timeStart);
  };

  // Attendance Clock-In handlers
  const handleClockIn = async () => {
    setIsClockProcessing(true);
    try {
      let actualName = user?.displayName || user?.email || 'Technician';
      if (staffMember) {
        actualName = `${staffMember.firstName || ''} ${staffMember.lastName || ''}`.trim() || actualName;
      }

      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const loc = await getCurrentLocation();
      if (isMobile && (!loc.lat || !loc.lng || loc.type !== 'gps')) {
        toast.error("GPS location is mandatory to clock in. Please enable GPS and allow location permissions.");
        setIsClockProcessing(false);
        return;
      }
      if (!isMobile && !loc.lat && !loc.lng) {
        toast.error("Could not resolve location. Please ensure you have an active network connection.");
        setIsClockProcessing(false);
        return;
      }
      let onSite = true;
      let isRemote = false;

      let settings: any = null;
      try {
        const settingsSnap = await getDoc(doc(db, 'businesses', tenantId));
        if (settingsSnap.exists()) settings = settingsSnap.data();
      } catch (err) {
        console.warn(err);
      }

      if (loc.lat !== null && loc.lng !== null) {
        if (settings?.siteLat && settings?.siteLng) {
          const dist = calculateDistance(
            loc.lat, loc.lng,
            parseFloat(settings.siteLat), parseFloat(settings.siteLng)
          );
          onSite = dist <= (settings.siteRadius || 500);
        }
        isRemote = !onSite;
      } else {
        isRemote = true;
        onSite = false;
      }

      if (isRemote && settings && !settings.allowOffsiteClockIn && !permissions['timeclock.offsite']) {
        toast.error("Clocking in off-site is not allowed for your account.");
        return;
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      
      const todaySession = sessions.find(session => {
        if (!session.clockIn?.timestamp) return false;
        const ts = session.clockIn.timestamp.seconds 
          ? session.clockIn.timestamp.seconds * 1000 
          : new Date(session.clockIn.timestamp).getTime();
        return ts >= startOfToday.getTime();
      });

      if (todaySession) {
        const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, todaySession.id);
        const prevClockOut = todaySession.clockOut?.timestamp;
        
        const gapBreak = prevClockOut ? {
          start: prevClockOut,
          end: new Date(),
          isPaid: false,
          type: 'normal',
          name: 'Clock Out Gap'
        } : null;

        const updatedBreaks = [...(todaySession.breaks || [])];
        if (gapBreak) {
          updatedBreaks.push(gapBreak);
        }

        await updateDoc(sessionRef, {
          status: 'active',
          clockOut: null,
          breaks: updatedBreaks,
          updatedAt: serverTimestamp()
        });

        await updateStaffLastLocation(tenantId, effectiveUserId, user?.email, loc, "Clocked In");
        
        if (!impersonatedStaff) {
          setClockStatus('clocked_in', Date.now(), todaySession.id);
        }
        toast.success("Clocked back in for today's shift");
      } else {
        const docRef = await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
          userId: effectiveUserId,
          userName: actualName,
          staffName: actualName,
          clockIn: {
            timestamp: new Date(),
            lat: loc.lat,
            lng: loc.lng,
            accuracy: loc.accuracy,
            onSite,
            device: isMobile ? 'mobile' : 'pc'
          },
          isRemote,
          status: 'active',
          breaks: [],
          createdAt: new Date()
        });

        await updateStaffLastLocation(tenantId, effectiveUserId, user?.email, loc, "Clocked In");
        if (!impersonatedStaff) {
          setClockStatus('clocked_in', Date.now(), docRef.id);
        }
        toast.success("Clocked in successfully");
      }
    } catch (e) {
      toast.error("Failed to clock in");
    } finally {
      setIsClockProcessing(false);
    }
  };

  const handleClockOut = async () => {
    const sesId = activeSession?.id || activeSessionId;
    if (!sesId) return;
    setIsClockProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, sesId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();

      const breaks = [...(sessionData?.breaks || [])];
      const activeBreak = breaks.find(b => !b.end);
      if (activeBreak) activeBreak.end = new Date();

      const jobsListCopy = [...(sessionData?.jobs || [])];
      const lastJob = jobsListCopy.length > 0 ? jobsListCopy[jobsListCopy.length - 1] : null;
      if (lastJob && !lastJob.end) lastJob.end = new Date();

      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const loc = await getCurrentLocation();
      if (isMobile && (!loc.lat || !loc.lng || loc.type !== 'gps')) {
        toast.error("GPS location is mandatory to clock out. Please enable GPS and allow location permissions.");
        setIsClockProcessing(false);
        return;
      }
      if (!isMobile && !loc.lat && !loc.lng) {
        toast.error("Could not resolve location. Please ensure you have an active network connection.");
        setIsClockProcessing(false);
        return;
      }
      let onSite = true;

      let settings: any = null;
      try {
        const settingsSnap = await getDoc(doc(db, 'businesses', tenantId));
        if (settingsSnap.exists()) settings = settingsSnap.data();
      } catch (err) {
        console.warn(err);
      }

      let allowedClockOut = true;
      if (loc.lat !== null && loc.lng !== null) {
        if (settings?.siteLat && settings?.siteLng) {
          const dist = calculateDistance(
            loc.lat, loc.lng,
            parseFloat(settings.siteLat), parseFloat(settings.siteLng)
          );
          onSite = dist <= (settings.siteRadius || 500);
          allowedClockOut = dist <= ((settings.siteRadius || 500) * 2);
        }
      } else {
        onSite = false;
        allowedClockOut = false;
      }

      if (!allowedClockOut && settings && !settings.allowOffsiteClockIn && !permissions['timeclock.offsite']) {
        toast.error("Clocking out off-site is not allowed for your account.");
        return;
      }

      await updateDoc(sessionRef, {
        clockOut: {
          timestamp: new Date(),
          lat: loc.lat,
          lng: loc.lng,
          accuracy: loc.accuracy,
          onSite,
          device: isMobile ? 'mobile' : 'pc'
        },
        status: 'completed',
        breaks,
        jobs: jobsListCopy,
        updatedAt: new Date()
      });

      await updateStaffLastLocation(tenantId, effectiveUserId, user?.email, loc, "Clocked Out");
      if (!impersonatedStaff) {
        resetClock();
      }
      toast.success("Clocked out successfully");
    } catch (e) {
      toast.error("Failed to clock out");
    } finally {
      setIsClockProcessing(false);
    }
  };

  const handleStartBreak = async (type: 'lunch' | 'normal') => {
    const sesId = activeSession?.id || activeSessionId;
    if (!sesId) return;
    setIsClockProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, sesId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();
      const breaks = [...(sessionData?.breaks || [])];
      const jobsListCopy = [...(sessionData?.jobs || [])];
      
      const lastJob = jobsListCopy.length > 0 ? jobsListCopy[jobsListCopy.length - 1] : null;
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
      
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const loc = await getCurrentLocation();
      if (isMobile && (!loc.lat || !loc.lng || loc.type !== 'gps')) {
        toast.error("GPS location is mandatory to start a break. Please enable GPS and allow location permissions.");
        setIsClockProcessing(false);
        return;
      }
      if (!isMobile && !loc.lat && !loc.lng) {
        toast.error("Could not resolve location. Please ensure you have an active network connection.");
        setIsClockProcessing(false);
        return;
      }

      breaks.push({
        type,
        start: new Date(),
        isPaid: type === 'lunch' ? false : true,
        suspendedJob,
        startLat: loc.lat,
        startLng: loc.lng,
        startDevice: isMobile ? 'mobile' : 'pc'
      });

      await updateDoc(sessionRef, {
        breaks,
        jobs: jobsListCopy,
        status: 'on_break',
        updatedAt: new Date()
      });

      await updateStaffLastLocation(tenantId, effectiveUserId, user?.email, loc, `Started Break (${type})`);
      if (!impersonatedStaff) {
        setClockStatus(type === 'lunch' ? 'on_lunch' : 'on_break', Date.now(), sesId);
      }
      toast.info(`Started ${type} break`);
    } catch (e) {
      toast.error("Failed to start break");
    } finally {
      setIsClockProcessing(false);
    }
  };

  const handleEndBreak = async () => {
    const sesId = activeSession?.id || activeSessionId;
    if (!sesId) return;
    setIsClockProcessing(true);
    try {
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const loc = await getCurrentLocation();
      if (isMobile && (!loc.lat || !loc.lng || loc.type !== 'gps')) {
        toast.error("GPS location is mandatory to end a break. Please enable GPS and allow location permissions.");
        setIsClockProcessing(false);
        return;
      }
      if (!isMobile && !loc.lat && !loc.lng) {
        toast.error("Could not resolve location. Please ensure you have an active network connection.");
        setIsClockProcessing(false);
        return;
      }

      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, sesId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();
      const breaks = [...(sessionData?.breaks || [])];
      const jobsListCopy = [...(sessionData?.jobs || [])];
      
      const activeBreak = breaks.find(b => !b.end);
      if (activeBreak) {
        activeBreak.end = new Date();
        activeBreak.endLat = loc.lat;
        activeBreak.endLng = loc.lng;
        activeBreak.endDevice = isMobile ? 'mobile' : 'pc';
        
        if (activeBreak.suspendedJob) {
          jobsListCopy.push({
            id: activeBreak.suspendedJob.id,
            name: activeBreak.suspendedJob.name,
            taskId: activeBreak.suspendedJob.taskId || null,
            taskName: activeBreak.suspendedJob.taskName || null,
            start: new Date()
          });
        }
      }

      await updateDoc(sessionRef, {
        breaks,
        jobs: jobsListCopy,
        status: 'active',
        updatedAt: new Date()
      });

      await updateStaffLastLocation(tenantId, effectiveUserId, user?.email, loc, "Ended Break");
      if (!impersonatedStaff) {
        setClockStatus('clocked_in', Date.now(), sesId);
      }
      toast.success("Break ended successfully");
    } catch (e) {
      toast.error("Failed to end break");
    } finally {
      setIsClockProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 bg-zinc-50 dark:bg-zinc-955 min-h-screen text-zinc-900 dark:text-zinc-100 font-sans max-w-2xl mx-auto">
      
      {/* Audit Banner */}
      {urlStaffId && (
        <div className="bg-indigo-600 text-white rounded-3xl p-4 flex items-center justify-between shadow-md border border-indigo-500/10">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-white/10 rounded-2xl">
              <AlertCircle className="w-5 h-5 text-white" />
            </span>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider">Audit Mode</h4>
              <p className="text-[11px] opacity-90 font-semibold mt-0.5">
                Viewing time card and metrics for {staffMember?.name?.toUpperCase() || 'loading...'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              const params = new URLSearchParams(window.location.search);
              params.delete('staffId');
              const newRelativePathQuery = window.location.pathname + '?' + params.toString();
              window.location.href = newRelativePathQuery;
            }}
            className="px-3.5 py-1.5 bg-white text-indigo-650 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-50 transition-all cursor-pointer shadow-sm font-bold"
          >
            Clear Audit
          </button>
        </div>
      )}

      {/* Impersonation / Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="p-2.5 bg-indigo-500/10 rounded-2xl text-indigo-500">
            <Clock className="w-6 h-6" />
          </span>
          <div>
            <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white uppercase">
              Time Clock <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 ml-1.5 uppercase tracking-wider">v3</span>
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold">
              {urlStaffId ? `AUDITING TIME SHEET: ${staffMember?.name?.toUpperCase()}` : impersonatedStaff ? `IMPERSONATING: ${staffMember?.name?.toUpperCase()}` : `WELCOME BACK, ${staffMember?.name?.toUpperCase() || user?.displayName?.toUpperCase() || user?.email?.toUpperCase()}`}
            </p>
          </div>
        </div>

        {/* Pay Period Navigator */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-white dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
          <button 
            onClick={() => setOffsetWeeks(prev => prev + 1)}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 dark:text-zinc-400 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex flex-col items-center px-3 font-semibold text-xs min-w-[170px]">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-555 uppercase tracking-widest leading-none font-bold">Pay Period</span>
            <span className="text-zinc-705 dark:text-zinc-300 mt-1">
              {payrollDetails.weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} - {payrollDetails.weekEnd.toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
          </div>

          <button 
            onClick={() => setOffsetWeeks(prev => Math.max(0, prev - 1))}
            disabled={offsetWeeks === 0}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 dark:text-zinc-400 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Shift Controls Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl p-5 shadow-md flex flex-col gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
        
        {/* Status & Timer Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/50 pb-4">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2.5 h-2.5 rounded-full animate-pulse",
              clockStatus === 'clocked_out' ? "bg-zinc-400" :
              clockStatus === 'clocked_in' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
            )} />
            <span className="text-xs font-black uppercase tracking-widest text-zinc-750 dark:text-zinc-305">
              {clockStatus.replace('_', ' ')}
            </span>
          </div>
          
          {/* Active Timer */}
          {clockStatus !== 'clocked_out' && clockStartTime && (
            <span className="text-xl font-mono font-black tabular-nums text-zinc-905 dark:text-white bg-zinc-55 dark:bg-zinc-950 px-3.5 py-1 rounded-2xl border border-zinc-200/40 dark:border-zinc-800">
              {clockStatus === 'clocked_in'
                ? formatTimer(getLiveWorkedMs())
                : formatTimer(Math.max(0, currentTime - clockStartTime))
              }
            </span>
          )}
        </div>

        {/* Attendance Buttons */}
        <div>
          {isClockProcessing ? (
            <div className="flex items-center justify-center gap-2.5 py-4 text-zinc-400 text-sm font-bold bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200/50 dark:border-zinc-855">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              <span>Syncing Status...</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {clockStatus === 'clocked_out' ? (
                <button
                  onClick={handleClockIn}
                  className="w-full py-4 bg-emerald-650 hover:bg-emerald-700 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg shadow-emerald-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" /> Clock In to Shift
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  {clockStatus === 'clocked_in' ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => handleStartBreak('lunch')}
                          className="py-3 bg-amber-500/10 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 rounded-2xl text-xs font-extrabold uppercase tracking-widest transition-all border border-amber-500/20 cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Pizza className="w-4 h-4" /> Start Lunch
                        </button>
                        <button
                          onClick={() => handleStartBreak('normal')}
                          className="py-3 bg-amber-500/10 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 rounded-2xl text-xs font-extrabold uppercase tracking-widest transition-all border border-amber-500/20 cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Coffee className="w-4 h-4" /> Take Break
                        </button>
                      </div>
                      
                      <button
                        onClick={handleClockOut}
                        className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-md shadow-rose-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Square className="w-4 h-4 fill-current" /> Clock Out of Shift
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleEndBreak}
                      className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-md shadow-amber-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Square className="w-4 h-4 fill-current" /> End Break
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={() => setIsAddingMissingShift(true)}
                className="w-full py-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-2xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-1"
              >
                <Plus className="w-4 h-4 text-emerald-500" /> Add Forgotten / Missing Shift
              </button>
            </div>
          )}
        </div>

        {/* Current Active Task allocation segment */}
        {activeSegments.length > 0 && (
          <div className="border-t border-zinc-150 dark:border-zinc-800/80 pt-4 mt-2">
            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block mb-2">Current Active Labor</span>
            {activeSegments.map((seg: any, idx: number) => {
              const segStart = seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime();
              const elapsedMs = currentTime - segStart;
              return (
                <div key={idx} className="flex items-center justify-between gap-3 p-3 bg-indigo-500/[0.02] border border-indigo-500/10 rounded-2xl shadow-sm">
                  <div className="min-w-0 flex-1">
                    {seg.id ? (
                      seg.taskId ? (
                        <a
                          href={`/business/${tenantId}/task/${seg.id}/${seg.taskId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] font-bold text-indigo-500 hover:text-indigo-650 dark:hover:text-indigo-400 underline decoration-dotted uppercase tracking-wider block"
                        >
                          JOB #{seg.jobNumber}
                        </a>
                      ) : (
                        <a
                          href={`/business/${tenantId}/jobs/${seg.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] font-bold text-indigo-500 hover:text-indigo-650 dark:hover:text-indigo-400 underline decoration-dotted uppercase tracking-wider block"
                        >
                          JOB #{seg.jobNumber}
                        </a>
                      )
                    ) : (
                      <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider block">
                        JOB #{seg.jobNumber || 'N/A'}
                      </span>
                    )}
                    {seg.id ? (
                      seg.taskId ? (
                        <a
                          href={`/business/${tenantId}/task/${seg.id}/${seg.taskId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-black text-zinc-800 dark:text-zinc-200 hover:text-indigo-650 dark:hover:text-indigo-400 underline decoration-dotted truncate leading-snug mt-0.5 block"
                        >
                          {seg.jobTitle}
                        </a>
                      ) : (
                        <a
                          href={`/business/${tenantId}/jobs/${seg.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-black text-zinc-800 dark:text-zinc-200 hover:text-indigo-650 dark:hover:text-indigo-400 underline decoration-dotted truncate leading-snug mt-0.5 block"
                        >
                          {seg.jobTitle}
                        </a>
                      )
                    ) : (
                      <h4 className="text-xs font-black text-zinc-800 dark:text-zinc-200 truncate leading-snug mt-0.5">{seg.jobTitle || 'Unassigned Labor'}</h4>
                    )}
                    {seg.zoneName && (
                      <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider block mt-0.5">
                        BAY: {seg.zoneName}
                      </span>
                    )}
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block mt-0.5 flex items-center gap-1">
                      <Wrench className="w-3 h-3 text-zinc-400" />
                      {seg.taskName || 'GENERAL LABOR'}
                    </span>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                    <span className="font-mono text-xs font-black text-indigo-650 dark:text-indigo-400 tabular-nums">{formatTimer(elapsedMs)}</span>
                    <button
                      onClick={() => clockOutOfJob(seg.id, seg.taskId || undefined)}
                      disabled={isJobClocking}
                      className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm active:scale-[0.98] transition-all"
                    >
                      Stop
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Period Stats summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-zinc-150 dark:border-zinc-805/50">
          <div 
            onClick={() => openInspector("Metric Summary: Clocked In Time", "metric_summary", metricsData, undefined, undefined, { metric: 'totalShiftHours', value: metricsData.totalShiftHours })}
            className="bg-zinc-50 dark:bg-zinc-955 p-2 rounded-2xl border border-zinc-200/40 dark:border-zinc-800/80 flex flex-col items-center text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            title="Click to inspect Clocked In Time (Total Shift Hours)"
          >
            <span className="text-[8px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest leading-none">CLOCKED IN TIME</span>
            <span className="text-xs font-mono font-black text-zinc-900 dark:text-white mt-1">
              {metricsData.totalShiftHours.toFixed(2)}h
            </span>
          </div>
          <div 
            onClick={() => openInspector("Metric Summary: Book Time Completed", "metric_summary", metricsData, undefined, undefined, { metric: 'totalBookHours', value: metricsData.totalBookHours })}
            className="bg-zinc-50 dark:bg-zinc-955 p-2 rounded-2xl border border-zinc-200/40 dark:border-zinc-800/80 flex flex-col items-center text-center bg-indigo-500/[0.02] border-indigo-500/10 cursor-pointer hover:bg-indigo-500/[0.06] transition-colors"
            title="Click to inspect Book Time Completed"
          >
            <span className="text-[8px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest leading-none">BOOK TIME COMPLETED</span>
            <span className="text-xs font-mono font-black text-indigo-650 dark:text-indigo-400 mt-1">
              {metricsData.totalBookHours.toFixed(2)}h
            </span>
          </div>
          <div 
            onClick={() => openInspector("Metric Summary: Time On Task", "metric_summary", metricsData, undefined, undefined, { metric: 'totalHourlyHours', value: metricsData.totalHourlyHours })}
            className="bg-zinc-50 dark:bg-zinc-955 p-2 rounded-2xl border border-zinc-200/40 dark:border-zinc-800/80 flex flex-col items-center text-center bg-violet-500/[0.02] border-violet-500/10 cursor-pointer hover:bg-violet-500/[0.06] transition-colors"
            title="Click to inspect Time On Task"
          >
            <span className="text-[8px] font-black text-violet-500 uppercase tracking-widest leading-none">TIME ON TASK</span>
            <span className="text-xs font-mono font-black text-violet-650 dark:text-violet-400 mt-1">
              {metricsData.totalHourlyHours.toFixed(2)}h
            </span>
          </div>
          <div 
            onClick={() => openInspector("Metric Summary: Unallocated Time", "metric_summary", metricsData, undefined, undefined, { metric: 'totalUnallocatedHours', value: metricsData.totalUnallocatedHours })}
            className="bg-zinc-50 dark:bg-zinc-955 p-2 rounded-2xl border border-zinc-200/40 dark:border-zinc-800/80 flex flex-col items-center text-center bg-amber-500/[0.02] border-amber-500/10 cursor-pointer hover:bg-amber-500/[0.06] transition-colors"
            title="Click to inspect Unallocated Time calculation"
          >
            <span className="text-[8px] font-black text-amber-600 dark:text-amber-450 uppercase tracking-widest leading-none">UNALLOCATED TIME</span>
            <span className="text-xs font-mono font-black text-amber-650 dark:text-amber-400 mt-1">
              {metricsData.totalUnallocatedHours.toFixed(2)}h
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable Shift Logs - Vertical Column */}
      <div className="flex flex-col gap-6">
        {groupedDays.length === 0 ? (
          <div className="text-center py-12 text-zinc-455 text-xs font-semibold italic bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl p-6 shadow-sm">
            No shift or task activity logged for this pay period.
          </div>
        ) : (
          groupedDays.map((group) => {
            const sessionDate = group.date;
            const sessionDateStr = sessionDate.toLocaleDateString();
            
            const formattedDate = sessionDate.toLocaleDateString([], {
              weekday: 'long',
              month: 'short',
              day: 'numeric'
            }).toUpperCase();

            // Sum net hours of all shifts in the day
            let dayShiftMs = 0;
            let dayHourlyMs = 0;
            let dayBookMs = 0;
            let dayUnallocatedMs = 0;
            let combinedTimeline: TimelineEvent[] = [];

            group.sessions.forEach(session => {
              const totalMs = calculateSessionMs(session);
              const breakMs = calculateBreaksMs(session);
              dayShiftMs += (totalMs - breakMs);

              // Sum clocked task durations (TIME ON TASK)
              (session.jobs || []).forEach((j: any) => {
                const isUnassigned = j.id === 'unassigned' || j.taskId === 'unassigned' || (j.name || '').toLowerCase().includes('unassigned');
                if (!isUnassigned) {
                  const start = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
                  const end = j.end 
                    ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) 
                    : (session.clockOut?.timestamp 
                        ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate().getTime() : new Date(session.clockOut.timestamp).getTime())
                        : currentTime);
                  dayHourlyMs += Math.max(0, end - start);
                }
              });

              // Sum daily unallocated gaps
              const gaps = calculateSessionGaps(session, currentTime);
              gaps.forEach(gap => {
                dayUnallocatedMs += (gap.end - gap.start);
              });

              // Add to combined timeline
              combinedTimeline.push(...buildSessionTimeline(session));
            });

             // Sum book labor completed on this calendar day and add to timeline once
             myAssignedTasks.forEach((t: any) => {
               const isCompleted = ['completed', 'QC', 'QC Complete'].includes(t.status);
               if (!isCompleted) return;

               const compMs = getCompletedDateMs(t);
               if (!compMs) return;

               const compDateStr = new Date(compMs).toLocaleDateString();
               if (compDateStr !== sessionDateStr) return;

               const fullJob = allJobs.find(job => job.id === t.jobId);
               const zone = zones.find(z => z.id === fullJob?.bayId);
               const bayName = zone?.name || fullJob?.zoneName || '';

                const staffId = staffMember?.id || staffMember?.userId || effectiveUserUid;
                const sName = (staffMember?.name || staffMember?.displayName || '').trim().toLowerCase();

                const isCompleter = (t.completedByStaffId && (t.completedByStaffId === staffId || t.completedByStaffId === staffMember?.userId)) ||
                                  (t.completedByStaffName && t.completedByStaffName.trim().toLowerCase() === sName);

                const isAssigned = (Array.isArray(t.assignedStaffIds) && t.assignedStaffIds.includes(staffId)) ||
                                  (Array.isArray(t.assignedStaff) && t.assignedStaff.some((st: any) => st.id === staffId || st.id === staffMember?.userId));

                 // Calculate actual logged labor milliseconds for current staff vs all staff on this task
                 let totalTaskClockedMs = 0;
                 let currentStaffTaskClockedMs = 0;

                 if (Array.isArray(sessions)) {
                   sessions.forEach((session: any) => {
                     const isCurrentTech = session.userId === staffId || session.userId === staffMember?.userId || session.userId === staffMember?.id;
                     (session.jobs || []).forEach((jTask: any) => {
                       if (jTask.taskId === t.id || jTask.id === t.id) {
                         const start = jTask.start?.toDate ? jTask.start.toDate().getTime() : new Date(jTask.start).getTime();
                         let endMs = Date.now();
                         if (jTask.end) {
                           endMs = jTask.end.toDate ? jTask.end.toDate().getTime() : new Date(jTask.end).getTime();
                         } else if (session.status === 'completed' || session.clockOut?.timestamp) {
                           const clockOutVal = session.clockOut?.timestamp;
                           if (clockOutVal) {
                             endMs = clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime();
                           } else {
                             const updatedVal = session.updatedAt || session.createdAt;
                             endMs = updatedVal?.toDate ? updatedVal.toDate().getTime() : new Date(updatedVal || start).getTime();
                           }
                         }
                         const dur = Math.max(0, endMs - start);
                         totalTaskClockedMs += dur;
                         if (isCurrentTech) {
                           currentStaffTaskClockedMs += dur;
                         }
                       }
                     });
                   });
                 }

                 let shareRatio = 0;
                 if (totalTaskClockedMs > 0) {
                   // Labor sessions exist for this task: credit is split strictly by actual clocked time!
                   // If current staff clocked 0 mins on this task, shareRatio is 0!
                   shareRatio = currentStaffTaskClockedMs / totalTaskClockedMs;
                 } else {
                   // No clocked labor sessions recorded for this task:
                   if (isCompleter) {
                     shareRatio = 1;
                   } else if (isAssigned && !t.completedByStaffId && !t.completedByStaffName) {
                     const assignedCount = (Array.isArray(t.assignedStaff) && t.assignedStaff.length > 0) ? t.assignedStaff.length : (t.assignedStaffIds?.length || 1);
                     const splitPercent = t.splitPercent || (100 / assignedCount);
                     shareRatio = splitPercent / 100;
                   }
                 }

                 if (shareRatio <= 0) return;

                 const taskBookHours = (parseFloat(t.bookTime) || 0) * shareRatio;

                dayBookMs += taskBookHours * 3600000;

               combinedTimeline.push({
                 id: `completed-task-${t.id}`,
                 type: 'task_completed',
                 timeStart: compMs,
                 label: `COMPLETED: JOB #${fullJob?.jobNumber || t.jobNumber || 'N/A'} - ${fullJob?.title?.toUpperCase() || t.jobTitle?.toUpperCase() || 'JOB'}`,
                 subLabel: (t.title || 'TASK').toUpperCase(),
                 jobId: t.jobId,
                 taskId: t.id,
                 taskName: t.title,
                 payBasis: t.payBasis || 'book_time',
                 bookTime: taskBookHours,
                 bayName: bayName || undefined,
                 taskNotes: t.description || t.notes || undefined
               });
             });

            // Sort combined timeline chronologically ascending
            combinedTimeline.sort((a, b) => a.timeStart - b.timeStart);
            
            const netHours = dayShiftMs / 3600000;
            const hasSplitShift = group.sessions.length > 1;

            return (
              <div key={sessionDateStr} className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-md overflow-hidden flex flex-col">
                
                {/* Shift Card Header (Gridpass Style) */}
                <div className="bg-zinc-50 dark:bg-zinc-955 px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-black tracking-wider text-zinc-700 dark:text-zinc-300">
                    <div className="flex items-center gap-2">
                      <span>{formattedDate}</span>
                      {hasSplitShift && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-450 font-black tracking-wider uppercase leading-none">
                          Split Shift
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-zinc-900 dark:text-white uppercase font-black">
                      SHIFT WORKED: {netHours.toFixed(2)}h
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold text-zinc-400 dark:text-zinc-550 uppercase leading-none mt-1">
                    <span>
                      TIME ON TASK: <span className="font-mono text-zinc-805 dark:text-zinc-300">{(dayHourlyMs / 3600000).toFixed(2)}h</span>
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-750">|</span>
                    <span>
                      BOOK TIME COMPLETED: <span className="font-mono text-zinc-805 dark:text-zinc-300">{(dayBookMs / 3600000).toFixed(2)}h</span>
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-750">|</span>
                    <span className="text-amber-600 dark:text-amber-450">
                      UNALLOCATED: <span className="font-mono text-amber-650 dark:text-amber-400">{(dayUnallocatedMs / 3600000).toFixed(2)}h</span>
                    </span>
                  </div>
                </div>

                {/* Timeline log items (Gridpass list style) */}
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
                  {combinedTimeline.map((evt) => {
                    let durationNode = null;
                    let actionNode = null;
                    let circleColor = "bg-zinc-300 text-zinc-650";
                    let iconNode = <Clock className="w-3.5 h-3.5" />;

                    if (evt.type === 'shift_start') {
                      circleColor = "bg-zinc-100 dark:bg-zinc-800 text-emerald-500 border border-emerald-500/25";
                      iconNode = <Check className="w-3.5 h-3.5" />;
                    } else if (evt.type === 'shift_end') {
                      circleColor = "bg-zinc-100 dark:bg-zinc-800 text-rose-500 border border-rose-500/25";
                      iconNode = <Square className="w-3.5 h-3.5 fill-current" />;
                    } else if (evt.type === 'break') {
                      circleColor = "bg-amber-500/10 text-amber-600 dark:text-amber-450 border border-amber-500/20";
                      iconNode = evt.breakType === 'lunch' ? <Pizza className="w-3.5 h-3.5" /> : <Coffee className="w-3.5 h-3.5" />;
                      
                      if (evt.timeEnd) {
                        const durationMs = evt.timeEnd - evt.timeStart;
                        durationNode = (
                          <span className="font-mono text-xs font-black text-amber-600 dark:text-amber-400">
                            {formatDurationText(durationMs)}
                          </span>
                        );
                      }
                    } else if (evt.type === 'labor') {
                      circleColor = "bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 border border-indigo-500/20";
                      iconNode = <Wrench className="w-3.5 h-3.5" />;
                      
                      const durationMs = evt.timeEnd ? (evt.timeEnd - evt.timeStart) : (currentTime - evt.timeStart);
                      durationNode = (
                        <span className="font-mono text-xs font-black text-indigo-650 dark:text-indigo-400">
                          {formatDecimalHours(durationMs)}
                        </span>
                      );
                      
                      if (!evt.timeEnd && evt.isSessionActive) {
                        actionNode = (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              clockOutOfJob(evt.jobId, evt.taskId || undefined);
                            }}
                            disabled={isJobClocking}
                            className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm active:scale-[0.98] transition-all"
                          >
                            Stop
                          </button>
                        );
                      }
                    } else if (evt.type === 'task_completed') {
                      circleColor = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border border-emerald-500/25";
                      iconNode = <Check className="w-3.5 h-3.5 font-black" />;
                      
                      durationNode = (
                        <div className="text-right shrink-0">
                          <span className="text-[8px] text-zinc-450 dark:text-zinc-500 uppercase font-black tracking-wider block leading-none">CREDIT</span>
                          <span className="font-mono text-xs font-black text-emerald-650 dark:text-emerald-400 block mt-1">
                            {evt.payBasis === 'hourly' ? 'HOURLY' : `+${evt.bookTime?.toFixed(2)}h`}
                          </span>
                        </div>
                      );
                    } else if (evt.type === 'gap') {
                      circleColor = "bg-amber-500/10 text-amber-600 dark:text-amber-450 border border-amber-500/25";
                      iconNode = <AlertCircle className="w-3.5 h-3.5" />;
                      
                      const durationMs = evt.timeEnd! - evt.timeStart;
                      durationNode = (
                        <div className="text-right shrink-0">
                          <span className="text-[8px] text-zinc-450 dark:text-zinc-500 uppercase font-black tracking-wider block leading-none">GAP</span>
                          <span className="font-mono text-xs font-black text-amber-650 dark:text-amber-400 block mt-1">
                            {formatDecimalHours(durationMs)}
                          </span>
                        </div>
                      );
                    }

                    if ((evt.type === 'shift_start' || evt.type === 'shift_end') && evt.locationOnSite !== undefined) {
                      actionNode = (
                        <span className={cn(
                          "text-[8px] px-1.5 py-0.5 border rounded font-black tracking-widest uppercase leading-none mt-0.5",
                          evt.locationOnSite 
                            ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-450 bg-emerald-500/[0.03]" 
                            : "border-amber-500/30 text-amber-600 dark:text-amber-450 bg-amber-500/[0.03]"
                        )}>
                          {evt.locationOnSite ? 'SHOP' : 'REMOTE'}
                        </span>
                      );
                    }

                    return (
                      <div 
                        key={evt.id} 
                        onClick={(e) => {
                          if (e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            openInspector(evt.label || evt.subLabel || 'Timeline Event', evt.type, evt);
                            return;
                          }
                          if (evt.type === 'labor') {
                            setEditingSegment({
                              sessionId: evt.sessionId!,
                              type: 'labor',
                              title: evt.taskName || evt.label,
                              subTitle: evt.label,
                              start: evt.timeStart,
                              end: evt.timeEnd,
                              jobIndex: evt.jobIndex,
                              jobId: evt.jobId,
                              taskId: evt.taskId,
                              note: evt.segmentNote
                            });
                          } else if (evt.type === 'shift_start') {
                            setEditingSegment({
                              sessionId: evt.sessionId!,
                              type: 'shift_start',
                              title: 'Shift Clock In',
                              subTitle: evt.subLabel,
                              start: evt.timeStart,
                              end: evt.timeStart
                            });
                          } else if (evt.type === 'shift_end') {
                            setEditingSegment({
                              sessionId: evt.sessionId!,
                              type: 'shift_end',
                              title: 'Shift Clock Out',
                              subTitle: evt.subLabel,
                              start: evt.timeStart,
                              end: evt.timeStart
                            });
                          } else if (evt.type === 'break') {
                            setEditingSegment({
                              sessionId: evt.sessionId!,
                              type: 'break',
                              title: `Break (${evt.subLabel || 'Rest'})`,
                              subTitle: evt.label,
                              start: evt.timeStart,
                              end: evt.timeEnd,
                              breakIndex: evt.breakIndex
                            });
                          } else if (evt.type === 'task_completed' || evt.type === 'gap') {
                            openInspector(evt.label || evt.subLabel || 'Task Event', evt.type, evt);
                          }
                        }}
                        className={cn(
                          "p-4 flex items-center justify-between gap-4 hover:bg-zinc-50/[0.3] dark:hover:bg-zinc-955/[0.1] transition-colors",
                          (evt.type === 'labor' || evt.type === 'shift_start' || evt.type === 'shift_end' || evt.type === 'break') && "cursor-pointer"
                        )}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          
                          {/* Visual Left Dot Icon (Gridpass timeline list integration) */}
                          <div className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                            circleColor
                          )}>
                            {iconNode}
                          </div>
 
                          <div className="flex flex-col gap-1 min-w-0">
                            {/* Time tag with Verification status badge */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 font-mono block leading-none">
                                {formatClockTime(evt.timeStart)}
                                {evt.timeEnd && ` - ${formatClockTime(evt.timeEnd)}`}
                                {!evt.timeEnd && (evt.type === 'labor' || evt.type === 'break') && " - ACTIVE NOW"}
                              </span>

                              {(() => {
                                if (!evt.sessionId) return null;
                                const session = sessions.find(s => s.id === evt.sessionId);
                                const pendingReq = editRequests.find(r => r.sessionId === evt.sessionId && r.status === 'pending');
                                const rejectedReq = editRequests.find(r => r.sessionId === evt.sessionId && r.status === 'rejected');
                                const approvedReq = editRequests.find(r => r.sessionId === evt.sessionId && r.status === 'approved');

                                const status = pendingReq ? 'pending' : (session?.verificationStatus || (rejectedReq ? 'rejected' : (approvedReq ? 'approved' : null)));

                                if (status === 'pending') {
                                  return (
                                    <span className="text-[8px] px-1.5 py-0.5 rounded font-black tracking-wider uppercase leading-none bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                      PENDING VERIFICATION
                                    </span>
                                  );
                                } else if (status === 'rejected') {
                                  return (
                                    <span className="text-[8px] px-1.5 py-0.5 rounded font-black tracking-wider uppercase leading-none bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25 flex items-center gap-1">
                                      <X className="w-2.5 h-2.5" />
                                      REJECTED
                                    </span>
                                  );
                                } else if (status === 'verified' || status === 'approved' || session?.approvedBy) {
                                  return (
                                    <span className="text-[8px] px-1.5 py-0.5 rounded font-black tracking-wider uppercase leading-none bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border border-emerald-500/25 flex items-center gap-1">
                                      <Check className="w-2.5 h-2.5" />
                                      VERIFIED
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
 
                            {/* Bold Capitalized Title */}
                            {evt.jobId ? (
                              evt.taskId ? (
                                <a
                                  href={`/business/${tenantId}/task/${evt.jobId}/${evt.taskId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-black text-zinc-900 dark:text-white hover:text-indigo-650 dark:hover:text-indigo-400 underline decoration-dotted transition-colors leading-tight uppercase truncate block"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {evt.label}
                                </a>
                              ) : (
                                <a
                                  href={`/business/${tenantId}/jobs/${evt.jobId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-black text-zinc-900 dark:text-white hover:text-indigo-650 dark:hover:text-indigo-400 underline decoration-dotted transition-colors leading-tight uppercase truncate block"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {evt.label}
                                </a>
                              )
                            ) : (
                              <h4 className="text-xs font-black text-zinc-900 dark:text-white leading-tight uppercase truncate">
                                {evt.label}
                              </h4>
                            )}
 
                            {evt.bayName && (
                              <span className="text-[9px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-wider block mt-0.5 leading-none">
                                BAY: {evt.bayName}
                              </span>
                            )}
 
                            {/* SubLabel & Pay basis tag */}
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-zinc-550 dark:text-zinc-500 font-bold uppercase leading-none">
                                  {evt.subLabel}
                                </span>
                                {evt.type === 'labor' && (
                                  <span className={cn(
                                    "text-[8px] px-1 py-0.5 rounded font-black tracking-widest uppercase leading-none",
                                    evt.payBasis === 'hourly' 
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-450" 
                                      : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                                  )}>
                                    {evt.payBasis === 'hourly' ? 'HOURLY TASK' : `BOOK TIME (${evt.bookTime || 0}h)`}
                                  </span>
                                )}
                                {evt.type === 'task_completed' && (
                                  <span className={cn(
                                    "text-[8px] px-1 py-0.5 rounded font-black tracking-widest uppercase leading-none",
                                    evt.payBasis === 'hourly' 
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-450" 
                                      : "bg-emerald-600/10 text-emerald-655 dark:text-emerald-400"
                                  )}>
                                    {evt.payBasis === 'hourly' ? 'HOURLY TASK COMPLETED' : `BOOK TIME COMPLETED`}
                                  </span>
                                )}
                              </div>
                              {evt.remoteReason && (
                                <span className="text-[9px] text-amber-500 dark:text-amber-400/80 font-bold uppercase tracking-wider block mt-0.5 leading-none">
                                  {evt.remoteReason}
                                </span>
                              )}
                              
                              {evt.type === 'task_completed' && evt.taskNotes && (
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-450 italic mt-1 leading-normal whitespace-pre-wrap max-w-xl">
                                  Notes: {evt.taskNotes}
                                </p>
                              )}
                              {evt.type === 'labor' && evt.segmentNote && (
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-450 italic mt-1 leading-normal whitespace-pre-wrap max-w-xl">
                                  Note: {evt.segmentNote}
                                </p>
                              )}
                            </div>
                            
                            {evt.type === 'gap' && (
                              <div className="mt-1">
                                {editingGapKey === `${evt.sessionId}_${evt.timeStart}` ? (
                                  <div className="mt-2 flex gap-2 w-full max-w-md items-center" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      defaultValue={sessions.find(s => s.id === evt.sessionId)?.gapNotes?.[`gap_${evt.timeStart}`] || ''}
                                      placeholder="Why was this time unallocated? (e.g. Cleaned bay, Waiting for parts)"
                                      className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                          const val = e.currentTarget.value.trim();
                                          await saveGapNote(evt.sessionId!, evt.timeStart, val);
                                          setEditingGapKey(null);
                                        } else if (e.key === 'Escape') {
                                          setEditingGapKey(null);
                                        }
                                      }}
                                      autoFocus
                                    />
                                    <button
                                      onClick={(e) => {
                                        const inputEl = e.currentTarget.previousElementSibling as HTMLInputElement;
                                        const val = inputEl.value.trim();
                                        saveGapNote(evt.sessionId!, evt.timeStart, val);
                                        setEditingGapKey(null);
                                      }}
                                      className="px-3 py-1.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm cursor-pointer shrink-0"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingGapKey(null)}
                                      className="px-2 py-1.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer shrink-0"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                    <span className="text-[10px] text-zinc-550 dark:text-zinc-405 italic font-semibold">
                                      {sessions.find(s => s.id === evt.sessionId)?.gapNotes?.[`gap_${evt.timeStart}`] 
                                        ? `Note: "${sessions.find(s => s.id === evt.sessionId).gapNotes[`gap_${evt.timeStart}`]}"`
                                        : "No note added."}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => setEditingGapKey(`${evt.sessionId}_${evt.timeStart}`)}
                                        className="text-[9px] font-bold text-indigo-550 hover:text-indigo-650 dark:hover:text-indigo-400 underline decoration-dotted uppercase tracking-wider cursor-pointer"
                                      >
                                        {sessions.find(s => s.id === evt.sessionId)?.gapNotes?.[`gap_${evt.timeStart}`] ? 'Edit Note' : 'Add Note'}
                                      </button>
                                      <span className="text-zinc-300 dark:text-zinc-700">|</span>
                                      <button
                                        onClick={() => setAllocatingGap({
                                          sessionId: evt.sessionId!,
                                          start: evt.timeStart,
                                          end: evt.timeEnd!
                                        })}
                                        className="text-[9px] font-bold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-350 underline decoration-dotted uppercase tracking-wider cursor-pointer"
                                      >
                                        Assign to Task
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
 
                          </div>
                        </div>

                        {/* Right side duration metrics / action buttons */}
                        <div className="shrink-0 text-right flex items-center gap-3">
                          {durationNode}
                          {actionNode}
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Official Attendance warning disclaimer */}
      <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-3xl p-4 flex items-start gap-3 shadow-sm">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">Attendance Audit Disclaimer</h4>
          <p className="text-[11px] text-zinc-650 dark:text-zinc-400 font-semibold mt-1">
            This timeline represents your shift entries and job durations as logged on this device. Official payroll times are verified and processed through QuickBooks Time.
          </p>
        </div>
      </div>

      {/* Gap Allocation Modal */}
      {allocatingGap && (() => {
        const formattedGapTime = `${formatClockTime(allocatingGap.start)} - ${formatClockTime(allocatingGap.end)}`;
        const durationMs = allocatingGap.end - allocatingGap.start;
        const durationMin = Math.round(durationMs / 60000);

        return (
          <div 
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-zinc-955/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setAllocatingGap(null)}
          >
            <div 
              className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/10 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Allocate Unallocated Time</h3>
                    <p className="text-[10px] font-extrabold text-zinc-400 dark:text-zinc-555 uppercase tracking-widest mt-0.5">
                      {formattedGapTime} ({durationMin} mins)
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setAllocatingGap(null)} 
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-450 dark:text-zinc-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Select Job</label>
                  <select
                    value={selectedJobId}
                    onChange={(e) => {
                      setSelectedJobId(e.target.value);
                      setSelectedTaskId('');
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">-- Choose an Assigned Job --</option>
                    {myAssignedJobs.map(job => (
                      <option key={job.id} value={job.id}>
                        JOB #{job.jobNumber || 'N/A'} - {job.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-550 uppercase tracking-wider">Select Task</label>
                  <select
                    value={selectedTaskId}
                    onChange={(e) => setSelectedTaskId(e.target.value)}
                    disabled={!selectedJobId}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-955 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    <option value="">-- Choose a Task --</option>
                    {jobTasks.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.payBasis === 'hourly' ? 'Hourly' : `${t.bookTime || 0}h Book`})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-955 flex items-center justify-end gap-2.5">
                <button
                  onClick={() => setAllocatingGap(null)}
                  className="px-4 py-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAllocateGap}
                  disabled={!selectedJobId || !selectedTaskId}
                  className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm disabled:opacity-50"
                >
                  Allocate Time
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Small Inline Segment / Event Edit Modal */}
      {editingSegment && (
        <SmallSegmentEditModalInline
          editingSegment={editingSegment}
          sessionClockIn={sessions.find(s => s.id === editingSegment.sessionId)?.clockIn?.timestamp}
          sessionClockOut={sessions.find(s => s.id === editingSegment.sessionId)?.clockOut?.timestamp}
          sessionJobs={sessions.find(s => s.id === editingSegment.sessionId)?.jobs}
          sessionBreaks={sessions.find(s => s.id === editingSegment.sessionId)?.breaks}
          onClose={() => setEditingSegment(null)}
          onSave={handleSaveSegmentEdit}
          onDelete={handleDeleteSegment}
        />
      )}

      {/* SUPER ADMIN DATA INSPECTOR MODAL */}
      {inspectorData && (
        <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-950 border border-zinc-700/80 rounded-3xl max-w-3xl w-full p-6 text-white shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Bug className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">SUPER ADMIN INSPECTOR</span>
                    <span className="text-[10px] font-bold text-zinc-400">Shift+Click Audit Mode</span>
                  </div>
                  <h3 className="text-base font-black text-white mt-0.5">{inspectorData.title}</h3>
                </div>
              </div>
              <button 
                onClick={() => setInspectorData(null)}
                className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Audit & Calculation Summary */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4">
              <div className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <Terminal className="w-4 h-4" /> Simple Math & Derivation Formula
              </div>

              {/* Math Derivation Highlight Box */}
              <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-indigo-950/60 border border-indigo-500/30 p-4 rounded-2xl flex flex-col gap-2 shadow-inner">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">
                  MATH FORMULA
                </span>
                <code className="text-xs font-mono font-bold text-amber-300 bg-black/40 px-3 py-1.5 rounded-xl border border-zinc-800 block">
                  Earned Credit = Task Book Time × (Tech Clocked Time / Total Task Clocked Time)
                </code>
                
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 mt-1">
                  <div>
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">Calculation Function Output</span>
                    <span className="text-xl font-mono font-black text-emerald-400 block mt-0.5">
                      +{(inspectorData.calculations?.earnedCreditHours || 0).toFixed(2)}h Book Credit
                    </span>
                  </div>
                  <div className="text-right font-mono text-xs text-indigo-300 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
                    {(inspectorData.calculations?.bookTimeRaw || 0).toFixed(2)}h × {(inspectorData.calculations?.shareRatioPct || 0).toFixed(1)}% = +{(inspectorData.calculations?.earnedCreditHours || 0).toFixed(2)}h
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-zinc-955 p-3 rounded-xl border border-zinc-800">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase">Target Staff Member</span>
                  <span className="font-mono font-bold text-zinc-200 block mt-0.5">{inspectorData.calculations?.currentStaffName || 'N/A'}</span>
                  <span className="text-[10px] font-mono text-zinc-500">ID: {inspectorData.calculations?.currentStaffId || 'N/A'}</span>
                </div>

                <div className="bg-zinc-955 p-3 rounded-xl border border-zinc-800">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase">Event Type & Pay Basis</span>
                  <span className="font-mono font-bold text-zinc-200 block mt-0.5">{inspectorData.type?.toUpperCase()} | {inspectorData.calculations?.payBasis?.toUpperCase() || 'N/A'}</span>
                  <span className="text-[10px] font-mono text-zinc-500">Book Time Raw: {inspectorData.calculations?.bookTimeRaw || 0}h</span>
                </div>
              </div>

              {/* Staff Clock-In & Split Table */}
              {inspectorData.calculations?.clockedStaffList && inspectorData.calculations.clockedStaffList.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    Clocked Staff Split Breakdown ({inspectorData.calculations.clockedStaffList.length} Techs Clocked In)
                  </span>
                  <div className="bg-zinc-955 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800 text-xs">
                    {inspectorData.calculations.clockedStaffList.map((st: any, idx: number) => {
                      const stDurMin = Math.round((st.durationMs || 0) / 60000);
                      const stPct = inspectorData.calculations.totalTaskClockedMs > 0 
                        ? ((st.durationMs || 0) / inspectorData.calculations.totalTaskClockedMs) * 100 
                        : 0;
                      const stCredit = ((inspectorData.calculations.bookTimeRaw || 0) * stPct) / 100;
                      const isCurrent = st.staffId === inspectorData.calculations?.currentStaffId || st.staffName?.toLowerCase() === inspectorData.calculations?.currentStaffName?.toLowerCase();

                      return (
                        <div key={idx} className={`p-2.5 flex items-center justify-between ${isCurrent ? 'bg-indigo-500/10' : ''}`}>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-200">{st.staffName}</span>
                            {isCurrent && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Target Tech</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 font-mono text-xs">
                            <span className="text-zinc-400">{stDurMin} min clocked ({stPct.toFixed(1)}%)</span>
                            <span className="font-bold text-emerald-400">+{stCredit.toFixed(2)}h Credit</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Simple Rule Summary */}
              <div className="bg-amber-500/[0.05] border border-amber-500/20 rounded-xl p-3 text-xs flex flex-col gap-1.5">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" /> Credit Attribution Rules (Simple Summary)
                </span>
                <ul className="list-disc list-inside text-zinc-300 space-y-1 text-[11px]">
                  <li><strong>Clocked Techs Rule:</strong> Credit is split proportionally based on actual clocked minutes.</li>
                  <li><strong>Non-Clocked Assigned Techs:</strong> Excluded (0 credit) if any tech clocked into the task.</li>
                  <li><strong>No Clock-Ins Fallback:</strong> If zero tech sessions were recorded, 100% credit goes to the staff member who marked it complete.</li>
                </ul>
              </div>
            </div>

            {/* Raw Event Object JSON */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Raw Inspection Object (JSON)</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(inspectorData, null, 2));
                    toast.success("Debug JSON copied to clipboard!");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-bold transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy JSON
                </button>
              </div>
              <pre className="bg-zinc-955 text-emerald-400 p-4 rounded-2xl border border-zinc-800 text-[11px] font-mono overflow-x-auto max-h-60 shadow-inner">
                {JSON.stringify(inspectorData, null, 2)}
              </pre>
            </div>

          </div>
        </div>
      )}

      {isAddingMissingShift && (
        <AddMissingShiftModalInline
          onClose={() => setIsAddingMissingShift(false)}
          onSave={handleCreateMissingShift}
        />
      )}

    </div>
  );
}

interface SmallSegmentEditModalProps {
  editingSegment: {
    sessionId: string;
    type: 'labor' | 'shift_start' | 'shift_end' | 'break';
    title: string;
    subTitle?: string;
    start: number;
    end?: number;
    jobIndex?: number;
    jobId?: string;
    taskId?: string;
    note?: string;
    breakIndex?: number;
  };
  sessionClockIn?: any;
  sessionClockOut?: any;
  sessionJobs?: any[];
  sessionBreaks?: any[];
  onClose: () => void;
  onSave: (startDateTimeStr: string, endDateTimeStr: string, note: string) => Promise<void>;
  onDelete?: () => void;
}

function SmallSegmentEditModalInline({ editingSegment, sessionClockIn, sessionClockOut, sessionJobs, sessionBreaks, onClose, onSave, onDelete }: SmallSegmentEditModalProps) {
  const toLocalDateTimeString = (ms: number) => {
    const d = new Date(ms);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hrs}:${mins}`;
  };

  const [startDateTime, setStartDateTime] = useState(toLocalDateTimeString(editingSegment.start));
  const [endDateTime, setEndDateTime] = useState(toLocalDateTimeString(editingSegment.end || editingSegment.start));
  const [note, setNote] = useState(editingSegment.note || '');
  const [isSaving, setIsSaving] = useState(false);

  const liveValidationWarning = useMemo(() => {
    if (!startDateTime) return "Please enter a valid date and time";
    const newStart = new Date(startDateTime);
    const newEnd = new Date(endDateTime || startDateTime);

    const nowMs = Date.now();
    if (newStart.getTime() > nowMs + 60000) {
      return "Start time cannot be set in the future";
    }
    if (editingSegment.type !== 'shift_start' && editingSegment.type !== 'shift_end' && editingSegment.end && newEnd.getTime() > nowMs + 60000) {
      return "Stop time cannot be set in the future";
    }

    if (editingSegment.type !== 'shift_start' && editingSegment.type !== 'shift_end' && newStart.getTime() > newEnd.getTime()) {
      return "Stop time cannot be earlier than start time";
    }

    if (editingSegment.type === 'shift_start') {
      let earliestMs = Infinity;
      let earliestName = '';
      if (sessionJobs) {
        sessionJobs.forEach((j: any) => {
          const jStart = getMs(j.start);
          if (jStart < earliestMs) {
            earliestMs = jStart;
            earliestName = j.taskName || j.name || 'task';
          }
        });
      }
      if (sessionBreaks) {
        sessionBreaks.forEach((b: any) => {
          const bStart = getMs(b.start);
          if (bStart < earliestMs) {
            earliestMs = bStart;
            earliestName = 'break';
          }
        });
      }

      if (earliestMs !== Infinity && newStart.getTime() > earliestMs) {
        return `Shift Clock In cannot be set later than first ${earliestName} (${formatClockTime(earliestMs)})`;
      }
    }

    if (editingSegment.type === 'shift_end') {
      let latestMs = 0;
      let latestName = '';
      if (sessionJobs) {
        sessionJobs.forEach((j: any) => {
          const jEnd = j.end ? getMs(j.end) : Date.now();
          if (jEnd > latestMs) {
            latestMs = jEnd;
            latestName = j.taskName || j.name || 'task';
          }
        });
      }
      if (sessionBreaks) {
        sessionBreaks.forEach((b: any) => {
          const bEnd = b.end ? getMs(b.end) : Date.now();
          if (bEnd > latestMs) {
            latestMs = bEnd;
            latestName = 'break';
          }
        });
      }

      if (latestMs !== 0 && newStart.getTime() < latestMs) {
        return `Shift Clock Out cannot be set earlier than last ${latestName} end (${formatClockTime(latestMs)})`;
      }
    }

    if (editingSegment.type === 'labor' || editingSegment.type === 'break') {
      const origStartMs = editingSegment.start;

      // Check against Shift Clock In
      if (sessionClockIn) {
        const shiftStartMs = getMs(sessionClockIn);
        if (newStart.getTime() < shiftStartMs) {
          return `Start time cannot be set earlier than Shift Clock In (${formatClockTime(shiftStartMs)})`;
        }
      }

      // Check against Shift Clock Out
      if (sessionClockOut) {
        const shiftEndMs = getMs(sessionClockOut);
        if (newEnd.getTime() > shiftEndMs) {
          return `Stop time cannot extend past Shift Clock Out (${formatClockTime(shiftEndMs)})`;
        }
      }

      // Check next activity start time
      let nextActivity: any = null;
      let nextActivityStartMs = Infinity;

      if (sessionJobs) {
        sessionJobs.forEach((j: any, idx: number) => {
          if (editingSegment.type === 'labor' && idx === editingSegment.jobIndex) return;
          const jStartMs = getMs(j.start);
          if (jStartMs >= origStartMs && jStartMs < nextActivityStartMs) {
            nextActivityStartMs = jStartMs;
            nextActivity = { name: j.taskName || j.name || 'task', start: jStartMs };
          }
        });
      }

      if (sessionBreaks) {
        sessionBreaks.forEach((b: any, idx: number) => {
          if (editingSegment.type === 'break' && idx === editingSegment.breakIndex) return;
          const bStartMs = getMs(b.start);
          if (bStartMs >= origStartMs && bStartMs < nextActivityStartMs) {
            nextActivityStartMs = bStartMs;
            nextActivity = { name: 'break', start: bStartMs };
          }
        });
      }

      if (newEnd.getTime() > nextActivityStartMs) {
        return `Stop time cannot extend past ${nextActivity?.name || 'next activity'} start (${formatClockTime(nextActivityStartMs)})`;
      }

      // Check previous activity end time
      let prevActivity: any = null;
      let prevActivityEndMs = 0;

      if (sessionJobs) {
        sessionJobs.forEach((j: any, idx: number) => {
          if (editingSegment.type === 'labor' && idx === editingSegment.jobIndex) return;
          const jStartMs = getMs(j.start);
          const jEndMs = j.end ? getMs(j.end) : Date.now();
          if (jStartMs < origStartMs && jEndMs > prevActivityEndMs) {
            prevActivityEndMs = jEndMs;
            prevActivity = { name: j.taskName || j.name || 'task', end: jEndMs };
          }
        });
      }

      if (sessionBreaks) {
        sessionBreaks.forEach((b: any, idx: number) => {
          if (editingSegment.type === 'break' && idx === editingSegment.breakIndex) return;
          const bStartMs = getMs(b.start);
          const bEndMs = b.end ? getMs(b.end) : Date.now();
          if (bStartMs < origStartMs && bEndMs > prevActivityEndMs) {
            prevActivityEndMs = bEndMs;
            prevActivity = { name: 'break', end: bEndMs };
          }
        });
      }

      if (newStart.getTime() < prevActivityEndMs) {
        return `Start time cannot be set earlier than ${prevActivity?.name || 'previous activity'} end (${formatClockTime(prevActivityEndMs)})`;
      }
    }

    return null;
  }, [startDateTime, endDateTime, editingSegment, sessionJobs, sessionBreaks, sessionClockIn, sessionClockOut]);

  const handleSave = async () => {
    if (liveValidationWarning) return;
    setIsSaving(true);
    try {
      await onSave(startDateTime, endDateTime, note);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-zinc-955/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 rounded-xl">
              <Clock className="w-4 h-4 text-indigo-650 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Edit {editingSegment.title}</h3>
              {editingSegment.subTitle && (
                <p className="text-[10px] font-extrabold text-zinc-400 dark:text-zinc-555 uppercase tracking-widest mt-0.5">
                  {editingSegment.subTitle}
                </p>
              )}
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-450 dark:text-zinc-500 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          {editingSegment.type === 'shift_end' ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Clock Out Date & Time</label>
              <input
                type="datetime-local"
                value={startDateTime}
                onChange={(e) => {
                  setStartDateTime(e.target.value);
                  setEndDateTime(e.target.value);
                }}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 [color-scheme:dark]"
              />
            </div>
          ) : editingSegment.type === 'shift_start' ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Clock In Date & Time</label>
              <input
                type="datetime-local"
                value={startDateTime}
                onChange={(e) => {
                  setStartDateTime(e.target.value);
                  setEndDateTime(e.target.value);
                }}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 [color-scheme:dark]"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Start Date & Time</label>
                <input
                  type="datetime-local"
                  value={startDateTime}
                  onChange={(e) => setStartDateTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 [color-scheme:dark]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Stop Date & Time</label>
                <input
                  type="datetime-local"
                  value={endDateTime}
                  onChange={(e) => setEndDateTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 [color-scheme:dark]"
                />
              </div>
            </div>
          )}

          {/* Live Validation Warning Notice */}
          {liveValidationWarning && (
            <div className="text-[11px] font-bold text-rose-500 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{liveValidationWarning}</span>
            </div>
          )}

          {/* Custom Note */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-555 uppercase tracking-wider">Notes / Reason for Edit</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Forgot to clock into task, or adjusted start time per work order"
              rows={2}
              className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-955 flex items-center justify-between gap-2.5">
          {onDelete ? (
            <button
              onClick={() => {
                if (confirm("Are you sure you want to delete this segment?")) {
                  onDelete();
                }
              }}
              className="px-3.5 py-2 hover:bg-rose-50 dark:hover:bg-rose-955/20 text-rose-500 rounded-xl text-xs font-black uppercase tracking-wider border border-rose-200 dark:border-rose-900 transition-colors"
            >
              Delete
            </button>
          ) : <div />}
          
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !!liveValidationWarning}
              className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit For Verification</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AddMissingShiftModalProps {
  onClose: () => void;
  onSave: (dateStr: string, timeIn: string, timeOut: string, note: string) => Promise<void>;
}

function AddMissingShiftModalInline({ onClose, onSave }: AddMissingShiftModalProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [dateStr, setDateStr] = useState(todayStr);
  const [timeIn, setTimeIn] = useState('08:00');
  const [timeOut, setTimeOut] = useState('17:00');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const liveWarning = useMemo(() => {
    if (!dateStr || !timeIn || !timeOut) return null;
    const targetDate = new Date(dateStr + 'T00:00:00');
    const start = parseLocalTimeInput(timeIn, targetDate.getTime());
    const end = parseLocalTimeInput(timeOut, targetDate.getTime());

    if (start.getTime() >= end.getTime()) {
      return "Clock Out time must be after Clock In time";
    }

    if (start.getTime() > Date.now() + 60000) {
      return "Clock In time cannot be set in the future";
    }

    return null;
  }, [dateStr, timeIn, timeOut]);

  const handleSave = async () => {
    if (liveWarning) return;
    setIsSaving(true);
    try {
      await onSave(dateStr, timeIn, timeOut, note);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-zinc-955/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-xl">
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Add Missing Shift</h3>
              <p className="text-[10px] font-extrabold text-zinc-400 dark:text-zinc-555 uppercase tracking-widest mt-0.5">
                Log Forgotten Shift Entry
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-450 dark:text-zinc-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Shift Date</label>
            <input
              type="date"
              value={dateStr}
              max={todayStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Clock In Time</label>
              <input
                type="time"
                value={timeIn}
                onChange={(e) => setTimeIn(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Clock Out Time</label>
              <input
                type="time"
                value={timeOut}
                onChange={(e) => setTimeOut(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-955 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {liveWarning && (
            <div className="text-[11px] font-bold text-rose-500 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{liveWarning}</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-555 uppercase tracking-wider">Reason / Notes</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Forgot to clock in on PC yesterday"
              rows={2}
              className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
            />
          </div>
        </div>

        <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-955 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !!liveWarning}
            className="px-4 py-2 bg-emerald-650 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Submit Missing Shift</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
