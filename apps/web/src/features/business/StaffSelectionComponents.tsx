import { useState, useEffect, useRef } from 'react';
import { Users, X, Check } from 'lucide-react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { cn } from '../../lib/utils';

interface StaffMember {
  id: string;
  name: string;
  percentage?: number;
}

interface StaffSelectorProps {
  selectedStaff: StaffMember[];
  onAssign: (staff: StaffMember[]) => void;
  tenantId: string;
  placeholder?: string;
  showPercentages?: boolean;
  compact?: boolean;
}

export function StaffSelector({ 
  selectedStaff, 
  onAssign, 
  tenantId,
  placeholder = "Search and assign staff...",
  showPercentages = false,
  compact = false
}: StaffSelectorProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/staff`), orderBy('firstName', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setStaffList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((s: any) => !s.isArchived && !s.fireDate && s.departmentId));
    }, (err) => {
      console.error("Staff list listener error:", err);
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = staffList.filter(s => {
    const searchStr = inputValue.toLowerCase().trim();
    if (!searchStr) return true;
    const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
    return fullName.includes(searchStr);
  });

  const toggleStaff = (id: string, name: string) => {
    const isSelected = selectedStaff.some(s => s.id === id);
    let newStaff: StaffMember[];
    
    if (isSelected) {
      newStaff = selectedStaff.filter(s => s.id !== id);
    } else {
      newStaff = [...selectedStaff, { id, name }];
    }

    if (showPercentages && newStaff.length > 0) {
      const perPerson = Math.floor(100 / newStaff.length);
      newStaff = newStaff.map((s, idx) => ({
        ...s,
        percentage: idx === 0 ? 100 - (perPerson * (newStaff.length - 1)) : perPerson
      }));
    }
    onAssign(newStaff);
  };

  const updatePercentage = (id: string, percentage: number) => {
    const newStaff = selectedStaff.map(s => s.id === id ? { ...s, percentage } : s);
    onAssign(newStaff);
  };

  const clearAll = () => {
    onAssign([]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500"><Users className="w-4 h-4" /></div>
        <input
          type="text"
          placeholder={selectedStaff.length > 0 ? (compact ? selectedStaff.map(s => s.name.split(' ')[0]).join(', ') : `${selectedStaff.length} staff assigned`) : placeholder}
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          className="w-full pl-9 pr-8 py-3 bg-white dark:bg-zinc-900 border border-amber-100 dark:border-amber-500/20 rounded-xl text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all outline-none text-zinc-900 dark:text-white"
        />
        {selectedStaff.length > 0 && !isOpen && (
           <button 
             onClick={(e) => { e.stopPropagation(); clearAll(); }}
             className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full text-zinc-400"
             title="Clear All"
           >
             <X className="w-4 h-4" />
           </button>
        )}
        
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {selectedStaff.length > 0 && (
              <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-2">Currently Assigned</p>
                <button onClick={clearAll} className="text-[10px] font-black text-red-500 hover:text-red-600 px-2">CLEAR ALL</button>
              </div>
            )}
            
            <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
              {filtered.map(s => {
                const fullName = `${s.firstName} ${s.lastName}`.trim();
                const isSelected = selectedStaff.some(sel => sel.id === s.id);
                
                return (
                  <button 
                    key={s.id} 
                    type="button" 
                    onClick={() => { toggleStaff(s.id, fullName); setInputValue(''); }} 
                    className={`w-full px-3 py-2.5 text-left flex items-center justify-between rounded-lg transition-colors ${isSelected ? 'bg-amber-50 dark:bg-amber-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                  >
                    <span className={`text-sm font-bold ${isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-900 dark:text-white'}`}>
                      {fullName}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-amber-500" />}
                  </button>
                );
              })}
              
              {filtered.length === 0 && (
                <p className="p-4 text-center text-xs text-zinc-500 italic">No staff found matching "{inputValue}"</p>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Show tags of selected staff underneath when not searching */}
      {selectedStaff.length > 0 && !isOpen && !compact && (
        <div className="flex flex-col gap-2 mt-2">
          {selectedStaff.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/20 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{s.name}</span>
              </div>
              <div className="flex items-center gap-3">
                {showPercentages && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={s.percentage ?? 0}
                      onChange={(e) => updatePercentage(s.id, parseInt(e.target.value) || 0)}
                      className="w-12 px-1.5 py-0.5 text-xs font-bold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-center focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                    <span className="text-[10px] font-black text-zinc-400">%</span>
                  </div>
                )}
                <button 
                  onClick={() => toggleStaff(s.id, s.name)} 
                  className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {showPercentages && selectedStaff.length > 0 && (
             <div className="px-3 flex justify-between items-center">
                <span className="text-[10px] font-black text-zinc-400 uppercase">Total Allocation</span>
                <span className={cn(
                  "text-[10px] font-black",
                  selectedStaff.reduce((acc, s) => acc + (s.percentage || 0), 0) === 100 ? "text-emerald-500" : "text-rose-500"
                )}>
                  {selectedStaff.reduce((acc, s) => acc + (s.percentage || 0), 0)}%
                </span>
             </div>
          )}
        </div>
      )}
    </div>
  );
}
