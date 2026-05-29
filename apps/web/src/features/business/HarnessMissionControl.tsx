import { useState, useEffect, useRef } from 'react';
import { 
  Layers, Users, Clock, Play, Square, CheckSquare, Maximize, Minimize,
  User, Search, Sparkles, UserCheck
} from 'lucide-react';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, addDoc, 
  serverTimestamp, collectionGroup, getDoc, orderBy
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { assignQCStaffToTask } from '../../lib/auth/qcAssignment';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useWakeLock } from '../../hooks/useWakeLock';

interface HarnessMissionControlProps {
  tenantId: string;
}

export function HarnessMissionControl({ tenantId }: HarnessMissionControlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // Seeding and configuration states
  const [harnessDept, setHarnessDept] = useState<any>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Data states
  const [staff, setStaff] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  
  // UI states
  const [selectedOperator, setSelectedOperator] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOperatorModalOpen, setIsOperatorModalOpen] = useState(false);
  const [pendingTaskForModal, setPendingTaskForModal] = useState<any>(null);

  // Wake lock
  useWakeLock(isFullscreen);

  // Tick clock state to force stopwatches to re-render every second
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 1. Fetch/Seed Harness Department
  useEffect(() => {
    if (!tenantId) return;

    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/departments`), async (snap) => {
      const depts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const found = depts.find((d: any) => d.name?.toLowerCase().includes('harness'));
      
      if (found) {
        setHarnessDept(found);
      } else if (!isSeeding) {
        setIsSeeding(true);
        toast.info("Setting up Harness Department...", {
          description: "Auto-seeding default settings, schedule, and permissions.",
          duration: 4000
        });
        try {
          await addDoc(collection(db, `businesses/${tenantId}/departments`), {
            name: 'Harness',
            permissions: {
              'harness.view': true,
              'timeclock.view': true,
              'tasks.view': true,
              'jobs.view': true
            },
            defaultSchedule: {
              days: [1, 2, 3, 4, 5],
              startTime: '08:00',
              endTime: '17:00',
              expectedHoursPerDay: 8
            },
            weeklyBookTimeCredit: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          toast.success("Harness Department configured successfully!");
        } catch (err) {
          console.error("Failed to seed Harness Department:", err);
          toast.error("Failed to configure department. Please check database rules.");
        } finally {
          setIsSeeding(false);
        }
      }
    });

    return () => unsub();
  }, [tenantId, isSeeding]);

  // 2. Fetch Harness Department Staff
  useEffect(() => {
    if (!tenantId || !harnessDept?.id) {
      setStaff([]);
      return;
    }

    const q = query(
      collection(db, `businesses/${tenantId}/staff`),
      where('isArchived', '!=', true)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const allStaff = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const harnessStaff = allStaff.filter((s: any) => s.departmentId === harnessDept.id);
      setStaff(harnessStaff);
    }, (err) => console.error("Harness Staff listener error:", err));

    return () => unsub();
  }, [tenantId, harnessDept?.id]);

  // 3. Fetch Active / Open Jobs for Parent Job context mapping
  useEffect(() => {
    if (!tenantId) return;

    const q = query(collection(db, `businesses/${tenantId}/jobs`));
    const unsub = onSnapshot(q, (snap) => {
      const jobs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveJobs(jobs);
    }, (err) => console.error("Harness Jobs listener error:", err));

    return () => unsub();
  }, [tenantId]);

  // 4. Fetch All Time Sessions to derive live clock-in states (for active segments & stopwatch)
  useEffect(() => {
    if (!tenantId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      orderBy('clockIn.timestamp', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const allSessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter sessions starting today or currently active
      const activeSessions = allSessions.filter((s: any) => {
        if (s.status !== 'completed') return true;
        if (!s.clockIn?.timestamp) return false;
        const date = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
        return date >= today;
      });
      setSessions(activeSessions);
    }, (err) => {
      // Missing composite index fallback
      console.warn("Time session index building, using database scan...", err);
      const fallbackQ = query(collection(db, `businesses/${tenantId}/time_sessions`));
      onSnapshot(fallbackQ, (snap) => {
        const allSessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const activeSessions = allSessions.filter((s: any) => {
          if (s.status !== 'completed') return true;
          if (!s.clockIn?.timestamp) return false;
          const date = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
          return date >= today;
        });
        setSessions(activeSessions);
      });
    });

    return () => unsub();
  }, [tenantId]);

  // 5. Fetch All Tasks via index-free collectionGroup query
  useEffect(() => {
    if (!tenantId || !harnessDept?.id) {
      setAllTasks([]);
      return;
    }

    const q = query(
      collectionGroup(db, 'tasks'),
      where('tenantId', '==', tenantId)
    );

    const unsub = onSnapshot(q, (snap) => {
      // Firestore security rule filter check
      const filteredDocs = snap.docs.filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`));
      
      const parsedTasks = filteredDocs.map(doc => {
        const pathParts = doc.ref.path.split('/');
        const jobId = pathParts[3];
        return {
          id: doc.id,
          jobId,
          refPath: doc.ref.path,
          ...doc.data()
        };
      });

      // Filter tasks assigned to the Harness department in memory
      const harnessTasks = parsedTasks.filter((t: any) => t.departmentId === harnessDept.id);
      setAllTasks(harnessTasks);
      setLastUpdated(new Date());
    }, (err) => {
      console.error("Harness Tasks collectionGroup error:", err);
    });

    return () => unsub();
  }, [tenantId, harnessDept?.id]);

  // Full Screen toggle helper
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        toast.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Time calculation helper
  const getElapsedMs = (start: any) => {
    if (!start) return 0;
    const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
    return Math.max(0, Date.now() - s);
  };

  const formatStopwatch = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Dynamic status mappings
  const activeTechSessions = sessions.filter(s => s.status === 'active' || s.status === 'on_break');

  // Derive active clock-in tasks
  const activeTaskSegments = activeTechSessions.flatMap(s => {
    const jobs = s.jobs || [];
    return jobs.filter((j: any) => !j.end && j.taskId).map((j: any) => ({
      taskId: j.taskId,
      jobId: j.id,
      userId: s.userId,
      userName: s.userName || s.staffName || 'Operator',
      sessionId: s.id,
      start: j.start
    }));
  });

  // Dynamic columns derivation
  const derivedTasks = allTasks.map(task => {
    const parentJob = activeJobs.find(j => j.id === task.jobId);
    
    // Find active segments clocking this task
    const activeSegments = activeTaskSegments.filter(seg => seg.taskId === task.id);
    
    return {
      ...task,
      parentJob,
      activeSegments
    };
  });

  // Filter based on search query
  const searchFilter = (t: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title?.toLowerCase().includes(q) ||
      t.parentJob?.title?.toLowerCase().includes(q) ||
      t.parentJob?.jobNumber?.toLowerCase().includes(q) ||
      t.parentJob?.customerName?.toLowerCase().includes(q)
    );
  };

  // Columns splits
  const queueTasks = derivedTasks
    .filter(t => t.status !== 'QC Complete' && t.status !== 'completed' && t.status !== 'QC')
    .filter(t => t.activeSegments.length === 0)
    .filter(searchFilter);

  const activeTasks = derivedTasks
    .filter(t => t.activeSegments.length > 0)
    .filter(searchFilter);

  // Only show tasks completed today (or recently in the last 24h)
  const completedTodayTasks = derivedTasks
    .filter(t => t.status === 'QC Complete' || t.status === 'completed' || t.status === 'QC')
    .filter(t => {
      const compVal = t.completedAt || t.qcCompletedAt || t.updatedAt;
      if (!compVal) return false;
      const compDate = compVal.seconds ? new Date(compVal.seconds * 1000) : new Date(compVal);
      const diffMs = Date.now() - compDate.getTime();
      return diffMs <= 24 * 60 * 60 * 1000; // Last 24 Hours
    })
    .sort((a, b) => {
      const aVal = a.completedAt || a.qcCompletedAt || a.updatedAt;
      const bVal = b.completedAt || b.qcCompletedAt || b.updatedAt;
      const aMs = aVal?.seconds ? aVal.seconds * 1000 : new Date(aVal || 0).getTime();
      const bMs = bVal?.seconds ? bVal.seconds * 1000 : new Date(bVal || 0).getTime();
      return bMs - aMs; // Descending
    })
    .filter(searchFilter);

  // Real-time direct time clock hooks
  const handleClockIn = async (task: any) => {
    // 1. Resolve Operator
    let operator = selectedOperator;
    if (!operator) {
      setPendingTaskForModal(task);
      setIsOperatorModalOpen(true);
      return;
    }

    try {
      // Find operator's active time session
      let activeSession = sessions.find(s => s.userId === operator.userId && s.status === 'active');

      // Auto-Attendance Clock In if not clocked in for the day
      if (!activeSession) {
        toast.info(`Clocking in ${operator.firstName} for the day...`);
        const docRef = await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
          userId: operator.userId || operator.id,
          userName: `${operator.firstName} ${operator.lastName}`.trim(),
          staffName: `${operator.firstName} ${operator.lastName}`.trim(),
          clockIn: {
            timestamp: new Date(),
            onSite: true,
            lat: null,
            lng: null
          },
          isRemote: false,
          status: 'active',
          breaks: [],
          jobs: [],
          createdAt: serverTimestamp()
        });
        
        // Use newly generated session as active
        activeSession = {
          id: docRef.id,
          jobs: []
        };
      }

      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
      const currentJobs = [...(activeSession.jobs || [])];

      // Check if already clocked into this task in this session
      const isAlreadyIn = currentJobs.some((j: any) => !j.end && j.taskId === task.id);
      if (isAlreadyIn) {
        toast.warning("Already clocked into this task!");
        return;
      }

      // Add clock segment
      currentJobs.push({
        id: task.jobId,
        name: task.parentJob?.title || 'Harness Work',
        taskId: task.id,
        taskName: task.title,
        bookTime: parseFloat(task.bookTime) || 0,
        start: new Date()
      });

      await updateDoc(sessionRef, {
        jobs: currentJobs,
        jobIds: Array.from(new Set(currentJobs.map((j: any) => j.id))),
        updatedAt: serverTimestamp()
      });

      // Update parent Job lastWorkedAt for dashboard lists
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, task.jobId), {
        lastWorkedAt: serverTimestamp()
      });

      // Advance task status to active if still pending
      if (task.status === 'pending') {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs/${task.jobId}/tasks`, task.id), {
          status: 'active',
          updatedAt: serverTimestamp()
        });
      }

      toast.success(`Clocked into ${task.title}`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Clock In failed: ${err.message}`);
    }
  };

  const handleClockOut = async (task: any, segment: any) => {
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, segment.sessionId);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists()) return;

      const jobsList = [...(sessionSnap.data()?.jobs || [])];
      let matchFound = false;

      jobsList.forEach((j: any) => {
        if (!j.end && j.taskId === task.id && j.id === task.jobId) {
          j.end = new Date();
          matchFound = true;
        }
      });

      if (matchFound) {
        await updateDoc(sessionRef, {
          jobs: jobsList,
          updatedAt: serverTimestamp()
        });
        toast.success(`Clocked out of ${task.title}`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Clock Out failed: ${err.message}`);
    }
  };

  const handleComplete = async (task: any, toQC = false) => {
    // Determine completing operator
    let operator = selectedOperator;
    const activeSeg = task.activeSegments?.[0];
    if (!operator && activeSeg) {
      // Find operator by matching active segment tech
      operator = staff.find(s => s.userId === activeSeg.userId || s.id === activeSeg.userId);
    }
    if (!operator) {
      setPendingTaskForModal({ ...task, isCompleting: true, toQC });
      setIsOperatorModalOpen(true);
      return;
    }

    try {
      // 1. Close any active clock segments for this task
      const matchSegments = task.activeSegments || [];
      for (const seg of matchSegments) {
        const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, seg.sessionId);
        const sessionSnap = await getDoc(sessionRef);
        if (sessionSnap.exists()) {
          const jobsList = [...(sessionSnap.data()?.jobs || [])];
          jobsList.forEach((j: any) => {
            if (!j.end && j.taskId === task.id) {
              j.end = new Date();
            }
          });
          await updateDoc(sessionRef, { jobs: jobsList, updatedAt: serverTimestamp() });
        }
      }

      // 2. Mark task complete in parent job subcollection
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${task.jobId}/tasks`, task.id);
      const finalStatus = toQC ? 'QC' : 'QC Complete';
      
      await updateDoc(taskRef, {
        status: finalStatus,
        completedAt: new Date().toISOString(),
        completedByStaffId: operator.id,
        completedByStaffName: `${operator.firstName} ${operator.lastName}`.trim(),
        updatedAt: serverTimestamp()
      });

      if (finalStatus === 'QC') {
        await assignQCStaffToTask(tenantId, task.jobId, task.id);
      }

      toast.success(toQC ? `Task sent to Quality Control (QC)!` : `Task completed successfully!`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Completion failed: ${err.message}`);
    }
  };

  // Seeding Loader View
  if (!harnessDept) {
    return (
      <div className="flex flex-col items-center justify-center p-20 min-h-[60vh] gap-4 bg-zinc-950/20 rounded-3xl border border-zinc-200/50 dark:border-zinc-800/40">
        <Sparkles className="w-12 h-12 text-indigo-500 animate-spin" />
        <div className="text-center">
          <h3 className="font-bold text-lg text-zinc-900 dark:text-white">Connecting Harness Board...</h3>
          <p className="text-sm text-zinc-500 mt-1">Seeding database collections and checking system presets.</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "max-w-7xl mx-auto space-y-6 flex flex-col h-full animate-in fade-in duration-500",
        isFullscreen ? "p-4 bg-zinc-900 dark:bg-zinc-950 h-screen w-screen overflow-y-auto no-scrollbar" : "pb-20"
      )}
    >
      <div className="hidden" aria-hidden="true">{tick}</div>
      {/* Header and Control Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20">
            Harness Department Control Board
          </span>
          <h1 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white tracking-tight mt-2 flex items-center gap-3">
            <Layers className="w-7 h-7 text-indigo-500 animate-pulse" />
            Harness Mission Control
            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500">• Updated {lastUpdated.toLocaleTimeString()}</span>
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
          <button 
            onClick={toggleFullscreen}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-bold rounded-xl shadow-lg transition-all active:scale-95"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
          </button>
        </div>
      </div>

      {/* Operator Center - Walk-Up Shared Station Header */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            <h2 className="text-sm font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Operator Hub</h2>
          </div>
          {selectedOperator ? (
            <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/25 px-3 py-1.5 rounded-xl">
              <UserCheck className="w-4 h-4 text-indigo-500 animate-bounce" />
              <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                Active Operator: {selectedOperator.firstName}
              </span>
              <button 
                onClick={() => setSelectedOperator(null)}
                className="text-[10px] font-black uppercase text-zinc-400 hover:text-rose-500 ml-2 border-l border-zinc-200 dark:border-zinc-700 pl-2"
              >
                Clear
              </button>
            </div>
          ) : (
            <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20 animate-pulse">
              ⚠️ Walk-Up Mode: Select an operator or tap clock-in to select
            </span>
          )}
        </div>

        {/* Operator Cards Deck */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {staff.map(tech => {
            const isSelected = selectedOperator?.id === tech.id;
            const techSession = sessions.find(s => s.userId === tech.userId && s.status !== 'completed');
            
            // Check if tech is currently active on any task segment
            const techActiveTask = activeTaskSegments.find(seg => seg.userId === tech.userId);

            let statusLabel = 'Clocked Out';
            let statusColor = 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500';
            
            if (techSession) {
              if (techSession.status === 'on_break') {
                statusLabel = 'On Break';
                statusColor = 'bg-amber-500/10 text-amber-500 border border-amber-500/25';
              } else if (techActiveTask) {
                statusLabel = 'Busy on Job';
                statusColor = 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/25';
              } else {
                statusLabel = 'Clocked In';
                statusColor = 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 animate-pulse';
              }
            }

            return (
              <button
                key={tech.id}
                onClick={() => setSelectedOperator(isSelected ? null : tech)}
                className={cn(
                  "p-3 rounded-2xl flex flex-col items-center justify-between text-center transition-all duration-300 border active:scale-95 group",
                  isSelected 
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-[1.03]" 
                    : "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800/80 hover:border-indigo-500/40 text-zinc-800 dark:text-zinc-200"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm mb-2 shadow-sm transition-colors",
                  isSelected ? "bg-white/20 text-white" : "bg-indigo-500/10 text-indigo-500 group-hover:scale-105"
                )}>
                  {tech.firstName[0]}{tech.lastName[0]}
                </div>
                
                <span className="font-bold text-xs truncate max-w-full leading-tight block mb-1">
                  {tech.firstName}
                </span>

                <span className={cn(
                  "text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0",
                  isSelected ? "bg-white/20 text-white" : statusColor
                )}>
                  {statusLabel}
                </span>
              </button>
            );
          })}
          {staff.length === 0 && (
            <div className="col-span-full p-4 text-center text-zinc-500 italic text-xs">
              No staff members assigned to the Harness department. Edit staff in Settings to assign them to Harness!
            </div>
          )}
        </div>
      </div>

      {/* Main Search and Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
        <div className="relative col-span-1 md:col-span-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Search Harness tasks, Job #, or Customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium text-sm text-zinc-900 dark:text-white"
          />
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2.5 rounded-2xl flex items-center justify-between text-xs font-black uppercase tracking-wider text-zinc-500">
          <span>Active Tasks: {activeTasks.length}</span>
          <span className="text-zinc-300 dark:text-zinc-800">•</span>
          <span>Queue Load: {queueTasks.length}</span>
        </div>
      </div>

      {/* Three Column Task Board */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Column 1: QUEUE (Backlog) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-zinc-200/60 dark:border-zinc-850">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-650 dark:text-zinc-300 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-450 dark:bg-zinc-600" />
              Queue / Backlog
            </h2>
            <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-[10px] font-black rounded-lg text-zinc-500">
              {queueTasks.length}
            </span>
          </div>

          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
            {queueTasks.map(task => (
              <div 
                key={task.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl hover:border-indigo-500/40 transition-all shadow-sm flex flex-col justify-between space-y-3 group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                      {task.parentJob?.jobNumber ? `#${task.parentJob.jobNumber}` : 'WORK ORDER'}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {task.bookTime || 0} hrs
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-zinc-900 dark:text-white leading-snug group-hover:text-indigo-500 transition-colors">
                    {task.title || 'General Harness Wiring'}
                  </h3>

                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-1">
                    Job: {task.parentJob?.title || 'Open Wiring Order'}
                  </p>
                  
                  {task.parentJob?.customerName && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      Customer: {task.parentJob.customerName}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-850">
                  <button 
                    onClick={() => handleClockIn(task)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/10 active:scale-95 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    Clock In
                  </button>

                  <button 
                    onClick={() => handleComplete(task, false)}
                    className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold active:scale-95 transition-all"
                    title="Direct Complete"
                  >
                    Complete
                  </button>
                </div>
              </div>
            ))}

            {queueTasks.length === 0 && (
              <div className="p-8 text-center bg-zinc-100/50 dark:bg-zinc-950/20 rounded-2xl border border-dashed border-zinc-250 dark:border-zinc-800/80">
                <p className="text-zinc-500 dark:text-zinc-500 italic text-xs">No pending tasks in the backlog.</p>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: ACTIVE (Work-in-Progress) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-indigo-500/5 dark:bg-indigo-500/10 p-4 rounded-2xl border border-indigo-500/20">
            <h2 className="text-sm font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
              Active Work
            </h2>
            <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-black rounded-lg text-indigo-500">
              {activeTasks.length}
            </span>
          </div>

          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
            {activeTasks.map(task => (
              <div 
                key={task.id}
                className="bg-white dark:bg-zinc-900 border border-indigo-500/20 dark:border-indigo-900/30 p-4 rounded-2xl shadow-sm flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                      {task.parentJob?.jobNumber ? `#${task.parentJob.jobNumber}` : 'WORK ORDER'}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {task.bookTime || 0} hrs
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-zinc-900 dark:text-white leading-snug">
                    {task.title || 'General Harness Wiring'}
                  </h3>

                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-1">
                    Job: {task.parentJob?.title || 'Open Wiring Order'}
                  </p>
                </div>

                {/* Clock Timers for Active Technicians */}
                <div className="space-y-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-155 dark:border-zinc-850 p-3 rounded-xl">
                  {task.activeSegments.map((seg: any, idx: number) => {
                    const elapsedMs = getElapsedMs(seg.start);
                    
                    return (
                      <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-[10px]">
                            {seg.userName[0]}
                          </div>
                          <div>
                            <p className="font-bold text-zinc-800 dark:text-zinc-200">{seg.userName}</p>
                            <p className="text-[9px] text-zinc-400">Clocked in</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded text-[11px] animate-pulse">
                            {formatStopwatch(elapsedMs)}
                          </span>

                          <button 
                            onClick={() => handleClockOut(task, seg)}
                            className="p-1 hover:bg-rose-500/10 hover:text-rose-500 rounded text-zinc-400 transition-colors"
                            title="Pause/Clock Out"
                          >
                            <Square className="w-3.5 h-3.5 fill-current" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-850">
                  <button 
                    onClick={() => handleClockIn(task)}
                    className="flex-[2] py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold active:scale-95 transition-all shadow-sm shadow-indigo-500/10"
                  >
                    Add operator
                  </button>

                  <button 
                    onClick={() => handleComplete(task, false)}
                    className="flex-[3] py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/10 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    Complete
                  </button>
                </div>
              </div>
            ))}

            {activeTasks.length === 0 && (
              <div className="p-10 text-center bg-zinc-100/50 dark:bg-zinc-950/20 rounded-2xl border border-dashed border-zinc-250 dark:border-zinc-800/80">
                <p className="text-zinc-500 dark:text-zinc-500 italic text-xs">No active wiring tasks in progress.</p>
              </div>
            )}
          </div>
        </div>

        {/* Column 3: COMPLETED TODAY */}
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-emerald-500/5 dark:bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20">
            <h2 className="text-sm font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Finished Today
            </h2>
            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black rounded-lg text-emerald-500">
              {completedTodayTasks.length}
            </span>
          </div>

          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
            {completedTodayTasks.map(task => {
              const compDate = task.completedAt || task.qcCompletedAt || task.updatedAt;
              const dateStr = compDate 
                ? (compDate.seconds 
                    ? new Date(compDate.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                    : new Date(compDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
                : '';

              return (
                <div 
                  key={task.id}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                        {task.parentJob?.jobNumber ? `#${task.parentJob.jobNumber}` : 'WORK ORDER'}
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/10">
                        {task.status === 'QC' ? 'Awaiting QC' : 'Complete'}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-zinc-900 dark:text-white leading-snug line-through opacity-60">
                      {task.title || 'General Harness Wiring'}
                    </h3>

                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-1">
                      Job: {task.parentJob?.title || 'Open Wiring Order'}
                    </p>
                  </div>

                  {/* Completing Operator profile info */}
                  <div className="flex items-center justify-between text-xs border-t border-zinc-100 dark:border-zinc-850 pt-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-[9px]">
                        {task.completedByStaffName?.[0] || 'O'}
                      </div>
                      <span className="font-bold text-zinc-650 dark:text-zinc-400">
                        {task.completedByStaffName || 'Unknown Operator'}
                      </span>
                    </div>

                    <span className="text-[10px] font-bold text-zinc-400">
                      Done at {dateStr}
                    </span>
                  </div>
                </div>
              );
            })}

            {completedTodayTasks.length === 0 && (
              <div className="p-8 text-center bg-zinc-100/50 dark:bg-zinc-950/20 rounded-2xl border border-dashed border-zinc-250 dark:border-zinc-800/80">
                <p className="text-zinc-500 dark:text-zinc-500 italic text-xs">No tasks completed yet today.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Operator walk-up selection prompt modal */}
      {isOperatorModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="text-center">
              <div className="w-14 h-14 bg-indigo-500/10 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-7 h-7 animate-bounce" />
              </div>
              <h3 className="text-lg font-black text-zinc-900 dark:text-white leading-tight">
                Identify Operator
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Please select your name below to clock into or complete: <br />
                <span className="font-bold text-zinc-800 dark:text-zinc-200">"{pendingTaskForModal?.title}"</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto no-scrollbar py-1">
              {staff.map(tech => (
                <button
                  key={tech.id}
                  onClick={async () => {
                    setIsOperatorModalOpen(false);
                    setSelectedOperator(tech);
                    
                    const task = pendingTaskForModal;
                    setPendingTaskForModal(null);
                    
                    if (task?.isCompleting) {
                      // Perform task completion
                      try {
                        const matchSegments = task.activeSegments || [];
                        for (const seg of matchSegments) {
                          const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, seg.sessionId);
                          const sessionSnap = await getDoc(sessionRef);
                          if (sessionSnap.exists()) {
                            const jobsList = [...(sessionSnap.data()?.jobs || [])];
                            jobsList.forEach((j: any) => {
                              if (!j.end && j.taskId === task.id) {
                                j.end = new Date();
                              }
                            });
                            await updateDoc(sessionRef, { jobs: jobsList, updatedAt: serverTimestamp() });
                          }
                        }

                        const taskRef = doc(db, `businesses/${tenantId}/jobs/${task.jobId}/tasks`, task.id);
                        const finalStatus = task.toQC ? 'QC' : 'QC Complete';
                        
                        await updateDoc(taskRef, {
                          status: finalStatus,
                          completedAt: new Date().toISOString(),
                          completedByStaffId: tech.id,
                          completedByStaffName: `${tech.firstName} ${tech.lastName}`.trim(),
                          updatedAt: serverTimestamp()
                        });

                        if (finalStatus === 'QC') {
                           await assignQCStaffToTask(tenantId, task.jobId, task.id);
                        }

                        toast.success(task.toQC ? `Task sent to Quality Control (QC)!` : `Task completed successfully!`);
                      } catch (err: any) {
                        toast.error(`Completion failed: ${err.message}`);
                      }
                    } else if (task) {
                      // Perform task clock-in
                      try {
                        let activeSession = sessions.find(s => s.userId === tech.userId && s.status === 'active');
                        if (!activeSession) {
                          toast.info(`Clocking in ${tech.firstName} for the day...`);
                          const docRef = await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
                            userId: tech.userId || tech.id,
                            userName: `${tech.firstName} ${tech.lastName}`.trim(),
                            staffName: `${tech.firstName} ${tech.lastName}`.trim(),
                            clockIn: {
                              timestamp: new Date(),
                              onSite: true,
                              lat: null,
                              lng: null
                            },
                            isRemote: false,
                            status: 'active',
                            breaks: [],
                            jobs: [],
                            createdAt: serverTimestamp()
                          });
                          activeSession = { id: docRef.id, jobs: [] };
                        }

                        const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
                        const currentJobs = [...(activeSession.jobs || [])];
                        
                        currentJobs.push({
                          id: task.jobId,
                          name: task.parentJob?.title || 'Harness Work',
                          taskId: task.id,
                          taskName: task.title,
                          bookTime: parseFloat(task.bookTime) || 0,
                          start: new Date()
                        });

                        await updateDoc(sessionRef, {
                          jobs: currentJobs,
                          jobIds: Array.from(new Set(currentJobs.map((j: any) => j.id))),
                          updatedAt: serverTimestamp()
                        });

                        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, task.jobId), {
                          lastWorkedAt: serverTimestamp()
                        });

                        if (task.status === 'pending') {
                          await updateDoc(doc(db, `businesses/${tenantId}/jobs/${task.jobId}/tasks`, task.id), {
                            status: 'active',
                            updatedAt: serverTimestamp()
                          });
                        }

                        toast.success(`Clocked in ${tech.firstName} to ${task.title}`);
                      } catch (err: any) {
                        toast.error(`Clock In failed: ${err.message}`);
                      }
                    }
                  }}
                  className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-850 dark:text-zinc-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 hover:shadow-lg transition-all text-sm font-bold text-center block leading-tight active:scale-95"
                >
                  {tech.firstName} {tech.lastName}
                </button>
              ))}
            </div>

            <button 
              onClick={() => {
                setIsOperatorModalOpen(false);
                setPendingTaskForModal(null);
              }}
              className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-2xl text-xs font-bold transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
