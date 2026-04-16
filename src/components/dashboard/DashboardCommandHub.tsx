import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, UserPlus, Car, Command, Briefcase, User } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';

interface DashboardCommandHubProps {
    onAction: (actionType: 'estimate' | 'customer' | 'vehicle' | 'scan' | 'open_job' | 'open_staff', payload?: string) => void;
    onFilterChange?: (text: string) => void; // Keeping for future use if needed
    allJobs?: any[];
    allStaff?: any[];
}

export function DashboardCommandHub({ onAction, onFilterChange, allJobs = [], allStaff = [] }: DashboardCommandHubProps) {
    const { tenantId } = useAuth();
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    // Global async data cache for deep searching
    const [globalJobs, setGlobalJobs] = useState<any[]>([]);
    const [globalCustomers, setGlobalCustomers] = useState<any[]>([]);
    const [globalVehicles, setGlobalVehicles] = useState<any[]>([]);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        
        // Fetch historical jobs + customers for deep searching
        const fetchGlobalSearchData = async () => {
            try {
                // Fetch all customers for tenant
                const custSnap = await getDocs(query(collection(db, 'customers'), where('tenantId', '==', tenantId)));
                setGlobalCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));

                // Fetch all jobs for tenant (if not already mostly covered by allJobs)
                const jobSnap = await getDocs(query(collection(db, 'jobs'), where('tenantId', '==', tenantId)));
                setGlobalJobs(jobSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                
                // Fetch all vehicles
                const vehSnap = await getDocs(query(collection(db, 'vehicles'), where('tenantId', '==', tenantId)));
                setGlobalVehicles(vehSnap.docs.map(v => ({ id: v.id, ...v.data() })));
            } catch (err) {
                console.error("Failed to load global search data", err);
            }
        };
        fetchGlobalSearchData();
    }, [tenantId]);

    // Filter computation
    const searchResults = useMemo(() => {
        const results: { type: 'job' | 'staff' | 'customer' | 'vehicle', id: string, title: string, subtitle: string, isRecent?: boolean }[] = [];
        const jobsToSearch = globalJobs.length > 0 ? globalJobs : allJobs;

        if (!inputValue.trim()) {
            jobsToSearch.slice(0, 3).forEach(j => {
                results.push({
                    type: 'job', id: j.id, title: j.title || `Job #${j.id.slice(0, 6)}`, subtitle: `${j.customer?.firstName || 'Unknown'} - Recent Job`, isRecent: true
                });
            });
            globalCustomers.slice(0, 2).forEach(c => {
                results.push({
                    type: 'customer', id: c.id, title: `${c.firstName} ${c.lastName}`.trim() || 'Unknown Name', subtitle: 'Recent Customer', isRecent: true
                });
            });
            return results;
        }

        const term = inputValue.toLowerCase().trim();
        const keywords = term.split(/\s+/).filter(Boolean);

        jobsToSearch.forEach(j => {
            const searchableStr = [
                j.title,
                j.customer?.firstName,
                j.customer?.lastName,
                j.vehicle?.make,
                j.vehicle?.model,
                j.vehicle?.year?.toString(),
                j.vehicle?.vin,
                j.vehicle?.licensePlate
            ].filter(Boolean).join(' ').toLowerCase();

            if (keywords.every(kw => searchableStr.includes(kw))) {
                results.push({
                    type: 'job',
                    id: j.id,
                    title: j.title || 'Untitled Job',
                    subtitle: `${j.customer?.firstName || 'No'} ${j.customer?.lastName || 'Customer'} - ${j.vehicle?.make || ''} ${j.vehicle?.model || ''} ${j.archived ? '(Archived)' : ''}`.trim()
                });
            }
        });

        allStaff.forEach(s => {
            const searchableStr = [s.firstName, s.lastName, s.displayName, s.role].filter(Boolean).join(' ').toLowerCase();
            if (keywords.every(kw => searchableStr.includes(kw))) {
                results.push({
                    type: 'staff',
                    id: s.uid,
                    title: s.displayName || `${s.firstName} ${s.lastName}`,
                    subtitle: s.role || 'Staff'
                });
            }
        });

        // Search customers directly
        globalCustomers.forEach(c => {
            let searchableStr = [c.firstName, c.lastName, c.email, c.phone].filter(Boolean).join(' ').toLowerCase();
            
            // Add all vehicle specs to the customer's searchable block
            if (c.vehicles && Array.isArray(c.vehicles)) {
                c.vehicles.forEach((v: any) => {
                    searchableStr += ' ' + [v.year?.toString(), v.make, v.model, v.vin, v.licensePlate].filter(Boolean).join(' ').toLowerCase();
                });
            }

            if (keywords.every(kw => searchableStr.includes(kw))) {
                // Check if we already have this customer as a job result to prevent spam
                const alreadyFound = results.some(r => r.subtitle.includes(`${c.firstName} ${c.lastName}`));
                if (!alreadyFound) {
                    results.push({
                        type: 'customer',
                        id: c.id,
                        title: `${c.firstName} ${c.lastName}`.trim() || 'Unknown Name',
                        subtitle: `${c.phone || c.email || 'No Contact Info'} - Customer Directory`
                    });
                }
            }
        });
        // Search global vehicles
        if (globalVehicles && globalVehicles.length > 0) {
            globalVehicles.forEach(v => {
                const searchableStr = [
                    v.year?.toString(),
                    v.make,
                    v.model,
                    v.vin,
                    v.licensePlate
                ].filter(Boolean).filter(s => typeof s === 'string').map(s => s.toLowerCase()).join(' ');

                if (keywords.every(kw => searchableStr.includes(kw))) {
                    const vehicleName = `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim();
                    results.push({
                        type: 'vehicle',
                        id: v.id,
                        title: vehicleName || 'Unknown Vehicle',
                        subtitle: `VIN: ${v.vin || 'N/A'} • Plate: ${v.licensePlate || 'N/A'}`,
                    });
                }
            });
        }

        return results.slice(0, 15); // cap at 15 results
    }, [inputValue, allJobs, allStaff, globalJobs, globalCustomers, globalVehicles]);

    useEffect(() => {
        setSelectedIndex(-1);
    }, [inputValue]);

    // Keyboard Shortcut to focus (Ctrl+F or Cmd+F) and list navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                inputRef.current?.focus();
            }
            if (document.activeElement === inputRef.current) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIndex(prev => Math.max(prev - 1, -1));
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [searchResults.length]);

    // Handle Form Submit (often triggered automatically by barcode scanners sending an ENTER keypress)
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        // If there's an active dropdown selection, trigger it
        if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
            const item = searchResults[selectedIndex];
            if (item.type === 'job') onAction('open_job', item.id);
            if (item.type === 'staff') onAction('open_staff', item.id);
            if (item.type === 'customer') onAction('customer', item.id);
            if (item.type === 'vehicle') onAction('vehicle', item.id);
            setInputValue('');
            if (onFilterChange) onFilterChange('');
            inputRef.current?.blur();
            return;
        }

        const val = inputValue.trim();
        
        // Very basic routing rules for the demo 
        if (val.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/i.test(val)) {
            // It's a VIN
            onAction('vehicle', val);
        } else if (val.startsWith('RO-') || val.startsWith('SAE-')) {
            // It's a scanned RO barcode
            onAction('scan', val);
        } else {
            // Treat as customer search / generic lookup
            onAction('customer', val);
        }
        
        setInputValue('');
        if (onFilterChange) onFilterChange('');
        inputRef.current?.blur();
    };    return (
        <div className="w-full relative group z-30 mb-6">
            <div className="flex flex-col md:flex-row gap-3">
                {/* Quick Action Buttons (Mobile: Above, Desktop: Right) */}
                <div className="flex flex-row items-center gap-2 overflow-x-auto hide-scrollbar shrink-0 order-first md:order-last pb-2 md:pb-0 border-b border-zinc-800/50 md:border-transparent">
                    <button 
                        type="button"
                        onClick={() => onAction('estimate')}
                        className="flex items-center gap-2 px-4 py-3 md:py-0 h-full bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 rounded-xl transition-all font-bold text-xs uppercase tracking-widest whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                        <Plus className="w-4 h-4" /> New Estimate
                    </button>
                    
                    <button 
                        type="button"
                        onClick={() => onAction('customer')}
                        className="flex items-center gap-2 px-4 py-3 md:py-0 h-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl transition-all font-bold text-xs uppercase tracking-widest whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    >
                        <UserPlus className="w-4 h-4" /> Walk-In
                    </button>

                    <button 
                        type="button"
                        onClick={() => onAction('vehicle')}
                        className="flex items-center gap-2 px-4 py-3 md:py-0 h-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl transition-all font-bold text-xs uppercase tracking-widest whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    >
                        <Car className="w-4 h-4" /> Intake
                    </button>
                </div>

                {/* Search Input Container */}
                <div className="relative flex-1">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-accent/0 via-accent/20 to-accent/0 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
                    <div className="relative bg-zinc-950/80 backdrop-blur-xl border border-zinc-800/80 focus-within:border-accent/50 rounded-2xl p-2 shadow-lg transition-all duration-300">
                        <form onSubmit={handleSubmit} className="flex items-center relative pl-2">
                            <Search className="w-5 h-5 text-zinc-500" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={(e) => {
                                    setInputValue(e.target.value);
                                    if (onFilterChange) onFilterChange(e.target.value);
                                }}
                                autoFocus
                                placeholder="Scan QR, type a name, VIN, or phone..."
                                className="w-full bg-transparent border-none text-white placeholder-zinc-500 font-medium text-lg px-4 py-3 outline-none focus:ring-0"
                                autoComplete="off"
                                autoCapitalize="off"
                                spellCheck="false"
                            />
                            
                            {/* Shortcut Hint */}
                            <div className="hidden lg:flex items-center gap-1 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                                <kbd className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                                    <Command className="w-3 h-3" /> F
                                </kbd>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
            {/* No secondary buttons here anymore, as they are next to the search bar */}

            {/* Dropdown Menu (Flow Layout) */}
            <div className="mt-4 w-full bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
                {!inputValue.trim() && searchResults.length > 0 && (
                    <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Recent Activity</span>
                    </div>
                )}

                {searchResults.length > 0 ? (
                    <div className="py-2 flex-1 overflow-y-auto max-h-[60vh] hide-scrollbar">
                        {searchResults.map((res, idx) => (
                            <button
                                key={`${res.type}-${res.id}`}
                                onClick={() => {
                                    if (res.type === 'job') onAction('open_job', res.id);
                                    if (res.type === 'staff') onAction('open_staff', res.id);
                                    if (res.type === 'customer') onAction('customer', res.id);
                                    if (res.type === 'vehicle') onAction('vehicle', res.id);
                                    setInputValue('');
                                }}
                                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${idx === selectedIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'}`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${res.type === 'job' ? 'bg-indigo-500/10 text-indigo-500' : res.type === 'staff' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                    {res.type === 'job' ? <Briefcase className="w-4 h-4" /> : res.type === 'staff' ? <User className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-white font-bold text-sm truncate">{res.title}</span>
                                    <span className="text-zinc-500 text-xs truncate">{res.subtitle}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                ) : inputValue.trim().length > 0 ? (
                    <div className="p-8 flex flex-col items-center text-center">
                        <Search className="w-8 h-8 text-zinc-600 mb-3" />
                        <p className="text-zinc-400 font-medium mb-4">No exact matches found for "{inputValue}"</p>
                        <button
                            onClick={() => onAction('customer', inputValue)}
                            className="bg-accent/10 border border-accent/20 hover:bg-accent hover:text-black py-2 px-6 rounded-lg text-accent text-sm font-bold tracking-widest uppercase transition-all"
                        >
                            Start New Intake for "{inputValue}"
                        </button>
                    </div>
                ) : (
                    <div className="p-8 text-center text-zinc-500 text-sm">
                        Loading workspace data...
                    </div>
                )}
            </div>
        </div>
    );
}
