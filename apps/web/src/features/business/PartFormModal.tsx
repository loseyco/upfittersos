import { useState, useEffect } from 'react';
import { X, PackagePlus } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';

interface PartFormModalProps {
  tenantId: string;
  user: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function PartFormModal(props: PartFormModalProps) {
  const permissions = useAuthStore(state => state.permissions);
  const isBeta = permissions['experimental.new_modals'] === true;

  if (isBeta) {
    return <BetaPartFormModal {...props} />;
  }
  return <LegacyPartFormModal {...props} />;
}

function BetaPartFormModal({ tenantId, user, onClose, onSuccess }: PartFormModalProps) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [mpn, setMpn] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [quantityOnHand, setQuantityOnHand] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Item Name is required');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const partData = {
        name: name.trim(),
        sku: sku.trim(),
        mpn: mpn.trim(),
        price: Number(price) || 0,
        cost: Number(cost) || 0,
        quantityOnHand: Number(quantityOnHand) || 0,
        description: description.trim(),
        source: 'Native',
        status: 'In Stock',
        tenantId,
        createdAt: serverTimestamp(),
        activities: [{
          type: 'created',
          message: 'Part manually created',
          user: user?.displayName || user?.email?.split('@')[0] || 'Unknown User',
          date: new Date().toISOString()
        }]
      };

      await addDoc(collection(db, `businesses/${tenantId}/inventory_items`), partData);
      toast.success('Part added successfully');
      onSuccess();
    } catch (err) {
      console.error('Error adding part:', err);
      toast.error('Failed to add part');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden border border-purple-500/20 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-purple-500/10 to-transparent p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-3 text-zinc-900 dark:text-white">
              <PackagePlus className="w-6 h-6 text-purple-500" />
              Add New Part
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-3 py-1 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg border border-purple-500/20 shadow-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" /> Beta
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Item Name <span className="text-purple-500">*</span></label>
            <input 
              type="text" 
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-lg font-semibold focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">SKU</label>
              <input 
                type="text" 
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">MPN</label>
              <input 
                type="text" 
                value={mpn}
                onChange={(e) => setMpn(e.target.value)}
                className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-5">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Price ($)</label>
              <input 
                type="number" 
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Cost ($)</label>
              <input 
                type="number" 
                step="0.01"
                min="0"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Qty on Hand</label>
              <input 
                type="number" 
                min="0"
                value={quantityOnHand}
                onChange={(e) => setQuantityOnHand(e.target.value)}
                className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Description</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all resize-none h-24"
            />
          </div>

          <div className="pt-4 flex gap-4">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 px-6 py-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-2xl font-bold transition-all"
            >
              Cancel (Esc)
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="flex-[2] px-6 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-purple-500/20 flex justify-center items-center gap-2"
            >
              {isSubmitting ? 'Saving...' : 'Save Part (Enter)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LegacyPartFormModal({ tenantId, user, onClose, onSuccess }: PartFormModalProps) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [mpn, setMpn] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [quantityOnHand, setQuantityOnHand] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Item Name is required');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const partData = {
        name: name.trim(),
        sku: sku.trim(),
        mpn: mpn.trim(),
        price: Number(price) || 0,
        cost: Number(cost) || 0,
        quantityOnHand: Number(quantityOnHand) || 0,
        description: description.trim(),
        source: 'Native',
        status: 'In Stock',
        tenantId,
        createdAt: serverTimestamp(),
        activities: [{
          type: 'created',
          message: 'Part manually created',
          user: user?.displayName || user?.email?.split('@')[0] || 'Unknown User',
          date: new Date().toISOString()
        }]
      };

      await addDoc(collection(db, `businesses/${tenantId}/inventory_items`), partData);
      toast.success('Part added successfully');
      onSuccess();
    } catch (err) {
      console.error('Error adding part:', err);
      toast.error('Failed to add part');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50">
          <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
            <PackagePlus className="w-5 h-5 text-indigo-500" />
            Add New Part
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Item Name *</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">SKU</label>
              <input 
                type="text" 
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">MPN</label>
              <input 
                type="text" 
                value={mpn}
                onChange={(e) => setMpn(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Price ($)</label>
              <input 
                type="number" 
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Cost ($)</label>
              <input 
                type="number" 
                step="0.01"
                min="0"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Qty on Hand</label>
              <input 
                type="number" 
                min="0"
                value={quantityOnHand}
                onChange={(e) => setQuantityOnHand(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Description</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none h-24"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Part'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
