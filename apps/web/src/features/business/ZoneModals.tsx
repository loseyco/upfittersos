import { useState, useEffect, useRef } from 'react';
import { collection, doc, updateDoc, serverTimestamp, onSnapshot, query, limit, where, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Warehouse, MapPin, Briefcase, LayoutDashboard, 
  X, Edit2, CarFront, History, CheckCircle2,
  AlertTriangle, Clock, MessageSquare, Package, ShoppingCart, Unlink
} from 'lucide-react';
import { toast } from 'sonner';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { StaffLink } from './StaffPerformance';
import { JobSelector } from './JobSelectionComponents';
import { QuickAddCustomerModal } from './CustomerSelectionComponents';
import { StaffSelector } from './StaffSelectionComponents';
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
  blocker?: string;
  notes?: string;
  eta?: any;
}

export const zoneTypeIcons = {
  bay: Warehouse,
  parking: MapPin,
  office: Briefcase,
  other: LayoutDashboard,
};

export function ZoneDetailsModal({ zone, tenantId, vehicles, jobs, onClose, onAssign, onClear, onRemoveVehicle, onRemoveJob, onQuickAddRequest, onQuickAddJobRequest, onOpenVehicle, onDelete, partsRequests = [] }: any) {

  useBodyScrollLock(true);
  const vehicle = vehicles.find((v: any) => v.vin === zone.currentVehicleVin);
  const job = jobs.find((j: any) => j.id === zone.currentJobId);
  const targetEntity = job || zone;
  
  const legacyBlocker = targetEntity.blocker ? [{
    id: 'legacy',
    message: targetEntity.blocker,
    status: 'active',
    createdAt: new Date().toISOString(),
    createdBy: 'Legacy'
  }] : [];
  const activeBlockers = (targetEntity.blockers || legacyBlocker).filter((b: any) => b.status === 'active');

  const Icon = zoneTypeIcons[zone.type as keyof typeof zoneTypeIcons] || LayoutDashboard;
  const zoneVehicles = zone.allowMultiple ? (zone.currentVehicleVins || []).map((vin: string) => {
    const v = vehicles.find((v: any) => v.vin === vin);
    return v ? v : { vin };
  }) : [];
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



  const [floorWalkTab, setFloorWalkTab] = useState<'blocker' | 'notes' | 'eta' | 'parts'>('notes');
  const [isFloorWalkOpen, setIsFloorWalkOpen] = useState(false);
 
  const openFloorWalk = (tab: 'blocker' | 'notes' | 'eta' | 'parts') => {
    setFloorWalkTab(tab);
    setIsFloorWalkOpen(true);
  };

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

      // Log the verification activity (for history)
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

      // Log to activity feed for Mission Control
      await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
        type: 'zone_move',
        title: 'Occupancy Verified',
        message: `Verified: ${zone.name}${job ? ` (#${job.jobNumber})` : ''}`,
        timestamp,
        severity: 'success',
        author: user?.displayName || user?.email || 'Staff'
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
    if (!zone.id || !tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/zone_assignments`),
      where('zoneId', '==', zone.id),
      limit(100)
    );
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort in memory to avoid requiring a composite index
      data.sort((a: any, b: any) => {
        const getTs = (item: any) => {
          const val = item.assignedAt;
          if (val?.seconds) return val.seconds * 1000;
          return new Date(val || 0).getTime();
        };
        return getTs(b) - getTs(a);
      });
      setHistory(data.slice(0, 10));
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
                <CarFront className="w-4 h-4 text-indigo-500" /> Active Assignment
              </h3>
              {!zone.allowMultiple && (vehicle || job) && (
                <div className="flex items-center gap-1.5">
                  {(job?.expectedFinishTime || job?.eta || zone.eta) && (
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {(() => {
                        const eta = job?.expectedFinishTime || job?.eta || zone.eta;
                        const date = typeof eta?.toDate === 'function' ? eta.toDate() : new Date(eta);
                        return `ETA: ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                      })()}
                    </p>
                  )}
                  <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded-full uppercase tracking-wider">
                    {timeInArea() || '--'}
                  </p>
                </div>
              )}
            </div>

            {!zone.allowMultiple && (vehicle || job) && (
              <div className="space-y-2 mb-4">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => onClear()}
                    className="flex items-center justify-center gap-2 p-2.5 bg-red-500/5 hover:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 rounded-xl transition-all group"
                  >
                    <X className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Empty</span>
                  </button>
                  <button 
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl transition-all group disabled:opacity-50"
                  >
                    <CheckCircle2 className={`w-4 h-4 ${isVerifying ? 'animate-pulse' : ''}`} />
                    <span className="text-[9px] font-black uppercase tracking-widest text-center">Verify: No Change</span>
                  </button>
                </div>
                
                <div className="grid grid-cols-4 gap-2">
                  <button 
                    onClick={() => openFloorWalk('blocker')}
                    className="flex flex-col items-center justify-center gap-1 p-2 bg-red-500/5 hover:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 rounded-xl transition-all group relative"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-[8px] font-black uppercase tracking-tighter">Blocker</span>
                    {activeBlockers.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center animate-pulse border-2 border-white dark:border-zinc-900 shadow-sm">
                        {activeBlockers.length}
                      </span>
                    )}
                  </button>
                  <button 
                    onClick={() => openFloorWalk('parts')}
                    className="flex flex-col items-center justify-center gap-1 p-2 bg-amber-500/5 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl transition-all group relative"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span className="text-[8px] font-black uppercase tracking-tighter">Parts</span>
                    {(() => {
                      const activeParts = (partsRequests || []).filter((pr: any) => {
                        const status = (pr.status || '').toLowerCase();
                        const isActive = ['pending', 'received', 'ordered'].includes(status);
                        if (!isActive) return false;
                        
                        if (pr.jobId) return job?.id === pr.jobId;
                        const currentVin = job?.vehicleVin || zone?.currentVehicleVin;
                        if (pr.vin) return currentVin === pr.vin;
                        return zone?.id === pr.zoneId;
                      });
                      const count = activeParts.length;
                      if (count === 0) return null;
                      const hasArrived = activeParts.some((pr: any) => pr.status === 'received');
                      return (
                        <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white border-2 border-white dark:border-zinc-900 shadow-sm ${hasArrived ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}>
                          {count}
                        </span>
                      );
                    })()}
                  </button>
                  <button 
                    onClick={() => openFloorWalk('notes')}
                    className="flex flex-col items-center justify-center gap-1 p-2 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-xl transition-all group relative"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span className="text-[8px] font-black uppercase tracking-tighter">Note</span>
                    {(() => {
                      const noteCount = (targetEntity.work_notes?.length || 0) + (targetEntity.notes ? 1 : 0);
                      if (noteCount === 0) return null;
                      return (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-900 shadow-sm">
                          {noteCount}
                        </span>
                      );
                    })()}
                  </button>
                  <button 
                    onClick={() => openFloorWalk('eta')}
                    className="flex flex-col items-center justify-center gap-1 p-2 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-xl transition-all group"
                  >
                    <Clock className="w-4 h-4" />
                    <span className="text-[8px] font-black uppercase tracking-tighter">ETA</span>
                  </button>
                </div>
              </div>
            )}

            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl space-y-6 shadow-inner">
              
              {/* High-Level Status Summary (Blockers/Parts/Notes) */}
              {(() => {
                const activeBlocker = (targetEntity.blockers || []).find((b: any) => b.status === 'active')?.message || targetEntity.blocker;
                const latestNote = (targetEntity.work_notes?.[targetEntity.work_notes.length - 1]?.message) || targetEntity.notes;
                
                const activeParts = (partsRequests || []).filter((pr: any) => {
                  const status = (pr.status || '').toLowerCase();
                  const isActive = ['pending', 'received', 'ordered'].includes(status);
                  if (!isActive) return false;
                  
                  if (pr.jobId) return job?.id === pr.jobId;
                  const currentVin = job?.vehicleVin || zone?.currentVehicleVin;
                  if (pr.vin) return currentVin === pr.vin;
                  return zone?.id === pr.zoneId;
                });
                
                if (!activeBlocker && !latestNote && activeParts.length === 0) return null;

                return (
                  <div className="space-y-3 pb-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Current Status & Alerts</label>
                    
                    {/* Active Blocker */}
                    {activeBlocker && (
                      <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                        <div className="p-2 bg-red-500/20 rounded-lg shrink-0">
                          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">Active Blocker</p>
                          <p className="text-xs font-bold text-zinc-900 dark:text-white leading-snug">{activeBlocker}</p>
                        </div>
                      </div>
                    )}

                    {/* Latest Note */}
                    {latestNote && (
                      <div className="flex items-start gap-3 p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
                        <div className="p-2 bg-indigo-500/10 rounded-lg shrink-0">
                          <MessageSquare className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-1">Latest Note</p>
                          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-snug">{latestNote}</p>
                        </div>
                      </div>
                    )}

                    {/* Active Parts */}
                    {activeParts.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-1">
                          <Package className="w-3.5 h-3.5 text-emerald-500" />
                          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-wider">Parts Pending Fulfillment</p>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {activeParts.map((pr: any) => (
                            <div key={pr.id} className={`flex items-center justify-between p-2.5 rounded-xl border ${pr.status === 'received' ? 'bg-emerald-500/5 border-emerald-500/20 animate-pulse' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}>
                              <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${pr.status === 'received' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                <p className="text-[11px] font-bold text-zinc-900 dark:text-white truncate max-w-[200px]">{pr.partName}</p>
                              </div>
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${pr.status === 'received' ? 'bg-emerald-500 text-white' : 'bg-amber-500/10 text-amber-600'}`}>
                                {pr.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Staff Assignment */}
              <div className="space-y-3">
                <label className="block text-[10px] font-black text-amber-500 uppercase tracking-widest px-1">Staff Assignment</label>
                <StaffSelector 
                  selectedStaff={targetEntity.assignedStaff || (targetEntity.assignedStaffId ? [{ id: targetEntity.assignedStaffId, name: targetEntity.assignedStaffName || 'Staff' }] : [])}
                  tenantId={tenantId}
                  onAssign={async (staff) => {
                    const updatePayload = {
                      assignedStaff: staff,
                      assignedStaffIds: staff.map((s: any) => s.id),
                      assignedStaffId: staff.length > 0 ? staff[0].id : null,
                      assignedStaffName: staff.length > 0 ? staff[0].name : null,
                      updatedAt: serverTimestamp()
                    };
                    try {
                      if (job?.id) {
                        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, job.id), updatePayload);
                      } else {
                        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zone.id), updatePayload);
                      }
                      toast.success("Assigned staff updated");
                    } catch (err) {
                      console.error(err);
                      toast.error("Failed to update assigned staff");
                    }
                  }}
                />
              </div>

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
                      <button 
                        onClick={() => {
                          if (confirm('Are you sure you want to unlink this job from this bay? The vehicle will remain assigned.')) {
                            if (onRemoveJob) onRemoveJob();
                          }
                        }}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Unlink Job"
                      >
                        <Unlink className="w-4 h-4" />
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
                              {v.year ? `${v.year} ${v.make} ${v.model || 'Unknown'}` : 'Unlinked Vehicle'}
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
                  </div>
                ) : null}
                <VinSelector 
                  key={`vin-selector-${zone.id}-${zone.allowMultiple ? zone.currentVehicleVins?.length || 0 : zone.currentVehicleVin}`}
                  vin={zone.allowMultiple ? '' : (zone.currentVehicleVin || '')} 
                  onAssign={(vin) => onAssign(vin, zone.currentJobId)} 
                  onClear={onClear} 
                  onQuickAddRequest={onQuickAddRequest} 
                  vehicles={vehicles} 
                  hideClearButton={true} 
                />
              </div>
            </div>
          </section>

          {isFloorWalkOpen && (
            <FloorWalkModal 
              zone={zone}
              job={job}
              tenantId={tenantId}
              user={user}
              partsRequests={partsRequests}
              initialTab={floorWalkTab}
              onClose={() => setIsFloorWalkOpen(false)}
            />
          )}

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


