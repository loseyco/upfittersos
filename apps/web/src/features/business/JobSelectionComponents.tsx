import React, { useState, useEffect, useRef } from 'react';
import { Briefcase, Plus, X } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { CustomerSelector, QuickAddCustomerModal } from './CustomerSelectionComponents';
import { useAuthStore } from '../../lib/auth/store';

interface JobSelectorProps {
  jobId: string | null;
  jobs: any[];
  onAssign: (id: string) => void;
  onClear: () => void;
  onCreateNewRequest: (title?: string) => void;
}

export function JobSelector({ jobId, jobs, onAssign, onCreateNewRequest }: JobSelectorProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedJob = jobs.find(j => j.id === jobId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = jobs.filter(j => {
    if (j.status === 'Draft' || j.isDraft) return false;
    const searchStr = inputValue.toLowerCase().trim();
    if (!searchStr) return true;
    return (j.title || '').toLowerCase().includes(searchStr) || 
           (j.customerName || '').toLowerCase().includes(searchStr) ||
           (j.vehicleId || '').toLowerCase().includes(searchStr) ||
           (j.jobNumber || '').toLowerCase().includes(searchStr);
  });

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"><Briefcase className="w-4 h-4" /></div>
        <input
          type="text"
          placeholder={selectedJob ? selectedJob.title : "Assign a Job..."}
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
        />
        {isOpen && (inputValue.length > 0 || filtered.length > 0) && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
              {filtered.slice(0, 10).map(j => (
                <button key={j.id} type="button" onClick={() => { onAssign(j.id); setIsOpen(false); setInputValue(''); }} className="w-full px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-left flex flex-col rounded-lg transition-colors">
                  <span className="font-bold text-zinc-900 dark:text-white text-xs">{j.title}</span>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-tight font-medium">
                    {j.jobNumber && <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">#{j.jobNumber}</span>}
                    {j.customerName && <span>{j.customerName}</span>}
                    {j.vehicleId && <span className="text-emerald-600 dark:text-emerald-400 font-mono">• {j.vehicleId}</span>}
                  </div>
                </button>
              ))}
              
              <button 
                type="button"
                onClick={() => { onCreateNewRequest(inputValue); setIsOpen(false); }} 
                className="w-full mt-1 px-3 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-left flex items-center gap-3 rounded-lg transition-all shadow-sm active:scale-[0.98]"
              >
                <div className="p-1.5 bg-white/20 rounded-md">
                  <Plus className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold">Create New Native Job</span>
                  <span className="text-[10px] opacity-80">{inputValue.trim() || 'Quick Add'}</span>
                </div>
              </button>

              {filtered.length === 0 && !inputValue.trim() && (
                <p className="p-4 text-center text-xs text-zinc-500 italic">No jobs found.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function QuickAddJobModal({ 
  tenantId, 
  initialTitle, 
  initialVin,
  onClose, 
  onSuccess 
}: { 
  tenantId: string, 
  initialTitle?: string, 
  initialVin?: string,
  onClose: () => void, 
  onSuccess: (jobId: string) => void 
}) {
  const [title, setTitle] = useState('');
  const [jobNumber, setJobNumber] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickAddCustomer, setQuickAddCustomer] = useState<string | null>(null);

  useEffect(() => {
    // Smart detection: If the initial text is purely numeric, it's likely a Job Number
    if (initialTitle && /^\d+$/.test(initialTitle.trim())) {
      setJobNumber(initialTitle.trim());
      setTitle('');
    } else {
      setTitle(initialTitle || '');
    }
  }, [initialTitle]);

  const { user } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const finalTitle = title.trim() || (jobNumber ? `Job #${jobNumber}` : 'Untitled Job');
      const docRef = await addDoc(collection(db, `businesses/${tenantId}/jobs`), {
        title: finalTitle,
        jobNumber: jobNumber.trim(),
        customerId: customerId,
        customerName: customerName.trim(),
        vehicleId: initialVin?.toUpperCase() || null,
        status: 'Open',
        source: 'Native',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.uid || 'system',
        createdByName: user?.displayName || null,
        createdByEmail: user?.email || null,
        tags: ['Native', 'Quick Add']
      });
      toast.success('Job created successfully');
      onSuccess(docRef.id);
    } catch (err) {
      console.error(err);
      toast.error('Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md shadow-xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-500" />
              Create Native Job
            </h3>
            <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-5 h-5"/></button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Job #</label>
                <input 
                  type="text" 
                  value={jobNumber} 
                  onChange={e => setJobNumber(e.target.value)} 
                  placeholder="e.g. 10254" 
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono" 
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Job Title</label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  placeholder="e.g. 2024 Ford Raptor Upfit" 
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all" 
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Customer</label>
              <CustomerSelector 
                tenantId={tenantId}
                customerId={customerId}
                onAssign={(id, name) => { setCustomerId(id); setCustomerName(name); }}
                onClear={() => { setCustomerId(null); setCustomerName(''); }}
                onCreateNewRequest={(name) => setQuickAddCustomer(name || '')}
              />
            </div>
            
            {initialVin && (
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Linking Vehicle</p>
                <p className="font-mono text-sm text-indigo-600 dark:text-indigo-400">{initialVin}</p>
              </div>
            )}

            <div className="pt-4">
              <button disabled={isSubmitting} type="submit" className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-2">
                {isSubmitting ? 'Creating...' : 'Create Job'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {quickAddCustomer !== null && (
        <QuickAddCustomerModal 
          tenantId={tenantId}
          initialName={quickAddCustomer}
          onClose={() => setQuickAddCustomer(null)}
          onSuccess={(id, name) => {
            setCustomerId(id);
            setCustomerName(name);
            setQuickAddCustomer(null);
          }}
        />
      )}
    </>
  );
}

