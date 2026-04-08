import { useState, useEffect } from 'react';
import { ScanLine, Plus, RefreshCw, ArrowLeft, Save, AlertTriangle, PackageSearch, Tag, ChevronRight, Hash, History, TrendingUp, TrendingDown, ClipboardCheck, AlertCircle, FlaskConical } from 'lucide-react';
import { api } from '../../../lib/api';
import toast from 'react-hot-toast';
import { usePermissions } from '../../../hooks/usePermissions';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

export function InventoryAdminTab({ tenantId }: { tenantId: string }) {
    const { checkPermission } = usePermissions();
    const canManageInventory = checkPermission('manage_inventory');

    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit State
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [initialEditItem, setInitialEditItem] = useState<any>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('general');

    // Logs State
    const [logs, setLogs] = useState<any[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [logType, setLogType] = useState('RECEIVE'); 
    const [logForm, setLogForm] = useState({ quantityChange: '' as number | string, notes: '', targetRef: '' });
    const [logSaving, setLogSaving] = useState(false);
    
    const [editForm, setEditForm] = useState({
        sku: '',
        name: '',
        description: '',
        quantityOnHand: 0 as number | string,
        quantityAllocated: 0 as number | string,
        quantityOnOrder: 0 as number | string,
        cost: 0 as number | string,
        price: 0 as number | string,
        location: '',
        status: 'In Stock',
        notes: ''
    });

    useEffect(() => {
        if (!tenantId || tenantId === 'unassigned') {
            setLoading(false);
            return;
        }

        setLoading(true);

        const unsubInventory = onSnapshot(query(collection(db, 'inventory_items'), where('tenantId', '==', tenantId)), (s) => {
            const fetched = s.docs.map(d => ({ id: d.id, ...d.data() }));
            fetched.sort((a: any, b: any) => {
                const nameA = a.name || '';
                const nameB = b.name || '';
                return nameA.localeCompare(nameB);
            });
            setItems(fetched);
            setLoading(false);
        });

        return () => unsubInventory();
    }, [tenantId]);

    const fetchLogs = async (itemId: string) => {
        if (!itemId || itemId === 'new') return;
        try {
            setLoadingLogs(true);
            const res = await api.get(`/inventory/${itemId}/logs`);
            setLogs(res.data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load activity logs.");
        } finally {
            setLoadingLogs(false);
        }
    }

    // Using effect for unmount was moved up

    const openItemProfile = (item: any) => {
        setSelectedItem(item);
        setIsEditing(false);
        setActiveTab('general');
        const initialFormValues = {
            sku: item.sku || '',
            name: item.name || '',
            description: item.description || '',
            quantityOnHand: item.quantityOnHand || 0,
            quantityAllocated: item.quantityAllocated || 0,
            quantityOnOrder: item.quantityOnOrder || 0,
            cost: item.cost || 0,
            price: item.price || 0,
            location: item.location || '',
            status: item.status || 'In Stock',
            notes: item.notes || ''
        };
        setEditForm(initialFormValues);
        setInitialEditItem(initialFormValues);
        fetchLogs(item.id);
    };

    const openAddItem = () => {
        setSelectedItem({ id: 'new' });
        setIsEditing(true);
        setActiveTab('general');
        const initialFormValues = {
            sku: '',
            name: '',
            description: '',
            quantityOnHand: 0,
            quantityAllocated: 0,
            quantityOnOrder: 0,
            cost: 0,
            price: 0,
            location: '',
            status: 'In Stock',
            notes: ''
        };
        setEditForm(initialFormValues);
        setInitialEditItem(initialFormValues);
        setLogs([]);
    };

    const closeEditItem = () => {
        setSelectedItem(null);
        setLogModalOpen(false);
    };

    const handleSaveItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem) return;
        
        try {
            setIsSaving(true);
            const payload = { 
                ...editForm, 
                cost: Number(editForm.cost),
                price: Number(editForm.price),
                tenantId 
            };
            
            // Only new items send initial stock
            if (selectedItem.id === 'new') {
                payload.quantityOnHand = Number(editForm.quantityOnHand);
                payload.quantityAllocated = Number(editForm.quantityAllocated);
                payload.quantityOnOrder = Number(editForm.quantityOnOrder);
                await api.post(`/inventory`, payload);
                toast.success("Item added to catalog");
                closeEditItem();
            } else {
                // Update doesn't push quantity changes directly anymore, handles through logs
                delete (payload as any).quantityOnHand;
                delete (payload as any).quantityAllocated;
                delete (payload as any).quantityOnOrder;
                
                await api.put(`/inventory/${selectedItem.id}`, payload);
                toast.success("Item characteristics updated");
                closeEditItem();
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to save inventory item");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteItem = async (itemId: string) => {
        if (!window.confirm("Permanently delete this item from the catalog?")) return;
        try {
            await api.delete(`/inventory/${itemId}`);
            toast.success("Item removed");
            if (selectedItem?.id === itemId) {
                closeEditItem();
            }
        } catch (err) {
            toast.error("Failed to remove item");
        }
    };

    const handleSubmitLog = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem || selectedItem.id === 'new') return;
        
        try {
            setLogSaving(true);
            await api.post(`/inventory/${selectedItem.id}/log`, {
                actionType: logType,
                quantityChange: Number(logForm.quantityChange),
                notes: logForm.notes,
                targetRef: logForm.targetRef
            });
            toast.success("Transaction logged successfully.");
            setLogModalOpen(false);
            setLogForm({ quantityChange: '', notes: '', targetRef: '' });
            fetchLogs(selectedItem.id);
            
            // Re-fetch current selected item data to reflect immediately
            const res = await api.get(`/inventory/${selectedItem.id}`);
            const updated = res.data;
            const updatedForm = {
                ...editForm,
                quantityOnHand: updated.quantityOnHand || 0,
                quantityAllocated: updated.quantityAllocated || 0,
                quantityOnOrder: updated.quantityOnOrder || 0
            };
            setEditForm(updatedForm);
            setInitialEditItem(updatedForm);
            
        } catch (err) {
            console.error(err);
            toast.error("Failed to post inventory transaction.");
        } finally {
            setLogSaving(false);
        }
    };

    const openTransactionModal = (type: string) => {
        setLogType(type);
        setLogForm({ quantityChange: '', notes: '', targetRef: '' });
        setLogModalOpen(true);
    };

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center flex items-center justify-center gap-2"><RefreshCw className="w-5 h-5 animate-spin"/> Loading Inventory...</div>;
    }

    if (selectedItem && isEditing && selectedItem.id === 'new') {
        return (
             <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
                 <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <button onClick={closeEditItem} className="p-2 border border-zinc-700 bg-zinc-800 rounded-lg hover:bg-zinc-700 hover:text-white text-zinc-400 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-zinc-800 items-center justify-center border border-zinc-700 flex shrink-0">
                                <ScanLine className="w-5 h-5 text-emerald-500" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white">Add Part</h2>
                            </div>
                        </div>
                    </div>
                    <button onClick={handleSaveItem} disabled={isSaving} className="hidden md:flex bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-2 rounded-lg items-center gap-2 shadow-lg disabled:opacity-50 transition-all font-mono tracking-widest uppercase text-xs">
                        <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
                {/* Form to add item omitted for brevity, it's just the old form inputs */}
                <form onSubmit={handleSaveItem} className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-10 pb-24">
                     <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <PackageSearch className="w-5 h-5 text-emerald-500" /> General Info
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Part Name</label>
                                <input type="text" required placeholder="LED Light Bar" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-white" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">SKU / Code</label>
                                <div className="relative">
                                    <Hash className="w-4 h-4 absolute left-4 top-3.5 text-zinc-600" />
                                    <input type="text" placeholder="LED-100" value={editForm.sku} onChange={(e) => setEditForm({...editForm, sku: e.target.value.toUpperCase()})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-white uppercase font-mono" />
                                </div>
                            </div>
                        </div>
                    </section>
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <Tag className="w-5 h-5 text-indigo-400" /> Initial Inventory
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Initial Qty</label>
                                <input type="number" required placeholder="0" value={editForm.quantityOnHand} onChange={(e) => setEditForm({...editForm, quantityOnHand: e.target.value === '' ? '' : Number(e.target.value)})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white font-mono" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Cost ($)</label>
                                <input type="number" step="0.01" required value={editForm.cost} onChange={(e) => setEditForm({...editForm, cost: e.target.value === '' ? '' : Number(e.target.value)})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white font-mono" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Retail Price ($)</label>
                                <input type="number" step="0.01" required value={editForm.price} onChange={(e) => setEditForm({...editForm, price: e.target.value === '' ? '' : Number(e.target.value)})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white font-mono" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Location</label>
                                <input type="text" placeholder="Bin..." value={editForm.location} onChange={(e) => setEditForm({...editForm, location: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white font-mono" />
                            </div>
                        </div>
                    </section>
                </form>
             </div>
        );
    }
    
    // Detailed Profile (Read / Write Characteristics / Logs)
    if (selectedItem) {
        const availableQty = Number(editForm.quantityOnHand) - Number(editForm.quantityAllocated);
        const shortStock = availableQty < 0;

        return (
            <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full relative">
                {/* Profile Header */}
                <div className="p-6 md:p-8 border-b border-zinc-800 bg-zinc-900/50 flex flex-col gap-6 sticky top-0 z-20 backdrop-blur-md">
                    <div className="flex items-center justify-between">
                        <button onClick={closeEditItem} className="text-zinc-400 hover:text-white flex items-center gap-2"><ArrowLeft className="w-4 h-4"/> Back to Catalog</button>
                        {shortStock && <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-3 py-1 rounded text-xs font-black uppercase tracking-widest flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Shortage Deficit</span>}
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 shadow-inner">
                            <ScanLine className="w-8 h-8 text-emerald-500" />
                        </div>
                        <div className="flex-1 w-full flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-3xl font-black text-white tracking-tight">{editForm.name || 'Unnamed Part'}</h2>
                                <div className="flex items-center gap-3 mt-1">
                                    <p className="text-sm font-mono text-zinc-500 tracking-wide">SKU: {editForm.sku}</p>
                                    <span className="text-zinc-700">•</span>
                                    <p className="text-xs font-black uppercase tracking-widest text-zinc-400 bg-zinc-900 border border-zinc-700 px-2 py-0.5 rounded">Bin: {editForm.location}</p>
                                </div>
                            </div>
                            
                            {/* Actions Group */}
                            <div className="flex flex-wrap items-center gap-2">
                                {canManageInventory && (
                                <>
                                    <button onClick={() => openTransactionModal('RECEIVE')} className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2">
                                        <TrendingUp className="w-3.5 h-3.5"/> Receive Stock
                                    </button>
                                    <button onClick={() => openTransactionModal('ASSIGN')} className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2">
                                        <History className="w-3.5 h-3.5"/> Assign Job
                                    </button>
                                    <button onClick={() => openTransactionModal('CONSUME')} className="bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2">
                                        <TrendingDown className="w-3.5 h-3.5"/> Consume
                                    </button>
                                    <button onClick={() => openTransactionModal('AUDIT')} className="bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2">
                                        <ClipboardCheck className="w-3.5 h-3.5"/> Audit
                                    </button>
                                    <button onClick={handleSaveItem} disabled={isSaving || (initialEditItem !== null && JSON.stringify(initialEditItem) === JSON.stringify(editForm))} className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2 ml-4">
                                        <Save className="w-3 h-3" /> Save Info
                                    </button>
                                </>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    {/* Inner Tabs */}
                    <div className="flex items-center gap-6 border-b border-zinc-800/50 -mb-6 md:-mb-8 overflow-x-auto no-scrollbar pb-3">
                        <button onClick={() => setActiveTab('general')} className={`pb-3 text-sm font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap ${activeTab === 'general' ? 'border-accent text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Stock Allocation</button>
                        <button onClick={() => setActiveTab('logs')} className={`pb-3 text-sm font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap ${activeTab === 'logs' ? 'border-accent text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Activity Logs</button>
                    </div>
                </div>

                <div className="p-6 md:p-8 max-w-5xl mx-auto w-full space-y-8">
                    {/* General Settings */}
                    {activeTab === 'general' && (
                        <>
                            {/* Telemetry Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-zinc-500 mb-1">On Hand (Physical)</p>
                                    <p className="text-2xl font-mono text-white">{editForm.quantityOnHand}</p>
                                </div>
                                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-indigo-400 mb-1">Allocated (Jobs)</p>
                                    <p className="text-2xl font-mono text-indigo-400">{editForm.quantityAllocated}</p>
                                </div>
                                <div className={`border rounded-xl p-4 ${shortStock ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                                    <p className={`text-[10px] uppercase font-black tracking-widest mb-1 ${shortStock ? 'text-red-400' : 'text-emerald-400'}`}>Available (Surplus)</p>
                                    <p className={`text-2xl font-mono ${shortStock ? 'text-red-400' : 'text-emerald-400'}`}>{availableQty}</p>
                                </div>
                                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-zinc-500 mb-1">On Order</p>
                                    <p className="text-2xl font-mono text-zinc-300">{editForm.quantityOnOrder}</p>
                                </div>
                            </div>
                            
                            {/* Editor Form */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
                                <div>
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Part Name</label>
                                    <input type="text" value={editForm.name} onChange={(e) => {setEditForm({...editForm, name: e.target.value}); setIsEditing(true);}} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">SKU</label>
                                    <input type="text" value={editForm.sku} onChange={(e) => {setEditForm({...editForm, sku: e.target.value.toUpperCase()}); setIsEditing(true);}} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white uppercase font-mono" />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Unit Cost ($)</label>
                                    <input type="number" step="0.01" value={editForm.cost} onChange={(e) => {setEditForm({...editForm, cost: e.target.value === '' ? '' : Number(e.target.value)}); setIsEditing(true);}} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-white font-mono" />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Retail Price ($)</label>
                                    <input type="number" step="0.01" value={editForm.price} onChange={(e) => {setEditForm({...editForm, price: e.target.value === '' ? '' : Number(e.target.value)}); setIsEditing(true);}} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white font-mono" />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Location / Bin</label>
                                    <input type="text" value={editForm.location} onChange={(e) => {setEditForm({...editForm, location: e.target.value.toUpperCase()}); setIsEditing(true);}} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white font-mono uppercase" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Description / Notes</label>
                                    <textarea rows={3} value={editForm.description} onChange={(e) => {setEditForm({...editForm, description: e.target.value}); setIsEditing(true);}} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white resize-none" />
                                </div>
                            </div>
                            
                            {/* Danger Zone */}
                            <section className="mt-12 pt-8 border-t border-red-900/30">
                                <h3 className="text-lg font-bold text-red-500 mb-2 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" /> Danger Zone
                                </h3>
                                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h4 className="text-white font-bold text-sm mb-1">Delete Catalog Item</h4>
                                        <p className="text-zinc-400 text-xs">Permanently remove this part. Logs will be orphaned.</p>
                                    </div>
                                    {canManageInventory && (
                                        <button onClick={() => handleDeleteItem(selectedItem.id)} className="bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 border border-red-500/20 font-bold px-6 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap">
                                            Delete Part
                                        </button>
                                    )}
                                </div>
                            </section>
                        </>
                    )}

                    {/* Logs Settings */}
                    {activeTab === 'logs' && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
                            {loadingLogs ? (
                                <div className="p-12 text-center text-zinc-500 font-bold text-sm flex flex-col items-center"><RefreshCw className="w-5 h-5 animate-spin mb-3"/> Fetching Ledger...</div>
                            ) : logs.length === 0 ? (
                                <div className="p-12 text-center text-zinc-500">No activity logged for this part yet.</div>
                            ) : (
                                <div className="divide-y divide-zinc-800/50">
                                    {logs.map((L) => (
                                        <div key={L.id} className="p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-zinc-800/30">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${
                                                        L.actionType === 'RECEIVE' ? 'bg-emerald-500/10 text-emerald-400' :
                                                        L.actionType === 'WASTE' ? 'bg-orange-500/10 text-orange-400' :
                                                        L.actionType === 'ASSIGN' ? 'bg-indigo-500/10 text-indigo-400' :
                                                        L.actionType === 'CONSUME' ? 'bg-purple-500/10 text-purple-400' :
                                                        L.actionType === 'AUDIT' ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400'
                                                    }`}>{L.actionType}</span>
                                                    <span className="text-zinc-500 text-xs">{new Date(L.createdAt).toLocaleString()}</span>
                                                </div>
                                                <p className="text-zinc-300 text-sm mt-2">{L.notes || 'No description provided.'}</p>
                                                {L.targetRef && <p className="text-[10px] text-zinc-500 font-mono mt-1">Ref: {L.targetRef}</p>}
                                            </div>
                                            <div className="flex items-center gap-6 text-right shrink-0">
                                                <div>
                                                    <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1">Change</p>
                                                    <p className={`font-mono text-lg font-bold ${
                                                        L.actionType === 'AUDIT' ? 'text-zinc-400' :
                                                        (L.actionType === 'RECEIVE' || L.actionType === 'UNASSIGN') ? 'text-emerald-400' : 'text-red-400'
                                                    }`}>{L.actionType === 'AUDIT' ? L.quantityChange : (L.actionType === 'RECEIVE' ? `+${L.quantityChange}` : `-${L.quantityChange}`)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1">On Hand</p>
                                                    <p className="font-mono text-zinc-300">{L.onHandAfter}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Log Modal Overlay */}
                {logModalOpen && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative">
                            <h3 className="text-xl font-black text-white mb-2 capitalize">{logType.toLowerCase()} Registry</h3>
                            <p className="text-zinc-400 text-xs mb-6">Log physical movement or allocation for {editForm.name}.</p>
                            
                            <form onSubmit={handleSubmitLog} className="space-y-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">{logType === 'AUDIT' ? 'Absolute Count' : 'Quantity Adjusted'}</label>
                                    <input type="number" required value={logForm.quantityChange} onChange={e => setLogForm({...logForm, quantityChange: e.target.value === '' ? '' : Number(e.target.value)})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono" />
                                </div>
                                {['ASSIGN', 'CONSUME', 'RECEIVE'].includes(logType) && (
                                    <div>
                                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Reference ID (Job/PO #)</label>
                                        <input type="text" placeholder="e.g. JB-1029" value={logForm.targetRef} onChange={e => setLogForm({...logForm, targetRef: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm" />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Notes / Reason</label>
                                    <textarea required rows={2} value={logForm.notes} onChange={e => setLogForm({...logForm, notes: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm resize-none" placeholder="Reason for transaction..."></textarea>
                                </div>
                                
                                <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800 mt-6">
                                    <button type="button" onClick={() => setLogModalOpen(false)} className="text-zinc-400 text-sm font-bold hover:text-white px-4 py-2">Cancel</button>
                                    <button type="submit" disabled={logSaving} className="bg-accent hover:bg-accent-hover text-white text-sm font-bold uppercase tracking-widest px-6 py-2.5 rounded-lg disabled:opacity-50">
                                        {logSaving ? 'Committing...' : 'Commit Log'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-zinc-950 relative">
            {/* Alpha Banner */}
            <div className="bg-orange-500/5 border-b border-orange-500/20 px-6 py-3 flex items-start gap-3 shrink-0 relative z-10">
                <FlaskConical className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                    <h4 className="text-orange-400 font-bold text-sm">Feature Preview (Alpha Roadmap)</h4>
                    <p className="text-orange-400/80 text-xs mt-0.5">Inventory Management is currently in active development. You may start testing it now, but expect rapid updates and potential data resets prior to stable release.</p>
                </div>
            </div>

            <div className="p-4 bg-zinc-900 border-b border-zinc-800 shrink-0 flex items-center justify-between relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-white font-bold tracking-tight">Inventory (WMS)</h3>
                        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                            Alpha Labs
                        </span>
                    </div>
                    <p className="text-zinc-500 text-xs">Manage workspace parts catalog and bin locations.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-xs font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Live
                    </div>
                    {canManageInventory && (
                        <button 
                            onClick={openAddItem}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
                        >
                            <Plus className="w-4 h-4" /> Register Part
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-zinc-900/50 border-b border-zinc-800 text-xs font-black text-zinc-500 uppercase tracking-widest shrink-0">
                <div className="col-span-4 md:col-span-4">Part / SKU</div>
                <div className="hidden md:block col-span-2">Location</div>
                <div className="col-span-2 text-center">Available</div>
                <div className="col-span-2 md:col-span-2 text-center">On Hand</div>
                <div className="col-span-2 text-right">Actions</div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <ScanLine className="w-12 h-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-1">No Parts Found</h3>
                        <p className="text-zinc-500 text-sm">Register a part to start your inventory catalog.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800/50">
                        {items.map((item) => {
                            const avail = (item.quantityOnHand || 0) - (item.quantityAllocated || 0);
                            const short = avail < 0;
                            return (
                                <div key={item.id} onClick={() => openItemProfile(item)} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-zinc-900/30 transition-colors group cursor-pointer relative">
                                    <div className="col-span-4 md:col-span-4 flex flex-col pr-2">
                                        <span className="font-bold text-sm text-zinc-200 group-hover:text-emerald-500 transition-colors truncate">
                                            {item.name || 'Unnamed Part'}
                                        </span>
                                        {item.sku && <span className="text-[10px] font-mono text-zinc-500 mt-0.5 tracking-wider truncate">{item.sku}</span>}
                                    </div>
                                    <div className="hidden md:flex col-span-2 flex-col text-xs text-zinc-400">
                                        <span className="font-medium font-mono text-zinc-500">{item.location || '—'}</span>
                                    </div>
                                    <div className="col-span-2 flex items-center justify-center">
                                        <span className={`font-mono font-bold ${short ? 'text-red-500' : 'text-emerald-400'}`}>
                                            {avail}
                                        </span>
                                    </div>
                                    <div className="col-span-2 flex items-center justify-center">
                                        <span className="font-mono text-zinc-300 font-bold">{item.quantityOnHand || 0}</span>
                                    </div>
                                    <div className="col-span-2 flex items-center justify-end">
                                        <div className="text-zinc-600 group-hover:text-emerald-500 transition-colors ml-2 hidden md:block">
                                            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>
                                    {short && (
                                         <div className="absolute top-1/2 -translate-y-1/2 left-0 w-1 h-2/3 bg-red-500 rounded-r-lg"></div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
