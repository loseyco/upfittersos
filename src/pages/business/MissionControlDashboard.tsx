import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { api } from '../../lib/api';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { signInWithCustomToken } from 'firebase/auth';
import { Hammer, ArrowRight, ShieldCheck, Wrench, X, User, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { TimeClockApp } from './TimeClockApp';
import { TechPortal } from '../TechPortal';
import { StaffDayTimeline } from '../../components/dashboard/StaffDayTimeline';
import { JobSwimlaneRow } from '../../components/dashboard/SwimlaneBoard';
export function MissionControlDashboard() {
    const { currentUser, tenantId, role } = useAuth();
    const { checkPermission, loading } = usePermissions();
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

    // Live Data Feed: Task Tracking
    const [globalOpenTaskLogs, setGlobalOpenTaskLogs] = useState<any[]>([]);

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
        if (isSuperAdmin || checkPermission('manage_jobs') || checkPermission('view_jobs')) {
            return allJobs;
        }
        return allJobs.filter(j => {
            const hasAssignedTask = (j.tasks || []).some((t: any) => t.assignedUids?.includes(currentUser?.uid));
            return hasAssignedTask || j.assignedUids?.includes(currentUser?.uid);
        });
    }, [allJobs, isSuperAdmin, checkPermission, currentUser?.uid]);

    return (
        <div className="min-h-screen bg-zinc-950 p-0 relative overflow-hidden flex flex-col">
            {/* Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="max-w-[2560px] w-full mx-auto relative z-10 space-y-[2px] flex-1">
                {/* Compact Edge-to-Edge Welcome Ribbon */}
                <div className="flex items-center justify-between bg-zinc-900/50 border-b border-zinc-800/80 p-2 px-4 shadow-sm w-full backdrop-blur-sm z-20 relative">
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

                {/* 🛡️ Management Hub */}
                {(isSuperAdmin || checkPermission('manage_jobs')) && (
                    <div className="flex flex-col gap-2 md:gap-3 mb-4">
                        {/* Time Clock App Widget */}
                        <TimeClockApp isWidget={true} />

                        {/* Crew Timeline */}
                        <div>
                            <StaffDayTimeline tenantId={tenantId || 'GLOBAL'} allStaff={allStaff} />
                        </div>
                    </div>
                )}

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
                            
                            {visibleJobsForBoard.length > 0 && (
                                <div className="relative w-full bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 flex flex-col">
                                    <div className={`flex-1 flex flex-col`}>
                                        <div className="flex items-center justify-between mb-6">
                                            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                                <Hammer className="w-5 h-5 text-accent" /> Active Jobs
                                            </h2>
                                            <Link to="/business/jobs" className="text-xs font-bold text-zinc-400 hover:text-white uppercase tracking-widest flex items-center gap-1 transition-colors">
                                                View All <ArrowRight className="w-3 h-3" />
                                            </Link>
                                        </div>
                                        <div className="flex-1 flex flex-col lg:flex-row gap-6 lg:overflow-x-auto hide-scrollbar pt-2 relative">
                                            <div className="absolute top-0 right-0 -translate-y-12 shrink-0">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800">
                                                    Showing {visibleJobsForBoard.filter(j => !j.archived && j.status !== 'Draft' && (j.tasks || []).some((t: any) => t.status === 'In Progress' || t.status === 'Blocked' || t.status === 'Ready for QA')).length} Live Operations
                                                </span>
                                            </div>
                                            
                                            <JobSwimlaneRow 
                                                title={
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Blocked
                                                    </div>
                                                }
                                                jobs={visibleJobsForBoard.filter(j => !j.archived && j.status !== 'Draft' && (j.tasks || []).some((t: any) => t.status === 'Blocked'))}
                                                allStaff={allStaff}
                                                globalOpenTaskLogs={globalOpenTaskLogs}
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
                                                        <div className="w-2 h-2 rounded-full bg-indigo-500" /> In Progress
                                                    </div>
                                                }
                                                jobs={visibleJobsForBoard.filter(j => !j.archived && j.status !== 'Draft' && (j.tasks || []).some((t: any) => t.status === 'In Progress') && !(j.tasks || []).some((t: any) => t.status === 'Blocked'))}
                                                allStaff={allStaff}
                                                globalOpenTaskLogs={globalOpenTaskLogs}
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
                                                globalOpenTaskLogs={globalOpenTaskLogs}
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
                            )}
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
