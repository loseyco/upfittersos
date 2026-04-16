import { useState, useEffect } from 'react';
import { MapPin, X, CarFront, Store, Map } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';

interface ParkingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (location: string) => void;
    currentLocation: string;
}

export function ParkingModal({ isOpen, onClose, onSelect, currentLocation }: ParkingModalProps) {
    const { tenantId } = useAuth();
    const [customLoc, setCustomLoc] = useState('');
    const [zones, setZones] = useState<any[]>([]);

    useEffect(() => {
        if (!isOpen || !tenantId || tenantId === 'GLOBAL') return;
        const unsub = onSnapshot(
            query(collection(db, 'business_zones'), where('tenantId', '==', tenantId)),
            (snap) => {
                setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
        );
        return () => unsub();
    }, [isOpen, tenantId]);

    if (!isOpen) return null;

    // Group zones by type
    const bayZones = zones.filter(z => z.type === 'Bay' || z.type === 'Door - Garage');
    const parkingZones = zones.filter(z => z.type === 'Parking');
    const buildingZones = zones.filter(z => z.type !== 'Bay' && z.type !== 'Door - Garage' && z.type !== 'Parking' && z.type !== 'Other');
    
    // Add an 'Other' default bucket if needed
    const otherZones = zones.filter(z => z.type === 'Other');

    const sections = [];
    
    if (bayZones.length > 0) sections.push({
        title: "Shop Bays",
        icon: <CarFront className="w-4 h-4" />,
        color: "text-blue-400",
        bg: "bg-blue-500/10 border-blue-500/20",
        activeBg: "bg-blue-500 text-white",
        options: bayZones.map(z => z.label || z.name || z.title || 'Unnamed Zone')
    });

    if (parkingZones.length > 0) sections.push({
        title: "Parking Lot",
        icon: <Store className="w-4 h-4" />,
        color: "text-emerald-400",
        bg: "bg-emerald-500/10 border-emerald-500/20",
        activeBg: "bg-emerald-500 text-white",
        options: parkingZones.map(z => z.label || z.name || z.title || 'Unnamed Zone')
    });

    if (buildingZones.length > 0) sections.push({
        title: "Facility Areas",
        icon: <Map className="w-4 h-4" />,
        color: "text-amber-400",
        bg: "bg-amber-500/10 border-amber-500/20",
        activeBg: "bg-amber-500 text-white",
        options: buildingZones.map(z => z.label || z.name || z.title || 'Unnamed Zone')
    });

    if (otherZones.length > 0) sections.push({
        title: "Other / Uncategorized",
        icon: <MapPin className="w-4 h-4" />,
        color: "text-zinc-400",
        bg: "bg-zinc-500/10 border-zinc-500/20",
        activeBg: "bg-zinc-500 text-white",
        options: otherZones.map(z => z.label || z.name || z.title || 'Unnamed Zone')
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                            <MapPin className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white tracking-wide">Facility Map</h2>
                            <p className="text-xs text-zinc-400 uppercase tracking-widest font-mono">Select Parked Location</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto w-full flex flex-col gap-8">
                    {sections.map((sec, i) => (
                        <div key={i} className="flex flex-col gap-3">
                            <div className={`flex items-center gap-2 border-b border-zinc-800/50 pb-2`}>
                                <div className={`p-1.5 rounded-lg ${sec.bg} ${sec.color}`}>
                                    {sec.icon}
                                </div>
                                <h3 className="font-bold text-zinc-300 uppercase tracking-widest text-sm">{sec.title}</h3>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                {sec.options.map(opt => {
                                    const isSelected = currentLocation === opt;
                                    return (
                                        <button
                                            key={opt}
                                            onClick={() => onSelect(opt)}
                                            className={`p-3 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between group ${isSelected ? sec.activeBg + ' shadow-lg border-transparent' : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                                        >
                                            {opt}
                                            {isSelected && <MapPin className="w-3 h-3 opacity-80" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    <div className="flex items-end gap-3 mt-4 pt-6 border-t border-zinc-800">
                        <div className="flex-1">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Custom Location</label>
                            <input 
                                type="text" 
                                value={customLoc}
                                onChange={(e) => setCustomLoc(e.target.value)}
                                placeholder="E.g., Sublet at Dealer..."
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && customLoc.trim()) {
                                        onSelect(customLoc.trim());
                                    }
                                }}
                            />
                        </div>
                        <button 
                            onClick={() => {
                                if (customLoc.trim()) onSelect(customLoc.trim());
                            }}
                            disabled={!customLoc.trim()}
                            className="h-[42px] px-6 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition-colors"
                        >
                            Set
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
