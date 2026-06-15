import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, orderBy, getDocs, limit, addDoc, serverTimestamp, collectionGroup, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { Clock, MapPin, Calendar, MessageSquare, Send, X, AlertCircle, Info, Timer, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { TimeSessionEditorModal } from './TimeSessionEditorModal';

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
    payBasis?: string;
    notes?: string;
  }>;
  status: string;
  verificationStatus?: string;
  payType?: string;
  notes?: string;
  staffNote?: string;
}

interface JobWithTasks {
  jobId: string;
  jobName: string;
  taskIds: string[];
}

interface JobPhotoGroup {
  jobName: string;
  images: string[];
}

function SessionBreakdownSection({ 
  tenantId, 
  session,
  now
}: { 
  tenantId: string; 
  session: TimeSession;
  now: number;
}) {
  const [jobPhotos, setJobPhotos] = useState<JobPhotoGroup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tenantId || !session.jobs || session.jobs.length === 0) {
      setJobPhotos([]);
      return;
    }
    let active = true;
    setLoading(true);

    const fetchAllPhotos = async () => {
      try {
        const uniqueJobsMap: Record<string, JobWithTasks> = {};
        session.jobs!.forEach(j => {
          if (!j.id) return;
          if (!uniqueJobsMap[j.id]) {
            uniqueJobsMap[j.id] = {
              jobId: j.id,
              jobName: j.name || 'Job',
              taskIds: []
            };
          }
          if (j.taskId && !uniqueJobsMap[j.id].taskIds.includes(j.taskId)) {
            uniqueJobsMap[j.id].taskIds.push(j.taskId);
          }
        });

        const uniqueJobs = Object.values(uniqueJobsMap);
        const results: JobPhotoGroup[] = [];

        const promises = uniqueJobs.map(async (job) => {
          if (job.taskIds.length === 0) return;
          const allUrls: string[] = [];
          const taskPromises = job.taskIds.map(async (taskId) => {
            const taskSnap = await getDoc(doc(db, `businesses/${tenantId}/jobs/${job.jobId}/tasks`, taskId));
            if (taskSnap.exists()) {
              const data = taskSnap.data();
              const notes = data.task_notes || [];
              notes.forEach((n: any) => {
                if (n.images && Array.isArray(n.images)) {
                  allUrls.push(...n.images);
                }
              });
            }
          });
          await Promise.all(taskPromises);
          if (allUrls.length > 0) {
            results.push({
              jobName: job.jobName,
              images: allUrls
            });
          }
        });

        await Promise.all(promises);

        if (active) {
          setJobPhotos(results);
        }
      } catch (err) {
        console.warn('Error fetching session breakdown photos:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchAllPhotos();
    return () => { active = false; };
  }, [tenantId, session.jobs]);

  const hasPhotos = jobPhotos.length > 0;
  const hasBreaks = session.breaks && session.breaks.length > 0;

  if (loading) {
    return (
      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 w-full text-left space-y-3">
        <span className="block text-[11px] font-extrabold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider animate-pulse">
          Session Activity & Breakdown
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-pulse">
          <div className="space-y-2">
            <div className="h-3 bg-zinc-200 dark:bg-zinc-805 rounded w-24" />
            <div className="flex gap-1.5">
              <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
              <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasPhotos && !hasBreaks) return null;

  const calculateDuration = (start: any, end: any) => {
    if (!start) return 0;
    const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
    const e = end ? (end.toDate ? end.toDate().getTime() : new Date(end).getTime()) : now;
    return Math.max(0, e - s);
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatTimeLocal = (ts: any) => {
    if (!ts) return '--';
    const dVal = ts.toDate ? ts.toDate() : new Date(ts);
    return dVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 w-full text-left space-y-3">
      <span className="block text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
        Session Activity & Breakdown
      </span>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Shifts Column */}
        {hasPhotos && (
          <div className="space-y-2">
            <span className="block text-[10px] font-extrabold text-zinc-500 dark:text-zinc-450 uppercase tracking-wider">
              Shift Photos
            </span>
            <div className="space-y-1.5">
              {jobPhotos.map((jp, idx) => (
                <div key={idx} className="text-xs bg-zinc-50/50 dark:bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-150/40 dark:border-zinc-850/50 space-y-1.5">
                  <div className="font-bold text-zinc-850 dark:text-zinc-250 truncate">
                    {jp.jobName}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {jp.images.map((url, imgIdx) => (
                      <a 
                        key={imgIdx} 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        onClick={e => e.stopPropagation()}
                        className="relative w-12 h-12 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100 dark:bg-zinc-950 hover:scale-[1.05] transition-all shadow-sm flex-shrink-0"
                      >
                        <img src={url} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Breaks Column */}
        {hasBreaks && (
          <div className="space-y-2">
            <span className="block text-[10px] font-extrabold text-zinc-500 dark:text-zinc-450 uppercase tracking-wider">
              Breaks & Lunches Taken
            </span>
            <div className="space-y-1.5">
              {session.breaks.map((breakSeg, breakIdx) => {
                const breakDurationMs = calculateDuration(breakSeg.start, breakSeg.end);
                const durationStr = formatDuration(breakDurationMs);

                return (
                  <div key={breakIdx} className="text-xs bg-amber-500/[0.02] dark:bg-amber-500/[0.01] p-2.5 rounded-xl border border-amber-500/10">
                    <div className="font-bold text-amber-655 dark:text-amber-400 capitalize">
                      {breakSeg.type} Break
                    </div>
                    <div className="text-[10px] font-mono font-bold text-amber-655 dark:text-amber-400 mt-1.5 flex justify-between items-center">
                      <span>{formatTimeLocal(breakSeg.start)} - {breakSeg.end ? formatTimeLocal(breakSeg.end) : 'Active Now'}</span>
                      <span className="bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">{durationStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TimeClockHistory({ tenantId }: { tenantId: string }) {
  const { user, impersonatedStaff } = useAuthStore();
  const effectiveUserId = impersonatedStaff?.id || user?.uid;

  const [requestingEdit, setRequestingEdit] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [editingSession, setEditingSession] = useState<TimeSession | null>(null);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'sessions' | 'corrections'>('sessions');

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: staffMember } = useQuery({
    queryKey: ['my-staff-record', tenantId, effectiveUserId],
    queryFn: async () => {
      if (!effectiveUserId) return null;
      if (impersonatedStaff?.id) {
        const docRef = doc(db, `businesses/${tenantId}/staff`, impersonatedStaff.id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            name: `${data.firstName || ''} ${data.lastName || ''}`.trim()
          } as any;
        }
        return null;
      }
      const snap = await getDocs(query(collection(db, `businesses/${tenantId}/staff`), where('userId', '==', user?.uid)));
      if (snap.empty) return null;
      const data = snap.docs[0].data();
      return {
        id: snap.docs[0].id,
        ...data,
        name: `${data.firstName || ''} ${data.lastName || ''}`.trim()
      } as any;
    },
    enabled: !!effectiveUserId && !!tenantId
  });

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['time-sessions', tenantId, effectiveUserId, staffMember?.id, staffMember?.userId],
    queryFn: async () => {
      if (!effectiveUserId) return [];
      const searchIds = [effectiveUserId];
      if (staffMember?.id && !searchIds.includes(staffMember.id)) {
        searchIds.push(staffMember.id);
      }
      if (staffMember?.userId && !searchIds.includes(staffMember.userId)) {
        searchIds.push(staffMember.userId);
      }

      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('userId', 'in', searchIds),
        orderBy('clockIn.timestamp', 'desc'),
        limit(50)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeSession));
    },
    enabled: !!effectiveUserId && !!tenantId
  });

  const { data: requests } = useQuery({
    queryKey: ['time-edit-requests', tenantId, effectiveUserId, staffMember?.id, staffMember?.userId],
    queryFn: async () => {
      if (!effectiveUserId) return [];
      const searchIds = [effectiveUserId];
      if (staffMember?.id && !searchIds.includes(staffMember.id)) {
        searchIds.push(staffMember.id);
      }
      if (staffMember?.userId && !searchIds.includes(staffMember.userId)) {
        searchIds.push(staffMember.userId);
      }

      const q = query(
        collection(db, `businesses/${tenantId}/time_edit_requests`),
        where('userId', 'in', searchIds)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: !!effectiveUserId && !!tenantId
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(todayStart);
  const day = weekStart.getDay(); // 0 is Sunday, 1 is Monday, etc.
  const daysToSubtract = day === 0 ? 6 : day - 1;
  weekStart.setDate(weekStart.getDate() - daysToSubtract);

  const { data: tasksList } = useQuery({
    queryKey: ['my-completed-tasks', tenantId, effectiveUserId, staffMember?.id, staffMember?.userId],
    queryFn: async () => {
      if (!effectiveUserId || !staffMember) return [];
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

      // Filter tasks assigned to this user and completed this week
      const userTasks = tasks.filter((task: any) => {
        const assignments = task.assignedStaff || [];
        const isAssigned = assignments.some((assign: any) => 
          assign.id === effectiveUserId || 
          assign.id === staffMember?.id || 
          assign.id === staffMember?.userId
        );
        if (!isAssigned) return false;

        const compTimeStr = task.completedAt || task.qcCompletedAt;
        if (!compTimeStr) return false;
        const compTime = new Date(compTimeStr).getTime();

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const inThisWeek = compTime >= weekStart.getTime() && compTime < weekEnd.getTime();
        const status = (task.status || '').toLowerCase();
        const isCompleted = ['completed', 'qc', 'qc complete'].includes(status);

        return inThisWeek && isCompleted;
      });

      // Fetch job titles for these tasks
      const uniqueJobIds = Array.from(new Set(userTasks.map(t => t.jobId).filter(Boolean)));
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

      return userTasks.map(t => {
        const assignments = t.assignedStaff || [];
        const assign = assignments.find((a: any) => 
          a.id === effectiveUserId || 
          a.id === staffMember?.id || 
          a.id === staffMember?.userId
        );
        const share = (parseFloat(assign?.percentage) || 100) / 100;
        const bookHours = parseFloat(t.bookTime) || 0;
        const earnedHours = t.isRework ? 0 : bookHours * share;

        return {
          ...t,
          jobName: jobMap[t.jobId]
            ? (jobMap[t.jobId].jobNumber ? `#${jobMap[t.jobId].jobNumber} - ${jobMap[t.jobId].title}` : jobMap[t.jobId].title)
            : 'Job',
          share,
          earnedBookMs: earnedHours * 3600000,
          earnedBookHours: earnedHours
        };
      });
    },
    enabled: !!effectiveUserId && !!tenantId && !!staffMember
  });

  const { data: myDepartment } = useQuery({
    queryKey: ['my-department', tenantId, staffMember?.departmentId],
    queryFn: async () => {
      if (!staffMember?.departmentId) return null;
      const snap = await getDocs(query(collection(db, `businesses/${tenantId}/departments`)));
      const deptDoc = snap.docs.find(d => d.id === staffMember.departmentId);
      return deptDoc ? { id: deptDoc.id, ...deptDoc.data() } as any : null;
    },
    enabled: !!staffMember?.departmentId
  });

  const getRequestForSession = (sessionId: string) => {
    return requests?.find((r: any) => r.sessionId === sessionId);
  };

  const formatDate = (ts: any) => {
    if (!ts) return '--';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const calculateDuration = (start: any, end: any) => {
    if (!start) return 0;
    const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
    const e = end ? (end.toDate ? end.toDate().getTime() : new Date(end).getTime()) : now;
    return Math.max(0, e - s);
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const calculateSessionPayMs = (session: TimeSession, payType?: string) => {
    const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
    const breakMs = (session.breaks || []).reduce((acc, b) => acc + calculateDuration(b.start, b.end), 0);
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
      : now;

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

  if (isLoading) return (
    <div className="flex items-center justify-center p-12">
      <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  const resolvedPayType = staffMember?.payType && staffMember.payType !== 'inherit'
    ? staffMember.payType
    : (myDepartment?.defaultPayType || 'hourly');

  const isFlatRate = resolvedPayType === 'flat_rate';

  let activeCreditMs = 0;
  if (staffMember?.payPeriodBookTimeCredit && staffMember.payPeriodBookTimeCredit > 0) {
    activeCreditMs = staffMember.payPeriodBookTimeCredit * 3600000;
  } else if (myDepartment?.weeklyBookTimeCredit && myDepartment.weeklyBookTimeCredit > 0) {
    activeCreditMs = myDepartment.weeklyBookTimeCredit * 3600000;
  }

  let todayMs = 0;
  let weekMs = 0;
  let todayPayMs = 0;

  sessions?.forEach(session => {
    const sessionDate = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
    if (!sessionDate) return;

    const isManual = session.clockIn?.location === 'Manual Entry' || session.clockOut?.location === 'Manual Entry';
    if (isManual) return;

    const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
    const breakMs = (session.breaks || []).reduce((acc, b) => acc + calculateDuration(b.start, b.end), 0);
    const workMs = totalMs - breakMs;

    if (sessionDate.getTime() >= weekStart.getTime()) {
      weekMs += workMs;
    }
    if (sessionDate.getTime() >= todayStart.getTime()) {
      todayMs += workMs;
      const payMs = calculateSessionPayMs(session, session.payType || resolvedPayType);
      todayPayMs += payMs;
    }
  });

  const sessionHourlyPayMs = sessions?.reduce((acc, session) => {
    const sessionDate = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
    if (!sessionDate || sessionDate.getTime() < weekStart.getTime()) return acc;
    const isManual = session.clockIn?.location === 'Manual Entry' || session.clockOut?.location === 'Manual Entry';
    if (isManual) return acc;
    const sPayType = session.payType || resolvedPayType;
    return acc + calculateSessionPayMs(session, sPayType);
  }, 0) || 0;

  const completedBookMs = (tasksList || []).reduce((acc, t) => acc + (t.earnedBookMs || 0), 0);

  let totalCreditMs = 0;
  if (weekMs > 0 && activeCreditMs > 0 && isFlatRate) {
    totalCreditMs = activeCreditMs;
  }

  const weekPayMs = isFlatRate
    ? sessionHourlyPayMs + completedBookMs + totalCreditMs
    : sessionHourlyPayMs;

  const correctionsSessions = sessions?.filter(session => {
    const request = getRequestForSession(session.id);
    return session.verificationStatus === 'pending' || (request && (request as any).status === 'pending');
  }) || [];

  const correctionsCount = correctionsSessions.length;

  const filteredSessions = sessions?.filter(session => {
    // 1. Filter out manual entry sessions from the main history feed to avoid duplicates/clutter
    const isManual = session.clockIn?.location === 'Manual Entry' || session.clockOut?.location === 'Manual Entry';
    if (isManual) return false;

    // 2. If this session is completed, and there is an active session for the same day, filter it out
    const sessionDate = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
    if (sessionDate && session.status === 'completed') {
      const hasActive = sessions?.some(s => {
        if (s.status !== 'active' && s.status !== 'on_break') return false;
        const sDate = s.clockIn.timestamp?.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
        return sDate && sDate.toDateString() === sessionDate.toDateString();
      });
      if (hasActive) return false;
    }

    return true;
  }) || [];

  const displayedSessions = activeTab === 'corrections' ? correctionsSessions : filteredSessions;

  return (
    <div className="space-y-6">
      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Today's Pay Hours */}
        <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center">
          <p className="text-xs font-bold text-zinc-405 dark:text-zinc-500 uppercase tracking-widest mb-1">Today's Pay Hours</p>
          <p className="text-2xl font-black text-zinc-850 dark:text-white font-mono flex items-center gap-2">
            <Timer className="w-5 h-5 text-indigo-500" />
            {(todayPayMs / 3600000).toFixed(2)}h
          </p>
        </div>

        {/* Card 2: Week Pay Hours */}
        <div className="bg-indigo-50/50 dark:bg-indigo-950/10 p-4 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/30 flex flex-col justify-center relative group">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-indigo-505 uppercase tracking-widest mb-1">Week Pay Hours</p>
            <button
              onClick={() => setIsBreakdownOpen(!isBreakdownOpen)}
              className="p-1 text-zinc-400 hover:text-indigo-650 dark:hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all cursor-pointer"
              title="Show Calculation Details"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {(weekPayMs / 3600000).toFixed(2)}h
          </p>
        </div>
      </div>

      {/* Collapsible Breakdown Section */}
      {isBreakdownOpen && (
        <div className="bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 text-xs text-zinc-650 dark:text-zinc-350 space-y-4 shadow-inner animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
            <h5 className="font-bold text-zinc-855 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-505" /> Pay Formula & Calculations: {staffMember?.name || 'Technician'}
            </h5>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded">
              Pay Type: {isFlatRate ? 'Flat-Rate' : resolvedPayType === 'salary' ? 'Salary' : 'Hourly'}
            </span>
          </div>

          {isFlatRate ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-medium">
                <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">Base Hourly (Clocked)</span>
                  <p className="text-sm font-black text-zinc-850 dark:text-white font-mono">{(sessionHourlyPayMs / 3600000).toFixed(2)}h</p>
                  <p className="text-[10px] text-zinc-450 leading-relaxed mt-1">Clocked time spent on general/hourly tasks inside sessions, capped at total session work hours.</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1">
                  <span className="text-[9px] font-black text-indigo-550 uppercase tracking-widest block">Completed Book Time</span>
                  <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono">{(completedBookMs / 3600000).toFixed(2)}h</p>
                  <p className="text-[10px] text-zinc-450 leading-relaxed mt-1">Book hours earned from flat-rate tasks completed in this pay period.</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1">
                  <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block">Credit Allowance</span>
                  <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">{(totalCreditMs / 3600000).toFixed(2)}h</p>
                  <p className="text-[10px] text-zinc-450 leading-relaxed mt-1">Weekly credit allowance applied when active clocked hours are recorded.</p>
                </div>
              </div>

              <div className="bg-indigo-50/30 dark:bg-indigo-950/5 p-3.5 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-[13px] font-bold">
                <span className="text-zinc-550 dark:text-zinc-450">Calculation Formula:</span>
                <span className="font-mono text-indigo-650 dark:text-indigo-400 text-right">
                  {(sessionHourlyPayMs / 3600000).toFixed(2)}h (Hourly) + {(completedBookMs / 3600000).toFixed(2)}h (Book) {totalCreditMs > 0 ? `+ ${(totalCreditMs / 3600000).toFixed(2)}h (Credit) ` : ''}= {(weekPayMs / 3600000).toFixed(2)}h Total
                </span>
              </div>
            </div>
          ) : resolvedPayType === 'hourly' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-medium">
                <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">Base Clocked Shift Time</span>
                  <p className="text-sm font-black text-zinc-850 dark:text-white font-mono">{(weekMs / 3600000).toFixed(2)}h</p>
                  <p className="text-[10px] text-zinc-450 leading-relaxed mt-1">Actual work time recorded on timecard (clocked hours minus unpaid breaks).</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1">
                  <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block">Tracked Book Time</span>
                  <p className="text-sm font-black text-emerald-600 dark:text-emerald-450 font-mono">{(completedBookMs / 3600000).toFixed(2)}h</p>
                  <p className="text-[10px] text-zinc-450 leading-relaxed mt-1">Total book hours completed on assigned tasks (tracked for efficiency, does not affect pay).</p>
                </div>
              </div>

              <div className="bg-indigo-50/30 dark:bg-indigo-950/5 p-3.5 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-[13px] font-bold">
                <span className="text-zinc-555 dark:text-zinc-450">Calculation Formula:</span>
                <span className="font-mono text-indigo-650 dark:text-indigo-400 text-right">
                  {(weekMs / 3600000).toFixed(2)}h (Base Clocked) = {(weekPayMs / 3600000).toFixed(2)}h Total
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-bold text-zinc-850 dark:text-zinc-200">Salary Pay Period: {(weekMs / 3600000).toFixed(2)}h clocked.</p>
              <p className="text-[11px] text-zinc-450">Salary employees receive their regular base pay. Timecard tracking shows clocked actual duration ({(weekMs / 3600000).toFixed(2)}h).</p>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b border-zinc-200 dark:border-zinc-800 gap-6">
        <button
          onClick={() => setActiveTab('sessions')}
          className={cn(
            "pb-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer",
            activeTab === 'sessions'
              ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          )}
        >
          Recent Sessions
        </button>
        <button
          onClick={() => setActiveTab('corrections')}
          className={cn(
            "pb-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2",
            activeTab === 'corrections'
              ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          )}
        >
          <span>Corrections & Needs Review</span>
          {correctionsCount > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
              {correctionsCount}
            </span>
          )}
        </button>
      </div>

      <div className="grid gap-4">
        {displayedSessions?.map((session) => {
          const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
          const breakMs = (session.breaks || []).reduce((acc, b) => acc + calculateDuration(b.start, b.end), 0);
          const workMs = totalMs - breakMs;
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
          const request = getRequestForSession(session.id);

          return (
            <div 
              key={session.id} 
              onClick={() => setEditingSession(session)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm hover:border-indigo-500/30 hover:bg-zinc-50/50 dark:hover:bg-zinc-950/40 transition-all group flex flex-col gap-4 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-4 w-full">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-zinc-400 group-hover:bg-indigo-500/10 group-hover:text-indigo-500 transition-colors">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight">
                      {formatDate(session.clockIn.timestamp)}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight",
                        session.status === 'completed' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600"
                      )}>
                        {session.status}
                      </span>
                      {session.verificationStatus === 'pending' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-amber-500 text-white animate-pulse">
                          Needs Verification
                        </span>
                      )}
                      {session.verificationStatus === 'verified' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                          Verified
                        </span>
                      )}
                      {request && !session.verificationStatus && (
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ring-1 ring-inset",
                          (request as any).status === 'pending' ? "bg-amber-500/10 text-amber-600 ring-amber-500/20" : "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
                        )}>
                          Edit {(request as any).status}
                        </span>
                      )}
                      {session.isRemote && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white uppercase tracking-tight">
                          <MapPin className="w-2.5 h-2.5" /> Remote
                        </span>
                      )}
                      {!session.isRemote && session.clockIn.onSite === false && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-rose-505 uppercase">
                          <MapPin className="w-3 h-3" /> Off-site
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right sm:text-left">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Hourly Time</span>
                    <span className="font-mono font-black text-sm text-zinc-900 dark:text-white">{formatDuration(workMs)}</span>
                  </div>
                  <div className="text-right sm:text-left">
                    <span className="text-[10px] uppercase font-bold text-indigo-500 block tracking-wider">Book Time</span>
                    <span className="font-mono font-black text-sm text-indigo-600 dark:text-indigo-400">{formatDuration(bookMs)}</span>
                  </div>
                  
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingSession(session); }}
                    className="p-2 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all cursor-pointer md:opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit Time Entry"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Session Activity & Breakdown Details */}
              <SessionBreakdownSection 
                tenantId={tenantId}
                session={session}
                now={now}
              />
            </div>
          );
        })}



        {/* Edit Request Modal */}
        {requestingEdit && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Request Correction</h3>
                </div>
                <button onClick={() => setRequestingEdit(null)} className="p-2 text-zinc-400 hover:text-zinc-650"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-zinc-500">Please describe the error in your time record (e.g. forgot to clock out, incorrect break time).</p>
                <textarea 
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Tell us what needs to be changed..."
                  className="w-full h-32 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white text-sm resize-none"
                />
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setRequestingEdit(null)}
                    className="flex-1 px-6 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl font-bold hover:bg-zinc-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={!editNote.trim() || isSubmitting}
                    onClick={async () => {
                      setIsSubmitting(true);
                      try {
                        await addDoc(collection(db, `businesses/${tenantId}/time_edit_requests`), {
                          sessionId: requestingEdit,
                          userId: effectiveUserId || user!.uid,
                          userName: staffMember?.name || user!.displayName || user!.email,
                          note: editNote,
                          status: 'pending',
                          createdAt: serverTimestamp()
                        });

                        // Log activity to the live timeline
                        await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
                          type: 'time_session',
                          title: 'Correction Requested',
                          message: `Requested clock correction: "${editNote.slice(0, 60)}${editNote.length > 60 ? '...' : ''}"`,
                          timestamp: serverTimestamp(),
                          severity: 'warning',
                          author: staffMember?.name || user!.displayName || user!.email || 'Technician',
                          metadata: {
                            sessionId: requestingEdit,
                            note: editNote
                          }
                        });

                        toast.success("Correction request submitted");
                        setRequestingEdit(null);
                        setEditNote('');
                      } catch (e) {
                        toast.error("Failed to submit request");
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'Submitting...' : <><Send className="w-4 h-4" /> Send Request</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {displayedSessions?.length === 0 && (
          <div className="text-center p-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
            <Clock className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-505 font-medium">No time sessions recorded yet.</p>
          </div>
        )}
      </div>

      {/* Inline Session Editor Modal */}
      {editingSession && (
        <TimeSessionEditorModal 
          tenantId={tenantId}
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
