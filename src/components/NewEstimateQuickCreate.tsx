import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { api } from '../lib/api';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { CustomerSelector, VehicleSelector } from './EntitySelectors';
import toast from 'react-hot-toast';

interface NewEstimateQuickCreateProps {
    isOpen: boolean;
    onClose: () => void;
    tenantId: string;
}

export function NewEstimateQuickCreate({ isOpen, onClose, tenantId }: NewEstimateQuickCreateProps) {
    const navigate = useNavigate();
    const [title, setTitle] = useState('New Estimate');
    const [customerId, setCustomerId] = useState('');
    const [vehicleId, setVehicleId] = useState('');
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [allCustomers, setAllCustomers] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [allVehicles, setAllVehicles] = useState<any[]>([]);
    
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (!isOpen || !tenantId) return;
        
        const fetchData = async () => {
            setIsLoadingData(true);
            try {
                const cQ = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
                const vQ = query(collection(db, 'vehicles'), where('tenantId', '==', tenantId));
                const [cSnap, vSnap] = await Promise.all([getDocs(cQ), getDocs(vQ)]);
                
                setAllCustomers(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                setAllVehicles(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) {
                console.error("Failed to fetch customers/vehicles", e);
            } finally {
                setIsLoadingData(false);
            }
        };
        fetchData();
    }, [isOpen, tenantId]);

    const handleCreate = async () => {
        if (!tenantId) return;
        setIsCreating(true);
        try {
            const res = await api.post('/jobs', {
                title: title.trim() || 'New Estimate',
                customerId: customerId === 'custom' ? '' : customerId,
                vehicleId: vehicleId === 'custom' ? '' : vehicleId,
                status: 'Estimate',
                tenantId
            });
            onClose();
            navigate(`/business/jobs/${res.data.id || res.data.jobId}`);
        } catch (err) {
            console.error(err);
            toast.error("Failed to create estimate");
        } finally {
            setIsCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-6 pb-0 tracking-wide">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] md:max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-accent/20 rounded-xl">
                            <Plus className="w-5 h-5 text-accent" />
                        </div>
                        <h2 className="text-lg font-bold text-white tracking-wide">Start New Estimate</h2>
                    </div>
                    <button onClick={onClose} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {isLoadingData && allCustomers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                            <Loader2 className="w-8 h-8 animate-spin mb-4" />
                            <span className="font-bold">Loading Data...</span>
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Job Title / Reference</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="e.g. Lift Kit & Wheels"
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-accent transition-colors outline-none"
                                />
                            </div>
                            <CustomerSelector
                                data={allCustomers}
                                value={customerId}
                                onChange={(val) => setCustomerId(val)}
                                placeholder="Select Customer (Optional)"
                                label="Customer"
                            />
                            <VehicleSelector
                                data={allVehicles}
                                value={vehicleId}
                                onChange={(val) => setVehicleId(val)}
                                placeholder="Select Vehicle (Optional)"
                                label="Vehicle"
                            />
                        </>
                    )}
                </div>
                <div className="p-6 border-t border-zinc-800 bg-zinc-900/30 shrink-0">
                    <button
                        onClick={handleCreate}
                        disabled={isCreating || (isLoadingData && allCustomers.length === 0)}
                        className="w-full bg-accent hover:bg-accent-hover text-white font-black uppercase tracking-widest px-6 py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-accent/20 transition-all disabled:opacity-50"
                    >
                        {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Plus className="w-5 h-5" /> Create & Proceed</>}
                    </button>
                </div>
                <div className="h-6 md:hidden bg-zinc-950 shrink-0" />
            </div>
        </div>
    );
}
