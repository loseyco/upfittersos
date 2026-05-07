import { useState, useEffect } from 'react';
import { collection, doc, updateDoc, serverTimestamp, onSnapshot, query, orderBy, limit, where, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Warehouse, MapPin, Briefcase, LayoutDashboard, 
  X, Edit2, CarFront, History, CheckCircle2 
} from 'lucide-react';
import { toast } from 'sonner';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { StaffLink } from './StaffPerformance';
import { JobSelector } from './JobSelectionComponents';
import { QuickAddCustomerModal } from './CustomerSelectionComponents';
import { VinSelector } from './VehicleSelector';
import { useAuthStore } from '../../lib/auth/store';

export interface Zone {
  id: string;
  name: string;
  type: 'bay' | 'parking' | 'office' | 'other' | string;
  currentVehicleVin: string | null;
  currentJobId: string | null;
  allowMultiple?: boolean;
  currentVehicleVins?: string[];
  lastAssignedAt?: any;
  createdAt?: any;
  updatedAt?: any;
  isArchived?: boolean;
}

export const zoneTypeIcons = {
  bay: Warehouse,
  parking: MapPin,
  office: Briefcase,
  other: LayoutDashboard,
};

export function ZoneDetailsModal({ zone, tenantId, vehicles, jobs, onClose, onAssign, onClear, onRemoveVehicle, onQuickAddRequest, onQuickAddJobRequest, onOpenVehicle, onDelete }: any) {

  useBodyScrollLock(true);
  const Icon = zoneTypeIcons[zone.type as keyof typeof zoneTypeIcons] || LayoutDashboard;
  const vehicle = vehicles.find((v: any) => v.vin === zone.currentVehicleVin);
  const job = jobs.find((j: any) => j.id === zone.currentJobId);
  const zoneVehicles = zone.allowMultiple ? (zone.currentVehicleVins || []).map((vin: string) => vehicles.find((v: any) => v.vin === vin)).filter(Boolean) : [];
  const [history, setHistory] = useState<any[]>([]);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(zone.name || '');
  const [editType, setEditType] = useState(zone.type || 'bay');
  const [editAllowMultiple, setEditAllowMultiple] = useState(!!zone.allowMultiple);
  const [quickAddCustomer, setQuickAddCustomer] = useState<string | null>(null);
  const { user } = useAuthStore();
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (!vehicle && zoneVehicles.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [vehicle, zoneVehicles.length]);

  const handleSaveEdit = async () => {
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/zones`, zone.id), {
        name: editName.trim(),
        type: editType,
        allowMultiple: editAllowMultiple,
        updatedAt: serverTimestamp()
      });
      setIsEditing(false);
      toast.success("Zone updated");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update zone");
    }
  };

  const handleVerify = async () => {
    if (isVerifying) return;
    if (!tenantId || !zone.id) {
      toast.error("Missing context for verification");
      return;
    }

    setIsVerifying(true);
    try {
      const timestamp = serverTimestamp();
      
      // Update zone verification metadata
      const updateData: any = {
        lastVerifiedAt: timestamp,
        updatedAt: timestamp
      };

      // CRITICAL: If lastAssignedAt is missing (legacy records), 
      // freeze the arrival time so the clock doesn't reset.
      if (!zone.lastAssignedAt) {
        updateData.lastAssignedAt = zone.updatedAt || zone.createdAt || timestamp;
      }

      await updateDoc(doc(db, `businesses/${tenantId}/zones`, zone.id), updateData);

      // Log the verification activity
      await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
        zoneId: zone.id,
        zoneName: zone.name || 'Unknown Zone',
        vin: zone.currentVehicleVin || null,
        jobId: zone.currentJobId || null,
        jobTitle: job?.title || null,
        customerName: job?.customerName || null,
        action: 'verified',
        assignedAt: timestamp,
        assignedBy: user?.uid || 'system',
        assignedByName: user?.displayName || user?.email || 'Staff',
        notes: 'Occupancy verified by staff'
      });

      toast.success("Occupancy verified");
    } catch (err: any) {
      console.error("Verification Error:", err);
      // Provide more detail in the toast if it's a permission issue or other known Firestore error
      const msg = err.code === 'permission-denied' ? 'Permission denied (check login)' : err.message || 'Check connection';
      toast.error(`Failed to verify: ${msg}`);
    } finally {
      setIsVerifying(false);
    }
  };

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
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {!isEditing && (
              <button onClick={() => setIsEditing(true)} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-4 h-4"/></button>
          </div>
          
          <div className="flex items-center gap-4 mt-2">
            <div className={`p-4 rounded-2xl ${vehicle ? 'bg-indigo-500/10 text-indigo-500' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
              <Icon className="w-8 h-8" />
            </div>
            {isEditing ? (
              <div className="flex-1 space-y-3">
                <input 
                  type="text" 
                  value={editName} 
                  onChange={e => setEditName(e.target.value)} 
                  className="w-full px-3 py-1.5 text-lg font-bold bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
                <div className="flex gap-2">
                  <select 
                    value={editType} 
                    onChange={e => setEditType(e.target.value as any)}
                    className="flex-1 px-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="bay">Service Bay</option>
                    <option value="parking">Parking Spot</option>
                    <option value="office">Office</option>
                    <option value="other">Other</option>
                  </select>
                  <select 
                    value={editAllowMultiple ? 'multiple' : 'single'} 
                    onChange={e => setEditAllowMultiple(e.target.value === 'multiple')}
                    className="flex-1 px-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="single">Single Vehicle</option>
                    <option value="multiple">Multiple (Open Lot)</option>
                  </select>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <button onClick={onDelete} className="text-xs font-bold text-red-500 hover:text-red-600 px-2 py-1">Archive Zone</button>
                  <div className="flex gap-2">
                    <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">Cancel</button>
                    <button onClick={handleSaveEdit} className="px-3 py-1.5 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Save</button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">{zone.type} Details</p>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white leading-tight">{zone.name || 'Unnamed Bay'}</h2>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
          
          {/* Current Occupancy */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <CarFront className="w-4 h-4 text-indigo-500" /> Current Work Order & Vehicle
              </h3>
              {!zone.allowMultiple && (vehicle || job) && (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => onClear()}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Empty Bay
                  </button>
                  <button 
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 className={`w-3 h-3 ${isVerifying ? 'animate-pulse' : ''}`} />
                    Verify Still Here
                  </button>
                  <p className="hidden sm:block text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded-full uppercase tracking-wider">
                    {timeInArea() || '--'}
                  </p>
                </div>
              )}
            </div>
            
            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl space-y-6 shadow-inner">
              
              {/* Job Section - Primary Assignment */}
              {!zone.allowMultiple && (
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-emerald-500 uppercase tracking-widest px-1">Job Assignment</label>
                  {job ? (
                    <div className="p-3 bg-white dark:bg-zinc-900 border border-emerald-100 dark:border-emerald-500/20 rounded-xl flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                          <Briefcase className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-zinc-900 dark:text-white leading-snug">{job.title}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {job.customerName && (
                              <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-tight">{job.customerName}</p>
                            )}
                            {job.customerName && <span className="text-zinc-300 dark:text-zinc-700 text-[10px]">•</span>}
                            <p className="text-[10px] text-zinc-500 uppercase font-medium tracking-tight">#{job.jobNumber || 'No Job #'}</p>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => onClear()} className="p-2 text-zinc-400 hover:text-red-500 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <JobSelector 
                      jobId={zone.currentJobId || null} 
                      jobs={jobs} 
                      onAssign={(id) => {
                        const j = jobs.find((job: any) => job.id === id);
                        // If job has a linked vehicle, assign it too!
                        onAssign(j?.vehicleId || '', id);
                      }} 
                      onClear={onClear} 
                      onCreateNewRequest={(title) => onQuickAddJobRequest(title || '')}
                    />
                  )}
                </div>
              )}

              {/* Vehicle Section */}
              <div className="space-y-3 pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
                <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest px-1">Vehicle Assignment</label>
                {zone.allowMultiple ? (
                  <div className="space-y-3">
                    {zoneVehicles.length > 0 ? zoneVehicles.map((v: any) => (
                      <div key={v.vin} className="flex items-center gap-2">
                        <button onClick={() => onOpenVehicle(v.vin)} className="flex-1 text-left p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 shadow-sm rounded-xl transition-all group flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 transition-colors">
                              {v.year} {v.make} {v.model || 'Unknown'}
                            </h4>
                            <p className="text-xs font-mono text-zinc-500 mt-0.5">{v.vin}</p>
                          </div>
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">Open</span>
                        </button>
                        <button onClick={() => onRemoveVehicle(v.vin)} className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    )) : (
                      <p className="text-sm text-zinc-500 italic p-3 text-center">Lot is empty.</p>
                    )}
                  </div>
                ) : vehicle ? (
                  <div className="group relative">
                    <button onClick={() => onOpenVehicle(vehicle.vin)} className="w-full text-left p-3 bg-white dark:bg-zinc-900 border border-indigo-100 dark:border-indigo-500/20 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-sm rounded-xl transition-all flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-lg">
                          <CarFront className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div>
                          <h4 className="font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {vehicle.year} {vehicle.make} {vehicle.model || 'Unknown'}
                          </h4>
                          <p className="text-xs font-mono text-zinc-500 mt-0.5">{vehicle.vin}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded-full">Active</span>
                    </button>
                    <button onClick={() => onClear()} className="absolute -top-2 -right-2 p-2 bg-red-500 text-white rounded-full shadow-lg transition-opacity border-2 border-white dark:border-zinc-900 z-10" title="Clear Job">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : null}
                <VinSelector vin={zone.allowMultiple ? '' : (zone.currentVehicleVin || '')} onAssign={(vin) => onAssign(vin, zone.currentJobId)} onClear={onClear} onQuickAddRequest={onQuickAddRequest} vehicles={vehicles} />
              </div>
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
                      <div key={item.id} className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between text-sm group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                              item.action === 'assigned' 
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500' 
                                : item.action === 'verified'
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-500'
                                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                            }`}>
                              {item.action === 'assigned' ? 'Assigned' : item.action === 'verified' ? 'Verified' : 'Cleared'}
                            </span>
                            {item.vin && <span className="font-mono text-xs text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{item.vin}</span>}
                          </div>
                          
                          {(item.jobTitle || item.customerName) && (
                            <div className="mb-1.5 pl-1 border-l-2 border-zinc-200 dark:border-zinc-800">
                              {item.jobTitle && <p className="font-bold text-zinc-900 dark:text-white truncate">{item.jobTitle}</p>}
                              {item.customerName && <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-tight truncate">{item.customerName}</p>}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[8px] font-black uppercase text-zinc-500">
                              {(item.assignedByName || 'S')[0]}
                            </div>
                            <p className="text-[10px] text-zinc-400 font-medium tracking-wide italic">by <StaffLink name={author} tenantId={tenantId} /></p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter leading-none block mb-1">
                            {item.assignedAt?.seconds ? (
                              new Date(item.assignedAt.seconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                            ) : '...'}
                          </span>
                          <span className="text-[8px] text-zinc-500 font-black uppercase tracking-widest opacity-60">
                            {item.assignedAt?.seconds ? (
                              new Date(item.assignedAt.seconds * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })
                            ) : '--'}
                          </span>
                        </div>
                      </div>
                    );
                })
              }
            </div>
          </section>

        </div>

      </div>

      {editingCustomerId && (
        <QuickAddCustomerModal 
          tenantId={tenantId}
          customerId={editingCustomerId}
          onClose={() => setEditingCustomerId(null)}
          onSuccess={() => setEditingCustomerId(null)}
        />
      )}

      {quickAddCustomer !== null && (
        <QuickAddCustomerModal 
          tenantId={tenantId}
          initialName={quickAddCustomer}
          onClose={() => setQuickAddCustomer(null)}
          onSuccess={(_id: string, name: string) => {
            setQuickAddCustomer(null);
            onQuickAddJobRequest(name);
          }}
        />
      )}
    </div>
  );
}
