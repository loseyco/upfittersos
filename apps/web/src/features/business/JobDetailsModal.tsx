import { useState, useEffect } from 'react';
import { doc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Save, Unlink, AlertCircle, Sparkles, MapPin, Briefcase, X, Car
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { CustomerSelector, QuickAddCustomerModal } from './CustomerSelectionComponents';
import { StaffLink } from './StaffPerformance';

interface JobDetailsModalProps {
  tenantId: string;
  job: any;
  onClose: () => void;
  onUpdate: () => void;
}

export function JobDetailsModal({ tenantId, job, onClose, onUpdate }: JobDetailsModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: job.title || '',
    jobNumber: job.jobNumber || '',
    status: job.status || 'Open',
    priority: job.priority || 'Medium',
    vehicleId: job.vehicleId || '',
    customerId: job.customerId || null,
    customerName: job.customerName || '',
    notes: job.notes || ''
  });
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [quickAddCustomer, setQuickAddCustomer] = useState<string | null>(null);

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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, job.id), {
        ...formData,
        updatedAt: new Date()
      });
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
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl animate-in slide-in-from-right-4">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-black text-emerald-600 uppercase tracking-wider">{currentZone.name}</span>
                </div>
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
                          <option value="On Hold">On Hold</option>
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
                      <select 
                        value={formData.vehicleId} 
                        onChange={e => setFormData(prev => ({ ...prev, vehicleId: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-500/30 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono text-sm"
                      >
                        <option value="">-- No Vehicle Linked --</option>
                        {vehicles.map(v => (
                          <option key={v.id} value={v.vin}>
                            {v.vin} ({v.year} {v.make} {v.model})
                          </option>
                        ))}
                      </select>
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

