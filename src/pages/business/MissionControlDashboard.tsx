import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { api } from '../../lib/api';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { signInWithCustomToken } from 'firebase/auth';
import { Hammer, ArrowRight, ShieldCheck, User, LogOut, Search, Command, Plus, UserPlus, Car } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { TimeClockApp } from './TimeClockApp';
import { MyTasksWidget } from '../../components/dashboard/MyTasksWidget';
import { TechPortal } from '../TechPortal';
import { EstimateWizard } from '../../components/jobs/EstimateWizard';
import { StaffDayTimeline } from '../../components/dashboard/StaffDayTimeline';
import { JobSwimlaneRow } from '../../components/dashboard/SwimlaneBoard';
import { LiveOperationsFeed } from '../../components/dashboard/LiveOperationsFeed';
import { WorkspaceModal } from '../../components/ui/WorkspaceModal';
import { ParkingModal } from '../../components/ui/ParkingModal';
import { DashboardCommandHub } from '../../components/dashboard/DashboardCommandHub';
import { JobIntakeWizard } from '../../components/jobs/JobIntakeWizard';
import { logBusinessActivity } from '../../lib/activityLogger';

import { QuoteApprovalModal } from '../../components/jobs/QuoteApprovalModal';
import { IntakeSchedulingModal } from '../../components/jobs/IntakeSchedulingModal';
import { VehicleCheckInModal } from '../../components/jobs/VehicleCheckInModal';
import { JobExecutionPortal } from '../../components/jobs/JobExecutionPortal';

