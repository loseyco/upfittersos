import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase/config';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, 
  collectionGroup, orderBy, limit, setDoc, addDoc, getDocs, getDoc 
} from 'firebase/firestore';
import { 
  Clock, Briefcase, ArrowRight, Package, AlertTriangle, Wrench, 
  CarFront, Timer, Search, Command, Maximize, Minimize, MapPin, 
  TrendingUp, Award, CheckSquare, GripVertical, ChevronUp, 
  ChevronDown, EyeOff, Settings, Plus, Check, Coffee, Pizza, 
  LogIn, Square, Play, Loader2, Activity
} from 'lucide-react';
import { ZoneDetailsModal } from './ZoneModals';
import { PackageIntakeModal } from './PackageIntakeModal';
import { FeedbackModal } from '../../components/FeedbackModal';
import { PartFormModal } from './PartFormModal';
import { VehicleIntakeModal } from './VehicleIntakeModal';
import { toast, Toaster } from 'sonner';
import { useWakeLock } from '../../hooks/useWakeLock';
import { cn } from '../../lib/utils';
import { useJobClock } from '../timeclock/useJobClock';
import { useTimeclockStore, type ClockStatus } from '../../lib/store/timeclockStore';
import { useSearchStore } from '../../lib/store/searchStore';
import { DeviceSettings } from '../../components/DeviceSettings';
import { TimeClockHistory } from '../timeclock/TimeClockHistory';

