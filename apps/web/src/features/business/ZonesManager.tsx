import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, doc, setDoc, updateDoc, serverTimestamp, onSnapshot, query, orderBy, addDoc, getDocs, limit, where, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { Plus, MapPin, Warehouse, CarFront, Briefcase, LayoutDashboard, History, X, Search, Camera } from 'lucide-react';

import { toast } from 'sonner';
import { VehicleDetailsModal } from './VehiclesManager';
import { VinScanner } from './VinScanner';

interface Zone {
  id: string;
  name: string;
  type: 'bay' | 'parking' | 'office' | 'other' | string;
  currentVehicleVin: string | null;
  lastAssignedAt?: any;
  createdAt?: any;
  updatedAt?: any;
  isArchived?: boolean;
}

interface Vehicle {
  id: string;
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
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const selectedZone = selectedZoneId ? zones.find(z => z.id === selectedZoneId) || null : null;
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'bay';
  const initialOccupancy = searchParams.get('occupancy') || 'occupied';

  const [filterType, setFilterType] = useState<string>(initialType);
  const [filterOccupancy, setFilterOccupancy] = useState<string>(initialOccupancy);
  const [quickAddVin, setQuickAddVin] = useState<{zoneId: string, vin: string} | null>(null);
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
      const seen = new Set();
      snap.forEach(doc => {
        const v = { id: doc.id, ...doc.data() } as Vehicle;
        const key = (v.vin || v.id).toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          data.push(v);
        }
      });
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
    if (zone.isArchived) return false;
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

  const handleArchiveZone = async (zoneId: string) => {
    if (!window.confirm("Are you sure you want to archive this zone?")) return;
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), { isArchived: true });
      toast.success("Zone archived");
    } catch (err) {
      console.error("Error archiving zone:", err);
      toast.error("Failed to archive zone");
    }
  };


  const handleAssignVehicle = async (zoneId: string, vin: string) => {
    try {
      const trimmedVin = vin.trim().toUpperCase();
      const zone = zones.find(z => z.id === zoneId);
      const previousVin = zone?.currentVehicleVin || null;
      const previousAssignedAt = zone?.lastAssignedAt || null;
      
      if (trimmedVin && zone?.currentVehicleVin === trimmedVin) {
        toast.info("Vehicle already in this bay.");
        return;
      }

      if (trimmedVin && trimmedVin.length < 10) {
        toast.error(`"${trimmedVin}" is too short to be a valid VIN. Please scan a valid vehicle barcode.`);
        return;
      }

      const undoAssignment = async () => {
        try {
          await setDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), {
            currentVehicleVin: previousVin,
            lastAssignedAt: previousAssignedAt
          }, { merge: true });
          
          await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
            zoneId,
            zoneName: zone?.name || 'Unknown Zone',
            vin: previousVin,
            assignedAt: serverTimestamp(),
            assignedBy: user?.uid || 'system',
            assignedByEmail: user?.email || null,
            assignedByName: user?.displayName || null,
            action: 'undo_assignment'
          });
          toast.success("Assignment undone.");
        } catch(e) {
          toast.error("Failed to undo assignment.");
        }
      };
      
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
        assignedByEmail: user?.email || null,
        assignedByName: user?.displayName || null,
        action: trimmedVin ? 'assigned' : 'cleared'
      });

      if (trimmedVin) {
        const vehicleRef = doc(db, `businesses/${tenantId}/vehicles`, trimmedVin);
        const vehicleDoc = await getDoc(vehicleRef);
        
        if (!vehicleDoc.exists()) {
          // Fetch comprehensive details from NHTSA API
          let details: any = { year: '', make: '', model: '', bodyClass: '', driveType: '', gvwr: '' };
          if (trimmedVin.length === 17) {
            try {
              const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${trimmedVin}?format=json`);
              const data = await res.json();
              const result = data.Results?.[0];
              // ErrorCode usually starts with "0" for a successful decode.
              if (result && result.Make && result.ErrorCode && result.ErrorCode.startsWith('0')) {
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
          }

          await setDoc(vehicleRef, {
            vin: trimmedVin,
            ...details,
            tenantId,
            createdAt: serverTimestamp(),
            source: 'Zone Manager'
          });
          
          if (details.make) {
            toast.success(`Identified: ${details.year} ${details.make} ${details.model}`, {
              action: { label: 'Undo', onClick: undoAssignment }
            });
          } else {
            toast.warning("Vehicle not found in database. You may need to enter details manually.", {
              action: { label: 'Undo', onClick: undoAssignment }
            });
          }
        } else {
          // Vehicle exists. Try auto-decode if it's missing make/model
          const data = vehicleDoc.data();
          if (!data.make && trimmedVin.length === 17) {
            try {
              const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${trimmedVin}?format=json`);
              const apiData = await res.json();
              const result = apiData.Results?.[0];
              if (result && result.Make && result.ErrorCode && result.ErrorCode.startsWith('0')) {
                await updateDoc(vehicleRef, {
                  year: result.ModelYear || '',
                  make: result.Make || '',
                  model: result.Model || '',
                  bodyClass: result.BodyClass || '',
                  driveType: result.DriveType || '',
                  gvwr: result.GVWR || '',
                  updatedAt: serverTimestamp()
                });
                toast.success(`Updated missing vehicle data: ${result.ModelYear || ''} ${result.Make} ${result.Model || ''}`, {
                  action: { label: 'Undo', onClick: undoAssignment }
                });
              } else {
                 toast.success(`Vehicle assigned to bay.`, { action: { label: 'Undo', onClick: undoAssignment } });
              }
            } catch (apiErr) {
              console.warn("NHTSA API backfill failed", apiErr);
              toast.success(`Vehicle assigned to bay.`, { action: { label: 'Undo', onClick: undoAssignment } });
            }
          } else {
            toast.success(`Vehicle assigned to bay.`, { action: { label: 'Undo', onClick: undoAssignment } });
          }
        }
      } else {
        toast.success(`Cleared vehicle from bay.`, {
          action: { label: 'Undo', onClick: undoAssignment }
        });
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
            onSelect={() => setSelectedZoneId(zone.id)}
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

      {selectedZone && !selectedVehicle && (
        <ZoneDetailsModal 
          zone={selectedZone} 
          tenantId={tenantId}
          vehicles={vehicles}
          onClose={() => setSelectedZoneId(null)}
          onAssign={(vin: string) => handleAssignVehicle(selectedZone.id, vin)}
          onClear={() => handleAssignVehicle(selectedZone.id, '')}
          onDelete={() => {
            handleArchiveZone(selectedZone.id);
            setSelectedZoneId(null);
          }}
          onQuickAddRequest={(vin: string) => setQuickAddVin({ zoneId: selectedZone.id, vin })}
          onOpenVehicle={(vin: string) => {
            const v = vehicles.find(veh => veh.vin === vin);
            if (v) setSelectedVehicle(v);
          }}
        />
      )}

      {selectedVehicle && (
        <VehicleDetailsModal
          tenantId={tenantId}
          vehicle={selectedVehicle}
          onClose={() => setSelectedVehicle(null)}
          onEdit={() => {}} // Could wire this up to edit if needed, but view-only is fine for now
          getSource={(row: any) => {
            const isQB = row.tags?.includes('QuickBooks') || row.notes?.includes('Imported via QBWC') || !!row.ListID || !!row.qb_ListID || !!row.quickbooksId;
            return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${isQB ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20'}`}>{isQB ? 'QuickBooks' : 'Native'}</span>;
          }}
        />
      )}

      {quickAddVin && (
        <QuickAddVehicleModal
          tenantId={tenantId}
          initialVin={quickAddVin.vin}
          onClose={() => setQuickAddVin(null)}
          onAssign={(vin) => handleAssignVehicle(quickAddVin.zoneId, vin)}
        />
      )}
    </div>
  );
}

