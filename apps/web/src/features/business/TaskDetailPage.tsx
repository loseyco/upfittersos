import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, updateDoc, addDoc, setDoc, getDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db, storage, auth } from '../../lib/firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  ArrowLeft, Clock, Timer, CheckCircle2, XCircle,
  Wrench, AlertTriangle, MessageSquare, Users,
  Play, Square, ShieldAlert, X, Camera, Trash2,
  Loader2, ImagePlus, Edit3, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth/store';
import { assignQCStaffToTask } from '../../lib/auth/qcAssignment';
import { useJobClock } from '../timeclock/useJobClock';
import { PartsRequestModal } from './PartsRequestModal';
import { StaffLink } from './StaffPerformance';
import { TimeAllocationModal } from './TimeAllocationModal';
import { GeneralClockInWarningModal } from './GeneralClockInWarningModal';

const isGeneralTask = (taskOrTitle?: any) => {
  if (!taskOrTitle) return false;
  if (typeof taskOrTitle === 'object') {
    const t = (taskOrTitle.title || '').toLowerCase().trim();
    const g = (taskOrTitle.taskGroup || '').toLowerCase().trim();
    return (t === 'general' || t === 'general labor') && g === 'general';
  }
  const t = taskOrTitle.toLowerCase().trim();
  return t === 'general' || t === 'general labor';
};

