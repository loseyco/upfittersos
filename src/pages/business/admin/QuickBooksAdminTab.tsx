import { useState, useEffect } from 'react';
import { Database, RefreshCw, Box, Users, Search, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

export function QuickBooksAdminTab({ tenantId }: { tenantId: string }) {
    const [activeSubTab, setActiveSubTab] = useState<'items' | 'customers' | 'accounts' | 'vendors' | 'employees' | 'estimates' | 'invoices' | 'pos' | 'bills'>('items');
    
    const [qbItems, setQbItems] = useState<any[]>([]);
    const [qbCustomers, setQbCustomers] = useState<any[]>([]);
    const [qbVendors, setQbVendors] = useState<any[]>([]);
    const [qbEmployees, setQbEmployees] = useState<any[]>([]);
    const [qbEstimates, setQbEstimates] = useState<any[]>([]);
    const [qbInvoices, setQbInvoices] = useState<any[]>([]);
    const [qbPurchaseOrders, setQbPurchaseOrders] = useState<any[]>([]);
    const [qbBills, setQbBills] = useState<any[]>([]);
    
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

    useEffect(() => {
        if (!tenantId || tenantId === 'unassigned') return;

        setLoading(true);
        let itemsLoaded = false;
        let customersLoaded = false;

        const checkDone = () => {
            if (itemsLoaded && customersLoaded) {
                setLoading(false);
            }
        };

        const unsubItems = onSnapshot(collection(db, `businesses/${tenantId}/qb_items`), (snapshot) => {
            setQbItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            itemsLoaded = true;
            checkDone();
        });

        const unsubCustomers = onSnapshot(collection(db, `businesses/${tenantId}/qb_customers`), (snapshot) => {
            setQbCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            customersLoaded = true;
            checkDone();
        });

        const unsubVendors = onSnapshot(collection(db, `businesses/${tenantId}/qb_vendors`), (snapshot) => {
            setQbVendors(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubEmployees = onSnapshot(collection(db, `businesses/${tenantId}/qb_employees`), (snapshot) => {
            setQbEmployees(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubEstimates = onSnapshot(collection(db, `businesses/${tenantId}/qb_estimates`), (snapshot) => {
            setQbEstimates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubInvoices = onSnapshot(collection(db, `businesses/${tenantId}/qb_invoices`), (snapshot) => {
            setQbInvoices(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubPOs = onSnapshot(collection(db, `businesses/${tenantId}/qb_purchase_orders`), (snapshot) => {
            setQbPurchaseOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubBills = onSnapshot(collection(db, `businesses/${tenantId}/qb_bills`), (snapshot) => {
            setQbBills(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubBusiness = onSnapshot(doc(db, `businesses/${tenantId}`), (docSnap) => {
            if (docSnap.exists()) {
                setLastSyncTime(docSnap.data()?.lastQbSyncTime || null);
            }
        });

        return () => {
            unsubItems();
            unsubCustomers();
            unsubVendors();
            unsubEmployees();
            unsubEstimates();
            unsubInvoices();
            unsubPOs();
            unsubBills();
            unsubBusiness();
        };
    }, [tenantId]);

    const generateAndDownloadQWC = () => {
        window.location.href = `https://us-central1-saegroup-c6487.cloudfunctions.net/api/qbwc/download/${tenantId}`;
    };

    const filteredItems = qbItems.filter(i => 
        (i.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (i.fullName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredCustomers = qbCustomers.filter(c => 
        (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (c.fullName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredVendors = qbVendors.filter(v => (v.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredEmployees = qbEmployees.filter(e => (e.name || '').toLowerCase().includes(searchQuery.toLowerCase()));
    
    const filteredEstimates = qbEstimates.filter(e => (e.refNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) || (e.customerName || '').toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredInvoices = qbInvoices.filter(i => (i.refNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) || (i.customerName || '').toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredPOs = qbPurchaseOrders.filter(p => (p.refNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) || (p.vendorName || '').toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredBills = qbBills.filter(b => (b.refNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) || (b.vendorName || '').toLowerCase().includes(searchQuery.toLowerCase()));

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center flex items-center justify-center gap-2"><RefreshCw className="w-5 h-5 animate-spin"/> Syncing Extracted Data...</div>;
    }

    return (
        <div className="flex flex-col h-full bg-zinc-950 overflow-hidden w-full relative">
            {/* Header */}
            <div className="p-4 md:p-6 bg-zinc-900 border-b border-zinc-800 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4 z-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Database className="w-6 h-6 text-blue-500" />
                        <h2 className="text-xl font-black text-white tracking-tight">QuickBooks Sync Staging</h2>
                        <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ml-2">
                            Read-Only
                        </span>
                    </div>
                    <p className="text-zinc-500 text-xs mt-1 max-w-xl">
                        This is an isolated sandbox view of all raw records mapped from the local QuickBooks Enterprise Web Connector. 
                        These records are safely staged away from the actual application database.
                    </p>
                    {lastSyncTime && (
                        <p className="text-zinc-400 text-xs mt-2 inline-flex items-center gap-1 font-medium bg-zinc-950 px-2 py-1 rounded border border-zinc-800 w-fit">
                            <RefreshCw className="w-3 h-3" />
                            Last Synced: {new Date(lastSyncTime).toLocaleString()}
                        </p>
                    )}
                    <div className="flex gap-4">
                        <button 
                            onClick={generateAndDownloadQWC}
                            className="mt-4 flex items-center gap-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 border border-blue-500/20 px-3 py-1.5 rounded text-xs font-bold transition-colors w-fit"
                        >
                            <Download className="w-4 h-4" />
                            Download Web Connector (.qwc)
                        </button>
                        <button 
                            onClick={async () => {
                                if (confirm('Are you sure you want to WIPE all extracted QuickBooks data and reset the sync timer? This will pull a fresh initialization batch next time the connector runs.')) {
                                    try {
                                        const res = await fetch(`https://us-central1-saegroup-c6487.cloudfunctions.net/api/qbwc/reset?tenantId=${tenantId}`);
                                        if (!res.ok) {
                                            const txt = await res.text();
                                            throw new Error(txt);
                                        }
                                        alert('Database successfully wiped and timer reset!');
                                    } catch (e: any) {
                                        console.error(e);
                                        alert('Failed to wipe database: ' + e.message);
                                    }
                                }
                            }}
                            className="mt-4 flex items-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded text-xs font-bold transition-colors w-fit"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Wipe Database & Reset Sync
                        </button>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 w-full md:w-64">
                    <Search className="w-4 h-4 text-zinc-500" />
                    <input 
                        type="text" 
                        placeholder="Filter records..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none text-sm text-white focus:outline-none w-full placeholder:text-zinc-600"
                    />
                </div>
            </div>

            {/* Inner Tabs */}
            <div className="px-6 flex items-center gap-6 border-b border-zinc-800 shrink-0 overflow-x-auto no-scrollbar bg-zinc-900/50">
                <button 
                    onClick={() => setActiveSubTab('items')} 
                    className={`py-4 text-sm font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeSubTab === 'items' ? 'border-accent text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    <Box className="w-4 h-4" /> Parts & Assemblies <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-[4px] text-[10px] ml-1">{qbItems.length}</span>
                </button>
                <button 
                    onClick={() => setActiveSubTab('customers')} 
                    className={`py-4 text-sm font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeSubTab === 'customers' ? 'border-accent text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    <Users className="w-4 h-4" /> Customers & Jobs <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-[4px] text-[10px] ml-1">{qbCustomers.length}</span>
                </button>
                <div className="w-[1px] h-6 bg-zinc-800 shrink-0 mx-2" />
                <button 
                    onClick={() => setActiveSubTab('estimates')} 
                    className={`py-4 text-sm font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeSubTab === 'estimates' ? 'border-amber-500 text-amber-500' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    Estimates <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-[4px] text-[10px] ml-1">{qbEstimates.length}</span>
                </button>
                <button 
                    onClick={() => setActiveSubTab('invoices')} 
                    className={`py-4 text-sm font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeSubTab === 'invoices' ? 'border-emerald-500 text-emerald-500' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    Invoices <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-[4px] text-[10px] ml-1">{qbInvoices.length}</span>
                </button>
                <button 
                    onClick={() => setActiveSubTab('pos')} 
                    className={`py-4 text-sm font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeSubTab === 'pos' ? 'border-sky-500 text-sky-500' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    Purchase Orders <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-[4px] text-[10px] ml-1">{qbPurchaseOrders.length}</span>
                </button>
                <button 
                    onClick={() => setActiveSubTab('bills')} 
                    className={`py-4 text-sm font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeSubTab === 'bills' ? 'border-rose-500 text-rose-500' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    Bills <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-[4px] text-[10px] ml-1">{qbBills.length}</span>
                </button>
                <div className="w-[1px] h-6 bg-zinc-800 shrink-0 mx-2" />
                <button 
                    onClick={() => setActiveSubTab('vendors')} 
                    className={`py-4 text-sm font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeSubTab === 'vendors' ? 'border-purple-500 text-purple-500' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    Vendors <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-[4px] text-[10px] ml-1">{qbVendors.length}</span>
                </button>
                <button 
                    onClick={() => setActiveSubTab('employees')} 
                    className={`py-4 text-sm font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeSubTab === 'employees' ? 'border-purple-500 text-purple-500' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    Employees <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-[4px] text-[10px] ml-1">{qbEmployees.length}</span>
                </button>
            </div>

            {/* Content Display */}
            <div className="flex-1 overflow-y-auto">
                <div className="divide-y divide-zinc-800/50">
                    
                    {/* ITEMS */}
                    {activeSubTab === 'items' && filteredItems.map((item) => (
                        <div key={item.id} className="flex flex-col border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 transition-colors">
                            <div 
                                className="grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer group"
                                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                            >
                                <div className="col-span-11 md:col-span-5 flex flex-col">
                                    <span className="font-bold text-sm text-zinc-200">{item.name}</span>
                                    {item.fullName !== item.name && <span className="text-[10px] text-zinc-500 mt-0.5 break-words">{item.fullName}</span>}
                                </div>
                                <div className="hidden md:flex col-span-2">
                                    <span className="px-2 py-1 bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 text-[10px] font-black uppercase tracking-widest rounded">
                                        {item.itemType || 'Unknown'}
                                    </span>
                                </div>
                                <div className="hidden md:flex col-span-2">
                                    <span className={`text-xs font-bold font-mono ${item.quantityOnHand < 0 ? 'text-red-400' : 'text-blue-400'}`}>
                                        Qty: {item.quantityOnHand || 0}
                                    </span>
                                </div>
                                <div className="col-span-1 md:col-span-2 text-right">
                                    <span className="text-sm font-mono font-bold text-emerald-400">
                                        ${Number(item.price || 0).toFixed(2)}
                                    </span>
                                </div>
                                <div className="hidden md:flex col-span-1 justify-end text-zinc-600 group-hover:text-zinc-300 transition-colors">
                                    {expandedId === item.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </div>
                            </div>
                            {expandedId === item.id && (
                                <div className="px-6 py-4 bg-black/80 border-t border-zinc-800 overflow-x-auto shadow-inner">
                                    <pre className="text-xs text-sky-400/80 font-mono leading-relaxed">
                                        {JSON.stringify(Object.fromEntries(Object.entries(item).filter(([k]) => !['id', 'tenantId'].includes(k))), null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* CUSTOMERS */}
                    {activeSubTab === 'customers' && filteredCustomers.map((cust) => (
                        <div key={cust.id} className="flex flex-col border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 transition-colors">
                            <div 
                                className="grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer group"
                                onClick={() => setExpandedId(expandedId === cust.id ? null : cust.id)}
                            >
                                <div className="col-span-11 md:col-span-5 flex flex-col">
                                    <span className="font-bold text-sm text-zinc-200">{cust.fullName}</span>
                                    {cust.companyName !== cust.fullName && <span className="text-xs text-zinc-500 mt-0.5">{cust.companyName}</span>}
                                </div>
                                <div className="hidden md:flex flex-col gap-0.5 col-span-3">
                                    {cust.email && <span className="text-xs text-zinc-400">{cust.email}</span>}
                                    {cust.phone && <span className="text-xs text-zinc-500 font-mono">{cust.phone}</span>}
                                </div>
                                <div className="hidden md:flex col-span-3 text-right flex-col items-end">
                                    <span className="text-[10px] uppercase font-black text-zinc-600 mb-0.5">Balance</span>
                                    <span className={`text-sm font-mono font-bold ${cust.balance > 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                                        ${Number(cust.balance || 0).toFixed(2)}
                                    </span>
                                </div>
                                <div className="col-span-1 md:col-span-1 flex justify-end text-zinc-600 group-hover:text-zinc-300 transition-colors">
                                    {expandedId === cust.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </div>
                            </div>
                            {expandedId === cust.id && (
                                <div className="px-6 py-4 bg-black/80 border-t border-zinc-800 overflow-x-auto shadow-inner">
                                    <pre className="text-xs text-sky-400/80 font-mono leading-relaxed">
                                        {JSON.stringify(Object.fromEntries(Object.entries(cust).filter(([k]) => !['id', 'tenantId'].includes(k))), null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    ))}


                    {/* VENDORS */}
                    {activeSubTab === 'vendors' && filteredVendors.map((v) => (
                        <div key={v.id} className="flex flex-col border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 transition-colors">
                            <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer group" onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}>
                                <div className="col-span-11 md:col-span-6 flex flex-col">
                                    <span className="font-bold text-sm text-zinc-200">{v.fullName}</span>
                                </div>
                                <div className="hidden md:flex col-span-5 text-right flex-col items-end">
                                    <span className="text-[10px] uppercase font-black text-zinc-600 mb-0.5">Balance</span>
                                    <div className="text-sm font-mono font-bold text-red-400">${Number(v.balance || 0).toFixed(2)}</div>
                                </div>
                                <div className="col-span-1 flex justify-end text-zinc-600 group-hover:text-zinc-300 transition-colors">
                                    {expandedId === v.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </div>
                            </div>
                            {expandedId === v.id && (
                                <div className="px-6 py-4 bg-black/80 border-t border-zinc-800 overflow-x-auto shadow-inner"><pre className="text-xs text-sky-400/80 font-mono leading-relaxed">{JSON.stringify(Object.fromEntries(Object.entries(v).filter(([k]) => !['id', 'tenantId'].includes(k))), null, 2)}</pre></div>
                            )}
                        </div>
                    ))}

                    {/* EMPLOYEES */}
                    {activeSubTab === 'employees' && filteredEmployees.map((emp) => (
                        <div key={emp.id} className="flex flex-col border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 transition-colors">
                            <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer group" onClick={() => setExpandedId(expandedId === emp.id ? null : emp.id)}>
                                <div className="col-span-11 md:col-span-6 flex flex-col">
                                    <span className="font-bold text-sm text-zinc-200">{emp.name}</span>
                                </div>
                                <div className="hidden md:flex col-span-5 text-right flex-col items-end">
                                    <span className="text-xs text-zinc-500 font-mono">{emp.phone}</span>
                                </div>
                                <div className="col-span-1 flex justify-end text-zinc-600 group-hover:text-zinc-300 transition-colors">
                                    {expandedId === emp.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </div>
                            </div>
                            {expandedId === emp.id && (
                                <div className="px-6 py-4 bg-black/80 border-t border-zinc-800 overflow-x-auto shadow-inner"><pre className="text-xs text-sky-400/80 font-mono leading-relaxed">{JSON.stringify(Object.fromEntries(Object.entries(emp).filter(([k]) => !['id', 'tenantId'].includes(k))), null, 2)}</pre></div>
                            )}
                        </div>
                    ))}

                    {/* ESTIMATES */}
                    {activeSubTab === 'estimates' && filteredEstimates.map((est) => (
                        <div key={est.id} className="flex flex-col border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 transition-colors">
                            <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer group" onClick={() => setExpandedId(expandedId === est.id ? null : est.id)}>
                                <div className="col-span-11 md:col-span-6 flex flex-col">
                                    <span className="font-bold text-sm text-amber-500">EST #{est.refNumber || est.txnId.substring(0,8)}</span>
                                    <span className="text-xs text-zinc-400 mt-0.5">{est.customerName}</span>
                                </div>
                                <div className="hidden md:flex col-span-5 text-right flex-col items-end">
                                    <div className="text-sm font-mono font-bold text-zinc-300">${Number(est.totalAmount || 0).toFixed(2)}</div>
                                    <div className="text-[10px] text-zinc-500 uppercase mt-0.5">{est.txnDate}</div>
                                </div>
                                <div className="col-span-1 flex justify-end text-zinc-600 group-hover:text-zinc-300 transition-colors">
                                    {expandedId === est.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </div>
                            </div>
                            {expandedId === est.id && (
                                <div className="px-6 py-4 bg-black/80 border-t border-zinc-800 overflow-x-auto shadow-inner"><pre className="text-xs text-sky-400/80 font-mono leading-relaxed">{JSON.stringify(Object.fromEntries(Object.entries(est).filter(([k]) => !['id', 'tenantId'].includes(k))), null, 2)}</pre></div>
                            )}
                        </div>
                    ))}

                    {/* INVOICES */}
                    {activeSubTab === 'invoices' && filteredInvoices.map((inv) => (
                        <div key={inv.id} className="flex flex-col border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 transition-colors">
                            <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer group" onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}>
                                <div className="col-span-11 md:col-span-6 flex flex-col">
                                    <span className="font-bold text-sm text-emerald-500">INV #{inv.refNumber || inv.txnId.substring(0,8)}</span>
                                    <span className="text-xs text-zinc-400 mt-0.5">{inv.customerName}</span>
                                </div>
                                <div className="hidden md:flex col-span-5 text-right flex-col items-end">
                                    <div className="text-sm font-mono font-bold text-zinc-300">${Number(inv.subtotal || 0).toFixed(2)}</div>
                                    <div className="text-[10px] text-emerald-500/50 uppercase mt-0.5">{inv.balanceRemaining === 0 ? 'PAID' : `Balance: $${inv.balanceRemaining}`}</div>
                                </div>
                                <div className="col-span-1 flex justify-end text-zinc-600 group-hover:text-zinc-300 transition-colors">
                                    {expandedId === inv.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </div>
                            </div>
                            {expandedId === inv.id && (
                                <div className="px-6 py-4 bg-black/80 border-t border-zinc-800 overflow-x-auto shadow-inner"><pre className="text-xs text-sky-400/80 font-mono leading-relaxed">{JSON.stringify(Object.fromEntries(Object.entries(inv).filter(([k]) => !['id', 'tenantId'].includes(k))), null, 2)}</pre></div>
                            )}
                        </div>
                    ))}

                    {/* PURCHASE ORDERS */}
                    {activeSubTab === 'pos' && filteredPOs.map((po) => (
                        <div key={po.id} className="flex flex-col border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 transition-colors">
                            <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer group" onClick={() => setExpandedId(expandedId === po.id ? null : po.id)}>
                                <div className="col-span-11 md:col-span-6 flex flex-col">
                                    <span className="font-bold text-sm text-sky-500">PO #{po.refNumber || po.txnId.substring(0,8)}</span>
                                    <span className="text-xs text-zinc-400 mt-0.5">{po.vendorName}</span>
                                </div>
                                <div className="hidden md:flex col-span-5 text-right flex-col items-end">
                                    <div className="text-sm font-mono font-bold text-zinc-300">${Number(po.totalAmount || 0).toFixed(2)}</div>
                                    <div className="text-[10px] text-zinc-500 uppercase mt-0.5">{po.txnDate}</div>
                                </div>
                                <div className="col-span-1 flex justify-end text-zinc-600 group-hover:text-zinc-300 transition-colors">
                                    {expandedId === po.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </div>
                            </div>
                            {expandedId === po.id && (
                                <div className="px-6 py-4 bg-black/80 border-t border-zinc-800 overflow-x-auto shadow-inner"><pre className="text-xs text-sky-400/80 font-mono leading-relaxed">{JSON.stringify(Object.fromEntries(Object.entries(po).filter(([k]) => !['id', 'tenantId'].includes(k))), null, 2)}</pre></div>
                            )}
                        </div>
                    ))}

                    {/* BILLS */}
                    {activeSubTab === 'bills' && filteredBills.map((bill) => (
                        <div key={bill.id} className="flex flex-col border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 transition-colors">
                            <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer group" onClick={() => setExpandedId(expandedId === bill.id ? null : bill.id)}>
                                <div className="col-span-11 md:col-span-6 flex flex-col">
                                    <span className="font-bold text-sm text-rose-500">BILL #{bill.refNumber || bill.txnId.substring(0,8)}</span>
                                    <span className="text-xs text-rose-400/50 mt-0.5">{bill.vendorName}</span>
                                </div>
                                <div className="hidden md:flex col-span-5 text-right flex-col items-end">
                                    <div className="text-sm font-mono font-bold text-zinc-300">${Number(bill.amountDue || 0).toFixed(2)}</div>
                                    <div className="text-[10px] text-zinc-500 uppercase mt-0.5">{bill.isPaid ? 'PAID' : 'UNPAID'}</div>
                                </div>
                                <div className="col-span-1 flex justify-end text-zinc-600 group-hover:text-zinc-300 transition-colors">
                                    {expandedId === bill.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </div>
                            </div>
                            {expandedId === bill.id && (
                                <div className="px-6 py-4 bg-black/80 border-t border-zinc-800 overflow-x-auto shadow-inner"><pre className="text-xs text-sky-400/80 font-mono leading-relaxed">{JSON.stringify(Object.fromEntries(Object.entries(bill).filter(([k]) => !['id', 'tenantId'].includes(k))), null, 2)}</pre></div>
                            )}
                        </div>
                    ))}
                    
                    {/* Empty States */}
                    {activeSubTab === 'items' && filteredItems.length === 0 && !loading && (
                        <div className="p-12 text-center text-zinc-500">No items found matching the current filter.</div>
                    )}
                    {activeSubTab === 'customers' && filteredCustomers.length === 0 && !loading && (
                        <div className="p-12 text-center text-zinc-500">No customers found matching the current filter.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
