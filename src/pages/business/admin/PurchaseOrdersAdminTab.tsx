import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, FileText, Factory, Trash2, Edit } from 'lucide-react';
import { api } from '../../../lib/api';
import toast from 'react-hot-toast';

interface LineItem {
  description: string;
  quantity: number;
  expectedCost: number;
  receivedQuantity: number;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendor: string;
  status: 'Draft' | 'Ordered' | 'Partial' | 'Fulfilled' | 'Cancelled';
  lineItems: LineItem[];
  jobId?: string;
  createdAt: string;
}

export function PurchaseOrdersAdminTab({ tenantId }: { tenantId: string }) {
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState<Partial<PurchaseOrder> | null>(null);

    const fetchOrders = async () => {
        try {
            const res = await api.get('/purchase-orders');
            setOrders(res.data);
        } catch (err) {
            console.error('Failed to fetch POs', err);
            toast.error("Failed to load Purchase Orders");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (tenantId) fetchOrders();
    }, [tenantId]);

    const handleSaveOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingOrder?.id) {
                await api.put(`/purchase-orders/${editingOrder.id}`, editingOrder);
                toast.success("PO updated!");
            } else {
                await api.post('/purchase-orders', editingOrder);
                toast.success("PO created!");
            }
            setIsEditModalOpen(false);
            fetchOrders();
        } catch (err) {
            console.error('Failed to save PO', err);
            toast.error("Failed to save PO");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this PO?")) return;
        try {
            await api.delete(`/purchase-orders/${id}`);
            toast.success("PO deleted");
            fetchOrders();
        } catch (err) {
            console.error(err);
            toast.error("Failed to delete PO");
        }
    };

    if (loading) {
        return <div className="p-8 text-white">Loading Purchase Orders...</div>;
    }

    return (
        <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto">
            <div className="p-6 md:p-8 flex items-center justify-between border-b border-zinc-900 sticky top-0 bg-zinc-950/80 backdrop-blur-md z-10">
                <div>
                    <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                        <ShoppingCart className="w-6 h-6 text-indigo-400" />
                        Purchase Orders
                    </h2>
                    <p className="text-sm text-zinc-400">Manage vendor purchasing and stock ordering</p>
                </div>
                <button 
                    onClick={() => {
                        setEditingOrder({ poNumber: '', vendor: '', status: 'Draft', lineItems: [] });
                        setIsEditModalOpen(true);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 transition-colors text-sm"
                >
                    <Plus className="w-4 h-4" /> New PO
                </button>
            </div>

            <div className="p-6 md:p-8">
                {orders.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed border-zinc-800 rounded-3xl">
                        <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-white mb-2">No Purchase Orders</h3>
                        <p className="text-zinc-500 text-sm">Create your first PO to start ordering inventory.</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {orders.map(order => (
                            <div key={order.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex items-center justify-between group hover:border-indigo-500/50 transition-colors">
                                <div className="flex items-center gap-6">
                                    <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                                        <Factory className="w-6 h-6 text-zinc-400" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="font-bold text-white text-lg">{order.poNumber}</h3>
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                                order.status === 'Fulfilled' ? 'bg-emerald-500/20 text-emerald-400' :
                                                order.status === 'Ordered' ? 'bg-indigo-500/20 text-indigo-400' :
                                                'bg-zinc-800 text-zinc-400'
                                            }`}>
                                                {order.status}
                                            </span>
                                        </div>
                                        <p className="text-sm text-zinc-400 font-medium">Vendor: <span className="text-indigo-300">{order.vendor}</span> • {order.lineItems?.length || 0} items</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingOrder(order); setIsEditModalOpen(true); }} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(order.id)} className="p-2 hover:bg-red-500/20 rounded-lg text-zinc-400 hover:text-red-400 transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isEditModalOpen && editingOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 md:p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold text-white mb-6">
                            {editingOrder.id ? 'Edit Purchase Order' : 'Create Purchase Order'}
                        </h3>
                        <form onSubmit={handleSaveOrder} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">PO Number</label>
                                    <input 
                                        type="text" 
                                        placeholder="Auto-generated if empty"
                                        value={editingOrder.poNumber || ''} 
                                        onChange={e => setEditingOrder({...editingOrder, poNumber: e.target.value})}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Vendor Name</label>
                                    <input 
                                        type="text" 
                                        value={editingOrder.vendor || ''} 
                                        onChange={e => setEditingOrder({...editingOrder, vendor: e.target.value})}
                                        required
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Status</label>
                                    <select 
                                        value={editingOrder.status || 'Draft'} 
                                        onChange={e => setEditingOrder({...editingOrder, status: e.target.value as any})}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none appearance-none"
                                    >
                                        <option value="Draft">Draft</option>
                                        <option value="Ordered">Ordered</option>
                                        <option value="Partial">Partial</option>
                                        <option value="Fulfilled">Fulfilled</option>
                                        <option value="Cancelled">Cancelled</option>
                                    </select>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-zinc-800">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-bold text-white text-sm">Line Items</h4>
                                    <button 
                                        type="button" 
                                        onClick={() => setEditingOrder({
                                            ...editingOrder, 
                                            lineItems: [...(editingOrder.lineItems || []), { description: '', quantity: 1, expectedCost: 0, receivedQuantity: 0 }]
                                        })}
                                        className="text-indigo-400 hover:text-indigo-300 text-xs font-bold flex items-center gap-1 uppercase tracking-widest"
                                    >
                                        <Plus className="w-3 h-3"/> Add Item
                                    </button>
                                </div>
                                
                                <div className="space-y-3">
                                    {(editingOrder.lineItems || []).map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <input 
                                                type="text" 
                                                placeholder="Description"
                                                value={item.description}
                                                onChange={e => {
                                                    const newArr = [...(editingOrder.lineItems || [])];
                                                    newArr[idx].description = e.target.value;
                                                    setEditingOrder({...editingOrder, lineItems: newArr});
                                                }}
                                                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
                                            />
                                            <input 
                                                type="number" 
                                                placeholder="Qty"
                                                value={item.quantity}
                                                onChange={e => {
                                                    const newArr = [...(editingOrder.lineItems || [])];
                                                    newArr[idx].quantity = Number(e.target.value);
                                                    setEditingOrder({...editingOrder, lineItems: newArr});
                                                }}
                                                className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
                                            />
                                            <input 
                                                type="number" 
                                                placeholder="Cost"
                                                value={item.expectedCost}
                                                onChange={e => {
                                                    const newArr = [...(editingOrder.lineItems || [])];
                                                    newArr[idx].expectedCost = Number(e.target.value);
                                                    setEditingOrder({...editingOrder, lineItems: newArr});
                                                }}
                                                className="w-24 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
                                            />
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    const newArr = editingOrder.lineItems?.filter((_, i) => i !== idx);
                                                    setEditingOrder({...editingOrder, lineItems: newArr});
                                                }}
                                                className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-6">
                                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-5 py-2 rounded-xl text-zinc-400 font-bold hover:text-white transition-colors text-sm">Cancel</button>
                                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-2 rounded-xl transition-colors text-sm">Save Order</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