export function UserMissionControl({ tenantId, viewMode: propViewMode }: { tenantId: string; viewMode?: string }) {
  const navigate = useNavigate();
  const { user, impersonatedStaff, permissions = {}, isSuperAdmin } = useAuthStore();
  const effectiveUserId = impersonatedStaff?.id || user?.uid;
  const { status: clockStatus, startTime: clockStartTime, activeSessionId, setStatus: setClockStatus, reset: resetClock } = useTimeclockStore();
  const { open: openSearch } = useSearchStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Authorization gating check
  const canCustomize = isSuperAdmin || !!permissions['dashboard.customize'];

  // Personalized Dashboard States
  const [viewMode, setViewMode] = useState<'classic' | 'personalized'>('classic');
  const [layout, setLayout] = useState<string[]>([
    'time_clock',
    'job_details',
    'my_tasks',
    'recent_activity',
    'quick_stats',
    'quick_links'
  ]);
  const [cardStates, setCardStates] = useState<Record<string, { visible: boolean; minimized: boolean }>>({
    time_clock: { visible: true, minimized: false },
    job_details: { visible: true, minimized: false },
    my_tasks: { visible: true, minimized: false },
    recent_activity: { visible: true, minimized: false },
    quick_stats: { visible: true, minimized: false },
    quick_links: { visible: true, minimized: false }
  });
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const hasUnsavedChangesRef = useRef(false);

  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [selectedJobCardId, setSelectedJobCardId] = useState<string>('');
  const [isManageCardsOpen, setIsManageCardsOpen] = useState(false);

  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isClockProcessing, setIsClockProcessing] = useState(false);
  const effectiveView = canCustomize ? viewMode : 'classic';

  // Load settings from Firestore
  useEffect(() => {
    if (!tenantId || !effectiveUserId) return;

    const configRef = doc(db, `businesses/${tenantId}/staff_dashboard_configs`, effectiveUserId);
    const unsub = onSnapshot(configRef, (snap) => {
      if (hasUnsavedChangesRef.current) {
        // Shield active client-side changes from snapshot jitter
        return;
      }
      if (snap.exists()) {
        const data = snap.data();
        if (data.view) {
          setViewMode(data.view);
        }
        if (data.layout) {
          setLayout(data.layout);
        }
        if (data.cardStates) {
          setCardStates(prev => {
            const merged = { ...prev };
            Object.keys(data.cardStates).forEach(cardId => {
              merged[cardId] = {
                visible: data.cardStates[cardId].visible ?? prev[cardId]?.visible ?? true,
                minimized: data.cardStates[cardId].minimized ?? prev[cardId]?.minimized ?? false
              };
            });
            return merged;
          });
        }
      }
    }, (err) => {
      console.error("Config listener error:", err);
    });

    return () => unsub();
  }, [tenantId, effectiveUserId]);

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

    // Fetch ALL Zones (Bays)
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
        
        const activeIds = Array.from(new Set(activeSegments.map((j: any) => j.id))) as string[];
        setActiveJobIds(activeIds);

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

    const isAssigned = staffMember && (
      t.assignedStaffIds?.includes(staffMember.id) ||
      t.assignedToAllStaff ||
      (staffMember.departmentId && t.assignedDepartmentIds?.includes(staffMember.departmentId))
    );
    if (!isAssigned) return false;

    if (!t.dueDate) return false;

    const todayStr = new Date().toISOString().split('T')[0];
    return t.dueDate <= todayStr;
  });

  const calculateDuration = (start: any, end: any) => {
    if (!start) return 0;
    const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
    const e = end ? (end.toDate ? end.toDate().getTime() : new Date(end).getTime()) : currentTime;
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
  const day = weekStart.getDay();
  const daysToSubtract = day === 0 ? 6 : day - 1;
  weekStart.setDate(weekStart.getDate() - daysToSubtract);

  let todayMs = 0;
  let todayPayMs = 0;
  let todayBookMs = 0;
  let weekMs = 0;
  let weekPayMs = 0;
  let weekBreakMs = 0;
  let weekRegularHourlyMs = 0;

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

    let sessionBookMs = 0;
    if (session.jobs && session.jobs.length > 0) {
      const taskBookTime: Record<string, number> = {};
      session.jobs.forEach((j: any, idx: number) => {
        const key = j.taskId || `manual-${idx}-${j.name}`;
        if (j.bookTime && j.bookTime > 0) {
          taskBookTime[key] = j.bookTime * 3600000;
        }
      });
      sessionBookMs = Object.values(taskBookTime).reduce((acc, t) => acc + t, 0);
    }

    if (sessionDate.getTime() >= todayStart.getTime()) {
      todayMs += workMs;
      todayPayMs += payMs;
      todayBookMs += sessionBookMs;
    }

    if (sessionDate.getTime() >= weekStart.getTime()) {
      weekMs += workMs;
      weekPayMs += payMs;
      weekBreakMs += breakMs;

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

  let activeCreditMs = 0;
  if (staffMember?.payPeriodBookTimeCredit && staffMember.payPeriodBookTimeCredit > 0) {
    activeCreditMs = staffMember.payPeriodBookTimeCredit * 3600000;
  } else if (myDept?.weeklyBookTimeCredit && myDept.weeklyBookTimeCredit > 0) {
    activeCreditMs = myDept.weeklyBookTimeCredit * 3600000;
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

  // Sync clock status with Firestore
  useEffect(() => {
    const syncStatus = async () => {
      if (!effectiveUserId || !tenantId) return;
      
      try {
        const q = query(
          collection(db, `businesses/${tenantId}/time_sessions`),
          where('userId', '==', effectiveUserId),
          where('status', 'in', ['active', 'on_break']),
          orderBy('clockIn.timestamp', 'desc'),
          limit(1)
        );
        
        const snap = await getDocs(q);
        if (!snap.empty) {
          const session = snap.docs[0].data();
          const sessionId = snap.docs[0].id;
          
          let newStatus: ClockStatus = 'clocked_in';
          let newStartTime = Date.now();
          
          if (session.clockIn?.timestamp) {
            newStartTime = session.clockIn.timestamp.toMillis ? session.clockIn.timestamp.toMillis() : new Date(session.clockIn.timestamp).getTime();
          }
          
          if (session.status === 'on_break') {
            const lastBreak = session.breaks[session.breaks.length - 1];
            newStatus = lastBreak.type === 'lunch' ? 'on_lunch' : 'on_break';
            if (lastBreak.start) {
              newStartTime = lastBreak.start.toMillis ? lastBreak.start.toMillis() : new Date(lastBreak.start).getTime();
            }
          }
          
          setClockStatus(newStatus, newStartTime, sessionId);
        } else if (clockStatus !== 'clocked_out') {
          resetClock();
        }
      } catch (err) {
        console.warn("Time Clock synchronization error:", err);
      }
    };

    syncStatus();
  }, [effectiveUserId, tenantId]);

  // Timer update
  useEffect(() => {
    let interval: any;
    if (clockStatus !== 'clocked_out' && clockStartTime) {
      interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [clockStatus, clockStartTime]);

  const saveTimerRef = useRef<any>(null);

  const triggerSave = (newLayout: string[], newCardStates: Record<string, { visible: boolean; minimized: boolean }>, newViewMode: 'classic' | 'personalized') => {
    if (!effectiveUserId || !tenantId) return;
    setSaveStatus('saving');
    hasUnsavedChangesRef.current = true;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      try {
        const configRef = doc(db, `businesses/${tenantId}/staff_dashboard_configs`, effectiveUserId);
        await setDoc(configRef, {
          view: newViewMode,
          layout: newLayout,
          cardStates: newCardStates,
          updatedAt: new Date()
        }, { merge: true });
        setSaveStatus('saved');
        hasUnsavedChangesRef.current = false;
      } catch (err) {
        console.error("Error saving dashboard config:", err);
        setSaveStatus('error');
        toast.error("Failed to auto-save dashboard configuration");
      }
    }, 1500);
  };

  const toggleCardVisibility = (cardId: string) => {
    const newCardStates = {
      ...cardStates,
      [cardId]: {
        ...cardStates[cardId],
        visible: !cardStates[cardId].visible
      }
    };
    setCardStates(newCardStates);
    hasUnsavedChangesRef.current = true;
    triggerSave(layout, newCardStates, viewMode);
  };

  const toggleCardMinimize = (cardId: string) => {
    const newCardStates = {
      ...cardStates,
      [cardId]: {
        ...cardStates[cardId],
        minimized: !cardStates[cardId].minimized
      }
    };
    setCardStates(newCardStates);
    hasUnsavedChangesRef.current = true;
    triggerSave(layout, newCardStates, viewMode);
  };

  const handleClockIn = async () => {
    setIsClockProcessing(true);
    try {
      let actualName = user?.displayName || user?.email || 'Technician';
      if (tenantId && user?.email) {
        const staffQuery = query(
          collection(db, `businesses/${tenantId}/staff`),
          where('email', '==', user.email.toLowerCase())
        );
        const staffSnap = await getDocs(staffQuery);
        if (!staffSnap.empty) {
          const sd = staffSnap.docs[0].data();
          actualName = `${sd.firstName || ''} ${sd.lastName || ''}`.trim() || actualName;
        }
      }

      const docRef = await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
        userId: effectiveUserId,
        userName: actualName,
        staffName: actualName,
        clockIn: {
          timestamp: new Date(),
          lat: null,
          lng: null,
          onSite: true
        },
        isRemote: false,
        status: 'active',
        breaks: [],
        createdAt: new Date()
      });

      setClockStatus('clocked_in', Date.now(), docRef.id);
      toast.success("Clocked in successfully");
    } catch (e) {
      console.error(e);
      toast.error("Failed to clock in");
    } finally {
      setIsClockProcessing(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeSessionId) return;
    setIsClockProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();

      const breaks = [...(sessionData?.breaks || [])];
      if (clockStatus === 'on_lunch' || clockStatus === 'on_break') {
        const lastBreak = breaks[breaks.length - 1];
        if (!lastBreak.end) {
          lastBreak.end = new Date();
        }
      }

      const jobs = [...(sessionData?.jobs || [])];
      const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
      if (lastJob && !lastJob.end) {
        lastJob.end = new Date();
      }

      await updateDoc(sessionRef, {
        clockOut: {
          timestamp: new Date(),
          lat: null,
          lng: null,
          onSite: true
        },
        status: 'completed',
        breaks,
        jobs,
        updatedAt: new Date()
      });

      resetClock();
      toast.success("Clocked out successfully");
    } catch (e) {
      console.error(e);
      toast.error("Failed to clock out");
    } finally {
      setIsClockProcessing(false);
    }
  };

  const handleStartBreak = async (type: 'lunch' | 'normal') => {
    if (!activeSessionId) return;
    setIsClockProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();
      const breaks = [...(sessionData?.breaks || [])];
      const jobs = [...(sessionData?.jobs || [])];
      
      const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
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
      
      breaks.push({
        type,
        start: new Date(),
        isPaid: type === 'lunch' ? false : true,
        suspendedJob
      });

      await updateDoc(sessionRef, {
        breaks,
        jobs,
        status: 'on_break',
        updatedAt: new Date()
      });

      setClockStatus(type === 'lunch' ? 'on_lunch' : 'on_break', Date.now(), activeSessionId);
      toast.info(`Started ${type} break`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to start break");
    } finally {
      setIsClockProcessing(false);
    }
  };

  const handleEndBreak = async () => {
    if (!activeSessionId) return;
    setIsClockProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();
      const breaks = [...(sessionData?.breaks || [])];
      const jobs = [...(sessionData?.jobs || [])];
      
      let suspendedJob = null;
      if (breaks.length > 0) {
        const lastBreak = breaks[breaks.length - 1];
        lastBreak.end = new Date();
        suspendedJob = lastBreak.suspendedJob;
      }

      if (suspendedJob) {
        jobs.push({
          id: suspendedJob.id,
          name: suspendedJob.name,
          taskId: suspendedJob.taskId || null,
          taskName: suspendedJob.taskName || null,
          start: new Date()
        });
      }

      await updateDoc(sessionRef, {
        breaks,
        jobs,
        jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
        status: 'active',
        updatedAt: new Date()
      });

      const originalClockIn = sessionData?.clockIn?.timestamp?.toMillis ? sessionData.clockIn.timestamp.toMillis() : new Date(sessionData?.clockIn?.timestamp || Date.now()).getTime();
      setClockStatus('clocked_in', originalClockIn, activeSessionId);
      toast.success("Break ended");
    } catch (e) {
      console.error(e);
      toast.error("Failed to end break");
    } finally {
      setIsClockProcessing(false);
    }
  };

  const calculateNetWorkMs = () => {
    const activeSession = sessions.find(s => s.status === 'active' || s.status === 'on_break');
    if (!activeSession || !clockStartTime) return 0;
    
    const clockInTs = activeSession.clockIn?.timestamp?.toMillis ? activeSession.clockIn.timestamp.toMillis() : (activeSession.clockIn?.timestamp?.seconds ? activeSession.clockIn.timestamp.seconds * 1000 : new Date(activeSession.clockIn?.timestamp || clockStartTime).getTime());
    const totalGrossMs = currentTime - clockInTs;
    
    const completedBreakMs = activeSession.breaks?.reduce((acc: number, b: any) => {
      if (!b.start || !b.end) return acc;
      const start = b.start.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
      const end = b.end.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime();
      return acc + (end - start);
    }, 0) || 0;

    return Math.max(0, totalGrossMs - completedBreakMs);
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getPunchLogs = (sessionsList: any[]) => {
    const logs: { type: string; timestamp: Date; details?: string }[] = [];
    sessionsList.forEach((session: any) => {
      if (session.clockIn?.timestamp) {
        const inDate = session.clockIn.timestamp.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
        logs.push({
          type: 'Clock In',
          timestamp: inDate,
          details: session.isRemote ? 'Remote' : 'On Site'
        });
      }
      if (session.clockOut?.timestamp) {
        const outDate = session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate() : new Date(session.clockOut.timestamp);
        logs.push({
          type: 'Clock Out',
          timestamp: outDate
        });
      }
      if (session.breaks && Array.isArray(session.breaks)) {
        session.breaks.forEach((b: any) => {
          const isLunch = b.type === 'lunch';
          if (b.start) {
            const startDate = b.start.toDate ? b.start.toDate() : new Date(b.start);
            logs.push({
              type: isLunch ? 'Lunch Start' : 'Break Start',
              timestamp: startDate
            });
          }
          if (b.end) {
            const endDate = b.end.toDate ? b.end.toDate() : new Date(b.end);
            logs.push({
              type: isLunch ? 'Lunch End' : 'Break End',
              timestamp: endDate
            });
          }
        });
      }
    });
    return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 5);
  };

  useEffect(() => {
    if (myJobs.length > 0 && !selectedJobCardId) {
      setSelectedJobCardId(myJobs[0].id);
    }
  }, [myJobs]);

  const renderTimeClockBody = () => (
    <div className="space-y-4">
      <div className="bg-zinc-55 dark:bg-zinc-955 p-3 rounded-2xl border border-zinc-150 dark:border-zinc-900/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2.5 h-2.5 rounded-full",
            clockStatus === 'clocked_out' ? "bg-zinc-400" :
            clockStatus === 'clocked_in' ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500 animate-pulse"
          )} />
          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-305 capitalize">
            {clockStatus.replace('_', ' ')}
          </span>
        </div>
        {clockStatus !== 'clocked_out' && clockStartTime && (
          <span className={cn(
            "text-base font-mono font-black tabular-nums",
            clockStatus === 'clocked_in' ? "text-indigo-650 dark:text-indigo-400" : "text-amber-500"
          )}>
            {clockStatus === 'clocked_in'
              ? formatDuration(calculateNetWorkMs())
              : formatDuration(Math.max(0, currentTime - clockStartTime))
            }
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {isClockProcessing ? (
          <div className="flex items-center gap-2 px-4 py-2 text-zinc-400 text-sm font-bold bg-zinc-105 dark:bg-zinc-900 rounded-xl w-full justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
            <span>Processing...</span>
          </div>
        ) : (
          <>
            {clockStatus === 'clocked_out' ? (
              <button
                onClick={handleClockIn}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-605 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <LogIn className="w-4 h-4" /> Clock In
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2 w-full">
                {clockStatus === 'clocked_in' ? (
                  <>
                    <button
                      onClick={() => handleStartBreak('lunch')}
                      className="px-2 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 border border-amber-500/20 cursor-pointer"
                    >
                      <Pizza className="w-4 h-4" /> Lunch
                    </button>
                    <button
                      onClick={() => handleStartBreak('normal')}
                      className="px-2 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 border border-amber-500/20 cursor-pointer"
                    >
                      <Coffee className="w-4 h-4" /> Break
                    </button>
                    <button
                      onClick={handleClockOut}
                      className="px-2 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                    >
                      <Square className="w-4 h-4" /> Out
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleEndBreak}
                    className="col-span-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Play className="w-4 h-4" /> Resume Work
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-150 dark:border-zinc-900/60">
          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Period Pay Hours</span>
          <span className="font-mono text-sm font-black text-zinc-900 dark:text-white mt-0.5 block">
            {displayPayHours.toFixed(2)}h
          </span>
        </div>
        <div className="bg-zinc-55 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-150 dark:border-zinc-900/60">
          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Actual On Clock</span>
          <span className="font-mono text-sm font-black text-zinc-900 dark:text-white mt-0.5 block">
            {(weekMs / 3600000).toFixed(2)}h
          </span>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-150 dark:border-zinc-900/60">
          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Gross Clocked</span>
          <span className="font-mono text-sm font-black text-zinc-900 dark:text-white mt-0.5 block">
            {((weekMs + weekBreakMs) / 3600000).toFixed(2)}h
          </span>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-150 dark:border-zinc-900/60">
          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Breaks Logged</span>
          <span className="font-mono text-sm font-black text-zinc-900 dark:text-white mt-0.5 block">
            {(weekBreakMs / 3600000).toFixed(2)}h
          </span>
        </div>
      </div>

      <div className="space-y-2 border-t border-zinc-150 dark:border-zinc-800/80 pt-3">
        <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Punch History</h4>
        {sessions.length === 0 ? (
          <p className="text-xs font-semibold text-zinc-500 text-center py-2">No punch sessions logged.</p>
        ) : (
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {getPunchLogs(sessions).map((log, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    log.type.includes('In') ? "bg-emerald-500" :
                    log.type.includes('Out') ? "bg-rose-500" : "bg-amber-500"
                  )} />
                  {log.type}
                </span>
                <span className="text-zinc-500 font-mono text-[11px]">
                  {log.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })} at{' '}
                  {log.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderJobDetailsBody = () => (
    <div className="space-y-4">
      <div>
        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Select Active Job</label>
        {myJobs.length === 0 ? (
          <p className="text-xs font-bold text-zinc-500 bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-150 dark:border-zinc-900/60">No active assigned jobs.</p>
        ) : (
          <select
            value={selectedJobCardId}
            onChange={(e) => setSelectedJobCardId(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold outline-none text-zinc-800 dark:text-white"
          >
            {myJobs.map(j => (
              <option key={j.id} value={j.id}>
                {j.jobNumber ? `#${j.jobNumber}` : 'JOB'} - {j.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {(() => {
        const selectedJob = myJobs.find(j => j.id === selectedJobCardId);
        if (!selectedJob) {
          return <p className="text-xs font-semibold text-zinc-500 text-center py-4">Choose a job from the list to see tasks and details.</p>;
        }

        const zone = allZones.find(z => z.currentJobId === selectedJob.id);
        const vehicle = (selectedJob.vehicleId && selectedJob.vehicleId !== 'N/A')
          ? vehicles.find(v => v.id === selectedJob.vehicleId || v.vin === selectedJob.vehicleId)
          : null;
        const locationLabel = zone?.name || selectedJob.location || selectedJob.department || (vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Not Assigned');

        const selectedJobTasks = myAssignedTasks.filter(t => t.jobId === selectedJob.id);

        return (
          <div className="space-y-4">
            <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-150 dark:border-zinc-900/60 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-500">Customer:</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">{selectedJob.customerName || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-500">Location/Bay:</span>
                <span className="font-black text-indigo-500 uppercase tracking-wide flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {locationLabel}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-500">Job Status:</span>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border",
                  selectedJob.status === 'Active' ? "text-[hsl(142,76%,36%)] bg-[hsl(142,76%,95%)] border-[hsl(142,76%,90%)]" :
                  selectedJob.status === 'Blocked' ? "text-[hsl(0,84%,40%)] bg-[hsl(0,84%,97%)] border-[hsl(0,84%,93%)]" :
                  selectedJob.status === 'On Hold' ? "text-[hsl(38,92%,35%)] bg-[hsl(38,92%,95%)] border-[hsl(38,92%,90%)]" :
                  "text-[hsl(215,80%,40%)] bg-[hsl(215,80%,97%)] border-[hsl(215,80%,93%)]"
                )}>
                  {selectedJob.status}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-zinc-405 uppercase tracking-widest">My Assigned Tasks ({selectedJobTasks.filter(t => t.status === 'completed' || t.status === 'QC Complete' || t.status === 'QC').length}/{selectedJobTasks.length})</h4>
              {selectedJobTasks.length === 0 ? (
                <p className="text-xs font-semibold text-zinc-500 text-center py-2">No tasks assigned to you on this job.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedJobTasks.map(task => {
                    const isDone = task.status === 'completed' || task.status === 'QC Complete' || task.status === 'QC';
                    return (
                      <label
                        key={task.id}
                        className="flex items-start gap-2.5 p-2 bg-zinc-50 dark:bg-zinc-955 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-zinc-150 dark:border-zinc-900/60 rounded-xl cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={async (e) => {
                            const isChecked = e.target.checked;
                            try {
                              await updateDoc(doc(db, `businesses/${tenantId}/jobs/${selectedJob.id}/tasks`, task.id), {
                                status: isChecked ? 'completed' : 'pending',
                                completedAt: isChecked ? new Date().toISOString() : null,
                                updatedAt: new Date().toISOString()
                              });
                              toast.success(`Task marked as ${isChecked ? 'completed' : 'pending'}!`);
                            } catch (err) {
                              console.error(err);
                              toast.error('Failed to update task');
                            }
                          }}
                          className="mt-0.5 w-4 h-4 text-indigo-650 rounded border-zinc-300 dark:border-zinc-700 bg-zinc-105 dark:bg-zinc-800 cursor-pointer appearance-none checked:bg-indigo-500 checked:border-indigo-500 flex items-center justify-center after:content-['✓'] after:text-[10px] after:text-white after:hidden checked:after:block transition-all shrink-0"
                        />
                        <div className="min-w-0">
                          <span className={cn(
                            "text-xs font-bold block",
                            isDone ? 'line-through text-zinc-450 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'
                          )}>
                            {task.title}
                          </span>
                          {task.bookTime > 0 && (
                            <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5 block">{task.bookTime} hrs Booked</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );

  const renderMyTasksBody = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Incomplete Tasks</span>
        <span className="px-2 py-0.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg text-[10px] font-black animate-pulse">
          {myCurrentTodos.length} Due Today / Overdue
        </span>
      </div>

      {myCurrentTodos.length === 0 ? (
        <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800/50">
          <CheckSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
          <p className="text-xs font-bold text-zinc-500">You are all caught up for today!</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {myCurrentTodos.map(todo => {
            const isOverdue = todo.dueDate && todo.dueDate < new Date().toISOString().split('T')[0];
            const totalChecklist = todo.checklist?.length || 0;
            const completedChecklist = todo.checklist?.filter((i: any) => i.done).length || 0;

            return (
              <div
                key={todo.id}
                className="p-3 bg-zinc-50 dark:bg-zinc-955 border border-zinc-150 dark:border-zinc-900/60 rounded-2xl space-y-3 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 leading-snug">{todo.title}</h4>
                    {todo.description && (
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">{todo.description}</p>
                    )}
                  </div>

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
                    className="p-1 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-500 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer"
                    title="Mark Complete"
                  >
                    ✓ Complete
                  </button>
                </div>

                {totalChecklist > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-zinc-150 dark:border-zinc-800">
                    <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Checklist ({completedChecklist}/{totalChecklist})</p>
                    <div className="space-y-1">
                      {todo.checklist.map((item: any) => (
                        <label
                          key={item.id}
                          className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer select-none"
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
                            className="w-3.5 h-3.5 text-indigo-650 rounded border-zinc-300 dark:border-zinc-700 bg-zinc-101 dark:bg-zinc-800 cursor-pointer appearance-none checked:bg-indigo-500 checked:border-indigo-500 flex items-center justify-center after:content-['✓'] after:text-[10px] after:text-white after:hidden checked:after:block transition-all"
                          />
                          <span className={item.done ? 'line-through text-zinc-400 dark:text-zinc-500' : 'font-medium'}>
                            {item.text}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-zinc-150 dark:border-zinc-800 text-[9px] font-bold">
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-lg uppercase tracking-wider text-[8px]",
                    todo.priority === 'urgent' ? 'bg-rose-500/10 text-rose-500 animate-pulse font-black' :
                    todo.priority === 'high' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                    todo.priority === 'medium' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                    'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                  )}>
                    {todo.priority} Priority
                  </span>

                  <span className={cn(
                    "flex items-center gap-1 uppercase tracking-wider text-[8px]",
                    isOverdue ? "text-rose-500 animate-pulse font-black" : "text-zinc-400"
                  )}>
                    <Clock className="w-3 h-3" />
                    {isOverdue ? 'Overdue' : 'Due Today'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderRecentActivityBody = () => (
    <div className="space-y-4">
      {(() => {
        const timelineEvents: { type: string; title: string; time: Date; details?: string }[] = [];

        sessions.slice(0, 5).forEach((session: any) => {
          if (session.clockIn?.timestamp) {
            const date = session.clockIn.timestamp.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
            timelineEvents.push({
              type: 'clock_in',
              title: 'Clocked In',
              time: date,
              details: session.isRemote ? 'Remote Session' : 'At Shop Floor'
            });
          }
          if (session.clockOut?.timestamp) {
            const date = session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate() : new Date(session.clockOut.timestamp);
            timelineEvents.push({
              type: 'clock_out',
              title: 'Clocked Out',
              time: date,
              details: 'Day completed'
            });
          }
          if (session.breaks && Array.isArray(session.breaks)) {
            session.breaks.forEach((b: any) => {
              if (b.start) {
                const date = b.start.toDate ? b.start.toDate() : new Date(b.start);
                timelineEvents.push({
                  type: 'break_start',
                  title: `Started ${b.type || 'break'}`,
                  time: date
                });
              }
              if (b.end) {
                const date = b.end.toDate ? b.end.toDate() : new Date(b.end);
                timelineEvents.push({
                  type: 'break_end',
                  title: `Ended ${b.type || 'break'}`,
                  time: date
                });
              }
            });
          }
        });

        myAssignedTasks.forEach((task: any) => {
          const compDate = task.completedAt || task.qcCompletedAt || task.updatedAt;
          const isCompleted = task.status === 'QC Complete' || task.status === 'QC' || task.status === 'completed';
          if (isCompleted && compDate) {
            const date = compDate.seconds ? new Date(compDate.seconds * 1000) : new Date(compDate);
            timelineEvents.push({
              type: 'task_completion',
              title: `Completed: ${task.title}`,
              time: date,
              details: `Task completed successfully`
            });
          }
        });

        const sortedEvents = timelineEvents
          .sort((a, b) => b.time.getTime() - a.time.getTime())
          .slice(0, 5);

        if (sortedEvents.length === 0) {
          return <p className="text-xs font-semibold text-zinc-500 text-center py-4">No recent activity found.</p>;
        }

        return (
          <div className="space-y-3 relative pl-4 border-l border-zinc-200 dark:border-zinc-800/80">
            {sortedEvents.map((evt, index) => (
              <div key={index} className="relative space-y-1">
                <div className={cn(
                  "absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900",
                  evt.type === 'clock_in' ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" :
                  evt.type === 'clock_out' ? "bg-rose-500" :
                  evt.type === 'task_completion' ? "bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.5)]" :
                  "bg-amber-500"
                )} />
                
                <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold">
                  <span className="uppercase tracking-widest">{evt.type.replace('_', ' ')}</span>
                  <span className="font-mono">{evt.time.toLocaleDateString([], { month: 'short', day: 'numeric' })} {evt.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 leading-tight">{evt.title}</p>
                {evt.details && (
                  <p className="text-[10px] font-semibold text-zinc-500">{evt.details}</p>
                )}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );

  const renderQuickStatsBody = () => (
    <div className="space-y-4">
      <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-150 dark:border-zinc-900/60 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-zinc-500">Efficiency Rating</span>
          <span className="font-mono font-black text-indigo-505">
            {efficiency !== null ? `${efficiency.toFixed(0)}%` : '--'}
          </span>
        </div>
        <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
          <div
            className="bg-indigo-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${efficiency !== null ? Math.min(100, efficiency) : 0}%` }}
          />
        </div>
        <span className="text-[9px] font-semibold text-zinc-400 block">Completed Book vs Clock Hours for this period</span>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-150 dark:border-zinc-900/60 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-zinc-500">Completed Book Hours</span>
          <span className="font-mono font-black text-amber-500">
            {doneBookHours.toFixed(1)}h <span className="text-[10px] text-zinc-400 font-semibold">/ {totalBookHoursAvailable.toFixed(1)}h</span>
          </span>
        </div>
        <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
          <div
            className="bg-amber-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${totalBookHoursAvailable > 0 ? Math.min(100, (doneBookHours / totalBookHoursAvailable) * 100) : 0}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-150 dark:border-zinc-900/60 text-center">
          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Tasks In Queue</span>
          <span className="font-mono text-lg font-black text-zinc-800 dark:text-white mt-0.5 block">
            {myAssignedTasks.filter(t => t.status !== 'completed' && t.status !== 'QC' && t.status !== 'QC Complete').length}
          </span>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-955 p-2.5 rounded-xl border border-zinc-150 dark:border-zinc-900/60 text-center">
          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Backlog Book Hours</span>
          <span className="font-mono text-lg font-black text-zinc-800 dark:text-white mt-0.5 block">
            {scheduledBookHours.toFixed(1)}h
          </span>
        </div>
      </div>
    </div>
  );

  const renderQuickLinksBody = () => (
    <div className="grid grid-cols-2 gap-2.5">
      <button
        onClick={() => setIsIntakeOpen(true)}
        className="flex flex-col items-center justify-center gap-1.5 p-3 bg-zinc-50 dark:bg-zinc-955 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-500/30 rounded-2xl transition-all group shadow-sm text-center cursor-pointer"
      >
        <div className="p-1.5 bg-indigo-500/10 rounded-lg group-hover:scale-105 transition-transform">
          <Package className="w-4 h-4 text-indigo-500" />
        </div>
        <span className="font-bold text-[10px] text-zinc-900 dark:text-white leading-tight">Receive Package</span>
      </button>

      <button
        onClick={() => setIsIssueOpen(true)}
        className="flex flex-col items-center justify-center gap-1.5 p-3 bg-zinc-50 dark:bg-zinc-955 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-rose-200 dark:hover:border-rose-500/30 rounded-2xl transition-all group shadow-sm text-center cursor-pointer"
      >
        <div className="p-1.5 bg-rose-500/10 rounded-lg group-hover:scale-105 transition-transform">
          <AlertTriangle className="w-4 h-4 text-rose-500" />
        </div>
        <span className="font-bold text-[10px] text-zinc-900 dark:text-white leading-tight">Log Issue</span>
      </button>

      <button
        onClick={() => setIsPartRequestOpen(true)}
        className="flex flex-col items-center justify-center gap-1.5 p-3 bg-zinc-50 dark:bg-zinc-955 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-amber-200 dark:hover:border-amber-500/30 rounded-2xl transition-all group shadow-sm text-center cursor-pointer"
      >
        <div className="p-1.5 bg-amber-500/10 rounded-lg group-hover:scale-105 transition-transform">
          <Wrench className="w-4 h-4 text-amber-505" />
        </div>
        <span className="font-bold text-[10px] text-zinc-900 dark:text-white leading-tight">Request Part</span>
      </button>

      <button
        onClick={() => setIsVehicleIntakeOpen(true)}
        className="flex flex-col items-center justify-center gap-1.5 p-3 bg-zinc-50 dark:bg-zinc-955 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-200 dark:hover:border-emerald-500/30 rounded-2xl transition-all group shadow-sm text-center cursor-pointer"
      >
        <div className="p-1.5 bg-emerald-500/10 rounded-lg group-hover:scale-105 transition-transform">
          <CarFront className="w-4 h-4 text-emerald-505" />
        </div>
        <span className="font-bold text-[10px] text-zinc-900 dark:text-white leading-tight">Vehicle Intake</span>
      </button>
    </div>
  );

  const renderCardBody = (cardId: string) => {
    switch (cardId) {
      case 'time_clock':
        return renderTimeClockBody();
      case 'job_details':
        return renderJobDetailsBody();
      case 'my_tasks':
        return renderMyTasksBody();
      case 'recent_activity':
        return renderRecentActivityBody();
      case 'quick_stats':
        return renderQuickStatsBody();
      case 'quick_links':
        return renderQuickLinksBody();
      default:
        return null;
    }
  };

  const renderCard = (cardId: string) => {
    const cardState = cardStates[cardId];
    if (!cardState || !cardState.visible) return null;

    const getCardTitleAndIcon = (id: string) => {
      switch (id) {
        case 'time_clock':
          return { title: 'Time Clock', icon: <Clock className="w-5 h-5 text-indigo-500" /> };
        case 'job_details':
          return { title: 'Job Details', icon: <Briefcase className="w-5 h-5 text-indigo-500" /> };
        case 'my_tasks':
          return { title: 'My Tasks', icon: <CheckSquare className="w-5 h-5 text-indigo-500" /> };
        case 'recent_activity':
          return { title: 'Recent Activity', icon: <Activity className="w-5 h-5 text-indigo-505" /> };
        case 'quick_stats':
          return { title: 'Quick Stats', icon: <TrendingUp className="w-5 h-5 text-indigo-505" /> };
        case 'quick_links':
          return { title: 'Quick Links', icon: <Package className="w-5 h-5 text-indigo-505" /> };
        default:
          return { title: 'Card', icon: <Briefcase className="w-5 h-5 text-indigo-505" /> };
      }
    };

    const { title, icon } = getCardTitleAndIcon(cardId);
    const isMinimized = cardState.minimized;

    return (
      <div
        key={cardId}
        draggable={canCustomize}
        onDragStart={(e) => {
          if (!canCustomize) return;
          setDraggedCardId(cardId);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (!canCustomize) return;
          e.preventDefault();
          if (draggedCardId && draggedCardId !== cardId) {
            setDragOverCardId(cardId);
          }
        }}
        onDrop={(e) => {
          if (!canCustomize) return;
          e.preventDefault();
          if (draggedCardId && draggedCardId !== cardId) {
            const newLayout = [...layout];
            const draggedIdx = newLayout.indexOf(draggedCardId);
            const targetIdx = newLayout.indexOf(cardId);
            if (draggedIdx > -1 && targetIdx > -1) {
              newLayout.splice(draggedIdx, 1);
              newLayout.splice(targetIdx, 0, draggedCardId);
              setLayout(newLayout);
              hasUnsavedChangesRef.current = true;
              triggerSave(newLayout, cardStates, viewMode);
            }
          }
        }}
        onDragEnd={() => {
          setDraggedCardId(null);
          setDragOverCardId(null);
        }}
        className={cn(
          "bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-zinc-200/50 dark:border-zinc-800/50 rounded-3xl p-5 shadow-lg relative transition-all duration-300 flex flex-col gap-4 min-h-[160px]",
          draggedCardId === cardId && "scale-[1.02] shadow-2xl rotate-1 border-indigo-500/50 transition-transform opacity-70 cursor-grabbing z-50",
          dragOverCardId === cardId && "border-dashed border-2 border-indigo-500 bg-indigo-500/5"
        )}
      >
        <div className="flex items-center justify-between border-b border-zinc-150 dark:border-zinc-800/80 pb-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {canCustomize && (
              <div className="cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 shrink-0 select-none">
                <GripVertical className="w-4 h-4" />
              </div>
            )}
            <div className="p-1.5 bg-indigo-500/10 rounded-lg shrink-0">
              {icon}
            </div>
            <h3 className="font-black text-zinc-900 dark:text-white text-base truncate">{title}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canCustomize && (
              <button
                onClick={() => toggleCardVisibility(cardId)}
                className="p-1 text-zinc-400 hover:text-zinc-650 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                title="Hide Card"
              >
                <EyeOff className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => toggleCardMinimize(cardId)}
              className="p-1 text-zinc-400 hover:text-zinc-650 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors cursor-pointer"
              title={isMinimized ? "Expand Card" : "Minimize Card"}
            >
              {isMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {!isMinimized && (
          <div className="flex-1 min-h-0">
            {renderCardBody(cardId)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "max-w-7xl mx-auto animate-in fade-in duration-500 space-y-4 md:space-y-8",
        isFullscreen && "p-2 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar"
      )}
    >
      <Toaster position="top-right" richColors theme="system" closeButton />

      {/* Modern Header containing Gating / Views / Save indicator / Settings Cog */}
      {(!propViewMode || propViewMode === 'jobs') && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 rounded-2xl">
            <Command className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Mission Control</h1>
            <p className="text-xs font-semibold text-zinc-500">
              Welcome back, <span className="text-zinc-700 dark:text-zinc-305 font-bold">{staffMember?.name || user?.displayName || user?.email || 'Technician'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {effectiveView === 'personalized' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/80">
              {saveStatus === 'saving' && (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  <span className="text-zinc-500">Saving...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-zinc-500">Saved</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                  <span className="text-rose-500 font-black">Save Error</span>
                </>
              )}
            </div>
          )}

          {canCustomize && (
            <div className="bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl flex border border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => {
                  setViewMode('classic');
                  triggerSave(layout, cardStates, 'classic');
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  viewMode === 'classic'
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-805 dark:hover:text-zinc-300"
                )}
              >
                Classic
              </button>
              <button
                onClick={() => {
                  setViewMode('personalized');
                  triggerSave(layout, cardStates, 'personalized');
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  viewMode === 'personalized'
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-300"
                )}
              >
                Personalized
              </button>
            </div>
          )}

          {effectiveView === 'personalized' && (
            <button
              onClick={() => setIsManageCardsOpen(!isManageCardsOpen)}
              className={cn(
                "p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl shadow-sm transition-all cursor-pointer",
                isManageCardsOpen && "ring-2 ring-indigo-500/50 border-indigo-500"
              )}
              title="Manage Dashboard Cards"
            >
              <Settings className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
          </button>
        </div>
      </div>
      )}

      {/* Manage Cards Settings Panel */}
      {(!propViewMode || propViewMode === 'jobs') && effectiveView === 'personalized' && isManageCardsOpen && (
        <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 animate-in slide-in-from-top duration-300 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black text-sm text-zinc-900 dark:text-white">Manage Dashboard Cards</h3>
              <p className="text-[11px] text-zinc-500 font-semibold">Show or hide modular workspace dashboard cards</p>
            </div>
            <button
              onClick={() => setIsManageCardsOpen(false)}
              className="px-3 py-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-zinc-300 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {Object.keys(cardStates).map(cardId => {
              const label = cardId.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
              const visible = cardStates[cardId].visible;
              return (
                <button
                  key={cardId}
                  onClick={() => toggleCardVisibility(cardId)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer",
                    visible
                      ? "bg-indigo-55 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 font-black shadow-sm"
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  )}
                >
                  <span>{label}</span>
                  {visible ? <Check className="w-3.5 h-3.5 text-indigo-500" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Dashboard Body Toggles */}
      {(!propViewMode || propViewMode === 'jobs') && effectiveView === 'personalized' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {layout.filter(id => cardStates[id]?.visible).length === 0 ? (
            <div className="col-span-full p-16 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800/50 space-y-3">
              <Settings className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto animate-spin" style={{ animationDuration: '10s' }} />
              <h3 className="font-black text-lg text-zinc-850 dark:text-white">Your Dashboard is Empty</h3>
              <p className="text-sm font-semibold text-zinc-505 max-w-md mx-auto">
                All modular cards are hidden. Click the settings icon in the top header or the button below to enable the cards.
              </p>
              <button
                onClick={() => {
                  const resetStates = { ...cardStates };
                  Object.keys(resetStates).forEach(key => resetStates[key].visible = true);
                  setCardStates(resetStates);
                  triggerSave(layout, resetStates, viewMode);
                }}
                className="px-4 py-2 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
              >
                Show All Cards
              </button>
            </div>
          ) : (
            layout.map(cardId => renderCard(cardId))
          )}
        </div>
      ) : (
        /* Classic View */
        <>
          {(!propViewMode || propViewMode === 'jobs') && (
            <>
              {isFullscreen && (
                <div className="mr-auto flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 w-max mb-4">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Mission Control</span>
                  <span className="text-[10px] font-bold text-zinc-500">• Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
              )}

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
                  className="flex flex-col items-center justify-center gap-1.5 md:gap-3 p-2 md:p-4 bg-white dark:bg-zinc-900 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-500/30 rounded-2xl md:rounded-3xl transition-all group shadow-sm cursor-pointer"
                >
                  <div className="p-2 md:p-3 bg-indigo-500/10 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform">
                    <Package className="w-4 h-4 md:w-6 md:h-6 text-indigo-500" />
                  </div>
                  <span className="font-bold text-[10px] md:text-sm text-zinc-900 dark:text-white text-center leading-tight">Receive<br className="md:hidden" /> Package</span>
                </button>

                <button 
                  onClick={() => setIsIssueOpen(true)}
                  className="flex flex-col items-center justify-center gap-1.5 md:gap-3 p-2 md:p-4 bg-white dark:bg-zinc-900 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-rose-200 dark:hover:border-rose-500/30 rounded-2xl md:rounded-3xl transition-all group shadow-sm cursor-pointer"
                >
                  <div className="p-2 md:p-3 bg-rose-500/10 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform">
                    <AlertTriangle className="w-4 h-4 md:w-6 md:h-6 text-rose-500" />
                  </div>
                  <span className="font-bold text-[10px] md:text-sm text-zinc-900 dark:text-white text-center leading-tight">Log<br className="md:hidden" /> Issue</span>
                </button>

                <button 
                  onClick={() => setIsPartRequestOpen(true)}
                  className="flex flex-col items-center justify-center gap-1.5 md:gap-3 p-2 md:p-4 bg-white dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-amber-200 dark:hover:border-amber-500/30 rounded-2xl md:rounded-3xl transition-all group shadow-sm cursor-pointer"
                >
                  <div className="p-2 md:p-3 bg-amber-500/10 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform">
                    <Wrench className="w-4 h-4 md:w-6 md:h-6 text-amber-505" />
                  </div>
                  <span className="font-bold text-[10px] md:text-sm text-zinc-900 dark:text-white text-center leading-tight">Request<br className="md:hidden" /> Part</span>
                </button>

                <button 
                  onClick={() => setIsVehicleIntakeOpen(true)}
                  className="flex flex-col items-center justify-center gap-1.5 md:gap-3 p-2 md:p-4 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-200 dark:hover:border-emerald-500/30 rounded-2xl md:rounded-3xl transition-all group shadow-sm cursor-pointer"
                >
                  <div className="p-2 md:p-3 bg-emerald-500/10 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform">
                    <CarFront className="w-4 h-4 md:w-6 md:h-6 text-emerald-505" />
                  </div>
                  <span className="font-bold text-[10px] md:text-sm text-zinc-900 dark:text-white text-center leading-tight">Vehicle<br className="md:hidden" /> Intake</span>
                </button>
              </div>
            </>
          )}
                {/* Timeclock Activity & History Feed */}
          {propViewMode === 'time' && (
            <div className="space-y-6 mt-6 max-w-4xl">
              {/* Active Session & Today's Summary Card */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 animate-in fade-in duration-300">
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-500">
                      <Clock className="w-5 h-5 text-indigo-505" />
                    </div>
                    <div>
                      <h3 className="font-black text-zinc-900 dark:text-white text-base">Active Session Controls</h3>
                      <p className="text-xs text-zinc-500 font-medium font-semibold">Manage your attendance and live breaks</p>
                    </div>
                  </div>
                  
                  {/* Today's Net Worked / Paid Summary */}
                  <div className="flex items-center gap-4 text-xs font-semibold text-zinc-500 pt-1">
                    <div>
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Today's Worked</span>
                      <span className="font-mono text-sm font-black text-zinc-800 dark:text-white mt-0.5 block">{formatDuration(todayMs)}</span>
                    </div>
                    <div className="border-l border-zinc-200 dark:border-zinc-800 pl-4">
                      <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider block">Today's Pay Hours</span>
                      <span className="font-mono text-sm font-black text-indigo-600 dark:text-indigo-400 mt-0.5 block">{formatDuration(todayPayMs)}</span>
                    </div>
                    <div className="border-l border-zinc-200 dark:border-zinc-800 pl-4">
                      <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider block">Today's Book Time</span>
                      <span className="font-mono text-sm font-black text-amber-650 dark:text-amber-400 mt-0.5 block">{formatDuration(todayBookMs)}</span>
                    </div>
                  </div>
                </div>

                {/* Clock Status Timer & Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  {/* Live Active Status Badge & Timer */}
                  <div className="bg-zinc-50 dark:bg-zinc-955 px-4 py-2.5 rounded-2xl border border-zinc-205 dark:border-zinc-850 flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        clockStatus === 'clocked_out' ? "bg-zinc-400" :
                        clockStatus === 'clocked_in' ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500 animate-pulse"
                      )} />
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                        {clockStatus.replace('_', ' ')}
                      </span>
                    </div>
                    {clockStatus !== 'clocked_out' && clockStartTime && (
                      <span className="text-base font-mono font-black text-zinc-900 dark:text-white tabular-nums">
                        {clockStatus === 'clocked_in'
                          ? formatDuration(calculateNetWorkMs())
                          : formatDuration(Math.max(0, currentTime - clockStartTime))
                        }
                      </span>
                    )}
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isClockProcessing ? (
                      <div className="flex items-center gap-2 px-6 py-3 text-zinc-400 text-sm font-bold bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                        <span>Processing...</span>
                      </div>
                    ) : (
                      <>
                        {clockStatus === 'clocked_out' ? (
                          <button
                            onClick={handleClockIn}
                            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-bold shadow-md shadow-emerald-500/10 transition-all flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <LogIn className="w-4 h-4" /> Clock In
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            {clockStatus === 'clocked_in' ? (
                              <>
                                <button
                                  onClick={() => handleStartBreak('lunch')}
                                  className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 border border-amber-500/20 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                                >
                                  <Pizza className="w-4 h-4" /> Lunch
                                </button>
                                <button
                                  onClick={() => handleStartBreak('normal')}
                                  className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 border border-amber-500/20 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                                >
                                  <Coffee className="w-4 h-4" /> Break
                                </button>
                                <button
                                  onClick={handleClockOut}
                                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-rose-500/10 transition-all flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                                >
                                  <Square className="w-4 h-4" /> Clock Out
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={handleEndBreak}
                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-md shadow-indigo-500/10 transition-all flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                              >
                                <Play className="w-4 h-4" /> Resume Work
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Disclaimer Notice Banner */}
              <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in duration-300">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    ⚠️ Official Payroll Notice
                  </p>
                  <p className="text-xs text-zinc-605 dark:text-zinc-400 font-semibold mt-1">
                    Logged clock-ins and durations are active workspace reports and are not official payroll hours until verified and approved by the administration.
                  </p>
                </div>
              </div>

              {/* Timeclock Activity & History Feed */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm flex flex-col animate-in fade-in duration-300">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                    <Clock className="w-6 h-6 text-indigo-555" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Timeclock Activity & History</h2>
                    <p className="text-xs text-zinc-500 font-medium">Log of clock-ins, breaks, and task allocations</p>
                  </div>
                </div>
                
                <div className="p-1">
                  <TimeClockHistory tenantId={tenantId} />
                </div>
              </div>
            </div>
          )}

          <div className="max-w-4xl space-y-6">
            {/* My Todos */}
            {(!propViewMode || propViewMode === 'jobs') && myCurrentTodos.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm border-t-rose-500/30 dark:border-t-rose-500/20 border-t-4 animate-in fade-in duration-350">
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
                        className="p-4 bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-850 rounded-2xl space-y-3 relative hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-white leading-snug">{todo.title}</h3>
                            {todo.description && (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">{todo.description}</p>
                            )}
                          </div>
                          
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
                            className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-500 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer"
                            title="Mark Complete"
                          >
                            ✓ Complete
                          </button>
                        </div>

                        {totalChecklist > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-zinc-200/50 dark:border-zinc-850">
                            <p className="text-[10px] text-zinc-405 font-bold uppercase tracking-wider">Checklist ({completedChecklist}/{totalChecklist})</p>
                            <div className="space-y-1">
                              {todo.checklist.map((item: any) => (
                                <label 
                                  key={item.id} 
                                  className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer select-none"
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
                                    className="w-3.5 h-3.5 text-indigo-650 rounded border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 cursor-pointer appearance-none checked:bg-indigo-505 checked:border-indigo-505 flex items-center justify-center after:content-['✓'] after:text-[10px] after:text-white after:hidden checked:after:block transition-all"
                                  />
                                  <span className={item.done ? 'line-through text-zinc-400 dark:text-zinc-500' : 'font-medium'}>
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
                            todo.priority === 'urgent' ? 'bg-rose-500 text-rose-600 animate-pulse font-black' :
                            todo.priority === 'high' ? 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' :
                            todo.priority === 'medium' ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' :
                            'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          )}>
                            {todo.priority} Priority
                          </span>
                          
                          <span className={cn(
                            "flex items-center gap-1 uppercase tracking-wider text-[9px]",
                            isOverdue ? "text-rose-600 animate-pulse font-black" : "text-zinc-400"
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

            {/* My Active Jobs */}
            {(!propViewMode || propViewMode === 'jobs') && (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm animate-in fade-in duration-350">
              <div className="flex items-center gap-3 mb-4 md:mb-6">
                <div className="p-2 md:p-2.5 bg-indigo-500/10 rounded-xl">
                  <Briefcase className="w-5 h-5 md:w-6 md:h-6 text-indigo-505" />
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

                    const jobEfficiency = jobSpentMsOnBookTasks >= 10 * 60 * 1050
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
                        className="w-full cursor-pointer text-left bg-zinc-50 dark:bg-zinc-955 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-500/30 rounded-2xl p-4 transition-all group flex items-center justify-between"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">{job.jobNumber ? `#${job.jobNumber}` : 'JOB'}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(job.status)}`}>
                              {job.status}
                            </span>
                            {activeJobIds.includes(job.id) && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500 animate-pulse">
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
                                <Award className="w-3.5 h-3.5 text-amber-505" />
                                {jobDoneBookHours.toFixed(1)}/{jobTotalBookHours.toFixed(1)}hr Completed
                              </span>
                              
                              {jobEfficiency !== null && (
                                <span className={cn(
                                  "inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-xl border shadow-sm",
                                  jobEfficiency >= 100 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                                  jobEfficiency >= 90 ? "bg-zinc-500/10 text-zinc-650 dark:text-zinc-400 border-zinc-500/20" :
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
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
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
            )}

            {/* Device Settings */}
            {propViewMode === 'device' && (
              <div className="mt-8">
                <DeviceSettings tenantId={tenantId} />
              </div>
            )}
          </div>
        </>
      )}

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
