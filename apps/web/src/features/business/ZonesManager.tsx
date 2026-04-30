import { useState, useEffect, useRef } from 'react';
import { collection, doc, setDoc, deleteDoc, serverTimestamp, onSnapshot, query, orderBy, addDoc, getDocs, limit, where, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { Plus, Trash2, MapPin, Warehouse, CarFront, Briefcase, LayoutDashboard, History, X, Search, Car } from 'lucide-react';

import { toast } from 'sonner';

interface Zone {
  id: string;
  name: string;
  type: 'bay' | 'parking' | 'office' | 'other' | string;
  currentVehicleVin: string | null;
  lastAssignedAt?: any;
  createdAt?: any;
}

interface Vehicle {
  vin: string;
  year?: string | number;
  make?: string;
  model?: string;
  bodyClass?: string;
  driveType?: string;
  gvwr?: string;
  customerName?: string;
  qbWorkOrder?: string;
}

const zoneTypeIcons = {
  bay: Warehouse,
  parking: MapPin,
  office: Briefcase,
  other: LayoutDashboard,
};

export function ZonesManager({ tenantId }: { tenantId: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState<'bay' | 'parking' | 'office' | 'other'>('bay');
  const [isAdding, setIsAdding] = useState(false);
  const [selectedZoneForHistory, setSelectedZoneForHistory] = useState<Zone | null>(null);
  const [filterType, setFilterType] = useState<string>('bay');
  const [filterOccupancy, setFilterOccupancy] = useState<string>('occupied');
  const { user } = useAuthStore();





  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/zones`));
    const unsub = onSnapshot(q, (snap) => {
      const data: Zone[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() } as Zone));
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setZones(data);
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/vehicles`), limit(1000));
    const unsub = onSnapshot(q, (snap) => {
      const data: Vehicle[] = [];
      snap.forEach(doc => data.push({ ...doc.data() } as Vehicle));
      setVehicles(data);
    });
    return () => unsub();
  }, [tenantId]);

  // Smart Default: If filtering for occupied but nothing is occupied, show all
  useEffect(() => {
    if (zones.length > 0 && filterOccupancy === 'occupied') {
      const hasOccupied = zones.some(z => z.currentVehicleVin);
      if (!hasOccupied) {
        setFilterOccupancy('all');
        setFilterType('all');
      }
    }
  }, [zones, filterOccupancy]);

  const filteredZones = zones.filter(zone => {
    const typeMatch = filterType === 'all' || zone.type === filterType;
    const occupancyMatch = filterOccupancy === 'all' || 
      (filterOccupancy === 'occupied' && zone.currentVehicleVin) || 
      (filterOccupancy === 'empty' && !zone.currentVehicleVin);
    return typeMatch && occupancyMatch;
  });

  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim() || !tenantId) return;
    try {
      const newZoneRef = doc(collection(db, `businesses/${tenantId}/zones`));
      await setDoc(newZoneRef, {
        name: newZoneName.trim(),
        type: newZoneType,
        currentVehicleVin: null,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || 'system'
      });
      setNewZoneName('');
      setIsAdding(false);
      toast.success("Zone created");
    } catch (err) {
      console.error("Error adding zone:", err);
      toast.error("Failed to add zone");
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (!window.confirm("Are you sure you want to delete this zone?")) return;
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/zones`, zoneId));
      toast.success("Zone deleted");
    } catch (err) {
      console.error("Error deleting zone:", err);
      toast.error("Failed to delete zone");
    }
  };


  const handleAssignVehicle = async (zoneId: string, vin: string) => {
    try {
      const trimmedVin = vin.trim().toUpperCase();
      const zone = zones.find(z => z.id === zoneId);
      
      await setDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), {
        currentVehicleVin: trimmedVin || null,
        lastAssignedAt: serverTimestamp()
      }, { merge: true });

      await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
        zoneId,
        zoneName: zone?.name || 'Unknown Zone',
        vin: trimmedVin || null,
        assignedAt: serverTimestamp(),
        assignedBy: user?.uid || 'system',
        action: trimmedVin ? 'assigned' : 'cleared'
      });

      if (trimmedVin) {
        const vehicleRef = doc(db, `businesses/${tenantId}/vehicles`, trimmedVin);
        const vehicleDoc = await getDoc(vehicleRef);
        
        if (!vehicleDoc.exists()) {
          // Fetch comprehensive details from NHTSA API
          let details: any = { year: '', make: '', model: '', bodyClass: '', driveType: '', gvwr: '' };
          try {
            const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${trimmedVin}?format=json`);
            const data = await res.json();
            const result = data.Results?.[0];
            if (result && result.Make) {
              details = {
                year: result.ModelYear || '',
                make: result.Make || '',
                model: result.Model || '',
                bodyClass: result.BodyClass || '',
                driveType: result.DriveType || '',
                gvwr: result.GVWR || ''
              };
            }
          } catch (apiErr) {
            console.warn("NHTSA API fetch failed", apiErr);
          }

          await setDoc(vehicleRef, {
            vin: trimmedVin,
            ...details,
            tenantId,
            createdAt: serverTimestamp(),
            source: 'Zone Manager'
          });
          
          if (details.make) {
            toast.success(`Identified: ${details.year} ${details.make} ${details.model}`);
          }
        }
      }
    } catch (err) {
      console.error("Error in vehicle assignment:", err);
      toast.error("Failed to assign vehicle");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Facility Zones & Bays</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Track vehicle locations across your facility.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              {['all', 'occupied', 'empty'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setFilterOccupancy(opt)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                    filterOccupancy === opt 
                      ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm' 
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              {['all', 'bay', 'parking', 'office'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setFilterType(opt)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                    filterType === opt 
                      ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm' 
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                  }`}
                >
                  {opt === 'all' ? 'all' : opt}
                </button>
              ))}
            </div>

            {filteredZones.length < zones.length && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl">
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Showing {filteredZones.length} of {zones.length}
                </span>
                <button 
                  onClick={() => { setFilterType('all'); setFilterOccupancy('all'); }}
                  className="text-[10px] font-bold text-zinc-400 hover:text-indigo-600 underline uppercase"
                >
                  Show All
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Zone
          </button>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleAddZone} className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Zone Name</label>
              <input
                type="text"
                required
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                placeholder="e.g. Bay 1"
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="sm:w-48">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Type</label>
              <select
                value={newZoneType}
                onChange={(e) => setNewZoneType(e.target.value as any)}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option value="bay">Service Bay</option>
                <option value="parking">Parking Spot</option>
                <option value="office">Office</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold">
                Save
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredZones.map(zone => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            vehicles={vehicles}
            onAssign={(vin: string) => handleAssignVehicle(zone.id, vin)}
            onClear={() => handleAssignVehicle(zone.id, '')}
            onDelete={() => handleDeleteZone(zone.id)}
            onViewHistory={() => setSelectedZoneForHistory(zone)}
          />
        ))}

        {filteredZones.length < zones.length && (
          <button
            onClick={() => { setFilterType('all'); setFilterOccupancy('all'); }}
            className="flex flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-900/50 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl hover:border-indigo-500/50 hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5 transition-all group"
          >
            <div className="p-4 bg-white dark:bg-zinc-800 rounded-2xl shadow-sm mb-4 group-hover:scale-110 transition-transform">
              <LayoutDashboard className="w-8 h-8 text-indigo-500" />
            </div>
            <h3 className="font-bold text-zinc-900 dark:text-white mb-1">Show All Zones</h3>
            <p className="text-sm text-zinc-500">{zones.length - filteredZones.length} more zones are hidden</p>
          </button>
        )}
      </div>

      {selectedZoneForHistory && (
        <HistoryModal 
          zone={selectedZoneForHistory} 
          tenantId={tenantId} 
          onClose={() => setSelectedZoneForHistory(null)} 
        />
      )}
    </div>
  );
}

function VinSelector({ vin, onAssign, onClear, vehicles }: { vin: string, onAssign: (v: string) => void, onClear: () => void, vehicles: Vehicle[] }) {
  const [inputValue, setInputValue] = useState(vin || '');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputValue(vin || ''); }, [vin]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = vehicles.filter(v => {
    const searchStr = inputValue.toLowerCase();
    return v.vin.toLowerCase().includes(searchStr) || 
           (v.make?.toLowerCase() || '').includes(searchStr) || 
           (v.model?.toLowerCase() || '').includes(searchStr) ||
           (v.customerName?.toLowerCase() || '').includes(searchStr) ||
           (v.qbWorkOrder?.toLowerCase() || '').includes(searchStr);
  });
  const exact = vehicles.find(v => v.vin.toUpperCase() === inputValue.trim().toUpperCase());

  return (
    <div className="relative" ref={dropdownRef}>
      {vin ? (
        <div className="flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-500/5 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
          <div className="p-1 bg-emerald-500 rounded text-white"><Car className="w-3.5 h-3.5" /></div>
          <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">{vin}</span>
          <button onClick={onClear} className="ml-auto p-1 text-zinc-400 hover:text-red-500 rounded"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"><Search className="w-4 h-4" /></div>
          <input
            type="text"
            placeholder="Type VIN..."
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value.toUpperCase()); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
          />
          {isOpen && (inputValue.length > 0 || filtered.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                {filtered.map(v => (
                  <button key={v.vin} onClick={() => { onAssign(v.vin); setIsOpen(false); }} className="w-full px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left flex flex-col rounded-lg transition-colors">
                    <span className="font-mono text-xs font-bold text-zinc-900 dark:text-white">{v.vin}</span>
                    <div className="flex flex-wrap gap-x-2 text-[10px] text-zinc-500 uppercase tracking-tight font-medium">
                      {v.make && <span>{v.year} {v.make} {v.model}</span>}
                      {v.customerName && <span className="text-indigo-600 dark:text-indigo-400">• {v.customerName}</span>}
                      {v.qbWorkOrder && <span className="opacity-60">• PO: {v.qbWorkOrder}</span>}
                      {v.bodyClass && <span className="opacity-60">• {v.bodyClass}</span>}
                    </div>
                  </button>
                ))}
                
                {!exact && inputValue.trim().length >= 3 && (
                  <button 
                    onClick={() => { onAssign(inputValue.trim()); setIsOpen(false); }} 
                    className="w-full mt-1 px-3 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-left flex items-center gap-3 rounded-lg transition-all shadow-sm active:scale-[0.98]"
                  >
                    <div className="p-1.5 bg-white/20 rounded-md">
                      <Plus className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold">Register & Assign New VIN</span>
                      <span className="font-mono text-[10px] opacity-80">{inputValue.trim()}</span>
                    </div>
                  </button>
                )}

                {filtered.length === 0 && !exact && inputValue.trim().length < 3 && inputValue.trim().length > 0 && (
                  <div className="px-3 py-4 text-center text-xs text-zinc-500">
                    Type at least 3 characters to search...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ZoneCard({ zone, vehicles, onAssign, onClear, onDelete, onViewHistory }: any) {
  const Icon = zoneTypeIcons[zone.type as keyof typeof zoneTypeIcons] || LayoutDashboard;
  const vehicle = vehicles.find((v: any) => v.vin === zone.currentVehicleVin);
  
  const timeInArea = () => {
    if (!zone.lastAssignedAt) return null;
    const date = zone.lastAssignedAt.toDate?.() || new Date(zone.lastAssignedAt.seconds * 1000);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all group relative">
      {vehicle && (
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <CarFront className="w-24 h-24 -mr-6 -mt-6 rotate-12" />
        </div>
      )}
      
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-zinc-600 dark:text-zinc-400">
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-0.5">{zone.type}</p>
          <h3 className="font-bold text-lg text-zinc-900 dark:text-white leading-tight truncate">
            {zone.name || 'Unnamed Bay'}
          </h3>
        </div>
      </div>

      <div className="space-y-4">
        {vehicle ? (
          <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800/50">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Current Vehicle</p>
                <h4 className="font-bold text-zinc-900 dark:text-white">
                  {vehicle.year} {vehicle.make} {vehicle.model || 'Unknown'}
                </h4>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Time In Area</p>
                <p className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-400">{timeInArea() || '--'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded text-[10px] font-mono font-bold text-zinc-600 dark:text-zinc-400">
                {vehicle.vin}
              </span>
              {vehicle.customerName && (
                <span className="text-[10px] font-medium text-zinc-500 truncate italic">
                  • {vehicle.customerName}
                </span>
              )}
            </div>

            <VinSelector vin={zone.currentVehicleVin || ''} onAssign={onAssign} onClear={onClear} vehicles={vehicles} />
          </div>
        ) : (
          <VinSelector vin={zone.currentVehicleVin || ''} onAssign={onAssign} onClear={onClear} vehicles={vehicles} />
        )}
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
        <button onClick={onViewHistory} className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-indigo-600 transition-colors">
          <History className="w-3.5 h-3.5" /> History
        </button>
        <button onClick={onDelete} className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-red-500 transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

function HistoryModal({ zone, tenantId, onClose }: { zone: Zone, tenantId: string, onClose: () => void }) {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, `businesses/${tenantId}/zone_assignments`),
      where('zoneId', '==', zone.id),
      orderBy('assignedAt', 'desc'),
      limit(10)
    );
    getDocs(q).then(snap => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [zone.id, tenantId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold">History: {zone.name}</h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3">
          {history.length === 0 ? <p className="text-center text-zinc-500 text-sm py-8">No history found</p> : 
            history.map(item => (
              <div key={item.id} className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between text-sm">
                <div>
                  <span className={`font-bold ${item.action === 'assigned' ? 'text-emerald-600' : 'text-zinc-500'}`}>{item.action === 'assigned' ? 'Assigned' : 'Cleared'}</span>
                  {item.vin && <span className="ml-2 font-mono">{item.vin}</span>}
                </div>
                <span className="text-[10px] text-zinc-400">
                  {item.assignedAt?.seconds ? new Date(item.assignedAt.seconds * 1000).toLocaleDateString() : 'Just now'}
                </span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
