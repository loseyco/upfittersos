import React, { useState, useEffect, useRef } from 'react';
import { Camera, Search, Plus, X } from 'lucide-react';
import { VinScanner } from './VinScanner';
import { collection, doc, getDoc, setDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';

export type Vehicle = {
  id: string;
  vin: string;
  year?: string | number;
  make?: string;
  model?: string;
  bodyClass?: string;
  driveType?: string;
  gvwr?: string;
  customerName?: string;
  qbWorkOrder?: string;
}

interface VinSelectorProps {
  vin: string;
  onAssign: (v: string) => void;
  onClear: () => void;
  onQuickAddRequest: (vin: string) => void;
  vehicles: Vehicle[];
  placeholder?: string;
  clearLabel?: string;
  hideClearButton?: boolean;
}

export function VinSelector({ 
  vin, 
  onAssign, 
  onClear, 
  onQuickAddRequest, 
  vehicles,
  placeholder = "Type VIN...",
  clearLabel = "Remove Vehicle",
  hideClearButton = false
}: VinSelectorProps) {
  const [inputValue, setInputValue] = useState(vin || '');
  const [isOpen, setIsOpen] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputValue(vin || ''); }, [vin]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = vehicles.filter(v => {
    const searchStr = inputValue.toLowerCase().trim();
    if (!searchStr) return true;
    
    return String(v.vin || '').toLowerCase().includes(searchStr) || 
           String(v.make || '').toLowerCase().includes(searchStr) || 
           String(v.model || '').toLowerCase().includes(searchStr) ||
           String(v.customerName || '').toLowerCase().includes(searchStr) ||
           String(v.qbWorkOrder || '').toLowerCase().includes(searchStr);
  });
  const exact = vehicles.find(v => String(v.vin || '').toUpperCase() === inputValue.trim().toUpperCase());

  return (
    <div className="relative" ref={dropdownRef}>
      {showScanner && (
        <VinScanner 
          onScan={(scannedVin) => {
            setInputValue(scannedVin);
            onAssign(scannedVin);
            setShowScanner(false);
          }} 
          onClose={() => setShowScanner(false)} 
        />
      )}
      <div className="space-y-3">
        <button 
          type="button"
          onClick={() => setShowScanner(true)}
          className="w-full py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-transparent dark:border-zinc-800"
        >
          <Camera className="w-4 h-4" /> Scan VIN Barcode
        </button>

        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"><Search className="w-4 h-4" /></div>
          <input
            type="text"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value.toUpperCase()); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            className="w-full pl-9 pr-10 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => { setInputValue(''); onClear(); setIsOpen(true); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isOpen && (inputValue.length > 0 || filtered.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                {filtered.map(v => (
                  <button key={v.id || v.vin} type="button" onClick={() => { onAssign(v.vin); setIsOpen(false); }} className="w-full px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left flex flex-col rounded-lg transition-colors">
                    <span className="font-mono text-xs font-bold text-zinc-900 dark:text-white">{v.vin}</span>
                    <div className="flex flex-wrap gap-x-2 text-[10px] text-zinc-500 uppercase tracking-tight font-medium">
                      {v.make && <span>{v.year} {v.make} {v.model}</span>}
                      {v.customerName && <span className="text-indigo-600 dark:text-indigo-400">• {v.customerName}</span>}
                      {v.qbWorkOrder && <span className="opacity-60">• PO: {v.qbWorkOrder}</span>}
                      {v.bodyClass && <span className="opacity-60">• {v.bodyClass}</span>}
                    </div>
                  </button>
                ))}
                
                {!exact && inputValue.trim().length >= 3 && (
                  <button 
                    type="button"
                    onClick={() => { onQuickAddRequest(inputValue.trim()); setIsOpen(false); }} 
                    className="w-full mt-1 px-3 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-left flex items-center gap-3 rounded-lg transition-all shadow-sm active:scale-[0.98]"
                  >
                    <div className="p-1.5 bg-white/20 rounded-md">
                      <Plus className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold">Register & Assign New VIN</span>
                      <span className="font-mono text-[10px] opacity-80">{inputValue.trim()}</span>
                    </div>
                  </button>
                )}

                {filtered.length === 0 && !exact && inputValue.trim().length < 3 && inputValue.trim().length > 0 && (
                  <div className="px-3 py-4 text-center text-xs text-zinc-500">
                    Type at least 3 characters to search...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {vin && !hideClearButton && (
          <button 
            type="button"
            onClick={onClear} 
            className="w-full py-2.5 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" /> {clearLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function QuickAddVehicleModal({ 
  tenantId, 
  initialVin, 
  onClose, 
  onAssign 
}: { 
  tenantId: string, 
  initialVin: string, 
  onClose: () => void, 
  onAssign: (vin: string) => void 
}) {
  const [vin, setVin] = useState(initialVin || '');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);

  useEffect(() => {
    if (vin.trim().length === 17) {
      setIsDecoding(true);
      fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin.trim()}?format=json`)
        .then(res => res.json())
        .then(data => {
          const result = data.Results?.[0];
          if (result && result.Make && result.ErrorCode && result.ErrorCode.startsWith('0')) {
            if (result.ModelYear) setYear(result.ModelYear);
            if (result.Make) setMake(result.Make);
            if (result.Model) setModel(result.Model);
          }
        })
        .catch(err => console.warn("NHTSA decode failed", err))
        .finally(() => setIsDecoding(false));
    }
  }, [vin]);

  useEffect(() => {
    getDocs(collection(db, `businesses/${tenantId}/customers`)).then(snap => {
      const data: any[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => {
        const nameA = a.name || a.displayName || a.CompanyName || a.FullName || '';
        const nameB = b.name || b.displayName || b.CompanyName || b.FullName || '';
        return nameA.localeCompare(nameB);
      });
      setCustomers(data);
    }).catch(err => console.warn("Could not fetch customers", err));
  }, [tenantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vin.trim()) return;
    setIsSubmitting(true);
    try {
      const trimmedVin = vin.trim().toUpperCase();
      const vehicleRef = doc(db, `businesses/${tenantId}/vehicles`, trimmedVin);
      const vehicleDoc = await getDoc(vehicleRef);
      if (!vehicleDoc.exists()) {
        await setDoc(vehicleRef, {
          vin: trimmedVin,
          make: make.trim().toUpperCase(),
          model: model.trim().toUpperCase(),
          year: year.trim(),
          customerName: customerName.trim(),
          tenantId,
          createdAt: serverTimestamp(),
          source: 'Quick Add'
        });
      }
      onAssign(trimmedVin);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to register new vehicle');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            Register New Vehicle
            {isDecoding && <span className="text-[10px] font-medium text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-full animate-pulse">Decoding VIN...</span>}
          </h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-5 h-5"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">VIN or Identifier *</label>
            <input required type="text" value={vin} onChange={e => setVin(e.target.value.toUpperCase())} placeholder="e.g. 1FMCU9..." className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Year</label>
              <input type="text" value={year} onChange={e => setYear(e.target.value)} placeholder="e.g. 2025" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Make</label>
              <input type="text" value={make} onChange={e => setMake(e.target.value)} placeholder="e.g. Ford" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Model</label>
              <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. Explorer" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Customer</label>
            <input 
              type="text" 
              list="customer-list-selector"
              value={customerName} 
              onChange={e => setCustomerName(e.target.value)} 
              placeholder="Start typing or select from list..." 
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
            />
            <datalist id="customer-list-selector">
              {customers.map(c => {
                const name = c.name || c.displayName || c.CompanyName || c.FullName || c.id;
                return <option key={c.id} value={name} />;
              })}
            </datalist>
            <p className="mt-1.5 text-[10px] text-zinc-500">
              When QuickBooks syncs this VIN on a job, it will verify against this customer.
            </p>
          </div>
          <div className="pt-4">
            <button disabled={isSubmitting || isDecoding} type="submit" className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Register & Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
