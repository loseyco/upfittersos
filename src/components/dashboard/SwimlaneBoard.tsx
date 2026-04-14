import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, SearchCode, AlertTriangle, ShieldCheck, Plus } from 'lucide-react';
import React, { useMemo } from 'react';

export function JobSwimlaneRow({ 
    title, 
    jobs, 
    allStaff, 
    globalOpenTaskLogs, 
    setEditingParkingJob,
    isInitialQueue = false
}: { 
    title: React.ReactNode;
    jobs: any[]; 
    allStaff: any[]; 
    globalOpenTaskLogs: any[]; 
    setEditingParkingJob: (j: {id: string, current: string}) => void;
    isInitialQueue?: boolean;
}) {

    // Sort by due date (earliest first)
    const sortedJobs = useMemo(() => {
        return [...jobs].sort((a, b) => {
            const dateA = a.pickupEta || a.completionEta || a.dueDate || a.desiredPickupDate;
            const dateB = b.pickupEta || b.completionEta || b.dueDate || b.desiredPickupDate;
            const tA = dateA ? new Date(dateA).getTime() : Infinity;
            const tB = dateB ? new Date(dateB).getTime() : Infinity;
            return tA - tB;
        });
    }, [jobs]);

    return (
        <div className="flex flex-col gap-3 h-auto lg:h-max w-full lg:min-w-[280px] lg:w-[320px] lg:max-w-[350px] shrink-0 xl:bg-zinc-950/30 xl:rounded-2xl xl:p-3 xl:border xl:border-zinc-800/50 lg:snap-start">
            
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 px-4 flex items-center justify-between shadow-sm mb-1 lg:mb-0 shrink-0">
                <div className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2">
                    {title}
                </div>
                <span className="text-xl font-bold tracking-tight text-white">{sortedJobs.length}</span>
            </div>

            <div className="flex overflow-x-auto lg:flex-col gap-3 lg:overflow-y-auto pr-1 pb-4 lg:pb-0 snap-x lg:snap-none hide-scrollbar lg:max-h-[calc(100vh-300px)]">
                
                {isInitialQueue && (
                    <Link to="/business/jobs/new" className="snap-start shrink-0 w-[300px] lg:w-full bg-accent/10 border border-accent/20 hover:border-accent hover:bg-accent/20 rounded-xl p-4 flex flex-col items-center justify-center transition-all group relative overflow-hidden min-h-[140px] shadow-sm hover:shadow-[0_0_20px_rgba(20,184,166,0.15)]">
                        <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-accent transition-all duration-300">
                            <Plus className="w-6 h-6 text-accent group-hover:text-zinc-950 transition-colors" />
                        </div>
                        <span className="font-black text-accent uppercase tracking-widest text-sm text-center">Start New Job</span>
                    </Link>
                )}

                {sortedJobs.length === 0 && !isInitialQueue && (
                    <div className="snap-start shrink-0 w-[300px] md:w-[350px] lg:w-full bg-zinc-950/30 border border-dashed border-zinc-800 rounded-xl p-6 flex items-center justify-center min-h-[80px]">
                        <span className="text-xs text-zinc-600 uppercase tracking-widest font-bold">No jobs here</span>
                    </div>
                )}

                {sortedJobs.map((job: any) => {
                    const activeTasks = (job.tasks || [])
                        .map((t: any, i: number) => ({...t, originalIndex: i}))
                        .filter((t: any) => t.status === 'In Progress' || t.status === 'Blocked' || t.status === 'Ready for QA')
                        .sort((a: any, b: any) => {
                            if (a.status === 'Blocked') return -1;
                            if (b.status === 'Blocked') return 1;
                            if (a.status === 'In Progress') return -1;
                            if (b.status === 'In Progress') return 1;
                            return 0;
                        });
                        
                    const primaryTask = activeTasks[0];
                    const jobOpenLogs = globalOpenTaskLogs.filter(log => log.jobId === job.id);
                    const primaryLog = jobOpenLogs[0];
                    
                    let progressPercent = 0;
                    if (primaryTask && primaryTask.bookTime) progressPercent = 50; 
                    
                    let elapsedStr = '0m';
                    if (primaryTask?.status === 'Ready for QA') {
                        let start = Date.now();
                        if (primaryTask.readyForQaAt) start = new Date(primaryTask.readyForQaAt).getTime();
                        else if (job.updatedAt) start = typeof job.updatedAt.toMillis === 'function' ? job.updatedAt.toMillis() : new Date(job.updatedAt).getTime();
                        if (isNaN(start)) start = Date.now();
                        const elapsedMs = Math.max(0, Date.now() - start);
                        const hrs = Math.floor(elapsedMs / (1000 * 60 * 60));
                        const mins = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
                        elapsedStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                    } else if (primaryLog && primaryLog.clockIn) {
                        const elapsedMs = Math.max(0, Date.now() - new Date(primaryLog.clockIn).getTime());
                        const hrs = Math.floor(elapsedMs / (1000 * 60 * 60));
                        const mins = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
                        elapsedStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                    }

                    const staffMember = primaryLog && allStaff.find(s => s.uid === primaryLog.userId || s.uid === primaryLog.staffId);
                    const techName = staffMember?.displayName || primaryLog?.authorName || 'Tech';
                    const techPhoto = staffMember?.photoURL;

                    return (
                        <Link 
                            key={job.id} 
                            to={`/business/jobs/${job.id}`}
                            className={`snap-start shrink-0 w-[300px] md:w-[350px] lg:w-full bg-zinc-950/50 border hover:border-indigo-500/30 rounded-xl p-4 flex flex-col justify-between transition-colors group relative overflow-hidden ${primaryTask?.status === 'Blocked' ? 'hover:bg-red-500/5 border-red-500/20' : 'hover:bg-indigo-500/5 border-zinc-800'}`}
                        >
                            <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full group-hover:scale-125 transition-transform origin-top-right ${primaryTask?.status === 'Blocked' ? 'bg-red-500/5' : 'bg-indigo-500/5'}`}></div>
                            <div className="flex justify-between items-start mb-3 relative z-10 w-full min-h-[48px]">
                                <div className="flex flex-col pr-12 w-full">
                                    <div className="flex items-center gap-2 justify-between w-full">
                                        <span className="font-bold text-zinc-200 line-clamp-1 flex-1">{job.title || 'Untitled Job'}</span>
                                        <div 
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setEditingParkingJob({ id: job.id, current: job.parkedLocation || '' });
                                            }}
                                            className={`text-[9px] shrink-0 font-black uppercase tracking-widest px-1.5 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-1 ${job.parkedLocation ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20' : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:text-zinc-300'}`}
                                        >
                                            <MapPin className="w-2.5 h-2.5" />
                                            {job.parkedLocation || 'Park Spot'}
                                        </div>
                                    </div>
                                    {primaryTask ? (
                                        <span className="text-xs text-zinc-500 line-clamp-1 mt-0.5">{primaryTask.title}</span>
                                    ) : (
                                        <span className="text-xs text-zinc-600 italic line-clamp-1 mt-0.5">No active task</span>
                                    )}
                                </div>
                                {job.tagNumber && (
                                    <span className={`text-white font-black text-[10px] px-2 py-0.5 rounded uppercase tracking-widest shadow-sm shrink-0 absolute top-0 right-0 ${primaryTask?.status === 'Blocked' ? 'bg-red-500 shadow-red-500/20' : 'bg-indigo-500 shadow-indigo-500/20'}`}>
                                        #{job.tagNumber}
                                    </span>
                                )}
                            </div>

                            {/* Status Bubble */}
                            {primaryLog ? (
                                <div className="flex items-center gap-2 mb-3 relative z-10 bg-zinc-900/80 rounded-lg p-2 border border-zinc-800/80 mt-auto">
                                    <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 overflow-hidden">
                                        {techPhoto ? (
                                            <img src={techPhoto} alt={techName} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-[9px] font-bold text-white">{techName.charAt(0)}</span>
                                        )}
                                    </div>
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="text-[10px] font-bold text-zinc-300 truncate">{techName}</span>
                                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">
                                            Dur: <span className="text-emerald-400">{elapsedStr}</span>
                                        </span>
                                    </div>
                                    {primaryLog.isDiscovery && <SearchCode className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                </div>
                            ) : primaryTask?.status === 'Blocked' ? (
                                <div className="flex items-center gap-2 mb-3 relative z-10 bg-red-500/10 rounded-lg p-2 border border-red-500/20 mt-auto">
                                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest truncate line-clamp-1">{primaryTask.title}</span>
                                </div>
                            ) : primaryTask?.status === 'Ready for QA' ? (
                                <div className="flex items-center gap-2 mb-3 relative z-10 bg-orange-500/10 rounded-lg p-2 border border-orange-500/20 mt-auto">
                                    <ShieldCheck className="w-4 h-4 text-orange-500 shrink-0" />
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Pending QA</span>
                                        {elapsedStr !== '0m' && <span className="text-[9px] text-orange-500/80 uppercase tracking-widest font-mono truncate">Wait: {elapsedStr}</span>}
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-auto mb-3 opacity-0">Spacer</div> /* Keeps card heights aligned */
                            )}

                            <div className="flex flex-col relative z-10">
                                {primaryTask?.bookTime && primaryTask?.status !== 'Ready for QA' ? (
                                    <div className="w-full bg-zinc-900 rounded-full h-1.5 mb-2 overflow-hidden border border-zinc-800/50">
                                        <div className={`h-full rounded-full ${primaryTask?.status === 'Blocked' ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${progressPercent}%` }}></div>
                                    </div>
                                ) : null}

                                <div className="flex justify-between items-end">
                                    {primaryTask?.status === 'In Progress' ? (
                                        <div className="flex flex-col">
                                            <span className="text-[9px] text-zinc-600 uppercase tracking-widest mb-0.5">Task Status</span>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">{primaryTask?.status}</span>
                                        </div>
                                    ) : <div />}
                                    
                                    {(job.pickupEta || job.completionEta || job.dueDate) ? (
                                        <div className="flex flex-col text-right ml-auto mr-4">
                                            <span className="text-[9px] text-zinc-600 uppercase tracking-widest mb-0.5">Due By</span>
                                            <span className="text-[10px] font-bold text-zinc-400">
                                                {new Date(job.pickupEta || job.completionEta || job.dueDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                            </span>
                                        </div>
                                    ) : <div />}
                                    
                                    <span className="text-zinc-600 group-hover:text-indigo-400 transition-colors ml-auto">
                                        <ArrowRight className="w-4 h-4" />
                                    </span>
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
