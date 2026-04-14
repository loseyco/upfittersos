import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Clock, Coffee, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export function GlobalTimeTracker() {
    const { currentUser, tenantId } = useAuth();
    const [activeLog, setActiveLog] = useState<any>(null);
    const [activeTaskLog, setActiveTaskLog] = useState<any>(null);
    const [elapsedTime, setElapsedTime] = useState<string>('00:00:00');
    const [elapsedTaskTime, setElapsedTaskTime] = useState<string | null>(null);
    const [elapsedBreakTime, setElapsedBreakTime] = useState<string | null>(null);
    
    // Subscribe to primary Time Logs
    useEffect(() => {
        if (!currentUser || !tenantId || tenantId === 'GLOBAL' || tenantId === 'unassigned') {
            setActiveLog(null);
            return;
        }

        const q = query(
            collection(db, 'businesses', tenantId, 'time_logs'),
            where('userId', '==', currentUser.uid),
            where('status', '==', 'open')
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            if (!snap.empty) {
                // Sort by clockIn ascending to grab the most recent if glitches occur, though there should only be one open log
                const docs = snap.docs.map(d => ({id: d.id, ...(d.data() as any)}));
                docs.sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime());
                setActiveLog(docs[0]);
            } else {
                setActiveLog(null);
            }
        });

        return () => unsubscribe();
    }, [currentUser, tenantId]);

    // Subscribe to secondary Task Time Logs
    useEffect(() => {
        if (!currentUser || !tenantId || tenantId === 'GLOBAL' || tenantId === 'unassigned') {
            setActiveTaskLog(null);
            return;
        }

        const q = query(
            collection(db, 'businesses', tenantId, 'task_time_logs'),
            where('userId', '==', currentUser.uid),
            where('status', '==', 'open')
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            if (!snap.empty) {
                const docs = snap.docs.map(d => ({id: d.id, ...(d.data() as any)}));
                docs.sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime());
                setActiveTaskLog(docs[0]);
            } else {
                setActiveTaskLog(null);
            }
        });

        return () => unsubscribe();
    }, [currentUser, tenantId]);


    // Realtime Tick Logic
    useEffect(() => {
        if (!activeLog) {
            setElapsedBreakTime(null);
            return;
        }
        
        const updateTimer = () => {
            const now = new Date().getTime();
            
            // Primary Shift Time Calculation
            const start = new Date(activeLog.clockIn).getTime();
            let totalMs = now - start;
            
            let currentBreakMs = 0;
            let isActivelyOnBreak = false;
            
            if (activeLog.breaks && Array.isArray(activeLog.breaks)) {
                activeLog.breaks.forEach((b: any) => {
                    const bStart = new Date(b.start).getTime();
                    const bEnd = b.end ? new Date(b.end).getTime() : now;
                    totalMs -= (bEnd - bStart);
                    
                    if (!b.end) {
                        currentBreakMs = now - bStart;
                        isActivelyOnBreak = true;
                    }
                });
            }
            
            const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
            const hrs = Math.floor(totalSeconds / 3600);
            const mins = Math.floor((totalSeconds % 3600) / 60);
            const secs = totalSeconds % 60;
            setElapsedTime(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);

            if (isActivelyOnBreak) {
                const breakSecs = Math.max(0, Math.floor(currentBreakMs / 1000));
                const bHrs = Math.floor(breakSecs / 3600);
                const bMins = Math.floor((breakSecs % 3600) / 60);
                const bSecs = breakSecs % 60;
                setElapsedBreakTime(`${bHrs.toString().padStart(2, '0')}:${bMins.toString().padStart(2, '0')}:${bSecs.toString().padStart(2, '0')}`);
            } else {
                setElapsedBreakTime(null);
            }

            // Active Task Clock Calculation
            if (activeTaskLog && activeTaskLog.clockIn && !activeTaskLog.clockOut) {
                const taskStart = new Date(activeTaskLog.clockIn).getTime();
                let taskTotalMs = now - taskStart;
                
                // Account for paused states if any generic break blocks were applied globally
                if (activeTaskLog.breaks && Array.isArray(activeTaskLog.breaks)) {
                    activeTaskLog.breaks.forEach((b: any) => {
                        const bStart = new Date(b.start).getTime();
                        const bEnd = b.end ? new Date(b.end).getTime() : now;
                        taskTotalMs -= (bEnd - bStart);
                    });
                }

                const taskDiff = Math.max(0, taskTotalMs);
                const tHrs = Math.floor(taskDiff / 3600000);
                const tMins = Math.floor((taskDiff % 3600000) / 60000);
                const tSecs = Math.floor((taskDiff % 60000) / 1000);
                setElapsedTaskTime(`${tHrs.toString().padStart(2, '0')}:${tMins.toString().padStart(2, '0')}:${tSecs.toString().padStart(2, '0')}`);
            } else {
                setElapsedTaskTime(null);
            }
        };
        
        updateTimer(); // initial tick
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [activeLog, activeTaskLog]);

    if (!currentUser || !tenantId || tenantId === 'GLOBAL' || tenantId === 'unassigned') {
        return null;
    }

    if (!activeLog) {
        return (
            <div className="w-full h-12 flex items-center justify-between px-4 sm:px-6 font-bold text-sm shadow-sm sticky top-0 z-[45] backdrop-blur-md transition-colors bg-red-500/20 text-red-500 border-b border-red-500/30">
                <div className="flex items-center gap-2 sm:gap-6 w-full max-w-[80%]">
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <Clock className="w-4 h-4" />
                        <div className="flex items-center gap-2">
                            <span className="leading-none mt-0.5 uppercase tracking-wider font-black">Currently Clocked Out</span>
                        </div>
                    </div>
                    
                    <div className="hidden md:flex items-center gap-3 shrink-0 pl-6 border-l border-red-500/30 text-red-400">
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                            Reminder: Active assignments will not be logged until you clock in.
                        </span>
                    </div>
                </div>
                
                <Link 
                    to="/business/time" 
                    className="px-4 py-1.5 rounded-md flex items-center gap-2 transition-colors shadow-lg text-xs bg-red-500 hover:bg-red-600 text-white border-b-2 border-red-700 active:border-b-0 active:translate-y-[2px]"
                >
                    <Play className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline font-black uppercase tracking-wider">Clock In Now</span>
                </Link>
            </div>
        );
    }

    const onBreak = activeLog.breaks?.length > 0 && !activeLog.breaks[activeLog.breaks.length - 1].end;

    return (
        <div className={`w-full h-12 flex items-center justify-between px-4 sm:px-6 font-bold text-sm shadow-sm sticky top-0 z-[45] backdrop-blur-md transition-colors ${onBreak ? 'bg-amber-500/20 text-amber-500 border-b border-amber-500/30' : 'bg-emerald-500/20 text-emerald-500 border-b border-emerald-500/30'}`}>
            <div className="flex items-center gap-2 sm:gap-6 w-full max-w-[80%]">
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {onBreak ? <Coffee className="w-4 h-4 animate-pulse" /> : <Play className="w-4 h-4 animate-pulse" />}
                    <div className="flex items-center gap-2">
                        <span className="hidden leading-none sm:inline mt-0.5">{onBreak ? 'ON BREAK:' : 'ACTIVE SHIFT:'}</span>
                        <span className="font-mono text-base tracking-widest">{onBreak && elapsedBreakTime ? elapsedBreakTime : elapsedTime}</span>
                    </div>
                </div>

                {!onBreak && elapsedTaskTime && activeTaskLog && (
                    <div className="hidden md:flex items-center gap-3 shrink-0 pl-6 border-l border-emerald-500/30 text-emerald-400">
                        <span className="hidden lg:inline uppercase text-[10px] tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 truncate max-w-[200px]" title={activeTaskLog.taskName}>
                            {activeTaskLog.taskName}
                        </span>
                        <span className="font-mono tracking-widest text-emerald-300">{elapsedTaskTime}</span>
                    </div>
                )}
            </div>
            
            <Link 
                to="/business/time" 
                className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors border shadow-sm text-xs ${onBreak ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600' : 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600'}`}
            >
                <Clock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Manage Time</span>
            </Link>
        </div>
    );
}
