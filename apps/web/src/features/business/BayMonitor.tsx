import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, limit, where, doc, getDoc, collectionGroup } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Maximize, Minimize, AlertTriangle, ShoppingCart, CheckCircle2, RefreshCw, Trophy } from 'lucide-react';
import _QRCode from 'react-qr-code';
import { cn } from '../../lib/utils';
import { Toaster } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import type { Zone } from './ZoneModals';

const QRCode = (_QRCode as any).default || _QRCode;
import type { Vehicle } from './VehicleSelector';

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

const LiveIndicator = ({ isDisconnected }: { isDisconnected?: boolean }) => (
  <div className={cn(
    "flex items-center gap-2 3xl:gap-4 px-3 py-1.5 3xl:px-6 3xl:py-3 rounded-lg 3xl:rounded-2xl border relative overflow-hidden group transition-colors duration-500",
    isDisconnected ? "bg-red-950/30 border-red-900 shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse" : "bg-zinc-900/50 border-zinc-800"
  )}>
    <div className="relative">
      <div className={cn(
        "w-2 h-2 3xl:w-4 3xl:h-4 rounded-full z-10 transition-colors duration-500",
        isDisconnected 
          ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" 
          : "bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]"
      )}></div>
      {!isDisconnected && (
        <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20 scale-150"></div>
      )}
    </div>
    <span className={cn(
      "text-zinc-400 text-xs 2xl:text-sm 3xl:text-[30px] font-black uppercase tracking-widest leading-none transition-colors duration-500",
      isDisconnected && "text-red-400"
    )}>
      {isDisconnected ? "OFFLINE" : "LIVE"}
    </span>
    {!isDisconnected && (
      <motion.div 
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full"
        animate={{ x: ['100%', '-100%'] }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
    )}
  </div>
);

const BlockerTicker = ({ blockers, isBlocked }: { blockers: any[], isBlocked: boolean }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (blockers.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % blockers.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [blockers.length]);

  if (!isBlocked) return null;

  const displayMessage = blockers.length > 0 ? blockers[index]?.message : 'BLOCKED';

  return (
    <div className="mt-1.5 pt-1.5 border-t border-red-500/30 overflow-hidden shrink-0 flex items-center justify-center bg-red-500/10 -mx-[max(0.5rem,1.2cqw)] px-[max(0.5rem,1.2cqw)] -mb-[max(0.5rem,1.2cqw)] pb-[max(0.5rem,1.2cqw)]">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.3 }}
          className="text-red-400 font-black tracking-widest uppercase truncate w-full text-center"
          style={{ fontSize: 'clamp(0.7rem, 2.5cqw, 1.6rem)' }}
        >
          {displayMessage || 'BLOCKED'}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate();
    } catch (e) {
      // fallback
    }
  }
  if (val && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const projectWorkingHours = (startDate: Date, totalHours: number, schedule: any) => {
  if (totalHours <= 0) return startDate;
  
  const days = schedule?.days || [1, 2, 3, 4, 5];
  const startStr = schedule?.startTime || "08:00";
  const endStr = schedule?.endTime || "17:00";
  
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  
  const dailyWorkMs = ((endH * 60 + endM) - (startH * 60 + startM)) * 60000;
  if (dailyWorkMs <= 0 || days.length === 0) return startDate;
  
  let current = new Date(startDate);
  let remainingMs = totalHours * 3600000;
  
  while (remainingMs > 0) {
    const dayOfWeek = current.getDay();
    const mappedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    
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

const calculateDynamicETA = (job: any, tasks: any[], departments: any[]) => {
  if (!tasks || tasks.length === 0) return null;
  const nonGeneralTasks = tasks.filter(t => t && !isGeneralTask(t));
  const incompleteTasks = nonGeneralTasks.filter(t => t && t.status !== 'QC Complete' && t.status !== 'QC');
  
  if (incompleteTasks.length === 0 && (job?.status === 'Ready for Customer' || job?.status === 'Completed')) {
     return null;
  }
  if (incompleteTasks.length === 0) {
     return parseSafeDate(job?.expectedFinishTime);
  }
  
  const deptHours: Record<string, number> = {};
  incompleteTasks.forEach(t => {
    const d = t.departmentId || 'unassigned';
    deptHours[d] = (deptHours[d] || 0) + (parseFloat(t.bookTime) || 0);
  });
  
  const totalHours = Object.values(deptHours).reduce((sum, h) => sum + h, 0);
  if (totalHours <= 0) return null;
  
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

const parseTimestamp = (val: any): Date | null => {
  if (!val) return null;
  if (val.toDate) return val.toDate();
  if (val.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};





export function BayMonitor({ tenantId }: { tenantId: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [businessName, setBusinessName] = useState('UPFITTERS OS');
  const [monitorSettings, setMonitorSettings] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [jobsTasks, setJobsTasks] = useState<Record<string, any[]>>({});
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [reloadCountdown, setReloadCountdown] = useState<number | null>(null);

  // Firestore snapshot error callback
  const handleSnapshotError = (error: any, listenerName: string) => {
    console.error(`Firestore Snapshot Error in [${listenerName}]:`, error);
    setConnectionError(`Connection dropped (${listenerName}). Reconnecting...`);
  };

  // Monitor browser online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log("Browser went online, reloading to force fresh sync...");
      window.location.reload();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setConnectionError("Network disconnected. Waiting for connection...");
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Periodic Auto-Reload (every 6 hours) to prevent memory leak and refresh auth session
  useEffect(() => {
    const reloadTimer = setTimeout(() => {
      console.log("Scheduled periodic auto-reload triggered...");
      window.location.reload();
    }, 6 * 60 * 60 * 1000); // 6 hours
    
    return () => clearTimeout(reloadTimer);
  }, []);

  // Handle recovery countdown when connection error exists
  useEffect(() => {
    if (!connectionError && isOnline) {
      setReloadCountdown(null);
      return;
    }

    if (reloadCountdown === null) {
      setReloadCountdown(20);
      return;
    }

    const timer = setInterval(() => {
      setReloadCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timer);
          console.log("Connection recovery failed, reloading page...");
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [connectionError, isOnline, reloadCountdown]);

  useEffect(() => {
    if (!tenantId) return;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('clockIn.timestamp', '>=', sevenDaysAgo)
    );
    const unsub = onSnapshot(q, (snap) => {
      setActiveSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleSnapshotError(err, 'Time Sessions');
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    getDoc(doc(db, 'businesses', tenantId)).then(snap => {
      if (snap.exists()) setBusinessName(snap.data().name || 'UPFITTERS OS');
    });
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(doc(db, 'businesses', tenantId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBusinessName(data.name || 'UPFITTERS OS');
        setMonitorSettings(data);
      }
    }, (err) => {
      handleSnapshotError(err, 'Business Settings');
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/zones`));
    const unsub = onSnapshot(q, (snap) => {
      const data: Zone[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() } as Zone));
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setZones(data);
      setLastUpdated(new Date());
    }, (err) => {
      handleSnapshotError(err, 'Bays and Lot');
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/departments`));
    const unsub = onSnapshot(q, (snap) => {
      const data: any[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      setDepartments(data);
    }, (err) => {
      handleSnapshotError(err, 'Departments');
    });
    return () => unsub();
  }, [tenantId]);

  const activeJobIdsStr = zones
    .map(z => z.currentJobId)
    .filter(Boolean)
    .sort()
    .join(',');

  useEffect(() => {
    if (!tenantId) return;
    const activeJobIds = activeJobIdsStr ? activeJobIdsStr.split(',') : [];
    if (activeJobIds.length === 0) return;

    const unsubscribers: (() => void)[] = [];

    activeJobIds.forEach(jobId => {
      const q = collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`);
      const unsub = onSnapshot(q, (snap) => {
        const tasksList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setJobsTasks(prev => ({
          ...prev,
          [jobId]: tasksList
        }));
      }, (err) => {
        handleSnapshotError(err, `Job Tasks (${jobId})`);
      });
      unsubscribers.push(unsub);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [tenantId, activeJobIdsStr]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/jobs`),
      where('status', 'not-in', ['Completed', 'Delivered'])
    );
    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => {
      handleSnapshotError(err, 'Active Jobs');
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/parts_requests`),
      where('status', 'in', ['pending', 'ordered', 'received'])
    );
    const unsub = onSnapshot(q, (snap) => {
      setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => {
      handleSnapshotError(err, 'Parts Requests');
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/vehicles`), limit(1000));
    const unsub = onSnapshot(q, (snap) => {
      const data: Vehicle[] = [];
      const seen = new Set();
      snap.forEach(doc => {
        const v = { id: doc.id, ...doc.data() } as Vehicle;
        const key = (v.vin || v.id).toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          data.push(v);
        }
      });
      setVehicles(data);
      setLastUpdated(new Date());
    }, (err) => {
      handleSnapshotError(err, 'Vehicle Database');
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;

    const unsubStaff = onSnapshot(
      collection(db, `businesses/${tenantId}/staff`),
      (snap) => {
        setStaffList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (err) => handleSnapshotError(err, 'Staff')
    );

    const unsubTasks = onSnapshot(
      query(collectionGroup(db, 'tasks'), where('tenantId', '==', tenantId)),
      (snap) => {
        const filteredDocs = snap.docs.filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`));
        const parsed = filteredDocs.map(doc => {
          const pathParts = doc.ref.path.split('/');
          const jobId = pathParts[3];
          return {
            id: doc.id,
            jobId,
            ...doc.data()
          };
        });
        setAllTasks(parsed);
      },
      (err) => handleSnapshotError(err, 'Tasks')
    );

    return () => {
      unsubStaff();
      unsubTasks();
    };
  }, [tenantId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      localStorage.setItem('bayMonitorFullscreenPreference', 'true');
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      localStorage.removeItem('bayMonitorFullscreenPreference');
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      if (isCurrentlyFullscreen) {
        localStorage.setItem('bayMonitorFullscreenPreference', 'true');
      } else {
        // We don't automatically remove it here because a reload might have cleared it
        // but the user might still want it. 
        // We only remove if they explicitly clicked the exit button (handled in toggleFullscreen)
      }
    };

    const attemptAutoFullscreen = () => {
      const preference = localStorage.getItem('bayMonitorFullscreenPreference');
      if (preference === 'true' && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {
          // Expected to fail without gesture
        });
      }
    };

    // Listen for the first interaction to restore fullscreen
    const handleFirstInteraction = () => {
      const preference = localStorage.getItem('bayMonitorFullscreenPreference');
      if (preference === 'true' && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      // Remove listener after first try
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    // Initial check
    attemptAutoFullscreen();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);



  const last7Days = useMemo(() => {
    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        date: d,
        label: dayNames[d.getDay()],
        key: d.toLocaleDateString()
      });
    }
    return days;
  }, [now]);

  const leaderboardData = useMemo(() => {
    if (!staffList.length) return [];

    const startOf7DaysAgo = new Date();
    startOf7DaysAgo.setDate(startOf7DaysAgo.getDate() - 6);
    startOf7DaysAgo.setHours(0, 0, 0, 0);
    const startOf7DaysAgoTime = startOf7DaysAgo.getTime();

    // Map staff to initial stats structure (strictly upfitters)
    const techStats = staffList
      .filter((s: any) => {
        if (s.isArchived || s.fireDate) return false;
        if (!s.departmentId) return false;
        
        // Filter strictly to Upfitting department
        if (departments.length > 0) {
          const dept = departments.find((d: any) => d.id === s.departmentId);
          const deptName = (dept?.name || '').toLowerCase();
          return deptName.includes('upfit');
        }
        return true;
      })
      .map((s: any) => {
        const activeSession = activeSessions.find((sess: any) => sess.userId === s.id && ['active', 'on_break'].includes(sess.status));
        const isClockedIn = !!activeSession;
        const clockInStatus = activeSession?.status || 'offline';
        
        let currentJobText = '';
        if (activeSession) {
          const activeJob = (activeSession.jobs || []).find((j: any) => !j.end);
          if (activeJob) {
            currentJobText = `Clocked into Job #${activeJob.name || activeJob.id.slice(-4)}${activeJob.taskName ? ` (${activeJob.taskName})` : ''}`;
          } else {
            currentJobText = clockInStatus === 'on_break' ? 'On Break' : 'Clocked In (Idle)';
          }
        }

        return {
          id: s.id,
          name: `${s.firstName} ${s.lastName ? s.lastName[0] + '.' : ''}`,
          isClockedIn,
          clockInStatus,
          currentJobText,
          todayHours: 0,
          todayTasks: 0,
          weeklyHours: 0,
          dailyHoursLast7Days: Array.from({ length: 7 }, () => 0)
        };
      });

    // Create mapping by staffId and lowercase staff names for matching
    const statsMap = new Map<string, typeof techStats[0]>();
    techStats.forEach(ts => statsMap.set(ts.id, ts));

    const findTechByName = (nameStr: string) => {
      if (!nameStr) return null;
      const lower = nameStr.toLowerCase().trim();
      return techStats.find(ts => ts.name.toLowerCase().trim() === lower) || 
             techStats.find(ts => {
               const staff = staffList.find(s => s.id === ts.id);
               if (!staff) return false;
               const fullName = `${staff.firstName} ${staff.lastName || ''}`.toLowerCase().trim();
               return fullName.includes(lower) || lower.includes(fullName);
             });
    };

    // Filter tasks completed in the last 7 days
    const completedTasksLast7Days = allTasks.filter(task => {
      const isCompleted = ['QC', 'QC Complete', 'completed'].includes(task.status);
      if (!isCompleted) return false;

      const compDate = parseSafeDate(task.qcCompletedAt || task.completedAt || task.createdAt);
      return compDate && compDate.getTime() >= startOf7DaysAgoTime;
    });

    completedTasksLast7Days.forEach(task => {
      const compDate = parseSafeDate(task.qcCompletedAt || task.completedAt || task.createdAt);
      if (!compDate) return;

      const taskDateStr = compDate.toLocaleDateString();
      const dayIdx = last7Days.findIndex(d => d.key === taskDateStr);
      if (dayIdx === -1) return;

      const assignments = task.assignedStaff || [];
      const hasAssignments = assignments.length > 0;
      const earnedBookTime = task.isRework ? 0 : Number(task.bookTime || 0);

      if (hasAssignments) {
        assignments.forEach((assign: any) => {
          const staffId = assign.id;
          const share = (parseFloat(assign.percentage) || 100) / 100;
          
          let tech = staffId ? statsMap.get(staffId) : null;
          if (!tech && assign.name) {
            tech = findTechByName(assign.name);
          }

          if (tech) {
            tech.dailyHoursLast7Days[dayIdx] += earnedBookTime * share;
            if (dayIdx === 6) { // today
              tech.todayHours += earnedBookTime * share;
              tech.todayTasks += share;
            }
          }
        });
      } else {
        // Fallback to completion staff
        let tech = null;
        if (task.completedByStaffId) {
          tech = statsMap.get(task.completedByStaffId);
        }
        if (!tech && task.completedByStaffName) {
          tech = findTechByName(task.completedByStaffName);
        }
        if (!tech && task.completedBy) {
          tech = findTechByName(task.completedBy);
        }

        if (tech) {
          tech.dailyHoursLast7Days[dayIdx] += earnedBookTime;
          if (dayIdx === 6) { // today
            tech.todayHours += earnedBookTime;
            tech.todayTasks += 1;
          }
        }
      }
    });

    // 2. Add clocked hourly task hours from sessions
    const taskMap = new Map<string, any>();
    allTasks.forEach(t => taskMap.set(t.id, t));

    activeSessions.forEach(session => {
      if (!session.userId || !session.clockIn?.timestamp) return;
      const tech = statsMap.get(session.userId);
      if (!tech) return;

      const jobsArr = session.jobs || [];
      jobsArr.forEach((j: any) => {
        const associatedTask = taskMap.get(j.taskId);
        if (associatedTask && associatedTask.payBasis === 'hourly') {
          const start = j.start?.seconds ? j.start.seconds * 1000 : new Date(j.start).getTime();
          let end = start;
          if (j.end) {
            end = j.end.seconds ? j.end.seconds * 1000 : new Date(j.end).getTime();
          } else {
            if (session.status === 'active' || session.status === 'on_break') {
              end = Date.now();
            } else {
              const clockOutVal = session.clockOut?.timestamp || session.clockIn?.timestamp;
              end = clockOutVal ? (parseTimestamp(clockOutVal)?.getTime() || start) : start;
            }
          }
          const hours = Math.max(0, end - start) / 3600000;
          
          const segmentDate = new Date(start);
          const dayIdx = last7Days.findIndex(d => d.key === segmentDate.toLocaleDateString());
          if (dayIdx !== -1) {
            tech.dailyHoursLast7Days[dayIdx] += hours;
            if (dayIdx === 6) { // today
              tech.todayHours += hours;
            }
          }
        }
      });
    });

    // Sum weekly hours over the last 7 days
    techStats.forEach(ts => {
      ts.weeklyHours = ts.dailyHoursLast7Days.reduce((sum, h) => sum + h, 0);
    });

    // Sort technicians by Weekly Hours desc, then Today's Hours desc, then Name asc
    return techStats.sort((a, b) => {
      if (b.weeklyHours !== a.weeklyHours) {
        return b.weeklyHours - a.weeklyHours;
      }
      if (b.todayHours !== a.todayHours) {
        return b.todayHours - a.todayHours;
      }
      return a.name.localeCompare(b.name);
    });
  }, [staffList, allTasks, activeSessions, departments, last7Days]);



  const bayZones = zones.filter(zone => !zone.isArchived && zone.type === 'bay');
  const occupiedBays = bayZones.filter(z => jobs.some((j: any) => j.id === z.currentJobId)).length;
  const qcTasksByJob = useMemo(() => {
    const targetTasks = allTasks.filter((t: any) => {
      const s = (t.status || '').toLowerCase();
      return ['qc', 'completed'].includes(s);
    });

    const groups: Record<string, { job: any; qcTasks: any[]; totalTasksCount: number }> = {};
    
    targetTasks.forEach(task => {
      const jobId = task.jobId;
      if (!jobId) return;

      const currentZone = zones.find(z => !z.isArchived && z.currentJobId === jobId);
      if (!currentZone) return;

      if (!groups[jobId]) {
        const job = jobs.find((j: any) => j.id === jobId);
        const totalTasksCount = allTasks.filter((t: any) => t.jobId === jobId).length;
        groups[jobId] = {
          job: job || { id: jobId, title: 'Unknown Job', jobNumber: '' },
          qcTasks: [],
          totalTasksCount
        };
      }
      groups[jobId].qcTasks.push(task);
    });

    return Object.values(groups);
  }, [allTasks, jobs, zones]);

  const customerJobs = jobs.filter((j: any) => ['ready for customer', 'completed'].includes((j.status || '').toLowerCase()));

  const combinedRightPanelJobs = useMemo(() => {
    const list: any[] = [];
    
    // 1. Ready for Customer jobs
    customerJobs.forEach(job => {
      list.push({
        type: 'customer',
        job,
        key: `customer-${job.id}`,
        sortOrder: 1
      });
    });

    // 2. Ready for QC jobs (from tasks)
    qcTasksByJob.forEach(group => {
      list.push({
        type: 'qc',
        job: group.job,
        qcCount: group.qcTasks.length,
        totalCount: group.totalTasksCount,
        key: `qc-${group.job.id}`,
        sortOrder: 2
      });
    });

    // Sort: Customer first, then QC
    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [customerJobs, qcTasksByJob]);

  const renderCombinedJobCard = (item: any) => {
    const { type, job, qcCount, totalCount } = item;
    const currentZone = zones.find(z => z.currentJobId === job.id);
    const vehicleVin = job.vehicleVin || job.vehicleId || job.vin;
    const vehicle = vehicles.find((v: any) => v.vin === vehicleVin || v.id === vehicleVin);
    const yearMakeModel = job.vehicleYearMakeModel 
      || (vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : null)
      || 'Unknown Vehicle';
    
    const isCustomer = type === 'customer';
    const borderLeftColor = isCustomer ? '#10b981' : '#3b82f6'; // emerald green for Customer, blue for QC

    return (
      <div 
        key={item.key} 
        className="rounded-lg 3xl:rounded-[1.5rem] border border-zinc-800 bg-zinc-900/60 p-2 3xl:p-5 flex items-center justify-between transition-all duration-300 min-h-[50px] 3xl:min-h-[110px] shadow-sm animate-in fade-in duration-300"
        style={{ borderLeft: `3px solid ${borderLeftColor}` }}
      >
        <div className="flex flex-col min-w-0 flex-1 pr-2">
          <div className="flex items-center gap-1.5 3xl:gap-3 mb-0.5 3xl:mb-1.5">
            <span className="text-white font-black font-mono text-[10px] 3xl:text-3xl">
              #{job.jobNumber || job.id.slice(-4)}
            </span>
            <h4 className="text-[10px] 3xl:text-3xl font-extrabold text-zinc-300 truncate uppercase tracking-wide">
              {job.title || 'Production Job'}
            </h4>
          </div>
          <p className="text-[8px] 3xl:text-2xl font-bold text-zinc-550 truncate">
            {yearMakeModel} {job.customerName ? `| ${job.customerName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 3xl:gap-3 shrink-0">
          {currentZone && (
            <span className="bg-zinc-800 text-zinc-400 text-[8px] 3xl:text-2xl font-black px-1.5 py-0.5 3xl:px-3.5 3xl:py-1.5 rounded 3xl:rounded-xl uppercase tracking-wider">
              {currentZone.name}
            </span>
          )}
          {isCustomer ? (
            <span className="bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 text-[9px] 3xl:text-3xl font-black px-1.5 py-0.5 3xl:px-3.5 3xl:py-1.5 rounded 3xl:rounded-xl uppercase tracking-wider">
              Ready
            </span>
          ) : (
            <span className="bg-blue-950/40 text-blue-400 border border-blue-900/30 text-[9px] 3xl:text-3xl font-black px-1.5 py-0.5 3xl:px-3.5 3xl:py-1.5 rounded 3xl:rounded-xl">
              {qcCount}/{totalCount} QC
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderZoneCard = (zone: Zone, isCompact: boolean = false) => {
    const vehicle = vehicles.find((v: any) => v.vin === zone.currentVehicleVin);
    const job = jobs.find((j: any) => j.id === zone.currentJobId);
    
    const activeStaffForJob = activeSessions.filter((session: any) => {
      const jobsArr = Array.isArray(session.jobs) ? session.jobs : [];
      return jobsArr.some((j: any) => j && !j.end && j.id === job?.id);
    });
    
    const target = job || zone;
    const legacyBlocker = target?.blocker ? [{ message: target.blocker, status: 'active' }] : [];
    const blockersArr = Array.isArray(target?.blockers) ? target.blockers : [];
    const activeBlockers = (blockersArr.length > 0 ? blockersArr : legacyBlocker).filter((b: any) => b && b.status === 'active');
    const isBlocked = activeBlockers.length > 0 || target?.status === 'Blocked' || job?.status === 'Blocked' || zone?.status === 'Blocked';

    const currentVin = job?.vehicleVin || zone?.currentVehicleVin;
    const relevantParts = partsRequests.filter((pr: any) => {
      if (!pr) return false;
      const prStatus = (pr.status || '').toLowerCase();
      const isActive = ['pending', 'received', 'ordered'].includes(prStatus);
      if (!isActive) return false;
      
      // Strictly tie parts to the Job ID if it exists
      if (job?.id && pr.jobId === job.id) return true;
      
      // Fallback to VIN only if there is NO job assigned to this zone
      // This allows tracking parts for a vehicle before a job is created
      if (!job?.id && currentVin && pr.vin === currentVin) return true;
      
      return false;
    });
    const partsArrived = relevantParts.some(pr => pr && (pr.status || '').toLowerCase() === 'received');

    const requestedCount = relevantParts.filter(pr => pr && (pr.status || '').toLowerCase() === 'pending').length;
    const orderedCount = relevantParts.filter(pr => pr && (pr.status || '').toLowerCase() === 'ordered').length;
    const receivedCount = relevantParts.filter(pr => pr && (pr.status || '').toLowerCase() === 'received').length;
    const hasParts = requestedCount + orderedCount + receivedCount > 0;

    const tasks = (job?.id && jobsTasks[job.id]) || [];
    const dynamicETA = job?.id ? calculateDynamicETA(job, tasks, departments) : null;

    const deadlineRaw = job 
      ? (job.scheduledEndDate || job.expectedFinishTime || job.eta)
      : zone.eta;
    const etaRaw = job
      ? (dynamicETA || job.expectedFinishTime || job.eta)
      : zone.eta;

    let isOverdue = false;
    let isUrgent = false; // Based on business settings
    let timeLabel = '';
    let etaDate: Date | null = null;

    const urgentThreshold = parseFloat(monitorSettings?.monitorUrgentThreshold) || 4;

    if (etaRaw) {
      etaDate = parseSafeDate(etaRaw);
    }

    if (deadlineRaw && etaRaw) {
      const parsedDeadline = parseSafeDate(deadlineRaw);
      if (parsedDeadline) {
        const diffMs = parsedDeadline.getTime() - now;
        isOverdue = diffMs < 0;
        isUrgent = diffMs > 0 && diffMs < urgentThreshold * 3600 * 1000;
        
        const absDiff = Math.abs(diffMs);
        const days = Math.floor(absDiff / 86400000);
        const hours = Math.floor((absDiff % 86400000) / 3600000);
        const minutes = Math.floor((absDiff % 3600000) / 60000);
        timeLabel = days > 0 ? `${days}d ${hours}h` : (hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);
      }
    }

    const activeSessionStart = zone.type === 'bay'
      ? (job?.currentBaySessionStart || zone.lastAssignedAt)
      : (job?.currentParkingSessionStart || zone.lastAssignedAt);

    const hasVehicle = !!job;

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

    const calculateTotalDuration = (totalSeconds: number, sessionStart: any, includeSeconds: boolean = false) => {
      let total = totalSeconds || 0;
      if (sessionStart) {
        const parsedStart = parseSafeDate(sessionStart);
        if (parsedStart) {
          total += Math.max(0, Math.floor((now - parsedStart.getTime()) / 1000));
        }
      }
      if (isNaN(total) || total === 0) return null;
      return formatSmartDuration(total, includeSeconds);
    };

    // Determine card color based on priority and business settings
    let cardBg = "bg-zinc-900 border-zinc-800";
    let customBgStyle: React.CSSProperties = {};
    let textColor = "text-white";

    const colors = {
      blocked: monitorSettings?.monitorColorBlocked || '#b91c1c', // red-700
      urgent: monitorSettings?.monitorColorUrgent || '#d97706', // amber-600
      overdue: monitorSettings?.monitorColorOverdue || '#b91c1c', // red-700
      active: monitorSettings?.monitorColorActive || '#1d4ed8', // blue-700
      empty: monitorSettings?.monitorColorEmpty || '#27272a' // zinc-800
    };
    
    const isPartsMissing = requestedCount > 0;
    const isPartsOrderedOrReceived = orderedCount > 0 || receivedCount > 0;

    const nonGeneralTasks = tasks.filter((t: any) => t && !isGeneralTask(t));
    const totalTasksCount = nonGeneralTasks.length;
    const readyForQCTasksCount = nonGeneralTasks.filter((t: any) => t && (t.status === 'QC' || t.status === 'QC Complete')).length;

    const someTasksReadyForQC = totalTasksCount > 0 && readyForQCTasksCount > 0 && readyForQCTasksCount < totalTasksCount;
    const allTasksReadyForQC = totalTasksCount > 0 && readyForQCTasksCount === totalTasksCount;

    if (isBlocked) {
      customBgStyle = { backgroundColor: colors.blocked, borderColor: `${colors.blocked}ff`, boxShadow: `0 0 30px ${colors.blocked}66`, borderWidth: '4px', borderStyle: 'solid' };
      textColor = "text-white font-black";
    } else if (hasVehicle && allTasksReadyForQC) {
      customBgStyle = { backgroundColor: '#10b981', borderColor: '#059669', boxShadow: `0 0 30px rgba(16,185,129,0.4)`, borderWidth: '4px', borderStyle: 'solid' };
      textColor = "text-white font-black";
    } else if (hasVehicle && isPartsMissing) {
      customBgStyle = { backgroundColor: colors.urgent, borderColor: `${colors.urgent}ff`, boxShadow: `0 0 30px ${colors.urgent}4d`, borderWidth: '4px', borderStyle: 'solid' };
      textColor = "text-white font-black";
    } else if (hasVehicle && someTasksReadyForQC) {
      customBgStyle = { backgroundColor: colors.active, borderColor: '#10b981', boxShadow: `0 0 20px rgba(16,185,129,0.4)`, borderWidth: '4px', borderStyle: 'solid' };
      textColor = "text-white font-bold";
    } else if (hasVehicle && isOverdue) {
      customBgStyle = { backgroundColor: colors.active, borderColor: colors.overdue, boxShadow: `inset 0 0 20px ${colors.overdue}66`, borderWidth: '4px', borderStyle: 'solid' };
      textColor = "text-white font-bold";
    } else if (hasVehicle && isPartsOrderedOrReceived) {
      customBgStyle = { backgroundColor: colors.active, borderColor: colors.urgent, boxShadow: `inset 0 0 20px ${colors.urgent}4d`, borderWidth: '4px', borderStyle: 'solid' };
      textColor = "text-white font-bold";
    } else if (hasVehicle) {
      customBgStyle = { backgroundColor: colors.active, borderColor: `${colors.active}ff`, borderWidth: '4px', borderStyle: 'solid' };
      textColor = "text-white";
    } else {
      customBgStyle = { backgroundColor: `${colors.empty}`, borderColor: `${colors.empty}80`, opacity: 0.6, borderWidth: '4px', borderStyle: 'solid' };
      textColor = "text-zinc-400";
    }

    const timeInArea = () => {
      const timestamp = zone.lastAssignedAt || zone.updatedAt || zone.createdAt;
      if (!timestamp) return 'Unknown';
      let date = parseSafeDate(timestamp);
      if (!date || isNaN(date.getTime())) return 'Unknown';
      const diff = Math.floor((now - date.getTime()) / 1000);
      if (diff < 0) return 'Just now';
      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    };

    const lastUpdatedRaw = job?.updatedAt || zone.updatedAt || zone.createdAt;
    const lastUpdatedDate = parseSafeDate(lastUpdatedRaw) || new Date();
    
    const isStale = lastUpdatedDate && (Date.now() - lastUpdatedDate.getTime() > (parseFloat(monitorSettings?.monitorStaleThreshold) || 4) * 60 * 60 * 1000);

    const lastUpdated = () => {
      if (!lastUpdatedRaw) return 'Never';
      if (!lastUpdatedDate || isNaN(lastUpdatedDate.getTime())) return 'Never';
      const diff = Math.floor((now - lastUpdatedDate.getTime()) / 1000);
      if (diff < 60) return 'Just now';
      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      if (hours > 24) return `${Math.floor(hours/24)}d ago`;
      if (hours > 0) return `${hours}h ago`;
      return `${minutes}m ago`;
    };
    
    const statusKey = `${isBlocked}-${requestedCount}-${receivedCount}-${job?.lastUpdated || ''}-${hasVehicle}`;

    const cardVariants = {
      initial: { opacity: 0, scale: 0.95 },
      animate: { 
        opacity: 1, 
        scale: 1,
        boxShadow: isBlocked 
          ? [`0 0 20px ${colors.blocked}66`, `0 0 50px ${colors.blocked}cc`, `0 0 20px ${colors.blocked}66`]
          : (hasVehicle && isPartsMissing)
            ? [`0 0 15px ${colors.urgent}4d`, `0 0 40px ${colors.urgent}99`, `0 0 15px ${colors.urgent}4d`]
            : (hasVehicle && isOverdue)
              ? [`inset 0 0 10px ${colors.overdue}66`, `inset 0 0 30px ${colors.overdue}99`, `inset 0 0 10px ${colors.overdue}66`]
              : (hasVehicle && isPartsOrderedOrReceived)
                ? [`inset 0 0 10px ${colors.urgent}4d`, `inset 0 0 30px ${colors.urgent}80`, `inset 0 0 10px ${colors.urgent}4d`]
                : "0px 0px 0px rgba(0,0,0,0)",
        transition: {
          boxShadow: {
            repeat: Infinity,
            duration: 3,
            ease: "easeInOut" as const
          }
        }
      },
      exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } }
    };

    if (isCompact) {
      return (
        <motion.div 
          layout
          initial="initial"
          animate="animate"
          exit="exit"
          variants={cardVariants}
          key={zone.id} 
          className={cn("relative rounded-xl border flex flex-col justify-center transition-all duration-1000 min-h-0 overflow-hidden p-1.5 3xl:p-3", cardBg)}
          style={customBgStyle}
        >
          {/* Status Flash Overlay */}
          <motion.div
            key={statusKey}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className={cn(
              "absolute inset-0 pointer-events-none z-20",
              isBlocked ? "bg-red-500/20" : hasParts ? "bg-amber-500/20" : "bg-emerald-500/20"
            )}
          />

          <div className="flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <h2 className={cn("text-[10px] 2xl:text-sm 3xl:text-2xl font-black tracking-widest uppercase opacity-50", textColor)}>
                {zone.name}
              </h2>
              <div className="flex items-center gap-0.5 shrink-0 z-10">
                {isBlocked && (
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="bg-red-500 text-white px-1 py-0.5 rounded-[2px] text-[7px] 3xl:text-[12px] font-black uppercase tracking-widest flex items-center leading-none"
                  >
                     !
                  </motion.div>
                )}
                {hasParts && (
                  <motion.div 
                    key={`${requestedCount}-${receivedCount}`}
                    animate={{ y: [0, -5, 0] }}
                    className={cn(
                      "px-1 py-0.5 rounded-[2px] text-[7px] 3xl:text-[12px] font-black uppercase tracking-widest flex items-center leading-none",
                      partsArrived ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                    )}
                  >
                     {requestedCount}/{orderedCount}/{receivedCount}
                  </motion.div>
                )}
              </div>
            </div>
            
            <AnimatePresence mode="wait">
              {hasVehicle ? (
                <motion.div 
                  key={vehicle?.id || 'vehicle'}
                  initial={{ x: 10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -10, opacity: 0 }}
                  className="flex flex-col"
                >
                  <div className="text-[12px] 2xl:text-base 3xl:text-3xl font-black text-white line-clamp-1 leading-tight tracking-tight">
                    {job?.jobNumber ? `JOB #${job.jobNumber}` : `${vehicle?.year || ''} ${vehicle?.make || ''} ${vehicle?.model || 'Vehicle'}`}
                  </div>
                  {job?.jobNumber && (
                    <div className="text-white/60 text-[9px] 3xl:text-[16px] font-bold truncate leading-none mt-0.5">
                      {vehicle?.year || ''} {vehicle?.make || ''} {vehicle?.model || 'Vehicle'}
                    </div>
                  )}
                  {!job && (
                    <div className="text-red-400 font-bold text-[8px] 3xl:text-[14px] uppercase flex items-center gap-0.5 mt-0.5">
                      <AlertTriangle className="w-2.5 h-2.5 3xl:w-4 3xl:h-4" />
                      No Active Job
                    </div>
                  )}
                  {allTasksReadyForQC && !isBlocked && (
                    <div className="text-emerald-400 font-bold text-[8px] 3xl:text-[14px] uppercase flex items-center gap-0.5 mt-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5 3xl:w-4 3xl:h-4" />
                      Ready for QC
                    </div>
                  )}
                  {someTasksReadyForQC && !isBlocked && (
                    <div className="text-emerald-400/90 font-bold text-[8px] 3xl:text-[14px] uppercase flex items-center gap-0.5 mt-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5 3xl:w-4 3xl:h-4" />
                      QC {readyForQCTasksCount}/{totalTasksCount}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-0.5">
                    <div className="text-[8px] 3xl:text-[16px] text-white/40 font-bold tracking-widest uppercase">
                      {timeInArea()}
                      {job && calculateTotalDuration(zone.type === 'bay' ? job.totalBayTimeSeconds : job.totalParkingTimeSeconds, activeSessionStart) && (
                        <span className="ml-2 text-white/20">
                          / {calculateTotalDuration(zone.type === 'bay' ? job.totalBayTimeSeconds : job.totalParkingTimeSeconds, activeSessionStart)}
                        </span>
                      )}
                    </div>
                  </div>
                  {activeStaffForJob.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 shrink-0">
                      <span className="relative flex items-center justify-center shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      </span>
                      <span className="text-[8px] 3xl:text-[14px] font-black text-emerald-300 uppercase truncate">
                        {activeStaffForJob.map(s => s.userName ? s.userName.split(' ')[0] : 'Crew').filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.5 }}
                  className="text-[10px] 2xl:text-xs 3xl:text-2xl font-bold text-zinc-800 uppercase tracking-widest"
                >
                  ---
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {isBlocked && (
            <div className="mt-1 border-t border-red-500/30 pt-0.5 overflow-hidden flex items-center justify-center shrink-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeBlockers.length > 0 ? activeBlockers[0]?.message : 'blocked'}
                  className="text-red-400 font-bold uppercase tracking-widest truncate text-center text-[8px] 3xl:text-[14px] w-full"
                >
                  {activeBlockers.length > 0 ? activeBlockers[0]?.message : 'BLOCKED'}
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      );
    }

    return (
      <motion.div 
        layout
        initial="initial"
        animate="animate"
        exit="exit"
        variants={cardVariants}
        key={zone.id} 
        className={cn(
          "@container rounded-[1.25rem] p-[max(0.5rem,1.2cqw)] border-[3px] flex flex-col transition-all duration-500 min-h-0 overflow-hidden relative", 
          cardBg,
          !hasVehicle && "border-dashed opacity-60"
        )}
        style={customBgStyle}
      >
        {/* Status Flash Effect */}
        <motion.div
          key={statusKey}
          initial={{ opacity: 1 }}
          animate={{ 
            opacity: [0, 1, 0, 1, 0],
            backgroundColor: [
              "rgba(255, 255, 255, 0.2)",
              "rgba(239, 68, 68, 0.4)", // Red
              "rgba(59, 130, 246, 0.4)", // Blue
              "rgba(239, 68, 68, 0.4)", // Red
              "rgba(59, 130, 246, 0.4)"  // Blue
            ],
            boxShadow: [
              "inset 0 0 0px rgba(0,0,0,0)",
              "inset 0 0 60px rgba(239, 68, 68, 0.6)",
              "inset 0 0 60px rgba(59, 130, 246, 0.6)",
              "inset 0 0 60px rgba(239, 68, 68, 0.6)",
              "inset 0 0 60px rgba(59, 130, 246, 0.6)"
            ]
          }}
          transition={{ duration: 1.2, ease: "linear" }}
          className="absolute inset-0 pointer-events-none z-20 border-[8px] border-double border-white/20"
        />
        <div className="flex-1 min-h-0 flex flex-col justify-between">
          <div className="flex items-start justify-between mb-0.5">
            <h2 
              className={cn("font-black tracking-tighter line-clamp-1 leading-none uppercase shrink-0", textColor)}
              style={{ fontSize: 'clamp(1rem, 7cqw, 3rem)' }}
            >
              {zone.name}
            </h2>
            <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
              {isBlocked && (
                <motion.div 
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 3 }}
                  className="bg-red-500 text-white px-1.5 py-0.5 rounded-md text-[max(0.5rem,1.8cqw)] font-black uppercase tracking-widest flex items-center gap-1"
                >
                  <AlertTriangle className="w-[max(0.6rem,2cqw)] h-[max(0.6rem,2cqw)]" /> 
                  Blocked
                </motion.div>
              )}
              {hasParts && (
                <motion.div 
                  key={`${requestedCount}-${receivedCount}`}
                  animate={{ scale: [1, 1.1, 1] }}
                  className={cn(
                    "px-1.5 py-0.5 rounded-md text-[max(0.5rem,1.8cqw)] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg",
                    partsArrived ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                  )}
                >
                  <ShoppingCart className="w-[max(0.6rem,2cqw)] h-[max(0.6rem,2cqw)]" /> 
                  {requestedCount}/{orderedCount}/{receivedCount}
                </motion.div>
              )}
              {allTasksReadyForQC && !isBlocked && (
                <motion.div 
                  className="bg-emerald-500 text-white px-1.5 py-0.5 rounded-md text-[max(0.5rem,1.8cqw)] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg"
                >
                  <CheckCircle2 className="w-[max(0.6rem,2cqw)] h-[max(0.6rem,2cqw)]" /> 
                  QC
                </motion.div>
              )}
              {someTasksReadyForQC && !isBlocked && (
                <motion.div 
                  className="bg-emerald-600/90 text-white px-1.5 py-0.5 rounded-md text-[max(0.5rem,1.8cqw)] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg ring-1 ring-emerald-500/20"
                >
                  <CheckCircle2 className="w-[max(0.6rem,2cqw)] h-[max(0.6rem,2cqw)]" /> 
                  QC {readyForQCTasksCount}/{totalTasksCount}
                </motion.div>
              )}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {hasVehicle ? (
              <motion.div 
                key={vehicle?.id || 'vehicle'}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                className="flex-1 min-h-0 flex flex-col justify-start py-0.5 gap-0.5"
              >
                <div 
                  className="font-black text-white line-clamp-1 tracking-tighter leading-tight shrink-0"
                  style={{ fontSize: 'clamp(0.8rem, 5cqw, 2rem)' }}
                >
                  {job?.jobNumber ? `JOB #${job.jobNumber}` : `${vehicle?.year || ''} ${vehicle?.make || ''} ${vehicle?.model || 'Vehicle'}`}
                </div>
                {!job && (
                  <div className="text-red-400 font-bold uppercase flex items-center gap-1 mt-0.5 shrink-0"
                       style={{ fontSize: 'clamp(0.6rem, 2.6cqw, 1.15rem)' }}>
                    <AlertTriangle className="w-[max(0.55rem,2cqw)] h-[max(0.55rem,2cqw)]" />
                    No Active Job
                  </div>
                )}
                {job && (
                  <div 
                    className={cn("font-bold line-clamp-1 leading-tight tracking-tight opacity-90 shrink-0", textColor)}
                    style={{ fontSize: 'clamp(0.7rem, 3.5cqw, 1.35rem)' }}
                  >
                    {job?.jobNumber ? `${vehicle?.year || ''} ${vehicle?.make || ''} ${vehicle?.model || 'Vehicle'}` : job.title}
                  </div>
                )}
                {job?.jobNumber && job.title && (
                  <div 
                    className="font-bold line-clamp-1 leading-tight tracking-tight text-white/70 shrink-0"
                    style={{ fontSize: 'clamp(0.6rem, 3cqw, 1.1rem)' }}
                  >
                    {job.title}
                  </div>
                )}
                <div 
                  className="font-black uppercase tracking-widest text-white/30 line-clamp-1 leading-tight shrink-0"
                  style={{ fontSize: 'clamp(0.5rem, 2cqw, 0.85rem)' }}
                >
                  {(!job?.title || job.title.toLowerCase().trim() !== (job?.customerName || vehicle?.customerName || '').toLowerCase().trim()) 
                    ? (job?.customerName || vehicle?.customerName || 'No Customer')
                    : ''}
                </div>
                {activeStaffForJob.length > 0 && (
                  <div className="mt-1 flex flex-col gap-1 border-t border-white/10 pt-1 shrink-0">
                    <span className="font-bold uppercase tracking-widest text-white/40 text-[max(0.45rem,1.4cqw)] leading-none shrink-0 mb-0.5">
                      Crew
                    </span>
                    <div className="flex flex-col gap-1 shrink-0">
                      {activeStaffForJob.map((session: any) => {
                        const jobsArr = Array.isArray(session.jobs) ? session.jobs : [];
                        const activeJobSegment = jobsArr.find((j: any) => j && !j.end && j.id === job?.id);
                        const taskName = activeJobSegment?.taskName || 'General';
                        return (
                          <div 
                            key={session.id} 
                            className="flex items-center gap-1.5 bg-white/10 dark:bg-black/25 px-2 py-0.5 rounded-md border border-white/15 backdrop-blur-sm shadow-sm shrink-0"
                          >
                            <div className="relative flex items-center justify-center shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="absolute w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping opacity-70" />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col shrink-0">
                              <span 
                                className="font-black text-white uppercase truncate leading-tight shrink-0"
                                style={{ fontSize: 'clamp(0.65rem, 2.2cqw, 1rem)' }}
                              >
                                {session.userName || 'Unknown Crew'}
                              </span>
                              <span 
                                className="font-bold text-white/60 uppercase truncate text-[max(0.5rem,1.4cqw)] leading-none mt-0.5 shrink-0"
                              >
                                {taskName}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 min-h-0 flex flex-col justify-center"
              >
                <div 
                  className="font-black text-zinc-900/40 uppercase tracking-tighter leading-none"
                  style={{ fontSize: 'clamp(1rem, 6cqw, 3.5rem)' }}
                >
                  Empty
                </div>
                <div 
                  className="font-bold uppercase tracking-widest text-zinc-500 mt-1.5 leading-none"
                  style={{ fontSize: 'clamp(0.6rem, 2cqw, 1.1rem)' }}
                >
                  For {timeInArea()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {hasVehicle && (
          <div className="pt-1.5 border-t border-white/10 shrink-0 flex flex-col gap-1 text-[max(0.6rem,1.8cqw)]">
            {/* Row 1: Session and Total Bay times */}
            <div className="flex justify-between items-center text-white/70">
              <span>{zone.type === 'bay' ? 'Session' : 'Parked'}: <strong className="text-white font-black">{calculateTotalDuration(0, activeSessionStart, true) || '---'}</strong></span>
              <span>{zone.type === 'bay' ? 'Total' : 'Total Lot'}: <strong className="text-white font-black">{job ? calculateTotalDuration(zone.type === 'bay' ? job.totalBayTimeSeconds : job.totalParkingTimeSeconds, activeSessionStart) || '---' : '---'}</strong></span>
            </div>
            
            {/* Row 2: Last Updated and ETA/Due */}
            <div className="flex justify-between items-center text-white/50 border-t border-white/5 pt-1.5 mt-0.5">
              <span>Updated: <strong className={cn("font-bold", isStale ? "text-amber-400" : "text-white/80")}>{lastUpdated()}</strong></span>
              {etaDate && (
                <span className={cn(
                  "font-black tracking-tight", 
                  isOverdue ? "text-red-400 animate-pulse" : isUrgent ? "text-amber-300" : "text-emerald-400"
                )}>
                  Due: {isOverdue ? `-${timeLabel}` : timeLabel}
                </span>
              )}
            </div>
          </div>
        )}
        <BlockerTicker blockers={activeBlockers} isBlocked={isBlocked} />
      </motion.div>
    );
  };

  return (
    <div className="h-[100dvh] bg-black text-white p-4 md:p-6 lg:p-8 3xl:p-8 relative overflow-hidden flex flex-col">
      <Toaster position="top-right" richColors theme="system" closeButton />
      <div className="flex items-center justify-between mb-4 lg:mb-6 3xl:mb-3 shrink-0">
        <div className="flex items-center gap-4 lg:gap-6 3xl:gap-8">
          <div className="hidden md:flex items-center justify-center bg-white p-1.5 3xl:p-3 rounded-xl 3xl:rounded-3xl shrink-0">
            <div className="w-12 h-12 2xl:w-16 2xl:h-16 3xl:w-28 3xl:h-28">
              <QRCode value="https://upfittersos.com" size={256} style={{ height: 'auto', maxWidth: '100%', width: '100%' }} level="L" />
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <div className="text-zinc-400 font-black uppercase tracking-widest text-sm md:text-lg 2xl:text-2xl 3xl:text-[60px] leading-none mb-1 3xl:mb-3">
              {businessName}
            </div>
            <h1 className="text-2xl md:text-4xl 2xl:text-5xl 3xl:text-[120px] font-black tracking-tighter text-white leading-none">
              BAY MONITOR
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4 lg:gap-8 3xl:gap-8 relative z-10">
          <div className="flex flex-col items-end gap-1 3xl:gap-2">
            <LiveIndicator isDisconnected={!!connectionError || !isOnline} />
            <div className="text-[10px] md:text-xs 3xl:text-[24px] font-bold text-zinc-600 uppercase tracking-widest leading-none">
              Updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
          <div className="text-right flex flex-col justify-center">
            <div className="text-xl md:text-3xl 2xl:text-4xl 3xl:text-[90px] font-black tracking-tight leading-none mb-0.5 3xl:mb-2">
              {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-zinc-400 text-sm md:text-lg 2xl:text-xl 3xl:text-[45px] font-bold uppercase tracking-widest leading-none">
              {new Date(now).toLocaleDateString()}
            </div>
          </div>
          <button 
            onClick={toggleFullscreen}
            className="hidden md:block p-3 3xl:p-6 bg-zinc-900 hover:bg-zinc-800 rounded-xl 3xl:rounded-2xl transition-colors text-zinc-400 hover:text-white shrink-0 ml-2 3xl:ml-4 border border-zinc-800"
          >
            {isFullscreen ? <Minimize className="w-6 h-6 3xl:w-10 3xl:h-10" /> : <Maximize className="w-6 h-6 3xl:w-10 3xl:h-10" />}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-2 lg:gap-4 3xl:gap-8">
        {/* Main Bays Area */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between mb-2 3xl:mb-4">
            <h3 
              className="font-black uppercase tracking-[0.2em] text-zinc-500"
              style={{ fontSize: 'clamp(0.8rem, 3cqw, 2.5rem)' }}
            >
              Active Shop
            </h3>
            <div className="flex items-center gap-2 3xl:gap-4 bg-zinc-900 border border-zinc-800 px-3 py-1 3xl:px-4 3xl:py-2 rounded-lg 3xl:rounded-xl shadow-lg">
              <span 
                className="text-zinc-500 font-black uppercase tracking-widest"
                style={{ fontSize: 'clamp(0.6rem, 2cqw, 1.5rem)' }}
              >
                Bays:
              </span>
              <span 
                className="text-white font-black"
                style={{ fontSize: 'clamp(0.8rem, 2.5cqw, 2rem)' }}
              >
                {occupiedBays} / {bayZones.length}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-3 3xl:gap-4 flex-1 min-h-0 auto-rows-fr">
            <AnimatePresence>
              {bayZones.map((zone: Zone) => renderZoneCard(zone, false))}
            </AnimatePresence>
          </div>
        </div>

        {/* Ready for Customer & QC Panel */}
        <div className="w-[200px] lg:w-[280px] 3xl:w-[650px] shrink-0 flex flex-col gap-4 border-l border-zinc-900 pl-2 lg:pl-4 overflow-hidden">
          
          {/* Unified QC & Customer List */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2.5 shrink-0">
              <h3 
                className="font-black uppercase tracking-[0.12em] text-zinc-500 text-[10px] lg:text-xs 3xl:text-3xl"
              >
                QC & Customer Ready
              </h3>
              <span className="bg-blue-600/10 text-blue-400 font-mono font-black text-[10px] px-2 py-0.5 rounded border border-blue-500/20">
                {combinedRightPanelJobs.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0 space-y-2">
              {combinedRightPanelJobs.length === 0 ? (
                <div className="h-full flex items-center justify-center border border-dashed border-zinc-850 rounded-xl p-3 text-center">
                  <span className="text-[10px] 3xl:text-base font-bold text-zinc-650 uppercase tracking-widest">None</span>
                </div>
              ) : (
                combinedRightPanelJobs.map((item: any) => renderCombinedJobCard(item))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upfitter Leaderboard at the bottom */}
      {leaderboardData.length > 0 && (() => {
        const TECH_COLORS = [
          '#3b82f6', // blue
          '#10b981', // emerald
          '#a855f7', // purple
          '#f97316', // orange
          '#ec4899', // pink
          '#06b6d4', // cyan
          '#eab308', // yellow
          '#14b8a6', // teal
        ];

        const maxChartVal = Math.max(8, ...leaderboardData.flatMap((t: any) => t.dailyHoursLast7Days || []));
        const chartMaxY = Math.ceil(maxChartVal / 4) * 4;
        const chartYTicks = [0, chartMaxY * 0.25, chartMaxY * 0.5, chartMaxY * 0.75, chartMaxY];

        const chartWidth = 1000;
        const chartHeight = 220;
        const chartPaddingLeft = 40;
        const chartPaddingRight = 20;
        const chartPaddingTop = 15;
        const chartPaddingBottom = 25;
        
        const innerWidth = chartWidth - chartPaddingLeft - chartPaddingRight;
        const innerHeight = chartHeight - chartPaddingTop - chartPaddingBottom;
        
        const getChartX = (idx: number) => chartPaddingLeft + (idx / 6) * innerWidth;
        const getChartY = (val: number) => chartHeight - chartPaddingBottom - (val / chartMaxY) * innerHeight;

        return (
          <div className="mt-4 3xl:mt-6 border-t border-zinc-900 pt-3 lg:pt-4 shrink-0 flex flex-col lg:flex-row bg-zinc-950/20 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 pb-3 min-h-0 h-[300px] lg:h-[280px] 3xl:h-[480px] gap-4 lg:gap-6 3xl:gap-8">
            
            {/* Left Side: Upfitters list with colors and weekly totals */}
            <div className="flex flex-col shrink-0 lg:w-[280px] 3xl:w-[600px] gap-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500 lg:w-5 lg:h-5 3xl:w-8 3xl:h-8" />
                <h3 className="font-black uppercase tracking-wider text-zinc-400 text-xs 3xl:text-2xl">
                  Upfitter standings
                </h3>
              </div>
              <div className="flex flex-row flex-wrap lg:flex-col gap-2 overflow-y-auto custom-scrollbar pr-1 max-h-[100px] lg:max-h-none flex-1">
                {leaderboardData.map((tech, idx) => {
                  const color = TECH_COLORS[idx % TECH_COLORS.length];
                  let statusBorder = "border-zinc-800";
                  if (tech.clockInStatus === 'active') {
                    statusBorder = "border-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.3)]";
                  } else if (tech.clockInStatus === 'on_break') {
                    statusBorder = "border-amber-500";
                  }
                  return (
                    <div key={tech.id} className="flex items-center gap-2 3xl:gap-4 bg-zinc-900/50 border border-zinc-850 px-3 py-1 3xl:px-5 3xl:py-3.5 rounded-full lg:rounded-2xl text-xs 3xl:text-2xl w-full lg:w-auto">
                      <span className="w-2 h-2 3xl:w-4 3xl:h-4 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      
                      <div className={cn("w-5 h-5 3xl:w-10 3xl:h-10 rounded-full border bg-zinc-800 text-white font-bold flex items-center justify-center text-[8px] 3xl:text-base shrink-0", statusBorder)}>
                        {tech.name.split(' ').map((n: string) => n[0]).join('')}
                      </div>

                      <span className="font-extrabold text-white text-[10px] lg:text-xs 3xl:text-2xl truncate">{tech.name}</span>
                      <span className="text-[9px] lg:text-[10px] 3xl:text-xl text-zinc-550 font-bold border-l border-zinc-800 pl-2 3xl:pl-4 shrink-0">
                        Today: <span className="text-emerald-400 font-extrabold">{tech.todayHours.toFixed(1)}h</span>
                      </span>
                      <span className="text-[9px] lg:text-[10px] 3xl:text-xl text-zinc-550 font-bold border-l border-zinc-800 pl-2 3xl:pl-4 shrink-0">
                        7 Days: <span className="text-indigo-400 font-extrabold">{tech.weeklyHours.toFixed(1)}h</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Side: SVG Comparative Chart */}
            <div className="flex-1 min-h-0 w-full relative bg-zinc-950/40 rounded-xl border border-zinc-900/60 p-3">
              <svg 
                viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
                width="100%" 
                height="100%" 
                className="overflow-visible"
              >
                {/* Y-Axis Ticks & Grid Lines */}
                {chartYTicks.map((tick) => (
                  <g key={tick}>
                    <line 
                      x1={chartPaddingLeft} 
                      y1={getChartY(tick)} 
                      x2={chartWidth - chartPaddingRight} 
                      y2={getChartY(tick)} 
                      className="stroke-zinc-900 stroke-1" 
                      strokeDasharray="4 4"
                    />
                    <text 
                      x={chartPaddingLeft - 6} 
                      y={getChartY(tick) + 3} 
                      className="fill-zinc-500 text-[8px] 3xl:text-xl font-bold"
                      textAnchor="end"
                    >
                      {tick.toFixed(0)}h
                    </text>
                  </g>
                ))}

                {/* X-Axis Ticks / Labels */}
                {last7Days.map((day, idx) => (
                  <g key={day.key}>
                    <line 
                      x1={getChartX(idx)} 
                      y1={chartPaddingTop} 
                      x2={getChartX(idx)} 
                      y2={chartHeight - chartPaddingBottom} 
                      className="stroke-zinc-900/30 stroke-1" 
                    />
                    <text 
                      x={getChartX(idx)} 
                      y={chartHeight - chartPaddingBottom + 16} 
                      className="fill-zinc-400 text-[8px] 3xl:text-xl font-bold"
                      textAnchor="middle"
                    >
                      {day.label} ({day.date.getDate()})
                    </text>
                  </g>
                ))}

                {/* Technician Comparative Lines */}
                {leaderboardData.map((tech, techIdx) => {
                  const color = TECH_COLORS[techIdx % TECH_COLORS.length];
                  const points = tech.dailyHoursLast7Days.map((val: number, idx: number) => ({
                    x: getChartX(idx),
                    y: getChartY(val),
                    val
                  }));

                  const pathD = points.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight - chartPaddingBottom} L ${points[0].x} ${chartHeight - chartPaddingBottom} Z`;

                  return (
                    <g key={tech.id} className="group">
                      <path 
                        d={areaD} 
                        fill={color} 
                        fillOpacity={0.01} 
                        className="transition-all duration-300 group-hover:fill-opacity-05"
                      />
                      <path 
                        d={pathD} 
                        fill="none" 
                        stroke={color} 
                        strokeWidth={2.5} 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        className="transition-all duration-300 opacity-70 group-hover:opacity-100 group-hover:stroke-[3.5]"
                      />
                      {points.map((p: any, idx: number) => (
                        <circle 
                          key={idx}
                          cx={p.x}
                          cy={p.y}
                          r={p.val > 0 ? 3.5 : 2}
                          fill={p.val > 0 ? color : '#09090b'}
                          stroke={color}
                          strokeWidth={1.5}
                          className="transition-all duration-200 group-hover:r-[5]"
                        >
                          <title>{tech.name}: {p.val.toFixed(1)}h</title>
                        </circle>
                      ))}
                    </g>
                  );
                })}
              </svg>
            </div>

          </div>
        );
      })()}

      {/* Connection Recovery Banner */}
      <AnimatePresence>
        {(connectionError || !isOnline) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-950/90 border-2 border-red-900/60 rounded-[2.5rem] p-12 max-w-xl w-full text-center shadow-[0_0_50px_rgba(239,68,68,0.2)]"
            >
              <div className="relative w-20 h-20 mx-auto mb-6">
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="absolute inset-0 bg-red-500/20 rounded-full"
                />
                <div className="absolute inset-2 bg-red-950/50 border border-red-500 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
              </div>
              <h2 className="text-3xl font-black text-white mb-3 uppercase tracking-wider">
                {!isOnline ? "Network Disconnected" : "Connection Interrupted"}
              </h2>
              <p className="text-red-200/80 text-sm md:text-base font-semibold mb-6">
                {connectionError || "Check your internet connection."}
              </p>
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl py-4 px-6 flex items-center justify-center gap-3">
                <RefreshCw className="w-5 h-5 text-red-400 animate-spin" />
                <span className="text-red-400 font-black tracking-wider text-sm uppercase">
                  Reloading in {reloadCountdown ?? 20}s...
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
