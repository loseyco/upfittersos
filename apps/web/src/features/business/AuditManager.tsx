import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, collectionGroup, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import {
  Clock, Search, Printer, FileSpreadsheet, Download,
  ClipboardList, Package, AlertTriangle, AlertCircle,
  ChevronDown, Activity, Zap, Warehouse, Truck, RefreshCw,
  SlidersHorizontal, BookOpen, X, ShoppingCart
} from 'lucide-react';
import { useAuthStore } from '../../lib/auth/store';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { StaffLink } from './StaffPerformance';

type AuditTimeframe = 'this_week' | 'last_week' | 'today' | 'yesterday' | 'this_month' | 'custom';

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

interface AuditManagerProps {
  tenantId: string;
}

export function AuditManager({ tenantId }: AuditManagerProps) {
  const { isSuperAdmin, permissions } = useAuthStore();
  const canViewReports = isSuperAdmin || permissions['reports.view'];

  const [timeframe, setTimeframe] = useState<AuditTimeframe>('this_week');
  const [startDateStr, setStartDateStr] = useState<string>('');
  const [endDateStr, setEndDateStr] = useState<string>('');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [activeTab, setActiveTab] = useState<'overview' | 'staff' | 'jobs' | 'logistics'>('overview');
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState<boolean>(false);
  const [printReportType, setPrintReportType] = useState<'audit' | 'meeting'>('audit');

  // Fetch business settings
  const { data: business } = useQuery({
    queryKey: ['business', tenantId],
    queryFn: async () => {
      if (!tenantId || tenantId === 'GLOBAL') return null;
      const snap = await getDoc(doc(db, 'businesses', tenantId));
      return snap.exists() ? snap.data() : null;
    },
    enabled: !!tenantId && tenantId !== 'GLOBAL'
  });

  const thisWeekLabel = useMemo(() => {
    const weekEndDay = business?.payrollWeekEndDay !== undefined ? Number(business.payrollWeekEndDay) : 0;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const startDayName = days[(weekEndDay + 1) % 7];
    return `This Week (${startDayName}-Now)`;
  }, [business]);

  // Set default dates when timeframe changes
  useEffect(() => {
    let start = new Date();
    let end = new Date();

    const weekEndDay = business?.payrollWeekEndDay !== undefined ? Number(business.payrollWeekEndDay) : 0; // 0 = Sunday

    if (timeframe === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (timeframe === 'yesterday') {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (timeframe === 'this_week') {
      start = getPayrollWeekStart(start, weekEndDay);
      end.setHours(23, 59, 59, 999);
    } else if (timeframe === 'last_week') {
      const currentStart = getPayrollWeekStart(start, weekEndDay);
      start = new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      end = new Date(currentStart.getTime() - 1);
    } else if (timeframe === 'this_month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    if (timeframe !== 'custom') {
      setStartDateStr(start.toISOString().split('T')[0]);
      setEndDateStr(end.toISOString().split('T')[0]);
    }
  }, [timeframe, business]);

  // Query raw data from all relevant collections
  const { data: rawData, isLoading, refetch } = useQuery({
    queryKey: ['audit-data-raw', tenantId],
    queryFn: async () => {
      const collections = [
        { name: 'staff', dateField: 'createdAt' },
        { name: 'departments', dateField: 'createdAt' },
        { name: 'jobs', dateField: 'createdAt' },
        { name: 'time_sessions', dateField: 'clockIn.timestamp' },
        { name: 'parts_requests', dateField: 'createdAt' },
        { name: 'zone_assignments', dateField: 'assignedAt' },
        { name: 'shipments', dateField: 'createdAt' },
        { name: 'vehicles', dateField: 'createdAt' }
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
            console.warn(`Could not fetch ${col.name} for audit`, e);
            return { name: col.name, data: [] };
          }
        })
      );

      const dataMap = results.reduce((acc, curr) => ({ ...acc, [curr.name]: curr.data }), {} as Record<string, any[]>);

      // Fetch tasks via collectionGroup
      try {
        const tasksQuery = query(
          collectionGroup(db, 'tasks'),
          where('tenantId', '==', tenantId)
        );
        const tasksSnap = await getDocs(tasksQuery);
        const filteredDocs = tasksSnap.docs.filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`));
        dataMap.tasks = filteredDocs.map(doc => {
          const pathParts = doc.ref.path.split('/');
          const jobId = pathParts[3];
          return {
            id: doc.id,
            jobId,
            refPath: doc.ref.path,
            ...doc.data()
          };
        });
      } catch (e) {
        console.warn("Could not fetch tasks via collectionGroup for audit", e);
        dataMap.tasks = [];
      }

      return dataMap;
    },
    enabled: !!tenantId
  });

  // Calculate parsed dates
  const parsedDates = useMemo(() => {
    const start = startDateStr ? new Date(startDateStr + 'T00:00:00') : new Date(0);
    const end = endDateStr ? new Date(endDateStr + 'T23:59:59') : new Date();
    return { start, end };
  }, [startDateStr, endDateStr]);

  // Helper date parsing function
  const parseDate = (val: any): number => {
    if (!val) return 0;
    if (val.toMillis) return val.toMillis();
    if (val.seconds) return val.seconds * 1000;
    return new Date(val).getTime();
  };

  // Helper to deduct unpaid breaks and return duration in milliseconds
  const calculateSessionDuration = (session: any) => {
    if (!session.clockIn?.timestamp) return 0;
    const start = parseDate(session.clockIn.timestamp);
    const end = session.clockOut?.timestamp ? parseDate(session.clockOut.timestamp) : Date.now();
    
    const totalMs = Math.max(0, end - start);
    
    // Unpaid breaks
    const unpaidBreakMs = (session.breaks || []).reduce((acc: number, b: any) => {
      if (b.isPaid) return acc;
      const bStart = parseDate(b.start);
      const bEnd = b.end ? parseDate(b.end) : Date.now();
      return acc + Math.max(0, bEnd - bStart);
    }, 0);

    return Math.max(0, totalMs - unpaidBreakMs);
  };

  // Resolve active staff list helper
  const activeStaffOnly = useMemo(() => {
    if (!rawData) return [];
    return (rawData.staff || []).filter((s: any) => !s.isArchived && !s.fireDate);
  }, [rawData]);

  // Process and filter audit logs
  const auditData = useMemo(() => {
    if (!rawData) return null;

    const { start, end } = parsedDates;
    const startTimeMs = start.getTime();
    const endTimeMs = end.getTime();

    // 1. Resolve staff profiles
    const staffList = activeStaffOnly;
    const departments = rawData.departments || [];
    
    const staffMap = new Map<string, any>();
    staffList.forEach((s: any) => {
      const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.displayName || s.email || 'Unnamed Staff';
      const dept = departments.find((d: any) => d.id === s.departmentId);
      staffMap.set(s.id, {
        ...s,
        name,
        deptName: dept?.name || 'Unassigned',
        metrics: {
          clockedMins: 0,
          bookMins: 0,
          moves: 0,
          partsCount: 0,
          packagesCount: 0,
          anomaliesCount: 0,
          tasksCount: 0
        },
        timeSessions: [],
        activities: [],
        anomalies: []
      });
    });

    // Resolve schedule/lateness settings helper
    const checkTardiness = (session: any, staff: any) => {
      if (!session.clockIn?.timestamp) return null;
      const clockInTs = parseDate(session.clockIn.timestamp);
      const clockInDate = new Date(clockInTs);

      const dept = departments.find((d: any) => d.id === staff?.departmentId);
      const schedule = staff?.individualSchedule || dept?.defaultSchedule || {
        startTime: '08:00',
        endTime: '17:00',
        expectedHoursPerDay: 8,
        days: [1, 2, 3, 4, 5]
      };

      const dayOfWeek = clockInDate.getDay() || 7;
      const isScheduledDay = schedule.days?.includes(dayOfWeek);

      const clockInMin = clockInDate.getHours() * 60 + clockInDate.getMinutes();
      const [schedHour, schedMin] = (schedule.startTime || '08:00').split(':').map(Number);
      const schStartMin = schedHour * 60 + schedMin;

      const diffInMin = clockInMin - schStartMin;

      if (isScheduledDay && diffInMin > 5) {
        return {
          type: 'late_in',
          message: `Clocked in late by ${diffInMin} minutes (Scheduled: ${schedule.startTime})`,
          severity: 'warning' as const
        };
      }
      return null;
    };

    // Resolve helper to find staff record in staffMap by checking either stRecord.id or stRecord.userId
    const getStaffFromMap = (uid: string) => {
      if (!uid) return null;
      let staff = staffMap.get(uid);
      if (staff) return staff;
      const stRecord = activeStaffOnly.find((st: any) => st.id === uid || st.userId === uid);
      if (stRecord) {
        return staffMap.get(stRecord.id);
      }
      return null;
    };

    // 2. Filter time clock sessions
    const timeSessions = (rawData.time_sessions || []).filter((s: any) => {
      const clockInTime = parseDate(s.clockIn?.timestamp);
      return clockInTime >= startTimeMs && clockInTime <= endTimeMs;
    });

    // Populate time sessions inside staff Map
    timeSessions.forEach((s: any) => {
      const staff = getStaffFromMap(s.userId);
      if (staff) {
        const durationMins = calculateSessionDuration(s) / 60000;
        staff.metrics.clockedMins += durationMins;
        staff.timeSessions.push(s);

        // Compute lates / anomalies
        const lateAnomaly = checkTardiness(s, staff);
        if (lateAnomaly) {
          staff.anomalies.push({
            date: new Date(parseDate(s.clockIn.timestamp)),
            ...lateAnomaly
          });
          staff.metrics.anomaliesCount++;
        }

        // Long shift check
        const durationHrs = durationMins / 60;
        if (durationHrs > 15) {
          staff.anomalies.push({
            date: new Date(parseDate(s.clockIn.timestamp)),
            type: 'long_shift',
            message: `Long Shift: ${durationHrs.toFixed(1)} hours worked`,
            severity: 'warning' as const
          });
          staff.metrics.anomaliesCount++;
        }

        // Clocked task counts
        if (s.jobs && s.jobs.length > 0) {
          staff.metrics.tasksCount += s.jobs.length;
          s.jobs.forEach((j: any) => {
            if (j.bookTime) {
              staff.metrics.bookMins += j.bookTime * 60;
            }
            const jobTime = parseDate(j.start);
            staff.activities.push({
              id: `${s.id}-task-${j.id}`,
              type: 'job_task',
              timestamp: new Date(jobTime),
              title: `Worked Job Task`,
              message: `Clocked into Job "${j.name}"${j.taskName ? ` - Task "${j.taskName}"` : ''} for ${Math.round(calculateSessionDuration({ clockIn: { timestamp: j.start }, clockOut: { timestamp: j.end } }) / 60000)} minutes`,
              severity: 'success',
              jobId: j.id,
              jobName: j.name,
              taskName: j.taskName
            });
          });
        }

        // Time clock activity
        staff.activities.push({
          id: `${s.id}-clockin`,
          type: 'time_session',
          timestamp: new Date(parseDate(s.clockIn.timestamp)),
          title: `Clocked In`,
          message: `Clocked in ${s.isRemote ? 'Remotely' : 'On-Site'} at ${s.clockIn.location || 'Main Office'}`,
          severity: 'info'
        });

        if (s.clockOut?.timestamp) {
          staff.activities.push({
            id: `${s.id}-clockout`,
            type: 'time_session',
            timestamp: new Date(parseDate(s.clockOut.timestamp)),
            title: `Clocked Out`,
            message: `Clocked out at ${s.clockOut.location || 'Main Office'} (Duration: ${durationHrs.toFixed(1)}h)`,
            severity: 'info'
          });
        }
      }
    });

    // 3. Filter Vehicle movements
    const zoneAssignments = (rawData.zone_assignments || []).filter((a: any) => {
      const assignedTime = parseDate(a.assignedAt);
      return assignedTime >= startTimeMs && assignedTime <= endTimeMs;
    });

    zoneAssignments.forEach((a: any) => {
      const staff = getStaffFromMap(a.assignedBy);
      if (staff) {
        staff.metrics.moves++;
        staff.activities.push({
          id: a.id,
          type: 'zone_move',
          timestamp: new Date(parseDate(a.assignedAt)),
          title: 'Moved Vehicle',
          message: `Moved vehicle "${a.vehicleName || 'Vehicle'}" to zone/bay "${a.zoneName || 'Bay'}"`,
          severity: 'info'
        });
      }
    });

    // 4. Filter parts requests
    const partsRequests = (rawData.parts_requests || []).filter((p: any) => {
      const createdTime = parseDate(p.createdAt);
      return createdTime >= startTimeMs && createdTime <= endTimeMs;
    });

    partsRequests.forEach((p: any) => {
      const staff = getStaffFromMap(p.createdBy);
      if (staff) {
        staff.metrics.partsCount++;
        staff.activities.push({
          id: p.id,
          type: 'parts',
          timestamp: new Date(parseDate(p.createdAt)),
          title: 'Parts Requested',
          message: `Requested part "${p.partName || 'Part'}" for Job "${p.jobName || 'Job'}" (Qty: ${p.qty || 1})`,
          severity: 'warning'
        });
      }
    });

    // 5. Filter Shipments (packages received)
    const shipments = (rawData.shipments || []).filter((s: any) => {
      const createdTime = parseDate(s.createdAt);
      return createdTime >= startTimeMs && createdTime <= endTimeMs;
    });

    shipments.forEach((s: any) => {
      const staff = getStaffFromMap(s.createdBy);
      if (staff) {
        staff.metrics.packagesCount++;
        staff.activities.push({
          id: s.id,
          type: 'shipment',
          timestamp: new Date(parseDate(s.createdAt)),
          title: 'Received Package',
          message: `Logged intake package tracking "${s.trackingNumber || 'N/A'}" from ${s.carrier || 'Carrier'}`,
          severity: 'info'
        });
      }
    });

    // Sort timelines for each staff member
    staffMap.forEach((staff) => {
      staff.activities.sort((a: any, b: any) => b.timestamp.getTime() - a.timestamp.getTime());
    });

    // 6. Filter Jobs worked or created in range
    const jobs = (rawData.jobs || []).map((j: any) => {
      // Find time logged on this job
      let jobLoggedMins = 0;
      const jobTechs = new Set<string>();

      timeSessions.forEach((ts: any) => {
        ts.jobs?.forEach((jobSeg: any) => {
          if (jobSeg.id === j.id) {
            const start = parseDate(jobSeg.start);
            const end = jobSeg.end ? parseDate(jobSeg.end) : Date.now();
            jobLoggedMins += Math.max(0, end - start) / 60000;
            const staff = getStaffFromMap(ts.userId);
            if (staff) {
              jobTechs.add(staff.name);
            }
          }
        });
      });

      const associatedParts = partsRequests.filter((pr: any) => pr.jobId === j.id);

      return {
        ...j,
        loggedHours: jobLoggedMins / 60,
        technicians: Array.from(jobTechs),
        partsCount: associatedParts.length,
        parts: associatedParts
      };
    }).filter((j: any) => {
      const createTime = parseDate(j.createdAt);
      const hasActivity = j.loggedHours > 0 || createTime >= startTimeMs && createTime <= endTimeMs;
      return hasActivity;
    });

    return {
      staff: Array.from(staffMap.values()),
      jobs,
      partsRequests,
      shipments,
      zoneAssignments,
      timeSessions
    };
  }, [rawData, parsedDates, activeStaffOnly]);

  // Apply filters (department, staff search) to staff and jobs list
  const filteredData = useMemo(() => {
    if (!auditData) return null;

    let filteredStaff = auditData.staff;
    
    // Filter department
    if (selectedDeptId !== 'all') {
      filteredStaff = filteredStaff.filter(s => s.departmentId === selectedDeptId);
    }

    // Filter staff selection
    if (selectedStaffId !== 'all') {
      filteredStaff = filteredStaff.filter(s => s.id === selectedStaffId);
    }

    // Filter search text (staff name or email)
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filteredStaff = filteredStaff.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      );
    }

    // Filter jobs
    let filteredJobs = auditData.jobs;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filteredJobs = filteredJobs.filter(j =>
        (j.name || '').toLowerCase().includes(q) ||
        (j.customerName || j.customer?.name || '').toLowerCase().includes(q) ||
        (j.id || '').toLowerCase().includes(q)
      );
    }

    return {
      ...auditData,
      staff: filteredStaff,
      jobs: filteredJobs
    };
  }, [auditData, selectedDeptId, selectedStaffId, searchQuery]);

  // Aggregate high-level stats for selected scope
  const summaryStats = useMemo(() => {
    if (!filteredData) return null;

    let totalClockedMins = 0;
    let totalBookMins = 0;
    let totalMoves = 0;
    let totalParts = 0;
    let totalPackages = 0;
    let totalAnomalies = 0;

    filteredData.staff.forEach((s) => {
      totalClockedMins += s.metrics.clockedMins;
      totalBookMins += s.metrics.bookMins;
      totalMoves += s.metrics.moves;
      totalParts += s.metrics.partsCount;
      totalPackages += s.metrics.packagesCount;
      totalAnomalies += s.metrics.anomaliesCount;
    });

    const clockedHours = totalClockedMins / 60;
    const bookHours = totalBookMins / 60;
    const efficiency = clockedHours > 0 ? (bookHours / clockedHours) * 100 : 0;

    // Build trend chart data (activities per day)
    const { start, end } = parsedDates;
    const dayMap = new Map<string, number>();
    
    // Initialize day map
    const temp = new Date(start);
    while (temp <= end) {
      const dateStr = temp.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
      dayMap.set(dateStr, 0);
      temp.setDate(temp.getDate() + 1);
    }

    // Count activities
    filteredData.staff.forEach(s => {
      s.activities.forEach((act: any) => {
        const dateStr = act.timestamp.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
        if (dayMap.has(dateStr)) {
          dayMap.set(dateStr, dayMap.get(dateStr)! + 1);
        }
      });
    });

    const chartData = Array.from(dayMap.entries()).map(([label, value]) => ({ label, value }));

    return {
      clockedHours,
      bookHours,
      efficiency,
      moves: totalMoves,
      parts: totalParts,
      packages: totalPackages,
      anomalies: totalAnomalies,
      chartData
    };
  }, [filteredData, parsedDates]);

  // Group jobs by department
  const jobsByDepartment = useMemo(() => {
    if (!filteredData || !rawData) return [];
    const depts = rawData.departments || [];
    const jobs = filteredData.jobs || [];
    const tasks = rawData.tasks || [];
    const timeSessions = filteredData.timeSessions || [];

    const staffNameMap = new Map<string, string>();
    filteredData.staff?.forEach((s: any) => {
      staffNameMap.set(s.id, s.name);
    });

    const groups: { department: { id: string; name: string }; jobs: any[] }[] = [];

    depts.forEach((dept: any) => {
      // Find jobs that have tasks assigned to this department, OR have no tasks but are assigned to this department
      const deptJobsRaw = jobs.filter((j: any) => {
        const jobTasks = tasks.filter((t: any) => t.jobId === j.id);
        if (jobTasks.length > 0) {
          return jobTasks.some((t: any) => t.departmentId === dept.id);
        }
        return j.departmentIds?.includes(dept.id);
      });

      const deptJobsMapped = deptJobsRaw.map((j: any) => {
        const jobTasks = tasks.filter((t: any) => t.jobId === j.id);
        const jobDeptTasks = jobTasks.filter((t: any) => t.departmentId === dept.id);

        if (jobTasks.length === 0) {
          // Fallback to overall job metrics if no tasks exist
          return { ...j };
        }

        // Only sum metrics for tasks assigned to this department
        const estimatedHours = jobDeptTasks.reduce((sum: number, t: any) => sum + (parseFloat(t.bookTime) || 0), 0);

        let jobLoggedMins = 0;
        const jobTechs = new Set<string>();
        const jobDeptTaskIds = new Set(jobDeptTasks.map((t: any) => t.id));

        timeSessions.forEach((ts: any) => {
          ts.jobs?.forEach((jobSeg: any) => {
            if (jobSeg.id === j.id && jobSeg.taskId && jobDeptTaskIds.has(jobSeg.taskId)) {
              const start = parseDate(jobSeg.start);
              const end = jobSeg.end ? parseDate(jobSeg.end) : Date.now();
              jobLoggedMins += Math.max(0, end - start) / 60000;
              const name = staffNameMap.get(ts.userId);
              if (name) {
                jobTechs.add(name);
              }
            }
          });
        });

        const associatedParts = (filteredData.partsRequests || []).filter(
          (pr: any) => pr.jobId === j.id && pr.taskId && jobDeptTaskIds.has(pr.taskId)
        );

        return {
          ...j,
          estimatedHours,
          loggedHours: jobLoggedMins / 60,
          technicians: Array.from(jobTechs),
          partsCount: associatedParts.length,
          parts: associatedParts
        };
      });

      // Filter out jobs that ended up with 0 logged hours and no department tasks in timeframe
      const activeDeptJobs = deptJobsMapped.filter((j: any) => {
        const hasTasks = tasks.some((t: any) => t.jobId === j.id && t.departmentId === dept.id);
        return hasTasks || j.loggedHours > 0;
      });

      if (activeDeptJobs.length > 0) {
        groups.push({ department: { id: dept.id, name: dept.name }, jobs: activeDeptJobs });
      }
    });

    // Unassigned / General Jobs
    const unassignedJobsRaw = jobs.filter((j: any) => {
      const jobTasks = tasks.filter((t: any) => t.jobId === j.id);
      if (jobTasks.length === 0) {
        return !j.departmentIds || j.departmentIds.length === 0;
      }
      return jobTasks.some((t: any) => !t.departmentId || !depts.some((d: any) => d.id === t.departmentId));
    });

    const unassignedJobsMapped = unassignedJobsRaw.map((j: any) => {
      const jobTasks = tasks.filter((t: any) => t.jobId === j.id);
      const jobDeptTasks = jobTasks.filter((t: any) => !t.departmentId || !depts.some((d: any) => d.id === t.departmentId));

      if (jobTasks.length === 0) {
        return { ...j };
      }

      const estimatedHours = jobDeptTasks.reduce((sum: number, t: any) => sum + (parseFloat(t.bookTime) || 0), 0);

      let jobLoggedMins = 0;
      const jobTechs = new Set<string>();
      const jobDeptTaskIds = new Set(jobDeptTasks.map((t: any) => t.id));

      timeSessions.forEach((ts: any) => {
        ts.jobs?.forEach((jobSeg: any) => {
          if (jobSeg.id === j.id) {
            // General clock-ins (no taskId) or clock-ins to unassigned tasks
            const isUnassigned = !jobSeg.taskId || jobSeg.taskId === 'none' || jobDeptTaskIds.has(jobSeg.taskId);
            if (isUnassigned) {
              const start = parseDate(jobSeg.start);
              const end = jobSeg.end ? parseDate(jobSeg.end) : Date.now();
              jobLoggedMins += Math.max(0, end - start) / 60000;
              const name = staffNameMap.get(ts.userId);
              if (name) {
                jobTechs.add(name);
              }
            }
          }
        });
      });

      const associatedParts = (filteredData.partsRequests || []).filter(
        (pr: any) => pr.jobId === j.id && (!pr.taskId || pr.taskId === 'none' || jobDeptTaskIds.has(pr.taskId))
      );

      return {
        ...j,
        estimatedHours,
        loggedHours: jobLoggedMins / 60,
        technicians: Array.from(jobTechs),
        partsCount: associatedParts.length,
        parts: associatedParts
      };
    });

    const activeUnassignedJobs = unassignedJobsMapped.filter((j: any) => {
      const jobTasks = tasks.filter((t: any) => t.jobId === j.id);
      const hasUnassignedTasks = jobTasks.some((t: any) => !t.departmentId || !depts.some((d: any) => d.id === t.departmentId));
      return hasUnassignedTasks || jobTasks.length === 0 || j.loggedHours > 0;
    });

    if (activeUnassignedJobs.length > 0) {
      groups.push({
        department: { id: 'unassigned', name: 'Unassigned / General' },
        jobs: activeUnassignedJobs
      });
    }

    return groups;
  }, [filteredData, rawData]);

  // Aggregate Logistics statistics
  const logisticsStats = useMemo(() => {
    if (!filteredData) return null;
    const parts = filteredData.partsRequests || [];
    const shipments = filteredData.shipments || [];

    const totalParts = parts.length;
    const pendingParts = parts.filter((p: any) => p.status === 'pending' || !p.status).length;
    const orderedParts = parts.filter((p: any) => p.status === 'ordered').length;
    const receivedParts = parts.filter((p: any) => p.status === 'received').length;

    const totalShipments = shipments.length;
    const carrierCounts: Record<string, number> = {};
    shipments.forEach((s: any) => {
      const c = (s.carrier || 'Other').trim().toUpperCase();
      carrierCounts[c] = (carrierCounts[c] || 0) + 1;
    });

    return {
      totalParts,
      pendingParts,
      orderedParts,
      receivedParts,
      totalShipments,
      carrierCounts
    };
  }, [filteredData]);

  // Active Blockers list
  const activeBlockersList = useMemo(() => {
    if (!rawData) return [];
    const jobs = rawData.jobs || [];
    return jobs.filter((j: any) => {
      const isActive = j.status?.toLowerCase() !== 'completed' && j.status?.toLowerCase() !== 'delivered';
      if (!isActive) return false;
      const isBlocked = j.status?.toLowerCase() === 'blocked' || 
                        (j.blockers || []).some((b: any) => b.status === 'active') || 
                        j.isBlocked;
      return isBlocked;
    });
  }, [rawData]);

  // Missing Parts on active jobs
  const missingPartsList = useMemo(() => {
    if (!rawData) return [];
    const parts = rawData.parts_requests || [];
    const jobs = rawData.jobs || [];

    return parts.filter((p: any) => {
      const isMissing = p.status === 'pending' || p.status === 'ordered' || !p.status;
      if (!isMissing) return false;

      // Check if job is active (not completed)
      const job = jobs.find((j: any) => j.id === p.jobId);
      const isJobActive = job && job.status?.toLowerCase() !== 'completed' && job.status?.toLowerCase() !== 'delivered';
      return isJobActive;
    });
  }, [rawData]);

  // Get current vehicle zone name helper
  const getVehicleZone = (vin: string) => {
    const assignments = rawData?.zone_assignments || [];
    const vehicleAssignments = assignments.filter((a: any) => a.vehicleVin === vin || a.vehicleId === vin);
    if (vehicleAssignments.length === 0) return 'No Bay Assigned';
    const latest = [...vehicleAssignments].sort((a: any, b: any) => parseDate(b.assignedAt) - parseDate(a.assignedAt))[0];
    return latest.zoneName || 'No Bay Assigned';
  };

  // Idle Onsite Vehicles (Zero work hours logged since arrival)
  const idleOnsiteVehicles = useMemo(() => {
    if (!rawData) return [];
    const vehicles = rawData.vehicles || [];
    const jobs = rawData.jobs || [];
    const timeSessions = rawData.time_sessions || [];

    return vehicles.filter((v: any) => {
      const isOnsite = v.arrivedAt && !v.departedAt && !v.isWithCustomer;
      if (!isOnsite) return false;

      const arrivalTime = parseDate(v.arrivedAt);

      // Find jobs linked to this vehicle
      const linkedJobs = jobs.filter((j: any) => j.vehicleId === v.vin || j.vehicleId === v.id);

      // Check if there are any time sessions for these jobs since the vehicle arrived
      let totalMins = 0;
      linkedJobs.forEach((j: any) => {
        timeSessions.forEach((ts: any) => {
          ts.jobs?.forEach((js: any) => {
            if (js.id === j.id) {
              const startTs = parseDate(js.start);
              if (startTs >= arrivalTime) {
                const endTs = js.end ? parseDate(js.end) : Date.now();
                totalMins += Math.max(0, endTs - startTs) / 60000;
              }
            }
          });
        });
      });

      return totalMins === 0;
    }).map((v: any) => ({
      ...v,
      currentZone: getVehicleZone(v.vin)
    }));
  }, [rawData]);

  // ==========================================
  // Prefilled Data Mappings for Weekly Meeting Notes
  // ==========================================

  // Service Department identification & filtering
  const serviceDept = useMemo(() => {
    return rawData?.departments?.find((d: any) => d.name?.toLowerCase() === 'service');
  }, [rawData]);

  const getJobTotalHours = (jobId: string) => {
    const sessions = rawData?.time_sessions || [];
    let mins = 0;
    sessions.forEach((s: any) => {
      s.jobs?.forEach((js: any) => {
        if (js.id === jobId) {
          const start = parseDate(js.start);
          const end = js.end ? parseDate(js.end) : Date.now();
          mins += Math.max(0, end - start) / 60000;
        }
      });
    });
    return mins / 60;
  };

  const serviceJobs = useMemo(() => {
    if (!rawData) return [];
    const jobs = rawData.jobs || [];
    if (!serviceDept) return [];
    return jobs.filter((j: any) => j.departmentIds?.includes(serviceDept.id));
  }, [rawData, serviceDept]);

  const buildJobs = useMemo(() => {
    if (!rawData) return [];
    const jobs = rawData.jobs || [];
    if (!serviceDept) return jobs;
    return jobs.filter((j: any) => !j.departmentIds?.includes(serviceDept.id));
  }, [rawData, serviceDept]);

  // Sales Pipeline and Open Orders are left blank per user instructions
  const leadsData = useMemo(() => [], []);
  const prospectingData = useMemo(() => [], []);
  const waitingApprovalData = useMemo(() => [], []);
  const approvedData = useMemo(() => [], []);
  const openOrders1to30 = useMemo(() => [], []);
  const openOrders31to60 = useMemo(() => [], []);

  // Service Work mappings
  const serviceWorkInProgress = useMemo(() => {
    const vehicles = rawData?.vehicles || [];
    return serviceJobs.filter((j: any) => {
      const v = vehicles.find((veh: any) => veh.vin === j.vehicleId || veh.id === j.vehicleId);
      const isOnsite = v && v.arrivedAt && !v.departedAt;
      return isOnsite && getJobTotalHours(j.id) > 0;
    }).map((j: any) => `#${j.jobNumber || ''} - ${j.name || j.title} (${j.customerName || 'Walk-in'}) - ${getJobTotalHours(j.id).toFixed(1)}h logged`);
  }, [serviceJobs, rawData]);

  const serviceWorkNeedToStart = useMemo(() => {
    const vehicles = rawData?.vehicles || [];
    return serviceJobs.filter((j: any) => {
      const v = vehicles.find((veh: any) => veh.vin === j.vehicleId || veh.id === j.vehicleId);
      const isOnsite = v && v.arrivedAt && !v.departedAt;
      return isOnsite && getJobTotalHours(j.id) === 0;
    }).map((j: any) => `#${j.jobNumber || ''} - ${j.name || j.title} (${j.customerName || 'Walk-in'})`);
  }, [serviceJobs, rawData]);

  const serviceWorkIncoming = useMemo(() => {
    const vehicles = rawData?.vehicles || [];
    return serviceJobs.filter((j: any) => {
      const v = vehicles.find((veh: any) => veh.vin === j.vehicleId || veh.id === j.vehicleId);
      const isOnsite = v && v.arrivedAt && !v.departedAt;
      const hasSchedule = j.scheduledStartDate || j.scheduledArrivalTime;
      return !isOnsite && hasSchedule;
    }).map((j: any) => {
      const start = j.scheduledStartDate || j.scheduledArrivalTime;
      const dateStr = start ? new Date(parseDate(start)).toLocaleDateString() : 'TBD';
      return `#${j.jobNumber || ''} - ${j.name || j.title} (${j.customerName || 'Walk-in'}) - ETA: ${dateStr}`;
    });
  }, [serviceJobs, rawData]);

  const serviceWorkNeedToSchedule = useMemo(() => {
    if (!rawData) return [];
    const jobs = rawData.jobs || [];
    const vehicles = rawData.vehicles || [];

    // Onsite but no start date set for schedule
    return jobs.filter((j: any) => {
      const v = vehicles.find((veh: any) => veh.vin === j.vehicleId || veh.id === j.vehicleId);
      const isOnsite = v && v.arrivedAt && !v.departedAt;
      const hasSchedule = j.scheduledStartDate;
      return isOnsite && !hasSchedule;
    }).map((j: any) => {
      const isService = serviceDept && j.departmentIds?.includes(serviceDept.id);
      return `#${j.jobNumber || ''} - ${j.name || j.title} (${j.customerName || 'Walk-in'})${isService ? ' [Service]' : ' [Build]'}`;
    });
  }, [rawData, serviceDept]);

  // Build Schedule mappings
  const buildScheduleInShop = useMemo(() => {
    const vehicles = rawData?.vehicles || [];
    return buildJobs.filter((j: any) => {
      const v = vehicles.find((veh: any) => veh.vin === j.vehicleId || veh.id === j.vehicleId);
      return v && v.arrivedAt && !v.departedAt;
    }).map((j: any) => {
      const end = j.scheduledEndDate || j.expectedFinishTime;
      const dateStr = end ? new Date(parseDate(end)).toLocaleDateString() : 'TBD';
      const hours = getJobTotalHours(j.id);
      return `#${j.jobNumber || ''} - ${j.name || j.title} (${j.customerName || 'Walk-in'}) - Comp: ${dateStr} (${hours.toFixed(1)}h logged)`;
    });
  }, [buildJobs, rawData]);

  const buildScheduleIncoming = useMemo(() => {
    const vehicles = rawData?.vehicles || [];
    return buildJobs.filter((j: any) => {
      const v = vehicles.find((veh: any) => veh.vin === j.vehicleId || veh.id === j.vehicleId);
      const isOnsite = v && v.arrivedAt && !v.departedAt;
      const hasSchedule = j.scheduledStartDate || j.scheduledArrivalTime;
      return !isOnsite && hasSchedule;
    }).map((j: any) => {
      const start = j.scheduledStartDate || j.scheduledArrivalTime;
      const dateStr = start ? new Date(parseDate(start)).toLocaleDateString() : 'TBD';
      return `#${j.jobNumber || ''} - ${j.name || j.title} (${j.customerName || 'Walk-in'}) - ETA: ${dateStr}`;
    });
  }, [buildJobs, rawData]);

  // Orders mappings
  const ordersNeededForJobs = useMemo(() => {
    if (!rawData) return [];
    const parts = rawData.parts_requests || [];
    const jobs = rawData.jobs || [];

    // Needed for active builds (work has started / loggedHours > 0)
    return parts.filter((p: any) => {
      const isMissing = p.status === 'pending' || p.status === 'ordered' || !p.status;
      if (!isMissing) return false;

      const job = jobs.find((j: any) => j.id === p.jobId);
      if (!job) return false;

      return getJobTotalHours(job.id) > 0 && job.status?.toLowerCase() !== 'completed';
    }).map((p: any) => {
      const job = jobs.find((j: any) => j.id === p.jobId);
      const jNum = job ? `#${job.jobNumber || ''} - ` : '';
      return `${jNum}${p.partName} (Qty: ${p.qty || 1}) for Job "${p.jobName || 'Job'}"`;
    });
  }, [rawData]);

  const ordersNeededUpcoming = useMemo(() => {
    if (!rawData) return [];
    const parts = rawData.parts_requests || [];
    const jobs = rawData.jobs || [];

    // Needed for upcoming builds (work has not started / loggedHours === 0)
    return parts.filter((p: any) => {
      const isMissing = p.status === 'pending' || p.status === 'ordered' || !p.status;
      if (!isMissing) return false;

      const job = jobs.find((j: any) => j.id === p.jobId);
      if (!job) return false;

      return getJobTotalHours(job.id) === 0 && job.status?.toLowerCase() !== 'completed';
    }).map((p: any) => {
      const job = jobs.find((j: any) => j.id === p.jobId);
      const jNum = job ? `#${job.jobNumber || ''} - ` : '';
      return `${jNum}${p.partName} (Qty: ${p.qty || 1}) for upcoming "${p.jobName || 'Job'}"`;
    });
  }, [rawData]);

  const ordersRestock = useMemo(() => [], []);

  // Render items helper for the print template
  const renderMeetingItems = (dataList: string[], minItems: number) => {
    const items = [];
    const max = Math.max(dataList.length, minItems);
    for (let i = 0; i < max; i++) {
      items.push(
        <div key={i} className="flex items-center gap-2 pl-8 py-1.5 text-xs text-black font-semibold">
          <span className="text-[7px] text-black shrink-0">■</span>
          <span className="w-5 shrink-0 text-right pr-1">{i + 1}.</span>
          {dataList[i] ? (
            <span className="text-black font-bold truncate flex-1 border-b border-zinc-150 border-dashed pb-0.5">{dataList[i]}</span>
          ) : (
            <span className="flex-1 border-b border-zinc-200 border-dashed h-4"></span>
          )}
        </div>
      );
    }
    return <div className="space-y-0.5">{items}</div>;
  };

  const MajorBullet = ({ title }: { title: string }) => {
    return (
      <div className="flex items-center gap-2 text-sm text-black font-black uppercase tracking-wider mt-4">
        <span className="text-lg leading-none select-none">•</span>
        <span>{title}</span>
      </div>
    );
  };

  const SubBullet = ({ title }: { title: string }) => {
    return (
      <div className="flex items-center gap-2 pl-4 text-xs text-zinc-800 font-bold mt-2">
        <span className="text-sm font-normal select-none">o</span>
        <span>{title}</span>
      </div>
    );
  };

  // Export payroll and hours CSV
  const handleExportPayrollCSV = () => {
    if (!filteredData) return;

    const headers = [
      'Staff Name',
      'Department',
      'Total Clocked Hours',
      'Total Book Hours Earned',
      'Efficiency %',
      'Vehicle Movements',
      'Parts Requests',
      'Packages Received',
      'Anomalies Flagged'
    ];

    const rows = filteredData.staff.map((s) => [
      s.name,
      s.deptName,
      (s.metrics.clockedMins / 60).toFixed(2),
      (s.metrics.bookMins / 60).toFixed(2),
      s.metrics.clockedMins > 0 ? ((s.metrics.bookMins / s.metrics.clockedMins) * 100).toFixed(0) + '%' : '0%',
      s.metrics.moves,
      s.metrics.partsCount,
      s.metrics.packagesCount,
      s.metrics.anomaliesCount
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.map((cell: any) => `"${cell}"`).join(','))].join('\n');
    downloadFile(csvContent, `UpfittersOS_Payroll_Audit_${startDateStr}_to_${endDateStr}.csv`, 'text/csv');
  };

  // Export comprehensive activity log CSV
  const handleExportActivityCSV = () => {
    if (!filteredData) return;

    const headers = ['Timestamp', 'Staff Name', 'Department', 'Activity Type', 'Title', 'Details'];
    const rows: any[] = [];

    filteredData.staff.forEach((s) => {
      s.activities.forEach((act: any) => {
        rows.push([
          act.timestamp.toISOString(),
          s.name,
          s.deptName,
          act.type,
          act.title,
          act.message.replace(/"/g, '""')
        ]);
      });
    });

    // Sort rows by timestamp
    rows.sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

    const csvContent = [headers.join(','), ...rows.map(row => row.map((cell: any) => `"${cell}"`).join(','))].join('\n');
    downloadFile(csvContent, `UpfittersOS_Activity_Audit_${startDateStr}_to_${endDateStr}.csv`, 'text/csv');
  };

  const downloadFile = (content: string, fileName: string, contentType: string) => {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    toast.success('CSV Download Started');
  };

  // Printable layout window trigger
  const triggerPrint = () => {
    window.print();
  };

  if (!canViewReports) {
    return (
      <div className="p-12 text-center print:hidden">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Permission Denied</h3>
        <p className="text-sm text-zinc-500 mt-2">You need reports.view permissions to access this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:p-0 print:bg-white print:text-black">
      {/* CSS Rules specifically injected to force exact page layout */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide app wrappers, sidebars, dashboard layout items */
          header, sidebar, nav, footer, .print-hidden, .print\\:hidden, button, select {
            display: none !important;
          }
          body {
            background-color: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Override overflow-hidden and height-screen on layout elements during print */
          html, body, #root, 
          div.flex.h-screen, 
          div.flex-1.flex.flex-col.min-w-0, 
          main, 
          main > div,
          div.fixed.inset-0.z-50, 
          div.fixed.inset-0.z-50 > div {
            display: block !important;
            height: auto !important;
            overflow: visible !important;
            max-height: none !important;
            position: relative !important;
          }
          .print-page {
            page-break-after: always !important;
            break-after: page !important;
            height: 100vh !important;
            max-height: 100vh !important;
            padding: 20mm !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            background: white !important;
            color: black !important;
          }
          .page-break {
            page-break-before: always !important;
            break-before: page !important;
          }
          /* Eliminate header gaps */
          div[class*="overflow-y-auto"] {
            overflow: visible !important;
            height: auto !important;
          }
        }
      `}} />

      {/* Header Panel - Hidden during standard Print */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-500" />
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Weekly Operational Audit</h1>
          </div>
          <p className="text-sm text-zinc-500 mt-1">Audit active technician hours, vehicle status, department workloads, and logistics details.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowPrintPreview(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-zinc-850 hover:bg-zinc-800 dark:hover:bg-zinc-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-all"
          >
            <Printer className="w-4 h-4" /> Generate Print Report
          </button>
          
          <div className="relative group">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-indigo-500/10 transition-all">
              <Download className="w-4 h-4" /> Export CSV <ChevronDown className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-1 z-35 hidden group-hover:block hover:block">
              <button
                onClick={handleExportPayrollCSV}
                className="w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-850/50 text-zinc-700 dark:text-zinc-300 flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Payroll Summary CSV
              </button>
              <button
                onClick={handleExportActivityCSV}
                className="w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-850/50 text-zinc-700 dark:text-zinc-300 flex items-center gap-2"
              >
                <Activity className="w-4 h-4 text-indigo-500" /> Activity Log CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar - Hidden on Print */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Scope & Time Filters</h3>
          </div>
          
          <button
            onClick={() => refetch()}
            className="text-xs font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Data
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Timeframe selector */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Preset Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as AuditTimeframe)}
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="this_week">{thisWeekLabel}</option>
              <option value="last_week">Last Week</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_month">This Month</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {/* Date Picker Start */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Start Date</label>
            <input
              type="date"
              disabled={timeframe !== 'custom'}
              value={startDateStr}
              onChange={(e) => {
                setStartDateStr(e.target.value);
                setTimeframe('custom');
              }}
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
            />
          </div>

          {/* Date Picker End */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">End Date</label>
            <input
              type="date"
              disabled={timeframe !== 'custom'}
              value={endDateStr}
              onChange={(e) => {
                setEndDateStr(e.target.value);
                setTimeframe('custom');
              }}
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
            />
          </div>

          {/* Department selector */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Department</label>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All Departments</option>
              {rawData?.departments?.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Staff selector */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Staff Roster</label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All Active Staff</option>
              {activeStaffOnly.map((s: any) => (
                <option key={s.id} value={s.id}>{`${s.firstName || ''} ${s.lastName || ''}`.trim() || s.displayName || s.email}</option>
              ))}
            </select>
          </div>

          {/* Search bar */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Job / Text Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search job/tech..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3.5 py-2 w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-16 flex flex-col items-center justify-center space-y-4 print:hidden">
          <Activity className="w-10 h-10 text-indigo-500 animate-spin" />
          <p className="text-zinc-500 text-sm font-semibold uppercase tracking-widest">Aggregating Audit Trails...</p>
        </div>
      ) : (
        <>
          {/* Overview KPI Cards */}
          {summaryStats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 print:hidden">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-indigo-500">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Hours Logged</span>
                  <Clock className="w-4 h-4" />
                </div>
                <p className="text-2xl font-black text-zinc-900 dark:text-white mt-3">{summaryStats.clockedHours.toFixed(1)}h</p>
                <p className="text-[9px] text-zinc-500 mt-1">Deducted break times</p>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-emerald-500">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Book Hours</span>
                  <BookOpen className="w-4 h-4" />
                </div>
                <p className="text-2xl font-black text-zinc-900 dark:text-white mt-3">{summaryStats.bookHours.toFixed(1)}h</p>
                <p className="text-[9px] text-zinc-500 mt-1">Estimated task times</p>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-indigo-500">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Efficiency</span>
                  <Zap className="w-4 h-4" />
                </div>
                <p className="text-2xl font-black text-zinc-900 dark:text-white mt-3">{summaryStats.efficiency.toFixed(0)}%</p>
                <p className="text-[9px] text-zinc-500 mt-1">Book / Clock ratio</p>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-amber-500">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Vehicle Moves</span>
                  <Warehouse className="w-4 h-4" />
                </div>
                <p className="text-2xl font-black text-zinc-900 dark:text-white mt-3">{summaryStats.moves}</p>
                <p className="text-[9px] text-zinc-500 mt-1">Bays & zone transfers</p>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-amber-500">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Parts/Shipment</span>
                  <Package className="w-4 h-4" />
                </div>
                <p className="text-2xl font-black text-zinc-900 dark:text-white mt-3">{summaryStats.parts + summaryStats.packages}</p>
                <p className="text-[9px] text-zinc-500 mt-1">{summaryStats.parts} reqs | {summaryStats.packages} packages</p>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-rose-500">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Anomalies</span>
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <p className="text-2xl font-black text-zinc-900 dark:text-white mt-3">{summaryStats.anomalies}</p>
                <p className="text-[9px] text-zinc-500 mt-1">Lates & shift flags</p>
              </div>
            </div>
          )}

          {/* Navigation Subtabs - Hidden on Print */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 print:hidden">
            {(['overview', 'staff', 'jobs', 'logistics'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-6 py-3 text-sm font-bold border-b-2 transition-all capitalize',
                  activeTab === tab
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Contents - Hidden on Print */}
          <div className="space-y-6 print:hidden">
            {activeTab === 'overview' && summaryStats && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* SVG Activity Volume Chart */}
                  <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="font-bold text-zinc-900 dark:text-white">Shop Activity Volume</h3>
                        <p className="text-xs text-zinc-500">Actions processed by day in date range</p>
                      </div>
                      <Activity className="w-5 h-5 text-indigo-500" />
                    </div>

                    <div className="h-64 flex items-end justify-between gap-3 px-2">
                      {summaryStats.chartData.map((d: any, idx: number) => {
                        const maxVal = Math.max(...summaryStats.chartData.map((c: any) => c.value)) || 1;
                        const height = (d.value / maxVal) * 100;
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center group relative">
                            <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-xl whitespace-nowrap z-10">
                              {d.value} actions
                            </div>
                            <div
                              className="w-full bg-indigo-500/10 hover:bg-indigo-500/30 rounded-t-lg transition-all duration-300 relative overflow-hidden"
                              style={{ height: `${Math.max(height, 4)}%` }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-t from-indigo-600 to-indigo-400 opacity-80" />
                            </div>
                            <span className="text-[9px] font-bold text-zinc-400 mt-2 truncate w-full text-center">{d.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Audit Performance Panel */}
                  <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/10 flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                    
                    <div className="relative">
                      <Zap className="w-8 h-8 mb-4 opacity-80" />
                      <h3 className="text-lg font-bold mb-2">Shop Performance Score</h3>
                      <p className="text-indigo-100 text-xs leading-relaxed">
                        Current timeframe average efficiency index is <span className="font-bold text-white">{summaryStats.efficiency.toFixed(0)}%</span> based on hours clocked and book work recorded.
                      </p>
                    </div>

                    <div className="relative mt-8 space-y-4 text-xs font-semibold">
                      <div className="flex justify-between border-b border-white/20 pb-2">
                        <span>Active Staff Logged In</span>
                        <span>{filteredData?.staff.filter(s => s.metrics.clockedMins > 0).length || 0} active</span>
                      </div>
                      <div className="flex justify-between border-b border-white/20 pb-2">
                        <span>Vehicle Moves processed</span>
                        <span>{summaryStats.moves} moves</span>
                      </div>
                      <div className="flex justify-between border-b border-white/20 pb-2">
                        <span>Logistics Requests</span>
                        <span>{summaryStats.parts} parts</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Anomalies Flagged</span>
                        <span className={cn(summaryStats.anomalies > 5 ? 'text-rose-300' : 'text-emerald-300')}>{summaryStats.anomalies} flags</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CRITICAL SHOP ITEMS & BLOCKERS */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Active Blockers */}
                  <div className="bg-white dark:bg-zinc-900 border border-rose-100 dark:border-rose-900/30 rounded-3xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                      <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-rose-500" /> Active Job Blockers
                      </h3>
                      <span className="bg-rose-500/10 text-rose-600 text-xs px-2 py-0.5 rounded-full font-bold">
                        {activeBlockersList.length} Blocked
                      </span>
                    </div>

                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {activeBlockersList.length === 0 ? (
                        <p className="text-zinc-550 text-xs italic p-4 text-center">No active production blockers.</p>
                      ) : (
                        activeBlockersList.map((job: any) => (
                          <div key={job.id} className="bg-rose-50/20 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-950/40 p-3 rounded-xl text-xs space-y-1">
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-zinc-900 dark:text-white">{job.name || job.title}</span>
                              <span className="font-mono text-[9px] bg-rose-500/10 text-rose-600 font-bold px-1.5 py-0.5 rounded uppercase">Blocked</span>
                            </div>
                            <p className="text-zinc-450 text-[10px]">{job.customerName || job.customer?.name || 'Walk-in'}</p>
                            <p className="text-rose-650 dark:text-rose-450 font-semibold mt-1 bg-white dark:bg-zinc-900 p-2 rounded border border-rose-100/30">
                              {job.blocker || job.blockers?.find((b: any) => b.status === 'active')?.message || 'Job marked as blocked.'}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Missing Parts */}
                  <div className="bg-white dark:bg-zinc-900 border border-amber-100 dark:border-amber-900/30 rounded-3xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                      <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <Package className="w-5 h-5 text-amber-500" /> Parts Missing
                      </h3>
                      <span className="bg-amber-500/10 text-amber-600 text-xs px-2 py-0.5 rounded-full font-bold">
                        {missingPartsList.length} Awaiting
                      </span>
                    </div>

                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {missingPartsList.length === 0 ? (
                        <p className="text-zinc-550 text-xs italic p-4 text-center">No missing parts logged on active jobs.</p>
                      ) : (
                        missingPartsList.map((part: any) => (
                          <div key={part.id} className="bg-amber-50/20 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-950/40 p-3 rounded-xl text-xs space-y-1">
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-zinc-900 dark:text-white">{part.partName} (Qty: {part.qty || 1})</span>
                              <span className="font-mono text-[9px] bg-amber-500/15 text-amber-600 font-bold px-1.5 py-0.5 rounded uppercase">{part.status || 'pending'}</span>
                            </div>
                            <p className="text-zinc-450 text-[10px]">Job: {part.jobName || 'Unassigned'}</p>
                            <p className="text-[10px] text-zinc-500 italic">Requested by: {part.requestedBy || 'System'}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Idle Onsite Vehicles */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                      <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <Truck className="w-5 h-5 text-indigo-500" /> Onsite Idle Vehicles
                      </h3>
                      <span className="bg-indigo-500/10 text-indigo-600 text-xs px-2 py-0.5 rounded-full font-bold">
                        {idleOnsiteVehicles.length} Idle
                      </span>
                    </div>

                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {idleOnsiteVehicles.length === 0 ? (
                        <p className="text-zinc-550 text-xs italic p-4 text-center">All onsite vehicles have work logged.</p>
                      ) : (
                        idleOnsiteVehicles.map((v: any) => (
                          <div key={v.id} className="bg-zinc-50 dark:bg-zinc-850/50 border border-zinc-150 dark:border-zinc-800 p-3 rounded-xl text-xs space-y-1">
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-zinc-900 dark:text-white">{v.year || ''} {v.make || ''} {v.model || 'Vehicle'}</span>
                              <span className="font-mono text-[9px] bg-rose-500/10 text-rose-600 font-bold px-1.5 py-0.5 rounded uppercase">0 hrs</span>
                            </div>
                            <p className="text-[10px] text-zinc-400 font-mono">VIN: {v.vin || 'N/A'}</p>
                            <div className="flex justify-between text-[10px] text-zinc-555 mt-1 border-t border-zinc-100 dark:border-zinc-800 pt-1.5">
                              <span>Loc: <span className="font-bold">{v.currentZone}</span></span>
                              <span>Arrived: {new Date(parseDate(v.arrivedAt)).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Staff Roster Tab */}
            {activeTab === 'staff' && filteredData && (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest border-b border-zinc-100 dark:border-zinc-800">
                      <tr>
                        <th className="px-6 py-4">Technician</th>
                        <th className="px-6 py-4">Department</th>
                        <th className="px-6 py-4 text-right">Actual Hours</th>
                        <th className="px-6 py-4 text-right">Book Hours</th>
                        <th className="px-6 py-4 text-right">Efficiency</th>
                        <th className="px-6 py-4 text-right">Moves</th>
                        <th className="px-6 py-4 text-right">Parts</th>
                        <th className="px-6 py-4 text-right">Anomalies</th>
                        <th className="px-6 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {filteredData.staff.map((s) => {
                        const isExpanded = expandedStaffId === s.id;
                        const actualHrs = s.metrics.clockedMins / 60;
                        const bookHrs = s.metrics.bookMins / 60;
                        const efficiency = actualHrs > 0 ? Math.round((bookHrs / actualHrs) * 100) : 0;
                        
                        return (
                          <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-850/50 transition-colors">
                            <td colSpan={9} className="p-0">
                              <div
                                onClick={() => setExpandedStaffId(isExpanded ? null : s.id)}
                                className="flex items-center w-full px-6 py-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/20"
                              >
                                <div className="w-[18%] font-bold text-zinc-900 dark:text-white truncate">
                                  <StaffLink 
                                    name={s.name} 
                                    tenantId={tenantId} 
                                    staffId={s.id} 
                                    className="hover:text-indigo-600 hover:underline text-zinc-900 dark:text-white" 
                                  />
                                </div>
                                <div className="w-[14%] text-xs font-semibold text-zinc-500 truncate">{s.deptName}</div>
                                <div className="w-[12%] text-right font-mono text-zinc-650 dark:text-zinc-400">{actualHrs.toFixed(1)}h</div>
                                <div className="w-[12%] text-right font-mono text-zinc-650 dark:text-zinc-400">{bookHrs.toFixed(1)}h</div>
                                <div className="w-[12%] text-right">
                                  <span className={cn(
                                    'text-xs font-bold px-2 py-0.5 rounded inline-block',
                                    efficiency >= 100 ? 'bg-emerald-500/10 text-emerald-600' :
                                    efficiency > 0 ? 'bg-amber-500/10 text-amber-600' :
                                    'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                                  )}>
                                    {actualHrs > 0 ? `${efficiency}%` : '--'}
                                  </span>
                                </div>
                                <div className="w-[10%] text-right font-mono text-zinc-650 dark:text-zinc-400">{s.metrics.moves}</div>
                                <div className="w-[10%] text-right font-mono text-zinc-650 dark:text-zinc-400">{s.metrics.partsCount}</div>
                                <div className="w-[10%] text-right">
                                  {s.metrics.anomaliesCount > 0 ? (
                                    <span className="bg-rose-500/10 text-rose-600 text-xs font-bold px-2 py-0.5 rounded-full inline-block">
                                      {s.metrics.anomaliesCount} flags
                                    </span>
                                  ) : (
                                    <span className="text-zinc-400 text-xs">-</span>
                                  )}
                                </div>
                                <div className="w-[2%] text-right flex justify-end">
                                  <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform duration-250', isExpanded && 'rotate-180')} />
                                </div>
                              </div>

                              {/* Expanded Details Pane */}
                              {isExpanded && (
                                <div className="bg-zinc-50 dark:bg-zinc-950 p-6 border-t border-b border-zinc-200 dark:border-zinc-800">
                                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                                    {/* Sub-Panel: Clock Sessions */}
                                    <div className="space-y-3">
                                      <h4 className="text-[10px] font-black text-zinc-450 uppercase tracking-widest flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-indigo-500" /> Attendance & Sessions
                                      </h4>
                                      {s.timeSessions.length === 0 ? (
                                        <p className="text-xs text-zinc-500 italic">No attendance hours logged.</p>
                                      ) : (
                                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                          {s.timeSessions.map((ts: any) => {
                                            const start = parseDate(ts.clockIn.timestamp);
                                            const end = ts.clockOut?.timestamp ? parseDate(ts.clockOut.timestamp) : null;
                                            return (
                                              <div key={ts.id} className="bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800 p-3 rounded-xl flex items-center justify-between text-xs shadow-sm">
                                                <div>
                                                  <p className="font-bold">
                                                    {new Date(start).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                  </p>
                                                  <p className="text-zinc-400 text-[10px] mt-0.5">
                                                    {new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → {end ? new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                                                  </p>
                                                </div>
                                                <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">
                                                  {(calculateSessionDuration(ts) / 3600000).toFixed(1)}h
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {/* Attendance Flags */}
                                      {s.anomalies.length > 0 && (
                                        <div className="space-y-2 mt-4">
                                          <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1">
                                            <AlertTriangle className="w-3.5 h-3.5" /> Flagged Anomalies
                                          </h4>
                                          {s.anomalies.map((anom: any, idx: number) => (
                                            <div key={idx} className="bg-rose-500/5 border border-rose-500/20 text-rose-600 p-2.5 rounded-xl text-xs flex items-start gap-2">
                                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                              <div>
                                                <p className="font-bold text-[10px] uppercase">
                                                  {anom.date.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                </p>
                                                <p className="text-[11px] font-medium mt-0.5">{anom.message}</p>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Sub-Panel: Action History Timeline */}
                                    <div className="xl:col-span-2 space-y-3">
                                      <h4 className="text-[10px] font-black text-zinc-450 uppercase tracking-widest flex items-center gap-1">
                                        <Activity className="w-3.5 h-3.5 text-indigo-500" /> Operational Activity Trail
                                      </h4>
                                      {s.activities.length === 0 ? (
                                        <p className="text-xs text-zinc-500 italic">No operational activity logs found.</p>
                                      ) : (
                                        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                                          {s.activities.map((act: any) => (
                                            <div key={act.id} className="bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800 p-3.5 rounded-xl text-xs shadow-sm flex items-start justify-between gap-4">
                                              <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                  <span className={cn(
                                                    'px-1.5 py-0.5 rounded text-[8px] font-black uppercase',
                                                    act.type === 'zone_move' ? 'bg-amber-500/10 text-amber-600' :
                                                    act.type === 'job_task' ? 'bg-emerald-500/10 text-emerald-600' :
                                                    act.type === 'parts' ? 'bg-rose-500/10 text-rose-600' :
                                                    'bg-indigo-500/10 text-indigo-600'
                                                  )}>
                                                    {act.type}
                                                  </span>
                                                  <p className="font-bold text-zinc-900 dark:text-white">{act.title}</p>
                                                </div>
                                                <p className="text-zinc-550 text-[11px] leading-relaxed">{act.message}</p>
                                              </div>
                                              <time className="text-[9px] font-mono text-zinc-400 whitespace-nowrap">
                                                {act.timestamp.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                              </time>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Jobs Audit Tab - Grouped by Department */}
            {activeTab === 'jobs' && filteredData && (
              <div className="space-y-8">
                {jobsByDepartment.map((group) => (
                  <div key={group.department.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                    <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 flex items-center justify-between">
                      <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <Warehouse className="w-5 h-5 text-indigo-500" /> {group.department.name}
                      </h3>
                      <span className="text-xs bg-zinc-150 dark:bg-zinc-850 px-2.5 py-1 rounded-full font-bold text-zinc-500">
                        {group.jobs.length} {group.jobs.length === 1 ? 'Job' : 'Jobs'}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-zinc-50/50 dark:bg-zinc-850/30 text-zinc-500 uppercase text-[10px] font-bold tracking-widest border-b border-zinc-100 dark:border-zinc-800">
                          <tr>
                            <th className="px-6 py-4">Job Details</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Logged Hours</th>
                            <th className="px-6 py-4 text-right">Estimated Book Hours</th>
                            <th className="px-6 py-4 text-right">Parts Request</th>
                            <th className="px-6 py-4">Technicians Contribution</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {group.jobs.map((j) => (
                            <tr key={j.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                              <td className="px-6 py-4">
                                <p className="font-bold text-zinc-900 dark:text-white">{j.name || j.title || 'Unnamed Job'}</p>
                                <p className="text-xs text-zinc-400 mt-0.5">{j.customerName || j.customer?.name || 'No Customer'}</p>
                              </td>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  'text-[10px] font-black uppercase px-2 py-0.5 rounded',
                                  j.status?.toLowerCase() === 'completed' ? 'bg-emerald-500/10 text-emerald-600' :
                                  j.status?.toLowerCase() === 'blocked' ? 'bg-rose-500/10 text-rose-600' :
                                  j.status?.toLowerCase() === 'in_progress' ? 'bg-indigo-500/10 text-indigo-600' :
                                  'bg-zinc-150 dark:bg-zinc-850 text-zinc-500'
                                )}>
                                  {j.status || 'pending'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-zinc-655 dark:text-zinc-400">
                                {j.loggedHours.toFixed(1)}h
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-zinc-655 dark:text-zinc-400">
                                {j.estimatedHours ? `${j.estimatedHours.toFixed(1)}h` : '--'}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-zinc-655">
                                {j.partsCount > 0 ? (
                                  <span className="text-amber-605 font-bold bg-amber-500/5 px-2 py-0.5 border border-amber-500/10 rounded inline-block">
                                    {j.partsCount} parts
                                  </span>
                                ) : (
                                  <span className="text-zinc-400">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                {j.technicians.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {j.technicians.map((name: string) => (
                                      <span key={name} className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-350 px-2 py-0.5 rounded-full font-semibold">
                                        <StaffLink 
                                          name={name} 
                                          tenantId={tenantId} 
                                          className="hover:underline text-indigo-600 dark:text-indigo-400 font-bold" 
                                        />
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-zinc-450 italic">No time logged yet</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Logistics Audit Tab */}
            {activeTab === 'logistics' && filteredData && logisticsStats && (
              <div className="space-y-6">
                {/* Logistics Statistics Panel */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Total Parts Requested</span>
                    <p className="text-2xl font-black text-zinc-900 dark:text-white mt-3">{logisticsStats.totalParts}</p>
                    <p className="text-[9px] text-zinc-500 mt-1">In timeframe</p>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Parts Awaiting Intake</span>
                    <p className="text-2xl font-black text-amber-600 mt-3">{logisticsStats.pendingParts + logisticsStats.orderedParts}</p>
                    <p className="text-[9px] text-zinc-500 mt-1">{logisticsStats.pendingParts} pending | {logisticsStats.orderedParts} ordered</p>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Parts Received</span>
                    <p className="text-2xl font-black text-emerald-600 mt-3">{logisticsStats.receivedParts}</p>
                    <p className="text-[9px] text-zinc-500 mt-1">Transferred to bays</p>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Packages Intake</span>
                    <p className="text-2xl font-black text-zinc-900 dark:text-white mt-3">{logisticsStats.totalShipments}</p>
                    <p className="text-[9px] text-zinc-500 mt-1">Logged by logistics staff</p>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Carrier Breakdown</span>
                    <div className="mt-2 text-[10px] font-bold text-zinc-650 dark:text-zinc-400 space-y-0.5">
                      {Object.keys(logisticsStats.carrierCounts).length === 0 ? (
                        <p className="italic text-zinc-500">No packages</p>
                      ) : (
                        Object.entries(logisticsStats.carrierCounts).map(([carrier, count]) => (
                          <div key={carrier} className="flex justify-between">
                            <span>{carrier}:</span>
                            <span>{count}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Parts Requests */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                    <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20">
                      <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-indigo-500" /> Parts Requests Audit Log
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      {filteredData.partsRequests.length === 0 ? (
                        <p className="p-8 text-center text-zinc-500 italic text-sm">No parts requests found in timeframe.</p>
                      ) : (
                        <table className="w-full text-xs text-left">
                          <thead className="bg-zinc-50 dark:bg-zinc-850/50 text-zinc-500 uppercase font-bold tracking-widest border-b border-zinc-150 dark:border-zinc-800">
                            <tr>
                              <th className="px-4 py-3">Part Details</th>
                              <th className="px-4 py-3">Job Target</th>
                              <th className="px-4 py-3">Requested By</th>
                              <th className="px-4 py-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {filteredData.partsRequests.map((p) => (
                              <tr key={p.id}>
                                <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">
                                  {p.partName || 'Part'} (Qty: {p.qty || 1})
                                </td>
                                <td className="px-4 py-3 text-zinc-500">{p.jobName || 'Unassigned Job'}</td>
                                <td className="px-4 py-3">{p.requestedBy || 'N/A'}</td>
                                <td className="px-4 py-3">
                                  <span className={cn(
                                    'text-[8px] font-black uppercase px-1.5 py-0.5 rounded',
                                    p.status === 'received' ? 'bg-emerald-500/10 text-emerald-600' :
                                    p.status === 'ordered' ? 'bg-indigo-500/10 text-indigo-600' :
                                    'bg-amber-500/10 text-amber-600'
                                  )}>
                                    {p.status || 'pending'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* Received Shipments */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                    <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20">
                      <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <Truck className="w-5 h-5 text-indigo-500" /> Package Shipments Logged
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      {filteredData.shipments.length === 0 ? (
                        <p className="p-8 text-center text-zinc-500 italic text-sm">No shipments logged in timeframe.</p>
                      ) : (
                        <table className="w-full text-xs text-left">
                          <thead className="bg-zinc-50 dark:bg-zinc-850/50 text-zinc-500 uppercase font-bold tracking-widest border-b border-zinc-150 dark:border-zinc-800">
                            <tr>
                              <th className="px-4 py-3">Carrier / Tracking</th>
                              <th className="px-4 py-3">Notes</th>
                              <th className="px-4 py-3">Logged By</th>
                              <th className="px-4 py-3">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {filteredData.shipments.map((s) => (
                              <tr key={s.id}>
                                <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">
                                  {s.carrier || 'Carrier'} - <span className="font-mono text-zinc-550">{s.trackingNumber || 'N/A'}</span>
                                </td>
                                <td className="px-4 py-3 text-zinc-500 max-w-[150px] truncate" title={s.notes}>{s.notes || '-'}</td>
                                <td className="px-4 py-3">{s.createdByName || 'N/A'}</td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {new Date(parseDate(s.createdAt)).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Print Preview Modal - Stylized Cover & Sheets */}
      {showPrintPreview && filteredData && summaryStats && logisticsStats && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 print:relative print:inset-auto print:bg-white print:p-0">
          <div className="bg-white dark:bg-zinc-950 w-full max-w-5xl h-[90vh] overflow-hidden rounded-[2rem] shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800 print:shadow-none print:border-none print:rounded-none print:h-auto print:overflow-visible">
            
            {/* Modal Control Header - Hidden on physical Print */}
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-900 flex items-center justify-between print:hidden">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Audit & Meeting Report Generator</h3>
                <p className="text-xs text-zinc-550 mt-0.5">Toggle format below to match your weekly files.</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Print Template Switcher */}
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Report Format:</label>
                  <select
                    value={printReportType}
                    onChange={(e) => setPrintReportType(e.target.value as 'audit' | 'meeting')}
                    className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="audit">Weekly Operations Audit</option>
                    <option value="meeting">Weekly Meeting Notes Template</option>
                  </select>
                </div>

                <button
                  onClick={triggerPrint}
                  className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-bold transition-transform shadow-md"
                >
                  <Printer className="w-4 h-4" /> Trigger System Print / PDF
                </button>
                <button
                  onClick={() => setShowPrintPreview(false)}
                  className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Print Sheet Paper Container */}
            <div className="flex-1 overflow-y-auto p-12 print:p-0 print:overflow-visible print:bg-white print:text-black">
              {printReportType === 'meeting' ? (
                /* Weekly Meeting Template (Prefilled & Matches exact layout) */
                <div className="print-meeting-notes space-y-12 print:space-y-0 text-black max-w-4xl mx-auto p-8 bg-white border border-zinc-150 print:border-0 rounded-2xl">
                  {/* Page 1 */}
                  <div className="print-page flex flex-col justify-between">
                    <div className="space-y-6">
                      <div className="text-center font-black text-3xl uppercase tracking-wider text-black pb-4 border-b-2 border-zinc-800">
                        Weekly Meeting
                      </div>
                      
                      <div className="space-y-5">
                        <div>
                          <MajorBullet title="Sales Pipe Line" />
                          <div className="space-y-3 mt-2">
                            <div>
                              <SubBullet title="Leads" />
                              {renderMeetingItems(leadsData, 3)}
                            </div>
                            <div>
                              <SubBullet title="Prospecting" />
                              {renderMeetingItems(prospectingData, 3)}
                            </div>
                            <div>
                              <SubBullet title="Waiting on approval / Follow up on" />
                              {renderMeetingItems(waitingApprovalData, 4)}
                            </div>
                            <div>
                              <SubBullet title="Approved" />
                              {renderMeetingItems(approvedData, 3)}
                            </div>
                          </div>
                        </div>

                        <div>
                          <MajorBullet title="Open Sales Orders" />
                          <div className="space-y-3 mt-2">
                            <div>
                              <SubBullet title="1 - 30 Days" />
                              {renderMeetingItems(openOrders1to30, 3)}
                            </div>
                            <div>
                              <SubBullet title="31 - 60 Days" />
                              {renderMeetingItems(openOrders31to60, 3)}
                            </div>
                          </div>
                        </div>

                        <div>
                          <MajorBullet title="Service Work" />
                          <div className="space-y-2 mt-2">
                            <div>
                              <SubBullet title="Here in-progress" />
                              {renderMeetingItems(serviceWorkInProgress, 3)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Page 2 */}
                  <div className="print-page flex flex-col justify-between">
                    <div className="space-y-6">
                      <div>
                        <MajorBullet title="Service Work (Continued)" />
                        <div className="space-y-3 mt-2">
                          <div>
                            <SubBullet title="Here need to start" />
                            {renderMeetingItems(serviceWorkNeedToStart, 3)}
                          </div>
                          <div>
                            <SubBullet title="Incoming" />
                            {renderMeetingItems(serviceWorkIncoming, 3)}
                          </div>
                          <div>
                            <SubBullet title="Need to Schedule" />
                            {renderMeetingItems(serviceWorkNeedToSchedule, 3)}
                          </div>
                        </div>
                      </div>

                      <div>
                        <MajorBullet title="Build Schedule" />
                        <div className="space-y-3 mt-2">
                          <div>
                            <SubBullet title="In shop / Completion date / Current Times" />
                            {renderMeetingItems(buildScheduleInShop, 10)}
                          </div>
                          <div>
                            <SubBullet title="Incoming upon Completion" />
                            {renderMeetingItems(buildScheduleIncoming, 10)}
                          </div>
                        </div>
                      </div>

                      <div>
                        <MajorBullet title="Orders" />
                        <div className="space-y-2 mt-2">
                          <div>
                            <SubBullet title="Needed for job completions" />
                            {renderMeetingItems(ordersNeededForJobs.slice(0, 3), 3)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Page 3 */}
                  <div className="print-page flex flex-col justify-between">
                    <div className="space-y-6">
                      <div>
                        <MajorBullet title="Orders (Continued)" />
                        <div className="space-y-3 mt-2">
                          {ordersNeededForJobs.length > 3 && (
                            <div>
                              <SubBullet title="Needed for job completions (Continued)" />
                              {renderMeetingItems(ordersNeededForJobs.slice(3), Math.max(3, ordersNeededForJobs.length - 3))}
                            </div>
                          )}
                          <div>
                            <SubBullet title="Needed for upcoming jobs" />
                            {renderMeetingItems(ordersNeededUpcoming, 3)}
                          </div>
                          <div>
                            <SubBullet title="Restock Orders needed" />
                            {renderMeetingItems(ordersRestock, 3)}
                          </div>
                        </div>
                      </div>

                      <div>
                        <MajorBullet title="Misc." />
                        <div className="space-y-2 pl-4 mt-2">
                          <div className="flex items-center gap-2 text-xs py-1.5 text-black">
                            <span className="w-5 shrink-0 text-sm font-normal select-none">o</span>
                            <span className="flex-1 border-b border-zinc-200 border-dashed h-4"></span>
                          </div>
                          <div className="flex items-center gap-2 text-xs py-1.5 text-black">
                            <span className="w-5 shrink-0 text-sm font-normal select-none">o</span>
                            <span className="flex-1 border-b border-zinc-200 border-dashed h-4"></span>
                          </div>
                          <div className="flex items-center gap-2 text-xs py-1.5 text-black">
                            <span className="w-5 shrink-0 text-sm font-normal select-none">o</span>
                            <span className="flex-1 border-b border-zinc-200 border-dashed h-4"></span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <MajorBullet title="Notes" />
                        <div className="space-y-4 pl-4 mt-2">
                          <div className="border-b border-zinc-200 border-dashed h-6"></div>
                          <div className="border-b border-zinc-200 border-dashed h-6"></div>
                          <div className="border-b border-zinc-200 border-dashed h-6"></div>
                          <div className="border-b border-zinc-200 border-dashed h-6"></div>
                          <div className="border-b border-zinc-200 border-dashed h-6"></div>
                          <div className="border-b border-zinc-200 border-dashed h-6"></div>
                          <div className="border-b border-zinc-200 border-dashed h-6"></div>
                          <div className="border-b border-zinc-200 border-dashed h-6"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Weekly Operations Audit (Enhanced) */
                <div className="max-w-4xl mx-auto space-y-12 print:space-y-8 bg-white p-8 border border-zinc-150 print:border-0 rounded-2xl text-zinc-800 print:text-black">
                  
                  {/* Print Title Cover Block */}
                  <div className="border-b-2 border-zinc-800 pb-6 flex items-end justify-between">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-indigo-600 mb-2">UpfittersOS</h2>
                      <h1 className="text-3xl font-black uppercase tracking-tight text-zinc-900 italic">OPERATIONAL AUDIT REPORT</h1>
                      <p className="text-xs text-zinc-550 mt-1 uppercase font-semibold">Audit range: {startDateStr} to {endDateStr}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Date Generated</p>
                      <p className="font-mono text-sm font-bold">{new Date().toLocaleDateString()}</p>
                      <span className="text-[9px] bg-zinc-100 px-2 py-0.5 rounded font-black mt-1 inline-block">CONFIDENTIAL</span>
                    </div>
                  </div>

                  {/* Section 1: Scope Summary */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600 border-b border-zinc-200 pb-1">1. Scope Executive Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-zinc-50 p-4 rounded-xl text-center">
                      <div>
                        <p className="text-[9px] font-black text-zinc-400 uppercase">Clocked Hours</p>
                        <p className="text-lg font-black">{summaryStats.clockedHours.toFixed(1)}h</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-zinc-400 uppercase">Book Hours Earned</p>
                        <p className="text-lg font-black">{summaryStats.bookHours.toFixed(1)}h</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-zinc-400 uppercase">Operational moves</p>
                        <p className="text-lg font-black">{summaryStats.moves}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-zinc-400 uppercase">Avg Efficiency Score</p>
                        <p className="text-lg font-black">{summaryStats.efficiency.toFixed(0)}%</p>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-zinc-650">
                      This audit document compiles all active technician attendance, task logging hours, vehicle movements, and logistics data processed between {startDateStr} and {endDateStr}. Inactive staff profiles have been omitted from this record. Overall team performance is calculated based on clocked attendance compared to task estimations.
                    </p>
                  </div>

                  {/* Section 2: Staff Hours & Output */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600 border-b border-zinc-200 pb-1">2. Staff Roster & Payroll Breakdown (Active Staff Only)</h3>
                    <table className="w-full text-[11px] text-left border border-zinc-200">
                      <thead className="bg-zinc-50 uppercase text-[9px] font-bold">
                        <tr className="border-b border-zinc-200">
                          <th className="px-4 py-2">Technician</th>
                          <th className="px-4 py-2">Department</th>
                          <th className="px-4 py-2 text-right">Actual Hours</th>
                          <th className="px-4 py-2 text-right">Book Hours</th>
                          <th className="px-4 py-2 text-right">Moves</th>
                          <th className="px-4 py-2 text-right">Parts Logged</th>
                          <th className="px-4 py-2 text-right">Lates/Flags</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-250">
                        {filteredData.staff.map((s) => (
                          <tr key={s.id}>
                            <td className="px-4 py-2 font-bold">
                              <StaffLink 
                                name={s.name} 
                                tenantId={tenantId} 
                                staffId={s.id} 
                                className="hover:underline text-indigo-650" 
                              />
                            </td>
                            <td className="px-4 py-2">{s.deptName}</td>
                            <td className="px-4 py-2 text-right font-mono">{(s.metrics.clockedMins / 60).toFixed(1)}h</td>
                            <td className="px-4 py-2 text-right font-mono">{(s.metrics.bookMins / 60).toFixed(1)}h</td>
                            <td className="px-4 py-2 text-right font-mono">{s.metrics.moves}</td>
                            <td className="px-4 py-2 text-right font-mono">{s.metrics.partsCount}</td>
                            <td className="px-4 py-2 text-right font-bold text-rose-600">{s.metrics.anomaliesCount || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Section 3: Job Completion Activity - Grouped by Department */}
                  <div className="space-y-4 page-break">
                    <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600 border-b border-zinc-200 pb-1">3. Job Operational Summary (By Department)</h3>
                    {jobsByDepartment.map((group) => (
                      <div key={group.department.id} className="space-y-1.5">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{group.department.name} ({group.jobs.length} jobs)</h4>
                        <table className="w-full text-[10px] text-left border border-zinc-200">
                          <thead className="bg-zinc-50 uppercase text-[8px] font-bold">
                            <tr className="border-b border-zinc-200">
                              <th className="px-4 py-1.5">Job Name</th>
                              <th className="px-4 py-1.5">Customer</th>
                              <th className="px-4 py-1.5">Status</th>
                              <th className="px-4 py-1.5 text-right">Logged Hours</th>
                              <th className="px-4 py-1.5 text-right">Estimated</th>
                              <th className="px-4 py-1.5">Crew</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-250">
                            {group.jobs.map((j) => (
                              <tr key={j.id}>
                                <td className="px-4 py-1.5 font-bold">{j.name || j.title || 'Job'}</td>
                                <td className="px-4 py-1.5">{j.customerName || j.customer?.name || 'N/A'}</td>
                                <td className="px-4 py-1.5 capitalize">{j.status || 'pending'}</td>
                                <td className="px-4 py-1.5 text-right font-mono">{j.loggedHours.toFixed(1)}h</td>
                                <td className="px-4 py-1.5 text-right font-mono">{j.estimatedHours ? `${j.estimatedHours.toFixed(1)}h` : '--'}</td>
                                <td className="px-4 py-1.5 font-semibold text-zinc-650">
                                  {j.technicians.length === 0 ? (
                                    'N/A'
                                  ) : (
                                    j.technicians.map((name: string, idx: number) => (
                                      <span key={name}>
                                        {idx > 0 && ', '}
                                        <StaffLink 
                                          name={name} 
                                          tenantId={tenantId} 
                                          className="hover:underline text-indigo-650" 
                                        />
                                      </span>
                                    ))
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>

                  {/* Section 4: Production Blockers, Missing Parts & Idle Vehicles */}
                  <div className="space-y-4 page-break">
                    <h3 className="text-xs font-black uppercase tracking-widest text-rose-600 border-b border-rose-200 pb-1">4. Critical Blockers & Focus Items</h3>
                    
                    {/* Blockers */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase text-rose-600 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> 4.1 Active Job Blockers ({activeBlockersList.length})
                      </h4>
                      <table className="w-full text-[10px] text-left border border-zinc-200">
                        <thead className="bg-zinc-50 uppercase text-[8px] font-bold">
                          <tr className="border-b border-zinc-200">
                            <th className="px-4 py-1.5">Job Name</th>
                            <th className="px-4 py-1.5">Customer</th>
                            <th className="px-4 py-1.5">Blocker Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-250">
                          {activeBlockersList.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-4 py-2 italic text-zinc-400 text-center">No active blockers.</td>
                            </tr>
                          ) : (
                            activeBlockersList.map((job: any) => (
                              <tr key={job.id}>
                                <td className="px-4 py-1.5 font-bold">{job.name || job.title}</td>
                                <td className="px-4 py-1.5">{job.customerName || job.customer?.name || 'Walk-in'}</td>
                                <td className="px-4 py-1.5 text-rose-700 font-semibold">{job.blocker || job.blockers?.find((b: any) => b.status === 'active')?.message || 'Blocked'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Missing Parts */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase text-amber-600 flex items-center gap-1">
                        <Package className="w-3.5 h-3.5" /> 4.2 Missing Parts Requests Awaiting Intake ({missingPartsList.length})
                      </h4>
                      <table className="w-full text-[10px] text-left border border-zinc-200">
                        <thead className="bg-zinc-50 uppercase text-[8px] font-bold">
                          <tr className="border-b border-zinc-200">
                            <th className="px-4 py-1.5">Part Name</th>
                            <th className="px-4 py-1.5">Job Target</th>
                            <th className="px-4 py-1.5">Qty</th>
                            <th className="px-4 py-1.5">Status</th>
                            <th className="px-4 py-1.5">Requested By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-250">
                          {missingPartsList.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-2 italic text-zinc-400 text-center">No pending parts.</td>
                            </tr>
                          ) : (
                            missingPartsList.map((p: any) => (
                              <tr key={p.id}>
                                <td className="px-4 py-1.5 font-bold">{p.partName}</td>
                                <td className="px-4 py-1.5">{p.jobName || 'Unassigned'}</td>
                                <td className="px-4 py-1.5">{p.qty || 1}</td>
                                <td className="px-4 py-1.5 capitalize font-semibold text-amber-650">{p.status || 'pending'}</td>
                                <td className="px-4 py-1.5">{p.requestedBy || 'System'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Idle Onsite Vehicles */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase text-indigo-600 flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5" /> 4.3 Onsite Vehicles with Zero Logged Hours ({idleOnsiteVehicles.length})
                      </h4>
                      <table className="w-full text-[10px] text-left border border-zinc-200">
                        <thead className="bg-zinc-50 uppercase text-[8px] font-bold">
                          <tr className="border-b border-zinc-200">
                            <th className="px-4 py-1.5">Vehicle Details</th>
                            <th className="px-4 py-1.5">VIN</th>
                            <th className="px-4 py-1.5">Current Bay/Zone</th>
                            <th className="px-4 py-1.5">Check-in Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-250">
                          {idleOnsiteVehicles.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-2 italic text-zinc-400 text-center">All onsite vehicles have work logged.</td>
                            </tr>
                          ) : (
                            idleOnsiteVehicles.map((v: any) => (
                              <tr key={v.id}>
                                <td className="px-4 py-1.5 font-bold">{v.year || ''} {v.make || ''} {v.model || 'Vehicle'}</td>
                                <td className="px-4 py-1.5 font-mono">{v.vin}</td>
                                <td className="px-4 py-1.5">{v.currentZone}</td>
                                <td className="px-4 py-1.5">{new Date(parseDate(v.arrivedAt)).toLocaleDateString()}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Section 5: Logistics & Shipments Received */}
                  <div className="space-y-3 page-break">
                    <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600 border-b border-zinc-200 pb-1">5. Logistics & Inventory Summary</h3>
                    <div className="grid grid-cols-3 gap-4 bg-zinc-50 p-3 rounded-lg text-center text-xs">
                      <div>
                        <p className="text-[8px] font-black text-zinc-400 uppercase">Total Requests</p>
                        <p className="font-bold">{logisticsStats.totalParts} requests</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-zinc-400 uppercase">Awaiting Parts</p>
                        <p className="font-bold">{logisticsStats.pendingParts + logisticsStats.orderedParts} parts</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-zinc-400 uppercase">Packages Received</p>
                        <p className="font-bold">{logisticsStats.totalShipments} packages</p>
                      </div>
                    </div>
                    
                    <h4 className="text-[9px] font-bold uppercase tracking-wider text-zinc-550 mt-3 mb-1">Received Packages Log</h4>
                    <table className="w-full text-[10px] text-left border border-zinc-200">
                      <thead className="bg-zinc-50 uppercase text-[8px] font-bold">
                        <tr className="border-b border-zinc-200">
                          <th className="px-4 py-1.5">Carrier / Tracking</th>
                          <th className="px-4 py-1.5">Notes</th>
                          <th className="px-4 py-1.5">Logged By</th>
                          <th className="px-4 py-1.5">Intake Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-250">
                        {filteredData.shipments.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-2 italic text-zinc-400 text-center">No packages received.</td>
                          </tr>
                        ) : (
                          filteredData.shipments.map((s) => (
                            <tr key={s.id}>
                              <td className="px-4 py-1.5 font-bold">{s.carrier || 'Carrier'} - <span className="font-mono text-zinc-500">{s.trackingNumber || 'N/A'}</span></td>
                              <td className="px-4 py-1.5 text-zinc-550 max-w-[200px] truncate">{s.notes || '-'}</td>
                              <td className="px-4 py-1.5">{s.createdByName || 'N/A'}</td>
                              <td className="px-4 py-1.5">{new Date(parseDate(s.createdAt)).toLocaleDateString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Section 6: Flagged Anomalies */}
                  {summaryStats.anomalies > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-black uppercase tracking-widest text-rose-600 border-b border-rose-200 pb-1">6. Attendance Flags & Anomalies Audit</h3>
                      <table className="w-full text-[10px] text-left border border-zinc-200">
                        <thead className="bg-zinc-50 uppercase text-[8px] font-bold">
                          <tr className="border-b border-zinc-200">
                            <th className="px-4 py-2">Staff</th>
                            <th className="px-4 py-2">Date</th>
                            <th className="px-4 py-2">Anomaly Flag Type</th>
                            <th className="px-4 py-2">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-250">
                          {filteredData.staff.filter(s => s.anomalies.length > 0).map((s) => 
                            s.anomalies.map((anom: any, idx: number) => (
                              <tr key={`${s.id}-anom-${idx}`}>
                                <td className="px-4 py-2 font-bold">
                               <StaffLink 
                                 name={s.name} 
                                 tenantId={tenantId} 
                                 staffId={s.id} 
                                 className="hover:underline text-indigo-650" 
                               />
                             </td>
                                <td className="px-4 py-2 whitespace-nowrap">{anom.date.toLocaleDateString()}</td>
                                <td className="px-4 py-2 font-semibold uppercase text-rose-600">{anom.type}</td>
                                <td className="px-4 py-2">{anom.message}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Sign-off Blocks */}
                  <div className="pt-16 grid grid-cols-2 gap-8 text-xs">
                    <div className="space-y-6">
                      <p className="font-bold border-t border-zinc-350 pt-2 text-zinc-550 uppercase text-[9px] tracking-wider">Audited By (Admin Signature)</p>
                      <div className="h-6"></div>
                      <p className="text-[10px] text-zinc-400 font-mono">Date: ________________________</p>
                    </div>
                    <div className="space-y-6">
                      <p className="font-bold border-t border-zinc-350 pt-2 text-zinc-550 uppercase text-[9px] tracking-wider">Reviewed By (Manager Signature)</p>
                      <div className="h-6"></div>
                      <p className="text-[10px] text-zinc-400 font-mono">Date: ________________________</p>
                    </div>
                  </div>
                  
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
