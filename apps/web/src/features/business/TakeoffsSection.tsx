import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Wrench, Plus, Package, MapPin, Hash, Image as ImageIcon, Trash2, Edit2 } from 'lucide-react';
import { TakeoffDetailsModal } from './TakeoffDetailsModal';
import { toast } from 'sonner';

interface TakeoffsSectionProps {
  tenantId: string;
  jobId: string;
  zones: any[];
}

export function TakeoffsSection({ tenantId, jobId, zones }: TakeoffsSectionProps) {
  const [takeoffs, setTakeoffs] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [takeoffToEdit, setTakeoffToEdit] = useState<any>(null);

  useEffect(() => {
    if (!tenantId || !jobId) return;
    
    const q = query(
      collection(db, `businesses/${tenantId}/jobs/${jobId}/takeoffs`),
      orderBy('createdAt', 'desc')
    );
    
    const unsub = onSnapshot(q, (snap) => {
      setTakeoffs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("Takeoffs listener error:", err);
    });
    
    return () => unsub();
  }, [tenantId, jobId]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the record for ${name}?`)) return;
    
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/takeoffs`, id));
      toast.success("Removed part deleted successfully.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete record.");
    }
  };

  const getConditionColor = (condition: string) => {
    switch(condition) {
      case 'Good': return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20';
      case 'Broken': return 'text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20';
      case 'Missing Parts': return 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20';
      case 'Needs Repair': return 'text-orange-600 bg-orange-50 dark:bg-orange-500/10 dark:text-orange-400 border-orange-200 dark:border-orange-500/20';
      default: return 'text-zinc-600 bg-zinc-50 dark:bg-zinc-500/10 dark:text-zinc-400 border-zinc-200 dark:border-zinc-500/20';
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-xl">
            <Wrench className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Removed Parts (Takeoffs)</h2>
            <p className="text-xs text-zinc-500">Track parts removed from the vehicle during upfitting</p>
          </div>
        </div>
        <button 
          onClick={() => {
            setTakeoffToEdit(null);
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] shadow-lg shadow-amber-500/20 transition-all w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" /> Log Removed Part
        </button>
      </div>

      <div className="space-y-4">
        {takeoffs.length === 0 ? (
          <div className="p-12 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800/50">
            <Package className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-sm font-bold text-zinc-500">No removed parts logged for this job yet.</p>
            <p className="text-xs text-zinc-400 mt-1">Click the button above to start tracking takeoffs.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {takeoffs.map(takeoff => (
              <div key={takeoff.id} className="group relative bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 flex items-center gap-4 transition-colors hover:border-amber-500/30">
                
                {/* Thumbnail Section */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-900 relative border border-zinc-200 dark:border-zinc-800">
                  {takeoff.photoUrls && takeoff.photoUrls.length > 0 ? (
                    <>
                      <img src={takeoff.photoUrls[0]} alt={takeoff.name} className="w-full h-full object-cover" />
                      {takeoff.photoUrls.length > 1 && (
                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded flex items-center gap-1 text-white shadow-sm border border-white/10">
                          <ImageIcon className="w-2.5 h-2.5" />
                          <span className="text-[9px] font-bold">+{takeoff.photoUrls.length - 1}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-300 dark:text-zinc-700 bg-zinc-100 dark:bg-zinc-800/50">
                      <ImageIcon className="w-6 h-6 opacity-50" />
                    </div>
                  )}
                </div>

                {/* Details Section */}
                <div className="flex-1 min-w-0 py-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 mb-1.5">
                    <h3 className="font-bold text-zinc-900 dark:text-white truncate pr-8 sm:pr-0">{takeoff.name}</h3>
                    <span className={`self-start sm:self-auto px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border shrink-0 ${getConditionColor(takeoff.condition)}`}>
                      {takeoff.condition}
                    </span>
                  </div>
                  
                  <div className="space-y-1">
                    {takeoff.serialNumber && (
                      <div className="flex items-center gap-1.5 text-zinc-500 text-[11px]">
                        <Hash className="w-3 h-3 shrink-0" />
                        <span className="font-mono truncate">{takeoff.serialNumber}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-zinc-500 text-[11px]">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate" title={takeoff.location}>{takeoff.location}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons Overlay */}
                <div className="absolute top-2 right-2 flex flex-col sm:flex-row gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => {
                      setTakeoffToEdit(takeoff);
                      setIsModalOpen(true);
                    }}
                    className="p-1.5 bg-white dark:bg-zinc-800 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-zinc-400 hover:text-indigo-600 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-700 transition-all"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => handleDelete(takeoff.id, takeoff.name)}
                    className="p-1.5 bg-white dark:bg-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-zinc-400 hover:text-rose-600 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-700 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      <TakeoffDetailsModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => setIsModalOpen(false)}
        jobId={jobId}
        zones={zones}
        takeoffToEdit={takeoffToEdit}
      />
    </div>
  );
}
