import { useState, useEffect } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { useTimeclockStore } from '../../lib/store/timeclockStore';
import type { ClockStatus } from '../../lib/store/timeclockStore';
import { useQuery } from '@tanstack/react-query';
import { 
  collection, query, where, getDocs, addDoc, 
  updateDoc, doc, getDoc, serverTimestamp, 
  orderBy, limit 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Coffee, Pizza, LogIn, 
  Loader2, Play, Pause, Square, Activity, Power
} from 'lucide-react';
import { toast } from 'sonner';
import { calculateDistance, cn } from '../../lib/utils';

export function TimeClockBar() {
  const { user, tenantId, permissions } = useAuthStore();
  const { status, startTime, activeSessionId, setStatus, reset } = useTimeclockStore();
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch Business Settings for Timeclock config
  const { data: settings } = useQuery({
    queryKey: ['business-settings', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const snap = await getDoc(doc(db, 'businesses', tenantId));
      return snap.exists() ? snap.data() : null;
    },
    enabled: !!tenantId
  });

  // Fetch active session to track breaks for the live timer
  const { data: activeSession } = useQuery({
    queryKey: ['active-session', user?.uid, tenantId, activeSessionId],
    queryFn: async () => {
      if (!activeSessionId || !tenantId) return null;
      const snap = await getDoc(doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId));
      return snap.exists() ? { id: snap.id, ...snap.data() } as any : null;
    },
    enabled: !!activeSessionId && !!tenantId,
    refetchInterval: 30000 // Refresh every 30s to keep breaks in sync
  });

  // Sync state with Firestore on mount or if status is inconsistent
  useEffect(() => {
    const syncStatus = async () => {
      if (!user?.uid || !tenantId) return;
      
      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('userId', '==', user.uid),
        where('status', 'in', ['active', 'on_break']),
        orderBy('clockIn.timestamp', 'desc'),
        limit(1)
      );
      
      const snap = await getDocs(q);
      if (!snap.empty) {
        const session = snap.docs[0].data();
        const sessionId = snap.docs[0].id;
        
        let newStatus: ClockStatus = 'clocked_in';
        let newStartTime = session.clockIn.timestamp?.toMillis() || Date.now();
        
        if (session.status === 'on_break') {
          const lastBreak = session.breaks[session.breaks.length - 1];
          newStatus = lastBreak.type === 'lunch' ? 'on_lunch' : 'on_break';
          newStartTime = lastBreak.start?.toMillis() || Date.now();
        }
        
        setStatus(newStatus, newStartTime, sessionId);
      } else if (status !== 'clocked_out') {
        reset();
      }
    };

    syncStatus();
  }, [user?.uid, tenantId]);

  // Timer update
  useEffect(() => {
    let interval: any;
    if (status !== 'clocked_out' && startTime) {
      interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status, startTime]);

  if (!settings?.timeclockEnabled) return null;

  const calculateNetWorkMs = () => {
    if (!activeSession || !startTime) return 0;
    
    // Total time from clock-in to now
    const clockInTs = activeSession.clockIn.timestamp?.toMillis() || startTime;
    const totalGrossMs = currentTime - clockInTs;
    
    // Subtract all completed breaks
    const completedBreakMs = activeSession.breaks?.reduce((acc: number, b: any) => {
      if (!b.start || !b.end) return acc;
      const start = b.start.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
      const end = b.end.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime();
      return acc + (end - start);
    }, 0) || 0;

    return Math.max(0, totalGrossMs - completedBreakMs);
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const validateLocation = async (): Promise<{ lat: number; lng: number; onSite: boolean } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        toast.error("Geolocation not supported");
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        let onSite = true;

        if (settings?.siteLat && settings?.siteLng) {
          const dist = calculateDistance(
            latitude, longitude, 
            parseFloat(settings.siteLat), parseFloat(settings.siteLng)
          );
          onSite = dist <= (settings.siteRadius || 500);
        }

        if (!onSite && !settings?.allowOffsiteClockIn && !permissions['timeclock.offsite']) {
          toast.error("Clocking in off-site is not allowed for your account.");
          resolve(null);
          return;
        }

        resolve({ lat: latitude, lng: longitude, onSite });
      }, (err) => {
        toast.error("Failed to get location: " + err.message);
        resolve(null);
      });
    });
  };

  const handleClockIn = async () => {
    setIsProcessing(true);
    const loc = await validateLocation();
    if (!loc) {
      setIsProcessing(false);
      return;
    }

    try {
      const docRef = await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
        userId: user!.uid,
        userName: user!.displayName || user!.email,
        clockIn: {
          timestamp: serverTimestamp(),
          ...loc
        },
        isRemote: !loc.onSite,
        status: 'active',
        breaks: [],
        createdAt: serverTimestamp()
      });

      setStatus('clocked_in', Date.now(), docRef.id);
      toast.success("Clocked in successfully");
    } catch (e) {
      toast.error("Failed to clock in");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeSessionId) return;
    setIsProcessing(true);
    const loc = await validateLocation();
    if (!loc) {
      setIsProcessing(false);
      return;
    }

    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();

      // If currently on break, end it first
      const breaks = [...(sessionData?.breaks || [])];
      if (status === 'on_lunch' || status === 'on_break') {
        const lastBreak = breaks[breaks.length - 1];
        if (!lastBreak.end) {
          lastBreak.end = new Date();
        }
      }

      await updateDoc(sessionRef, {
        clockOut: {
          timestamp: serverTimestamp(),
          ...loc
        },
        status: 'completed',
        breaks,
        updatedAt: serverTimestamp()
      });

      reset();
      toast.success("Clocked out successfully");
    } catch (e) {
      toast.error("Failed to clock out");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartBreak = async (type: 'lunch' | 'normal') => {
    if (!activeSessionId) return;
    setIsProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId);
      const sessionSnap = await getDoc(sessionRef);
      const breaks = [...(sessionSnap.data()?.breaks || [])];
      
      breaks.push({
        type,
        start: new Date(),
        isPaid: !!(type === 'lunch' ? settings?.lunchPaid : settings?.breakPaid)
      });

      await updateDoc(sessionRef, {
        breaks,
        status: 'on_break',
        updatedAt: serverTimestamp()
      });

      setStatus(type === 'lunch' ? 'on_lunch' : 'on_break', Date.now(), activeSessionId);
      toast.info(`Started ${type} break`);
    } catch (e) {
      console.error("Failed to start break:", e);
      toast.error("Failed to start break. Check console for details.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEndBreak = async () => {
    if (!activeSessionId) return;
    setIsProcessing(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();
      const breaks = [...(sessionData?.breaks || [])];
      
      if (breaks.length > 0) {
        breaks[breaks.length - 1].end = new Date();
      }

      await updateDoc(sessionRef, {
        breaks,
        status: 'active',
        updatedAt: serverTimestamp()
      });

      // Resume main clock - we need the original clock in time
      const originalClockIn = sessionData?.clockIn?.timestamp?.toMillis() || Date.now();
      setStatus('clocked_in', originalClockIn, activeSessionId);
      toast.success("Break ended");
    } catch (e) {
      toast.error("Failed to end break");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-3 sm:px-6 py-2 flex items-center justify-between gap-2 sm:gap-4 shadow-sm animate-in slide-in-from-top duration-500 z-40 overflow-x-auto no-scrollbar">
      {/* Left: Status */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div 
          className={cn(
            "p-2 rounded-lg transition-colors",
            status === 'clocked_out' ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400" : 
            status === 'clocked_in' ? "bg-emerald-500/10 text-emerald-500" :
            "bg-amber-500/10 text-amber-500"
          )}
          title={`Status: ${status.replace('_', ' ')}`}
        >
          {status === 'clocked_out' && <Power className="w-4 h-4" />}
          {status === 'clocked_in' && <Activity className="w-4 h-4" />}
          {(status === 'on_lunch' || status === 'on_break') && <Pause className="w-4 h-4" />}
        </div>
        <div className="hidden min-[400px]:block">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">Time Clock</p>
          <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white capitalize whitespace-nowrap">
            {status.replace('_', ' ')}
          </p>
        </div>
      </div>

      {/* Center: Actions */}
      <div className="flex items-center justify-center gap-1.5 sm:gap-3 flex-1 min-w-0">
        {isProcessing ? (
          <div className="flex items-center gap-2 px-4 py-2 text-zinc-400 text-sm font-bold">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="hidden sm:inline">Processing...</span>
          </div>
        ) : (
          <>
            {status === 'clocked_out' ? (
              <button 
                onClick={handleClockIn}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-lg shadow-emerald-500/20 active:scale-95 whitespace-nowrap"
              >
                <LogIn className="w-4 h-4" /> Clock In
              </button>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {status === 'clocked_in' ? (
                  <>
                    <button 
                      onClick={() => handleStartBreak('lunch')}
                      className="p-2 sm:px-4 sm:py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2"
                      title="Lunch"
                    >
                      <Pizza className="w-4 h-4" /> <span className="hidden sm:inline">Lunch</span>
                    </button>
                    <button 
                      onClick={() => handleStartBreak('normal')}
                      className="p-2 sm:px-4 sm:py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2"
                      title="Break"
                    >
                      <Coffee className="w-4 h-4" /> <span className="hidden sm:inline">Break</span>
                    </button>
                    <button 
                      onClick={handleClockOut}
                      className="p-2 sm:px-4 sm:py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all shadow-lg shadow-rose-500/20 active:scale-95 flex items-center gap-2"
                      title="Clock Out"
                    >
                      <Square className="w-4 h-4" /> <span className="hidden sm:inline">Out</span>
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={handleEndBreak}
                    className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                  >
                    <Play className="w-4 h-4" /> Resume Work
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: Timer */}
      {status !== 'clocked_out' && startTime && (
        <div className="flex items-center gap-4 pl-3 sm:pl-6 border-l border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1 hidden sm:block">
              {status === 'clocked_in' ? 'Work Timer' : `${status.replace('on_', '').toUpperCase()} TIMER`}
            </span>
            <span className={cn(
              "text-sm sm:text-xl font-mono font-black tabular-nums",
              status === 'clocked_in' ? "text-indigo-600 dark:text-indigo-400" : "text-amber-500"
            )}>
              {status === 'clocked_in' 
                ? formatDuration(calculateNetWorkMs()) 
                : formatDuration(Math.max(0, currentTime - startTime))
              }
            </span>
            {status !== 'clocked_in' && (
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter mt-0.5">
                Total: {formatDuration(calculateNetWorkMs())}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
