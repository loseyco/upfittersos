import { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Clock } from 'lucide-react';

const ShiftTicker = ({ startMs, offsetMs = 0, style }: { startMs: number, offsetMs?: number, style?: string }) => {
    const [t, setT] = useState('00:00:00');
    useEffect(() => {
        const tick = () => {
            const secs = Math.floor(Math.max(0, Date.now() - startMs - offsetMs) / 1000);
            const hrs = Math.floor(secs / 3600);
            const mins = Math.floor((secs % 3600) / 60);
            const s = secs % 60;
            if (hrs > 0) {
                setT(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            } else {
                setT(`${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            }
        };
        tick();
        const int = setInterval(tick, 1000);
        return () => clearInterval(int);
    }, [startMs, offsetMs]);
    return <span className={style}>{t}</span>;
};

export function StaffDayTimeline({ tenantId, allStaff }: { tenantId: string, allStaff: any[] }) {
    const [timeLogs, setTimeLogs] = useState<any[]>([]);
    const [taskLogs, setTaskLogs] = useState<any[]>([]);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;

        const _now = new Date();
        const startOfTodayStr = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate()).toISOString();

        // Querying logs for today. We check for logs that have clockIn >= start of today, or perhaps are 'open'.
        // To be safe, we fetch active logs by 'open' status for sure, but also we can fetch based on clockIn for today
        // Normally, a composite index might be needed if using multiple clauses.
        // Easiest is to fetch all time_logs and task_time_logs from this month or we can just fetch 'open' and recently closed if we don't have indexes.
        // Actually, let's grab all active, and also we can grab those closed today.
        // If indexing prevents >=, we can just fetch the open ones. Let's assume we can fetch by clockIn >= start of today.
        
        const qTime = query(
            collection(db, 'businesses', tenantId, 'time_logs'),
            where('clockIn', '>=', startOfTodayStr)
        );
        const unsubTime = onSnapshot(qTime, (snap) => {
            setTimeLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const qTask = query(
            collection(db, 'businesses', tenantId, 'task_time_logs'),
            where('clockIn', '>=', startOfTodayStr)
        );
        const unsubTask = onSnapshot(qTask, (snap) => {
            setTaskLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        
        // Also fetch any currently open logs just in case they started yesterday (overnight shift)
        const qTimeOpen = query(collection(db, 'businesses', tenantId, 'time_logs'), where('status', '==', 'open'));
        const unsubTimeOpen = onSnapshot(qTimeOpen, (snap) => {
            setTimeLogs(prev => {
                const map = new Map(prev.map(p => [p.id, p]));
                snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
                return Array.from(map.values());
            });
        });
        
        const qTaskOpen = query(collection(db, 'businesses', tenantId, 'task_time_logs'), where('status', '==', 'open'));
        const unsubTaskOpen = onSnapshot(qTaskOpen, (snap) => {
            setTaskLogs(prev => {
                const map = new Map(prev.map(p => [p.id, p]));
                snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
                return Array.from(map.values());
            });
        });

        return () => {
            unsubTime();
            unsubTask();
            unsubTimeOpen();
            unsubTaskOpen();
        };
    }, [tenantId]);

    // Timeline Configuration: 6:00 AM to 8:00 PM
    const startHour = 6;
    const endHour = 20; // 8:00 PM
    const totalHours = endHour - startHour;

    const timelineContextMs = useMemo(() => {
        const _now = new Date();
        const startOfDay = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate(), startHour, 0, 0, 0).getTime();
        const endOfDay = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate(), endHour, 0, 0, 0).getTime();
        return { startOfDay, endOfDay, totalMs: endOfDay - startOfDay };
    }, []);

    const getTimelinePercent = (timestampMs: number) => {
        let pct = ((timestampMs - timelineContextMs.startOfDay) / timelineContextMs.totalMs) * 100;
        return Math.max(0, Math.min(100, pct)); // Clamp between 0-100%
    };

    // Filter staff who have time logs today
    const activeStaffIds = useMemo(() => {
        const ids = new Set<string>();
        timeLogs.forEach(log => ids.add(log.userId));
        return Array.from(ids);
    }, [timeLogs]);

    const activeStaff = allStaff.filter(s => activeStaffIds.includes(s.uid));

    // Time Indicators
    const hourlyMarkers = Array.from({ length: totalHours + 1 }).map((_, i) => startHour + i);

    return (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-2 md:p-3 w-full relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-bl-full pointer-events-none -translate-y-1/2 translate-x-1/4 blur-3xl transition-opacity group-hover:opacity-100 opacity-50"></div>
            
            <div className="relative z-10">
                <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-[13px] md:text-sm text-zinc-100 font-bold flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-400" /> Crew Timeline
                    </h3>
                    <div className="flex gap-4 items-center">
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/40"></div><span className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest hidden sm:inline">Shift</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-amber-500/40 border border-amber-500/60"></div><span className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest hidden sm:inline">Break</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-indigo-500/40 border border-indigo-500/60"></div><span className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest hidden sm:inline">Jobs</span></div>
                    </div>
                </div>

                <div className="relative w-full">
                    
                    {/* Header: Hourly Ticks */}
                    <div className="flex w-full mb-2 ml-[120px] md:ml-[220px] pb-2 border-b border-zinc-800 relative hidden md:flex" style={{ width: `calc(100% - 220px)` }}>
                        {hourlyMarkers.map(hour => {
                            const date = new Date();
                            date.setHours(hour, 0, 0, 0);
                            const percent = getTimelinePercent(date.getTime());
                            if (percent < 0 || percent > 100) return null;

                            return (
                                <div key={hour} className="absolute flex flex-col items-center -translate-x-1/2" style={{ left: `${percent}%` }}>
                                    <span className="text-[9px] font-mono tracking-widest text-zinc-500">
                                        {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '')}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Timeline Data Tracks */}
                    <div className="space-y-3 relative">
                        {/* Background Vertical Guidelines */}
                        <div className="hidden md:block absolute inset-0 ml-[120px] md:ml-[220px] pointer-events-none" style={{ width: `calc(100% - 220px)` }}>
                            {hourlyMarkers.map(hour => {
                                const date = new Date();
                                date.setHours(hour, 0, 0, 0);
                                const percent = getTimelinePercent(date.getTime());
                                if (percent < 0 || percent > 100) return null;
                                return (
                                    <div key={hour} className="absolute top-0 bottom-0 border-l border-zinc-800/30" style={{ left: `${percent}%` }}></div>
                                );
                            })}
                            
                            {/* "Current Time" Indicator */}
                            {getTimelinePercent(Date.now()) >= 0 && getTimelinePercent(Date.now()) <= 100 && (
                                <div className="absolute top-0 bottom-0 border-l border-red-500/50 mix-blend-screen z-20" style={{ left: `${getTimelinePercent(Date.now())}%` }}>
                                    <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-red-400"></div>
                                </div>
                            )}
                        </div>

                        {activeStaff.length === 0 ? (
                            <div className="text-center py-6 text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30">
                                No activity recorded today.
                            </div>
                        ) : activeStaff.map(staff => {
                            // Find all logs for this staff
                            const staffShifts = timeLogs.filter(t => t.userId === staff.uid);
                            const staffTasks = taskLogs.filter(t => t.userId === staff.uid);

                            // Calculate tickers for current open shift
                            const openShift = staffShifts.find(t => t.status === 'open');
                            const openTask = staffTasks.find(t => t.status === 'open');
                            
                            let isBreak = false;
                            let breakStart = 0;
                            let totalBreaksMs = 0;
                            
                            if (openShift && openShift.breaks && Array.isArray(openShift.breaks)) {
                                openShift.breaks.forEach((b: any) => {
                                    const bStart = new Date(b.start).getTime();
                                    const bEnd = b.end ? new Date(b.end).getTime() : Date.now();
                                    totalBreaksMs += (bEnd - bStart);
                                    if (!b.end) {
                                        isBreak = true;
                                        breakStart = bStart;
                                    }
                                });
                            }
                            
                            let taskBreakOffsetMs = 0;
                            if (openTask && openTask.breaks && Array.isArray(openTask.breaks)) {
                                openTask.breaks.forEach((b: any, idx: number) => {
                                    const tbStart = new Date(b.start).getTime();
                                    let tbEndMs: number;
                                    if (b.end) {
                                        tbEndMs = new Date(b.end).getTime();
                                    } else {
                                        if (!isBreak) {
                                            const parentBreak = openShift?.breaks?.[idx];
                                            tbEndMs = (parentBreak && parentBreak.end) ? new Date(parentBreak.end).getTime() : tbStart;
                                        } else {
                                            tbEndMs = Date.now();
                                        }
                                    }
                                    taskBreakOffsetMs += (tbEndMs - tbStart);
                                });
                            }

                            return (
                                <div key={staff.uid} className="flex items-stretch w-full relative z-10 group">
                                    {/* Staff Profile Area */}
                                    <div className={`w-[120px] md:w-[220px] flex flex-col justify-center pr-4 shrink-0 transition-opacity ${openShift ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}>
                                        <div className="flex items-center gap-2 md:gap-3 mb-1">
                                            <div className={`w-8 h-8 md:w-10 md:h-10 rounded overflow-hidden shrink-0 bg-zinc-800 border-2 shadow-sm ${openShift ? (isBreak ? 'border-amber-500' : 'border-emerald-500') : 'border-zinc-700'}`}>
                                                {staff.photoURL ? <img src={staff.photoURL} alt="s" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-400">{staff.displayName?.substring(0,2).toUpperCase()}</div>}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className={`text-sm font-bold truncate ${openShift ? 'text-white' : 'text-zinc-400'}`}>{staff.displayName?.split(' ')[0]}</span>
                                                {openShift ? (
                                                    <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-widest leading-none mt-0.5">
                                                        <ShiftTicker startMs={new Date(openShift.clockIn).getTime()} offsetMs={totalBreaksMs} style="text-emerald-400/80" />
                                                        {openTask && !isBreak && (
                                                            <>
                                                                <span className="opacity-40 text-zinc-500">|</span>
                                                                <ShiftTicker startMs={new Date(openTask.clockIn).getTime()} offsetMs={taskBreakOffsetMs} style="font-black text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.3)]" />
                                                            </>
                                                        )}
                                                        {isBreak && (
                                                            <>
                                                                <span className="opacity-40 text-zinc-500">|</span>
                                                                <ShiftTicker startMs={breakStart} style="font-black text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]" />
                                                            </>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-0.5">Off Shift</span>
                                                )}
                                            </div>
                                        </div>
                                        {openShift && (
                                            <span className="text-[9px] font-black uppercase tracking-widest leading-none ml-[42px] md:ml-[52px] truncate opacity-70">
                                                {isBreak ? (
                                                    <span className="text-amber-500">On Break</span>
                                                ) : openTask ? (
                                                    <span className="text-indigo-400">{openTask.taskName}</span>
                                                ) : (
                                                    <span className="text-emerald-500">Idle / Unassigned</span>
                                                )}
                                            </span>
                                        )}
                                    </div>
                                    
                                    {/* Timeline Content Track */}
                                    <div className="hidden md:block flex-1 min-h-[36px] bg-zinc-950/30 rounded-lg relative overflow-hidden group/track cursor-default">
                                        {/* Shifts */}
                                        {staffShifts.map((shift, i) => {
                                            const startMs = new Date(shift.clockIn).getTime();
                                            const endMs = shift.clockOut ? new Date(shift.clockOut).getTime() : Date.now();
                                            const startPct = getTimelinePercent(startMs);
                                            const widthPct = getTimelinePercent(endMs) - startPct;
                                            
                                            if (startPct >= 100 || (startPct + widthPct) <= 0) return null;

                                            return (
                                                <div key={`shift-${i}`} className="absolute top-1 bottom-1 bg-emerald-500/10 border border-emerald-500/20 rounded z-0 overflow-hidden" style={{ left: `${startPct}%`, width: `${widthPct}%` }}>
                                                    {/* Breaks inside Shift */}
                                                    {shift.breaks?.map((brk: any, j: number) => {
                                                        const bStartMs = new Date(brk.start).getTime();
                                                        const bEndMs = brk.end ? new Date(brk.end).getTime() : Date.now();
                                                        const bStartPctRelative = ((bStartMs - startMs) / (endMs - startMs)) * 100;
                                                        const bWidthPctRelative = ((bEndMs - bStartMs) / (endMs - startMs)) * 100;
                                                        
                                                        return (
                                                            <div key={`break-${j}`} className="absolute top-0 bottom-0 bg-amber-500/60 z-20 hover:brightness-110 transition-all border-x border-amber-500/80 truncate px-1 text-[8px] font-black uppercase text-amber-950 flex items-center shadow-inner" style={{ left: `${bStartPctRelative}%`, width: `${bWidthPctRelative}%` }} title="On Break">
                                                                {bWidthPctRelative > 5 && 'BRK'}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })}

                                        {/* Tasks */}
                                        {(() => {
                                            // Sort tasks and group them into tracks (greedy coloring)
                                            const sortedTasks = [...staffTasks].sort((a, b) => new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime());
                                            const tracks: any[][] = [];

                                            sortedTasks.forEach(task => {
                                                const startMs = new Date(task.clockIn).getTime();
                                                
                                                let placed = false;
                                                for (let i = 0; i < tracks.length; i++) {
                                                    const trackTasks = tracks[i];
                                                    const lastTask = trackTasks[trackTasks.length - 1];
                                                    const lastEndMs = lastTask.clockOut ? new Date(lastTask.clockOut).getTime() : Date.now();
                                                    // Give a 1 second margin to avoid precise overlap bugs
                                                    if (lastEndMs <= startMs + 1000) {
                                                        trackTasks.push(task);
                                                        task._trackIndex = i;
                                                        placed = true;
                                                        break;
                                                    }
                                                }
                                                if (!placed) {
                                                    tracks.push([task]);
                                                    task._trackIndex = tracks.length - 1;
                                                }
                                            });

                                            const totalTracks = Math.max(1, tracks.length);
                                            const colors = [
                                                'bg-indigo-500/80 border-indigo-400',
                                                'bg-violet-500/80 border-violet-400',
                                                'bg-fuchsia-500/80 border-fuchsia-400',
                                                'bg-blue-500/80 border-blue-400',
                                            ];

                                            return sortedTasks.map((task, i) => {
                                                const startMs = new Date(task.clockIn).getTime();
                                                const endMs = task.clockOut ? new Date(task.clockOut).getTime() : Date.now();
                                                const startPct = getTimelinePercent(startMs);
                                                const widthPct = getTimelinePercent(endMs) - startPct;
                                                
                                                if (startPct >= 100 || (startPct + widthPct) <= 0) return null;

                                                const trackIndex = task._trackIndex || 0;
                                                const colorClass = colors[trackIndex % colors.length];
                                                
                                                // Calculate custom height/top to split the container visually
                                                const heightPct = 100 / totalTracks;
                                                const topPct = heightPct * trackIndex;

                                                return (
                                                    <div 
                                                        key={`task-${i}`} 
                                                        className={`absolute rounded z-10 truncate px-1 font-bold text-white shadow shadow-indigo-500/20 hover:brightness-110 border border-opacity-50 transition-all flex items-center ${colorClass}`}
                                                        style={{ 
                                                            left: `${startPct}%`, 
                                                            width: `${widthPct}%`,
                                                            top: `calc(${topPct}% + 4px)`,
                                                            height: `calc(${heightPct}% - 8px)`,
                                                            fontSize: totalTracks > 2 ? '7px' : '9px' // Shrink text if extremely split
                                                        }} 
                                                        title={task.taskName}
                                                    >
                                                        {widthPct > 8 && <span className="truncate">{task.taskName}</span>}
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
