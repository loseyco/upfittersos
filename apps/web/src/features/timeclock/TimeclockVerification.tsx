import { useState, useMemo, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, orderBy, getDocs, doc, getDoc, setDoc, deleteDoc, collectionGroup } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { 
  ArrowRight, Printer, 
  AlertTriangle, FileSignature, Lock, Unlock, Send,
  User, CheckSquare
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
    notes?: string;
  }>;
  status: string;
  manuallyEdited?: boolean;
  lastEditedBy?: string;
  lastEditedById?: string;
  approvedBy?: string;
}

interface TimeclockVerificationProps {
  tenantId: string;
}

type RangePreset = 'prev_week' | 'current_week' | 'custom';

// Helpers
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

const formatDateShort = (date: Date) => {
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
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

const buildChronologicalTimeline = (session: any, sessionEnd: number) => {
  const shiftStart = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate().getTime() : new Date(session.clockIn.timestamp).getTime();
  const shiftEnd = sessionEnd;

  const jobIntervals = (session.jobs || []).map((j: any) => {
    const start = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
    const end = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : shiftEnd;
    return {
      start: Math.max(start, shiftStart),
      end: Math.min(end, shiftEnd),
      type: 'job' as const,
      data: j
    };
  });

  const breakIntervals = (session.breaks || []).map((b: any) => {
    const start = b.start?.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
    const end = b.end ? (b.end.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime()) : shiftEnd;
    return {
      start: Math.max(start, shiftStart),
      end: Math.min(end, shiftEnd),
      type: 'break' as const,
      data: b
    };
  });

  const combined = [...jobIntervals, ...breakIntervals].sort((a, b) => a.start - b.start);
  const timeline: Array<{ start: number; end: number; type: 'job' | 'break' | 'idle'; data?: any }> = [];
  let timePointer = shiftStart;

  combined.forEach(item => {
    if (item.start > timePointer + 60000) { // Gap > 1 minute
      timeline.push({
        start: timePointer,
        end: item.start,
        type: 'idle'
      });
    }
    timeline.push(item);
    timePointer = Math.max(timePointer, item.end);
  });

  if (shiftEnd > timePointer + 60000) {
    timeline.push({
      start: timePointer,
      end: shiftEnd,
      type: 'idle'
    });
  }

  timeline.sort((a, b) => a.start - b.start);
  return timeline;
};

export function TimeclockVerification({ tenantId }: TimeclockVerificationProps) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [preset, setPreset] = useState<RangePreset>('prev_week');
  
  // Sign-off inputs
  const [employeeSignature, setEmployeeSignature] = useState('');
  const [managerSignature, setManagerSignature] = useState('');
  const [employeeConfirmed, setEmployeeConfirmed] = useState(false);

  // Custom date range inputs
  const [customStartStr, setCustomStartStr] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [customEndStr, setCustomEndStr] = useState(new Date().toISOString().split('T')[0]);

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

  // Fetch staff list
  const { data: staffList } = useQuery({
    queryKey: ['verification-staff-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(s => !s.isArchived && !s.fireDate)
        .sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));
    }
  });

  // Set default selected staff once list is loaded
  useEffect(() => {
    if (staffList && staffList.length > 0 && !selectedStaffId) {
      setSelectedStaffId(staffList[0].id || staffList[0].userId);
    }
  }, [staffList, selectedStaffId]);

  // Calculate start/end dates based on preset
  const { startDate, endDate, startDateStr, endDateStr } = useMemo(() => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    const weekEndDay = business?.payrollWeekEndDay !== undefined ? Number(business.payrollWeekEndDay) : 0; // default Sunday

    const w2Start = getPayrollWeekStart(today, weekEndDay);
    const w2End = new Date(w2Start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    const w1Start = new Date(w2Start.getTime() - 7 * 24 * 60 * 60 * 1000);
    const w1End = new Date(w2Start.getTime() - 1);

    if (preset === 'prev_week') {
      start = w1Start;
      end = w1End;
    } else if (preset === 'current_week') {
      start = w2Start;
      end = w2End;
    } else { // custom
      start = new Date(customStartStr + 'T00:00:00');
      end = new Date(customEndStr + 'T23:59:59');
    }

    const sStr = start.toISOString().split('T')[0];
    const eStr = end.toISOString().split('T')[0];

    return {
      startDate: start,
      endDate: end,
      startDateStr: sStr,
      endDateStr: eStr
    };
  }, [preset, customStartStr, customEndStr, business]);

  // Reset signature fields when employee or range changes
  useEffect(() => {
    setEmployeeSignature('');
    setManagerSignature('');
    setEmployeeConfirmed(false);
  }, [selectedStaffId, startDateStr, endDateStr]);

  // Resolve active staff info
  const selectedStaff = useMemo(() => {
    return staffList?.find((s: any) => s.id === selectedStaffId || s.userId === selectedStaffId);
  }, [staffList, selectedStaffId]);

  const resolvedUserId = selectedStaff?.userId || selectedStaff?.id || selectedStaffId;

  // Fetch sessions for selected user & range
  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['verification-sessions', tenantId, resolvedUserId, startDateStr, endDateStr],
    queryFn: async () => {
      if (!resolvedUserId) return [];
      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('userId', '==', resolvedUserId),
        where('clockIn.timestamp', '>=', startDate),
        where('clockIn.timestamp', '<=', endDate),
        orderBy('clockIn.timestamp', 'asc')
      );
      const snap = await getDocs(q);
      return snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as TimeSession))
        .filter(s => s.status !== 'deleted');
    },
    enabled: !!resolvedUserId
  });

  // Fetch verification record for the active user & range
  const verificationDocId = `${resolvedUserId}_${startDateStr}_${endDateStr}`;
  const { data: verification } = useQuery({
    queryKey: ['verification-record', tenantId, verificationDocId],
    queryFn: async () => {
      if (!resolvedUserId) return null;
      const snap = await getDoc(doc(db, `businesses/${tenantId}/timeclock_verifications`, verificationDocId));
      return snap.exists() ? snap.data() : null;
    },
    enabled: !!resolvedUserId
  });

  // Fetch departments list
  const { data: departmentsList } = useQuery({
    queryKey: ['verification-departments', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    }
  });

  const deptName = useMemo(() => {
    if (!selectedStaff || !departmentsList) return 'Unassigned';
    const dept = departmentsList.find((d: any) => d.id === selectedStaff.departmentId);
    return dept?.name || 'Unassigned';
  }, [selectedStaff, departmentsList]);

  // Fetch completed tasks for flat-rate calculations
  const { data: tasksList } = useQuery({
    queryKey: ['verification-completed-tasks', tenantId, startDateStr, endDateStr],
    queryFn: async () => {
      const q = query(
        collectionGroup(db, 'tasks'),
        where('tenantId', '==', tenantId)
      );
      const snap = await getDocs(q);
      return snap.docs
        .filter(d => d.ref.path.startsWith(`businesses/${tenantId}/`))
        .map(d => {
          const parts = d.ref.path.split('/');
          const jobId = parts[3];
          return { id: d.id, jobId, ...d.data() } as any;
        });
    }
  });

  // Helper calculations
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

      const taskRef = tasksList?.find((t: any) => t.id === j.taskId);
      let resolvedPayBasis = 'hourly';
      let resolvedBookTime = 0;

      if (taskRef) {
        resolvedBookTime = parseFloat(taskRef.bookTime) || 0;
        resolvedPayBasis = taskRef.payBasis || (resolvedBookTime > 0 ? 'book_time' : 'hourly');
      } else {
        resolvedBookTime = j.bookTime || 0;
        resolvedPayBasis = j.payBasis || (resolvedBookTime > 0 ? 'book_time' : 'hourly');
      }

      if (resolvedBookTime === 0) {
        resolvedPayBasis = 'hourly';
      }

      taskActualTime[key] = (taskActualTime[key] || 0) + segMs;
      if (resolvedBookTime > 0) {
        taskBookTime[key] = resolvedBookTime * 3600000;
      }
      taskPayBasis[key] = resolvedPayBasis;
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

  // Compute stats for current selection
  const stats = useMemo(() => {
    if (!sessions || !selectedStaff) return { nativeMs: 0, breakMs: 0, bookMs: 0, payMs: 0, breakCount: 0, idleMs: 0 };
    
    let nativeMs = 0;
    let breakMs = 0;
    let payMs = 0;
    let breakCount = 0;
    let idleMs = 0;

    const dept = departmentsList?.find((d: any) => d.id === selectedStaff.departmentId);
    const resolvedPayType = selectedStaff.payType && selectedStaff.payType !== 'inherit'
      ? selectedStaff.payType
      : (dept?.defaultPayType || 'hourly');

    sessions.forEach(session => {
      const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
      const bMs = (session.breaks || []).reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0);
      const workMs = Math.max(0, totalMs - bMs);
      const pMs = calculateSessionPayMs(session, session.payType || resolvedPayType);

      nativeMs += workMs;
      breakMs += bMs;
      payMs += pMs;
      breakCount += (session.breaks || []).length;

      const sessionEnd = session.clockOut?.timestamp
        ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate().getTime() : new Date(session.clockOut.timestamp).getTime())
        : Date.now();
      const totalTaskMs = (session.jobs || []).reduce((acc: number, j: any) => {
        const start = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
        const end = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : sessionEnd;
        return acc + Math.max(0, end - start);
      }, 0);
      const sessionIdleMs = Math.max(0, workMs - totalTaskMs);
      idleMs += sessionIdleMs;
    });

    // Completed tasks book time calculation (flat-rate and hourly)
    let bookMs = 0;
    if (tasksList && tasksList.length > 0) {
      tasksList.forEach((task: any) => {
        const compTimeStr = task.completedAt || task.qcCompletedAt;
        if (!compTimeStr) return;
        const compTime = new Date(compTimeStr).getTime();
        if (compTime < startDate.getTime() || compTime > endDate.getTime()) return;

        const isCompleted = ['completed', 'qc', 'qc complete'].includes((task.status || '').toLowerCase());
        if (!isCompleted) return;

        const isHourlyTask = task.payBasis === 'hourly';
        const bookHours = isHourlyTask ? 0 : (parseFloat(task.bookTime) || 0);

        const assignments = task.assignedStaff || [];
        assignments.forEach((assign: any) => {
          if (assign.id === resolvedUserId) {
            let taskClockedMs = 0;
            if (sessions) {
              sessions.forEach((sess: any) => {
                if (sess.jobs) {
                  sess.jobs.forEach((job: any) => {
                    if (job.taskId === task.id) {
                      const start = job.start?.toDate ? job.start.toDate().getTime() : new Date(job.start).getTime();
                      const end = job.end ? (job.end.toDate ? job.end.toDate().getTime() : new Date(job.end).getTime()) : Date.now();
                      const duration = Math.max(0, end - start);
                      if (duration > 5000) {
                        taskClockedMs += duration;
                      }
                    }
                  });
                }
              });
            }

            const share = (parseFloat(assign.percentage) || 100) / 100;
            const originalBookMs = bookHours * 3600000 * share;
            const earnedMs = isHourlyTask ? taskClockedMs : (task.isRework ? 0 : originalBookMs);
            
            bookMs += earnedMs;
            if (resolvedPayType === 'flat_rate' && !isHourlyTask) {
              payMs += earnedMs;
            }
          }
        });
      });
    }

    // Apply weekly default/allowance book time credits
    let activeCreditMs = 0;
    if (selectedStaff?.payPeriodBookTimeCredit && selectedStaff.payPeriodBookTimeCredit > 0) {
      activeCreditMs = selectedStaff.payPeriodBookTimeCredit * 3600000;
    } else if (dept?.weeklyBookTimeCredit && dept.weeklyBookTimeCredit > 0) {
      activeCreditMs = dept.weeklyBookTimeCredit * 3600000;
    }

    if (activeCreditMs > 0 && nativeMs > 0) {
      payMs += activeCreditMs;
      bookMs += activeCreditMs;
    }

    return {
      nativeMs,
      breakMs,
      bookMs,
      payMs,
      breakCount,
      idleMs
    };
  }, [sessions, selectedStaff, departmentsList, tasksList, startDate, endDate, resolvedUserId]);

  // Mutations
  const signMutation = useMutation({
    mutationFn: async () => {
      if (!resolvedUserId || !selectedStaff) throw new Error("No staff selected");
      const name = `${selectedStaff.firstName || ''} ${selectedStaff.lastName || ''}`.trim();
      const managerName = currentUser?.displayName || currentUser?.email || 'Manager';

      const verificationData = {
        id: verificationDocId,
        userId: resolvedUserId,
        userName: name,
        startDate: startDateStr,
        endDate: endDateStr,
        totalNativeHours: Number(formatDurationDecimal(stats.nativeMs)),
        totalBookHours: Number(formatDurationDecimal(stats.bookMs)),
        totalPayHours: Number(formatDurationDecimal(stats.payMs)),
        employeeSignature: employeeSignature.trim(),
        employeeSignedAt: new Date().toISOString(),
        managerSignature: managerSignature.trim(),
        managerSignedAt: new Date().toISOString(),
        verifiedById: currentUser?.uid || '',
        verifiedByName: managerName,
        status: 'verified',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, `businesses/${tenantId}/timeclock_verifications`, verificationDocId), verificationData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-record', tenantId, verificationDocId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-verifications', tenantId] });
      toast.success("Timesheet successfully verified and signed!");
    },
    onError: (err) => {
      console.error(err);
      toast.error("Failed to sign timesheet verification record.");
    }
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      await deleteDoc(doc(db, `businesses/${tenantId}/timeclock_verifications`, verificationDocId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-record', tenantId, verificationDocId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-verifications', tenantId] });
      toast.success("Timesheet verification revoked. Log edits are now unlocked.");
    },
    onError: (err) => {
      console.error(err);
      toast.error("Failed to revoke timesheet verification.");
    }
  });

  const sendToPayrollMutation = useMutation({
    mutationFn: async () => {
      if (!verification) return;
      await setDoc(doc(db, `businesses/${tenantId}/timeclock_verifications`, verificationDocId), {
        ...verification,
        status: 'sent_to_payroll',
        sentToPayrollAt: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-record', tenantId, verificationDocId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-verifications', tenantId] });
      toast.success("Timesheet verification updated and marked as Sent to Payroll!");
    },
    onError: (err) => {
      console.error(err);
      toast.error("Failed to mark timesheet verification as sent to payroll.");
    }
  });

  const handlePrint = () => {
    window.print();
  };

  const handleSignConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeSignature.trim()) {
      toast.error("Please enter the employee's signature name");
      return;
    }
    if (!managerSignature.trim()) {
      toast.error("Please enter the manager's signature name");
      return;
    }
    if (!employeeConfirmed) {
      toast.error("Please check the confirmation box to verify employee approval");
      return;
    }
    signMutation.mutate();
  };

  const cHrs = stats.nativeMs / 3600000;
  const iHrs = stats.idleMs / 3600000;
  const jHrs = Math.max(0, cHrs - iHrs);
  const bHrs = stats.bookMs / 3600000;
  const pHrs = stats.payMs / 3600000;
  const jobEff = jHrs > 0 ? (bHrs / jHrs) * 100 : 0;
  const overallEff = cHrs > 0 ? (bHrs / cHrs) * 100 : 0;

  const styleBlock = (
    <style dangerouslySetInnerHTML={{__html: `
      @media print {
        @page {
          size: portrait;
          margin: 0.3in;
        }
        /* Hide sidebar, dashboards, navbars, filters, buttons, forms */
        #root > div > div:first-child,
        #root > div > div > header,
        #root > div > div > main > div:first-child,
        .no-print,
        .print-hidden,
        .print\\:hidden,
        button,
        input,
        select,
        form {
          display: none !important;
        }
        
        /* Reset layout scroll containers on print */
        body, html, #root, #root > div, main, .flex-1 {
          height: auto !important;
          overflow: visible !important;
          max-height: none !important;
        }
        
        .bg-white, .dark\\:bg-zinc-900, .bg-zinc-50, .dark\\:bg-zinc-855, .dark\\:bg-zinc-800\\/50, .bg-zinc-50\\/50, .dark\\:bg-zinc-950\\/20 {
          background-color: white !important;
          color: black !important;
          border-color: #d4d4d8 !important;
          box-shadow: none !important;
        }

        /* Force high contrast text colors for readability on paper */
        body, p, span, div, td, th, table, tr, h1, h2, h3, h4, h5, h6 {
          color: #000000 !important;
        }
        .text-zinc-500, .text-zinc-400, .text-zinc-450, .dark\\:text-zinc-400, .dark\\:text-zinc-500, .dark\\:text-zinc-555, .text-zinc-605, .text-zinc-600, .dark\\:text-zinc-300 {
          color: #27272a !important;
        }
        .border-zinc-200\\/50, .dark\\:border-zinc-800\\/50, .border-zinc-200, .dark\\:border-zinc-800, .border-zinc-150, .dark\\:border-zinc-850 {
          border-color: #a1a1aa !important;
        }

        .rounded-3xl, .rounded-2xl, .rounded-xl {
          border-radius: 0 !important;
        }

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
        
        .max-h-\\[75vh\\], .overflow-y-auto, .overflow-x-auto, [class*="overflow-"] {
          max-height: none !important;
          max-width: none !important;
          overflow: visible !important;
          overflow-x: visible !important;
          overflow-y: visible !important;
          display: block !important;
        }
        * {
          scrollbar-width: none !important;
        }
        *::-webkit-scrollbar {
          display: none !important;
        }
      }
    `}} />
  );

  return (
    <div className="space-y-6 print:p-0 print:m-0 print:overflow-visible print:block print:w-full print:h-auto print:static">
      {styleBlock}
      {/* Selection Control Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Select Staff Member</span>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs font-bold text-zinc-900 dark:text-white outline-none min-w-[200px]"
            >
              {staffList?.map((s: any) => (
                <option key={s.id || s.userId} value={s.id || s.userId}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Pay Period Range</span>
            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <button
                onClick={() => setPreset('prev_week')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  preset === 'prev_week' 
                    ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-white shadow-sm' 
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Previous Week
              </button>
              <button
                onClick={() => setPreset('current_week')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  preset === 'current_week' 
                    ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-white shadow-sm' 
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Current Week
              </button>
              <button
                onClick={() => setPreset('custom')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  preset === 'custom' 
                    ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-white shadow-sm' 
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Custom Range
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {verification && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer hover:scale-105"
            >
              <Printer className="w-4 h-4" /> Print Verification Receipt
            </button>
          )}
        </div>
      </div>

      {/* Custom Picker Range picker fields if custom is active */}
      {preset === 'custom' && (
        <div className="bg-zinc-50 dark:bg-zinc-950/30 p-4 border border-zinc-200 dark:border-zinc-850 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-2 duration-200 print:hidden">
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

      {/* Sign-off Review Dashboard Area */}
      {selectedStaff && (
        <div className="space-y-6">
          {/* Status Banners */}
          {verification ? (
            <div className="bg-emerald-500/10 dark:bg-emerald-500/5 border border-emerald-500/20 rounded-[2rem] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/25 text-emerald-600 rounded-2xl">
                  <CheckSquare className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-zinc-900 dark:text-white">Timesheet Verified & Approved</h4>
                  <p className="text-xs text-zinc-500 font-medium mt-0.5">
                    This pay period ({startDateStr} to {endDateStr}) is signed off and locked from manual editing.
                  </p>
                  <p className="text-[10px] text-zinc-450 mt-1">
                    Employee Sign: <span className="font-bold text-zinc-800 dark:text-zinc-200">"{verification.employeeSignature}"</span> | Manager Sign: <span className="font-bold text-zinc-800 dark:text-zinc-200">"{verification.managerSignature}"</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                {verification.status === 'verified' && (
                  <button
                    onClick={() => sendToPayrollMutation.mutate()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" /> Send to Payroll
                  </button>
                )}
                {verification.status === 'sent_to_payroll' && (
                  <span className="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-xl text-xs font-bold font-mono">
                    SENT TO PAYROLL
                  </span>
                )}
                <button
                  onClick={() => revokeMutation.mutate()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  title="Unlock entries to make manual corrections"
                >
                  <Unlock className="w-3.5 h-3.5" /> Unlock Timesheet
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 rounded-[2rem] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500/20 text-amber-600 rounded-2xl">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-zinc-900 dark:text-white">Review & Sign-Off Required</h4>
                  <p className="text-xs text-zinc-500 font-medium mt-0.5">
                    Review clocked logs face-to-face with the employee below. Sign both names to authorize.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden text-zinc-500 text-xs font-bold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800/50 px-4 py-2 rounded-xl">
                Status: Not Verified
              </div>
            </div>
          )}

          {/* Printable Receipt Cover Header */}
          <div className="hidden print:block border-b-2 border-black pb-4 mb-6">
            <h1 className="text-xl font-black uppercase tracking-tight">Timeclock Verification Receipt</h1>
            <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider mt-1">
              Authorized Review Summary • Generated by UpfittersOS
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-xs font-medium">
              <div>
                <p>Employee: <span className="font-bold">{selectedStaff.firstName} {selectedStaff.lastName}</span></p>
                <p>Department: <span className="font-bold">{deptName}</span></p>
                <p>Pay Type: <span className="font-bold uppercase">{selectedStaff.payType || 'Hourly'}</span></p>
              </div>
              <div className="text-right">
                <p>Review Period: <span className="font-bold font-mono">{startDateStr} to {endDateStr}</span></p>
                <p>Verification Date: <span className="font-bold font-mono">{verification?.createdAt ? new Date(verification.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</span></p>
                <p>Status: <span className="font-black uppercase text-emerald-600 font-mono">{verification?.status === 'sent_to_payroll' ? 'SENT TO PAYROLL' : 'VERIFIED & APPROVED'}</span></p>
              </div>
            </div>            {/* Print Metrics Grid */}
            <div className="mt-4 border-t border-zinc-200 pt-4 grid grid-cols-7 gap-2 text-left">
              <div>
                <span className="text-[9px] uppercase font-bold text-zinc-400 block">Period Clocked</span>
                <span className="font-bold font-mono text-xs">{cHrs.toFixed(2)}h</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-zinc-400 block">Period Idle</span>
                <span className="font-bold font-mono text-xs text-amber-600">{iHrs.toFixed(2)}h</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-zinc-400 block">Job Time</span>
                <span className="font-bold font-mono text-xs text-zinc-800">{jHrs.toFixed(2)}h</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-zinc-400 block">Book Hours</span>
                <span className="font-bold font-mono text-xs text-emerald-600">{bHrs.toFixed(2)}h</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-zinc-400 block">Calculated Pay</span>
                <span className="font-bold font-mono text-xs text-indigo-650">{pHrs.toFixed(2)}h</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-zinc-400 block">Job Efficiency</span>
                <span className={`font-bold font-mono text-xs ${jobEff >= 100 ? 'text-emerald-600' : 'text-amber-500'}`}>{jobEff.toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-zinc-400 block">Overall Eff.</span>
                <span className="font-bold font-mono text-xs text-zinc-650">{overallEff.toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Metrics Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm space-y-1">
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Clocked Hours</span>
              <p className="text-xl font-black text-zinc-900 dark:text-white font-mono">
                {cHrs.toFixed(2)}h
              </p>
              <p className="text-[9px] text-zinc-500 leading-tight">Overall time on clock.</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm space-y-1">
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest block">Idle Time</span>
              <p className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono">
                {iHrs.toFixed(2)}h
              </p>
              <p className="text-[9px] text-zinc-500 leading-tight">Not clocked on jobs.</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm space-y-1">
              <span className="text-[10px] font-black text-zinc-455 uppercase tracking-widest block">Job Time (On-Task)</span>
              <p className="text-xl font-black text-zinc-800 dark:text-zinc-200 font-mono">
                {jHrs.toFixed(2)}h
              </p>
              <p className="text-[9px] text-zinc-500 leading-tight">Productive time on tasks.</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm space-y-1">
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest block">Book Hours</span>
              <p className="text-xl font-black text-emerald-500 font-mono">
                {bHrs.toFixed(2)}h
              </p>
              <p className="text-[9px] text-zinc-500 leading-tight">Completed book tasks.</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm space-y-1">
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block">Calculated Pay</span>
              <p className="text-xl font-black text-indigo-650 font-mono">
                {pHrs.toFixed(2)}h
              </p>
              <p className="text-[9px] text-zinc-500 leading-tight">Total pay hours.</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm space-y-1">
              <span className="text-[10px] font-black text-indigo-505 uppercase tracking-widest block">Job Efficiency</span>
              <p className={`text-xl font-black font-mono ${jobEff >= 100 ? 'text-emerald-650' : 'text-amber-505'}`}>
                {jobEff.toFixed(0)}%
              </p>
              <p className="text-[9px] text-zinc-500 leading-tight">Book vs Job Time.</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm space-y-1">
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block">Overall Eff.</span>
              <p className={`text-xl font-black font-mono ${overallEff >= 100 ? 'text-indigo-650' : 'text-zinc-500'}`}>
                {overallEff.toFixed(0)}%
              </p>
              <p className="text-[9px] text-zinc-500 leading-tight">Book vs Clocked.</p>
            </div>
          </div>

          {/* Calculations Explanations (Small line items) */}
          <div className="p-4 bg-zinc-50/60 dark:bg-zinc-950/20 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal">
            <span className="font-extrabold uppercase text-[8px] tracking-wider text-zinc-400 dark:text-zinc-555 block mb-1.5 font-sans">How metrics are derived:</span>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1.5 font-sans">
              <div><strong>Period Clocked:</strong> Sum of shift clocked hours.</div>
              <div><strong>Idle Time:</strong> Shift hours not clocked onto a specific job/task.</div>
              <div><strong>Job Time (On-Task):</strong> Period Clocked minus Idle Time.</div>
              <div><strong>Book Hours:</strong> Total book credit hours from completed tasks.</div>
              <div><strong>Job Efficiency:</strong> (Book Hours / Job Time) × 100%.</div>
              <div><strong>Overall Efficiency:</strong> (Book Hours / Period Clocked) × 100%.</div>
              {selectedStaff.payType === 'flat_rate' && (
                <div className="md:col-span-2 lg:col-span-2"><strong>Pay Hours:</strong> Hours paid for flat-rate (earned book hours + hourly shop time/allowance).</div>
              )}
            </div>
          </div>

          {/* Shift Details logs */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-6 shadow-sm print:border-none print:shadow-none print:p-0">
            <h4 className="text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-white border-b border-zinc-150 dark:border-zinc-850 pb-3 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-500" /> Clocked Sessions Detailed Log
            </h4>

            {sessionsLoading ? (
              <div className="p-8 text-center text-zinc-400 italic">Loading shift logs...</div>
            ) : !sessions || sessions.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 italic border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                No timeclock logs recorded for this period.
              </div>
            ) : (
              <div className="overflow-x-auto print:overflow-visible print:block print:static print:w-full print:h-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 dark:bg-zinc-850/50 text-zinc-500 uppercase text-[9px] font-bold tracking-widest border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-3 font-black">Date</th>
                      <th className="px-4 py-3 font-black">Shift times</th>
                      <th className="px-4 py-3 font-black">Breaks</th>
                      <th className="px-4 py-3 font-black">Job / Customer / Task</th>
                      <th className="px-4 py-3 font-black">Segment Clocked</th>
                      <th className="px-4 py-3 font-black">Book Hours</th>
                      <th className="px-4 py-3 font-black">Notes / Details</th>
                      <th className="px-4 py-3 text-right font-black">Actual Hours</th>
                      <th className="px-4 py-3 text-right font-black">Book Hours</th>
                      <th className="px-4 py-3 text-right font-black">Calculated Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {sessions.map((session) => {
                      const clockInDate = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
                      const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
                      const breakMs = (session.breaks || []).reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0);
                      const workMs = totalMs - breakMs;
                      const payMs = calculateSessionPayMs(session, session.payType || selectedStaff.payType);

                      const sessionEnd = session.clockOut?.timestamp
                        ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate().getTime() : new Date(session.clockOut.timestamp).getTime())
                        : Date.now();
                        
                      const chronologicalItems = buildChronologicalTimeline(session, sessionEnd);
                      const rowCount = chronologicalItems.length;

                      return (
                        <Fragment key={session.id}>
                          {Array.from({ length: rowCount }).map((_, i) => {
                            const showSpanned = i === 0;
                            const item = chronologicalItems[i];
                            const durationHrs = (item.end - item.start) / 3600000;

                            return (
                              <tr key={`${session.id}-${i}`} className="hover:bg-zinc-50/30 dark:hover:bg-zinc-800/10 border-b border-zinc-100 dark:border-zinc-800/50">
                                {showSpanned && (
                                  <>
                                    <td className="px-4 py-3 font-bold whitespace-nowrap align-top font-sans" rowSpan={rowCount}>
                                      {formatDateShort(clockInDate)} ({clockInDate.toLocaleDateString([], { weekday: 'short' })})
                                    </td>
                                    <td className="px-4 py-3 font-mono font-medium align-top" rowSpan={rowCount}>
                                      {session.clockIn.timestamp ? clockInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                                      {' → '}
                                      {session.clockOut?.timestamp ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate() : new Date(session.clockOut.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                                    </td>
                                    <td className="px-4 py-3 text-zinc-500 align-top font-sans" rowSpan={rowCount}>
                                      {session.breaks?.length > 0 ? `${session.breaks.length} breaks (${(breakMs / 60000).toFixed(0)}m)` : 'None'}
                                    </td>
                                  </>
                                )}

                                {(() => {
                                  if (item.type === 'idle') {
                                    return (
                                      <>
                                        <td className="px-4 py-3 font-bold text-amber-600 dark:text-amber-400 font-sans">
                                          <span className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                            Clocked Idle Time
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-amber-600 dark:text-amber-400">
                                          {formatSegmentTime(item.start, item.end)}
                                        </td>
                                        <td className="px-4 py-3 text-zinc-400">—</td>
                                        <td className="px-4 py-3 text-[10px] text-amber-805/70 dark:text-amber-400/70 font-sans">
                                          Not clocked onto any assigned job or task ({durationHrs.toFixed(2)}h)
                                        </td>
                                      </>
                                    );
                                  }

                                  if (item.type === 'break') {
                                    const b = item.data;
                                    const label = b.type === 'lunch' ? 'Lunch Break' : 'Rest Break';
                                    const isPaid = !!b.isPaid;
                                    return (
                                      <>
                                        <td className="px-4 py-3 font-bold text-zinc-650 dark:text-zinc-355 font-sans">
                                          <span className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                                            {label}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-zinc-500">
                                          {formatSegmentTime(item.start, item.end)}
                                        </td>
                                        <td className="px-4 py-3 text-zinc-400">—</td>
                                        <td className="px-4 py-3 text-[10px] text-zinc-450 dark:text-zinc-500 font-sans">
                                          {isPaid ? 'Paid' : 'Unpaid'} Break ({durationHrs.toFixed(2)}h)
                                        </td>
                                      </>
                                    );
                                  }

                                  const j = item.data;
                                  const taskRef = tasksList?.find((t: any) => t.id === j.taskId);
                                  let resolvedPayBasis = 'hourly';
                                  let resolvedBookHours = 0;

                                  if (taskRef) {
                                    resolvedBookHours = parseFloat(taskRef.bookTime) || 0;
                                    resolvedPayBasis = taskRef.payBasis || (resolvedBookHours > 0 ? 'book_time' : 'hourly');
                                  } else {
                                    resolvedBookHours = j.bookTime || 0;
                                    resolvedPayBasis = j.payBasis || (resolvedBookHours > 0 ? 'book_time' : 'hourly');
                                  }

                                  if (resolvedBookHours === 0) {
                                    resolvedPayBasis = 'hourly';
                                  }

                                  const isHourlySegment = resolvedPayBasis === 'hourly';
                                  const segmentBookTime = isHourlySegment ? durationHrs : resolvedBookHours;
                                  const isHourly = isHourlySegment;

                                  return (
                                    <>
                                      <td className="px-4 py-3 font-bold text-zinc-900 dark:text-white max-w-xs truncate font-sans" title={j.name}>
                                        <div>{j.name}</div>
                                        <div className="text-[9px] text-zinc-400 dark:text-zinc-500 font-normal mt-0.5">
                                          Task: <span className="font-bold text-zinc-700 dark:text-zinc-300">{j.taskName || 'General'}</span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 font-mono text-indigo-655 dark:text-indigo-400">
                                        <div>{formatSegmentTime(j.start, j.end)}</div>
                                        <div className="text-[9px] text-zinc-400 dark:text-zinc-500 font-normal font-sans mt-0.5">
                                          ({durationHrs.toFixed(2)}h clocked)
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 font-mono font-bold text-emerald-600 dark:text-emerald-455">
                                        {segmentBookTime > 0 ? `${segmentBookTime.toFixed(2)}h` : '—'}
                                      </td>
                                      <td className="px-4 py-3 text-[10px] text-zinc-600 dark:text-zinc-455 font-sans">
                                        <div className="flex flex-col gap-1">
                                          <span className={`self-start px-1.5 py-0.2 rounded text-[8px] uppercase font-black tracking-wider leading-none ${isHourly ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono' : 'bg-emerald-500/10 text-emerald-655 dark:text-emerald-450 font-mono'}`}>
                                            {isHourly ? 'Hourly' : 'Flat Rate'}
                                          </span>
                                          {j.notes && (
                                            <span className="italic font-normal">
                                              "{j.notes}"
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    </>
                                  );
                                })()}

                                {showSpanned && (
                                  <>
                                    <td className="px-4 py-3 text-right font-mono font-bold align-top" rowSpan={rowCount}>
                                      {formatDurationDecimal(workMs)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-indigo-500/80 align-top" rowSpan={rowCount}>
                                      {(session.jobs || []).reduce((acc: number, jobSeg: any) => {
                                        const segEnd = jobSeg.end || (session.clockOut?.timestamp || Date.now());
                                        const segDur = calculateDuration(jobSeg.start, segEnd) / 3600000;
                                        
                                        const taskRef = tasksList?.find((t: any) => t.id === jobSeg.taskId);
                                        let resolvedPayBasis = 'hourly';
                                        let resolvedBookHours = 0;

                                        if (taskRef) {
                                          resolvedBookHours = parseFloat(taskRef.bookTime) || 0;
                                          resolvedPayBasis = taskRef.payBasis || (resolvedBookHours > 0 ? 'book_time' : 'hourly');
                                        } else {
                                          resolvedBookHours = jobSeg.bookTime || 0;
                                          resolvedPayBasis = jobSeg.payBasis || (resolvedBookHours > 0 ? 'book_time' : 'hourly');
                                        }

                                        if (resolvedBookHours === 0) {
                                          resolvedPayBasis = 'hourly';
                                        }

                                        return acc + (resolvedPayBasis === 'hourly' ? segDur : resolvedBookHours);
                                      }, 0).toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400 align-top" rowSpan={rowCount}>
                                      {formatDurationDecimal(payMs)}
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>



          {/* Verification Sign-off Form Panel */}
          {!verification && sessions && sessions.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-8 shadow-sm print:hidden">
              <h4 className="text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-white border-b border-zinc-150 dark:border-zinc-850 pb-3 mb-6 flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-indigo-500" /> Timesheet Sign-Off & Verification Authorization
              </h4>

              <form onSubmit={handleSignConfirm} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">
                      Employee Signature (Type Name)
                    </label>
                    <input
                      type="text"
                      placeholder={`Type name of ${selectedStaff.firstName} ${selectedStaff.lastName}`}
                      value={employeeSignature}
                      onChange={(e) => setEmployeeSignature(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50"
                      required
                    />
                    <p className="text-[10px] text-zinc-500 italic">
                      Employee typed confirmation acts as digital consent and verification of clocked hours.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">
                      Manager Signature (Type Name)
                    </label>
                    <input
                      type="text"
                      placeholder={`Type manager signature (e.g. ${currentUser?.displayName || 'Your Name'})`}
                      value={managerSignature}
                      onChange={(e) => setManagerSignature(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50"
                      required
                    />
                    <p className="text-[10px] text-zinc-500 italic">
                      Manager typed signature validates and locks this record for payroll processing.
                    </p>
                  </div>
                </div>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={employeeConfirmed}
                    onChange={(e) => setEmployeeConfirmed(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-indigo-650 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-zinc-650 dark:text-zinc-350 font-medium">
                    We confirm that the timesheet clocked entries for the week starting <span className="font-bold text-zinc-850 dark:text-zinc-200">{startDateStr}</span> through <span className="font-bold text-zinc-850 dark:text-zinc-200">{endDateStr}</span> have been reviewed together face-to-face and are 100% correct.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={signMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-sm transition-all shadow-md shadow-indigo-600/10 cursor-pointer disabled:opacity-50 disabled:scale-100 hover:scale-101"
                >
                  <Lock className="w-4 h-4" /> Verify, Sign, and Lock Timesheet
                </button>
              </form>
            </div>
          )}

          {/* Printable signature blocks at bottom of receipt */}
          <div className="hidden print:flex justify-between items-end mt-20 pt-8 border-t border-dashed border-zinc-300">
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="w-48 border-b border-black h-5" />
                <span className="text-[9px] uppercase font-bold text-zinc-400 block">Staff/Employee Initials</span>
              </div>
              <div className="space-y-1">
                {verification ? (
                  <p className="font-mono font-bold text-sm">Signed: {verification.employeeSignature}</p>
                ) : (
                  <div className="w-48 border-b border-black h-5" />
                )}
                <span className="text-[9px] uppercase font-bold text-zinc-400 block">Staff/Employee Signature ({selectedStaff.firstName} {selectedStaff.lastName})</span>
                {verification?.employeeSignedAt && (
                  <p className="text-[8px] text-zinc-400 font-mono mt-0.5">Timestamp: {new Date(verification.employeeSignedAt).toLocaleString()}</p>
                )}
              </div>
            </div>
            
            <div className="text-center text-[8px] text-zinc-450 italic max-w-xs leading-normal pb-4">
              This timesheet audit verification acts as a formal record. Verified entries are locked.
              Printed on {new Date().toLocaleString()} by {currentUser?.displayName || currentUser?.email || 'Admin'}.
            </div>

            <div className="space-y-4 text-right">
              <div className="space-y-1">
                <div className="w-48 border-b border-black h-5 ml-auto" />
                <span className="text-[9px] uppercase font-bold text-zinc-400 block">Manager Initials</span>
              </div>
              <div className="space-y-1">
                {verification ? (
                  <p className="font-mono font-bold text-sm">Signed: {verification.managerSignature}</p>
                ) : (
                  <div className="w-48 border-b border-black h-5 ml-auto" />
                )}
                <span className="text-[9px] uppercase font-bold text-zinc-400 block">Manager/Supervisor Signature</span>
                {verification?.managerSignedAt && (
                  <p className="text-[8px] text-zinc-400 font-mono mt-0.5">Timestamp: {new Date(verification.managerSignedAt).toLocaleString()}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
