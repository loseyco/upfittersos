import { useState, useEffect } from 'react';
import { Activity, Clock, Wrench, AlertTriangle, Map as MapIcon, RefreshCw, MapPin, ArrowLeft, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';

export function OpsMissionControl() {
    const { tenantId } = useAuth();
    const navigate = useNavigate();
    const { checkPermission, loading: permsLoading } = usePermissions();
    const canView = checkPermission('manage_jobs');
    const [jobs, setJobs] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tenantId || tenantId === 'unassigned') {
            setLoading(false);
            return;
        }

        setLoading(true);

        const qJobs = query(
            collection(db, 'jobs'),
            where('tenantId', '==', tenantId)
        );

        const unsubJobs = onSnapshot(qJobs, (snapshot) => {
            const loadedJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setJobs(loadedJobs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching jobs:", error);
            toast.error("Failed to load live ops data");
            setLoading(false);
        });

        const qVehicles = query(
            collection(db, 'vehicles'),
            where('tenantId', '==', tenantId)
        );

        const unsubVehicles = onSnapshot(qVehicles, (snapshot) => {
            const loadedVehICLES = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setVehicles(loadedVehICLES);
        }, (error) => {
            console.error("Error fetching vehicles:", error);
        });

        return () => {
            unsubJobs();
            unsubVehicles();
        };
    }, [tenantId]);

    if (permsLoading || loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-emerald-500/50">
                <RefreshCw className="w-8 h-8 animate-spin mb-4" />
                <span className="text-xs font-black tracking-widest uppercase">Initializing Ops Command...</span>
            </div>
        );
    }

    if (!canView) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center p-6">
                <ShieldAlert className="w-16 h-16 text-red-500/50 mb-6" />
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">Access Denied</h2>
                <p className="text-zinc-500 max-w-md">Your profile does not have Mission Control clearance.</p>
                <button onClick={() => navigate('/dashboard')} className="mt-8 text-accent hover:text-white transition-colors flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Return to Hub
                </button>
            </div>
        );
    }

    // Calculations based on live data
    const pendingIntake = jobs.filter(j => j.status === 'Pending').length;
    const activeJobs = jobs.filter(j => j.status === 'In Progress');
    const waitingParts = jobs.filter(j => j.status === 'Awaiting Parts');
    const readyForQA = jobs.filter(j => ['Ready for QA', 'QC', 'Quality Check'].includes(j.status)).length;
    const readyForDelivery = jobs.filter(j => j.status === 'Completed').length;
    const weeklyStats = jobs.filter(j => j.status === 'Completed').length;

    const getVehicleDetails = (vId: string) => {
        const v = vehicles.find(x => x.id === vId);
        if (!v) return 'Unknown Vehicle';
        return `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || 'Unknown Vehicle';
    };

    const getJobTitle = (job: any) => {
        return job?.title || 'Untitled Work Order';
    };

    return (
        <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden font-sans">
            <div className="p-4 md:px-8 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between shrink-0 relative z-10 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="p-2 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                            <Activity className="w-5 h-5 text-emerald-400" /> Ops Command Mission Control
                        </h2>
                        <p className="text-zinc-500 text-xs mt-0.5">Live floor overview, bay utilization, and bottleneck tracking.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-xs font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-2 rounded-lg flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Live Sync
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8">
                {/* GLOBAL FLEET PIPELINE */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-6">Global Fleet Pipeline</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-6 divide-x divide-zinc-800/50">
                        <div className="px-4 first:px-0">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Pending Intake</p>
                            <p className="text-3xl font-black">{pendingIntake}</p>
                            <p className="text-xs text-zinc-500 mt-1">Scheduled next 14 days</p>
                        </div>
                        <div className="px-4">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Active Bays</p>
                            <p className="text-3xl font-black text-white">{activeJobs.length}</p>
                            <p className="text-xs text-zinc-500 mt-1">Currently being worked on</p>
                        </div>
                        <div className="px-4">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Ready for QA</p>
                            <p className="text-3xl font-black text-white">{readyForQA}</p>
                            <p className="text-xs text-zinc-500 mt-1">Awaiting inspection</p>
                        </div>
                        <div className="px-4">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Ready for Delivery</p>
                            <p className="text-3xl font-black text-white">{readyForDelivery}</p>
                            <p className="text-xs text-zinc-500 mt-1">Pending client pickup</p>
                        </div>
                        <div className="px-4">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Weekly Stats</p>
                            <p className="text-3xl font-black text-emerald-400">{weeklyStats}</p>
                            <p className="text-xs text-zinc-500 mt-1">Vehicles delivered this week</p>
                        </div>
                    </div>
                </div>

                {/* KPI Cards Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                    <div className="bg-zinc-900 border-2 border-emerald-500/30 rounded-2xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 bg-emerald-500 h-full"></div>
                        <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-2">Active Bays</h3>
                        <div className="flex items-end gap-2">
                            <span className="text-3xl font-black text-white">{activeJobs.length}</span>
                            <span className="text-lg font-bold text-zinc-600 mb-1">/ 6</span>
                        </div>
                        {activeJobs.length > 0 ? (
                            <p className="text-xs font-bold text-emerald-400 mt-2">All Bays Online</p>
                        ) : (
                            <p className="text-xs font-bold text-zinc-500 mt-2">Ready</p>
                        )}
                    </div>

                    <div className="bg-zinc-900 border-2 border-orange-500/30 rounded-2xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 bg-orange-500 h-full"></div>
                        <h3 className="text-xs font-black text-orange-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                            <Clock className="w-3 h-3" /> Waiting Parts
                        </h3>
                        <div className="flex items-end gap-2">
                            <span className="text-3xl font-black text-orange-400">{waitingParts.length}</span>
                            <span className="text-sm font-bold text-zinc-500 mb-1.5 pt-1">Vehicles</span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-2">
                            {waitingParts.length > 0 ? 'Parts pending arrival' : 'No current delays'}
                        </p>
                    </div>

                    <div className="bg-zinc-900 border-2 border-red-500/30 rounded-2xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 bg-red-500 h-full"></div>
                        <h3 className="text-xs font-black text-red-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-3 h-3" /> Tech Assists
                        </h3>
                        <div className="flex items-end gap-2">
                            <span className="text-3xl font-black text-red-500">
                                {jobs.filter(j => j.priority === 'Critical').length}
                            </span>
                            <span className="text-sm font-bold text-zinc-500 mb-1.5 pt-1">Active Call</span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-2">
                            {jobs.filter(j => j.priority === 'Critical').length > 0 
                                ? 'Immediate assistance needed' 
                                : 'All clear'}
                        </p>
                    </div>

                    <div className="bg-zinc-900 border-2 border-blue-500/30 rounded-2xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 bg-blue-500 h-full"></div>
                        <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-2">Ready for QA</h3>
                        <div className="flex items-end gap-2">
                            <span className="text-3xl font-black text-white">{readyForQA}</span>
                            <span className="text-sm font-bold text-zinc-500 mb-1.5 pt-1">Vehicles</span>
                        </div>
                        {readyForQA > 0 && (
                            <p className="text-xs font-bold text-blue-400 mt-2 cursor-pointer hover:underline">Review Pending Inspections</p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Floor Map Section */}
                    <div className="lg:col-span-2">
                        <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                            <MapIcon className="w-5 h-5 text-blue-500" /> Floor Map
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Live Active Bays mapping from active jobs */}
                            {activeJobs.map((job, idx) => (
                                <div key={job.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
                                    <div className="flex justify-between items-start mb-4">
                                        <h4 className="text-sm font-black text-zinc-400 uppercase tracking-widest">
                                            BAY {idx + 1}
                                        </h4>
                                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded">
                                            ACTIVE
                                        </span>
                                    </div>
                                    <div>
                                        <p className="font-bold text-lg text-white truncate">{job.vehicleId ? getVehicleDetails(job.vehicleId) : 'Unknown Asset'}</p>
                                        <p className="text-sm text-zinc-400 truncate">{getJobTitle(job)}</p>
                                    </div>
                                    <div className="flex justify-between items-end mt-6">
                                        <div>
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Tech Assigned</p>
                                            <div className="flex items-center gap-2 text-sm font-medium text-white">
                                                <div className="w-5 h-5 rounded-full bg-zinc-800 overflow-hidden relative border border-zinc-700 font-mono text-[10px] flex items-center justify-center">?</div>
                                                {job.assignedStaffId ? 'Staff' : 'Unassigned'}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Job ID</p>
                                            <p className="text-sm font-mono text-emerald-400">#{job.id.substring(0,6).toUpperCase()}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Live Waiting Parts Bays */}
                            {waitingParts.map((job) => (
                                <div key={job.id} className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-5 relative overflow-hidden group">
                                    <div className="flex justify-between items-start mb-4">
                                        <h4 className="text-sm font-black text-orange-500 uppercase tracking-widest">
                                            WAITING BAY
                                        </h4>
                                        <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded">
                                            BLOCKED
                                        </span>
                                    </div>
                                    <div>
                                        <p className="font-bold text-lg text-white truncate">{job.vehicleId ? getVehicleDetails(job.vehicleId) : 'Unknown Asset'}</p>
                                        <p className="text-sm text-zinc-400 truncate">{getJobTitle(job)}</p>
                                        <div className="mt-3 bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs p-2.5 rounded-lg flex gap-2">
                                            <AlertTriangle className="w-4 h-4 shrink-0" />
                                            <span>{job.notes || 'Awaiting materials / components.'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {activeJobs.length === 0 && waitingParts.length === 0 && (
                                <div className="col-span-2 bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl p-12 text-center text-zinc-500 flex flex-col items-center justify-center">
                                    <Wrench className="w-8 h-8 mb-4 text-zinc-700" />
                                    <p className="font-bold">No Active Work Orders mapped to Bays</p>
                                    <p className="text-sm">Start an active job to populate the floor map.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right column: Lot Queue & Dispatch Stream */}
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-sm font-black text-zinc-400 uppercase tracking-widest flex items-center justify-between mb-4">
                                <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-zinc-500" /> Lot / Queue</span>
                                <span className="bg-zinc-800 text-zinc-300 text-[10px] px-2 py-1 rounded">{pendingIntake} Vehicles</span>
                            </h3>
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800/50">
                                {jobs.filter(j => j.status === 'Pending').slice(0, 5).map((job, idx) => (
                                    <div key={job.id} className="p-3.5 flex items-center gap-3">
                                        <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded flex flex-col items-center justify-center shrink-0">
                                            <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Spot</span>
                                            <span className="text-xs font-mono font-bold text-white">Q{idx+1}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white truncate">{job.vehicleId ? getVehicleDetails(job.vehicleId) : 'Asset Pending'}</p>
                                            <p className="text-[10px] text-zinc-500 font-mono truncate">#{job.id.substring(0,8).toUpperCase()} • Queue</p>
                                        </div>
                                        <span className="bg-zinc-800 text-zinc-400 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded shrink-0">
                                            INTAKE DONE
                                        </span>
                                    </div>
                                ))}

                                {pendingIntake === 0 && (
                                    <div className="p-6 text-center text-zinc-500 text-sm">No vehicles pending intake in the lot.</div>
                                )}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-black text-zinc-400 uppercase tracking-widest mb-4">
                                Live Dispatch Stream
                            </h3>
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
                                {activeJobs.length > 0 ? (
                                    activeJobs.slice(0, 3).map((job, idx) => (
                                        <div key={job.id} className="flex gap-3 text-sm">
                                            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>
                                            <div>
                                                <p className="text-zinc-300"><span className="text-white font-bold">Bay {idx+1} Update:</span> Working on {job.vehicleId ? getVehicleDetails(job.vehicleId) : 'Asset'}</p>
                                                <p className="text-[10px] text-zinc-500 mt-1 font-mono">Just now</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-zinc-500 text-center py-4">No recent dispatch activity.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
