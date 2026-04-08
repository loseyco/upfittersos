import React, { useState, useMemo } from 'react';
import { Search, X, User, Truck, Package, CheckCircle2, ChevronRight, Building, Mail, Phone, Hash, ClipboardList, Info, Wrench } from 'lucide-react';

interface SelectorProps<T> {
    label?: string;
    value: string | string[];
    onChange: (val: string, entity: T | null) => void;
    data: T[];
    disabled?: boolean;
    placeholder?: string;
    trigger?: React.ReactNode;
}

function Highlight({ text, query }: { text: string; query: string }) {
    if (!query) return <>{text}</>;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === query.toLowerCase()
                    ? <span key={i} className="bg-accent/30 text-white font-bold">{part}</span>
                    : <span key={i}>{part}</span>
            )}
        </>
    );
}

// ============================================
// MODAL WRAPPER (Mobile Bottom Sheet / Desktop Modal)
// ============================================
function SelectorModal({
    isOpen,
    onClose,
    title,
    icon: Icon,
    children,
    searchValue,
    onSearchChange,
    hideSearch
}: {
    isOpen: boolean,
    onClose: () => void,
    title: string,
    icon: any,
    children: React.ReactNode,
    searchValue: string,
    onSearchChange: (v: string) => void,
    hideSearch?: boolean
}) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-6 pb-0 tracking-wide">
            {/* Click-away backdrop */}
            <div className="absolute inset-0" onClick={onClose} />

            {/* Modal Content */}
            <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] md:max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-4 duration-300">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-accent/20 rounded-xl">
                            <Icon className="w-5 h-5 text-accent" />
                        </div>
                        <h2 className="text-lg font-bold text-white tracking-wide">{title}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search Bar */}
                {!hideSearch && (
                    <div className="p-4 border-b border-zinc-800 bg-zinc-900/20 shrink-0">
                        <div className="relative">
                            <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                autoFocus
                                placeholder="Type to search..."
                                value={searchValue}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-accent transition-colors shadow-inner"
                            />
                        </div>
                    </div>
                )}

                {/* List Body */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-zinc-950/80">
                    {children}
                </div>

                {/* Safe Area padding for mobile iOS */}
                <div className="h-6 md:hidden bg-zinc-950" />
            </div>
        </div>
    );
}

