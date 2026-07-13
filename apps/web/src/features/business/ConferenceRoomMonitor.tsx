import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, doc, collectionGroup } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  AlertTriangle, CheckCircle2, Target, 
  ShoppingCart, Clock, Users, Activity, Wifi
} from 'lucide-react';
import _QRCode from 'react-qr-code';
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';

const QRCode = (_QRCode as any).default || _QRCode;

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

const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate();
    } catch (e) {}
  }
  if (val && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
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

export function ConferenceRoomMonitor({ tenantId }: { tenantId: string }) {
  // Mode selection state (defaults to screensaver)
  const [displayMode, setDisplayMode] = useState<'screensaver' | 'dashboard'>(() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    return modeParam === 'dashboard' ? 'dashboard' : 'screensaver';
  });

  const [businessName, setBusinessName] = useState('UPFITTERS OS');
  const [guestWifiSsid, setGuestWifiSsid] = useState('SAE - Guest');
  const [guestWifiPassword, setGuestWifiPassword] = useState('8557232878');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [monitorSettings, setMonitorSettings] = useState<any>(null);

  // Shop Metrics State (for Dashboard Mode)
  const [zones, setZones] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  
  const [now, setNow] = useState(Date.now());
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Firestore snapshot error logging
  const handleSnapshotError = (error: any, listenerName: string) => {
    console.error(`Firestore Snapshot Error in [${listenerName}]:`, error);
  };

  // Clock updates every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcut listener (Space/Enter to toggle modes)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        setDisplayMode(prev => prev === 'screensaver' ? 'dashboard' : 'screensaver');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen to remote TV mode toggles from the Foreman Dashboard
  useEffect(() => {
    if (!monitorSettings) return;
    
    const mode = monitorSettings.conferenceTvMode;
    const expiresAt = monitorSettings.conferenceTvModeExpiresAt instanceof Date 
      ? monitorSettings.conferenceTvModeExpiresAt.getTime() 
      : monitorSettings.conferenceTvModeExpiresAt?.toDate 
        ? monitorSettings.conferenceTvModeExpiresAt.toDate().getTime() 
        : Number(monitorSettings.conferenceTvModeExpiresAt) || 0;

    if (mode === 'dashboard') {
      if (expiresAt && Date.now() >= expiresAt) {
        setDisplayMode('screensaver');
      } else {
        setDisplayMode('dashboard');
        
        // If there's a valid future expiration time, set a local timer to revert to screensaver
        if (expiresAt) {
          const msLeft = expiresAt - Date.now();
          const timer = setTimeout(() => {
            setDisplayMode('screensaver');
          }, msLeft);
          return () => clearTimeout(timer);
        }
      }
    } else {
      setDisplayMode('screensaver');
    }
  }, [monitorSettings?.conferenceTvMode, monitorSettings?.conferenceTvModeExpiresAt]);

  // Firestore listeners
  useEffect(() => {
    if (!tenantId) return;

    // 1. Business settings
    const unsubBusiness = onSnapshot(doc(db, 'businesses', tenantId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBusinessName(data.name || 'UPFITTERS OS');
        setGuestWifiSsid(data.guestWifiSsid || 'SAE - Guest');
        setGuestWifiPassword(data.guestWifiPassword || '8557232878');
        setLogoUrl(data.logoUrl || null);
        setMonitorSettings(data);
        setLastUpdated(new Date());
      }
    }, (err) => handleSnapshotError(err, 'Business Settings'));

    // 2. Zones (Bays/Lot)
    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      const data: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        if (!d.isArchived) {
          data.push({ id: doc.id, ...d });
        }
      });
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setZones(data);
      setLastUpdated(new Date());
    }, (err) => handleSnapshotError(err, 'Bays and Lot'));

    // 3. Jobs
    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      setJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => handleSnapshotError(err, 'Jobs'));

    // 4. Parts Requests
    const unsubParts = onSnapshot(
      query(collection(db, `businesses/${tenantId}/parts_requests`), where('status', 'in', ['pending', 'ordered', 'received'])),
      (snap) => {
        setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLastUpdated(new Date());
      },
      (err) => handleSnapshotError(err, 'Parts Requests')
    );

    // 5. Active sessions
    const unsubSessions = onSnapshot(
      query(collection(db, `businesses/${tenantId}/time_sessions`), where('status', 'in', ['active', 'on_break'])),
      (snap) => {
        setActiveSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (err) => handleSnapshotError(err, 'Active Sessions')
    );

    // 6. Staff
    const unsubStaff = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setStaffList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleSnapshotError(err, 'Staff'));

    // 7. Tasks
    const unsubTasks = onSnapshot(
      query(collectionGroup(db, 'tasks'), where('tenantId', '==', tenantId)),
      (snap) => {
        const filteredDocs = snap.docs.filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`));
        const parsed = filteredDocs.map(doc => {
          const pathParts = doc.ref.path.split('/');
          const jobId = pathParts[3];
          return {
            id: doc.id,
            jobId,
            ...doc.data()
          };
        });
        setAllTasks(parsed);
      },
      (err) => handleSnapshotError(err, 'Tasks')
    );

    return () => {
      unsubBusiness();
      unsubZones();
      unsubJobs();
      unsubParts();
      unsubSessions();
      unsubStaff();
      unsubTasks();
    };
  }, [tenantId]);

  // Compute Weekly Goals Progress
  const weeklyGoals = useMemo(() => {
    const weekEndDay = monitorSettings?.payrollWeekEndDay !== undefined ? Number(monitorSettings.payrollWeekEndDay) : 0;
    const weekStart = getPayrollWeekStart(new Date(), weekEndDay);
    const weekStartTime = weekStart.getTime();

    const targetHours = Number(monitorSettings?.upfittingWeeklyHoursTarget) || 250;
    const targetJobs = Number(monitorSettings?.upfittingWeeklyJobsTarget) || 5;

    const completedJobsThisWeek = jobs.filter(job => {
      if (!['Completed', 'Delivered'].includes(job.status)) return false;
      const compDate = parseSafeDate(job.completedAt || job.updatedAt);
      return compDate && compDate.getTime() >= weekStartTime;
    });

    const completedTasksThisWeek = allTasks.filter(task => {
      const isCompleted = task.status === 'QC Complete' || task.status === 'QC';
      if (!isCompleted) return false;
      const compDate = parseSafeDate(task.qcCompletedAt || task.completedAt || task.updatedAt);
      return compDate && compDate.getTime() >= weekStartTime;
    });

    let completedBookHours = 0;
    let completedHourlyHours = 0;

    completedTasksThisWeek.forEach(task => {
      if (isGeneralTask(task)) return;
      const bTime = parseFloat(task.bookTime) || 0;
      const isHourly = task.payBasis === 'hourly' || bTime === 0;

      if (isHourly) {
        const taskSessions = activeSessions.filter(s => 
          (s.jobs || []).some((j: any) => j.taskId === task.id)
        );
        let loggedMs = 0;
        taskSessions.forEach(session => {
          const segments = (session.jobs || []).filter((j: any) => j.taskId === task.id);
          segments.forEach((seg: any) => {
            const start = parseSafeDate(seg.start)?.getTime() || 0;
            const end = parseSafeDate(seg.end)?.getTime() || Date.now();
            if (start > 0) loggedMs += Math.max(0, end - start);
          });
        });
        const loggedHrs = loggedMs / 3600000;
        completedHourlyHours += loggedHrs;
      } else {
        completedBookHours += bTime;
      }
    });

    const combinedHours = completedBookHours + completedHourlyHours;
    const hoursProgress = targetHours > 0 ? Math.min(100, Math.round((combinedHours / targetHours) * 100)) : 0;
    const jobsProgress = targetJobs > 0 ? Math.min(100, Math.round((completedJobsThisWeek.length / targetJobs) * 100)) : 0;

    return {
      targetHours,
      targetJobs,
      completedJobs: completedJobsThisWeek,
      completedBookHours,
      completedHourlyHours,
      combinedHours,
      hoursProgress,
      jobsProgress,
      weekStart
    };
  }, [jobs, allTasks, activeSessions, monitorSettings]);

  // Compute Active Floor bays
  const activeBays = useMemo(() => {
    const bayZones = zones.filter(z => z.type === 'bay');
    return bayZones.map(zone => {
      const job = jobs.find(j => j.id === zone.currentJobId);
      const vehicle = job?.vehicleVin ? { vin: job.vehicleVin, year: job.year, make: job.make, model: job.model } : null;
      
      const crewInBay = activeSessions.filter(session => {
        const jobsArr = Array.isArray(session.jobs) ? session.jobs : [];
        return jobsArr.some((j: any) => !j.end && j.jobId === job?.id);
      });

      const blockersArr = Array.isArray(job?.blockers) ? job.blockers : [];
      const activeBlockers = blockersArr.filter((b: any) => b && b.status === 'active');
      const isBlocked = activeBlockers.length > 0 || job?.status === 'Blocked' || zone.status === 'Blocked';

      const bayTasks = job ? allTasks.filter(t => t.jobId === job.id && !isGeneralTask(t)) : [];
      const totalTasks = bayTasks.length;
      const qcTasks = bayTasks.filter(t => ['QC', 'QC Complete'].includes(t.status)).length;
      const allReadyForQC = totalTasks > 0 && qcTasks === totalTasks;
      const partialReadyForQC = totalTasks > 0 && qcTasks > 0 && qcTasks < totalTasks;
      const hasPartsRequest = partsRequests.some(pr => pr.jobId === job?.id && ['pending', 'ordered'].includes(pr.status));

      return {
        zone,
        job,
        vehicle,
        crewInBay,
        isBlocked,
        blockerMessage: activeBlockers[0]?.message || 'Blocked',
        totalTasks,
        qcTasks,
        allReadyForQC,
        partialReadyForQC,
        hasPartsRequest
      };
    });
  }, [zones, jobs, activeSessions, allTasks, partsRequests]);

  // Compute Active Blockers
  const blockedJobsList = useMemo(() => {
    return jobs.filter(job => {
      const isCompleted = ['Completed', 'Closed', 'Delivered'].includes(job.status);
      if (isCompleted) return false;
      const blockersArr = Array.isArray(job.blockers) ? job.blockers : [];
      const activeBlockers = blockersArr.filter((b: any) => b && b.status === 'active');
      return job.status === 'Blocked' || activeBlockers.length > 0;
    }).map(job => {
      const blockersArr = Array.isArray(job.blockers) ? job.blockers : [];
      const activeBlockers = blockersArr.filter((b: any) => b && b.status === 'active');
      return {
        job,
        message: activeBlockers.length > 0 ? activeBlockers.map((b: any) => b.message).join(', ') : 'Blocked'
      };
    });
  }, [jobs]);

  // Compute Awaiting Parts
  const activePartsList = useMemo(() => {
    return partsRequests.filter(pr => ['pending', 'ordered'].includes(pr.status)).map(pr => {
      const job = jobs.find(j => j.id === pr.jobId);
      return { pr, job };
    });
  }, [partsRequests, jobs]);

  // Compute Staff Daily Standup Tags
  const staffStandupTasks = useMemo(() => {
    return staffList.filter(s => s.dailyTags && s.dailyTags.length > 0).map(s => ({
      id: s.id,
      name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.displayName || 'Technician',
      tags: s.dailyTags || []
    }));
  }, [staffList]);

  // Background click mode toggle handler
  const handleBgClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Don't toggle mode if user clicked on specific interactive elements or within the WiFi card
    if (target.closest('button, a, input, select, textarea, [data-qr-code="true"], .wifi-card-inner')) {
      return;
    }
    setDisplayMode(prev => prev === 'screensaver' ? 'dashboard' : 'screensaver');
  };

  // Date/Clock format helpers
  const hoursVal = new Date(now).getHours();
  const displayHours = hoursVal % 12 || 12;
  const minutes = String(new Date(now).getMinutes()).padStart(2, '0');
  const seconds = String(new Date(now).getSeconds()).padStart(2, '0');
  const ampm = hoursVal >= 12 ? 'PM' : 'AM';
  const dayName = new Date(now).toLocaleDateString([], { weekday: 'long' });
  const dateFormatted = new Date(now).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });

  // Generate WPA Wifi payload for QR Code
  const wifiQrPayload = `WIFI:T:WPA;S:${guestWifiSsid};P:${guestWifiPassword};;`;

  return (
    <div 
      onClick={handleBgClick}
      className={cn(
        "h-[100dvh] text-white p-6 flex flex-col justify-between overflow-hidden font-sans relative select-none",
        displayMode === 'screensaver' 
          ? "bg-gradient-to-br from-zinc-950 via-black to-zinc-900 md:p-8" 
          : "bg-zinc-950 md:p-6 lg:p-8"
      )}
    >
      {/* Floating Switch Button */}
      <div className="absolute top-4 right-4 z-50 group">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setDisplayMode(prev => prev === 'screensaver' ? 'dashboard' : 'screensaver');
          }}
          className="p-3 bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-400 hover:text-white rounded-2xl border border-zinc-800/50 backdrop-blur-md transition-all duration-300 shadow-xl flex items-center gap-2 group-hover:scale-105"
        >
          {displayMode === 'screensaver' ? (
            <>
              <Activity className="w-5 h-5 text-indigo-400 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-out whitespace-nowrap">
                Show Dashboard
              </span>
            </>
          ) : (
            <>
              <Clock className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-out whitespace-nowrap">
                Show Screensaver
              </span>
            </>
          )}
        </button>
      </div>

      {displayMode === 'screensaver' ? (
        /* ==================== MODE 1: SCREENSAVER ==================== */
        <>
          {/* Custom Styles for Alternating Red/Blue Emergency Strobes */}
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes redStrobe {
              0%, 40%, 100% { opacity: 0.08; }
              10%, 30% { opacity: 0.45; }
              20% { opacity: 0.15; }
            }
            @keyframes blueStrobe {
              0%, 50%, 90%, 100% { opacity: 0.08; }
              60%, 80% { opacity: 0.45; }
              70% { opacity: 0.15; }
            }
            .animate-red-strobe {
              animation: redStrobe 4s infinite linear;
            }
            .animate-blue-strobe {
              animation: blueStrobe 4s infinite linear;
            }
          `}} />

          {/* Alternating Red and Blue Emergency Lights in Background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Red light on left */}
            <div className="absolute -top-[30%] -left-[20%] w-[70%] h-[90%] rounded-full bg-red-600/25 blur-[120px] animate-red-strobe" />
            
            {/* Blue light on right */}
            <div className="absolute -bottom-[30%] -right-[20%] w-[70%] h-[90%] rounded-full bg-blue-600/25 blur-[120px] animate-blue-strobe" />
          </div>

          {/* Spacer to push content down cleanly */}
          <div className="shrink-0 h-4 z-10" />

          {/* Center Screen: Prominent Logo, Company Name & Modern Digital Clock */}
          <main className="flex-1 flex flex-col items-center justify-center text-center z-10 space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex flex-col items-center space-y-5"
            >
              {/* Prominent Glowing Logo */}
              <div className="relative group flex items-center justify-center">
                <div className="absolute inset-0 bg-white/5 rounded-[4rem] blur-[80px] group-hover:bg-white/10 transition-all duration-500 scale-95" />
                <img 
                  src="/saeg_logo.png" 
                  onError={(e) => {
                    if (logoUrl) (e.target as HTMLImageElement).src = logoUrl;
                  }}
                  alt="SAE Logo" 
                  className="w-auto h-auto max-w-[85vw] max-h-[32vh] md:max-h-[38vh] lg:max-h-[42vh] object-contain drop-shadow-[0_0_40px_rgba(255,255,255,0.12)] relative z-10 transition-transform duration-555 hover:scale-105"
                />
              </div>

              <div className="space-y-0.5">
                <div className="text-[10px] font-black tracking-[0.35em] text-indigo-400 uppercase">CONFERENCE ROOM</div>
                <div className="text-xl md:text-2xl font-black tracking-tight text-zinc-300">{businessName}</div>
              </div>

              {/* Time display with glowing shadow */}
              <div className="flex items-baseline justify-center font-mono font-black tracking-tight leading-none pt-4">
                <span className="text-7xl sm:text-8xl md:text-9xl lg:text-[10rem] xl:text-[13rem] text-zinc-100 drop-shadow-[0_0_30px_rgba(255,255,255,0.06)]">
                  {displayHours}
                </span>
                <span className="text-5xl sm:text-7xl md:text-8xl lg:text-[8rem] xl:text-[10rem] mx-2 text-indigo-500 animate-pulse drop-shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                  :
                </span>
                <span className="text-7xl sm:text-8xl md:text-9xl lg:text-[10rem] xl:text-[13rem] text-zinc-100 drop-shadow-[0_0_30px_rgba(255,255,255,0.06)]">
                  {minutes}
                </span>
                <span className="text-3xl sm:text-4xl md:text-5xl lg:text-[4rem] xl:text-[5rem] ml-4 text-zinc-500 font-bold tracking-normal drop-shadow-none">
                  {seconds}
                </span>
                <span className="text-2xl sm:text-3xl md:text-4xl lg:text-[2.5rem] xl:text-[3rem] ml-4 text-zinc-400 font-extrabold uppercase tracking-wide">
                  {ampm}
                </span>
              </div>

              {/* Date display */}
              <div className="text-zinc-550 text-sm sm:text-lg lg:text-xl font-bold uppercase tracking-[0.25em] flex items-center justify-center gap-3">
                <span className="text-indigo-400">{dayName}</span>
                <span className="text-zinc-800">•</span>
                <span>{dateFormatted}</span>
              </div>
            </motion.div>
          </main>

          {/* Bottom Row: Centered Guest WiFi Card */}
          <footer className="flex justify-center shrink-0 z-10 border-t border-zinc-900/60 pt-6 mt-6">
            <div className="wifi-card-inner flex items-center gap-12 bg-zinc-900/50 border border-zinc-800/80 p-8 rounded-[2.5rem] backdrop-blur-md shadow-2xl max-w-2xl w-full">
              {/* QR Code */}
              <div data-qr-code="true" className="shrink-0 bg-white p-5 rounded-[2rem] shadow-inner border border-zinc-200">
                <QRCode value={wifiQrPayload} size={170} />
              </div>

              {/* Network details */}
              <div className="min-w-0 flex-1 space-y-3 font-sans">
                <div className="flex items-center gap-3 text-indigo-400 font-bold uppercase tracking-wider text-base">
                  <Wifi className="w-6 h-6" /> GUEST NETWORK
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest block">NETWORK SSID</span>
                  <span className="font-extrabold text-2xl text-zinc-200 block truncate">{guestWifiSsid}</span>
                </div>
                <div className="min-w-0 pt-2 border-t border-zinc-800/60">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest block">PASSWORD</span>
                  <span className="font-bold text-xl text-zinc-450 block truncate select-all">{guestWifiPassword}</span>
                </div>
              </div>
            </div>
          </footer>
        </>
      ) : (
        /* ==================== MODE 2: DASHBOARD ==================== */
        <>
          {/* Header */}
          <header className="flex items-center justify-between mb-6 shrink-0 bg-zinc-900/40 p-4 rounded-3xl border border-zinc-800/60 backdrop-blur-md">
            <div className="flex items-center gap-6">
              <div className="hidden md:flex bg-white p-1.5 rounded-2xl shrink-0 shadow-lg">
                <div className="w-12 h-12">
                  <QRCode value={wifiQrPayload} style={{ width: '100%', height: '100%' }} level="L" />
                </div>
              </div>
              <div>
                <div className="text-zinc-500 font-black uppercase tracking-widest text-xs md:text-sm">
                  {businessName}
                </div>
                <h1 className="text-xl md:text-3xl font-black tracking-tight text-white leading-none mt-1">
                  CONFERENCE ROOM MONITOR
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-4 lg:gap-6">
              <div className="flex flex-col items-end gap-1 font-mono mr-12">
                <span className="text-[10px] font-bold text-zinc-650 uppercase tracking-widest leading-none">
                  LIVE sync
                </span>
                <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                  Sync: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              </div>
              
              <div className="text-right flex flex-col justify-center border-l border-zinc-800 pl-4 lg:pl-6 pr-6">
                <div className="text-xl md:text-3xl font-black tracking-tight leading-none mb-1 font-mono text-zinc-100">
                  {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="text-zinc-550 text-xs font-bold uppercase tracking-widest">
                  {new Date(now).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
              </div>
            </div>
          </header>

          {/* Main Grid */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Column 1: Weekly Upfitting Performance */}
            <section className="bg-zinc-900/30 border border-zinc-850 rounded-[2rem] p-6 flex flex-col min-h-0 overflow-hidden shadow-inner">
              <div className="flex items-center gap-3 mb-6 shrink-0">
                <div className="p-2.5 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                  <Target className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight text-white uppercase">WEEKLY PRODUCTION GOALS</h2>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Payroll Week starting {weeklyGoals.weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })}</p>
                </div>
              </div>

              <div className="space-y-6 flex-1 overflow-y-auto pr-1 no-scrollbar min-h-0">
                {/* Goal 1: Book Hours */}
                <div className="bg-zinc-900/60 border border-zinc-850 p-5 rounded-2xl space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Combined Production Hours</span>
                      <span className="text-2xl font-black font-mono text-emerald-450">
                        {weeklyGoals.combinedHours.toFixed(1)} <span className="text-xs text-zinc-500 font-normal">/ {weeklyGoals.targetHours} hrs</span>
                      </span>
                    </div>
                    <span className={cn(
                      "text-xs font-black px-2.5 py-1 rounded-full font-mono border",
                      weeklyGoals.hoursProgress >= 100 ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-450" : "bg-indigo-500/10 border-indigo-500/25 text-indigo-400"
                    )}>
                      {weeklyGoals.hoursProgress}%
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3 bg-zinc-950 rounded-full overflow-hidden flex p-0.5 border border-zinc-800">
                      <motion.div 
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          weeklyGoals.hoursProgress >= 100 ? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]" :
                          weeklyGoals.hoursProgress >= 75 ? "bg-indigo-650" :
                          weeklyGoals.hoursProgress >= 50 ? "bg-amber-600" : "bg-red-600"
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${weeklyGoals.hoursProgress}%` }}
                        transition={{ duration: 1 }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-850 text-xs">
                    <div>
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Flat-Rate (Completed)</span>
                      <span className="font-bold text-white font-mono mt-0.5 block">{weeklyGoals.completedBookHours.toFixed(1)} hrs</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Hourly Work (Logged)</span>
                      <span className="font-bold text-white font-mono mt-0.5 block">{weeklyGoals.completedHourlyHours.toFixed(1)} hrs</span>
                    </div>
                  </div>
                </div>

                {/* Goal 2: Completed Jobs */}
                <div className="bg-zinc-900/60 border border-zinc-850 p-5 rounded-2xl space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Completed Upfits</span>
                      <span className="text-2xl font-black font-mono text-emerald-450">
                        {weeklyGoals.completedJobs.length} <span className="text-xs text-zinc-500 font-normal">/ {weeklyGoals.targetJobs} jobs</span>
                      </span>
                    </div>
                    <span className={cn(
                      "text-xs font-black px-2.5 py-1 rounded-full font-mono border",
                      weeklyGoals.jobsProgress >= 100 ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-450" : "bg-indigo-500/10 border-indigo-500/25 text-indigo-400"
                    )}>
                      {weeklyGoals.jobsProgress}%
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3 bg-zinc-950 rounded-full overflow-hidden flex p-0.5 border border-zinc-800">
                      <motion.div 
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          weeklyGoals.jobsProgress >= 100 ? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]" :
                          weeklyGoals.jobsProgress >= 75 ? "bg-indigo-650" :
                          weeklyGoals.jobsProgress >= 50 ? "bg-amber-600" : "bg-red-600"
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${weeklyGoals.jobsProgress}%` }}
                        transition={{ duration: 1 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Completed Jobs Ticker */}
                <div className="flex-1 flex flex-col space-y-2">
                  <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Completed This Week</h3>
                  {weeklyGoals.completedJobs.length === 0 ? (
                    <div className="text-center p-6 text-zinc-650 bg-zinc-900/20 rounded-2xl border border-zinc-850 border-dashed">
                      No completed jobs recorded yet this week
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {weeklyGoals.completedJobs.slice(0, 5).map(job => (
                        <div key={job.id} className="flex items-center justify-between p-3 bg-zinc-900/40 border border-zinc-850 rounded-xl">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-xs text-white block truncate">
                              {job.jobNumber ? `JOB #${job.jobNumber}` : job.title}
                            </span>
                            <span className="text-[10px] text-zinc-500 truncate block mt-0.5">
                              {job.year} {job.make} {job.model}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Done
                          </div>
                        </div>
                      ))}
                      {weeklyGoals.completedJobs.length > 5 && (
                        <div className="text-center text-[10px] text-zinc-500 font-bold uppercase tracking-widest pt-1">
                          + {weeklyGoals.completedJobs.length - 5} more jobs completed
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Column 2: Active Floor Status */}
            <section className="bg-zinc-900/30 border border-zinc-850 rounded-[2rem] p-6 flex flex-col min-h-0 overflow-hidden shadow-inner">
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                    <Activity className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black tracking-tight text-white uppercase">ACTIVE FLOOR BAYS</h2>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Live workspace occupancy</p>
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl font-mono text-xs font-bold text-zinc-400">
                  Active: {activeBays.filter(b => b.job).length} / {activeBays.length}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 no-scrollbar space-y-3 min-h-0">
                {activeBays.map(({ zone, job, vehicle, crewInBay, isBlocked, blockerMessage, totalTasks, qcTasks, allReadyForQC, partialReadyForQC, hasPartsRequest }) => {
                  let borderStyle = "border-zinc-850";
                  let shadowStyle = "";
                  
                  if (isBlocked) {
                    borderStyle = "border-red-900/60 bg-red-950/10";
                    shadowStyle = "shadow-[0_0_15px_rgba(239,68,68,0.05)]";
                  } else if (allReadyForQC) {
                    borderStyle = "border-emerald-900/60 bg-emerald-950/10";
                    shadowStyle = "shadow-[0_0_15px_rgba(16,185,129,0.05)]";
                  } else if (hasPartsRequest) {
                    borderStyle = "border-amber-900/60 bg-amber-950/10";
                    shadowStyle = "shadow-[0_0_15px_rgba(245,158,11,0.05)]";
                  }

                  return (
                    <div 
                      key={zone.id} 
                      className={cn(
                        "p-4 bg-zinc-900/40 border rounded-2xl flex flex-col justify-between transition-all duration-300", 
                        borderStyle, shadowStyle
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black tracking-widest text-zinc-550 uppercase">
                          {zone.name}
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          {isBlocked && (
                            <span className="bg-red-500/10 border border-red-500/20 text-red-400 font-bold uppercase tracking-wider text-[8px] px-1.5 py-0.5 rounded-[4px] flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" /> Blocked
                            </span>
                          )}
                          {allReadyForQC && (
                            <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase tracking-wider text-[8px] px-1.5 py-0.5 rounded-[4px] flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" /> QC Ready
                            </span>
                          )}
                          {!allReadyForQC && partialReadyForQC && (
                            <span className="bg-emerald-600/10 border border-emerald-600/20 text-emerald-400/90 font-bold uppercase tracking-wider text-[8px] px-1.5 py-0.5 rounded-[4px]">
                              QC {qcTasks}/{totalTasks}
                            </span>
                          )}
                          {hasPartsRequest && (
                            <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold uppercase tracking-wider text-[8px] px-1.5 py-0.5 rounded-[4px] flex items-center gap-1">
                              <ShoppingCart className="w-2.5 h-2.5" /> Parts
                            </span>
                          )}
                        </div>
                      </div>

                      {job ? (
                        <div className="mt-2 space-y-1">
                          <div className="font-black text-sm text-zinc-100 truncate flex items-center justify-between">
                            <span>{job.jobNumber ? `JOB #${job.jobNumber}` : job.title}</span>
                          </div>
                          {vehicle && (
                            <p className="text-[11px] text-zinc-500 font-semibold truncate leading-tight">
                              {vehicle.year} {vehicle.make} {vehicle.model}
                            </p>
                          )}

                          {crewInBay.length > 0 ? (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-900">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                              <span className="text-[10px] text-emerald-400/90 font-black uppercase tracking-wider truncate">
                                {crewInBay.map(s => s.userName ? s.userName.split(' ')[0] : 'Crew').join(', ')}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[9px] text-zinc-650 uppercase font-black tracking-widest mt-2 pt-2 border-t border-zinc-900/60">
                              No crew clocked in
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 text-zinc-650 font-black text-xs uppercase tracking-widest">
                          --- Empty ---
                        </div>
                      )}

                      {isBlocked && (
                        <div className="mt-2 pt-2 border-t border-red-950/40 text-[10px] font-semibold text-red-400 truncate">
                          Reason: {blockerMessage}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Column 3: Blockers, Parts & Crew Notices */}
            <section className="flex flex-col gap-6 min-h-0 overflow-hidden">
              
              {/* Top Panel: Blockers & Issues */}
              <div className="bg-zinc-900/30 border border-zinc-850 rounded-[2rem] p-6 flex flex-col flex-1 min-h-0 overflow-hidden shadow-inner">
                <div className="flex items-center gap-3 mb-4 shrink-0">
                  <div className="p-2.5 bg-red-500/10 rounded-2xl border border-red-500/20">
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black tracking-tight text-white uppercase">ACTIVE BLOCKERS & ISSUES</h2>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Production blockers</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 no-scrollbar space-y-2 min-h-0">
                  {blockedJobsList.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600 bg-zinc-900/20 rounded-2xl border border-zinc-850 border-dashed">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mb-2" />
                      <span className="font-bold text-xs uppercase tracking-widest">All Clear</span>
                      <p className="text-[10px] text-zinc-600 font-semibold mt-1">No active blockers flagged on shop floor</p>
                    </div>
                  ) : (
                    blockedJobsList.map(({ job, message }) => (
                      <div key={job.id} className="p-4 bg-red-950/10 border border-red-900/30 rounded-2xl flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start">
                            <span className="font-black text-xs text-red-400 uppercase tracking-widest leading-none">
                              {job.jobNumber ? `JOB #${job.jobNumber}` : 'Blocked Job'}
                            </span>
                          </div>
                          <h4 className="font-bold text-xs text-white truncate mt-1.5">{job.title || 'Untitled Job'}</h4>
                          <p className="text-[10px] text-zinc-500 font-semibold truncate leading-tight mt-0.5">{job.year} {job.make} {job.model}</p>
                        </div>
                        <div className="mt-3 pt-2 border-t border-red-900/20 text-[10px] font-bold text-red-400 bg-red-500/5 -mx-4 -mb-4 p-2.5 rounded-b-2xl">
                          Issue: {message}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Bottom Panel: Parts Awaiting */}
              <div className="bg-zinc-900/30 border border-zinc-850 rounded-[2rem] p-6 flex flex-col flex-1 min-h-0 overflow-hidden shadow-inner">
                <div className="flex items-center gap-3 mb-4 shrink-0">
                  <div className="p-2.5 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                    <ShoppingCart className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black tracking-tight text-white uppercase">AWAITING PARTS</h2>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Parts requests pending or ordered</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 no-scrollbar space-y-2 min-h-0">
                  {activePartsList.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600 bg-zinc-900/20 rounded-2xl border border-zinc-850 border-dashed">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mb-2" />
                      <span className="font-bold text-xs uppercase tracking-widest">Inventory Stacked</span>
                      <p className="text-[10px] text-zinc-600 font-semibold mt-1">No active parts requests pending</p>
                    </div>
                  ) : (
                    activePartsList.map(({ pr, job }) => (
                      <div key={pr.id} className="p-3 bg-zinc-900/60 border border-zinc-850 rounded-xl flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-xs text-white truncate block">
                            {pr.partNumber || pr.description || 'Unknown Part'}
                          </span>
                          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider truncate block mt-0.5">
                            {job?.jobNumber ? `JOB #${job.jobNumber}` : 'Inventory Stock'} • {job?.year} {job?.make} {job?.model}
                          </span>
                        </div>
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-[4px] border shrink-0",
                          pr.status === 'ordered' 
                            ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" 
                            : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                        )}>
                          {pr.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Standup Daily Crew Tasks */}
              {staffStandupTasks.length > 0 && (
                <div className="bg-zinc-900/30 border border-zinc-850 rounded-[2rem] p-6 flex flex-col max-h-[250px] shrink-0 overflow-hidden shadow-inner">
                  <div className="flex items-center gap-3 mb-4 shrink-0">
                    <div className="p-2.5 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                      <Users className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black tracking-tight text-white uppercase">CREW DAILY FOCUS</h2>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Morning standup targets</p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1 no-scrollbar space-y-3 min-h-0">
                    {staffStandupTasks.map(({ id, name, tags }) => (
                      <div key={id} className="space-y-1">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">{name}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((tag: any) => (
                            <div 
                              key={tag.id} 
                              className={cn(
                                "text-[10px] px-2 py-1 rounded-lg border font-semibold flex items-center gap-1.5 transition-all duration-300",
                                tag.completed 
                                  ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-400 line-through" 
                                  : "bg-zinc-900/80 border-zinc-800 text-zinc-300"
                              )}
                            >
                              <div className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                tag.completed ? "bg-emerald-500" : "bg-zinc-650"
                              )} />
                              {tag.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </section>

          </div>
        </>
      )}
    </div>
  );
}
