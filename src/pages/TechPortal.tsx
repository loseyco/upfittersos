import { useState, useEffect, useMemo } from 'react';
import { Wrench, PauseCircle, SearchCode, X, Plus, MapPin, Info, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { collection, onSnapshot, query, where, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';

export function TechPortal() {
    const { currentUser, tenantId } = useAuth();
    const { checkPermission } = usePermissions();
    
    // Use the explicitly defined workspace role permission boundary
    const canQA = checkPermission('manage_qa');
    
    const [jobs, setJobs] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [timeLogs, setTimeLogs] = useState<any[]>([]);
    const [areas, setAreas] = useState<any[]>([]);
    const [taskTimeLogs, setTaskTimeLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [discoveryModal, setDiscoveryModal] = useState<{jobId: string, taskIndex: number, originalTask: any, isOpen: boolean, note: string} | null>(null);
    const [unplannedModal, setUnplannedModal] = useState({ jobId: '', isOpen: false, title: '', description: '' });
    const [breakdownModal, setBreakdownModal] = useState<{ isOpen: boolean, title: string, type: 'shift' | 'jobs', items: any[] }>({ isOpen: false, title: '', type: 'shift', items: [] });
    const [payCycle, setPayCycle] = useState('weekly');
    const [anchorDate, setAnchorDate] = useState('2024-01-01');

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

        const unsubAreas = onSnapshot(query(collection(db, 'business_zones'), where('tenantId', '==', tenantId)), (s) => {
            setAreas(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        let unsubLogs = () => {};
        let unsubTaskLogs = () => {};
        if (currentUser?.uid) {
            unsubLogs = onSnapshot(query(collection(db, 'businesses', tenantId, 'time_logs'), where('userId', '==', currentUser.uid)), (s) => {
                setTimeLogs(s.docs.map(d => ({ id: d.id, ...d.data() })));
            });
            unsubTaskLogs = onSnapshot(query(collection(db, 'businesses', tenantId, 'task_time_logs'), where('userId', '==', currentUser.uid)), (s) => {
                setTaskTimeLogs(s.docs.map(d => ({ id: d.id, ...d.data() })));
            });
        }
        
        const unsubTenant = onSnapshot(doc(db, 'businesses', tenantId), (s) => {
            if (s.exists()) {
                const data = s.data();
                if (data.payrollConfig) {
                    setPayCycle(data.payrollConfig.activeCycle || 'weekly');
                    setAnchorDate(data.payrollConfig.anchorDate || '2024-01-01');
                }
            }
        });

        return () => {
            unsubJobs();
            unsubVehicles();
            unsubCustomers();
            unsubLogs();
            unsubTaskLogs();
            unsubAreas();
            unsubTenant();
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

    const getAreaName = (aId?: string) => {
        if (!aId) return null;
        const a = areas.find(x => x.id === aId);
        return a?.label || aId;
    };

    const submitDiscoveryNote = async () => {
        if (!discoveryModal || !discoveryModal.note.trim()) return;
        try {
            const { jobId, taskIndex, note } = discoveryModal;
            const jobRef = doc(db, 'jobs', jobId);
            const jobSnap = await getDoc(jobRef);
            if (!jobSnap.exists()) return;

            const jobData = jobSnap.data();
            const updatedTasks = [...jobData.tasks];
            
            const discoveryEntry = {
                text: note.trim(),
                time: new Date().toISOString(),
                authorName: currentUser?.displayName || currentUser?.email || 'Tech'
            };

            updatedTasks[taskIndex].discoveryNotes = [...(updatedTasks[taskIndex].discoveryNotes || []), discoveryEntry];
            updatedTasks[taskIndex].hasDiscoveryTime = true;
            
            await updateDoc(jobRef, { tasks: updatedTasks });
            toast.success("Discovery note saved!");
            setDiscoveryModal(null);
        } catch (err) {
            console.error(err);
            toast.error("Failed to save discovery note");
        }
    };

    const handleCreateUnplannedTask = async () => {
        if (!unplannedModal.title || !unplannedModal.description) return toast.error("Title and description are required.");
        try {
            const jobRef = doc(db, 'jobs', unplannedModal.jobId);
            const jobSnap = await getDoc(jobRef);
            if (!jobSnap.exists()) return;
            const jobData = jobSnap.data();
            const newTask = {
                title: unplannedModal.title,
                description: unplannedModal.description,
                type: 'Diagnostic',
                status: 'In Progress',
                assignedUids: [currentUser?.uid],
                isRnD: true,
                straightTime: true,
                bookTime: 0
            };
            
            const tasks = [...(jobData.tasks || []), newTask];
            await updateDoc(jobRef, { tasks });
            
            toast.success("R&D Task added to job.");
            setUnplannedModal({ jobId: '', isOpen: false, title: '', description: '' });
        } catch (e) {
            toast.error("Failed to add task");
            console.error(e);
        }
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


    const myUid = currentUser?.uid;
    const sName = currentUser?.displayName || currentUser?.email || 'Unknown';
    
    const myAssignedJobs = useMemo(() => {
        let activeJobs = jobs.map(j => {
            const myTasks: any[] = (j.tasks || []).map((t: any, idx: number) => ({...t, originalIndex: idx}))
                .filter((t: any) => t.isApproved !== false && t.assignedUids?.includes(myUid) && t.status !== 'Finished');
            return { ...j, myTasks };
        }).filter(j => j.myTasks.length > 0 && j.status !== 'Blocked' && j.status !== 'Draft' && j.status !== 'Delivered');

        activeJobs.sort((a, b) => {
            const aHasActive = a.myTasks.some((t: any) => t.status === 'In Progress');
            const bHasActive = b.myTasks.some((t: any) => t.status === 'In Progress');
            if (aHasActive && !bHasActive) return -1;
            if (!aHasActive && bHasActive) return 1;

            const priorityMap: any = { 'High': 3, 'Medium': 2, 'Low': 1 };
            const pA = priorityMap[a.priority] || 0;
            const pB = priorityMap[b.priority] || 0;
            if (pA !== pB) return pB - pA; // highest priority first
            
            const dA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const dB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            if (dA !== dB) return dA - dB;

            const cA = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
            const cB = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
            return cA - cB;
        });
        return activeJobs;
    }, [jobs, myUid]);

    const blockedJobs = useMemo(() => {
        return jobs.map(j => {
            const myTasks: any[] = (j.tasks || []).map((t: any, idx: number) => ({...t, originalIndex: idx}))
                .filter((t: any) => t.isApproved !== false && t.assignedUids?.includes(myUid) && t.status !== 'Finished');
            return { ...j, myTasks };
        }).filter(j => j.myTasks.length > 0 && j.status === 'Blocked');
    }, [jobs, myUid]);

    const poolTasks: any[] = [];
    jobs.forEach(j => {
        if (j.status === 'Draft' || j.status === 'Delivered') return;
        (j.tasks || []).forEach((t: any, idx: number) => {
            if (t.isApproved !== false && t.status !== 'Finished' && t.status !== 'Ready for QA' && (!t.assignedUids || t.assignedUids.length === 0)) {
                poolTasks.push({
                    jobId: j.id,
                    jobTitle: j.title,
                    taskIndex: idx,
                    ...t
                });
            }
        });
    });

    const pendingQATasks: any[] = [];
    if (canQA) {
        jobs.forEach(j => {
            if (j.status === 'Draft' || j.status === 'Delivered') return;
            (j.tasks || []).forEach((t: any, idx: number) => {
                if (t.status === 'Ready for QA') {
                    pendingQATasks.push({
                        jobId: j.id,
                        jobTitle: j.title,
                        taskIndex: idx,
                        vehicleId: j.vehicleId,
                        customerId: j.customerId,
                        ...t
                    });
                }
            });
        });
    }


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



    const activePayPeriod = useMemo(() => {
        if (!anchorDate || !payCycle) return null;
        
        const now = new Date();
        const rawDate = new Date(anchorDate);
        // Fallback to now if broken to prevent catastrophic UI failure
        const baseDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;
        
        const anchorEndTz = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 23, 59, 59, 999);
        let start = new Date(anchorEndTz);
        let end = new Date(anchorEndTz);

        const anchorUTC = Date.UTC(anchorEndTz.getFullYear(), anchorEndTz.getMonth(), anchorEndTz.getDate());
        const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        const daysDiff = Math.round((nowUTC - anchorUTC) / (24 * 60 * 60 * 1000));

        if (payCycle === 'weekly') {
            const weeksElapsed = daysDiff > 0 ? Math.ceil(daysDiff / 7) : Math.floor(daysDiff / 7);
            end = new Date(anchorEndTz);
            end.setDate(end.getDate() + (weeksElapsed * 7));
            start = new Date(end);
            start.setDate(start.getDate() - 7);
            start.setMilliseconds(start.getMilliseconds() + 1000);
        } else if (payCycle === 'biweekly') {
            const biweeksElapsed = daysDiff > 0 ? Math.ceil(daysDiff / 14) : Math.floor(daysDiff / 14);
            end = new Date(anchorEndTz);
            end.setDate(end.getDate() + (biweeksElapsed * 14));
            start = new Date(end);
            start.setDate(start.getDate() - 14);
            start.setMilliseconds(start.getMilliseconds() + 1000);
        } else if (payCycle === 'monthly') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        } else if (payCycle === 'semimonthly') {
            if (now.getDate() <= 15) {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59);
            } else {
                start = new Date(now.getFullYear(), now.getMonth(), 16);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            }
        }
        
        return { start, end };
    }, [anchorDate, payCycle]);

    const payPeriodData = useMemo(() => {
        if (!activePayPeriod) return { hours: 0, logs: [] };
        const logsInPeriod = timeLogs.filter((log: any) => {
            const logTime = new Date(log.clockIn).getTime();
            return logTime >= activePayPeriod.start.getTime() && logTime <= activePayPeriod.end.getTime();
        });
        const hours = logsInPeriod.reduce((acc, log) => acc + computeShiftHours(log), 0);
        return { hours, logs: logsInPeriod };
    }, [timeLogs, activePayPeriod]);

    const todayData = useMemo(() => {
        const _now = new Date();
        const todayStart = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate()).getTime();
        const todayEnd = todayStart + (24 * 60 * 60 * 1000) - 1;

        const logsToday = timeLogs.filter((log: any) => {
            const logTime = new Date(log.clockIn).getTime();
            return logTime >= todayStart && logTime <= todayEnd;
        });
        const hours = logsToday.reduce((acc, log) => acc + computeShiftHours(log), 0);
        return { hours, logs: logsToday };
    }, [timeLogs]);

    const todayTaskData = useMemo(() => {
        const _now = new Date();
        const todayStart = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate()).getTime();
        const todayEnd = todayStart + (24 * 60 * 60 * 1000) - 1;

        const logsToday = taskTimeLogs.filter((log: any) => {
            const logTime = new Date(log.clockIn).getTime();
            return logTime >= todayStart && logTime <= todayEnd;
        });
        const hours = logsToday.reduce((acc, log) => acc + computeShiftHours(log), 0);
        return { hours, logs: logsToday };
    }, [taskTimeLogs]);

    if (loading) return null;

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

                    <div className="relative z-10 w-full xl:w-auto flex flex-col border-t xl:border-t-0 xl:border-l border-zinc-800 pt-6 xl:pt-0 xl:pl-8 shrink-0 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-center">
                        <div className="flex sm:grid sm:grid-cols-3 gap-3 sm:gap-6 divide-zinc-800 mb-3 text-center flex-wrap sm:divide-x justify-center">
                            <div className="cursor-pointer group" onClick={() => setBreakdownModal({ isOpen: true, title: 'Current Pay Period', type: 'shift', items: payPeriodData.logs })}>
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 flex items-center justify-center gap-1 group-hover:text-blue-400 transition-colors">
                                    Pay Period <Info className="w-3 h-3 text-zinc-600 group-hover:text-blue-400 transition-colors" />
                                </h3>
                                <div className="flex items-end justify-center gap-1 group-hover:scale-105 transition-transform">
                                    <span className="text-2xl sm:text-3xl font-black text-blue-400">{payPeriodData?.hours?.toFixed(1) || '0.0'}</span>
                                    <span className="text-zinc-500 font-bold mb-1 text-xs">hrs</span>
                                </div>
                            </div>
                            <div className="cursor-pointer group" onClick={() => setBreakdownModal({ isOpen: true, title: "Today's Shift Time", type: 'shift', items: todayData.logs })}>
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 flex items-center justify-center gap-1 group-hover:text-emerald-400 transition-colors">
                                    Shift <Info className="w-3 h-3 text-zinc-600 group-hover:text-emerald-400 transition-colors" />
                                </h3>
                                <div className="flex items-end justify-center gap-1 group-hover:scale-105 transition-transform">
                                    <span className="text-2xl sm:text-3xl font-black text-emerald-400">{todayData?.hours?.toFixed(1) || '0.0'}</span>
                                    <span className="text-zinc-500 font-bold mb-1 text-xs">hrs</span>
                                </div>
                            </div>
                            <div className="cursor-pointer group" onClick={() => setBreakdownModal({ isOpen: true, title: "Today's Time on Jobs", type: 'jobs', items: todayTaskData.logs })}>
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 flex items-center justify-center gap-1 group-hover:text-indigo-400 transition-colors">
                                    Jobs <Info className="w-3 h-3 text-zinc-600 group-hover:text-indigo-400 transition-colors" />
                                </h3>
                                <div className="flex items-end justify-center gap-1 group-hover:scale-105 transition-transform">
                                    <span className="text-2xl sm:text-3xl font-black text-indigo-400">{todayTaskData?.hours?.toFixed(1) || '0.0'}</span>
                                    <span className="text-zinc-500 font-bold mb-1 text-xs">hrs</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-2 pt-3 border-t border-zinc-800 flex justify-between items-center px-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Queued Potential:</span>
                            <span className="text-sm font-bold text-accent">+{queuedTime?.toFixed(1) || '0.0'} hrs</span>
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
                            <div key={job.id} className={`bg-zinc-900/50 rounded-2xl border ${job.status === 'Blocked' ? 'border-amber-500/30' : 'border-white/5'} overflow-hidden`}>
                                <div className={`${job.status === 'Blocked' ? 'bg-amber-950/20' : 'bg-zinc-800/50'} p-4 border-b border-zinc-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <span 
                                                onClick={() => window.location.href = `/business/jobs/${job.id}`}
                                                className="text-sm font-mono text-accent bg-accent/10 hover:bg-accent/20 cursor-pointer px-2 py-0.5 rounded border border-accent/20 transition-colors flex items-center gap-1.5"
                                            >
                                                {job.title} <ArrowUpRight className="w-3 h-3" />
                                            </span>
                                            <span className="text-xs text-zinc-400 font-medium">{getCustomerName(job.customerId)}</span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1">
                                            <h4 className="text-lg font-bold text-white">{getVehicleName(job.vehicleId)}</h4>
                                            {job.currentLocationId && (
                                                <button onClick={() => window.open(`/business/areas/${job.currentLocationId}`, '_blank')} className="text-[10px] text-indigo-400 font-bold hover:text-indigo-300 flex items-center gap-1 uppercase tracking-widest bg-indigo-500/10 px-2 py-1 rounded transition-colors" title="Open Live Area Dashboard">
                                                    <MapPin className="w-3 h-3" /> {getAreaName(job.currentLocationId)}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0 flex flex-col items-end">
                                        <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-1">Due Date</p>
                                        <p className="text-sm font-bold text-white">{job.dueDate || 'Unscheduled'}</p>
                                        <button 
                                            onClick={() => setUnplannedModal({ jobId: job.id, isOpen: true, title: '', description: '' })}
                                            className="text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-lg flex items-center justify-center gap-1.5 font-bold uppercase tracking-widest transition-colors mt-2 whitespace-nowrap"
                                        >
                                            <Plus className="w-3 h-3" /> Add R&D Task
                                        </button>
                                    </div>
                                </div>

                                <div className="p-4 space-y-3">
                                    {job.myTasks.map((t: any, idx: number) => {
                                        const isTaskDiscovery = taskTimeLogs.some(log => log.jobId === job.id && log.taskIndex === t.originalIndex && log.isDiscovery && !log.clockOut);
                                        const matchLogs = taskTimeLogs.filter(l => l.jobId === job.id && l.taskIndex === t.originalIndex);
                                        const loggedHours = matchLogs.reduce((acc, log) => acc + computeShiftHours(log), 0);
                                        const bookTimeNum = Number(t.bookTime) || 0;
                                        const prog = bookTimeNum > 0 ? Math.min(100, Math.round((loggedHours / bookTimeNum) * 100)) : 0;
                                        const isOver = loggedHours > bookTimeNum;
                                        
                                        const isUnstartedButHasTime = (t.status === 'Not Started' || !t.status) && loggedHours > 0;
                                        const effectiveStatusDisplay = isUnstartedButHasTime ? 'Paused' : (t.status || 'Not Started');
                                        
                                        return (
                                        <div key={idx} className={`rounded-xl border p-4 ${t.status === 'In Progress' ? (isTaskDiscovery ? 'bg-amber-950/30 border-l-2 border-l-amber-500 border-y-amber-500/20 border-r-amber-500/20' : 'bg-zinc-800 border-l-2 border-l-accent border-y-zinc-700/50 border-r-zinc-700/50') : 'bg-zinc-800/30 border-zinc-700/50'}`}>
                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 cursor-pointer" onClick={() => window.location.href = `/business/tech/task/${job.id}/${t.originalIndex}`}>
                                                <div className="flex items-start gap-3 flex-1 w-full">
                                                    <div className="flex-1 w-full">
                                                        <h3 className="font-semibold text-white text-base hover:text-accent transition-colors">{t.title}</h3>
                                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${t.status === 'In Progress' ? 'bg-accent/20 text-accent border border-accent/30 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>{effectiveStatusDisplay}</span>
                                                            <span className="text-[10px] text-zinc-500 uppercase font-semibold pl-2 border-l border-zinc-700">Book: {t.bookTime}h</span>
                                                        </div>
                                                        {t.description && (
                                                            <div className="mt-3 text-sm text-zinc-400 bg-zinc-900/50 p-3 rounded-lg border border-zinc-700/50 whitespace-pre-wrap">
                                                                {t.description}
                                                            </div>
                                                        )}
                                                        <div className="mt-4">
                                                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">
                                                                <span>Time on Task</span>
                                                                <span className={isOver ? 'text-rose-400' : 'text-zinc-400'}>{loggedHours.toFixed(1)}h / {t.bookTime}h</span>
                                                            </div>
                                                            <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-white/5">
                                                                <div 
                                                                    className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-rose-500' : 'bg-accent'}`} 
                                                                    style={{ width: `${prog}%` }} 
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            </div>
                        ))}

                        {blockedJobs.length > 0 && (
                            <div className="mt-8">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-semibold text-zinc-400">Blocked Jobs</h3>
                                    <span className="bg-amber-500/10 text-amber-500 text-xs font-bold px-2 py-1 rounded border border-amber-500/20">{blockedJobs.length} Blocked</span>
                                </div>
                                <div className="space-y-4">
                                    {blockedJobs.map(job => (
                                        <div key={job.id} className="bg-amber-950/10 rounded-2xl border border-amber-500/30 overflow-hidden">
                                            <div className="bg-amber-950/30 p-4 border-b border-amber-500/20 flex items-center justify-between">
                                                <div>
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <span className="text-sm font-mono text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">{job.title}</span>
                                                        <span className="text-xs text-zinc-400">{getCustomerName(job.customerId)}</span>
                                                    </div>
                                                    <h4 className="text-lg font-bold text-white mt-1">{getVehicleName(job.vehicleId)}</h4>
                                                </div>
                                            </div>
                                            <div className="p-4">
                                                <div className="text-sm font-bold text-amber-500 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                                    This job is currently blocked. Please wait for the service advisor to resolve the block.
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {canQA && pendingQATasks.length > 0 && (
                            <div className="mt-8">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-semibold text-zinc-400 flex items-center gap-2">
                                        <ShieldCheck className="w-5 h-5 text-blue-400" /> Pending QA Inspections
                                    </h3>
                                    <span className="bg-blue-500/10 text-blue-400 text-xs font-bold px-2 py-1 rounded border border-blue-500/20">{pendingQATasks.length} Items</span>
                                </div>
                                <div className="space-y-4">
                                    {pendingQATasks.map((t, idx) => (
                                        <div key={idx} className="bg-blue-950/20 rounded-2xl border border-blue-500/30 overflow-hidden hover:border-blue-500/50 transition-colors">
                                            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer" onClick={() => window.location.href = `/business/tech/task/${t.jobId}/${t.taskIndex}`}>
                                                <div>
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <span className="text-[10px] uppercase font-black bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 shadow-inner">Requires QA</span>
                                                        <span className="text-sm font-mono text-white bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">{t.jobTitle}</span>
                                                    </div>
                                                    <h4 className="text-white font-bold mt-2">{t.title}</h4>
                                                    <p className="text-sm text-zinc-400">{getVehicleName(t.vehicleId)} &bull; {getCustomerName(t.customerId)}</p>
                                                </div>
                                                <div className="shrink-0 flex items-center gap-3">
                                                    <button className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors shadow-lg shadow-blue-500/20">
                                                        Review Task
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
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

            {/* Discovery Modal */}
            {discoveryModal && discoveryModal.isOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative">
                        <button onClick={() => setDiscoveryModal(null)} className="absolute top-4 right-4 text-zinc-500 hover:text-white p-2 bg-zinc-900/50 hover:bg-zinc-800 rounded-full transition-colors">
                            <X className="w-5 h-5"/>
                        </button>
                        <h3 className="text-xl font-bold text-white mb-2">Log Discovery / R&D Information</h3>
                        <p className="text-sm text-zinc-400 mb-6 font-mono">For task: <span className="text-accent">{discoveryModal.originalTask?.title}</span></p>
                        
                        <textarea 
                            value={discoveryModal.note}
                            onChange={(e) => setDiscoveryModal({...discoveryModal, note: e.target.value})}
                            placeholder="What did you discover? What parts or procedures were non-standard? This information will help us build SOPs."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white h-32 resize-none mb-4"
                        />
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setDiscoveryModal(null)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-zinc-400 hover:bg-zinc-800 transition-colors">Skip for now</button>
                            <button 
                                onClick={submitDiscoveryNote}
                                disabled={!discoveryModal.note.trim()}
                                className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors"
                            >
                                Save Discovery Note
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Unplanned Task Modal */}
            {unplannedModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-zinc-900 border border-amber-500/30 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden shadow-amber-500/10 relative">
                        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                            <div>
                                <h3 className="text-xl font-black text-amber-500 tracking-tight flex items-center gap-2">
                                    <SearchCode className="w-5 h-5" /> Add Unplanned Task (R&D)
                                </h3>
                                <p className="text-xs text-amber-500/80 font-bold uppercase tracking-wider mt-1">Straight Time / Guaranteed Hourly</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1.5 ml-1">Task Title <span className="text-red-500">*</span></label>
                                <input value={unplannedModal.title} onChange={e => setUnplannedModal(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Broken Chassis Bolt Extraction" className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-lg p-3 text-sm text-white focus:outline-none transition-colors" />
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1.5 ml-1">Scope / Reason <span className="text-red-500">*</span></label>
                                <textarea value={unplannedModal.description} onChange={e => setUnplannedModal(p => ({ ...p, description: e.target.value }))} placeholder="State what was discovered and what needs to be solved..." className="w-full min-h-[100px] align-top bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-lg p-3 text-sm text-white focus:outline-none transition-colors" />
                            </div>
                        </div>
                        <div className="p-6 border-t border-zinc-800 flex justify-end gap-3 bg-zinc-900">
                            <button onClick={() => setUnplannedModal({ jobId: '', isOpen: false, title: '', description: '' })} className="px-6 py-2.5 rounded-xl font-bold text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">Cancel</button>
                            <button onClick={handleCreateUnplannedTask} className="bg-amber-600 hover:bg-amber-500 text-white font-black py-2.5 px-6 rounded-xl transition-all shadow-lg text-sm">Add Task to Job</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Global Modals overlay... */}
            {breakdownModal.isOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
                        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                            <div>
                                <h2 className="text-xl font-bold text-white">{breakdownModal.title} Breakdown</h2>
                                <p className="text-sm text-zinc-400 mt-1">Audit trail mapping log sums to the reported metric</p>
                            </div>
                            <button onClick={() => setBreakdownModal(m => ({...m, isOpen: false}))} className="text-zinc-400 hover:text-white transition-colors bg-zinc-800/50 hover:bg-zinc-800 p-3 rounded-xl border border-zinc-700/50">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-2 overflow-y-auto custom-scrollbar flex-1 bg-zinc-950/50">
                            <div className="flex flex-col gap-2 p-2">
                                {breakdownModal.items.length === 0 ? (
                                    <div className="text-center p-6 text-zinc-500 font-medium">No recorded entries found for this metric.</div>
                                ) : breakdownModal.items.map((log: any, i: number) => {
                                    const clockIn = new Date(log.clockIn);
                                    const clockOut = log.clockOut ? new Date(log.clockOut) : null;
                                    const hrs = computeShiftHours(log);
                                    return (
                                        <div key={i} className="flex flex-col gap-2 bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
                                            <div className="flex items-center justify-between">
                                                <div className="flex flex-col">
                                                    <span className="text-white font-bold">{breakdownModal.type === 'jobs' ? log.taskName || 'Logged Task' : 'Shift Log'} {breakdownModal.type === 'shift' && !clockOut && <span className="ml-2 text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Active</span>}</span>
                                                    <span className="text-zinc-500 text-xs mt-0.5">{breakdownModal.type === 'jobs' ? log.vehicleName : (clockIn.toLocaleDateString() + ' • ' + (log.isDiscovery ? 'R&D Clock' : 'Standard Shift'))}</span>
                                                </div>
                                                <div className="text-right flex items-baseline gap-1">
                                                    <span className="text-xl font-black text-white">{hrs.toFixed(2)}</span>
                                                    <span className="text-zinc-500 text-xs font-bold">hrs</span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-800/50 font-mono text-[10px] text-zinc-400">
                                                <div className="flex-1 flex items-center justify-between bg-zinc-950 px-2 py-1 rounded">
                                                    <span>IN:</span> <span className="text-emerald-400">{clockIn.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                </div>
                                                <div className="flex-1 flex items-center justify-between bg-zinc-950 px-2 py-1 rounded">
                                                    <span>OUT:</span> <span className={!clockOut ? "text-amber-400" : "text-zinc-300"}>{clockOut ? clockOut.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Active'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        <div className="p-4 border-t border-zinc-800 bg-zinc-900 flex justify-between items-center px-6">
                            <span className="text-zinc-400 font-bold uppercase tracking-wider text-xs">Gross Formula Yield:</span>
                            <span className="text-lg font-black text-white">{breakdownModal.items.reduce((acc, log) => acc + computeShiftHours(log), 0).toFixed(2)} <span className="text-sm font-bold text-zinc-500">hrs</span></span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
