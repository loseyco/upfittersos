import { useState, useEffect, useRef } from 'react';
import { Users, X, Check } from 'lucide-react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';

interface StaffMember {
  id: string;
  name: string;
}

interface StaffSelectorProps {
  selectedStaff: StaffMember[];
  onAssign: (staff: StaffMember[]) => void;
  tenantId: string;
  placeholder?: string;
}

export function StaffSelector({ 
  selectedStaff, 
  onAssign, 
  tenantId,
  placeholder = "Search and assign staff..."
}: StaffSelectorProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/staff`), orderBy('firstName', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setStaffList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((s: any) => !s.isArchived));
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
    if (isSelected) {
      onAssign(selectedStaff.filter(s => s.id !== id));
    } else {
      onAssign([...selectedStaff, { id, name }]);
    }
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
          placeholder={selectedStaff.length > 0 ? `${selectedStaff.length} staff assigned` : placeholder}
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
      {selectedStaff.length > 0 && !isOpen && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedStaff.map(s => (
            <div key={s.id} className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-md">
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{s.name}</span>
              <button 
                onClick={() => toggleStaff(s.id, s.name)} 
                className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
