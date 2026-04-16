import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, SearchCode, AlertTriangle, ShieldCheck, Plus, Play, User, Car } from 'lucide-react';
import React, { useMemo } from 'react';
import toast from 'react-hot-toast';

export function JobSwimlaneRow({ 
    title, 
    jobs, 
    allStaff, 
    globalOpenTaskLogs, 
    setEditingParkingJob,
    isInitialQueue = false,
    onNewJob,
    onJobClick,
    onTaskClockToggle,
    currentUserId
}: { 
    title: React.ReactNode;
    jobs: any[]; 
    allStaff: any[]; 
    globalOpenTaskLogs: any[]; 
    setEditingParkingJob: (j: {id: string, current: string}) => void;
    isInitialQueue?: boolean;
    onNewJob?: () => void;
    onJobClick?: (job: any) => void;
    onTaskClockToggle?: (job: any, task: any, isCurrentlyClockedIn: boolean, logId?: string) => void;
    currentUserId?: string;
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
                
                {isInitialQueue && onNewJob && (
                    <button 
                        onClick={onNewJob}
                        className="snap-start shrink-0 w-[300px] lg:w-full bg-accent/10 border border-accent/20 hover:border-accent hover:bg-accent/20 rounded-xl p-4 flex flex-col items-center justify-center transition-all group relative overflow-hidden min-h-[140px] shadow-sm hover:shadow-[0_0_20px_rgba(20,184,166,0.15)] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    >
                        <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-accent transition-all duration-300">
                            <Plus className="w-6 h-6 text-accent group-hover:text-zinc-950 transition-colors" />
                        </div>
                        <span className="font-black text-accent uppercase tracking-widest text-sm text-center">Start New Job</span>
                    </button>
                )}

                {sortedJobs.length === 0 && !isInitialQueue && (
                    <div className="snap-start shrink-0 w-[300px] md:w-[350px] lg:w-full bg-zinc-950/30 border border-dashed border-zinc-800 rounded-xl p-6 flex items-center justify-center min-h-[80px]">
                        <span className="text-xs text-zinc-600 uppercase tracking-widest font-bold">No jobs here</span>
                    </div>
                )}

                {sortedJobs.map((job: any) => {
                    const jobOpenLogs = globalOpenTaskLogs.filter(log => log.jobId === job.id);
                    const myActiveLog = currentUserId ? jobOpenLogs.find(log => log.userId === currentUserId || log.staffId === currentUserId) : undefined;
                     
                    const activeTasks = (job.tasks || [])
                        .map((t: any, i: number) => ({...t, originalIndex: i}))
                        .filter((t: any) => t.status !== 'Finished' && t.status !== 'Delivered')
                        .sort((a: any, b: any) => {
                            // 1. Task currently actively clocked into by ME
                            const aIsMyActive = myActiveLog?.taskName === a.title;
                            const bIsMyActive = myActiveLog?.taskName === b.title;
                            if (aIsMyActive && !bIsMyActive) return -1;
                            if (!aIsMyActive && bIsMyActive) return 1;
                            
                            // 2. Task currently actively clocked into by ANYONE
                            const aIsActive = jobOpenLogs.some(l => l.taskName === a.title);
                            const bIsActive = jobOpenLogs.some(l => l.taskName === b.title);
                            if (aIsActive && !bIsActive) return -1;
                            if (!aIsActive && bIsActive) return 1;

                            // 3. Task assigned to ME
                            const aIsAssignedToMe = currentUserId && (a.assignedUids?.includes(currentUserId) || a.assignedTo?.includes(currentUserId));
                            const bIsAssignedToMe = currentUserId && (b.assignedUids?.includes(currentUserId) || b.assignedTo?.includes(currentUserId));
                            if (aIsAssignedToMe && !bIsAssignedToMe) return -1;
                            if (!aIsAssignedToMe && bIsAssignedToMe) return 1;

                            // 4. Status severity
                            const getSeverity = (status: string) => {
                                if (status === 'Blocked') return 4;
                                if (status === 'In Progress') return 3;
                                if (status === 'Ready for QA') return 2;
                                return 1; // Pending
                            };
                            return getSeverity(b.status) - getSeverity(a.status);
                        });
                        
                    const primaryTask = activeTasks[0];
                    const primaryLog = jobOpenLogs.find(l => l.taskName === primaryTask?.title) || jobOpenLogs[0];
                    
                    let isOnBreak = false;
                    if (primaryLog?.breaks && Array.isArray(primaryLog.breaks) && primaryLog.breaks.length > 0) {
                        if (!primaryLog.breaks[primaryLog.breaks.length - 1].end) isOnBreak = true;
                    }

                    let myLogIsOnBreak = false;
                    if (myActiveLog?.breaks && Array.isArray(myActiveLog.breaks) && myActiveLog.breaks.length > 0) {
                        if (!myActiveLog.breaks[myActiveLog.breaks.length - 1].end) myLogIsOnBreak = true;
                    }
                    
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
                            onClick={(e) => {
                                if (onJobClick) {
                                    e.preventDefault();
                                    onJobClick(job);
                                }
                            }}
                            className={`snap-start shrink-0 w-[300px] md:w-[350px] lg:w-full bg-zinc-950/50 border hover:border-indigo-500/30 rounded-xl p-4 flex flex-col justify-between transition-colors group relative overflow-hidden ${primaryTask?.status === 'Blocked' ? 'hover:bg-red-500/5 border-red-500/20' : 'hover:bg-indigo-500/5 border-zinc-800'}`}
                        >
                            <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full group-hover:scale-125 transition-transform origin-top-right ${primaryTask?.status === 'Blocked' ? 'bg-red-500/5' : 'bg-indigo-500/5'}`}></div>
                            <div className="flex justify-between items-start mb-3 relative z-10 w-full min-h-[48px]">
                                <div className={`flex flex-col w-full ${job.tagNumber ? 'pr-12' : ''}`}>
                                    <div className="flex items-center gap-2 justify-between w-full mb-1">
                                        <span className="font-bold text-zinc-200 line-clamp-1 flex-1">{job.title || 'Untitled Job'}</span>
                                        {!['Draft', 'Estimate', 'Pending Approval', 'Pending Intake', 'Scheduled'].includes(job.status) && (
                                            <div 
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (setEditingParkingJob) setEditingParkingJob({ id: job.id, current: job.parkedLocation || '' });
                                                }}
                                                className={`text-[9px] shrink-0 font-black uppercase tracking-widest px-1.5 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-1 ${job.parkedLocation ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20' : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:text-zinc-300'}`}
                                            >
                                                <MapPin className="w-2.5 h-2.5" />
                                                {job.parkedLocation || 'Park'}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {(job.customer || job.vehicle) && (
                                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[9px] text-zinc-500 font-mono mb-2">
                                            {job.customer && (
                                                <span className="flex items-center gap-1"><User className="w-2.5 h-2.5 text-zinc-600" /> {job.customer.firstName} {job.customer.lastName}</span>
                                            )}
                                            {job.vehicle && (
                                                <span className="flex items-center gap-1"><Car className="w-2.5 h-2.5 text-zinc-600" /> {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}</span>
                                            )}
                                        </div>
                                    )}

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

                            <div className="mt-auto flex flex-col relative z-10 w-full">
                                {primaryTask?.bookTime && primaryTask?.status !== 'Ready for QA' ? (
                                    <div className="w-full bg-zinc-900 rounded-full h-1 mb-2 overflow-hidden border border-zinc-800/50">
                                        <div className={`h-full rounded-full ${primaryTask?.status === 'Blocked' ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${progressPercent}%` }}></div>
                                    </div>
                                ) : null}

                                <div className="flex justify-between items-center w-full gap-2 mt-1">
                                    {primaryLog ? (
                                        <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                                            <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 overflow-hidden">
                                                {techPhoto ? (
                                                    <img src={techPhoto} alt={techName} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-[9px] font-bold text-white">{techName.charAt(0)}</span>
                                                )}
                                            </div>
                                            <div className="flex flex-col flex-1 min-w-0">
                                                <span className="text-[9px] font-bold text-zinc-300 truncate">{techName}</span>
                                                {isOnBreak ? (
                                                    <span className="text-[8px] text-amber-500 font-bold uppercase tracking-widest font-mono">On Break</span>
                                                ) : (
                                                    <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-mono">Dur: <span className="text-emerald-400">{elapsedStr}</span></span>
                                                )}
                                            </div>
                                            {primaryLog.isDiscovery && <SearchCode className="w-3 h-3 text-amber-500 shrink-0" />}
                                        </div>
                                    ) : primaryTask?.status === 'Blocked' ? (
                                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                            <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest truncate">Blocked</span>
                                        </div>
                                    ) : primaryTask?.status === 'Ready for QA' ? (
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <ShieldCheck className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                                <span className="text-[9px] font-bold text-orange-400 uppercase tracking-widest truncate">QA</span>
                                            </div>
                                            {elapsedStr !== '0m' && <span className="text-[8px] text-orange-500/80 uppercase tracking-widest font-mono truncate mt-0.5">Wait: {elapsedStr}</span>}
                                        </div>
                                    ) : primaryTask?.status === 'In Progress' ? (
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <span className="text-[8px] text-zinc-600 uppercase tracking-widest mb-0.5">Task Status</span>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">In Progress</span>
                                        </div>
                                    ) : (
                                        <div className="flex-1 min-w-0" />
                                    )}

                                    <div className="flex items-center gap-2 ml-auto shrink-0">
                                        {(job.pickupEta || job.completionEta || job.dueDate) && (
                                            <div className="flex flex-col text-right mr-1 hidden lg:flex">
                                                <span className="text-[8px] text-zinc-600 uppercase tracking-widest mb-0.5">Due By</span>
                                                <span className="text-[9px] font-bold text-zinc-400">
                                                    {new Date(job.pickupEta || job.completionEta || job.dueDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                                </span>
                                            </div>
                                        )}
                                        
                                        {onTaskClockToggle && primaryTask && primaryTask.status !== 'Ready for QA' && primaryTask.status !== 'Delivered' && !['Draft', 'Estimate', 'Pending Approval', 'Pending Intake', 'Scheduled'].includes(job.status) && ((primaryTask.assignedUids?.includes(currentUserId) || primaryTask.assignedTo?.includes(currentUserId)) || myActiveLog) && (
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (myLogIsOnBreak) {
                                                        toast.error("Please Return from Break in the main widget first.");
                                                        return;
                                                    }
                                                    onTaskClockToggle(job, primaryTask, !!myActiveLog, myActiveLog?.id);
                                                }}
                                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all shadow-sm ${myLogIsOnBreak ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 cursor-not-allowed' : myActiveLog ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20' : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'}`}
                                            >
                                                {myLogIsOnBreak ? (
                                                    <>Paused</>
                                                ) : myActiveLog ? (
                                                    <>Stop</>
                                                ) : (
                                                    <><Play className="w-2.5 h-2.5" /> Start</>
                                                )}
                                            </button>
                                        )}
                                        <span className="text-zinc-600 group-hover:text-indigo-400 transition-colors">
                                            <ArrowRight className="w-4 h-4" />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
