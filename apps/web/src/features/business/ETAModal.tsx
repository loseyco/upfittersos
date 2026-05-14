import { useState } from 'react';
import { X, Clock, Calendar } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';

interface ETAModalProps {
  tenantId: string;
  jobId: string;
  currentETA?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function ETAModal({ 
  tenantId, jobId, currentETA, onClose, onSuccess 
}: ETAModalProps) {
  const formatDatetimeLocal = (dateString?: any) => {
    if (!dateString) return '';
    const date = typeof dateString.toDate === 'function' ? dateString.toDate() : new Date(dateString);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  };

  const [eta, setEta] = useState(formatDatetimeLocal(currentETA));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eta) {
      toast.error('Please select a time');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        expectedFinishTime: new Date(eta).toISOString(),
        updatedAt: new Date()
      });
      toast.success('ETA updated successfully');
      onSuccess();
    } catch (err) {
      console.error('Error updating ETA:', err);
      toast.error('Failed to update ETA');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-indigo-500/20 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-indigo-500/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl">
              <Clock className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Update Job ETA</h2>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">
                Estimated Completion Time
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Target Completion Time</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 pointer-events-none" />
              <input 
                type="datetime-local" 
                required
                value={eta}
                onChange={(e) => setEta(e.target.value)}
                onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) {} }}
                className="w-full pl-12 pr-4 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-base font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all cursor-pointer"
              />
            </div>
          </div>

          <div className="pt-2">
            <button 
              type="submit" 
              disabled={isSubmitting || !eta}
              className="w-full px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 flex justify-center items-center gap-2"
            >
              {isSubmitting ? 'Updating...' : 'Update ETA'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
