import { useState, useMemo, useEffect, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, orderBy, getDocs, doc, getDoc, collectionGroup } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  X, Printer, Download, Search, AlertTriangle, 
  CheckCircle, Calendar, ArrowRight, Clock, Info,
  Building2
} from 'lucide-react';
import { toast } from 'sonner';

interface TimeSession {
  id: string;
  userId: string;
  userName?: string;
  payType?: string;
  clockIn: {
    timestamp: any;
    location?: string;
    onSite?: boolean;
  };
  clockOut?: {
    timestamp: any;
    location?: string;
    onSite?: boolean;
  };
  isRemote?: boolean;
  breaks: Array<{
    type: 'lunch' | 'normal';
    start: any;
    end?: any;
    isPaid: boolean;
  }>;
  jobs?: Array<{
    id: string;
    name: string;
    start: any;
    end?: any;
    taskId?: string | null;
    taskName?: string | null;
    bookTime?: number;
  }>;
  status: string;
  verificationStatus?: string;
  source?: string;
  notes?: string;
  manuallyEdited?: boolean;
  lastEditedBy?: string;
  lastEditedById?: string;
}

interface WeeklyTimeclockReportModalProps {
  tenantId: string;
  onClose?: () => void;
  isInline?: boolean;
}

type RangePreset = 'monday_combo' | 'prev_week' | 'current_week' | 'last_30' | 'custom';

// Date Helpers
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

const getWeekNumber = (d: Date) => {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
};

