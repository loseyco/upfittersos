import { useState, Fragment, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query, orderBy, getDocs, limit, getDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Clock, Calendar, Search, MapPin, Pizza, Coffee,
  Download, AlertCircle, Edit2, AlertTriangle, Info,
  UserCheck, UserX, LogIn, LogOut, RefreshCw, Activity
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { TimeSessionEditorModal } from './TimeSessionEditorModal';
import { WeeklyTimeclockReportModal } from './WeeklyTimeclockReportModal';
import { TSheetsComparison } from './TSheetsComparison';
import { StaffLink } from '../business/StaffPerformance';
import { toast } from 'sonner';

interface TimeclockAdminProps {
  tenantId: string;
}

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
  manuallyEdited?: boolean;
  lastEditedBy?: string;
  lastEditedById?: string;
}

interface Anomaly {
  type: 'early_in' | 'late_in' | 'late_out' | 'unscheduled_day' | 'overnight' | 'long_shift' | 'manual_edit';
  message: string;
  severity: 'warning' | 'info';
}

const getSessionAnomalies = (session: TimeSession, staff: any, dept: any): Anomaly[] => {
  const anomalies: Anomaly[] = [];
  if (!session.clockIn?.timestamp) return anomalies;

  const clockInDate = session.clockIn.timestamp.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
  const clockOutDate = session.clockOut?.timestamp 
    ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate() : new Date(session.clockOut.timestamp))
    : null;

  const schedule = staff?.individualSchedule || dept?.defaultSchedule || { days: [1,2,3,4,5], startTime: '08:00', endTime: '17:00' };

  // Parse scheduled start/end times
  const [schStartH, schStartM] = (schedule.startTime || '08:00').split(':').map(Number);
  const [schEndH, schEndM] = (schedule.endTime || '17:00').split(':').map(Number);

  const schStartMin = schStartH * 60 + schStartM;

  const clockInMin = clockInDate.getHours() * 60 + clockInDate.getMinutes();

  // 1. Unscheduled Day
  const dayOfWeek = clockInDate.getDay() || 7; // 1 = Monday, 7 = Sunday
  const isScheduledDay = schedule.days?.includes(dayOfWeek);
  if (schedule.days && !isScheduledDay) {
    anomalies.push({
      type: 'unscheduled_day',
      message: 'Unscheduled Day',
      severity: 'warning'
    });
  }

  // 2. Early clock-in (only flag if it's a scheduled day)
  if (isScheduledDay) {
    const diffInMin = clockInMin - schStartMin;
    if (diffInMin < -30) { // Clocked in > 30 minutes early
      const hoursEarly = Math.floor(Math.abs(diffInMin) / 60);
      const minsEarly = Math.abs(diffInMin) % 60;
      const earlyStr = hoursEarly > 0 ? `${hoursEarly}h ${minsEarly}m` : `${minsEarly}m`;
      anomalies.push({
        type: 'early_in',
        message: `${earlyStr} Early`,
        severity: 'info'
      });
    } else if (diffInMin > 5) { // Clocked in > 5 minutes late
      const hoursLate = Math.floor(diffInMin / 60);
      const minsLate = diffInMin % 60;
      const lateStr = hoursLate > 0 ? `${hoursLate}h ${minsLate}m` : `${minsLate}m`;
      anomalies.push({
        type: 'late_in',
        message: `${lateStr} Late`,
        severity: 'warning'
      });
    }
  }

  // 3. Clocked out late or worked late
  if (clockOutDate) {
    const clockOutMin = clockOutDate.getHours() * 60 + clockOutDate.getMinutes();
    
    // Check if worked way past scheduled end
    if (isScheduledDay) {
      const schEndMinCalc = schEndH * 60 + schEndM;
      const diffOutMin = clockOutMin - schEndMinCalc;
      if (diffOutMin > 90) { // Clocked out > 1.5 hours late
        const hoursLate = Math.floor(diffOutMin / 60);
        const minsLate = diffOutMin % 60;
        const lateStr = hoursLate > 0 ? `${hoursLate}h ${minsLate}m` : `${minsLate}m`;
        anomalies.push({
          type: 'late_out',
          message: `${lateStr} Overtime`,
          severity: 'warning'
        });
      }
    }

    // 4. Overnight / Late night activity
    const clockInHour = clockInDate.getHours();
    const clockOutHour = clockOutDate.getHours();
    const isOvernight = clockOutDate.getDate() !== clockInDate.getDate();
    if (isOvernight || clockOutHour >= 22 || clockOutHour < 5 || clockInHour < 5) {
      anomalies.push({
        type: 'overnight',
        message: isOvernight ? 'Overnight' : 'Late/Early Hours',
        severity: 'warning'
      });
    }

    // 5. Long Shift
    const durationMs = clockOutDate.getTime() - clockInDate.getTime();
    const durationHrs = durationMs / 3600000;
    if (durationHrs > 15) {
      anomalies.push({
        type: 'long_shift',
        message: `${durationHrs.toFixed(1)}h Long Shift`,
        severity: 'warning'
      });
    }
  } else {
    // If session is ACTIVE
    const durationMs = Date.now() - clockInDate.getTime();
    const durationHrs = durationMs / 3600000;
    if (durationHrs > 16) {
      anomalies.push({
        type: 'long_shift',
        message: `${durationHrs.toFixed(1)}h Active`,
        severity: 'warning'
      });
    }

    const currentHour = new Date().getHours();
    if (currentHour >= 22 || currentHour < 5) {
      anomalies.push({
        type: 'overnight',
        message: 'Active Late Night',
        severity: 'warning'
      });
    }
  }

  // 5. Manual Edit (Edited by someone else)
  if (session.manuallyEdited) {
    const editorName = session.lastEditedBy || 'Admin';
    anomalies.push({
      type: 'manual_edit',
      message: `Edited by ${editorName}`,
      severity: 'warning'
    });
  }

  return anomalies;
};