export function TaskDetailPage({ 
  tenantId, 
  setDynamicTitle 
}: { 
  tenantId: string; 
  setDynamicTitle: (title: string | null) => void; 
}) {
  const { '*': splat } = useParams();
  const pathParts = (splat || '').split('/').filter(Boolean);
  // URL: /business/:tenantId/task/:jobId/:taskId
  const jobId = pathParts[1];
  const taskId = pathParts[2];
  
  const navigate = useNavigate();
  const { user, permissions, isSuperAdmin, impersonatedStaff } = useAuthStore();
  const effectiveUserId = impersonatedStaff?.id || user?.uid;
  
  const canClockOthers = false;
  const canManageTasks = isSuperAdmin || permissions['tasks.manage'] === true;
  const canManageTime = isSuperAdmin || permissions['timeclock.manage'] === true;
  
  const [staffMember, setStaffMember] = useState<any>(null);
  const [allStaff, setAllStaff] = useState<any[]>([]);
  const impersonatedStaffDoc = impersonatedStaff?.id ? allStaff.find(s => s.id === impersonatedStaff.id) : null;
  const effectiveUserUid = impersonatedStaffDoc?.userId || staffMember?.userId || impersonatedStaff?.id || user?.uid || '';
  
  // Track technician staff member record
  useEffect(() => {
    if (!tenantId || !effectiveUserId) return;

    if (impersonatedStaff && impersonatedStaff.type === 'staff') {
      const docRef = doc(db, `businesses/${tenantId}/staff`, impersonatedStaff.id);
      const unsub = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setStaffMember({ 
            id: docSnap.id, 
            ...data,
            name: `${data.firstName || ''} ${data.lastName || ''}`.trim()
          });
        } else {
          setStaffMember(null);
        }
      });
      return () => unsub();
    } else {
      const q = query(
        collection(db, `businesses/${tenantId}/staff`),
        where('userId', '==', effectiveUserId)
      );
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setStaffMember({ 
            id: snap.docs[0].id, 
            ...data,
            name: `${data.firstName || ''} ${data.lastName || ''}`.trim()
          });
        } else {
          setStaffMember(null);
        }
      });
      return () => unsub();
    }
  }, [tenantId, effectiveUserId, impersonatedStaff]);

  // Track all staff members for clock-others mapping and UID resolution
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setAllStaff(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          name: `${data.firstName || ''} ${data.lastName || ''}`.trim()
        };
      }));
    });
    return () => unsub();
  }, [tenantId]);

  const { clockIntoJob, clockOutOfJob, isProcessing: isClockingIn } = useJobClock(tenantId);
  
  const [job, setJob] = useState<any>(null);
  const [task, setTask] = useState<any>(null);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [activeTasks, setActiveTasks] = useState<Array<{ jobId: string, taskId: string | null }>>([]);
  const [now, setNow] = useState(Date.now());
  
  const [parts, setParts] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  
  const [isPartRequestOpen, setIsPartRequestOpen] = useState(false);
  const [selectedPartForEdit, setSelectedPartForEdit] = useState<any>(null);
  const [newBlockerMsg, setNewBlockerMsg] = useState('');
  const [isAddingBlocker, setIsAddingBlocker] = useState(false);

  // Task Notes & Documentation States
  const [newNoteText, setNewNoteText] = useState('');
  const [noteImages, setNoteImages] = useState<Array<{ file: File; preview: string }>>([]);
  const [isUploadingNote, setIsUploadingNote] = useState(false);
  const [selectedLightboxImage, setSelectedLightboxImage] = useState<string | null>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [tempDescription, setTempDescription] = useState('');
  const [pendingCompletion, setPendingCompletion] = useState<{
    currentStatus: string;
    action?: 'pass' | 'fail';
  } | null>(null);
  const [generalClockInWarning, setGeneralClockInWarning] = useState<{
    generalTaskId: string;
    generalTaskTitle: string;
    isClockingOther: boolean;
    resolvedStaffName?: string;
    targetUid: string;
    assignedTasks: any[];
  } | null>(null);
  const [isCheckingTasks, setIsCheckingTasks] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Job
  useEffect(() => {
    if (!jobId || !tenantId) return;
    const unsub = onSnapshot(doc(db, `businesses/${tenantId}/jobs`, jobId), (snap) => {
      if (snap.exists()) {
        setJob({ id: snap.id, ...snap.data() });
      } else {
        toast.error('Job not found');
        navigate(`/business/${tenantId}/jobs`);
      }
    }, (err) => {
      console.error("Job listener error:", err);
    });
    return () => unsub();
  }, [jobId, tenantId]);

  // Fetch Task
  useEffect(() => {
    if (!jobId || !taskId || !tenantId) return;
    const unsub = onSnapshot(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), (snap) => {
      if (snap.exists()) {
        setTask({ id: snap.id, ...snap.data() });
      } else {
        toast.error('Task not found');
        navigate(`/business/${tenantId}/job/${jobId}`);
      }
    }, (err) => {
      console.error("Task listener error:", err);
    });
    return () => unsub();
  }, [jobId, taskId, tenantId]);

  // Set Dynamic Page Title
  useEffect(() => {
    if (!task) return;
    const taskTitlePart = task.title ? `Task: ${task.title}` : 'Task';
    
    let jobTitlePart = '';
    if (job) {
      const jobNumPart = job.jobNumber ? `#${job.jobNumber}` : '';
      const customerPart = job.customerName || '';
      const titlePart = job.title || '';
      jobTitlePart = [jobNumPart, customerPart, titlePart].filter(Boolean).join(' - ');
    }
    
    const pageTitle = [taskTitlePart, jobTitlePart].filter(Boolean).join(' - ');
    if (pageTitle) {
      setDynamicTitle(pageTitle);
    }
  }, [job, task, setDynamicTitle]);

  // Fetch Time Logs (Sessions)
  useEffect(() => {
    if (!jobId || !tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('jobIds', 'array-contains', jobId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      logs.sort((a: any, b: any) => {
        const getTs = (item: any) => {
          const val = item.clockIn?.timestamp;
          if (val?.seconds) return val.seconds * 1000;
          return new Date(val || 0).getTime();
        };
        return getTs(b) - getTs(a);
      });
      setTimeLogs(logs);
    }, (err) => {
      console.error("Time logs listener error:", err);
    });
    return () => unsub();
  }, [jobId, tenantId]);

  const isUserClockedIntoTask = (userId: string, targetTaskId: string, staffName?: string) => {
    const staffRec = allStaff.find(s => s.id === userId || s.userId === userId);
    const searchIds = [userId];
    if (staffRec?.id && !searchIds.includes(staffRec.id)) searchIds.push(staffRec.id);
    if (staffRec?.userId && !searchIds.includes(staffRec.userId)) searchIds.push(staffRec.userId);

    return timeLogs.some(session => {
      const isSessionActive = session.status === 'active' || session.status === 'on_break';
      if (!isSessionActive) return false;

      const matchesUid = searchIds.includes(session.userId);
      const sessionName = (session.userName || session.staffName || '').toLowerCase().trim();
      const targetName = (staffName || '').toLowerCase().trim();
      const matchesName = targetName && sessionName && (sessionName === targetName);
      
      return (matchesUid || matchesName) && 
        (session.jobs || []).some((j: any) => !j.end && j.id === jobId && j.taskId === targetTaskId);
    });
  };

  const handleClockOther = async (targetUid: string, targetName: string, targetTaskId: string, taskTitle: string, action: 'in' | 'out') => {
    try {
      const staffRec = allStaff.find(s => s.id === targetUid || s.userId === targetUid);
      const searchIds = [targetUid];
      if (staffRec?.id && !searchIds.includes(staffRec.id)) searchIds.push(staffRec.id);
      if (staffRec?.userId && !searchIds.includes(staffRec.userId)) searchIds.push(staffRec.userId);

      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('status', 'in', ['active', 'on_break'])
      );
      const snap = await getDocs(q);
      const activeSession = snap.empty ? null : snap.docs.map(d => ({ id: d.id, ...d.data() as any })).find(session => {
        const matchesUid = searchIds.includes(session.userId);
        const sessionName = (session.userName || session.staffName || '').toLowerCase().trim();
        const targetLower = (targetName || '').toLowerCase().trim();
        const matchesName = targetLower && sessionName && (sessionName === targetLower);
        return matchesUid || matchesName;
      }) || null;

      if (action === 'in') {
        let bookTime = 0;
        try {
          const taskSnap = await getDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, targetTaskId));
          if (taskSnap.exists()) {
            bookTime = parseFloat(taskSnap.data().bookTime) || 0;
          }
        } catch (err) {
          console.warn('Could not fetch task bookTime', err);
        }

        const sessionUserId = staffRec?.userId || targetUid;

        if (activeSession) {
          const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
          const jobs = [...(activeSession.jobs || [])];
          
          const isAlreadyClockedIn = jobs.some((j: any) => !j.end && j.id === jobId && j.taskId === targetTaskId);
          if (isAlreadyClockedIn) {
            toast.info(`${targetName} is already clocked into this task.`);
            return;
          }

          jobs.push({
            id: jobId,
            name: job.title,
            taskId: targetTaskId || null,
            taskName: taskTitle || null,
            bookTime,
            start: new Date(),
            clockedByUid: user?.uid,
            clockedByName: user?.displayName || user?.email || 'Manager'
          });

          await updateDoc(sessionRef, {
            jobs,
            jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
            updatedAt: serverTimestamp()
          });

          await logActivity(
            'status_changed', 
            `Manager ${user?.displayName || user?.email} clocked ${targetName} into task: ${taskTitle}`,
            { targetUid, targetName, taskId: targetTaskId, taskTitle }
          );

          toast.success(`Clocked ${targetName} into ${taskTitle}`);
        } else {
          await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
            userId: sessionUserId,
            userName: targetName,
            clockIn: {
              timestamp: serverTimestamp(),
              location: 'Shop Floor (Auto)'
            },
            status: 'active',
            tenantId,
            jobs: [
              {
                id: jobId,
                name: job.title,
                taskId: targetTaskId || null,
                taskName: taskTitle || null,
                bookTime,
                start: new Date(),
                clockedByUid: user?.uid,
                clockedByName: user?.displayName || user?.email || 'Manager'
              }
            ],
            jobIds: [jobId],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          await logActivity(
            'status_changed', 
            `Manager ${user?.displayName || user?.email} clocked ${targetName} in for the day and into task: ${taskTitle}`,
            { targetUid, targetName, taskId: targetTaskId, taskTitle }
          );

          toast.success(`Clocked ${targetName} in for the day and into ${taskTitle}`);
        }
      } else {
        if (!activeSession) {
          toast.error(`${targetName} has no active clock session.`);
          return;
        }

        const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
        const jobs = [...(activeSession.jobs || [])];
        let closedCount = 0;

        jobs.forEach((j: any) => {
          if (!j.end && j.id === jobId && j.taskId === targetTaskId) {
            j.end = new Date();
            j.clockedOutByUid = user?.uid;
            j.clockedOutByName = user?.displayName || user?.email || 'Manager';
            closedCount++;
          }
        });

        if (closedCount > 0) {
          await updateDoc(sessionRef, {
            jobs,
            jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
            updatedAt: serverTimestamp()
          });

          await logActivity(
            'status_changed', 
            `Manager ${user?.displayName || user?.email} clocked ${targetName} out of task: ${taskTitle}`,
            { targetUid, targetName, taskId: targetTaskId, taskTitle }
          );

          toast.success(`Clocked ${targetName} out of ${taskTitle}`);
        } else {
          toast.info(`${targetName} was not clocked into this task.`);
        }
      }
    } catch (err) {
      console.error('Error clocking other staff:', err);
      toast.error('Failed to update staff clock status.');
    }
  };

  const [editingSegment, setEditingSegment] = useState<any>(null);
  const [editStartStr, setEditStartStr] = useState('');
  const [editEndStr, setEditEndStr] = useState('');

  const toDatetimeLocal = (ms: number | null) => {
    if (!ms) return '';
    const date = new Date(ms);
    const tzoffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzoffset).toISOString().slice(0, 16);
  };

  const handleSaveTimeAdjustment = async () => {
    if (!editingSegment) return;
    try {
      const newStart = new Date(editStartStr);
      const newEnd = editEndStr ? new Date(editEndStr) : null;

      if (isNaN(newStart.getTime())) {
        toast.error('Invalid start time.');
        return;
      }
      if (newEnd && isNaN(newEnd.getTime())) {
        toast.error('Invalid end time.');
        return;
      }
      if (newEnd && newEnd < newStart) {
        toast.error('End time cannot be before start time.');
        return;
      }

      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, editingSegment.sessionId);
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) {
        toast.error('Session not found.');
        return;
      }

      const sessionData = snap.data();
      const jobs = [...(sessionData.jobs || [])];

      const targetStartMs = new Date(editingSegment.rawSeg.start?.toDate ? editingSegment.rawSeg.start.toDate() : editingSegment.rawSeg.start).getTime();
      const segIndex = jobs.findIndex((j: any) => {
        const sTime = new Date(j.start?.toDate ? j.start.toDate() : j.start).getTime();
        return j.id === jobId && j.taskId === taskId && Math.abs(sTime - targetStartMs) < 1000;
      });

      if (segIndex !== -1) {
        jobs[segIndex].start = newStart;
        jobs[segIndex].end = newEnd;
        jobs[segIndex].lastAdjustedByUid = user?.uid;
        jobs[segIndex].lastAdjustedByName = user?.displayName || user?.email || 'Manager';
        jobs[segIndex].lastAdjustedAt = new Date();

        await updateDoc(sessionRef, {
          jobs,
          updatedAt: serverTimestamp()
        });

        await logActivity(
          'task_time_adjusted',
          `Adjusted time log for ${editingSegment.techName} on ${task.title}. Start: ${newStart.toLocaleTimeString()} - End: ${newEnd ? newEnd.toLocaleTimeString() : 'Active'}`,
          {
            targetUid: editingSegment.userId,
            targetName: editingSegment.techName,
            originalStart: new Date(targetStartMs).toISOString(),
            newStart: newStart.toISOString(),
            newEnd: newEnd ? newEnd.toISOString() : null
          }
        );

        toast.success(`Time adjusted for ${editingSegment.techName}`);
        setEditingSegment(null);
      } else {
        toast.error('Could not locate time segment in session.');
      }
    } catch (err) {
      console.error('Error saving time adjustment:', err);
      toast.error('Failed to save time adjustment.');
    }
  };

  const handleDeleteSegment = async (seg: any) => {
    if (!confirm(`Are you sure you want to delete this time entry for ${seg.techName}?`)) return;
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, seg.sessionId);
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) {
        toast.error('Session not found');
        return;
      }
      const sessionData = snap.data();
      const jobs = [...(sessionData.jobs || [])];
      
      const targetStartMs = new Date(seg.rawSeg.start?.toDate ? seg.rawSeg.start.toDate() : seg.rawSeg.start).getTime();
      const segIndex = jobs.findIndex((j: any) => {
        const sTime = new Date(j.start?.toDate ? j.start.toDate() : j.start).getTime();
        return j.id === jobId && j.taskId === taskId && Math.abs(sTime - targetStartMs) < 1000;
      });

      if (segIndex !== -1) {
        jobs.splice(segIndex, 1);
        await updateDoc(sessionRef, {
          jobs,
          jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
          updatedAt: serverTimestamp()
        });
        await logActivity('task_time_deleted', `Deleted time entry for ${seg.techName} on ${task.title}. Deleted by ${user?.displayName || user?.email}`, {
          targetUid: seg.userId,
          targetName: seg.techName
        });
        toast.success('Time entry deleted successfully');
      } else {
        toast.error('Time entry not found in session.');
      }
    } catch (err) {
      console.error('Error deleting time segment:', err);
      toast.error('Failed to delete time entry');
    }
  };

  // Fetch Parts for this task
  useEffect(() => {
    if (!jobId || !tenantId || !taskId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/parts_requests`),
      where('jobId', '==', jobId),
      where('taskId', '==', taskId)
    );
    const unsub = onSnapshot(q, (snap) => {
      setParts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("Parts listener error:", err);
      setParts([]);
    });
    return () => unsub();
  }, [jobId, taskId, tenantId]);

  // Fetch Activity Log for this job and filter by task
  useEffect(() => {
    if (!jobId || !tenantId || !taskId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/jobs/${jobId}/activity`), (snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Filter logs by taskId manually if we don't have an index, 
      // or we just show them if they contain metadata.taskId == taskId or type starts with part_requested for this task.
      const taskLogs = logs.filter((log: any) => log.metadata?.taskId === taskId || log.taskId === taskId);
      
      taskLogs.sort((a: any, b: any) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });
      setActivityLogs(taskLogs);
    }, (err) => console.error("Activity listener error:", err));
    return () => unsub();
  }, [jobId, taskId, tenantId]);

  // Sync Active Job/Task from current session of the effective user (self or impersonated)
  useEffect(() => {
    if (!tenantId || !effectiveUserId) {
      setActiveTasks([]);
      return;
    }
    
    // We listen to all active sessions to see if one matches effectiveUserId or staffMember?.name
    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('status', '==', 'active')
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const searchIds = [effectiveUserId];
      if (staffMember?.id && !searchIds.includes(staffMember.id)) {
        searchIds.push(staffMember.id);
      }
      if (staffMember?.userId && !searchIds.includes(staffMember.userId)) {
        searchIds.push(staffMember.userId);
      }

      const activeSession = snap.docs.find(d => {
        const data = d.data();
        const matchesUid = searchIds.includes(data.userId);
        const sessionName = (data.userName || data.staffName || '').toLowerCase().trim();
        const targetName = (staffMember?.name || '').toLowerCase().trim();
        const matchesName = targetName && sessionName && (sessionName === targetName);
        return matchesUid || matchesName;
      });
      
      if (activeSession) {
        const jobs = activeSession.data().jobs || [];
        const activeSegments = jobs.filter((j: any) => !j.end);
        
        // Track all active segments
        setActiveTasks(activeSegments.map((j: any) => ({ jobId: j.id, taskId: j.taskId || null })));
      } else {
        setActiveTasks([]);
      }
    }, (err) => {
      console.error("Session sync listener error:", err);
    });
    return () => unsub();
  }, [tenantId, effectiveUserId, staffMember?.name, staffMember?.userId, staffMember?.id]);

  const logActivity = async (type: string, message: string, metadata: any = {}) => {
    try {
      const activityData = {
        type,
        message,
        metadata: { ...metadata, taskId },
        taskId,
        timestamp: new Date(),
        staffId: user?.uid,
        staffName: user?.displayName || user?.email || 'Staff'
      };

      // 1. Write to local subcollection
      const docRef = await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/activity`), activityData);

      // 2. Write to global activity feed
      const jobPrefix = job ? (job.jobNumber ? `Job #${job.jobNumber}` : `Job ${job.title}`) : 'Job';
      const typeToTitle: Record<string, string> = {
        blocker_added: 'Blocker Added',
        blocker_resolved: 'Blocker Resolved',
        part_status_changed: 'Part Status Changed',
        location_changed: 'Vehicle Moved',
        patrol_check: 'Patrol Check',
        status_changed: 'Status Changed',
        task_added: 'Task Added',
        task_duplicated: 'Task Duplicated',
        task_deleted: 'Task Removed',
        task_updated: 'Task Updated',
        task_assigned: 'Task Assigned',
      };

      const getSeverity = (t: string, msg: string) => {
        if (t === 'blocker_added') return 'warning';
        if (t === 'blocker_resolved') return 'success';
        if (t === 'status_changed') {
          if (msg.toLowerCase().includes('blocked')) return 'error';
          if (msg.toLowerCase().includes('restored') || msg.toLowerCase().includes('active')) return 'success';
        }
        return 'info';
      };

      await setDoc(doc(db, `businesses/${tenantId}/activity_feed`, `job_act_${jobId}_${docRef.id}`), {
        type: 'job',
        title: typeToTitle[type] || 'Job Update',
        message: `${jobPrefix}: ${message}`,
        timestamp: activityData.timestamp,
        severity: getSeverity(type, message),
        author: activityData.staffName,
        metadata: {
          jobId,
          jobTitle: job?.title || '',
          jobNumber: job?.jobNumber || '',
          taskId,
          ...metadata
        }
      });
    } catch (err) {
      console.error("Activity logging error:", err);
    }
  };

  const handleAddBlocker = async () => {
    if (!newBlockerMsg.trim()) return;
    setIsAddingBlocker(true);
    try {
      const newBlocker = {
        id: crypto.randomUUID(),
        message: newBlockerMsg.trim(),
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: user?.displayName || user?.email || 'Staff',
        createdById: user?.uid
      };
      
      const updatedBlockers = [...(task.blockers || []), newBlocker];
      await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), {
        blockers: updatedBlockers,
        status: 'Blocked',
        updatedAt: new Date().toISOString()
      });
      await logActivity('blocker_added', `Added task blocker: ${newBlockerMsg.trim()}`);
      setNewBlockerMsg('');
      toast.success('Blocker added');
    } catch (err) {
      console.error(err);
      toast.error('Failed to add blocker');
    } finally {
      setIsAddingBlocker(false);
    }
  };

  const handleResolveBlocker = async (blockerId: string) => {
    try {
      const updatedBlockers = (task.blockers || []).map((b: any) => 
        b.id === blockerId ? { ...b, status: 'resolved', resolvedAt: new Date().toISOString(), resolvedBy: user?.displayName || user?.email } : b
      );
      
      const blocker = (task.blockers || []).find((b: any) => b.id === blockerId);
      
      const hasActiveBlockers = updatedBlockers.some((b: any) => b.status === 'active');

      await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), {
        blockers: updatedBlockers,
        status: task.status === 'Blocked' && !hasActiveBlockers ? 'pending' : task.status, // Revert status if needed, simplified here
        updatedAt: new Date().toISOString()
      });

      await logActivity('blocker_resolved', `Resolved task blocker: ${blocker?.message || 'Unknown'}`);
      toast.success('Blocker resolved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to resolve blocker');
    }
  };

  const handleNoteImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    setNoteImages(prev => [...prev, ...newImages]);
  };

  const handleRemovePendingImage = (index: number) => {
    setNoteImages(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleAddTaskNote = async () => {
    if (!newNoteText.trim() && noteImages.length === 0) return;
    setIsUploadingNote(true);
    try {
      const uploadedUrls: string[] = [];
      for (const img of noteImages) {
        const storageRef = ref(storage, `businesses/${tenantId}/tasks/${taskId}/${Date.now()}_${img.file.name}`);
        const snapshot = await uploadBytes(storageRef, img.file);
        const url = await getDownloadURL(snapshot.ref);
        uploadedUrls.push(url);
      }

      const newNoteObj = {
        id: crypto.randomUUID(),
        message: newNoteText.trim(),
        images: uploadedUrls,
        createdAt: new Date().toISOString(),
        createdByUid: user?.uid || '',
        createdByName: user?.displayName || user?.email || staffMember?.name || 'Staff'
      };

      const updatedNotes = [...(task.task_notes || []), newNoteObj];

      await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), {
        task_notes: updatedNotes,
        updatedAt: new Date().toISOString()
      });

      await logActivity(
        'task_note_added',
        `Note added to task ${task.title} by ${user?.displayName || user?.email || staffMember?.name || 'Staff'}`
      );

      // If job is linked to CompanyCam, push the photos there as well
      const ccProjectId = job?.companyCamId || job?.companyCamProjectId;
      if (ccProjectId && uploadedUrls.length > 0) {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const apiBase = isLocal 
          ? 'http://localhost:5001/saegroup-c6487/us-central1/api'
          : 'https://us-central1-saegroup-c6487.cloudfunctions.net/api';

        auth.currentUser?.getIdToken().then(token => {
          fetch(`${apiBase}/jobs/${jobId}/companycam-photos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'x-tenant-id': tenantId
            },
            body: JSON.stringify({ urls: uploadedUrls })
          }).then(res => {
            if (!res.ok) {
              console.warn("Failed to push photo URLs to CompanyCam, status:", res.status);
            } else {
              console.log("Successfully pushed task note photos to CompanyCam");
            }
          }).catch(err => {
            console.error("Error pushing photos to CompanyCam:", err);
          });
        }).catch(tokenErr => {
          console.error("Failed to retrieve token for CompanyCam upload:", tokenErr);
        });
      }

      setNewNoteText('');
      setNoteImages([]);
      toast.success('Note added successfully!');
    } catch (err) {
      console.error('Error adding task note:', err);
      toast.error('Failed to add note.');
    } finally {
      setIsUploadingNote(false);
    }
  };

  const handleDeleteTaskNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    try {
      const updatedNotes = (task.task_notes || []).filter((n: any) => n.id !== noteId);
      await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), {
        task_notes: updatedNotes,
        updatedAt: new Date().toISOString()
      });
      await logActivity('task_note_deleted', `Deleted a note on task ${task.title}`);
      toast.success('Note deleted.');
    } catch (err) {
      console.error('Error deleting task note:', err);
      toast.error('Failed to delete note.');
    }
  };

  const handleClockInClick = async () => {
    if (!task) return;
    const isGeneral = isGeneralTask(task);
    const targetUid = effectiveUserId || user?.uid;
    const isClockingOther = !!(effectiveUserId && effectiveUserId !== user?.uid);
    const resolvedStaffName = isClockingOther 
      ? (staffMember?.name || allStaff.find(s => s.userId === targetUid || s.id === targetUid)?.name || 'Technician')
      : undefined;

    if (isGeneral && targetUid) {
      setIsCheckingTasks(true);
      try {
        const q = query(
          collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`)
        );
        const snap = await getDocs(q);
        const allTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        const assignedTasks = allTasks.filter(t => 
          !isGeneralTask(t) && 
          t.status !== 'QC' && 
          t.status !== 'QC Complete' && 
          t.status !== 'completed' && 
          (t.assignedStaffIds?.includes(targetUid) || t.assignedStaff?.some((s: any) => (s.uid || s.id) === targetUid))
        );
        if (assignedTasks.length > 0) {
          setGeneralClockInWarning({
            generalTaskId: task.id,
            generalTaskTitle: task.title,
            isClockingOther,
            resolvedStaffName,
            targetUid,
            assignedTasks: assignedTasks.map(t => ({
              id: t.id,
              title: t.title,
              description: t.description
            }))
          });
          setIsCheckingTasks(false);
          return;
        }
      } catch (err) {
        console.error('Error checking assigned tasks:', err);
      } finally {
        setIsCheckingTasks(false);
      }
    }

    if (isClockingOther && targetUid && resolvedStaffName) {
      await handleClockOther(targetUid, resolvedStaffName, task.id, task.title, 'in');
    } else {
      await clockIntoJob(jobId!, job?.title || 'Job', task.id, task.title);
    }
  };

  const handlePendingTaskSuccess = async () => {
    if (!pendingCompletion) return;
    const { currentStatus, action } = pendingCompletion;
    setPendingCompletion(null);
    await handleTaskStatusChange(currentStatus, action, true);
  };

  const handleTaskStatusChange = async (currentStatus: string, action?: 'pass' | 'fail', bypassVerification = false) => {
    let nextStatus = '';
    const statusLower = (currentStatus || '').toLowerCase();
    if (statusLower === 'pending' || statusLower === 'in_progress' || statusLower === 'blocked' || statusLower === 'rework') {
      nextStatus = 'QC'; 
    } else if (statusLower === 'qc') {
      if (action === 'fail') {
        nextStatus = 'Rework';
      } else {
        nextStatus = 'QC Complete';
      }
    } else {
      return;
    }

    try {
      if (!task) return;

      if ((nextStatus === 'QC' || nextStatus === 'QC Complete') && task.canComplete === false) {
        toast.error("This task cannot be marked as complete.");
        return;
      }

      // Intercept if they are marking complete
      if (nextStatus === 'QC' && !isGeneralTask(task) && !bypassVerification) {
        setPendingCompletion({
          currentStatus,
          action
        });
        return;
      }

      const updateData: any = {
        status: nextStatus,
        updatedAt: new Date().toISOString()
      };

      if (nextStatus === 'QC') {
        if (!task?.completedAt) {
          updateData.completedAt = new Date().toISOString();
        }
        updateData.completedBy = user?.displayName || user?.email;
        updateData.completedByStaffId = staffMember?.id || effectiveUserId;
        updateData.completedByStaffName = staffMember?.name || user?.displayName || user?.email || 'Staff';
      } else if (nextStatus === 'QC Complete') {
        updateData.qcCompletedAt = new Date().toISOString();
        updateData.qcCompletedBy = user?.displayName || user?.email;
        if (!task?.completedByStaffId) {
          updateData.completedByStaffId = staffMember?.id || effectiveUserId;
          updateData.completedByStaffName = staffMember?.name || user?.displayName || user?.email || 'Staff';
        }
      } else if (nextStatus === 'Rework') {
        updateData.qcFailedAt = new Date().toISOString();
        updateData.qcFailedBy = user?.displayName || user?.email;
      }

      await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), updateData);
      await logActivity('status_changed', `Task marked as ${nextStatus}`);
      toast.success(`Task marked as ${nextStatus}`);

      // Automatically assign task to QC staff if status is QC
      if (nextStatus === 'QC') {
        await assignQCStaffToTask(tenantId, jobId, taskId);
      }

    } catch (e) {
      console.error(e);
      toast.error('Failed to update task status');
    }
  };

  const getTaskLoggedMs = () => {
    return timeLogs.reduce((acc, session) => {
      const taskSegments = (session.jobs || []).filter((j: any) => j.id === jobId && j.taskId === taskId);
      const segMs = taskSegments.reduce((segAcc: number, seg: any) => {
        const start = seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime();
        
        let endMs = now;
        if (seg.end) {
          endMs = seg.end.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime();
        } else if (session.status === 'completed' || session.clockOut?.timestamp) {
          const clockOutVal = session.clockOut?.timestamp;
          if (clockOutVal) {
            endMs = clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime();
          } else {
            const updatedVal = session.updatedAt || session.createdAt;
            endMs = updatedVal?.toDate ? updatedVal.toDate().getTime() : new Date(updatedVal || start).getTime();
          }
        }

        return segAcc + Math.max(0, endMs - start);
      }, 0);
      return acc + segMs;
    }, 0);
  };

  const getTaskSessionsAndContributions = () => {
    const segments: any[] = [];
    const techMap: { [name: string]: { ms: number; isActive: boolean; userId: string } } = {};
    let totalMs = 0;

    timeLogs.forEach(session => {
      const techName = session.staffName || session.userName || 'Unknown Staff';
      const userId = session.userId || session.staffId || '';
      
      const taskSegments = (session.jobs || []).filter((j: any) => j.id === jobId && j.taskId === taskId);
      
      taskSegments.forEach((seg: any) => {
        const start = seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime();
        
        let end = null;
        if (seg.end) {
          end = seg.end.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime();
        } else if (session.status === 'completed' || session.clockOut?.timestamp) {
          const clockOutVal = session.clockOut?.timestamp;
          if (clockOutVal) {
            end = clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime();
          } else {
            const updatedVal = session.updatedAt || session.createdAt;
            end = updatedVal?.toDate ? updatedVal.toDate().getTime() : new Date(updatedVal || start).getTime();
          }
        }

        const duration = (end || now) - start;
        const isActive = !seg.end && (session.status === 'active' || session.status === 'on_break');

        segments.push({
          id: `${session.id}-${start}`,
          sessionId: session.id,
          techName,
          userId,
          start,
          end,
          duration,
          isActive,
          rawSeg: seg
        });

        if (!techMap[techName]) {
          techMap[techName] = { ms: 0, isActive: false, userId };
        }
        techMap[techName].ms += duration;
        if (isActive) {
          techMap[techName].isActive = true;
        }
        totalMs += duration;
      });
    });

    segments.sort((a, b) => b.start - a.start);

    const contributions = Object.entries(techMap).map(([name, data]) => ({
      name,
      userId: data.userId,
      ms: data.ms,
      percentage: totalMs > 0 ? Math.round((data.ms / totalMs) * 100) : 0,
      isActive: data.isActive
    })).sort((a, b) => b.ms - a.ms);

    return { segments, contributions, totalMs };
  };

  const formatMs = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  if (!job || !task) return (
    <div className="flex items-center justify-center p-12">
      <Clock className="w-8 h-8 text-indigo-500 animate-spin" />
    </div>
  );

  const loggedMs = getTaskLoggedMs();

  const canPerformQC = isSuperAdmin || permissions['jobs.qc'];
  // Allow all staff to view task details page
  const hasAccess = true;

  if (!hasAccess) {
    return (
      <div className="p-12 text-center animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-10 h-10 text-rose-500" />
        </div>
        <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-2">Access Restricted</h3>
        <p className="text-zinc-500 max-w-sm mx-auto">
          Your account does not have the required permissions to access this task. Please contact your administrator for elevated access.
        </p>
      </div>
    );
  }

  const isCurrentTask = activeTasks.some(at => at.jobId === jobId && at.taskId === task.id) || 
                        isUserClockedIntoTask(effectiveUserId || '', task.id, staffMember?.name);

  const activeBlockers = (task.blockers || []).filter((b: any) => b.status === 'active');
  const resolvedBlockers = (task.blockers || []).filter((b: any) => b.status === 'resolved');

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-500" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white tracking-tight">{task.title}</h1>
              <span className={cn(
                "px-2 py-1 rounded text-xs font-black uppercase tracking-tighter",
                task.status === 'QC' ? "bg-amber-500/10 text-amber-600" :
                task.status === 'QC Complete' ? "bg-emerald-500/10 text-emerald-600" :
                task.status === 'Blocked' ? "bg-rose-500/10 text-rose-600" :
                task.status === 'Rework' || task.isRework ? "bg-rose-500/10 text-rose-600 border border-rose-500/20" :
                "bg-indigo-500/10 text-indigo-600"
              )}>
                {task.status || 'Pending'}
              </span>
              {(() => {
                const bookHours = parseFloat(task.bookTime) || 0;
                const clockedHours = task.actualTime !== undefined && task.actualTime > 0 
                  ? task.actualTime 
                  : (loggedMs / 3600000);
                const isOverBook = !task.isAccidental && !isGeneralTask(task) && bookHours > 0 && clockedHours > bookHours;
                const diff = clockedHours - bookHours;
                if (isOverBook) {
                  return (
                    <span className="px-2 py-1 rounded text-xs font-black uppercase tracking-tighter bg-rose-500/10 text-rose-600 dark:bg-rose-500/25 dark:text-rose-355 border border-rose-500/20 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      Over Budget (+{diff.toFixed(1)}h)
                    </span>
                  );
                }
                return null;
              })()}
              {task.isDiagnostic && (
                <span className="px-2 py-1 rounded text-xs font-black uppercase tracking-tighter bg-purple-500/10 text-purple-600 border border-purple-500/20">
                  Diagnostic
                </span>
              )}
              {task.isRework && task.status !== 'Rework' && (
                <span className="px-2 py-1 rounded text-xs font-black uppercase tracking-tighter bg-rose-500/10 text-rose-600 border border-rose-500/20">
                  Rework
                </span>
              )}
            </div>
            <p className="text-base sm:text-lg font-bold text-zinc-500 mt-1">
              Job: <span className="text-indigo-500 cursor-pointer hover:underline" onClick={() => navigate(`/business/${tenantId}/job/${jobId}`)}>{job.jobNumber ? `#${job.jobNumber} - ` : ''}{job.title}</span> • {job.vehicleId || 'No Vehicle Linked'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
           {true && (
             <>
               {isCurrentTask ? (
                  <button 
                    onClick={async () => {
                      if (effectiveUserId && effectiveUserId !== user?.uid) {
                        const resolvedStaffName = staffMember?.name || allStaff.find(s => s.userId === effectiveUserId || s.id === effectiveUserId)?.name || 'Technician';
                        await handleClockOther(effectiveUserId, resolvedStaffName, task.id, task.title, 'out');
                      } else {
                        await clockOutOfJob(jobId, task.id);
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
                  >
                    <Timer className="w-4 h-4 animate-pulse" />
                    Clock Out
                  </button>
                ) : (
                  task.status !== 'QC' && task.status !== 'QC Complete' && task.status !== 'completed' && !['Ready for QC', 'Ready for Customer', 'Completed'].includes(job?.status || '') && (
                    <button 
                      onClick={async () => {
                        await handleClockInClick();
                      }}
                      disabled={isClockingIn || isCheckingTasks || task.status === 'Blocked'}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                    >
                      {isCheckingTasks ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Timer className="w-4 h-4" />
                      )}
                      {isCheckingTasks ? 'Checking...' : 'Clock In'}
                    </button>
                  )
                )}
               
               {task.status !== 'QC Complete' && !isGeneralTask(task) && task.canComplete !== false && (
                   task.status === 'QC' ? (
                     <div className="flex items-center gap-2">
                       {canPerformQC ? (
                         <>
                           <button 
                             onClick={() => handleTaskStatusChange(task.status || 'pending', 'pass')}
                             className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl text-sm font-bold uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20"
                           >
                             <CheckCircle2 className="w-4 h-4" />
                             Pass QC
                           </button>
                           <button 
                             onClick={() => handleTaskStatusChange(task.status || 'pending', 'fail')}
                             className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white hover:bg-rose-600 rounded-xl text-sm font-bold uppercase tracking-widest transition-all shadow-lg shadow-rose-500/20"
                           >
                             <XCircle className="w-4 h-4" />
                             Fail QC
                           </button>
                         </>
                       ) : (
                         <span className="text-[10px] font-black text-amber-500 bg-amber-500/5 px-3 py-2 rounded-xl border border-amber-550/20 uppercase tracking-widest">
                           Awaiting QA Approval
                         </span>
                       )}
                     </div>
                   ) : (
                     <button 
                       onClick={() => handleTaskStatusChange(task.status || 'pending')}
                       className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 rounded-xl text-sm font-bold uppercase tracking-widest transition-all shadow-sm"
                     >
                       <CheckCircle2 className="w-4 h-4" />
                       {task.status === 'Rework' ? 'Mark Fixed' : 'Mark Complete'}
                     </button>
                   )
                 )}
             </>
           )}
        </div>
      </div>

      {task.status === 'Blocked' && activeBlockers.length > 0 && (
        <div className="bg-rose-500 text-white rounded-3xl p-6 flex flex-col md:flex-row md:items-center gap-6 shadow-xl shadow-rose-500/20 animate-in slide-in-from-top-4 duration-300">
          <div className="p-4 bg-white/20 rounded-2xl shrink-0 self-start md:self-center">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-black uppercase tracking-widest mb-2">Task is Blocked</h2>
            <p className="text-rose-100 font-bold mb-4">This task cannot proceed until the following blockers are resolved:</p>
            <div className="flex flex-wrap gap-2">
              {activeBlockers.map((blocker: any) => (
                <div key={blocker.id} className="flex items-center gap-2 text-sm font-bold bg-rose-900/40 px-4 py-2 rounded-xl border border-rose-400/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-300 shrink-0 shadow-[0_0_8px_rgba(251,113,133,0.8)] animate-pulse" />
                  {blocker.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Privileged Support Control Board */}
      {canManageTasks && (
        <div className="bg-zinc-900/90 dark:bg-zinc-950/80 border-l-4 border-indigo-500 rounded-3xl p-6 text-white shadow-xl animate-in slide-in-from-top-4 duration-300">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                  Privileged Support Panel
                </span>
              </div>
              <h2 className="text-xl font-bold mt-1">Clock & Log Management Console</h2>
              <p className="text-xs text-zinc-400 mt-1">This console is only visible to roles with task management and clock override permissions.</p>
            </div>
            
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-2xl">
              <ShieldAlert className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-black uppercase tracking-widest text-zinc-300">Admin Mode Active</span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Task Attribute Overrides */}
            <div>
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-2">Override Task Attributes</span>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2.5 cursor-pointer bg-white/5 hover:bg-white/10 px-4 py-2.5 rounded-2xl border border-white/10 transition-all select-none">
                  <input 
                    type="checkbox" 
                    checked={!!task.isDiagnostic} 
                    onChange={async (e) => {
                      const val = e.target.checked;
                      try {
                        await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), {
                          isDiagnostic: val,
                          updatedAt: new Date().toISOString()
                        });
                        await logActivity('task_updated', `Marked task ${task.title} as ${val ? 'Diagnostic' : 'Non-Diagnostic'}`);
                        toast.success(val ? 'Task marked as Diagnostic' : 'Diagnostic flag removed');
                      } catch (err) {
                        console.error(err);
                        toast.error('Failed to update task attribute.');
                      }
                    }}
                    className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-zinc-200">Diagnostic Labor</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer bg-white/5 hover:bg-white/10 px-4 py-2.5 rounded-2xl border border-white/10 transition-all select-none">
                  <input 
                    type="checkbox" 
                    checked={task.status === 'Rework' || !!task.isRework} 
                    onChange={async (e) => {
                      const val = e.target.checked;
                      try {
                        await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), {
                          isRework: val,
                          status: val ? 'Rework' : 'pending',
                          updatedAt: new Date().toISOString()
                        });
                        await logActivity('status_changed', `Task ${task.title} marked as ${val ? 'Rework' : 'Pending'}`);
                        toast.success(val ? 'Task marked as Rework' : 'Rework status removed');
                      } catch (err) {
                        console.error(err);
                        toast.error('Failed to update task attribute.');
                      }
                    }}
                    className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-zinc-200">Rework Needed</span>
                </label>
              </div>
            </div>

            {/* Task Completion Overrides */}
            <div className="pt-4 border-t border-white/10 mt-4">
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-2">Override Task Completion & QA</span>
              <div className="flex flex-wrap gap-3">
                {task.status !== 'QC Complete' && task.status !== 'QC' && task.canComplete !== false && (
                  <button 
                    onClick={() => handleTaskStatusChange(task.status || 'pending')}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-650 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-md shadow-indigo-500/20"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Force Complete (Submit for QA)
                  </button>
                )}

                {task.status === 'QC' && (
                  <>
                    <button 
                      onClick={() => handleTaskStatusChange(task.status || 'pending', 'pass')}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-md shadow-emerald-500/20"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Pass QA Approval
                    </button>
                    <button 
                      onClick={() => handleTaskStatusChange(task.status || 'pending', 'fail')}
                      className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-md shadow-rose-600/20"
                    >
                      <XCircle className="w-4 h-4" />
                      Fail QA (Mark Rework)
                    </button>
                  </>
                )}

                {task.status === 'QC Complete' && (
                  <button 
                    onClick={async () => {
                      try {
                        await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), {
                          status: 'pending',
                          qcCompletedAt: null,
                          qcCompletedBy: null,
                          completedAt: null,
                          completedBy: null,
                          updatedAt: new Date().toISOString()
                        });
                        await logActivity('status_changed', `Task ${task.title} re-opened by Admin`);
                        toast.success('Task re-opened and set back to pending');
                      } catch (err) {
                        console.error(err);
                        toast.error('Failed to re-open task.');
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-200 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                  >
                    <Play className="w-4 h-4" />
                    Re-open Task (Set Pending)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Task Details Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">Task Details</h2>
                  {!isEditingDescription && (
                    <button
                      onClick={() => {
                        setTempDescription(task.description || '');
                        setIsEditingDescription(true);
                      }}
                      className="p-1 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                      title="Edit task description/notes"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {isEditingDescription ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={tempDescription}
                      onChange={(e) => setTempDescription(e.target.value)}
                      placeholder="Add specific notes or description for this task..."
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 text-sm resize-none focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all h-20 text-zinc-900 dark:text-white"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), {
                              description: tempDescription.trim(),
                              updatedAt: new Date().toISOString()
                            });
                            await logActivity('task_updated', `Updated task description: ${tempDescription.trim()}`);
                            setIsEditingDescription(false);
                            toast.success('Description updated successfully');
                          } catch (err) {
                            console.error(err);
                            toast.error('Failed to update description');
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" /> Save
                      </button>
                      <button
                        onClick={() => setIsEditingDescription(false)}
                        className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-350 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-bold transition-all shrink-0"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  task.description ? (
                    <p className="text-zinc-600 dark:text-zinc-400 mt-2 text-sm whitespace-pre-wrap">{task.description}</p>
                  ) : (
                    <p className="text-sm font-bold text-zinc-500 mt-2 italic">No description provided.</p>
                  )
                )}
              </div>
              
              <div className="flex flex-col items-end shrink-0">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Assigned Staff</span>
                {task.assignedStaff && task.assignedStaff.length > 0 ? (
                  <div className="flex items-center -space-x-2">
                    {task.assignedStaff.map((staff: any) => (
                      <div 
                        key={staff.id || staff.uid} 
                        className="w-8 h-8 rounded-full bg-indigo-500/10 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400 animate-in fade-in"
                        title={staff.name || 'Staff Member'}
                      >
                        {(staff.name || '?').substring(0, 2).toUpperCase()}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-600 text-[10px] font-black uppercase tracking-widest">
                    Unassigned
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Allotted Time</span>
                <span className="font-mono text-xl font-bold">{!isGeneralTask(task) ? `${task.bookTime || 0}h` : 'N/A'}</span>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Time Worked</span>
                <span className={cn(
                  "font-mono text-xl font-bold",
                  !isGeneralTask(task) && loggedMs > (task.bookTime || 0) * 3600000 ? "text-rose-500" : "text-emerald-500"
                )}>
                  {formatMs(loggedMs)}
                </span>
              </div>
            </div>
          </div>

          {/* Technician Sessions & Hours Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-500/10 rounded-xl">
                <Users className="w-5 h-5 text-indigo-500" />
              </div>
              <h2 className="text-xl font-bold">Technician Sessions & Hours</h2>
            </div>

            {(() => {
              const { segments, contributions } = getTaskSessionsAndContributions();

              if (segments.length === 0) {
                return (
                  <div className="p-8 text-center text-zinc-500 font-bold bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                    No work logged on this task yet.
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  {/* Contributions list */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Time Contributions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {contributions.map((contrib) => (
                        <div key={contrib.name} className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <StaffLink 
                                name={contrib.name} 
                                tenantId={tenantId} 
                                staffId={contrib.userId} 
                                className="font-bold text-sm text-zinc-950 dark:text-zinc-50 hover:text-indigo-600 hover:underline" 
                              />
                              {contrib.isActive && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 text-[8px] font-black uppercase tracking-widest animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Active
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-sm font-bold text-indigo-500">{formatMs(contrib.ms)}</span>
                          </div>
                          
                          {/* Progress bar */}
                          <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-indigo-500 h-full rounded-full transition-all" 
                              style={{ width: `${contrib.percentage}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mt-1.5 self-end">
                            {contrib.percentage}% contribution
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sessions Timeline */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Login Sessions</h3>
                    <div className="max-h-[250px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                      {segments.map((seg) => (
                        <div key={seg.id} className="p-3 bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-100 dark:border-zinc-900 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {seg.isActive ? (
                              <Play className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500 shrink-0" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-zinc-400 fill-zinc-400 shrink-0" />
                            )}
                             <StaffLink 
                               name={seg.techName} 
                               tenantId={tenantId} 
                               staffId={seg.userId} 
                               className="font-bold text-xs text-zinc-800 dark:text-zinc-200 hover:text-indigo-600 hover:underline" 
                             />
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <div className="text-zinc-500 text-[10px] font-medium text-right">
                              <div>{new Date(seg.start).toLocaleDateString()}</div>
                              <div>
                                {new Date(seg.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {seg.end ? new Date(seg.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                              </div>
                            </div>
                             <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">{formatMs(seg.duration)}</span>
                             {canManageTime && (
                               <div className="flex items-center gap-1.5 ml-2">
                                 <button
                                   onClick={() => {
                                     setEditingSegment(seg);
                                     setEditStartStr(toDatetimeLocal(seg.start));
                                     setEditEndStr(seg.end ? toDatetimeLocal(seg.end) : '');
                                   }}
                                   className="px-2 py-1 bg-zinc-150 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[10px] font-black uppercase tracking-widest rounded-lg border border-zinc-250 dark:border-zinc-700 transition-all"
                                 >
                                   Edit
                                 </button>
                                 <button
                                   onClick={() => handleDeleteSegment(seg)}
                                   className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-rose-500/20 transition-all"
                                 >
                                   Delete
                                 </button>
                               </div>
                             )}
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Activity Timeline */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-500/10 rounded-xl">
                <MessageSquare className="w-5 h-5 text-indigo-500" />
              </div>
              <h2 className="text-xl font-bold">Unified History & Activity</h2>
            </div>
            
            {(() => {
              const allEvents: any[] = [];
              
              // 1. Add manual Activity Logs
              activityLogs.forEach(log => {
                allEvents.push({
                  id: log.id,
                  timestamp: log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp),
                  staffName: log.staffName,
                  message: log.message,
                  type: log.type,
                  isManual: true
                });
              });
              
              // 2. Add time log sessions as events
              const { segments } = getTaskSessionsAndContributions();
              segments.forEach(seg => {
                allEvents.push({
                  id: `${seg.id}-in`,
                  timestamp: new Date(seg.start),
                  staffName: seg.techName,
                  message: 'clocked in',
                  type: 'clock_in',
                  isManual: false
                });

                if (seg.end) {
                  allEvents.push({
                    id: `${seg.id}-out`,
                    timestamp: new Date(seg.end),
                    staffName: seg.techName,
                    message: 'clocked out',
                    type: 'clock_out',
                    isManual: false
                  });
                }
              });
              
              allEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
              
              if (allEvents.length === 0) {
                return (
                  <div className="p-8 text-center text-zinc-500 font-bold bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                    No activity recorded for this task yet.
                  </div>
                );
              }
              
              return (
                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                  {allEvents.map((event) => (
                    <div key={event.id} className={cn(
                      "flex gap-4 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 rounded-xl transition-colors group",
                      event.isManual ? "border-l-2 border-indigo-500/20" : "border-l-2 border-emerald-500/20"
                    )}>
                      <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-700">
                        <span className="text-xs font-bold text-zinc-500 uppercase">
                          {(event.staffName || '?').substring(0, 2)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-zinc-900 dark:text-white truncate">{event.staffName}</span>
                          <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-black shrink-0">
                            {event.timestamp.toLocaleDateString()} {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className={cn(
                          "text-sm mt-0.5",
                          event.type === 'clock_in' ? "text-emerald-500 font-medium animate-in fade-in" :
                          event.type === 'clock_out' ? "text-zinc-400" :
                          "text-zinc-600 dark:text-zinc-400"
                        )}>
                          {event.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Blockers */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-rose-500/10 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <h3 className="font-bold text-rose-500">Blockers</h3>
            </div>

            {activeBlockers.length === 0 ? (
              <p className="text-sm font-bold text-zinc-500 italic text-center mb-6">No active blockers.</p>
            ) : (
              <div className="space-y-3 mb-6">
                {activeBlockers.map((blocker: any) => (
                  <div key={blocker.id} className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{blocker.message}</p>
                      <button
                        onClick={() => handleResolveBlocker(blocker.id)}
                        className="p-1.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors shrink-0"
                        title="Mark as resolved"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-500/60 mt-2">
                      Logged by {blocker.createdBy} on {new Date(blocker.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <textarea
                value={newBlockerMsg}
                onChange={(e) => setNewBlockerMsg(e.target.value)}
                placeholder="Describe what's blocking you..."
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-sm resize-none focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none transition-all h-24"
              />
              <button
                onClick={handleAddBlocker}
                disabled={!newBlockerMsg.trim() || isAddingBlocker}
                className="w-full px-4 py-3 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-500/50 text-white rounded-xl text-sm font-bold uppercase tracking-widest transition-all shadow-lg shadow-rose-500/20"
              >
                {isAddingBlocker ? 'Adding...' : 'Add Blocker'}
              </button>
            </div>

            {resolvedBlockers.length > 0 && (
              <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-4">Resolved Blockers</h4>
                <div className="space-y-3">
                  {resolvedBlockers.map((blocker: any) => (
                    <div key={blocker.id} className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 opacity-60">
                      <p className="text-xs font-bold line-through">{blocker.message}</p>
                      <p className="text-[9px] uppercase tracking-wider text-zinc-500 mt-1">
                        Resolved by {blocker.resolvedBy}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Parts Management */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-xl">
                  <Wrench className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="font-bold">Parts Requested</h3>
              </div>
              <span className="text-xs font-black uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md">
                {parts.length} Total
              </span>
            </div>

            <div className="space-y-3 mb-6">
              {parts.length === 0 ? (
                <p className="text-sm text-zinc-500 font-bold italic text-center py-4">No parts requested for this task.</p>
              ) : (
                parts.map((part) => (
                  <div 
                    key={part.id} 
                    onClick={() => {
                      const canManageParts = isSuperAdmin || permissions['parts.manage'];
                      if (canManageParts) {
                        setSelectedPartForEdit(part);
                      }
                    }}
                    className={cn(
                      "p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800",
                      (isSuperAdmin || permissions['parts.manage']) && "hover:border-amber-500/50 cursor-pointer transition-all"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold">{part.partName}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mt-1">
                          Qty: {part.quantity} • {part.requestedBy}
                        </p>
                      </div>
                      <span className={cn(
                        "px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest",
                        part.status === 'delivered' || part.status === 'fulfilled' ? "bg-indigo-500/10 text-indigo-600 animate-in fade-in" :
                        part.status === 'inventoried' ? "bg-purple-500/10 text-purple-650 animate-in fade-in" :
                        part.status === 'received' ? "bg-emerald-500/10 text-emerald-600" :
                        part.status === 'ordered' ? "bg-blue-500/10 text-blue-600" :
                        "bg-amber-500/10 text-amber-600"
                      )}>
                        {part.status === 'delivered' || part.status === 'fulfilled' ? "WITH VEHICLE" : part.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button 
              onClick={() => setIsPartRequestOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-amber-500 text-amber-600 dark:text-amber-500 rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-amber-500/5 transition-all"
            >
              <Wrench className="w-4 h-4" />
              Request Parts
            </button>
          </div>

          {/* Task Notes & Visual Documentation */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl">
                  <MessageSquare className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className="font-bold">Task Notes & Media</h3>
              </div>
              <span className="text-xs font-black uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md">
                {(task.task_notes || []).length} Notes
              </span>
            </div>

            {/* Note Input */}
            <div className="space-y-4 mb-6">
              <div className="relative">
                <textarea
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Leave a note about task progress, issues, or details..."
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 pr-12 text-sm resize-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all h-24"
                />
                
                {/* Visual Camera trigger inside textarea area */}
                <div className="absolute right-3 bottom-3 flex items-center gap-2">
                  <label className="p-2 bg-zinc-155 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-xl cursor-pointer transition-all shadow-sm flex items-center justify-center">
                    <Camera className="w-4 h-4" />
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*" 
                      capture="environment" 
                      className="hidden" 
                      onChange={handleNoteImageUpload} 
                    />
                  </label>
                </div>
              </div>

              {/* Pending Images preview */}
              {noteImages.length > 0 && (
                <div className="grid grid-cols-4 gap-2 p-2 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  {noteImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 group">
                      <img src={img.preview} className="w-full h-full object-cover" />
                      <button
                        onClick={() => handleRemovePendingImage(idx)}
                        className="absolute top-1 right-1 p-1 bg-rose-500/80 hover:bg-rose-500 text-white rounded-full transition-all"
                        title="Remove image"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleAddTaskNote}
                disabled={(!newNoteText.trim() && noteImages.length === 0) || isUploadingNote}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 hover:bg-indigo-650 disabled:bg-indigo-500/50 text-white rounded-xl text-sm font-bold uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20"
              >
                {isUploadingNote ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-4 h-4" />
                    Post Note
                  </>
                )}
              </button>
            </div>

            {/* Notes timeline feed */}
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar border-t border-zinc-100 dark:border-zinc-850 pt-6">
              {!(task.task_notes) || task.task_notes.length === 0 ? (
                <p className="text-sm text-zinc-500 font-bold italic text-center py-6">No notes left on this task yet.</p>
              ) : (
                [...task.task_notes].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((note: any) => {
                  const isAuthor = note.createdByUid === user?.uid;
                  const canDelete = isAuthor || canClockOthers || isSuperAdmin;
                  return (
                    <div key={note.id} className="p-4 bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-150 dark:border-zinc-900 rounded-2xl space-y-3 relative group/note">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center text-xs font-black uppercase">
                            {(note.createdByName || '?').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-black text-zinc-850 dark:text-zinc-200">{note.createdByName}</p>
                            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mt-0.5">
                              {new Date(note.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteTaskNote(note.id)}
                            className="p-1 text-zinc-400 hover:text-rose-500 opacity-0 group-hover/note:opacity-100 transition-opacity rounded"
                            title="Delete note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {note.message && (
                        <p className="text-xs text-zinc-755 dark:text-zinc-300 leading-relaxed whitespace-pre-line px-1">
                          {note.message}
                        </p>
                      )}

                      {/* Attachments visual grid inside the note */}
                      {note.images && note.images.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 pt-1.5 font-bold">
                          {note.images.map((url: string, imgIdx: number) => (
                            <div 
                              key={imgIdx} 
                              onClick={() => setSelectedLightboxImage(url)}
                              className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-150 dark:bg-zinc-950 cursor-zoom-in hover:scale-[1.03] transition-all"
                            >
                              <img src={url} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {(isPartRequestOpen || selectedPartForEdit) && (
        <PartsRequestModal 
          tenantId={tenantId}
          jobId={jobId!}
          jobTitle={job.title}
          taskId={task.id}
          taskTitle={task.title}
          user={user}
          part={selectedPartForEdit}
          onClose={() => {
            setIsPartRequestOpen(false);
            setSelectedPartForEdit(null);
          }}
          onSuccess={() => {
            setIsPartRequestOpen(false);
            setSelectedPartForEdit(null);
          }}
        />
      )}

      {pendingCompletion && task && (
        <TimeAllocationModal
          tenantId={tenantId}
          jobId={jobId!}
          jobTitle={job?.title || 'Job'}
          taskId={task.id}
          taskTitle={task.title}
          bookTime={parseFloat(task.bookTime) || 0}
          timeLogs={timeLogs}
          effectiveUserId={effectiveUserUid}
          onClose={() => setPendingCompletion(null)}
          onSuccess={handlePendingTaskSuccess}
        />
      )}

      {generalClockInWarning && (
        <GeneralClockInWarningModal
          assignedTasks={generalClockInWarning.assignedTasks}
          onClose={() => setGeneralClockInWarning(null)}
          onClockIntoTask={async (taskId, taskTitle) => {
            if (generalClockInWarning.isClockingOther && generalClockInWarning.resolvedStaffName) {
              await handleClockOther(generalClockInWarning.targetUid, generalClockInWarning.resolvedStaffName, taskId, taskTitle, 'in');
            } else {
              await clockIntoJob(jobId!, job?.title || 'Job', taskId, taskTitle);
            }
            setGeneralClockInWarning(null);
          }}
          onClockIntoGeneral={async () => {
            if (generalClockInWarning.isClockingOther && generalClockInWarning.resolvedStaffName) {
              await handleClockOther(generalClockInWarning.targetUid, generalClockInWarning.resolvedStaffName, generalClockInWarning.generalTaskId, generalClockInWarning.generalTaskTitle, 'in');
            } else {
              await clockIntoJob(jobId!, job?.title || 'Job', generalClockInWarning.generalTaskId, generalClockInWarning.generalTaskTitle);
            }
            setGeneralClockInWarning(null);
          }}
        />
      )}

      {editingSegment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 max-w-md w-full space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-150 dark:border-zinc-850">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Adjust Task Time</h3>
                <p className="text-xs text-zinc-500 mt-1">Editing log for {editingSegment.techName}</p>
              </div>
              <button 
                onClick={() => setEditingSegment(null)}
                className="text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-zinc-400 mb-1.5">Start Time</label>
                <input 
                  type="datetime-local" 
                  value={editStartStr}
                  onChange={(e) => setEditStartStr(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-zinc-400 mb-1.5">End Time (Optional)</label>
                <input 
                  type="datetime-local" 
                  value={editEndStr}
                  onChange={(e) => setEditEndStr(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white"
                />
                <span className="text-[10px] text-zinc-500 mt-1.5 block">Leave empty to keep the segment active.</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-150 dark:border-zinc-850">
              <button 
                onClick={() => setEditingSegment(null)}
                className="px-4 py-2 border border-zinc-250 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveTimeAdjustment}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-indigo-500/20"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox Overlay */}
      {selectedLightboxImage && (
        <div 
          className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4 sm:p-10 cursor-pointer" 
          onClick={() => setSelectedLightboxImage(null)}
        >
          <button 
            className="absolute top-8 right-8 p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-all"
            onClick={() => setSelectedLightboxImage(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <img 
            src={selectedLightboxImage} 
            className="max-w-full max-h-full object-contain rounded-2xl animate-in zoom-in-95 shadow-2xl" 
            alt="Task documentation full screen preview"
          />
        </div>
      )}
    </div>
  );
}