function VinSelector({ vin, onAssign, onClear, onQuickAddRequest, vehicles }: { vin: string, onAssign: (v: string) => void, onClear: () => void, onQuickAddRequest: (vin: string) => void, vehicles: Vehicle[] }) {
  const [inputValue, setInputValue] = useState(vin || '');
  const [isOpen, setIsOpen] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
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
    const searchStr = inputValue.toLowerCase().trim();
    if (!searchStr) return true;
    
    return String(v.vin || '').toLowerCase().includes(searchStr) || 
           String(v.make || '').toLowerCase().includes(searchStr) || 
           String(v.model || '').toLowerCase().includes(searchStr) ||
           String(v.customerName || '').toLowerCase().includes(searchStr) ||
           String(v.qbWorkOrder || '').toLowerCase().includes(searchStr);
  });
  const exact = vehicles.find(v => String(v.vin || '').toUpperCase() === inputValue.trim().toUpperCase());

  return (
    <div className="relative" ref={dropdownRef}>
      {showScanner && (
        <VinScanner 
          onScan={(scannedVin) => {
            setInputValue(scannedVin);
            onAssign(scannedVin);
            setShowScanner(false);
          }} 
          onClose={() => setShowScanner(false)} 
        />
      )}
      <div className="space-y-3">
        <button 
          onClick={() => setShowScanner(true)}
          className="w-full py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-transparent dark:border-zinc-800"
        >
          <Camera className="w-4 h-4" /> Scan VIN Barcode
        </button>

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
                  <button key={v.id || v.vin} onClick={() => { onAssign(v.vin); setIsOpen(false); }} className="w-full px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left flex flex-col rounded-lg transition-colors">
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
                    onClick={() => { onQuickAddRequest(inputValue.trim()); setIsOpen(false); }} 
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

        {vin && (
          <button 
            onClick={onClear} 
            className="w-full py-2.5 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" /> Remove Car from Bay
          </button>
        )}
      </div>
    </div>
  );
}