export function TimeclockAdmin({ tenantId }: TimeclockAdminProps) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'remote' | 'active' | 'flagged'>('all');
  const [editingSession, setEditingSession] = useState<TimeSession | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'logs' | 'reconciliation' | 'corrections' | 'activity' | 'tsheets_comparison'>('logs');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const { data: activityLogs, isLoading: isLoadingLogs } = useQuery({
    queryKey: ['admin-timeclock-activity-logs', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/activity_feed`),
        orderBy('timestamp', 'desc'),
        limit(200)
      );
      const snap = await getDocs(q);
      const allLogs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      // Filter in-memory for safety and speed to ensure we only get timeclock-related logs
      return allLogs.filter(log => log.type === 'time_session');
    }
  });

  const handleViewSessionFromLog = async (sessionId: string) => {
    if (!sessionId) {
      toast.error("No session associated with this log.");
      return;
    }
    const resolveToast = toast.loading("Loading corresponding time session...");
    try {
      const docRef = doc(db, `businesses/${tenantId}/time_sessions`, sessionId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        toast.dismiss(resolveToast);
        setEditingSession({ id: snap.id, ...snap.data() } as TimeSession);
      } else {
        toast.error("The corresponding time session was not found (it may have been deleted).");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load time session.");
    } finally {
      toast.dismiss(resolveToast);
    }
  };

  const handleExportMainCSV = () => {
    try {
      const headers = [
        'Staff Member',
        'User ID',
        'Date',
        'Clock In',
        'Clock Out',
        'Break Duration',
        'Actual Hours',
        'Book Hours',
        'Calculated Pay Hours',
        'Remote',
        'Status'
      ];

      const rows = (filteredSessions || []).map(s => {
        const staff = staffList?.find((st: any) => st.userId === s.userId || st.id === s.userId);
        const displayName = staff ? `${staff.firstName} ${staff.lastName}`.trim() : (s.userName || 'Technician');
        
        const totalMs = calculateDuration(s.clockIn.timestamp, s.clockOut?.timestamp);
        const breakMs = (s.breaks || []).reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0);
        const workMs = totalMs - breakMs;
        const dept = departments?.find((d: any) => d.id === staff?.departmentId);
        const resolvedPayType = staff?.payType && staff.payType !== 'inherit'
          ? staff.payType
          : (dept?.defaultPayType || 'hourly');
        const payMs = calculateSessionPayMs(s, s.payType || resolvedPayType);
        
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

        const formatTimeCSV = (ts: any) => {
          if (!ts) return '';
          const date = ts.toDate ? ts.toDate() : new Date(ts);
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        };

        return [
          `"${displayName}"`,
          s.userId,
          formatDate(s.clockIn.timestamp),
          formatTimeCSV(s.clockIn.timestamp),
          formatTimeCSV(s.clockOut?.timestamp),
          (breakMs / 3600000).toFixed(2),
          (workMs / 3600000).toFixed(2),
          (bookMs / 3600000).toFixed(2),
          (payMs / 3600000).toFixed(2),
          s.isRemote ? 'Yes' : 'No',
          s.status
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
      link.setAttribute('download', `timeclock_sessions_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Timeclock logs exported to CSV');
    } catch (e) {
      toast.error('Failed to export CSV');
      console.error(e);
    }
  };

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['admin-time-sessions', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        orderBy('clockIn.timestamp', 'desc'),
        limit(200)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeSession));
    }
  });

  useEffect(() => {
    if (sessionParam && !editingSession) {
      const found = sessions?.find(s => s.id === sessionParam);
      if (found) {
        setEditingSession(found);
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('session');
        setSearchParams(newParams, { replace: true });
      } else if (sessions) {
        // Fallback: fetch session directly from Firestore if not in current 200 sessions
        const loadSessionDirectly = async () => {
          try {
            const docRef = doc(db, `businesses/${tenantId}/time_sessions`, sessionParam);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
              setEditingSession({ id: snap.id, ...snap.data() } as TimeSession);
            }
          } catch (err) {
            console.error(err);
          } finally {
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('session');
            setSearchParams(newParams, { replace: true });
          }
        };
        loadSessionDirectly();
      }
    }
  }, [sessionParam, sessions, editingSession, searchParams, setSearchParams, tenantId]);

  const { data: editRequests } = useQuery({
    queryKey: ['admin-time-edit-requests', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/time_edit_requests`));
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return docs.sort((a: any, b: any) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });
    }
  });

  const pendingRequests = editRequests?.filter((r: any) => r.status === 'pending') || [];
  const resolvedRequests = editRequests?.filter((r: any) => r.status !== 'pending') || [];

  const { data: departments } = useQuery({
    queryKey: ['admin-departments', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    }
  });

  const { data: staffList } = useQuery({
    queryKey: ['admin-staff-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(s => !s.isArchived && !s.fireDate && s.departmentId);
    }
  });



  const formatTime = (ts: any) => {
    if (!ts) return '--:--';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts: any) => {
    if (!ts) return '--';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const calculateDuration = (start: any, end: any) => {
    if (!start) return 0;
    const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
    const e = end ? (end.toDate ? end.toDate().getTime() : new Date(end).getTime()) : Date.now();
    return Math.max(0, e - s);
  };

  const formatDuration = (ms: number) => {
    const isNegative = ms < 0;
    const absoluteMs = Math.abs(ms);
    const hours = Math.floor(absoluteMs / 3600000);
    const minutes = Math.floor((absoluteMs % 3600000) / 60000);
    return `${isNegative ? '-' : ''}${hours}h ${minutes}m`;
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

  const filteredSessions = sessions?.filter(s => {
    const staff = staffList?.find((st: any) => st.userId === s.userId || st.id === s.userId);
    if (!staff) return false;
    const displayName = `${staff.firstName} ${staff.lastName}`.trim();
    const matchesSearch = displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.userId?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'remote') {
      return s.isRemote === true;
    } else if (filterType === 'active') {
      return s.status !== 'completed';
    } else if (filterType === 'flagged') {
      const dept = departments?.find((d: any) => d.id === staff?.departmentId);
      return getSessionAnomalies(s, staff, dept).length > 0;
    }
    return true;
  });

  const flaggedCount = sessions?.filter(s => {
    const staff = staffList?.find((st: any) => st.userId === s.userId || st.id === s.userId);
    if (!staff) return false;
    const dept = departments?.find((d: any) => d.id === staff?.departmentId);
    return getSessionAnomalies(s, staff, dept).length > 0;
  }).length || 0;

  const handleReviewEdit = (req: any) => {
    const session = sessions?.find(s => s.id === req.sessionId);
    if (session) {
      setActiveRequestId(req.id);
      setEditingSession(session);
    }
  };

  if (isLoading) return <div className="p-12 text-center text-zinc-500">Loading payroll data...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm print-hidden">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            Payroll & Attendance
          </h2>
          <p className="text-sm text-zinc-555 mt-1">Review and manage staff time entries.</p>
        </div>

        {viewMode === 'logs' && (
          <div className="flex items-center gap-2">
            <button 
              onClick={handleExportMainCSV}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-bold transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        )}
      </div>

      {/* View Mode Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 print-hidden">
        <button
          onClick={() => setViewMode('logs')}
          className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 px-6 transition-all cursor-pointer ${
            viewMode === 'logs'
              ? 'border-indigo-500 text-indigo-600 dark:text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
          }`}
        >
          Attendance Logs
        </button>
        <button
          onClick={() => setViewMode('reconciliation')}
          className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 px-6 transition-all cursor-pointer ${
            viewMode === 'reconciliation'
              ? 'border-indigo-500 text-indigo-600 dark:text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
          }`}
        >
          Weekly Reconciliation
        </button>
        <button
          onClick={() => setViewMode('corrections')}
          className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 px-6 transition-all cursor-pointer flex items-center gap-2 ${
            viewMode === 'corrections'
              ? 'border-indigo-500 text-indigo-600 dark:text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
          }`}
        >
          <span>Needs Reviewed/Request</span>
          {(pendingRequests.length + flaggedCount) > 0 && (
            <span className="bg-amber-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded-full">
              {pendingRequests.length + flaggedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setViewMode('activity')}
          className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 px-6 transition-all cursor-pointer flex items-center gap-2 ${
            viewMode === 'activity'
              ? 'border-indigo-500 text-indigo-600 dark:text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-350'
          }`}
        >
          <span>Manager Activity Logs</span>
        </button>
        <button
          onClick={() => setViewMode('tsheets_comparison')}
          className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 px-6 transition-all cursor-pointer flex items-center gap-2 ${
            viewMode === 'tsheets_comparison'
              ? 'border-indigo-500 text-indigo-600 dark:text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-350'
          }`}
        >
          <span>TSheets Comparison</span>
        </button>
      </div>

      {viewMode === 'reconciliation' && (
        <WeeklyTimeclockReportModal
          tenantId={tenantId}
          isInline={true}
        />
      )}

      {viewMode === 'logs' && (
        <>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search staff name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white text-sm"
              />
            </div>
            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
              {(['all', 'remote', 'active', 'flagged'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 ${
                    filterType === type 
                      ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm' 
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-350'
                  }`}
                >
                  <span>{type}</span>
                  {type === 'flagged' && flaggedCount > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none ${
                      filterType === 'flagged'
                        ? 'bg-indigo-600 text-white dark:bg-white dark:text-zinc-900'
                        : 'bg-amber-500 text-white'
                    }`}>
                      {flaggedCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {pendingRequests.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-100">Pending Correction Requests</p>
                  <p className="text-xs text-zinc-500 mt-0.5">There are {pendingRequests.length} pending timecard correction requests that require review.</p>
                </div>
              </div>
              <button 
                onClick={() => setViewMode('corrections')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-md shadow-amber-500/10"
              >
                Go to Corrections
              </button>
            </div>
          )}

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-6 py-4">Staff Member</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Shift</th>
                    <th className="px-6 py-4">Breaks</th>
                    <th className="px-6 py-4 text-right">Actual Hours</th>
                    <th className="px-6 py-4 text-right">Book Hours</th>
                    <th className="px-6 py-4 text-right">Pay Hours</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150 dark:divide-zinc-800">
                  {filteredSessions?.map((session: TimeSession) => {
                    const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
                    const breakMs = (session.breaks || []).reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0);
                    const workMs = totalMs - breakMs;

                    const staff = staffList?.find((s: any) => s.userId === session.userId || s.id === session.userId);
                    const dept = departments?.find((d: any) => d.id === staff?.departmentId);
                    const resolvedPayType = staff?.payType && staff.payType !== 'inherit'
                      ? staff.payType
                      : (dept?.defaultPayType || 'hourly');
                    const sessionPayType = session.payType || resolvedPayType;
                    const isFlatRate = sessionPayType === 'flat_rate';
                    const isSalary = sessionPayType === 'salary';

                    // Resolve actual name dynamically from staff roster if available to heal/override fallback names
                    const displayName = staff ? `${staff.firstName} ${staff.lastName}`.trim() : (session.userName || 'Unknown Staff');
                    const avatarChar = displayName[0] || 'T';

                    const payMs = calculateSessionPayMs(session, sessionPayType);
                    const bookMs = (() => {
                      if (!session.jobs || session.jobs.length === 0) return 0;
                      const taskBookTime: Record<string, number> = {};
                      session.jobs.forEach((j: any, idx: number) => {
                        const key = j.taskId || `manual-${idx}-${j.name}`;
                        if (j.bookTime && j.bookTime > 0) {
                          taskBookTime[key] = j.bookTime * 3600000;
                        }
                      });
                      return Object.values(taskBookTime).reduce((acc, t) => acc + t, 0);
                    })();
                    const diffMs = payMs - workMs;

                    const anomalies = getSessionAnomalies(session, staff, dept);

                    let creditText = '';
                    if (staff?.payPeriodBookTimeCredit && staff.payPeriodBookTimeCredit > 0) {
                      creditText = `+${staff.payPeriodBookTimeCredit}h Credit Override`;
                    } else if (dept?.weeklyBookTimeCredit && dept.weeklyBookTimeCredit > 0) {
                      creditText = `+${dept.weeklyBookTimeCredit}h Weekly Default`;
                    }

                    return (
                      <Fragment key={session.id}>
                        <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors cursor-pointer group" onClick={() => setEditingSession(session)}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-600 font-bold text-xs relative">
                                {avatarChar}
                                {anomalies.length > 0 && (
                                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center" title="Flagged: Out of place entry">
                                    <span className="w-1 h-1 bg-white rounded-full animate-ping" />
                                  </span>
                                )}
                              </div>
                              <div>
                                <StaffLink 
                                  name={displayName} 
                                  tenantId={tenantId} 
                                  staffId={staff?.id} 
                                  className="font-bold text-zinc-900 dark:text-white hover:text-indigo-600 hover:underline" 
                                />
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <p className="text-[10px] text-zinc-450 font-mono">{session.userId?.slice(0, 8)}</p>
                                  {isFlatRate && (
                                    <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded leading-none">
                                      Flat-Rate
                                    </span>
                                  )}
                                  {isSalary && (
                                     <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded leading-none">
                                       Salary
                                     </span>
                                   )}
                                  {creditText && (
                                    <span className="text-[9px] font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded leading-none" title="Book Time Credit Allowance">
                                      {creditText}
                                    </span>
                                  )}
                                  {session.verificationStatus === 'pending' && (
                                    <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded leading-none animate-pulse">
                                      Needs Verification
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              <span className="font-medium text-zinc-650 dark:text-zinc-450">{formatDate(session.clockIn.timestamp)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-black font-mono">
                                {formatTime(session.clockIn.timestamp)} → {formatTime(session.clockOut?.timestamp)}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {session.isRemote ? (
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 uppercase">
                                    <MapPin className="w-3 h-3" /> Remote
                                  </span>
                                ) : session.clockIn.onSite === false && (
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-rose-500 uppercase">
                                    <MapPin className="w-3 h-3" /> Off-site
                                  </span>
                                )}
                                {session.status !== 'completed' && (
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 animate-pulse uppercase">
                                    Active
                                  </span>
                                )}
                                {anomalies.map((a, idx) => (
                                  <span 
                                    key={idx}
                                    className={`flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase ${
                                      a.severity === 'warning'
                                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                        : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                                    }`}
                                    title={a.message}
                                  >
                                    {a.severity === 'warning' ? <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> : <AlertCircle className="w-2.5 h-2.5 shrink-0" />}
                                    {a.message}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="flex -space-x-1">
                                {(session.breaks || []).map((b: any, i: number) => (
                                  <div key={i} className="p-1 bg-zinc-150 dark:bg-zinc-800 rounded-full border border-white dark:border-zinc-900" title={`${b.type} break`}>
                                    {b.type === 'lunch' ? <Pizza className="w-3 h-3 text-zinc-500" /> : <Coffee className="w-3 h-3 text-zinc-500" />}
                                  </div>
                                ))}
                              </div>
                              <span className="text-[10px] font-bold text-zinc-400 uppercase">{formatDuration(breakMs)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400 font-mono">
                              {formatDuration(workMs)}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <p className="text-sm font-bold text-indigo-500 dark:text-indigo-455 font-mono">
                              {formatDuration(bookMs)}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="flex flex-col items-end">
                                <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono">
                                  {formatDuration(payMs)}
                                </p>
                                {isFlatRate ? (
                                  <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-black uppercase mt-0.5 whitespace-nowrap">
                                    Flat-Rate ({((payMs) / 3600000).toFixed(1)}h)
                                  </span>
                                ) : (
                                  <>
                                    {diffMs > 0 && (
                                      <span className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-black uppercase mt-0.5 whitespace-nowrap">
                                        +{((diffMs) / 3600000).toFixed(1)}h from Book
                                      </span>
                                    )}
                                    {diffMs < 0 && (
                                      <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-black uppercase mt-0.5 whitespace-nowrap">
                                        {((diffMs) / 3600000).toFixed(1)}h from Book
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedSessionId(expandedSessionId === session.id ? null : session.id);
                                }}
                                className="p-1 hover:bg-zinc-150 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-indigo-500 transition-colors cursor-pointer"
                                title="Show Session Calculation Details"
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Edit2 className="w-4 h-4 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </td>
                        </tr>
                        {expandedSessionId === session.id && (() => {
                          const sessionEnd = session.clockOut?.timestamp
                            ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate().getTime() : new Date(session.clockOut.timestamp).getTime())
                            : Date.now();
 
                          const taskDetails = (session.jobs || []).map((j: any) => {
                            const start = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
                            const end = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : sessionEnd;
                            const durationMs = Math.max(0, end - start);
                            const taskBookMs = (j.bookTime || 0) * 3600000;
                            const basis = j.payBasis || 'book_time';
                            
                            return {
                              name: j.name,
                              taskName: j.taskName || 'General task contribution',
                              durationMs,
                              bookMs: taskBookMs,
                              basis,
                              earnedMs: basis === 'hourly' || taskBookMs === 0 ? durationMs : 0
                            };
                          });
 
                          const totalHourlyContribMs = taskDetails.reduce((acc, t) => acc + t.earnedMs, 0);
                          const capLabel = totalHourlyContribMs > workMs ? 'Capped at total shift work hours' : '';
 
                          return (
                            <tr className="bg-zinc-50/70 dark:bg-zinc-900/40 select-text" onClick={(e) => e.stopPropagation()}>
                              <td colSpan={8} className="px-6 py-5 border-t border-b border-zinc-150 dark:border-zinc-800">
                                <div className="bg-white dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-5 text-xs text-zinc-650 dark:text-zinc-350 space-y-4 shadow-sm">
                                  <div className="flex justify-between items-center border-b border-zinc-150 dark:border-zinc-805 pb-2.5">
                                    <h5 className="font-bold text-zinc-850 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                                      <Info className="w-4 h-4 text-indigo-500" /> Shift Pay Breakdown: {displayName}
                                    </h5>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded">
                                      Pay Type: {sessionPayType === 'flat_rate' ? 'Flat-Rate' : sessionPayType === 'salary' ? 'Salary' : 'Hourly'}
                                    </span>
                                  </div>
 
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-medium">
                                    <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1">
                                      <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block font-sans">Shift Elapsed Time</span>
                                      <p className="text-sm font-black text-zinc-850 dark:text-white font-mono">{formatDuration(totalMs)}</p>
                                      <p className="text-[10px] text-zinc-450 mt-1">Total elapsed duration from clock-in to clock-out.</p>
                                    </div>
                                    <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1">
                                      <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block font-sans">Unpaid Breaks</span>
                                      <p className="text-sm font-black text-zinc-850 dark:text-white font-mono">{formatDuration(breakMs)}</p>
                                      <p className="text-[10px] text-zinc-450 mt-1">Deducted unpaid lunch or normal breaks.</p>
                                    </div>
                                    <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1">
                                      <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block font-sans">Actual Work Time</span>
                                      <p className="text-sm font-black text-indigo-650 dark:text-indigo-400 font-mono">{formatDuration(workMs)}</p>
                                      <p className="text-[10px] text-zinc-450 mt-1">Net shift actual hours (Elapsed minus Breaks).</p>
                                    </div>
                                  </div>
 
                                  {/* Clocked Jobs List */}
                                  {taskDetails.length > 0 ? (
                                    <div className="border border-zinc-150 dark:border-zinc-800 rounded-xl overflow-hidden">
                                      <div className="bg-zinc-50 dark:bg-zinc-900/50 px-4 py-2 border-b border-zinc-150 dark:border-zinc-800">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Tasks Clocked During This Session</span>
                                      </div>
                                      <table className="w-full text-left border-collapse text-zinc-700 dark:text-zinc-300">
                                        <thead>
                                          <tr className="bg-zinc-50/20 dark:bg-zinc-900/20 text-[9px] uppercase font-bold text-zinc-450 border-b border-zinc-150 dark:border-zinc-800">
                                            <th className="px-4 py-2">Job Name</th>
                                            <th className="px-4 py-2">Task Name</th>
                                            <th className="px-4 py-2">Basis</th>
                                            <th className="px-4 py-2 text-right">Time Spent</th>
                                            <th className="px-4 py-2 text-right">Book Time</th>
                                            <th className="px-4 py-2 text-right font-bold text-indigo-550 dark:text-indigo-400">Shift Pay Hours</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-150 dark:divide-zinc-850 font-medium">
                                          {taskDetails.map((t, idx) => (
                                            <tr key={idx} className="text-[11px]">
                                              <td className="px-4 py-2 truncate max-w-[150px]">{t.name}</td>
                                              <td className="px-4 py-2 truncate max-w-[200px] text-zinc-550 dark:text-zinc-450">{t.taskName}</td>
                                              <td className="px-4 py-2">
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-extrabold ${t.basis === 'hourly' || t.bookMs === 0 ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                                                  {t.basis === 'hourly' || t.bookMs === 0 ? 'Hourly' : 'Flat Rate'}
                                                </span>
                                              </td>
                                              <td className="px-4 py-2 text-right font-mono">{formatDuration(t.durationMs)}</td>
                                              <td className="px-4 py-2 text-right font-mono text-zinc-500">{t.bookMs > 0 ? `${(t.bookMs / 3600000).toFixed(2)}h` : '—'}</td>
                                              <td className="px-4 py-2 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                {sessionPayType === 'flat_rate' ? (
                                                  t.basis === 'hourly' || t.bookMs === 0 ? (
                                                    formatDuration(t.durationMs)
                                                  ) : (
                                                    <span className="text-zinc-400 text-[10px]" title="Flat rate tasks are paid upon completed/QC status, not on the clock-in shift itself.">Paid on completion (0h 00m)</span>
                                                  )
                                                ) : (
                                                  formatDuration(t.durationMs)
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="p-3 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-150 dark:border-zinc-800 rounded-xl text-center text-zinc-450 italic">
                                      No tasks clocked inside this session. Paid hourly for base clocked duration.
                                    </div>
                                  )}
 
                                  <div className="bg-indigo-50/30 dark:bg-indigo-950/5 p-3.5 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-[13px] font-bold">
                                    <span className="text-zinc-550 dark:text-zinc-455">Calculation Formula:</span>
                                    {sessionPayType === 'flat_rate' ? (
                                      <span className="font-mono text-indigo-650 dark:text-indigo-400 text-right leading-relaxed">
                                        Min(Work Time: {formatDuration(workMs)}, Hourly Tasks Sum: {formatDuration(totalHourlyContribMs)}) = {formatDuration(payMs)} Shift Pay Hours
                                        {capLabel && <span className="text-[10px] text-amber-500 font-sans block mt-0.5 font-bold">({capLabel})</span>}
                                      </span>
                                    ) : sessionPayType === 'hourly' ? (
                                      <span className="font-mono text-indigo-650 dark:text-indigo-400 text-right leading-relaxed">
                                        Work Time: {formatDuration(workMs)} + Book Time Adjustments: {formatDuration(payMs - workMs)} = {formatDuration(payMs)} Shift Pay Hours
                                      </span>
                                    ) : (
                                      <span className="font-mono text-indigo-650 dark:text-indigo-400 text-right">
                                        Work Time = {formatDuration(workMs)} Shift Pay Hours
                                      </span>
                                    )}
                                  </div>
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
              {filteredSessions?.length === 0 && (
                <div className="p-12 text-center text-zinc-500 italic">No time entries found.</div>
              )}
            </div>
          </div>        </>
      )}

      {viewMode === 'corrections' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Pending Correction Requests Section */}
          <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-amber-900 dark:text-amber-100">Pending Correction Requests</h3>
              <span className="bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded text-xs font-black">
                {pendingRequests.length}
              </span>
            </div>
            
            {pendingRequests.length > 0 ? (
              <div className="grid gap-3">
                {pendingRequests.map((req: any) => (
                  <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-xl border border-amber-100 dark:border-zinc-800 shadow-sm gap-4">
                    <div className="flex items-start sm:items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-amber-150/50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 font-bold shrink-0">
                        {req.userName?.[0] || 'U'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">{req.userName}</p>
                          <span className="text-[10px] text-zinc-400 font-medium">Requested on {formatDate(req.createdAt)}</span>
                        </div>
                        <p className="text-xs text-zinc-650 dark:text-zinc-350 italic mt-0.5">"{req.note}"</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleReviewEdit(req)}
                      className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-amber-500/10 cursor-pointer self-start sm:self-center"
                    >
                      Review & Resolve
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 italic">No pending correction requests from technicians.</p>
            )}
          </div>

          {/* Flagged Anomalies Section */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm space-y-4">
            <div className="p-6 border-b border-zinc-150 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-950/20">
              <h3 className="font-bold text-zinc-950 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Flagged Shift Anomalies
              </h3>
              <p className="text-xs text-zinc-550 mt-1">Shifts flagged by the system as potentially incorrect (e.g. extremely long hours, off-site, overnight, unscheduled).</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-6 py-4">Staff Member</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Clocked Shift</th>
                    <th className="px-6 py-4">Unresolved System Flags</th>
                    <th className="px-6 py-4 text-right">Actual Hours</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {(() => {
                    const flaggedSessions = sessions?.filter(s => {
                      const staff = staffList?.find((st: any) => st.userId === s.userId || st.id === s.userId);
                      if (!staff) return false;
                      const dept = departments?.find((d: any) => d.id === staff?.departmentId);
                      const hasAnomaly = getSessionAnomalies(s, staff, dept).length > 0;
                      const needsVerification = s.verificationStatus === 'pending';
                      return hasAnomaly || needsVerification;
                    }) || [];

                    return flaggedSessions.map((session) => {
                      const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
                      const breakMs = (session.breaks || []).reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0);
                      const workMs = totalMs - breakMs;

                      const staff = staffList?.find((s: any) => s.userId === session.userId || s.id === session.userId);
                      const dept = departments?.find((d: any) => d.id === staff?.departmentId);
                      
                      const anomalies = getSessionAnomalies(session, staff, dept);
                      const needsVerification = session.verificationStatus === 'pending';

                      return (
                        <tr key={session.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors">
                          <td className="px-6 py-4 font-bold text-zinc-900 dark:text-white">
                            {staff ? `${staff.firstName} ${staff.lastName}` : (session.userName || 'Unknown Staff')}
                          </td>
                          <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 whitespace-nowrap font-medium">
                            {formatDate(session.clockIn.timestamp)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-mono text-zinc-650 dark:text-zinc-350 bg-zinc-50 dark:bg-zinc-800/50 px-2.5 py-1 rounded-lg border border-zinc-200/50 dark:border-zinc-750/30">
                              {formatTime(session.clockIn.timestamp)} → {formatTime(session.clockOut?.timestamp)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              {needsVerification && (
                                <span className="bg-rose-500/10 text-rose-600 dark:text-rose-450 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide">
                                  Needs Verification
                                </span>
                              )}
                              {anomalies.map((anom, idx) => (
                                <span 
                                  key={idx} 
                                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide ${
                                    anom.severity === 'warning' 
                                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-450 border border-rose-500/20' 
                                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                  }`}
                                >
                                  {anom.message}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-zinc-900 dark:text-white">
                            {formatDuration(workMs)}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <button 
                              onClick={() => setEditingSession(session)}
                              className="p-2 text-zinc-400 hover:text-indigo-650 dark:hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all cursor-pointer"
                              title="Edit/Verify Entry"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                  {(() => {
                    const flaggedSessions = sessions?.filter(s => {
                      const staff = staffList?.find((st: any) => st.userId === s.userId || st.id === s.userId);
                      if (!staff) return false;
                      const dept = departments?.find((d: any) => d.id === staff?.departmentId);
                      const hasAnomaly = getSessionAnomalies(s, staff, dept).length > 0;
                      const needsVerification = s.verificationStatus === 'pending';
                      return hasAnomaly || needsVerification;
                    }) || [];
                    
                    return flaggedSessions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-zinc-550 italic">
                          No shifts flagged with anomalies. Everything is in order!
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Clock Correction Log History Section */}
          {resolvedRequests.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm space-y-4">
              <div className="p-6 border-b border-zinc-150 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-950/20">
                <h3 className="font-bold text-zinc-955 dark:text-white">Clock Correction Log History</h3>
                <p className="text-xs text-zinc-550 mt-1">Audit log of all resolved timecard correction requests.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-zinc-50 dark:bg-zinc-850/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-6 py-4">Staff Member</th>
                      <th className="px-6 py-4">Requested On</th>
                      <th className="px-6 py-4">Original → Proposed Times</th>
                      <th className="px-6 py-4">Reason / Note</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Resolved By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {resolvedRequests.slice(0, 50).map((req: any) => {
                      const formatDatetimeDisplayShort = (ts: any) => {
                        if (!ts) return '--';
                        try {
                          const d = ts.toDate ? ts.toDate() : new Date(ts);
                          if (isNaN(d.getTime())) return '--';
                          return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        } catch {
                          return '--';
                        }
                      };
                      
                      return (
                        <tr key={req.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-650 dark:text-zinc-400 font-bold text-xs">
                                {req.userName?.[0] || 'U'}
                              </div>
                              <span className="font-bold text-zinc-900 dark:text-white">{req.userName}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 font-medium whitespace-nowrap">
                            {formatDate(req.createdAt)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1 text-xs">
                              {req.originalClockIn && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[9px] text-zinc-450 font-bold uppercase mr-1 w-6">In:</span>
                                  <span className="font-mono text-zinc-400 dark:text-zinc-500 line-through">
                                    {formatDatetimeDisplayShort(req.originalClockIn)}
                                  </span>
                                  <span className="text-zinc-400">➔</span>
                                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                    {formatDatetimeDisplayShort(req.proposedClockIn)}
                                  </span>
                                </div>
                              )}
                              {req.originalClockOut && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[9px] text-zinc-450 font-bold uppercase mr-1 w-6">Out:</span>
                                  <span className="font-mono text-zinc-400 dark:text-zinc-500 line-through">
                                    {formatDatetimeDisplayShort(req.originalClockOut)}
                                  </span>
                                  <span className="text-zinc-400">➔</span>
                                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                    {formatDatetimeDisplayShort(req.proposedClockOut)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-zinc-650 dark:text-zinc-400 italic text-xs max-w-xs truncate" title={req.note}>
                            {req.note || 'No reason provided'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              req.status === 'approved' 
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                            }`}>
                              {req.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-zinc-550 dark:text-zinc-400 whitespace-nowrap">
                            <p className="font-bold">{req.resolvedBy || 'Admin'}</p>
                            {req.resolvedAt && (
                              <p className="text-[9px] font-mono text-zinc-400 mt-0.5">
                                {formatDatetimeDisplayShort(req.resolvedAt)}
                              </p>
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
        </div>
      )}

      {viewMode === 'activity' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-zinc-150 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-950/20">
              <h3 className="font-bold text-zinc-950 dark:text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500" />
                Manager Activity & Overrides
              </h3>
              <p className="text-xs text-zinc-550 mt-1">Audit trail of all administrative adjustments, approvals, force clock actions, and manual timecard edits.</p>
            </div>
            
            <div className="overflow-x-auto">
              {isLoadingLogs ? (
                <div className="p-12 text-center text-zinc-500">Loading audit logs...</div>
              ) : activityLogs && activityLogs.length > 0 ? (
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-6 py-4">Timestamp</th>
                      <th className="px-6 py-4">Action</th>
                      <th className="px-6 py-4">Performed By</th>
                      <th className="px-6 py-4">Target Technician</th>
                      <th className="px-6 py-4">Log Message</th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
                    {activityLogs.map((log: any) => {
                      const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
                      const formattedDate = isNaN(logDate.getTime()) 
                        ? '--' 
                        : logDate.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

                      const title = log.title || 'System Action';
                      const message = log.message || '';
                      const author = log.author || 'System';
                      const technician = log.metadata?.technicianName || 'Staff Member';
                      const sessionId = log.metadata?.sessionId;

                      let badgeStyle = 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
                      let ActionIcon = Clock;

                      if (title.includes('Approved')) {
                        badgeStyle = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
                        ActionIcon = UserCheck;
                      } else if (title.includes('Rejected')) {
                        badgeStyle = 'bg-rose-500/10 text-rose-600 dark:text-rose-455 border border-rose-500/20';
                        ActionIcon = UserX;
                      } else if (title.includes('Clock Out')) {
                        badgeStyle = 'bg-rose-500/10 text-rose-600 dark:text-rose-455 border border-rose-500/20';
                        ActionIcon = LogOut;
                      } else if (title.includes('Clock In')) {
                        badgeStyle = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
                        ActionIcon = LogIn;
                      } else if (title.includes('Break')) {
                        badgeStyle = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20';
                        ActionIcon = Coffee;
                      } else if (title.includes('Resume')) {
                        badgeStyle = 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20';
                        ActionIcon = RefreshCw;
                      } else if (title.includes('Updated') || title.includes('Correction Requested')) {
                        badgeStyle = 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20';
                        ActionIcon = Edit2;
                      }

                      return (
                        <tr 
                          key={log.id} 
                          onClick={() => sessionId && handleViewSessionFromLog(sessionId)}
                          className={cn(
                            "hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors",
                            sessionId && "cursor-pointer group"
                          )}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-zinc-500 dark:text-zinc-400">
                            {formattedDate}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={cn(
                              "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 w-fit leading-none",
                              badgeStyle
                            )}>
                              <ActionIcon className="w-3 h-3 shrink-0" />
                              {title}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-zinc-700 dark:text-zinc-300 font-bold">
                            {author}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-zinc-900 dark:text-white font-bold">
                            {technician}
                          </td>
                          <td className="px-6 py-4 text-xs text-zinc-550 dark:text-zinc-400 max-w-sm truncate" title={message}>
                            {message}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            {sessionId && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewSessionFromLog(sessionId);
                                }}
                                className="p-2 text-zinc-300 group-hover:text-indigo-500 hover:bg-indigo-500/10 rounded-lg transition-all"
                                title="Inspect Time Session"
                              >
                                <Info className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="p-12 text-center text-zinc-500 italic font-medium">No manager activity logs found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'tsheets_comparison' && (
        <TSheetsComparison tenantId={tenantId} />
      )}

      {editingSession && (
        <TimeSessionEditorModal
          tenantId={tenantId}
          session={editingSession}
          requestId={activeRequestId}
          onClose={() => {
            setEditingSession(null);
            setActiveRequestId(undefined);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-time-sessions', tenantId] });
            queryClient.invalidateQueries({ queryKey: ['admin-time-edit-requests', tenantId] });
            queryClient.invalidateQueries({ queryKey: ['admin-timeclock-activity-logs', tenantId] });
          }}
        />
      )}
    </div>
  );
}
