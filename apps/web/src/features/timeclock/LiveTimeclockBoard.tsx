import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Search, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface LiveTimeclockBoardProps {
  tenantId: string;
}

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
  individualSchedule?: WorkSchedule;
}

interface Department {
  id: string;
  name: string;
  defaultSchedule?: WorkSchedule;
}

export function LiveTimeclockBoard({ tenantId }: LiveTimeclockBoardProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000); // Update the live duration every minute
    return () => clearInterval(interval);
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
      
      // Filter for sessions that started today
      return allSessions.filter(s => {
        if (!s.clockIn?.timestamp) return false;
        const date = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
        return date >= today;
      });
    },
    refetchInterval: 60000 // Refetch every minute to keep it live
  });

  const { data: scheduleData } = useQuery({
    queryKey: ['staff-roster-data', tenantId],
    queryFn: async () => {
      const staffSnap = await getDocs(query(collection(db, `businesses/${tenantId}/staff`)));
      const deptSnap = await getDocs(query(collection(db, `businesses/${tenantId}/departments`)));
      
      return {
        staff: staffSnap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)),
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

  const filteredSessions = sessions?.filter(s => 
    s.userName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) return <div className="p-12 text-center text-zinc-500">Loading live data...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500" />
            Live Timeclock Board
          </h2>
          <p className="text-sm text-zinc-500 mt-1">Real-time overview of staff clocked in today.</p>
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

      <div className="grid gap-4">
        {filteredSessions?.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            No staff clocked in today.
          </div>
        ) : (
          filteredSessions?.map((session) => {
            const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
            const breakMs = session.breaks?.reduce((acc: number, b: any) => acc + calculateDuration(b.start, b.end), 0) || 0;
            const workMs = totalMs - breakMs;

            // Define scale (e.g., standard 8 hours = 28800000 ms)
            // Let's cap the visual scale at 12 hours (43200000 ms) for the graph
            const maxMs = 43200000;
            
            const isActive = session.status !== 'completed';

            const staff = scheduleData?.staff.find(s => s.id === session.userId);
            const dept = scheduleData?.departments.find(d => d.id === staff?.departmentId);
            const schedule = staff?.individualSchedule || dept?.defaultSchedule;
            
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
              <div key={session.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-600 font-bold">
                      {session.userName?.[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-zinc-900 dark:text-white text-lg">{session.userName}</h3>
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
                      <p className="text-xs text-zinc-500 font-mono">
                        Started at {session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(session.clockIn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-6 items-center border-l border-zinc-100 dark:border-zinc-800 pl-6">
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Total Time</p>
                      <p className="font-mono font-black text-indigo-600 dark:text-indigo-400">{formatDuration(workMs)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Break Time</p>
                      <p className="font-mono font-black text-amber-600 dark:text-amber-400">{formatDuration(breakMs)}</p>
                    </div>
                  </div>
                </div>

                {/* Chronological Timeline */}
                <div className="mt-4">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                    <span>Timeline (12h scale)</span>
                    <div className="flex gap-3">
                      <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-indigo-500" /> Worked</div>
                      <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-400" /> Break</div>
                      <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-teal-500" /> Job Segment</div>
                    </div>
                  </div>
                  <div className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-hidden w-full relative group border border-zinc-200 dark:border-zinc-800/50">
                    
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
                    {session.jobs?.map((j, i) => {
                      const jobStartOffset = calculateDuration(session.clockIn.timestamp, j.start);
                      const jDuration = calculateDuration(j.start, j.end);
                      const leftPercent = Math.min((jobStartOffset / maxMs) * 100, 100);
                      const widthPercent = Math.min((jDuration / maxMs) * 100, 100 - leftPercent);
                      
                      return (
                        <div 
                          key={`job-${i}`}
                          onClick={() => navigate(`/business/${tenantId}/jobs/${j.id}`)}
                          className="absolute top-1/2 -translate-y-1/2 h-5 bg-teal-500 rounded border border-white/20 shadow-sm cursor-pointer hover:brightness-110 hover:scale-y-110 transition-all duration-300 z-20 flex items-center justify-center overflow-hidden"
                          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                          title={`Job: ${j.name}\n${formatDuration(jDuration)}\nClick to view job details`}
                        >
                          <span className="text-[8px] font-black uppercase text-teal-950/70 tracking-widest whitespace-nowrap px-1 truncate">
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
