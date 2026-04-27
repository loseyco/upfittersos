import { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { MapPin, Clock, Car } from 'lucide-react';

interface YardControlWidgetProps {
    tenantId: string;
    globalVehicles: any[];
    allJobs: any[];
}

export function YardControlWidget({ tenantId, globalVehicles, allJobs }: YardControlWidgetProps) {
    const [zones, setZones] = useState<any[]>([]);
    
    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL' || tenantId === 'unassigned') return;
        const unsub = onSnapshot(query(collection(db, 'business_zones'), where('tenantId', '==', tenantId)), (s) => {
            const fetched = s.docs.map(d => ({ id: d.id, ...d.data() }));
            setZones(fetched.filter(z => ['Parking', 'Bay'].includes((z as any).type || '')));
        });
        return () => unsub();
    }, [tenantId]);

    const calculateDwellTime = (timestampISO?: string) => {
        if (!timestampISO) return 'Unknown';
        const ms = Date.now() - new Date(timestampISO).getTime();
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h`;
        return '< 1h';
    };

    const getDwellColor = (timestampISO?: string) => {
        if (!timestampISO) return 'text-zinc-500';
        const hours = (Date.now() - new Date(timestampISO).getTime()) / (1000 * 60 * 60);
        if (hours > 168) return 'text-red-400'; // 7 days
        if (hours > 72) return 'text-amber-400'; // 3 days
        return 'text-emerald-400';
    };

    const yardData = useMemo(() => {
        return zones.map(zone => {
            // Find what vehicle is mapped to this zone natively
            const nativeVehicle = globalVehicles.find(v => v.currentLocationId === zone.id);
            
            // Find if any job claims this zone
            const activeJob = allJobs.find(j => j.currentLocationId === zone.id && !j.archived && j.status !== 'Archived');
            
            // If job claims zone but no native vehicle mapping, see if job has a vehicle assigned
            let resolvedVehicle = nativeVehicle;
            if (activeJob && activeJob.vehicleId && !resolvedVehicle) {
                resolvedVehicle = globalVehicles.find(v => v.id === activeJob.vehicleId);
            }

            return {
                zone,
                vehicle: resolvedVehicle || null,
                job: activeJob || null
            };
        }).sort((a, b) => a.zone.label?.localeCompare(b.zone.label || '') || 0);
    }, [zones, globalVehicles, allJobs]);

    if (zones.length === 0) return null;

    // Separate empty from occupied
    const occupied = yardData.filter(d => d.vehicle || d.job);
    const empty = yardData.filter(d => !d.vehicle && !d.job);

    return (
        <div className="w-full bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-indigo-400" /> Yard Control Matrix
                </h2>
                <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-zinc-500">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> {occupied.length} Occupied</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 border border-zinc-600 rounded-full"></span> {empty.length} Empty</span>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                {yardData.map(slot => {
                    const isOccupied = slot.vehicle || slot.job;
                    
                    return (
                        <div key={slot.zone.id} className={`p-4 rounded-2xl border transition-all ${isOccupied ? 'bg-zinc-900 border-zinc-700 hover:border-indigo-500/50' : 'bg-zinc-950/50 border-zinc-800/50 hover:bg-zinc-900/40'}`}>
                            <div className="flex items-center gap-2 mb-3 border-b border-zinc-800/50 pb-2">
                                <MapPin className={`w-3.5 h-3.5 ${isOccupied ? 'text-indigo-400' : 'text-zinc-600'}`} />
                                <span className={`text-xs font-black uppercase tracking-widest ${isOccupied ? 'text-white' : 'text-zinc-500'}`}>{slot.zone.label || 'Unnamed Spot'}</span>
                            </div>

                            {isOccupied ? (
                                <div className="flex flex-col gap-2 relative">
                                    <h4 className="text-sm font-bold text-zinc-200">
                                        {slot.vehicle ? `${slot.vehicle.year || ''} ${slot.vehicle.make || ''} ${slot.vehicle.model || 'Unknown Model'}`.trim() : 'Unknown Vehicle'}
                                    </h4>
                                    
                                    {slot.vehicle?.vin && (
                                        <p className="text-[10px] font-mono text-zinc-500 tracking-wider">VIN: {slot.vehicle.vin.substring(slot.vehicle.vin.length - 6)}</p>
                                    )}

                                    {slot.job ? (
                                        <span className={`w-fit px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded border ${
                                            slot.job.status === 'Ready for Delivery' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 
                                            slot.job.status === 'In Progress' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                            slot.job.status === 'Ready for QA' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                            'bg-zinc-800 text-zinc-400 border-zinc-700'
                                        }`}>
                                            Job: {slot.job.status}
                                        </span>
                                    ) : (
                                        <span className="w-fit px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded border bg-amber-500/10 text-amber-500 border-amber-500/20">
                                            Inventory / Storage
                                        </span>
                                    )}

                                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-zinc-800/50">
                                        <Clock className={`w-3 h-3 ${getDwellColor(slot.vehicle?.updatedAt || slot.vehicle?.createdAt)}`} />
                                        <span className={`text-[10px] font-bold tracking-widest ${getDwellColor(slot.vehicle?.updatedAt || slot.vehicle?.createdAt)}`}>
                                            DWELL: {calculateDwellTime(slot.vehicle?.updatedAt || slot.vehicle?.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-4 flex flex-col items-center justify-center opacity-50">
                                    <Car className="w-6 h-6 text-zinc-700 mb-2" />
                                    <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Available</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
