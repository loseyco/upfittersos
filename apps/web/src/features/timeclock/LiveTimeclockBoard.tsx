import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query, orderBy, getDocs, limit, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Search, Activity, Maximize, Minimize, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useWakeLock } from '../../hooks/useWakeLock';
import { toast, Toaster } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';

const getJobColor = (jobId: string) => {
  const colors = [
    { bg: 'bg-teal-500', text: 'text-teal-950 dark:text-teal-900', border: 'border-teal-400/30' },
    { bg: 'bg-emerald-500', text: 'text-emerald-950 dark:text-emerald-900', border: 'border-emerald-400/30' },
    { bg: 'bg-cyan-500', text: 'text-cyan-950 dark:text-cyan-900', border: 'border-cyan-400/30' },
    { bg: 'bg-sky-500', text: 'text-sky-950 dark:text-sky-900', border: 'border-sky-400/30' },
    { bg: 'bg-purple-500', text: 'text-purple-950 dark:text-purple-900', border: 'border-purple-400/30' },
    { bg: 'bg-fuchsia-500', text: 'text-fuchsia-950 dark:text-fuchsia-900', border: 'border-fuchsia-400/30' },
    { bg: 'bg-pink-500', text: 'text-pink-950 dark:text-pink-900', border: 'border-pink-400/30' },
    { bg: 'bg-rose-500', text: 'text-rose-950 dark:text-rose-900', border: 'border-rose-400/30' },
    { bg: 'bg-violet-500', text: 'text-violet-950 dark:text-violet-900', border: 'border-violet-400/30' },
  ];
  let hash = 0;
  const str = jobId || '';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

interface LayoutJob {
  id: string;
  name: string;
  start: any;
  end?: any;
  startTime: number;
  endTime: number;
  trackIndex: number;
}

const layoutSessionJobs = (jobs: Array<{ id: string; name: string; start: any; end?: any; }> | undefined, now: number) => {
  if (!jobs || jobs.length === 0) return { assignedJobs: [] as LayoutJob[], totalTracks: 0 };

  const parsedJobs = jobs.map((j) => {
    const startTime = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
    const endTime = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : now;
    return {
      ...j,
      startTime,
      endTime,
    };
  });

  const sorted = [...parsedJobs].sort((a, b) => a.startTime - b.startTime);
  const tracks: number[] = [];

  const assignedJobs = sorted.map((job) => {
    let trackIndex = -1;
    for (let i = 0; i < tracks.length; i++) {
      if (job.startTime >= tracks[i]) {
        trackIndex = i;
        break;
      }
    }

    if (trackIndex === -1) {
      tracks.push(job.endTime);
      trackIndex = tracks.length - 1;
    } else {
      tracks[trackIndex] = job.endTime;
    }

    return {
      ...job,
      trackIndex,
    } as LayoutJob;
  });

  return { assignedJobs, totalTracks: tracks.length };
};

interface LiveTimeclockBoardProps {
  tenantId: string;
}

interface TimeSession {
  id: string;
  userId: string;
  userName?: string;
  payType?: string;
  clockIn: { timestamp: any; location?: string; onSite?: boolean; };
  clockOut?: { timestamp: any; location?: string; onSite?: boolean; };
  breaks: Array<{ type: 'lunch' | 'normal'; start: any; end?: any; isPaid: boolean; }>;
  jobs?: Array<{ id: string; name: string; start: any; end?: any; }>;
  status: string;
}

interface WorkSchedule {
  days: number[];
  startTime: string;
  endTime: string;
  expectedHoursPerDay: number;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  departmentId?: string;
  userId?: string;
  individualSchedule?: WorkSchedule;
  isArchived?: boolean;
  fireDate?: any;
  payType?: 'hourly' | 'salary' | 'flat_rate' | 'inherit';
}

interface Department {
  id: string;
  name: string;
  defaultSchedule?: WorkSchedule;
  defaultPayType?: 'hourly' | 'salary' | 'flat_rate';
}

export function LiveTimeclockBoard({ tenantId }: LiveTimeclockBoardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, permissions = {}, isSuperAdmin } = useAuthStore();
  const canManage = isSuperAdmin || permissions['timeclock.manage'];
  const [searchTerm, setSearchTerm] = useState('');
  const [now, setNow] = useState(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  useWakeLock(isFullscreen);

  const handleAdminAction = async (session: TimeSession, action: 'clock_out' | 'lunch' | 'break' | 'resume' | 'clock_in') => {
    setIsUpdating(session.id);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, session.id);
      
      if (action === 'clock_out') {
        const sessionSnap = await getDoc(sessionRef);
        const sessionData = sessionSnap.data();
        const breaks = [...(sessionData?.breaks || [])];
        if (session.status === 'on_break') {
          const lastBreak = breaks[breaks.length - 1];
          if (lastBreak && !lastBreak.end) {
            lastBreak.end = new Date();
          }
        }
        const jobs = [...(sessionData?.jobs || [])];
        const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
        if (lastJob && !lastJob.end) {
          lastJob.end = new Date();
        }

        await updateDoc(sessionRef, {
          status: 'completed',
          clockOut: {
            timestamp: serverTimestamp(),
            onSite: true,
            lat: null,
            lng: null
          },
          breaks,
          jobs,
          updatedAt: serverTimestamp(),
          manuallyClockedOut: true,
          clockedOutBy: user?.displayName || user?.email || 'Manager',
          clockedOutById: user?.uid || '',
          lastEditedBy: user?.displayName || user?.email || 'Manager',
          lastEditedById: user?.uid || '',
          manuallyEdited: true
        });

        await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
          type: 'time_session',
          title: 'Force Clock Out',
          message: `Force clocked out ${session.userName || 'Technician'} by ${user?.displayName || user?.email || 'Admin'}`,
          timestamp: serverTimestamp(),
          severity: 'warning',
          author: user?.displayName || user?.email || 'Admin',
          metadata: {
            sessionId: session.id,
            technicianName: session.userName || '',
            action: 'clock_out'
          }
        });

        toast.success(`Clocked out ${session.userName}`);
      } else if (action === 'lunch' || action === 'break') {
        const type = action === 'lunch' ? 'lunch' : 'normal';
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
          isPaid: type === 'normal',
          suspendedJob
        });

        await updateDoc(sessionRef, {
          breaks,
          jobs,
          status: 'on_break',
          updatedAt: serverTimestamp(),
          lastEditedBy: user?.displayName || user?.email || 'Manager',
          lastEditedById: user?.uid || '',
          manuallyEdited: true
        });

        await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
          type: 'time_session',
          title: 'Force Break Start',
          message: `Put ${session.userName || 'Technician'} on ${type} break by ${user?.displayName || user?.email || 'Admin'}`,
          timestamp: serverTimestamp(),
          severity: 'info',
          author: user?.displayName || user?.email || 'Admin',
          metadata: {
            sessionId: session.id,
            technicianName: session.userName || '',
            action: type
          }
        });

        toast.success(`Put ${session.userName} on ${type}`);
      } else if (action === 'resume') {
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
          updatedAt: serverTimestamp(),
          lastEditedBy: user?.displayName || user?.email || 'Manager',
          lastEditedById: user?.uid || '',
          manuallyEdited: true
        });

        await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
          type: 'time_session',
          title: 'Force Resume',
          message: `Resumed active status for ${session.userName || 'Technician'} by ${user?.displayName || user?.email || 'Admin'}`,
          timestamp: serverTimestamp(),
          severity: 'info',
          author: user?.displayName || user?.email || 'Admin',
          metadata: {
            sessionId: session.id,
            technicianName: session.userName || '',
            action: 'resume'
          }
        });

        toast.success(`Resumed session for ${session.userName}`);
      } else if (action === 'clock_in') {
        const staff = scheduleData?.staff?.find((s: any) => s.userId === session.userId || s.id === session.userId);
        const dept = scheduleData?.departments?.find((d: any) => d.id === staff?.departmentId);
        const resolvedPayType = staff?.payType && staff.payType !== 'inherit'
          ? staff.payType
          : (dept?.defaultPayType || 'hourly');

        const docRef = await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
          userId: session.userId,
          userName: session.userName,
          staffName: session.userName,
          payType: resolvedPayType,
          clockIn: {
            timestamp: serverTimestamp(),
            onSite: true,
            lat: null,
            lng: null
          },
          isRemote: false,
          status: 'active',
          breaks: [],
          createdAt: serverTimestamp(),
          manuallyClockedIn: true,
          clockedInBy: user?.displayName || user?.email || 'Manager',
          clockedInById: user?.uid || '',
          lastEditedBy: user?.displayName || user?.email || 'Manager',
          lastEditedById: user?.uid || '',
          manuallyEdited: true
        });

        await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
          type: 'time_session',
          title: 'Force Clock In',
          message: `Force clocked in ${session.userName || 'Technician'} by ${user?.displayName || user?.email || 'Admin'}`,
          timestamp: serverTimestamp(),
          severity: 'info',
          author: user?.displayName || user?.email || 'Admin',
          metadata: {
            sessionId: docRef.id,
            technicianName: session.userName || '',
            action: 'clock_in'
          }
        });

        toast.success(`Clocked in ${session.userName}`);
      }

      queryClient.invalidateQueries({ queryKey: ['live-time-sessions', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['admin-timeclock-activity-logs', tenantId] });
    } catch (err: any) {
      toast.error(`Action failed: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['live-time-sessions', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        orderBy('clockIn.timestamp', 'desc'),
        limit(200)
      );
      const snap = await getDocs(q);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allSessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeSession));
      
      // Filter for sessions that started today OR are still active
      return allSessions.filter(s => {
        if (!s.clockIn?.timestamp) return false;
        const date = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
        return date >= today || s.status !== 'completed';
      });
    },
    refetchInterval: 60000 // Refetch every minute to keep it live
  });

  const { data: scheduleData } = useQuery({
    queryKey: ['staff-roster-data', tenantId],
    queryFn: async () => {
      const staffSnap = await getDocs(query(collection(db, `businesses/${tenantId}/staff`)));
      const deptSnap = await getDocs(query(collection(db, `businesses/${tenantId}/departments`)));
      
      const allStaff = staffSnap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember));
      const activeStaff = allStaff.filter(s => !s.isArchived && !s.fireDate && s.departmentId);
      
      return {
        staff: activeStaff,
        departments: deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department))
      };
    }
  });

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

  const filteredSessions = sessions?.filter(s => {
    const staff = scheduleData?.staff?.find((st: any) => st.userId === s.userId || st.id === s.userId);
    if (!staff) return false;
    const displayName = `${staff.firstName} ${staff.lastName}`.trim();
    return displayName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (isLoading) return <div className="p-12 text-center text-zinc-500">Loading live data...</div>;

  return (
    <div 
      ref={containerRef}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-4 duration-500",
        isFullscreen ? "p-4 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar space-y-3" : "space-y-4"
      )}
    >
      <Toaster position="top-right" richColors theme="system" closeButton />
      <div className={cn(
        "flex flex-col sm:flex-row items-center justify-end gap-3 w-full relative z-10",
        !isFullscreen && "sm:-mt-20"
      )}>
        {isFullscreen && (
          <div className="mr-auto flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Timeclock Dashboard</span>
            <span className="text-[10px] font-bold text-zinc-500">• Updated {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        )}
        <button 
          onClick={toggleFullscreen}
          className="hidden sm:flex w-full sm:w-auto px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-lg transition-all items-center justify-center gap-2"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
        </button>
      </div>

      <div className={cn(
        "flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm",
        isFullscreen ? "p-4" : "p-4 sm:py-5 sm:px-6"
      )}>
        <div>
          <h2 className={cn("font-bold text-zinc-900 dark:text-white flex items-center gap-2", isFullscreen ? "text-lg" : "text-xl")}>
            <Activity className="w-5 h-5 text-indigo-500" />
            Live Timeclock Board
          </h2>
          {!isFullscreen && <p className="text-sm text-zinc-500 mt-1">Real-time overview of staff clocked in today.</p>}
        </div>

        {/* Global Legend in Header */}
        <div className="hidden sm:flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/40 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800/50">
          <span className="text-zinc-400 dark:text-zinc-500">Timeline Legend:</span>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-indigo-500" /> Worked</div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-400" /> Break</div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-gradient-to-r from-teal-400 via-cyan-400 to-purple-400" />
            <span>Job Tasks</span>
          </div>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Search staff..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all dark:text-white"
          />
        </div>
      </div>

      <div className={cn("grid", isFullscreen ? "gap-2" : "gap-3")}>
        {filteredSessions?.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            No staff clocked in today.
          </div>
        ) : (
          filteredSessions?.map((session) => {
            const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
            const breakMs = session.breaks?.reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0) || 0;
            const workMs = totalMs - breakMs;

            // Calculate overlapping tracks for jobs in this session
            const { assignedJobs, totalTracks } = layoutSessionJobs(session.jobs, now);

            // Define scale (e.g., standard 8 hours = 28800000 ms)
            // Let's cap the visual scale at 12 hours (43200000 ms) for the graph
            const maxMs = 43200000;
            
            const isActive = session.status !== 'completed';

            const staff = scheduleData?.staff.find((s: any) => s.userId === session.userId || s.id === session.userId);
            const dept = scheduleData?.departments.find(d => d.id === staff?.departmentId);
            const schedule = staff?.individualSchedule || dept?.defaultSchedule;
            
            // Resolve actual name dynamically from staff roster if available to heal/override fallback names
            const displayName = staff ? `${staff.firstName} ${staff.lastName}`.trim() : (session.userName || 'Technician');
            const avatarChar = displayName[0] || 'T';

            const todayDayId = new Date().getDay() || 7; // 1 = Monday, 7 = Sunday
            const isScheduledToday = schedule?.days?.includes(todayDayId);
            
            let scheduledLeftPercent = -1;
            let scheduledWidthPercent = 0;
            let scheduledDurationStr = '';
            
            if (isScheduledToday && schedule) {
              const clockInDate = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
              
              // Parse scheduled start time
              const [startH, startM] = schedule.startTime.split(':').map(Number);
              const scheduledStart = new Date(clockInDate);
              scheduledStart.setHours(startH, startM, 0, 0);
              
              // Parse scheduled end time
              const [endH, endM] = schedule.endTime.split(':').map(Number);
              const scheduledEnd = new Date(clockInDate);
              scheduledEnd.setHours(endH, endM, 0, 0);
              
              const startOffsetMs = scheduledStart.getTime() - clockInDate.getTime();
              scheduledLeftPercent = (startOffsetMs / maxMs) * 100;
              
              const durationMs = scheduledEnd.getTime() - scheduledStart.getTime();
              scheduledWidthPercent = (durationMs / maxMs) * 100;
              
              const formatTime = (timeStr: string) => {
                const [h, m] = timeStr.split(':').map(Number);
                const ampm = h >= 12 ? 'PM' : 'AM';
                return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
              };
              scheduledDurationStr = `Scheduled: ${formatTime(schedule.startTime)} - ${formatTime(schedule.endTime)} (${schedule.expectedHoursPerDay}h)`;
            }

            return (
              <div 
                key={session.id} 
                className={cn(
                  "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl transition-all shadow-sm hover:shadow-md",
                  isFullscreen ? "p-3" : "p-3.5"
                )}
              >
                <div className={cn(
                  "flex flex-col md:flex-row md:items-center justify-between gap-4",
                  isFullscreen ? "mb-2" : "mb-3"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-600 font-bold shrink-0",
                      isFullscreen ? "w-8 h-8 text-sm" : "w-9 h-9 text-base"
                    )}>
                      {avatarChar}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className={cn("font-bold text-zinc-900 dark:text-white", isFullscreen ? "text-base" : "text-[17px]")}>
                          {displayName}
                        </h3>
                        {isActive ? (
                           <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                             <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                             Clocked In
                           </span>
                        ) : (
                           <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                             Clocked Out
                           </span>
                        )}
                      </div>
                      <p className={cn("text-zinc-500 font-mono", isFullscreen ? "text-[10px]" : "text-[11px]")}>
                        Started at {session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(session.clockIn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  
                  <div className={cn(
                    "flex items-center border-l border-zinc-100 dark:border-zinc-800",
                    isFullscreen ? "gap-4 pl-4" : "gap-5 pl-5"
                  )}>
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-0.5">Total Time</p>
                      <p className={cn("font-mono font-black text-indigo-600 dark:text-indigo-400", isFullscreen ? "text-sm" : "text-[15px]")}>{formatDuration(workMs)}</p>
                    </div>
                    <div className="text-center mr-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-0.5">Break Time</p>
                      <p className={cn("font-mono font-black text-amber-600 dark:text-amber-400", isFullscreen ? "text-sm" : "text-[15px]")}>{formatDuration(breakMs)}</p>
                    </div>

                    {/* Quick Timeclock Operations for Authorized Administrators */}
                    {canManage && (
                      <div className="flex items-center gap-1.5 border-l border-zinc-100 dark:border-zinc-800 pl-4 shrink-0">
                        {isUpdating === session.id ? (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Updating...</span>
                          </div>
                        ) : (
                          <>
                            {isActive ? (
                              <>
                                {session.status === 'on_break' ? (
                                  <button
                                    onClick={() => handleAdminAction(session, 'resume')}
                                    className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded-lg transition-all active:scale-95"
                                    title="Resume Work"
                                  >
                                    Resume
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => handleAdminAction(session, 'lunch')}
                                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold rounded-lg transition-all active:scale-95"
                                      title="Start Lunch Break"
                                    >
                                      Lunch
                                    </button>
                                    <button
                                      onClick={() => handleAdminAction(session, 'break')}
                                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold rounded-lg transition-all active:scale-95"
                                      title="Start Short Break"
                                    >
                                      Break
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => handleAdminAction(session, 'clock_out')}
                                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg transition-all active:scale-95"
                                  title="Force Clock Out"
                                >
                                  Clock Out
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleAdminAction(session, 'clock_in')}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-all active:scale-95"
                                title="Clock In Staff"
                              >
                                Clock In
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Chronological Timeline */}
                <div className={isFullscreen ? "mt-2" : "mt-2.5"}>
                  <div className={cn(
                    "bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-hidden w-full relative group border border-zinc-200 dark:border-zinc-800/50",
                    isFullscreen ? "h-6" : "h-7"
                  )}>
                    
                    {/* Scheduled Shift Background */}
                    {isScheduledToday && (
                      <div 
                        className="absolute top-0 bottom-0 border-2 border-dashed border-zinc-300 dark:border-zinc-700/50 bg-zinc-200/30 dark:bg-zinc-700/10 z-0 rounded-xl hover:bg-zinc-300/30 dark:hover:bg-zinc-700/20 transition-all cursor-help"
                        style={{ left: `${scheduledLeftPercent}%`, width: `${scheduledWidthPercent}%` }}
                        title={scheduledDurationStr}
                      />
                    )}

                    {/* Full Elapsed Time (Worked background) */}
                    <div 
                      className="absolute top-0 left-0 h-full bg-indigo-500/90 transition-all duration-1000 z-0 flex items-center px-2 overflow-hidden"
                      style={{ width: `${Math.min((totalMs / maxMs) * 100, 100)}%` }}
                      title={`Clocked In: ${formatDuration(totalMs)}`}
                    >
                    </div>
                    
                    {/* Chronological Break Overlay */}
                    {session.breaks?.map((b, i) => {
                      const breakStartOffset = calculateDuration(session.clockIn.timestamp, b.start);
                      const bDuration = calculateDuration(b.start, b.end);
                      const leftPercent = Math.min((breakStartOffset / maxMs) * 100, 100);
                      const widthPercent = Math.min((bDuration / maxMs) * 100, 100 - leftPercent);
                      
                      return (
                        <div 
                          key={`break-${i}`}
                          className="absolute top-0 h-full bg-amber-400 transition-all duration-1000 z-10 hover:brightness-110 flex items-center justify-center overflow-hidden"
                          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                          title={`${b.type === 'lunch' ? 'Lunch' : 'Normal'} Break\n${formatDuration(bDuration)}`}
                        >
                          <span className="text-[8px] font-black uppercase text-amber-900/50 tracking-widest whitespace-nowrap px-1 truncate">
                            {b.type === 'lunch' ? 'Lunch' : 'Break'}
                          </span>
                        </div>
                      );
                    })}

                    {/* Chronological Job Overlay */}
                    {assignedJobs.map((j, i) => {
                      const jobStartOffset = calculateDuration(session.clockIn.timestamp, j.start);
                      const jDuration = calculateDuration(j.start, j.end);
                      const leftPercent = Math.min((jobStartOffset / maxMs) * 100, 100);
                      const widthPercent = Math.min((jDuration / maxMs) * 100, 100 - leftPercent);
                      
                      const colorInfo = getJobColor(j.id);
                      
                      // Calculate height and top dynamically based on total overlapping tracks
                      let heightPx = isFullscreen ? 16 : 18;
                      let topPx = isFullscreen ? 4 : 5;
                      if (totalTracks > 1) {
                        const usableHeight = isFullscreen ? 20 : 24;
                        const trackHeight = Math.floor(usableHeight / totalTracks);
                        heightPx = Math.max(4, trackHeight - 1);
                        topPx = 2 + (j.trackIndex * trackHeight);
                      }

                      return (
                        <div 
                          key={`job-${i}`}
                          onClick={() => navigate(`/business/${tenantId}/jobs/${j.id}`)}
                          className={`absolute ${colorInfo.bg} ${colorInfo.text} rounded border ${colorInfo.border} shadow-sm cursor-pointer hover:brightness-110 hover:scale-y-105 transition-all duration-300 z-20 flex items-center justify-center overflow-hidden`}
                          style={{ 
                            left: `${leftPercent}%`, 
                            width: `${widthPercent}%`,
                            top: `${topPx}px`,
                            height: `${heightPx}px`
                          }}
                          title={`Job: ${j.name}\n${formatDuration(jDuration)}\nClick to view job details`}
                        >
                          <span 
                            className="font-black uppercase tracking-widest whitespace-nowrap px-1 truncate"
                            style={{ 
                              fontSize: totalTracks > 2 ? '6px' : '8px',
                              opacity: heightPx < 10 ? 0.8 : 0.9 
                            }}
                          >
                            {j.name}
                          </span>
                        </div>
                      );
                    })}

                    {/* Hour Markers (Always visible on top) */}
                    {Array.from({ length: 12 }).map((_, i) => {
                      const startTime = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
                      const tickTime = new Date(startTime);
                      tickTime.setHours(startTime.getHours() + i + 1, 0, 0, 0); // Next hour boundary
                      const offsetMs = calculateDuration(startTime, tickTime);
                      if (offsetMs > maxMs) return null;
                      const leftPercent = (offsetMs / maxMs) * 100;
                      return (
                        <div key={`tick-${i}`} className="absolute top-0 bottom-0 border-l border-zinc-900/20 dark:border-white/20 z-30 pointer-events-none" style={{ left: `${leftPercent}%` }}>
                          <span className="absolute top-0.5 left-1 text-[8px] font-black text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] whitespace-nowrap">
                            {tickTime.toLocaleTimeString([], { hour: 'numeric' })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
