import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, updateDoc, addDoc, serverTimestamp, getDocs, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase/config';
import { 
  Briefcase, Clock, Timer, CheckCircle2, AlertTriangle, XCircle,
  Wrench, History, ArrowLeft, Edit3, MessageSquare, 
  AlertCircle, MapPin, Car, Package, Trash2, Sparkles, ArrowRight,
  Search, Users, X, ShieldAlert, Printer, FileText, Mail, Send
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth/store';
import { assignQCStaffToTask, assignQCStaffToJob } from '../../lib/auth/qcAssignment';
import { useJobClock } from '../timeclock/useJobClock';
import { JobChat } from './components/JobChat';
import { PartsRequestModal } from './PartsRequestModal';
import { ETAModal } from './ETAModal';
import { SearchableSelect } from './SearchableSelect';
import { TakeoffsSection } from './TakeoffsSection';

export function JobDetailPage({ tenantId }: { tenantId: string }) {
  const { '*': splat } = useParams();
  const pathParts = (splat || '').split('/').filter(Boolean);
  const jobId = pathParts[1];
  
  const navigate = useNavigate();
  const { user, permissions, isSuperAdmin, impersonatedStaff } = useAuthStore();
  const effectiveUserId = impersonatedStaff?.id || user?.uid;
  
  const canClockOthers = isSuperAdmin || permissions['tasks.clock_others'] === true;
  
  const [staffMember, setStaffMember] = useState<any>(null);
  const [allStaff, setAllStaff] = useState<any[]>([]);
  
  // Track technician staff member record
  useEffect(() => {
    if (!tenantId || !effectiveUserId) return;
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
  }, [tenantId, effectiveUserId]);

  // Track all staff members for clock-others mapping
  useEffect(() => {
    if (!tenantId || !canClockOthers) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setAllStaff(snap.docs
        .map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            name: `${data.firstName || ''} ${data.lastName || ''}`.trim()
          } as any;
        })
        .filter(s => !s.isArchived && !s.fireDate && s.departmentId));
    });
    return () => unsub();
  }, [tenantId, canClockOthers]);

  const { clockIntoJob, clockOutOfJob, isProcessing: isClockingIn } = useJobClock(tenantId);
  
  const [job, setJob] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [activeTasks, setActiveTasks] = useState<Array<{ jobId: string, taskId: string | null }>>([]);
  const [now, setNow] = useState(Date.now());
  const [isPartRequestOpen, setIsPartRequestOpen] = useState(false);
  const [isETAOpen, setIsETAOpen] = useState(false);
  const [parts, setParts] = useState<any[]>([]);
  const [selectedTaskForPart, setSelectedTaskForPart] = useState<any>(null);
  const [selectedPartForEdit, setSelectedPartForEdit] = useState<any>(null);
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [selectedStaffFilter, setSelectedStaffFilter] = useState('all');
  
  const [newBlockerMsg, setNewBlockerMsg] = useState('');
  const [isAddingBlocker, setIsAddingBlocker] = useState(false);
  const [zones, setZones] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);

  // Job Status Report states
  const [showReportModal, setShowReportModal] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [emailRecipients, setEmailRecipients] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Fetch Customer details for report emailing defaults
  useEffect(() => {
    if (showReportModal && job?.customerId && tenantId) {
      const fetchCustomer = async () => {
        try {
          const snap = await getDoc(doc(db, `businesses/${tenantId}/customers`, job.customerId));
          if (snap.exists()) {
            const email = snap.data()?.email || '';
            setCustomerEmail(email);
            setEmailRecipients(email); // Default the recipient to the customer's email!
          }
        } catch (e) {
          console.error("Error fetching customer email:", e);
        }
      };
      fetchCustomer();
    }
  }, [showReportModal, job?.customerId, tenantId]);

  // Set default subject once job loads
  useEffect(() => {
    if (job) {
      setEmailSubject(`Job Status Report: ${job.title} ${job.jobNumber ? `#${job.jobNumber}` : ''}`);
    }
  }, [job]);

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
      toast.error("You don't have permission to view this job.");
    });
    return () => unsub();
  }, [jobId, tenantId]);

  // Fetch Tasks
  useEffect(() => {
    if (!jobId || !tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTasksLoaded(true);
    }, (err) => {
      console.error("Tasks listener error:", err);
    });
    return () => unsub();
  }, [jobId, tenantId]);

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

  const isUserClockedIntoTask = (userId: string, taskId: string, staffName?: string) => {
    return timeLogs.some(session => {
      const isSessionActive = session.status === 'active' || session.status === 'on_break';
      if (!isSessionActive) return false;

      const matchesUid = session.userId === userId;
      const sessionName = (session.userName || session.staffName || '').toLowerCase().trim();
      const targetName = (staffName || '').toLowerCase().trim();
      const matchesName = targetName && sessionName && (sessionName === targetName);
      
      return (matchesUid || matchesName) && 
        (session.jobs || []).some((j: any) => !j.end && j.id === jobId && j.taskId === taskId);
    });
  };

  const handleClockOther = async (targetUid: string, targetName: string, taskId: string, taskTitle: string, action: 'in' | 'out') => {
    try {
      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('status', 'in', ['active', 'on_break'])
      );
      const snap = await getDocs(q);
      const activeSession = snap.empty ? null : snap.docs.map(d => ({ id: d.id, ...d.data() as any })).find(session => {
        const matchesUid = session.userId === targetUid;
        const sessionName = (session.userName || session.staffName || '').toLowerCase().trim();
        const targetLower = (targetName || '').toLowerCase().trim();
        const matchesName = targetLower && sessionName && (sessionName === targetLower);
        return matchesUid || matchesName;
      }) || null;

      if (action === 'in') {
        let bookTime = 0;
        try {
          const taskSnap = await getDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId));
          if (taskSnap.exists()) {
            bookTime = parseFloat(taskSnap.data().bookTime) || 0;
          }
        } catch (err) {
          console.warn('Could not fetch task bookTime', err);
        }

        if (activeSession) {
          const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
          const jobs = [...(activeSession.jobs || [])];
          
          const isAlreadyClockedIn = jobs.some((j: any) => !j.end && j.id === jobId && j.taskId === taskId);
          if (isAlreadyClockedIn) {
            toast.info(`${targetName} is already clocked into this task.`);
            return;
          }

          jobs.push({
            id: jobId,
            name: job.title,
            taskId: taskId || null,
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
            { targetUid, targetName, taskId, taskTitle }
          );
          
          toast.success(`Clocked ${targetName} into ${taskTitle}`);
        } else {
          await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
            userId: targetUid,
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
                taskId: taskId || null,
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
            { targetUid, targetName, taskId, taskTitle }
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
          if (!j.end && j.id === jobId && j.taskId === taskId) {
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
            { targetUid, targetName, taskId, taskTitle }
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

  const [tasksLoaded, setTasksLoaded] = useState(false);
  const addingGeneralRef = useRef(false);

  // Auto-add "General" task if missing
  useEffect(() => {
    if (!jobId || !tenantId || !job || !tasksLoaded) return;
    
    const hasGeneral = tasks.some(t => t.title === 'General');
    if (!hasGeneral && !addingGeneralRef.current) {
      addingGeneralRef.current = true;
      const addGeneralTask = async () => {
        try {
          const q = query(
            collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`),
            where('title', '==', 'General')
          );
          const snap = await getDocs(q);
          if (snap.empty) {
            await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), {
              title: 'General',
              description: 'General shop work and cleanup',
              bookTime: 0,
              status: 'pending',
              tenantId: tenantId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        } catch (e) {
          console.error("Error adding general task:", e);
          addingGeneralRef.current = false;
        }
      };
      addGeneralTask();
    }
  }, [tasks, tasksLoaded, jobId, tenantId, !!job]);

  // Fetch Parts
  useEffect(() => {
    if (!jobId || !tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/parts_requests`),
      where('jobId', '==', jobId)
    );
    const unsub = onSnapshot(q, (snap) => {
      setParts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("Parts listener error:", err);
      setParts([]); // Fallback to empty parts if permission denied
    });
    return () => unsub();
  }, [jobId, tenantId]);

  // Fetch Departments
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("Departments listener error:", err);
    });
    return () => unsub();
  }, [tenantId]);

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
      const activeSession = snap.docs.find(d => {
        const data = d.data();
        const matchesUid = data.userId === effectiveUserId;
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
  }, [tenantId, effectiveUserId, staffMember?.name]);

  // Fetch Zones
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Zones listener error:", err));
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!jobId || !tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/jobs/${jobId}/activity`), (snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Manual sort since index might not exist yet
      logs.sort((a: any, b: any) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });
      setActivityLogs(logs);
    }, (err) => console.error("Activity listener error:", err));
    return () => unsub();
  }, [jobId, tenantId]);

  const getTaskLoggedMs = (taskId: string) => {
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

  const formatMs = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const formatSmartDuration = (seconds: number, includeSeconds: boolean = false) => {
    if (seconds <= 0) return '0m';
    
    const years = Math.floor(seconds / 31536000);
    const months = Math.floor((seconds % 31536000) / 2592000);
    const days = Math.floor((seconds % 2592000) / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (years > 0) return `${years}y ${months}mo`;
    if (months > 0) return `${months}mo ${days}d`;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (includeSeconds && seconds < 3600) return `${minutes}m ${secs}s`;
    return `${minutes}m`;
  };

  const formatJobDate = (dateVal: any) => {
    if (!dateVal) return 'Not Set';
    const date = new Date(dateVal?.seconds ? dateVal.seconds * 1000 : dateVal);
    if (isNaN(date.getTime())) return 'Not Set';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const handleTaskStatusChange = async (taskId: string, currentStatus: string, action?: 'pass' | 'fail') => {
    let nextStatus = '';
    if (currentStatus === 'pending' || currentStatus === 'in_progress' || currentStatus === 'Rework') {
      nextStatus = 'QC'; // Mark complete -> Needs QC
    } else if (currentStatus === 'QC') {
      if (action === 'fail') {
        nextStatus = 'Rework';
      } else {
        nextStatus = 'QC Complete';
      }
    } else {
      return;
    }

    try {
      const task = tasks.find(t => t.id === taskId);
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

      // 1. Update the task
      await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), updateData);
      toast.success(`Task marked as ${nextStatus}`);

      // Automatically assign task to QC staff if status is QC
      if (nextStatus === 'QC') {
        await assignQCStaffToTask(tenantId, jobId, taskId);
      }

      // Auto clock out anyone clocked into this task since it is complete/ready for QC/rework
      if (nextStatus === 'QC' || nextStatus === 'QC Complete' || nextStatus === 'Rework') {
        await clockOutOfJob(jobId, taskId);
        // Also clock out any other tech clocked in
        const q = query(
          collection(db, `businesses/${tenantId}/time_sessions`),
          where("status", "==", "active")
        );
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(async (sessionDoc) => {
          const data = sessionDoc.data();
          const jobs = data.jobs || [];
          let updated = false;
          const updatedJobs = jobs.map((j: any) => {
            if (!j.end && j.id === jobId && j.taskId === taskId) {
              updated = true;
              return { ...j, end: new Date() };
            }
            return j;
          });
          if (updated) {
            await updateDoc(sessionDoc.ref, {
              jobs: updatedJobs,
              jobIds: Array.from(new Set(updatedJobs.map((j: any) => j.id))),
              updatedAt: serverTimestamp()
            });
          }
        }));
      }

    } catch (e) {
      console.error(e);
      toast.error('Failed to update task status');
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
      
      const updatedBlockers = [...(job.blockers || []), newBlocker];
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        blockers: updatedBlockers,
        updatedAt: new Date()
      });
      await logActivity('blocker_added', `Added blocker: ${newBlockerMsg.trim()}`);
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
      const updatedBlockers = (job.blockers || []).map((b: any) => 
        b.id === blockerId ? { ...b, status: 'resolved', resolvedAt: new Date().toISOString(), resolvedBy: user?.displayName || user?.email } : b
      );
      
      const blocker = (job.blockers || []).find((b: any) => b.id === blockerId);
      
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        blockers: updatedBlockers,
        updatedAt: new Date()
      });

      await logActivity('blocker_resolved', `Resolved blocker: ${blocker?.message || 'Unknown'}`);
      toast.success('Blocker resolved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to resolve blocker');
    }
  };

  const logActivity = async (type: string, message: string, metadata: any = {}) => {
    try {
      const activityData = {
        type,
        message,
        metadata,
        timestamp: new Date(),
        staffId: user?.uid,
        staffName: user?.displayName || user?.email || 'Staff'
      };

      // 1. Write to local subcollection
      const docRef = await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/activity`), activityData);

      // 2. Write to global activity feed (if job is loaded)
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
          ...metadata
        }
      });
    } catch (err) {
      console.error("Activity logging error:", err);
    }
  };
  
  const handlePartStatusChange = async (partId: string, nextStatus: string) => {
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/parts_requests`, partId), {
        status: nextStatus,
        updatedAt: new Date()
      });
      
      const part = parts.find(p => p.id === partId);
      await logActivity('part_status_changed', `Marked part ${part?.partName || ''} as ${nextStatus.toUpperCase()}`);
      
      toast.success(`Part marked as ${nextStatus}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to update part status');
    }
  };

  const handleZoneChange = async (newZoneId: string) => {
    try {
      const previousZone = zones.find(z => z.currentJobId === jobId);
      const now = new Date();
      
      if (previousZone && previousZone.id !== newZoneId) {
        // If leaving a bay or parking spot, update total time
        const isBay = previousZone.type === 'bay';
        const isParking = previousZone.type === 'parking' || previousZone.type === 'lot';

        if ((isBay || isParking)) {
          const lastAssigned = previousZone.lastAssignedAt?.seconds ? previousZone.lastAssignedAt.seconds * 1000 : (previousZone.lastAssignedAt || previousZone.updatedAt || Date.now());
          const durationSeconds = Math.max(0, Math.floor((now.getTime() - new Date(lastAssigned).getTime()) / 1000));
          
          const updateData: any = {
            updatedAt: serverTimestamp()
          };

          if (isBay) {
            updateData.totalBayTimeSeconds = (job.totalBayTimeSeconds || 0) + durationSeconds;
            updateData.currentBaySessionStart = null;
          } else if (isParking) {
            updateData.totalParkingTimeSeconds = (job.totalParkingTimeSeconds || 0) + durationSeconds;
            updateData.currentParkingSessionStart = null;
          }

          await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), updateData);
        }

        await updateDoc(doc(db, `businesses/${tenantId}/zones`, previousZone.id), {
          currentJobId: null,
          currentVehicleVin: null,
          updatedAt: serverTimestamp()
        });
      }

      const newZone = zones.find(z => z.id === newZoneId);

      if (newZoneId) {
        // Handle entering a new zone
        const isBay = newZone?.type === 'bay';
        const isParking = newZone?.type === 'parking' || newZone?.type === 'lot';

        const jobUpdate: any = {
          updatedAt: serverTimestamp()
        };

        if (isBay) {
          jobUpdate.currentBaySessionStart = serverTimestamp();
          jobUpdate.currentParkingSessionStart = null;
        } else if (isParking) {
          jobUpdate.currentParkingSessionStart = serverTimestamp();
          jobUpdate.currentBaySessionStart = null;
        } else {
          jobUpdate.currentBaySessionStart = null;
          jobUpdate.currentParkingSessionStart = null;
        }

        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), jobUpdate);

        await updateDoc(doc(db, `businesses/${tenantId}/zones`, newZoneId), {
          currentJobId: jobId,
          currentVehicleVin: job.vehicleId || null,
          lastAssignedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      
      await logActivity('location_changed', `Moved vehicle to ${newZone?.name || 'OFF-SITE'}`);
      
      toast.success('Parking location updated');
    } catch (err) {
      console.error(err);
      toast.error('Failed to update parking location');
    }
  };

  const handleNoChange = async () => {
    if (!isSuperAdmin && !permissions['jobs.manage']) {
      toast.error('You do not have permission to perform this action');
      return;
    }
    try {
      await logActivity('patrol_check', 'Patrol Check: Confirmed no changes needed at this time.');
      
      // Update job to trigger "Just Updated" on boards
      const jobUpdate = {
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), jobUpdate);

      // Also update the zone if this job is currently assigned to one
      const zoneId = job.currentZoneId || zones.find(z => z.currentJobId === jobId)?.id;
      if (zoneId) {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), {
          updatedAt: serverTimestamp()
        });
      }

      toast.success('Check recorded');
      navigate(-1);
    } catch (e) {
      console.error(e);
      toast.error('Failed to record check');
    }
  };


  // Progression & Regression Logic Hook
  useEffect(() => {
    if (!tasks.length || !job || !tenantId || !jobId) return;

    const nonGeneralTasks = tasks.filter(t => t.title !== 'General');
    if (nonGeneralTasks.length === 0) return;

    const allQCReady = nonGeneralTasks.every(t => t.status === 'QC' || t.status === 'QC Complete');
    const allQCComplete = nonGeneralTasks.every(t => t.status === 'QC Complete');

    const updateJobStatus = async (newStatus: string, msg: string, isReversion = false) => {
      if (job.status === newStatus) return;
      try {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
          status: newStatus,
          updatedAt: new Date()
        });
        if (isReversion) {
          toast.error(msg);
        } else {
          toast.success(msg);
        }

        // Automatically assign job to QC staff if status is Ready for QA
        if (newStatus === 'Ready for QA') {
          await assignQCStaffToJob(tenantId, jobId);
        }
      } catch (e) {
        console.error("Auto-progression/regression error:", e);
      }
    };

    // Progression: If Active/Open/Ready for QA, progress forward if all tasks are ready
    if (['Active', 'Open', 'Ready for QA'].includes(job.status)) {
      if (allQCComplete) {
        updateJobStatus('Ready for Customer', 'Job ready for customer!');
      } else if (allQCReady) {
        updateJobStatus('Ready for QA', 'Job ready for QA inspection');
      }
    }

    // Regression: If currently Ready for Customer or Ready for QA, but tasks were reopened or added
    if (['Ready for Customer', 'Ready for QA'].includes(job.status)) {
      if (!allQCReady) {
        // There are unfinished tasks, so job must go back to Active
        updateJobStatus('Active', 'Tasks reopened: Job status set to Active', true);
      } else if (job.status === 'Ready for Customer' && !allQCComplete) {
        // All tasks are at least QC Ready, but not all are QC Complete, so job must go back to Ready for QA
        updateJobStatus('Ready for QA', 'QC tasks pending: Job status reverted to Ready for QA', true);
      }
    }
  }, [tasks, job?.status, tenantId, jobId]);

  // Blocker Status Sync Logic
  useEffect(() => {
    if (!job || !tenantId || !jobId) return;
    
    const activeBlockers = (job.blockers || []).filter((b: any) => b.status === 'active');
    const hasBlockers = activeBlockers.length > 0;
    
    // 1. If has blockers but status is NOT Blocked, force to Blocked
    if (hasBlockers && job.status !== 'Blocked') {
      const syncStatus = async () => {
        try {
          await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
            status: 'Blocked',
            updatedAt: new Date()
          });
          toast.error('Job status moved to Blocked');
          await logActivity('status_changed', 'Job status automatically moved to BLOCKED');
        } catch (e) {
          console.error("Status sync error:", e);
        }
      };
      syncStatus();
    }
    
    // 2. If NO blockers but status IS Blocked, revert to Active
    if (!hasBlockers && job.status === 'Blocked') {
      const syncStatus = async () => {
        try {
          await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
            status: 'Active',
            updatedAt: new Date()
          });
          toast.success('Job restored to Active status');
          await logActivity('status_changed', 'Job status automatically restored to ACTIVE');
        } catch (e) {
          console.error("Status sync error:", e);
        }
      };
      syncStatus();
    }
  }, [job?.blockers, job?.status, tenantId, jobId]);
  
  // Progress Calculation Logic
  const canViewAll = isSuperAdmin || permissions['jobs.view'] || permissions['tasks.view'];
  const visibleTasks = canViewAll ? tasks : tasks.filter(task => {
    const isAssigned = 
      task.assignedStaffIds?.includes(effectiveUserId) || 
      task.assignedStaff?.some((s: any) => (s.uid || s.id) === effectiveUserId) ||
      (staffMember?.id && (
        task.assignedStaffIds?.includes(staffMember.id) || 
        task.assignedStaff?.some((s: any) => (s.uid || s.id) === staffMember.id)
      ));
    return task.title === 'General' || isAssigned || (permissions['jobs.qc'] && task.status === 'QC');
  });

  const nonGeneralTasks = visibleTasks.filter(t => t.title !== 'General');
  const totalBookHours = nonGeneralTasks.reduce((acc, t) => acc + (parseFloat(t.bookTime) || 0), 0);
  const completedBookHours = nonGeneralTasks
    .filter(t => t.status === 'QC' || t.status === 'QC Complete')
    .reduce((acc, t) => acc + (parseFloat(t.bookTime) || 0), 0);
  
  const jobProgress = totalBookHours > 0 
    ? Math.round((completedBookHours / totalBookHours) * 100) 
    : 0;

  // Total and Per-Staff Allotted Tasks Calculations
  const totalTasks = visibleTasks.length;
  const completedTasks = visibleTasks.filter(t => t.status === 'QC' || t.status === 'QC Complete').length;

  const staffStats = (() => {
    const statsMap: Record<string, {
      name: string;
      id: string;
      totalHours: number;
      completedHours: number;
      totalTasks: number;
      completedTasks: number;
    }> = {};

    visibleTasks.forEach(task => {
      const isCompleted = task.status === 'QC' || task.status === 'QC Complete';
      const bookTime = parseFloat(task.bookTime) || 0;
      
      const assignedStaff = task.assignedStaff || [];
      if (assignedStaff.length === 0) {
        const staffId = 'unassigned';
        const staffName = 'Unassigned';
        if (!statsMap[staffId]) {
          statsMap[staffId] = {
            name: staffName,
            id: staffId,
            totalHours: 0,
            completedHours: 0,
            totalTasks: 0,
            completedTasks: 0
          };
        }
        statsMap[staffId].totalHours += bookTime;
        statsMap[staffId].totalTasks += 1;
        if (isCompleted) {
          statsMap[staffId].completedHours += bookTime;
          statsMap[staffId].completedTasks += 1;
        }
      } else {
        assignedStaff.forEach((staff: any) => {
          const staffId = staff.id || staff.uid;
          const staffName = staff.name || staff.displayName || 'Technician';
          
          if (!statsMap[staffId]) {
            statsMap[staffId] = {
              name: staffName,
              id: staffId,
              totalHours: 0,
              completedHours: 0,
              totalTasks: 0,
              completedTasks: 0
            };
          }
          
          statsMap[staffId].totalHours += bookTime;
          statsMap[staffId].totalTasks += 1;
          if (isCompleted) {
            statsMap[staffId].completedHours += bookTime;
            statsMap[staffId].completedTasks += 1;
          }
        });
      }
    });

    return Object.values(statsMap).sort((a, b) => {
      if (a.id === 'unassigned') return 1;
      if (b.id === 'unassigned') return -1;
      return a.name.localeCompare(b.name);
    });
  })();

  const projectWorkingHours = (startDate: Date, totalHours: number, schedule: any) => {
    if (totalHours <= 0) return startDate;
    
    // Default schedule: Mon-Fri, 08:00 - 17:00
    const days = schedule?.days || [1, 2, 3, 4, 5];
    const startStr = schedule?.startTime || "08:00";
    const endStr = schedule?.endTime || "17:00";
    
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    
    const dailyWorkMs = ((endH * 60 + endM) - (startH * 60 + startM)) * 60000;
    if (dailyWorkMs <= 0 || days.length === 0) return startDate; // Fallback to avoid infinite loop
    
    let current = new Date(startDate);
    let remainingMs = totalHours * 3600000;
    
    while (remainingMs > 0) {
      const dayOfWeek = current.getDay();
      const mappedDay = dayOfWeek === 0 ? 7 : dayOfWeek; // Map Sunday (0) to 7
      
      if (!days.includes(mappedDay)) {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        continue;
      }
      
      const startOfShift = new Date(current);
      startOfShift.setHours(startH, startM, 0, 0);
      
      const endOfShift = new Date(current);
      endOfShift.setHours(endH, endM, 0, 0);
      
      if (current >= endOfShift) {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        continue;
      }
      
      if (current < startOfShift) {
        current = new Date(startOfShift);
      }
      
      const msLeftInShift = endOfShift.getTime() - current.getTime();
      
      if (remainingMs <= msLeftInShift) {
        current = new Date(current.getTime() + remainingMs);
        remainingMs = 0;
      } else {
        remainingMs -= msLeftInShift;
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
      }
    }
    
    return current;
  };

  const calculateDynamicETA = () => {
    const incompleteTasks = nonGeneralTasks.filter(t => t.status !== 'QC Complete' && t.status !== 'QC');
    
    if (incompleteTasks.length === 0 && (job?.status === 'Ready for Customer' || job?.status === 'Completed')) {
       return null;
    }
    if (incompleteTasks.length === 0) {
       // if finished tasks but status isn't updated yet, or just fallback to job's expected finish time
       return job?.expectedFinishTime ? new Date(job.expectedFinishTime?.seconds ? job.expectedFinishTime.seconds * 1000 : job.expectedFinishTime) : null;
    }
    
    const deptHours: Record<string, number> = {};
    incompleteTasks.forEach(t => {
      const d = t.departmentId || 'unassigned';
      deptHours[d] = (deptHours[d] || 0) + (parseFloat(t.bookTime) || 0);
    });

    const totalHours = Object.values(deptHours).reduce((sum, h) => sum + h, 0);
    if (totalHours <= 0) {
      return null;
    }
    
    const nowTime = new Date();
    let maxETA = nowTime;
    
    Object.entries(deptHours).forEach(([deptId, hours]) => {
      const dept = departments.find(d => d.id === deptId);
      const schedule = dept?.defaultSchedule;
      const eta = projectWorkingHours(nowTime, hours, schedule);
      if (eta > maxETA) {
        maxETA = eta;
      }
    });
    
    return maxETA;
  };

  const dynamicETA = calculateDynamicETA();

  if (!job || (!tasksLoaded && !isSuperAdmin && !permissions['jobs.view'])) return (
    <div className="flex items-center justify-center p-12">
      <Clock className="w-8 h-8 text-indigo-500 animate-spin" />
    </div>
  );

  const canPerformQC = isSuperAdmin || permissions['jobs.qc'];
  const hasAccess = isSuperAdmin || permissions['jobs.view'] || canPerformQC || tasks.some(task => {
    const isAssigned = task.assignedStaffIds?.includes(effectiveUserId) || 
      task.assignedStaff?.some((s: any) => (s.uid || s.id) === effectiveUserId) ||
      (staffMember?.id && (
        task.assignedStaffIds?.includes(staffMember.id) || 
        task.assignedStaff?.some((s: any) => (s.uid || s.id) === staffMember.id)
      ));
    return !!isAssigned;
  });

  if (!hasAccess) {
    return (
      <div className="p-12 text-center animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-10 h-10 text-rose-500" />
        </div>
        <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-2">Access Restricted</h3>
        <p className="text-zinc-500 max-w-sm mx-auto">
          Your account does not have the required permissions to access this department. Please contact your administrator for elevated access.
        </p>
      </div>
    );
  }

  const scheduledBay = zones.find(z => z.id === job.bayId || z.name === job.bayId)?.name || job.bayId || 'Not Set';

  const etaComparison = (() => {
    if (!dynamicETA || !job.scheduledEndDate) return null;
    const deadlineDate = new Date(job.scheduledEndDate?.seconds ? job.scheduledEndDate.seconds * 1000 : job.scheduledEndDate);
    const diffMs = deadlineDate.getTime() - dynamicETA.getTime();
    const diffHours = diffMs / 3600000;
    
    if (Math.abs(diffHours) < 0.1) {
      return { status: 'on-time', text: 'On Track / On Time' };
    } else if (diffHours > 0) {
    }
  })();

  const jobEfficiencyStats = (() => {
    let totalBook = 0;
    let totalActual = 0;

    tasks.forEach(task => {
      if (task.isAccidental) return;
      
      const bookHours = parseFloat(task.bookTime) || 0;
      const loggedMs = getTaskLoggedMs(task.id);
      const actualHours = task.actualTime !== undefined && task.actualTime > 0 
        ? task.actualTime 
        : (loggedMs / 3600000);

      if (task.title !== 'General') {
        totalBook += bookHours;
      }
      totalActual += actualHours;
    });

    const efficiency = totalActual > 0 ? (totalBook / totalActual) * 100 : null;
    const variance = totalActual - totalBook;

    return {
      totalBook,
      totalActual,
      efficiency,
      variance
    };
  })();

  const generateEmailHtml = () => {
    // Generate tasks lists
    const completedTasksList = tasks.filter(t => t.status === 'QC' || t.status === 'QC Complete');
    const incompleteTasksList = tasks.filter(t => t.status !== 'QC' && t.status !== 'QC Complete');
    const missingPartsList = parts.filter(p => p.status !== 'received' && p.status !== 'delivered' && p.status !== 'fulfilled');

    const doneHtml = completedTasksList.length === 0 
      ? '<tr><td style="padding: 10px; color: #71717a; font-style: italic;">No tasks completed yet.</td></tr>'
      : completedTasksList.map(t => {
          const staffNames = t.assignedStaff?.map((s: any) => s.name || s.displayName).join(', ') || 'Unassigned';
          const loggedMs = getTaskLoggedMs(t.id);
          const clockedHours = t.actualTime !== undefined && t.actualTime > 0 ? t.actualTime : (loggedMs / 3600000);
          const bookHours = parseFloat(t.bookTime) || 0;
          const isOverBook = !t.isAccidental && t.title !== 'General' && bookHours > 0 && clockedHours > bookHours;
          const diff = clockedHours - bookHours;

          return `
            <tr style="border-bottom: 1px solid #e4e4e7;">
              <td style="padding: 12px 10px;">
                <div style="font-weight: bold; color: #18181b;">${t.title}</div>
                ${t.description ? `<div style="font-size: 12px; color: #71717a; margin-top: 2px;">${t.description}</div>` : ''}
                <div style="font-size: 11px; color: #10b981; font-weight: 600; margin-top: 4px;">Completed by: ${staffNames}</div>
                ${t.title !== 'General' && bookHours > 0 ? `
                  <div style="font-size: 11px; color: #64748b; font-weight: 600; margin-top: 4px; font-family: monospace;">
                    Budget: ${bookHours}h &bull; Actual: ${clockedHours.toFixed(1)}h
                    ${isOverBook ? `
                      <span style="color: #ef4444; background: #fee2e2; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; margin-left: 6px;">
                        +${diff.toFixed(1)}h Over
                      </span>
                    ` : `
                      <span style="color: #10b981; background: #dcfce7; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; margin-left: 6px;">
                        Under Budget
                      </span>
                    `}
                  </div>
                ` : ''}
              </td>
              <td style="padding: 12px 10px; font-family: monospace; font-weight: bold; text-align: right; color: #10b981;">
                ${clockedHours.toFixed(1)}h
              </td>
            </tr>
          `;
        }).join('');

    const needDoneHtml = incompleteTasksList.length === 0
      ? '<tr><td style="padding: 10px; color: #71717a; font-style: italic;">All tasks are complete!</td></tr>'
      : incompleteTasksList.map(t => {
          const staffNames = t.assignedStaff?.map((s: any) => s.name || s.displayName).join(', ') || 'Unassigned';
          const loggedMs = getTaskLoggedMs(t.id);
          const clockedHours = t.actualTime !== undefined && t.actualTime > 0 ? t.actualTime : (loggedMs / 3600000);
          const bookHours = parseFloat(t.bookTime) || 0;
          const isOverBook = !t.isAccidental && t.title !== 'General' && bookHours > 0 && clockedHours > bookHours;
          const diff = clockedHours - bookHours;

          return `
            <tr style="border-bottom: 1px solid #e4e4e7;">
              <td style="padding: 12px 10px;">
                <div style="font-weight: bold; color: #18181b;">${t.title}</div>
                ${t.description ? `<div style="font-size: 12px; color: #71717a; margin-top: 2px;">${t.description}</div>` : ''}
                <div style="font-size: 11px; color: #6366f1; font-weight: 600; margin-top: 4px;">Assigned: ${staffNames}</div>
                ${t.title !== 'General' && bookHours > 0 ? `
                  <div style="font-size: 11px; color: #64748b; font-weight: 600; margin-top: 4px; font-family: monospace;">
                    Budget: ${bookHours}h &bull; Actual: ${clockedHours.toFixed(1)}h
                    ${isOverBook ? `
                      <span style="color: #ef4444; background: #fee2e2; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; margin-left: 6px;">
                        +${diff.toFixed(1)}h Over
                      </span>
                    ` : ''}
                  </div>
                ` : ''}
              </td>
              <td style="padding: 12px 10px; font-family: monospace; text-align: right; color: #4f46e5; font-weight: bold;">
                ${clockedHours.toFixed(1)}h
              </td>
            </tr>
          `;
        }).join('');

    const partsHtml = missingPartsList.length === 0
      ? '<tr><td style="padding: 10px; color: #71717a; font-style: italic;">No pending parts.</td></tr>'
      : missingPartsList.map(p => `
        <tr style="border-bottom: 1px solid #e4e4e7;">
          <td style="padding: 12px 10px;">
            <div style="font-weight: bold; color: #18181b;">${p.partName}</div>
            <div style="font-size: 11px; color: #71717a; margin-top: 2px;">
              Qty: ${p.quantity || 1} &bull; ${p.taskTitle ? `Task: ${p.taskTitle}` : 'General Part'}
            </div>
          </td>
          <td style="padding: 12px 10px; text-align: right;">
            <span style="background: #fef3c7; color: #d97706; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 6px; text-transform: uppercase;">
              ${p.status || 'requested'}
            </span>
          </td>
        </tr>
      `).join('');

    const staffWorkloadHtml = staffStats.length === 0
      ? '<p style="color: #71717a; font-style: italic; font-size: 13px;">No staff allocated.</p>'
      : `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="border-bottom: 2px solid #e4e4e7; text-align: left; color: #71717a; font-weight: 800; font-size: 11px; text-transform: uppercase;">
              <th style="padding: 8px 10px;">Staff Member</th>
              <th style="padding: 8px 10px; text-align: center;">Tasks (Done / Total)</th>
              <th style="padding: 8px 10px; text-align: right;">Hours (Done / Total)</th>
            </tr>
          </thead>
          <tbody>
            ${staffStats.map(s => `
              <tr style="border-bottom: 1px solid #e4e4e7;">
                <td style="padding: 10px; font-weight: bold; color: #18181b;">${s.name}</td>
                <td style="padding: 10px; text-align: center; color: #4b5563;">${s.completedTasks} / ${s.totalTasks}</td>
                <td style="padding: 10px; text-align: right; font-family: monospace; font-weight: bold; color: #18181b;">
                  ${s.completedHours.toFixed(1)} / ${s.totalHours.toFixed(1)}h
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

    const efficiencyHtml = jobEfficiencyStats.totalActual > 0 ? `
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 14px; font-weight: 900; color: #1e1b4b; border-bottom: 2px solid #1e1b4b; padding-bottom: 4px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
          📈 JOB EFFICIENCY REPORT
        </h2>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 10px; width: 45%;">Total Book Allotment</td>
              <td style="padding: 6px 0; font-family: monospace; font-weight: bold; color: #0f172a; font-size: 14px;">${jobEfficiencyStats.totalBook.toFixed(1)}h</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 10px;">Total Clocked Hours</td>
              <td style="padding: 6px 0; font-family: monospace; font-weight: bold; color: #0f172a; font-size: 14px;">${jobEfficiencyStats.totalActual.toFixed(1)}h</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 10px;">Variance</td>
              <td style="padding: 6px 0; font-family: monospace; font-weight: bold; color: ${jobEfficiencyStats.variance > 0.1 ? '#ef4444' : '#10b981'}; font-size: 14px;">
                ${jobEfficiencyStats.variance > 0 ? `+${jobEfficiencyStats.variance.toFixed(1)}h` : `${jobEfficiencyStats.variance.toFixed(1)}h`}
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 10px;">Overall Efficiency</td>
              <td style="padding: 6px 0; font-family: monospace; font-weight: bold; font-size: 15px;">
                <span style="background: ${jobEfficiencyStats.efficiency && jobEfficiencyStats.efficiency >= 100 ? '#dcfce7' : '#fee2e2'}; color: ${jobEfficiencyStats.efficiency && jobEfficiencyStats.efficiency >= 100 ? '#15803d' : '#b91c1c'}; padding: 2px 8px; border-radius: 6px;">
                  ${jobEfficiencyStats.efficiency ? `${jobEfficiencyStats.efficiency.toFixed(0)}%` : 'N/A'}
                </span>
              </td>
            </tr>
          </table>
          <div style="font-size: 12px; color: #475569; margin-top: 12px; padding-top: 10px; border-top: 1px solid #e2e8f0;">
            ${jobEfficiencyStats.efficiency && jobEfficiencyStats.efficiency >= 100 ? `
              🎉 The team completed this job <strong>${(jobEfficiencyStats.efficiency - 100).toFixed(0)}% more efficiently</strong> than the allotted book time budget.
            ` : jobEfficiencyStats.efficiency ? `
              ⚠️ The job ran <strong>${(100 - jobEfficiencyStats.efficiency).toFixed(0)}% over</strong> the budgeted book time allotment.
            ` : ''}
          </div>
        </div>
      </div>
    ` : '';

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; padding: 30px 15px; color: #18181b;">
        <div style="max-width: 650px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border: 1px solid #e4e4e7;">
          
          <div style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color: white; padding: 30px 24px;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px;">JOB STATUS REPORT</h1>
            <p style="margin: 6px 0 0 0; font-size: 14px; color: #c7d2fe; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
              ${job.customerName || 'Walk-in Customer'} &bull; Job ${job.jobNumber ? `#${job.jobNumber}` : 'NATIVE'}
            </p>
          </div>

          <div style="padding: 24px;">
            <div style="background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                  <td style="padding: 6px 0; color: #7c3aed; font-weight: bold; text-transform: uppercase; font-size: 10px; width: 35%;">Job Title</td>
                  <td style="padding: 6px 0; font-weight: bold; color: #1e1b4b; font-size: 14px;">${job.title}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #7c3aed; font-weight: bold; text-transform: uppercase; font-size: 10px;">Status</td>
                  <td style="padding: 6px 0; font-weight: bold; color: #18181b;">${job.status}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #7c3aed; font-weight: bold; text-transform: uppercase; font-size: 10px;">Vehicle ID</td>
                  <td style="padding: 6px 0; font-weight: bold; font-family: monospace; color: #18181b;">${job.vehicleId || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #7c3aed; font-weight: bold; text-transform: uppercase; font-size: 10px;">Scheduled Bay</td>
                  <td style="padding: 6px 0; font-weight: bold; color: #18181b;">${scheduledBay}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #7c3aed; font-weight: bold; text-transform: uppercase; font-size: 10px;">Scheduled Start</td>
                  <td style="padding: 6px 0; font-weight: bold; color: #18181b;">${formatJobDate(job.scheduledStartDate)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #7c3aed; font-weight: bold; text-transform: uppercase; font-size: 10px;">Deadline / Expected End</td>
                  <td style="padding: 6px 0; font-weight: bold; color: #18181b;">${formatJobDate(job.scheduledEndDate)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #7c3aed; font-weight: bold; text-transform: uppercase; font-size: 10px;">Dynamic ETA</td>
                  <td style="padding: 6px 0; font-weight: bold; color: #6366f1;">${dynamicETA ? formatJobDate(dynamicETA) : 'Completed / N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0 6px 0; color: #7c3aed; font-weight: bold; text-transform: uppercase; font-size: 10px;">Total Job Progress</td>
                  <td style="padding: 10px 0 6px 0;">
                    <div style="font-weight: 800; font-size: 15px; color: #4f46e5; margin-bottom: 4px;">${jobProgress}% Complete</div>
                    <div style="background: #e4e4e7; border-radius: 99px; height: 10px; width: 100%; overflow: hidden;">
                      <div style="background: #6366f1; height: 100%; border-radius: 99px; width: ${jobProgress}%;"></div>
                    </div>
                  </td>
                </tr>
              </table>
            </div>

            <div style="margin-bottom: 24px;">
              <h2 style="font-size: 14px; font-weight: 900; color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 4px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                ✔ WHAT'S DONE
              </h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                ${doneHtml}
              </table>
            </div>

            <div style="margin-bottom: 24px;">
              <h2 style="font-size: 14px; font-weight: 900; color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 4px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                ⚙ WHAT NEEDS TO BE DONE
              </h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                ${needDoneHtml}
              </table>
            </div>

            <div style="margin-bottom: 24px;">
              <h2 style="font-size: 14px; font-weight: 900; color: #f59e0b; border-bottom: 2px solid #f59e0b; padding-bottom: 4px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                ⚠ MISSING / PENDING PARTS
              </h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                ${partsHtml}
              </table>
            </div>

            ${efficiencyHtml}

            <div style="margin-bottom: 12px;">
              <h2 style="font-size: 14px; font-weight: 900; color: #1f2937; border-bottom: 2px solid #1f2937; padding-bottom: 4px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                👤 STAFF ALLOCATION OVERVIEW
              </h2>
              ${staffWorkloadHtml}
            </div>

          </div>

          <div style="background: #f4f4f5; border-top: 1px solid #e4e4e7; padding: 20px; text-align: center; font-size: 11px; color: #71717a;">
            <p style="margin: 0 0 4px 0; font-weight: bold; color: #4b5563;">UpfittersOS &bull; SAE Group Operational Engine</p>
            <p style="margin: 0;">This report is a real-time snapshot generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}.</p>
          </div>

        </div>
      </div>
    `;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      {/* Header / Breadcrumbs */}
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
              <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white tracking-tight">{job.jobNumber ? `#${job.jobNumber} - ` : ''}{job.title}</h1>
              <span className={cn(
                "px-2 py-1 rounded text-xs font-black uppercase tracking-tighter",
                job.source === 'QuickBooks' ? "bg-blue-600 text-white" : "bg-zinc-900 text-white dark:bg-white dark:text-black"
              )}>
                {job.jobNumber ? `#${job.jobNumber}` : 'NATIVE'}
              </span>
            </div>
            <p className="text-base sm:text-lg font-bold text-zinc-500 mt-1">
              {job.customerName || 'Walk-in Customer'} • {job.vehicleId || 'No Vehicle Linked'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(isSuperAdmin || permissions['jobs.manage']) && (
            <>
              <button 
                onClick={handleNoChange}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                No Change
              </button>
              <button 
                onClick={() => navigate(`/business/${tenantId}/qr_hub?search=${job.jobNumber || job.id}`)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-850 dark:hover:bg-zinc-800 border border-zinc-800 text-white rounded-xl text-sm font-bold shadow-sm transition-all"
              >
                <Printer className="w-4 h-4 text-indigo-400" />
                Print QR
              </button>
              <button 
                onClick={() => setShowReportModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-750 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 border border-indigo-500/30 transition-all"
              >
                <FileText className="w-4 h-4 text-indigo-200" />
                Job Report
              </button>
              <button 
                onClick={() => navigate(`/business/${tenantId}/job/${jobId}/edit`)}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-sm font-bold shadow-sm transition-all"
              >
                <Edit3 className="w-4 h-4" />
                Edit Job
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Tasks */}
        <div className="lg:col-span-2 space-y-6">
          <div id="tasks-section" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl">
                  <Briefcase className="w-5 h-5 text-indigo-500" />
                </div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Tasks</h2>
              </div>
              
              {/* Task Search & Filter Controls */}
              {visibleTasks.length > 0 && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                  {/* Technician Filter Dropdown */}
                  <div className="relative w-full sm:w-48 group">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <Users className="w-4 h-4 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                    </span>
                    <select
                      value={selectedStaffFilter}
                      onChange={(e) => setSelectedStaffFilter(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:bg-white dark:focus:bg-zinc-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-bold text-zinc-700 dark:text-zinc-300 appearance-none cursor-pointer"
                    >
                      <option value="all">All Technicians</option>
                      <option value="unassigned">⚠️ Unassigned Tasks</option>
                      {staffStats
                        .filter(s => s.id !== 'unassigned')
                        .map(staff => (
                          <option key={staff.id} value={staff.id}>
                            👤 {staff.name}
                          </option>
                        ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-400 dark:text-zinc-650 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Task Search Bar */}
                  <div className="relative w-full sm:w-64 group">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <Search className="w-4 h-4 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search tasks..."
                      value={taskSearchQuery}
                      onChange={(e) => setTaskSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:bg-white dark:focus:bg-zinc-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all placeholder:text-zinc-400 font-medium"
                    />
                    {taskSearchQuery && (
                      <button
                        onClick={() => setTaskSearchQuery('')}
                        className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-200 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {visibleTasks.length === 0 ? (
                <div className="p-12 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800/50">
                  <p className="text-sm font-bold text-zinc-500">No tasks assigned to this job.</p>
                </div>
              ) : (
                (() => {
                  const filteredTasks = visibleTasks.filter(task => {
                    const query = taskSearchQuery.toLowerCase().trim();
                    const matchesQuery = !query || (
                      (task.title || '').toLowerCase().includes(query) ||
                      (task.description || '').toLowerCase().includes(query) ||
                      (task.taskGroup || '').toLowerCase().includes(query)
                    );

                    if (!matchesQuery) return false;

                    if (selectedStaffFilter === 'unassigned') {
                      return !task.assignedStaff || task.assignedStaff.length === 0;
                    }

                    if (selectedStaffFilter !== 'all') {
                      return task.assignedStaff?.some((s: any) => (s.id || s.uid) === selectedStaffFilter);
                    }

                    return true;
                  });

                  if (filteredTasks.length === 0) {
                    return (
                      <div className="p-12 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800/50 flex flex-col items-center justify-center gap-3 animate-in fade-in duration-200">
                        <AlertCircle className="w-8 h-8 text-zinc-400" />
                        <p className="text-sm font-bold text-zinc-500">No tasks match your search or filter.</p>
                        <button
                          onClick={() => { setTaskSearchQuery(''); setSelectedStaffFilter('all'); }}
                          className="text-xs font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-650 transition-colors"
                        >
                          Reset Filters
                        </button>
                      </div>
                    );
                  }

                  const activeTasksList = filteredTasks.filter(t => t.status !== 'completed' && t.status !== 'QC' && t.status !== 'QC Complete');
                  const completedTasksList = filteredTasks.filter(t => t.status === 'completed' || t.status === 'QC' || t.status === 'QC Complete');

                  const renderGroupedTasks = (tasksToRender: any[], sectionTitle?: string) => {
                    if (tasksToRender.length === 0) return null;

                    const grouped = tasksToRender.reduce((acc, task) => {
                      const group = task.taskGroup || 'Uncategorized';
                      if (!acc[group]) acc[group] = [];
                      acc[group].push(task);
                      return acc;
                    }, {} as Record<string, any[]>);

                    return (
                      <div className="space-y-6">
                        {sectionTitle && (
                          <div className="flex items-center gap-3 pt-6 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            <h3 className="text-sm font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-300">
                              {sectionTitle}
                            </h3>
                            <span className="text-xs bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full font-bold">
                              {tasksToRender.length}
                            </span>
                          </div>
                        )}
                        {Object.entries(grouped)
                          .sort(([a], [b]) => a === 'General' ? -1 : b === 'General' ? 1 : a.localeCompare(b))
                          .map(([group, tasksData]) => {
                            const groupTasks = tasksData as any[];
                            
                            // Progress Calculation
                            const allCategoryTasks = filteredTasks.filter(t => (t.taskGroup || 'Uncategorized') === group);
                            const totalBookHours = allCategoryTasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);
                            const completedHours = allCategoryTasks
                              .filter(t => t.status === 'QC' || t.status === 'QC Complete' || t.status === 'completed')
                              .reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);
                            
                            const groupProgress = totalBookHours > 0 ? Math.round((completedHours / totalBookHours) * 100) : 0;

                            return (
                              <div key={group} className="space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-800 mt-6 first:mt-0">
                                  <h4 className="text-sm font-black uppercase tracking-widest text-indigo-500">
                                    {sectionTitle ? `${group}, QC Task` : `${group}, Task`}
                                  </h4>
                                  {group !== 'General' && totalBookHours > 0 && (
                                    <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                                      <span className="text-[10px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-lg">
                                        {completedHours.toFixed(1)} / {totalBookHours.toFixed(1)}h Completed
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <div className="w-24 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden shrink-0">
                                          <div 
                                            className={cn(
                                              "h-full transition-all duration-1000",
                                              groupProgress === 100 ? "bg-emerald-500" : "bg-indigo-500"
                                            )}
                                            style={{ width: `${Math.min(100, groupProgress)}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] font-black text-zinc-400 w-8 text-right shrink-0">
                                          {groupProgress}%
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-4">
                                  {groupTasks.sort((a, b) => {
                                    const aLoggedMs = getTaskLoggedMs(a.id);
                                    const bLoggedMs = getTaskLoggedMs(b.id);
                                    const aHasTime = !a.isAccidental && ((a.actualTime !== undefined && a.actualTime > 0) || aLoggedMs > 0);
                                    const bHasTime = !b.isAccidental && ((b.actualTime !== undefined && b.actualTime > 0) || bLoggedMs > 0);

                                    if (aHasTime && !bHasTime) return -1;
                                    if (!aHasTime && bHasTime) return 1;

                                    const order: Record<string, number> = { 'Blocked': -1, 'pending': 0, 'in_progress': 0, 'QC': 1, 'QC Complete': 2 };
                                    const aOrder = order[a.status || 'pending'] ?? 0;
                                    const bOrder = order[b.status || 'pending'] ?? 0;
                                    return aOrder - bOrder;
                                  }).map(task => {
                                    const loggedMs = getTaskLoggedMs(task.id);
                                    const isAssigned = task.title === 'General' || 
                                                      isSuperAdmin || 
                                                      task.assignedStaffIds?.includes(effectiveUserId) || 
                                                      task.assignedStaff?.some((s: any) => s.uid === effectiveUserId || s.id === effectiveUserId) ||
                                                      (staffMember?.id && (
                                                        task.assignedStaffIds?.includes(staffMember.id) || 
                                                        task.assignedStaff?.some((s: any) => s.uid === staffMember.id || s.id === staffMember.id)
                                                      ));
                                    const isUnassigned = task.title !== 'General' && (!task.assignedStaff || task.assignedStaff.length === 0);
                                    const isCurrentTask = activeTasks.some(at => at.jobId === jobId && at.taskId === task.id) || 
                                                          isUserClockedIntoTask(effectiveUserId || '', task.id, staffMember?.name);

                                    const taskParts = parts.filter(p => p.taskId === task.id);
                                    const receivedParts = taskParts.filter(p => p.status === 'received' || p.status === 'delivered').length;
                                    const orderedParts = taskParts.filter(p => p.status === 'ordered').length;
                                    const pendingParts = taskParts.filter(p => p.status === 'pending' || p.status === 'requested').length;

                                    // Compute user times for this task
                                    const userTimeMap: Record<string, { name: string, ms: number }> = {};
                                    timeLogs.forEach(session => {
                                      const taskSegments = (session.jobs || []).filter((j: any) => j.id === jobId && j.taskId === task.id);
                                      if (taskSegments.length > 0) {
                                        const staffName = session.staffName || session.userName || 'Staff';
                                        taskSegments.forEach((seg: any) => {
                                          const start = seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime();
                                          const end = seg.end ? (seg.end.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime()) : now;
                                          const duration = Math.max(0, end - start);
                                          if (!userTimeMap[staffName]) {
                                            userTimeMap[staffName] = { name: staffName, ms: 0 };
                                          }
                                          userTimeMap[staffName].ms += duration;
                                        });
                                      }
                                    });
                                    const userTimes = Object.values(userTimeMap).filter(u => u.ms > 0);

                                    return (
                                      <div 
                                        key={task.id}
                                        onClick={() => navigate(`/business/${tenantId}/task/${jobId}/${task.id}`)}
                                        className={cn(
                                          "rounded-2xl p-5 cursor-pointer transition-all group",
                                          task.isAccidental
                                            ? "bg-rose-500/[0.01] dark:bg-rose-500/[0.005] border border-rose-500/20 opacity-70 hover:opacity-90 hover:border-rose-500/30"
                                            : task.status === 'Blocked' 
                                              ? "bg-rose-50/50 dark:bg-rose-950/20 border border-rose-500/50 hover:border-rose-500 hover:shadow-md hover:shadow-rose-500/10"
                                              : isUnassigned
                                                ? "bg-amber-500/[0.02] dark:bg-amber-500/[0.01] border border-amber-500/30 dark:border-amber-500/20 hover:border-amber-500 hover:shadow-md hover:shadow-amber-500/10"
                                                : "bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50 hover:shadow-md"
                                        )}
                                      >
                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                          <div className="flex-1">
                                            <div className="flex items-center flex-wrap gap-2 mb-1">
                                              <h3 className="font-bold text-zinc-900 dark:text-white">{task.title}</h3>
                                              <span className={cn(
                                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
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
                                                const isOverBook = !task.isAccidental && task.title !== 'General' && bookHours > 0 && clockedHours > bookHours;
                                                const diff = clockedHours - bookHours;
                                                if (isOverBook) {
                                                  return (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:bg-rose-500/25 dark:text-rose-350 border border-rose-500/20 flex items-center gap-1">
                                                      <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                                                      Over Budget (+{diff.toFixed(1)}h)
                                                    </span>
                                                  );
                                                }
                                                return null;
                                              })()}
                                              {task.isDiagnostic && (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:bg-purple-500/25 dark:text-purple-300 border border-purple-500/20">
                                                  Diagnostic
                                                </span>
                                              )}
                                              {task.isRework && task.status !== 'Rework' && (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:bg-rose-500/25 dark:text-rose-300 border border-rose-500/20">
                                                  Rework
                                                </span>
                                              )}
                                              {isUnassigned && (
                                                 <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:bg-amber-500/25 dark:text-amber-300 border border-amber-500/20 flex items-center gap-1 animate-pulse">
                                                   <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                   Unassigned
                                                 </span>
                                               )}
                                              {task.isAccidental && (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 animate-pulse">
                                                  Accidental Clock-in
                                                </span>
                                              )}
                                            </div>
                                            {task.description && <p className="text-xs text-zinc-500 mb-2">{task.description}</p>}
                                            
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                                              {task.title !== 'General' && task.status !== 'QC' && (
                                                <div className="flex flex-col">
                                                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Allotted Time</span>
                                                  <span className="font-mono text-sm font-bold text-zinc-900 dark:text-white">{task.bookTime || 0}h</span>
                                                </div>
                                              )}
                                              <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total Time Worked</span>
                                                {task.isAccidental ? (
                                                  <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-rose-500">
                                                    <span className="line-through opacity-50 font-normal">{formatMs(loggedMs)}</span>
                                                    <span>0h 0m</span>
                                                  </div>
                                                ) : task.actualTime !== undefined && task.actualTime > 0 ? (
                                                  <div className="flex flex-col">
                                                    <span className="font-mono text-sm font-bold text-indigo-500">
                                                      {task.actualTime.toFixed(1)}h <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-1">(Override)</span>
                                                    </span>
                                                    <span className="text-[9px] font-bold text-zinc-400">
                                                      Logged: {formatMs(loggedMs)}
                                                    </span>
                                                  </div>
                                                ) : (
                                                  <span className={cn(
                                                    "font-mono text-sm font-bold",
                                                    task.title !== 'General' && loggedMs > (task.bookTime || 0) * 3600000 ? "text-rose-500" : "text-emerald-500"
                                                  )}>
                                                    {formatMs(loggedMs)}
                                                  </span>
                                                )}
                                              </div>
                                              
                                              {/* Parts Status Tag */}
                                              {(pendingParts > 0 || orderedParts > 0 || receivedParts > 0) && (
                                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-[10px] font-black uppercase tracking-widest w-fit">
                                                  <Wrench className="w-3 h-3 text-amber-500" />
                                                  <span className="text-zinc-500">Parts:</span>
                                                  <span className="text-amber-500">{pendingParts} P</span>
                                                  <span className="text-zinc-300 dark:text-zinc-600">/</span>
                                                  <span className="text-blue-500">{orderedParts} O</span>
                                                  <span className="text-zinc-300 dark:text-zinc-600">/</span>
                                                  <span className="text-emerald-500">{receivedParts} R</span>
                                                </div>
                                              )}
                                            </div>

                                            {/* Time Breakdown per Staff */}
                                            {userTimes.length > 0 && (
                                              <div className="mt-4 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60 grid gap-1.5">
                                                {userTimes.map(u => (
                                                  <div key={u.name} className="flex justify-between items-center text-[10px]">
                                                    <div className="flex items-center gap-1.5">
                                                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                                                      <span className="text-zinc-500 font-bold uppercase tracking-wider">{u.name}</span>
                                                    </div>
                                                    <span className="font-mono text-zinc-700 dark:text-zinc-300 font-bold">{formatMs(u.ms)}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>

                                          <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-0 w-full md:w-auto">
                                            {(isAssigned || canClockOthers) && (
                                              <>
                                                {isCurrentTask ? (
                                                  <button 
                                                    onClick={async (e) => { 
                                                      e.stopPropagation(); 
                                                      if (effectiveUserId && effectiveUserId !== user?.uid) {
                                                        const resolvedStaffName = staffMember?.name || allStaff.find(s => s.userId === effectiveUserId || s.id === effectiveUserId)?.name || 'Technician';
                                                        await handleClockOther(effectiveUserId, resolvedStaffName, task.id, task.title, 'out');
                                                      } else {
                                                        await clockOutOfJob(jobId, task.id); 
                                                      }
                                                    }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
                                                  >
                                                    <Timer className="w-4 h-4 animate-pulse" />
                                                    Clock Out
                                                  </button>
                                                ) : (
                                                   task.status !== 'QC' && task.status !== 'QC Complete' && task.status !== 'completed' && !['Ready for QA', 'Ready for QC', 'Ready for Customer', 'Completed'].includes(job.status || '') && (
                                                    <button 
                                                      onClick={async (e) => { 
                                                        e.stopPropagation(); 
                                                        if (effectiveUserId && effectiveUserId !== user?.uid) {
                                                          const resolvedStaffName = staffMember?.name || allStaff.find(s => s.userId === effectiveUserId || s.id === effectiveUserId)?.name || 'Technician';
                                                          await handleClockOther(effectiveUserId, resolvedStaffName, task.id, task.title, 'in');
                                                        } else {
                                                          await clockIntoJob(jobId, job.title, task.id, task.title); 
                                                        }
                                                      }}
                                                      disabled={isClockingIn}
                                                      className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                                                    >
                                                      <Timer className="w-4 h-4" />
                                                      Clock In
                                                    </button>
                                                  )
                                                )}
                                                
                                                {task.status !== 'QC Complete' && task.title !== 'General' && (
                                                  task.status === 'QC' ? (
                                                    <div className="flex items-center gap-2">
                                                      {canPerformQC ? (
                                                        <>
                                                          <button 
                                                            onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(task.id, task.status || 'pending', 'pass'); }}
                                                            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20"
                                                          >
                                                            <CheckCircle2 className="w-4 h-4" />
                                                            Pass QC
                                                          </button>
                                                          <button 
                                                            onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(task.id, task.status || 'pending', 'fail'); }}
                                                            className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white hover:bg-rose-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-rose-500/20"
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
                                                      onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(task.id, task.status || 'pending'); }}
                                                      className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm"
                                                    >
                                                      <CheckCircle2 className="w-4 h-4" />
                                                      {task.status === 'Rework' ? 'Mark Fixed' : 'Mark Complete'}
                                                    </button>
                                                  )
                                                )}
                                              </>
                                            )}
                                            {!isAssigned && task.status !== 'QC' && task.status !== 'QC Complete' && (
                                              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                                                Assigned to {task.assignedStaff?.[0]?.name || 'Technician'}
                                              </span>
                                            )}
                                            <button
                                              onClick={(e) => { e.stopPropagation(); navigate(`/business/${tenantId}/task/${jobId}/${task.id}`); }}
                                              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                                            >
                                              Details
                                            </button>
                                          </div>
                                        </div>
                                        {/* Clock Staff (For Managers / Admins) */}
                                        {canClockOthers && task.assignedStaff && task.assignedStaff.length > 0 && (
                                          <div 
                                            onClick={(e) => e.stopPropagation()}
                                            className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center gap-3 w-full"
                                          >
                                            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mr-1">Clock Staff:</span>
                                            <div className="flex flex-wrap gap-2">
                                              {task.assignedStaff.map((staff: any) => {
                                                const staffUid = allStaff.find(s => s.id === staff.id || s.userId === staff.id || s.id === staff.uid || s.userId === staff.uid)?.userId || staff.id || staff.uid;
                                                const resolvedStaffName = allStaff.find(s => s.id === staff.id || s.userId === staff.id || s.id === staff.uid || s.userId === staff.uid)?.name || staff.name;

                                                const isClockedIn = isUserClockedIntoTask(staffUid, task.id, resolvedStaffName);

                                                return (
                                                  <div 
                                                    key={staff.id || staff.uid} 
                                                    className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm"
                                                  >
                                                    <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                                      <span className={cn(
                                                        "w-1.5 h-1.5 rounded-full shrink-0",
                                                        isClockedIn ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
                                                      )} />
                                                      {staff.name}
                                                    </span>
                                                    {isClockedIn ? (
                                                      <button
                                                        onClick={() => handleClockOther(staffUid, staff.name, task.id, task.title, 'out')}
                                                        className="px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm shadow-rose-500/10"
                                                      >
                                                        Clock Out
                                                      </button>
                                                    ) : (
                                                      <button
                                                        onClick={() => handleClockOther(staffUid, staff.name, task.id, task.title, 'in')}
                                                        className="px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm shadow-indigo-500/10"
                                                      >
                                                        Clock In
                                                      </button>
                                                    )}
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
                    );
                  };

                  return (
                    <div className="space-y-8">
                      {renderGroupedTasks(activeTasksList)}
                      <div id="qc-tasks-section">
                        {renderGroupedTasks(completedTasksList, "Ready for QA & Completed")}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>

        {/* Sidebar - Context & Quick Actions */}
        <div className="space-y-6 lg:row-span-2">
          {/* Quick Stats */}
          <div id="overview-section" className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/20">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-4 opacity-80 flex items-center justify-between">
              Job Overview
              <Clock className="w-4 h-4" />
            </h3>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Status</span>
                  <p className="text-lg font-bold mt-1">{job.status || 'Open'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Scheduled Bay
                  </span>
                  <p className="text-sm font-bold mt-1 truncate" title={scheduledBay}>
                    {scheduledBay}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Scheduled Start
                  </span>
                  <p className="text-sm font-bold mt-1">
                    {formatJobDate(job.scheduledStartDate)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Deadline
                  </span>
                  <p className="text-sm font-bold mt-1">
                    {formatJobDate(job.scheduledEndDate)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                <div className="col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60 flex items-center gap-1">
                    <Timer className="w-3 h-3" /> Dynamic ETA
                  </span>
                  <p className={cn(
                    "text-sm font-bold mt-1",
                    dynamicETA && job.scheduledEndDate && dynamicETA > new Date(job.scheduledEndDate?.seconds ? job.scheduledEndDate.seconds * 1000 : job.scheduledEndDate) 
                      ? "text-rose-300" 
                      : "text-white"
                  )}>
                    {dynamicETA 
                      ? dynamicETA.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                      : 'Not Set'
                    }
                  </p>
                </div>
              </div>

              {etaComparison && (
                <div className={cn(
                  "p-3 rounded-2xl flex items-center gap-2.5 border",
                  etaComparison.status === 'early' 
                    ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/30" 
                    : etaComparison.status === 'late' 
                    ? "bg-rose-500/20 text-rose-200 border-rose-500/30" 
                    : "bg-white/10 text-white border-white/20"
                )}>
                  {etaComparison.status === 'early' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                  ) : etaComparison.status === 'late' ? (
                    <AlertTriangle className="w-4 h-4 text-rose-300 flex-shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-white/70 flex-shrink-0" />
                  )}
                  <div className="text-xs font-bold leading-snug">
                    {etaComparison.text}
                  </div>
                </div>
              )}

              {job.companyCamId && (
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">CompanyCam Project</span>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-lg font-bold">{job.companyCamId}</p>
                    <a 
                      href={`https://app.companycam.com/projects/${job.companyCamId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-white/10 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Job Progress</span>
                    <span className="text-xs font-mono font-bold">
                      {completedBookHours.toFixed(1)} / {totalBookHours.toFixed(1)} hrs • {completedTasks} / {totalTasks} tasks ({jobProgress}%)
                    </span>
                  </div>
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-white transition-all duration-1000" 
                      style={{ width: `${Math.min(100, jobProgress)}%` }} 
                    />
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 opacity-60" />
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Staff Allocation</span>
                  </div>
                  {staffStats.length === 0 ? (
                    <p className="text-xs opacity-50 italic">No tasks with book hours assigned.</p>
                  ) : (
                    staffStats.map(staff => {
                      const progress = staff.totalHours > 0 
                        ? Math.round((staff.completedHours / staff.totalHours) * 100)
                        : staff.totalTasks > 0 && staff.completedTasks === staff.totalTasks ? 100 : 0;
                      
                      return (
                        <div key={staff.id} className="space-y-1.5 p-3 rounded-2xl bg-white/10 border border-white/10 text-white">
                          <div className="flex items-center justify-between text-xs">
                            <span className={cn(
                              "font-bold",
                              staff.id === 'unassigned' ? "text-rose-300" : "text-white"
                            )}>
                              {staff.name}
                            </span>
                            <span className="font-mono font-bold opacity-90">
                              {staff.completedHours.toFixed(1)} / {staff.totalHours.toFixed(1)}h
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between text-[10px] opacity-70">
                            <span>{staff.completedTasks} of {staff.totalTasks} tasks done</span>
                            <span className="font-bold">{progress}%</span>
                          </div>
                          
                          <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full transition-all duration-500",
                                staff.id === 'unassigned' ? "bg-rose-400" : progress === 100 ? "bg-emerald-400" : "bg-white"
                              )}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bay Assignment Section */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl">
                  <MapPin className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className="font-bold">Parking Location</h3>
              </div>
              <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">
                {zones.find(z => z.currentJobId === jobId)?.name || 'Off-site'}
              </span>
            </div>

            {/* Live Stats Grid */}
            {(() => {
              const currentZone = zones.find(z => z.currentJobId === jobId);
              const isCurrentlyInBay = currentZone?.type === 'bay';
              const isCurrentlyInLot = currentZone?.type === 'parking' || currentZone?.type === 'lot';
              
              const activeBayStart = job.currentBaySessionStart || (isCurrentlyInBay ? currentZone?.lastAssignedAt : null);
              const activeLotStart = job.currentParkingSessionStart || (isCurrentlyInLot ? currentZone?.lastAssignedAt : null);

              return (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {/* Bay Session */}
                  <div className={cn(
                    "p-3 rounded-2xl border transition-all",
                    activeBayStart 
                      ? "bg-indigo-500/5 border-indigo-500/20 shadow-sm" 
                      : "bg-zinc-50 dark:bg-zinc-950 border-zinc-100 dark:border-zinc-800 opacity-50"
                  )}>
                    <div className="flex items-center gap-1.5 mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                      <Briefcase className="w-3 h-3 text-indigo-500" />
                      Bay Session
                    </div>
                    <div className="font-mono text-base font-bold text-zinc-900 dark:text-white">
                      {activeBayStart ? (() => {
                        const start = activeBayStart.seconds ? activeBayStart.seconds * 1000 : new Date(activeBayStart).getTime();
                        const diff = Math.max(0, Math.floor((now - start) / 1000));
                        return formatSmartDuration(diff, true);
                      })() : '---'}
                    </div>
                  </div>

                  {/* Total Bay Time */}
                  <div className={cn(
                    "p-3 rounded-2xl border transition-all",
                    job.totalBayTimeSeconds > 0 || activeBayStart
                      ? "bg-indigo-500/5 border-indigo-500/20 shadow-sm" 
                      : "bg-zinc-50 dark:bg-zinc-950 border-zinc-100 dark:border-zinc-800 opacity-50"
                  )}>
                    <div className="flex items-center gap-1.5 mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                      <History className="w-3 h-3 text-indigo-500" />
                      Total Bay
                    </div>
                    <div className="font-mono text-base font-bold text-indigo-600">
                      {(() => {
                        let total = job.totalBayTimeSeconds || 0;
                        if (activeBayStart) {
                          const start = activeBayStart.seconds ? activeBayStart.seconds * 1000 : new Date(activeBayStart).getTime();
                          total += Math.max(0, Math.floor((now - start) / 1000));
                        }
                        if (total === 0 && !activeBayStart) return '---';
                        return formatSmartDuration(total);
                      })()}
                    </div>
                  </div>

                  {/* Lot Session */}
                  <div className={cn(
                    "p-3 rounded-2xl border transition-all",
                    activeLotStart 
                      ? "bg-zinc-500/5 border-zinc-500/20 shadow-sm" 
                      : "bg-zinc-50 dark:bg-zinc-950 border-zinc-100 dark:border-zinc-800 opacity-50"
                  )}>
                    <div className="flex items-center gap-1.5 mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                      <Car className="w-3 h-3 text-zinc-500" />
                      Lot Session
                    </div>
                    <div className="font-mono text-base font-bold text-zinc-900 dark:text-white">
                      {activeLotStart ? (() => {
                        const start = activeLotStart.seconds ? activeLotStart.seconds * 1000 : new Date(activeLotStart).getTime();
                        const diff = Math.max(0, Math.floor((now - start) / 1000));
                        return formatSmartDuration(diff, true);
                      })() : '---'}
                    </div>
                  </div>

                  {/* Total Lot Time */}
                  <div className={cn(
                    "p-3 rounded-2xl border transition-all",
                    job.totalParkingTimeSeconds > 0 || activeLotStart
                      ? "bg-zinc-500/5 border-zinc-500/20 shadow-sm" 
                      : "bg-zinc-50 dark:bg-zinc-950 border-zinc-100 dark:border-zinc-800 opacity-50"
                  )}>
                    <div className="flex items-center gap-1.5 mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                      <History className="w-3 h-3 text-zinc-500" />
                      Total Lot
                    </div>
                    <div className="font-mono text-base font-bold text-zinc-600">
                      {(() => {
                        let total = job.totalParkingTimeSeconds || 0;
                        if (activeLotStart) {
                          const start = activeLotStart.seconds ? activeLotStart.seconds * 1000 : new Date(activeLotStart).getTime();
                          total += Math.max(0, Math.floor((now - start) / 1000));
                        }
                        if (total === 0 && !activeLotStart) return '---';
                        return formatSmartDuration(total);
                      })()}
                    </div>
                  </div>
                </div>
              );
            })()}

            {permissions['jobs.move_vehicle'] || isSuperAdmin ? (
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 px-1">Assign to Bay / Lot</label>
                <SearchableSelect
                  theme="indigo"
                  options={zones.sort((a, b) => a.name.localeCompare(b.name))}
                  value={zones.find(z => z.currentJobId === jobId)?.id || ''}
                  onChange={val => handleZoneChange(val || '')}
                  getLabel={z => z.name}
                  getValue={z => z.id}
                  placeholder="-- Unassigned / Off-site --"
                  searchPlaceholder="Filter bays & parking..."
                  renderOption={(zone) => (
                    <div className="flex flex-col">
                      <span className="font-bold text-zinc-900 dark:text-white text-sm">
                        {zone.name}
                      </span>
                      {zone.currentJobId && zone.currentJobId !== jobId && (
                        <span className="text-[10px] text-rose-500 font-black uppercase tracking-widest mt-0.5">
                          Occupied
                        </span>
                      )}
                      {(!zone.currentJobId || zone.currentJobId === jobId) && (
                        <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest mt-0.5">
                          Available
                        </span>
                      )}
                    </div>
                  )}
                />
              </div>
            ) : (
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center gap-3 text-zinc-500">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">You don't have permission to move vehicles.</span>
              </div>
            )}
          </div>

          {/* Blockers Section */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6 text-rose-500">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold">Blockers</h3>
            </div>
            
            <div className="space-y-4 mb-6">
              {(job.blockers || []).filter((b: any) => b.status === 'active').map((blocker: any) => (
                <div key={blocker.id} className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl group relative">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-rose-900 dark:text-rose-200">{blocker.message}</p>
                      <p className="text-[10px] text-rose-500 mt-2 uppercase tracking-widest font-bold">
                        {blocker.createdBy} • {new Date(blocker.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button 
                      onClick={() => handleResolveBlocker(blocker.id)}
                      className="p-1.5 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 rounded-lg transition-all"
                      title="Clear Blocker"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {(!job.blockers || job.blockers.filter((b: any) => b.status === 'active').length === 0) && (
                <p className="text-xs text-zinc-500 italic text-center py-4">No active blockers.</p>
              )}
            </div>

            <div className="space-y-3">
              <textarea 
                placeholder="Describe what's blocking you..."
                value={newBlockerMsg}
                onChange={(e) => setNewBlockerMsg(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-rose-500 outline-none transition-all resize-none h-24"
              />
              <button 
                onClick={handleAddBlocker}
                disabled={isAddingBlocker || !newBlockerMsg.trim()}
                className="w-full py-3 bg-rose-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 disabled:opacity-50"
              >
                {isAddingBlocker ? 'Adding...' : 'Add Blocker'}
              </button>
            </div>
          </div>

          {/* Parts Section */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-xl">
                  <Package className="w-5 h-5 text-amber-500" />
                </div>
                <h3 className="font-bold">Parts Management</h3>
              </div>
              <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">{parts.length} Total</span>
            </div>
            <div className="space-y-3">
              {parts.length === 0 ? (
                <p className="text-xs text-zinc-500 italic text-center py-4">No parts requested for this job.</p>
              ) : (
                parts.map(part => {
                  const targetTaskId = part.taskId || tasks.find(t => t.title === 'General')?.id;
                  return (
                    <div 
                      key={part.id} 
                      onClick={() => {
                        const canManageParts = isSuperAdmin || permissions['parts.manage'];
                        if (canManageParts) {
                          setSelectedPartForEdit(part);
                        } else if (targetTaskId) {
                          navigate(`/business/${tenantId}/task/${jobId}/${targetTaskId}`);
                        }
                      }}
                      className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 dark:hover:border-amber-500/30 rounded-2xl flex items-center justify-between group cursor-pointer transition-all"
                    >
                      <div className="min-w-0 flex-1 mr-4">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">{part.partName}</h4>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                            part.status === 'delivered' || part.status === 'fulfilled' ? "bg-indigo-500/10 text-indigo-600" :
                            part.status === 'received' ? "bg-emerald-500/10 text-emerald-600" :
                            part.status === 'ordered' ? "bg-blue-500/10 text-blue-600" :
                            "bg-amber-500/10 text-amber-600"
                          )}>
                            {part.status === 'delivered' || part.status === 'fulfilled' ? "with vehicle" : part.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-500 truncate">
                          Qty: {part.quantity || 1} • {part.taskTitle ? `Task: ${part.taskTitle}` : 'General Part'}
                          {part.location && ` • Location: ${part.location}`}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {part.status === 'ordered' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePartStatusChange(part.id, 'received');
                            }}
                            className="px-2 py-1 bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-sm"
                          >
                            Receive
                          </button>
                        )}
                        {part.status === 'received' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePartStatusChange(part.id, 'delivered');
                            }}
                            className="px-2 py-1 bg-indigo-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-sm"
                          >
                            With Vehicle
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              <button 
                onClick={() => setIsPartRequestOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-amber-500 text-amber-600 dark:text-amber-500 rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-amber-500/5 transition-all mt-2"
              >
                <Wrench className="w-4 h-4" />
                Request Parts
              </button>
            </div>
          </div>

          {/* Takeoffs Section */}
          <TakeoffsSection tenantId={tenantId} jobId={jobId} zones={zones} />

          {/* Chat Integration */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm h-[500px] flex flex-col">
            <div className="flex items-center gap-3 mb-6">
              <MessageSquare className="w-5 h-5 text-indigo-500" />
              <h3 className="font-bold">Job Chat</h3>
            </div>
            <div className="flex-1 min-h-0">
              <JobChat jobId={jobId} tenantId={tenantId} />
            </div>
          </div>
        </div>

        {/* Activity Log - Moved to bottom on mobile, side on desktop */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-500/10 rounded-xl">
              <History className="w-5 h-5 text-amber-500" />
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Activity Log</h2>
          </div>
          
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {(() => {
              // Prepare all events
              const allEvents: any[] = [];
              
              // 1. Add Manual Activity Logs
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
              
              // 2. Add Time Clock Sessions
              timeLogs.forEach(session => {
                const jobSegments = (session.jobs || []).filter((j: any) => j.id === jobId);
                jobSegments.forEach((seg: any, idx: number) => {
                  allEvents.push({
                    id: `${session.id}-${idx}`,
                    timestamp: seg.start?.toDate ? seg.start.toDate() : new Date(seg.start),
                    endTimestamp: seg.end?.toDate ? seg.end.toDate() : (seg.end ? new Date(seg.end) : null),
                    staffName: session.staffName || session.userName || 'Unknown Staff',
                    message: `worked on ${seg.taskName || 'General Labor'}`,
                    type: 'time_session',
                    isManual: false
                  });
                });
              });
              
              // Sort by timestamp desc
              allEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
              
              if (allEvents.length === 0) {
                return <p className="text-sm text-zinc-500 text-center py-8">No activity recorded yet.</p>;
              }
              
              return (
                <div className="space-y-4">
                  {allEvents.map(event => (
                    <div key={event.id} className={cn(
                      "flex gap-4 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 rounded-xl transition-colors group",
                      event.isManual ? "border-l-2 border-indigo-500/20" : ""
                    )}>
                      <div className="flex flex-col items-center gap-1">
                        <div className={cn(
                          "p-1.5 rounded-full",
                          event.type?.startsWith('blocker') ? "bg-rose-500/10" :
                          event.type?.startsWith('part') ? "bg-amber-500/10" :
                          event.type === 'location_changed' ? "bg-blue-500/10" :
                          event.type === 'time_session' ? "bg-indigo-500/10" :
                          "bg-zinc-500/10"
                        )}>
                          {event.type === 'blocker_added' ? <AlertTriangle className="w-3 h-3 text-rose-500" /> : 
                           event.type === 'blocker_resolved' ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> :
                           event.type === 'part_requested' ? <Package className="w-3 h-3 text-amber-500" /> :
                           event.type === 'part_status_changed' ? <Sparkles className="w-3 h-3 text-amber-500" /> :
                           event.type === 'location_changed' ? <MapPin className="w-3 h-3 text-blue-500" /> :
                           event.type === 'time_session' ? <Clock className="w-3 h-3 text-indigo-500" /> :
                           <History className="w-3 h-3 text-zinc-500" />}
                        </div>
                        {!event.isManual && <div className="w-px h-full bg-zinc-200 dark:bg-zinc-800" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-900 dark:text-white">
                          <span className="font-bold">{event.staffName}</span>
                          <span className="text-zinc-500"> {event.message}</span>
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                          <span>{event.timestamp.toLocaleTimeString()} {event.endTimestamp ? `- ${event.endTimestamp.toLocaleTimeString()}` : ''}</span>
                          <span className="opacity-40">•</span>
                          <span>{event.timestamp.toLocaleDateString()}</span>
                          {event.endTimestamp && (
                            <>
                              <span className="opacity-40">•</span>
                              <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-500">
                                {formatMs(Math.max(0, event.endTimestamp.getTime() - event.timestamp.getTime()))}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {(isPartRequestOpen || selectedPartForEdit) && (
        <PartsRequestModal 
          tenantId={tenantId}
          user={user}
          jobId={jobId}
          jobTitle={job.title}
          taskId={selectedTaskForPart?.id || selectedPartForEdit?.taskId}
          taskTitle={selectedTaskForPart?.title || selectedPartForEdit?.taskTitle}
          part={selectedPartForEdit}
          onClose={() => {
            setIsPartRequestOpen(false);
            setSelectedTaskForPart(null);
            setSelectedPartForEdit(null);
          }}
          onSuccess={() => {
            setIsPartRequestOpen(false);
            setSelectedTaskForPart(null);
            setSelectedPartForEdit(null);
          }}
        />
      )}

      {isETAOpen && (
        <ETAModal 
          tenantId={tenantId}
          jobId={jobId}
          currentETA={job.expectedFinishTime}
          onClose={() => setIsETAOpen(false)}
          onSuccess={() => setIsETAOpen(false)}
        />
      )}

      {showReportModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200 job-report-modal-wrapper">
          {/* Print Style Injector */}
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: letter portrait;
                margin: 0.4in;
              }

              /* 1. Hide everything under body that isn't the modal wrapper */
              body > *:not(.job-report-modal-wrapper) {
                display: none !important;
                height: 0 !important;
                overflow: hidden !important;
                padding: 0 !important;
                margin: 0 !important;
              }

              /* 2. Hide any headers/buttons/sidebars marked no-print inside the modal */
              .no-print,
              .no-print * {
                display: none !important;
                height: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
              }

              /* 3. Reset the modal wrapper and ALL intermediate layout containers to simple block containers with auto-height and no animation/transform offsets */
              .job-report-modal-wrapper,
              .job-report-modal-container,
              .job-report-modal-container > div,
              .job-report-modal-container > div > div {
                position: static !important;
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                height: auto !important;
                min-height: auto !important;
                max-height: none !important;
                overflow: visible !important;
                background: white !important;
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
                border-radius: 0 !important;
                float: none !important;
                flex: none !important;
                animation: none !important;
                transition: none !important;
                transform: none !important;
                opacity: 1 !important;
                visibility: visible !important;
              }

              /* 4. Style the print card itself to take full width naturally starting at the top of Page 1 */
              #job-report-print-area {
                width: 100% !important;
                max-width: 100% !important;
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                display: block !important;
                position: static !important;
                animation: none !important;
                transition: none !important;
                transform: none !important;
              }

              /* 5. Prevent splitting cards in half */
              .print-no-break {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
          ` }} />

          <div className="w-full max-w-5xl h-[90vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 job-report-modal-container">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 no-print">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Job Status Report</h3>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Preview, Print, or Email</p>
                </div>
              </div>
              <button 
                onClick={() => setShowReportModal(false)}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Left Side: Report Preview */}
              <div className="flex-1 overflow-y-auto p-6 bg-zinc-100 dark:bg-zinc-950/40 border-r border-zinc-200 dark:border-zinc-800">
                <div className="mb-3 flex justify-between items-center no-print">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Document Preview</span>
                  <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-bold text-zinc-700 dark:text-zinc-300 transition-all shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5 text-indigo-500" />
                    Print Document
                  </button>
                </div>

                {/* Printable Area Wrapper */}
                <div 
                  id="job-report-print-area" 
                  className="bg-white text-zinc-900 p-8 rounded-2xl border border-zinc-200 shadow-md font-sans mx-auto max-w-[800px]"
                >
                  {/* Print Header */}
                  <div className="border-b-2 border-indigo-900 pb-4 mb-6 flex justify-between items-start">
                    <div>
                      <h1 className="text-2xl font-black uppercase tracking-tight text-indigo-950">JOB STATUS REPORT</h1>
                      <p className="text-sm font-bold text-zinc-500 mt-1 uppercase tracking-wider">
                        {job.customerName || 'Walk-in Customer'} &bull; Job {job.jobNumber ? `#${job.jobNumber}` : 'NATIVE'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Report Date</div>
                      <div className="text-xs font-bold font-mono">{new Date().toLocaleDateString()}</div>
                    </div>
                  </div>

                  {/* Overview Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 mb-6 text-xs print-no-break">
                    <div>
                      <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Job Title</span>
                      <span className="font-bold text-zinc-800">{job.title}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Vehicle Link</span>
                      <span className="font-mono font-bold text-zinc-800 truncate block">{job.vehicleId || 'Not Linked'}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Scheduled Bay</span>
                      <span className="font-bold text-zinc-800">{scheduledBay}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Scheduled Start</span>
                      <span className="font-bold text-zinc-800">{formatJobDate(job.scheduledStartDate)}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Deadline</span>
                      <span className="font-bold text-zinc-800">{formatJobDate(job.scheduledEndDate)}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Dynamic ETA</span>
                      <span className="font-bold text-indigo-650">{dynamicETA ? formatJobDate(dynamicETA) : 'Completed / N/A'}</span>
                    </div>
                    <div className="col-span-2 sm:col-span-3 mt-2 pt-2 border-t border-indigo-100 flex items-center justify-between">
                      <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Total Job Progress</span>
                      <div className="flex items-center gap-3 w-4/5">
                        <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${jobProgress}%` }} />
                        </div>
                        <span className="font-bold font-mono text-zinc-800">{jobProgress}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Efficiency Report Summary */}
                  {jobEfficiencyStats.totalActual > 0 && (
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-6 text-xs print-no-break">
                      <h3 className="text-xs font-black text-indigo-950 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <Timer className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                        Job Efficiency Metrics
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                          <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Total Book Allotment</span>
                          <span className="font-mono font-bold text-zinc-800 text-sm">{jobEfficiencyStats.totalBook.toFixed(1)}h</span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Total Clocked Hours</span>
                          <span className="font-mono font-bold text-zinc-800 text-sm">{jobEfficiencyStats.totalActual.toFixed(1)}h</span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Variance</span>
                          <span className={cn(
                            "font-mono font-bold text-sm",
                            jobEfficiencyStats.variance > 0.1 ? "text-rose-650" : "text-emerald-650"
                          )}>
                            {jobEfficiencyStats.variance > 0 ? `+${jobEfficiencyStats.variance.toFixed(1)}h` : `${jobEfficiencyStats.variance.toFixed(1)}h`}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Overall Efficiency</span>
                          <span className={cn(
                            "font-mono font-bold text-sm px-1.5 py-0.5 rounded",
                            jobEfficiencyStats.efficiency && jobEfficiencyStats.efficiency >= 100 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          )}>
                            {jobEfficiencyStats.efficiency ? `${jobEfficiencyStats.efficiency.toFixed(0)}%` : 'N/A'}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-3 pt-2.5 border-t border-zinc-200">
                        {jobEfficiencyStats.efficiency && jobEfficiencyStats.efficiency >= 100 ? (
                          <span>🎉 The team completed this job <strong className="text-emerald-750">{(jobEfficiencyStats.efficiency - 100).toFixed(0)}% more efficiently</strong> than the allotted book time budget.</span>
                        ) : jobEfficiencyStats.efficiency ? (
                          <span>⚠️ The job ran <strong className="text-rose-750">{(100 - jobEfficiencyStats.efficiency).toFixed(0)}% over</strong> the budgeted book time allotment.</span>
                        ) : null}
                      </p>
                    </div>
                  )}

                  {/* Tasks Done Section */}
                  <div className="mb-6 print-no-break">
                    <h2 className="text-xs font-black text-emerald-600 border-b border-emerald-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      What's Done
                    </h2>
                    {tasks.filter(t => t.status === 'QC' || t.status === 'QC Complete').length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">No tasks completed yet.</p>
                    ) : (
                      <div className="divide-y divide-zinc-100">
                        {tasks.filter(t => t.status === 'QC' || t.status === 'QC Complete').map(t => {
                          const staffNames = t.assignedStaff?.map((s: any) => s.name || s.displayName).join(', ') || 'Unassigned';
                          const loggedMs = getTaskLoggedMs(t.id);
                          const clockedHours = t.actualTime !== undefined && t.actualTime > 0 ? t.actualTime : (loggedMs / 3600000);
                          const bookHours = parseFloat(t.bookTime) || 0;
                          const isOverBook = !t.isAccidental && t.title !== 'General' && bookHours > 0 && clockedHours > bookHours;
                          const diff = clockedHours - bookHours;
                          
                          return (
                            <div key={t.id} className="py-2.5 flex justify-between items-start gap-4">
                              <div>
                                <h4 className="text-xs font-bold text-zinc-800">{t.title}</h4>
                                {t.description && <p className="text-[10px] text-zinc-400 mt-0.5">{t.description}</p>}
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className="text-[9px] font-bold text-emerald-650 uppercase tracking-widest">Completed by: {staffNames}</span>
                                  {t.title !== 'General' && bookHours > 0 && (
                                    <>
                                      <span className="text-zinc-300">•</span>
                                      <span className="text-[9px] text-zinc-400 font-semibold font-mono">Budget: {bookHours}h &bull; Actual: {clockedHours.toFixed(1)}h</span>
                                      {isOverBook ? (
                                        <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[8px] font-black uppercase tracking-widest border border-rose-100 flex items-center gap-0.5">
                                          <AlertTriangle className="w-2.5 h-2.5" />
                                          +{diff.toFixed(1)}h Over
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-black uppercase tracking-widest border border-emerald-100">
                                          Under Budget
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                              <span className="font-mono text-xs font-bold text-emerald-600">{clockedHours.toFixed(1)}h</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Tasks Pending Section */}
                  <div className="mb-6 print-no-break">
                    <h2 className="text-xs font-black text-indigo-600 border-b border-indigo-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      What Needs to be Done
                    </h2>
                    {tasks.filter(t => t.status !== 'QC' && t.status !== 'QC Complete').length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">All tasks completed successfully!</p>
                    ) : (
                      <div className="divide-y divide-zinc-100">
                        {tasks.filter(t => t.status !== 'QC' && t.status !== 'QC Complete').map(t => {
                          const staffNames = t.assignedStaff?.map((s: any) => s.name || s.displayName).join(', ') || 'Unassigned';
                          const loggedMs = getTaskLoggedMs(t.id);
                          const clockedHours = t.actualTime !== undefined && t.actualTime > 0 ? t.actualTime : (loggedMs / 3600000);
                          const bookHours = parseFloat(t.bookTime) || 0;
                          const isOverBook = !t.isAccidental && t.title !== 'General' && bookHours > 0 && clockedHours > bookHours;
                          const diff = clockedHours - bookHours;
                          
                          return (
                            <div key={t.id} className="py-2.5 flex justify-between items-start gap-4">
                              <div>
                                <h4 className="text-xs font-bold text-zinc-800">{t.title}</h4>
                                {t.description && <p className="text-[10px] text-zinc-400 mt-0.5">{t.description}</p>}
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest">Assigned: {staffNames}</span>
                                  {t.title !== 'General' && bookHours > 0 && (
                                    <>
                                      <span className="text-zinc-300">•</span>
                                      <span className="text-[9px] text-zinc-400 font-semibold font-mono">Budget: {bookHours}h &bull; Actual: {clockedHours.toFixed(1)}h</span>
                                      {isOverBook && (
                                        <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[8px] font-black uppercase tracking-widest border border-rose-100 flex items-center gap-0.5">
                                          <AlertTriangle className="w-2.5 h-2.5" />
                                          +{diff.toFixed(1)}h Over
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                              <span className="font-mono text-xs font-bold text-indigo-600">{clockedHours.toFixed(1)}h</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Missing Parts Section */}
                  <div className="mb-6 print-no-break">
                    <h2 className="text-xs font-black text-amber-600 border-b border-amber-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5" />
                      Missing / Pending Parts
                    </h2>
                    {parts.filter(p => p.status !== 'received' && p.status !== 'delivered' && p.status !== 'fulfilled').length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">No parts pending requests.</p>
                    ) : (
                      <div className="divide-y divide-zinc-100">
                        {parts.filter(p => p.status !== 'received' && p.status !== 'delivered' && p.status !== 'fulfilled').map(p => (
                          <div key={p.id} className="py-2.5 flex justify-between items-center gap-4">
                            <div>
                              <h4 className="text-xs font-bold text-zinc-800">{p.partName}</h4>
                              <p className="text-[10px] text-zinc-400 mt-0.5">
                                Qty: {p.quantity || 1} &bull; {p.taskTitle ? `Task: ${p.taskTitle}` : 'General Part'}
                              </p>
                            </div>
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-widest rounded border border-amber-200">
                              {p.status || 'requested'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Staff Workload Section */}
                  <div className="print-no-break">
                    <h2 className="text-xs font-black text-zinc-700 border-b border-zinc-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Staff Workload Allocation
                    </h2>
                    {staffStats.length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">No staff assigned.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-zinc-200 text-zinc-400 font-bold uppercase tracking-wider text-[9px]">
                              <th className="py-1">Technician</th>
                              <th className="py-1 text-center">Tasks (Done / Total)</th>
                              <th className="py-1 text-right">Hours (Done / Total)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {staffStats.map(s => (
                              <tr key={s.id}>
                                <td className="py-2 font-bold text-zinc-700">{s.name}</td>
                                <td className="py-2 text-center text-zinc-500">{s.completedTasks} / {s.totalTasks}</td>
                                <td className="py-2 text-right font-mono font-bold text-zinc-700">
                                  {s.completedHours.toFixed(1)} / {s.totalHours.toFixed(1)}h
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side: Email Dispatch Panel */}
              <div className="w-full md:w-96 p-6 flex flex-col bg-zinc-50 dark:bg-zinc-900 border-t md:border-t-0 border-zinc-200 dark:border-zinc-800 no-print">
                <div className="flex-1 space-y-5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-500/10 text-indigo-500 rounded-lg">
                      <Mail className="w-4 h-4" />
                    </div>
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Email Status Report</h4>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Recipients (Comma-separated)</label>
                    <input 
                      type="text"
                      placeholder="e.g. customer@domain.com, foreman@saegrp.com"
                      value={emailRecipients}
                      onChange={(e) => setEmailRecipients(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-zinc-400"
                    />
                    {customerEmail && (
                      <button 
                        onClick={() => setEmailRecipients(customerEmail)}
                        className="mt-1 text-[10px] font-black text-indigo-500 hover:text-indigo-650 uppercase tracking-widest transition-colors block text-left"
                      >
                        Reset to Linked Customer: {customerEmail}
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Subject Line</label>
                    <input 
                      type="text"
                      placeholder="Email Subject"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>

                  <div className="p-4 bg-zinc-100 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs text-zinc-500 space-y-2">
                    <p className="font-bold text-zinc-650 dark:text-zinc-350 uppercase tracking-wider text-[10px]">🔒 Domain Security Settings</p>
                    <p>The email will be dispatched using Google Workspace impersonation matching your user context. This ensures a clean delivery directly from your personal inbox.</p>
                  </div>
                </div>

                {/* Send Button */}
                <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 mt-6 bg-zinc-50 dark:bg-zinc-900">
                  <button 
                    onClick={async () => {
                      if (!emailRecipients.trim()) {
                        toast.error("Please specify at least one recipient email address.");
                        return;
                      }
                      
                      setIsSendingEmail(true);
                      try {
                        const token = await auth.currentUser?.getIdToken();
                        const emails = emailRecipients.split(',').map(e => e.trim()).filter(Boolean);
                        
                        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                        const apiBase = isLocal 
                          ? 'http://localhost:5001/saegroup-c6487/us-central1/api'
                          : 'https://us-central1-saegroup-c6487.cloudfunctions.net/api';
                        
                        const res = await fetch(`${apiBase}/jobs/${jobId}/report-email`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                          },
                          body: JSON.stringify({
                            recipients: emails,
                            subject: emailSubject,
                            html: generateEmailHtml()
                          })
                        });
                        
                        if (!res.ok) {
                          const errData = await res.json().catch(() => ({}));
                          throw new Error(errData.error || `Server returned ${res.status}`);
                        }
                        
                        toast.success("Job status report sent successfully!");
                        setShowReportModal(false);
                      } catch (e: any) {
                        console.error(e);
                        toast.error(`Failed to send report: ${e.message}`);
                      } finally {
                        setIsSendingEmail(false);
                      }
                    }}
                    disabled={isSendingEmail}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-750 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                  >
                    {isSendingEmail ? (
                      <>
                        <Clock className="w-5 h-5 animate-spin" />
                        Sending Report...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Email Report
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Floating Action Navigation Dock at the Bottom */}
      {job && (
        <div 
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 px-4 py-2 rounded-full shadow-2xl flex items-center gap-1.5 max-w-[95vw] md:max-w-2xl overflow-x-auto transition-all duration-300 hover:shadow-indigo-500/10 hover:border-indigo-500/30 scale-100 hover:scale-[1.02] no-print"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <button
            onClick={() => {
              const el = document.getElementById('tasks-section');
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-[11px] font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300 transition-all shrink-0 hover:text-indigo-500 dark:hover:text-indigo-400"
          >
            <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
            Tasks
          </button>
          
          <button
            onClick={() => {
              const el = document.getElementById('qc-tasks-section');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else {
                const tasksEl = document.getElementById('tasks-section');
                tasksEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-[11px] font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300 transition-all shrink-0 hover:text-emerald-500 dark:hover:text-emerald-400"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            QC Tasks
          </button>
          
          <button
            onClick={() => {
              const el = document.getElementById('overview-section');
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-[11px] font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300 transition-all shrink-0 hover:text-indigo-500 dark:hover:text-indigo-400"
          >
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
            Overview
          </button>

          {(isSuperAdmin || permissions['jobs.manage']) && (
            <>
              <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-800 shrink-0 self-center mx-1" />
              
              <button
                onClick={() => setShowReportModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-[11px] font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300 transition-all shrink-0 hover:text-purple-500 dark:hover:text-purple-400"
              >
                <FileText className="w-3.5 h-3.5 text-purple-500" />
                Job Report
              </button>
              
              <button
                onClick={() => navigate(`/business/${tenantId}/job/${jobId}/edit`)}
                className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-[11px] font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300 transition-all shrink-0 hover:text-rose-500 dark:hover:text-rose-400"
              >
                <Edit3 className="w-3.5 h-3.5 text-rose-500" />
                Edit Job
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
