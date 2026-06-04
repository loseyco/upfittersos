import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import {
  Clock, Search, Printer, FileSpreadsheet, Download,
  ClipboardList, Package, AlertTriangle, AlertCircle,
  ChevronDown, Activity, Zap, Warehouse, Truck, RefreshCw,
  SlidersHorizontal, BookOpen, X
} from 'lucide-react';
import { useAuthStore } from '../../lib/auth/store';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

type AuditTimeframe = 'this_week' | 'last_week' | 'today' | 'yesterday' | 'this_month' | 'custom';

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

  // Set default dates when timeframe changes
  useEffect(() => {
    let start = new Date();
    let end = new Date();

    if (timeframe === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (timeframe === 'yesterday') {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (timeframe === 'this_week') {
      // Start of current week (Monday)
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (timeframe === 'last_week') {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1) - 7;
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (timeframe === 'this_month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    if (timeframe !== 'custom') {
      setStartDateStr(start.toISOString().split('T')[0]);
      setEndDateStr(end.toISOString().split('T')[0]);
    }
  }, [timeframe]);

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
        { name: 'shipments', dateField: 'createdAt' }
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

      return results.reduce((acc, curr) => ({ ...acc, [curr.name]: curr.data }), {} as Record<string, any[]>);
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

  // Helper helper to deduct unpaid breaks and return duration in milliseconds
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

  // Process and filter audit logs
  const auditData = useMemo(() => {
    if (!rawData) return null;

    const { start, end } = parsedDates;
    const startTimeMs = start.getTime();
    const endTimeMs = end.getTime();

    // 1. Resolve staff profiles
    const staffList = rawData.staff || [];
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

    // 2. Filter time clock sessions
    const timeSessions = (rawData.time_sessions || []).filter((s: any) => {
      const clockInTime = parseDate(s.clockIn?.timestamp);
      return clockInTime >= startTimeMs && clockInTime <= endTimeMs;
    });

    // Populate time sessions inside staff Map
    timeSessions.forEach((s: any) => {
      const staff = staffMap.get(s.userId);
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
        if (durationHrs > 10) {
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
      const staff = staffMap.get(a.assignedBy);
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
      const staff = staffMap.get(p.createdBy);
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
      const staff = staffMap.get(s.createdBy);
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
            const staff = staffMap.get(ts.userId);
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
  }, [rawData, parsedDates]);

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
      <div className="p-12 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Permission Denied</h3>
        <p className="text-sm text-zinc-500 mt-2">You need reports.view permissions to access this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:p-0 print:bg-white print:text-black">
      {/* Header Panel - Hidden during standard Print */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-500" />
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Weekly Operational Audit</h1>
          </div>
          <p className="text-sm text-zinc-500 mt-1">Audit technician hours, vehicle movements, jobs completed, and logistics details.</p>
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
              <option value="this_week">This Week (Mon-Now)</option>
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
              <option value="all">All Staff</option>
              {rawData?.staff?.filter((s: any) => !s.isArchived).map((s: any) => (
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
                <p className="text-[9px] text-zinc-500 mt-1">Bays / Parking transfers</p>
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
                      <span>Staff Logged In</span>
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
                      <span className={cn(summaryStats.anomalies > 5 ? 'text-rose-350' : 'text-emerald-350')}>{summaryStats.anomalies} flags</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Staff Audit Tab */}
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
                          <>
                            <tr
                              key={s.id}
                              onClick={() => setExpandedStaffId(isExpanded ? null : s.id)}
                              className="hover:bg-zinc-50 dark:hover:bg-zinc-850/50 transition-colors cursor-pointer"
                            >
                              <td className="px-6 py-4 font-bold text-zinc-900 dark:text-white">
                                {s.name}
                              </td>
                              <td className="px-6 py-4 text-xs font-semibold text-zinc-500">
                                {s.deptName}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-zinc-650 dark:text-zinc-400">
                                {actualHrs.toFixed(1)}h
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-zinc-650 dark:text-zinc-400">
                                {bookHrs.toFixed(1)}h
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className={cn(
                                  'text-xs font-bold px-2 py-0.5 rounded',
                                  efficiency >= 100 ? 'bg-emerald-500/10 text-emerald-600' :
                                  efficiency > 0 ? 'bg-amber-500/10 text-amber-600' :
                                  'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                                )}>
                                  {actualHrs > 0 ? `${efficiency}%` : '--'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-zinc-650 dark:text-zinc-400">
                                {s.metrics.moves}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-zinc-650 dark:text-zinc-400">
                                {s.metrics.partsCount}
                              </td>
                              <td className="px-6 py-4 text-right">
                                {s.metrics.anomaliesCount > 0 ? (
                                  <span className="bg-rose-500/10 text-rose-600 text-xs font-bold px-2 py-0.5 rounded-full">
                                    {s.metrics.anomaliesCount} flags
                                  </span>
                                ) : (
                                  <span className="text-zinc-400 text-xs">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform duration-250', isExpanded && 'rotate-180')} />
                              </td>
                            </tr>

                            {/* Expanded Details Pane */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={9} className="bg-zinc-50 dark:bg-zinc-950 p-6 border-b border-zinc-200 dark:border-zinc-800">
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
                                                <span className="font-mono font-bold">
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
                                                <p className="text-zinc-500 text-[11px] leading-relaxed">{act.message}</p>
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
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Jobs Audit Tab */}
            {activeTab === 'jobs' && filteredData && (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest border-b border-zinc-100 dark:border-zinc-800">
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
                      {filteredData.jobs.map((j) => (
                        <tr key={j.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-zinc-900 dark:text-white">{j.name || 'Unnamed Job'}</p>
                            <p className="text-xs text-zinc-400 mt-0.5">{j.customerName || j.customer?.name || 'No Customer'}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              'text-[10px] font-black uppercase px-2 py-0.5 rounded',
                              j.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' :
                              j.status === 'in_progress' ? 'bg-indigo-500/10 text-indigo-600' :
                              'bg-zinc-150 dark:bg-zinc-800 text-zinc-500'
                            )}>
                              {j.status || 'pending'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-zinc-650 dark:text-zinc-400">
                            {j.loggedHours.toFixed(1)}h
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-zinc-650 dark:text-zinc-400">
                            {j.estimatedHours ? `${j.estimatedHours.toFixed(1)}h` : '--'}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-zinc-650">
                            {j.partsCount > 0 ? (
                              <span className="text-amber-600 font-bold bg-amber-500/5 px-2 py-0.5 border border-amber-500/10 rounded">
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
                                    {name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-zinc-400 italic">No time logged yet</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Logistics Audit Tab */}
            {activeTab === 'logistics' && filteredData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Parts Requests */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                  <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20">
                    <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <Package className="w-5 h-5 text-indigo-500" /> Parts Requests Audit
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
                      <Truck className="w-5 h-5 text-indigo-500" /> Package Shipments Received
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
                                {s.carrier || 'Carrier'} - <span className="font-mono text-zinc-500">{s.trackingNumber || 'N/A'}</span>
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
            )}
          </div>
        </>
      )}

      {/* Print Preview Modal - Stylized Cover & Sheets */}
      {showPrintPreview && filteredData && summaryStats && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 print:relative print:inset-auto print:bg-white print:p-0">
          <div className="bg-white dark:bg-zinc-950 w-full max-w-5xl h-[90vh] overflow-hidden rounded-[2rem] shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800 print:shadow-none print:border-none print:rounded-none print:h-auto print:overflow-visible">
            
            {/* Modal Control Header - Hidden on physical Print */}
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-900 flex items-center justify-between print:hidden">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Weekly Audit Report Draft</h3>
                <p className="text-xs text-zinc-500">Optimized for printing or exporting to PDF</p>
              </div>
              <div className="flex items-center gap-3">
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
              <div className="max-w-4xl mx-auto space-y-12 print:space-y-8 bg-white p-8 border border-zinc-150 print:border-0 rounded-2xl text-zinc-800 print:text-black">
                
                {/* Print Title Cover Block */}
                <div className="border-b-2 border-zinc-800 pb-6 flex items-end justify-between">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-indigo-600 mb-2">UpfittersOS</h2>
                    <h1 className="text-3xl font-black uppercase tracking-tight text-zinc-900 italic">OPERATIONAL AUDIT REPORT</h1>
                    <p className="text-xs text-zinc-500 mt-1 uppercase font-semibold">Audit range: {startDateStr} to {endDateStr}</p>
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
                  <p className="text-xs leading-relaxed text-zinc-600">
                    This audit document compiles all technician attendance, task logging hours, vehicle movements, and logistics data processed between {startDateStr} and {endDateStr}. Based on clocked attendance time compared to completed job estimation values, overall team performance is verified as stable.
                  </p>
                </div>

                {/* Section 2: Staff Hours & Output */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600 border-b border-zinc-200 pb-1">2. Staff Roster & Payroll Breakdown</h3>
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
                          <td className="px-4 py-2 font-bold">{s.name}</td>
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

                {/* Section 3: Job Completion Activity */}
                <div className="space-y-3 page-break">
                  <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600 border-b border-zinc-200 pb-1">3. Job Operational Summary</h3>
                  <table className="w-full text-[11px] text-left border border-zinc-200">
                    <thead className="bg-zinc-50 uppercase text-[9px] font-bold">
                      <tr className="border-b border-zinc-200">
                        <th className="px-4 py-2">Job Name</th>
                        <th className="px-4 py-2">Customer</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right">Logged Hours</th>
                        <th className="px-4 py-2 text-right">Estimated Hours</th>
                        <th className="px-4 py-2">Active Crew</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-250">
                      {filteredData.jobs.map((j) => (
                        <tr key={j.id}>
                          <td className="px-4 py-2 font-bold">{j.name || 'Job'}</td>
                          <td className="px-4 py-2">{j.customerName || j.customer?.name || 'N/A'}</td>
                          <td className="px-4 py-2 capitalize">{j.status || 'pending'}</td>
                          <td className="px-4 py-2 text-right font-mono">{j.loggedHours.toFixed(1)}h</td>
                          <td className="px-4 py-2 text-right font-mono">{j.estimatedHours ? `${j.estimatedHours.toFixed(1)}h` : '--'}</td>
                          <td className="px-4 py-2 font-semibold">{j.technicians.join(', ') || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Section 4: Flagged Anomalies */}
                {summaryStats.anomalies > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-rose-600 border-b border-rose-200 pb-1">4. Attendance Flags & Anomalies Audit</h3>
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
                              <td className="px-4 py-2 font-bold">{s.name}</td>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