const formatDateShort = (date: Date) => {
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatDateFull = (date: Date) => {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const formatSegmentTime = (start: any, end: any) => {
  if (!start) return '';
  const startDate = start.toDate ? start.toDate() : new Date(start);
  const startStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!end) return `${startStr} - Active`;
  const endDate = end.toDate ? end.toDate() : new Date(end);
  const endStr = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (startDate.toDateString() !== endDate.toDateString()) {
    const endDayStr = endDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${startStr} - ${endDayStr} ${endStr}`;
  }
  return `${startStr} - ${endStr}`;
};

export function WeeklyTimeclockReportModal({ tenantId, onClose, isInline = false }: WeeklyTimeclockReportModalProps) {
  const [preset, setPreset] = useState<RangePreset>('current_week');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDiscrepanciesOnly, setShowDiscrepanciesOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<'reconcile' | 'print'>('reconcile');
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

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

  // Set default preset once business settings load
  useEffect(() => {
    if (business) {
      const cycle = business.payrollCycle || 'weekly';
      setPreset(cycle === 'weekly' ? 'current_week' : 'monday_combo');
    }
  }, [business]);

  const comboLabel = useMemo(() => {
    const weekEndDay = business?.payrollWeekEndDay !== undefined ? Number(business.payrollWeekEndDay) : 0;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const startDayName = days[(weekEndDay + 1) % 7];
    return `${startDayName} Combo (Prev + Current)`;
  }, [business]);

  // Custom date range inputs
  const [customStartStr, setCustomStartStr] = useState(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [customEndStr, setCustomEndStr] = useState(new Date().toISOString().split('T')[0]);

  // Compute start/end dates based on preset
  const { startDate, endDate, week1Start, week1End, week2Start, week2End, week1No, week2No } = useMemo(() => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    const weekEndDay = business?.payrollWeekEndDay !== undefined ? Number(business.payrollWeekEndDay) : 0; // default Sunday

    // Current week start based on business settings
    const w2Start = getPayrollWeekStart(today, weekEndDay);
    // Current week end: start + 7 days - 1ms
    const w2End = new Date(w2Start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

    // Week 1 (Previous Week)
    const w1Start = new Date(w2Start.getTime() - 7 * 24 * 60 * 60 * 1000);
    const w1End = new Date(w2Start.getTime() - 1);

    if (preset === 'monday_combo') {
      start = w1Start;
      end = w2End;
    } else if (preset === 'prev_week') {
      start = w1Start;
      end = w1End;
    } else if (preset === 'current_week') {
      start = w2Start;
      end = w2End;
    } else if (preset === 'last_30') {
      start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      start.setHours(0,0,0,0);
      end = new Date(today);
      end.setHours(23,59,59,999);
    } else { // custom
      start = new Date(customStartStr + 'T00:00:00');
      end = new Date(customEndStr + 'T23:59:59');
    }

    const week1No = getWeekNumber(w1Start);
    const week2No = getWeekNumber(w2Start);

    return {
      startDate: start,
      endDate: end,
      week1Start: w1Start,
      week1End: w1End,
      week2Start: w2Start,
      week2End: w2End,
      week1No,
      week2No
    };
  }, [preset, customStartStr, customEndStr, business]);

  const showWeek1Columns = useMemo(() => {
    return preset === 'monday_combo' || preset === 'prev_week' || preset === 'last_30' || preset === 'custom';
  }, [preset]);

  const showWeek2Columns = useMemo(() => {
    return preset === 'monday_combo' || preset === 'current_week' || preset === 'last_30' || preset === 'custom';
  }, [preset]);

  // Fetch all time sessions in range
  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['report-time-sessions', tenantId, startDate.getTime(), endDate.getTime()],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('clockIn.timestamp', '>=', startDate),
        where('clockIn.timestamp', '<=', endDate),
        orderBy('clockIn.timestamp', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeSession));
    }
  });

  // Fetch active staff list
  const { data: staffList, isLoading: staffLoading } = useQuery({
    queryKey: ['report-staff-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    }
  });

  // Fetch departments list
  const { data: departmentsList } = useQuery({
    queryKey: ['report-departments-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    }
  });

  // Fetch tasks list to verify completion status for flat-rate employees
  const { data: tasksList } = useQuery({
    queryKey: ['report-tasks-list', tenantId],
    queryFn: async () => {
      const q = query(
        collectionGroup(db, 'tasks'),
        where('tenantId', '==', tenantId)
      );
      const snap = await getDocs(q);
      const tasks = snap.docs
        .filter(d => d.ref.path.startsWith(`businesses/${tenantId}/`))
        .map(d => {
          const parts = d.ref.path.split('/');
          const jobId = parts[3];
          return { id: d.id, jobId, ...d.data() } as any;
        });

      const uniqueJobIds = Array.from(new Set(tasks.map(t => t.jobId).filter(Boolean)));
      const jobMap: Record<string, any> = {};

      if (uniqueJobIds.length > 0) {
        const jobPromises = uniqueJobIds.map(async (jobId) => {
          try {
            const jobSnap = await getDoc(doc(db, 'businesses', tenantId, 'jobs', jobId));
            if (jobSnap.exists()) {
              jobMap[jobId] = jobSnap.data();
            }
          } catch (e) {
            console.error('Error fetching job details:', jobId, e);
          }
        });
        await Promise.all(jobPromises);
      }

      return tasks.map(t => ({
        ...t,
        jobName: jobMap[t.jobId]
          ? (jobMap[t.jobId].jobNumber ? `#${jobMap[t.jobId].jobNumber} - ${jobMap[t.jobId].title}` : jobMap[t.jobId].title)
          : 'Job'
      }));
    }
  });

  const showQbColumns = useMemo(() => {
    return (sessions || []).some(s => s.source === 'QuickBooks');
  }, [sessions]);

  const colSpanCount = useMemo(() => {
    return 5 
      + (showWeek1Columns ? 1 : 0)
      + (showWeek1Columns && showQbColumns ? 1 : 0)
      + (showWeek2Columns ? 1 : 0)
      + (showWeek2Columns && showQbColumns ? 1 : 0)
      + (showQbColumns ? 3 : 0);
  }, [showWeek1Columns, showWeek2Columns, showQbColumns]);

  // Helper calculation functions consistent with TimeclockAdmin.tsx
  const calculateDuration = (start: any, end: any) => {
    if (!start) return 0;
    const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
    const e = end ? (end.toDate ? end.toDate().getTime() : new Date(end).getTime()) : Date.now();
    return Math.max(0, e - s);
  };

  const calculateSessionPayMs = (session: TimeSession, payType?: string) => {
    const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
    const breakMs = (session.breaks || []).reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0);
    const workMs = totalMs - breakMs;

    if (payType === 'hourly' || payType === 'salary') {
      return workMs;
    }

    if (!session.jobs || session.jobs.length === 0) {
      return payType === 'flat_rate' ? 0 : workMs;
    }

    const taskActualTime: Record<string, number> = {};
    const taskBookTime: Record<string, number> = {};
    const taskPayBasis: Record<string, string> = {};

    const sessionEnd = session.clockOut?.timestamp
      ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate().getTime() : new Date(session.clockOut.timestamp).getTime())
      : Date.now();

    session.jobs.forEach((j: any, idx: number) => {
      const key = j.taskId || `manual-${idx}-${j.name}`;
      const start = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
      const end = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : sessionEnd;
      const segMs = Math.max(0, end - start);

      taskActualTime[key] = (taskActualTime[key] || 0) + segMs;
      if (j.bookTime && j.bookTime > 0) {
        taskBookTime[key] = j.bookTime * 3600000;
      }
      taskPayBasis[key] = j.payBasis || 'book_time';
    });

    let totalPayMs = 0;
    Object.keys(taskActualTime).forEach(key => {
      const actualMs = taskActualTime[key] || 0;
      const bookMs = taskBookTime[key] || 0;
      const basis = taskPayBasis[key] || 'book_time';

      if (basis === 'hourly' || bookMs === 0) {
        totalPayMs += actualMs;
      }
    });

    return Math.min(workMs, totalPayMs);
  };

  const formatDurationDecimal = (ms: number) => {
    return (ms / 3600000).toFixed(2);
  };

  // Process and group the timecard entries by employee
  const reportData = useMemo(() => {
    if (!sessions || !staffList) return [];

    const employeeMap = new Map<string, any>();

    const getPayTypeForWeek = (emp: any, isWeek1: boolean) => {
      const weekSessions = emp.sessions.filter((s: any) => {
        const clockInDate = s.clockIn.timestamp?.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
        const time = clockInDate.getTime();
        return isWeek1 
          ? (time >= week1Start.getTime() && time <= week1End.getTime())
          : (time >= week2Start.getTime() && time <= week2End.getTime());
      });
      for (const s of weekSessions) {
        if (s.payType) return s.payType;
      }
      return emp.payType;
    };

    // Initialise map with all fetched staff to show zero entries too (unless filtered out later)
    staffList.forEach((s: any) => {
      if (s.isArchived || s.fireDate) return; // skip archived
      const dept = departmentsList?.find((d: any) => d.id === s.departmentId);
      const resolvedPayType = s.payType && s.payType !== 'inherit'
        ? s.payType
        : (dept?.defaultPayType || 'hourly');
      employeeMap.set(s.userId || s.id, {
        userId: s.userId || s.id,
        staffId: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        payType: resolvedPayType,
        departmentId: s.departmentId || '',
        sessions: [],
        completedTasks: [],
        totals: {
          week1NativeMs: 0,
          week1QbMs: 0,
          week2NativeMs: 0,
          week2QbMs: 0,
          week1BookMs: 0,
          week2BookMs: 0,
          week1PayMs: 0,
          week2PayMs: 0,
          totalNativeMs: 0,
          totalQbMs: 0,
          totalBookMs: 0,
          totalPayMs: 0,
        }
      });
    });

    // Populate sessions
    sessions.forEach((session: TimeSession) => {
      const uid = session.userId;
      if (!uid) return;

      const rawStaff = staffList.find((s: any) => s.id === uid || s.userId === uid) ||
                       staffList.find((s: any) => {
                         const first = (s.firstName || '').trim().toLowerCase();
                         const last = (s.lastName || '').trim().toLowerCase();
                         const full = `${first} ${last}`.trim();
                         const cleanName = (session.userName || '').trim().toLowerCase();
                         return cleanName === full;
                       });
      const key = rawStaff ? (rawStaff.userId || rawStaff.id) : uid;

      let emp = employeeMap.get(key);
      if (!emp) {
        const dept = departmentsList?.find((d: any) => d.id === rawStaff?.departmentId);
        const resolvedPayType = rawStaff?.payType && rawStaff.payType !== 'inherit'
          ? rawStaff.payType
          : (dept?.defaultPayType || 'hourly');
        emp = {
          userId: uid,
          staffId: rawStaff?.id || uid,
          name: rawStaff ? `${rawStaff.firstName} ${rawStaff.lastName}`.trim() : (session.userName || 'Unknown Staff'),
          payType: resolvedPayType,
          departmentId: rawStaff?.departmentId || '',
          sessions: [],
          completedTasks: [],
          totals: {
            week1NativeMs: 0,
            week1QbMs: 0,
            week2NativeMs: 0,
            week2QbMs: 0,
            week1BookMs: 0,
            week2BookMs: 0,
            week1PayMs: 0,
            week2PayMs: 0,
            totalNativeMs: 0,
            totalQbMs: 0,
            totalBookMs: 0,
            totalPayMs: 0,
          }
        };
        employeeMap.set(key, emp);
      }

      emp.sessions.push(session);

      // Calculations
      const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
      const breakMs = (session.breaks || []).reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0);
      const workMs = Math.max(0, totalMs - breakMs);

      const payMs = calculateSessionPayMs(session, session.payType || emp.payType);

      const isQb = session.source === 'QuickBooks';
      const clockInDate = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);

      // Determine week allocation
      const isWeek1 = clockInDate.getTime() >= week1Start.getTime() && clockInDate.getTime() <= week1End.getTime();
      const isWeek2 = clockInDate.getTime() >= week2Start.getTime() && clockInDate.getTime() <= week2End.getTime();

      if (isQb) {
        emp.totals.totalQbMs += workMs;
        if (isWeek1) emp.totals.week1QbMs += workMs;
        if (isWeek2) emp.totals.week2QbMs += workMs;
      } else {
        emp.totals.totalNativeMs += workMs;
        emp.totals.totalPayMs += payMs;
        if (isWeek1) {
          emp.totals.week1NativeMs += workMs;
          emp.totals.week1PayMs += payMs;
        }
        if (isWeek2) {
          emp.totals.week2NativeMs += workMs;
          emp.totals.week2PayMs += payMs;
        }
      }
    });

    // Apply completed tasks book time to flat-rate employees
    if (tasksList && tasksList.length > 0) {
      tasksList.forEach((task: any) => {
        const compTimeStr = task.completedAt || task.qcCompletedAt;
        if (!compTimeStr) return;
        const compTime = new Date(compTimeStr).getTime();
        if (compTime < startDate.getTime() || compTime > endDate.getTime()) return;

        // Verify status is completed/QC
        const status = (task.status || '').toLowerCase();
        const isCompleted = ['completed', 'qc', 'qc complete'].includes(status);
        if (!isCompleted) return;

        // Skip hourly tasks (since they are paid hourly in sessions)
        if (task.payBasis === 'hourly') return;

        const bookHours = parseFloat(task.bookTime) || 0;
        if (bookHours <= 0) return;

        const bookMs = bookHours * 3600000;

        // Distribute book time to assigned staff members
        const assignments = task.assignedStaff || [];
        assignments.forEach((assign: any) => {
          const staffId = assign.id;
          if (!staffId) return;

          // Find the employee in employeeMap
          const rawStaff = staffList.find((s: any) => s.id === staffId || s.userId === staffId);
          const key = rawStaff ? (rawStaff.userId || rawStaff.id) : staffId;
          const emp = employeeMap.get(key);

          if (emp) {
            const isTaskWeek1 = compTime >= week1Start.getTime() && compTime <= week1End.getTime();
            const taskWeekPayType = getPayTypeForWeek(emp, isTaskWeek1);

            const share = (parseFloat(assign.percentage) || 100) / 100;
            const originalBookMs = bookMs * share;
            const earnedMs = task.isRework ? 0 : originalBookMs;

            const isTaskWeek2 = compTime >= week2Start.getTime() && compTime <= week2End.getTime();

            // Only add to pay hours if flat-rate
            if (taskWeekPayType === 'flat_rate') {
              emp.totals.totalPayMs += earnedMs;
              if (isTaskWeek1) {
                emp.totals.week1PayMs += earnedMs;
              }
              if (isTaskWeek2) {
                emp.totals.week2PayMs += earnedMs;
              }
            }

            // Always add to book time tracking
            emp.totals.totalBookMs += earnedMs;
            if (isTaskWeek1) {
              emp.totals.week1BookMs += earnedMs;
            }
            if (isTaskWeek2) {
              emp.totals.week2BookMs += earnedMs;
            }

            if (!emp.completedTasks) {
              emp.completedTasks = [];
            }
            
            // Calculate actual clocked hours and collect shift segments for this task by this employee in this period
            let taskClockedMs = 0;
            const taskSegments: Array<{ start: any, end: any }> = [];
            if (emp.sessions) {
              emp.sessions.forEach((sess: any) => {
                if (sess.jobs) {
                  sess.jobs.forEach((job: any) => {
                    if (job.taskId === task.id) {
                      const start = job.start?.toDate ? job.start.toDate().getTime() : new Date(job.start).getTime();
                      const end = job.end ? (job.end.toDate ? job.end.toDate().getTime() : new Date(job.end).getTime()) : Date.now();
                      const duration = Math.max(0, end - start);
                      if (duration > 5000) {
                        taskClockedMs += duration;
                        taskSegments.push({ start: job.start, end: job.end });
                      }
                    }
                  });
                }
              });
            }

            // Sort segments chronologically
            taskSegments.sort((a, b) => {
              const aStart = a.start?.toDate ? a.start.toDate().getTime() : new Date(a.start).getTime();
              const bStart = b.start?.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
              return aStart - bStart;
            });

            const formattedSegments = taskSegments.map(seg => formatSegmentTime(seg.start, seg.end));
            const clockedHours = taskClockedMs / 3600000;

            emp.completedTasks.push({
              id: task.id,
              name: task.title || 'Unnamed Task',
              jobName: task.jobName || 'Job',
              completedAt: task.completedAt,
              share,
              bookHours: earnedMs / 3600000,
              originalBookHours: originalBookMs / 3600000,
              isRework: !!task.isRework,
              clockedHours,
              segments: formattedSegments
            });
          }
        });
      });
    }

    // Apply weekly default/allowance book time credits to native pay totals
    employeeMap.forEach(emp => {
      const rawStaff = staffList.find((s: any) => s.id === emp.userId || s.userId === emp.userId);
      const dept = (departmentsList || []).find((d: any) => d.id === emp.departmentId);

      let activeCreditMs = 0;
      if (rawStaff?.payPeriodBookTimeCredit && rawStaff.payPeriodBookTimeCredit > 0) {
        activeCreditMs = rawStaff.payPeriodBookTimeCredit * 3600000;
      } else if (dept?.weeklyBookTimeCredit && dept.weeklyBookTimeCredit > 0) {
        activeCreditMs = dept.weeklyBookTimeCredit * 3600000;
      }

      if (activeCreditMs > 0) {
        // Add credit for week 1 if they have native or QB hours in week 1
        if (emp.totals.week1NativeMs > 0 || emp.totals.week1QbMs > 0) {
          emp.totals.totalPayMs += activeCreditMs;
          emp.totals.week1PayMs += activeCreditMs;
        }
        // Add credit for week 2 if they have native or QB hours in week 2
        if (emp.totals.week2NativeMs > 0 || emp.totals.week2QbMs > 0) {
          emp.totals.totalPayMs += activeCreditMs;
          emp.totals.week2PayMs += activeCreditMs;
        }
      }

      // Sort completed tasks by newest first (completedAt descending)
      if (emp.completedTasks) {
        emp.completedTasks.sort((a: any, b: any) => {
          const aTime = a.completedAt?.toDate ? a.completedAt.toDate().getTime() : new Date(a.completedAt).getTime();
          const bTime = b.completedAt?.toDate ? b.completedAt.toDate().getTime() : new Date(b.completedAt).getTime();
          return bTime - aTime;
        });
      }
    });

    // Convert map to list and filter by search and discrepancies
    return Array.from(employeeMap.values())
      .map(emp => {
        // Calculate variance
        const varianceMs = emp.totals.totalNativeMs - emp.totals.totalQbMs;
        const hasDiscrepancy = Math.abs(varianceMs) > 60000; // variance > 1 minute

        // Sort employee's sessions chronologically
        emp.sessions.sort((a: TimeSession, b: TimeSession) => {
          const aTime = a.clockIn.timestamp?.toDate ? a.clockIn.timestamp.toDate().getTime() : new Date(a.clockIn.timestamp).getTime();
          const bTime = b.clockIn.timestamp?.toDate ? b.clockIn.timestamp.toDate().getTime() : new Date(b.clockIn.timestamp).getTime();
          return aTime - bTime;
        });

        return {
          ...emp,
          varianceMs,
          hasDiscrepancy
        };
      })
      .filter(emp => {
        const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDiscrepancy = !showQbColumns || !showDiscrepanciesOnly || emp.hasDiscrepancy;
        
        // Hide if no sessions exist AND they are searched, unless we search by name specifically
        const hasSessions = emp.sessions.length > 0;
        return matchesSearch && matchesDiscrepancy && (hasSessions || searchTerm !== '');
      })
      .sort((a, b) => {
        const aDept = departmentsList?.find((d: any) => d.id === a.departmentId)?.name || 'Unassigned';
        const bDept = departmentsList?.find((d: any) => d.id === b.departmentId)?.name || 'Unassigned';
        
        // Put 'Unassigned' at the end of the report
        if (aDept === 'Unassigned' && bDept !== 'Unassigned') return 1;
        if (bDept === 'Unassigned' && aDept !== 'Unassigned') return -1;
        
        const deptCompare = aDept.localeCompare(bDept);
        if (deptCompare !== 0) return deptCompare;
        return a.name.localeCompare(b.name);
      });
  }, [sessions, staffList, departmentsList, searchTerm, showDiscrepanciesOnly, week1Start, week1End, week2Start, week2End, showQbColumns]);

  // Overall totals for report summary cards
  const overallTotals = useMemo(() => {
    let nativeMs = 0;
    let qbMs = 0;
    let bookMs = 0;
    let payMs = 0;
    let discrepancyCount = 0;

    reportData.forEach(emp => {
      nativeMs += emp.totals.totalNativeMs;
      qbMs += emp.totals.totalQbMs;
      bookMs += emp.totals.totalBookMs;
      payMs += emp.totals.totalPayMs;
      if (emp.hasDiscrepancy) discrepancyCount++;
    });

    return {
      nativeHrs: nativeMs / 3600000,
      qbHrs: qbMs / 3600000,
      bookHrs: bookMs / 3600000,
      payHrs: payMs / 3600000,
      varianceHrs: (nativeMs - qbMs) / 3600000,
      discrepancyCount
    };
  }, [reportData]);

  // Download CSV logic
  const handleExportCSV = () => {
    try {
      const headers = [
        'Staff Member',
        'Pay Type',
        ...(showWeek1Columns ? [
          `Week ${week1No} (${formatDateShort(week1Start)} - ${formatDateShort(week1End)}) Clocked Hours`,
          `Week ${week1No} (${formatDateShort(week1Start)} - ${formatDateShort(week1End)}) QB Hours`
        ] : []),
        ...(showWeek2Columns ? [
          `Week ${week2No} (${formatDateShort(week2Start)} - ${formatDateShort(week2End)}) Clocked Hours`,
          `Week ${week2No} (${formatDateShort(week2Start)} - ${formatDateShort(week2End)}) QB Hours`
        ] : []),
        'Total Clocked Hours',
        'Total QuickBooks Hours',
        'Variance (Clocked - QB)',
        'Total Pay Hours',
        'Total Book Hours'
      ];

      const rows = reportData.map(emp => [
        `"${emp.name}"`,
        emp.payType,
        ...(showWeek1Columns ? [
          (emp.totals.week1NativeMs / 3600000).toFixed(2),
          (emp.totals.week1QbMs / 3600000).toFixed(2)
        ] : []),
        ...(showWeek2Columns ? [
          (emp.totals.week2NativeMs / 3600000).toFixed(2),
          (emp.totals.week2QbMs / 3600000).toFixed(2)
        ] : []),
        (emp.totals.totalNativeMs / 3600000).toFixed(2),
        (emp.totals.totalQbMs / 3600000).toFixed(2),
        (emp.varianceMs / 3600000).toFixed(2),
        (emp.totals.totalPayMs / 3600000).toFixed(2),
        (emp.totals.totalBookMs / 3600000).toFixed(2)
      ]);

      const csvContent = [
        `"Timeclock Reconciliation Report: ${formatDateShort(startDate)} - ${formatDateShort(endDate)} (Tenant: ${tenantId})"\n`,
        headers.join(','),
        ...rows.map(r => r.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `timeclock_comparison_${preset}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Comparison report exported successfully');
    } catch (e) {
      toast.error('Failed to export CSV report');
      console.error(e);
    }
  };

  const handlePrint = () => {
    setActiveTab('print');
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleExportDetailedSessionsCSV = () => {
    try {
      const headers = [
        'Staff Member',
        'User ID',
        'Date',
        'Clock In Date Time',
        'Clock Out Date Time',
        'Break Duration (Hours)',
        'Actual Work Hours',
        'Book Hours Recorded',
        'Calculated Pay Hours',
        'Remote',
        'Status',
        'Data Source'
      ];

      const rows = (sessions || []).map(s => {
        const staff = staffList?.find((st: any) => st.userId === s.userId || st.id === s.userId);
        const displayName = staff ? `${staff.firstName} ${staff.lastName}`.trim() : (s.userName || 'Technician');
        
        const totalMs = calculateDuration(s.clockIn.timestamp, s.clockOut?.timestamp);
        const breakMs = (s.breaks || []).reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0);
        const workMs = Math.max(0, totalMs - breakMs);
        
        // Calculate pay hours - use hourly if QuickBooks session, otherwise check staff/session payType
        const dept = departmentsList?.find((d: any) => d.id === staff?.departmentId);
        const currentStaffResolvedPayType = staff?.payType && staff.payType !== 'inherit'
          ? staff.payType
          : (dept?.defaultPayType || 'hourly');
        const resolvedPayType = s.payType || (s.source === 'QuickBooks' ? 'hourly' : currentStaffResolvedPayType);
        const payMs = calculateSessionPayMs(s, resolvedPayType);
        
        const bookMs = (() => {
          if (!s.jobs || s.jobs.length === 0) return 0;
          const taskBookTime: Record<string, number> = {};
          s.jobs.forEach((j: any, idx: number) => {
            const key = j.taskId || `manual-${idx}-${j.name}`;
            if (j.bookTime && j.bookTime > 0) {
              taskBookTime[key] = j.bookTime * 3600000;
            }
          });
          return Object.values(taskBookTime).reduce((acc, t) => acc + t, 0);
        })();

        const formatFullDateTimeCSV = (ts: any) => {
          if (!ts) return '';
          const date = ts.toDate ? ts.toDate() : new Date(ts);
          return date.toLocaleString();
        };

        const formatJustDateCSV = (ts: any) => {
          if (!ts) return '';
          const date = ts.toDate ? ts.toDate() : new Date(ts);
          return date.toLocaleDateString();
        };

        return [
          `"${displayName}"`,
          s.userId || '',
          formatJustDateCSV(s.clockIn.timestamp),
          `"${formatFullDateTimeCSV(s.clockIn.timestamp)}"`,
          s.clockOut?.timestamp ? `"${formatFullDateTimeCSV(s.clockOut.timestamp)}"` : 'Active Shift',
          (breakMs / 3600000).toFixed(2),
          (workMs / 3600000).toFixed(2),
          (bookMs / 3600000).toFixed(2),
          (payMs / 3600000).toFixed(2),
          s.isRemote ? 'Yes' : 'No',
          s.status || '',
          s.source || 'Native'
        ];
      });

      const csvContent = [
        headers.join(','),
        ...rows.map(r => r.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `detailed_payroll_logs_${preset}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Detailed payroll logs exported successfully');
    } catch (e) {
      toast.error('Failed to export detailed logs CSV');
      console.error(e);
    }
  };

  const styleBlock = (
    <style dangerouslySetInnerHTML={{__html: `
      @media print {
        /* Hide sidebar, dashboards, navbars, filters */
        ${!isInline ? `
        #root > div > div:first-child,
        #root > div > div > header,
        #root > div > div > main > div:first-child,
        ` : ''}
        .no-print,
        .print-hidden,
        button,
        input,
        select {
          display: none !important;
        }
        
        /* Reset layout scroll containers on print */
        body, html, #root, #root > div, main, .flex-1 {
          height: auto !important;
          overflow: visible !important;
          max-height: none !important;
        }
        
        /* Modal framing adjustments */
        .fixed {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: auto !important;
          background: white !important;
          padding: 0 !important;
          margin: 0 !important;
          z-index: 9999 !important;
          overflow: visible !important;
        }
        
        .bg-white, .dark\\:bg-zinc-900, .bg-zinc-50, .dark\\:bg-zinc-800\\/50 {
          background-color: white !important;
          color: black !important;
          border-color: #d4d4d8 !important;
          box-shadow: none !important;
        }

        .text-white, .dark\\:text-white {
          color: black !important;
        }

        .rounded-3xl, .rounded-2xl, .rounded-xl {
          border-radius: 0 !important;
        }

        /* Force tables to expand to full size */
        table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin-top: 1rem !important;
          margin-bottom: 2rem !important;
          page-break-inside: auto !important;
        }

        tr {
          page-break-inside: avoid !important;
          page-break-after: auto !important;
        }

        thead {
          display: table-header-group !important;
        }

        /* Page break before each employee timesheet card in Print View */
        .print-page-break {
          page-break-before: always !important;
          break-before: page !important;
          border-top: 2px solid #000 !important;
          padding-top: 2rem !important;
          margin-top: 2rem !important;
        }
        
        /* Make content area scroll-free on print */
        .max-h-\\[75vh\\], .overflow-y-auto {
          max-h: none !important;
          overflow: visible !important;
        }
      }
    `}} />
  );

  const renderContent = () => (
    <div className={isInline 
      ? "bg-white dark:bg-zinc-900 w-full rounded-[2rem] border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col print:border-none print:w-full print:h-auto print:max-w-none print:rounded-none"
      : "bg-white dark:bg-zinc-900 w-full max-w-6xl h-[90vh] rounded-[2rem] shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col animate-in zoom-in-95 duration-250 print:border-none print:shadow-none print:w-full print:h-auto print:max-w-none print:rounded-none"
    }>
        
        {/* Header - Hidden on Print */}
        <div className="p-6 border-b border-zinc-150 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/20 print-hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 rounded-2xl">
              <Calendar className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                Weekly Timeclock Reconciliation
              </h3>
              <p className="text-xs text-zinc-500 font-medium">
                Verify local clock-ins side-by-side with official QuickBooks sync logs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-bold hover:scale-105 transition-all shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Print Timesheets
            </button>
            <button 
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold hover:scale-105 transition-all cursor-pointer"
              title="Export employee totals & discrepancy variance overview"
            >
              <Download className="w-4 h-4" /> Export Summary
            </button>
            <button 
              onClick={handleExportDetailedSessionsCSV}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold hover:scale-105 transition-all cursor-pointer shadow-md shadow-emerald-500/10"
              title="Export all individual clock-in/out shifts for the selected date range"
            >
              <Download className="w-4 h-4" /> Export Detailed Logs
            </button>
            {!isInline && onClose && (
              <button 
                onClick={onClose} 
                className="p-2 text-zinc-400 hover:text-zinc-650 dark:hover:text-white transition-colors cursor-pointer bg-zinc-100 dark:bg-zinc-800 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls Bar - Hidden on Print */}
        <div className="p-6 border-b border-zinc-150 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4 print-hidden">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            
            {/* Preset Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest mr-2">Range:</span>
              <div className="flex p-1 bg-zinc-150 dark:bg-zinc-800 rounded-xl">
                {[
                  ...((business?.payrollCycle || 'weekly') === 'weekly' ? [] : [{ id: 'monday_combo', label: comboLabel }]),
                  { id: 'prev_week', label: 'Previous Week' },
                  { id: 'current_week', label: 'Current Week' },
                  { id: 'last_30', label: 'Last 30 Days' },
                  { id: 'custom', label: 'Custom' }
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPreset(p.id as RangePreset)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      preset === p.id 
                        ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm' 
                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* View Mode Tabs */}
            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl shrink-0">
              <button
                onClick={() => setActiveTab('reconcile')}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'reconcile' 
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20' 
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                }`}
              >
                Comparison Sheet
              </button>
              <button
                onClick={() => setActiveTab('print')}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'print' 
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20' 
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                }`}
              >
                Print Sheets
              </button>
            </div>
          </div>

          {/* Custom Date Picker Fields */}
          {preset === 'custom' && (
            <div className="flex flex-wrap items-center gap-4 bg-zinc-50 dark:bg-zinc-950/30 p-4 rounded-2xl border border-zinc-150 dark:border-zinc-850 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="text-zinc-400">Start Date:</span>
                <input 
                  type="date"
                  value={customStartStr}
                  onChange={(e) => setCustomStartStr(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-900 dark:text-white"
                />
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-400" />
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="text-zinc-400">End Date:</span>
                <input 
                  type="date"
                  value={customEndStr}
                  onChange={(e) => setCustomEndStr(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* Search and Flag Filter */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between pt-2">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search employee name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-zinc-900 dark:text-white text-xs"
              />
            </div>

            {showQbColumns && (
              <label className="flex items-center gap-2.5 text-xs font-bold cursor-pointer select-none shrink-0">
                <input 
                  type="checkbox" 
                  checked={showDiscrepanciesOnly}
                  onChange={(e) => setShowDiscrepanciesOnly(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <span className="text-zinc-650 dark:text-zinc-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Show QuickBooks Discrepancies Only
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Report Content Panel */}
        <div className={`${isInline ? 'p-6 md:p-8 space-y-6' : 'flex-1 overflow-y-auto p-6 md:p-8 space-y-6'} print:p-0 print:overflow-visible`}>
          
          {/* Print Only Title Section */}
          <div className="hidden print:block border-b-2 border-zinc-950 pb-6 mb-8">
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight">
                  {business?.name ? `${business.name} Timeclock Log` : 'UpfittersOS Timeclock Log'}
                </h1>
                <p className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mt-1">
                  Weekly Audit & Reconciliation Sheet • Powered by UpfittersOS
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-mono font-bold">Report Period</p>
                <p className="text-base font-black font-mono mt-0.5">{formatDateShort(startDate)} — {formatDateShort(endDate)}</p>
              </div>
            </div>
          </div>

          {/* Overall Stats Cards */}
          <div className={`grid grid-cols-2 ${showQbColumns ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4`}>
            <div className="bg-zinc-50 dark:bg-zinc-950/20 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Total Employees</span>
              <p className="text-2xl font-black text-zinc-900 dark:text-white mt-1">{reportData.length}</p>
            </div>
            
            <div className="bg-zinc-50 dark:bg-zinc-950/20 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Clocked Hours</span>
              <p className="text-2xl font-black text-zinc-900 dark:text-white mt-1">{overallTotals.nativeHrs.toFixed(1)}h</p>
            </div>

            {!showQbColumns && (
              <div className="bg-zinc-50 dark:bg-zinc-950/20 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Pay Hours</span>
                <p className="text-2xl font-black text-indigo-500 mt-1">{overallTotals.payHrs.toFixed(1)}h</p>
              </div>
            )}

            {!showQbColumns && (
              <div className="bg-zinc-50 dark:bg-zinc-950/20 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Book Hours</span>
                <p className="text-2xl font-black text-emerald-500 mt-1">{overallTotals.bookHrs.toFixed(1)}h</p>
              </div>
            )}

            {showQbColumns && (
              <>
                <div className="bg-zinc-50 dark:bg-zinc-950/20 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">QuickBooks Sync</span>
                  <p className="text-2xl font-black text-indigo-500 mt-1">{overallTotals.qbHrs.toFixed(1)}h</p>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-950/20 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Net Variance</span>
                  <p className={`text-2xl font-black mt-1 ${Math.abs(overallTotals.varianceHrs) > 0.1 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {overallTotals.varianceHrs > 0 ? '+' : ''}{overallTotals.varianceHrs.toFixed(1)}h
                  </p>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-950/20 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 shadow-sm flex flex-col justify-between col-span-2 md:col-span-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Discrepancies</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <p className="text-2xl font-black text-zinc-900 dark:text-white">{overallTotals.discrepancyCount}</p>
                    {overallTotals.discrepancyCount > 0 && (
                      <span className="bg-amber-500 text-white rounded-full px-2 py-0.5 text-[10px] font-black uppercase">
                        Alert
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {sessionsLoading || staffLoading || !tasksList ? (
            <div className="p-12 text-center text-zinc-500 italic">Processing timesheets...</div>
          ) : reportData.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 italic border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
              No timecard records found for the selected period.
            </div>
          ) : activeTab === 'reconcile' ? (
            
            /* TAB 1: Comparison Overview Sheet */
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 dark:bg-zinc-850/60 text-zinc-500 uppercase text-[9px] font-bold tracking-widest border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-6 py-4">Employee</th>
                      <th className="px-6 py-4 text-center">Pay Type</th>
                      {showWeek1Columns && (
                        <>
                          <th className="px-6 py-4 text-right">W{week1No} Clocked</th>
                          {showQbColumns && <th className="px-6 py-4 text-right">W{week1No} QuickBooks</th>}
                        </>
                      )}
                      {showWeek2Columns && (
                        <>
                          <th className="px-6 py-4 text-right">W{week2No} Clocked</th>
                          {showQbColumns && <th className="px-6 py-4 text-right">W{week2No} QuickBooks</th>}
                        </>
                      )}
                      <th className="px-6 py-4 text-right font-bold text-zinc-800 dark:text-zinc-200">Total Clocked</th>
                      {showQbColumns && <th className="px-6 py-4 text-right font-bold text-indigo-600 dark:text-indigo-400">Total QB</th>}
                      <th className="px-6 py-4 text-right font-bold text-emerald-600 dark:text-emerald-400">Total Book</th>
                      <th className="px-6 py-4 text-right font-bold text-indigo-600 dark:text-indigo-400">Total Pay</th>
                      {showQbColumns && <th className="px-6 py-4 text-right">Variance</th>}
                      {showQbColumns && <th className="px-6 py-4 text-center">Status</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-150 dark:divide-zinc-800">
                    {reportData.map(emp => {
                      const w1NativeHrs = emp.totals.week1NativeMs / 3600000;
                      const w1QbHrs = emp.totals.week1QbMs / 3600000;
                      const w2NativeHrs = emp.totals.week2NativeMs / 3600000;
                      const w2QbHrs = emp.totals.week2QbMs / 3600000;
                      const totalOS = emp.totals.totalNativeMs / 3600000;
                      const totalQB = emp.totals.totalQbMs / 3600000;
                      const totalBook = emp.totals.totalBookMs / 3600000;
                      const totalPay = emp.totals.totalPayMs / 3600000;
                      const variance = emp.varianceMs / 3600000;

                      return (
                        <Fragment key={emp.userId}>
                          <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors">
                            <td className="px-6 py-4 font-bold text-zinc-900 dark:text-white">
                              <Link
                                to={`/business/${tenantId}/staff/${emp.staffId}`}
                                onClick={() => onClose?.()}
                                className="hover:text-indigo-650 dark:hover:text-indigo-400 hover:underline cursor-pointer text-left focus:outline-none"
                              >
                                {emp.name}
                              </Link>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-2 py-0.5 rounded uppercase font-black text-[9px] ${
                                emp.payType === 'flat_rate'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                  : emp.payType === 'salary'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                              }`}>
                                {emp.payType === 'flat_rate' ? 'Flat' : emp.payType === 'salary' ? 'Salary' : 'Hourly'}
                              </span>
                            </td>
                            {showWeek1Columns && (
                              <>
                                <td className="px-6 py-4 text-right font-mono text-zinc-500">
                                  {w1NativeHrs > 0 ? w1NativeHrs.toFixed(2) : '-'}
                                </td>
                                {showQbColumns && (
                                  <td className="px-6 py-4 text-right font-mono text-indigo-500/80">
                                    {w1QbHrs > 0 ? w1QbHrs.toFixed(2) : '-'}
                                  </td>
                                )}
                              </>
                            )}
                            {showWeek2Columns && (
                              <>
                                <td className="px-6 py-4 text-right font-mono text-zinc-500">
                                  {w2NativeHrs > 0 ? w2NativeHrs.toFixed(2) : '-'}
                                </td>
                                {showQbColumns && (
                                  <td className="px-6 py-4 text-right font-mono text-indigo-500/80">
                                    {w2QbHrs > 0 ? w2QbHrs.toFixed(2) : '-'}
                                  </td>
                                )}
                              </>
                            )}
                            <td className="px-6 py-4 text-right font-mono font-bold text-zinc-800 dark:text-zinc-200">
                              {totalOS > 0 ? totalOS.toFixed(2) : '0.00'}
                            </td>
                            {showQbColumns && (
                              <td className="px-6 py-4 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                {totalQB > 0 ? totalQB.toFixed(2) : '0.00'}
                              </td>
                            )}
                            <td className="px-6 py-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              {totalBook > 0 ? totalBook.toFixed(2) : '0.00'}
                            </td>
                            <td className="px-6 py-4 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              <div className="flex items-center justify-end gap-1.5">
                                <span>{totalPay > 0 ? totalPay.toFixed(2) : '0.00'}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedEmployeeId(expandedEmployeeId === emp.userId ? null : emp.userId);
                                  }}
                                  className="p-1 hover:bg-zinc-150 dark:hover:bg-zinc-800 rounded text-zinc-450 hover:text-indigo-550 transition-colors cursor-pointer"
                                  title="Show Pay Calculation Details"
                                >
                                  <Info className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                            {showQbColumns && (
                              <td className={`px-6 py-4 text-right font-mono font-extrabold ${
                                Math.abs(variance) > 0.1 
                                  ? (variance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-450')
                                  : 'text-zinc-400'
                              }`}>
                                {variance !== 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(2)}` : '0.00'}
                              </td>
                            )}
                            {showQbColumns && (
                              <td className="px-6 py-4 text-center">
                                {emp.hasDiscrepancy ? (
                                  <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded font-black uppercase text-[9px]">
                                    <AlertTriangle className="w-2.5 h-2.5" /> Discrepancy
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded font-black uppercase text-[9px]">
                                    <CheckCircle className="w-2.5 h-2.5" /> Aligned
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                          {expandedEmployeeId === emp.userId && (() => {
                            const rawStaff = (staffList || []).find((s: any) => s.id === emp.userId || s.userId === emp.userId);
                            const dept = (departmentsList || []).find((d: any) => d.id === emp.departmentId);
                            let activeCreditMs = 0;
                            if (rawStaff?.payPeriodBookTimeCredit && rawStaff.payPeriodBookTimeCredit > 0) {
                              activeCreditMs = rawStaff.payPeriodBookTimeCredit * 3600000;
                            } else if (dept?.weeklyBookTimeCredit && dept.weeklyBookTimeCredit > 0) {
                              activeCreditMs = dept.weeklyBookTimeCredit * 3600000;
                            }
                            
                            let totalCreditMs = 0;
                            if (activeCreditMs > 0) {
                              if (emp.totals.week1NativeMs > 0 || emp.totals.week1QbMs > 0) totalCreditMs += activeCreditMs;
                              if (emp.totals.week2NativeMs > 0 || emp.totals.week2QbMs > 0) totalCreditMs += activeCreditMs;
                            }

                            const sessionHourlyPayMs = emp.payType === 'flat_rate'
                              ? emp.sessions.filter((s: TimeSession) => s.source !== 'QuickBooks').reduce((acc: number, s: TimeSession) => {
                                  const sPayType = s.payType || emp.payType;
                                  return acc + calculateSessionPayMs(s, sPayType);
                                }, 0)
                              : 0;

                            const completedBookMs = emp.payType === 'flat_rate'
                              ? (emp.completedTasks || []).reduce((acc: number, t: any) => acc + (t.bookHours * 3600000), 0)
                              : 0;

                            return (
                              <tr className="bg-zinc-50/70 dark:bg-zinc-900/40 select-text">
                                <td colSpan={colSpanCount} className="px-6 py-5 border-t border-b border-zinc-150 dark:border-zinc-800">
                                  <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 text-xs text-zinc-650 dark:text-zinc-350 space-y-4 shadow-sm">
                                    <div className="flex justify-between items-center border-b border-zinc-150 dark:border-zinc-800 pb-2.5">
                                      <h5 className="font-bold text-zinc-850 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                                        <Info className="w-4 h-4 text-indigo-500" /> Pay Formula & Calculations: {emp.name}
                                      </h5>
                                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded animate-pulse">
                                        Pay Type: {emp.payType === 'flat_rate' ? 'Flat-Rate' : emp.payType === 'salary' ? 'Salary' : 'Hourly'}
                                      </span>
                                    </div>

                                    {emp.payType === 'flat_rate' ? (
                                      <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-medium">
                                          <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-xl border border-zinc-150 dark:border-zinc-850 space-y-1">
                                            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">1. Hourly Session Time</span>
                                            <p className="text-sm font-black text-zinc-850 dark:text-white font-mono">{(sessionHourlyPayMs / 3600000).toFixed(2)}h</p>
                                            <p className="text-[10px] text-zinc-450 leading-relaxed mt-1">Clocked time spent on general/hourly tasks inside sessions, capped at total session work hours.</p>
                                          </div>
                                          <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-xl border border-zinc-150 dark:border-zinc-855 space-y-1">
                                            <span className="text-[9px] font-black text-emerald-555 uppercase tracking-widest block">2. Completed Book Time</span>
                                            <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">{(completedBookMs / 3600000).toFixed(2)}h</p>
                                            <p className="text-[10px] text-zinc-450 leading-relaxed mt-1">Book hours earned from flat-rate tasks completed in this pay period.</p>
                                          </div>
                                          <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-xl border border-zinc-150 dark:border-zinc-855 space-y-1">
                                            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block">3. Allowance / Credits</span>
                                            <p className="text-sm font-black text-indigo-650 dark:text-indigo-400 font-mono">{(totalCreditMs / 3600000).toFixed(2)}h</p>
                                            <p className="text-[10px] text-zinc-450 leading-relaxed mt-1">Weekly credit default allowance ({activeCreditMs ? `${(activeCreditMs / 3600000).toFixed(1)}h/wk` : '0h'}) applied for active weeks.</p>
                                          </div>
                                        </div>

                                        {emp.completedTasks && emp.completedTasks.length > 0 && (
                                          <div className="border border-zinc-150 dark:border-zinc-800 rounded-xl overflow-hidden">
                                            <div className="bg-zinc-50 dark:bg-zinc-900/50 px-4 py-2 border-b border-zinc-150 dark:border-zinc-800">
                                              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Earned Task Breakdown</span>
                                            </div>
                                            <table className="w-full text-left border-collapse">
                                              <thead>
                                                <tr className="bg-zinc-50/20 dark:bg-zinc-900/20 text-[9px] uppercase font-bold text-zinc-450 border-b border-zinc-150 dark:border-zinc-800">
                                                  <th className="px-4 py-2">Completed Date</th>
                                                  <th className="px-4 py-2">Job Name</th>
                                                  <th className="px-4 py-2">Task</th>
                                                  <th className="px-4 py-2 text-right">Share %</th>
                                                  <th className="px-4 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">Earned Hours</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-zinc-150 dark:divide-zinc-850 font-medium text-zinc-700 dark:text-zinc-300">
                                                {emp.completedTasks.map((t: any, idx: number) => {
                                                  const compDate = t.completedAt?.toDate ? t.completedAt.toDate() : new Date(t.completedAt);
                                                  return (
                                                    <tr key={idx} className="text-[11px]">
                                                      <td className="px-4 py-2 whitespace-nowrap text-zinc-450 font-mono">{compDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}</td>
                                                      <td className="px-4 py-2 truncate max-w-[150px]">{t.jobName}</td>
                                                      <td className="px-4 py-2 truncate max-w-[200px] text-zinc-500 dark:text-zinc-400">{t.name}</td>
                                                      <td className="px-4 py-2 text-right font-mono">{(t.share * 100).toFixed(0)}%</td>
                                                      <td className="px-4 py-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                        {t.isRework ? (
                                                          <span className="bg-rose-500/10 text-rose-600 dark:text-rose-450 px-1.5 py-0.5 rounded text-[9px] uppercase font-black">Rework</span>
                                                        ) : (
                                                          `${t.bookHours.toFixed(2)}h`
                                                        )}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}

                                        <div className="bg-indigo-50/30 dark:bg-indigo-950/5 p-3.5 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-[13px] font-bold">
                                          <span className="text-zinc-550 dark:text-zinc-450">Calculation Formula:</span>
                                          <span className="font-mono text-indigo-650 dark:text-indigo-400 text-right">
                                            {(sessionHourlyPayMs / 3600000).toFixed(2)}h (Hourly) + {(completedBookMs / 3600000).toFixed(2)}h (Book) {totalCreditMs > 0 ? `+ ${(totalCreditMs / 3600000).toFixed(2)}h (Credit) ` : ''}= {totalPay.toFixed(2)}h Total
                                          </span>
                                        </div>
                                      </div>
                                    ) : emp.payType === 'hourly' ? (
                                      <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-medium">
                                          <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1">
                                            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">Base Clocked Shift Time</span>
                                            <p className="text-sm font-black text-zinc-850 dark:text-white font-mono">{totalOS.toFixed(2)}h</p>
                                            <p className="text-[10px] text-zinc-450 leading-relaxed mt-1">Actual work time recorded on timecard (clocked hours minus unpaid breaks).</p>
                                          </div>
                                          <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1">
                                            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block">Tracked Book Time</span>
                                            <p className="text-sm font-black text-emerald-600 dark:text-emerald-450 font-mono">{(emp.totals.totalBookMs / 3600000).toFixed(2)}h</p>
                                            <p className="text-[10px] text-zinc-450 leading-relaxed mt-1">Total book hours completed on assigned tasks (tracked for efficiency, does not affect pay).</p>
                                          </div>
                                        </div>

                                        <div className="bg-indigo-50/30 dark:bg-indigo-950/5 p-3.5 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-[13px] font-bold">
                                          <span className="text-zinc-550 dark:text-zinc-450">Calculation Formula:</span>
                                          <span className="font-mono text-indigo-650 dark:text-indigo-400 text-right">
                                            {totalOS.toFixed(2)}h (Base Clocked) = {totalPay.toFixed(2)}h Total
                                          </span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        <p className="font-bold text-zinc-850 dark:text-zinc-200">Salary Pay Period: {totalOS.toFixed(2)}h clocked.</p>
                                        <p className="text-[11px] text-zinc-450">Salary employees receive their regular base pay. Timecard tracking shows clocked actual duration ({totalOS.toFixed(2)}h).</p>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })()}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            
            /* TAB 2: Printable Detailed Sheets View */
            <div className="space-y-12">
              {(() => {
                let lastDeptId = 'INITIAL_VAL';
                return reportData.map((emp, index) => {
                  // Filter out QuickBooks sync sessions from native lists
                  const nativeSess = emp.sessions.filter((s: TimeSession) => s.source !== 'QuickBooks');
                  const qbSess = emp.sessions.filter((s: TimeSession) => s.source === 'QuickBooks');

                  const rawStaff = staffList?.find((s: any) => s.id === emp.userId || s.userId === emp.userId);
                  const dept = (departmentsList || []).find((d: any) => d.id === emp.departmentId);
                  const deptName = dept?.name || 'Unassigned';
                  const showDeptDivider = (emp.departmentId || 'unassigned') !== lastDeptId;
                  if (showDeptDivider) {
                    lastDeptId = emp.departmentId || 'unassigned';
                  }

                  let activeCreditMs = 0;
                  if (rawStaff?.payPeriodBookTimeCredit && rawStaff.payPeriodBookTimeCredit > 0) {
                    activeCreditMs = rawStaff.payPeriodBookTimeCredit * 3600000;
                  } else if (dept?.weeklyBookTimeCredit && dept.weeklyBookTimeCredit > 0) {
                    activeCreditMs = dept.weeklyBookTimeCredit * 3600000;
                  }

                  return (
                    <Fragment key={emp.userId}>
                      {showDeptDivider && (
                        <div className={`border-b-2 border-zinc-950 pb-3 mb-6 mt-12 print:border-b-2 print:border-zinc-950 print:pb-2 print:mb-6 print:mt-0 ${index > 0 ? 'print-page-break' : ''}`}>
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-5 h-5 text-indigo-500 print:text-zinc-850" />
                              <h3 className="text-base font-black uppercase tracking-wider text-zinc-900 dark:text-white print:text-base print:text-zinc-950">
                                {deptName} Department
                              </h3>
                            </div>
                            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider print:text-zinc-550">
                              Batch Period: {formatDateShort(startDate)} — {formatDateShort(endDate)}
                            </span>
                          </div>
                        </div>
                      )}

                      <div 
                        className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-8 shadow-sm print:border-none print:shadow-none print:p-0 ${!showDeptDivider ? 'print-page-break' : ''}`}
                      >
                        {/* Sheet Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-150 dark:border-zinc-800 pb-4 mb-6 gap-4">
                          <div>
                            <h4 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tight">
                              Timesheet: {emp.name}
                            </h4>
                            <p className="text-xs text-zinc-500 font-medium">
                              Pay Type: <span className="font-bold text-zinc-850 dark:text-zinc-300 uppercase">{emp.payType}</span> | Department: <span className="font-bold text-zinc-850 dark:text-zinc-300 uppercase">{deptName}</span> | Role: Technician
                            </p>
                          </div>
                      <div className="text-right flex items-center sm:block gap-6">
                        <div className="inline-block text-left sm:text-right mr-4">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Period Clocked</span>
                          <span className="text-sm font-black text-zinc-900 dark:text-white font-mono">
                            {(emp.totals.totalNativeMs / 3600000).toFixed(2)}h
                          </span>
                        </div>
                        {emp.payType === 'flat_rate' && (
                          <>
                            <div className="inline-block text-left sm:text-right mr-4">
                              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest block">Period Book Hours</span>
                              <span className="text-sm font-black text-emerald-600 dark:text-emerald-450 font-mono">
                                {(emp.totals.totalBookMs / 3600000).toFixed(2)}h
                              </span>
                            </div>
                            <div className="inline-block text-left sm:text-right mr-4">
                              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block">Period Pay Hours</span>
                              <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono">
                                {(emp.totals.totalPayMs / 3600000).toFixed(2)}h
                              </span>
                            </div>
                          </>
                        )}
                        {emp.totals.totalQbMs > 0 && (
                          <div className="mt-1 sm:mt-0 inline-block text-left sm:text-right">
                            <span className="text-xs font-bold text-indigo-500 font-mono block">
                              QB Sync: {(emp.totals.totalQbMs / 3600000).toFixed(2)}h
                            </span>
                            <span className={`text-xs font-extrabold font-mono ${emp.hasDiscrepancy ? 'text-amber-500' : 'text-emerald-500'}`}>
                              (Diff: {(emp.varianceMs / 3600000).toFixed(2)}h)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Detailed Log Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-zinc-50 dark:bg-zinc-850/50 text-zinc-500 uppercase text-[9px] font-bold tracking-widest border-b border-zinc-200 dark:border-zinc-800">
                          <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Shift times</th>
                            <th className="px-4 py-3">Breaks</th>
                            <th className="px-4 py-3">Jobs / Tasks Clocked</th>
                            <th className="px-4 py-3 text-right">Actual Hours</th>
                            <th className="px-4 py-3 text-right">Book Hours</th>
                            <th className="px-4 py-3 text-right">Calculated Pay</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {/* List Native Punches */}
                          {nativeSess.map((session: TimeSession) => {
                            const clockInDate = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
                            const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
                            const breakMs = (session.breaks || []).reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0);
                            const workMs = totalMs - breakMs;
                            const payMs = calculateSessionPayMs(session, session.payType || emp.payType);

                            return (
                              <tr key={session.id} className="hover:bg-zinc-50/30 dark:hover:bg-zinc-800/10">
                                <td className="px-4 py-3 font-bold whitespace-nowrap">
                                  {formatDateShort(clockInDate)} ({clockInDate.toLocaleDateString([], { weekday: 'short' })})
                                </td>
                                <td className="px-4 py-3">
                                  <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-350 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">
                                    Native
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-mono font-medium">
                                  {session.clockIn.timestamp ? clockInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                                  {' → '}
                                  {session.clockOut?.timestamp ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate() : new Date(session.clockOut.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                                </td>
                                <td className="px-4 py-3 text-zinc-500">
                                  {session.breaks?.length > 0 ? `${session.breaks.length} breaks (${(breakMs / 60000).toFixed(0)}m)` : 'None'}
                                </td>
                                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                                  <div className="space-y-1">
                                    {(session.jobs || []).map((j: any, i: number) => (
                                      <div key={i} className="flex justify-between max-w-xs text-[10px]">
                                        <span className="truncate pr-2">{j.name} {j.taskName ? `(${j.taskName})` : ''}</span>
                                        {j.bookTime > 0 && <span className="font-mono font-bold text-indigo-500">({j.bookTime}h)</span>}
                                      </div>
                                    ))}
                                    {(!session.jobs || session.jobs.length === 0) && <span className="italic text-[10px] text-zinc-400">No jobs clocked</span>}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold">
                                  {formatDurationDecimal(workMs)}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-indigo-500/80">
                                  {(session.jobs || []).reduce((acc: number, j: any) => acc + (j.bookTime || 0), 0).toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                  {formatDurationDecimal(payMs)}
                                </td>
                              </tr>
                            );
                          })}

                          {/* List QuickBooks Punches */}
                          {qbSess.map((session: TimeSession) => {
                            const clockInDate = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
                            const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);

                            return (
                              <tr key={session.id} className="bg-indigo-500/5 dark:bg-indigo-550/5">
                                <td className="px-4 py-3 font-bold whitespace-nowrap">
                                  {formatDateShort(clockInDate)} ({clockInDate.toLocaleDateString([], { weekday: 'short' })})
                                </td>
                                <td className="px-4 py-3">
                                  <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-[9px] font-black uppercase">
                                    QB Sync
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-mono font-medium text-indigo-600 dark:text-indigo-400">
                                  {session.clockIn.timestamp ? clockInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                                  {' → '}
                                  {session.clockOut?.timestamp ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate() : new Date(session.clockOut.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                </td>
                                <td className="px-4 py-3 text-zinc-400">—</td>
                                <td className="px-4 py-3 text-indigo-500/80 max-w-xs truncate font-medium">
                                  {session.jobs?.[0]?.name || 'Imported QuickBooks Log'}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                  {formatDurationDecimal(totalMs)}
                                </td>
                                <td className="px-4 py-3 text-right text-zinc-400">—</td>
                                <td className="px-4 py-3 text-right text-zinc-400">—</td>
                              </tr>
                            );
                          })}

                          {emp.sessions.length === 0 && (
                            <tr>
                              <td colSpan={8} className="px-4 py-8 text-center text-zinc-400 italic">No recorded shifts for this employee in range.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Flat Rate Completed Tasks Payouts section */}
                    {(emp.payType === 'flat_rate' || emp.payType === 'hourly') && emp.completedTasks && emp.completedTasks.length > 0 && (
                      <div className="mt-8">
                        <div className="flex items-center justify-between mb-3 border-b border-zinc-150 dark:border-zinc-800 pb-2">
                          <h5 className="text-xs font-black uppercase tracking-wider text-zinc-855 dark:text-zinc-250">
                            {emp.payType === 'hourly' ? 'Completed Book-Time Tasks (Tracked for Efficiency)' : 'Completed Flat-Rate Tasks Paid This Period'}
                          </h5>
                          <span className="text-xs font-bold text-emerald-505 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg font-mono">
                            Total Book Hours: {(emp.totals.totalBookMs / 3600000).toFixed(2)}h
                          </span>
                        </div>
                        <div className="overflow-x-auto border border-zinc-150 dark:border-zinc-800/80 rounded-2xl">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-zinc-50 dark:bg-zinc-850/50 text-zinc-500 uppercase text-[9px] font-bold tracking-widest border-b border-zinc-200 dark:border-zinc-800">
                              <tr>
                                <th className="px-4 py-2.5">Date Completed</th>
                                <th className="px-4 py-2.5">Job Name</th>
                                <th className="px-4 py-2.5">Task Name</th>
                                <th className="px-4 py-2.5 text-right">Share %</th>
                                <th className="px-4 py-2.5 text-right">Clocked Hours</th>
                                <th className="px-4 py-2.5 text-right">Book Hours Earned</th>
                                <th className="px-4 py-2.5 text-right">Efficiency</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                              {emp.completedTasks && emp.completedTasks.length > 0 ? (
                                emp.completedTasks.map((t: any, i: number) => {
                                  const compDate = t.completedAt?.toDate ? t.completedAt.toDate() : new Date(t.completedAt);
                                  const clocked = t.clockedHours || 0;
                                  const efficiency = clocked > 0 ? ((t.originalBookHours !== undefined ? t.originalBookHours : t.bookHours) / clocked) * 100 : 0;
                                  return (
                                    <tr key={i} className="hover:bg-zinc-50/30 dark:hover:bg-zinc-800/10">
                                      <td className="px-4 py-2.5 font-bold whitespace-nowrap">
                                        <div>
                                          {formatDateShort(compDate)} ({compDate.toLocaleDateString([], { weekday: 'short' })})
                                        </div>
                                        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal mt-0.5">
                                          at {compDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5 font-medium">{t.jobName}</td>
                                      <td className="px-4 py-2.5">
                                        <div className="font-semibold text-zinc-800 dark:text-zinc-200">{t.name}</div>
                                        {t.segments && t.segments.length > 0 && (
                                          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                                            <span className="font-bold uppercase tracking-wider text-[9px] mr-1.5">Shifts:</span>
                                            <span className="font-mono text-zinc-550 dark:text-zinc-400">{t.segments.join(' | ')}</span>
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-mono">{(t.share * 100).toFixed(0)}%</td>
                                      <td className="px-4 py-2.5 text-right font-mono text-zinc-500">
                                        {clocked > 0 ? `${clocked.toFixed(2)}h` : (
                                          <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-black text-[9px] uppercase whitespace-nowrap">
                                            No Time Clocked
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-450">
                                        {t.isRework ? (
                                          <div className="flex flex-col items-end">
                                            <span className="text-zinc-400 line-through">{(t.originalBookHours || t.bookHours).toFixed(2)}h</span>
                                            <span className="bg-rose-500/10 text-rose-600 dark:text-rose-450 px-1.5 py-0.5 rounded font-black text-[9px] uppercase whitespace-nowrap mt-0.5">
                                              Rework (Prev. Paid)
                                            </span>
                                          </div>
                                        ) : (
                                          `${t.bookHours.toFixed(2)}h`
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-mono">
                                        {clocked > 0 ? (
                                          <span className={`font-black ${efficiency >= 100 ? 'text-emerald-600 dark:text-emerald-450' : 'text-amber-500'}`}>
                                            {efficiency.toFixed(0)}%
                                          </span>
                                        ) : (
                                          <span className="text-zinc-400">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={7} className="px-4 py-6 text-center text-zinc-400 italic">
                                    No flat-rate tasks marked completed in this period.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Weekly Allowance Credit */}
                        {activeCreditMs > 0 && (
                          <div className="mt-4 p-4 bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-900/40 rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-500">
                                <Clock className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-zinc-900 dark:text-white">Weekly Book Credit Allowance</p>
                                <p className="text-[10px] text-zinc-500">
                                  Cleanup allowance applied (earned when clocked hours exist in the week)
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-mono font-black text-indigo-600 dark:text-indigo-400">
                                +{((activeCreditMs * ( ((emp.totals.week1NativeMs > 0 || emp.totals.week1QbMs > 0) ? 1 : 0) + ((emp.totals.week2NativeMs > 0 || emp.totals.week2QbMs > 0) ? 1 : 0) )) / 3600000).toFixed(2)}h
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Signature block for printable sheets */}
                    <div className="hidden print:flex justify-between items-end mt-12 pt-8 border-t border-dashed border-zinc-350">
                      <div className="space-y-1">
                        <div className="w-48 border-b border-black h-5" />
                        <span className="text-[10px] uppercase font-bold text-zinc-400">Employee Signature</span>
                      </div>
                      <div className="text-center text-[10px] text-zinc-400 italic">
                        Printed for {business?.name || 'Business'} via UpfittersOS on {formatDateFull(new Date())}
                      </div>
                      <div className="space-y-1">
                        <div className="w-48 border-b border-black h-5" />
                        <span className="text-[10px] uppercase font-bold text-zinc-400">Supervisor Signature</span>
                      </div>
                    </div>

                  </div>
                </Fragment>
              );
            });
          })()}
        </div>
          )}

        </div>
    </div>
  );

  if (isInline) {
    return (
      <div className="w-full">
        {styleBlock}
        {renderContent()}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md animate-in fade-in duration-350 print:bg-white print:p-0 print:backdrop-blur-none">
      {styleBlock}
      {renderContent()}
    </div>
  );
}
