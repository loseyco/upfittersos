import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { api } from '../../lib/api';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Building2, Clock, CheckCircle2, AlertTriangle, Hammer, ArrowRight, Package, Info, Wrench, CalendarSync, BarChart3, ShieldCheck, Truck, Layers, Map, Megaphone, X, SearchCode, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { TimeClockApp } from './TimeClockApp';
import { TechPortal } from '../TechPortal';

const PermissionExplainer = ({ reason }: { reason: string }) => (
    <button 
        type="button" 
        onClick={(e) => { 
            e.preventDefault(); 
            e.stopPropagation(); 
            toast.success(reason, { 
                icon: 'ℹ️', 
                duration: 6000,
                style: { borderRadius: '12px', background: '#18181b', color: '#e4e4e7', border: '1px solid #27272a' }
            });
        }} 
        className="absolute top-3 right-3 p-1.5 bg-zinc-950/50 hover:bg-zinc-800 text-zinc-500 hover:text-accent rounded-full transition-colors z-20"
        title="Why am I seeing this?"
    >
        <Info className="w-4 h-4" />
    </button>
);

const WidgetSoonBadge = () => (
    <div className="absolute top-4 right-4 z-20">
        <span className="bg-amber-500/20 text-amber-500 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg shadow-lg backdrop-blur-sm">
            #SOON
        </span>
    </div>
);

