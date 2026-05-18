import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  ArrowLeft, Clock, Timer, CheckCircle2, 
  Wrench, AlertTriangle, MessageSquare, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth/store';
import { useTimeclockStore } from '../../lib/store/timeclockStore';
import { useJobClock } from '../timeclock/useJobClock';
import { PartsRequestModal } from './PartsRequestModal';

export function TaskDetailPage({ tenantId }: { tenantId: string }) {
  const { '*': splat } = useParams();
  const pathParts = (splat || '').split('/').filter(Boolean);
  // URL: /business/:tenantId/task/:jobId/:taskId
  const jobId = pathParts[1];
  const taskId = pathParts[2];
  
  const navigate = useNavigate();
  const { user, permissions, isSuperAdmin } = useAuthStore();
  const { activeSessionId } = useTimeclockStore();
  const { clockIntoJob, clockOutOfJob, isProcessing: isClockingIn } = useJobClock(tenantId);
  
  const [job, setJob] = useState<any>(null);
  const [task, setTask] = useState<any>(null);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  
  const [parts, setParts] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  
  const [isPartRequestOpen, setIsPartRequestOpen] = useState(false);
  const [newBlockerMsg, setNewBlockerMsg] = useState('');
  const [isAddingBlocker, setIsAddingBlocker] = useState(false);

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
      const taskLogs = logs.filter(log => log.metadata?.taskId === taskId || log.taskId === taskId);
      
      taskLogs.sort((a: any, b: any) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });
      setActivityLogs(taskLogs);
    }, (err) => console.error("Activity listener error:", err));
    return () => unsub();
  }, [jobId, taskId, tenantId]);

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

  const logActivity = async (type: string, message: string, metadata: any = {}) => {
    try {
      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/activity`), {
        type,
        message,
        metadata: { ...metadata, taskId },
        taskId, // Save taskId directly as well for easier filtering
        timestamp: new Date(),
        staffId: user?.uid,
        staffName: user?.displayName || user?.email || 'Staff'
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
      const newStatus = hasActiveBlockers ? 'Blocked' : 'Active';

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

  const handleTaskStatusChange = async (currentStatus: string) => {
    let nextStatus = '';
    if (currentStatus === 'pending' || currentStatus === 'in_progress' || currentStatus === 'Blocked') {
      nextStatus = 'QC'; 
    } else if (currentStatus === 'QC') {
      nextStatus = 'QC Complete';
    } else {
      return;
    }

    try {
      await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId), {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
        [nextStatus === 'QC' ? 'completedAt' : 'qcCompletedAt']: new Date().toISOString(),
        [nextStatus === 'QC' ? 'completedBy' : 'qcCompletedBy']: user?.displayName || user?.email
      });
      await logActivity('status_changed', `Task marked as ${nextStatus}`);
      toast.success(`Task marked as ${nextStatus}`);

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

  if (!job || !task) return (
    <div className="flex items-center justify-center p-12">
      <Clock className="w-8 h-8 text-indigo-500 animate-spin" />
    </div>
  );

  const loggedMs = getTaskLoggedMs();
  const isAssigned = task.title === 'General' || 
                    isSuperAdmin || 
                    task.assignedStaffIds?.includes(user?.uid) || 
                    task.assignedStaff?.some((s: any) => s.uid === user?.uid || s.id === user?.uid);
  const isCurrentTask = activeJobId === jobId && activeTaskId === task.id;

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
                "bg-indigo-500/10 text-indigo-600"
              )}>
                {task.status || 'Pending'}
              </span>
            </div>
            <p className="text-base sm:text-lg font-bold text-zinc-500 mt-1">
              Job: <span className="text-indigo-500 cursor-pointer hover:underline" onClick={() => navigate(`/business/${tenantId}/job/${jobId}`)}>{job.title}</span> • {job.vehicleId || 'No Vehicle Linked'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
           {isAssigned && (
             <>
               {isCurrentTask ? (
                 <button 
                   onClick={() => clockOutOfJob()}
                   className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
                 >
                   <Timer className="w-4 h-4 animate-pulse" />
                   Clock Out
                 </button>
               ) : (
                 task.status !== 'QC Complete' && (
                   <button 
                     onClick={() => clockIntoJob(jobId, job.title, task.id, task.title)}
                     disabled={isClockingIn || task.status === 'Blocked'}
                     className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                   >
                     <Timer className="w-4 h-4" />
                     Clock In
                   </button>
                 )
               )}
               
               {task.status !== 'QC Complete' && task.title !== 'General' && (
                 <button 
                   onClick={() => handleTaskStatusChange(task.status || 'pending')}
                   className={cn(
                     "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-all shadow-lg",
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Task Details Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4">Task Details</h2>
            {task.description ? (
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">{task.description}</p>
            ) : (
              <p className="text-sm font-bold text-zinc-500 mb-6 italic">No description provided.</p>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Allotted Time</span>
                <span className="font-mono text-xl font-bold">{task.title !== 'General' ? `${task.bookTime || 0}h` : 'N/A'}</span>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Time Worked</span>
                <span className={cn(
                  "font-mono text-xl font-bold",
                  task.title !== 'General' && loggedMs > (task.bookTime || 0) * 3600000 ? "text-rose-500" : "text-emerald-500"
                )}>
                  {formatMs(loggedMs)}
                </span>
              </div>
            </div>
          </div>

          {/* Activity Log */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-500/10 rounded-xl">
                <MessageSquare className="w-5 h-5 text-indigo-500" />
              </div>
              <h2 className="text-xl font-bold">Activity Log</h2>
            </div>
            
            <div className="space-y-4">
              {activityLogs.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 font-bold bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                  No activity recorded for this task yet.
                </div>
              ) : (
                activityLogs.map((log: any) => (
                  <div key={log.id} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-700">
                      <span className="text-xs font-bold text-zinc-500 uppercase">
                        {(log.staffName || '?').substring(0, 2)}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-zinc-900 dark:text-white">{log.staffName}</span>
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                          {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp || 0).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">{log.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
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
                  <div key={part.id} className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold">{part.partName}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mt-1">
                          Qty: {part.quantity} • {part.requestedBy}
                        </p>
                      </div>
                      <span className={cn(
                        "px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest",
                        part.status === 'received' ? "bg-emerald-500/10 text-emerald-600" :
                        part.status === 'ordered' ? "bg-blue-500/10 text-blue-600" :
                        "bg-amber-500/10 text-amber-600"
                      )}>
                        {part.status}
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
        </div>
      </div>

      {isPartRequestOpen && (
        <PartsRequestModal 
          tenantId={tenantId}
          jobId={jobId!}
          jobTitle={job.title}
          taskId={task.id}
          taskTitle={task.title}
          user={user}
          onClose={() => setIsPartRequestOpen(false)}
          onSuccess={() => setIsPartRequestOpen(false)}
        />
      )}
    </div>
  );
}
