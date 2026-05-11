import { useState, useEffect } from 'react';
import { doc, updateDoc, collection, getDocs, onSnapshot, query, where, limit, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Save, Unlink, AlertCircle, Sparkles, MapPin, Briefcase, X, Car, History, AlertTriangle, ShoppingCart, Timer, Clock, Plus, CheckCircle2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { CustomerSelector, QuickAddCustomerModal } from './CustomerSelectionComponents';
import { StaffSelector } from './StaffSelectionComponents';
import { VinSelector, QuickAddVehicleModal } from './VehicleSelector';
import { StaffLink } from './StaffPerformance';
import { useAuthStore } from '../../lib/auth/store';
import { useTimeclockStore } from '../../lib/store/timeclockStore';
import { useJobClock } from '../timeclock/useJobClock';

interface JobDetailsModalProps {
  tenantId: string;
  job: any;
  onClose: () => void;
  onUpdate: () => void;
}

export function JobDetailsModal({ tenantId, job, onClose, onUpdate }: JobDetailsModalProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { activeSessionId } = useTimeclockStore();
  const { clockIntoJob, clockOutOfJob, isProcessing: isClockingIn } = useJobClock(tenantId);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDatetimeLocal = (dateString?: any) => {
    if (!dateString) return '';
    const date = typeof dateString.toDate === 'function' ? dateString.toDate() : new Date(dateString);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState({
    title: job.title || '',
    jobNumber: job.jobNumber || '',
    status: job.status || 'Open',
    priority: job.priority || 'Medium',
    vehicleId: job.vehicleId || '',
    customerId: job.customerId || null,
    customerName: job.customerName || '',
    notes: job.notes || '',
    scheduledArrivalTime: formatDatetimeLocal(job.scheduledArrivalTime),
    expectedFinishTime: formatDatetimeLocal(job.expectedFinishTime),
    estimatedHours: job.estimatedHours || '',
    assignedStaff: job.assignedStaff || (job.assignedStaffId ? [{ id: job.assignedStaffId, name: job.assignedStaffName || 'Staff' }] : [])
  });
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  useEffect(() => {
    if (zones.length > 0) {
      const cz = zones.find(z => z.currentVehicleVin === formData.vehicleId || z.currentJobId === job.id || z.currentVehicleVins?.includes(formData.vehicleId));
      if (selectedZoneId === null) {
        setSelectedZoneId(cz?.id || '');
      }
    }
  }, [zones, formData.vehicleId, job.id]);

  const [quickAddCustomer, setQuickAddCustomer] = useState<string | null>(null);
  const [quickAddVehicle, setQuickAddVehicle] = useState<string | null>(null);

  const [liveJob, setLiveJob] = useState<any>(job);
  useEffect(() => {
    if (!job?.id || !tenantId) return;
    const unsub = onSnapshot(doc(db, `businesses/${tenantId}/jobs`, job.id), (docSnap) => {
      if (docSnap.exists()) {
        setLiveJob({ id: docSnap.id, ...docSnap.data() });
      }
    });
    return () => unsub();
  }, [job?.id, tenantId]);

  useEffect(() => {
    // Fetch vehicles for linking
    getDocs(collection(db, `businesses/${tenantId}/vehicles`)).then(snap => {
      setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    // Fetch zones for location
    getDocs(collection(db, `businesses/${tenantId}/zones`)).then(snap => {
      setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !activeSessionId) {
      setActiveJobId(null);
      return;
    }
    const unsub = onSnapshot(doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const jobs = data.jobs || [];
        const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
        if (lastJob && !lastJob.end) {
          setActiveJobId(lastJob.id);
        } else {
          setActiveJobId(null);
        }
      } else {
        setActiveJobId(null);
      }
    });
    return () => unsub();
  }, [tenantId, activeSessionId]);

  const [history, setHistory] = useState<any[]>([]);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!job.id || !tenantId) return;
    const qLogs = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('jobIds', 'array-contains', job.id)
    );
    const unsubLogs = onSnapshot(qLogs, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => {
        const getTs = (item: any) => {
          const val = item.clockIn?.timestamp;
          if (val?.seconds) return val.seconds * 1000;
          return new Date(val || 0).getTime();
        };
        return getTs(b) - getTs(a);
      });
      setTimeLogs(data);
    });
    return () => unsubLogs();
  }, [job.id, tenantId]);

  const totalLoggedMs = timeLogs.reduce((acc, session) => {
    const jobSegments = (session.jobs || []).filter((j: any) => j.id === job.id);
    const segMs = jobSegments.reduce((segAcc: number, seg: any) => {
      const start = seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime();
      const end = seg.end ? (seg.end.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime()) : now;
      return segAcc + Math.max(0, end - start);
    }, 0);
    return acc + segMs;
  }, 0);

  const totalLoggedHours = totalLoggedMs / 3600000;
  const loggedDisplay = `${Math.floor(totalLoggedMs / 3600000)}h ${Math.floor((totalLoggedMs % 3600000) / 60000)}m`;
  const estimatedHoursVal = job.estimatedHours ? parseFloat(job.estimatedHours) : 0;
  const progressPercent = estimatedHoursVal > 0 ? Math.min(100, Math.round((totalLoggedHours / estimatedHoursVal) * 100)) : 0;

  useEffect(() => {
    if (!job.id || !tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/zone_assignments`),
      where('jobId', '==', job.id),
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
      setHistory(data.slice(0, 20));
    });
    return () => unsub();
  }, [job.id, tenantId]);

  const [parts, setParts] = useState<any[]>([]);
  const [newPartName, setNewPartName] = useState('');
  const [newPartQty, setNewPartQty] = useState('1');
  const [isAddingPart, setIsAddingPart] = useState(false);

  const handleAddPart = async () => {
    if (!newPartName.trim()) return;
    setIsAddingPart(true);
    try {
      await addDoc(collection(db, `businesses/${tenantId}/parts_requests`), {
        jobId: job.id,
        partName: newPartName.trim(),
        quantity: parseInt(newPartQty) || 1,
        status: 'pending',
        requestedBy: user?.displayName || user?.email || 'Staff',
        requestedById: user?.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setNewPartName('');
      setNewPartQty('1');
      toast.success('Part requested');
    } catch (err) {
      console.error(err);
      toast.error('Failed to request part');
    } finally {
      setIsAddingPart(false);
    }
  };

  useEffect(() => {
    if (!job.id || !tenantId) return;
    const qParts = query(
      collection(db, `businesses/${tenantId}/parts_requests`),
      where('jobId', '==', job.id)
    );
    const unsubParts = onSnapshot(qParts, snap => {
      setParts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubParts();
  }, [job.id, tenantId]);

  const legacyBlocker = liveJob.blocker ? [{
    id: 'legacy',
    message: liveJob.blocker,
    status: 'active',
    createdAt: new Date().toISOString(),
    createdBy: 'Legacy'
  }] : [];
  
  const allBlockers = (liveJob.blockers || legacyBlocker);
  const [newBlockerMsg, setNewBlockerMsg] = useState('');
  const [isAddingBlocker, setIsAddingBlocker] = useState(false);

  const handleAddBlocker = async () => {
    if (!newBlockerMsg.trim()) return;
    setIsAddingBlocker(true);
    try {
      const newBlocker = {
        id: crypto.randomUUID(),
        message: newBlockerMsg.trim(),
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: user?.displayName || user?.email || 'Staff',
        createdById: user?.uid
      };
      
      const updatedBlockers = [...(liveJob.blockers || []), newBlocker];
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, job.id), {
        blockers: updatedBlockers,
        status: 'Blocked',
        updatedAt: new Date()
      });
      setFormData(prev => ({ ...prev, status: 'Blocked' }));
      setNewBlockerMsg('');
      toast.success('Blocker added');
      // Trigger a re-fetch of the job data to get the updated blockers
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error(err);
      toast.error('Failed to add blocker');
    } finally {
      setIsAddingBlocker(false);
    }
  };

  const handleClearBlocker = async (blockerId: string) => {
    try {
      const updatedBlockers = (liveJob.blockers || []).map((b: any) => 
        b.id === blockerId ? {
          ...b,
          status: 'cleared',
          clearedAt: new Date().toISOString(),
          clearedBy: user?.displayName || user?.email || 'Staff',
          clearedById: user?.uid
        } : b
      );
      
      const hasActive = updatedBlockers.some((b: any) => b.status === 'active');
      const newStatus = !hasActive && formData.status === 'Blocked' ? 'Open' : formData.status;

      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, job.id), {
        blockers: updatedBlockers,
        status: newStatus,
        updatedAt: new Date()
      });
      if (newStatus !== formData.status) {
        setFormData(prev => ({ ...prev, status: newStatus }));
      }
      toast.success('Blocker cleared');
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error(err);
      toast.error('Failed to clear blocker');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { expectedFinishTime, scheduledArrivalTime, assignedStaff, ...rest } = formData;
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, job.id), {
        ...rest,
        assignedStaff,
        assignedStaffIds: assignedStaff.map((s: any) => s.id),
        assignedStaffId: assignedStaff.length > 0 ? assignedStaff[0].id : null,
        assignedStaffName: assignedStaff.length > 0 ? assignedStaff[0].name : null,
        expectedFinishTime: expectedFinishTime ? new Date(expectedFinishTime).toISOString() : null,
        scheduledArrivalTime: scheduledArrivalTime ? new Date(scheduledArrivalTime).toISOString() : null,
        estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : null,
        updatedAt: new Date()
      });

      // Zone Transfer Logic
      const currentZone = zones.find(z => z.currentVehicleVin === formData.vehicleId || z.currentJobId === job.id || z.currentVehicleVins?.includes(formData.vehicleId));
      const currentZoneId = currentZone?.id || '';
      
      if (selectedZoneId !== null && selectedZoneId !== currentZoneId) {
        const trimmedVin = formData.vehicleId?.trim().toUpperCase();
        
        // 1. Clear from all old zones
        for (const oz of zones) {
           let needsClear = false;
           if (trimmedVin && oz.currentVehicleVin === trimmedVin) needsClear = true;
           else if (job.id && oz.currentJobId === job.id) needsClear = true;
           else if (trimmedVin && oz.currentVehicleVins?.includes(trimmedVin)) needsClear = true;

           if (needsClear) {
              await updateDoc(doc(db, `businesses/${tenantId}/zones`, oz.id), { 
                currentVehicleVin: null, 
                currentJobId: null,
                currentVehicleVins: (oz.currentVehicleVins || []).filter((v: string) => v !== trimmedVin)
              });
           }
        }
        
        // 2. Assign to new zone
        if (selectedZoneId) {
           const targetZone = zones.find(z => z.id === selectedZoneId);
           if (targetZone) {
             if (targetZone.allowMultiple) {
                const newVins = [...(targetZone.currentVehicleVins || [])];
                if (trimmedVin && !newVins.includes(trimmedVin)) newVins.push(trimmedVin);
                await updateDoc(doc(db, `businesses/${tenantId}/zones`, selectedZoneId), {
                  currentVehicleVins: newVins,
                  lastAssignedAt: new Date()
                });
             } else {
                await updateDoc(doc(db, `businesses/${tenantId}/zones`, selectedZoneId), {
                  currentVehicleVin: trimmedVin || null,
                  currentJobId: job.id,
                  lastAssignedAt: new Date()
                });
             }
             
             await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
                zoneId: selectedZoneId,
                zoneName: targetZone.name || 'Unknown',
                vin: trimmedVin || null,
                jobId: job.id,
                action: 'assigned',
                assignedAt: new Date(),
                assignedBy: user?.uid || 'system',
                assignedByName: user?.displayName || user?.email || 'Staff'
             });
           }
        } else if (currentZoneId) {
           // Log clear event
           await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
              zoneId: currentZoneId,
              zoneName: currentZone?.name || 'Unknown',
              vin: trimmedVin || null,
              jobId: job.id,
              action: 'cleared',
              assignedAt: new Date(),
              assignedBy: user?.uid || 'system',
              assignedByName: user?.displayName || user?.email || 'Staff'
           });
        }
      }

      toast.success('Job updated successfully');
      onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update job');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
        <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
          
          {quickAddCustomer && (
            <QuickAddCustomerModal
              tenantId={tenantId}
              initialName={quickAddCustomer}
              onClose={() => setQuickAddCustomer(null)}
              onAssign={(id, name) => {
                setFormData(prev => ({ ...prev, customerId: id, customerName: name }));
                setQuickAddCustomer(null);
              }}
            />
          )}

          {quickAddVehicle && (
            <QuickAddVehicleModal
              tenantId={tenantId}
              initialVin={quickAddVehicle}
              onClose={() => setQuickAddVehicle(null)}
              onAssign={(vin) => {
                setFormData(prev => ({ ...prev, vehicleId: vin }));
                setQuickAddVehicle(null);
                // Also trigger a refresh of vehicles to ensure it's immediately available in the dropdown
                import('firebase/firestore').then(({ getDocs, collection }) => {
                  getDocs(collection(db, `businesses/${tenantId}/vehicles`)).then(snap => {
                    setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                  });
                });
              }}
            />
          )}

          {/* Header */}
          <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/20">
                <Briefcase className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{job.title}</h3>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter",
                    job.source === 'QuickBooks' ? "bg-blue-600 text-white" : "bg-zinc-900 text-white dark:bg-white dark:text-black"
                  )}>
                    {job.source || 'Native'}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 font-mono">ID: {job.id}</p>
              </div>
            </div>
            {(() => {
              const currentZone = zones.find(z => z.currentVehicleVin === job.vehicleId || z.currentJobId === job.id || z.currentVehicleVins?.includes(job.vehicleId));
              if (!currentZone) return null;
              return (
                <button 
                  onClick={() => navigate(`/business/${tenantId}/zones?zone=${currentZone.id}`)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl animate-in slide-in-from-right-4 hover:bg-emerald-500/20 hover:scale-105 transition-all"
                >
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-black text-emerald-600 uppercase tracking-wider">{currentZone.name}</span>
                </button>
              );
            })()}
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
            
            {/* Legacy Data Alert */}
            {formData.customerName && !formData.customerId && (
              <div className="p-4 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl flex items-start gap-4">
                <div className="p-2 bg-amber-100 dark:bg-amber-500/20 rounded-lg shrink-0">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Unlinked Customer Name Found</p>
                  <p className="text-xs text-amber-700/70 dark:text-amber-400/60 mt-1">
                    " {formData.customerName} " is currently stored as plain text. Convert it to a formal customer record to manage it in the directory.
                  </p>
                  <button 
                    onClick={() => setQuickAddCustomer(formData.customerName)}
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all shadow-sm shadow-amber-500/20 active:scale-95"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Convert to Customer Record
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column - Core Info */}
              <div className="space-y-6">
                <section>
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Job Details</label>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-1">
                        <label className="block text-xs font-bold text-zinc-500 mb-1.5">Job #</label>
                        <input 
                          type="text" 
                          value={formData.jobNumber} 
                          onChange={e => setFormData(prev => ({ ...prev, jobNumber: e.target.value }))}
                          placeholder="e.g. 10254"
                          className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-zinc-500 mb-1.5">Job Title</label>
                        <input 
                          type="text" 
                          value={formData.title} 
                          onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                          className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 mb-1.5">Status</label>
                        <select 
                          value={formData.status} 
                          onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                          className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                        >
                          <option value="Open">Open</option>
                          <option value="Active">Active</option>
                          <option value="Blocked">Blocked</option>
                          <option value="On Hold">On Hold</option>
                          <option value="Ready for QA">Ready for QA</option>
                          <option value="Ready for Customer">Ready for Customer</option>
                          <option value="Completed">Completed</option>
                          <option value="Closed">Closed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 mb-1.5">Priority</label>
                        <select 
                          value={formData.priority} 
                          onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                          className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Urgent">Urgent</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1.5">Assigned Staff</label>
                      <StaffSelector 
                        selectedStaff={formData.assignedStaff} 
                        onAssign={staff => setFormData(prev => ({ ...prev, assignedStaff: staff }))} 
                        tenantId={tenantId} 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 mb-1.5">Scheduled Arrival</label>
                        <input 
                          type="datetime-local" 
                          value={formData.scheduledArrivalTime} 
                          onClick={(e) => {
                            try { e.currentTarget.showPicker(); } catch (err) {}
                          }}
                          onChange={e => setFormData(prev => ({ ...prev, scheduledArrivalTime: e.target.value }))}
                          className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-sm cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 mb-1.5">Expected Finish Time</label>
                        <input 
                          type="datetime-local" 
                          value={formData.expectedFinishTime} 
                          onClick={(e) => {
                            try { e.currentTarget.showPicker(); } catch (err) {}
                          }}
                          onChange={e => setFormData(prev => ({ ...prev, expectedFinishTime: e.target.value }))}
                          className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-sm cursor-pointer"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-zinc-500">Est. Time (Hours)</label>
                        <div className="flex items-center gap-2">
                          <Timer className="w-3 h-3 text-indigo-500" />
                          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                            Logged: {loggedDisplay} {estimatedHoursVal > 0 && `/ ${estimatedHoursVal}h`}
                          </span>
                        </div>
                      </div>
                      <input 
                        type="number"
                        step="0.5"
                        min="0"
                        value={formData.estimatedHours || ''} 
                        onChange={e => setFormData(prev => ({ ...prev, estimatedHours: e.target.value }))}
                        placeholder="e.g. 2.5"
                        className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-sm"
                      />
                      {estimatedHoursVal > 0 && (
                        <div className="mt-2 w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full transition-all duration-500", progressPercent >= 100 ? "bg-rose-500" : progressPercent > 75 ? "bg-amber-500" : "bg-indigo-500")} 
                            style={{ width: `${progressPercent}%` }} 
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section>
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Customer Information</label>
                  <CustomerSelector 
                    tenantId={tenantId}
                    customerId={formData.customerId}
                    onAssign={(id, name) => setFormData(prev => ({ ...prev, customerId: id, customerName: name }))}
                    onClear={() => setFormData(prev => ({ ...prev, customerId: null, customerName: '' }))}
                    onCreateNewRequest={(name) => setQuickAddCustomer(name || '')}
                  />
                </section>
              </div>

              {/* Right Column - Vehicle Link */}
              <div className="space-y-6">
                <section className="bg-indigo-500/5 dark:bg-indigo-500/10 p-6 rounded-3xl border border-indigo-500/20">
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">Linked Vehicle</label>
                    <Car className="w-4 h-4 text-indigo-500" />
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1.5 italic">Select Vehicle to Link (by VIN)</label>
                      <VinSelector
                        vin={formData.vehicleId}
                        vehicles={vehicles}
                        onAssign={(vin) => setFormData(prev => ({ ...prev, vehicleId: vin }))}
                        onClear={() => setFormData(prev => ({ ...prev, vehicleId: '' }))}
                        onQuickAddRequest={(vin) => setQuickAddVehicle(vin)}
                      />
                    </div>

                    {formData.vehicleId ? (
                      <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 shadow-sm animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                            <Car className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white">
                              {vehicles.find(v => v.vin === formData.vehicleId)?.year || ''} {vehicles.find(v => v.vin === formData.vehicleId)?.make || 'Vehicle'}
                            </p>
                            <p className="text-[10px] font-mono text-zinc-500">{formData.vehicleId}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 border-2 border-dashed border-indigo-200 dark:border-indigo-500/20 rounded-2xl flex flex-col items-center justify-center text-center opacity-50">
                        <Unlink className="w-8 h-8 text-indigo-300 mb-2" />
                        <p className="text-xs font-medium text-indigo-400">No vehicle association</p>
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <select 
                      value={selectedZoneId || ''} 
                      onChange={e => setSelectedZoneId(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-bold text-zinc-900 dark:text-white appearance-none cursor-pointer"
                    >
                      <option value="">Unassigned (Off-site)</option>
                      {zones.map(z => (
                        <option key={z.id} value={z.id}>{z.name} ({z.type === 'bay' ? 'Bay' : 'Parking'})</option>
                      ))}
                    </select>
                  </div>
                </section>

                <section>
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Internal Notes</label>
                  <textarea 
                    rows={4}
                    value={formData.notes} 
                    onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Private job notes for shop floor..."
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm resize-none"
                  />
                </section>
              </div>
            </div>

            {/* History & Status Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-zinc-100 dark:border-zinc-800">
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <ShoppingCart className="w-4 h-4 text-emerald-500" />
                  <label className="block text-[10px] font-black text-emerald-500 uppercase tracking-widest">Parts & Requests</label>
                </div>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newPartName}
                    onChange={e => setNewPartName(e.target.value)}
                    placeholder="Part name..."
                    className="flex-1 px-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleAddPart()}
                  />
                  <input
                    type="number"
                    min="1"
                    value={newPartQty}
                    onChange={e => setNewPartQty(e.target.value)}
                    className="w-16 px-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-center"
                    onKeyDown={e => e.key === 'Enter' && handleAddPart()}
                  />
                  <button
                    onClick={handleAddPart}
                    disabled={isAddingPart || !newPartName.trim()}
                    className="p-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-3">
                  {parts.length === 0 ? (
                    <p className="text-sm text-zinc-500 italic p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center">No parts requested.</p>
                  ) : (
                    parts.map(part => (
                      <div key={part.id} className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{part.partName}</p>
                          <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0",
                            part.status === 'received' ? "bg-emerald-500/10 text-emerald-600" :
                            part.status === 'ordered' ? "bg-blue-500/10 text-blue-600" :
                            "bg-amber-500/10 text-amber-600"
                          )}>
                            {part.status || 'Pending'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <p className="text-xs text-zinc-500">Qty: {part.quantity || 1}</p>
                          <p className="text-[10px] text-zinc-400 font-medium">Req by <StaffLink name={part.requestedBy || 'Staff'} tenantId={tenantId} /></p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <label className="block text-[10px] font-black text-amber-500 uppercase tracking-widest">Blocker History</label>
                </div>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newBlockerMsg}
                    onChange={e => setNewBlockerMsg(e.target.value)}
                    placeholder="What is blocking this job?"
                    className="flex-1 px-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleAddBlocker()}
                  />
                  <button
                    onClick={handleAddBlocker}
                    disabled={isAddingBlocker || !newBlockerMsg.trim()}
                    className="px-3 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    Add Blocker
                  </button>
                </div>
                <div className="space-y-3">
                  {allBlockers.length === 0 ? (
                    <p className="text-sm text-zinc-500 italic p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center">No blockers recorded for this job.</p>
                  ) : (
                    [...allBlockers].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((blocker: any) => (
                      <div key={blocker.id} className={`p-3 border rounded-xl ${blocker.status === 'active' ? 'bg-red-500/10 border-red-500/20' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 opacity-75'}`}>
                        <div className="flex items-center gap-3">
                          <AlertTriangle className={`w-4 h-4 shrink-0 ${blocker.status === 'active' ? 'text-red-500' : 'text-zinc-400'}`} />
                          <div className="flex-1">
                            <p className={`text-sm font-bold ${blocker.status === 'active' ? 'text-red-600 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-400 line-through'}`}>{blocker.message}</p>
                            <p className="text-[10px] text-zinc-500 font-medium mt-1">
                              Added by <StaffLink name={blocker.createdBy} tenantId={tenantId} /> on {new Date(blocker.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </p>
                            {blocker.status === 'cleared' && blocker.clearedAt && (
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                                Cleared by <StaffLink name={blocker.clearedBy} tenantId={tenantId} /> on {new Date(blocker.clearedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                          {blocker.status === 'active' ? (
                            <button
                              onClick={() => handleClearBlocker(blocker.id)}
                              className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 transition-colors flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Clear
                            </button>
                          ) : (
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-500">
                              {blocker.status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <History className="w-4 h-4 text-indigo-500" />
                  <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest">Movement History</label>
                </div>
                <div className="space-y-3">
                  {history.length === 0 ? (
                    <p className="text-sm text-zinc-500 italic p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center">No movement history available.</p>
                  ) : (
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
                              <span className="font-bold text-xs text-zinc-900 dark:text-white truncate">{item.zoneName || 'Unknown Bay'}</span>
                            </div>
                            
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[8px] font-black uppercase text-zinc-500">
                                {(author)[0]}
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
                  )}
                </div>
              </section>

              <section>
                {(() => {
                  return (
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <label className="block text-[10px] font-black text-blue-500 uppercase tracking-widest">Time Clock Logs</label>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                          {loggedDisplay} {estimatedHoursVal > 0 && `/ ${estimatedHoursVal}h`}
                        </div>
                        {estimatedHoursVal > 0 && (
                          <div className="w-16 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className={cn("h-full rounded-full", progressPercent >= 100 ? "bg-rose-500" : progressPercent > 75 ? "bg-amber-500" : "bg-blue-500")} 
                              style={{ width: `${progressPercent}%` }} 
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
                <div className="space-y-3">
                  {timeLogs.length === 0 ? (
                    <p className="text-sm text-zinc-500 italic p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center">No time logged against this job.</p>
                  ) : (
                    (() => {
                      const timeEvents: any[] = [];
                      timeLogs.forEach(session => {
                        const jobSegments = (session.jobs || []).filter((j: any) => j.id === job.id);
                        jobSegments.forEach((seg: any) => {
                          if (seg.end) {
                            timeEvents.push({
                              id: `${session.id}-out-${seg.start?.seconds || seg.start}`,
                              type: 'out',
                              userName: session.userName,
                              timestamp: seg.end
                            });
                          }
                          timeEvents.push({
                            id: `${session.id}-in-${seg.start?.seconds || seg.start}`,
                            type: 'in',
                            userName: session.userName,
                            timestamp: seg.start
                          });
                        });
                      });

                      timeEvents.sort((a, b) => {
                        const getTs = (ts: any) => ts?.toDate ? ts.toDate().getTime() : new Date(ts || 0).getTime();
                        return getTs(b.timestamp) - getTs(a.timestamp);
                      });

                      if (timeEvents.length === 0) {
                        return <p className="text-sm text-zinc-500 italic p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center">No time logged against this job.</p>;
                      }

                      return timeEvents.map(event => {
                        
                        return (
                          <div key={event.id} className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between text-sm group">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                                  event.type === 'in' 
                                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-500' 
                                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-500'
                                }`}>
                                  {event.type === 'in' ? 'Clocked In' : 'Clocked Out'}
                                </span>
                                <span className="font-bold text-xs text-zinc-900 dark:text-white truncate">{event.userName || 'Staff Member'}</span>
                              </div>
                              <p className="text-[10px] text-zinc-400 font-medium tracking-wide italic ml-1">
                                recorded time entry
                              </p>
                            </div>
                            <div className="text-right shrink-0 ml-4">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter leading-none block mb-1">
                                {event.timestamp ? (
                                  event.timestamp.toDate ? event.timestamp.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : new Date(event.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                                ) : '...'}
                              </span>
                              <span className="text-[8px] text-zinc-500 font-black uppercase tracking-widest opacity-60">
                                {event.timestamp ? (
                                  event.timestamp.toDate ? event.timestamp.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' }) : new Date(event.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
                                ) : '--'}
                              </span>
                            </div>
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              </section>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
            <div className="flex flex-col">
              <p className="text-[10px] text-zinc-400 font-medium">Last updated: {job.updatedAt?.seconds ? new Date(job.updatedAt.seconds * 1000).toLocaleString() : 'Recently'}</p>
              {job.createdByName && (
                <p className="text-[10px] text-zinc-400 font-medium mt-0.5">
                  Created by <StaffLink name={job.createdByName} tenantId={tenantId} />
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {job.assignedStaffIds?.includes(user?.uid) && (
                activeJobId === job.id ? (
                  <button 
                    onClick={() => clockOutOfJob()}
                    disabled={isClockingIn}
                    className="flex items-center gap-2 px-6 py-2.5 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  >
                    <Timer className="w-4 h-4" />
                    Clock Out
                  </button>
                ) : (
                  <button 
                    onClick={() => clockIntoJob(job.id, job.title)}
                    disabled={isClockingIn}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  >
                    <Timer className="w-4 h-4" />
                    Clock In
                  </button>
                )
              )}
              <button 
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Job Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {quickAddCustomer !== null && (
        <QuickAddCustomerModal 
          tenantId={tenantId}
          initialName={quickAddCustomer}
          onClose={() => setQuickAddCustomer(null)}
          onSuccess={(id, name) => {
            setFormData(prev => ({ ...prev, customerId: id, customerName: name }));
            setQuickAddCustomer(null);
          }}
        />
      )}
    </>
  );
}