function ZoneCard({ zone, vehicles, onSelect }: { zone: Zone, vehicles: any[], onSelect: () => void }) {
  const Icon = zoneTypeIcons[zone.type as keyof typeof zoneTypeIcons] || LayoutDashboard;
  const vehicle = vehicles.find((v: any) => v.vin === zone.currentVehicleVin);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!vehicle) return;
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [vehicle]);
  
  const timeInArea = () => {
    const timestamp = zone.lastAssignedAt || zone.updatedAt || zone.createdAt;
    if (!timestamp) return null;

    let date;
    if (typeof timestamp.toDate === 'function') date = timestamp.toDate();
    else if (timestamp.seconds !== undefined) date = new Date(timestamp.seconds * 1000);
    else if (timestamp._seconds !== undefined) date = new Date(timestamp._seconds * 1000);
    else date = new Date(timestamp);
    
    if (isNaN(date.getTime())) return null;

    const diff = Math.floor((now - date.getTime()) / 1000);
    if (diff < 0) return 'Just now';
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <button 
      onClick={onSelect}
      className="w-full text-left bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-indigo-500/30 transition-all group relative overflow-hidden"
    >

      
      <div className="flex items-center gap-4 mb-4">
        <div className={`p-3 rounded-xl ${vehicle ? 'bg-indigo-500/10 text-indigo-500' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-0.5">{zone.type}</p>
          <h3 className="font-bold text-lg text-zinc-900 dark:text-white leading-tight truncate">
            {zone.name || 'Unnamed Bay'}
          </h3>
        </div>
      </div>

      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
        {vehicle ? (
          <div>
            <div className="flex justify-between items-start mb-1">
              <h4 className="font-bold text-zinc-900 dark:text-white text-sm">
                {vehicle.year} {vehicle.make} {vehicle.model || 'Unknown'}
              </h4>
              <p className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded">{timeInArea() || '--'}</p>
            </div>
            <p className="text-xs text-zinc-500 font-mono mb-1">{vehicle.vin}</p>
            {vehicle.customerName && <p className="text-[10px] text-zinc-400 truncate italic">{vehicle.customerName}</p>}
          </div>
        ) : (
          <p className="text-sm font-medium text-zinc-400 italic py-2">Empty</p>
        )}
      </div>
    </button>
  );
}

function ZoneDetailsModal({ zone, tenantId, vehicles, onClose, onAssign, onClear, onQuickAddRequest, onOpenVehicle }: any) {
  const Icon = zoneTypeIcons[zone.type as keyof typeof zoneTypeIcons] || LayoutDashboard;
  const vehicle = vehicles.find((v: any) => v.vin === zone.currentVehicleVin);
  const [history, setHistory] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!vehicle) return;
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [vehicle]);

  const timeInArea = () => {
    const timestamp = zone.lastAssignedAt || zone.updatedAt || zone.createdAt;
    if (!timestamp) return null;

    let date;
    if (typeof timestamp.toDate === 'function') date = timestamp.toDate();
    else if (timestamp.seconds !== undefined) date = new Date(timestamp.seconds * 1000);
    else if (timestamp._seconds !== undefined) date = new Date(timestamp._seconds * 1000);
    else date = new Date(timestamp);
    
    if (isNaN(date.getTime())) return null;

    const diff = Math.floor((now - date.getTime()) / 1000);
    if (diff < 0) return 'Just now';
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  useEffect(() => {
    const q = query(
      collection(db, `businesses/${tenantId}/zone_assignments`),
      where('zoneId', '==', zone.id),
      orderBy('assignedAt', 'desc'),
      limit(10)
    );
    const unsub = onSnapshot(q, snap => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [zone.id, tenantId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-lg overflow-hidden shadow-xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-4 h-4"/></button>
          
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-2xl ${vehicle ? 'bg-indigo-500/10 text-indigo-500' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
              <Icon className="w-8 h-8" />
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">{zone.type} Details</p>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white leading-tight">{zone.name || 'Unnamed Bay'}</h2>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
          
          {/* Current Occupancy */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <CarFront className="w-4 h-4 text-indigo-500" /> Current Vehicle
              </h3>
              {vehicle && (
                <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded-full uppercase tracking-wider">
                  Parked here for {timeInArea() || '--'}
                </p>
              )}
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl">
              {vehicle ? (
                <div className="mb-4">
                  <button onClick={() => onOpenVehicle(vehicle.vin)} className="w-full text-left p-3 bg-white dark:bg-zinc-900 border border-indigo-100 dark:border-indigo-500/20 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-sm rounded-xl transition-all group flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {vehicle.year} {vehicle.make} {vehicle.model || 'Unknown'}
                      </h4>
                      <p className="text-xs font-mono text-zinc-500 mt-0.5">{vehicle.vin}</p>
                    </div>
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded-full">Open</span>
                  </button>
                </div>
              ) : null}
              <VinSelector vin={zone.currentVehicleVin || ''} onAssign={onAssign} onClear={onClear} onQuickAddRequest={onQuickAddRequest} vehicles={vehicles} />
            </div>
          </section>

          {/* History */}
          <section>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
              <History className="w-4 h-4 text-zinc-500" /> Recent Assignment History
            </h3>
            <div className="space-y-2">
              {history.length === 0 ? <p className="text-sm text-zinc-500 italic px-2">No history available.</p> : 
                history.map(item => {
                  const author = item.assignedByName || item.assignedByEmail || (item.assignedBy !== 'system' ? 'Staff Member' : 'System');
                  return (
                    <div key={item.id} className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between text-sm">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`font-bold ${item.action === 'assigned' ? 'text-emerald-600 dark:text-emerald-500' : 'text-zinc-500'}`}>{item.action === 'assigned' ? 'Assigned' : 'Cleared'}</span>
                          {item.vin && <span className="font-mono text-zinc-900 dark:text-white">{item.vin}</span>}
                        </div>
                        <p className="text-[10px] text-zinc-500 font-medium tracking-wide">by {author}</p>
                      </div>
                      <span className="text-[10px] text-zinc-400 font-medium tracking-wide text-right">
                        {item.assignedAt?.seconds ? (
                          <>
                            {new Date(item.assignedAt.seconds * 1000).toLocaleDateString()}
                            <br />
                            {new Date(item.assignedAt.seconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </>
                        ) : 'Just now'}
                      </span>
                    </div>
                  );
                })
              }
            </div>
          </section>

        </div>

      </div>
    </div>
  );
}

function QuickAddVehicleModal({ tenantId, initialVin, onClose, onAssign }: { tenantId: string, initialVin: string, onClose: () => void, onAssign: (vin: string) => void }) {
  const [vin, setVin] = useState(initialVin || '');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);

  useEffect(() => {
    if (vin.trim().length === 17) {
      setIsDecoding(true);
      fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin.trim()}?format=json`)
        .then(res => res.json())
        .then(data => {
          const result = data.Results?.[0];
          if (result && result.Make && result.ErrorCode && result.ErrorCode.startsWith('0')) {
            if (result.ModelYear) setYear(result.ModelYear);
            if (result.Make) setMake(result.Make);
            if (result.Model) setModel(result.Model);
          }
        })
        .catch(err => console.warn("NHTSA decode failed", err))
        .finally(() => setIsDecoding(false));
    }
  }, [vin]);

  useEffect(() => {
    getDocs(collection(db, `businesses/${tenantId}/customers`)).then(snap => {
      const data: any[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => {
        const nameA = a.name || a.displayName || a.CompanyName || a.FullName || '';
        const nameB = b.name || b.displayName || b.CompanyName || b.FullName || '';
        return nameA.localeCompare(nameB);
      });
      setCustomers(data);
    }).catch(err => console.warn("Could not fetch customers", err));
  }, [tenantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vin.trim()) return;
    setIsSubmitting(true);
    try {
      const trimmedVin = vin.trim().toUpperCase();
      const vehicleRef = doc(db, `businesses/${tenantId}/vehicles`, trimmedVin);
      const vehicleDoc = await getDoc(vehicleRef);
      if (!vehicleDoc.exists()) {
        await setDoc(vehicleRef, {
          vin: trimmedVin,
          make: make.trim().toUpperCase(),
          model: model.trim().toUpperCase(),
          year: year.trim(),
          customerName: customerName.trim(),
          tenantId,
          createdAt: serverTimestamp(),
          source: 'Quick Add'
        });
      }
      onAssign(trimmedVin);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to register new vehicle');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            Register New Vehicle
            {isDecoding && <span className="text-[10px] font-medium text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-full animate-pulse">Decoding VIN...</span>}
          </h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">VIN or Identifier *</label>
            <input required type="text" value={vin} onChange={e => setVin(e.target.value.toUpperCase())} placeholder="e.g. 1FMCU9..." className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Year</label>
              <input type="text" value={year} onChange={e => setYear(e.target.value)} placeholder="e.g. 2025" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Make</label>
              <input type="text" value={make} onChange={e => setMake(e.target.value)} placeholder="e.g. Ford" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Model</label>
              <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. Explorer" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Customer</label>
            <input 
              type="text" 
              list="customer-list"
              value={customerName} 
              onChange={e => setCustomerName(e.target.value)} 
              placeholder="Start typing or select from list..." 
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
            />
            <datalist id="customer-list">
              {customers.map(c => {
                const name = c.name || c.displayName || c.CompanyName || c.FullName || c.id;
                return <option key={c.id} value={name} />;
              })}
            </datalist>
            <p className="mt-1.5 text-[10px] text-zinc-500">
              When QuickBooks syncs this VIN on a job, it will verify against this customer.
            </p>
          </div>
          <div className="pt-4">
            <button disabled={isSubmitting || isDecoding} type="submit" className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Register & Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
