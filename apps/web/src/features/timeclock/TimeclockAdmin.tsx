import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Clock, Calendar, Search, MapPin, Pizza, Coffee,
  Download, FileText, AlertCircle, Edit2, AlertTriangle
} from 'lucide-react';
import { TimeSessionEditorModal } from './TimeSessionEditorModal';

interface TimeclockAdminProps {
  tenantId: string;
}

interface TimeSession {
  id: string;
  userId: string;
  userName?: string;
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
}

interface Anomaly {
  type: 'early_in' | 'late_in' | 'late_out' | 'unscheduled_day' | 'overnight' | 'long_shift';
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
    } else if (diffInMin > 60) { // Clocked in > 1 hour late
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
    if (durationHrs > 10) {
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
    if (durationHrs > 12) {
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

  return anomalies;
};

export function TimeclockAdmin({ tenantId }: TimeclockAdminProps) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'remote' | 'active' | 'flagged'>('all');
  const [editingSession, setEditingSession] = useState<TimeSession | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | undefined>(undefined);

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

    if (!session.jobs || session.jobs.length === 0) {
      return payType === 'flat_rate' ? 0 : workMs;
    }

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

    if (payType === 'flat_rate') {
      return Object.values(taskBookTime).reduce((acc, t) => acc + t, 0);
    }

    let adjustmentMs = 0;
    Object.keys(taskBookTime).forEach(key => {
      const actualMs = taskActualTime[key] || 0;
      const bookMs = taskBookTime[key] || 0;
      adjustmentMs += (bookMs - actualMs);
    });

    return Math.max(0, workMs + adjustmentMs);
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            Payroll & Attendance
          </h2>
          <p className="text-sm text-zinc-500 mt-1">Review and manage staff time entries.</p>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-bold transition-all">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20">
            <FileText className="w-4 h-4" /> Reports
          </button>
        </div>
      </div>

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
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
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
        <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-amber-900 dark:text-amber-100">Pending Correction Requests</h3>
            <span className="bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded text-xs font-black">
              {pendingRequests.length}
            </span>
          </div>
          <div className="grid gap-3">
            {pendingRequests.map((req: any) => (
              <div key={req.id} className="flex items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-xl border border-amber-100 dark:border-zinc-800 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 font-bold">
                    {req.userName?.[0]}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">{req.userName}</p>
                    <p className="text-xs text-zinc-555 line-clamp-1 italic">"{req.note}"</p>
                  </div>
                </div>
                <button 
                  onClick={() => handleReviewEdit(req)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-widest px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-all"
                >
                  Review Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest">
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
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filteredSessions?.map((session: TimeSession) => {
                const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
                const breakMs = (session.breaks || []).reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0);
                const workMs = totalMs - breakMs;

                const staff = staffList?.find((s: any) => s.userId === session.userId || s.id === session.userId);
                const dept = departments?.find((d: any) => d.id === staff?.departmentId);
                const isFlatRate = staff?.payType === 'flat_rate';

                // Resolve actual name dynamically from staff roster if available to heal/override fallback names
                const displayName = staff ? `${staff.firstName} ${staff.lastName}`.trim() : (session.userName || 'Technician');
                const avatarChar = displayName[0] || 'T';

                const payMs = calculateSessionPayMs(session, staff?.payType);
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
                  <tr key={session.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors cursor-pointer group" onClick={() => setEditingSession(session)}>
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
                          <p className="font-bold text-zinc-900 dark:text-white">{displayName}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <p className="text-[10px] text-zinc-400 font-mono">{session.userId?.slice(0, 8)}</p>
                            {isFlatRate && (
                              <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded leading-none">
                                Flat-Rate
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
                        <span className="font-medium text-zinc-600 dark:text-zinc-400">{formatDate(session.clockIn.timestamp)}</span>
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
                            <div key={i} className="p-1 bg-zinc-100 dark:bg-zinc-800 rounded-full border border-white dark:border-zinc-900" title={`${b.type} break`}>
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
                      <p className="text-sm font-bold text-indigo-505 dark:text-indigo-400 font-mono">
                        {formatDuration(bookMs)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
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
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Edit2 className="w-4 h-4 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredSessions?.length === 0 && (
            <div className="p-12 text-center text-zinc-500 italic">No time entries found.</div>
          )}
        </div>
      </div>

      {resolvedRequests.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm space-y-4">
          <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-950/20">
            <h3 className="font-bold text-zinc-900 dark:text-white">Clock Correction Log History</h3>
            <p className="text-xs text-zinc-500 mt-1">Audit log of all resolved timecard correction requests.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest">
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
                      <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 italic text-xs max-w-xs truncate" title={req.note}>
                        "{req.note}"
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          req.status === 'approved' 
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                        }`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
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
            queryClient.invalidateQueries({ queryKey: ['admin-time-sessions'] });
            queryClient.invalidateQueries({ queryKey: ['admin-time-edit-requests'] });
          }}
        />
      )}
    </div>
  );
}
