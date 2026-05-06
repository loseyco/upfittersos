import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, X } from 'lucide-react';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';

interface CustomerSelectorProps {
  customerId: string | null;
  onAssign: (id: string, name: string) => void;
  onClear: () => void;
  onCreateNewRequest: (name?: string) => void;
  tenantId: string;
  placeholder?: string;
}

export function CustomerSelector({ 
  customerId, 
  onAssign, 
  onClear, 
  onCreateNewRequest, 
  tenantId,
  placeholder = "Assign a Customer..."
}: CustomerSelectorProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/customers`), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setCustomers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [tenantId]);

  const selectedCustomer = customers.find(c => c.id === customerId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = customers.filter(c => {
    const searchStr = inputValue.toLowerCase().trim();
    if (!searchStr) return true;
    return (c.name || '').toLowerCase().includes(searchStr) || 
           (c.email || '').toLowerCase().includes(searchStr) ||
           (c.mobilePhone || '').toLowerCase().includes(searchStr) ||
           (c.company || '').toLowerCase().includes(searchStr);
  });

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"><Users className="w-4 h-4" /></div>
        <input
          type="text"
          placeholder={selectedCustomer ? (selectedCustomer.name || selectedCustomer.company) : placeholder}
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
        />
        {selectedCustomer && !isOpen && (
           <button 
             onClick={(e) => { e.stopPropagation(); onClear(); }}
             className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full text-zinc-400"
           >
             <X className="w-3 h-3" />
           </button>
        )}
        
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
              {filtered.slice(0, 10).map(c => (
                <button 
                  key={c.id} 
                  type="button" 
                  onClick={() => { onAssign(c.id, c.name); setIsOpen(false); setInputValue(''); }} 
                  className="w-full px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-left flex flex-col rounded-lg transition-colors"
                >
                  <span className="font-bold text-zinc-900 dark:text-white text-xs">{c.name || c.company}</span>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-tight font-medium">
                    {c.company && <span className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{c.company}</span>}
                    {c.email && <span>{c.email}</span>}
                  </div>
                </button>
              ))}
              
              <button 
                type="button"
                onClick={() => { onCreateNewRequest(inputValue); setIsOpen(false); }} 
                className="w-full mt-1 px-3 py-3 bg-blue-600 hover:bg-blue-700 text-white text-left flex items-center gap-3 rounded-lg transition-all shadow-sm active:scale-[0.98]"
              >
                <div className="p-1.5 bg-white/20 rounded-md">
                  <Plus className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold">Add New Customer</span>
                  <span className="text-[10px] opacity-80">{inputValue.trim() || 'Quick Add'}</span>
                </div>
              </button>

              {filtered.length === 0 && !inputValue.trim() && (
                <p className="p-4 text-center text-xs text-zinc-500 italic">No customers found.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function QuickAddCustomerModal({ 
  tenantId, 
  initialName, 
  customerId,
  onClose, 
  onSuccess 
}: { 
  tenantId: string, 
  initialName?: string, 
  customerId?: string | null,
  onClose: () => void, 
  onSuccess: (customerId: string, name: string) => void 
}) {
  const [name, setName] = useState(initialName || '');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    if (customerId && tenantId) {
      const unsub = onSnapshot(doc(db, `businesses/${tenantId}/customers`, customerId), (snap: any) => {
        if (snap.exists()) {
          const data = snap.data();
          setName(data.name || '');
          setCompany(data.company || '');
          setEmail(data.email || '');
          setPhone(data.mobilePhone || '');
          setCity(data.billAddr?.city || '');
          setState(data.billAddr?.countrySubDivisionCode || '');
        }
      });
      return () => unsub();
    }
  }, [customerId, tenantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const customerData: any = {
        name: name.trim(),
        company: company.trim(),
        email: email.trim(),
        mobilePhone: phone.trim(),
        billAddr: {
          city: city.trim(),
          countrySubDivisionCode: state.trim()
        },
        status: 'Active',
        source: 'Native',
        updatedAt: serverTimestamp(),
      };

      let finalId = customerId;

      if (customerId) {
        await updateDoc(doc(db, `businesses/${tenantId}/customers`, customerId), customerData);
        finalId = customerId;
      } else {
        customerData.createdAt = serverTimestamp();
        customerData.createdBy = user?.uid || 'system';
        customerData.createdByName = user?.displayName || null;
        customerData.createdByEmail = user?.email || null;
        customerData.tags = ['Native', 'Quick Add'];
        
        const docRef = await addDoc(collection(db, `businesses/${tenantId}/customers`), customerData);
        finalId = docRef.id;
      }

      toast.success(customerId ? 'Customer updated' : 'Customer added');
      onSuccess(finalId!, name.trim() || company.trim());
    } catch (err) {
      console.error(err);
      toast.error('Failed to save customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md shadow-xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
          <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 text-sm sm:text-base">
            <Users className="w-4 h-4 text-blue-500" />
            {customerId ? 'Edit Customer Details' : 'Quick Add Customer'}
          </h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 px-1">Customer / Contact Name</label>
              <input 
                type="text" 
                required
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="e.g. John Doe" 
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 px-1">Company (Optional)</label>
              <input 
                type="text" 
                value={company} 
                onChange={e => setCompany(e.target.value)} 
                placeholder="Business Name..." 
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 px-1">Email</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="john@example.com" 
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 px-1">Phone</label>
              <input 
                type="text" 
                value={phone} 
                onChange={e => setPhone(e.target.value)} 
                placeholder="(555) 000-0000" 
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 px-1">City</label>
              <input 
                type="text" 
                value={city} 
                onChange={e => setCity(e.target.value)} 
                placeholder="City" 
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 px-1">State / Subdiv</label>
              <input 
                type="text" 
                value={state} 
                onChange={e => setState(e.target.value)} 
                placeholder="e.g. IL" 
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-mono uppercase" 
              />
            </div>
          </div>

          <div className="pt-6">
            <button disabled={isSubmitting} type="submit" className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 active:scale-95">
              {isSubmitting ? 'Saving...' : (customerId ? 'Update Customer' : 'Save & Assign Customer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

