import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GenericDataGrid } from './GenericDataGrid';
import { X, Edit2, CarFront, Search, Archive, ShieldCheck, MapPin, Loader2, Clock, LogIn, LogOut } from 'lucide-react';
import { doc, updateDoc, collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { ConfirmModal } from '../../components/ConfirmModal';


function formatDuration(startMs: number, endMs: number) {
  const diffMs = Math.max(0, endMs - startMs);
  const diffMins = Math.floor(diffMs / 60000);
  const days = Math.floor(diffMins / 1440);
  const hours = Math.floor((diffMins % 1440) / 60);
  const mins = diffMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function LiveDuration({ startSeconds, endSeconds }: { startSeconds?: number, endSeconds?: number }) {
  const [now, setNow] = useState(Date.now());
  
  useEffect(() => {
    if (endSeconds) return; // Static if it has an end time
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [endSeconds]);

  if (!startSeconds) return <span>--</span>;
  const startMs = startSeconds * 1000;
  const endMs = endSeconds ? endSeconds * 1000 : now;
  return <span>{formatDuration(startMs, endMs)}</span>;
}

interface Zone {
  id: string;
  name?: string;
  type?: string;
  currentVehicleVin?: string | null;
}

export function VehiclesManager({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get('filter');
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });


  const { data: zones } = useQuery<Zone[]>({
    queryKey: ['zones-selector', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const snap = await getDocs(collection(db, `businesses/${tenantId}/zones`));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string, name: string, type: string, currentVehicleVin: string | null }));
    },
    enabled: !!tenantId
  });

  const handleFilter = (item: any) => {
    if (item.isArchived) return false;
    
    // Check if we are filtering by parking lot
    if (filterType === 'parking') {
      const zone = zones?.find(z => z.currentVehicleVin === item.vin);
      if (!zone || (zone.type !== 'lot' && zone.type !== 'parking')) return false;
    }

    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const searchableFields = [
      item.vin,
      item.make,
      item.model,
      item.year,
      item.customerName,
      item.jobTitle
    ].map(f => String(f || '').toLowerCase());
    
    return searchableFields.some(field => field.includes(query));
  };

  const getSource = (row: any) => {
    const isQB = row.tags?.includes('QuickBooks') || 
                 row.notes?.includes('Imported via QBWC') || 
                 !!row.ListID || !!row.qb_ListID || 
                 !!row.quickbooksId;
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
        isQB ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20'
      }`}>
        {isQB ? 'QuickBooks' : 'Native'}
      </span>
    );
  };

  const vehicleColumns = [
    { 
      key: 'vin', 
      label: 'VIN',
      format: (val: any) => <span className="font-mono text-zinc-600 dark:text-zinc-400">{val || 'N/A'}</span>
    },
    { key: 'year', label: 'Year' },
    { key: 'make', label: 'Make' },
    { key: 'model', label: 'Model' },
    { 
      key: 'customerName', 
      label: 'Customer',
      format: (val: any) => val ? <span className="font-semibold">{val}</span> : <span className="text-zinc-500">-</span>
    },
    { 
      key: 'jobTitle', 
      label: 'Linked Job',
      format: (val: any) => val ? <span className="font-semibold text-indigo-500">{val}</span> : <span className="text-zinc-500">-</span>
    },
    {
      key: 'location',
      label: 'Location',
      format: (_: any, row: any) => {
        const z = zones?.find(z => z.currentVehicleVin === row.vin);
        return z ? <span className="font-bold text-zinc-900 dark:text-white flex items-center gap-1"><MapPin className="w-3 h-3 text-zinc-400" />{z.name}</span> : <span className="text-zinc-500">-</span>;
      }
    },
    { key: 'source', label: 'Source', format: (_: any, row: any) => getSource(row) }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Vehicle Database</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Search and manage all customer vehicles.</p>
        </div>
        <div className="relative w-full sm:w-80">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search VIN, make, model, customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
          />
        </div>
      </div>

      <GenericDataGrid 
        collectionPath={`businesses/${tenantId}/vehicles`} 
        title="Customer Vehicles" 
        columns={vehicleColumns}
        localFilter={handleFilter}
        onRowClick={(row) => setSelectedVehicle(row)}
      />

      {selectedVehicle && !editingVehicle && (
        <VehicleDetailsModal 
          tenantId={tenantId}
          vehicle={selectedVehicle}
          onConfirmAction={setConfirmConfig}
          onClose={() => setSelectedVehicle(null)}

          onEdit={() => {
            setEditingVehicle(selectedVehicle);
            setSelectedVehicle(null);
          }}
          onArchive={async () => {
            setConfirmConfig({
              isOpen: true,
              title: 'Archive Vehicle',
              message: `Are you sure you want to archive this ${selectedVehicle.year} ${selectedVehicle.make}? This will hide it from active database lists.`,
              onConfirm: async () => {
                try {
                  await updateDoc(doc(db, `businesses/${tenantId}/vehicles`, selectedVehicle.id), { isArchived: true });
                  toast.success("Vehicle archived");
                  queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/vehicles`] });
                  queryClient.invalidateQueries({ queryKey: ['global-search-index', tenantId] });
                  setSelectedVehicle(null);
                } catch (e) {
                  toast.error("Failed to archive vehicle");
                }
              }
            });
          }}

          getSource={getSource}
        />
      )}

      {editingVehicle && (
        <EditVehicleModal
          tenantId={tenantId}
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSaved={(updatedData) => {
            setSelectedVehicle({ ...editingVehicle, ...updatedData });
            queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/vehicles`] });
            queryClient.invalidateQueries({ queryKey: ['global-search-index', tenantId] });
            setEditingVehicle(null);
          }}
        />
      )}

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>

  );
}

export function VehicleDetailsModal({ tenantId, vehicle, onClose, onEdit, onArchive, getSource, onConfirmAction }: { tenantId: string, vehicle: any, onClose: () => void, onEdit: () => void, onArchive?: () => void, getSource: (row: any) => React.ReactNode, onConfirmAction: (config: any) => void }) {

  const queryClient = useQueryClient();
  const isQB = vehicle.tags?.includes('QuickBooks') || 
               vehicle.notes?.includes('Imported via QBWC') || 
               !!vehicle.ListID || !!vehicle.qb_ListID || 
               !!vehicle.quickbooksId;

  const { data: zones, isLoading: loadingZones } = useQuery<Zone[]>({
    queryKey: ['zones-selector', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const snap = await getDocs(collection(db, `businesses/${tenantId}/zones`));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Zone));
    },
    enabled: !!tenantId
  });

  const currentZone = zones?.find(z => z.currentVehicleVin === vehicle.vin);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const handleIntake = async () => {
    setIsUpdatingStatus(true);
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/vehicles`, vehicle.id), {
        arrivedAt: serverTimestamp()
      });
      toast.success("Vehicle marked as arrived");
      queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/vehicles`] });
    } catch (err) {
      toast.error("Failed to mark as arrived");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleRelease = async () => {
    onConfirmAction({
      isOpen: true,
      title: 'Release Vehicle',
      message: 'Are you sure you want to release this vehicle? It will be unassigned from its current zone and marked as departed.',
      onConfirm: async () => {
        setIsUpdatingStatus(true);
        try {
          const batchUpdates = [];
          batchUpdates.push(updateDoc(doc(db, `businesses/${tenantId}/vehicles`, vehicle.id), {
            departedAt: serverTimestamp()
          }));
          
          if (currentZone?.id) {
            batchUpdates.push(updateDoc(doc(db, `businesses/${tenantId}/zones`, currentZone.id), { currentVehicleVin: null }));
            batchUpdates.push(addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
              zoneId: currentZone.id,
              zoneName: currentZone.name || 'Unknown Zone',
              vin: null,
              assignedAt: serverTimestamp(),
              assignedBy: 'system',
              action: 'cleared (released)'
            }));
          }
          
          await Promise.all(batchUpdates);
          toast.success("Vehicle released");
          queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/vehicles`] });
          queryClient.invalidateQueries({ queryKey: ['zones-selector', tenantId] });
          queryClient.invalidateQueries({ queryKey: ['zones', tenantId] }); 
        } catch (err) {
          toast.error("Failed to release vehicle");
        } finally {
          setIsUpdatingStatus(false);
        }
      }
    });
  };


  const handleZoneChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newZoneId = e.target.value;
    const oldZoneId = currentZone?.id;
    if (newZoneId === oldZoneId) return;

    if (newZoneId) {
      const targetZone = zones?.find(z => z.id === newZoneId);
      if (targetZone && targetZone.currentVehicleVin) {
        onConfirmAction({
          isOpen: true,
          title: 'Zone Occupied',
          message: `This zone is currently occupied by vehicle VIN: ${targetZone.currentVehicleVin}. Continuing will unassign that vehicle. Proceed?`,
          onConfirm: () => performZoneChange(newZoneId, oldZoneId)
        });
        return;
      }
    }

    performZoneChange(newZoneId, oldZoneId);
  };

  const performZoneChange = async (newZoneId: string, oldZoneId?: string) => {


    try {
      if (oldZoneId) {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, oldZoneId), { currentVehicleVin: null });
        await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
          zoneId: oldZoneId,
          zoneName: zones?.find(z => z.id === oldZoneId)?.name || 'Unknown Zone',
          vin: null,
          assignedAt: serverTimestamp(),
          assignedBy: 'system',
          action: 'cleared'
        });
      }

      if (newZoneId) {
        const payload: any = { 
          currentVehicleVin: vehicle.vin,
          lastAssignedAt: serverTimestamp()
        };
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, newZoneId), payload);
        
        // Auto mark as arrived if missing
        if (!vehicle.arrivedAt && !vehicle.departedAt) {
          await updateDoc(doc(db, `businesses/${tenantId}/vehicles`, vehicle.id), {
            arrivedAt: serverTimestamp()
          });
          queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/vehicles`] });
        }

        await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
          zoneId: newZoneId,
          zoneName: zones?.find(z => z.id === newZoneId)?.name || 'Unknown Zone',
          vin: vehicle.vin,
          assignedAt: serverTimestamp(),
          assignedBy: 'system',
          action: 'assigned'
        });
      }
      toast.success("Vehicle location updated");
      queryClient.invalidateQueries({ queryKey: ['zones-selector', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['zones', tenantId] }); 
    } catch (err) {
      toast.error("Failed to update location");
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
              <CarFront className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-white text-lg leading-tight">
                {vehicle.year} {vehicle.make} {vehicle.model || 'Unknown Vehicle'}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <p className="font-mono text-sm text-zinc-500">{vehicle.vin}</p>
                {vehicle.apiVerified && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    <ShieldCheck className="w-3 h-3" /> API Verified
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isQB && onArchive && (
              <button 
                onClick={onArchive}
                className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 dark:text-rose-400 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 rounded-lg transition-colors shadow-sm"
                title="Archive Vehicle"
              >
                <Archive className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={onEdit}
              className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 rounded-lg transition-colors shadow-sm"
              title="Edit Vehicle"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button 
              onClick={onClose}
              className="p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-2 gap-y-6 gap-x-4">
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Customer</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{vehicle.customerName || <span className="text-zinc-500 italic">None</span>}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Source</p>
            <div>{getSource(vehicle)}</div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Linked Job</p>
            <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{vehicle.jobTitle || <span className="text-zinc-500 italic">None</span>}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Body Class</p>
            <p className="text-sm text-zinc-900 dark:text-white">{vehicle.bodyClass || '--'}</p>
          </div>
          <div className="col-span-2 border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-400" />
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Site Status</p>
              </div>
            </div>
            
            {!vehicle.arrivedAt && !vehicle.departedAt ? (
              <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800">
                <p className="text-sm text-zinc-500">Vehicle has not arrived yet.</p>
                <button 
                  onClick={handleIntake} 
                  disabled={isUpdatingStatus}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  <LogIn className="w-4 h-4" /> Intake Vehicle
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Time on Site</p>
                    <p className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <LiveDuration startSeconds={vehicle.arrivedAt?._seconds} endSeconds={vehicle.departedAt?._seconds} />
                      {vehicle.departedAt && <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-full">DEPARTED</span>}
                      {!vehicle.departedAt && <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full animate-pulse">ACTIVE</span>}
                    </p>
                  </div>
                  {!vehicle.departedAt && (
                    <button 
                      onClick={handleRelease} 
                      disabled={isUpdatingStatus}
                      className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-400 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                    >
                      <LogOut className="w-3 h-3" /> Release
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="col-span-2 border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-2">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-zinc-400" />
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Current Location</p>
            </div>
            {loadingZones ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading facility zones...
              </div>
            ) : (
              <select
                value={currentZone?.id || ""}
                onChange={handleZoneChange}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none appearance-none cursor-pointer"
              >
                <option value="">Unassigned / Off-site</option>
                {(zones || []).filter(z => z.type === 'bay').length > 0 && <optgroup label="Bays">
                  {(zones || []).filter(z => z.type === 'bay').map(z => (
                    <option key={z.id} value={z.id}>{z.name} {z.currentVehicleVin && z.currentVehicleVin !== vehicle.vin ? '(Occupied)' : ''}</option>
                  ))}
                </optgroup>}
                {(zones || []).filter(z => z.type === 'parking').length > 0 && <optgroup label="Parking">
                  {(zones || []).filter(z => z.type === 'parking').map(z => (
                    <option key={z.id} value={z.id}>{z.name} {z.currentVehicleVin && z.currentVehicleVin !== vehicle.vin ? '(Occupied)' : ''}</option>
                  ))}
                </optgroup>}
                {(zones || []).filter(z => z.type !== 'bay' && z.type !== 'parking').length > 0 && <optgroup label="Other Zones">
                  {(zones || []).filter(z => z.type !== 'bay' && z.type !== 'parking').map(z => (
                    <option key={z.id} value={z.id}>{z.name} {z.currentVehicleVin && z.currentVehicleVin !== vehicle.vin ? '(Occupied)' : ''}</option>
                  ))}
                </optgroup>}
              </select>
            )}
            <p className="text-[10px] text-zinc-500 mt-2">Updating location will automatically clear any previous vehicle assigned to the selected zone.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EditVehicleModal({ tenantId, vehicle, onClose, onSaved }: { tenantId: string, vehicle: any, onClose: () => void, onSaved: (data: any) => void }) {
  const vin = vehicle.vin || '';
  const [make, setMake] = useState(vehicle.make || '');
  const [model, setModel] = useState(vehicle.model || '');
  const [year, setYear] = useState(vehicle.year || '');
  const [customerName, setCustomerName] = useState(vehicle.customerName || '');
  const [customers, setCustomers] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [apiVerified, setApiVerified] = useState(vehicle.apiVerified || false);

  useEffect(() => {
    // Auto-decode if make is missing and vin is 17 chars
    if (!make && vin.trim().length === 17) {
      setIsDecoding(true);
      fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin.trim()}?format=json`)
        .then(res => res.json())
        .then(data => {
          const result = data.Results?.[0];
          if (result && result.Make && result.ErrorCode && result.ErrorCode.startsWith('0')) {
            if (result.ModelYear) setYear(result.ModelYear);
            if (result.Make) setMake(result.Make);
            if (result.Model) setModel(result.Model);
            setApiVerified(true);
          }
        })
        .catch(err => console.warn("NHTSA decode failed", err))
        .finally(() => setIsDecoding(false));
    }
  }, [vin, make]);

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
    if (!vin.trim() || !vehicle.id) return;
    setIsSubmitting(true);
    try {
      const vehicleRef = doc(db, `businesses/${tenantId}/vehicles`, vehicle.id);
      const updateData = {
        make: make.trim().toUpperCase(),
        model: model.trim().toUpperCase(),
        year: year.trim(),
        customerName: customerName.trim(),
        apiVerified
      };
      await updateDoc(vehicleRef, updateData);
      toast.success('Vehicle updated');
      onSaved(updateData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update vehicle');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            Edit Vehicle
            {isDecoding && <span className="text-[10px] font-medium text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-full animate-pulse">Decoding VIN...</span>}
          </h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">VIN or Identifier</label>
            <input disabled type="text" value={vin} className="w-full px-4 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-500 outline-none font-mono cursor-not-allowed" />
            <p className="mt-1 text-[10px] text-zinc-500">VIN cannot be changed after creation.</p>
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
              list="customer-list-edit"
              value={customerName} 
              onChange={e => setCustomerName(e.target.value)} 
              placeholder="Start typing or select from list..." 
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
            />
            <datalist id="customer-list-edit">
              {customers.map(c => {
                const name = c.name || c.displayName || c.CompanyName || c.FullName || c.id;
                return <option key={c.id} value={name} />;
              })}
            </datalist>
          </div>
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-6 py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-xl font-bold transition-all shadow-sm">
              Cancel
            </button>
            <button disabled={isSubmitting || isDecoding} type="submit" className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-2">
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
