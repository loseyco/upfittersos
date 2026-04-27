import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { CarFront, ArrowLeft, ClipboardCheck, Clock, CheckCircle, Plus, MapPin, ScanLine } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { VehicleCheckInModal } from '../../components/jobs/VehicleCheckInModal';
import { VinScannerModal } from '../../components/jobs/VinScannerModal';
import { SearchableCustomerSelect } from '../../components/SearchableCustomerSelect';
import { usePermissions } from '../../hooks/usePermissions';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

export function VehicleCheckInApp() {
    const { tenantId, currentUser } = useAuth();
    const navigate = useNavigate();
    const { jobId } = useParams();
    const { checkPermission, loading: permsLoading } = usePermissions();
    const canView = checkPermission('manage_intake') || checkPermission('manage_jobs');

    const [jobs, setJobs] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [zones, setZones] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [showVinScanner, setShowVinScanner] = useState(false);
    const [newVehicleData, setNewVehicleData] = useState({ vin: '', year: '', make: '', model: '' });
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
    const [selectedZone, setSelectedZone] = useState<string>('');

    const [activeJobForCheckin, setActiveJobForCheckin] = useState<any | null>(null);

    useEffect(() => {
        if (!tenantId || tenantId === 'unassigned') {
            setLoading(false);
            return;
        }

        setLoading(true);

        const qJobs = query(collection(db, 'jobs'), where('tenantId', '==', tenantId));
        const unsubJobs = onSnapshot(qJobs, (snapshot) => {
            setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        const qVehicles = query(collection(db, 'vehicles'), where('tenantId', '==', tenantId));
        const unsubVehicles = onSnapshot(qVehicles, (snapshot) => {
            setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const qCustomers = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
        const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
            setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const unsubZones = onSnapshot(query(collection(db, 'business_zones'), where('tenantId', '==', tenantId)), (s) => setZones(s.docs.map(d => ({id: d.id, ...d.data()}))));

        return () => {
            unsubJobs();
            unsubVehicles();
            unsubCustomers();
            unsubZones();
        };
    }, [tenantId]);

    // Handle Direct URL Intake Mounting
    useEffect(() => {
        if (jobId && jobs.length > 0) {
            const targetJob = jobs.find(j => j.id === jobId);
            if (targetJob && !activeJobForCheckin) {
                setActiveJobForCheckin(targetJob);
            }
        }
    }, [jobId, jobs, activeJobForCheckin]);

    if (permsLoading || loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-blue-500/50">
                <CarFront className="w-8 h-8 animate-pulse mb-4" />
                <span className="text-xs font-black tracking-widest uppercase">Loading Intake Fleet...</span>
            </div>
        );
    }

    if (!canView) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center p-6">
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">Access Denied</h2>
                <p className="text-zinc-500 max-w-md">Your profile does not have clearance for vehicle intake operations.</p>
                <button onClick={() => navigate('/workspace')} className="mt-8 text-blue-400 hover:text-white transition-colors flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Return to Hub
                </button>
            </div>
        );
    }

    const pendingJobs = jobs.filter(j => j.status === 'Pending' || j.status === 'Scheduled');
    const recentlyCompleted = jobs.filter(j => j.status === 'In Progress' && j.checkInNotes).slice(0, 5);
    
    const vehiclesOnSite = jobs.filter(j => {
        if (j.status === 'Completed' || j.status === 'Cancelled') return false;
        if (!j.parkedLocation) return true; // Keep unassigned showing so we can assign them!

        // Find the matching zone in our DB
        const zoneMatch = zones.find(z => (z.name || z.title || z.label) === j.parkedLocation);
        
        if (zoneMatch) {
            // Only allow designated vehicle holding areas
            const allowedTypes = ['Bay', 'Parking Spot', 'Parking', 'Door - Garage'];
            return allowedTypes.includes(zoneMatch.type);
        }

        // Fallback for legacy locations without mapped zones
        const loc = (j.parkedLocation).toLowerCase();
        if (loc.includes('office') || loc.includes('reception') || loc.includes('waiting') || loc.includes('room')) return false;
        
        return true;
    });

    const assignedVehicles = vehiclesOnSite.filter(j => j.parkedLocation && j.parkedLocation !== 'Unknown / Pending');
    const unassignedVehicles = vehiclesOnSite.filter(j => !j.parkedLocation || j.parkedLocation === 'Unknown / Pending');

    const getVehicleDetails = (vId: string) => {
        const v = vehicles.find(x => x.id === vId);
        if (!v) return undefined;
        return v;
    };

    const getCustomerDetails = (cId: string) => {
        const c = customers.find(x => x.id === cId);
        if (!c) return undefined;
        return c;
    };

    const checkDuplicateVin = (vin: string) => {
        if (!vin || vin.length < 5) return null;
        return vehicles.find(v => v.vin?.toLowerCase() === vin.toLowerCase()) || null;
    };

    const duplicateVehicleMatch = checkDuplicateVin(newVehicleData.vin);

    const handleCreateWalkIn = async () => {
        if (!newVehicleData.make || !newVehicleData.model) {
            toast.error("Please enter at least a make and model.");
            return;
        }

        if (duplicateVehicleMatch) {
            toast.error("This VIN is already registered. Please use the existing vehicle record if possible.");
            return;
        }

        try {
            // First create the vehicle
            const vRef = await addDoc(collection(db, 'vehicles'), {
                ...newVehicleData,
                tenantId,
                status: 'Active',
                ...(selectedZone ? { currentLocationId: selectedZone } : {}),
                createdAt: serverTimestamp()
            });

            // Then create a dummy job to attach the walkaround to
            const jobRef = await addDoc(collection(db, 'jobs'), {
                tenantId,
                title: 'Walk-In Intake',
                vehicleId: vRef.id,
                ...(selectedCustomerId ? { customerId: selectedCustomerId } : {}),
                ...(selectedZone ? { 
                    currentLocationId: selectedZone,
                    parkedLocation: zones.find(z => z.id === selectedZone)?.label || selectedZone,
                    locationHistory: [{
                        location: zones.find(z => z.id === selectedZone)?.label || selectedZone,
                        enteredAt: new Date().toISOString(),
                        exitedAt: null,
                        movedByUid: currentUser?.uid || 'system',
                        movedByEmail: currentUser?.email || 'system'
                    }]
                } : {}),
                status: 'Pending',
                priority: 'Normal',
                createdAt: serverTimestamp()
            });

            toast.success("Vehicle registered! Starting intake.");
            setIsCreatingNew(false);
            setNewVehicleData({ vin: '', year: '', make: '', model: '' });
            setSelectedCustomerId('');
            toast.success("Walk-in draft prepared. Proceeding to intake.");
            navigate(`/business/vehicles/${jobRef.id}`);
        } catch (err) {
            console.error(err);
            toast.error("Failed to register new vehicle.");
        }
    };

    const activeJob = activeJobForCheckin || (jobId ? jobs.find(j => j.id === jobId) : null);

    if (activeJob) {
        return (
            <div className="h-full min-h-0 w-full bg-zinc-950 flex flex-col text-white font-sans relative">
                <VehicleCheckInModal 
                    job={activeJob}
                    onClose={() => {
                        setActiveJobForCheckin(null);
                        navigate('/business/check-in');
                    }}
                    tenantId={tenantId as string}
                    customer={getCustomerDetails(activeJob.customerId)}
                    vehicle={getVehicleDetails(activeJob.vehicleId)}
                    zones={zones}
                    standaloneAsPage={true}
                />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0 bg-zinc-950 text-white font-sans relative">
            <div className="p-4 md:px-8 border-b border-zinc-800 bg-zinc-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center shrink-0 relative z-10 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <CarFront className="w-5 h-5 text-blue-400" /> Vehicle Management
                        </div>
                        <p className="text-zinc-500 text-xs mt-0.5">Physical intake hub for capturing VINs, mileage, and condition media.</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-7xl mx-auto space-y-8">
                    
                    <section>
                        <h3 className="text-sm font-black text-zinc-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                            <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-amber-500" /> Needs Intake ({pendingJobs.length})</span>
                            <button onClick={() => setIsCreatingNew(!isCreatingNew)} className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white transition-colors border border-blue-500/30 px-3 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                                <Plus className="w-3.5 h-3.5" /> New Check-In
                            </button>
                        </h3>

                        {isCreatingNew && (
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
                                <h4 className="text-lg font-black text-white mb-4">Register New Check-In Vehicle</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                    <div>
                                        <div className="relative">
                                            <input placeholder="VIN Number" value={newVehicleData.vin} onChange={e => setNewVehicleData({...newVehicleData, vin: e.target.value.toUpperCase()})} className={`w-full bg-zinc-950 border ${duplicateVehicleMatch ? 'border-amber-500 focus:border-amber-500' : 'border-zinc-800 focus:border-blue-500'} rounded-xl pl-4 pr-10 py-2.5 text-sm text-white outline-none uppercase font-mono`} />
                                            <button onClick={() => setShowVinScanner(true)} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 rounded-md transition-colors">
                                                <ScanLine className="w-4 h-4" />
                                            </button>
                                        </div>
                                        {duplicateVehicleMatch && (
                                            <p className="text-amber-400 text-[10px] font-bold mt-1.5 px-1 leading-tight">
                                                Warning: Auto-detected existing ({duplicateVehicleMatch.year} {duplicateVehicleMatch.make} {duplicateVehicleMatch.model}).
                                            </p>
                                        )}
                                    </div>
                                    <input placeholder="Year" value={newVehicleData.year} onChange={e => setNewVehicleData({...newVehicleData, year: e.target.value})} className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-blue-500 outline-none" />
                                    <input placeholder="Make (e.g. Ford)" value={newVehicleData.make} onChange={e => setNewVehicleData({...newVehicleData, make: e.target.value})} className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-blue-500 outline-none" />
                                    <input placeholder="Model (e.g. F-150)" value={newVehicleData.model} onChange={e => setNewVehicleData({...newVehicleData, model: e.target.value})} className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-blue-500 outline-none" />
                                    <div className="col-span-2 md:col-span-2">
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1 block">Assign Customer (Optional)</label>
                                        <SearchableCustomerSelect 
                                            customers={customers}
                                            value={selectedCustomerId || null}
                                            onChange={(val) => setSelectedCustomerId(val || '')}
                                        />
                                    </div>
                                    <div className="col-span-2 md:col-span-2">
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1 block">Parking / Area Spot</label>
                                        <select 
                                            value={selectedZone} 
                                            onChange={e => setSelectedZone(e.target.value)}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-blue-500 outline-none transition-colors appearance-none cursor-pointer"
                                            style={{ height: '42px' }}
                                        >
                                            <option value="">Unknown / Pending</option>
                                            {zones.filter(z => {
                                                const allowedTypes = ['Bay', 'Parking Spot', 'Parking', 'Door - Garage'];
                                                return allowedTypes.includes(z.type);
                                            }).map(z => (
                                                <option key={z.id} value={z.id}>{z.label || z.name} {z.type ? `(${z.type})` : ''}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-3 justify-end">
                                    <button onClick={() => setIsCreatingNew(false)} className="px-4 py-2 text-zinc-500 font-bold text-xs uppercase tracking-widest hover:text-white">Cancel</button>
                                    <button onClick={handleCreateWalkIn} className="bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 text-emerald-400 hover:text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors shadow-lg">Start Walk-in</button>
                                </div>
                            </div>
                        )}

                        {pendingJobs.length === 0 && !isCreatingNew ? (
                            <div className="bg-zinc-900/50 border border-zinc-800 border-dashed rounded-2xl p-12 text-center text-zinc-500">
                                <ClipboardCheck className="w-8 h-8 mx-auto mb-3 text-zinc-700" />
                                <p className="font-bold">No vehicles currently pending intake.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {pendingJobs.map(job => {
                                    const v = getVehicleDetails(job.vehicleId);
                                    const c = getCustomerDetails(job.customerId);
                                    return (
                                        <div key={job.id} className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 rounded-2xl p-6 transition-all group flex flex-col justify-between">
                                            <div>
                                                <div className="flex justify-between items-start mb-3">
                                                    <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded">
                                                        PENDING
                                                    </span>
                                                    <span className="text-xs font-mono text-zinc-600">#{job.id.substring(0,6).toUpperCase()}</span>
                                                </div>
                                                <h4 className="text-lg font-black text-white truncate mb-1">
                                                    {v ? `${v.year} ${v.make} ${v.model}` : 'Unknown Asset'}
                                                </h4>
                                                <p className="text-xs font-bold text-zinc-500 truncate mb-4">{job.title || 'Untitled Work Order'}</p>
                                                
                                                <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800 mb-6">
                                                    <p className="text-[10px] bg-zinc-800 text-zinc-400 inline-block px-1.5 py-0.5 rounded uppercase font-black tracking-widest mb-1.5">Owner</p>
                                                    <p className="text-sm font-bold text-zinc-300">{c ? `${c.firstName} ${c.lastName}` : 'Walk-in'}</p>
                                                </div>
                                            </div>
                                            
                                            <button 
                                                onClick={() => {
                                                    setActiveJobForCheckin(job);
                                                    if (!jobId) {
                                                        // Sync the URL visually
                                                        navigate(`/business/vehicles/${job.id}`);
                                                    }
                                                }}     className="w-full mt-auto bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 hover:border-transparent py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                                            >
                                                Start Intake Walkaround
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {recentlyCompleted.length > 0 && (
                        <section>
                            <h3 className="text-sm font-black text-zinc-400 border-t border-zinc-800/50 pt-8 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-emerald-500" /> Recently Checked In
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {recentlyCompleted.map(job => {
                                    const v = getVehicleDetails(job.vehicleId);
                                    return (
                                        <div key={job.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex items-center gap-4 opacity-70 hover:opacity-100 transition-opacity">
                                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                                                <CheckCircle className="w-5 h-5 text-emerald-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-white truncate">{v ? `${v.year} ${v.make} ${v.model}` : 'Unknown Asset'}</p>
                                                <p className="text-[10px] text-zinc-500 uppercase tracking-widest truncate">{job.parkedLocation || 'Lot'}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {assignedVehicles.length > 0 && (
                        <section>
                            <h3 className="text-sm font-black text-zinc-400 border-t border-zinc-800/50 pt-8 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-sky-500" /> Vehicles On-Site
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {assignedVehicles.map(job => {
                                    const v = getVehicleDetails(job.vehicleId);
                                    return (
                                        <div key={job.id} onClick={() => navigate(`/business/vehicles/${job.id}`)} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col opacity-90 hover:opacity-100 hover:border-sky-500/50 transition-all cursor-pointer group">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-10 h-10 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                                    <CarFront className="w-5 h-5 text-sky-400" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-white truncate">{v ? `${v.year} ${v.make} ${v.model}` : 'Unknown Asset'}</p>
                                                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest truncate mt-0.5">{job.title || 'Untitled Work Order'}</p>
                                                </div>
                                            </div>
                                            <div className="mt-auto text-xs font-black text-sky-400 bg-sky-500/10 px-2.5 py-1.5 rounded-md self-start uppercase tracking-widest border border-sky-500/20 flex items-center gap-1.5">
                                                <MapPin className="w-3 h-3" />
                                                {job.parkedLocation || 'NOT ASSIGNED'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {unassignedVehicles.length > 0 && (
                        <section>
                            <h3 className="text-sm font-black text-zinc-400 border-t border-zinc-800/50 pt-8 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-zinc-600 border border-zinc-600 rounded-full" /> Unassigned Vehicles
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {unassignedVehicles.map(job => {
                                    const v = getVehicleDetails(job.vehicleId);
                                    return (
                                        <div key={job.id} onClick={() => navigate(`/business/vehicles/${job.id}`)} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col opacity-70 hover:opacity-100 hover:border-zinc-500/50 transition-all cursor-pointer group">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                                    <CarFront className="w-5 h-5 text-zinc-400" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-white truncate">{v ? `${v.year} ${v.make} ${v.model}` : 'Unknown Asset'}</p>
                                                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest truncate">{job.title || 'Work Order'}</p>
                                                </div>
                                            </div>
                                            <div className="mt-auto flex items-center">
                                                <span className="bg-zinc-800 text-zinc-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-zinc-700">Not Assigned</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}
                </div>
            </div>

            {showVinScanner && (
                <VinScannerModal 
                    onClose={() => setShowVinScanner(false)}
                    onScan={(vin) => {
                        setNewVehicleData({...newVehicleData, vin});
                        toast.success("VIN scanned automatically.");
                    }}
                />
            )}

            {activeJobForCheckin && (
                <div className="fixed inset-0 z-[120]">
                    <VehicleCheckInModal 
                        job={activeJobForCheckin}
                        onClose={() => {
                            setActiveJobForCheckin(null);
                            if (jobId) {
                                navigate('/business/vehicles');
                            }
                        }}
                        tenantId={tenantId!}
                        customer={getCustomerDetails(activeJobForCheckin.customerId)}
                        vehicle={getVehicleDetails(activeJobForCheckin.vehicleId)}
                        zones={zones}
                        standaloneAsPage={!!jobId}
                    />
                </div>
            )}
        </div>
    );
}
