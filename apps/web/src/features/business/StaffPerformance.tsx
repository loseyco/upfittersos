import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit, collectionGroup, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Trophy, Warehouse, Briefcase, 
  Clock, Package, Truck, Search,
  ChevronRight, Star, Zap, AlertCircle,
  ArrowUpRight, Activity,
  Info, Maximize, Minimize, CheckCircle, Calendar, Play
} from 'lucide-react';
import { useAuthStore } from '../../lib/auth/store';
import { cn } from '../../lib/utils';
import { toast, Toaster } from 'sonner';
import { useWakeLock } from '../../hooks/useWakeLock';

type Timeframe = 'day' | 'week' | 'month' | 'all';

interface StaffActivity {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: any;
  author: string;
  authorId?: string;
  severity: string;
}

interface StaffStats {
  id: string;
  name: string;
  email: string;
  department?: string;
  totalPoints: number;
  moves: number;
  jobs: number;
  parts: number;
  shipments: number;
  timeLogged: number; // in minutes
  overtimeMinutes: number;
  lateCount: number;
  earnedJobMinutes: number;
  actualJobMinutes: number;
  lastActivity?: any;

  // New stats properties
  bookTimeHours: number;
  timeEarlyMins: number;
  timeStayingLateMins: number;
  unscheduledMins: number;
  completedTasksCount: number;
  tasksCompletedByType: Record<string, number>;
  vehiclesWorkedOn: Record<string, { count: number; minutes: number }>;
  customersServiced: Record<string, { count: number; minutes: number }>;
}

