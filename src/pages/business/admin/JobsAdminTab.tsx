import { useState, useEffect } from 'react';
import { Briefcase, Plus, RefreshCw, Truck, FlaskConical, MapPin } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useNavigate } from 'react-router-dom';

import { usePermissions } from '../../../hooks/usePermissions';

export function JobsAdminTab({ tenantId }: { tenantId: string }) {
    const { checkPermission } = usePermissions();
    const canManageJobs = checkPermission('manage_jobs') || true;
    const navigate = useNavigate();

    const [jobs, setJobs] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [zones, setZones] = useState<any[]>([]);

    const [loading, setLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);

    useEffect(() => {
        if (!tenantId || tenantId === 'unassigned') {
            setLoading(false);
            return;
        }
        setLoading(true);

        const unsubJobs = onSnapshot(query(collection(db, 'jobs'), where('tenantId', '==', tenantId)), (s) => {
            const fetched = s.docs.map(d => ({ id: d.id, ...d.data() }));
            fetched.sort((a: any, b: any) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?._seconds ? a.createdAt._seconds * 1000 : 0);
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?._seconds ? b.createdAt._seconds * 1000 : 0);
                return timeB - timeA;
            });
            setJobs(fetched);
            setLoading(false);
        });

        const unsubCustomers = onSnapshot(query(collection(db, 'customers'), where('tenantId', '==', tenantId)), (s) => {
            setCustomers(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('tenantId', '==', tenantId)), (s) => {
            setVehicles(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubZones = onSnapshot(query(collection(db, 'business_zones'), where('tenantId', '==', tenantId)), (s) => {
            setZones(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubJobs();
            unsubCustomers();
            unsubVehicles();
            unsubZones();
        };
    }, [tenantId]);



    const getCustomerName = (cId: string) => {
        const c = customers.find(x => x.id === cId);
        if (!c) return '—';
        return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Unnamed Customer';
    };

    const getVehicleName = (vId: string) => {
        const v = vehicles.find(x => x.id === vId);
        if (!v) return '—';
        return `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || 'Unknown Vehicle';
    };

    const getZoneName = (zoneId: string) => {
        const z = zones.find(x => x.id === zoneId);
        return z ? z.label || z.name || zoneId : zoneId;
    };

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center flex items-center justify-center gap-2"><RefreshCw className="w-5 h-5 animate-spin" /> Loading Ops Data...</div>;
    }

    const displayedJobs = jobs.filter(j => showArchived ? (j.archived || j.status === 'Archived' || j.status === 'archived') : (!j.archived && j.status !== 'Archived' && j.status !== 'archived'));

    return (
        <div className="flex flex-col h-full bg-zinc-950 relative">
            <div className="bg-orange-500/5 border-b border-orange-500/20 px-6 py-3 flex items-start gap-3 shrink-0 relative z-10">
                <FlaskConical className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                    <h4 className="text-orange-400 font-bold text-sm">Feature Preview (Alpha Roadmap)</h4>
                    <p className="text-orange-400/80 text-xs mt-0.5">Job Management is currently migrating to the new dedicated Job Pipeline interface.</p>
                </div>
            </div>

            <div className="p-4 bg-zinc-900 border-b border-zinc-800 shrink-0 flex items-center justify-between relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-white font-bold tracking-tight">Jobs & Dispatch</h3>
                        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                            Alpha Labs
                        </span>
                    </div>
                    <p className="text-zinc-500 text-xs">Manage work orders, assignments, and invoicing lines.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowArchived(!showArchived)}
                        className={`text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg flex items-center gap-2 border transition-colors ${showArchived ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-300'}`}
                    >
                        {showArchived ? 'Viewing Archived' : 'Show Archived'}
                    </button>
                    {!showArchived && (
                        <div className="text-xs font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            Live
                        </div>
                    )}
                    {canManageJobs && (
                        <button
                            onClick={() => navigate('/business/jobs/new')}
                            className="bg-accent hover:bg-accent-hover text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
                        >
                            <Plus className="w-4 h-4" /> New Work Order
                        </button>
                    )}
                </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-zinc-900/50 border-b border-zinc-800 text-xs font-black text-zinc-500 uppercase tracking-widest shrink-0">
                <div className="col-span-5 md:col-span-4">Job Ticket</div>
                <div className="hidden md:block col-span-3">Customer / Asset</div>
                <div className="col-span-2 md:col-span-2 text-center">Status</div>
                <div className="col-span-5 md:col-span-3 text-right">Actions</div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto">
                {displayedJobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <Briefcase className="w-12 h-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-1">{showArchived ? 'No Archived Jobs' : 'No Active Jobs'}</h3>
                        <p className="text-zinc-500 text-sm">{showArchived ? 'Archived work orders will appear here.' : 'Create a new work order to begin tracking production.'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800/50">
                        {displayedJobs.map((job) => (
                            <div key={job.id} onClick={() => navigate(`/business/jobs/${job.id}`)} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-zinc-900/30 transition-colors group cursor-pointer">
                                <div className="col-span-5 md:col-span-4 flex flex-col pr-2">
                                    <span className="font-bold text-sm text-zinc-200 group-hover:text-accent transition-colors truncate">
                                        {job.title || 'Untitled Work Order'}
                                    </span>
                                    <span className="text-[10px] font-mono text-zinc-500 mt-0.5 tracking-wider truncate">
                                        #{job.id.substring(0, 8).toUpperCase()}
                                        {job.priority !== 'Medium' && ` • ${job.priority}`}
                                    </span>
                                </div>
                                <div className="hidden md:flex col-span-3 flex-col text-xs text-zinc-400">
                                    <span className="font-bold text-zinc-300 truncate">{job.customerId ? getCustomerName(job.customerId) : 'No Customer'}</span>
                                    <span className="font-medium text-zinc-500 mt-0.5 truncate flex items-center gap-1"><Truck className="w-3 h-3" /> {job.vehicleId ? getVehicleName(job.vehicleId) : 'No Vehicle'}</span>
                                    {job.currentLocationId && (
                                        <span className="font-bold text-indigo-400 mt-0.5 truncate flex items-center gap-1">
                                            <MapPin className="w-3 h-3" /> {getZoneName(job.currentLocationId)}
                                        </span>
                                    )}
                                    {!job.currentLocationId && job.parkedLocation && (
                                        <span className="font-bold text-indigo-400 mt-0.5 truncate flex items-center gap-1">
                                            <MapPin className="w-3 h-3" /> {job.parkedLocation}
                                        </span>
                                    )}
                                </div>
                                <div className="col-span-2 md:col-span-2 flex items-center justify-center">
                                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest rounded border whitespace-nowrap ${job.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                            job.status === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                job.status === 'Awaiting Parts' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                                    'bg-zinc-800 text-zinc-400 border-zinc-700'
                                        }`}>
                                        {job.status || 'Pending'}
                                    </span>
                                </div>
                                <div className="col-span-5 md:col-span-3 flex items-center justify-end">
                                    <div className="text-zinc-600 group-hover:text-accent transition-colors ml-2 hidden md:block border border-zinc-700 bg-zinc-800 rounded px-3 py-1 font-bold text-[10px] uppercase tracking-widest">
                                        View Job
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
