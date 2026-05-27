import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc, collectionGroup, orderBy, limit } from 'firebase/firestore';
import { Clock, Briefcase, ArrowRight, Package, AlertTriangle, Wrench, CarFront, Timer, Search, Command, Maximize, Minimize, MapPin, Coins, TrendingUp, Award, CheckSquare } from 'lucide-react';
import { ZoneDetailsModal } from './ZoneModals';
import { PackageIntakeModal } from './PackageIntakeModal';
import { FeedbackModal } from '../../components/FeedbackModal';
import { PartFormModal } from './PartFormModal';
import { VehicleIntakeModal } from './VehicleIntakeModal';
import { toast, Toaster } from 'sonner';
import { useWakeLock } from '../../hooks/useWakeLock';
import { cn } from '../../lib/utils';
import { useJobClock } from '../timeclock/useJobClock';
import { useTimeclockStore } from '../../lib/store/timeclockStore';
import { useSearchStore } from '../../lib/store/searchStore';
import { DeviceSettings } from '../../components/DeviceSettings';

export function UserMissionControl({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const { user, impersonatedStaff } = useAuthStore();
  const effectiveUserId = impersonatedStaff?.id || user?.uid;
  const { activeSessionId } = useTimeclockStore();
  const { open: openSearch } = useSearchStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useWakeLock(isFullscreen);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        toast.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      toast.success("Optimized Mode Active", {
        description: "Keep Screen Awake is now active for this board.",
        duration: 5000,
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);
  const [activeJobIds, setActiveJobIds] = useState<string[]>([]);
  
  const [allActiveJobs, setAllActiveJobs] = useState<any[]>([]);
  const [allZones, setAllZones] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [sessionJobIds, setSessionJobIds] = useState<string[]>([]);
  
  // const [selectedJob, setSelectedJob] = useState<any>(null);
  const [selectedZone, setSelectedZone] = useState<any>(null);
  const [taskJobIds, setTaskJobIds] = useState<string[]>([]);
  const [myAssignedTasks, setMyAssignedTasks] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [staffMember, setStaffMember] = useState<any>(null);
  const [myDept, setMyDept] = useState<any>(null);
  const [todos, setTodos] = useState<any[]>([]);

  // Track jobs where the user is assigned to specific tasks
  useEffect(() => {
    if (!effectiveUserId || !tenantId) return;

    const searchIds = [effectiveUserId];
    if (staffMember?.id && staffMember.id !== effectiveUserId) {
      searchIds.push(staffMember.id);
    }

    const q = query(
      collectionGroup(db, 'tasks'),
      where('tenantId', '==', tenantId),
      where('assignedStaffIds', 'array-contains-any', searchIds)
    );
    const unsub = onSnapshot(q, (snap) => {
      const filteredDocs = snap.docs.filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`));
      setMyAssignedTasks(filteredDocs.map(doc => ({ 
        id: doc.id, 
        jobId: doc.ref.path.split('/')[3],
        ...doc.data() 
      })));
      
      const ids = filteredDocs.map(doc => doc.ref.path.split('/')[3]);
      setTaskJobIds([...new Set(ids)]);
    }, (err) => {
      console.error("Task assignment listener error:", err);
    });
    return () => unsub();
  }, [effectiveUserId, tenantId, staffMember?.id]);
 
  // Track user's time sessions
  useEffect(() => {
    if (!effectiveUserId || !tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('userId', '==', effectiveUserId),
      orderBy('clockIn.timestamp', 'desc'),
      limit(50)
    );
    let unsub = onSnapshot(q, (snap) => {
      setSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.warn("Time sessions index is missing or building, using in-memory fallback query:", err);
      const fallbackQ = query(collection(db, `businesses/${tenantId}/time_sessions`));
      const fallbackUnsub = onSnapshot(fallbackQ, (snap) => {
        const filtered = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as any))
          .filter(s => s.userId === effectiveUserId)
          .sort((a, b) => {
            const aTs = a.clockIn?.timestamp?.seconds ? a.clockIn.timestamp.seconds * 1000 : new Date(a.clockIn?.timestamp || 0).getTime();
            const bTs = b.clockIn?.timestamp?.seconds ? b.clockIn.timestamp.seconds * 1000 : new Date(b.clockIn?.timestamp || 0).getTime();
            return bTs - aTs;
          })
          .slice(0, 50);
        setSessions(filtered);
      });
      unsub = fallbackUnsub;
    });
    return () => unsub();
  }, [tenantId, effectiveUserId]);

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

  // Track department record for weekly credit
  useEffect(() => {
    if (!tenantId || !staffMember?.departmentId) {
      setMyDept(null);
      return;
    }
    const unsub = onSnapshot(doc(db, `businesses/${tenantId}/departments`, staffMember.departmentId), (snap) => {
      if (snap.exists()) {
        setMyDept({ id: snap.id, ...snap.data() });
      } else {
        setMyDept(null);
      }
    });
    return () => unsub();
  }, [tenantId, staffMember?.departmentId]);

  // Modal States
  const [isIntakeOpen, setIsIntakeOpen] = useState(false);
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [isPartRequestOpen, setIsPartRequestOpen] = useState(false);
  const [isVehicleIntakeOpen, setIsVehicleIntakeOpen] = useState(false);

  const { clockOutOfJob, isProcessing } = useJobClock(tenantId);

  const handleAssignVehicle = async (zoneId: string, vin: string, actionType: 'assign' | 'clear' | 'remove' | 'remove_job' = 'assign', jobId?: string) => {
    try {
      const trimmedVin = vin?.trim().toUpperCase();
      const zone = allZones.find(z => z.id === zoneId);
      const previousVin = zone?.currentVehicleVin || null;
      const previousJobId = zone?.currentJobId || null;

      // AUTO-MOVE: If this VIN or Job is already in another zone, clear it from there first
      if (actionType === 'assign' && (trimmedVin || jobId)) {
        const otherZones = allZones.filter(z => z.id !== zoneId);
        for (const oz of otherZones) {
          let needsClear = false;
          if (trimmedVin && oz.currentVehicleVin === trimmedVin) needsClear = true;
          else if (jobId && oz.currentJobId === jobId) needsClear = true;
          else if (trimmedVin && oz.currentVehicleVins?.includes(trimmedVin)) needsClear = true;
          
          if (needsClear) {
            await updateDoc(doc(db, `businesses/${tenantId}/zones`, oz.id), { 
              currentVehicleVin: null, 
              currentJobId: null,
              currentVehicleVins: (oz.currentVehicleVins || []).filter((v: string) => v !== trimmedVin)
            });
          }
        }
      }

      if (zone?.allowMultiple) {
        let newVins = [...(zone.currentVehicleVins || [])];
        if (actionType === 'assign' && trimmedVin) {
          if (!newVins.includes(trimmedVin)) newVins.push(trimmedVin);
        } else if (actionType === 'remove' && trimmedVin) {
          newVins = newVins.filter(v => v !== trimmedVin);
        } else if (actionType === 'clear') {
          newVins = [];
        }
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), { 
          currentVehicleVins: newVins,
          lastAssignedAt: new Date() 
        });
      } else {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), {
          currentVehicleVin: actionType === 'clear' ? null : trimmedVin || previousVin,
          currentJobId: actionType === 'clear' || actionType === 'remove_job' ? null : jobId || previousJobId,
          lastAssignedAt: new Date()
        });
      }
      toast.success(actionType === 'clear' ? 'Zone cleared' : 'Update successful');
    } catch (e) {
      console.error(e);
      toast.error('Failed to update zone');
    }
  };

  useEffect(() => {
    if (!tenantId || !effectiveUserId) return;

    // Fetch All Jobs to allow deriving both direct and zone-based assignments
    // Sorted by lastWorkedAt to show most recently worked on at the top
    const jobsQ = query(
      collection(db, `businesses/${tenantId}/jobs`)
    );
    const unsubJobs = onSnapshot(jobsQ, (snap) => {
      const active = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((j: any) => !['Ready for Customer', 'Completed', 'Closed'].includes(j.status))
        .sort((a: any, b: any) => {
          const getTs = (item: any) => item.lastWorkedAt?.seconds ? item.lastWorkedAt.seconds * 1000 : new Date(item.lastWorkedAt || 0).getTime();
          return getTs(b) - getTs(a);
        });
      setAllActiveJobs(active);
      setLastUpdated(new Date());
    }, (err) => {
      // Fallback if index isn't created yet or other error
      console.error("Jobs query error (likely missing index):", err);
      const fallbackQ = query(collection(db, `businesses/${tenantId}/jobs`));
      onSnapshot(fallbackQ, (snap) => {
        const active = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((j: any) => !['Ready for Customer', 'Completed', 'Closed'].includes(j.status))
          .sort((a: any, b: any) => {
            const getTs = (item: any) => item.lastWorkedAt?.seconds ? item.lastWorkedAt.seconds * 1000 : new Date(item.lastWorkedAt || 0).getTime();
            return getTs(b) - getTs(a);
          });
        setAllActiveJobs(active);
      });
    });

    // Fetch ALL Zones (Bays) so we can see where any job is
    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      setAllZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Zones listener error:", err));

    // Fetch vehicles for display context
    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), (snap) => {
      setVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Vehicles listener error:", err));

    const unsubTodos = onSnapshot(collection(db, `businesses/${tenantId}/todos`), (snap) => {
      setTodos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Todos listener error:", err));

    return () => {
      unsubJobs();
      unsubZones();
      unsubVehicles();
      unsubTodos();
    };
  }, [tenantId, effectiveUserId]);

  useEffect(() => {
    if (!tenantId || !activeSessionId) {
      setActiveJobIds([]);
      return;
    }
    const unsub = onSnapshot(doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const jobs = data.jobs || [];
        const activeSegments = jobs.filter((j: any) => !j.end);
        
        // Track all unique active job IDs
        const activeIds = Array.from(new Set(activeSegments.map((j: any) => j.id))) as string[];
        setActiveJobIds(activeIds);

        // Track all jobs worked in this session for "Recent" visibility
        const uniqueJobIds = Array.from(new Set(jobs.map((j: any) => j.id))) as string[];
        setSessionJobIds(uniqueJobIds);
      } else {
        setActiveJobIds([]);
      }
    });
    return () => unsub();
  }, [tenantId, activeSessionId]);

  const myZones = allZones.filter(z => 
    z.assignedStaffIds?.includes(effectiveUserId) || 
    (staffMember?.id && z.assignedStaffIds?.includes(staffMember.id))
  );

  // Derive my jobs: explicitly assigned OR implicitly assigned via my zones OR clocked in OR recently worked
  const myJobs = allActiveJobs.filter(job => {
    const explicitlyAssigned = job.assignedStaffIds?.includes(effectiveUserId) || 
      (staffMember?.id && job.assignedStaffIds?.includes(staffMember.id));
    const implicitlyAssigned = myZones.some(z => z.currentJobId === job.id);
    const isClockedIn = activeJobIds.includes(job.id);
    const workedRecently = sessionJobIds.includes(job.id);
    const taskAssigned = taskJobIds.includes(job.id);
    
    return explicitlyAssigned || implicitlyAssigned || isClockedIn || workedRecently || taskAssigned;
  });

  const myCurrentTodos = todos.filter(t => {
    if (t.status === 'completed') return false;

    // Check assignments
    const isAssigned = staffMember && (
      t.assignedStaffIds?.includes(staffMember.id) ||
      t.assignedToAllStaff ||
      (staffMember.departmentId && t.assignedDepartmentIds?.includes(staffMember.departmentId))
    );
    if (!isAssigned) return false;

    // Check if it has a due date, and if it is due today or past due
    if (!t.dueDate) return false;

    // Local time today representation
    const todayStr = new Date().toISOString().split('T')[0];
    return t.dueDate <= todayStr;
  });

  // Calculation helpers and stats for payroll, schedule, and efficiency
  const calculateDuration = (start: any, end: any) => {
    if (!start) return 0;
    const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
    const e = end ? (end.toDate ? end.toDate().getTime() : new Date(end).getTime()) : Date.now();
    return Math.max(0, e - s);
  };

  const calculateSessionPayMs = (session: any) => {
    const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
    const breakMs = (session.breaks || []).reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0);
    
    if (!session.jobs || session.jobs.length === 0) {
      return totalMs - breakMs;
    }

    const taskActualTime: Record<string, number> = {};
    const taskBookTime: Record<string, number> = {};
    let unpaidMs = 0;

    session.jobs.forEach((j: any, idx: number) => {
      const key = j.taskId || `manual-${idx}-${j.name}`;
      const start = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
      const end = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : Date.now();
      const segMs = Math.max(0, end - start);

      // Check if task is Rework or Diag to exclude it from paid actual hours
      const lowerName = (j.taskName || j.name || '').toLowerCase();
      const isRework = lowerName.includes('rework') || lowerName.includes('failed qc') || lowerName.includes('failed qa');
      const isDiag = lowerName.includes('diagnostic') || lowerName.includes('diag');
      
      let isTaskUnpaid = isRework || isDiag;
      if (j.taskId) {
        const t = myAssignedTasks.find(x => x.id === j.taskId);
        if (t) {
          isTaskUnpaid = t.isRework || t.status === 'Rework' || t.isDiagnostic || t.title?.toLowerCase().includes('diagnostic') || t.title?.toLowerCase().includes('diag');
        }
      }

      if (isTaskUnpaid) {
        unpaidMs += segMs;
      } else {
        taskActualTime[key] = (taskActualTime[key] || 0) + segMs;
        if (j.bookTime && j.bookTime > 0) {
          taskBookTime[key] = j.bookTime * 3600000;
        }
      }
    });

    const workMs = Math.max(0, totalMs - breakMs - unpaidMs);

    let adjustmentMs = 0;
    Object.keys(taskBookTime).forEach(key => {
      const actualMs = taskActualTime[key] || 0;
      const bookMs = taskBookTime[key] || 0;
      adjustmentMs += (bookMs - actualMs);
    });

    return Math.max(0, workMs + adjustmentMs);
  };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(todayStart);
  const day = weekStart.getDay(); // 0 is Sunday, 1 is Monday, etc.
  const daysToSubtract = day === 0 ? 6 : day - 1;
  weekStart.setDate(weekStart.getDate() - daysToSubtract);

  let weekMs = 0;
  let weekPayMs = 0;
  let weekBreakMs = 0;
  let weekRegularHourlyMs = 0; // Track regular hourly tasks for flat rate

  let totalBookMsOnBookTasks = 0;
  let totalSpentMsOnBookTasks = 0;

  sessions?.forEach(session => {
    const sessionDate = session.clockIn.timestamp?.toDate 
      ? session.clockIn.timestamp.toDate() 
      : new Date(session.clockIn.timestamp);
    if (!sessionDate) return;

    const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
    const breakMs = (session.breaks || []).reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0);
    const workMs = totalMs - breakMs;
    const payMs = calculateSessionPayMs(session);

    if (sessionDate.getTime() >= weekStart.getTime()) {
      weekMs += workMs;
      weekPayMs += payMs;
      weekBreakMs += breakMs;

      // Accumulate regular hourly spent time (bookTime === 0, not Rework/Diag) for flat-rate employees
      if (session.jobs && session.jobs.length > 0) {
        session.jobs.forEach((j: any) => {
          const start = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
          const end = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : Date.now();
          const segMs = Math.max(0, end - start);
          
          const bookTime = Number(j.bookTime || 0);
          if (bookTime === 0) {
            const lowerName = (j.taskName || j.name || '').toLowerCase();
            const isRework = lowerName.includes('rework') || lowerName.includes('failed qc') || lowerName.includes('failed qa');
            const isDiag = lowerName.includes('diagnostic') || lowerName.includes('diag');
            
            let isTaskUnpaid = isRework || isDiag;
            if (j.taskId) {
              const t = myAssignedTasks.find(x => x.id === j.taskId);
              if (t) {
                isTaskUnpaid = t.isRework || t.status === 'Rework' || t.isDiagnostic || t.title?.toLowerCase().includes('diagnostic') || t.title?.toLowerCase().includes('diag');
              }
            }
            
            if (!isTaskUnpaid) {
              weekRegularHourlyMs += segMs;
            }
          }
        });
      }

      // Accumulate spent and book time for efficiency calculations for the current period
      if (session.jobs && session.jobs.length > 0) {
        const taskActualTime: Record<string, number> = {};
        const taskBookTime: Record<string, number> = {};

        session.jobs.forEach((j: any, idx: number) => {
          const key = j.taskId || `manual-${idx}-${j.name}`;
          const start = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
          const end = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : Date.now();
          const segMs = Math.max(0, end - start);

          taskActualTime[key] = (taskActualTime[key] || 0) + segMs;
          if (j.bookTime && j.bookTime > 0) {
            taskBookTime[key] = j.bookTime * 3600000;
          }
        });

        Object.keys(taskBookTime).forEach(key => {
          totalBookMsOnBookTasks += taskBookTime[key];
          totalSpentMsOnBookTasks += taskActualTime[key];
        });
      }
    }
  });

  // Calculate Credit allowance matching TimeClockHistory
  let activeCreditMs = 0;
  let creditSource = '';
  if (staffMember?.payPeriodBookTimeCredit && staffMember.payPeriodBookTimeCredit > 0) {
    activeCreditMs = staffMember.payPeriodBookTimeCredit * 3600000;
    creditSource = `${staffMember.payPeriodBookTimeCredit}h Override`;
  } else if (myDept?.weeklyBookTimeCredit && myDept.weeklyBookTimeCredit > 0) {
    activeCreditMs = myDept.weeklyBookTimeCredit * 3600000;
    creditSource = `${myDept.weeklyBookTimeCredit}h Dept Default`;
  }

  if (weekMs > 0 && activeCreditMs > 0) {
    weekPayMs += activeCreditMs;
  }

  let doneBookHours = 0;
  let scheduledBookHours = 0;

  myAssignedTasks.forEach(t => {
    const bookTime = Number(t.bookTime || 0);
    const isCompleted = t.status === 'QC Complete' || t.status === 'QC' || t.status === 'completed';
    
    if (isCompleted) {
      const compDateVal = t.completedAt || t.qcCompletedAt || t.updatedAt;
      
      const compTime = compDateVal 
        ? (compDateVal.seconds ? compDateVal.seconds * 1000 : new Date(compDateVal).getTime()) 
        : 0;
      
      if (compTime >= weekStart.getTime()) {
        doneBookHours += bookTime;
      }
    } else {
      scheduledBookHours += bookTime;
    }
  });

  const totalBookHoursAvailable = doneBookHours + scheduledBookHours;

  const payType = staffMember?.payType || 'hourly';
  const displayPayHours = payType === 'flat_rate'
    ? doneBookHours + (activeCreditMs / 3600000) + (weekRegularHourlyMs / 3600000)
    : (weekPayMs / 3600000);

  const efficiency = weekMs > 0 
    ? (doneBookHours / (weekMs / 3600000)) * 100 
    : null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'Blocked': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      case 'On Hold': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      default: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    }
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "max-w-7xl mx-auto animate-in fade-in duration-500",
        isFullscreen ? "p-2 space-y-2 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar" : "space-y-4 md:space-y-8"
      )}
    >
      <Toaster position="top-right" richColors theme="system" closeButton />
      <div className={cn(
        "flex flex-col sm:flex-row items-center justify-end gap-3 w-full relative z-10",
        !isFullscreen && "sm:-mt-20"
      )}>
        {isFullscreen && (
          <div className="mr-auto flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Mission Control</span>
            <span className="text-[10px] font-bold text-zinc-500">• Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        )}
        <button 
          onClick={toggleFullscreen}
          className="hidden sm:flex w-full sm:w-auto px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-lg transition-all items-center justify-center gap-2"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
        </button>
      </div>
      {/* Compact Ultimate Search Bar */}
      <div className="relative group max-w-4xl">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
        </div>
        <input
          type="text"
          placeholder="Quick search customers, vehicles, bays, or staff..."
          onFocus={() => openSearch()}
          onChange={(e) => openSearch(e.target.value)}
          className={cn(
            "w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl md:rounded-2xl pl-12 pr-24 shadow-sm hover:border-indigo-500/50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400 text-sm md:text-base font-medium",
            isFullscreen ? "py-2" : "py-3 md:py-4"
          )}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <Command className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] font-black text-zinc-500">F</span>
          </div>
        </div>
      </div>
 
      {/* Quick Actions Row */}
      <div className={cn(
        "grid grid-cols-4 gap-2 md:gap-4 max-w-4xl",
        isFullscreen ? "mb-2" : "mb-4 md:mb-8"
      )}>
        <button 
          onClick={() => setIsIntakeOpen(true)}
          className="flex flex-col items-center justify-center gap-1.5 md:gap-3 p-2 md:p-4 bg-white dark:bg-zinc-900 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-500/30 rounded-2xl md:rounded-3xl transition-all group shadow-sm"
        >
          <div className="p-2 md:p-3 bg-indigo-500/10 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform">
            <Package className="w-4 h-4 md:w-6 md:h-6 text-indigo-500" />
          </div>
          <span className="font-bold text-[10px] md:text-sm text-zinc-900 dark:text-white text-center leading-tight">Receive<br className="md:hidden" /> Package</span>
        </button>

        <button 
          onClick={() => setIsIssueOpen(true)}
          className="flex flex-col items-center justify-center gap-1.5 md:gap-3 p-2 md:p-4 bg-white dark:bg-zinc-900 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-rose-200 dark:hover:border-rose-500/30 rounded-2xl md:rounded-3xl transition-all group shadow-sm"
        >
          <div className="p-2 md:p-3 bg-rose-500/10 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform">
            <AlertTriangle className="w-4 h-4 md:w-6 md:h-6 text-rose-500" />
          </div>
          <span className="font-bold text-[10px] md:text-sm text-zinc-900 dark:text-white text-center leading-tight">Log<br className="md:hidden" /> Issue</span>
        </button>

        <button 
          onClick={() => setIsPartRequestOpen(true)}
          className="flex flex-col items-center justify-center gap-1.5 md:gap-3 p-2 md:p-4 bg-white dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-amber-200 dark:hover:border-amber-500/30 rounded-2xl md:rounded-3xl transition-all group shadow-sm"
        >
          <div className="p-2 md:p-3 bg-amber-500/10 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform">
            <Wrench className="w-4 h-4 md:w-6 md:h-6 text-amber-500" />
          </div>
          <span className="font-bold text-[10px] md:text-sm text-zinc-900 dark:text-white text-center leading-tight">Request<br className="md:hidden" /> Part</span>
        </button>

        <button 
          onClick={() => setIsVehicleIntakeOpen(true)}
          className="flex flex-col items-center justify-center gap-1.5 md:gap-3 p-2 md:p-4 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-200 dark:hover:border-emerald-500/30 rounded-2xl md:rounded-3xl transition-all group shadow-sm"
        >
          <div className="p-2 md:p-3 bg-emerald-500/10 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform">
            <CarFront className="w-4 h-4 md:w-6 md:h-6 text-emerald-500" />
          </div>
          <span className="font-bold text-[10px] md:text-sm text-zinc-900 dark:text-white text-center leading-tight">Vehicle<br className="md:hidden" /> Intake</span>
        </button>
      </div>

      {/* Performance & Payroll Metrics Dashboard */}
      <div className="max-w-4xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Payroll Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl">
              <Coins className="w-5 h-5 text-indigo-500" />
            </div>
            {activeCreditMs > 0 && weekMs > 0 && (
              <span className="text-[9px] font-black uppercase tracking-widest bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full" title={creditSource}>
                +{(activeCreditMs / 3600000).toFixed(1)}h Credit
              </span>
            )}
          </div>
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Period Pay Hours</span>
          <span className="font-mono text-2xl font-black text-zinc-900 dark:text-white mt-1 block">
            {displayPayHours.toFixed(2)}h
          </span>
          <div className="text-xs font-semibold text-zinc-400 mt-2">
            {payType === 'flat_rate' ? (
              <div className="flex flex-col gap-1">
                <span>Earned book hours (Flat-Rate)</span>
                <span className="inline-flex items-center text-[9px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md w-max animate-pulse">
                  🧪 Experimental Math
                </span>
              </div>
            ) : (
              "Estimated payroll hours"
            )}
          </div>
        </div>

        {/* Clocked Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-emerald-500/10 rounded-xl">
              <Clock className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="flex flex-col items-end gap-1">
              {activeSessionId && (
                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full animate-pulse">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Clocked In
                </span>
              )}
              {weekBreakMs > 0 && (
                <span className="text-[9px] font-black uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded-full" title="Total time card duration before break deduction">
                  {((weekMs + weekBreakMs) / 3600000).toFixed(1)}h Gross Clocked
                </span>
              )}
            </div>
          </div>
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Actual On Clock</span>
          <span className="font-mono text-2xl font-black text-zinc-900 dark:text-white mt-1 block">
            {(weekMs / 3600000).toFixed(2)}h
          </span>
          <p className="text-xs font-semibold text-zinc-400 mt-2">
            {payType === 'flat_rate' ? (
              "Clocked time (For attendance & efficiency tracking only)"
            ) : weekBreakMs > 0 ? (
              <span>
                Net worked hours (excludes <span className="font-bold text-zinc-600 dark:text-zinc-300">{(weekBreakMs / 3600000).toFixed(2)}h breaks</span>)
              </span>
            ) : (
              "Net worked hours (no breaks logged)"
            )}
          </p>
        </div>

        {/* Task Book hours progress Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-amber-500/10 rounded-xl">
              <Award className="w-5 h-5 text-amber-500" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
              Tasks Done
            </span>
          </div>
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Book Time Completed</span>
          <span className="font-mono text-2xl font-black text-zinc-900 dark:text-white mt-1 block">
            {doneBookHours.toFixed(1)}h <span className="text-sm font-semibold text-zinc-400">/ {totalBookHoursAvailable.toFixed(1)}h</span>
          </span>
          
          {/* Visual Progress Bar */}
          <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 mt-3 overflow-hidden">
            <div 
              className="bg-amber-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${totalBookHoursAvailable > 0 ? Math.min(100, (doneBookHours / totalBookHoursAvailable) * 100) : 0}%` }}
            />
          </div>
        </div>

        {/* Efficiency Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
            </div>
            {efficiency !== null && (
              <span className={cn(
                "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                efficiency >= 100 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                efficiency >= 90 ? "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400" :
                "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              )}>
                {efficiency >= 100 ? 'High Pace' : efficiency >= 90 ? 'On Pace' : 'Slow Pace'}
              </span>
            )}
          </div>
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Efficiency Rating</span>
          <span className="font-mono text-2xl font-black text-zinc-900 dark:text-white mt-1 block">
            {efficiency !== null ? `${efficiency.toFixed(0)}%` : '--'}
          </span>
          <p className="text-xs font-semibold text-zinc-400 mt-2">
            Completed Book vs Clock Hours
          </p>
        </div>
      </div>

      {/* Task Book Scheduled Details info row */}
      <div className="max-w-4xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg">
            <Briefcase className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Scheduled Task Backlog</p>
            <p className="text-[10px] text-zinc-500">Book-time load waiting for completion in your roster queue</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Book Time Scheduled:</span>
          <span className="px-3 py-1 bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl font-mono text-sm font-black text-zinc-800 dark:text-zinc-200">
            {scheduledBookHours.toFixed(1)}h Booked
          </span>
        </div>
      </div>

      <div className="max-w-4xl space-y-6">
        {/* My Todos */}
        {myCurrentTodos.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm border-t-rose-500/30 dark:border-t-rose-500/20 border-t-4">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 md:p-2.5 bg-rose-500/10 rounded-xl">
                  <CheckSquare className="w-5 h-5 md:w-6 md:h-6 text-rose-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white">My Todos</h2>
                  <p className="text-xs text-zinc-500 font-medium">Todos assigned to you that are due today or overdue</p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-black animate-pulse">
                {myCurrentTodos.length} Due / Overdue
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myCurrentTodos.map(todo => {
                const isOverdue = todo.dueDate && todo.dueDate < new Date().toISOString().split('T')[0];
                const totalChecklist = todo.checklist?.length || 0;
                const completedChecklist = todo.checklist?.filter((i: any) => i.done).length || 0;
                
                return (
                  <div 
                    key={todo.id}
                    className="p-4 bg-zinc-55 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-850 rounded-2xl space-y-3 relative hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white leading-snug">{todo.title}</h3>
                        {todo.description && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">{todo.description}</p>
                        )}
                      </div>
                      
                      {/* Check off directly from Dashboard */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await updateDoc(doc(db, `businesses/${tenantId}/todos`, todo.id), {
                              status: 'completed',
                              updatedAt: new Date()
                            });
                            toast.success('Todo completed!');
                          } catch (err) {
                            console.error(err);
                            toast.error('Failed to complete todo');
                          }
                        }}
                        className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-500 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shrink-0"
                        title="Mark Complete"
                      >
                        ✓ Complete
                      </button>
                    </div>

                    {/* Checklist inline items with checkbox toggles right on Dashboard */}
                    {totalChecklist > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-zinc-200/50 dark:border-zinc-850">
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Checklist ({completedChecklist}/{totalChecklist})</p>
                        <div className="space-y-1">
                          {todo.checklist.map((item: any) => (
                            <label 
                              key={item.id} 
                              className="flex items-center gap-2 text-xs text-zinc-650 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer select-none"
                            >
                              <input
                                type="checkbox"
                                checked={item.done}
                                onChange={async (e) => {
                                  const updatedChecklist = todo.checklist.map((c: any) => 
                                    c.id === item.id ? { ...c, done: e.target.checked } : c
                                  );
                                  try {
                                    await updateDoc(doc(db, `businesses/${tenantId}/todos`, todo.id), {
                                      checklist: updatedChecklist,
                                      updatedAt: new Date()
                                    });
                                  } catch (err) {
                                    console.error(err);
                                    toast.error('Failed to update item');
                                  }
                                }}
                                className="w-3.5 h-3.5 text-indigo-650 rounded border-zinc-305 dark:border-zinc-700 bg-zinc-150 dark:bg-zinc-800 cursor-pointer appearance-none checked:bg-indigo-500 checked:border-indigo-500 flex items-center justify-center after:content-['✓'] after:text-[10px] after:text-white after:hidden checked:after:block transition-all"
                              />
                              <span className={item.done ? 'line-through text-zinc-400 dark:text-zinc-600' : 'font-medium'}>
                                {item.text}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-200/50 dark:border-zinc-850 text-[10px] font-bold">
                      <span className={cn(
                        "px-2 py-0.5 rounded-lg uppercase tracking-wider text-[9px]",
                        todo.priority === 'urgent' ? 'bg-rose-500/10 text-rose-500 animate-pulse font-black' :
                        todo.priority === 'high' ? 'bg-amber-55/10 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' :
                        todo.priority === 'medium' ? 'bg-blue-55/10 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' :
                        'bg-zinc-100 text-zinc-650 dark:bg-zinc-800 dark:text-zinc-400'
                      )}>
                        {todo.priority} Priority
                      </span>
                      
                      <span className={cn(
                        "flex items-center gap-1 uppercase tracking-wider text-[9px]",
                        isOverdue ? "text-rose-500 animate-pulse font-black" : "text-zinc-450"
                      )}>
                        <Clock className="w-3 h-3" />
                        {isOverdue ? 'Overdue: ' : 'Due Today: '}
                        {new Date(todo.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* My Jobs */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 md:mb-6">
            <div className="p-2 md:p-2.5 bg-indigo-500/10 rounded-xl">
              <Briefcase className="w-5 h-5 md:w-6 md:h-6 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">My Active Jobs</h2>
              <p className="text-xs text-zinc-500 font-medium">Jobs currently assigned to you or your shop area</p>
            </div>
          </div>

          <div className="space-y-3">
            {myJobs.length === 0 ? (
              <div className="p-12 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800/50">
                <Briefcase className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-bold text-zinc-500">You have no active job assignments.</p>
              </div>
            ) : (
              myJobs.map(job => {
                // Find tasks assigned to me on this job
                const jobTasks = myAssignedTasks.filter(t => t.jobId === job.id);
                
                let jobTotalBookHours = 0;
                let jobDoneBookHours = 0;
                jobTasks.forEach(t => {
                  const bt = Number(t.bookTime || 0);
                  jobTotalBookHours += bt;
                  if (t.status === 'QC Complete' || t.status === 'QC' || t.status === 'completed') {
                    jobDoneBookHours += bt;
                  }
                });

                // Calculate efficiency specifically for this job's tasks from the current pay period
                let jobBookMsEarned = 0;
                let jobSpentMsOnBookTasks = 0;

                sessions?.forEach(session => {
                  if (session.jobs && session.jobs.length > 0) {
                    session.jobs.forEach((j: any) => {
                      if (j.id === job.id && j.bookTime && j.bookTime > 0) {
                        const start = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
                        const end = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : null;
                        if (end) {
                          const duration = Math.max(0, end - start);
                          jobSpentMsOnBookTasks += duration;
                          jobBookMsEarned += j.bookTime * 3600000;
                        }
                      }
                    });
                  }
                });

                // Safeguard against near-zero task logged times (e.g. instant clock-ins/outs)
                const jobEfficiency = jobSpentMsOnBookTasks >= 10 * 60 * 1000
                  ? (jobBookMsEarned / jobSpentMsOnBookTasks) * 100
                  : null;

                return (
                  <div 
                    key={job.id}
                    onClick={() => {
                      const zone = allZones.find(z => z.currentJobId === job.id);
                      const vehicle = vehicles.find(v => v.vin === zone?.currentVehicleVin);
                      const jobId = job.id || zone?.currentJobId || vehicle?.jobId;
                      if (jobId) {
                        navigate(`/business/${tenantId}/job/${jobId}`);
                      }
                    }}
                    className="w-full cursor-pointer text-left bg-zinc-50 dark:bg-zinc-950 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-500/30 rounded-2xl p-4 transition-all group flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">{job.jobNumber ? `#${job.jobNumber}` : 'JOB'}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(job.status)}`}>
                          {job.status}
                        </span>
                        {activeJobIds.includes(job.id) && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse">
                            Clocked In
                          </span>
                        )}
                        {(!job.assignedStaffIds?.includes(effectiveUserId) && !allZones.some(z => z.currentJobId === job.id) && sessionJobIds.includes(job.id) && !activeJobIds.includes(job.id)) && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
                            Recent Activity
                          </span>
                        )}
                      </div>
                      <h3 className="font-black text-zinc-900 dark:text-white text-lg leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{job.title}</h3>
                      {job.customerName && (
                        <p className="text-sm font-bold text-zinc-500 mt-1">{job.customerName}</p>
                      )}
                      
                      {jobTotalBookHours > 0 && (
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-xl border border-amber-500/20 shadow-sm">
                            <Award className="w-3.5 h-3.5 text-amber-500" />
                            {jobDoneBookHours.toFixed(1)}/{jobTotalBookHours.toFixed(1)}hr Completed
                          </span>
                          
                          {jobEfficiency !== null && (
                            <span className={cn(
                              "inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-xl border shadow-sm",
                              jobEfficiency >= 100 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                              jobEfficiency >= 90 ? "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20" :
                              "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                            )}>
                              <TrendingUp className="w-3.5 h-3.5" />
                              {jobEfficiency.toFixed(0)}% Eff
                            </span>
                          )}
                        </div>
                      )}

                      {job.scheduledArrivalTime && (
                        <p className="text-[10px] font-bold text-indigo-500 mt-2.5 flex items-center gap-1 uppercase tracking-widest">
                          <Clock className="w-3 h-3" />
                          ETA: {(() => {
                            const date = typeof job.scheduledArrivalTime?.toDate === 'function' 
                              ? job.scheduledArrivalTime.toDate() 
                              : new Date(job.scheduledArrivalTime);
                            return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                          })()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex flex-col items-end gap-1.5">
                        {activeJobIds.includes(job.id) && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); clockOutOfJob(job.id); }}
                            disabled={isProcessing}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                          >
                            <Timer className="w-3.5 h-3.5" />
                            Clock Out
                          </button>
                        )}
                        
                        {(() => {
                          const zone = allZones.find(z => z.currentJobId === job.id);
                          const vehicle = (job.vehicleId && job.vehicleId !== 'N/A') 
                            ? vehicles.find(v => v.id === job.vehicleId || v.vin === job.vehicleId)
                            : null;
                          
                          const locationLabel = zone?.name || job.location || job.department || (vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : null);
                          
                          if (!locationLabel) return null;
                          
                          return (
                            <span className="text-[9px] font-black uppercase tracking-tighter text-zinc-400 flex items-center gap-1">
                              {zone ? <MapPin className="w-2.5 h-2.5" /> : (vehicle ? <CarFront className="w-2.5 h-2.5" /> : <Briefcase className="w-2.5 h-2.5" />)}
                              {locationLabel}
                            </span>
                          );
                        })()}
                      </div>
                      <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-700 group-hover:text-indigo-500 transition-colors" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Device Settings */}
        <div className="mt-8">
          <DeviceSettings tenantId={tenantId} />
        </div>
      </div>

      {/* Modals */}
      <PackageIntakeModal 
        isOpen={isIntakeOpen}
        onClose={() => setIsIntakeOpen(false)}
        onSuccess={() => {}}
        zones={allZones}
      />

      <FeedbackModal 
        isOpen={isIssueOpen}
        onClose={() => setIsIssueOpen(false)}
      />

      {isPartRequestOpen && (
        <PartFormModal 
          tenantId={tenantId}
          user={user}
          onClose={() => setIsPartRequestOpen(false)}
          onSuccess={() => {}}
        />
      )}

      <VehicleIntakeModal 
        isOpen={isVehicleIntakeOpen}
        onClose={() => setIsVehicleIntakeOpen(false)}
        tenantId={tenantId}
      />



      {selectedZone && (
        <ZoneDetailsModal
          zone={selectedZone}
          tenantId={tenantId}
          vehicles={vehicles}
          jobs={allActiveJobs}
          onClose={() => setSelectedZone(null)}
          onAssign={(vin: string, jobId?: string) => handleAssignVehicle(selectedZone.id, vin, 'assign', jobId)}
          onClear={() => handleAssignVehicle(selectedZone.id, '', 'clear')}
          onRemoveVehicle={(vin: string) => handleAssignVehicle(selectedZone.id, vin, 'remove')}
          onRemoveJob={() => handleAssignVehicle(selectedZone.id, '', 'remove_job')}
          onQuickAddRequest={() => {}}
          onQuickAddJobRequest={() => {}}
          onOpenVehicle={() => {}}
          onDelete={() => {}}
        />
      )}
    </div>
  );
}
