import React, { useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { Edit2, Plus, X } from 'lucide-react';
import { useAuthStore } from '../../lib/auth/store';
import { useBetaUserCount } from '../../lib/hooks/useBetaUserCount';

export function CustomerFormModal(props: { tenantId: string, customer?: any, onClose: () => void, onSuccess: () => void }) {
  const permissions = useAuthStore(state => state.permissions);
  const isBeta = permissions['experimental.new_modals'] === true;

  if (isBeta) {
    return <BetaCustomerFormModal {...props} />;
  }
  return <LegacyCustomerFormModal {...props} />;
}

function BetaCustomerFormModal({ tenantId, customer, onClose, onSuccess }: { tenantId: string, customer?: any, onClose: () => void, onSuccess: () => void }) {
  useBetaUserCount(tenantId);
  const [formData, setFormData] = useState({
    name: customer?.name || '',
    company: customer?.company || '',
    email: customer?.email || '',
    mobilePhone: customer?.mobilePhone || '',
    address: customer?.address || '',
    notes: customer?.notes || '',
    status: customer?.status || 'Active'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const data = {
        ...formData,
        updatedAt: serverTimestamp(),
        source: customer?.source || 'Native',
        tags: customer?.tags || ['Native']
      };

      if (customer) {
        await updateDoc(doc(db, `businesses/${tenantId}/customers`, customer.id), data);
        toast.success('Customer updated');
      } else {
        await addDoc(collection(db, `businesses/${tenantId}/customers`), {
          ...data,
          createdAt: serverTimestamp()
        });
        toast.success('Customer created');
      }
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error('Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-purple-500/20 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-purple-500/10 to-transparent p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-xl text-zinc-900 dark:text-white flex items-center gap-3">
              {customer ? <Edit2 className="w-5 h-5 text-purple-500" /> : <Plus className="w-5 h-5 text-purple-500" />}
              {customer ? 'Edit Customer' : 'Add Customer'}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-3 py-1 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg border border-purple-500/20 shadow-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" /> Beta
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-colors"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Display Name <span className="text-purple-500">*</span></label>
              <input 
                type="text" 
                autoFocus
                required
                value={formData.name} 
                onChange={e => setFormData({ ...formData, name: e.target.value })} 
                placeholder="e.g. John Doe or Acme Corp" 
                className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-lg font-semibold focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all" 
              />
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Email</label>
              <input 
                type="email" 
                value={formData.email} 
                onChange={e => setFormData({ ...formData, email: e.target.value })} 
                placeholder="john@example.com" 
                className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Phone</label>
              <input 
                type="text" 
                value={formData.mobilePhone} 
                onChange={e => setFormData({ ...formData, mobilePhone: e.target.value })} 
                placeholder="(555) 000-0000" 
                className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all" 
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Company (Optional)</label>
              <input 
                type="text" 
                value={formData.company} 
                onChange={e => setFormData({ ...formData, company: e.target.value })} 
                placeholder="e.g. Acme Corp" 
                className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all" 
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Address</label>
              <textarea 
                value={formData.address} 
                onChange={e => setFormData({ ...formData, address: e.target.value })} 
                placeholder="123 Main St, City, ST 12345" 
                rows={2}
                className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all resize-none" 
              />
            </div>
          </div>

          <div className="pt-4 flex gap-4">
             <button type="button" onClick={onClose} className="flex-1 px-6 py-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-2xl font-bold transition-all">
                Cancel
             </button>
            <button disabled={isSubmitting} type="submit" className="flex-[2] px-6 py-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2">
              {isSubmitting ? 'Saving...' : customer ? 'Save Changes (Enter)' : 'Create Customer (Enter)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LegacyCustomerFormModal({ tenantId, customer, onClose, onSuccess }: { tenantId: string, customer?: any, onClose: () => void, onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: customer?.name || '',
    company: customer?.company || '',
    email: customer?.email || '',
    mobilePhone: customer?.mobilePhone || '',
    address: customer?.address || '',
    notes: customer?.notes || '',
    status: customer?.status || 'Active'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const data = {
        ...formData,
        updatedAt: serverTimestamp(),
        source: customer?.source || 'Native',
        tags: customer?.tags || ['Native']
      };

      if (customer) {
        await updateDoc(doc(db, `businesses/${tenantId}/customers`, customer.id), data);
        toast.success('Customer updated');
      } else {
        await addDoc(collection(db, `businesses/${tenantId}/customers`), {
          ...data,
          createdAt: serverTimestamp()
        });
        toast.success('Customer created');
      }
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error('Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md shadow-xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            {customer ? <Edit2 className="w-4 h-4 text-blue-500" /> : <Plus className="w-4 h-4 text-blue-500" />}
            {customer ? 'Edit Customer' : 'Add Customer'}
          </h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Display Name</label>
            <input 
              type="text" 
              required
              value={formData.name} 
              onChange={e => setFormData({ ...formData, name: e.target.value })} 
              placeholder="e.g. John Doe or Acme Corp" 
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Email</label>
              <input 
                type="email" 
                value={formData.email} 
                onChange={e => setFormData({ ...formData, email: e.target.value })} 
                placeholder="john@example.com" 
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Phone</label>
              <input 
                type="text" 
                value={formData.mobilePhone} 
                onChange={e => setFormData({ ...formData, mobilePhone: e.target.value })} 
                placeholder="(555) 000-0000" 
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Company (Optional)</label>
            <input 
              type="text" 
              value={formData.company} 
              onChange={e => setFormData({ ...formData, company: e.target.value })} 
              placeholder="e.g. Acme Corp" 
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Address</label>
            <textarea 
              value={formData.address} 
              onChange={e => setFormData({ ...formData, address: e.target.value })} 
              placeholder="123 Main St, City, ST 12345" 
              rows={2}
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none" 
            />
          </div>

          <div className="pt-4">
            <button disabled={isSubmitting} type="submit" className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-2">
              {isSubmitting ? 'Saving...' : customer ? 'Update Customer' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
