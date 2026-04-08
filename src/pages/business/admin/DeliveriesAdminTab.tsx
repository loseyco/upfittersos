import React, { useState, useEffect } from 'react';
import { Package, Plus, PackageCheck, PackageOpen, Undo2, Search, Loader2 } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { Delivery, DeliveryCarrier, DeliveryStatus } from '../../../types/deliveries';
import { PackageTracker } from '../../../components/PackageTracker';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermissions } from '../../../hooks/usePermissions';
import toast from 'react-hot-toast';

export function DeliveriesAdminTab({ tenantId }: { tenantId: string }) {
    const { currentUser } = useAuth();
    const { checkPermission } = usePermissions();
    const canManage = checkPermission('manage_deliveries');
    
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'All'>('All');

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newTracking, NEWTracking] = useState('');
    const [newCarrier, setNewCarrier] = useState<DeliveryCarrier>('UPS');
    const [newRecipient, setNewRecipient] = useState('');
    const [newPoId, setNewPoId] = useState('');
    const [newNotes, setNewNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!tenantId) return;
        setIsLoading(true);
        const q = query(
            collection(db, 'businesses', tenantId, 'deliveries'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            })) as Delivery[];
            setDeliveries(data);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching deliveries:", error);
            toast.error("Failed to sync receiving dataset.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [tenantId]);

    const handleAddDelivery = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canManage) {
            toast.error("Insufficient clearance to log packages.");
            return;
        }

        setIsSubmitting(true);
        try {
            const newDoc: Omit<Delivery, 'id'> = {
                trackingNumber: newTracking.trim(),
                carrier: newCarrier,
                recipientName: newRecipient.trim(),
                poId: newPoId.trim() || undefined,
                status: 'Arrived',
                notes: newNotes.trim(),
                createdAt: new Date() as any,
                updatedAt: new Date() as any,
                loggedByTitle: 'Admin',
                loggedById: currentUser?.uid || 'unknown'
            };

            await addDoc(collection(db, 'businesses', tenantId, 'deliveries'), newDoc as any);
            toast.success(`Package from ${newCarrier} logged successfully.`);
            
            // Reset form
            NEWTracking('');
            setNewRecipient('');
            setNewPoId('');
            setNewNotes('');
            setNewCarrier('UPS');
            setIsAddModalOpen(false);
        } catch (error) {
            console.error(error);
            toast.error("Failed to record delivery.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateStatus = async (deliveryId: string, newStatus: DeliveryStatus) => {
        if (!canManage) return;
        try {
            const updatePayload: Partial<Delivery> = {
                status: newStatus,
                updatedAt: new Date() as any
            };
            if (newStatus === 'Delivered to Recipient' || newStatus === 'Returned') {
                updatePayload.resolvedAt = new Date() as any;
            }
            
            await updateDoc(doc(db, 'businesses', tenantId, 'deliveries', deliveryId), updatePayload);
            toast.success(`Package status updated to ${newStatus}`);
        } catch (error) {
            console.error(error);
            toast.error("Status revision failed.");
        }
    };

    const getStatusTheme = (status: DeliveryStatus) => {
        switch (status) {
            case 'Pending': return 'bg-zinc-800 text-zinc-400 border-zinc-700';
            case 'Arrived': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
            case 'Delivered to Recipient': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
            case 'Returned': return 'bg-red-500/10 text-red-500 border-red-500/20';
            default: return 'bg-zinc-800 text-zinc-400 border-zinc-700';
        }
    };

    const getCarrierColor = (carrier: DeliveryCarrier) => {
        switch (carrier) {
            case 'UPS': return 'text-amber-600 bg-amber-600/10';
            case 'FedEx': return 'text-purple-600 bg-purple-600/10';
            case 'Amazon': return 'text-sky-500 bg-sky-500/10';
            case 'USPS': return 'text-blue-600 bg-blue-600/10';
            case 'DHL': return 'text-yellow-600 bg-yellow-600/10';
            default: return 'text-zinc-400 bg-zinc-800';
        }
    };

    const filteredDeliveries = deliveries.filter(d => {
        const matchesStatus = statusFilter === 'All' || d.status === statusFilter;
        const searchTarget = `${d.trackingNumber} ${d.recipientName} ${d.carrier}`.toLowerCase();
        const matchesSearch = searchTarget.includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    return (
        <div className="h-full flex flex-col bg-zinc-950 p-6 md:p-8 overflow-y-auto w-full relative">
            <div className="max-w-6xl w-full mx-auto relative z-10 flex flex-col">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                            <Package className="w-8 h-8 text-accent" /> Receiving Log
                        </h1>
                        <p className="text-zinc-500 mt-2 max-w-xl">Track incoming deliveries, log recipient handoffs, and manage packages entering the facility.</p>
                    </div>
                    {canManage && (
                        <button 
                            onClick={() => setIsAddModalOpen(true)}
                            className="bg-accent hover:bg-accent/90 text-white font-bold py-2.5 px-5 rounded-lg flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)]"
                        >
                            <Plus className="w-5 h-5" /> Log Package
                        </button>
                    )}
                </div>

                {/* Filters & Search */}
                <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                    <div className="relative w-full md:max-w-xs">
                        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input 
                            type="text" 
                            placeholder="Search tracking, recipient..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-accent transition-colors"
                        />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 hide-scrollbar">
                        {['All', 'Arrived', 'Delivered to Recipient', 'Returned'].map((s) => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s as any)}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${
                                    statusFilter === s 
                                    ? 'bg-accent/20 border-accent/30 text-accent' 
                                    : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content */}
                {isLoading ? (
                    <div className="flex items-center justify-center p-20">
                        <Loader2 className="w-8 h-8 animate-spin text-accent" />
                    </div>
                ) : filteredDeliveries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl border-dashed">
                        <PackageOpen className="w-16 h-16 text-zinc-700 mb-4" />
                        <p className="text-zinc-400 font-bold">No packages found.</p>
                        <p className="text-sm text-zinc-600 mt-1">Adjust filters or log a new incoming delivery.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredDeliveries.map((delivery) => (
                            <div key={delivery.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors flex flex-col group">
                                <div className="flex items-start justify-between mb-4">
                                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${getCarrierColor(delivery.carrier)}`}>
                                        {delivery.carrier}
                                    </span>
                                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${getStatusTheme(delivery.status)}`}>
                                        {delivery.status}
                                    </span>
                                </div>
                                <h3 className="text-lg font-bold text-white mb-1 truncate" title={delivery.recipientName}>
                                    {delivery.recipientName || 'Unknown Recipient'} {delivery.poId && <span className="text-xs text-orange-400 font-mono">({delivery.poId})</span>}
                                </h3>
                                <p className="text-sm text-zinc-400 font-mono bg-zinc-950 px-2 py-1 rounded truncate mb-2 select-all">
                                    {delivery.trackingNumber}
                                </p>
                                
                                <div className="mb-4">
                                    <PackageTracker deliveryId={delivery.id} trackingNumber={delivery.trackingNumber} carrier={delivery.carrier} />
                                </div>
                                
                                {delivery.notes && (
                                    <p className="text-xs text-zinc-500 mb-4 line-clamp-2 italic border-l-2 border-zinc-800 pl-2">
                                        "{delivery.notes}"
                                    </p>
                                )}

                                <div className="mt-auto pt-4 border-t border-zinc-800/50 flex items-center justify-between text-xs text-zinc-500">
                                    <span>Logged by {delivery.loggedByTitle}</span>
                                    {canManage && delivery.status === 'Arrived' && (
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => handleUpdateStatus(delivery.id, 'Delivered to Recipient')}
                                                className="p-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-md transition-colors"
                                                title="Mark as Handed Over"
                                            >
                                                <PackageCheck className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleUpdateStatus(delivery.id, 'Returned')}
                                                className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-md transition-colors"
                                                title="Return to Sender"
                                            >
                                                <Undo2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                    {canManage && delivery.status !== 'Arrived' && (
                                         <button 
                                            onClick={() => handleUpdateStatus(delivery.id, 'Arrived')}
                                            className="uppercase font-bold tracking-widest text-[10px] text-accent hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            Undo Status
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !isSubmitting && setIsAddModalOpen(false)}></div>
                    <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-zinc-800">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Package className="w-5 h-5 text-accent" /> Log Incoming Package
                            </h2>
                        </div>
                        <form onSubmit={handleAddDelivery} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Carrier</label>
                                <select 
                                    value={newCarrier} 
                                    onChange={(e) => setNewCarrier(e.target.value as DeliveryCarrier)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-accent"
                                >
                                    <option>UPS</option>
                                    <option>FedEx</option>
                                    <option>Amazon</option>
                                    <option>USPS</option>
                                    <option>DHL</option>
                                    <option>Internal Transfer</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Tracking #</label>
                                <input 
                                    required
                                    type="text" 
                                    value={newTracking}
                                    onChange={(e) => NEWTracking(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white font-mono focus:outline-none focus:border-accent"
                                    placeholder="1Z9999999999999999"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Recipient Name</label>
                                <input 
                                    required
                                    type="text" 
                                    value={newRecipient}
                                    onChange={(e) => setNewRecipient(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-accent"
                                    placeholder="John Doe"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Notes (Optional)</label>
                                <input 
                                    type="text" 
                                    value={newNotes}
                                    onChange={(e) => setNewNotes(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-accent"
                                    placeholder="Damaged box, left at back door..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Linked PO (Optional)</label>
                                <input 
                                    type="text" 
                                    value={newPoId}
                                    onChange={(e) => setNewPoId(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white font-mono focus:outline-none focus:border-accent"
                                    placeholder="PO-XXXX"
                                />
                            </div>
                            
                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-zinc-800/50 mt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2 text-sm font-bold text-zinc-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-2 bg-accent hover:bg-accent/90 text-white font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Package'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
