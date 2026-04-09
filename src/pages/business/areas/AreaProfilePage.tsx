import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../../lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../../contexts/AuthContext';
import { ArrowLeft, MapPin, Truck, Wrench, Calendar, FileText, Server } from 'lucide-react';
import toast from 'react-hot-toast';
import { FacilityMapTab } from '../admin/FacilityMapTab';

export function AreaProfilePage() {
    const { areaId } = useParams();
    const navigate = useNavigate();
    const { tenantId } = useAuth();
    
    const [isLoading, setIsLoading] = useState(true);
    const [area, setArea] = useState<any>(null);
    const [activeJobs, setActiveJobs] = useState<any[]>([]);

    useEffect(() => {
        if (!areaId || !tenantId || tenantId === 'GLOBAL') return;

        let isMounted = true;
        
        // 1. Fetch Area details
        const fetchArea = async () => {
            try {
                const docRef = doc(db, 'business_zones', areaId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists() && isMounted) {
                    setArea({ id: docSnap.id, ...docSnap.data() });
                } else if (isMounted) {
                    toast.error("Area not found.");
                    navigate('/business/facility');
                }
            } catch (err) {
                console.error("Failed to load area", err);
                if (isMounted) navigate('/business/facility');
            }
        };

        fetchArea();

        // 2. Stream Active Jobs occupying this area
        const jobsQ = query(
            collection(db, 'jobs'),
            where('tenantId', '==', tenantId),
            where('currentLocationId', '==', areaId),
            where('status', 'in', ['Estimate', 'Approved', 'In Progress', 'Ready for QC', 'Ready for Delivery'])
        );
        const unsubJobs = onSnapshot(jobsQ, (snapshot) => {
            if (!isMounted) return;
            setActiveJobs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsLoading(false);
        });

        return () => {
            isMounted = false;
            unsubJobs();
        };

    }, [areaId, tenantId, navigate]);

    if (isLoading) {
        return (
            <div className="flex-1 bg-[#111111] overflow-y-auto">
                <div className="max-w-7xl mx-auto p-4 md:p-8 flex items-center justify-center min-h-[400px]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 bg-[#111111] overflow-y-auto">
            {/* Header Content */}
            <div className="border-b border-zinc-800 bg-zinc-950/50 pt-8 pb-6 px-4 md:px-8">
                <div className="max-w-7xl mx-auto">
                    <button 
                        onClick={() => navigate('/business/facility')}
                        className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-6 text-sm font-medium"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back 
                    </button>
                    
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400">
                                    <MapPin className="w-6 h-6" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-extrabold text-white tracking-tight">
                                        {area?.label || areaId}
                                    </h1>
                                    <div className="text-zinc-500 font-medium flex items-center gap-2 mt-1">
                                        <span className="uppercase text-xs font-bold tracking-wider">{area?.type || 'Zone'}</span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-700"></span>
                                        <span>Capacity: {area?.capacity || '1 Vehicle'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-xs uppercase font-bold tracking-wider text-zinc-500 mb-1 block">Live Status</span>
                            <div className={`px-4 py-1.5 rounded-full border border-opacity-20 font-bold inline-flex items-center gap-2 ${
                                activeJobs.length > 0 ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                            }`}>
                                <div className={`w-2 h-2 rounded-full ${activeJobs.length > 0 ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`}></div>
                                {activeJobs.length > 0 ? 'OCCUPIED' : 'AVAILABLE'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Page Content Grid */}
            <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">

                {/* Area Footprint Map */}
                {area?.points && area.points.length > 0 && (
                    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden h-72 md:h-96 relative flex flex-col">
                        <div className="absolute top-4 left-4 z-10 pointer-events-none">
                            <span className="bg-black/50 backdrop-blur border border-white/10 px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-accent" /> Facility Footprint
                            </span>
                        </div>
                        <div className="flex-1 relative">
                            <FacilityMapTab tenantId={tenantId!} readOnly={true} focusId={areaId || ''} />
                        </div>
                    </div>
                )}
                
                {/* Active Projects Block */}
                <div>
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-indigo-400" />
                        Current Occupancy
                    </h2>
                    
                    {activeJobs.length === 0 ? (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center text-center">
                            <MapPin className="w-10 h-10 text-zinc-700 mb-3" />
                            <h3 className="text-zinc-200 font-bold text-lg">Area is Empty</h3>
                            <p className="text-zinc-500 text-sm max-w-sm mt-1">
                                There are no active jobs routed to this location. Any assigned assets will appear here automatically.
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {activeJobs.map(job => (
                                <div key={job.id} onClick={() => navigate(`/business/jobs/${job.id}`)} className="bg-zinc-950 border border-zinc-800 p-5 rounded-xl hover:border-indigo-500 transition-colors cursor-pointer group relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="text-xs font-bold px-2 py-1 bg-zinc-900 rounded text-zinc-400 border border-zinc-800">
                                            {job.status || 'Active'}
                                        </div>
                                        <div className="text-xs text-zinc-600 font-mono">#{job.id.substring(0,8)}</div>
                                    </div>
                                    
                                    <h3 className="text-lg font-bold text-white mb-1 group-hover:text-indigo-400 transition-colors truncate">
                                        {job.title}
                                    </h3>
                                    
                                    <div className="mt-4 pt-4 border-t border-zinc-800/50 flex flex-col gap-2">
                                        <div className="flex items-center gap-2 text-sm text-zinc-500">
                                            <Truck className="w-4 h-4 text-amber-500" />
                                            {job.vehicleId ? 'Vehicle Linked' : 'No Vehicle Assigned'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Alpha Layout - Future Integrations */}
                <div className="pt-6 border-t border-zinc-800 grid gap-6 md:grid-cols-3">
                    
                    {/* Future Reservations */}
                    <div className="bg-zinc-950/50 border border-zinc-800/50 border-dashed rounded-xl p-5 relative overflow-hidden opacity-50">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent"></div>
                        <div className="relative z-10">
                            <h3 className="font-bold text-zinc-400 mb-2 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-indigo-400" />
                                Upcoming Reservations *
                            </h3>
                            <p className="text-xs text-zinc-600 mb-4 h-8">Future queued jobs slated for this bay.</p>
                            <div className="w-full h-8 bg-zinc-900/50 rounded flex items-center justify-center border border-zinc-800/50">
                                <span className="text-[10px] uppercase font-bold text-zinc-600">Coming Soon (Alpha)</span>
                            </div>
                        </div>
                    </div>

                    {/* Historical Logs */}
                    <div className="bg-zinc-950/50 border border-zinc-800/50 border-dashed rounded-xl p-5 relative overflow-hidden opacity-50">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent"></div>
                        <div className="relative z-10">
                            <h3 className="font-bold text-zinc-400 mb-2 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-amber-400" />
                                Maintenance Logs *
                            </h3>
                            <p className="text-xs text-zinc-600 mb-4 h-8">Historical usage and maintenance of this zone.</p>
                            <div className="w-full h-8 bg-zinc-900/50 rounded flex items-center justify-center border border-zinc-800/50">
                                <span className="text-[10px] uppercase font-bold text-zinc-600">Coming Soon (Alpha)</span>
                            </div>
                        </div>
                    </div>

                    {/* Assigned Hardware */}
                    <div className="bg-zinc-950/50 border border-zinc-800/50 border-dashed rounded-xl p-5 relative overflow-hidden opacity-50">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent"></div>
                        <div className="relative z-10">
                            <h3 className="font-bold text-zinc-400 mb-2 flex items-center gap-2">
                                <Server className="w-4 h-4 text-emerald-400" />
                                Linked Hardware *
                            </h3>
                            <p className="text-xs text-zinc-600 mb-4 h-8">Equipment and tools permanently assigned here.</p>
                            <div className="w-full h-8 bg-zinc-900/50 rounded flex items-center justify-center border border-zinc-800/50">
                                <span className="text-[10px] uppercase font-bold text-zinc-600">Coming Soon (Alpha)</span>
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
}