export function MissionControlDashboard() {
    const { currentUser, tenantId, role, roles, simulatedRole, startSimulation, endSimulation } = useAuth();
    const { checkPermission, loading, businessRoles } = usePermissions();
    const [businessName, setBusinessName] = useState('Loading Dashboard...');
    
    // Bottom Sheet Architecture State
    const [activeDrawerContext, setActiveDrawerContext] = useState<{ id: string, title?: string, type: 'timeclock' | 'job' | 'techportal', payload?: any } | null>(null);

    // Prevent body scroll when drawer is open
    useEffect(() => {
        if (activeDrawerContext) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [activeDrawerContext]);

    // Live Data Feed: Timeclock
    const [activeTimeLog, setActiveTimeLog] = useState<any>(null);
    const [elapsedShiftTime, setElapsedShiftTime] = useState<string>('00:00:00');

    // Advanced Shift Stats
    const [timeLogs, setTimeLogs] = useState<any[]>([]);
    const [taskTimeLogs, setTaskTimeLogs] = useState<any[]>([]);
    const [globalOpenTaskLogs, setGlobalOpenTaskLogs] = useState<any[]>([]);
    const [payCycle, setPayCycle] = useState<string>('weekly');
    const [anchorDate, setAnchorDate] = useState<string>('2024-01-01');

    // Timeclock Listener
    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL' || !currentUser?.uid) return;
        
        const unsubLogs = onSnapshot(
            query(collection(db, 'businesses', tenantId, 'time_logs'), where('userId', '==', currentUser.uid), where('status', '==', 'open')),
            (snap) => {
                if (!snap.empty) {
                    setActiveTimeLog({ id: snap.docs[0].id, ...snap.docs[0].data() });
                } else {
                    setActiveTimeLog(null);
                    setElapsedShiftTime('00:00:00');
                }
            },
            (err) => console.error('Dashboard Time Feed Error:', err)
        );
        return () => unsubLogs();
    }, [tenantId, currentUser?.uid]);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL' || !currentUser?.uid) return;

        const unsubLogs = onSnapshot(query(collection(db, 'businesses', tenantId, 'time_logs'), where('userId', '==', currentUser.uid)), (s) => {
            setTimeLogs(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsubTaskLogs = onSnapshot(query(collection(db, 'businesses', tenantId, 'task_time_logs'), where('userId', '==', currentUser.uid)), (s) => {
            setTaskTimeLogs(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsubTenant = onSnapshot(doc(db, 'businesses', tenantId), (s) => {
            if (s.exists()) {
                const data = s.data();
                if (data.payrollConfig) {
                    setPayCycle(data.payrollConfig.activeCycle || 'weekly');
                    setAnchorDate(data.payrollConfig.anchorDate || '2024-01-01');
                }
            }
        });

        const unsubGlobalOpenTaskLogs = onSnapshot(query(collection(db, 'businesses', tenantId, 'task_time_logs'), where('status', '==', 'open')), (s) => {
            setGlobalOpenTaskLogs(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubLogs();
            unsubTaskLogs();
            unsubTenant();
            unsubGlobalOpenTaskLogs();
        };
    }, [tenantId, currentUser?.uid]);

    // Timeclock Ticker
    useEffect(() => {
        if (!activeTimeLog) return;
        
        const tick = () => {
            const start = new Date(activeTimeLog.clockIn).getTime();
            const now = new Date().getTime();
            let totalMs = Math.max(0, now - start);
            
            if (activeTimeLog.breaks && Array.isArray(activeTimeLog.breaks)) {
                activeTimeLog.breaks.forEach((b: any) => {
                    const bStart = new Date(b.start).getTime();
                    const bEnd = b.end ? new Date(b.end).getTime() : now;
                    totalMs -= (bEnd - bStart);
                });
            }
            
            const totalSecs = Math.floor(totalMs / 1000);
            const hrs = Math.floor(totalSecs / 3600);
            const mins = Math.floor((totalSecs % 3600) / 60);
            const secs = totalSecs % 60;
            
            setElapsedShiftTime(
                `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
            );
        };
        
        tick();
        const tInt = setInterval(tick, 1000);
        return () => clearInterval(tInt);
    }, [activeTimeLog]);

    // System Check
    useEffect(() => {
        const fetchWorkspaceMeta = async () => {
            if (!currentUser || !tenantId) return;
            try {
                if (tenantId !== 'GLOBAL' && tenantId !== 'unassigned') {
                    const res = await api.get(`/businesses/${tenantId}`);
                    if (res.data && res.data.name) {
                        setBusinessName(res.data.name);
                    } else {
                        setBusinessName('Operations Dashboard');
                    }
                } else {
                    setBusinessName('Unassigned Identity');
                }
            } catch (err) {
                console.error("Failed to load workspace meta", err);
                setBusinessName('Access Restricted');
            }
        };
        fetchWorkspaceMeta();
    }, [currentUser, tenantId]);

    // Active jobs cache
    const [allJobs, setAllJobs] = useState<any[]>([]);
    const [allStaff, setAllStaff] = useState<any[]>([]);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        api.get(`/businesses/${tenantId}/staff`).then(res => {
            setAllStaff(res.data || []);
        }).catch(err => console.error("Failed to load staff", err));
    }, [tenantId]);

    useEffect(() => {
        if (!currentUser?.uid || !tenantId || tenantId === 'GLOBAL') return;
        
        // Track jobs for Floor Widget
        const qJobs = query(
            collection(db, 'jobs'),
            where('tenantId', '==', tenantId)
        );
        const unsubJobs = onSnapshot(qJobs, (snap) => {
            const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAllJobs(fetched.filter((j: any) => !j.archived));
        });

        return () => {
            unsubJobs();
        };
    }, [currentUser, tenantId]);

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

    const activeJobs = useMemo(() => {
        const active = allJobs.filter((j: any) => {
            if (j.archived || j.status === 'Draft') return false;
            return (j.tasks || []).some((t: any) => t.status === 'In Progress' || t.status === 'Blocked' || t.status === 'Ready for QA');
        });
        
        active.sort((a: any, b: any) => {
            const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
            const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
            return timeB - timeA;
        });
        
        return active.slice(0, 8); // Show top 8
    }, [allJobs]);

    const myUid = currentUser?.uid;
    const myAssignedJobs = useMemo(() => {
        let assigned = allJobs.map(j => {
            const myTasks: any[] = (j.tasks || []).map((t: any, idx: number) => ({...t, originalIndex: idx}))
                .filter((t: any) => t.isApproved !== false && t.assignedUids?.includes(myUid) && t.status !== 'Finished' && t.status !== 'Ready for QA');
            return { ...j, myTasks };
        }).filter(j => j.myTasks.length > 0 && j.status !== 'Blocked' && j.status !== 'Draft' && j.status !== 'Delivered');

        assigned.sort((a, b) => {
            const aHasActive = a.myTasks.some((t: any) => t.status === 'In Progress');
            const bHasActive = b.myTasks.some((t: any) => t.status === 'In Progress');
            if (aHasActive && !bHasActive) return -1;
            if (!aHasActive && bHasActive) return 1;

            const priorityMap: any = { 'High': 3, 'Medium': 2, 'Low': 1 };
            const pA = priorityMap[a.priority] || 0;
            const pB = priorityMap[b.priority] || 0;
            if (pA !== pB) return pB - pA; // highest priority first
            
            const aDate = a.pickupEta || a.completionEta || a.dueDate || a.desiredPickupDate;
            const bDate = b.pickupEta || b.completionEta || b.dueDate || b.desiredPickupDate;
            const dA = aDate ? new Date(aDate).getTime() : Infinity;
            const dB = bDate ? new Date(bDate).getTime() : Infinity;
            if (dA !== dB) return dA - dB;

            const cA = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
            const cB = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
            return cA - cB;
        });
        return assigned.slice(0, 5); // Just show top 5 on dashboard
    }, [allJobs, myUid]);

    const queuedTime = myAssignedJobs.reduce((acc: any, j: any) => acc + j.myTasks.reduce((tAcc: number, t: any) => tAcc + (Number(t.bookTime) || 0), 0), 0);

    const qaPendingJobs = useMemo(() => {
        let assigned = allJobs.map(j => {
            const qaTasks: any[] = (j.tasks || []).map((t: any, idx: number) => ({...t, originalIndex: idx}))
                .filter((t: any) => t.status === 'Ready for QA');
            return { ...j, qaTasks };
        }).filter(j => j.qaTasks.length > 0 && j.status !== 'Draft' && !j.archived);

        assigned.sort((a, b) => {
            const cA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
            const cB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
            return cA - cB; // Oldest QA first
        });
        return assigned;
    }, [allJobs]);

    const isSuperAdmin = role === 'system_owner' || role === 'super_admin';
    const firstName = currentUser?.displayName ? currentUser.displayName.split(' ')[0] : 'Commander';

    return (
        <div className="min-h-screen bg-zinc-950 p-3 md:p-8 relative overflow-hidden flex flex-col">
            {/* Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="max-w-[2560px] xl:px-4 2xl:px-8 mx-auto w-full relative z-10 space-y-4 md:space-y-8 flex-1">
                {/* Header Profile */}
                <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-3 md:gap-6 pb-4 md:pb-6 border-b border-zinc-800/50">
                    <div>
                        <div className="flex items-center gap-2 md:gap-3 mb-1.5 md:mb-2">
                            <div className="h-6 w-6 md:h-8 md:w-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shadow-inner shrink-0">
                                <Building2 className="w-3 h-3 md:w-4 md:h-4 text-accent" />
                            </div>
                            <span className="text-[10px] md:text-xs font-bold text-accent uppercase tracking-widest leading-none drop-shadow-[0_0_8px_rgba(20,184,166,0.5)] truncate">
                                {businessName} • OPERATIONS PORTAL
                            </span>
                        </div>
                        <h1 className="text-xl md:text-5xl font-light text-zinc-300 tracking-tight">
                            Welcome back, <span className="font-black text-white">{firstName}</span>
                        </h1>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-zinc-400">Identity Bound As</span>
                        <div className="flex items-center gap-2 mt-1">
                            {checkPermission('simulate_roles') ? (
                                <select 
                                    className={`bg-accent/20 text-accent border border-accent/30 text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-lg outline-none cursor-pointer hover:bg-accent/30 transition-colors ${simulatedRole ? 'ring-2 ring-amber-500 animate-pulse-slow' : ''}`}
                                    value={simulatedRole || ""}
                                    onChange={(e) => {
                                        if (e.target.value === "") {
                                            endSimulation();
                                            toast.success('Simulation ended. Returned to native identity.');
                                        } else {
                                            startSimulation(e.target.value);
                                            toast.success(`Simulating views for: ${businessRoles[e.target.value]?.label || e.target.value}`);
                                        }
                                    }}
                                    title="Simulate Workspace Role"
                                >
                                    <option value="" className="bg-zinc-900 text-zinc-300">
                                        NATIVE: {(roles?.[0] || role)?.replace('_', ' ') || 'Unassigned'}
                                    </option>
                                    <optgroup label="Simulate As..." className="bg-zinc-950 text-zinc-500">
                                        {Object.entries(businessRoles || {}).map(([k, r]) => (
                                            <option key={k} value={k} className="bg-zinc-900 text-zinc-300">
                                                VIEW AS: {r.label.toUpperCase()}
                                            </option>
                                        ))}
                                    </optgroup>
                                </select>
                            ) : (
                                <span className="bg-accent/20 text-accent border border-accent/30 text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-lg">
                                    {simulatedRole ? `SIMULATED: ${businessRoles[simulatedRole]?.label || simulatedRole}` : ((roles?.[0] || role)?.replace('_', ' ') || 'Staff')}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Dashboard Grid */}
                {loading ? (
                    <div className="animate-pulse space-y-6">
                        <div className="h-32 bg-zinc-900/50 rounded-2xl w-full"></div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="h-64 bg-zinc-900/50 rounded-2xl lg:col-span-2"></div>
                            <div className="h-64 bg-zinc-900/50 rounded-2xl"></div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {/* First Major Split: Jobs / Floor vs Personal Tasks */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 md:gap-8">
                            
                            {(isSuperAdmin || checkPermission('manage_jobs')) && (
                                <div className="relative lg:col-span-2 xl:col-span-2 2xl:col-span-3 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 flex flex-col">
                                    <PermissionExplainer reason="Because you hold 'manage_jobs' credentials, you can see all live operational movement on the floor." />
                                    <div className={`flex-1 flex flex-col`}>
                                        <div className="flex items-center justify-between mb-6">
                                            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                                <Hammer className="w-5 h-5 text-accent" /> Active Jobs
                                            </h2>
                                            <Link to="/business/jobs" className="text-xs font-bold text-zinc-400 hover:text-white uppercase tracking-widest flex items-center gap-1 transition-colors">
                                                View All <ArrowRight className="w-3 h-3" />
                                            </Link>
                                        </div>
                                        <div className="flex-1 flex flex-col pt-2">
                                            {activeJobs.length === 0 ? (
                                                <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 pb-4">
                                                    <Package className="w-10 h-10 mb-3 opacity-30" />
                                                    <span className="text-sm">No active operations strictly on the floor.</span>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4 auto-rows-max">
                                                    {activeJobs.map((job: any) => {
                                                        const activeTasks = (job.tasks || []).map((t: any, i: number) => ({...t, originalIndex: i})).filter((t: any) => t.status === 'In Progress' || t.status === 'Blocked' || t.status === 'Ready for QA');
                                                        const primaryTask = activeTasks[0];
                                                        
                                                        const jobOpenLogs = globalOpenTaskLogs.filter(log => log.jobId === job.id);
                                                        const primaryLog = jobOpenLogs[0];
                                                        
                                                        let progressPercent = 0;
                                                        if (primaryTask && primaryTask.bookTime) {
                                                            progressPercent = 50; // We don't have total hours spent readily available here without more global queries, default purely to a visual indicator for now, or just show indeterminate
                                                        }
                                                        
                                                        let elapsedStr = '0m';
                                                        if (primaryTask?.status === 'Ready for QA' && primaryTask.readyForQaAt) {
                                                            const elapsedMs = Math.max(0, Date.now() - new Date(primaryTask.readyForQaAt).getTime());
                                                            const hrs = Math.floor(elapsedMs / (1000 * 60 * 60));
                                                            const mins = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
                                                            elapsedStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                                                        } else if (primaryLog && primaryLog.clockIn) {
                                                            const elapsedMs = Math.max(0, Date.now() - new Date(primaryLog.clockIn).getTime());
                                                            const hrs = Math.floor(elapsedMs / (1000 * 60 * 60));
                                                            const mins = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
                                                            elapsedStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                                                        }

                                                        return (
                                                        <Link 
                                                            key={job.id} 
                                                            to={`/business/jobs/${job.id}`}
                                                            className={`bg-zinc-950/50 border hover:border-indigo-500/30 rounded-xl p-4 flex flex-col justify-between transition-colors group relative overflow-hidden ${primaryTask?.status === 'Blocked' ? 'hover:bg-red-500/5 border-red-500/20' : 'hover:bg-indigo-500/5 border-zinc-800'}`}
                                                        >
                                                            <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full group-hover:scale-125 transition-transform origin-top-right ${primaryTask?.status === 'Blocked' ? 'bg-red-500/5' : 'bg-indigo-500/5'}`}></div>
                                                            <div className="flex justify-between items-start mb-3 relative z-10">
                                                                <div className="flex flex-col pr-12">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-bold text-zinc-200 line-clamp-1">{job.title || 'Untitled Job'}</span>
                                                                        <div 
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                const loc = window.prompt("Update parking location:", job.parkedLocation || '');
                                                                                if (loc !== null) {
                                                                                    updateDoc(doc(db, 'jobs', job.id), { parkedLocation: loc }).then(() => toast.success("Location updated")).catch(() => toast.error("Failed to update"));
                                                                                }
                                                                            }}
                                                                            className={`text-[9px] shrink-0 font-black uppercase tracking-widest px-1.5 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-1 ${job.parkedLocation ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20' : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:text-zinc-300'}`}
                                                                        >
                                                                            <MapPin className="w-2.5 h-2.5" />
                                                                            {job.parkedLocation ? `Zone: ${job.parkedLocation}` : 'Park Spot'}
                                                                        </div>
                                                                    </div>
                                                                    {primaryTask && (
                                                                        <span className="text-xs text-zinc-500 line-clamp-1 mt-0.5">{primaryTask.title}</span>
                                                                    )}
                                                                </div>
                                                                {job.tagNumber && (
                                                                    <span className={`text-white font-black text-[10px] px-2 py-0.5 rounded uppercase tracking-widest shadow-sm shrink-0 ml-2 absolute top-0 right-0 ${primaryTask?.status === 'Blocked' ? 'bg-red-500 shadow-red-500/20' : 'bg-indigo-500 shadow-indigo-500/20'}`}>
                                                                        #{job.tagNumber}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* User Clock Data */}
                                                            {(() => {
                                                                const staffMember = primaryLog && allStaff.find(s => s.uid === primaryLog.userId || s.uid === primaryLog.staffId);
                                                                const techName = staffMember?.displayName || primaryLog?.authorName || 'Tech';
                                                                const techPhoto = staffMember?.photoURL;
                                                                
                                                                return primaryLog ? (
                                                                <div className="flex items-center gap-2 mb-3 relative z-10 bg-zinc-900/80 rounded-lg p-2 border border-zinc-800/80">
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
                                                                            Duration: <span className="text-emerald-400">{elapsedStr}</span>
                                                                        </span>
                                                                    </div>
                                                                    {primaryLog.isDiscovery && <SearchCode className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                                                </div>
                                                                ) : primaryTask?.status === 'Blocked' ? (
                                                                    <div className="flex items-center gap-2 mb-3 relative z-10 bg-red-500/10 rounded-lg p-2 border border-red-500/20">
                                                                        <AlertTriangle className="w-4 h-4 text-red-500" />
                                                                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Waiting on Blocker</span>
                                                                    </div>
                                                                ) : primaryTask?.status === 'Ready for QA' ? (
                                                                    <div className="flex items-center gap-2 mb-3 relative z-10 bg-emerald-500/10 rounded-lg p-2 border border-emerald-500/20">
                                                                        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                                                                        <div className="flex flex-col flex-1 min-w-0">
                                                                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Ready for QA</span>
                                                                            {elapsedStr !== '0m' && (
                                                                                <span className="text-[9px] text-emerald-500/80 uppercase tracking-widest font-mono truncate">
                                                                                    Wait Time: {elapsedStr}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ) : null;
                                                            })()}

                                                            <div className="flex flex-col relative z-10">
                                                                {primaryTask?.bookTime ? (
                                                                    <div className="w-full bg-zinc-900 rounded-full h-1.5 mb-2 overflow-hidden border border-zinc-800/50">
                                                                        <div className={`h-full rounded-full ${primaryTask?.status === 'Blocked' ? 'bg-red-500' : primaryTask?.status === 'Ready for QA' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progressPercent}%` }}></div>
                                                                    </div>
                                                                ) : null}

                                                                <div className="flex justify-between items-end">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] text-zinc-600 uppercase tracking-widest mb-0.5">Task Status</span>
                                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${
                                                                            primaryTask?.status === 'In Progress' ? 'text-indigo-400' :
                                                                            primaryTask?.status === 'Blocked' ? 'text-red-400' :
                                                                            'text-zinc-400'
                                                                        }`}>
                                                                            {primaryTask?.status || 'Unknown'}
                                                                        </span>
                                                                    </div>
                                                                    <span className="text-zinc-600 group-hover:text-indigo-400 transition-colors">
                                                                        <ArrowRight className="w-4 h-4" />
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </Link>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Attention Required / Widget Column */}
                            <div className="space-y-6 flex flex-col">
                                
                                {/* My Active Tasks */}
                                {globalOpenTaskLogs.filter(t => t.userId === currentUser?.uid).length > 0 && (
                                    <div className="relative bg-zinc-900/50 hover:bg-zinc-800/80 border border-indigo-500/30 hover:border-indigo-500/50 transition-colors rounded-3xl p-6 group">
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform origin-top-right"></div>
                                        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2 mb-4 relative z-10">
                                            <Wrench className="w-5 h-5 text-indigo-400 animate-pulse" /> Running Tasks
                                        </h2>
                                        <div className="space-y-2 relative z-10">
                                            {globalOpenTaskLogs.filter(t => t.userId === currentUser?.uid).map(taskLog => {
                                                let elapsedStr = '0m';
                                                if (taskLog.clockIn) {
                                                    const elapsedMs = Math.max(0, Date.now() - new Date(taskLog.clockIn).getTime());
                                                    const hrs = Math.floor(elapsedMs / (1000 * 60 * 60));
                                                    const mins = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
                                                    elapsedStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                                                }
                                                return (
                                                    <Link 
                                                        key={taskLog.id}
                                                        to={`/business/jobs/${taskLog.jobId}/tasks`}
                                                        className="block bg-zinc-950 rounded-xl p-3 border border-zinc-800 hover:border-indigo-500/50 transition-colors relative overflow-hidden"
                                                    >
                                                        <div className="flex flex-col relative z-10">
                                                            <div className="flex justify-between items-start gap-2">
                                                                <span className="text-xs font-bold text-zinc-300 line-clamp-1 flex-1">{taskLog.taskName}</span>
                                                                <span className="text-[10px] font-mono text-emerald-400 tracking-widest shrink-0">{elapsedStr}</span>
                                                            </div>
                                                            <span className="text-[10px] text-zinc-500 mt-1">{taskLog.vehicleName || 'Unknown Vehicle'}</span>
                                                        </div>
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                                
                                {/* Current Shift / Clock Block */}
                                <div 
                                    onClick={() => setActiveDrawerContext({ id: 'time', title: 'Time & Attendance', type: 'timeclock' })}
                                    className="relative bg-zinc-900/50 hover:bg-zinc-800/80 border border-zinc-800 hover:border-blue-500/30 transition-colors cursor-pointer rounded-3xl p-6 group"
                                >
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform origin-top-right"></div>
                                    <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2 mb-4 relative z-10">
                                        <Clock className={`w-5 h-5 ${activeTimeLog ? 'text-emerald-400 animate-pulse' : 'text-blue-400'}`} /> My Shift
                                    </h2>
                                    <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800 text-center flex flex-col items-center relative z-10">
                                        <span className="text-xs font-black uppercase tracking-widest text-zinc-500 block mb-1">
                                            {activeTimeLog ? 'Clocked In' : 'Status'}
                                        </span>
                                        {activeTimeLog ? (
                                             <div className="flex flex-col items-center mb-4">
                                                 <span className="text-3xl font-black text-emerald-400 font-mono tracking-widest mb-1">
                                                     {elapsedShiftTime}
                                                 </span>
                                             </div>
                                        ) : (
                                            <div className="flex flex-col items-center mb-4">
                                                <span className="text-lg font-bold text-zinc-300 mb-2">Off Shift</span>
                                            </div>
                                        )}
                                        
                                        {/* STATS OVERVIEW FROM TECH PORTAL */}
                                        <div className="w-full flex items-center justify-between border-t border-zinc-800/80 pt-3 mb-3">
                                            <div className="flex flex-col items-center flex-1">
                                                <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold mb-0.5">Pay Period</span>
                                                <span className="text-blue-400 font-bold text-sm tracking-tight">{payPeriodData.hours.toFixed(1)} <span className="text-[10px] text-zinc-500 font-normal">hrs</span></span>
                                            </div>
                                            <div className="w-px h-6 bg-zinc-800"></div>
                                            <div className="flex flex-col items-center flex-1">
                                                <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold mb-0.5">Shift</span>
                                                <span className="text-emerald-400 font-bold text-sm tracking-tight">{todayData.hours.toFixed(1)} <span className="text-[10px] text-zinc-500 font-normal">hrs</span></span>
                                            </div>
                                            <div className="w-px h-6 bg-zinc-800"></div>
                                            <div className="flex flex-col items-center flex-1">
                                                <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold mb-0.5">Jobs</span>
                                                <span className="text-purple-400 font-bold text-sm tracking-tight">{todayTaskData.hours.toFixed(1)} <span className="text-[10px] text-zinc-500 font-normal">hrs</span></span>
                                            </div>
                                        </div>
                                        <div className="w-full flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-3 px-2">
                                            <span>Queued Potential:</span>
                                            <span className="text-blue-500">+{queuedTime.toFixed(1)} hrs</span>
                                        </div>

                                        <div className="w-full">
                                            <button 
                                                className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-xs font-bold uppercase tracking-wider px-4 py-3 flex items-center justify-center gap-2 rounded-lg transition-colors w-full border border-blue-500/20 group-hover:border-blue-500/50"
                                            >
                                                Manage Time <ArrowRight className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Arrivals / Pickup Operations */}
                                <div className="relative bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 flex-1 flex flex-col">
                                    <h2 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2 mb-4">
                                        <CalendarSync className="w-5 h-5 text-blue-500" /> Logistics
                                    </h2>
                                    <div className="space-y-4 flex-1">
                                        {allJobs.filter(j => j.status === 'Ready for Pickup').map(job => (
                                           <Link to={`/business/jobs/${job.id}`} key={job.id} className="bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20 rounded-xl p-3 flex justify-between items-center group cursor-pointer block text-left w-full">
                                               <div className="flex gap-3 items-center min-w-0">
                                                   <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                                       <CheckCircle2 className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
                                                   </div>
                                                   <div className="min-w-0 pr-2">
                                                       <div className="text-xs font-bold text-emerald-100 truncate group-hover:text-white transition-colors">{job.tagNumber ? `#${job.tagNumber} - ` : ''}{job.title}</div>
                                                       <div className="text-[10px] text-emerald-500/70 mt-0.5 font-bold uppercase tracking-widest truncate">Awaiting Pickup</div>
                                                   </div>
                                               </div>
                                           </Link>
                                        ))}

                                        {allJobs.filter(j => {
                                            const isDraft = j.status === 'Draft' || j.status === 'Estimating';
                                            const hasDropoffToday = j.dropoffEta && new Date(j.dropoffEta).toDateString() === new Date().toDateString();
                                            return (isDraft || hasDropoffToday) && !j.actualDropoffDate;
                                        }).filter(j => j.status !== 'Ready for Pickup' && j.status !== 'Finished' && j.status !== 'Delivered').map(job => (
                                           <Link to={`/business/jobs/${job.id}`} key={job.id} className="bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex justify-between items-center opacity-70 hover:opacity-100 transition-all group cursor-pointer block text-left w-full">
                                               <div className="flex gap-3 items-center min-w-0">
                                                   <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                                                       <Truck className="w-4 h-4 text-blue-500/50 group-hover:text-blue-400 group-hover:scale-110 transition-all" />
                                                   </div>
                                                   <div className="min-w-0 pr-2">
                                                       <div className="text-xs font-bold text-zinc-300 truncate group-hover:text-white transition-colors">{job.tagNumber ? `#${job.tagNumber} - ` : ''}{job.title || 'Untitled Intake'}</div>
                                                       <div className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-widest truncate group-hover:text-zinc-400 transition-colors">
                                                            {job.dropoffEta ? `ETA: ${new Date(job.dropoffEta).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Inbound'}
                                                       </div>
                                                   </div>
                                               </div>
                                           </Link>
                                        ))}
                                        
                                        {allJobs.filter(j => 
                                            j.status === 'Ready for Pickup' || 
                                            ((j.status === 'Draft' || j.status === 'Estimating' || (j.dropoffEta && new Date(j.dropoffEta).toDateString() === new Date().toDateString())) && 
                                             !j.actualDropoffDate &&
                                             j.status !== 'Ready for Pickup' && j.status !== 'Finished' && j.status !== 'Delivered')
                                        ).length === 0 && (
                                            <div className="text-zinc-500 text-xs text-center p-4">No pending logistics found.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            </div>

                            {/* --- ROLE DESIGN MOCKUPS (WIP) --- */}
                            {/* Technician Mockup */}
                            <div className={`bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group ${!(isSuperAdmin || checkPermission('view_jobs')) ? 'opacity-30 blur-sm pointer-events-none grayscale' : ''}`}>
                                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform origin-top-right"></div>
                                <h3 className="text-zinc-300 font-bold flex items-center gap-2 mb-4 relative z-10">
                                    <Wrench className="w-4 h-4 text-amber-500" /> Up Next Queue
                                </h3>
                                <div className="space-y-3 relative z-10">
                                    {myAssignedJobs.length === 0 ? (
                                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center justify-center text-zinc-500 text-xs">
                                            Queue is empty.
                                        </div>
                                    ) : (
                                        myAssignedJobs.map((job: any) => {
                                            const aDate = job.pickupEta || job.completionEta || job.dueDate || job.desiredPickupDate;
                                            return (
                                                <button 
                                                    key={job.id}
                                                    onClick={() => setActiveDrawerContext({ id: 'portal', title: 'Tech Portal', type: 'techportal', payload: { jobId: job.id, taskIndex: job.myTasks[0].originalIndex } })}
                                                    className="w-full text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl p-3 flex justify-between items-center transition-colors group/btn cursor-pointer"
                                                >
                                                    <div className="flex-1 min-w-0 pr-2">
                                                        <div className="text-xs font-bold text-zinc-300 group-hover/btn:text-white transition-colors truncate">
                                                            {job.tagNumber ? `#${job.tagNumber} - ` : ''}{job.title || 'Untitled Job'}
                                                        </div>
                                                        <div className="text-[10px] text-zinc-500 mt-1 flex gap-2">
                                                            <span className="uppercase tracking-widest text-amber-500/70 font-semibold truncate border-r border-zinc-800 pr-2">
                                                                {job.myTasks[0]?.title || 'Task'}
                                                            </span>
                                                            {aDate && (
                                                                <span className="whitespace-nowrap flex items-center gap-1">
                                                                    Due: <span className="font-bold text-zinc-400">{new Date(aDate).toLocaleString([], { month: 'short', day: 'numeric' })}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="bg-zinc-800 text-zinc-400 shrink-0 group-hover/btn:bg-amber-500 group-hover/btn:text-zinc-950 text-[10px] font-bold px-2 py-1 rounded transition-colors flex items-center gap-1">
                                                        Open <ArrowRight className="w-3 h-3" />
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                    {myAssignedJobs.length > 0 && (
                                        <button 
                                            onClick={() => setActiveDrawerContext({ id: 'portal', title: 'Tech Portal', type: 'techportal' })}
                                            className="w-full mt-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 rounded-xl p-3 flex justify-center items-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors"
                                        >
                                            All Assigned Tasks <ArrowRight className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* QA Inspector Card */}
                            {(isSuperAdmin || checkPermission('manage_qa')) && (
                                <div className={`bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group`}>
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform origin-top-right"></div>
                                    <h3 className="text-zinc-300 font-bold flex items-center gap-2 mb-4 relative z-10">
                                        <ShieldCheck className="w-4 h-4 text-emerald-500" /> Pending QA Checks
                                    </h3>
                                    <div className="space-y-3 relative z-10">
                                        {qaPendingJobs.length === 0 ? (
                                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center justify-center text-zinc-500 text-xs">
                                                No tasks currently await QA.
                                            </div>
                                        ) : (
                                            qaPendingJobs.map((job: any) => {
                                                return (
                                                    <button 
                                                        key={job.id}
                                                        onClick={() => setActiveDrawerContext({ id: 'portal', title: 'Tech Portal', type: 'techportal', payload: { jobId: job.id, taskIndex: job.qaTasks[0].originalIndex } })}
                                                        className="w-full text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl p-3 flex justify-between items-center transition-colors group/btn cursor-pointer"
                                                    >
                                                        <div className="flex-1 min-w-0 pr-2">
                                                            <div className="text-xs font-bold text-zinc-300 group-hover/btn:text-white transition-colors truncate">
                                                                {job.tagNumber ? `#${job.tagNumber} - ` : ''}{job.title || 'Untitled Job'}
                                                            </div>
                                                            <div className="text-[10px] text-zinc-500 mt-1 flex gap-2">
                                                                <span className="uppercase tracking-widest text-emerald-500/70 font-semibold truncate border-r border-zinc-800 pr-2">
                                                                    {job.qaTasks[0]?.title || 'Task'}
                                                                </span>
                                                                <span className="whitespace-nowrap flex items-center gap-1">
                                                                    Status: <span className="font-bold text-emerald-400">Ready for QA</span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-lg bg-zinc-950 flex items-center justify-center shrink-0 border border-zinc-800 group-hover/btn:border-emerald-500/30 transition-colors">
                                                            <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover/btn:text-emerald-400 transition-colors" />
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}



                            {/* Owner Mockup */}
                            {(isSuperAdmin || checkPermission('view_financials')) && (
                                <div className={`bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group`}>
                                    <WidgetSoonBadge />
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform origin-top-right"></div>
                                    <h3 className="text-zinc-300 font-bold flex items-center gap-2 mb-4 relative z-10 w-2/3 truncate">
                                        <BarChart3 className="w-4 h-4 text-emerald-500 shrink-0" /> Financials
                                    </h3>
                                    <div className="space-y-4 relative z-10">
                                        <div className="flex items-end gap-2 border-b border-zinc-800/50 pb-3">
                                            <span className="text-3xl font-black text-white">$14,250</span>
                                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Uninvoiced WIP</span>
                                        </div>
                                        <div className="flex justify-between items-center opacity-50">
                                            <span className="text-xs text-zinc-400">Total Billed Today</span>
                                            <span className="text-sm font-bold text-emerald-400">$2,400.00</span>
                                        </div>
                                        <div className="flex justify-between items-center opacity-50">
                                            <span className="text-xs text-zinc-400">Est. Payroll Overhead</span>
                                            <span className="text-sm font-bold text-red-400 border border-red-500/20 px-2 py-0.5 rounded-md">$1,200.00</span>
                                        </div>
                                    </div>
                                </div>
                            )}



                            {/* Receiving Mockup */}
                            {(isSuperAdmin || checkPermission('view_deliveries')) && (
                                <div className={`bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group`}>
                                    <WidgetSoonBadge />
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform origin-top-right"></div>
                                    <h3 className="text-zinc-300 font-bold flex items-center gap-2 mb-4 relative z-10 w-2/3 truncate">
                                        <Truck className="w-4 h-4 text-cyan-500 shrink-0" /> Logistics
                                    </h3>
                                    <div className="space-y-3 relative z-10">
                                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex justify-between items-center opacity-50 border-dashed">
                                            <div className="flex gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">📦</div>
                                                <div>
                                                    <div className="text-xs font-bold text-zinc-300">FedEx - 2 Packages</div>
                                                    <div className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-widest">Est: By 3:00 PM</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Low Stock Alerts Mockup */}
                            {(isSuperAdmin || checkPermission('view_inventory')) && (
                                <div className={`bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group`}>
                                    <WidgetSoonBadge />
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform origin-top-right"></div>
                                    <h3 className="text-zinc-300 font-bold flex items-center gap-2 mb-4 relative z-10 w-2/3 truncate">
                                        <Layers className="w-4 h-4 text-rose-500 shrink-0" /> Low Stock
                                    </h3>
                                    <div className="space-y-2 relative z-10">
                                        <div className="flex justify-between items-center bg-rose-500/5 border border-rose-500/20 rounded-lg p-2 opacity-50 border-dashed">
                                            <span className="text-xs text-rose-200 font-bold">16ga Red Wire</span>
                                            <span className="text-[10px] font-black text-white bg-rose-500 px-2 py-0.5 rounded">2 QTY Left</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Facility Map Embed Mockup */}
                            {(isSuperAdmin || checkPermission('view_facility_map')) && (
                                <div className={`bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group`}>
                                    <WidgetSoonBadge />
                                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0ibm9uZSIvPgo8Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIvPgo8L3N2Zz4=')] opacity-50 z-0"></div>
                                    <h3 className="text-zinc-300 font-bold flex items-center gap-2 mb-4 relative z-10 w-2/3 truncate">
                                        <Map className="w-4 h-4 text-zinc-400 shrink-0" /> Dispatch Radar
                                    </h3>
                                    <div className="h-24 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center opacity-40 border-dashed relative z-10 overflow-hidden">
                                        <div className="w-4 h-4 bg-indigo-500 rounded-sm absolute left-1/4 top-1/3 animate-pulse"></div>
                                        <div className="w-4 h-4 bg-amber-500 rounded-sm absolute right-1/3 bottom-1/4"></div>
                                        <span className="text-xs text-zinc-600 font-bold uppercase tracking-widest">Map View Rendered Here</span>
                                    </div>
                                </div>
                            )}
                            
                            {/* Global Bulletins Mockup */}
                            <div className={`bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group`}>
                                <WidgetSoonBadge />
                                <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform origin-top-right"></div>
                                <h3 className="text-zinc-300 font-bold flex items-center gap-2 mb-4 relative z-10 w-2/3 truncate">
                                    <Megaphone className="w-4 h-4 text-yellow-500 shrink-0" /> Bulletins
                                </h3>
                                <div className="space-y-3 relative z-10">
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 opacity-50 border-dashed">
                                        <div className="text-[10px] font-black text-yellow-500 uppercase tracking-widest mb-1 outline-none">MGMT Notice</div>
                                        <div className="text-xs text-zinc-400">Shop lunch ordered for 12:30PM today. Please wipe down bays beforehand.</div>
                                    </div>
                                </div>
                            </div>


                    </div>
                )}
            </div>

            {/* OFF-CANVAS BOTTOM SHEET DRAWER (SPA Architecture) */}
            <div 
                className={`fixed inset-0 z-50 transition-opacity duration-300 ${activeDrawerContext ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            >
                {/* Backdrop Filter */}
                <div 
                    onClick={() => setActiveDrawerContext(null)}
                    className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
                ></div>

                {/* Sliding Drawer Container */}
                <div 
                    className={`absolute bottom-0 inset-x-0 w-full max-w-5xl mx-auto h-[80vh] bg-zinc-900 border-t border-x border-zinc-800 rounded-t-3xl shadow-2xl transform transition-transform duration-500 cubic-bezier(0.32, 0.72, 0, 1) flex flex-col ${activeDrawerContext ? 'translate-y-0' : 'translate-y-full'}`}
                >
                    {/* Drawer Header Segment */}
                    <div className="flex justify-between items-center p-6 border-b border-zinc-800/50 bg-zinc-950/30 rounded-t-3xl backdrop-blur-md">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded">Active Focus</span>
                                <span className="text-zinc-500 text-xs font-medium uppercase tracking-widest">#{activeDrawerContext?.id}</span>
                            </div>
                            <h2 className="text-2xl font-black text-white">{activeDrawerContext?.title}</h2>
                        </div>
                        <button 
                            onClick={() => setActiveDrawerContext(null)}
                            className="w-12 h-12 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full flex items-center justify-center transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Drawer Payload Workspace */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {activeDrawerContext?.type === 'timeclock' ? (
                            <TimeClockApp isDrawer={true} />
                        ) : activeDrawerContext?.type === 'techportal' ? (
                            <TechPortal isDrawer={true} initialTaskView={activeDrawerContext.payload} />
                        ) : (
                            <div className="p-6 md:p-8 h-full">
                                <div className="border-2 border-dashed border-zinc-800 rounded-2xl h-full flex flex-col items-center justify-center text-zinc-500 p-8 text-center bg-zinc-950/20">
                                    <Wrench className="w-12 h-12 mb-4 opacity-50 text-amber-500" />
                                    <h3 className="text-xl font-bold text-zinc-300 mb-2">Dedicated Workspace Loaded</h3>
                                    <p className="max-w-md text-sm">
                                        This isolated layer overrides the dashboard context. Timeclock punches, payload interactions, photos, and parts requisitions loaded here automatically scope directly to <strong className="text-zinc-300">#{activeDrawerContext?.id}</strong>. 
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
        </div>
    );
}
