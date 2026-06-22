import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Play, Clock, Users, ClipboardList, RefreshCw, Wrench,
  MapPin, ListChecks, ChevronRight, AlertCircle, AlertTriangle,
  Maximize, Minimize, Search, Sparkles, HelpCircle, X, History,
  ChevronUp, ChevronDown, Award, Printer
} from 'lucide-react';
import { 
  collection, query, where, onSnapshot, collectionGroup, orderBy, doc, updateDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { cn } from '../../lib/utils';
import { useWakeLock } from '../../hooks/useWakeLock';
import { StaffLink } from './StaffPerformance';
import { toast } from 'sonner';

// Helper to determine if a task is a general non-production task
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

// Helper for stopwatch elapsed time formatting
const getElapsedMs = (start: any) => {
  if (!start) return 0;
  const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
  return Math.max(0, Date.now() - s);
};

const formatStopwatch = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const getJobColor = (jobId: string) => {
  const colors = [
    { bg: 'bg-teal-500', text: 'text-teal-955 dark:text-teal-900', border: 'border-teal-400/30' },
    { bg: 'bg-emerald-500', text: 'text-emerald-955 dark:text-emerald-900', border: 'border-emerald-400/30' },
    { bg: 'bg-cyan-500', text: 'text-cyan-955 dark:text-cyan-900', border: 'border-cyan-400/30' },
    { bg: 'bg-sky-500', text: 'text-sky-955 dark:text-sky-900', border: 'border-sky-400/30' },
    { bg: 'bg-purple-500', text: 'text-purple-955 dark:text-purple-900', border: 'border-purple-400/30' },
    { bg: 'bg-fuchsia-500', text: 'text-fuchsia-955 dark:text-fuchsia-900', border: 'border-fuchsia-400/30' },
    { bg: 'bg-pink-500', text: 'text-pink-955 dark:text-pink-900', border: 'border-pink-400/30' },
    { bg: 'bg-rose-500', text: 'text-rose-955 dark:text-rose-900', border: 'border-rose-400/30' },
    { bg: 'bg-violet-500', text: 'text-violet-955 dark:text-violet-900', border: 'border-violet-400/30' },
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

interface UpfittersDashboardProps {
  tenantId: string;
}


type Timeframe = 'today' | 'week' | 'month' | 'custom';

export function UpfittersDashboard({ tenantId }: UpfittersDashboardProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [timeframe, setTimeframe] = useState<Timeframe>('today');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [activeInfo, setActiveInfo] = useState<{ memberId: string; type: 'backlog' | 'task_efficiency' | 'shift_utilization' | 'direct_labor' | 'weekly_performance' | 'timeline' | 'idle_time' } | null>(null);
  const [activeMainInfo, setActiveMainInfo] = useState<'coverage' | 'efficiency' | 'status' | 'blockers' | null>(null);
  
  const [showForemanTracker, setShowForemanTracker] = useState(() => {
    return localStorage.getItem('show_foreman_tracker') === 'true';
  });
  const [monthlyInvoices, setMonthlyInvoices] = useState<any[]>([]);
  const [monthlySessions, setMonthlySessions] = useState<any[]>([]);
  
  const calculateDuration = (start: any, end: any) => {
    if (!start) return 0;
    const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
    const e = end ? (end.toDate ? end.toDate().getTime() : new Date(end).getTime()) : Date.now();
    return Math.max(0, e - s);
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  
  // Data states
  const [dept, setDept] = useState<any>(null);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [weeklySessions, setWeeklySessions] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState<any>(null);

  // Wake lock
  useWakeLock(isFullscreen);

  // Tick clock to update live stopwatches every second
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Full Screen toggle helper
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 1. Fetch Department Document (Find Upfitting)
  useEffect(() => {
    if (!tenantId) return;

    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      const depts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const found = depts.find((d: any) => 
        d.name?.toLowerCase().includes('upfitting')
      );
      if (found) {
        setDept(found);
      }
    });

    return () => unsub();
  }, [tenantId]);

  // 1b. Fetch Business Settings Document
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(doc(db, 'businesses', tenantId), (snap) => {
      if (snap.exists()) {
        setBusiness(snap.data());
      }
    });
    return () => unsub();
  }, [tenantId]);

  // 2. Fetch Jobs
  useEffect(() => {
    if (!tenantId) return;

    const q = query(collection(db, `businesses/${tenantId}/jobs`));
    const unsub = onSnapshot(q, (snap) => {
      setAllJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Jobs listener error:", err));

    return () => unsub();
  }, [tenantId]);

  // 3. Fetch Zones
  useEffect(() => {
    if (!tenantId) return;

    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/zones`), snap => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Zones listener error:", err));

    return () => unsub();
  }, [tenantId]);

  // 4. Fetch Parts Requests
  useEffect(() => {
    if (!tenantId) return;

    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/parts_requests`), snap => {
      setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Parts requests listener error:", err));

    return () => unsub();
  }, [tenantId]);

  // 5. Fetch Staff Members
  useEffect(() => {
    if (!tenantId) return;

    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/staff`), snap => {
      setStaff(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Staff listener error:", err));

    return () => unsub();
  }, [tenantId]);

  // 6. Fetch Time Sessions based on timeframe and selectedDate
  useEffect(() => {
    if (!tenantId) return;

    // Calculate start and end date boundaries for query
    let startDate = new Date();
    let endDate: Date | null = null;

    if (timeframe === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'week') {
      const weekEndDay = business?.payrollWeekEndDay !== undefined ? Number(business.payrollWeekEndDay) : 0;
      startDate = getPayrollWeekStart(startDate, weekEndDay);
    } else if (timeframe === 'month') {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'custom') {
      const [year, month, day] = selectedDate.split('-').map(Number);
      startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
      endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
    }

    let q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('clockIn.timestamp', '>=', startDate),
      orderBy('clockIn.timestamp', 'desc')
    );

    if (endDate) {
      q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('clockIn.timestamp', '>=', startDate),
        where('clockIn.timestamp', '<=', endDate),
        orderBy('clockIn.timestamp', 'desc')
      );
    }

    const handleSnapshot = (snap: any) => {
      setSessions(snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    };

    const unsub = onSnapshot(q, handleSnapshot, (err) => {
      console.warn("Time session query ordered scan fallback...", err);
      // Fallback query without ordering if index is missing
      let fallbackQ = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('clockIn.timestamp', '>=', startDate)
      );
      if (endDate) {
        fallbackQ = query(
          collection(db, `businesses/${tenantId}/time_sessions`),
          where('clockIn.timestamp', '>=', startDate),
          where('clockIn.timestamp', '<=', endDate)
        );
      }
      onSnapshot(fallbackQ, handleSnapshot);
    });

    return () => unsub();
  }, [tenantId, timeframe, selectedDate, business]);

  // 6b. Fetch Time Sessions for the current payroll week to calculate stable weekly totals
  useEffect(() => {
    if (!tenantId) return;

    const weekEndDay = business?.payrollWeekEndDay !== undefined ? Number(business.payrollWeekEndDay) : 0;
    const weekStart = getPayrollWeekStart(new Date(), weekEndDay);

    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('clockIn.timestamp', '>=', weekStart),
      orderBy('clockIn.timestamp', 'desc')
    );

    const handleSnapshot = (snap: any) => {
      setWeeklySessions(snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })));
    };

    const unsub = onSnapshot(q, handleSnapshot, (err) => {
      console.warn("Weekly sessions ordered scan fallback...", err);
      const fallbackQ = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('clockIn.timestamp', '>=', weekStart)
      );
      onSnapshot(fallbackQ, handleSnapshot);
    });

    return () => unsub();
  }, [tenantId, business]);

  // 7. Fetch Tasks (CollectionGroup)
  useEffect(() => {
    if (!tenantId || !dept?.id) {
      if (!dept) setLoading(false);
      return;
    }

    const q = query(
      collectionGroup(db, 'tasks'),
      where('tenantId', '==', tenantId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const filteredDocs = snap.docs.filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`));
      const parsedTasks = filteredDocs.map(doc => {
        const pathParts = doc.ref.path.split('/');
        const jobId = pathParts[3];
        return {
          id: doc.id,
          jobId,
          refPath: doc.ref.path,
          ...doc.data()
        };
      });

      // Filter tasks assigned to Upfitting department
      const deptTasks = parsedTasks.filter((t: any) => t.departmentId === dept.id);
      setAllTasks(deptTasks);
      setLoading(false);
    }, (err) => {
      console.error("Tasks collectionGroup listener error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [tenantId, dept?.id]);

  const toggleForemanTracker = () => {
    setShowForemanTracker(prev => {
      const next = !prev;
      localStorage.setItem('show_foreman_tracker', String(next));
      return next;
    });
  };

  // Fetch qb_invoices MTD
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/qb_invoices`));
    const unsub = onSnapshot(q, (snap) => {
      setMonthlyInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Error listening MTD invoices:", err));
    return () => unsub();
  }, [tenantId]);

  // Fetch time sessions MTD
  useEffect(() => {
    if (!tenantId) return;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const startMs = startOfMonth.getTime();

    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('clockIn.timestamp', '>=', startOfMonth)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMonthlySessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.warn("MTD sessions query fallback...", err);
      const fallbackQ = query(collection(db, `businesses/${tenantId}/time_sessions`));
      onSnapshot(fallbackQ, (snap) => {
        const filtered = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((s: any) => {
          const ts = s.clockIn?.timestamp?.toDate ? s.clockIn.timestamp.toDate().getTime() : new Date(s.clockIn?.timestamp).getTime();
          return ts >= startMs;
        });
        setMonthlySessions(filtered);
      });
    });
    return () => unsub();
  }, [tenantId]);

  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const startMs = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();

    const parseDate = (val: any) => {
      if (!val) return 0;
      if (val.seconds) return val.seconds * 1000;
      return new Date(val).getTime();
    };

    return monthlyInvoices.reduce((sum, inv) => {
      const ts = parseDate(inv.txnDate || inv.createdAt);
      if (ts >= startMs) {
        return sum + (Number(inv.totalAmount) || 0);
      }
      return sum;
    }, 0);
  }, [monthlyInvoices]);

  const monthlyEff = useMemo(() => {
    const now = new Date();
    const startMs = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();

    const monthCompletedTasks = allTasks.filter(t => {
      const isCompleted = ['completed', 'qc', 'qc complete'].includes((t.status || '').toLowerCase());
      if (!isCompleted) return false;

      const compDate = t.qcCompletedAt || t.completedAt || t.updatedAt;
      if (!compDate) return false;

      const compMs = compDate.toDate ? compDate.toDate().getTime() : new Date(compDate).getTime();
      return compMs >= startMs;
    });

    let totalBook = 0;
    let totalActual = 0;

    monthCompletedTasks.forEach(task => {
      const tTitle = task.title || '';
      const isGen = tTitle.toLowerCase().includes('clock in') || tTitle.toLowerCase().includes('clockout') || tTitle.toLowerCase().includes('break') || tTitle.toLowerCase().includes('lunch') || tTitle.toLowerCase().includes('meeting');
      if (!isGen) {
        const bTime = parseFloat(task.bookTime) || 0;

        const taskActualMs = monthlySessions.reduce((acc: number, session: any) => {
          const segments = (session.jobs || []).filter((j: any) => j.taskId === task.id);
          const segMs = segments.reduce((segAcc: number, seg: any) => {
            const start = seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime();
            let endMs = Date.now();
            if (seg.end) {
              endMs = seg.end.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime();
            } else if (session.status === 'completed' || session.clockOut?.timestamp) {
              const clockOutVal = session.clockOut?.timestamp;
              if (clockOutVal) {
                endMs = clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime();
              } else {
                const updatedVal = session.updatedAt || session.createdAt;
                endMs = updatedVal?.toDate ? updatedVal.toDate().getTime() : new Date(updatedVal || start).getTime();
              }
            }
            return segAcc + Math.max(0, endMs - start);
          }, 0);
          return acc + segMs;
        }, 0);

        const actualHours = taskActualMs / 3600000;
        const isHourly = task.payBasis === 'hourly' || bTime === 0;
        const taskBookTime = isHourly ? actualHours : bTime;

        totalBook += taskBookTime;
        totalActual += actualHours;
      }
    });

    return {
      book: totalBook,
      actual: totalActual,
      pct: totalActual > 0 ? Math.round((totalBook / totalActual) * 100) : 0
    };
  }, [allTasks, monthlySessions]);

  const foremanBonus = useMemo(() => {
    let effBonus = 0;
    let nextEffTier = '';
    let effStatus = 'Under Threshold';

    const effPct = monthlyEff.pct;
    if (effPct >= 110) {
      effBonus = 3000;
      effStatus = 'Tier 3 (110%+)';
    } else if (effPct >= 100) {
      effBonus = 1500;
      effStatus = 'Tier 2 (100% - 109%)';
      nextEffTier = '110%';
    } else if (effPct >= 90) {
      effBonus = 500;
      effStatus = 'Tier 1 (90% - 99%)';
      nextEffTier = '100%';
    } else {
      nextEffTier = '90%';
    }

    let revBonus = 0;
    let nextRevTier = '';
    let revStatus = 'Under Threshold';

    if (monthlyRevenue >= 250000) {
      revBonus = 5000;
      revStatus = 'Tier 3 (250K+)';
    } else if (monthlyRevenue >= 200000) {
      revBonus = 3000;
      revStatus = 'Tier 2 (200K - 249K)';
      nextRevTier = '$250,000';
    } else if (monthlyRevenue >= 150000) {
      revBonus = 1500;
      revStatus = 'Tier 1 (150K - 199K)';
      nextRevTier = '$200,000';
    } else {
      nextRevTier = '$150,000';
    }

    return {
      effBonus,
      effStatus,
      nextEffTier,
      revBonus,
      revStatus,
      nextRevTier,
      totalBonus: effBonus + revBonus
    };
  }, [monthlyEff.pct, monthlyRevenue]);

  // Helpers are now defined globally at the top of the file to prevent Temporal Dead Zone reference errors

  // Filter staff to the Upfitting department
  const upfitterStaff = useMemo(() => {
    if (!dept) return [];
    return staff.filter(s => s.departmentId === dept.id && !s.isArchived && !s.fireDate);
  }, [staff, dept]);

  // Helper to filter sessions for the current timeframe
  const timeframeSessions = useMemo(() => {
    if (timeframe === 'custom') {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      const startTime = startOfDay.getTime();
      const endTime = endOfDay.getTime();

      return sessions.filter((s: any) => {
        if (!s.clockIn?.timestamp) return false;
        const ts = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate().getTime() : new Date(s.clockIn.timestamp).getTime();
        return ts >= startTime && ts <= endTime;
      });
    }

    const now = new Date();
    const start = new Date();
    if (timeframe === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (timeframe === 'week') {
      const weekEndDay = business?.payrollWeekEndDay !== undefined ? Number(business.payrollWeekEndDay) : 0;
      const weekStart = getPayrollWeekStart(now, weekEndDay);
      start.setTime(weekStart.getTime());
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }
    const startTime = start.getTime();

    return sessions.filter((s: any) => {
      if (!s.clockIn?.timestamp) return false;
      const ts = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate().getTime() : new Date(s.clockIn.timestamp).getTime();
      return ts >= startTime;
    });
  }, [sessions, timeframe, selectedDate, business]);

  // Map each completed task to its logged actual hours
  const getTaskLoggedHours = (taskId: string, jobSessions: any[]) => {
    const ms = jobSessions.reduce((acc: number, session: any) => {
      const segments = (session.jobs || []).filter((j: any) => j.taskId === taskId);
      const segMs = segments.reduce((segAcc: number, seg: any) => {
        const start = seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime();
        let endMs = Date.now();
        if (seg.end) {
          endMs = seg.end.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime();
        } else if (session.status === 'completed' || session.clockOut?.timestamp) {
          const clockOutVal = session.clockOut?.timestamp;
          if (clockOutVal) {
            endMs = clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime();
          } else {
            const updatedVal = session.updatedAt || session.createdAt;
            endMs = updatedVal?.toDate ? updatedVal.toDate().getTime() : new Date(updatedVal || start).getTime();
          }
        }

        // Clamp the task segment to the session boundaries for absolute accuracy
        const sessionStart = session.clockIn?.timestamp?.toDate ? session.clockIn.timestamp.toDate().getTime() : new Date(session.clockIn?.timestamp).getTime();
        const sessionEnd = session.clockOut?.timestamp 
          ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate().getTime() : new Date(session.clockOut.timestamp).getTime()) 
          : Date.now();

        const clampStart = Math.max(sessionStart, Math.min(sessionEnd, start));
        const clampEnd = Math.max(sessionStart, Math.min(sessionEnd, endMs));
        
        return segAcc + Math.max(0, clampEnd - clampStart);
      }, 0);
      return acc + segMs;
    }, 0);
    return ms / 3600000;
  };

  // Derive individual statistics for each upfitter staff member
  const staffColumnData = useMemo(() => {
    return upfitterStaff.map(member => {
      const name = `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.displayName || 'Technician';
      
      // 1. Current clock-in status
      const activeSession = sessions.find(s => 
        (s.userId === member.id || (member.userId && s.userId === member.userId)) && 
        (s.status === 'active' || s.status === 'on_break')
      );
      
      let clockStatus: 'active' | 'idle' | 'offline' = 'offline';
      let activeTask: any = null;
      let activeStopwatchMs = 0;
      
      if (activeSession) {
        clockStatus = 'idle';
        const activeSegment = activeSession.jobs?.find((j: any) => !j.end && j.taskId);
        if (activeSegment) {
          clockStatus = 'active';
          const taskObj = allTasks.find(t => t.id === activeSegment.taskId);
          const jobObj = allJobs.find(j => j.id === activeSegment.id);
          activeTask = {
            taskId: activeSegment.taskId,
            jobId: activeSegment.id,
            taskTitle: taskObj?.title || activeSegment.taskName || 'Production Task',
            jobTitle: jobObj ? (jobObj.jobNumber ? `#${jobObj.jobNumber} ${jobObj.title}` : jobObj.title) : 'Active Job',
            start: activeSegment.start
          };
          activeStopwatchMs = getElapsedMs(activeSegment.start);
        }
      }

      // 2. Calculations based on timeframe-filtered sessions
      const memberSessions = timeframeSessions.filter(s => s.userId === member.id || (member.userId && s.userId === member.userId));
      
      let totalShiftHours = 0;
      let totalTaskHours = 0;

      memberSessions.forEach(s => {
        // Shift time
        const start = s.clockIn?.timestamp?.toDate ? s.clockIn.timestamp.toDate().getTime() : new Date(s.clockIn?.timestamp).getTime();
        const end = s.clockOut?.timestamp ? (s.clockOut.timestamp.toDate ? s.clockOut.timestamp.toDate().getTime() : new Date(s.clockOut.timestamp).getTime()) : Date.now();
        
        // Unpaid breaks subtraction (clamped within session bounds for absolute accuracy)
        const breakMins = s.breaks?.reduce((acc: number, b: any) => {
          if (b.isPaid) return acc;
          const bStart = b.start?.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
          const bEnd = b.end ? (b.end.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime()) : end;
          
          const clampBStart = Math.max(start, Math.min(end, bStart));
          const clampBEnd = Math.max(start, Math.min(end, bEnd));
          return acc + (clampBEnd - clampBStart) / 60000;
        }, 0) || 0;
        
        const shiftHrs = Math.max(0, (end - start - breakMins * 60000) / 3600000);
        totalShiftHours += shiftHrs;

        // Task segments time (excluding general tasks, clamped within session bounds for absolute accuracy)
        (s.jobs || []).forEach((j: any) => {
          const jobName = j.name || '';
          const taskName = j.taskName || '';
          let isGen = isGeneralTask(taskName || jobName);
          
          const isCustomerJob = allJobs.some(job => job.id === j.id) || 
                                jobName.startsWith('#') || 
                                (jobName && 
                                 !jobName.toLowerCase().includes('shop') && 
                                 !jobName.toLowerCase().includes('meeting') && 
                                 !jobName.toLowerCase().includes('cleanup') && 
                                 !jobName.toLowerCase().includes('break') && 
                                 !jobName.toLowerCase().includes('lunch') && 
                                 !jobName.toLowerCase().includes('clock'));
          
          if (isCustomerJob) {
            const t = taskName.toLowerCase();
            isGen = t.includes('clock in') || t.includes('clockout') || t.includes('break') || t.includes('lunch') || t.includes('meeting');
          }
          if (isGen) return;
          const jStart = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
          const jEnd = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : end;
          
          const clampJStart = Math.max(start, Math.min(end, jStart));
          const clampJEnd = Math.max(start, Math.min(end, jEnd));
          totalTaskHours += Math.max(0, (clampJEnd - clampJStart) / 3600000);
        });
      });

      // 3. Completed Tasks Book Hours vs Actual Hours (within timeframe)
      // Filter tasks in Upfitting completed by this staff member where the completion date is inside timeframe
      const completedTasks = allTasks.filter(t => {
        const isCompleted = t.status === 'completed' || t.status === 'QC' || t.status === 'QC Complete';
        if (!isCompleted) return false;
        
        const compBySelf = t.completedByStaffId === member.id || 
                           t.assignedStaffIds?.includes(member.id) ||
                           t.assignedStaff?.some((s: any) => s.id === member.id || s.uid === member.id);
        if (!compBySelf) return false;

        const compDate = t.qcCompletedAt || t.completedAt || t.updatedAt;
        if (!compDate) return false;
        
        const compMs = compDate.toDate ? compDate.toDate().getTime() : new Date(compDate).getTime();
        
        // Check timeframe bounds
        if (timeframe === 'custom') {
          const [year, month, day] = selectedDate.split('-').map(Number);
          const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
          const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
          return compMs >= startOfDay.getTime() && compMs <= endOfDay.getTime();
        }

        const now = new Date();
        const start = new Date();
        if (timeframe === 'today') start.setHours(0, 0, 0, 0);
        else if (timeframe === 'week') {
          const weekEndDay = business?.payrollWeekEndDay !== undefined ? Number(business.payrollWeekEndDay) : 0;
          const weekStart = getPayrollWeekStart(now, weekEndDay);
          start.setTime(weekStart.getTime());
        }
        else {
          start.setDate(1);
          start.setHours(0, 0, 0, 0);
        }
        
        return compMs >= start.getTime();
      });

      let completedBookHours = 0;
      let completedActualHours = 0;
      const allMemberSessions = sessions.filter(s => s.userId === member.id || (member.userId && s.userId === member.userId));
      const completedTasksList: Array<{ title: string; bookTime: number; actualTime: number }> = [];

      completedTasks.forEach(task => {
        const tTitle = task.title || '';
        const isGen = tTitle.toLowerCase().includes('clock in') || tTitle.toLowerCase().includes('clockout') || tTitle.toLowerCase().includes('break') || tTitle.toLowerCase().includes('lunch') || tTitle.toLowerCase().includes('meeting');
        if (!isGen) {
          const bTime = parseFloat(task.bookTime) || 0;
          const actualTime = getTaskLoggedHours(task.id, allMemberSessions);
          
          const isHourly = task.payBasis === 'hourly' || bTime === 0;
          const taskBookTime = isHourly ? actualTime : bTime;
          
          completedBookHours += taskBookTime;
          completedActualHours += actualTime;
          completedTasksList.push({
            title: task.title || 'Production Task',
            bookTime: taskBookTime,
            actualTime: actualTime
          });
        }
      });

      // Efficiencies
      // A. Task Efficiency: Book vs Actual on Completed tasks
      const taskEfficiency = completedActualHours > 0 
        ? Math.round((completedBookHours / completedActualHours) * 100)
        : null;

      // B. Shift Utilization: Book completed vs Shift Hours
      const shiftUtilization = totalShiftHours > 0
        ? Math.round((completedBookHours / totalShiftHours) * 100)
        : null;

      // C. Task Coverage: Time on task vs shift hours
      const taskCoverage = totalShiftHours > 0
        ? Math.round((totalTaskHours / totalShiftHours) * 100)
        : null;

      // 4. Queued Jobs
      // Jobs where:
      // - Job is open
      // - Technican is assigned to one or more uncompleted tasks in Upfitting
      // - They are NOT currently clocked into that job
      const priorityMap = member.jobPriorityOrder || [];
      const queuedJobs = allJobs.filter(job => {
        if (['Closed', 'Completed', 'Ready for Customer'].includes(job.status)) return false;
        if (activeTask && activeTask.jobId === job.id) return false;

        const hasAssignedUncompletedTask = allTasks.some(t => 
          t.jobId === job.id &&
          t.status !== 'completed' &&
          t.status !== 'QC' &&
          t.status !== 'QC Complete' &&
          (t.assignedStaffIds?.includes(member.id) || t.assignedStaff?.some((as: any) => as.id === member.id || as.uid === member.id))
        );

        return hasAssignedUncompletedTask;
      }).map(job => {
        // Calculate remaining book hours for tasks assigned to this member in this job
        const jobMemberTasks = allTasks.filter(t => 
          t.jobId === job.id &&
          (t.assignedStaffIds?.includes(member.id) || t.assignedStaff?.some((as: any) => as.id === member.id || as.uid === member.id))
        );
        const uncompletedJobTasks = jobMemberTasks.filter(t => t.status !== 'completed' && t.status !== 'QC' && t.status !== 'QC Complete');
        const remainingBook = uncompletedJobTasks.reduce((acc: number, t: any) => acc + (t.payBasis === 'hourly' ? 0 : (parseFloat(t.bookTime) || 0)), 0);

        // Blocker & parts requests
        const isBlocked = job.status === 'Blocked' || (job.blockers || []).some((b: any) => b.status === 'active');
        const pendingPartsCount = partsRequests.filter(pr => 
          pr.jobId === job.id && (pr.status === 'pending' || pr.status === 'ordered')
        ).length;

        // Current bay/zone
        const currentZone = zones.find(z => z.currentJobId === job.id);

        return {
          id: job.id,
          title: job.title,
          jobNumber: job.jobNumber,
          customerName: job.customerName,
          remainingBook,
          remainingTasksCount: uncompletedJobTasks.length,
          isBlocked,
          pendingPartsCount,
          zone: currentZone
        };
      }).sort((a, b) => {
        const idxA = priorityMap.indexOf(a.id);
        const idxB = priorityMap.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return b.remainingBook - a.remainingBook;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });

      // Calculate overall remaining book time assigned to this member in Upfitting
      const memberRemainingTasks = allTasks.filter(t => {
        const job = allJobs.find(j => j.id === t.jobId);
        if (!job || ['Closed', 'Completed', 'Ready for Customer'].includes(job.status)) return false;
        return (
          t.status !== 'completed' &&
          t.status !== 'QC' &&
          t.status !== 'QC Complete' &&
          (t.assignedStaffIds?.includes(member.id) || t.assignedStaff?.some((as: any) => as.id === member.id || as.uid === member.id))
        );
      });
      const overallRemainingBook = memberRemainingTasks.reduce((acc: number, t: any) => acc + (t.payBasis === 'hourly' ? 0 : (parseFloat(t.bookTime) || 0)), 0);

      // Week-specific calculations (Current payroll week)
      const weekEndDay = business?.payrollWeekEndDay !== undefined ? Number(business.payrollWeekEndDay) : 0;
      const weekStart = getPayrollWeekStart(new Date(), weekEndDay);
      const weekStartTime = weekStart.getTime();

      // Find sessions in the last 7 days (stable query)
      const weekSessions = weeklySessions.filter((s: any) => {
        if (!s.clockIn?.timestamp) return false;
        const ts = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate().getTime() : new Date(s.clockIn.timestamp).getTime();
        return ts >= weekStartTime;
      });

      const memberWeekSessions = weekSessions.filter(s => s.userId === member.id || (member.userId && s.userId === member.userId));
      
      let weekShiftHours = 0;
      memberWeekSessions.forEach(s => {
        const start = s.clockIn?.timestamp?.toDate ? s.clockIn.timestamp.toDate().getTime() : new Date(s.clockIn?.timestamp).getTime();
        const end = s.clockOut?.timestamp ? (s.clockOut.timestamp.toDate ? s.clockOut.timestamp.toDate().getTime() : new Date(s.clockOut.timestamp).getTime()) : Date.now();
        
        const breakMins = s.breaks?.reduce((acc: number, b: any) => {
          if (b.isPaid) return acc;
          const bStart = b.start?.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
          const bEnd = b.end ? (b.end.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime()) : end;
          
          const clampBStart = Math.max(start, Math.min(end, bStart));
          const clampBEnd = Math.max(start, Math.min(end, bEnd));
          return acc + (clampBEnd - clampBStart) / 60000;
        }, 0) || 0;
        
        weekShiftHours += Math.max(0, (end - start - breakMins * 60000) / 3600000);
      });

      // Find tasks completed by member in the last 7 days
      const weekCompletedTasks = allTasks.filter(t => {
        const isCompleted = t.status === 'completed' || t.status === 'QC' || t.status === 'QC Complete';
        if (!isCompleted) return false;
        
        const compBySelf = t.completedByStaffId === member.id || 
                           t.assignedStaffIds?.includes(member.id) ||
                           t.assignedStaff?.some((s: any) => s.id === member.id || s.uid === member.id);
        if (!compBySelf) return false;

        const compDate = t.qcCompletedAt || t.completedAt || t.updatedAt;
        if (!compDate) return false;
        
        const compMs = compDate.toDate ? compDate.toDate().getTime() : new Date(compDate).getTime();
        return compMs >= weekStartTime;
      });

      let weekBookHours = 0;
      weekCompletedTasks.forEach(task => {
        const tTitle = task.title || '';
        const isGen = tTitle.toLowerCase().includes('clock in') || tTitle.toLowerCase().includes('clockout') || tTitle.toLowerCase().includes('break') || tTitle.toLowerCase().includes('lunch') || tTitle.toLowerCase().includes('meeting');
        if (!isGen) {
          const bTime = parseFloat(task.bookTime) || 0;
          const isHourly = task.payBasis === 'hourly' || bTime === 0;
          if (isHourly) {
            const actualTime = getTaskLoggedHours(task.id, memberWeekSessions);
            weekBookHours += actualTime;
          } else {
            weekBookHours += bTime;
          }
        }
      });

      // Prepare sorted week sessions list for card timecard logs
      const weekSessionsList = memberWeekSessions.map((s: any) => {
        const sStart = s.clockIn?.timestamp?.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn?.timestamp);
        const sEndMs = s.clockOut?.timestamp 
          ? (s.clockOut.timestamp.toDate ? s.clockOut.timestamp.toDate().getTime() : new Date(s.clockOut.timestamp).getTime())
          : Date.now();
        const sTotalMs = calculateDuration(s.clockIn?.timestamp, s.clockOut?.timestamp);
        const sBreakMs = s.breaks?.reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0) || 0;
        
        return {
          id: s.id,
          start: sStart,
          endMs: s.clockOut?.timestamp ? sEndMs : null,
          totalMs: sTotalMs,
          breakMs: sBreakMs,
          jobs: (s.jobs || []).map((j: any) => {
            const jobObj = allJobs.find(job => job.id === j.id);
            const jobNum = jobObj?.jobNumber ? `#${jobObj.jobNumber}` : '';
            const customer = jobObj?.customerName || '';
            const taskName = j.taskName || j.name || 'Production Task';
            const displayName = [jobNum, customer, taskName].filter(Boolean).join(' - ');

            return {
              name: displayName,
              duration: calculateDuration(j.start, j.end)
            };
          })
        };
      }).sort((a, b) => b.start.getTime() - a.start.getTime());

      // Find jobs this technician worked on but has no remaining uncompleted tasks (Previous Jobs)
      const previousJobs = allJobs.filter(job => {
        // If they still have uncompleted work on it, it's not a previous job (it's active/queued)
        const hasUncompleted = allTasks.some(t => 
          t.jobId === job.id &&
          t.status !== 'completed' &&
          t.status !== 'QC Complete' &&
          (t.assignedStaffIds?.includes(member.id) || t.assignedStaff?.some((as: any) => as.id === member.id || as.uid === member.id))
        );
        if (hasUncompleted) return false;

        // Check if they completed any task on this job
        const hasCompletedTask = allTasks.some(t =>
          t.jobId === job.id &&
          (t.status === 'completed' || t.status === 'QC Complete') &&
          (t.completedByStaffId === member.id || t.assignedStaffIds?.includes(member.id) || t.assignedStaff?.some((as: any) => as.id === member.id || as.uid === member.id))
        );
        if (hasCompletedTask) return true;

        // Or if they clocked time on this job in the current week sessions list
        const hasTimeclockSession = memberWeekSessions.some((s: any) => 
          s.jobs?.some((j: any) => j.id === job.id || j.name?.includes(job.jobNumber) || j.name?.includes(job.title))
        );
        if (hasTimeclockSession) return true;

        return false;
      }).map(job => {
        const completedTasksCount = allTasks.filter(t => 
          t.jobId === job.id && 
          (t.status === 'completed' || t.status === 'QC Complete') &&
          (t.completedByStaffId === member.id || t.assignedStaffIds?.includes(member.id) || t.assignedStaff?.some((as: any) => as.id === member.id || as.uid === member.id))
        ).length;

        return {
          id: job.id,
          title: job.title,
          jobNumber: job.jobNumber,
          customerName: job.customerName,
          completedTasksCount
        };
      });

      // Find session for the active day (either today or selected custom date)
      const activeDayStart = new Date();
      activeDayStart.setHours(0, 0, 0, 0);
      let activeDayEnd = new Date();
      activeDayEnd.setHours(23, 59, 59, 999);

      if (timeframe === 'custom') {
        const [year, month, day] = selectedDate.split('-').map(Number);
        activeDayStart.setFullYear(year, month - 1, day);
        activeDayStart.setHours(0, 0, 0, 0);
        activeDayEnd.setFullYear(year, month - 1, day);
        activeDayEnd.setHours(23, 59, 59, 999);
      }

      const todaySession = sessions.find(s => {
        if (s.userId !== member.id && (!member.userId || s.userId !== member.userId)) return false;
        if (!s.clockIn?.timestamp) return false;
        const ts = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate().getTime() : new Date(s.clockIn.timestamp).getTime();
        return ts >= activeDayStart.getTime() && ts <= activeDayEnd.getTime();
      });

      // Get individual or default schedule
      const memberSchedule = member.individualSchedule || dept?.defaultSchedule || { startTime: '08:00', endTime: '17:00' };
      const scheduleSource = member.individualSchedule 
        ? "Technician's Individual Schedule" 
        : (dept?.defaultSchedule ? "Department's Default Schedule" : "System Fallback (08:00 - 17:00)");

      return {
        id: member.id,
        name,
        avatar: member.avatarUrl,
        initials: name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase(),
        clockStatus,
        activeTask,
        activeStopwatchMs,
        taskEfficiency,
        shiftUtilization,
        taskCoverage,
        completedBookHours,
        completedActualHours,
        totalShiftHours,
        totalTaskHours,
        queuedJobs,
        todaySession,
        schedule: memberSchedule,
        scheduleSource,
        overallRemainingBook,
        weekShiftHours,
        weekBookHours,
        weekSessionsList,
        completedTasksList,
        previousJobs: previousJobs.slice(0, 5)
      };
    });

  }, [upfitterStaff, sessions, timeframeSessions, allTasks, allJobs, partsRequests, zones, tick, timeframe, selectedDate, business]);

  const handleMoveUp = async (staffId: string, jobId: string) => {
    try {
      const member = staff.find(s => s.id === staffId);
      if (!member) return;

      const colData = staffColumnData.find(c => c.id === staffId);
      if (!colData) return;

      const currentQueued = colData.queuedJobs;
      const idx = currentQueued.findIndex(j => j.id === jobId);
      if (idx <= 0) return;

      const newJobs = [...currentQueued];
      const temp = newJobs[idx];
      newJobs[idx] = newJobs[idx - 1];
      newJobs[idx - 1] = temp;

      const updatedOrder = newJobs.map(j => j.id);

      const staffRef = doc(db, `businesses/${tenantId}/staff/${staffId}`);
      await updateDoc(staffRef, { jobPriorityOrder: updatedOrder });
      toast.success("Job moved up in queue");
    } catch (err) {
      console.error("Error moving job up:", err);
      toast.error("Failed to reorder job.");
    }
  };

  const handleMoveDown = async (staffId: string, jobId: string) => {
    try {
      const member = staff.find(s => s.id === staffId);
      if (!member) return;

      const colData = staffColumnData.find(c => c.id === staffId);
      if (!colData) return;

      const currentQueued = colData.queuedJobs;
      const idx = currentQueued.findIndex(j => j.id === jobId);
      if (idx === -1 || idx >= currentQueued.length - 1) return;

      const newJobs = [...currentQueued];
      const temp = newJobs[idx];
      newJobs[idx] = newJobs[idx + 1];
      newJobs[idx + 1] = temp;

      const updatedOrder = newJobs.map(j => j.id);

      const staffRef = doc(db, `businesses/${tenantId}/staff/${staffId}`);
      await updateDoc(staffRef, { jobPriorityOrder: updatedOrder });
      toast.success("Job moved down in queue");
    } catch (err) {
      console.error("Error moving job down:", err);
      toast.error("Failed to reorder job.");
    }
  };

  // Overall statistics at the top of the screen
  const overallStats = useMemo(() => {
    // 1. Clocked in vs task active today
    const clockedInStaffCount = staffColumnData.filter(s => s.clockStatus !== 'offline').length;
    const taskActiveStaffCount = staffColumnData.filter(s => s.clockStatus === 'active').length;

    // 2. Production efficiency this week/month (aggregate book hours completed vs actual logged)
    let totalCompletedBook = 0;
    let totalCompletedActual = 0;
    let totalAllShiftHours = 0;
    let totalAllTaskHours = 0;

    staffColumnData.forEach(s => {
      totalCompletedBook += s.completedBookHours;
      totalCompletedActual += s.completedActualHours;
      totalAllShiftHours += s.totalShiftHours;
      totalAllTaskHours += s.totalTaskHours;
    });

    const overallEfficiency = totalCompletedActual > 0
      ? Math.round((totalCompletedBook / totalCompletedActual) * 100)
      : null;

    const overallCoverage = totalAllShiftHours > 0
      ? Math.round((totalAllTaskHours / totalAllShiftHours) * 100)
      : null;

    // 3. Aggregate Blocked Jobs & Parts Awaiting in Upfitting
    // Find all active Upfitting tasks
    const activeUpfittingJobs = allJobs.filter(job => 
      !['Closed', 'Completed', 'Ready for Customer'].includes(job.status) &&
      allTasks.some(t => t.jobId === job.id)
    );

    const blockedJobs = activeUpfittingJobs.filter(job => 
      job.status === 'Blocked' || (job.blockers || []).some((b: any) => b.status === 'active')
    );
    const blockedJobsCount = blockedJobs.length;

    const partsAwaitingJobs = activeUpfittingJobs.filter(job => 
      partsRequests.some(pr => pr.jobId === job.id && (pr.status === 'pending' || pr.status === 'ordered'))
    );
    const partsAwaitingJobsCount = partsAwaitingJobs.length;

    return {
      clockedInStaffCount,
      taskActiveStaffCount,
      totalCompletedBook,
      totalCompletedActual,
      overallEfficiency,
      overallCoverage,
      blockedJobsCount,
      partsAwaitingJobsCount,
      totalAllShiftHours,
      totalAllTaskHours,
      blockedJobs,
      partsAwaitingJobs
    };
  }, [staffColumnData, allJobs, allTasks, partsRequests]);

  // Filter columns based on Search query
  const filteredStaffColumns = useMemo(() => {
    if (!searchQuery) return staffColumnData;
    const q = searchQuery.toLowerCase();
    return staffColumnData.filter(s => 
      s.name.toLowerCase().includes(q) || 
      (s.activeTask && s.activeTask.taskTitle.toLowerCase().includes(q)) ||
      (s.activeTask && s.activeTask.jobTitle.toLowerCase().includes(q))
    );
  }, [staffColumnData, searchQuery]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-zinc-500 font-bold uppercase tracking-wider text-xs">Loading Upfitters Dashboard...</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col gap-3.5 print-page-container",
        isFullscreen ? "p-4 bg-zinc-50 dark:bg-zinc-950 h-screen w-screen overflow-hidden" : "w-full"
      )}
    >
      {/* Header controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 print-hidden">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shrink-0">
            <Wrench className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-lg font-black text-zinc-900 dark:text-white leading-tight">
              Upfitting Foreman Deck
            </h1>
            <p className="text-xs text-zinc-605 dark:text-zinc-400 font-bold uppercase tracking-wider">
              Live Production Control & Efficiency Monitoring
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Filter Search Input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input 
              type="text"
              placeholder="Search staff, tasks, jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm focus:ring-1 focus:ring-indigo-500 outline-none text-xs w-48 sm:w-56 transition-all dark:text-white"
            />
          </div>

          {/* Timeframe selector & Custom Date Picker */}
          <div className="flex items-center gap-1.5">
            <div className="flex p-0.5 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              {(['today', 'week', 'month'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                    timeframe === tf 
                      ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-white shadow-sm' 
                      : 'text-zinc-550 hover:text-zinc-900 dark:hover:text-zinc-300'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Custom Date Input */}
            <div className={cn(
              "flex items-center p-0.5 rounded-xl border transition-all bg-zinc-100 dark:bg-zinc-900",
              timeframe === 'custom' 
                ? 'border-indigo-500 ring-1 ring-indigo-500' 
                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
            )}>
              <input 
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDate(e.target.value);
                    setTimeframe('custom');
                  }
                }}
                className="bg-transparent text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-250 outline-none px-2 py-0.5 cursor-pointer dark:[color-scheme:dark]"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 shadow-sm">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">Live</span>
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-450">• {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>

          <button 
            onClick={() => window.print()}
            className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer print:hidden"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Status
          </button>

          <button 
            onClick={toggleFullscreen}
            className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer print:hidden"
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            {isFullscreen ? "Exit" : "Fullscreen"}
          </button>

          <button
            onClick={toggleForemanTracker}
            className={cn(
              "px-2.5 py-1.5 border text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer",
              showForemanTracker 
                ? "bg-amber-50 border-amber-250 text-amber-600 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400"
                : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300"
            )}
          >
            <Award className="w-3.5 h-3.5" />
            Foreman Tracker
          </button>
        </div>
      </div>

      {/* Foreman Performance & Bonus Tracker Panel */}
      {showForemanTracker && (
        <div className="bg-gradient-to-r from-zinc-900 to-indigo-950 dark:from-zinc-950 dark:to-indigo-950 border border-indigo-500/20 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden animate-in slide-in-from-top-4 duration-300">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10 pb-4 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-amber-500/10 text-amber-400 p-1.5 rounded-xl border border-amber-500/20">
                  <Award className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-black tracking-tight uppercase italic">Shop Foreman - MTD Performance Tracker</h3>
                  <p className="text-[10px] text-zinc-400">Month-to-Date Performance Metrics (SAE Group - Upfitting Division)</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 relative z-10">
            {/* 1. Shop Efficiency Bonus Gauge */}
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">Shop Labor Efficiency</span>
                  <span className="text-lg font-black font-mono text-amber-400">{monthlyEff.pct}%</span>
                </div>
              </div>

              {/* Progress gauge visualizer */}
              <div className="space-y-1.5">
                <div className="h-3 bg-white/10 rounded-full overflow-hidden flex">
                  {/* Under 90% */}
                  <div className={cn("h-full transition-all duration-500", 
                    monthlyEff.pct >= 90 ? "bg-amber-500/40 w-[90%]" : "bg-rose-500 w-full"
                  )} style={{ width: monthlyEff.pct >= 90 ? '90%' : `${Math.max(5, (monthlyEff.pct / 90) * 100)}%` }} />
                  
                  {/* 90% - 99% */}
                  {monthlyEff.pct >= 90 && (
                    <div className={cn("h-full transition-all duration-500",
                      monthlyEff.pct >= 100 ? "bg-teal-500/40 w-[10%]" : "bg-amber-500 flex-1"
                    )} />
                  )}

                  {/* 100% - 109% */}
                  {monthlyEff.pct >= 100 && (
                    <div className={cn("h-full transition-all duration-500",
                      monthlyEff.pct >= 110 ? "bg-emerald-500/40 w-[10%]" : "bg-teal-500 flex-1"
                    )} />
                  )}

                  {/* 110%+ */}
                  {monthlyEff.pct >= 110 && (
                    <div className="h-full bg-emerald-500 flex-1 transition-all duration-500" />
                  )}
                </div>
                
                <div className="flex justify-between text-[8px] font-bold text-zinc-450 uppercase tracking-wider">
                  <span>Start (90% tier)</span>
                  <span>Target (100% tier)</span>
                  <span>Stretch (110%+)</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-450 pt-1">
                <span>Status: <strong className="text-white">{foremanBonus.effStatus}</strong></span>
                {foremanBonus.nextEffTier && (
                  <span>Next Mark: <strong className="text-amber-400">{foremanBonus.nextEffTier}</strong></span>
                )}
              </div>
            </div>

            {/* 2. Production Revenue Bonus Gauge */}
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">Monthly Production Revenue</span>
                  <span className="text-lg font-black font-mono text-indigo-400">${monthlyRevenue.toLocaleString()}</span>
                </div>
              </div>

              {/* Progress gauge visualizer */}
              <div className="space-y-1.5">
                <div className="h-3 bg-white/10 rounded-full overflow-hidden flex">
                  {/* Under $150K */}
                  <div className={cn("h-full transition-all duration-500", 
                    monthlyRevenue >= 150000 ? "bg-indigo-500/40 w-[60%]" : "bg-indigo-500/20 w-full"
                  )} style={{ width: monthlyRevenue >= 150000 ? '60%' : `${Math.max(5, (monthlyRevenue / 150000) * 100)}%` }} />
                  
                  {/* $150K - $199K */}
                  {monthlyRevenue >= 150000 && (
                    <div className={cn("h-full transition-all duration-500",
                      monthlyRevenue >= 200000 ? "bg-violet-500/40 w-[20%]" : "bg-indigo-500 flex-1"
                    )} />
                  )}

                  {/* $200K - $249K */}
                  {monthlyRevenue >= 200000 && (
                    <div className={cn("h-full transition-all duration-500",
                      monthlyRevenue >= 250000 ? "bg-emerald-500/40 w-[20%]" : "bg-violet-500 flex-1"
                    )} />
                  )}

                  {/* $250K+ */}
                  {monthlyRevenue >= 250000 && (
                    <div className="h-full bg-emerald-500 flex-1 transition-all duration-500" />
                  )}
                </div>
                
                <div className="flex justify-between text-[8px] font-bold text-zinc-450 uppercase tracking-wider">
                  <span>$150K Tier</span>
                  <span>$200K Tier</span>
                  <span>$250K+ Tier</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-450 pt-1">
                <span>Status: <strong className="text-white">{foremanBonus.revStatus}</strong></span>
                {foremanBonus.nextRevTier && (
                  <span>Next Mark: <strong className="text-indigo-400">{foremanBonus.nextRevTier}</strong></span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print-hidden">
        {/* Coverage Stat Card */}
        <div 
          onClick={() => setActiveMainInfo('coverage')}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 shadow-sm flex items-center justify-between group hover:border-indigo-500/35 transition-all cursor-pointer hover:shadow-md active:scale-[0.99]"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5 flex items-center gap-1">
              Direct Labor Coverage
              <HelpCircle className="w-3 h-3 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
            </p>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white font-mono leading-none">
              {overallStats.overallCoverage ? `${overallStats.overallCoverage}%` : '--'}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-1 truncate">Ratio of shift spent on tasks ({timeframe})</p>
          </div>
          <div className="w-10 h-10 bg-indigo-500/10 text-indigo-500 rounded-lg flex items-center justify-center shrink-0 border border-indigo-500/20 group-hover:scale-105 transition-transform ml-2">
            <ClipboardList className="w-5 h-5" />
          </div>
        </div>

        {/* Efficiency Stat Card */}
        <div 
          onClick={() => setActiveMainInfo('efficiency')}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 shadow-sm flex items-center justify-between group hover:border-emerald-500/35 transition-all cursor-pointer hover:shadow-md active:scale-[0.99]"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5 flex items-center gap-1">
              Production Efficiency
              <HelpCircle className="w-3 h-3 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
            </p>
            <h3 className={cn(
              "text-2xl font-black font-mono leading-none",
              overallStats.overallEfficiency && overallStats.overallEfficiency >= 100 ? "text-emerald-500" :
              overallStats.overallEfficiency && overallStats.overallEfficiency >= 85 ? "text-amber-500" :
              overallStats.overallEfficiency ? "text-rose-500" : "text-zinc-500"
            )}>
              {overallStats.overallEfficiency ? `${overallStats.overallEfficiency}%` : '--'}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-1 truncate">
              {overallStats.totalCompletedBook.toFixed(1)} Book hrs vs {overallStats.totalCompletedActual.toFixed(1)} Actual
            </p>
          </div>
          <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center justify-center shrink-0 border border-emerald-500/20 group-hover:scale-105 transition-transform ml-2">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        {/* Active Staff Card */}
        <div 
          onClick={() => setActiveMainInfo('status')}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 shadow-sm flex items-center justify-between group hover:border-blue-500/35 transition-all cursor-pointer hover:shadow-md active:scale-[0.99]"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5 flex items-center gap-1">
              Staff Operational Status
              <HelpCircle className="w-3 h-3 text-zinc-400 group-hover:text-blue-500 transition-colors" />
            </p>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white font-mono leading-none">
              {overallStats.taskActiveStaffCount} <span className="text-xs text-zinc-400 font-normal">/ {overallStats.clockedInStaffCount} Active</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-1 truncate">Clocked into tasks vs logged in today</p>
          </div>
          <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-lg flex items-center justify-center shrink-0 border border-blue-500/20 group-hover:scale-105 transition-transform ml-2">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Blockers & Parts Stat Card */}
        <div 
          onClick={() => setActiveMainInfo('blockers')}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 shadow-sm flex items-center justify-between group hover:border-amber-500/35 transition-all cursor-pointer hover:shadow-md active:scale-[0.99]"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5 flex items-center gap-1">
              Blockers & Parts Awaiting
              <HelpCircle className="w-3 h-3 text-zinc-400 group-hover:text-amber-500 transition-colors" />
            </p>
            <h3 className="text-2xl font-black text-zinc-950 dark:text-white font-mono leading-none">
              {overallStats.blockedJobsCount} <span className="text-xs text-zinc-400 font-normal">Blocked</span> &bull; {overallStats.partsAwaitingJobsCount} <span className="text-xs text-zinc-400 font-normal">Parts</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-1 truncate">Open issues in the Upfitting queue</p>
          </div>
          <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-lg flex items-center justify-center shrink-0 border border-amber-500/20 group-hover:scale-105 transition-transform ml-2">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>      {/* Kanban Board Container */}
      <div className="flex-1 overflow-x-auto pb-2 no-scrollbar min-h-0 snap-x snap-mandatory scroll-smooth print-kanban-board">
        <div className="flex gap-4 h-full p-1 print-kanban-inner">
          {filteredStaffColumns.length === 0 ? (
            <div className="w-full text-center py-20 bg-zinc-50/50 dark:bg-zinc-900/50 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl p-12">
              <ClipboardList className="w-12 h-12 text-zinc-350 dark:text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-550 italic">No upfitters match your filter criteria.</p>
            </div>
          ) : (
            filteredStaffColumns.map((col) => {
              // Status Styling
              const statusColors = {
                active: { bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-500 animate-pulse', text: 'text-emerald-500' },
                idle: { bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-500 animate-pulse', text: 'text-amber-500' },
                offline: { bg: 'bg-zinc-150 border-zinc-200/50 dark:bg-zinc-850 dark:border-zinc-800/50', dot: 'bg-zinc-400', text: 'text-zinc-400' }
              };

              const currentStatus = statusColors[col.clockStatus];

              const warnings: string[] = [];
              if (col.clockStatus === 'idle') {
                warnings.push("Idle: Clocked in but not on task");
              }
              const days = col.schedule?.days || [1, 2, 3, 4, 5];
              const todayDay = new Date().getDay() || 7;
              const isScheduledToday = days.includes(todayDay);
              
              if (isScheduledToday && col.clockStatus === 'offline' && !col.todaySession) {
                const [sh, sm] = (col.schedule?.startTime || '08:00').split(':').map(Number);
                const now = new Date();
                const shiftStart = new Date();
                shiftStart.setHours(sh, sm, 0, 0);
                if (now.getTime() > (shiftStart.getTime() + 15 * 60 * 1000)) {
                  warnings.push(`Missed Start (Scheduled: ${col.schedule.startTime})`);
                }
              }
              
              if (col.clockStatus === 'active' && col.todaySession) {
                const session = col.todaySession;
                const startMs = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate().getTime() : new Date(session.clockIn.timestamp).getTime();
                const durationHrs = (Date.now() - startMs) / 3600000;
                if (durationHrs > 12) {
                  warnings.push(`Overtime active shift (${durationHrs.toFixed(1)}h Active)`);
                }
              }
              
              const hasLongHistoricalSession = (col.weekSessionsList || []).some((s: any) => {
                const totalMs = s.totalMs || (s.endMs ? (s.endMs - s.start.getTime()) : 0);
                return totalMs > 14 * 3600000;
              });
              if (hasLongHistoricalSession) {
                warnings.push("Forgot clock-out: Contains >14h shift");
              }

              return (
                <div 
                  key={col.id} 
                  className="w-[calc(100vw-2.5rem)] sm:w-[400px] shrink-0 snap-center flex flex-col bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-md h-full overflow-hidden relative print-technician-card"
                >
                  {/* Explanation overlay popover */}
                  {activeInfo && activeInfo.memberId === col.id && (
                    <div className="absolute inset-0 bg-zinc-50/98 dark:bg-zinc-950/98 backdrop-blur-md z-50 flex flex-col p-4 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2 mb-3">
                        <div className="flex items-center gap-1.5">
                          <HelpCircle className="w-5 h-5 text-indigo-500 animate-pulse" />
                          <h4 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                            {activeInfo.type === 'backlog' && "Backlog Details"}
                            {activeInfo.type === 'task_efficiency' && "Task Efficiency Details"}
                            {activeInfo.type === 'shift_utilization' && "Shift Utilization Details"}
                            {activeInfo.type === 'direct_labor' && "Direct Labor Coverage"}
                            {activeInfo.type === 'idle_time' && "Idle Time Details"}
                            {activeInfo.type === 'weekly_performance' && "Weekly Rolling Performance"}
                            {activeInfo.type === 'timeline' && "Daily Timeline Guide"}
                          </h4>
                        </div>
                        <button 
                          onClick={() => setActiveInfo(null)}
                          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-255 hover:bg-zinc-100 dark:hover:bg-zinc-850 transition-all cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto pr-1 text-xs text-zinc-600 dark:text-zinc-400 space-y-4 custom-scrollbar">
                        {activeInfo.type === 'backlog' && (
                          <div className="space-y-3">
                            <p className="leading-relaxed font-semibold">
                              Backlog measures the total remaining book hours for all uncompleted production tasks currently assigned to this technician.
                            </p>
                            <div className="p-3 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                              <span className="text-[9px] font-black uppercase text-indigo-550 dark:text-indigo-400 block mb-1">Calculation Method</span>
                              <p className="font-mono text-[10px] font-black text-indigo-600 dark:text-indigo-400">
                                Sum of Book Time on Open Tasks = {col.overallRemainingBook.toFixed(1)}h
                              </p>
                            </div>
                            <div className="space-y-2">
                              <span className="text-[9px] font-black uppercase text-zinc-400 dark:text-zinc-500 block">Assigned Queued Jobs ({col.queuedJobs.length})</span>
                              {col.queuedJobs.length === 0 ? (
                                <p className="italic text-zinc-400 text-[10px]">No queued jobs currently assigned.</p>
                              ) : (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                  {col.queuedJobs.map((qJob: any) => (
                                    <div key={qJob.id} className="p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl flex justify-between gap-3 text-[10px]">
                                      <span className="font-semibold truncate">#{qJob.jobNumber} {qJob.title}</span>
                                      <span className="font-mono font-bold text-zinc-505 shrink-0">{qJob.remainingBook.toFixed(1)}h</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {activeInfo.type === 'task_efficiency' && (
                          <div className="space-y-3">
                            <p className="leading-relaxed font-semibold">
                              Task Efficiency compares the estimated Book Time of tasks completed during this timeframe against the actual hours clocked directly on those tasks.
                            </p>
                            <div className="p-3 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                              <span className="text-[9px] font-black uppercase text-emerald-500 block mb-1">Formula</span>
                              <p className="font-mono text-[10px] font-black text-emerald-600 dark:text-emerald-450 leading-snug">
                                (Completed Book Hours / Actual Task Clocked Hours) &times; 100
                              </p>
                              <div className="mt-2 pt-2 border-t border-dashed border-emerald-500/20 space-y-1 font-mono text-[9.5px] text-zinc-400">
                                <div>Book Hours Completed: {col.completedBookHours.toFixed(2)}h</div>
                                <div>Actual Task Clocked Hours: {col.completedActualHours.toFixed(2)}h</div>
                                <div className="font-bold text-emerald-600 dark:text-emerald-450 mt-1">
                                  Result: {col.taskEfficiency ? `${col.taskEfficiency}%` : 'N/A'}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <span className="text-[9px] font-black uppercase text-zinc-400 dark:text-zinc-500 block">Completed Tasks ({col.completedTasksList?.length || 0})</span>
                              {(!col.completedTasksList || col.completedTasksList.length === 0) ? (
                                <p className="italic text-zinc-400 text-[10px]">No completed tasks in selected timeframe.</p>
                              ) : (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                  {col.completedTasksList.map((t: any, idx: number) => (
                                    <div key={idx} className="p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl flex justify-between gap-3 text-[10px]">
                                      <span className="font-semibold truncate">{t.title}</span>
                                      <div className="font-mono text-right shrink-0 flex flex-col items-end">
                                        <span className="font-bold text-zinc-700 dark:text-zinc-300">{t.bookTime.toFixed(2)}h book</span>
                                        <span className="text-[9px] text-zinc-400 font-semibold">{t.actualTime.toFixed(2)}h actual</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {activeInfo.type === 'shift_utilization' && (
                          <div className="space-y-3">
                            <p className="leading-relaxed font-semibold">
                              Shift Utilization measures productive output against total clocked time. It shows the percentage of clocked shift hours that were turned into completed Book Hours.
                            </p>
                            <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                              <span className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-500 block mb-1">Formula</span>
                              <p className="font-mono text-[10px] font-black text-amber-600 dark:text-amber-500 leading-snug">
                                (Completed Book Hours / Total Shift Hours) &times; 100
                              </p>
                              <div className="mt-2 pt-2 border-t border-dashed border-amber-500/20 space-y-1 font-mono text-[9.5px] text-zinc-400">
                                <div>Completed Book Hours: {col.completedBookHours.toFixed(2)}h</div>
                                <div>Total Shift Hours: {col.totalShiftHours.toFixed(2)}h</div>
                                <div className="font-bold text-amber-600 dark:text-amber-500 mt-1">
                                  Result: {col.shiftUtilization ? `${col.shiftUtilization}%` : 'N/A'}
                                </div>
                              </div>
                            </div>
                            <p className="text-[10px] text-zinc-405 leading-relaxed bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-850">
                              ℹ️ Shift hours are net of unpaid breaks. A utilization above 100% means the technician is beating standard book times during their shift.
                            </p>
                          </div>
                        )}

                        {activeInfo.type === 'direct_labor' && (
                          <div className="space-y-3">
                            <p className="leading-relaxed font-semibold">
                              Direct Labor Coverage represents the percentage of logged timecard hours spent clocked into actual customer production tasks vs total shift duration.
                            </p>
                            <div className="p-3 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                              <span className="text-[9px] font-black uppercase text-indigo-550 dark:text-indigo-400 block mb-1">Formula</span>
                              <p className="font-mono text-[10px] font-black text-indigo-600 dark:text-indigo-400 leading-snug">
                                (Production Task Hours / Total Shift Hours) &times; 100
                              </p>
                              <div className="mt-2 pt-2 border-t border-dashed border-indigo-500/20 space-y-1 font-mono text-[9.5px] text-zinc-400">
                                <div>Production Task Clock: {col.totalTaskHours.toFixed(2)}h</div>
                                <div>Total Shift Clock: {col.totalShiftHours.toFixed(2)}h</div>
                                <div className="font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                                  Result: {col.taskCoverage ? `${col.taskCoverage}%` : 'N/A'}
                                </div>
                              </div>
                            </div>
                            <p className="text-[10px] text-zinc-405 leading-relaxed bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-850">
                              ℹ️ Non-production tasks like cleanup, breaks, lunches, or general clock-ins are automatically excluded from the numerator to ensure direct labor represents actual billable work.
                            </p>
                          </div>
                        )}

                        {activeInfo.type === 'idle_time' && (
                          <div className="space-y-3">
                            <p className="leading-relaxed font-semibold">
                              Idle Time measures the duration when a technician was clocked into their shift but not clocked into any active production task or job.
                            </p>
                            <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                              <span className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-500 block mb-1">Formula</span>
                              <p className="font-mono text-[10px] font-black text-amber-600 dark:text-amber-500 leading-snug">
                                Total Shift Hours - Production Task Hours
                              </p>
                              <div className="mt-2 pt-2 border-t border-dashed border-amber-500/20 space-y-1 font-mono text-[9.5px] text-zinc-400">
                                <div>Total Clocked Shift: {col.totalShiftHours.toFixed(2)}h</div>
                                <div>Production Task Clock: {col.totalTaskHours.toFixed(2)}h</div>
                                <div className="font-bold text-amber-600 dark:text-amber-500 mt-1">
                                  Result: {Math.max(0, col.totalShiftHours - col.totalTaskHours).toFixed(2)}h
                                </div>
                              </div>
                            </div>
                            <p className="text-[10px] text-zinc-405 leading-relaxed bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-850">
                              ℹ️ High Idle Time indicates the technician is clocked into the building but waiting for work, performing general shop duties, or forgot to clock into their production tasks.
                            </p>
                          </div>
                        )}

                        {activeInfo.type === 'weekly_performance' && (
                          <div className="space-y-3">
                            <p className="leading-relaxed font-semibold">
                              This section displays the rolling weekly completed book hours and clocked shift hours over the last 7 days.
                            </p>
                            <div className="p-3 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-2xl font-mono text-[10px] space-y-1">
                              <span className="text-[9px] font-black uppercase text-indigo-555 dark:text-indigo-400 block mb-1">Weekly Totals (7-Day Rolling)</span>
                              <div>Weekly Book Hours: {col.weekBookHours.toFixed(1)}h</div>
                              <div>Weekly Clocked Hours: {col.weekShiftHours.toFixed(1)}h</div>
                              <div className="font-bold text-indigo-650 dark:text-indigo-400 mt-1">
                                Weekly Shift Utilization: {col.weekShiftHours > 0 ? Math.round((col.weekBookHours / col.weekShiftHours) * 100) : 0}%
                              </div>
                            </div>
                            <p className="text-[10px] text-zinc-405 leading-relaxed">
                              This 7-day query is completely independent of the timeframe selected in the header. It provides a stable weekly gauge of technician performance.
                            </p>
                          </div>
                        )}

                        {activeInfo.type === 'timeline' && (
                          <div className="space-y-3">
                            <p className="leading-relaxed font-semibold">
                              The Visual daily timeline maps out the technician's scheduled shift vs their actual clocked events for the selected day.
                            </p>
                            <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl space-y-1 text-[10px]">
                              <span className="text-[9px] font-black uppercase text-zinc-400 block mb-1">Matched Schedule</span>
                              <div>Shift Window: <strong>{col.schedule.startTime} - {col.schedule.endTime}</strong></div>
                              <div className="text-[9px] text-zinc-405 mt-1">Source: <span className="italic">{col.scheduleSource}</span></div>
                            </div>
                            <div className="space-y-2">
                              <span className="text-[9px] font-black uppercase text-zinc-400 block">Timeline Visual Key</span>
                              <div className="grid grid-cols-1 gap-2 text-[10px]">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-4 bg-zinc-200/20 dark:bg-zinc-800/25 border border-dashed border-zinc-400/30 rounded" />
                                  <span>Scheduled Shift Window</span>
                                </div>
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-4 bg-indigo-500/25 border border-indigo-500/35 rounded" />
                                  <span>Clocked In Time (Shift Duration)</span>
                                </div>
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-4 bg-amber-400 rounded flex items-center justify-center text-[7px] text-amber-900 font-bold">L</div>
                                  <span>Lunch Break / Unpaid Break</span>
                                </div>
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-4 bg-teal-500 rounded text-[6px] text-teal-950 font-bold flex items-center justify-center">#JOB</div>
                                  <span>Job / Production Task Segment</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                        <button
                          onClick={() => setActiveInfo(null)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow cursor-pointer transition-colors"
                        >
                          Got It
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Column Header */}
                  <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/20 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {col.avatar ? (
                          <div className="relative shrink-0">
                            <img 
                              src={col.avatar} 
                              alt={col.name} 
                              className={cn(
                                "w-11 h-11 rounded-2xl object-cover border shadow-sm",
                                warnings.length > 0 ? "border-amber-500 ring-2 ring-amber-500/20" : "border-zinc-250 dark:border-zinc-700"
                              )}
                            />
                            {warnings.length > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white rounded-full p-0.5 shadow border border-white dark:border-zinc-950 flex items-center justify-center">
                                <AlertTriangle className="w-2.5 h-2.5 animate-pulse" />
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className={cn(
                            "w-11 h-11 font-extrabold text-sm rounded-2xl flex items-center justify-center shadow-sm relative shrink-0",
                            warnings.length > 0 
                              ? "bg-amber-500/10 border border-amber-500/30 text-amber-600" 
                              : "bg-indigo-500/10 border border-indigo-500/20 text-indigo-500"
                          )}>
                            {col.initials}
                            {warnings.length > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white rounded-full p-0.5 shadow border border-white dark:border-zinc-950 flex items-center justify-center">
                                <AlertTriangle className="w-2.5 h-2.5 animate-pulse" />
                              </span>
                            )}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white leading-tight truncate">
                            <StaffLink name={col.name} tenantId={tenantId} staffId={col.id} className="hover:underline hover:text-indigo-500 transition-colors" />
                          </h4>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border",
                              currentStatus.bg,
                              currentStatus.text
                            )}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", currentStatus.dot)} />
                              {col.clockStatus === 'active' ? 'Working' : col.clockStatus === 'idle' ? 'Idle' : 'Offline'}
                            </span>
                            
                            <button 
                              onClick={() => setActiveInfo({ memberId: col.id, type: 'backlog' })}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border border-indigo-500/20 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                              title="View Backlog Details"
                            >
                              <span>Backlog: {col.overallRemainingBook.toFixed(1)}h</span>
                              <HelpCircle className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {warnings.length > 0 && (
                      <div className="flex flex-col gap-1.5 border-t border-dashed border-amber-500/20 pt-2.5 bg-amber-500/[0.02] dark:bg-amber-500/[0.01] p-2 rounded-xl border border-amber-500/10">
                        {warnings.map((w, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[10.5px] text-amber-600 dark:text-amber-500 font-bold uppercase tracking-wider leading-tight">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 animate-pulse" />
                            <span className="truncate">{w}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Individual Efficiencies Summary Row */}
                    <div className="grid grid-cols-4 gap-1 border-t border-zinc-200 dark:border-zinc-800/60 pt-3 text-center">
                      <button 
                        onClick={() => setActiveInfo({ memberId: col.id, type: 'task_efficiency' })}
                        className="flex flex-col items-center hover:bg-zinc-50 dark:hover:bg-zinc-850/50 p-1 rounded-xl transition-all cursor-pointer group/item text-center"
                      >
                        <span className="text-[9.5px] sm:text-[10px] font-bold text-zinc-505 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-center gap-0.5 mx-auto">
                          Task Eff <HelpCircle className="w-2 h-2 opacity-60 group-hover/item:opacity-100 transition-opacity" />
                        </span>
                        <span className={cn(
                          "text-xs sm:text-sm font-bold font-mono block mt-0.5",
                          col.taskEfficiency && col.taskEfficiency >= 100 ? "text-emerald-500" :
                          col.taskEfficiency && col.taskEfficiency >= 85 ? "text-amber-500" :
                          col.taskEfficiency ? "text-rose-500" : "text-zinc-400"
                        )}>
                          {col.taskEfficiency ? `${col.taskEfficiency}%` : '--'}
                        </span>
                      </button>
                      <button 
                        onClick={() => setActiveInfo({ memberId: col.id, type: 'shift_utilization' })}
                        className="flex flex-col items-center hover:bg-zinc-50 dark:hover:bg-zinc-850/50 p-1 rounded-xl border-l border-zinc-150 dark:border-zinc-800/80 transition-all cursor-pointer group/item text-center"
                      >
                        <span className="text-[9.5px] sm:text-[10px] font-bold text-zinc-550 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-center gap-0.5 mx-auto">
                          Shift Util <HelpCircle className="w-2.5 h-2.5 opacity-60 group-hover/item:opacity-100 transition-opacity" />
                        </span>
                        <span className={cn(
                          "text-xs sm:text-sm font-bold font-mono block mt-0.5",
                          col.shiftUtilization && col.shiftUtilization >= 90 ? "text-emerald-500" :
                          col.shiftUtilization && col.shiftUtilization >= 75 ? "text-amber-500" :
                          col.shiftUtilization ? "text-rose-500" : "text-zinc-400"
                        )}>
                          {col.shiftUtilization ? `${col.shiftUtilization}%` : '--'}
                        </span>
                      </button>
                      <button 
                        onClick={() => setActiveInfo({ memberId: col.id, type: 'direct_labor' })}
                        className="flex flex-col items-center hover:bg-zinc-50 dark:hover:bg-zinc-850/50 p-1 rounded-xl border-l border-zinc-150 dark:border-zinc-800/80 transition-all cursor-pointer group/item text-center"
                      >
                        <span className="text-[9.5px] sm:text-[10px] font-bold text-zinc-550 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-center gap-0.5 mx-auto">
                          Direct Lab <HelpCircle className="w-2.5 h-2.5 opacity-60 group-hover/item:opacity-100 transition-opacity" />
                        </span>
                        <span className={cn(
                          "text-xs sm:text-sm font-bold font-mono block mt-0.5",
                          col.taskCoverage && col.taskCoverage >= 85 ? "text-indigo-500" :
                          col.taskCoverage && col.taskCoverage >= 70 ? "text-amber-500" :
                          col.taskCoverage ? "text-rose-500" : "text-zinc-400"
                        )}>
                          {col.taskCoverage ? `${col.taskCoverage}%` : '--'}
                        </span>
                      </button>
                      <button 
                        onClick={() => setActiveInfo({ memberId: col.id, type: 'idle_time' })}
                        className="flex flex-col items-center hover:bg-zinc-50 dark:hover:bg-zinc-850/50 p-1 rounded-xl border-l border-zinc-150 dark:border-zinc-800/80 transition-all cursor-pointer group/item text-center"
                      >
                        <span className="text-[9.5px] sm:text-[10px] font-bold text-zinc-550 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-center gap-0.5 mx-auto">
                          Idle Time <HelpCircle className="w-2.5 h-2.5 opacity-60 group-hover/item:opacity-100 transition-opacity" />
                        </span>
                        <span className={cn(
                          "text-xs sm:text-sm font-bold font-mono block mt-0.5",
                          (col.totalShiftHours - col.totalTaskHours) > 5 ? "text-rose-500 font-extrabold" :
                          (col.totalShiftHours - col.totalTaskHours) > 2 ? "text-amber-550 dark:text-amber-500" :
                          col.totalShiftHours > 0 ? "text-zinc-500" : "text-zinc-400"
                        )}>
                          {col.totalShiftHours > 0 ? `${Math.max(0, col.totalShiftHours - col.totalTaskHours).toFixed(1)}h` : '0.0h'}
                        </span>
                      </button>
                    </div>

                    {/* Weekly Performance Totals */}
                    <button
                      onClick={() => setActiveInfo({ memberId: col.id, type: 'weekly_performance' })}
                      className="flex justify-between items-center border-t border-zinc-200 dark:border-zinc-800/40 pt-3 px-2 hover:bg-zinc-50 dark:hover:bg-zinc-850/50 p-1.5 rounded-lg transition-all cursor-pointer group/item"
                    >
                      <span className="text-[11px] font-bold text-zinc-505 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                        Payroll Period <HelpCircle className="w-2.5 h-2.5 opacity-60 group-hover/item:opacity-100 transition-opacity" />
                      </span>
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-mono">
                        {col.weekBookHours.toFixed(1)}h Book &bull; {col.weekShiftHours.toFixed(1)}h Clocked
                      </span>
                    </button>

                    {/* Collapsible Weekly Timeclock Logs */}
                    <div className="flex flex-col">
                      <button
                        onClick={() => setExpandedLogs(prev => ({ ...prev, [col.id]: !prev[col.id] }))}
                        className="w-full flex items-center justify-between py-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-450 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors border-t border-zinc-200 dark:border-zinc-855 mt-2 cursor-pointer"
                      >
                        <span>Payroll Timecard Log</span>
                        <span className="text-xs">{expandedLogs[col.id] ? 'Hide ▲' : 'Show ▼'}</span>
                      </button>

                      {expandedLogs[col.id] && (
                        <div className="mt-2 space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1 animate-in fade-in slide-in-from-top-1 duration-200">
                          {col.weekSessionsList.length === 0 ? (
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic text-center py-2">
                              No timeclock logs found for this payroll period.
                            </p>
                          ) : (
                            col.weekSessionsList.map((s: any) => (
                              <div 
                                key={s.id} 
                                onClick={() => navigate(`/business/${tenantId}/timeclock?session=${s.id}`)}
                                className="p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl flex flex-col gap-1 cursor-pointer hover:border-indigo-500/40 hover:shadow-sm active:scale-[0.99] transition-all"
                                title="Click to view/edit this timecard entry"
                              >
                                <div className="flex justify-between items-center text-xs font-black text-zinc-800 dark:text-zinc-200">
                                  <span>
                                    {s.start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                                  </span>
                                  <span className="font-mono text-xs font-black text-indigo-500 dark:text-indigo-400">
                                    {formatDuration(s.totalMs - s.breakMs)} worked
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold">
                                  <span>
                                    {s.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} -{' '}
                                    {s.endMs ? new Date(s.endMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Active'}
                                  </span>
                                  {s.breakMs > 0 && <span>Break: {formatDuration(s.breakMs)}</span>}
                                </div>
                                
                                {/* Jobs worked on this session */}
                                {s.jobs && s.jobs.length > 0 && (
                                  <div className="mt-1 pt-1 border-t border-dashed border-zinc-200 dark:border-zinc-850 flex flex-col gap-0.5">
                                    {s.jobs.map((j: any, jIdx: number) => (
                                      <div key={jIdx} className="flex justify-between items-center text-[10px] text-zinc-505 dark:text-zinc-400 font-medium gap-2">
                                        <span className="flex-1 min-w-0 truncate" title={j.name}>&bull; {j.name}</span>
                                        <span className="font-mono text-[9px] font-bold text-zinc-400 shrink-0">{formatDuration(j.duration)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Visual Daily Timeline Bar */}
                    {col.todaySession ? (() => {
                      const session = col.todaySession;
                      const actualStart = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
                      const sessionEndMs = session.clockOut?.timestamp 
                        ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate().getTime() : new Date(session.clockOut.timestamp).getTime())
                        : Date.now();
                      
                      // Get schedule
                      const schedule = col.schedule || { startTime: '08:00', endTime: '17:00' };
                      const [startH, startM] = (schedule.startTime || '08:00').split(':').map(Number);
                      const [endH, endM] = (schedule.endTime || '17:00').split(':').map(Number);

                      const schedStart = new Date(actualStart);
                      schedStart.setHours(startH, startM, 0, 0);

                      const schedEnd = new Date(actualStart);
                      schedEnd.setHours(endH, endM, 0, 0);

                      // Timeline range: start at min of scheduled start and actual clock in, end at max of scheduled end and actual clock out/now
                      const timelineStart = new Date(Math.min(schedStart.getTime(), actualStart.getTime()));
                      const timelineEnd = new Date(Math.max(schedEnd.getTime(), sessionEndMs));
                      const totalScaleMs = timelineEnd.getTime() - timelineStart.getTime();

                      const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
                      const breakMs = session.breaks?.reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0) || 0;
                      const { assignedJobs, totalTracks } = layoutSessionJobs(session.jobs, sessionEndMs);
                      
                      return (
                        <div className="border-t border-zinc-200 dark:border-zinc-800/60 pt-3 flex flex-col gap-1.5 print-hidden">
                          <button 
                            onClick={() => setActiveInfo({ memberId: col.id, type: 'timeline' })}
                            className="w-full flex justify-between items-center text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest hover:text-indigo-500 transition-colors cursor-pointer group/item text-left"
                          >
                            <span className="flex items-center gap-1">
                              {timeframe === 'custom' ? `${selectedDate} Timeline` : "Today's Timeline"}
                              <HelpCircle className="w-2.5 h-2.5 opacity-60 group-hover/item:opacity-100 transition-opacity" />
                            </span>
                            <span className="font-mono text-zinc-400 dark:text-zinc-500">
                              {formatDuration(totalMs - breakMs)} worked
                            </span>
                          </button>
                          <div className="bg-zinc-150 dark:bg-zinc-850 rounded-lg overflow-hidden w-full relative h-6 border border-zinc-200 dark:border-zinc-800/50">
                            
                            {/* Scheduled Shift Band */}
                            {(() => {
                              const renderStart = Math.max(timelineStart.getTime(), schedStart.getTime());
                              const renderEnd = Math.max(timelineStart.getTime(), Math.min(timelineEnd.getTime(), schedEnd.getTime()));
                              if (renderStart >= renderEnd) return null;

                              const leftPercent = ((renderStart - timelineStart.getTime()) / totalScaleMs) * 100;
                              const widthPercent = ((renderEnd - renderStart) / totalScaleMs) * 100;

                              return (
                                <div 
                                  className="absolute top-0 h-full bg-zinc-200/20 dark:bg-zinc-800/25 border-x border-dashed border-zinc-400/30 dark:border-zinc-700/35 z-0 pointer-events-none"
                                  style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                                  title={`Scheduled Shift: ${schedule.startTime} - ${schedule.endTime}`}
                                />
                              );
                            })()}

                            {/* Actual Worked Time */}
                            {(() => {
                              const renderStart = Math.max(timelineStart.getTime(), actualStart.getTime());
                              const renderEnd = Math.max(timelineStart.getTime(), Math.min(timelineEnd.getTime(), sessionEndMs));
                              if (renderStart >= renderEnd) return null;
                              
                              const leftPercent = ((renderStart - timelineStart.getTime()) / totalScaleMs) * 100;
                              const widthPercent = ((renderEnd - renderStart) / totalScaleMs) * 100;
                              
                              return (
                                <div 
                                  className="absolute top-0 h-full bg-indigo-500/25 dark:bg-indigo-500/10 border-l border-r border-indigo-500/35 transition-all duration-1000 z-5 pointer-events-none"
                                  style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                                  title={`Clocked In: ${formatDuration(sessionEndMs - actualStart.getTime())}`}
                                />
                              );
                            })()}

                            {/* Breaks Overlay */}
                            {session.breaks?.map((b: any, idx: number) => {
                              const bStartMs = b.start?.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
                              const bEndMs = b.end ? (b.end.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime()) : Date.now();
                              
                              const renderStart = Math.max(timelineStart.getTime(), bStartMs);
                              const renderEnd = Math.max(timelineStart.getTime(), Math.min(timelineEnd.getTime(), bEndMs));
                              
                              if (renderStart >= renderEnd) return null;
                              
                              const leftPercent = ((renderStart - timelineStart.getTime()) / totalScaleMs) * 100;
                              const widthPercent = ((renderEnd - renderStart) / totalScaleMs) * 100;
                              
                              return (
                                <div 
                                  key={`break-${idx}`}
                                  className="absolute top-0 h-full bg-amber-400 z-10 hover:brightness-110 flex items-center justify-center overflow-hidden"
                                  style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                                  title={`${b.type === 'lunch' ? 'Lunch' : 'Normal'} Break: ${formatDuration(bEndMs - bStartMs)}`}
                                >
                                  <span className="text-[8.5px] font-black uppercase text-amber-900/50 tracking-wider whitespace-nowrap px-0.5 truncate">
                                    {b.type === 'lunch' ? 'L' : 'B'}
                                  </span>
                                </div>
                              );
                            })}

                            {/* Job Overlay */}
                            {assignedJobs.map((j: any, idx: number) => {
                              const renderStart = Math.max(timelineStart.getTime(), j.startTime);
                              const renderEnd = Math.max(timelineStart.getTime(), Math.min(timelineEnd.getTime(), j.endTime));
                              
                              if (renderStart >= renderEnd) return null;
                              
                              const leftPercent = ((renderStart - timelineStart.getTime()) / totalScaleMs) * 100;
                              const widthPercent = ((renderEnd - renderStart) / totalScaleMs) * 100;
                              
                              const colorInfo = getJobColor(j.id);
                              
                              // Calculate height and top dynamically based on total overlapping tracks
                              let heightPx = 14;
                              let topPx = 4;
                              if (totalTracks > 1) {
                                const usableHeight = 18;
                                const trackHeight = Math.floor(usableHeight / totalTracks);
                                heightPx = Math.max(3, trackHeight - 1);
                                topPx = 2 + (j.trackIndex * trackHeight);
                              }

                              return (
                                <div 
                                  key={`job-${idx}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/business/${tenantId}/job/${j.id}`);
                                  }}
                                  className={`absolute ${colorInfo.bg} ${colorInfo.text} rounded-[3px] border ${colorInfo.border} shadow-sm cursor-pointer hover:brightness-110 hover:scale-y-105 transition-all duration-300 z-20 flex items-center justify-center overflow-hidden`}
                                  style={{ 
                                    left: `${leftPercent}%`, 
                                    width: `${widthPercent}%`,
                                    top: `${topPx}px`,
                                    height: `${heightPx}px`
                                  }}
                                  title={`Job: ${j.name}\n${formatDuration(j.endTime - j.startTime)}\nClick to view job details`}
                                >
                                  <span 
                                    className="font-black uppercase tracking-widest whitespace-nowrap px-0.5 truncate"
                                    style={{ 
                                      fontSize: totalTracks > 2 ? '7.5px' : '9.5px',
                                    }}
                                  >
                                    {j.name.replace('#', '')}
                                  </span>
                                </div>
                              );
                            })}

                            {/* Hour Markers */}
                            {(() => {
                              const ticks = [];
                              const startHour = new Date(timelineStart);
                              startHour.setMinutes(0, 0, 0);
                              startHour.setHours(startHour.getHours() + 1);
                              
                              const endHourTime = timelineEnd.getTime();
                              while (startHour.getTime() < endHourTime) {
                                ticks.push(new Date(startHour));
                                startHour.setHours(startHour.getHours() + 1);
                              }
                              
                              return ticks.map((tickTime, idx) => {
                                const offsetMs = tickTime.getTime() - timelineStart.getTime();
                                const leftPercent = (offsetMs / totalScaleMs) * 100;
                                return (
                                  <div 
                                    key={`tick-${idx}`} 
                                    className="absolute top-0 bottom-0 border-l border-zinc-950/15 dark:border-white/15 z-30 pointer-events-none" 
                                    style={{ left: `${leftPercent}%` }}
                                  >
                                    <span className="absolute top-0.5 left-0.5 text-[8.5px] font-black text-zinc-400 dark:text-zinc-500 drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)] dark:drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] whitespace-nowrap">
                                      {tickTime.toLocaleTimeString([], { hour: 'numeric' })}
                                    </span>
                                  </div>
                                );
                              });
                            })()}
                          </div>

                          {/* Session Details Row */}
                          <div className="flex justify-between items-center text-[10px] font-black text-zinc-405 dark:text-zinc-400 uppercase tracking-widest mt-0.5 px-0.5">
                            <span>
                              In: {actualStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} &bull;{' '}
                              {session.clockOut?.timestamp ? (
                                `Out: ${new Date(sessionEndMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                              ) : (
                                <span className="text-emerald-500 font-extrabold animate-pulse">Clocked In</span>
                              )}
                            </span>
                            <span>
                              {breakMs > 0 ? `Breaks: ${formatDuration(breakMs)}` : 'No breaks'} &bull; Shift: {formatDuration(totalMs)}
                            </span>
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="border-t border-zinc-200 dark:border-zinc-800/60 pt-3 flex flex-col gap-1.5">
                        <span className="text-xs font-bold text-zinc-500 dark:text-zinc-450 uppercase tracking-wider block">
                          {timeframe === 'custom' ? `${selectedDate} Timeline` : "Today's Timeline"}
                        </span>
                        <div className="bg-zinc-50 dark:bg-zinc-850/50 rounded-lg flex items-center justify-center h-6 border border-zinc-200 dark:border-zinc-800/50">
                          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 italic">
                            {timeframe === 'custom' 
                              ? `No timeclock activity logged for ${selectedDate}.` 
                              : "No timeclock activity logged today."}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>


                  {/* Column Body (Scrollable Task Deck) */}
                  <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 no-scrollbar bg-zinc-50/20 dark:bg-zinc-950/5">
                    
                    {/* CURRENT TASK CARD */}
                    <div>
                      <h5 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        Current Task Assignment
                      </h5>
                      {col.clockStatus === 'active' && col.activeTask ? (
                        <div className="p-4 bg-emerald-500/[0.02] border border-emerald-500/25 dark:border-emerald-500/10 rounded-2xl flex flex-col gap-3 shadow-inner hover:border-emerald-500/40 transition-colors">
                          <div>
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-450 uppercase tracking-wider block mb-1">
                              Clocked In
                            </span>
                            <h5 className="font-extrabold text-sm text-zinc-900 dark:text-white leading-tight">
                              {col.activeTask.taskTitle}
                            </h5>
                            <p 
                              onClick={() => navigate(`/business/${tenantId}/job/${col.activeTask.jobId}`)}
                              className="text-xs text-indigo-500 hover:text-indigo-600 font-bold uppercase tracking-wider mt-1.5 hover:underline cursor-pointer flex items-center gap-0.5 truncate"
                            >
                              Job: {col.activeTask.jobTitle}
                              <ChevronRight className="w-3 h-3 shrink-0" />
                            </p>
                          </div>

                          {/* Stopwatch & Elapsed time */}
                          <div className="flex items-center justify-between border-t border-emerald-500/10 pt-2.5">
                            <span className="text-xs text-zinc-500 dark:text-zinc-450 font-semibold flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-zinc-400" /> Time Clocked:
                            </span>
                            <span className="font-mono text-sm font-black text-emerald-500">
                              {formatStopwatch(col.activeStopwatchMs)}
                            </span>
                          </div>

                          {/* Remaining Tasks on Current Job */}
                          {(() => {
                            const jobTasks = allTasks.filter(t => t.jobId === col.activeTask.jobId && t.id !== col.activeTask.taskId);
                            const uncompletedTasks = jobTasks.filter(t => t.status !== 'completed' && t.status !== 'QC Complete');
                            
                            if (uncompletedTasks.length === 0) return null;

                            return (
                              <div className="border-t border-emerald-500/10 pt-2.5 flex flex-col gap-2">
                                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                  Remaining Tasks for Job ({uncompletedTasks.length})
                                </span>
                                <div className="space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar pr-1">
                                  {uncompletedTasks.map(t => (
                                    <div 
                                      key={t.id}
                                      onClick={() => navigate(`/business/${tenantId}/task/${col.activeTask.jobId}/${t.id}`)}
                                      className="text-xs text-zinc-650 dark:text-zinc-400 hover:text-indigo-500 font-medium truncate flex justify-between gap-2 cursor-pointer hover:underline"
                                    >
                                      <span>&bull; {t.title}</span>
                                      <span className="font-mono text-xs font-bold text-zinc-400 shrink-0">{t.bookTime || '0'}h</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Alerts (Blocker or Parts requests on Active job) */}
                          {(() => {
                            const job = allJobs.find(j => j.id === col.activeTask.jobId);
                            const isBlocked = job && (job.status === 'Blocked' || (job.blockers || []).some((b: any) => b.status === 'active'));
                            const pendingPartsCount = partsRequests.filter(pr => 
                              pr.jobId === col.activeTask.jobId && (pr.status === 'pending' || pr.status === 'ordered')
                            ).length;

                            if (!isBlocked && pendingPartsCount === 0) return null;

                            return (
                              <div className="border-t border-emerald-500/10 pt-2.5 flex flex-col gap-1.5">
                                {isBlocked && (
                                  <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/25 text-red-500 px-2 py-1 rounded-xl text-[11px] font-bold">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>PRODUCTION BLOCKED</span>
                                  </div>
                                )}
                                {pendingPartsCount > 0 && (
                                  <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-500 px-2 py-1 rounded-xl text-[11px] font-bold">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{pendingPartsCount} PARTS REQUESTS PENDING</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ) : col.clockStatus === 'idle' ? (
                        <div className="p-4 bg-amber-500/5 border-2 border-dashed border-amber-500/35 rounded-2xl flex flex-col items-center justify-center text-center py-6 gap-2 animate-pulse">
                          <AlertTriangle className="w-7 h-7 text-amber-500" />
                          <div>
                            <span className="text-xs font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest block mb-0.5">
                              IDLE STATE WARNING
                            </span>
                            <span className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold block leading-snug">
                              Technician is clocked in but not assigned to a task.
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-850 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-center py-6 gap-1 opacity-70">
                          <Clock className="w-6 h-6 text-zinc-400" />
                          <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">
                            Staff Clocked Out
                          </span>
                        </div>
                      )}
                    </div>

                    {/* QUEUED JOBS LIST */}
                    <div className="flex-1 flex flex-col gap-2.5">
                      <h5 className="text-xs font-bold text-zinc-505 dark:text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <ClipboardList className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        Queued Production Jobs ({col.queuedJobs.length})
                      </h5>
                      <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                        {col.queuedJobs.length === 0 ? (
                          <div className="p-4 text-center bg-zinc-50/30 dark:bg-zinc-950/20 border border-zinc-200/50 dark:border-zinc-800/40 rounded-2xl">
                            <span className="text-xs text-zinc-500 dark:text-zinc-400 italic">No queued jobs assigned.</span>
                          </div>
                        ) : (
                          col.queuedJobs.map((job, index) => (
                            <div 
                              key={job.id}
                              onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}
                              className={cn(
                                "p-3 bg-zinc-50/75 dark:bg-zinc-900/40 border rounded-2xl hover:border-indigo-500/40 hover:shadow-sm cursor-pointer transition-all flex flex-col gap-2 relative group",
                                job.isBlocked ? "border-red-200 dark:border-red-955/30 bg-red-500/[0.01]" : "border-zinc-200 dark:border-zinc-800"
                              )}
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <h6 className="font-extrabold text-xs text-zinc-900 dark:text-white leading-snug group-hover:text-indigo-500 transition-colors truncate">
                                    {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title}
                                  </h6>
                                  <span className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider truncate block mt-0.5">
                                    {job.customerName || 'No Customer'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-500 text-xs font-bold uppercase tracking-wider rounded-md border border-indigo-500/20 whitespace-nowrap">
                                    {job.remainingBook.toFixed(1)}h
                                  </span>
                                  {col.queuedJobs.length > 1 && (
                                    <div 
                                      className="flex items-center gap-0.5 bg-zinc-150 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-250 dark:border-zinc-700/60 print:hidden" 
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        disabled={index === 0}
                                        onClick={() => handleMoveUp(col.id, job.id)}
                                        className="p-0.5 rounded text-zinc-500 dark:text-zinc-450 hover:text-indigo-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:pointer-events-none transition-colors animate-none"
                                        title="Move Up"
                                      >
                                        <ChevronUp className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        disabled={index === col.queuedJobs.length - 1}
                                        onClick={() => handleMoveDown(col.id, job.id)}
                                        className="p-0.5 rounded text-zinc-500 dark:text-zinc-450 hover:text-indigo-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:pointer-events-none transition-colors animate-none"
                                        title="Move Down"
                                      >
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 font-medium border-t border-zinc-150 dark:border-zinc-800/50 pt-2 mt-0.5">
                                <span className="flex items-center gap-1">
                                  <ListChecks className="w-3 h-3 text-zinc-400" />
                                  {job.remainingTasksCount} tasks left
                                </span>
                                {job.zone && (
                                  <span className="text-indigo-500 font-bold flex items-center gap-0.5 truncate max-w-[120px]">
                                    <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                                    {job.zone.name}
                                  </span>
                                )}
                              </div>

                              {/* Alert badges */}
                              {(job.isBlocked || job.pendingPartsCount > 0) && (
                                <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-zinc-150 dark:border-zinc-800/50">
                                  {job.isBlocked && (
                                    <span className="inline-flex items-center gap-0.5 bg-red-500/10 text-red-505 text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-red-500/10">
                                      Blocked
                                    </span>
                                  )}
                                  {job.pendingPartsCount > 0 && (
                                    <span className="inline-flex items-center gap-0.5 bg-amber-500/10 text-amber-606 dark:text-amber-500 text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-amber-500/10">
                                      Parts Awaiting ({job.pendingPartsCount})
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* PREVIOUS JOBS LIST */}
                    <div className="flex flex-col gap-2.5 border-t border-dashed border-zinc-200 dark:border-zinc-800/60 pt-3">
                      <h5 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-zinc-450 shrink-0" />
                        Previous Jobs ({col.previousJobs?.length || 0})
                      </h5>
                      <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {!col.previousJobs || col.previousJobs.length === 0 ? (
                          <div className="p-3 text-center bg-zinc-50/20 dark:bg-zinc-950/10 border border-dashed border-zinc-200/50 dark:border-zinc-800/20 rounded-2xl">
                            <span className="text-xs text-zinc-400 dark:text-zinc-500 italic">No previous jobs.</span>
                          </div>
                        ) : (
                          col.previousJobs.map(job => (
                            <div 
                              key={job.id}
                              onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}
                              className="p-3 bg-zinc-50/40 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl hover:border-zinc-500/40 hover:shadow-sm cursor-pointer transition-all flex flex-col gap-1 relative group"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                  <h6 className="font-bold text-xs text-zinc-900 dark:text-white leading-snug group-hover:text-indigo-500 transition-colors truncate">
                                    {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title}
                                  </h6>
                                  <span className="text-xs text-zinc-500 dark:text-zinc-450 font-medium truncate block mt-0.5">
                                    {job.customerName || 'No Customer'}
                                  </span>
                                </div>
                                <span className="px-1.5 py-0.5 bg-zinc-150 dark:bg-zinc-850/80 text-zinc-500 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-wider rounded-md shrink-0 border border-zinc-200 dark:border-zinc-800/60 whitespace-nowrap">
                                  {job.completedTasksCount} Tasks
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Page-level Modal Overlay for KPI Main Cards */}
      {activeMainInfo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl relative animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-2 text-indigo-500">
                <HelpCircle className="w-5 h-5 animate-pulse" />
                <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                  {activeMainInfo === 'coverage' && "Direct Labor Coverage Details"}
                  {activeMainInfo === 'efficiency' && "Production Efficiency Details"}
                  {activeMainInfo === 'status' && "Staff Operational Status Details"}
                  {activeMainInfo === 'blockers' && "Blockers & Parts Awaiting Details"}
                </h3>
              </div>
              <button 
                onClick={() => setActiveMainInfo(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-255 hover:bg-zinc-100 dark:hover:bg-zinc-850 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 text-sm text-zinc-650 dark:text-zinc-400 space-y-5 custom-scrollbar">
              {activeMainInfo === 'coverage' && (
                <div className="space-y-4">
                  <p className="leading-relaxed text-sm font-semibold">
                    Direct Labor Coverage represents the percentage of total clocked shift hours that all upfitting technicians spent working on billable customer tasks.
                  </p>
                  
                  <div className="p-4 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                    <span className="text-xs font-black uppercase text-indigo-550 dark:text-indigo-400 block mb-1">Overall Formula</span>
                    <p className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400">
                      (Total Task Hours / Total Shift Hours) &times; 100
                    </p>
                    <div className="mt-3 pt-3 border-t border-dashed border-indigo-500/20 space-y-1.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      <div>Total Productive Task Time: <strong>{overallStats.totalAllTaskHours.toFixed(1)}h</strong></div>
                      <div>Total Clocked Shift Time: <strong>{overallStats.totalAllShiftHours.toFixed(1)}h</strong></div>
                      <div className="font-bold text-indigo-600 dark:text-indigo-400 mt-2 text-sm">
                        Result: {overallStats.overallCoverage ? `${overallStats.overallCoverage}%` : '--'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <span className="text-xs font-black uppercase text-zinc-400 dark:text-zinc-500 block">Individual Coverage Breakdown ({timeframe})</span>
                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                      {staffColumnData.map(s => (
                        <div key={s.id} className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {s.avatar ? (
                              <img src={s.avatar} alt={s.name} className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-500 font-bold flex items-center justify-center text-xs">
                                {s.initials}
                              </div>
                            )}
                            <span className="font-bold text-zinc-800 dark:text-zinc-200">{s.name}</span>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-zinc-500 mr-2">({s.totalTaskHours.toFixed(1)}h task / {s.totalShiftHours.toFixed(1)}h shift)</span>
                            <span className="font-bold text-indigo-500">{s.taskCoverage ? `${s.taskCoverage}%` : '--'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeMainInfo === 'efficiency' && (
                <div className="space-y-4">
                  <p className="leading-relaxed text-sm font-semibold">
                    Production Efficiency measures productive output by comparing the total standard book hours of tasks completed in this timeframe against the actual hours clocked directly on those completed tasks.
                  </p>

                  <div className="p-4 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                    <span className="text-[10px] font-black uppercase text-emerald-500 block mb-1">Formula</span>
                    <p className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-450">
                      (Completed Book Hours / Actual Hours spent on completed tasks) &times; 100
                    </p>
                    <div className="mt-3 pt-3 border-t border-dashed border-emerald-500/20 space-y-1.5 font-mono text-[11px] text-zinc-550 dark:text-zinc-400">
                      <div>Total Book Hours Completed: <strong>{overallStats.totalCompletedBook.toFixed(1)}h</strong></div>
                      <div>Total Actual Clocked Time: <strong>{overallStats.totalCompletedActual.toFixed(1)}h</strong></div>
                      <div className={cn(
                        "font-bold mt-2 text-sm",
                        overallStats.overallEfficiency && overallStats.overallEfficiency >= 100 ? "text-emerald-500" :
                        overallStats.overallEfficiency && overallStats.overallEfficiency >= 85 ? "text-amber-500" :
                        overallStats.overallEfficiency ? "text-rose-500" : "text-zinc-500"
                      )}>
                        Overall Efficiency: {overallStats.overallEfficiency ? `${overallStats.overallEfficiency}%` : '--'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <span className="text-[10px] font-black uppercase text-zinc-400 dark:text-zinc-500 block">Individual Efficiency Breakdown ({timeframe})</span>
                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                      {staffColumnData.map(s => (
                        <div key={s.id} className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-855 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {s.avatar ? (
                              <img src={s.avatar} alt={s.name} className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center text-[10px]">
                                {s.initials}
                              </div>
                            )}
                            <span className="font-bold text-zinc-800 dark:text-zinc-200">{s.name}</span>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-zinc-500 mr-2">({s.completedBookHours.toFixed(1)}h book / {s.completedActualHours.toFixed(1)}h actual)</span>
                            <span className={cn(
                              "font-bold",
                              s.taskEfficiency && s.taskEfficiency >= 100 ? "text-emerald-500" :
                              s.taskEfficiency && s.taskEfficiency >= 85 ? "text-amber-500" :
                              s.taskEfficiency ? "text-rose-500" : "text-zinc-400"
                            )}>{s.taskEfficiency ? `${s.taskEfficiency}%` : '--'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeMainInfo === 'status' && (
                <div className="space-y-4">
                  <p className="leading-relaxed text-sm font-semibold">
                    Current operational status of all technicians scheduled or active in Upfitting today.
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center">
                      <span className="text-[10px] font-black text-emerald-500 uppercase block mb-1">Working</span>
                      <span className="text-2xl font-black text-emerald-500 font-mono">
                        {staffColumnData.filter(s => s.clockStatus === 'active').length}
                      </span>
                    </div>
                    <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center">
                      <span className="text-[10px] font-black text-amber-550 dark:text-amber-500 uppercase block mb-1">Idle</span>
                      <span className="text-2xl font-black text-amber-550 dark:text-amber-500 font-mono">
                        {staffColumnData.filter(s => s.clockStatus === 'idle').length}
                      </span>
                    </div>
                    <div className="p-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-center">
                      <span className="text-[10px] font-black text-zinc-400 uppercase block mb-1">Offline</span>
                      <span className="text-2xl font-black text-zinc-450 dark:text-zinc-400 font-mono">
                        {staffColumnData.filter(s => s.clockStatus === 'offline').length}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <span className="text-[10px] font-black uppercase text-zinc-400 dark:text-zinc-500 block">Technician Status List</span>
                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                      {staffColumnData.map(s => {
                        const colors = {
                          active: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
                          idle: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
                          offline: 'text-zinc-400 bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                        };
                        return (
                          <div key={s.id} className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {s.avatar ? (
                                <img src={s.avatar} alt={s.name} className="w-6 h-6 rounded-full object-cover" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-500 font-bold flex items-center justify-center text-[10px]">
                                  {s.initials}
                                </div>
                              )}
                              <div>
                                <span className="font-bold text-zinc-800 dark:text-zinc-200 block text-xs">{s.name}</span>
                                {s.clockStatus === 'active' && s.activeTask && (
                                  <span className="text-[11px] text-zinc-500 truncate max-w-[280px] block mt-0.5 font-medium">
                                    Working on: {s.activeTask.taskTitle} (Job {s.activeTask.jobTitle.split(' ')[0]})
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={cn("px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border", colors[s.clockStatus])}>
                              {s.clockStatus === 'active' ? 'Working' : s.clockStatus === 'idle' ? 'Idle' : 'Offline'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeMainInfo === 'blockers' && (
                <div className="space-y-4">
                  <p className="leading-relaxed text-sm font-semibold">
                    List of all active Upfitting jobs currently marked as Blocked or having pending Parts Requests in the queue.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-red-500/5 dark:bg-red-500/10 border border-red-500/20 rounded-2xl text-center">
                      <span className="text-xs font-black text-red-500 uppercase block mb-1">Blocked Jobs</span>
                      <span className="text-2xl font-black text-red-500 font-mono">
                        {overallStats.blockedJobsCount}
                      </span>
                    </div>
                    <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center">
                      <span className="text-xs font-black text-amber-550 dark:text-amber-500 uppercase block mb-1">Jobs Awaiting Parts</span>
                      <span className="text-2xl font-black text-amber-550 dark:text-amber-500 font-mono">
                        {overallStats.partsAwaitingJobsCount}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {overallStats.blockedJobs.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-black uppercase text-red-500 block">Blocked Jobs Breakdown</span>
                        <div className="space-y-2 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                          {overallStats.blockedJobs.map(job => (
                            <div key={job.id} className="p-3 bg-red-500/[0.01] dark:bg-red-500/[0.02] border border-red-200 dark:border-red-955/20 rounded-xl flex items-center justify-between">
                              <div>
                                <span className="font-bold text-zinc-900 dark:text-white text-xs block">
                                  {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title}
                                </span>
                                <span className="text-[11px] text-zinc-500">{job.customerName}</span>
                              </div>
                              <span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-[11px] font-black uppercase tracking-wider rounded-md border border-red-500/20">
                                Blocked
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {overallStats.partsAwaitingJobs.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-black uppercase text-amber-500 block">Jobs Awaiting Parts Breakdown</span>
                        <div className="space-y-2 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                          {overallStats.partsAwaitingJobs.map(job => {
                            const requestsCount = partsRequests.filter(pr => pr.jobId === job.id && (pr.status === 'pending' || pr.status === 'ordered')).length;
                            return (
                              <div key={job.id} className="p-3 bg-amber-500/[0.01] dark:bg-amber-500/[0.02] border border-amber-200 dark:border-amber-955/20 rounded-xl flex items-center justify-between">
                                <div>
                                  <span className="font-bold text-zinc-900 dark:text-white text-xs block">
                                    {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title}
                                  </span>
                                  <span className="text-xs text-zinc-500">{job.customerName}</span>
                                </div>
                                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-555 dark:text-amber-500 text-xs font-black uppercase tracking-wider rounded-md border border-amber-500/20">
                                  {requestsCount} Parts Requests
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end shrink-0">
              <button
                onClick={() => setActiveMainInfo(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow cursor-pointer transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ----------------------------------------------------
          PRINT STYLESHEET
      ---------------------------------------------------- */}
      <style>{`
        @media print {
          /* Hide global layout element like sidebar, main nav etc */
          aside, nav, header, [role="navigation"], .no-print, .print-hidden, .print\\:hidden, button, input, select {
            display: none !important;
          }
          
          /* Override any custom components that act as sidebar or top nav */
          .bg-zinc-955, .bg-zinc-950, .bg-zinc-900, .bg-zinc-800 {
            background-color: transparent !important;
          }

          /* Force body to fit standard printed page without overflow */
          body, html, #root {
            background: white !important;
            color: black !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* Remove container limits so all content renders */
          .print-page-container {
            padding: 0 !important;
            margin: 0 !important;
            height: auto !important;
            overflow: visible !important;
            display: block !important;
          }

          /* Grid layout for cards on print */
          .print-kanban-board {
            display: block !important;
            overflow: visible !important;
            height: auto !important;
          }
          .print-kanban-inner {
            display: flex !important;
            flex-direction: column !important;
            gap: 2rem !important;
            height: auto !important;
            overflow: visible !important;
            width: 100% !important;
          }

          /* Individual card print styles */
          .print-technician-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            background: white !important;
            border: 1px solid #e4e4e7 !important; /* border-zinc-200 */
            color: black !important;
            padding: 1.5rem !important;
            border-radius: 12px !important;
            box-shadow: none !important;
          }
          .print-technician-card:not(:last-child) {
            page-break-after: always !important;
            break-after: page !important;
          }

          /* Allow scrollable lists inside cards to expand fully on paper */
          .max-h-60, .max-h-48, .custom-scrollbar {
            max-height: none !important;
            overflow: visible !important;
            height: auto !important;
          }

          /* Optimize colors for readability on white paper */
          .text-zinc-900, .text-zinc-800, .text-zinc-700, .dark\\:text-white, .text-black {
            color: #18181b !important; /* zinc-900 */
          }
          .text-zinc-650, .text-zinc-600, .text-zinc-500, .text-zinc-450, .text-zinc-400 {
            color: #52525b !important; /* zinc-600 */
          }
          
          /* Keep text decorations clean */
          a, span, h1, h2, h3, h4, h5, h6, p {
            color: inherit;
          }

          /* Badges styling for print */
          .bg-indigo-500\\/10, .bg-indigo-500\\/[0.05], .bg-indigo-500\\/[0.1] {
            background-color: #f4f4f5 !important;
            border-color: #d4d4d8 !important;
            color: #3f3f46 !important;
          }
          .bg-emerald-500\\/10, .bg-emerald-500\\/[0.1] {
            background-color: #f0fdf4 !important;
            border-color: #bbf7d0 !important;
            color: #166534 !important;
          }
          .bg-amber-500\\/10, .bg-amber-500\\/[0.1] {
            background-color: #fffbeb !important;
            border-color: #fde68a !important;
            color: #92400e !important;
          }
          .bg-red-500\\/10, .bg-red-500\\/[0.1] {
            background-color: #fef2f2 !important;
            border-color: #fecaca !important;
            color: #991b1b !important;
          }
        }
      `}</style>
    </div>
  );
}
