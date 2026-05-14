import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, orderBy, limit, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Briefcase, Clock, Timer, CheckCircle2, AlertTriangle, 
  Wrench, History, ArrowLeft, Edit3, MessageSquare, 
  AlertCircle, MapPin, User, Car, Package, Plus, Trash2, Save, Sparkles, X, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth/store';
import { useTimeclockStore } from '../../lib/store/timeclockStore';
import { useJobClock } from '../timeclock/useJobClock';
import { JobChat } from './components/JobChat';
import { PartsRequestModal } from './PartsRequestModal';
import { ETAModal } from './ETAModal';
import { SearchableSelect } from './SearchableSelect';

export function JobDetailPage({ tenantId }: { tenantId: string }) {
  const { '*': splat } = useParams();
  const pathParts = (splat || '').split('/').filter(Boolean);
  const jobId = pathParts[1];
  
  const navigate = useNavigate();
  const { user, permissions, isSuperAdmin } = useAuthStore();
  const { activeSessionId } = useTimeclockStore();
  const { clockIntoJob, clockOutOfJob, isProcessing: isClockingIn } = useJobClock(tenantId);
  
  const [job, setJob] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [isPartRequestOpen, setIsPartRequestOpen] = useState(false);
  const [isETAOpen, setIsETAOpen] = useState(false);
  const [parts, setParts] = useState<any[]>([]);
  const [selectedTaskForPart, setSelectedTaskForPart] = useState<any>(null);
  
  const [newBlockerMsg, setNewBlockerMsg] = useState('');
  const [isAddingBlocker, setIsAddingBlocker] = useState(false);
  const [zones, setZones] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);

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

  const [tasksLoaded, setTasksLoaded] = useState(false);

  // Auto-add "General" task if missing
  useEffect(() => {
    if (!jobId || !tenantId || !job || !tasksLoaded) return;
    
    const hasGeneral = tasks.some(t => t.title === 'General');
    if (!hasGeneral) {
      const addGeneralTask = async () => {
        try {
          await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), {
            title: 'General',
            description: 'General shop work and cleanup',
            bookTime: 0,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        } catch (e) {
          console.error("Error adding general task:", e);
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

  // Sync Active Job/Task from current session
  useEffect(() => {
    if (!tenantId || !activeSessionId) {
      setActiveJobId(null);
      setActiveTaskId(null);
      return;
    }
    const unsub = onSnapshot(doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const jobs = data.jobs || [];
        const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
        if (lastJob && !lastJob.end) {
          setActiveJobId(lastJob.id);
          setActiveTaskId(lastJob.taskId || null);
        } else {
          setActiveJobId(null);
          setActiveTaskId(null);
        }
      }
    }, (err) => {
      console.error("Session sync listener error:", err);
    });
    return () => unsub();
  }, [tenantId, activeSessionId]);

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
        const end = seg.end ? (seg.end.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime()) : now;
        return segAcc + Math.max(0, end - start);
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

  const handleTaskStatusChange = async (taskId: string, currentStatus: string) => {
    let nextStatus = '';
    if (currentStatus === 'pending' || currentStatus === 'in_progress') {
      nextStatus = 'QC'; // Mark complete -> Needs QC
    } else if (currentStatus === 'QC') {
      nextStatus = 'QC Complete';
    } else {
      return;
    }

    try {
      // 1. Update the task
      await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
        [nextStatus === 'QC' ? 'completedAt' : 'qcCompletedAt']: new Date().toISOString(),
        [nextStatus === 'QC' ? 'completedBy' : 'qcCompletedBy']: user?.displayName || user?.email
      });
      toast.success(`Task marked as ${nextStatus}`);

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
      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/activity`), {
        type,
        message,
        metadata,
        timestamp: new Date(),
        staffId: user?.uid,
        staffName: user?.displayName || user?.email || 'Staff'
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
    try {
      await logActivity('patrol_check', 'Patrol Check: Confirmed no changes needed at this time.');
      // Update job to trigger "Just Updated" on boards
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        updatedAt: serverTimestamp()
      });
      toast.success('Check recorded');
      navigate(-1);
    } catch (e) {
      console.error(e);
      toast.error('Failed to record check');
    }
  };


  // Progression Logic Hook
  useEffect(() => {
    if (!tasks.length || !job || !tenantId || !jobId) return;
    
    // Only auto-progress if status is Active, Open, Ready for QA
    const autoProgressable = ['Active', 'Open', 'Ready for QA'].includes(job.status);
    if (!autoProgressable) return;

    const nonGeneralTasks = tasks.filter(t => t.title !== 'General');
    if (nonGeneralTasks.length === 0) return;

    const allQCReady = nonGeneralTasks.every(t => t.status === 'QC' || t.status === 'QC Complete');
    const allQCComplete = nonGeneralTasks.every(t => t.status === 'QC Complete');

    const updateJobStatus = async (newStatus: string, msg: string) => {
      if (job.status === newStatus) return;
      try {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
          status: newStatus,
          updatedAt: new Date()
        });
        toast.success(msg);
      } catch (e) {
        console.error("Auto-progression error:", e);
      }
    };

    if (allQCComplete) {
      updateJobStatus('Ready for Customer', 'Job ready for customer!');
    } else if (allQCReady) {
      updateJobStatus('Ready for QA', 'Job ready for QA inspection');
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
  const nonGeneralTasks = tasks.filter(t => t.title !== 'General');
  const totalBookTimeMs = nonGeneralTasks.reduce((acc, t) => acc + (t.bookTime || 0), 0) * 3600000;
  const denominatorMs = totalBookTimeMs || (job?.estimatedHours * 3600000) || 0;

  const totalLoggedTimeMs = timeLogs.reduce((acc, session) => {
    const jobSegments = session.jobs?.filter((j: any) => j.id === jobId) || [];
    return acc + jobSegments.reduce((jacc: number, seg: any) => {
      const start = seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime();
      const isCurrentlyActive = activeJobId === jobId && (!seg.end || (activeTaskId && seg.taskId === activeTaskId));
      const end = seg.end ? (seg.end.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime()) : (isCurrentlyActive ? now : start);
      return jacc + Math.max(0, end - start);
    }, 0);
  }, 0);

  const jobProgress = (nonGeneralTasks.length > 0 || (job?.estimatedHours || 0) > 0) && denominatorMs > 0 
    ? Math.round((totalLoggedTimeMs / denominatorMs) * 100) 
    : 0;

  if (!job) return (
    <div className="flex items-center justify-center p-12">
      <Clock className="w-8 h-8 text-indigo-500 animate-spin" />
    </div>
  );

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
              <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white tracking-tight">{job.title}</h1>
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
          <button 
            onClick={handleNoChange}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            No Change
          </button>
          {permissions['jobs.manage'] && (
            <button 
              onClick={() => navigate(`/business/${tenantId}/job/${jobId}/edit`)}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-sm font-bold shadow-sm transition-all"
            >
              <Edit3 className="w-4 h-4" />
              Edit Job
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Tasks */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl">
                  <Briefcase className="w-5 h-5 text-indigo-500" />
                </div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Tasks</h2>
              </div>
            </div>

            <div className="space-y-4">
              {tasks.length === 0 ? (
                <div className="p-12 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800/50">
                  <p className="text-sm font-bold text-zinc-500">No tasks assigned to this job.</p>
                </div>
              ) : (
                tasks.map(task => {
                  const loggedMs = getTaskLoggedMs(task.id);
                  const isAssigned = task.title === 'General' || 
                                    isSuperAdmin || 
                                    task.assignedStaffIds?.includes(user?.uid) || 
                                    task.assignedStaff?.some((s: any) => s.uid === user?.uid || s.id === user?.uid);
                  const isCurrentTask = activeJobId === jobId && activeTaskId === task.id;
                  
                  return (
                    <div 
                      key={task.id}
                      className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:border-indigo-500/30 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-zinc-900 dark:text-white">{task.title}</h3>
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                              task.status === 'QC' ? "bg-amber-500/10 text-amber-600" :
                              task.status === 'QC Complete' ? "bg-emerald-500/10 text-emerald-600" :
                              "bg-indigo-500/10 text-indigo-600"
                            )}>
                              {task.status || 'Pending'}
                            </span>
                          </div>
                          {task.description && <p className="text-xs text-zinc-500 mb-2">{task.description}</p>}
                          
                          <button 
                            onClick={() => {
                              setSelectedTaskForPart(task);
                              setIsPartRequestOpen(true);
                            }}
                            className="flex items-center gap-1.5 text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3 hover:text-amber-700 transition-colors"
                          >
                            <Wrench className="w-3 h-3" />
                            Request Task Part
                          </button>

                          <div className="flex items-center gap-6">
                            {task.title !== 'General' && (
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Allotted Time</span>
                                <span className="font-mono text-sm font-bold text-zinc-900 dark:text-white">{task.bookTime || 0}h</span>
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total Time Worked</span>
                              <span className={cn(
                                "font-mono text-sm font-bold",
                                task.title !== 'General' && loggedMs > (task.bookTime || 0) * 3600000 ? "text-rose-500" : "text-emerald-500"
                              )}>
                                {formatMs(loggedMs)}
                              </span>
                            </div>
                          </div>
                        </div>

                          <div className="flex items-center gap-2">
                            {isAssigned && (
                              <>
                                {isCurrentTask ? (
                                  <button 
                                    onClick={() => clockOutOfJob()}
                                    className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
                                  >
                                    <Timer className="w-4 h-4 animate-pulse" />
                                    Clock Out
                                  </button>
                                ) : (
                                  task.status !== 'QC Complete' && (
                                    <button 
                                      onClick={() => clockIntoJob(jobId, job.title, task.id, task.title)}
                                      disabled={isClockingIn}
                                      className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                                    >
                                      <Timer className="w-4 h-4" />
                                      Clock In
                                    </button>
                                  )
                                )}
                                
                                {task.status !== 'QC Complete' && task.title !== 'General' && (
                                  <button 
                                    onClick={() => handleTaskStatusChange(task.id, task.status || 'pending')}
                                    className={cn(
                                      "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg",
                                      task.status === 'QC' 
                                        ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20" 
                                        : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 shadow-sm"
                                    )}
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    {task.status === 'QC' ? 'QC Complete' : 'Mark Complete'}
                                  </button>
                                )}
                              </>
                            )}
                            {!isAssigned && task.status !== 'QC Complete' && (
                              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                                Assigned to {task.assignedStaff?.[0]?.name || 'Technician'}
                              </span>
                            )}
                          </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Sidebar - Context & Quick Actions */}
        <div className="space-y-6 lg:row-span-2">
          {/* Quick Stats */}
          <div 
            onClick={() => setIsETAOpen(true)}
            className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/20 cursor-pointer hover:scale-[1.02] transition-transform active:scale-[0.98]"
          >
            <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-4 opacity-80 flex items-center justify-between">
              Job Overview
              <Clock className="w-4 h-4" />
            </h3>
            <div className="space-y-6">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Status</span>
                <p className="text-lg font-bold">{job.status || 'Open'}</p>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Estimated Finish</span>
                <p className="text-lg font-bold">
                  {job.expectedFinishTime 
                    ? new Date(job.expectedFinishTime).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : 'Set ETA'
                  }
                </p>
              </div>
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
              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Job Progress</span>
                  <span className="text-sm font-bold">{jobProgress}%</span>
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-white transition-all duration-1000" 
                    style={{ width: `${Math.min(100, jobProgress)}%` }} 
                  />
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
                parts.map(part => (
                  <div key={part.id} className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between group">
                    <div className="min-w-0 flex-1 mr-4">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">{part.partName}</h4>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                          part.status === 'received' ? "bg-emerald-500/10 text-emerald-600" :
                          part.status === 'ordered' ? "bg-blue-500/10 text-blue-600" :
                          "bg-amber-500/10 text-amber-600"
                        )}>
                          {part.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {part.taskTitle ? `Task: ${part.taskTitle}` : 'General Part'}
                        {part.location && ` • Location: ${part.location}`}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {part.status === 'ordered' && (
                        <button 
                          onClick={() => handlePartStatusChange(part.id, 'received')}
                          className="px-2 py-1 bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-sm"
                        >
                          Receive
                        </button>
                      )}
                      {part.status === 'received' && (
                        <button 
                          onClick={() => handlePartStatusChange(part.id, 'delivered')}
                          className="px-2 py-1 bg-indigo-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-sm"
                        >
                          Deliver
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

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

      {isPartRequestOpen && (
        <PartsRequestModal 
          tenantId={tenantId}
          user={user}
          jobId={jobId}
          jobTitle={job.title}
          taskId={selectedTaskForPart?.id}
          taskTitle={selectedTaskForPart?.title}
          onClose={() => {
            setIsPartRequestOpen(false);
            setSelectedTaskForPart(null);
          }}
          onSuccess={() => {
            setIsPartRequestOpen(false);
            setSelectedTaskForPart(null);
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
    </div>
  );
}