function formatDatetimeLocal(dateString?: any) {
  if (!dateString) return '';
  const date = typeof dateString.toDate === 'function' ? dateString.toDate() : new Date(dateString);
  if (isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function FloorWalkModal({ zone, job, tenantId, user, partsRequests = [], onClose, initialTab = 'notes' }: any) {
  useBodyScrollLock(true);
  const targetEntity = job || zone;
  const etaInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (initialTab === 'eta' && etaInputRef.current) {
      setTimeout(() => {
        try { (etaInputRef.current as any).showPicker(); } catch (e) {}
      }, 100);
    }
  }, [initialTab]);

  const [activeTab, setActiveTab] = useState(initialTab);
  const [isSaving, setIsSaving] = useState(false);

  const [floorWalk, setFloorWalk] = useState({
    newBlocker: '',
    newNote: '',
    notes: targetEntity.notes || '',
    eta: formatDatetimeLocal(targetEntity.eta || targetEntity.expectedFinishTime),
    partsNeeded: '',
    urgency: 'normal' as 'normal' | 'urgent',
    assignedStaff: targetEntity.assignedStaff || (targetEntity.assignedStaffId ? [{ id: targetEntity.assignedStaffId, name: targetEntity.assignedStaffName || 'Staff' }] : [])
  });

  const legacyBlocker = targetEntity.blocker ? [{
    id: 'legacy',
    message: targetEntity.blocker,
    status: 'active',
    createdAt: new Date().toISOString(),
    createdBy: 'Legacy'
  }] : [];
  
  const activeBlockers = (targetEntity.blockers || legacyBlocker).filter((b: any) => b.status === 'active');

  const addHours = (hours: number) => {
    const d = new Date(floorWalk.eta || new Date());
    d.setHours(d.getHours() + hours);
    setFloorWalk(p => ({ ...p, eta: formatDatetimeLocal(d) }));
  };

  const setTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(17, 0, 0, 0); // 5 PM tomorrow
    setFloorWalk(p => ({ ...p, eta: formatDatetimeLocal(d) }));
  };

  const handleAddBlocker = async () => {
    if (!floorWalk.newBlocker.trim()) return;
    try {
      const newBlockerObj = {
        id: crypto.randomUUID(),
        message: floorWalk.newBlocker,
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: user?.displayName || user?.email || 'System'
      };
      const updatedBlockers = [...(targetEntity.blockers || legacyBlocker), newBlockerObj];
      
      const payload: any = { blockers: updatedBlockers };
      if (job) payload.status = 'Blocked';
      if (targetEntity.blocker) payload.blocker = null;

      if (job) {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, job.id), payload);
      } else {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zone.id), payload);
      }
      
      await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
        type: 'job',
        title: 'Blocker Added',
        message: `Job ${job?.jobNumber ? `#${job.jobNumber} ` : ''}blocked: ${newBlockerObj.message}`,
        timestamp: serverTimestamp(),
        severity: 'error',
        author: user?.displayName || user?.email || 'System'
      });

      setFloorWalk(p => ({ ...p, newBlocker: '' }));
      toast.success('Blocker added');
    } catch (e) {
      console.error(e);
      toast.error('Failed to add blocker');
    }
  };
  
  const handleAddNote = async () => {
    if (!floorWalk.newNote.trim()) return;
    try {
      const newNoteObj = {
        id: crypto.randomUUID(),
        message: floorWalk.newNote,
        createdAt: new Date().toISOString(),
        createdBy: user?.displayName || user?.email || 'System'
      };
      const updatedNotes = [...(targetEntity.work_notes || []), newNoteObj];
      
      const payload: any = { work_notes: updatedNotes };
      
      // Also update the primary 'notes' field for legacy display
      payload.notes = floorWalk.newNote;

      if (job) {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, job.id), payload);
      } else {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zone.id), payload);
      }
      
      await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
        type: 'job',
        title: 'Note Added',
        message: `Note added for ${job?.jobNumber ? '#' + job.jobNumber : zone.name}: ${newNoteObj.message.slice(0, 60)}`,
        timestamp: serverTimestamp(),
        severity: 'info',
        author: user?.displayName || user?.email || 'System'
      });

      setFloorWalk(p => ({ ...p, newNote: '' }));
      toast.success('Note added');
    } catch (e) {
      console.error(e);
      toast.error('Failed to add note');
    }
  };

  const handleClearBlocker = async (blockerId: string) => {
    try {
      const updatedBlockers = (targetEntity.blockers || legacyBlocker).map((b: any) => {
        if (b.id === blockerId) {
          return {
            ...b,
            status: 'cleared',
            clearedAt: new Date().toISOString(),
            clearedBy: user?.displayName || user?.email || 'System'
          };
        }
        return b;
      });

      const hasActive = updatedBlockers.some((b: any) => b.status === 'active');
      const payload: any = { blockers: updatedBlockers };
      if (job && !hasActive && job.status === 'Blocked') {
        payload.status = 'Active';
      }
      if (blockerId === 'legacy') payload.blocker = null;

      if (job) {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, job.id), payload);
      } else {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zone.id), payload);
      }

      await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
        type: 'job',
        title: 'Blocker Cleared',
        message: `Blocker cleared for Job ${job?.jobNumber ? `#${job.jobNumber}` : ''}`,
        timestamp: serverTimestamp(),
        severity: 'success',
        author: user?.displayName || user?.email || 'System'
      });

      toast.success('Blocker cleared');
    } catch (e) {
      console.error(e);
      toast.error('Failed to clear blocker');
    }
  };

  const handleAddPartRequest = async () => {
    if (!floorWalk.partsNeeded.trim() || !tenantId) return;
    try {
      await addDoc(collection(db, `businesses/${tenantId}/parts_requests`), {
        partName: floorWalk.partsNeeded.trim(),
        jobId: job?.id || null,
        zoneId: zone?.id || null,
        vin: job?.vehicleVin || zone?.currentVehicleVin || null,
        requestedBy: user?.displayName || user?.email || 'Staff',
        urgency: floorWalk.urgency,
        status: 'pending',
        createdAt: serverTimestamp(),
        createdBy: user?.uid || 'system',
        createdByName: user?.displayName || user?.email?.split('@')[0] || null,
        createdByEmail: user?.email || null,
      });

      await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
        type: 'parts',
        title: 'Parts Requested',
        message: `${user?.displayName || 'Tech'} requested parts for ${job?.title || zone.name}`,
        timestamp: serverTimestamp(),
        severity: floorWalk.urgency === 'urgent' ? 'warning' : 'info',
        author: user?.displayName || user?.email || 'Staff'
      });

      setFloorWalk(p => ({ ...p, partsNeeded: '' }));
      toast.success('Parts request submitted');
    } catch (e) {
      console.error(e);
      toast.error('Failed to submit parts request');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatePayload: any = {
        notes: floorWalk.notes,
        assignedStaff: floorWalk.assignedStaff,
        assignedStaffIds: floorWalk.assignedStaff.map((s: any) => s.id),
        assignedStaffId: floorWalk.assignedStaff.length > 0 ? floorWalk.assignedStaff[0].id : null,
        assignedStaffName: floorWalk.assignedStaff.length > 0 ? floorWalk.assignedStaff[0].name : null,
        updatedAt: serverTimestamp()
      };
      
      if (floorWalk.eta) {
        const isoString = new Date(floorWalk.eta).toISOString();
        updatePayload.eta = isoString;
      } else {
        updatePayload.eta = null;
      }
      
      if (job) {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, job.id), updatePayload);
      } else {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zone.id), updatePayload);
      }



      // Log to activity feed for notes/ETA
      const author = user?.displayName || user?.email || 'Staff';
      if (initialTab === 'notes' && floorWalk.notes) {
        await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
          type: 'job',
          title: 'Walkthrough Note',
          message: `Note added for ${job?.jobNumber ? '#' + job.jobNumber : zone.name}: ${floorWalk.notes.slice(0, 60)}${floorWalk.notes.length > 60 ? '...' : ''}`,
          timestamp: serverTimestamp(),
          severity: 'info',
          author
        });
      } else if (initialTab === 'eta' && floorWalk.eta && job) {
        await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
          type: 'job',
          title: 'ETA Updated',
          message: `ETA updated to ${new Date(floorWalk.eta).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} for ${job?.jobNumber ? '#' + job.jobNumber : zone.name}`,
          timestamp: serverTimestamp(),
          severity: 'info',
          author
        });
      }

      toast.success("Status updated");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Floor Walk Status</h2>
              <p className="text-xs text-zinc-500 font-medium">
                {zone.name} {job ? `• ${job.jobNumber ? '#' + job.jobNumber : job.title}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4 p-3 bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest shrink-0">Assigned Staff</label>
            <div className="flex-1 min-w-0">
              <StaffSelector 
                selectedStaff={floorWalk.assignedStaff} 
                onAssign={staff => setFloorWalk(prev => ({ ...prev, assignedStaff: staff }))} 
                tenantId={tenantId} 
              />
            </div>
          </div>

          {activeTab === 'blocker' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">Active Blockers</label>
              
              {activeBlockers.length > 0 ? (
                <div className="space-y-2">
                  {activeBlockers.map((blocker: any) => (
                    <div key={blocker.id} className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-red-600 dark:text-red-400">{blocker.message}</p>
                          <p className="text-[10px] text-red-500/70 font-medium uppercase tracking-tighter">
                            Added by {blocker.createdBy} {blocker.createdAt && `• ${(() => {
                              const d = new Date(blocker.createdAt);
                              const diff = Math.floor((Date.now() - d.getTime()) / 60000);
                              if (diff < 1) return 'Just now';
                              if (diff < 60) return `${diff}m ago`;
                              if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
                              return `${Math.floor(diff/1440)}d ago`;
                            })()}`}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleClearBlocker(blocker.id)}
                        className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 italic px-1">No active blockers.</p>
              )}

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <AlertTriangle className="w-4 h-4 text-zinc-400" />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Describe the blocker..."
                    autoFocus={initialTab === 'blocker'}
                    value={floorWalk.newBlocker}
                    onChange={e => setFloorWalk(prev => ({ ...prev, newBlocker: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleAddBlocker()}
                    className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm transition-all"
                  />
                </div>
                <button 
                  onClick={handleAddBlocker}
                  disabled={!floorWalk.newBlocker.trim()}
                  className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-50 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
                >
                  Add
                </button>
              </div>
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button 
                  onClick={() => setActiveTab('parts')}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-amber-500/5 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl transition-all font-bold text-xs uppercase tracking-widest"
                >
                  <Package className="w-4 h-4" />
                  Blocked on Parts?
                </button>
              </div>
            </div>
          )}

          {activeTab === 'parts' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-1">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Currently Tracking</label>
              </div>
              
              {(() => {
                const activeParts = (partsRequests || []).filter((pr: any) => {
                  const status = (pr.status || '').toLowerCase();
                  const isActive = ['pending', 'received', 'ordered'].includes(status);
                  if (!isActive) return false;
                  
                  // Match by Job ID
                  if (job?.id && pr.jobId === job.id) return true;
                  // Match by Zone ID
                  if (zone?.id && pr.zoneId === zone.id) return true;
                  // Match by VIN
                  const currentVin = job?.vehicleVin || zone?.currentVehicleVin;
                  if (currentVin && pr.vin === currentVin) return true;
                  
                  return false;
                });
                if (activeParts.length === 0) return (
                  <p className="text-xs text-zinc-400 italic px-1">No active parts requests.</p>
                );
                return (
                  <div className="space-y-2">
                    {activeParts.map((pr: any) => (
                      <div key={pr.id} className={`flex items-center justify-between p-3 rounded-xl border ${pr.status === 'received' ? 'bg-emerald-500/5 border-emerald-500/20 animate-pulse' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}>
                        <div className="flex items-center gap-3">
                          <Package className={`w-4 h-4 ${pr.status === 'received' ? 'text-emerald-500' : 'text-amber-500'}`} />
                          <div>
                            <p className="text-xs font-bold text-zinc-900 dark:text-white">{pr.partName}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`text-[8px] font-black uppercase tracking-widest px-1 rounded ${pr.status === 'received' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                                {pr.status}
                              </span>
                              <span className="text-[9px] text-zinc-400 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {(() => {
                                  const ts = pr.statusChangedAt || pr.createdAt;
                                  if (!ts) return '...';
                                  const date = ts.toDate ? ts.toDate() : new Date(ts);
                                  const diff = Math.floor((Date.now() - date.getTime()) / 60000);
                                  if (diff < 1) return 'Just now';
                                  if (diff < 60) return `${diff}m ago`;
                                  if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
                                  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className={`w-2 h-2 rounded-full ${pr.status === 'received' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between px-1">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Request a Part</label>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => setFloorWalk(p => ({ ...p, urgency: 'normal' }))}
                      className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${floorWalk.urgency === 'normal' ? 'bg-amber-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700'}`}
                    >
                      NORMAL
                    </button>
                    <button 
                      onClick={() => setFloorWalk(p => ({ ...p, urgency: 'urgent' }))}
                      className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${floorWalk.urgency === 'urgent' ? 'bg-red-500 text-white animate-pulse shadow-sm shadow-red-500/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700'}`}
                    >
                      URGENT
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                      <ShoppingCart className="w-4 h-4 text-zinc-400" />
                    </div>
                    <input 
                      type="text" 
                      placeholder="Enter part name or description..."
                      value={floorWalk.partsNeeded}
                      onChange={e => setFloorWalk(prev => ({ ...prev, partsNeeded: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleAddPartRequest()}
                      className={`w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border rounded-xl outline-none text-sm transition-all ${floorWalk.urgency === 'urgent' ? 'border-red-500/30 focus:ring-2 focus:ring-red-500/20' : 'border-zinc-200 dark:border-zinc-800 focus:ring-2 focus:ring-amber-500/20'}`}
                    />
                  </div>
                  <button 
                    onClick={handleAddPartRequest}
                    disabled={!floorWalk.partsNeeded.trim()}
                    className={`px-4 py-2 text-white disabled:opacity-50 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm ${floorWalk.urgency === 'urgent' ? 'bg-red-600 hover:bg-red-700 shadow-red-500/10' : 'bg-zinc-900 dark:bg-zinc-700 hover:bg-black dark:hover:bg-zinc-600'}`}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'eta' && (
            <div className="space-y-4 animate-in slide-in-from-right-2 duration-200">
              <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest px-1">ETA On Finish</label>
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => addHours(1)} className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-bold transition-colors">+1h</button>
                <button onClick={() => addHours(4)} className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-bold transition-colors">+4h</button>
                <button onClick={setTomorrow} className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-black uppercase transition-colors">Tmrw</button>
                <button onClick={() => {
                  try { (etaInputRef.current as any).showPicker(); } catch (e) {}
                }} className="px-3 py-1.5 bg-indigo-500 text-white hover:bg-indigo-600 rounded-lg text-xs font-black uppercase transition-colors ml-auto">Pick</button>
                <button onClick={() => setFloorWalk(p => ({ ...p, eta: '' }))} className="px-3 py-1.5 bg-red-500/10 text-red-600 hover:bg-red-500/20 rounded-lg text-xs font-black uppercase transition-colors">Clear</button>
              </div>
              <div className="relative">
                <Clock className={`w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none ${floorWalk.eta ? 'text-indigo-500' : 'text-zinc-500'}`} />
                <input 
                  type="datetime-local" 
                  ref={etaInputRef}
                  autoFocus={initialTab === 'eta'}
                  value={floorWalk.eta}
                  onChange={e => setFloorWalk(prev => ({ ...prev, eta: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all font-medium"
                />
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-1">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Active Notes</label>
              </div>

              <div className="space-y-2">
                {targetEntity.work_notes && targetEntity.work_notes.length > 0 ? (
                  targetEntity.work_notes.map((note: any) => (
                    <div key={note.id} className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl relative group">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-lg shrink-0">
                          <MessageSquare className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-zinc-900 dark:text-white leading-relaxed">{note.message}</p>
                          <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider mt-1.5 opacity-60">
                            Added by {note.createdBy} • {new Date(note.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-400 italic px-1">No notes recorded yet.</p>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between px-1">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Add New Note</label>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                      <MessageSquare className="w-4 h-4 text-zinc-400" />
                    </div>
                    <input 
                      type="text" 
                      placeholder="Add a status update or instruction..."
                      value={floorWalk.newNote}
                      onChange={e => setFloorWalk(prev => ({ ...prev, newNote: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                      className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                    />
                  </div>
                  <button 
                    onClick={handleAddNote}
                    disabled={!floorWalk.newNote.trim()}
                    className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-50 text-xs font-bold uppercase tracking-wider rounded-xl transition-all h-full"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-sm font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/10"
          >
            <CheckCircle2 className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save & Update'}
          </button>
        </div>
      </div>
    </div>
  );
}
