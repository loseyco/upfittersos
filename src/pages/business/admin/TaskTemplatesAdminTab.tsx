import { useState, useEffect } from 'react';
import { BookTemplate, Trash2, Edit2, Plus, X } from 'lucide-react';
import { api } from '../../../lib/api';
import toast from 'react-hot-toast';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

export function TaskTemplatesAdminTab({ tenantId }: { tenantId: string }) {
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [showAddForm, setShowAddForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [bookTime, setBookTime] = useState<number>(1);
    const [laborRate, setLaborRate] = useState<number>(150);
    const [notes, setNotes] = useState('');
    const [sops, setSops] = useState('');
    const [directions, setDirections] = useState('');
    const [parts, setParts] = useState<any[]>([]);

    const [editTemplate, setEditTemplate] = useState<any | null>(null);
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);

    useEffect(() => {
        if (!tenantId || tenantId === 'unassigned') {
            setLoading(false);
            return;
        }

        setLoading(true);
        const unsub = onSnapshot(query(collection(db, 'task_templates'), where('tenantId', '==', tenantId)), (s) => {
            const fetched = s.docs.map(d => ({ id: d.id, ...d.data() }));
            fetched.sort((a: any, b: any) => a.title?.localeCompare(b.title));
            setTemplates(fetched);
            setLoading(false);
        });

        const unsubInv = onSnapshot(query(collection(db, 'inventory_items'), where('tenantId', '==', tenantId)), (s) => {
            const fetchedInv = s.docs.map(d => ({ id: d.id, ...d.data() }));
            fetchedInv.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
            setInventoryItems(fetchedInv);
        });

        return () => { unsub(); unsubInv(); };
    }, [tenantId]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title) return toast.error("Title is required.");

        try {
            setIsSubmitting(true);
            await api.post('/task_templates', {
                title,
                description,
                bookTime,
                laborRate,
                notes,
                sops,
                directions,
                parts,
                tenantId,
            });
            toast.success("Template created!");
            setShowAddForm(false);
            setTitle('');
            setDescription('');
            setNotes('');
            setSops('');
            setDirections('');
            setBookTime(1);
            setLaborRate(150);
            setParts([]);
        } catch (err) {
            console.error(err);
            toast.error("Failed to create template");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editTemplate?.title) return toast.error("Title is required.");

        try {
            setIsSubmitting(true);
            await api.put(`/task_templates/${editTemplate.id}`, {
                title: editTemplate.title,
                description: editTemplate.description,
                bookTime: editTemplate.bookTime,
                laborRate: editTemplate.laborRate,
                notes: editTemplate.notes,
                sops: editTemplate.sops,
                directions: editTemplate.directions,
                parts: editTemplate.parts || [],
            });
            toast.success("Template updated!");
            setEditTemplate(null);
        } catch (err) {
            console.error(err);
            toast.error("Failed to update template");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Delete this task template?")) return;
        try {
            await api.delete(`/task_templates/${id}`);
            toast.success("Template removed");
        } catch (err) {
            toast.error("Failed to remove template");
        }
    };

    if (loading) return <div className="p-8 text-zinc-500 font-bold text-center">Loading Service Catalog...</div>;

    return (
        <div className="flex flex-col h-full bg-zinc-950">
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 shrink-0 flex items-center justify-between z-10">
                <div>
                    <h3 className="text-white font-bold tracking-tight">Service Catalog (Task Templates)</h3>
                    <p className="text-zinc-500 text-xs mt-0.5">Manage predefined repair tasks, book times, and labor rates used in Work Orders.</p>
                </div>
                <button 
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="bg-accent hover:bg-accent-hover text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
                >
                    {showAddForm ? 'Cancel' : <><Plus className="w-4 h-4" /> New Template</>}
                </button>
            </div>

            {/* Edit Modal */}
            {editTemplate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-zinc-800/50 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <Edit2 className="w-5 h-5 text-accent" /> Edit Template
                            </h3>
                            <button onClick={() => setEditTemplate(null)} className="text-zinc-500 hover:text-white p-2 rounded-full cursor-pointer"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleUpdate} className="p-6 flex-1 overflow-y-auto space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Template Name</label>
                                <input 
                                    type="text" required value={editTemplate.title}
                                    onChange={e => setEditTemplate({...editTemplate, title: e.target.value})}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Description (Optional)</label>
                                <textarea 
                                    value={editTemplate.description || ''}
                                    onChange={e => setEditTemplate({...editTemplate, description: e.target.value})}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent text-white h-24 resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Book Time (Hours)</label>
                                    <input 
                                        type="number" step="0.1" required value={editTemplate.bookTime}
                                        onChange={e => setEditTemplate({...editTemplate, bookTime: Number(e.target.value)})}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Labor Rate ($/hr)</label>
                                    <input 
                                        type="number" step="1" required value={editTemplate.laborRate}
                                        onChange={e => setEditTemplate({...editTemplate, laborRate: Number(e.target.value)})}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                    />
                                </div>
                            </div>

                            <div className="pt-2">
                                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Scope Notes (Internal)</label>
                                <textarea 
                                    value={editTemplate.notes || ''}
                                    onChange={e => setEditTemplate({...editTemplate, notes: e.target.value})}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent text-white h-20 resize-none placeholder:text-zinc-700"
                                    placeholder="Private details, warnings, or special tool requirements..."
                                />
                            </div>

                            <div className="pt-2">
                                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">SOPs / Directives</label>
                                <textarea 
                                    value={editTemplate.sops || ''}
                                    onChange={e => setEditTemplate({...editTemplate, sops: e.target.value})}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent text-white h-20 resize-none placeholder:text-zinc-700"
                                    placeholder="Standard operating procedures link or specific technical guidelines..."
                                />
                            </div>

                            <div className="pt-2">
                                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Tech Directions</label>
                                <textarea 
                                    value={editTemplate.directions || ''}
                                    onChange={e => setEditTemplate({...editTemplate, directions: e.target.value})}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent text-white h-20 resize-none placeholder:text-zinc-700"
                                    placeholder="Step-by-step instructions for technicians on the bay..."
                                />
                            </div>

                            <div className="pt-6 mt-6 border-t border-zinc-800">
                                <div className="flex items-center justify-between mb-3 border-b border-zinc-800/50 pb-2">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Kit Parts / Inventory</label>
                                    <button type="button" onClick={() => {
                                        const np = [...(editTemplate.parts || []), { name: '', quantity: 1, price: 0 }];
                                        setEditTemplate({...editTemplate, parts: np});
                                    }} className="text-[10px] font-black text-emerald-500 uppercase tracking-widest hover:text-emerald-400">+ Add Manual Part</button>
                                </div>
                                <div className="mb-4">
                                    <select value="" onChange={e => {
                                        const val = e.target.value;
                                        if(!val) return;
                                        const invItem = inventoryItems.find(i => i.id === val);
                                        if(invItem) {
                                            const np = [...(editTemplate.parts || []), { inventoryId: invItem.id, sku: invItem.sku, name: invItem.name, quantity: 1, price: invItem.price }];
                                            setEditTemplate({...editTemplate, parts: np});
                                        }
                                        e.target.value = "";
                                    }} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent">
                                        <option value="">+ Browse Inventory Catalog...</option>
                                        {inventoryItems.map(item => (
                                            <option key={item.id} value={item.id}>{item.sku ? `[${item.sku}] ` : ''}{item.name} (${item.price}/ea - {item.quantityOnHand - (item.quantityAllocated || 0)} Avail)</option>
                                        ))}
                                    </select>
                                </div>
                                {editTemplate.parts && editTemplate.parts.length > 0 && (
                                    <div className="space-y-2">
                                        {editTemplate.parts.map((p: any, pIdx: number) => (
                                            <div key={pIdx} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg p-2">
                                                <input type="text" placeholder="Part description/SKU" value={p.name} onChange={e => {
                                                    const np = [...editTemplate.parts]; np[pIdx].name = e.target.value; setEditTemplate({...editTemplate, parts: np});
                                                }} className="flex-1 w-full bg-transparent border-none px-2 py-1 text-sm text-white focus:outline-none shadow-none focus:ring-0 placeholder:text-zinc-700" />
                                                <div className="w-20 border-l border-zinc-800 pl-2 flex items-center">
                                                    <span className="text-[10px] text-zinc-600 mr-1">QTY</span>
                                                    <input type="number" min="1" value={p.quantity} onChange={e => {
                                                        const np = [...editTemplate.parts]; np[pIdx].quantity = parseFloat(e.target.value) || 0; setEditTemplate({...editTemplate, parts: np});
                                                    }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-white font-mono focus:outline-none shadow-none focus:ring-0 text-center" />
                                                </div>
                                                <div className="w-24 border-l border-zinc-800 pl-2 flex items-center">
                                                    <span className="text-[10px] text-zinc-600 mr-1">$</span>
                                                    <input type="number" min="0" step="0.01" value={p.price} onChange={e => {
                                                        const np = [...editTemplate.parts]; np[pIdx].price = parseFloat(e.target.value) || 0; setEditTemplate({...editTemplate, parts: np});
                                                    }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-white font-mono focus:outline-none shadow-none focus:ring-0 text-right" />
                                                </div>
                                                <button type="button" onClick={() => {
                                                    const np = [...editTemplate.parts]; np.splice(pIdx, 1); setEditTemplate({...editTemplate, parts: np});
                                                }} className="p-1.5 hover:bg-red-500/20 text-zinc-600 hover:text-red-400 rounded-lg transition-colors">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-zinc-800">
                                <button type="button" onClick={() => setEditTemplate(null)} className="px-6 py-2.5 rounded-xl font-bold text-sm text-zinc-400 hover:text-white">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="bg-accent text-white hover:bg-accent-hover font-bold py-2.5 px-8 rounded-xl shadow-lg disabled:opacity-50">Save Updates</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Form */}
            {showAddForm && (
                <form onSubmit={handleCreate} className="p-6 bg-zinc-900 border-b border-zinc-800 shrink-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Template Name</label>
                            <input type="text" required placeholder="e.g. 5-Inch Lift Kit Install" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Book Time (Hours)</label>
                            <input type="number" step="0.1" required value={bookTime} onChange={e => setBookTime(Number(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Labor Rate ($/hr)</label>
                            <input type="number" step="1" required value={laborRate} onChange={e => setLaborRate(Number(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white" />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-zinc-800/50 mt-4">
                        <div>
                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Scope Notes</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white h-16 resize-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">SOPs</label>
                            <textarea value={sops} onChange={e => setSops(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white h-16 resize-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Directions</label>
                            <textarea value={directions} onChange={e => setDirections(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white h-16 resize-none" />
                        </div>
                    </div>

                    <div className="pt-6 mt-6 border-t border-zinc-800/50">
                        <div className="flex items-center justify-between mb-3 border-b border-zinc-800/50 pb-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Kit Parts / Inventory</label>
                            <button type="button" onClick={() => {
                                setParts([...parts, { name: '', quantity: 1, price: 0 }]);
                            }} className="text-[10px] font-black text-emerald-500 uppercase tracking-widest hover:text-emerald-400">+ Add Manual Part</button>
                        </div>
                        <div className="mb-4">
                            <select value="" onChange={e => {
                                const val = e.target.value;
                                if(!val) return;
                                const invItem = inventoryItems.find(i => i.id === val);
                                if(invItem) {
                                    setParts([...parts, { inventoryId: invItem.id, sku: invItem.sku, name: invItem.name, quantity: 1, price: invItem.price }]);
                                }
                                e.target.value = "";
                            }} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent">
                                <option value="">+ Browse Inventory Catalog...</option>
                                {inventoryItems.map(item => (
                                    <option key={item.id} value={item.id}>{item.sku ? `[${item.sku}] ` : ''}{item.name} (${item.price}/ea - {item.quantityOnHand - (item.quantityAllocated || 0)} Avail)</option>
                                ))}
                            </select>
                        </div>
                        {parts.length > 0 && (
                            <div className="space-y-2">
                                {parts.map((p, pIdx) => (
                                    <div key={pIdx} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg p-2">
                                        <input type="text" placeholder="Part description/SKU" value={p.name} onChange={e => {
                                            const np = [...parts]; np[pIdx].name = e.target.value; setParts(np);
                                        }} className="flex-1 w-full bg-transparent border-none px-2 py-1 text-sm text-white focus:outline-none shadow-none focus:ring-0 placeholder:text-zinc-700" />
                                        <div className="w-20 border-l border-zinc-800 pl-2 flex items-center">
                                            <span className="text-[10px] text-zinc-600 mr-1">QTY</span>
                                            <input type="number" min="1" value={p.quantity} onChange={e => {
                                                const np = [...parts]; np[pIdx].quantity = parseFloat(e.target.value) || 0; setParts(np);
                                            }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-white font-mono focus:outline-none shadow-none focus:ring-0 text-center" />
                                        </div>
                                        <div className="w-24 border-l border-zinc-800 pl-2 flex items-center">
                                            <span className="text-[10px] text-zinc-600 mr-1">$</span>
                                            <input type="number" min="0" step="0.01" value={p.price} onChange={e => {
                                                const np = [...parts]; np[pIdx].price = parseFloat(e.target.value) || 0; setParts(np);
                                            }} className="w-full bg-transparent border-none px-1 py-1 text-sm text-white font-mono focus:outline-none shadow-none focus:ring-0 text-right" />
                                        </div>
                                        <button type="button" onClick={() => {
                                            const np = [...parts]; np.splice(pIdx, 1); setParts(np);
                                        }} className="p-1.5 hover:bg-red-500/20 text-zinc-600 hover:text-red-400 rounded-lg transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end pt-4">
                        <button type="submit" disabled={isSubmitting} className="bg-white/10 hover:bg-white text-zinc-300 hover:text-black disabled:opacity-50 font-black px-6 py-2.5 rounded-lg flex items-center shadow shadow-black/20 text-sm">
                            Generate Template
                        </button>
                    </div>
                </form>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {templates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <BookTemplate className="w-12 h-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-1">No Templates Found</h3>
                        <p className="text-zinc-500 text-sm">Create templates to speed up estimating and job creation.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800/50">
                        {templates.map(t => (
                            <div key={t.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-zinc-900/30 transition-colors group">
                                <div className="col-span-6 md:col-span-5 flex flex-col">
                                    <span className="font-bold text-sm text-zinc-200 group-hover:text-white transition-colors">{t.title}</span>
                                    <span className="text-xs text-zinc-500 truncate mt-0.5">{t.description || 'No description'}</span>
                                </div>
                                <div className="col-span-3 md:col-span-2 text-xs font-bold text-zinc-400">
                                    {t.bookTime} hrs
                                </div>
                                <div className="hidden md:block col-span-3 text-xs font-mono text-zinc-500 border border-zinc-800 bg-zinc-900 rounded px-2 py-1 w-max">
                                    ${t.laborRate}/hr
                                </div>
                                <div className="col-span-3 md:col-span-2 flex items-center justify-end gap-2">
                                    <button onClick={() => setEditTemplate(t)} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => handleDelete(t.id)} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