// ============================================
// COMPONENT: Customer Selector
// ============================================
export function CustomerSelector({ value, onChange, data, disabled, label, placeholder = 'Select a Customer...' }: SelectorProps<any>) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const selected = useMemo(() => data.find(item => item.id === value), [data, value]);

    const filtered = useMemo(() => {
        if (!search) return data;
        const q = search.toLowerCase();
        return data.filter(c =>
            (c.companyName || '').toLowerCase().includes(q) ||
            (c.firstName || '').toLowerCase().includes(q) ||
            (c.lastName || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q)
        );
    }, [data, search]);

    return (
        <div className="w-full">
            {label && <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">{label}</label>}

            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(true)}
                className={`w-full flex items-center justify-between text-left bg-zinc-900 border ${isOpen ? 'border-accent' : 'border-zinc-800'} rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-zinc-600'}`}
            >
                <div className="flex items-center gap-3 truncate">
                    <Building className={`w-4 h-4 shrink-0 ${selected ? 'text-accent' : 'text-zinc-500'}`} />
                    <span className={`truncate ${selected ? 'text-white' : 'text-zinc-500'}`}>
                        {selected ? (selected.companyName || `${selected.firstName} ${selected.lastName}`.trim()) : placeholder}
                    </span>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <SelectorModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Select Customer" icon={Building} searchValue={search} onSearchChange={setSearch}>
                {filtered.length === 0 ? (
                    <div className="text-center p-8 text-zinc-500 italic">No customers found.</div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        <button
                            type="button"
                            onClick={() => { onChange('', null); setIsOpen(false); }}
                            className="text-left w-full p-4 rounded-xl border border-dashed border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-colors"
                        >
                            -- Clear Selection --
                        </button>
                        {filtered.map(c => {
                            const name = c.companyName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed';
                            const isSelected = c.id === value;
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => { onChange(c.id, c); setIsOpen(false); }}
                                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-4 group ${isSelected ? 'bg-accent/10 border-accent/50 shadow-[0_0_15px_rgba(var(--color-accent),0.1)]' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50'}`}
                                >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${isSelected ? 'bg-accent/20 border-accent/30 text-accent' : 'bg-zinc-950 border-zinc-800 text-zinc-500 group-hover:text-zinc-300'}`}>
                                        <Building className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 truncate">
                                        <h4 className="font-bold text-white text-base truncate mb-0.5"><Highlight text={name} query={search} /></h4>
                                        <div className="flex items-center gap-3 text-xs text-zinc-500 truncate">
                                            {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> <Highlight text={c.email} query={search} /></span>}
                                            {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</span>}
                                        </div>
                                    </div>
                                    {isSelected && <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </SelectorModal>
        </div>
    );
}

// ============================================
// COMPONENT: Vehicle Selector
// ============================================
export function VehicleSelector({ value, onChange, data, disabled, label, placeholder = 'Select a Vehicle...' }: SelectorProps<any>) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const selected = useMemo(() => data.find(item => item.id === value), [data, value]);

    const filtered = useMemo(() => {
        if (!search) return data;
        const q = search.toLowerCase();
        return data.filter(v =>
            (v.name || '').toLowerCase().includes(q) ||
            (v.make || '').toLowerCase().includes(q) ||
            (v.model || '').toLowerCase().includes(q) ||
            (v.licensePlate || '').toLowerCase().includes(q) ||
            (v.vin || '').toLowerCase().includes(q)
        );
    }, [data, search]);

    return (
        <div className="w-full">
            {label && <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">{label}</label>}

            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(true)}
                className={`w-full flex items-center justify-between text-left bg-zinc-900 border ${isOpen ? 'border-accent' : 'border-zinc-800'} rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-zinc-600'}`}
            >
                <div className="flex items-center gap-3 truncate">
                    <Truck className={`w-4 h-4 shrink-0 ${selected ? 'text-accent' : 'text-zinc-500'}`} />
                    <span className={`truncate ${selected ? 'text-white' : 'text-zinc-500'}`}>
                        {selected ? (selected.name || `${selected.year || ''} ${selected.make || ''} ${selected.model || ''}`.trim() || selected.id) : placeholder}
                    </span>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>

            <SelectorModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Select Fleet Vehicle" icon={Truck} searchValue={search} onSearchChange={setSearch}>
                {filtered.length === 0 ? (
                    <div className="text-center p-8 text-zinc-500 italic">No vehicles found.</div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        <button
                            type="button"
                            onClick={() => { onChange('', null); setIsOpen(false); }}
                            className="text-left w-full p-4 rounded-xl border border-dashed border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-colors"
                        >
                            -- Clear Selection --
                        </button>
                        {filtered.map(v => {
                            const title = v.name || `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || 'Unknown Vehicle';
                            const isSelected = v.id === value;
                            return (
                                <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => { onChange(v.id, v); setIsOpen(false); }}
                                    className={`w-full text-left p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center gap-4 group ${isSelected ? 'bg-accent/10 border-accent/50 shadow-[0_0_15px_rgba(var(--color-accent),0.1)]' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50'}`}
                                >
                                    <div className="flex items-center gap-4 flex-1 w-full truncate">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${isSelected ? 'bg-accent/20 border-accent/30 text-accent' : 'bg-zinc-950 border-zinc-800 text-zinc-500 group-hover:text-zinc-300'}`}>
                                            <Truck className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1 truncate">
                                            <h4 className="font-bold text-white text-base truncate mb-1"><Highlight text={title} query={search} /></h4>
                                            <div className="flex items-center flex-wrap gap-2 text-xs text-zinc-500 truncate">
                                                {v.licensePlate && <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono border border-zinc-700 tracking-wider"><Highlight text={v.licensePlate} query={search} /></span>}
                                                {v.vin && <span className="flex items-center gap-1 font-mono text-[10px]"><Hash className="w-3 h-3" /> <Highlight text={v.vin.substring(v.vin.length - 8)} query={search} /></span>}
                                            </div>
                                        </div>
                                    </div>
                                    {isSelected && <CheckCircle2 className="w-6 h-6 text-accent shrink-0 hidden md:block" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </SelectorModal>
        </div>
    );
}

// ============================================
// COMPONENT: Staff Selector
// ============================================
export function StaffSelector({ value, onChange, data, disabled, label, trigger, placeholder = 'Assign a Staff Member...' }: SelectorProps<any>) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [previewEntity, setPreviewEntity] = useState<any | null>(null);

    const isMultiMode = Array.isArray(value);

    // Resolve selection
    const selected = useMemo(() => {
        if (isMultiMode) return null;
        return data.find(item => (item.id || item.uid) === value);
    }, [data, value, isMultiMode]);

    // Determine unique id property (id or uid) safely
    const getId = (item: any) => item.uid || item.id || '';

    const filtered = useMemo(() => {
        if (!search) return data;
        const q = search.toLowerCase();
        return data.filter(s =>
            (s.displayName || '').toLowerCase().includes(q) ||
            (s.firstName || '').toLowerCase().includes(q) ||
            (s.lastName || '').toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q) ||
            (s.jobTitle || '').toLowerCase().includes(q) ||
            (s.roles?.join(',') || '').toLowerCase().includes(q)
        );
    }, [data, search]);

    return (
        <div className="w-full">
            {label && !trigger && <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">{label}</label>}

            {trigger ? (
                <div onClick={() => !disabled && setIsOpen(true)} className={`${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    {trigger}
                </div>
            ) : (
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setIsOpen(true)}
                    className={`w-full flex items-center justify-between text-left bg-zinc-900 border ${isOpen ? 'border-accent' : 'border-zinc-800'} rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-zinc-600'}`}
                >
                    <div className="flex items-center gap-3 truncate">
                        {selected?.photoURL ? (
                            <img src={selected.photoURL} alt="avatar" className="w-5 h-5 rounded-full object-cover shrink-0 border border-zinc-700" />
                        ) : (
                            <User className={`w-4 h-4 shrink-0 ${selected ? 'text-accent' : 'text-zinc-500'}`} />
                        )}
                        <span className={`truncate ${selected ? 'text-white font-bold' : 'text-zinc-500'}`}>
                            {selected ? (selected.firstName || selected.lastName ? [selected.firstName, selected.lastName].filter(Boolean).join(' ') : selected.displayName || 'Unnamed User') : placeholder}
                        </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
                </button>
            )}

            <SelectorModal isOpen={isOpen} onClose={() => { setIsOpen(false); setPreviewEntity(null); }} title="Assign Personnel" icon={User} searchValue={search} onSearchChange={setSearch} hideSearch={!!previewEntity}>
                {previewEntity ? (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 border-b border-zinc-800 pb-6">
                            <div className="w-20 h-20 shrink-0">
                                {previewEntity.photoURL ? (
                                    <img src={previewEntity.photoURL} alt="Avatar" className="w-full h-full rounded-2xl object-cover border-4 border-zinc-800" />
                                ) : (
                                    <div className="w-full h-full rounded-2xl flex items-center justify-center border-4 border-zinc-800 bg-zinc-900 text-zinc-500">
                                        <User className="w-10 h-10" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-2xl font-black text-white tracking-tight">{previewEntity.firstName || previewEntity.lastName ? [previewEntity.firstName, previewEntity.lastName].filter(Boolean).join(' ') : previewEntity.displayName || 'Unnamed User'}</h3>
                                {previewEntity.jobTitle && <p className="text-zinc-400 font-bold tracking-wide text-sm">{previewEntity.jobTitle}</p>}
                                <div className="flex gap-2 mt-2">
                                    {(previewEntity.roles || []).map((r: string) => (
                                        <span key={r} className="bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">{r.replace('_', ' ')}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                                    <span className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 group-hover:text-zinc-400">Email Address</span>
                                    <p className="text-sm font-medium text-white truncate">{previewEntity.email || 'N/A'}</p>
                                </div>
                                <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                                    <span className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 group-hover:text-zinc-400">Phone Number</span>
                                    <p className="text-sm font-medium text-white truncate">{previewEntity.phone || 'N/A'}</p>
                                </div>
                            </div>
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                                <span className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 group-hover:text-zinc-400">Active Certifications (Mock)</span>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <span className="bg-zinc-950 border border-zinc-800 text-zinc-400 px-3 py-1 rounded-lg">Level 2 EV Certified</span>
                                    <span className="bg-zinc-950 border border-zinc-800 text-zinc-400 px-3 py-1 rounded-lg">Safety Certified</span>
                                </div>
                            </div>
                        </div>
                        <div className="pt-4 flex items-center justify-between gap-4">
                            <button onClick={() => setPreviewEntity(null)} className="px-6 py-3 rounded-xl font-bold text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                                &larr; Back to List
                            </button>
                            <button
                                onClick={() => {
                                    onChange(getId(previewEntity), previewEntity);
                                    if (!isMultiMode) setIsOpen(false);
                                    setPreviewEntity(null);
                                }}
                                className="flex-1 bg-accent hover:bg-accent-hover text-white font-black px-6 py-3 rounded-xl tracking-wide transition-all active:scale-95 text-center shadow-lg shadow-accent/20"
                            >
                                {(isMultiMode && (value as string[]).includes(getId(previewEntity))) ? '✓ Assigned (Tap to Remove)' : 'Assign Personnel'}
                            </button>
                        </div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center p-8 text-zinc-500 italic">No staff found.</div>
                ) : (
                    <div className="flex flex-col h-full">
                        <div className="grid grid-cols-1 gap-3 flex-1 pb-4">
                            {!isMultiMode && (
                                <button
                                    type="button"
                                    onClick={() => { onChange('', null); setIsOpen(false); }}
                                    className="text-left w-full p-4 rounded-xl border border-dashed border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-colors"
                                >
                                    -- Clear Selection --
                                </button>
                            )}
                            {filtered.map(s => {
                                const name = s.firstName || s.lastName ? [s.firstName, s.lastName].filter(Boolean).join(' ') : s.displayName || 'Unnamed User';
                                const isSelected = isMultiMode ? (value as string[]).includes(getId(s)) : getId(s) === value;
                                return (
                                    <div key={getId(s)} className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-4 group ${isSelected ? 'bg-accent/10 border-accent/50 shadow-[0_0_15px_rgba(var(--color-accent),0.1)]' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50'}`}>
                                        <div
                                            onClick={() => {
                                                onChange(getId(s), s);
                                                if (!isMultiMode) setIsOpen(false);
                                            }}
                                            className="flex items-center gap-4 flex-1 cursor-pointer"
                                        >
                                            <div className="relative w-12 h-12 shrink-0">
                                                {s.photoURL ? (
                                                    <img src={s.photoURL} alt="Avatar" className="w-12 h-12 rounded-full object-cover border-2 border-zinc-800" />
                                                ) : (
                                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 border-zinc-800 ${isSelected ? 'bg-accent/20 text-accent' : 'bg-zinc-950 text-zinc-500 group-hover:text-zinc-300'}`}>
                                                        <User className="w-6 h-6" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 truncate">
                                                <h4 className="font-bold text-white text-base truncate mb-0.5"><Highlight text={name} query={search} /></h4>
                                                <div className="flex items-center flex-wrap gap-2 text-xs text-zinc-500 truncate">
                                                    {s.jobTitle && <span className="text-zinc-400 font-medium">{s.jobTitle}</span>}
                                                    {s.roles && s.roles.length > 0 && <span className="bg-zinc-800 px-2 py-0.5 rounded uppercase text-[9px] font-black border border-zinc-700 tracking-wider text-accent">{s.roles[0].replace('_', ' ')}</span>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 shrink-0">
                                            {isSelected && <CheckCircle2 className="w-5 h-5 text-accent" />}
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setPreviewEntity(s); }}
                                                className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors border border-zinc-700"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {isMultiMode && (
                            <div className="pt-4 mt-auto border-t border-zinc-800 sticky bottom-0 bg-zinc-950 shadow-[0_-15px_30px_-15px_rgba(0,0,0,0.5)]">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="w-full bg-accent hover:bg-accent-hover text-white font-black px-4 py-3 rounded-xl tracking-wide transition-colors active:scale-95"
                                >
                                    Done
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </SelectorModal>
        </div>
    );
}

// ============================================
// COMPONENT: Inventory / Parts Selector
// ============================================
interface InventorySelectorProps extends SelectorProps<any> {
    alreadyInTaskIds?: string[];
    autoOpen?: boolean;
}

export function InventorySelector({ value, onChange, data, disabled, label, placeholder = 'Search Inventory...', alreadyInTaskIds = [], autoOpen = false }: InventorySelectorProps) {
    const [isOpen, setIsOpen] = useState(autoOpen);
    const [search, setSearch] = useState('');
    const [previewEntity, setPreviewEntity] = useState<any | null>(null);

    const selected = useMemo(() => data.find(item => item.id === value), [data, value]);

    const filtered = useMemo(() => {
        if (!search) return data;
        const q = search.toLowerCase();
        return data.filter(i =>
            (i.name || '').toLowerCase().includes(q) ||
            (i.sku || '').toLowerCase().includes(q) ||
            (i.internalCode || '').toLowerCase().includes(q) ||
            (i.brand || '').toLowerCase().includes(q)
        );
    }, [data, search]);

    return (
        <div className="w-full">
            {label && <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">{label}</label>}

            <div
                onClick={() => !disabled && setIsOpen(true)}
                className={`w-full flex items-center gap-3 bg-zinc-900 border ${isOpen ? 'border-accent' : 'border-zinc-800'} rounded-xl px-4 py-3 focus-within:border-accent transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-zinc-600 cursor-text'}`}
            >
                <div onClick={(e) => { e.stopPropagation(); setIsOpen(true); }} className="flex-1 truncate relative">
                    {selected ? (
                        <div className="flex items-center gap-2 truncate text-sm">
                            <span className="font-bold text-white truncate">{selected.name}</span>
                            {selected.sku && <span className="text-xs text-zinc-500 font-mono tracking-wider ml-2">{selected.sku}</span>}
                        </div>
                    ) : (
                        <span className="text-zinc-500 text-sm truncate">{placeholder}</span>
                    )}
                </div>
                {!selected && <Search className="w-4 h-4 text-zinc-600 shrink-0" />}
            </div>

            <SelectorModal isOpen={isOpen} onClose={() => { setIsOpen(false); setPreviewEntity(null); }} title="Inventory Stock" icon={Package} searchValue={search} onSearchChange={setSearch} hideSearch={!!previewEntity}>
                {previewEntity ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="flex items-start gap-6 border-b border-zinc-800 pb-6">
                            <div className="w-24 h-24 rounded-2xl bg-zinc-900 border-4 border-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                                <Package className="w-10 h-10" />
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <h3 className="text-2xl font-black text-white tracking-tight leading-tight">{previewEntity.name}</h3>
                                    <span className="text-2xl font-black text-emerald-400 font-mono tracking-tighter">${Number(previewEntity.price || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {previewEntity.sku && <span className="bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest">{previewEntity.sku}</span>}
                                    {previewEntity.brand && <span className="bg-accent/10 border border-accent/20 text-accent px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest">{previewEntity.brand}</span>}
                                    {previewEntity.type && <span className="bg-zinc-800/50 border border-zinc-800 text-zinc-500 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest">{previewEntity.type}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                                <span className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Manufacturer SKU</span>
                                <p className="text-sm font-bold text-white font-mono">{previewEntity.sku || 'UNREADABLE'}</p>
                            </div>
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                                <span className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Brand/Supplier</span>
                                <p className="text-sm font-bold text-white">{previewEntity.brand || 'SAE GENERIC'}</p>
                            </div>
                        </div>

                        {previewEntity.description && (
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                                <span className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Technical Description</span>
                                <p className="text-sm text-zinc-300 leading-relaxed">{previewEntity.description}</p>
                            </div>
                        )}

                        <div className="pt-6 border-t border-zinc-800 flex items-center justify-between gap-4">
                            <button onClick={() => setPreviewEntity(null)} className="px-6 py-3 rounded-xl font-bold text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                                &larr; Back to Results
                            </button>
                            <button
                                onClick={() => {
                                    onChange(previewEntity.id, previewEntity);
                                    setIsOpen(false);
                                    setPreviewEntity(null);
                                }}
                                className="flex-1 bg-accent hover:bg-accent-hover text-white font-black px-6 py-4 rounded-2xl tracking-wide transition-all active:scale-95 text-center shadow-lg shadow-accent/20 text-lg"
                            >
                                Select Item
                            </button>
                        </div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center p-8 text-zinc-500 italic">
                        No inventory items found matching "{search}".<br />
                        <button onClick={() => { onChange('custom', null); setIsOpen(false); }} className="mt-4 text-accent hover:underline font-bold text-sm">Enter Custom / Unlisted Part instead</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        <button
                            type="button"
                            onClick={() => { onChange('custom', null); setIsOpen(false); }}
                            className="text-left w-full p-4 rounded-xl border border-dashed border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors flex items-center justify-between group"
                        >
                            <span>-- Use Custom/Unlisted Part --</span>
                            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-accent" />
                        </button>

                        {filtered.map(item => {
                            const isSelected = item.id === value;
                            const isDuplicate = alreadyInTaskIds.includes(item.id);

                            return (
                                <div
                                    key={item.id}
                                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-4 group cursor-pointer ${isSelected ? 'bg-accent/10 border-accent/50 shadow-[0_0_15px_rgba(var(--color-accent),0.1)]' : isDuplicate ? 'bg-amber-500/5 border-amber-500/20 opacity-80' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50'}`}
                                    onClick={() => { onChange(item.id, item); setIsOpen(false); }}
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border mt-1 ${isSelected ? 'bg-accent/20 border-accent/30 text-accent' : 'bg-zinc-950 border-zinc-800 text-zinc-500 group-hover:text-zinc-300'}`}>
                                        <Package className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 truncate space-y-1">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 truncate">
                                                <h4 className="font-bold text-white text-base truncate leading-tight"><Highlight text={item.name || 'Unnamed Item'} query={search} /></h4>
                                                {isDuplicate && <span className="inline-block text-[10px] font-black uppercase tracking-widest text-amber-500 mt-1">Already in this Work Order</span>}
                                            </div>
                                            <span className="font-mono text-emerald-400 font-bold bg-emerald-400/10 px-2 py-0.5 rounded text-sm shrink-0 whitespace-nowrap">${Number(item.price || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center flex-wrap gap-2 text-xs text-zinc-500 truncate">
                                            {item.sku && <span className="font-mono tracking-widest uppercase text-[10px] text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800"><Highlight text={item.sku} query={search} /></span>}
                                            {item.brand && <span>Brand: <span className="text-zinc-300">{item.brand}</span></span>}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setPreviewEntity(item); }}
                                        className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors border border-zinc-700 mt-1"
                                    >
                                        <Info className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </SelectorModal>
        </div>
    );
}

// ============================================
// COMPONENT: Task Template Selector
// ============================================
interface TaskTemplateSelectorProps {
    data: any[];
    onSelect: (template: any) => void;
    trigger: React.ReactNode;
    disabled?: boolean;
}

export function TaskTemplateSelector({ data, onSelect, trigger, disabled }: TaskTemplateSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [previewEntity, setPreviewEntity] = useState<any | null>(null);

    const filtered = useMemo(() => {
        if (!search) return data;
        const q = search.toLowerCase();
        return data.filter(i =>
            (i.title || '').toLowerCase().includes(q) ||
            (i.description || '').toLowerCase().includes(q) ||
            (i.name || '').toLowerCase().includes(q)
        );
    }, [data, search]);

    return (
        <>
            <div onClick={() => !disabled && setIsOpen(true)}>
                {trigger}
            </div>
            <SelectorModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title="Task Templates"
                icon={ClipboardList}
                searchValue={search}
                onSearchChange={setSearch}
                hideSearch={!!previewEntity}
            >
                {previewEntity ? (
                    <div className="p-6 md:p-8 animate-in fade-in duration-200">
                        <div className="flex items-start gap-6">
                            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 shadow-lg">
                                <Wrench className="w-8 h-8 text-indigo-400" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-2xl font-black text-white">{previewEntity.title || previewEntity.name}</h2>
                                <div className="flex items-center gap-4 mt-2">
                                    {previewEntity.bookTime && <span className="font-mono text-xs font-black uppercase tracking-widest text-zinc-400 bg-zinc-900 px-3 py-1 rounded-lg border border-zinc-800">{previewEntity.bookTime} HRs</span>}
                                    {previewEntity.laborRate && <span className="font-mono text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-lg border border-emerald-400/20">${previewEntity.laborRate}/hr</span>}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 mt-8">
                            {previewEntity.description && (
                                <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Description</label>
                                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{previewEntity.description}</p>
                                </div>
                            )}
                            
                            {(previewEntity.notes || previewEntity.sops || previewEntity.techDirections || previewEntity.directions || (previewEntity.parts && previewEntity.parts.length > 0)) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                    {(previewEntity.parts && previewEntity.parts.length > 0) && (
                                        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50 md:col-span-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">Included Parts / Kit</label>
                                            <div className="space-y-2">
                                                {previewEntity.parts.map((p: any, i: number) => (
                                                    <div key={i} className="flex flex-wrap items-center justify-between gap-4 p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                                                        <div className="flex items-center gap-3">
                                                            <Package className="w-4 h-4 text-zinc-600" />
                                                            <div className="text-sm font-bold text-zinc-300">{p.name || 'Unnamed Part'}</div>
                                                            {p.sku && <span className="text-[9px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">{p.sku}</span>}
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-xs text-zinc-500 font-mono tracking-widest">QTY: <span className="font-bold text-white text-sm">{p.quantity || 1}</span></span>
                                                            <span className="text-emerald-500 font-mono text-sm font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">${p.price || '0.00'}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {previewEntity.notes && (
                                        <div className="bg-zinc-900/50 p-4 rounded-xl border border-indigo-500/10">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2 block">Scope Notes</label>
                                            <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{previewEntity.notes}</p>
                                        </div>
                                    )}
                                    {previewEntity.sops && (
                                        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">SOPs</label>
                                            <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{previewEntity.sops}</p>
                                        </div>
                                    )}
                                    {(previewEntity.techDirections || previewEntity.directions) && (
                                        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50 md:col-span-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Tech Directions</label>
                                            <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{previewEntity.techDirections || previewEntity.directions}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="pt-6 mt-8 border-t border-zinc-800 flex items-center justify-between gap-4">
                            <button onClick={() => setPreviewEntity(null)} className="px-6 py-3 rounded-xl font-bold text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                                &larr; Back to Results
                            </button>
                            <button
                                onClick={() => {
                                    onSelect(previewEntity);
                                    setIsOpen(false);
                                    setPreviewEntity(null);
                                }}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black px-6 py-4 rounded-2xl tracking-wide transition-all active:scale-95 text-center shadow-lg shadow-indigo-600/20 text-lg"
                            >
                                Use Template
                            </button>
                        </div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 font-medium text-sm border-2 border-dashed border-zinc-800 rounded-xl m-4">
                        No task templates match your search.
                    </div>
                ) : (
                    <div className="p-2 space-y-1">
                        {filtered.map(template => (
                            <div
                                key={template.id}
                                onClick={() => {
                                    onSelect(template);
                                    setIsOpen(false);
                                    setSearch('');
                                }}
                                className="w-full text-left p-4 rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-between gap-4 group cursor-pointer border border-transparent hover:border-zinc-700"
                            >
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0">
                                        <Wrench className="w-5 h-5 text-zinc-400 group-hover:text-indigo-400 transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-white text-base truncate">{template.title || template.name}</div>
                                        {template.description && <div className="text-xs text-zinc-400 line-clamp-2 mt-0.5 leading-relaxed">{template.description}</div>}
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-4 shrink-0">
                                    <div className="shrink-0 flex flex-col items-end">
                                        {template.bookTime && <div className="text-xs font-mono text-zinc-500 font-black">{template.bookTime} HR</div>}
                                        {template.laborRate && <div className="text-xs font-mono text-emerald-500">${template.laborRate}/hr</div>}
                                    </div>
                                    
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setPreviewEntity(template); }}
                                        className="p-2 bg-zinc-900 hover:bg-indigo-600/10 text-zinc-400 hover:text-indigo-400 rounded-lg transition-colors border border-zinc-800 hover:border-indigo-500/30"
                                        title="View Details"
                                    >
                                        <Info className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </SelectorModal>
        </>
    );
}
