import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc } from 'firebase/firestore';
import { CheckCircle2, Play, Square, Hammer, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export function MobileDashboard() {
    const { currentUser, tenantId } = useAuth();
    const navigate = useNavigate();
    const [allJobs, setAllJobs] = useState<any[]>([]);
    const [globalOpenTaskLogs, setGlobalOpenTaskLogs] = useState<any[]>([]);
    const [globalClockState, setGlobalClockState] = useState<any>(null);

    // Fetch Jobs and Clock State
    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL' || !currentUser?.uid) return;

        // Fetch jobs to find assigned tasks
        const qJobs = query(collection(db, 'jobs'), where('tenantId', '==', tenantId));
        const unsubJobs = onSnapshot(qJobs, (snap) => {
            const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAllJobs(fetched.filter((j: any) => !j.archived && j.status !== 'Archived' && j.status !== 'archived' && !j.isChangeOrder));
        });

        // Fetch user's active task logs
        const unsubGlobalOpenTaskLogs = onSnapshot(
            query(collection(db, 'businesses', tenantId, 'task_time_logs'), where('status', '==', 'open'), where('userId', '==', currentUser.uid)),
            (s) => setGlobalOpenTaskLogs(s.docs.map(d => ({ id: d.id, ...d.data() })))
        );

        // Fetch user's master time clock state
        const authQ = query(
            collection(db, 'businesses', tenantId, 'time_logs'),
            where('userId', '==', currentUser.uid),
            where('status', '==', 'open')
        );
        const unsubGlobalClock = onSnapshot(authQ, (snap) => {
            if (!snap.empty) {
                const data = snap.docs[0].data() as any;
                const breaks = data.breaks || [];
                const isOnBreak = breaks.length > 0 && breaks[breaks.length - 1].end === null;
                setGlobalClockState({ id: snap.docs[0].id, ...data, isOnBreak });
            } else {
                setGlobalClockState(null);
            }
        });

        return () => {
            unsubJobs();
            unsubGlobalOpenTaskLogs();
            unsubGlobalClock();
        };
    }, [currentUser?.uid, tenantId]);

    const myActiveLogs = useMemo(() => globalOpenTaskLogs, [globalOpenTaskLogs]);

    const myAssignedJobs = useMemo(() => {
        if (!currentUser?.uid) return [];
        const jobs: any[] = [];
        
        allJobs.forEach(job => {
            if (job.status === 'Draft' || job.status === 'Estimate' || job.status === 'Archived' || job.archived) return;
            
            const myTasks: any[] = [];
            (job.tasks || []).forEach((t: any, idx: number) => {
                if (t.assignedUids?.includes(currentUser.uid) || t.assignedTo?.includes(currentUser.uid)) {
                    if (t.status !== 'Finished' && t.status !== 'Delivered' && t.status !== 'Ready for QA') {
                        // Check if currently clocked into this task
                        const isActive = myActiveLogs.some(log => log.jobId === job.id && log.taskName === t.title);
                        if (!isActive) {
                            myTasks.push({ ...t, originalIndex: idx });
                        }
                    }
                }
            });
            
            if (myTasks.length > 0) {
                jobs.push({
                    job,
                    myTasks,
                    jobDueDate: job.dueDate || job.completionEta || job.pickupEta
                });
            }
        });
        
        // Sort by impending due dates or job creation
        jobs.sort((a, b) => {
            const timeA = a.jobDueDate ? new Date(a.jobDueDate).getTime() : Infinity;
            const timeB = b.jobDueDate ? new Date(b.jobDueDate).getTime() : Infinity;
            return timeA - timeB;
        });
        
        return jobs;
    }, [allJobs, currentUser?.uid, myActiveLogs]);

    const handleTaskClockToggle = async (job: any, task: any, isCurrentlyClockedIn: boolean, logId?: string) => {
        if (!currentUser?.uid || !tenantId) return;
        try {
            const now = new Date().toISOString();
            
            if (isCurrentlyClockedIn && logId) {
                // Clock out
                toast.loading("Clocking out of task...", { id: 'm_clock_toggle' });
                await updateDoc(doc(db, 'businesses', tenantId, 'task_time_logs', logId), {
                    clockOut: now,
                    status: 'closed'
                });
                toast.success("Clocked out of task", { id: 'm_clock_toggle' });
            } else {
                if (globalClockState?.isOnBreak) {
                    toast.error("You cannot start a task while on break. Please return from break in the time clock.", { id: 'm_clock_toggle', duration: 4000 });
                    return;
                }
                if (!globalClockState) {
                    toast.error("You must clock in for the day before starting a task.", { id: 'm_clock_toggle', duration: 4000 });
                    return;
                }

                // Clock into task
                toast.loading("Starting task...", { id: 'm_clock_toggle' });
                const vDetails = job.vehicleDetails || {};
                const vehStr = [vDetails.year, vDetails.make, vDetails.model, vDetails.vin?.slice(-6)].filter(Boolean).join(' ') || 'Vehicle';

                await addDoc(collection(db, 'businesses', tenantId, 'task_time_logs'), {
                    userId: currentUser.uid,
                    jobId: job.id,
                    taskIndex: task.originalIndex !== undefined ? task.originalIndex : (job.tasks?.findIndex((t: any) => t.title === task.title)),
                    taskName: task.title,
                    vehicleName: vehStr,
                    bookTime: task.bookTime || 0,
                    clockIn: now,
                    clockOut: null,
                    status: 'open',
                    isDiscovery: false
                });

                toast.success("Started working on task!", { id: 'm_clock_toggle' });
            }
        } catch (err) {
            console.error("Failed to toggle task clock:", err);
            toast.error("Failed to update clock status", { id: 'm_clock_toggle' });
        }
    };

    return (
        <div className="flex flex-col text-white pb-6 w-full relative">
            {/* Jobs/Tasks Section */}
            <div className="px-4 flex-1 flex flex-col gap-4 w-full">
                <div className="flex items-center gap-2 mb-2">
                    <Hammer className="w-5 h-5 text-accent" />
                    <h2 className="text-lg font-black tracking-tight">Assigned Jobs</h2>
                </div>

                {/* Active Tasks first */}
                {myActiveLogs.map(log => {
                    const jobInfo = allJobs.find(j => j.id === log.jobId);
                    const taskInfo = jobInfo?.tasks?.find((t: any) => t.title === log.taskName);
                    return (
                        <div key={log.id} 
                             onClick={() => navigate(`/business/jobs/${log.jobId}`)}
                             className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden shadow-md active:scale-[0.98] transition-transform">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                            <div className="flex items-center justify-between gap-3 pl-2">
                                <div className="flex flex-col">
                                    <div className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                                        <Settings className="w-4 h-4 animate-spin" style={{ animationDuration: '3s' }}/> 
                                        Working Now
                                    </div>
                                    <div className="text-base font-bold text-white mt-1 leading-tight">{log.taskName}</div>
                                    <div className="text-sm font-medium text-zinc-400 mt-0.5">{jobInfo?.title || 'Unknown Job'}</div>
                                </div>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleTaskClockToggle(jobInfo, taskInfo || { title: log.taskName, originalIndex: log.taskIndex }, true, log.id); }}
                                className="mt-2 w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors shadow-sm text-sm"
                            >
                                <Square className="w-4 h-4 fill-current" /> Stop Task
                            </button>
                        </div>
                    );
                })}

                {/* Up Next Jobs */}
                {myAssignedJobs.length === 0 && myActiveLogs.length === 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-2">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500/50 mb-2" />
                        <h3 className="text-lg font-bold text-zinc-300">No Assigned Jobs</h3>
                        <p className="text-sm text-zinc-500">You're all caught up for now.</p>
                    </div>
                )}

                {myAssignedJobs.map((jInfo, idx) => (
                    <div key={`sug-${idx}`} 
                         onClick={() => navigate(`/business/jobs/${jInfo.job.id}`)}
                         className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden active:scale-[0.98] transition-transform cursor-pointer">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-col pr-4">
                                <div className="text-base font-bold text-white tracking-tight">{jInfo.job.title}</div>
                                <div className="text-sm font-medium text-zinc-400 mt-1">
                                    {[jInfo.job.vehicleDetails?.year, jInfo.job.vehicleDetails?.make, jInfo.job.vehicleDetails?.model, jInfo.job.vehicleDetails?.vin?.slice(-6)].filter(Boolean).join(' ') || 'General Job'}
                                </div>
                                <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mt-2 bg-zinc-800 inline-block px-2 py-1 rounded max-w-fit">
                                    {jInfo.myTasks.length} Assigned Task{jInfo.myTasks.length === 1 ? '' : 's'}
                                </div>
                            </div>
                        </div>
                        
                        {/* Nested Task Items with Start controls */}
                        <div className="mt-2 space-y-2">
                            {jInfo.myTasks.map((task: any, tIdx: number) => (
                                <div key={tIdx} onClick={(e) => e.stopPropagation()} className="flex items-center justify-between bg-zinc-950 p-3 rounded-xl border border-zinc-800 shadow-inner">
                                    <div className="flex flex-col pr-2 overflow-hidden w-full">
                                        <span className="text-sm font-bold text-white truncate w-full">{task.title}</span>
                                        <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mt-0.5">{task.bookTime || 0} hrs</span>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleTaskClockToggle(jInfo.job, task, false); }}
                                        className="flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 active:bg-accent hover:text-accent-hover text-white active:text-white border border-zinc-700 font-bold px-4 py-2 rounded-lg transition-all text-sm whitespace-nowrap shrink-0 shadow-sm"
                                    >
                                        <Play className="w-4 h-4 fill-current" /> Start
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            {/* Simple footer spacing */}
            <div className="h-12 w-full"></div>
        </div>
    );
}
