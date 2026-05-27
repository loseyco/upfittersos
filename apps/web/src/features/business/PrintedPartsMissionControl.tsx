import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { useQuery } from '@tanstack/react-query';
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  serverTimestamp, getDocs, updateDoc, doc, deleteDoc 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Printer, Plus, Search, Package, CheckCircle, 
  Trash2, Clock, Play, ArrowRight, User,
  Maximize, Minimize
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useWakeLock } from '../../hooks/useWakeLock';
import { cn } from '../../lib/utils';

type PrintStatus = 'in_queue' | 'printing' | 'ready_for_inventory' | 'completed';

interface PrintJob {
  id: string;
  itemId: string;
  itemName: string;
  sku?: string;
  quantity: number;
  status: PrintStatus;
  requestedBy: string;
  requestedByName: string;
  notes?: string;
  createdAt: any;
  statusUpdatedAt?: any;
}

export function PrintedPartsMissionControl() {
  const { tenantId, user, permissions, isSuperAdmin } = useAuthStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useWakeLock(isFullscreen);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        toast.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      toast.success("Optimized Mode Active", {
        description: "Keep Screen Awake is now active for this board.",
        duration: 5000,
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
  const [jobs, setJobs] = useState<PrintJob[]>([]);

  const canManage = isSuperAdmin || permissions['printed_parts.manage'] || permissions['parts.manage'];

  useEffect(() => {
    if (!tenantId || tenantId === 'GLOBAL') return;
    const q = query(
      collection(db, `businesses/${tenantId}/printed_parts_jobs`),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const data: PrintJob[] = [];
      snap.forEach(docSnap => {
        data.push({ id: docSnap.id, ...docSnap.data() } as PrintJob);
      });
      setJobs(data);
      setLastUpdated(new Date());
    });

    return () => unsubscribe();
  }, [tenantId]);

  const handleUpdateStatus = async (jobId: string, newStatus: PrintStatus) => {
    if (!tenantId) return;
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/printed_parts_jobs`, jobId), {
        status: newStatus,
        statusUpdatedAt: serverTimestamp()
      });
      toast.success(`Moved to ${newStatus.replace(/_/g, ' ')}`);
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update status');
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!tenantId) return;
    if (!window.confirm('Are you sure you want to delete this print job?')) return;
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/printed_parts_jobs`, jobId));
      toast.success('Print job removed');
    } catch (err) {
      console.error('Error deleting job:', err);
      toast.error('Failed to remove print job');
    }
  };

  const columns: { id: PrintStatus; label: string; icon: React.ElementType; color: string }[] = [
    { id: 'in_queue', label: 'In Queue', icon: Clock, color: 'amber' },
    { id: 'printing', label: 'Printing', icon: Play, color: 'blue' },
    { id: 'ready_for_inventory', label: 'Ready for Inventory', icon: Package, color: 'indigo' },
    { id: 'completed', label: 'Completed', icon: CheckCircle, color: 'emerald' }
  ];

  const getStatusColorClass = (color: string) => {
    switch(color) {
      case 'amber': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'blue': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'indigo': return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20';
      case 'emerald': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      default: return 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20';
    }
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "animate-in fade-in duration-500",
        isFullscreen ? "p-2 space-y-2 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar" : "space-y-8"
      )}
    >
      <Toaster position="top-right" richColors theme="system" closeButton />
      <div className={cn(
        "flex flex-col sm:flex-row items-center justify-end gap-3 w-full relative z-10",
        !isFullscreen && "sm:-mt-20"
      )}>
        {isFullscreen && (
          <div className="mr-auto flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Printed Parts Control</span>
            <span className="text-[10px] font-bold text-zinc-500">• Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        )}
        <button 
          onClick={toggleFullscreen}
          className="hidden sm:flex w-full sm:w-auto px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-lg transition-all items-center justify-center gap-2"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
        </button>
      </div>
      <div className={cn(
        "flex flex-col md:flex-row md:items-center justify-between",
        isFullscreen ? "gap-2" : "gap-4"
      )}>
        <div>
          <h1 className={cn(
            "font-bold text-zinc-900 dark:text-white flex items-center gap-3",
            isFullscreen ? "text-lg" : "text-2xl"
          )}>
            <div className={cn(
              "bg-indigo-500/10 rounded-xl",
              isFullscreen ? "p-1" : "p-2"
            )}>
              <Printer className={cn(
                "text-indigo-500",
                isFullscreen ? "w-4 h-4" : "w-6 h-6"
              )} />
            </div>
            Print Farm Mission Control
          </h1>
          {!isFullscreen && <p className="text-zinc-500 text-sm mt-1">Manage 3D printed parts production queue.</p>}
        </div>
        {canManage && (
          <button 
            onClick={() => setIsQueueModalOpen(true)}
            className="w-full md:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            QUEUE NEW PRINT
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {columns.map(column => {
          const colJobs = jobs.filter(j => j.status === column.id);
          const ColIcon = column.icon;
          
          return (
            <div key={column.id} className="flex flex-col gap-4">
              <div className={`flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800`}>
                <ColIcon className={`w-4 h-4 text-${column.color}-500`} />
                <h3 className="font-bold text-zinc-900 dark:text-white text-sm uppercase tracking-wider">{column.label}</h3>
                <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-bold ${getStatusColorClass(column.color)}`}>
                  {colJobs.length}
                </span>
              </div>
              
              <div className="flex-1 space-y-3 min-h-[200px]">
                {colJobs.map(job => (
                  <div key={job.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm hover:border-indigo-500/50 transition-colors flex flex-col gap-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4 className="font-bold text-zinc-900 dark:text-white leading-tight">{job.itemName}</h4>
                        {job.sku && <p className="text-xs font-mono text-zinc-500 mt-0.5">{job.sku}</p>}
                      </div>
                      <div className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs font-black text-zinc-600 dark:text-zinc-400">
                        x{job.quantity}
                      </div>
                    </div>
                    
                    {job.notes && (
                      <div className="text-xs text-zinc-500 italic bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
                        "{job.notes}"
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span className="truncate max-w-[100px]">{job.requestedByName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {job.createdAt?.toDate ? job.createdAt.toDate().toLocaleDateString() : 'Just now'}
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1 pt-1">
                        {column.id === 'in_queue' && (
                          <button onClick={() => handleUpdateStatus(job.id, 'printing')} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-500/10 text-blue-600 rounded-lg text-[10px] font-bold hover:bg-blue-500/20">
                            START PRINT
                          </button>
                        )}
                        {column.id === 'printing' && (
                          <button onClick={() => handleUpdateStatus(job.id, 'ready_for_inventory')} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-indigo-500/10 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-500/20">
                            FINISH PRINT
                          </button>
                        )}
                        {column.id === 'ready_for_inventory' && (
                          <button onClick={() => handleUpdateStatus(job.id, 'completed')} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg text-[10px] font-bold hover:bg-emerald-500/20">
                            MARK INVENTORIED
                          </button>
                        )}
                        <button onClick={() => handleDeleteJob(job.id)} className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                
                {colJobs.length === 0 && (
                  <div className="h-24 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-center text-zinc-400 text-sm">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <QueuePrintModal 
        isOpen={isQueueModalOpen} 
        onClose={() => setIsQueueModalOpen(false)} 
        tenantId={tenantId}
        user={user}
      />
    </div>
  );
}

function QueuePrintModal({ isOpen, onClose, tenantId, user }: { isOpen: boolean, onClose: () => void, tenantId: string | null, user: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: inventoryItems, isLoading } = useQuery({
    queryKey: ['parts-inventory-search', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const q = query(collection(db, `businesses/${tenantId}/inventory_items`));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: isOpen && !!tenantId
  });

  const filteredItems = inventoryItems?.filter((item: any) => 
    item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 10) || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !selectedItem) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, `businesses/${tenantId}/printed_parts_jobs`), {
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        sku: selectedItem.sku || null,
        quantity,
        notes: notes.trim() || null,
        status: 'in_queue',
        requestedBy: user?.uid,
        requestedByName: user?.displayName || user?.email?.split('@')[0] || 'Unknown',
        createdAt: serverTimestamp(),
      });
      toast.success('Print job added to queue');
      onClose();
      setSelectedItem(null);
      setSearchTerm('');
      setQuantity(1);
      setNotes('');
    } catch (err) {
      console.error('Error queuing print:', err);
      toast.error('Failed to queue print job');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-zinc-950/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50">
          <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
            <Printer className="w-5 h-5 text-indigo-500" />
            Queue New Print
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
            <Trash2 className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {!selectedItem ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Search Inventory</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-zinc-400" />
                  </div>
                  <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or SKU..."
                    className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    autoFocus
                  />
                </div>
              </div>

              <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                {isLoading ? (
                  <div className="p-4 text-center text-sm text-zinc-500">Loading inventory...</div>
                ) : filteredItems.length === 0 ? (
                  <div className="p-4 text-center text-sm text-zinc-500">No items found.</div>
                ) : (
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {filteredItems.map((item: any) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="w-full text-left px-4 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors flex justify-between items-center group"
                      >
                        <div>
                          <p className="font-bold text-sm text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{item.name}</p>
                          {item.sku && <p className="text-xs font-mono text-zinc-500">{item.sku}</p>}
                        </div>
                        <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-indigo-500 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">Selected Item</p>
                  <p className="font-bold text-zinc-900 dark:text-white">{selectedItem.name}</p>
                  {selectedItem.sku && <p className="text-xs font-mono text-zinc-500">{selectedItem.sku}</p>}
                </div>
                <button type="button" onClick={() => setSelectedItem(null)} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                  Change
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Quantity</label>
                <input 
                  type="number" 
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Notes (Optional)</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Material requirements, urgent requests..."
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none h-24"
                />
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Queuing...' : 'Add to Queue'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
