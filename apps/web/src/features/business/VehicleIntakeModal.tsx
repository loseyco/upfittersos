import { useState, useEffect } from 'react';
import { X, CarFront, Loader2, CheckCircle, Search, User } from 'lucide-react';
import { db } from '../../lib/firebase/config';
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { toast } from 'sonner';

interface VehicleIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onSuccess?: () => void;
}

export function VehicleIntakeModal({ isOpen, onClose, tenantId, onSuccess }: VehicleIntakeModalProps) {
  const [vin, setVin] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);

  useEffect(() => {
    if (!isOpen || !tenantId) return;

    // Fetch customers for the datalist
    const fetchCustomers = async () => {
      try {
        const snap = await getDocs(collection(db, `businesses/${tenantId}/customers`));
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        data.sort((a: any, b: any) => {
          const nameA = a.name || a.displayName || a.CompanyName || a.FullName || '';
          const nameB = b.name || b.displayName || b.CompanyName || b.FullName || '';
          return nameA.localeCompare(nameB);
        });
        setCustomers(data);
      } catch (err) {
        console.warn("Could not fetch customers", err);
      }
    };

    fetchCustomers();
  }, [isOpen, tenantId]);

  const handleVinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setVin(value);

    // Auto-decode if VIN is 17 chars
    if (value.length === 17) {
      decodeVin(value);
    }
  };

  const decodeVin = async (vinToDecode: string) => {
    setIsDecoding(true);
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vinToDecode}?format=json`);
      const data = await res.json();
      const result = data.Results?.[0];
      if (result && result.Make && result.ErrorCode && result.ErrorCode.startsWith('0')) {
        if (result.ModelYear) setYear(result.ModelYear);
        if (result.Make) setMake(result.Make);
        if (result.Model) setModel(result.Model);
      }
    } catch (err) {
      console.warn("NHTSA decode failed", err);
    } finally {
      setIsDecoding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vin.trim() || !make.trim()) {
      toast.error('VIN and Make are required');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, `businesses/${tenantId}/vehicles`), {
        vin: vin.trim().toUpperCase(),
        make: make.trim().toUpperCase(),
        model: model.trim().toUpperCase(),
        year: year.trim(),
        customerName: customerName.trim(),
        arrivedAt: serverTimestamp(), // Default to arrived now for intake
        createdAt: serverTimestamp(),
        source: 'Native',
        isArchived: false,
        isWithCustomer: false
      });

      toast.success('Vehicle intake successful');
      if (onSuccess) onSuccess();
      handleClose();
    } catch (err) {
      console.error('Error in vehicle intake:', err);
      toast.error('Failed to intake vehicle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setVin('');
    setYear('');
    setMake('');
    setModel('');
    setCustomerName('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={handleClose}>
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 rounded-2xl">
              <CarFront className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white leading-none">Vehicle Intake</h2>
              <p className="text-sm text-zinc-500 mt-1">Register a new vehicle arriving at the shop</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-4">
            {/* VIN Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">VIN / Identifier</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-zinc-400" />
                </div>
                <input 
                  type="text"
                  required
                  value={vin}
                  onChange={handleVinChange}
                  placeholder="Enter 17-character VIN..."
                  className="w-full pl-11 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-mono text-sm"
                />
                {isDecoding && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                  </div>
                )}
              </div>
            </div>

            {/* Year, Make, Model Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Year</label>
                <input 
                  type="text"
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  placeholder="2024"
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Make</label>
                <input 
                  type="text"
                  required
                  value={make}
                  onChange={e => setMake(e.target.value)}
                  placeholder="Ford"
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Model</label>
                <input 
                  type="text"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="F-150"
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm"
                />
              </div>
            </div>

            {/* Customer Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Customer Name</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="w-4 h-4 text-zinc-400" />
                </div>
                <input 
                  type="text"
                  list="customer-list-intake"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Search or enter customer name..."
                  className="w-full pl-11 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm"
                />
                <datalist id="customer-list-intake">
                  {customers.map(c => {
                    const name = c.name || c.displayName || c.CompanyName || c.FullName || c.id;
                    return <option key={c.id} value={name} />;
                  })}
                </datalist>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button 
              type="button"
              onClick={handleClose}
              className="flex-1 py-4 px-6 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-2xl transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting || isDecoding}
              className="flex-[2] py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-xs uppercase tracking-widest">Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Complete Intake
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
