import { useState } from 'react';
import { X, Wrench, Package, Trash2 } from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';

interface PartsRequestModalProps {
  tenantId: string;
  jobId: string;
  jobTitle: string;
  taskId?: string;
  taskTitle?: string;
  user: any;
  part?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function PartsRequestModal({ 
  tenantId, jobId, jobTitle, taskId, taskTitle, user, part, onClose, onSuccess 
}: PartsRequestModalProps) {
  const [partName, setPartName] = useState<string>(part?.partName || '');
  const [quantity, setQuantity] = useState<string>((part?.quantity || '1').toString());
  const [status, setStatus] = useState<string>(part?.status || 'pending');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partName.trim()) {
      toast.error('Part Name is required');
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (part?.id) {
        // Edit flow
        await updateDoc(doc(db, `businesses/${tenantId}/parts_requests`, part.id), {
          partName: partName.trim(),
          quantity: parseInt(quantity) || 1,
          status,
          updatedAt: serverTimestamp(),
        });

        // Log to Job Activity
        await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/activity`), {
          type: 'part_status_changed',
          message: `Updated part "${partName.trim()}" (Status: ${status.toUpperCase()}, Qty: ${quantity})`,
          timestamp: new Date(),
          staffId: user?.uid,
          staffName: user?.displayName || user?.email || 'Staff'
        });

        toast.success('Part updated successfully');
      } else {
        // Add flow
        await addDoc(collection(db, `businesses/${tenantId}/parts_requests`), {
          jobId,
          jobTitle,
          taskId: taskId || null,
          taskTitle: taskTitle || null,
          partName: partName.trim(),
          quantity: parseInt(quantity) || 1,
          status: 'pending',
          requestedBy: user?.displayName || user?.email || 'Staff',
          requestedById: user?.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Log to Job Activity
        await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/activity`), {
          type: 'part_requested',
          message: `Requested part: ${partName.trim()} (${quantity})`,
          timestamp: new Date(),
          staffId: user?.uid,
          staffName: user?.displayName || user?.email || 'Staff'
        });

        toast.success('Part requested successfully');
      }
      onSuccess();
    } catch (err) {
      console.error('Error saving part request:', err);
      toast.error(part?.id ? 'Failed to update part' : 'Failed to request part');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!part?.id) return;
    if (!confirm(`Are you sure you want to delete the part request for "${part.partName}"?`)) return;

    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/parts_requests`, part.id));

      // Log to Job Activity
      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/activity`), {
        type: 'part_deleted',
        message: `Deleted part request: ${part.partName}`,
        timestamp: new Date(),
        staffId: user?.uid,
        staffName: user?.displayName || user?.email || 'Staff'
      });

      toast.success('Part request deleted');
      onSuccess();
    } catch (err) {
      console.error('Error deleting part request:', err);
      toast.error('Failed to delete part request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-amber-500/20 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-amber-500/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-xl">
              <Wrench className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                {part?.id ? 'Edit Part Request' : 'Request Part'}
              </h2>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">
                For: {taskTitle || part?.taskTitle || jobTitle}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Part Name / Description</label>
            <input 
              type="text" 
              autoFocus
              required
              placeholder="e.g. Brake Pads, Custom Bracket..."
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-base font-bold focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Quantity</label>
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => setQuantity(prev => Math.max(1, parseInt(prev) - 1).toString())}
                className="w-12 h-12 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold"
              >
                -
              </button>
              <input 
                type="number" 
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="flex-1 px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-center text-lg font-bold focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all"
              />
              <button 
                type="button"
                onClick={() => setQuantity(prev => (parseInt(prev) + 1).toString())}
                className="w-12 h-12 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold"
              >
                +
              </button>
            </div>
          </div>

          {part?.id && (
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-base font-bold focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all cursor-pointer"
              >
                <option value="pending">Pending</option>
                <option value="ordered">Ordered</option>
                <option value="received">Received</option>
                <option value="delivered">With Vehicle</option>
                <option value="inventoried">Inventoried</option>
              </select>
            </div>
          )}

          <div className="pt-4 flex gap-3">
            {part?.id && (
              <button 
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="px-4 py-4 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/25 border border-rose-200 dark:border-rose-800 text-rose-600 rounded-2xl font-bold transition-all disabled:opacity-50 flex items-center justify-center"
                title="Delete Part Request"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button 
              type="submit" 
              disabled={isSubmitting || !partName.trim()}
              className="flex-1 px-6 py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-amber-500/20 flex justify-center items-center gap-2"
            >
              <Package className="w-5 h-5" />
              {isSubmitting ? (part?.id ? 'Updating...' : 'Requesting...') : (part?.id ? 'Update Request' : 'Submit Request')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
