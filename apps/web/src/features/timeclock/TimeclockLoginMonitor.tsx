import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, limit, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Maximize, Minimize, QrCode, User, Coffee, Briefcase, Activity, Power, ArrowLeft } from 'lucide-react';
import _QRCode from 'react-qr-code';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const QRCode = (_QRCode as any).default || _QRCode;

interface TimeSession {
  id: string;
  userId: string;
  userName?: string;
  clockIn: { timestamp: any; location?: string; onSite?: boolean; };
  clockOut?: { timestamp: any; location?: string; onSite?: boolean; };
  breaks: Array<{ type: 'lunch' | 'normal'; start: any; end?: any; isPaid: boolean; }>;
  jobs?: Array<{ id: string; name: string; start: any; end?: any; }>;
  status: string;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  departmentId?: string;
  userId?: string;
  isArchived?: boolean;
  fireDate?: any;
}

interface Department {
  id: string;
  name: string;
}

export function TimeclockLoginMonitor({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [businessName, setBusinessName] = useState('UPFITTERS OS');
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCode, setActiveCode] = useState<string>('');
  const ROTATION_INTERVAL = 15000; // 15 seconds
  const [msLeft, setMsLeft] = useState(ROTATION_INTERVAL);

  // Live clock updates every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle automatic QR code token rotation every 15 seconds
  useEffect(() => {
    if (!tenantId) return;

    let lastRotation = Date.now();
    
    const generateNewToken = async () => {
      // Generate a highly secure random 10-char token
      const newCode = Math.random().toString(36).substring(2, 12).toUpperCase();
      setActiveCode(newCode);
      try {
        const tokenRef = doc(db, `businesses/${tenantId}/timeclock_token`, 'active');
        await setDoc(tokenRef, {
          code: newCode,
          updatedAt: serverTimestamp()
        });
      } catch (e) {
        console.error("Failed to write rotating timeclock token:", e);
      }
    };

    // Generate initial token
    generateNewToken();

    const timer = setInterval(() => {
      const elapsed = Date.now() - lastRotation;
      const remaining = Math.max(0, ROTATION_INTERVAL - elapsed);
      
      if (remaining <= 0) {
        lastRotation = Date.now();
        generateNewToken();
        setMsLeft(ROTATION_INTERVAL);
      } else {
        setMsLeft(remaining);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [tenantId]);

  // Fetch static data (staff, departments, business name)
  useEffect(() => {
    if (!tenantId) return;

    // Get Business Name
    getDoc(doc(db, 'businesses', tenantId)).then(snap => {
      if (snap.exists()) setBusinessName(snap.data().name || 'UPFITTERS OS');
    });

    // Get Staff and Departments
    const loadStaticData = async () => {
      try {
        const staffSnap = await getDocs(query(collection(db, `businesses/${tenantId}/staff`)));
        const deptSnap = await getDocs(query(collection(db, `businesses/${tenantId}/departments`)));
        
        const allStaff = staffSnap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember));
        const activeStaff = allStaff.filter(s => !s.isArchived && !s.fireDate && s.departmentId);
        
        setStaff(activeStaff);
        setDepartments(deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
      } catch (err) {
        console.error("Error loading staff or departments:", err);
      }
    };

    loadStaticData();
  }, [tenantId]);

  // Real-time listener for today's timeclock sessions
  useEffect(() => {
    if (!tenantId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      orderBy('clockIn.timestamp', 'desc'),
      limit(200)
    );

    const unsub = onSnapshot(q, (snap) => {
      const allSessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeSession));
      const todaySessions = allSessions.filter(s => {
        if (!s.clockIn?.timestamp) return false;
        const date = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
        return date >= today || s.status !== 'completed';
      });
      setSessions(todaySessions);
      setLoading(false);
    }, (err) => {
      console.error("Firestore error in Timeclock Monitor sessions:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [tenantId]);

  // Fullscreen toggle logic
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
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

  const formatSafeDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getSessionDurations = (session: TimeSession) => {
    const clockInMs = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate().getTime() : new Date(session.clockIn.timestamp).getTime();
    const clockOutMs = session.clockOut?.timestamp 
      ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate().getTime() : new Date(session.clockOut.timestamp).getTime())
      : now;
    
    const grossMs = Math.max(0, clockOutMs - clockInMs);
    
    // Subtract all completed breaks
    const completedBreakMs = session.breaks?.reduce((acc: number, b: any) => {
      if (!b.start || !b.end) return acc;
      const start = b.start.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
      const end = b.end.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime();
      return acc + (end - start);
    }, 0) || 0;

    const netWorkMs = Math.max(0, grossMs - completedBreakMs);

    // Calculate current break timer if active
    let currentBreakMs = 0;
    if (session.status === 'on_break') {
      const lastBreak = session.breaks?.[session.breaks.length - 1];
      if (lastBreak && !lastBreak.end && lastBreak.start) {
        const start = lastBreak.start.toDate ? lastBreak.start.toDate().getTime() : new Date(lastBreak.start).getTime();
        currentBreakMs = Math.max(0, now - start);
      }
    }

    return {
      workTimeStr: formatSafeDuration(netWorkMs),
      breakTimeStr: formatSafeDuration(completedBreakMs + currentBreakMs),
      currentBreakStr: currentBreakMs > 0 ? formatSafeDuration(currentBreakMs) : null
    };
  };

  // Group staff into categories
  const activeSessions = sessions.filter(s => s.status !== 'completed');
  const completedSessions = sessions.filter(s => s.status === 'completed');

  // Staff currently Clocked In (status: 'active' or 'on_break')
  const clockedInList = activeSessions.filter(s => s.status === 'active');
  const onBreakList = activeSessions.filter(s => s.status === 'on_break');

  // Staff currently Offline/Ready or Clocked Out today
  const clockedInUserIds = activeSessions.map(s => s.userId);
  const completedUserIds = completedSessions.map(s => s.userId);

  // Staff that are off-duty (haven't clocked in at all today)
  const offDutyList = staff.filter(st => {
    const uId = st.userId || st.id;
    return !clockedInUserIds.includes(uId) && !completedUserIds.includes(uId);
  });

  const qrUrl = activeCode 
    ? `${window.location.origin}/business/${tenantId}/time_details?qr_code=${activeCode}` 
    : `${window.location.origin}/business/${tenantId}/time_details`;

  // Live Stats
  const totalOnClock = activeSessions.length;
  const totalWorking = clockedInList.length;
  const totalOnBreak = onBreakList.length;
  const totalCompleted = completedSessions.length;

  // Calculate percentage of rotation remaining (for smooth indicator ring)
  const rotationPercentage = (msLeft / ROTATION_INTERVAL) * 100;
  const secondsLeft = Math.ceil(msLeft / 1000);

  return (
    <div 
      ref={containerRef}
      className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans relative overflow-hidden select-none"
    >
      {/* Background Ambience */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[50%] bg-indigo-500/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[60%] bg-emerald-500/5 rounded-full blur-[180px] pointer-events-none" />

      {/* Header Bar */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-zinc-900 bg-zinc-950/70 backdrop-blur-md relative z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(`/business/${tenantId}/overview`)}
            className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors group"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-black tracking-[0.25em] text-indigo-400 uppercase">Live Station</span>
              <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                <span className="text-[9px] font-black tracking-widest text-emerald-500 uppercase">Online</span>
              </div>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase mt-0.5">{businessName}</h1>
          </div>
        </div>

        {/* Large Digital Clock & Date */}
        <div className="flex flex-col items-end">
          <span className="text-3xl font-mono font-black tracking-widest text-white leading-none tabular-nums">
            {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="text-xs font-extrabold uppercase tracking-[0.15em] text-zinc-500 mt-1.5">
            {new Date(now).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>

        <button 
          onClick={toggleFullscreen}
          className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg transition-all flex items-center gap-2 active:scale-95"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
        </button>
      </header>

      {/* Main Grid View */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 p-8 min-h-0 relative z-10 overflow-hidden">
        {/* Left Hand Column: Scan to Clock In (QR) */}
        <section className="lg:col-span-5 flex flex-col gap-6 min-h-0 overflow-y-auto no-scrollbar">
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-[2.5rem] p-10 flex flex-col items-center justify-center flex-1 shadow-2xl backdrop-blur-md relative overflow-hidden group">
            {/* Glowing Backdrop behind QR */}
            <div className="absolute w-[240px] h-[240px] bg-indigo-500/10 rounded-full blur-[50px] group-hover:bg-indigo-500/15 transition-all duration-700 pointer-events-none" />

            {/* Circular Authenticator-style Countdown Ring */}
            <div className="relative w-20 h-20 flex items-center justify-center mb-6 shrink-0 bg-zinc-900/80 border border-zinc-850 rounded-[1.5rem] shadow-inner">
              <svg className="w-20 h-20 transform -rotate-90 absolute">
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  stroke="#18181b"
                  strokeWidth="4"
                  fill="transparent"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  stroke="url(#indigo-grad)"
                  strokeWidth="4"
                  fill="transparent"
                  strokeDasharray="213.6"
                  strokeDashoffset={213.6 - (213.6 * rotationPercentage) / 100}
                  className="transition-all duration-100 ease-linear"
                  style={{ strokeLinecap: 'round' }}
                />
                <defs>
                  <linearGradient id="indigo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </svg>
              <QrCode className="w-8 h-8 text-indigo-400 relative z-10" />
            </div>

            <h2 className="text-3xl font-black tracking-tight text-center text-white leading-tight">
              SCAN TO CLOCK IN / OUT
            </h2>
            
            {/* Security Indicator */}
            <div className="mt-3 flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-1.5 rounded-xl">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-ping" />
              <span className="text-[10px] font-black tracking-widest text-indigo-400 uppercase">
                Secured Token Rotates In {secondsLeft}s
              </span>
            </div>

            {/* QR Code Container */}
            <div className="mt-8 shrink-0 bg-white p-7 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.4)] border border-zinc-700/30 relative">
              <QRCode value={qrUrl} size={220} />
            </div>

            {/* Instruction Steps */}
            <div className="mt-10 w-full max-w-sm space-y-4">
              <div className="flex gap-4 items-center bg-zinc-900/30 p-3 rounded-2xl border border-zinc-900/60">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-black text-indigo-400 text-xs shrink-0">
                  1
                </div>
                <p className="text-xs font-bold text-zinc-300">Open your Phone Camera & scan the code.</p>
              </div>
              <div className="flex gap-4 items-center bg-zinc-900/30 p-3 rounded-2xl border border-zinc-900/60">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-black text-indigo-400 text-xs shrink-0">
                  2
                </div>
                <p className="text-xs font-bold text-zinc-300">Log in securely with your credentials.</p>
              </div>
              <div className="flex gap-4 items-center bg-zinc-900/30 p-3 rounded-2xl border border-zinc-900/60">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-black text-indigo-400 text-xs shrink-0">
                  3
                </div>
                <p className="text-xs font-bold text-zinc-300">Tap Clock In / Break / Out in the top bar.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Hand Column: Live Status Roster */}
        <section className="lg:col-span-7 flex flex-col min-h-0">
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-[2.5rem] p-8 flex flex-col flex-1 shadow-2xl backdrop-blur-md min-h-0">
            
            {/* Sub-header */}
            <div className="flex items-center justify-between mb-6 shrink-0">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-indigo-500" />
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Today's Staff Status</h2>
              </div>
              <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800 text-[10px] font-bold tracking-widest text-zinc-400 uppercase">
                Active Count: <span className="text-indigo-400 font-extrabold ml-1">{totalOnClock}</span>
              </div>
            </div>

            {/* List Containers - scrollable */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-8 pr-1 min-h-0">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center py-20 text-zinc-500">
                  <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                  <span className="text-xs font-black uppercase tracking-wider">Syncing Live Status Board...</span>
                </div>
              ) : (
                <>
                  {/* CATEGORY 1: ACTIVE WORKING STAFF */}
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_6px_#10b981]" />
                      Clocked In & Working ({clockedInList.length})
                    </h3>
                    
                    {clockedInList.length === 0 ? (
                      <p className="text-zinc-600 text-xs font-bold italic bg-zinc-950/20 p-4 rounded-2xl border border-zinc-900/50">
                        No one is currently clocked into a shift.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <AnimatePresence mode="popLayout">
                          {clockedInList.map(session => {
                            const { workTimeStr } = getSessionDurations(session);
                            const staffMember = staff.find(s => s.userId === session.userId || s.id === session.userId);
                            const dept = departments.find(d => d.id === staffMember?.departmentId);
                            const activeJob = session.jobs?.find(j => !j.end);

                            return (
                              <motion.div 
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                key={session.id}
                                className="bg-zinc-900/90 border-2 border-emerald-500/30 hover:border-emerald-500/50 rounded-2xl p-4 shadow-lg shadow-emerald-950/10 flex items-center justify-between gap-4 transition-all duration-300 relative overflow-hidden group"
                              >
                                {/* Glowing ambient top edge */}
                                <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-emerald-500/0 via-emerald-500/20 to-emerald-500/0" />

                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-black text-emerald-400 shrink-0 text-sm">
                                    {(session.userName || 'U')[0].toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="font-bold text-white text-sm truncate">{session.userName}</h4>
                                    <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider mt-0.5">
                                      {dept?.name || 'Upfitting'}
                                    </p>
                                    
                                    {/* Active Job task indicator if present */}
                                    {activeJob && (
                                      <div className="mt-1.5 flex items-center gap-1.5 text-[9px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/10 px-2 py-0.5 rounded-md w-fit truncate">
                                        <Briefcase className="w-2.5 h-2.5" />
                                        <span className="truncate uppercase tracking-wider">{activeJob.name}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 leading-none">Shift Time</span>
                                  <p className="font-mono font-black text-base text-emerald-400 leading-none mt-1 tabular-nums animate-pulse">
                                    {workTimeStr}
                                  </p>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  {/* CATEGORY 2: STAFF ON BREAK / LUNCH */}
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shadow-[0_0_6px_#f59e0b]" />
                      On Break or Lunch ({onBreakList.length})
                    </h3>

                    {onBreakList.length === 0 ? (
                      <p className="text-zinc-600 text-xs font-bold italic bg-zinc-950/20 p-4 rounded-2xl border border-zinc-900/50">
                        No one is currently on break.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <AnimatePresence mode="popLayout">
                          {onBreakList.map(session => {
                            const { currentBreakStr, workTimeStr } = getSessionDurations(session);
                            const staffMember = staff.find(s => s.userId === session.userId || s.id === session.userId);
                            const dept = departments.find(d => d.id === staffMember?.departmentId);
                            const lastBreak = session.breaks?.[session.breaks.length - 1];
                            const breakType = lastBreak?.type === 'lunch' ? 'Lunch' : 'Break';

                            return (
                              <motion.div 
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                key={session.id}
                                className="bg-zinc-900/90 border-2 border-amber-500/30 hover:border-amber-500/50 rounded-2xl p-4 shadow-lg shadow-amber-950/10 flex items-center justify-between gap-4 transition-all duration-300 relative overflow-hidden group"
                              >
                                {/* Glowing ambient top edge */}
                                <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-amber-500/0 via-amber-500/20 to-amber-500/0" />

                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-black text-amber-400 shrink-0 text-sm">
                                    <Coffee className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="font-bold text-white text-sm truncate">{session.userName}</h4>
                                    <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider mt-0.5">
                                      {dept?.name || 'Upfitting'}
                                    </p>
                                    <div className="mt-1.5 flex items-center gap-1 text-[8px] font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md w-fit uppercase tracking-widest">
                                      {breakType}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 leading-none">Break Time</span>
                                  <p className="font-mono font-black text-base text-amber-400 leading-none mt-1 tabular-nums">
                                    {currentBreakStr || '00:00:00'}
                                  </p>
                                  <span className="text-[9px] font-bold text-zinc-500 block mt-1.5">
                                    Worked: {workTimeStr}
                                  </span>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  {/* CATEGORY 3: CLOCKED OUT / COMPLETED SHIFT TODAY */}
                  {completedSessions.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
                        Shift Complete ({completedSessions.length})
                      </h3>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <AnimatePresence mode="popLayout">
                          {completedSessions.map(session => {
                            const { workTimeStr } = getSessionDurations(session);
                            const staffMember = staff.find(s => s.userId === session.userId || s.id === session.userId);
                            const dept = departments.find(d => d.id === staffMember?.departmentId);

                            return (
                              <motion.div 
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                key={session.id}
                                className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all opacity-60"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-10 h-10 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-center font-black text-zinc-500 shrink-0 text-sm">
                                    <Power className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="font-bold text-zinc-300 text-sm truncate">{session.userName}</h4>
                                    <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider mt-0.5">
                                      {dept?.name || 'Upfitting'}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 leading-none">Total Logged</span>
                                  <p className="font-mono font-black text-sm text-zinc-400 leading-none mt-1">
                                    {workTimeStr}
                                  </p>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 4: OFF-DUTY (YET TO ARRIVE) */}
                  {offDutyList.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 border border-zinc-600 rounded-full" />
                        Off-Duty / Ready ({offDutyList.length})
                      </h3>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <AnimatePresence mode="popLayout">
                          {offDutyList.map(st => {
                            const dept = departments.find(d => d.id === st.departmentId);
                            const displayName = `${st.firstName} ${st.lastName}`;
                            
                            return (
                              <motion.div 
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 0.4 }}
                                exit={{ opacity: 0 }}
                                key={st.id}
                                className="bg-zinc-900/10 border border-zinc-900/80 rounded-xl p-3 flex items-center gap-2.5 min-w-0 hover:opacity-60 transition-opacity"
                              >
                                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800/80 flex items-center justify-center font-black text-zinc-600 shrink-0 text-xs">
                                  <User className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="font-semibold text-zinc-400 text-xs truncate leading-tight">{displayName}</h4>
                                  <p className="text-[8px] font-black uppercase text-zinc-600 tracking-wider leading-none mt-0.5 truncate">
                                    {dept?.name || 'Upfitting'}
                                  </p>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer Summary Banner */}
            <footer className="mt-6 pt-4 border-t border-zinc-900 flex justify-between items-center text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 shrink-0">
              <div className="flex gap-4">
                <span>Working: <span className="text-emerald-500">{totalWorking}</span></span>
                <span>Break: <span className="text-amber-500">{totalOnBreak}</span></span>
                <span>Completed: <span className="text-zinc-400">{totalCompleted}</span></span>
              </div>
              <span className="text-zinc-600">Upfitters OS • Timeclock Station</span>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
