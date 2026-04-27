import { useState, useEffect } from 'react';
import { Truck, AlertTriangle, Edit2, Plus, RefreshCw, ArrowLeft, Save, FileText, Tag, BarChart3, Settings2, Activity, ChevronRight, Hash, FlaskConical, QrCode, Briefcase, Camera, Image as ImageIcon, MapPin } from 'lucide-react';
import { api } from '../../../lib/api';
import { UnsavedChangesBanner } from '../../../components/UnsavedChangesBanner';
import toast from 'react-hot-toast';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useSearchParams } from 'react-router-dom';

import { usePermissions } from '../../../hooks/usePermissions';

export function VehiclesAdminTab({ tenantId }: { tenantId: string }) {
    const { checkPermission } = usePermissions();
    const canManageVehicles = checkPermission('manage_vehicles');

    const [vehicles, setVehicles] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [zones, setZones] = useState<any[]>([]);
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();

    // Edit State
    const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
    const [initialEditVehicle, setInitialEditVehicle] = useState<any>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [activeProfileTab, setActiveProfileTab] = useState('info');
    const [isSaving, setIsSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        make: '',
        model: '',
        year: '',
        vin: '',
        licensePlate: '',
        color: '',
        status: 'Active',
        customerId: '',
        currentLocationId: '',
        qbWorkOrder: '',
        notes: ''
    });

    useEffect(() => {
        if (!tenantId || tenantId === 'unassigned') {
            setLoading(false);
            return;
        }
        
        setLoading(true);

        const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('tenantId', '==', tenantId)), (s) => {
            const fetched = s.docs.map(d => ({ id: d.id, ...d.data() }));
            fetched.sort((a: any, b: any) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?._seconds ? a.createdAt._seconds * 1000 : 0);
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?._seconds ? b.createdAt._seconds * 1000 : 0);
                return timeB - timeA;
            });
            setVehicles(fetched);
            setLoading(false);
        });

        const unsubCustomers = onSnapshot(query(collection(db, 'customers'), where('tenantId', '==', tenantId)), (s) => {
            setCustomers(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubZones = onSnapshot(query(collection(db, 'business_zones'), where('tenantId', '==', tenantId)), (s) => {
            const fetchedZones = s.docs.map(d => ({ id: d.id, ...d.data() }));
            // Only show Parking, Bay, or Storage zones in the location dropdown
            setZones(fetchedZones.filter(z => ['Parking', 'Bay'].includes((z as any).type || '')));
        });

        const unsubJobs = onSnapshot(query(collection(db, 'jobs'), where('tenantId', '==', tenantId)), (s) => {
            setJobs(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubVehicles();
            unsubCustomers();
            unsubZones();
            unsubJobs();
        };
    }, [tenantId]);

    useEffect(() => {
        const editId = searchParams.get('edit');
        if (editId && vehicles.length > 0) {
            if (!selectedVehicle || selectedVehicle.id !== editId) {
                const vh = vehicles.find(v => v.id === editId);
                if (vh) {
                    setSelectedVehicle(vh);
                    setIsEditing(false);
                    setActiveProfileTab('info');
                    const initialFormValues = {
                        make: vh.make || '',
                        model: vh.model || '',
                        year: vh.year || '',
                        vin: vh.vin || '',
                        licensePlate: vh.licensePlate || '',
                        color: vh.color || '',
                        status: vh.status || 'Active',
                        customerId: vh.customerId || '',
                        currentLocationId: vh.currentLocationId || '',
                        qbWorkOrder: vh.qbWorkOrder || '',
                        notes: vh.notes || ''
                    };
                    setEditForm(initialFormValues);
                    setInitialEditVehicle(initialFormValues);
                }
            }
        }
    }, [searchParams, vehicles]);

    const openVehicleProfile = (vehicle: any) => {
        setSelectedVehicle(vehicle);
        setIsEditing(false);
        setActiveProfileTab('info');
        setSearchParams(prev => {
            if (prev.get('edit') !== vehicle.id) {
                prev.set('edit', vehicle.id);
            }
            return prev;
        });
        const initialFormValues = {
            make: vehicle.make || '',
            model: vehicle.model || '',
            year: vehicle.year || '',
            vin: vehicle.vin || '',
            licensePlate: vehicle.licensePlate || '',
            color: vehicle.color || '',
            status: vehicle.status || 'Active',
            customerId: vehicle.customerId || '',
            currentLocationId: vehicle.currentLocationId || '',
            qbWorkOrder: vehicle.qbWorkOrder || '',
            notes: vehicle.notes || ''
        };
        setEditForm(initialFormValues);
        setInitialEditVehicle(initialFormValues);
    };

    const openAddVehicle = () => {
        setSelectedVehicle({ id: 'new' });
        setIsEditing(true);
        const initialFormValues = {
            make: '',
            model: '',
            year: '',
            vin: '',
            licensePlate: '',
            color: '',
            status: 'Active',
            customerId: '',
            currentLocationId: '',
            qbWorkOrder: '',
            notes: ''
        };
        setEditForm(initialFormValues);
        setInitialEditVehicle(initialFormValues);
    };

    const closeEditVehicle = () => {
        setSelectedVehicle(null);
        setSearchParams(prev => {
            if (prev.has('edit')) prev.delete('edit');
            return prev;
        });
    };

    const checkDuplicateVin = (vin: string) => {
        if (!vin || vin.length < 5) return null;
        return vehicles.find(v => 
            v.id !== selectedVehicle?.id && 
            v.vin?.toLowerCase() === vin.toLowerCase()
        ) || null;
    };

    const duplicateVehicleMatch = checkDuplicateVin(editForm.vin);

    const handleSaveVehicle = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedVehicle) return;

        if (duplicateVehicleMatch) {
            toast.error("A vehicle with this VIN already exists in the system.");
            return;
        }
        
        try {
            setIsSaving(true);
            const payload = { ...editForm, tenantId };

            if (selectedVehicle.id === 'new') {
                await api.post(`/vehicles`, payload);
                toast.success("Vehicle registered successfully");
            } else {
                await api.put(`/vehicles/${selectedVehicle.id}`, payload);
                toast.success("Vehicle updated successfully");
            }
            closeEditVehicle();
        } catch (err) {
            console.error(err);
            toast.error("Failed to save vehicle");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteVehicle = async (vehicleId: string) => {
        if (!window.confirm("Permanently delete this vehicle record?")) return;
        try {
            await api.delete(`/vehicles/${vehicleId}`);
            toast.success("Vehicle removed");
            if (selectedVehicle?.id === vehicleId) {
                closeEditVehicle();
            }
        } catch (err) {
            toast.error("Failed to remove vehicle");
        }
    };

    const handleGenerateBatchTags = () => {
        const count = parseInt(window.prompt("How many QR tracking tags would you like to generate?", "50") || "0", 10);
        if (!count || isNaN(count) || count <= 0) return;
        if (count > 1000) {
            toast.error("Please generate 1000 tags or fewer at a time.");
            return;
        }

        const generateRandomHash = () => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let str = '';
            for (let i = 0; i < 12; i++) {
                str += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return str;
        };
        
        let csvContent = "data:text/csv;charset=utf-8,Tracking_ID,QR_URL\n";
        for (let i = 0; i < count; i++) {
            const hash = generateRandomHash();
            const url = `https://upfittersos.com/qr/${hash}`;
            csvContent += `${hash},${url}\n`;
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `upfitters_qr_tags_batch_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${count} tags to CSV!`, { icon: '🖨️' });
    };

    const getCustomerName = (cId: string) => {
        const c = customers.find(x => x.id === cId);
        if (!c) return '—';
        return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Unnamed Customer';
    };

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center flex items-center justify-center gap-2"><RefreshCw className="w-5 h-5 animate-spin"/> Loading Fleet Data...</div>;
    }

    if (selectedVehicle && isEditing) {
        return (
            <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
                <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => selectedVehicle.id === 'new' ? closeEditVehicle() : setIsEditing(false)}
                            className="p-2 border border-zinc-700 bg-zinc-800 rounded-lg hover:bg-zinc-700 hover:text-white text-zinc-400 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-zinc-800 items-center justify-center border border-zinc-700 flex shrink-0">
                                <Truck className="w-5 h-5 text-zinc-500" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white">
                                    {selectedVehicle.id === 'new' ? 'Register Asset' : (editForm.year || editForm.make || editForm.model ? `${editForm.year} ${editForm.make} ${editForm.model}`.trim() : 'Unnamed Vehicle')}
                                </h2>
                                {editForm.vin && <p className="text-zinc-500 font-mono text-sm">{editForm.vin}</p>}
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={handleSaveVehicle}
                        disabled={isSaving}
                        className="hidden md:flex bg-accent hover:bg-accent-hover text-white font-bold px-6 py-2 rounded-lg items-center gap-2 shadow-lg disabled:opacity-50 transition-all font-mono tracking-widest uppercase text-xs"
                    >
                        <Save className="w-4 h-4" /> {isSaving ? 'Saving' : 'Save'}
                    </button>
                </div>

                <form onSubmit={handleSaveVehicle} className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-10 pb-24">
                    
                    {/* Identification */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <Settings2 className="w-5 h-5 text-accent" /> Specifications
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Year</label>
                                <input type="text" placeholder="2024" value={editForm.year} onChange={(e) => setEditForm({...editForm, year: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Make</label>
                                <input type="text" placeholder="Ford" value={editForm.make} onChange={(e) => setEditForm({...editForm, make: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Model</label>
                                <input type="text" placeholder="F-150" value={editForm.model} onChange={(e) => setEditForm({...editForm, model: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">VIN</label>
                                <div className="relative">
                                    <Hash className="w-4 h-4 absolute left-4 top-3.5 text-zinc-600" />
                                    <input type="text" placeholder="1FTFW1EG..." value={editForm.vin} onChange={(e) => setEditForm({...editForm, vin: e.target.value.toUpperCase()})} className={`w-full bg-zinc-900 border ${duplicateVehicleMatch ? 'border-amber-500 focus:border-amber-500' : 'border-zinc-800 focus:border-accent'} rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none text-white uppercase font-mono`} />
                                </div>
                                {duplicateVehicleMatch && (
                                    <p className="text-amber-400 text-[10px] font-bold mt-1.5 px-1 leading-tight flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> Already registered ({duplicateVehicleMatch.year} {duplicateVehicleMatch.make}).
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">License Plate</label>
                                <input type="text" placeholder="ABC-1234" value={editForm.licensePlate} onChange={(e) => setEditForm({...editForm, licensePlate: e.target.value.toUpperCase()})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white uppercase font-mono" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Color</label>
                                <input type="text" placeholder="Oxford White" value={editForm.color} onChange={(e) => setEditForm({...editForm, color: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                        </div>
                    </section>

                    {/* Operational Status */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <Activity className="w-5 h-5 text-indigo-400" /> Operational Context
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Status</label>
                                <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white appearance-none cursor-pointer">
                                    <option value="Active">Active</option>
                                    <option value="In Shop">In Shop (Maintenance)</option>
                                    <option value="Out of Service">Out of Service</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Assigned Customer</label>
                                <select value={editForm.customerId} onChange={(e) => setEditForm({...editForm, customerId: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white appearance-none cursor-pointer">
                                    <option value="">-- Internal Fleet / Unassigned --</option>
                                    {customers.map(c => (
                                        <option key={c.id} value={c.id}>{getCustomerName(c.id)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Current Yard Location</label>
                                <select value={editForm.currentLocationId} onChange={(e) => setEditForm({...editForm, currentLocationId: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white appearance-none cursor-pointer">
                                    <option value="">-- Off-site / Storage --</option>
                                    {zones.map(z => (
                                        <option key={z.id} value={z.id}>{z.label || `Zone ${z.id.substring(0,6)}`} ({z.type})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">QuickBooks Work Order #</label>
                                <input type="text" placeholder="WO-..." value={editForm.qbWorkOrder} onChange={(e) => setEditForm({...editForm, qbWorkOrder: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white font-mono uppercase" />
                            </div>
                        </div>
                    </section>

                    {/* Notes */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <FileText className="w-5 h-5 text-orange-400" /> Internal Notes
                        </h3>
                        <textarea 
                            rows={4}
                            placeholder="Add maintenance history, upfit details, or damage reports..."
                            value={editForm.notes}
                            onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400/50 text-white resize-none"
                        ></textarea>
                    </section>

                    {/* Danger Zone */}
                    {selectedVehicle.id !== 'new' && (
                        <section className="mt-12 pt-8 border-t border-red-900/30">
                            <h3 className="text-lg font-bold text-red-500 mb-2 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" /> Danger Zone
                            </h3>
                            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h4 className="text-white font-bold text-sm mb-1">Delete Fleet Asset</h4>
                                    <p className="text-zinc-400 text-xs text-balance">Once you delete an asset, there is no going back. This will permanently erase its maintenance history and unlink installed parts.</p>
                                </div>
                                {canManageVehicles && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteVehicle(selectedVehicle.id)}
                                        className="bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 border border-red-500/20 font-bold px-6 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap"
                                    >
                                        Delete Asset
                                    </button>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Mobile Save Button */}
                    <button 
                        type="submit"
                        disabled={isSaving}
                        className="md:hidden w-full bg-accent hover:bg-accent-hover text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all text-sm uppercase tracking-widest"
                    >
                        <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </form>

                <UnsavedChangesBanner 
                    hasChanges={initialEditVehicle !== null && JSON.stringify(initialEditVehicle) !== JSON.stringify(editForm)} 
                    onSave={() => handleSaveVehicle({ preventDefault: () => {} } as any)} 
                    onDiscard={() => setEditForm(initialEditVehicle!)} 
                    isSaving={isSaving} 
                />
            </div>
        );
    }

    if (selectedVehicle && !isEditing) {
        return (
            <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
                {/* Profile Header */}
                <div className="p-6 md:p-8 border-b border-zinc-800 bg-zinc-900/50 flex flex-col gap-6 sticky top-0 z-20 backdrop-blur-md">
                    <div className="flex items-center justify-between">
                        <button onClick={closeEditVehicle} className="text-zinc-400 hover:text-white flex items-center gap-2"><ArrowLeft className="w-4 h-4"/> Back to Fleet</button>
                        {canManageVehicles && (
                            <button onClick={() => setIsEditing(true)} className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors border border-zinc-700"><Edit2 className="w-4 h-4"/> Edit Specs</button>
                        )}
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 shadow-inner">
                            <Truck className="w-8 h-8 text-zinc-500" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-3xl font-black text-white tracking-tight">
                                    {(editForm.year || editForm.make || editForm.model) ? `${editForm.year} ${editForm.make} ${editForm.model}`.trim() : 'Unnamed Vehicle'}
                                </h2>
                                <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
                                    editForm.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                    editForm.status === 'In Shop' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                    'bg-zinc-800 text-zinc-400 border-zinc-700'
                                }`}>
                                    {editForm.status || 'Active'}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                                {editForm.vin && <p className="text-sm font-mono text-zinc-500 tracking-wide">{editForm.vin}</p>}
                                {editForm.licensePlate && (
                                     <>
                                        <span className="text-zinc-700">•</span>
                                        <p className="text-xs font-black uppercase tracking-widest text-zinc-400 bg-zinc-900 border border-zinc-700 px-2 py-0.5 rounded">{editForm.licensePlate}</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    {/* Profile Tabs Config */}
                    <div className="flex items-center gap-6 border-b border-zinc-800/50 -mb-6 md:-mb-8 overflow-x-auto no-scrollbar pb-3">
                        {[
                            { id: 'info', label: 'Specs & Setup' },
                            { id: 'jobs', label: 'Upfit History' },
                            { id: 'inventory', label: 'Installed Parts' }
                        ].map(t => (
                            <button 
                                key={t.id} 
                                onClick={() => setActiveProfileTab(t.id)}
                                className={`pb-3 text-sm font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap ${activeProfileTab === t.id ? 'border-accent text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                            >{t.label}</button>
                        ))}
                    </div>
                </div>

                {/* Tab Contents */}
                <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
                     {activeProfileTab === 'info' && (
                         <div className="space-y-8">
                             {(() => {
                                 const activeJob = jobs.find(j => j.vehicleId === selectedVehicle?.id && !['Completed', 'Cancelled', 'Archived'].includes(j.status));
                                 const totalPhotos = activeJob?.intakePhotos?.length || 0;
                                 return (
                                     <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                         {/* Status Box */}
                                         <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                                             <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2"><Activity className="w-4 h-4 text-accent"/> Overview</h3>
                                             <div className="space-y-4">
                                                 <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Ownership / Client</p><p className="text-zinc-300 font-medium">{editForm.customerId ? getCustomerName(editForm.customerId) : 'Internal Fleet Asset'}</p></div>
                                                 <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Vehicle Match Details</p><p className="text-zinc-300 font-medium">{editForm.color || '—'}</p></div>
                                                 <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">License Plate</p><p className="text-zinc-300 font-medium">{editForm.licensePlate || '—'}</p></div>
                                                 <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Current Mileage</p><p className="text-zinc-300 font-medium">{selectedVehicle?.mileage ? parseInt(selectedVehicle.mileage).toLocaleString() + ' mi' : 'Unknown'}</p></div>
                                                 <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Assigned Spot</p>
                                                     {editForm.currentLocationId ? (
                                                         <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-widest">
                                                             {zones.find(z => z.id === editForm.currentLocationId)?.label || 'Unknown'}
                                                         </span>
                                                     ) : <p className="text-zinc-500 font-medium italic">Off-site</p>}
                                                 </div>
                                             </div>
                                         </div>

                                         {/* Live System Status Box */}
                                         <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                                             <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400"/> System Status</h3>
                                             <div className="space-y-4">
                                                 <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">CompanyCam Sync</p><p className="text-zinc-300 font-medium">{selectedVehicle?.companyCamProjectId ? `Linked (${selectedVehicle.companyCamProjectId})` : 'Unlinked'}</p></div>
                                                 <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">QuickBooks WP#</p><p className="text-zinc-300 font-medium">{selectedVehicle?.qbWorkOrder || 'Unlinked'}</p></div>
                                                 <div>
                                                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Active Job</p>
                                                    {activeJob ? (
                                                        <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-widest inline-flex truncate max-w-full">
                                                            {activeJob.jobNumber ? `#${activeJob.jobNumber} - ${activeJob.title}` : activeJob.title}
                                                        </span>
                                                    ) : (
                                                        <p className="text-zinc-600 font-medium italic">Idle</p>
                                                    )}
                                                 </div>
                                                 <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Recent Flow Photos</p><p className="text-zinc-300 font-medium">{totalPhotos} Assets Captured</p></div>
                                             </div>
                                         </div>

                                         {/* Notes Box */}
                                         <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                                             <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2"><FileText className="w-4 h-4 text-orange-400"/> Operational Notes</h3>
                                             {editForm.notes ? (
                                                <p className="text-zinc-300 whitespace-pre-wrap text-sm leading-relaxed">{editForm.notes}</p>
                                             ) : <p className="text-zinc-600 italic text-sm">No notes written.</p>}
                                         </div>
                                     </div>
                                 );
                             })()}
                         </div>
                     )}

                     {activeProfileTab === 'jobs' && (
                         <div className="space-y-6">
                            {jobs.filter(j => j.vehicleId === selectedVehicle?.id).length === 0 ? (
                                 <div className="bg-zinc-900/50 border border-zinc-800 border-dashed rounded-2xl p-12 text-center">
                                     <Briefcase className="w-8 h-8 text-zinc-700 mx-auto mb-4" />
                                     <h3 className="text-zinc-400 font-bold mb-1">No Historical Work Orders</h3>
                                     <p className="text-zinc-600 text-sm">No historical jobs found for this vehicle.</p>
                                 </div>
                            ) : (
                                jobs.filter(j => j.vehicleId === selectedVehicle?.id)
                                .sort((a,b) => {
                                    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?._seconds ? a.createdAt._seconds * 1000 : 0);
                                    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?._seconds ? b.createdAt._seconds * 1000 : 0);
                                    return timeB - timeA;
                                })
                                .map(vhJob => (
                                    <div key={vhJob.id} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors">
                                        <div className="p-6 border-b border-zinc-800/50 flex items-start gap-4">
                                            <div className="bg-zinc-800 rounded-lg p-3 shrink-0">
                                                <Briefcase className="w-5 h-5 text-blue-400" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between gap-4 mb-2">
                                                    <h3 className="font-bold text-white text-lg">{vhJob.title || `Job #${vhJob.jobNumber || vhJob.id.slice(-4)}`}</h3>
                                                    <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
                                                        vhJob.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                                        vhJob.status === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                        'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                    }`}>
                                                        {vhJob.status || 'Draft'}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-zinc-400 mb-4">{vhJob.description || 'No operational description provided.'}</p>
                                                
                                                <div className="flex flex-wrap gap-4 text-xs font-medium text-zinc-500">
                                                    {vhJob.parkedLocation && (
                                                        <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Checked in at: {vhJob.parkedLocation}</div>
                                                    )}
                                                    {vhJob.vehicleDetails?.mileage && (
                                                        <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Mileage IN: {parseInt(vhJob.vehicleDetails.mileage).toLocaleString()} mi</div>
                                                    )}
                                                    {vhJob.companyCamProjectId && (
                                                        <div className="flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Bound Cam: {vhJob.companyCamProjectId}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Intake Media Details */}
                                        {((vhJob.intakePhotos && vhJob.intakePhotos.length > 0) || vhJob.checkInNotes) && (
                                            <div className="p-6 bg-zinc-900/30 flex flex-col md:flex-row gap-6">
                                                
                                                {vhJob.intakePhotos && vhJob.intakePhotos.length > 0 && (
                                                    <div className="flex-1">
                                                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5"/> Attached Intake Media ({vhJob.intakePhotos.length})</h4>
                                                        <div className="flex flex-wrap gap-3">
                                                            {vhJob.intakePhotos.map((photo: any, i: number) => (
                                                                <div key={i} className="w-24 h-24 rounded-lg bg-zinc-800 overflow-hidden border border-zinc-700 relative group cursor-pointer hover:border-accent transition-colors">
                                                                    <img src={photo.url} alt="Intake" className="w-full h-full object-cover" />
                                                                    <div className="absolute inset-x-0 bottom-0 bg-black/80 p-1 text-center backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <span className="text-[9px] font-bold text-white uppercase tracking-widest">{photo.category || 'Photo'}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {vhJob.checkInNotes && (
                                                    <div className="flex-1 py-4 px-5 bg-orange-500/5 rounded-xl border border-orange-500/10 h-fit">
                                                        <h4 className="text-[10px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5"/> Intake Diagnostic Log</h4>
                                                        <p className="text-xs text-orange-200/80 leading-relaxed whitespace-pre-wrap">{vhJob.checkInNotes}</p>
                                                    </div>
                                                )}

                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                         </div>
                     )}
                     
                     {activeProfileTab === 'inventory' && (
                         <div className="bg-zinc-900/50 border border-zinc-800 border-dashed rounded-2xl p-12 text-center">
                             <Tag className="w-8 h-8 text-zinc-700 mx-auto mb-4" />
                             <h3 className="text-zinc-400 font-bold mb-1">No Scanned Parts</h3>
                             <p className="text-zinc-600 text-sm">Use the WMS scanner to link physical inventory to this asset.</p>
                         </div>
                     )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full bg-zinc-950 relative overflow-visible">
            {/* Alpha Banner */}
            <div className="bg-orange-500/5 border-b border-orange-500/20 px-6 py-3 flex items-start gap-3 shrink-0 relative z-10">
                <FlaskConical className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                    <h4 className="text-orange-400 font-bold text-sm">Feature Preview (Alpha Roadmap)</h4>
                    <p className="text-orange-400/80 text-xs mt-0.5">Fleet & Vehicles is currently in active development. You may start testing it now, but expect rapid updates and potential data resets prior to stable release.</p>
                </div>
            </div>

            {/* Quick Add Bar */}
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 shrink-0 flex items-center justify-between relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-white font-bold tracking-tight">Fleet & Vehicles</h3>
                        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                            Alpha Labs
                        </span>
                    </div>
                    <p className="text-zinc-500 text-xs">Manage vehicles, assets, and active upfits in the yard.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-xs font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Live
                    </div>
                    {canManageVehicles && (
                        <>
                            <button
                                onClick={handleGenerateBatchTags}
                                className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm border border-zinc-700 hidden sm:flex"
                            >
                                <QrCode className="w-4 h-4 text-indigo-400" /> Export QR Batch
                            </button>
                            <button 
                                onClick={openAddVehicle}
                                className="bg-accent hover:bg-accent-hover text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
                            >
                                <Plus className="w-4 h-4" /> Register Asset
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-zinc-900/50 border-b border-zinc-800 text-xs font-black text-zinc-500 uppercase tracking-widest shrink-0">
                <div className="col-span-5 md:col-span-3 object-cover">Vehicle / VIN</div>
                <div className="hidden md:block col-span-3">Assigned To</div>
                <div className="col-span-3 md:col-span-2">Health</div>
                <div className="hidden md:block col-span-3">Live Status</div>
                <div className="col-span-4 md:col-span-1 text-right">Actions</div>
            </div>

            {/* Table Body */}
            <div className="w-full">
                {vehicles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <Truck className="w-12 h-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-1">Empty Yard</h3>
                        <p className="text-zinc-500 text-sm">Register a vehicle to start tracking assets.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800/50">
                        {vehicles.map((vh) => {
                            const activeJob = jobs.find(j => j.vehicleId === vh.id && !['Completed', 'Cancelled', 'Archived'].includes(j.status));
                            const hasCompanyCam = !!vh.companyCamProjectId;
                            const totalPhotos = activeJob?.intakePhotos?.length || 0;
                            
                            return (
                            <div key={vh.id} onClick={() => openVehicleProfile(vh)} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-zinc-900/30 transition-colors group cursor-pointer">
                                <div className="col-span-5 md:col-span-3 flex flex-col">
                                    <span className="font-bold text-sm text-zinc-200 group-hover:text-accent transition-colors">
                                        {(vh.year || vh.make || vh.model) ? `${vh.year} ${vh.make} ${vh.model}`.trim() : 'Unnamed Vehicle'}
                                    </span>
                                    {vh.vin && <span className="text-[10px] font-mono text-zinc-500 mt-0.5 tracking-wider">{vh.vin}</span>}
                                </div>
                                <div className="hidden md:flex col-span-3 flex-col text-xs text-zinc-400">
                                    <span className="font-medium text-zinc-400 truncate">{vh.customerId ? getCustomerName(vh.customerId) : 'Internal Fleet'}</span>
                                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mt-1">
                                        Loc: {vh.currentLocationId && zones.find(z => z.id === vh.currentLocationId) ? zones.find(z => z.id === vh.currentLocationId)?.label : 'Off-site'}
                                    </span>
                                </div>
                                <div className="col-span-3 md:col-span-2 flex items-center">
                                    <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
                                        vh.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                        vh.status === 'In Shop' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                        'bg-zinc-800 text-zinc-400 border-zinc-700'
                                    }`}>
                                        {vh.status || 'Active'}
                                    </span>
                                </div>
                                <div className="hidden md:flex col-span-3 flex-wrap gap-1.5 items-center">
                                    {activeJob ? (
                                        <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                                            <Briefcase className="w-3 h-3" />
                                            <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">
                                                {activeJob.jobNumber ? `#${activeJob.jobNumber}` : `#${activeJob.id.slice(-4)}`}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 bg-zinc-800/50 text-zinc-600 border border-zinc-800/50 px-2 py-0.5 rounded-full">
                                            <Briefcase className="w-3 h-3" />
                                            <span className="text-[9px] font-black uppercase tracking-widest">Idle</span>
                                        </div>
                                    )}
                                    {hasCompanyCam ? (
                                        <div title={`CompanyCam: ${vh.companyCamProjectId}`} className="flex items-center gap-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full hidden lg:flex">
                                            <Camera className="w-3 h-3" />
                                            <span className="text-[9px] font-black uppercase tracking-widest hidden lg:block">Cam</span>
                                        </div>
                                    ) : (
                                        <div title="No CompanyCam Linked" className="flex items-center gap-1.5 bg-zinc-800/50 text-zinc-600 border border-zinc-800/50 px-2 py-0.5 rounded-full hidden lg:flex w-fit">
                                            <Camera className="w-3 h-3" />
                                        </div>
                                    )}
                                    {totalPhotos > 0 ? (
                                        <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full hidden xl:flex">
                                            <ImageIcon className="w-3 h-3" />
                                            <span className="text-[9px] font-black uppercase tracking-widest">{totalPhotos}</span>
                                        </div>
                                    ) : (
                                        <div title="No Intake Photos" className="flex items-center gap-1.5 bg-zinc-800/50 text-zinc-600 border border-zinc-800/50 px-2 py-0.5 rounded-full hidden xl:flex w-fit">
                                            <ImageIcon className="w-3 h-3" />
                                        </div>
                                    )}
                                </div>
                                <div className="col-span-4 md:col-span-1 flex items-center justify-end">
                                    <div className="text-zinc-600 group-hover:text-accent transition-colors ml-2 hidden md:block">
                                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