export function MissionControlDashboard() {
    const { currentUser, tenantId, role } = useAuth();
    const { checkPermission, loading } = usePermissions();
    const [businessName, setBusinessName] = useState('Loading Dashboard...');

    const handleKanbanTaskClockToggle = async (job: any, task: any, isCurrentlyClockedIn: boolean, logId?: string) => {
        if (!currentUser?.uid || !tenantId) return;
        try {
            const now = new Date().toISOString();
            
            if (isCurrentlyClockedIn && logId) {
                // Clock out
                toast.loading("Clocking out of task...", { id: 'clock_toggle' });
                await updateDoc(doc(db, 'businesses', tenantId, 'task_time_logs', logId), {
                    clockOut: now,
                    status: 'closed'
                });

                logBusinessActivity(tenantId, {
                    action: 'TASK_STOP',
                    jobId: job.id,
                    jobTitle: job.title || 'Unknown Job',
                    taskTitle: task.title,
                    userId: currentUser.uid,
                    userName: currentUser.displayName || 'Tech',
                    details: 'Stopped working on task.'
                });

                toast.success("Clocked out of task", { id: 'clock_toggle' });
            } else {
                // Clock into task
                toast.loading("Starting task...", { id: 'clock_toggle' });
                const { addDoc } = await import('firebase/firestore');

                // Gather extra context for the log payload
                const vDetails = job.vehicleDetails || {};
                const vehStr = [vDetails.year, vDetails.make, vDetails.model, vDetails.vin?.slice(-6)].filter(Boolean).join(' ') || 'Vehicle';

                // Clock into the new one
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

                logBusinessActivity(tenantId, {
                    action: 'TASK_START',
                    jobId: job.id,
                    jobTitle: job.title || 'Unknown Job',
                    taskTitle: task.title,
                    userId: currentUser.uid,
                    userName: currentUser.displayName || 'Tech',
                    details: 'Started working on task.'
                });

                toast.success("Started working on task!", { id: 'clock_toggle' });
            }
        } catch (err) {
            console.error("Failed to toggle task clock:", err);
            toast.error("Failed to update clock status", { id: 'clock_toggle' });
        }
    };
    
    // Bottom Sheet Architecture State
    const [activeDrawerContext, setActiveDrawerContext] = useState<{ id: string, title?: string, type: 'timeclock' | 'job' | 'techportal' | 'staff', payload?: any } | null>(null);

    // Live Data Feed: Task Tracking
    const [globalOpenTaskLogs, setGlobalOpenTaskLogs] = useState<any[]>([]);

    // Global Keyboard Shortcut to open Search (Ctrl+F or Cmd+F)
    // Global Keyboard Shortcut to open Search (Ctrl+F or Cmd+F) and Close (Esc)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                setActiveDrawerContext({ id: 'GLOBAL_SEARCH', title: 'Global Action Hub', type: 'job' });
            }
            if (e.key === 'Escape') {
                setActiveDrawerContext(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL' || !currentUser?.uid) return;

        const unsubGlobalOpenTaskLogs = onSnapshot(query(collection(db, 'businesses', tenantId, 'task_time_logs'), where('status', '==', 'open')), (s) => {
            setGlobalOpenTaskLogs(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubGlobalOpenTaskLogs();
        };
    }, [tenantId, currentUser?.uid]);

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
    const [globalCustomers, setGlobalCustomers] = useState<any[]>([]);
    const [globalVehicles, setGlobalVehicles] = useState<any[]>([]);
    const [parkingModalJob, setParkingModalJob] = useState<{ id: string, current: string } | null>(null);
    const [approvalModalJob, setApprovalModalJob] = useState<any>(null);
    const [intakeModalJob, setIntakeModalJob] = useState<any>(null);
    const [checkInModalJob, setCheckInModalJob] = useState<any>(null);

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
            setAllJobs(fetched.filter((j: any) => !j.archived && j.status !== 'Archived' && j.status !== 'archived' && !j.isChangeOrder));
        });

        const unsubCustomers = onSnapshot(query(collection(db, 'customers'), where('tenantId', '==', tenantId)), (snap) => {
            setGlobalCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('tenantId', '==', tenantId)), (snap) => {
            setGlobalVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubJobs();
            unsubCustomers();
            unsubVehicles();
        };
    }, [currentUser, tenantId]);



    const isSuperAdmin = role === 'system_owner' || role === 'super_admin';
    const firstName = currentUser?.displayName ? currentUser.displayName.split(' ')[0] : 'Commander';

    const handleImpersonateUser = async (targetUid: string) => {
        if (!targetUid) return;
        try {
            toast.loading("Assume identity...", { id: 'impersonate_dash' });
            const res = await api.post(`/businesses/${tenantId}/staff/${targetUid}/impersonate`);
            const { token } = res.data;
            
            sessionStorage.setItem('sae_impersonating', 'true');
            await signInWithCustomToken(auth, token);
            
            toast.success("Identity assumed.", { id: 'impersonate_dash' });
            window.location.reload();
        } catch (error: any) {
            console.error("Impersonation failed", error);
            toast.error(error?.response?.data?.error || "Failed to impersonate identity.", { id: 'impersonate_dash' });
        }
    };

    const visibleJobsForBoard = useMemo(() => {
        let jobsToConsider = allJobs.map(j => {
            const customer = j.customer || globalCustomers.find(c => c.id === j.customerId);
            const vehicle = j.vehicle || globalVehicles.find(v => v.id === j.vehicleId);
            return { ...j, customer, vehicle };
        });

        if (!isSuperAdmin && !checkPermission('manage_jobs') && !checkPermission('view_jobs')) {
            jobsToConsider = jobsToConsider.filter(j => {
                const hasAssignedTask = (j.tasks || []).some((t: any) => t.assignedUids?.includes(currentUser?.uid));
                return hasAssignedTask || j.assignedUids?.includes(currentUser?.uid);
            });
        }

        return jobsToConsider;
    }, [allJobs, isSuperAdmin, checkPermission, currentUser?.uid, globalCustomers, globalVehicles]);

    return (
        <div className="min-h-screen bg-zinc-950 p-0 relative overflow-hidden flex flex-col">
            {/* Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="max-w-[2560px] w-full mx-auto relative z-10 flex-1 flex flex-row overflow-hidden">
                {/* Main Content Area */}
                <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar bg-black/20">
                    {/* Compact Edge-to-Edge Welcome Ribbon */}
                    <div className="flex items-center justify-between bg-zinc-900/50 border-b border-zinc-800/80 p-2 px-4 shadow-sm w-full backdrop-blur-sm z-20 sticky top-0 shrink-0">
                    <div className="flex items-center gap-3">
                        <Link to="/profile" className="flex items-center gap-3 hover:bg-zinc-800/50 p-1.5 -ml-1.5 rounded-lg transition-colors cursor-pointer group" title="View HR Profile">
                            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold border border-accent/30 shrink-0 overflow-hidden">
                                {currentUser?.photoURL ? (
                                    <img src={currentUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-4 h-4" />
                                )}
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-sm font-black text-white leading-tight tracking-wide group-hover:text-accent transition-colors">Welcome back, {firstName}</h1>
                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none mt-0.5">{businessName}</span>
                            </div>
                        </Link>
                    </div>
                    <div className="flex items-center gap-3">
                        {(isSuperAdmin || checkPermission('manage_staff')) && allStaff && allStaff.length > 0 && (
                            <div className="hidden md:flex items-center gap-2">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">View As</span>
                                <select 
                                    value="" 
                                    onChange={(e) => handleImpersonateUser(e.target.value)}
                                    className="text-xs bg-zinc-950 border border-zinc-800 text-zinc-300 font-medium rounded-lg px-2 py-1 outline-none focus:border-accent appearance-none cursor-pointer hover:border-zinc-700 transition-colors"
                                >
                                    <option value="" disabled>Select User...</option>
                                    {allStaff.filter(s => s.uid !== currentUser?.uid).map(staff => (
                                        <option key={staff.uid} value={staff.uid}>
                                            {staff.firstName} {staff.lastName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button
                            onClick={() => { auth.signOut(); window.location.href = '/login'; }}
                            className="bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white p-1.5 rounded-lg transition-colors shadow-sm ml-1"
                            title="Sign Out"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                        {(isSuperAdmin || checkPermission('manage_staff')) && (
                             <Link to="/business/manage" className="text-[11px] font-black tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 hover:bg-accent hover:text-black px-4 py-2 rounded-lg transition-all shadow-sm flex items-center gap-1.5 shrink-0">
                                <ShieldCheck className="w-3.5 h-3.5" /> Back Office
                             </Link>
                        )}
                    </div>
                </div>
                <div className="p-4 flex flex-col gap-2 md:gap-3 mb-4 shrink-0">
                    {/* Time Clock App Widget (Visible to Everyone) */}
                    <TimeClockApp isWidget={true} />

                    <MyTasksWidget 
                        allJobs={allJobs} 
                        globalOpenTaskLogs={globalOpenTaskLogs} 
                        currentUserId={currentUser?.uid} 
                        onTaskClockToggle={handleKanbanTaskClockToggle} 
                        onJobClick={(job, payload) => setActiveDrawerContext({ id: job.id, title: job.title || 'Workspace', type: 'job', payload: payload || job.status })}
                    />

                    {/* Crew Timeline (Management Only) */}
                    {(isSuperAdmin || checkPermission('manage_jobs') || checkPermission('manage_staff')) && (
                        <div>
                            <StaffDayTimeline tenantId={tenantId || 'GLOBAL'} allStaff={allStaff} />
                        </div>
                    )}
                </div>

                {/* Main Dashboard Grid */}
                {loading ? (
                    <div className="animate-pulse space-y-4">
                        <div className="h-32 bg-zinc-900/50 rounded-2xl w-full"></div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="h-64 bg-zinc-900/50 rounded-2xl lg:col-span-2"></div>
                            <div className="h-64 bg-zinc-900/50 rounded-2xl"></div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {/* First Major Split: Jobs / Floor vs Personal Tasks */}
                        <div className="flex flex-col gap-6 md:gap-8">
                            
                            {/* 🎯 Universal Command Hub (Omnibar dummy trigger) */}
                            <div className="w-full relative z-30 flex flex-col md:flex-row gap-3">
                                {/* Quick Action Buttons */}
                                <div className="flex flex-row items-center gap-2 overflow-x-auto hide-scrollbar shrink-0 order-first md:order-last pb-2 md:pb-0 border-b border-zinc-800/50 md:border-transparent">
                                    <button 
                                        onClick={() => setActiveDrawerContext({ id: 'NEW-EST', title: 'New Estimate Builder', type: 'job' })}
                                        className="flex items-center gap-2 px-4 py-3 md:py-0 h-full bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 rounded-xl transition-all font-bold text-xs uppercase tracking-widest whitespace-nowrap"
                                    >
                                        <Plus className="w-4 h-4" /> New Estimate
                                    </button>
                                    <button 
                                        onClick={() => setActiveDrawerContext({ id: 'CUST-LOOKUP', title: `Customer: Lookup`, type: 'job' })}
                                        className="flex items-center gap-2 px-4 py-3 md:py-0 h-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl transition-all font-bold text-xs uppercase tracking-widest whitespace-nowrap"
                                    >
                                        <UserPlus className="w-4 h-4" /> Walk-In
                                    </button>
                                    <button 
                                        onClick={() => setActiveDrawerContext({ id: 'INTAKE', title: `Vehicle Intake: `, type: 'job' })}
                                        className="flex items-center gap-2 px-4 py-3 md:py-0 h-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl transition-all font-bold text-xs uppercase tracking-widest whitespace-nowrap"
                                    >
                                        <Car className="w-4 h-4" /> Intake
                                    </button>
                                </div>

                                <button 
                                    onClick={() => setActiveDrawerContext({ id: 'GLOBAL_SEARCH', title: 'Global Action Hub', type: 'job' })}
                                    className="flex-1 relative group text-left"
                                >
                                    <div className="absolute -inset-0.5 bg-gradient-to-r from-accent/0 via-accent/20 to-accent/0 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                                    <div className="relative h-full bg-zinc-950/80 backdrop-blur-xl border border-zinc-800/80 hover:border-accent/50 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3 shadow-lg transition-all duration-300 justify-between">
                                        <div className="flex items-center gap-3">
                                            <Search className="w-5 h-5 text-zinc-500 group-hover:text-accent transition-colors" />
                                            <span className="text-zinc-500 font-medium text-lg leading-none mt-1 group-hover:text-zinc-300 transition-colors">
                                                Scan QR, type a name, VIN, or phone...
                                            </span>
                                        </div>
                                        <kbd className="hidden lg:flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[10px] font-mono text-zinc-400">
                                            <Command className="w-3 h-3" /> F
                                        </kbd>
                                    </div>
                                </button>
                            </div>
                            
                                <div className="relative w-full bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 flex flex-col">
                                    <div className={`flex-1 flex flex-col`}>
                                        <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-6 gap-4">
                                            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2 shrink-0">
                                                <Hammer className="w-5 h-5 text-accent" /> Active Jobs
                                            </h2>

                                            
                                            <div className="flex items-center gap-4 shrink-0 justify-end">
                                                <Link to="/business/jobs" className="text-xs font-bold text-zinc-400 hover:text-white uppercase tracking-widest flex items-center gap-1 transition-colors">
                                                    View All <ArrowRight className="w-3 h-3" />
                                                </Link>
                                            </div>
                                        </div>
                                        <div className="flex-1 flex flex-col lg:flex-row gap-6 lg:overflow-x-auto custom-scrollbar pb-4 pt-2 relative">
                                            <div className="absolute top-0 right-0 -translate-y-12 shrink-0">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800">
                                                    Showing {visibleJobsForBoard.filter(j => !j.archived && j.status !== 'Draft' && (j.tasks || []).some((t: any) => t.status === 'In Progress' || t.status === 'Blocked' || t.status === 'Ready for QA')).length} Live Operations
                                                </span>
                                            </div>

                                            <JobSwimlaneRow 
                                                title={
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-blue-500" /> Drafts & Estimates
                                                    </div>
                                                }
                                                jobs={visibleJobsForBoard.filter(j => !j.archived && (j.status === 'Draft' || j.status === 'Estimate'))}
                                                allStaff={allStaff}
                                                onTaskClockToggle={handleKanbanTaskClockToggle}
                                                currentUserId={currentUser?.uid}
                                                globalOpenTaskLogs={globalOpenTaskLogs}
                                                onJobClick={(job) => setActiveDrawerContext({ id: job.id, title: job.title || 'Workspace', type: 'job', payload: job.status })}
                                                setEditingParkingJob={(plog) => setParkingModalJob(plog)}
                                            />

                                            <JobSwimlaneRow 
                                                title={
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-amber-500" /> Pending Approvals
                                                    </div>
                                                }
                                                jobs={visibleJobsForBoard.filter(j => !j.archived && j.status === 'Pending Approval')}
                                                allStaff={allStaff}
                                                onTaskClockToggle={handleKanbanTaskClockToggle}
                                                currentUserId={currentUser?.uid}
                                                globalOpenTaskLogs={globalOpenTaskLogs}
                                                onJobClick={(job) => setApprovalModalJob(job)}
                                                setEditingParkingJob={(plog) => setParkingModalJob(plog)}
                                            />

                                            <JobSwimlaneRow 
                                                title={
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500" /> Scheduling & Intake
                                                    </div>
                                                }
                                                jobs={visibleJobsForBoard.filter(j => !j.archived && (j.status === 'Pending Intake' || j.status === 'Approved'))}
                                                allStaff={allStaff}
                                                onTaskClockToggle={handleKanbanTaskClockToggle}
                                                currentUserId={currentUser?.uid}
                                                globalOpenTaskLogs={globalOpenTaskLogs}
                                                onJobClick={(job) => {
                                                    if (job.status === 'Pending Intake') {
                                                        setIntakeModalJob(job);
                                                    } else {
                                                        setActiveDrawerContext({ id: job.id, title: job.title || 'Workspace', type: 'job', payload: job.status });
                                                    }
                                                }}
                                                setEditingParkingJob={(plog) => setParkingModalJob(plog)}
                                            />

                                            <JobSwimlaneRow 
                                                title={
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-blue-500" /> Scheduled (Off Site)
                                                    </div>
                                                }
                                                jobs={visibleJobsForBoard.filter(j => !j.archived && j.status === 'Scheduled')}
                                                allStaff={allStaff}
                                                onTaskClockToggle={handleKanbanTaskClockToggle}
                                                currentUserId={currentUser?.uid}
                                                globalOpenTaskLogs={globalOpenTaskLogs}
                                                onJobClick={(job) => setCheckInModalJob(job)}
                                                setEditingParkingJob={(plog) => setParkingModalJob(plog)}
                                            />

                                            <JobSwimlaneRow 
                                                title={
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-zinc-500" /> Queue (On Site)
                                                    </div>
                                                }
                                                jobs={visibleJobsForBoard.filter(j => {
                                                    if (j.archived || j.status === 'Estimate' || j.status === 'Draft' || j.status === 'Pending Intake' || j.status === 'Pending Approval' || j.status === 'Delivered' || j.status === 'Scheduled') return false;
                                                    // Show jobs that have no currently active tasks
                                                    const hasActiveLog = globalOpenTaskLogs.some(log => log.jobId === j.id);
                                                    const hasActiveTasks = (j.tasks || []).some((t: any) => t.status === 'In Progress' || t.status === 'Blocked' || t.status === 'Ready for QA') || hasActiveLog;
                                                    return !hasActiveTasks;
                                                })}
                                                allStaff={allStaff}
                                                onTaskClockToggle={handleKanbanTaskClockToggle}
                                                currentUserId={currentUser?.uid}
                                                globalOpenTaskLogs={globalOpenTaskLogs}
                                                onJobClick={(job) => setActiveDrawerContext({ id: job.id, title: job.title || 'Workspace', type: 'job', payload: job.status })}
                                                setEditingParkingJob={(plog) => setParkingModalJob(plog)}
                                            />
                                            
                                            <JobSwimlaneRow 
                                                title={
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Blocked
                                                    </div>
                                                }
                                                jobs={visibleJobsForBoard.filter(j => !j.archived && j.status !== 'Draft' && (j.tasks || []).some((t: any) => t.status === 'Blocked'))}
                                                allStaff={allStaff}
                                                onTaskClockToggle={handleKanbanTaskClockToggle}
                                                currentUserId={currentUser?.uid}
                                                globalOpenTaskLogs={globalOpenTaskLogs}
                                                onJobClick={(job) => setActiveDrawerContext({ id: job.id, title: job.title || 'Workspace', type: 'job', payload: { status: job.status, focusTask: 'blocked' } })}
                                                setEditingParkingJob={(plog) => setParkingModalJob(plog)}
                                            />
                                            
                                            <JobSwimlaneRow 
                                                title={
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-indigo-500" /> In Progress
                                                    </div>
                                                }
                                                jobs={visibleJobsForBoard.filter(j => {
                                                    if (j.archived || j.status === 'Draft') return false;
                                                    const hasInProgressTask = (j.tasks || []).some((t: any) => t.status === 'In Progress');
                                                    const hasActiveLog = globalOpenTaskLogs.some(log => log.jobId === j.id);
                                                    return hasInProgressTask || hasActiveLog;
                                                })}
                                                allStaff={allStaff}
                                                onTaskClockToggle={handleKanbanTaskClockToggle}
                                                currentUserId={currentUser?.uid}
                                                globalOpenTaskLogs={globalOpenTaskLogs}
                                                onJobClick={(job) => setActiveDrawerContext({ id: job.id, title: job.title || 'Workspace', type: 'job', payload: job.status })}
                                                setEditingParkingJob={(plog) => {
                                                    const loc = window.prompt("Update parking location:", plog.current || '');
                                                    if (loc !== null) {
                                                        updateDoc(doc(db, 'jobs', plog.id), { parkedLocation: loc }).then(() => toast.success("Location updated")).catch(() => toast.error("Failed to update"));
                                                    }
                                                }}
                                            />

                                                <JobSwimlaneRow 
                                                    title={
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-emerald-500" /> Ready for QA
                                                        </div>
                                                    }
                                                    jobs={visibleJobsForBoard.filter(j => !j.archived && j.status !== 'Draft' && (j.tasks || []).some((t: any) => t.status === 'Ready for QA') && !(j.tasks || []).some((t: any) => t.status === 'Blocked' || t.status === 'In Progress'))}
                                                    allStaff={allStaff}
                                                onTaskClockToggle={handleKanbanTaskClockToggle}
                                                currentUserId={currentUser?.uid}
                                                    globalOpenTaskLogs={globalOpenTaskLogs}
                                                onJobClick={(job) => setActiveDrawerContext({ id: job.id, title: job.title || 'Workspace', type: 'job', payload: job.status })}
                                                    setEditingParkingJob={(plog) => {
                                                        const loc = window.prompt("Update parking location:", plog.current || '');
                                                        if (loc !== null) {
                                                            updateDoc(doc(db, 'jobs', plog.id), { parkedLocation: loc }).then(() => toast.success("Location updated")).catch(() => toast.error("Failed to update"));
                                                        }
                                                    }}
                                                />

                                                <JobSwimlaneRow 
                                                    title={
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-cyan-500" /> Ready for Delivery
                                                        </div>
                                                    }
                                                    jobs={visibleJobsForBoard.filter(j => !j.archived && j.status !== 'Draft' && (j.tasks || []).some((t: any) => t.status === 'Ready for Delivery') && !(j.tasks || []).some((t: any) => t.status === 'Blocked' || t.status === 'In Progress' || t.status === 'Ready for QA'))}
                                                    allStaff={allStaff}
                                                onTaskClockToggle={handleKanbanTaskClockToggle}
                                                currentUserId={currentUser?.uid}
                                                    globalOpenTaskLogs={globalOpenTaskLogs}
                                                onJobClick={(job) => setActiveDrawerContext({ id: job.id, title: job.title || 'Workspace', type: 'job', payload: job.status })}
                                                    setEditingParkingJob={(plog) => {
                                                        const loc = window.prompt("Update parking location:", plog.current || '');
                                                        if (loc !== null) {
                                                            updateDoc(doc(db, 'jobs', plog.id), { parkedLocation: loc }).then(() => toast.success("Location updated")).catch(() => toast.error("Failed to update"));
                                                        }
                                                    }}
                                                />

                                                <JobSwimlaneRow 
                                                    title={
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-purple-500" /> With Customer
                                                        </div>
                                                    }
                                                    jobs={visibleJobsForBoard.filter(j => !j.archived && (j.status === 'Delivered' || (j.tasks || []).some((t: any) => t.status === 'Delivered' || t.status === 'With Customer')))}
                                                    allStaff={allStaff}
                                                onTaskClockToggle={handleKanbanTaskClockToggle}
                                                currentUserId={currentUser?.uid}
                                                    globalOpenTaskLogs={globalOpenTaskLogs}
                                                    onJobClick={(job) => setActiveDrawerContext({ id: job.id, title: job.title || 'Workspace', type: 'job', payload: job.status })}
                                                    setEditingParkingJob={(plog) => {
                                                        const loc = window.prompt("Update parking location:", plog.current || '');
                                                        if (loc !== null) {
                                                            updateDoc(doc(db, 'jobs', plog.id), { parkedLocation: loc }).then(() => toast.success("Location updated")).catch(() => toast.error("Failed to update"));
                                                        }
                                                    }}
                                                />
                                            </div>
                                    </div>
                                </div>
                        </div>

                    </div>
                )}
            </div>

            {/* Right Sidebar - Live Operations Feed */}
            {(isSuperAdmin || checkPermission('manage_jobs') || checkPermission('manage_staff')) && (
                <LiveOperationsFeed onEventClick={(event) => {
                    if (event.jobId) {
                        setActiveDrawerContext({
                            id: event.jobId,
                            title: event.jobTitle || 'Job Update',
                            type: 'job',
                            payload: event.taskTitle ? { focusTask: event.taskTitle } : undefined
                        });
                    }
                }} />
            )}
        </div>

        {/* OFF-CANVAS UNIVERSAL POPUP TEMPLATE */}
        <WorkspaceModal
            isOpen={!!activeDrawerContext}
            onClose={() => setActiveDrawerContext(null)}
            title={activeDrawerContext?.title}
            subtitle={`#${activeDrawerContext?.id}`}
            headerBadge={
                <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded shrink-0">
                        Active Focus
                    </span>
                }
            >
                {activeDrawerContext?.id === 'GLOBAL_SEARCH' ? (
                    <div className="p-4 md:p-8 h-full bg-zinc-950/50">
                        <DashboardCommandHub 
                            allJobs={allJobs}
                            allStaff={allStaff}
                            onAction={(actionType, payload) => {
                                if (actionType === 'estimate') setActiveDrawerContext({ id: 'NEW-EST', title: 'New Estimate Builder', type: 'job' });
                                else if (actionType === 'customer') setActiveDrawerContext({ id: 'CUST-LOOKUP', title: `Customer: ${payload || 'Lookup'}`, type: 'job' });
                                else if (actionType === 'vehicle') setActiveDrawerContext({ id: 'INTAKE', title: `Vehicle Intake: ${payload || ''}`, type: 'job' });
                                else if (actionType === 'scan') setActiveDrawerContext({ id: payload || 'SCAN', title: `Scanned: ${payload}`, type: 'job' });
                                else if (actionType === 'open_job' && payload) setActiveDrawerContext({ id: payload, title: `Job Details`, type: 'job' });
                                else if (actionType === 'open_staff' && payload) setActiveDrawerContext({ id: payload, title: `Staff Profile`, type: 'staff' });
                            }}
                        />
                    </div>
                ) : activeDrawerContext?.type === 'timeclock' ? (
                    <TimeClockApp isDrawer={true} />
                ) : activeDrawerContext?.type === 'techportal' ? (
                    <TechPortal isDrawer={true} initialTaskView={activeDrawerContext.payload} />
                ) : activeDrawerContext?.type === 'staff' ? (
                    <div className="p-6 md:p-8 h-full">
                        <div className="border-2 border-dashed border-zinc-800 rounded-2xl h-full flex flex-col items-center justify-center text-zinc-500 p-8 text-center bg-zinc-950/20">
                            <User className="w-12 h-12 mb-4 opacity-50 text-emerald-400" />
                            <h3 className="text-xl font-bold text-zinc-300 mb-2">Staff Management Card</h3>
                            <p className="max-w-md text-sm">
                                View real-time status of this team member. Includes current assigned jobs, timeline tracking, and organizational profile.
                            </p>
                            <p className="max-w-md text-sm text-emerald-400 font-bold uppercase tracking-widest mt-6 border border-emerald-400/20 bg-emerald-400/10 py-1 px-4 rounded-full">Coming Soon</p>
                        </div>
                    </div>
                ) : activeDrawerContext?.id === 'NEW-EST' || activeDrawerContext?.id === 'CUST-LOOKUP' ? (
                    <div className="h-full bg-zinc-950">
                        <JobIntakeWizard
                            tenantId={tenantId!}
                            isEmbedded={true}
                            initialSearchName={activeDrawerContext.payload}
                            onComplete={(jobId) => {
                                toast.success("Draft created! Opening builder...");
                                setActiveDrawerContext({ id: jobId, title: `Job Details`, type: 'job', payload: 'Draft' });
                            }}
                            onClose={() => setActiveDrawerContext(null)}
                        />
                    </div>
                ) : activeDrawerContext?.id === 'INTAKE' ? (
                    <div className="p-6 md:p-8 h-full">
                        <div className="border-2 border-dashed border-zinc-800 rounded-2xl h-full flex flex-col items-center justify-center text-zinc-500 p-8 text-center bg-zinc-950/20">
                            <Car className="w-12 h-12 mb-4 opacity-50 text-blue-500" />
                            <h3 className="text-xl font-bold text-zinc-300 mb-2">Fast Vehicle Intake</h3>
                            <p className="max-w-md text-sm text-blue-500 font-bold uppercase tracking-widest mt-2 border border-blue-500/20 bg-blue-500/10 py-1 px-4 rounded-full">Coming Soon</p>
                        </div>
                    </div>
                ) : (activeDrawerContext?.payload === 'Draft' || activeDrawerContext?.payload === 'Estimate') ? (
                    <div className="h-full w-full bg-zinc-950 overflow-y-auto overflow-x-hidden custom-scrollbar">
                        <EstimateWizard 
                            jobId={activeDrawerContext?.id} 
                            onClose={() => setActiveDrawerContext(null)} 
                            onComplete={() => setActiveDrawerContext(null)}
                        />
                    </div>
                ) : (
                    <div className="h-full w-full bg-zinc-950 overflow-y-auto overflow-x-hidden custom-scrollbar pb-12">
                        {activeDrawerContext && (
                            <JobExecutionPortal 
                                key={`job-portal-${activeDrawerContext.id}-${typeof activeDrawerContext.payload === 'object' && activeDrawerContext.payload?.focusTask ? activeDrawerContext.payload.focusTask : 'default'}`}
                                jobId={activeDrawerContext.id as string} 
                                allStaff={allStaff}
                                focusTask={typeof activeDrawerContext.payload === 'object' ? activeDrawerContext.payload?.focusTask : undefined}
                            />
                        )}
                    </div>
                )}
            </WorkspaceModal>
            
            {parkingModalJob && (
                <ParkingModal
                    isOpen={!!parkingModalJob}
                    currentLocation={parkingModalJob?.current || ''}
                    onClose={() => setParkingModalJob(null)}
                    onSelect={(val) => {
                        if (parkingModalJob) {
                            updateDoc(doc(db, 'jobs', parkingModalJob.id), { parkedLocation: val })
                                .then(() => toast.success("Location updated"))
                                .catch(() => toast.error("Failed to update location"));
                        }
                        setParkingModalJob(null);
                    }}
                />
            )}

            {approvalModalJob && (
                <QuoteApprovalModal 
                    job={approvalModalJob} 
                    onClose={() => setApprovalModalJob(null)}
                    customer={globalCustomers.find(c => c.id === approvalModalJob.customerId)}
                    vehicle={globalVehicles.find(v => v.id === approvalModalJob.vehicleId)}
                />
            )}

            {/* Intake Scheduling Modal */}
            {intakeModalJob && (
                <IntakeSchedulingModal 
                    job={intakeModalJob} 
                    customer={globalCustomers.find(c => c.id === intakeModalJob.customerId)}
                    vehicle={globalVehicles.find(v => v.id === intakeModalJob.vehicleId)}
                    allStaff={allStaff}
                    tenantId={tenantId || ''}
                    onClose={() => setIntakeModalJob(null)} 
                />
            )}

            {/* Vehicle Check-In Modal */}
            {checkInModalJob && (
                <VehicleCheckInModal 
                    job={checkInModalJob}
                    customer={globalCustomers.find(c => c.id === checkInModalJob.customerId)}
                    vehicle={globalVehicles.find(v => v.id === checkInModalJob.vehicleId)}
                    tenantId={tenantId || ''}
                    onClose={() => setCheckInModalJob(null)}
                />
            )}
        </div>
    );
}
