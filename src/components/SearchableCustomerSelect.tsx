import { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export function SearchableCustomerSelect({ 
    customers, 
    value, 
    onChange, 
    placeholder = "Walk-in Guest (No Profile)" 
}: { 
    customers: any[], 
    value: string | null, 
    onChange: (id: string | null) => void, 
    placeholder?: string 
}) {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Sort customers alphabetically
    const sortedCustomers = useMemo(() => {
        return [...customers].sort((a, b) => {
            const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
            const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }, [customers]);

    const filtered = sortedCustomers.filter(c => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (
            c.firstName?.toLowerCase().includes(s) || 
            c.lastName?.toLowerCase().includes(s) || 
            c.companyName?.toLowerCase().includes(s)
        );
    });

    const activeCustomer = customers.find(c => c.id === value);
    const displayValue = activeCustomer 
        ? `${activeCustomer.firstName} ${activeCustomer.lastName} ${activeCustomer.companyName ? `(${activeCustomer.companyName})` : ''}` 
        : placeholder;

    return (
        <div className="relative w-full" ref={ref}>
            <div 
                onClick={() => setOpen(!open)}
                className={`w-full bg-zinc-950 border ${open ? 'border-blue-500' : 'border-zinc-800'} hover:border-zinc-600 rounded-xl px-3 py-2.5 text-sm text-white cursor-pointer flex justify-between items-center transition-colors`}
            >
                <span className={`truncate ${!activeCustomer ? 'text-zinc-500' : 'text-white font-bold'}`}>
                    {displayValue}
                </span>
                <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''} shrink-0 ml-2`} />
            </div>
            
            {open && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 max-h-64 flex flex-col overflow-hidden">
                    <div className="p-2 border-b border-zinc-800 bg-zinc-950/50">
                        <div className="relative">
                            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input 
                                type="text"
                                autoFocus
                                placeholder="Search by name or company..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-[13px] text-white outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 custom-scrollbar">
                        <div 
                            onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
                            className={`px-4 py-3 text-[13px] cursor-pointer border-b border-zinc-800/50 transition-colors ${!value ? 'bg-blue-500/20 text-blue-400 font-bold' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                        >
                            {placeholder}
                        </div>
                        {filtered.length === 0 ? (
                            <div className="px-4 py-6 text-center text-[12px] text-zinc-500">
                                No customers found.
                            </div>
                        ) : (
                            filtered.map(c => (
                                <div 
                                    key={c.id} 
                                    onClick={() => { onChange(c.id); setOpen(false); setSearch(''); }}
                                    className={`px-4 py-3 text-[13px] cursor-pointer border-b border-zinc-800/50 last:border-0 truncate transition-colors ${value === c.id ? 'bg-blue-500/20 text-blue-400 font-bold' : 'text-white hover:bg-zinc-800'}`}
                                >
                                    {c.firstName} {c.lastName} {c.companyName && <span className="text-zinc-500 ml-1 font-normal">({c.companyName})</span>}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
