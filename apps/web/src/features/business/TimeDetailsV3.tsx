import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { db } from '../../lib/firebase/config';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, 
  getDoc, addDoc, serverTimestamp, getDocs, orderBy, limit, collectionGroup, deleteField
} from 'firebase/firestore';
import { 
  Clock, Play, Square, Coffee, Pizza, 
  ChevronLeft, ChevronRight,
  Wrench, RefreshCw, AlertCircle, Check, X
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

// Parse task completed date safely
const getCompletedDateMs = (t: any) => {
  const val = t.completedAt || t.qcCompletedAt || t.updatedAt;
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
  const [myAssignedTasks, setMyAssignedTasks] = useState<any[]>([]);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [isClockProcessing, setIsClockProcessing] = useState(false);
  const [editingGapKey, setEditingGapKey] = useState<string | null>(null);

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

  // Gap allocation & Labor editing states
  const [allocatingGap, setAllocatingGap] = useState<{ sessionId: string, start: number, end: number } | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  
  const [editingLabor, setEditingLabor] = useState<{
    sessionId: string;
    jobIndex: number;
    jobId: string;
    taskId?: string;
    taskName?: string;
    start: number;
    end?: number;
    note?: string;
  } | null>(null);

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
  const canApprove = (isSuperAdmin || !!permissions['timeclock.approve']) && !isOwnSession;

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

  const handleSaveLaborEdit = async (timeInStr: string, timeOutStr: string, noteStr: string) => {
    if (!editingLabor) return;

    try {
      const session = sessions.find(s => s.id === editingLabor.sessionId);
      if (!session) return;

      const sessionStartMs = getMs(session.clockIn?.timestamp);
      const sessionEndMs = session.clockOut?.timestamp ? getMs(session.clockOut.timestamp) : currentTime;

      const newStart = parseLocalTimeInput(timeInStr, editingLabor.start);
      const newEnd = parseLocalTimeInput(timeOutStr, editingLabor.end || Date.now());

      if (newStart.getTime() < sessionStartMs || newEnd.getTime() > sessionEndMs) {
        toast.error("Edited segment must fall within the shift boundaries.");
        return;
      }

      if (newStart.getTime() >= newEnd.getTime()) {
        toast.error("Time Out must be after Time In.");
        return;
      }

      const jobs = [...(session.jobs || [])];
      if (editingLabor.jobIndex >= 0 && editingLabor.jobIndex < jobs.length) {
        jobs[editingLabor.jobIndex] = {
          ...jobs[editingLabor.jobIndex],
          start: newStart,
          end: newEnd,
          note: noteStr.trim() || null
        };
      }
      
      const reason = `Edited labor segment: changed times to ${timeInStr}-${timeOutStr} with note: ${noteStr}`;

      await saveJobsEdit(session, jobs, reason);

      toast.success(canApprove ? "Labor segment updated" : "Segment update request submitted for approval");
      setEditingLabor(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save segment changes.");
    }
  };

  const handleDeleteLaborSegment = async () => {
    if (!editingLabor) return;

    try {
      const session = sessions.find(s => s.id === editingLabor.sessionId);
      if (!session) return;

      const jobs = [...(session.jobs || [])];
      let removedSegmentName = '';
      if (editingLabor.jobIndex >= 0 && editingLabor.jobIndex < jobs.length) {
        removedSegmentName = jobs[editingLabor.jobIndex].taskName || jobs[editingLabor.jobIndex].name || 'Labor segment';
        jobs.splice(editingLabor.jobIndex, 1);
      }

      const reason = `Deleted labor segment: ${removedSegmentName}`;

      await saveJobsEdit(session, jobs, reason);

      toast.success(canApprove ? "Labor segment deleted" : "Segment deletion request submitted for approval");
      setEditingLabor(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete labor segment.");
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

      // Sum hourly clocked time
      (session.jobs || []).forEach((j: any) => {
        if (j.payBasis === 'hourly') {
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

      if (t.payBasis !== 'hourly') {
        const assignedStaffCount = t.assignedStaffIds?.length || 1;
        const splitPercent = t.splitPercent || (100 / assignedStaffCount);
        const shareRatio = splitPercent / 100;
        const taskBookHours = (parseFloat(t.bookTime) || 0) * shareRatio;
        periodBookMs += taskBookHours * 3600000;
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
    const inCap = ses.clockIn?.captureMethod || 'device';
    const inLocLabel = ses.clockIn?.locationOnSite ? 'At Shop' : 'Remote';
    const inDistSuffix = (!ses.clockIn?.locationOnSite && ses.clockIn?.latitude !== undefined) 
      ? getDistanceLabel(ses.clockIn.latitude, ses.clockIn.longitude) 
      : '';
    const inRemoteDetails = !ses.clockIn?.locationOnSite 
      ? (ses.clockIn?.latitude !== undefined ? `OFFSITE${inDistSuffix}` : "NO GPS DATA (PERMISSIONS DENIED OR ON PC)") 
      : '';

    list.push({
      id: `in-${ses.id}`,
      type: 'shift_start',
      timeStart: sStartMs,
      label: 'SHIFT STARTED',
      subLabel: `CLOCKED IN ${inLocLabel.toUpperCase()} VIA ${inCap.toUpperCase()}`,
      locationOnSite: ses.clockIn?.locationOnSite,
      remoteReason: inRemoteDetails || undefined
    });

    // 2. Shift clock out
    if (ses.clockOut?.timestamp) {
      const outCap = ses.clockOut?.captureMethod || 'device';
      const outLocLabel = ses.clockOut?.locationOnSite ? 'At Shop' : 'Remote';
      const outDistSuffix = (!ses.clockOut?.locationOnSite && ses.clockOut?.latitude !== undefined) 
        ? getDistanceLabel(ses.clockOut.latitude, ses.clockOut.longitude) 
        : '';
      const outRemoteDetails = !ses.clockOut?.locationOnSite 
        ? (ses.clockOut?.latitude !== undefined ? `OFFSITE${outDistSuffix}` : "NO GPS DATA (PERMISSIONS DENIED OR ON PC)") 
        : '';

      list.push({
        id: `out-${ses.id}`,
        type: 'shift_end',
        timeStart: getMs(ses.clockOut.timestamp),
        label: 'SHIFT ENDED',
        subLabel: `CLOCKED OUT ${outLocLabel.toUpperCase()} VIA ${outCap.toUpperCase()}`,
        locationOnSite: ses.clockOut?.locationOnSite,
        remoteReason: outRemoteDetails || undefined
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

      const loc = await getCurrentLocation();
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
            onSite
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

      const loc = await getCurrentLocation();
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
          onSite
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
      
      const loc = await getCurrentLocation();

      breaks.push({
        type,
        start: new Date(),
        isPaid: type === 'lunch' ? false : true,
        suspendedJob,
        startLat: loc.lat,
        startLng: loc.lng
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
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, sesId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();
      const breaks = [...(sessionData?.breaks || [])];
      const jobsListCopy = [...(sessionData?.jobs || [])];
      
      const activeBreak = breaks.find(b => !b.end);
      if (activeBreak) {
        activeBreak.end = new Date();
        
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

      const loc = await getCurrentLocation();

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
                      className="w-full py-4 bg-indigo-650 hover:bg-indigo-700 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg shadow-indigo-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current animate-pulse" /> Resume Shift
                    </button>
                  )}
                </div>
              )}
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
                      <a
                        href={`/business/${tenantId}/jobs/${seg.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] font-bold text-indigo-500 hover:text-indigo-650 dark:hover:text-indigo-400 underline decoration-dotted uppercase tracking-wider block"
                      >
                        JOB #{seg.jobNumber}
                      </a>
                    ) : (
                      <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider block">
                        JOB #{seg.jobNumber}
                      </span>
                    )}
                    {seg.id ? (
                      <a
                        href={`/business/${tenantId}/jobs/${seg.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-black text-zinc-800 dark:text-zinc-200 hover:text-indigo-650 dark:hover:text-indigo-400 underline decoration-dotted truncate leading-snug mt-0.5 block"
                      >
                        {seg.jobTitle}
                      </a>
                    ) : (
                      <h4 className="text-xs font-black text-zinc-800 dark:text-zinc-200 truncate leading-snug mt-0.5">{seg.jobTitle}</h4>
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 border-t border-zinc-150 dark:border-zinc-805/50">
          <div className="bg-zinc-50 dark:bg-zinc-955 p-2 rounded-2xl border border-zinc-200/40 dark:border-zinc-800/80 flex flex-col items-center text-center">
            <span className="text-[8px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest leading-none">TIME CLOCK</span>
            <span className="text-xs font-mono font-black text-zinc-900 dark:text-white mt-1">
              {metricsData.totalShiftHours.toFixed(2)}h
            </span>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-955 p-2 rounded-2xl border border-zinc-200/40 dark:border-zinc-800/80 flex flex-col items-center text-center bg-emerald-500/[0.02] border-emerald-500/10">
            <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-450 uppercase tracking-widest leading-none">TOTAL LABOR</span>
            <span className="text-xs font-mono font-black text-emerald-655 dark:text-emerald-400 mt-1">
              {(metricsData.totalHourlyHours + metricsData.totalBookHours).toFixed(2)}h
            </span>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-955 p-2 rounded-2xl border border-zinc-200/40 dark:border-zinc-800/80 flex flex-col items-center text-center">
            <span className="text-[8px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest leading-none">BOOK LABOR</span>
            <span className="text-xs font-mono font-black text-indigo-650 dark:text-indigo-400 mt-1">
              {metricsData.totalBookHours.toFixed(2)}h
            </span>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-955 p-2 rounded-2xl border border-zinc-200/40 dark:border-zinc-800/80 flex flex-col items-center text-center bg-violet-500/[0.02] border-violet-500/10">
            <span className="text-[8px] font-black text-violet-500 uppercase tracking-widest leading-none">HOURLY LABOR</span>
            <span className="text-xs font-mono font-black text-violet-650 dark:text-violet-400 mt-1">
              {metricsData.totalHourlyHours.toFixed(2)}h
            </span>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-955 p-2 rounded-2xl border border-zinc-200/40 dark:border-zinc-800/80 flex flex-col items-center text-center bg-amber-500/[0.02] border-amber-500/10">
            <span className="text-[8px] font-black text-amber-600 dark:text-amber-450 uppercase tracking-widest leading-none">UNALLOCATED</span>
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

              // Hourly Labor: sum clocked task durations
              (session.jobs || []).forEach((j: any) => {
                if (j.payBasis === 'hourly') {
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

               const assignedStaffCount = t.assignedStaffIds?.length || 1;
               const splitPercent = t.splitPercent || (100 / assignedStaffCount);
               const shareRatio = splitPercent / 100;
               const taskBookHours = (parseFloat(t.bookTime) || 0) * shareRatio;

               if (t.payBasis !== 'hourly') {
                 dayBookMs += taskBookHours * 3600000;
               }

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
                      HOURLY WORKED: <span className="font-mono text-zinc-805 dark:text-zinc-300">{(dayHourlyMs / 3600000).toFixed(2)}h</span>
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-750">|</span>
                    <span>
                      BOOK WORKED: <span className="font-mono text-zinc-805 dark:text-zinc-300">{(dayBookMs / 3600000).toFixed(2)}h</span>
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
                        onClick={() => {
                          if (evt.type === 'labor') {
                            setEditingLabor({
                              sessionId: evt.sessionId!,
                              jobIndex: evt.jobIndex!,
                              jobId: evt.jobId!,
                              taskId: evt.taskId,
                              taskName: evt.taskName,
                              start: evt.timeStart,
                              end: evt.timeEnd,
                              note: evt.segmentNote
                            });
                          }
                        }}
                        className={cn(
                          "p-4 flex items-center justify-between gap-4 hover:bg-zinc-50/[0.3] dark:hover:bg-zinc-955/[0.1] transition-colors",
                          evt.type === 'labor' && "cursor-pointer"
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
                            {/* Red highlighted time tag */}
                            <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 font-mono block leading-none">
                              {formatClockTime(evt.timeStart)}
                              {evt.timeEnd && ` - ${formatClockTime(evt.timeEnd)}`}
                              {!evt.timeEnd && (evt.type === 'labor' || evt.type === 'break') && " - ACTIVE NOW"}
                            </span>
 
                            {/* Bold Capitalized Title */}
                            {evt.jobId ? (
                              <a
                                href={`/business/${tenantId}/jobs/${evt.jobId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-black text-zinc-900 dark:text-white hover:text-indigo-650 dark:hover:text-indigo-400 underline decoration-dotted transition-colors leading-tight uppercase truncate block"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {evt.label}
                              </a>
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

      {/* Edit Labor Segment Modal */}
      {editingLabor && (() => {
        return (
          <LaborSegmentEditModalInline
            editingLabor={editingLabor}
            onClose={() => setEditingLabor(null)}
            onSave={handleSaveLaborEdit}
            onDelete={handleDeleteLaborSegment}
          />
        );
      })()}

    </div>
  );
}

interface LaborSegmentEditModalInlineProps {
  editingLabor: {
    sessionId: string;
    jobIndex: number;
    jobId: string;
    taskId?: string;
    taskName?: string;
    start: number;
    end?: number;
    note?: string;
  };
  onClose: () => void;
  onSave: (timeIn: string, timeOut: string, note: string) => void;
  onDelete: () => void;
}

function LaborSegmentEditModalInline({ editingLabor, onClose, onSave, onDelete }: LaborSegmentEditModalInlineProps) {
  const toLocalTimeString24h = (ms: number) => {
    const d = new Date(ms);
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  };

  const [timeIn, setTimeIn] = useState(toLocalTimeString24h(editingLabor.start));
  const [timeOut, setTimeOut] = useState(toLocalTimeString24h(editingLabor.end || Date.now()));
  const [note, setNote] = useState(editingLabor.note || '');

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
              <Wrench className="w-4 h-4 text-indigo-650 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Edit Labor Segment</h3>
              <p className="text-[10px] font-extrabold text-zinc-400 dark:text-zinc-555 uppercase tracking-widest mt-0.5">
                {editingLabor.taskName || 'GENERAL LABOR'}
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

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Time In</label>
              <input
                type="time"
                value={timeIn}
                onChange={(e) => setTimeIn(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Time Out</label>
              <input
                type="time"
                value={timeOut}
                onChange={(e) => setTimeOut(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-955 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-550 uppercase tracking-wider">Custom Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Spent additional time diagnosing speaker wiring harness issue"
              rows={3}
              className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-955 flex items-center justify-between gap-2.5">
          <button
            onClick={() => {
              if (confirm("Are you sure you want to delete this segment completely?")) {
                onDelete();
              }
            }}
            className="px-4 py-2 hover:bg-rose-50 dark:hover:bg-rose-955/20 text-rose-500 rounded-xl text-xs font-black uppercase tracking-wider border border-rose-200 dark:border-rose-900 transition-colors"
          >
            Delete
          </button>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(timeIn, timeOut, note)}
              className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
