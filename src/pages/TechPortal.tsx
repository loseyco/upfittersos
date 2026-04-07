import { useState, useEffect } from 'react';
import { Wrench, PlayCircle, PauseCircle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, onSnapshot, query, where, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';

export function TechPortal() {
    const { currentUser, tenantId } = useAuth();
    
    const [jobs, setJobs] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [timeLogs, setTimeLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tenantId || tenantId === 'unassigned') {
            setLoading(false);
            return;
        }

        const unsubJobs = onSnapshot(query(collection(db, 'jobs'), where('tenantId', '==', tenantId)), (s) => {
            const fetched = s.docs.map(d => ({ id: d.id, ...d.data() }));
            setJobs(fetched.filter((j: any) => !j.archived));
            setLoading(false);
        });

        const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('tenantId', '==', tenantId)), (s) => {
            setVehicles(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubCustomers = onSnapshot(query(collection(db, 'customers'), where('tenantId', '==', tenantId)), (s) => {
            setCustomers(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        let unsubLogs = () => {};
        if (currentUser?.uid) {
            unsubLogs = onSnapshot(query(collection(db, 'businesses', tenantId, 'time_logs'), where('userId', '==', currentUser.uid)), (s) => {
                setTimeLogs(s.docs.map(d => ({ id: d.id, ...d.data() })));
            });
        }

        return () => {
            unsubJobs();
            unsubVehicles();
            unsubCustomers();
            unsubLogs();
        };
    }, [tenantId, currentUser?.uid]);

    const getVehicleName = (vId: string) => {
        const v = vehicles.find(x => x.id === vId);
        if (!v) return '—';
        return `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || 'Unknown Vehicle';
    };

    const getCustomerName = (cId: string) => {
        const c = customers.find(x => x.id === cId);
        if (!c) return '—';
        return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Unknown Customer';
    };

    const handleUpdateTaskStatus = async (jobId: string, taskIndex: number, newStatus: string) => {
        try {
            const jobRef = doc(db, 'jobs', jobId);
            const jobSnap = await getDoc(jobRef);
            if (!jobSnap.exists()) return;

            const jobData = jobSnap.data();
            const updatedTasks = [...jobData.tasks];
            updatedTasks[taskIndex].status = newStatus;

            if ((newStatus === 'In Progress' || newStatus === 'Finished') && currentUser) {
                if (!updatedTasks[taskIndex].assignedUids) updatedTasks[taskIndex].assignedUids = [];
                if (!updatedTasks[taskIndex].assignedUids.includes(currentUser.uid)) {
                    updatedTasks[taskIndex].assignedUids.push(currentUser.uid);
                }
            }

            await updateDoc(jobRef, { tasks: updatedTasks });
            
            // If the tech started or finished a task, try to append a note to an active Timeclock shift AND manage proper sub-task clocks
            if ((newStatus === 'In Progress' || newStatus === 'Finished') && currentUser && tenantId) {
                try {
                    const { getDocs, addDoc } = await import('firebase/firestore');
                    
                    // 1. Manage strict task_time_logs
                    const qTaskOpen = query(collection(db, 'businesses', tenantId, 'task_time_logs'), where('userId', '==', currentUser.uid), where('status', '==', 'open'));
                    const openTasksSnap = await getDocs(qTaskOpen);
                    const now = new Date().toISOString();
                    
                    // Close any currently running task clocks
                    for (const activeDoc of openTasksSnap.docs) {
                        await updateDoc(doc(db, 'businesses', tenantId, 'task_time_logs', activeDoc.id), {
                            clockOut: now,
                            status: 'closed'
                        });
                    }

                    // If we are starting a fresh task, open a new task_time_log
                    if (newStatus === 'In Progress') {
                        await addDoc(collection(db, 'businesses', tenantId, 'task_time_logs'), {
                            userId: currentUser.uid,
                            jobId: jobId,
                            taskIndex: taskIndex,
                            taskName: updatedTasks[taskIndex].title,
                            vehicleName: getVehicleName(jobData.vehicleId),
                            bookTime: updatedTasks[taskIndex].bookTime || 0,
                            clockIn: now,
                            clockOut: null,
                            status: 'open'
                        });
                    }

                    // 2. Append visual note to Time Logs
                    const qObj = query(collection(db, 'businesses', tenantId, 'time_logs'), where('userId', '==', currentUser.uid), where('status', '==', 'open'));
                    const activeTimeLogSnap = await getDocs(qObj);
                    
                    if (!activeTimeLogSnap.empty) {
                        const activeLogDoc = activeTimeLogSnap.docs[0];
                        const activeLog = activeLogDoc.data();
                        
                        const prefix = newStatus === 'In Progress' ? 'Started Task' : 'Finished Task';
                        const newNote = {
                            text: `${prefix}: ${updatedTasks[taskIndex].title} - ${getVehicleName(jobData.vehicleId)}`,
                            time: now
                        };
                        
                        const updatedNotes = [...(activeLog.notes || []), newNote];
                        await updateDoc(doc(db, 'businesses', tenantId, 'time_logs', activeLogDoc.id), { notes: updatedNotes });
                    }
                } catch (noteErr) {
                    console.error("Failed to manage timeclock hooks:", noteErr);
                }
            }

            toast.success(`Task marked as ${newStatus}`);
        } catch (err) {
            console.error(err);
            toast.error("Failed to update task");
        }
    };

    if (loading) return null;

    const myUid = currentUser?.uid;
    const sName = currentUser?.displayName || currentUser?.email || 'Unknown';
    
    const myAssignedJobs = jobs.map(j => {
        const myTasks = (j.tasks || []).map((t: any, idx: number) => ({...t, originalIndex: idx}))
            .filter((t: any) => t.assignedUids?.includes(myUid) && t.status !== 'Finished');
        return {
            ...j,
            myTasks
        };
    }).filter(j => j.myTasks.length > 0);

    const poolTasks: any[] = [];
    jobs.forEach(j => {
        if (j.status === 'Draft' || j.status === 'Delivered') return;
        (j.tasks || []).forEach((t: any, idx: number) => {
            if (t.status !== 'Finished' && (!t.assignedUids || t.assignedUids.length === 0)) {
                poolTasks.push({
                    jobId: j.id,
                    jobTitle: j.title,
                    taskIndex: idx,
                    ...t
                });
            }
        });
    });

    const weeklyBookTime = jobs.reduce((acc, j) => {
        if (!j.tasks) return acc;
        return acc + j.tasks.reduce((tAcc: number, t: any) => {
            if (t.status === 'Finished' && t.assignedUids?.includes(myUid)) {
                return tAcc + (Number(t.bookTime) || 0);
            }
            return tAcc;
        }, 0);
    }, 0);
    const queuedTime = myAssignedJobs.reduce((acc, j) => acc + j.myTasks.reduce((tAcc: number, t: any) => tAcc + (Number(t.bookTime) || 0), 0), 0);

    const computeShiftHours = (log: any): number => {
        if (!log.clockIn) return 0;
        let totalMs = 0;
        const outTime = log.clockOut ? new Date(log.clockOut).getTime() : Date.now();
        totalMs = outTime - new Date(log.clockIn).getTime();

        if (log.breaks && Array.isArray(log.breaks)) {
            log.breaks.forEach((b: any) => {
                if (b.start && b.type !== 'paid') {
                    const bEnd = b.end ? new Date(b.end).getTime() : Date.now();
                    totalMs -= (bEnd - new Date(b.start).getTime());
                }
            });
        }
        return Math.max(0, totalMs / (1000 * 60 * 60));
    };

    const actualLoggedHoursThisWeek = timeLogs.reduce((acc, log) => {
        const logDate = new Date(log.clockIn);
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - logDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays <= 7) {
            return acc + computeShiftHours(log);
        }
        return acc;
    }, 0);

    return (
        <div className="flex-1 bg-zinc-950 p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* 1. Personal Dashboard & Header */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                            <div>
                                <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                                    <span className="bg-accent/10 p-2 rounded-lg"><Wrench className="w-6 h-6 text-accent" /></span>
                                    Good morning, {sName.split(' ')[0]}
                                </h2>
                                <p className="mt-2 text-zinc-400">Current Shift: <span className="text-white font-mono font-bold ml-1 tracking-wider">Active</span></p>
                            </div>
                            <div className="flex flex-col gap-2 w-full sm:w-auto">
                                <button className="w-full sm:w-auto bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 px-6 py-2.5 rounded-lg text-sm font-bold tracking-wide uppercase transition-colors flex items-center justify-center gap-2">
                                    <PauseCircle className="w-4 h-4" /> Start Break
                                </button>
                                <button className="w-full sm:w-auto bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-6 py-2.5 rounded-lg text-sm font-bold tracking-wide uppercase transition-colors flex items-center justify-center gap-2">
                                    Punch Out
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-center">
                        <div className="grid grid-cols-2 gap-4 divide-x divide-zinc-800 mb-3">
                            <div>
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 text-center">Finished Book</h3>
                                <div className="flex items-end justify-center gap-1">
                                    <span className="text-3xl font-black text-emerald-400">{weeklyBookTime.toFixed(1)}</span>
                                    <span className="text-zinc-500 font-bold mb-1 text-xs">hrs</span>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 text-center">Real Time Logged</h3>
                                <div className="flex items-end justify-center gap-1">
                                    <span className="text-3xl font-black text-blue-400">{actualLoggedHoursThisWeek.toFixed(1)}</span>
                                    <span className="text-zinc-500 font-bold mb-1 text-xs">hrs</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center px-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Queued Potential:</span>
                            <span className="text-sm font-bold text-accent">+{queuedTime.toFixed(1)} hrs</span>
                        </div>
                    </div>
                </div>

                {/* Main Content Split */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* 2. My Active Assignments */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-semibold text-white">My Assignments</h3>
                            <span className="bg-zinc-800 text-zinc-300 text-xs font-bold px-2 py-1 rounded">{myAssignedJobs.length} Jobs Active</span>
                        </div>

                        {myAssignedJobs.length === 0 ? (
                            <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-8 text-center text-zinc-500">
                                You have no active assignments. Grab a task from the Shop Pool!
                            </div>
                        ) : myAssignedJobs.map(job => (
                            <div key={job.id} className="bg-zinc-900/50 rounded-2xl border border-white/5 overflow-hidden">
                                <div className="bg-zinc-800/50 p-4 border-b border-zinc-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <Link to={`/admin/jobs?id=${job.id}`} className="text-sm font-mono text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20 hover:bg-accent/20 transition-colors">{job.title}</Link>
                                            <span className="text-xs text-zinc-400 font-medium">{getCustomerName(job.customerId)}</span>
                                        </div>
                                        <h4 className="text-lg font-bold text-white">{getVehicleName(job.vehicleId)}</h4>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-1">Due Date</p>
                                        <p className="text-sm font-bold text-white">{job.dueDate || 'Unscheduled'}</p>
                                    </div>
                                </div>

                                <div className="p-4 space-y-3">
                                    {job.myTasks.map((t: any, idx: number) => (
                                        <div key={idx} className={`rounded-xl border p-4 ${t.status === 'In Progress' ? 'bg-zinc-800 border-l-2 border-l-accent border-y-zinc-700/50 border-r-zinc-700/50' : 'bg-zinc-800/30 border-zinc-700/50'}`}>
                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                                <div className="flex items-start gap-3">
                                                    {t.status === 'In Progress' ? (
                                                        <PlayCircle className="w-5 h-5 text-accent mt-0.5 shrink-0 animate-pulse" />
                                                    ) : (
                                                        <div className="w-5 h-5 rounded-full border-2 border-zinc-600 mt-0.5 shrink-0" />
                                                    )}
                                                    <div>
                                                        <h3 className="font-semibold text-white text-base">{t.title}</h3>
                                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${t.status === 'In Progress' ? 'bg-accent/20 text-accent border border-accent/30 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>{t.status}</span>
                                                            <span className="text-[10px] text-zinc-500 uppercase font-semibold pl-2 border-l border-zinc-700">Book: {t.bookTime}h</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {t.description && (
                                                    <div className="mt-3 text-sm text-zinc-400 bg-zinc-900/50 p-3 rounded-lg border border-zinc-700/50 whitespace-pre-wrap">
                                                        {t.description}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="mt-4 pt-3 border-t border-zinc-700/50 flex flex-wrap gap-2">
                                                {t.status !== 'In Progress' && (
                                                    <button 
                                                        disabled={t.isApproved === false}
                                                        onClick={() => handleUpdateTaskStatus(job.id, t.originalIndex, 'In Progress')} 
                                                        className={`flex-1 ${t.isApproved === false ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 opacity-60 cursor-not-allowed' : 'bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20'} py-2 px-3 rounded text-xs font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap`}
                                                    >
                                                        {t.isApproved === false ? <><span className="text-lg leading-none">⏳</span> Missing Approval</> : <><PlayCircle className="w-4 h-4" /> Clock In</>}
                                                    </button>
                                                )}
                                                {t.status === 'In Progress' && (
                                                    <button onClick={() => handleUpdateTaskStatus(job.id, t.originalIndex, 'Finished')} className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 py-2 px-3 rounded text-xs font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"><CheckCircle2 className="w-4 h-4"/> Mark Finished</button>
                                                )}
                                                <button onClick={() => {
                                                    alert("To request an edit for this task or shift, please use the Time Off & Requests tab in the Timeclock app.");
                                                }} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 py-2 px-4 rounded text-xs font-bold transition-colors flex items-center justify-center whitespace-nowrap">Edit Request</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 3. Shop Floor Pool Categories */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-zinc-400">Shop Pool</h3>
                            <span className="text-xs font-bold text-accent">{poolTasks.length} Available</span>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3 max-h-[800px] overflow-y-auto">
                            {poolTasks.length === 0 ? (
                                <p className="text-zinc-500 text-sm text-center py-4">No unassigned tasks available.</p>
                            ) : poolTasks.map((pt, i) => (
                                <div key={i} className={`transition-colors border rounded-lg p-3 group ${pt.isApproved === false ? 'bg-zinc-900/50 border-amber-500/10' : 'bg-zinc-800/50 hover:bg-zinc-800 border-zinc-700/50'}`}>
                                    <div className="flex items-start justify-between mb-1">
                                        <p className="text-[10px] uppercase font-bold text-zinc-500 line-clamp-1">{pt.jobTitle}</p>
                                        {pt.isApproved === false && <span className="text-[10px] font-black uppercase tracking-widest text-amber-500/70 border border-amber-500/20 px-1.5 rounded-sm">Pending</span>}
                                    </div>
                                    <h4 className={`font-bold text-sm mb-2 ${pt.isApproved === false ? 'text-zinc-500' : 'text-zinc-200'}`}>{pt.title}</h4>
                                    <div className="flex items-center justify-between">
                                        <span className={`text-xs font-bold ${pt.isApproved === false ? 'text-zinc-600' : 'text-emerald-400'}`}>+{pt.bookTime} hrs Book</span>
                                        {pt.isApproved !== false ? (
                                            <button onClick={() => handleUpdateTaskStatus(pt.jobId, pt.taskIndex, 'In Progress')} className="text-[10px] font-bold uppercase tracking-wider bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded transition-colors hidden group-hover:block">Claim Task</button>
                                        ) : (
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500/40">LOCKED</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
