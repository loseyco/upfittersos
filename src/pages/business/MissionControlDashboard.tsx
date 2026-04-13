import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { api } from '../../lib/api';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Building2, Clock, CheckCircle2, AlertTriangle, Hammer, ArrowRight, Package, Info, CheckSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

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

export function MissionControlDashboard() {
    const { currentUser, tenantId, role } = useAuth();
    const { checkPermission, loading } = usePermissions();
    const [businessName, setBusinessName] = useState('Loading Dashboard...');

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

    // Track active shift status natively on the dashboard
    const [activeShift, setActiveShift] = useState<any>(null);
    const [shiftElapsed, setShiftElapsed] = useState('00:00:00');
    
    // Active jobs cache
    const [activeJobs, setActiveJobs] = useState<any[]>([]);

    useEffect(() => {
        if (!currentUser?.uid || !tenantId || tenantId === 'GLOBAL') return;
        
        const qLogs = query(
            collection(db, 'businesses', tenantId, 'time_logs'),
            where('userId', '==', currentUser.uid),
            where('status', '==', 'open')
        );

        const unsubLogs = onSnapshot(qLogs, (snap) => {
            if (!snap.empty) {
                setActiveShift(snap.docs[0].data());
            } else {
                setActiveShift(null);
            }
        });

        // Track active jobs for Floor Widget
        const qJobs = query(
            collection(db, 'jobs'),
            where('tenantId', '==', tenantId)
        );
        const unsubJobs = onSnapshot(qJobs, (snap) => {
            const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const floorStatus = ['In Progress', 'Ready for QC', 'Ready for Invoicing', 'Ready for Delivery'];
            const active = fetched.filter((j: any) => floorStatus.includes(j.status));
            
            active.sort((a: any, b: any) => {
                const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
                const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
                return timeB - timeA;
            });
            
            setActiveJobs(active.slice(0, 8)); // Show top 8
        });

        return () => {
            unsubLogs();
            unsubJobs();
        };
    }, [currentUser, tenantId]);

    // Live clock ticker for shift
    useEffect(() => {
        if (!activeShift?.clockIn) {
            setShiftElapsed('00:00:00');
            return;
        }

        const tick = () => {
             const start = new Date(activeShift.clockIn).getTime();
             const now = new Date().getTime();
             const diff = now - start;
             
             const h = Math.floor(diff / 3600000);
             const m = Math.floor((diff % 3600000) / 60000);
             const s = Math.floor((diff % 60000) / 1000);
             
             setShiftElapsed(
                 `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
             );
        };
        
        tick();
        const intv = setInterval(tick, 1000);
        return () => clearInterval(intv);
    }, [activeShift]);

    const isSuperAdmin = role === 'system_owner' || role === 'super_admin';
    const firstName = currentUser?.displayName ? currentUser.displayName.split(' ')[0] : 'Commander';

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8 relative overflow-hidden flex flex-col">
            {/* Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="max-w-[2560px] xl:px-4 2xl:px-8 mx-auto w-full relative z-10 space-y-6 md:space-y-8 flex-1">
                {/* Header Profile */}
                <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 pb-6 border-b border-zinc-800/50">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shadow-inner">
                                <Building2 className="w-4 h-4 text-accent" />
                            </div>
                            <span className="text-xs font-bold text-accent uppercase tracking-widest leading-none drop-shadow-[0_0_8px_rgba(20,184,166,0.5)]">
                                {businessName} • OPERATIONS PORTAL
                            </span>
                        </div>
                        <h1 className="text-3xl md:text-5xl font-light text-zinc-300 tracking-tight">
                            Welcome back, <span className="font-black text-white">{firstName}</span>
                        </h1>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-zinc-400">Identity Bound As</span>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="bg-accent/20 text-accent border border-accent/30 text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-lg">
                                {role?.replace('_', ' ') || 'Staff'}
                            </span>
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
                        
                        {/* Quick Top Stats / Actions */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4 gap-4 md:gap-6">
                            <Link to="/business/tech" className="relative bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 px-4 py-6 rounded-2xl flex flex-col justify-center transition-colors group overflow-hidden">
                                <PermissionExplainer reason="Available to all staff implicitly to perform field operations." />
                                <Hammer className="w-6 h-6 text-amber-500 mb-2 group-hover:scale-110 transition-transform" />
                                <span className="font-bold text-amber-100 text-sm">Tech Portal</span>
                                <span className="text-[10px] text-amber-500/70 uppercase tracking-wider font-bold">Wrench Mode</span>
                                <div className="absolute bottom-4 right-4 flex items-end gap-[2px] h-4 opacity-40">
                                    <div className="w-1 h-3/4 bg-amber-500 rounded-t-sm" />
                                    <div className="w-1 h-1/2 bg-amber-500/50 rounded-t-sm" />
                                    <div className="w-1 h-full bg-amber-400 rounded-t-sm" />
                                </div>
                            </Link>

                            <Link to={(isSuperAdmin || checkPermission('view_jobs')) ? "/business/jobs" : "#"} onClick={e => !(isSuperAdmin || checkPermission('view_jobs')) && e.preventDefault()}  className={`relative px-4 py-6 rounded-2xl flex flex-col justify-center transition-colors group overflow-hidden ${!(isSuperAdmin || checkPermission('view_jobs')) ? 'bg-zinc-900 border border-zinc-800' : 'bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/20'}`}>
                                <PermissionExplainer reason="Visible due to your current operational role providing access to build Estimates or View Jobs." />
                                <div className={`flex flex-col ${!(isSuperAdmin || checkPermission('view_jobs')) ? 'opacity-30 blur-sm pointer-events-none grayscale' : ''}`}>
                                    <CheckCircle2 className={`w-6 h-6 mb-2 group-hover:scale-110 transition-transform ${!(isSuperAdmin || checkPermission('view_jobs')) ? 'text-zinc-500' : 'text-indigo-500'}`} />
                                    <span className={`font-bold text-sm ${!(isSuperAdmin || checkPermission('view_jobs')) ? 'text-zinc-500' : 'text-indigo-100'}`}>Job Hub</span>
                                    <span className={`text-[10px] uppercase tracking-wider font-bold ${!(isSuperAdmin || checkPermission('view_jobs')) ? 'text-zinc-600' : 'text-indigo-500/70'}`}>Manage Work</span>
                                    <div className="absolute bottom-4 right-4 flex items-end gap-[2px] h-4 opacity-40">
                                        <div className="w-1 h-1/3 bg-indigo-500 rounded-t-sm" />
                                        <div className="w-1 h-3/4 bg-indigo-400 rounded-t-sm" />
                                        <div className="w-1 h-1/2 bg-indigo-500 rounded-t-sm" />
                                        <div className="w-1 h-full bg-indigo-400 rounded-t-sm" />
                                    </div>
                                </div>
                            </Link>

                            <Link to="/business/time" className="relative bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/20 px-4 py-6 rounded-2xl flex flex-col justify-center transition-colors group overflow-hidden">
                                <PermissionExplainer reason="Globally accessible for recording staff hours and punches." />
                                <Clock className="w-6 h-6 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                                <span className="font-bold text-blue-100 text-sm">Time Clock</span>
                                <span className="text-[10px] text-blue-500/70 uppercase tracking-wider font-bold">Punches</span>
                                <div className="absolute bottom-4 right-4 flex items-end gap-[2px] h-4 opacity-40">
                                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                                    <div className="w-2 h-2 rounded-full bg-blue-500/50" />
                                    <div className="w-2 h-2 rounded-full bg-blue-500/50" />
                                </div>
                            </Link>
                            
                            <Link to={(isSuperAdmin || checkPermission('manage_settings')) ? "/business/manage" : "#"} onClick={e => !(isSuperAdmin || checkPermission('manage_settings')) && e.preventDefault()} className={`relative px-4 py-6 rounded-2xl flex flex-col justify-center transition-colors group overflow-hidden ${!(isSuperAdmin || checkPermission('manage_settings')) ? 'bg-zinc-900 border border-zinc-800' : 'bg-accent/5 hover:bg-accent/10 border border-zinc-700 hover:border-accent/30'}`}>
                                <PermissionExplainer reason="You hold 'manage_settings' or 'super_admin' clearance covering global properties." />
                                <div className={`flex flex-col ${!(isSuperAdmin || checkPermission('manage_settings')) ? 'opacity-30 blur-sm pointer-events-none grayscale' : ''}`}>
                                    <Building2 className={`w-6 h-6 mb-2 group-hover:scale-110 transition-transform ${!(isSuperAdmin || checkPermission('manage_settings')) ? 'text-zinc-500' : 'text-accent'}`} />
                                    <span className={`font-bold text-sm ${!(isSuperAdmin || checkPermission('manage_settings')) ? 'text-zinc-500' : 'text-white'}`}>Biz Admin</span>
                                    <span className={`text-[10px] uppercase tracking-wider font-bold ${!(isSuperAdmin || checkPermission('manage_settings')) ? 'text-zinc-600' : 'text-accent/50'}`}>Settings</span>
                                    <div className="absolute bottom-4 right-4 flex items-end gap-[1px] h-4 opacity-30">
                                        {Array.from({ length: 6 }).map((_, i) => (
                                            <div key={i} className="w-[2px] bg-accent" style={{ height: `${Math.random() * 100}%` }} />
                                        ))}
                                    </div>
                                </div>
                            </Link>
                        </div>

                        {/* First Major Split: Jobs / Floor vs Personal Tasks */}
                        <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-4 gap-6 md:gap-8">
                            
                            {/* Operational Status Panel - Spans 2 Cols */}
                            <div className="relative xl:col-span-2 2xl:col-span-3 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 flex flex-col">
                                <PermissionExplainer reason="Because you hold 'view_jobs' credentials, you can see all live operational movement on the floor." />
                                <div className={`flex-1 flex flex-col ${!(isSuperAdmin || checkPermission('view_jobs')) ? 'opacity-30 blur-[4px] pointer-events-none grayscale' : ''}`}>
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                            <Hammer className="w-5 h-5 text-accent" /> Active Floor Status
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
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {activeJobs.map((job: any) => (
                                                    <Link 
                                                        key={job.id} 
                                                        to={`/business/jobs/${job.id}`}
                                                        className="bg-zinc-950/50 hover:bg-indigo-500/10 border border-zinc-800 hover:border-indigo-500/30 rounded-xl p-4 flex flex-col justify-between transition-colors group relative overflow-hidden"
                                                    >
                                                        <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 rounded-bl-full group-hover:scale-125 transition-transform origin-top-right"></div>
                                                        <div className="flex justify-between items-start mb-3 relative z-10">
                                                            <span className="font-bold text-zinc-200 line-clamp-1">{job.title || 'Untitled Job'}</span>
                                                            {job.tagNumber && (
                                                                <span className="bg-indigo-500 text-white font-black text-[10px] px-2 py-0.5 rounded uppercase tracking-widest shadow-sm shadow-indigo-500/20 shrink-0 ml-2">
                                                                    #{job.tagNumber}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex justify-between items-end relative z-10">
                                                            <div className="flex flex-col">
                                                                <span className="text-xs text-zinc-500 mb-0.5">Status</span>
                                                                <span className={`text-[10px] font-bold uppercase tracking-widest ${
                                                                    job.status === 'In Progress' ? 'text-blue-400' :
                                                                    job.status === 'Ready for QC' ? 'text-amber-400' : 'text-emerald-400'
                                                                }`}>
                                                                    {job.status}
                                                                </span>
                                                            </div>
                                                            <span className="text-zinc-600 group-hover:text-indigo-400 transition-colors">
                                                                <ArrowRight className="w-4 h-4" />
                                                            </span>
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Attention Required / Widget Column */}
                            <div className="space-y-6 flex flex-col">
                                
                                {/* Current Shift / Clock Block */}
                                <div className="relative bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                                    <PermissionExplainer reason="Displays personal shift data. Unique strictly to your User Identity." />
                                    <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2 mb-4">
                                        <Clock className="w-5 h-5 text-blue-400" /> My Shift
                                    </h2>
                                    <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800 text-center flex flex-col items-center">
                                        <span className="text-xs font-black uppercase tracking-widest text-zinc-500 block mb-1">
                                            {activeShift ? 'Clocked In' : 'Status'}
                                        </span>
                                        {activeShift ? (
                                             <div className="flex flex-col items-center">
                                                 <span className="text-2xl font-black text-emerald-400 font-mono drop-shadow-[0_0_8px_rgba(52,211,153,0.5)] tracking-widest mb-1">
                                                     {shiftElapsed}
                                                 </span>
                                                 <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                                                     Active Shift Time
                                                 </span>
                                             </div>
                                        ) : (
                                            <>
                                                <span className="text-lg font-bold text-zinc-300 mb-2">Off Shift</span>
                                                <Link to="/business/time" className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors w-full border border-blue-500 border-b-4 active:border-b-0 active:translate-y-[4px]">
                                                    Open Clock
                                                </Link>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Overdue / Important Alerts */}
                                <div className="relative bg-zinc-900/50 border border-red-500/20 rounded-3xl p-6 flex-1">
                                    <PermissionExplainer reason="Scans across Tasks and Assets bound to your clearance level for severe overdue compliance delays." />
                                    <h2 className="text-lg font-bold text-red-100 tracking-tight flex items-center gap-2 mb-4">
                                        <AlertTriangle className="w-5 h-5 text-red-500" /> Action Required
                                    </h2>
                                    <ul className="space-y-3">
                                        <li className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-3 text-red-200 text-sm">
                                            Scanning for internal blockers or overdue actions...
                                        </li>
                                    </ul>
                                </div>
                            </div>
                            
                        </div>

                        {/* Development Roadmap List */}
                        <div className="mt-12 pt-8 border-t border-zinc-900">
                            <h3 className="text-sm font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                                <CheckSquare className="w-4 h-4" /> Planned Dashboard Modules
                            </h3>
                            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6">
                                <ul className="space-y-3 text-sm text-zinc-400 font-medium">
                                    <li className="flex items-start gap-3">
                                        <div className="w-5 h-5 rounded bg-zinc-800 border border-zinc-700 flex-shrink-0 flex items-center justify-center text-[10px] mt-0.5"></div>
                                        <span><strong>Active Jobs Widget:</strong> Stream live estimates assigned to `In Progress` or `Ready for QA` into the "Active Floor Status" grid so they can be clicked immediately.</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <div className="w-5 h-5 rounded bg-zinc-800 border border-zinc-700 flex-shrink-0 flex items-center justify-center text-[10px] mt-0.5"></div>
                                        <span><strong>Admin Tasks Widget:</strong> Scan the `admin_tasks` collection and present overdue / today's tasks straight into the "Action Required" sidebar.</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <div className="w-5 h-5 rounded bg-zinc-800 border border-zinc-700 flex-shrink-0 flex items-center justify-center text-[10px] mt-0.5"></div>
                                        <span><strong>Facility Area Map:</strong> Embed a micro-view of the Interactive Facility Map for physical overview.</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <div className="w-5 h-5 rounded bg-zinc-800 border border-zinc-700 flex-shrink-0 flex items-center justify-center text-[10px] mt-0.5"></div>
                                        <span><strong>Inventory Quick-Scan:</strong> Optional shortcut overlay if camera/inventory routing is available.</span>
                                    </li>
                                </ul>
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}