export function StaffPerformance({ tenantId }: { tenantId: string }) {
  const { permissions, isSuperAdmin } = useAuthStore();
  const canViewReports = isSuperAdmin || permissions['reports.view'];

  const [searchParams, setSearchParams] = useSearchParams();
  const staffNameParam = searchParams.get('staffName');
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  
  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tick, setTick] = useState(0);
  const [showActivity, setShowActivity] = useState(false);

  // Update tick every minute to refresh "live" durations
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);


  // Fetch all necessary data for activity tracking
  const { data: rawData, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['staff-performance-raw', tenantId],
    queryFn: async () => {
      const collections = [
        { name: 'zone_assignments', dateField: 'assignedAt', authorField: 'assignedByName', authorIdField: 'assignedBy' },
        { name: 'jobs', dateField: 'createdAt', authorField: 'createdByName', authorIdField: 'createdBy' },
        { name: 'parts_requests', dateField: 'createdAt', authorField: 'requestedBy', authorIdField: 'createdBy' },
        { name: 'shipments', dateField: 'createdAt', authorField: 'createdByName', authorIdField: 'createdBy' },
        { name: 'time_sessions', dateField: 'clockIn.timestamp', authorField: 'userName', authorIdField: 'userId' },
        { name: 'staff', dateField: 'createdAt' },
        { name: 'departments', dateField: 'createdAt' },
        { name: 'vehicles', dateField: 'createdAt' },
        { name: 'customers', dateField: 'createdAt' }
      ];

      const results = await Promise.all(
        collections.map(async (col) => {
          try {
            const q = query(collection(db, `businesses/${tenantId}/${col.name}`));
            const snap = await getDocs(q);
            return { 
              name: col.name, 
              data: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) 
            };
          } catch (e) {
            console.warn(`Could not fetch ${col.name}`, e);
            return { name: col.name, data: [] };
          }
        })
      );

      // Fetch all completed / QC tasks via collectionGroup
      let tasksData: any[] = [];
      try {
        const qTasks = query(
          collectionGroup(db, 'tasks'),
          where('tenantId', '==', tenantId)
        );
        const snapTasks = await getDocs(qTasks);
        tasksData = snapTasks.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(), 
          refPath: doc.ref.path 
        }));
      } catch (e) {
        console.warn("Could not fetch tasks via collectionGroup", e);
      }

      const raw = results.reduce((acc, curr) => ({ ...acc, [curr.name]: curr.data }), {} as Record<string, any[]>);
      raw.tasks = tasksData;
      return raw;
    }
  });

  const stats = useMemo(() => {
    if (!rawData) return [];

    const now = new Date();
    const getPeriodStart = (tf: Timeframe) => {
      const d = new Date(now);
      if (tf === 'day') d.setHours(0, 0, 0, 0);
      else if (tf === 'week') {
        d.setDate(d.getDate() - 7);
        d.setHours(0, 0, 0, 0);
      } else if (tf === 'month') {
        d.setMonth(d.getMonth() - 1);
        d.setHours(0, 0, 0, 0);
      } else if (tf === 'all') return 0;
      return d.getTime();
    };

    const periodStart = getPeriodStart(timeframe);

    const parseDate = (val: any) => {
      if (!val) return 0;
      if (val.toMillis) return val.toMillis();
      if (val.seconds) return val.seconds * 1000;
      if (val._seconds) return val._seconds * 1000;
      return new Date(val).getTime();
    };

    const staffMap = new Map<string, StaffStats>();

    // Helper to find staff by name if ID is missing (legacy data)
    const findStaffByName = (name: string) => {
      if (!name) return null;
      return Array.from(staffMap.values()).find(s => 
        s.name.toLowerCase() === name.toLowerCase() || 
        s.name.toLowerCase().startsWith(name.toLowerCase())
      );
    };

    // Initialize staff map
    rawData.staff?.filter(s => !s.isArchived && !s.fireDate && s.departmentId).forEach(s => {
      const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.displayName || s.email || 'Unnamed Staff';
      staffMap.set(s.id, {
        id: s.id,
        name,
        email: s.email || '',
        department: s.departmentId,
        totalPoints: 0,
        moves: 0,
        jobs: 0,
        parts: 0,
        shipments: 0,
        timeLogged: 0,
        overtimeMinutes: 0,
        lateCount: 0,
        earnedJobMinutes: 0,
        actualJobMinutes: 0,
        lastActivity: null,

        // New properties
        bookTimeHours: 0,
        timeEarlyMins: 0,
        timeStayingLateMins: 0,
        unscheduledMins: 0,
        completedTasksCount: 0,
        tasksCompletedByType: {},
        vehiclesWorkedOn: {},
        customersServiced: {}
      });
    });

    // Calculate total time per job to prorate earned hours correctly
    const totalTimePerJob: Record<string, number> = {};
    rawData.time_sessions?.forEach(s => {
      s.jobs?.forEach((j: any) => {
        const start = parseDate(j.start);
        const end = j.end ? parseDate(j.end) : Date.now();
        const mins = Math.max(0, (end - start) / 60000);
        if (j.id && mins > 0) {
          totalTimePerJob[j.id] = (totalTimePerJob[j.id] || 0) + mins;
        }
      });
    });

    // Process Zone Assignments (Moves)
    rawData.zone_assignments?.forEach(a => {
      const ts = parseDate(a.assignedAt);
      if (ts < periodStart) return;

      const staff = staffMap.get(a.assignedBy) || findStaffByName(a.assignedByName);
      if (staff) {
        staff.moves++;
        staff.totalPoints += 5; // 5 points per move
        if (!staff.lastActivity || ts > parseDate(staff.lastActivity)) {
          staff.lastActivity = a.assignedAt;
        }
      }
    });

    // Process Jobs
    rawData.jobs?.forEach(j => {
      const ts = parseDate(j.createdAt);
      if (ts < periodStart) return;

      const staff = staffMap.get(j.createdBy) || findStaffByName(j.createdByName);
      if (staff) {
        staff.jobs++;
        staff.totalPoints += 15; // 15 points per job created
        if (!staff.lastActivity || ts > parseDate(staff.lastActivity)) {
          staff.lastActivity = j.createdAt;
        }
      }
    });

    // Process Parts Requests
    rawData.parts_requests?.forEach(p => {
      const ts = parseDate(p.createdAt);
      if (ts < periodStart) return;

      const staff = staffMap.get(p.createdBy) || findStaffByName(p.requestedBy);
      if (staff) {
        staff.parts++;
        staff.totalPoints += 10; // 10 points per parts request
        if (!staff.lastActivity || ts > parseDate(staff.lastActivity)) {
          staff.lastActivity = p.createdAt;
        }
      }
    });

    // Process Shipments
    rawData.shipments?.forEach(s => {
      const ts = parseDate(s.createdAt);
      if (ts < periodStart) return;

      const staff = staffMap.get(s.createdBy) || findStaffByName(s.createdByName);
      if (staff) {
        staff.shipments++;
        staff.totalPoints += 12; // 12 points per shipment handled
        if (!staff.lastActivity || ts > parseDate(staff.lastActivity)) {
          staff.lastActivity = s.createdAt;
        }
      }
    });

    // Process Completed Tasks (via Collection Group query)
    rawData.tasks?.forEach(task => {
      const isCompleted = task.status === 'completed' || task.status === 'QC' || task.status === 'QC Complete';
      if (!isCompleted) return;

      const completedTs = parseDate(task.qcCompletedAt || task.completedAt || task.updatedAt);
      if (periodStart > 0 && completedTs < periodStart) return;

      // Distribute book time to assigned staff members
      const assignments = task.assignedStaff || [];
      const hasAssignments = assignments.length > 0;

      // Also respect rework status penalty (reworks = 0 book hours)
      const earnedBookTime = task.isRework ? 0 : Number(task.bookTime || 0);

      const pathParts = task.refPath ? task.refPath.split('/') : [];
      const jobId = task.jobId || pathParts[3];
      let category = 'General';
      if (jobId) {
        const job = rawData.jobs?.find(j => j.id === jobId);
        const dept = rawData.departments?.find(d => d.id === job?.departmentId);
        category = dept?.name || job?.departmentName || 'General';
      }

      if (hasAssignments) {
        assignments.forEach((assign: any) => {
          const staffId = assign.id;
          if (!staffId) return;
          
          let staff = staffMap.get(staffId);
          if (!staff) {
            // Try to resolve staff by userId
            const rawStaff = rawData.staff?.find((s: any) => s.id === staffId || s.userId === staffId);
            if (rawStaff) {
              staff = staffMap.get(rawStaff.id);
            }
          }
          if (!staff) {
            // Try lookup by name
            staff = findStaffByName(assign.name || assign.displayName || assign.fullName) ?? undefined;
          }

          if (staff) {
            const share = (parseFloat(assign.percentage) || 100) / 100;
            staff.completedTasksCount += share;
            staff.bookTimeHours += earnedBookTime * share;
            staff.tasksCompletedByType[category] = (staff.tasksCompletedByType[category] || 0) + share;
          }
        });
      } else {
        // Fallback to completion staff
        let staff = null;
        if (task.completedByStaffId) {
          staff = staffMap.get(task.completedByStaffId);
        }
        if (!staff && task.completedByStaffName) {
          staff = findStaffByName(task.completedByStaffName);
        }
        if (!staff && task.completedBy) {
          staff = findStaffByName(task.completedBy);
        }

        if (staff) {
          staff.completedTasksCount++;
          staff.bookTimeHours += earnedBookTime;
          staff.tasksCompletedByType[category] = (staff.tasksCompletedByType[category] || 0) + 1;
        }
      }
    });

    // Process Time Sessions (Attendance, Punctuality, Unscheduled work, Vehicles, Customers)
    rawData.time_sessions?.forEach(s => {
      const clockInTs = parseDate(s.clockIn?.timestamp);
      if (clockInTs < periodStart) return;

      const staffRaw = rawData.staff?.find(sr => sr.id === s.userId);
      const dept = rawData.departments?.find(d => d.id === staffRaw?.departmentId);
      
      // Resolve Schedule: Individual Override -> Dept Default -> 8h/8AM Fallback
      const schedule = staffRaw?.individualSchedule || dept?.defaultSchedule || {
        startTime: '08:00',
        endTime: '17:00',
        expectedHoursPerDay: 8,
        days: [1, 2, 3, 4, 5]
      };

      const staff = staffMap.get(s.userId) || findStaffByName(s.userName);
      if (staff && s.clockIn?.timestamp) {
        const endTs = s.clockOut?.timestamp ? parseDate(s.clockOut.timestamp) : Date.now();
        const duration = (endTs - clockInTs) / (1000 * 60);
        
        // Subtract UNPAID breaks that have ended or are in progress
        const breakMins = s.breaks?.reduce((acc: number, b: any) => {
          if (b.isPaid) return acc;
          const bStart = parseDate(b.start);
          const bEnd = b.end ? parseDate(b.end) : Date.now();
          return acc + ((bEnd - bStart) / (1000 * 60));
        }, 0) || 0;

        const mins = Math.max(0, duration - breakMins);
        staff.timeLogged += mins;
        
        // Overtime: Any single day/session over the expected daily hours
        const dailyTargetMins = (schedule.expectedHoursPerDay || 8) * 60;
        if (mins > dailyTargetMins) {
          staff.overtimeMinutes += (mins - dailyTargetMins);
        }

        // Tardiness: Check against schedule start time (+5 min grace)
        const clockInDate = new Date(clockInTs);
        const hour = clockInDate.getHours();
        const minute = clockInDate.getMinutes();
        const [schedHour, schedMin] = (schedule.startTime || '08:00').split(':').map(Number);
        
        if (hour > schedHour || (hour === schedHour && minute > (schedMin + 5))) {
          staff.lateCount++;
        }

        // Shift punctuality: early clock-in, late clock-out, unscheduled time
        const dayOfWeek = clockInDate.getDay() === 0 ? 7 : clockInDate.getDay();
        const isScheduledDay = schedule.days?.includes(dayOfWeek);

        if (isScheduledDay) {
          const shiftStart = new Date(clockInDate);
          shiftStart.setHours(schedHour, schedMin, 0, 0);

          const [schedEndHour, schedEndMin] = (schedule.endTime || '17:00').split(':').map(Number);
          const shiftEnd = new Date(clockInDate);
          shiftEnd.setHours(schedEndHour, schedEndMin, 0, 0);

          // Early clock-in (capped at 120 mins to filter anomalous sessions)
          if (clockInTs < shiftStart.getTime()) {
            const earlyDiff = (shiftStart.getTime() - clockInTs) / 60000;
            staff.timeEarlyMins += Math.min(120, earlyDiff);
          }

          // Late clock-out (capped at 240 mins)
          if (endTs > shiftEnd.getTime()) {
            const lateDiff = (endTs - shiftEnd.getTime()) / 60000;
            staff.timeStayingLateMins += Math.min(240, lateDiff);
          }

          // Unscheduled hours on scheduled days (worked before or after scheduled shift)
          const workedBeforeShift = Math.max(0, (Math.min(endTs, shiftStart.getTime()) - clockInTs) / 60000);
          const workedAfterShift = Math.max(0, (endTs - Math.max(clockInTs, shiftEnd.getTime())) / 60000);
          staff.unscheduledMins += (workedBeforeShift + workedAfterShift);
        } else {
          // Worked on an unscheduled day (e.g. weekend shift)
          staff.unscheduledMins += mins;
        }

        staff.totalPoints += Math.floor(mins / 30) * 2; // 2 points per 30 mins worked

        // Job segments (Vehicles & Customers)
        s.jobs?.forEach((j: any) => {
          const start = parseDate(j.start);
          const end = j.end ? parseDate(j.end) : Date.now();
          const segMins = Math.max(0, (end - start) / 60000);
          
          if (j.id && segMins > 0) {
            staff.actualJobMinutes += segMins;
            const jobDoc = rawData.jobs?.find(job => job.id === j.id);

            // Calculate efficiency
            if (jobDoc?.estimatedHours && totalTimePerJob[j.id] > 0) {
              const estMins = jobDoc.estimatedHours * 60;
              const proratedEarned = (segMins / totalTimePerJob[j.id]) * estMins;
              staff.earnedJobMinutes += proratedEarned;
            } else {
              // If no estimate, count as 100% efficient so it doesn't penalize them
              staff.earnedJobMinutes += segMins;
            }

            // Vehicles mapping
            const vehicleDoc = rawData.vehicles?.find(v => v.id === jobDoc?.vehicleId || (jobDoc?.vehicleVin && v.vin === jobDoc.vehicleVin));
            const vehicleName = vehicleDoc 
              ? `${vehicleDoc.year || ''} ${vehicleDoc.make || ''} ${vehicleDoc.model || ''}`.trim() 
              : (jobDoc?.vehicleTitle || 'General Job (No Vehicle)');
            
            if (vehicleName) {
              if (!staff.vehiclesWorkedOn[vehicleName]) {
                staff.vehiclesWorkedOn[vehicleName] = { count: 0, minutes: 0 };
              }
              staff.vehiclesWorkedOn[vehicleName].count++;
              staff.vehiclesWorkedOn[vehicleName].minutes += segMins;
            }

            // Customers mapping
            const customerDoc = rawData.customers?.find(c => c.id === jobDoc?.customerId);
            const customerName = customerDoc
              ? (customerDoc.name || customerDoc.displayName || customerDoc.CompanyName || customerDoc.FullName || '').trim()
              : (jobDoc?.customerName || 'Internal / Stock');

            if (customerName) {
              if (!staff.customersServiced[customerName]) {
                staff.customersServiced[customerName] = { count: 0, minutes: 0 };
              }
              staff.customersServiced[customerName].count++;
              staff.customersServiced[customerName].minutes += segMins;
            }
          }
        });

        // Add bonus points for high efficiency (Earned > Actual)
        if (staff.earnedJobMinutes > staff.actualJobMinutes && staff.actualJobMinutes > 60) {
            const extraHours = (staff.earnedJobMinutes - staff.actualJobMinutes) / 60;
            staff.totalPoints += Math.floor(extraHours * 5); // 5 bonus points per efficient hour
        }
      }
    });

    // Final Overtime Check for Weekly View (over 40 hours)
    if (timeframe === 'week') {
      staffMap.forEach(staff => {
        const fortyHoursInMins = 2400;
        if (staff.timeLogged > fortyHoursInMins) {
          // If weekly total > 40h, ensure we reflect that if it's more than the daily OT sum
          const weeklyOT = staff.timeLogged - fortyHoursInMins;
          if (weeklyOT > staff.overtimeMinutes) {
            staff.overtimeMinutes = weeklyOT;
          }
        }
      });
    }

    return Array.from(staffMap.values())
      .filter(s => s.totalPoints > 0 || timeframe === 'all')
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }, [rawData, timeframe, tick]);

  // Derive selected staff ID from URL parameter
  const selectedStaffId = useMemo(() => {
    if (!staffNameParam || stats.length === 0) return null;
    const found = stats.find(s => s.name.toLowerCase() === staffNameParam.toLowerCase());
    return found ? found.id : null;
  }, [staffNameParam, stats]);

  // Reset activity drawer when selection changes
  useEffect(() => {
    setShowActivity(false);
  }, [selectedStaffId]);

  const filteredStats = stats.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedStaff = selectedStaffId ? stats.find(s => s.id === selectedStaffId) : null;

  const topVehicles = useMemo(() => {
    if (!selectedStaff?.vehiclesWorkedOn) return [];
    return Object.entries(selectedStaff.vehiclesWorkedOn)
      .sort((a, b) => b[1].minutes - a[1].minutes)
      .slice(0, 5);
  }, [selectedStaff]);

  const topCustomers = useMemo(() => {
    if (!selectedStaff?.customersServiced) return [];
    return Object.entries(selectedStaff.customersServiced)
      .sort((a, b) => b[1].minutes - a[1].minutes)
      .slice(0, 5);
  }, [selectedStaff]);

  const completedTasksGrouped = useMemo(() => {
    if (!selectedStaff?.tasksCompletedByType) return [];
    return Object.entries(selectedStaff.tasksCompletedByType)
      .sort((a, b) => b[1] - a[1]);
  }, [selectedStaff]);

  const formatMinsToHoursMins = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const peerComparison = useMemo(() => {
    if (!selectedStaff || stats.length === 0) return null;

    // Filter peers (staff in the same department)
    const peers = stats.filter(s => s.department === selectedStaff.department);
    // If no peers in department, fall back to all staff
    const peerGroup = peers.length > 1 ? peers : stats;

    const getMetricStats = (getValue: (s: StaffStats) => number) => {
      const values = peerGroup.map(getValue).filter(v => !isNaN(v) && isFinite(v));
      if (values.length === 0) return { min: 0, max: 0, avg: 0 };
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      return { min, max, avg };
    };

    return {
      timeLogged: getMetricStats(s => s.timeLogged),
      bookTimeHours: getMetricStats(s => s.bookTimeHours),
      efficiency: getMetricStats(s => s.actualJobMinutes > 0 ? (s.earnedJobMinutes / s.actualJobMinutes) * 100 : 0),
      overtime: getMetricStats(s => s.overtimeMinutes),
      tardy: getMetricStats(s => s.lateCount),
      logistics: getMetricStats(s => s.moves + s.parts + s.shipments)
    };
  }, [selectedStaff, stats]);

  const renderComparison = (
    value: number, 
    peerStats: { min: number; max: number; avg: number } | null | undefined,
    formatVal: (v: number) => string
  ) => {
    if (!peerStats) return null;
    const avg = peerStats.avg;
    const isAboveAvg = value >= avg;
    
    return (
      <div className="mt-3.5 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[10px] text-zinc-500 font-bold space-y-1.5 font-sans">
        <div className="flex justify-between items-center text-[10px] text-zinc-400">
          <span>Peer Group Comparison (Same Dept)</span>
          <span className={cn(
            "font-black px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider",
            isAboveAvg 
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
              : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          )}>
            {isAboveAvg ? 'Above Avg' : 'Below Avg'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 bg-zinc-50 dark:bg-zinc-950 p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-center font-mono text-[9px]">
          <div>
            <span className="text-[8px] text-zinc-500 dark:text-zinc-400 block font-sans uppercase font-bold tracking-wider">Min</span>
            <span className="text-zinc-700 dark:text-zinc-300">{formatVal(peerStats.min)}</span>
          </div>
          <div className="border-x border-zinc-200 dark:border-zinc-800">
            <span className="text-[8px] text-indigo-500 block font-sans uppercase font-bold tracking-wider">Avg</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">{formatVal(peerStats.avg)}</span>
          </div>
          <div>
            <span className="text-[8px] text-zinc-500 dark:text-zinc-400 block font-sans uppercase font-bold tracking-wider">Max</span>
            <span className="text-zinc-700 dark:text-zinc-300">{formatVal(peerStats.max)}</span>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4 animate-pulse">
        <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center">
          <Trophy className="w-8 h-8 text-indigo-500 animate-bounce" />
        </div>
        <p className="text-zinc-500 font-bold tracking-widest uppercase text-xs">Calculating Staff Performance...</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-4 duration-500",
        isFullscreen ? "p-2 space-y-2 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar" : "space-y-8"
      )}
    >
      <Toaster position="top-right" richColors theme="system" closeButton />
      {isFullscreen && (
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 w-full relative z-10">
          <div className="mr-auto flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Staff Performance</span>
            <span className="text-[10px] font-bold text-zinc-500">• Updated {new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
          <button 
            onClick={toggleFullscreen}
            className="hidden sm:flex w-full sm:w-auto px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-lg transition-all items-center justify-center gap-2"
          >
            <Minimize className="w-4 h-4" />
            Exit Full Screen
          </button>
        </div>
      )}
      {/* Header & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 rounded-2xl">
            <Trophy className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              Staff Leaderboard
            </h2>
            <p className="text-sm text-zinc-500 mt-0.5">Performance tracking and operational contribution</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Filter staff..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none w-64 dark:text-white"
            />
          </div>

          <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            {(['day', 'week', 'month', 'all'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                  timeframe === tf 
                    ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm' 
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {!isFullscreen && (
            <button 
              onClick={toggleFullscreen}
              className="hidden sm:flex px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2 cursor-pointer h-10 shrink-0"
            >
              <Maximize className="w-4 h-4" />
              Full Screen
            </button>
          )}
        </div>
      </div>      {/* Leaderboard List - Expanded Collapsible Layout */}
      <div className="space-y-4">
        {filteredStats.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl p-12 text-center">
            <Zap className="w-12 h-12 text-zinc-200 dark:text-zinc-800 mx-auto mb-4" />
            <p className="text-zinc-500 font-medium">No activity recorded for this timeframe.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredStats.map((staff, i) => {
              const isExpanded = selectedStaffId === staff.id;
              return (
                <div 
                  key={staff.id}
                  className={cn(
                    "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:border-indigo-500/50 hover:shadow-md transition-all flex flex-col",
                    isExpanded && "ring-2 ring-indigo-500 border-transparent shadow-lg"
                  )}
                >
                  {/* Clickable Header Row */}
                  <div 
                    onClick={() => {
                      const newParams = new URLSearchParams(searchParams);
                      if (isExpanded) {
                        newParams.delete('staffName');
                      } else {
                        newParams.set('staffName', staff.name);
                      }
                      setSearchParams(newParams);
                    }}
                    className="p-4 flex items-center justify-between cursor-pointer group select-none"
                  >
                    <div className="flex items-center gap-5">
                      <div className="relative">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm",
                          i === 0 ? "bg-amber-500 text-white" :
                          i === 1 ? "bg-zinc-400 text-white" :
                          i === 2 ? "bg-orange-400 text-white" :
                          "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                        )}>
                          {i + 1}
                        </div>
                        {i < 3 && (
                          <div className="absolute -top-1.5 -right-1.5">
                            <Star className={cn("w-4 h-4 fill-current", i === 0 ? "text-amber-500" : i === 1 ? "text-zinc-400" : "text-orange-400")} />
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                          {staff.name}
                          {i === 0 && <span className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">MVP</span>}
                          {staff.overtimeMinutes > 0 && <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">Overtime</span>}
                          {staff.lateCount > 0 && canViewReports && <span className="text-[10px] bg-rose-500/10 text-rose-600 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">Lates: {staff.lateCount}</span>}
                        </h3>
                        <p className="text-xs text-zinc-500">{staff.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="hidden md:grid grid-cols-5 gap-6 text-center">
                        <div>
                          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Moves</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">{staff.moves}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Jobs</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">{staff.jobs}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Parts</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">{staff.parts}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Hours</p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">{(staff.timeLogged / 60).toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Efficiency</p>
                          <p className={cn("text-sm font-bold", 
                            staff.actualJobMinutes > 0 ? (
                              (staff.earnedJobMinutes / staff.actualJobMinutes) > 1.1 ? "text-emerald-500" :
                              (staff.earnedJobMinutes / staff.actualJobMinutes) < 0.9 ? "text-rose-500" :
                              "text-amber-500"
                            ) : "text-zinc-500"
                          )}>
                            {staff.actualJobMinutes > 0 ? Math.round((staff.earnedJobMinutes / staff.actualJobMinutes) * 100) + '%' : '--'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right min-w-[100px] flex items-center justify-end gap-4">
                        {canViewReports && (
                          <div className="text-right">
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-0.5">Score</p>
                            <p className="text-xl font-black text-zinc-900 dark:text-white italic">{staff.totalPoints}</p>
                          </div>
                        )}
                        <ChevronRight className={cn("w-5 h-5 text-zinc-300 transition-all duration-200", isExpanded ? "rotate-90 text-indigo-500" : "group-hover:translate-x-1")} />
                      </div>
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && selectedStaff && (
                    <div className="border-t border-zinc-200 dark:border-zinc-800 p-6 space-y-8 bg-zinc-50/50 dark:bg-zinc-950/20 rounded-b-2xl animate-in slide-in-from-top duration-300">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Left Column: Metrics Dashboard & Punctuality */}
                        <div className="space-y-8">
                          {/* Core Stats Dashboard */}
                          <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.25em]">Core Stats Dashboard</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                <Clock className="w-5 h-5 text-emerald-500 mb-2" />
                                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Time on Clock</p>
                                <p className="text-lg font-black text-zinc-900 dark:text-white italic">{formatMinsToHoursMins(selectedStaff.timeLogged)}</p>
                                {renderComparison(selectedStaff.timeLogged, peerComparison?.timeLogged, formatMinsToHoursMins)}
                              </div>
                              <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                <CheckCircle className="w-5 h-5 text-indigo-500 mb-2" />
                                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Book Time</p>
                                <p className="text-lg font-black text-zinc-900 dark:text-white italic">{selectedStaff.bookTimeHours.toFixed(1)}h</p>
                                {renderComparison(selectedStaff.bookTimeHours, peerComparison?.bookTimeHours, (v) => `${v.toFixed(1)}h`)}
                              </div>
                              <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                <Zap className="w-5 h-5 text-amber-500 mb-2" />
                                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Job Efficiency</p>
                                <p className="text-lg font-black text-zinc-900 dark:text-white italic">
                                  {selectedStaff.actualJobMinutes > 0 
                                    ? Math.round((selectedStaff.earnedJobMinutes / selectedStaff.actualJobMinutes) * 100) + '%'
                                    : '--'}
                                </p>
                                {selectedStaff.actualJobMinutes > 0 && renderComparison(
                                  (selectedStaff.earnedJobMinutes / selectedStaff.actualJobMinutes) * 100, 
                                  peerComparison?.efficiency, 
                                  (v) => `${Math.round(v)}%`
                                )}
                              </div>
                              <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                <Clock className="w-5 h-5 text-rose-500 mb-2" />
                                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Overtime</p>
                                <p className="text-lg font-black text-zinc-900 dark:text-white italic">{(selectedStaff.overtimeMinutes / 60).toFixed(1)}h</p>
                                {renderComparison(selectedStaff.overtimeMinutes, peerComparison?.overtime, (v) => `${(v / 60).toFixed(1)}h`)}
                              </div>
                            </div>
                          </div>

                          {/* Shift Punctuality & Unscheduled Work */}
                          <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.25em]">Shift Punctuality & Schedules</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                <Calendar className="w-5 h-5 text-teal-500 mb-2" />
                                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Time Early</p>
                                <p className="text-sm font-black text-zinc-800 dark:text-zinc-200">{formatMinsToHoursMins(selectedStaff.timeEarlyMins)}</p>
                              </div>
                              <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                <Play className="w-5 h-5 text-purple-500 mb-2" />
                                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Time Staying Late</p>
                                <p className="text-sm font-black text-zinc-800 dark:text-zinc-200">{formatMinsToHoursMins(selectedStaff.timeStayingLateMins)}</p>
                              </div>
                              <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                <AlertCircle className="w-5 h-5 text-amber-500 mb-2" />
                                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Tardy Count</p>
                                <p className="text-sm font-black text-zinc-800 dark:text-zinc-200">{selectedStaff.lateCount} times</p>
                                {renderComparison(selectedStaff.lateCount, peerComparison?.tardy, (v) => `${Math.round(v)}x`)}
                              </div>
                              <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                <Clock className="w-5 h-5 text-orange-500 mb-2" />
                                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Unscheduled Work</p>
                                <p className="text-sm font-black text-zinc-800 dark:text-zinc-200">{formatMinsToHoursMins(selectedStaff.unscheduledMins)}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right Column: Breakdown Lists & Logistics */}
                        <div className="space-y-6">
                          {/* Task Completed Breakdown */}
                          {completedTasksGrouped.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-450 uppercase tracking-[0.25em]">Tasks Completed By Department</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto pr-1 no-scrollbar">
                                {completedTasksGrouped.map(([type, count]) => (
                                  <div key={type} className="flex justify-between items-center bg-white dark:bg-zinc-900 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{type} Board</span>
                                    <span className="text-xs font-black bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 px-2 py-0.5 rounded-lg">{count} tasks</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}                           {/* Vehicles Worked On */}
                          {topVehicles.length > 0 && (
                            <div className="space-y-3 border-t border-zinc-200/60 dark:border-zinc-800/80 pt-6">
                              <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-400 uppercase tracking-[0.25em]">Top Vehicles Serviced</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto pr-1 no-scrollbar">
                                {topVehicles.map(([vehicleName, stats]) => (
                                  <div key={vehicleName} className="flex justify-between items-center bg-white dark:bg-zinc-900 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate max-w-[150px]">{vehicleName}</span>
                                    <div className="flex gap-2 items-center text-[10px] font-black text-zinc-500">
                                      <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md text-zinc-600 dark:text-zinc-400">{stats.count}x</span>
                                      <span className="text-indigo-600 dark:text-indigo-400">{formatMinsToHoursMins(stats.minutes)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}                           {/* Customers Serviced */}
                          {topCustomers.length > 0 && (
                            <div className="space-y-3 border-t border-zinc-200/60 dark:border-zinc-800/80 pt-6">
                              <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-400 uppercase tracking-[0.25em]">Top Customers Serviced</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto pr-1 no-scrollbar">
                                {topCustomers.map(([customerName, stats]) => (
                                  <div key={customerName} className="flex justify-between items-center bg-white dark:bg-zinc-900 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate max-w-[150px]">{customerName}</span>
                                    <div className="flex gap-2 items-center text-[10px] font-black text-zinc-500">
                                      <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md text-zinc-600 dark:text-zinc-400">{stats.count}x</span>
                                      <span className="text-indigo-600 dark:text-indigo-400">{formatMinsToHoursMins(stats.minutes)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}                           {/* Admin & Logistics Metrics */}
                          <div className="space-y-3 border-t border-zinc-200/60 dark:border-zinc-800/80 pt-6">
                            <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-400 uppercase tracking-[0.25em]">Admin & Logistics Actions</h4>
                            <div className="grid grid-cols-3 gap-2.5">
                              <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-center">
                                <p className="text-[16px] font-black text-zinc-900 dark:text-white italic">{selectedStaff.moves}</p>
                                <p className="text-[8px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mt-1">Moves</p>
                              </div>
                              <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-center">
                                <p className="text-[16px] font-black text-zinc-900 dark:text-white italic">{selectedStaff.parts}</p>
                                <p className="text-[8px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mt-1">Parts Request</p>
                              </div>
                              <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-center">
                                <p className="text-[16px] font-black text-zinc-900 dark:text-white italic">{selectedStaff.shipments}</p>
                                <p className="text-[8px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mt-1">Shipments</p>
                              </div>
                            </div>
                            {renderComparison(
                              selectedStaff.moves + selectedStaff.parts + selectedStaff.shipments, 
                              peerComparison?.logistics, 
                              (v) => Math.round(v).toString()
                            )}
                          </div>                           {/* Percentile Rank & Management Insight */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-200/60 dark:border-zinc-800/80 pt-6">
                            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl text-white shadow-xl shadow-indigo-500/10">
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80">Ranked Performance</p>
                                <p className="text-base font-black italic">Top {(stats.indexOf(selectedStaff) / stats.length * 100).toFixed(0)}% of Staff</p>
                              </div>
                              <ArrowUpRight className="w-5 h-5 opacity-50" />
                            </div>

                            {canViewReports && (
                              <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center">
                                <div className="flex items-center gap-2 mb-1">
                                  <Info className="w-3.5 h-3.5 text-zinc-400" />
                                  <h4 className="text-[8px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Management Insight</h4>
                                </div>
                                <p className="text-[10px] text-zinc-600 dark:text-zinc-400 leading-normal font-semibold">
                                  {selectedStaff.totalPoints > 100 
                                    ? `${selectedStaff.name} shows exceptional engagement. Consider for leadership roles.` 
                                    : `${selectedStaff.name} maintains steady output. Cross-department tasks can boost growth.`}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Collapsible Detailed Activity Timeline */}
                      {canViewReports && (
                        <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-zinc-900">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowActivity(!showActivity);
                            }}
                            className="w-full px-6 py-4 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/50 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50 transition-all font-sans"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200/50 dark:border-zinc-700/50">
                                <Activity className="w-4 h-4 text-indigo-500" />
                              </div>
                              <div className="text-left">
                                <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                  Detailed Activity History
                                </h4>
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">Click to view audit trail for {selectedStaff.name}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded uppercase tracking-wider">Live Audit</span>
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              </div>
                              <ChevronRight className={cn("w-4 h-4 text-zinc-400 transition-transform duration-200", showActivity && "rotate-90 text-indigo-500")} />
                            </div>
                          </button>
                          
                          {showActivity && (
                            <div className="border-t border-zinc-150 dark:border-zinc-800/80 animate-in slide-in-from-top duration-300 bg-zinc-50/30 dark:bg-zinc-950/10">
                              <StaffActivityTimeline tenantId={tenantId} staffName={selectedStaff.name} staffId={selectedStaff.id} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


function StaffActivityTimeline({ tenantId, staffName, staffId }: { tenantId: string, staffName: string, staffId: string }) {
  const [activities, setActivities] = useState<StaffActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Reusing the transform logic from ShopFloorActivity but with better filtering
  useMemo(() => {
    if (!tenantId || !staffName) return;
    setIsLoading(true);

    const sources = [
      { path: `businesses/${tenantId}/zone_assignments`, type: 'zone_move' },
      { path: `businesses/${tenantId}/jobs`, type: 'job' },
      { path: `businesses/${tenantId}/parts_requests`, type: 'parts' },
      { path: `businesses/${tenantId}/shipments`, type: 'shipment' },
      { path: `businesses/${tenantId}/time_sessions`, type: 'time_session' }
    ];

    const fetchAll = async () => {
      const results = await Promise.all(
        sources.map(async (source) => {
          try {
            const q = query(
              collection(db, source.path),
              orderBy(source.path.includes('time_sessions') ? 'clockIn.timestamp' : 'createdAt', 'desc'),
              limit(100)
            );
            const snap = await getDocs(q);
            return snap.docs.map(doc => {
              const data = doc.data();
              // Filter in memory for maximum flexibility (handling name/ID variations)
              const isMatch = 
                data.createdBy === staffId || 
                data.assignedBy === staffId || 
                data.userId === staffId ||
                data.createdByName === staffName || 
                data.assignedByName === staffName ||
                data.requestedBy === staffName ||
                data.userName === staffName;

              if (!isMatch) return null;

              return {
                id: doc.id,
                type: source.type,
                timestamp: data.createdAt || data.assignedAt || data.clockIn?.timestamp || data.updatedAt,
                title: source.type.replace('_', ' ').toUpperCase(),
                message: data.message || data.notes || data.title || data.partName || data.trackingNumber || 'Performed operational action',
                severity: 'info',
                author: staffName
              };
            }).filter(Boolean);
          } catch (e) {
            return [];
          }
        })
      );

      const merged = results.flat()
        .sort((a: any, b: any) => {
          const tsA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp).getTime();
          const tsB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp).getTime();
          return tsB - tsA;
        })
        .slice(0, 50);

      setActivities(merged as any[]);
      setIsLoading(false);
    };

    fetchAll();
  }, [tenantId, staffName, staffId]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'zone_move': return <Warehouse className="w-4 h-4" />;
      case 'time_session': return <Clock className="w-4 h-4" />;
      case 'job': return <Briefcase className="w-4 h-4" />;
      case 'parts': return <Package className="w-4 h-4" />;
      case 'shipment': return <Truck className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  if (isLoading) return <div className="p-12 text-center text-zinc-500 animate-pulse">Loading audit trail...</div>;

  return (
    <div className="p-8">
      {activities.length === 0 ? (
        <div className="text-center py-12">
          <Activity className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
          <p className="text-zinc-500">No audit records found for this staff member.</p>
        </div>
      ) : (
        <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-200 before:to-transparent dark:before:via-zinc-800">
          {activities.map((activity, i) => (
            <div key={activity.id} className="relative flex items-start gap-6 group animate-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-zinc-900 bg-indigo-50 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shrink-0 shadow-sm">
                {getIcon(activity.type)}
              </div>
              
              <div className="flex-1 pt-0.5">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-tight">{activity.title}</p>
                    <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded font-black uppercase">Confirmed</span>
                  </div>
                  <time className="text-[10px] font-mono font-bold text-zinc-400">
                    {activity.timestamp ? (
                      new Date(activity.timestamp?.toMillis ? activity.timestamp.toMillis() : activity.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    ) : '--:--'}
                  </time>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {activity.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StaffLink({ name, tenantId, staffId, className }: { name: string, tenantId: string, staffId?: string, className?: string }) {
  const { data: allStaff } = useQuery({
    queryKey: ['staff-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    },
    enabled: !staffId && !!tenantId,
  });

  if (!name || name === 'System') return <span className={className}>{name}</span>;

  // Try to resolve staffId by matching name
  let resolvedStaffId = staffId;
  if (!resolvedStaffId && allStaff && name) {
    const cleanName = name.trim().toLowerCase();
    const match = allStaff.find((s: any) => {
      if (s.isArchived) return false;
      const first = (s.firstName || '').trim().toLowerCase();
      const last = (s.lastName || '').trim().toLowerCase();
      const display = (s.displayName || '').trim().toLowerCase();
      const full = `${first} ${last}`.trim();
      return (
        cleanName === full ||
        cleanName === display ||
        cleanName === first ||
        cleanName === last
      );
    });
    if (match) {
      resolvedStaffId = match.id;
    }
  }

  const to = resolvedStaffId 
    ? `/business/${tenantId}/staff/${resolvedStaffId}`
    : `/business/${tenantId}/performance?staffName=${encodeURIComponent(name)}`;

  return (
    <Link 
      to={to}
      onClick={(e) => {
        e.stopPropagation();
      }}
      className={cn("hover:text-indigo-600 hover:underline transition-all cursor-pointer font-bold", className)}
    >
      {name}
    </Link>
  );
}
