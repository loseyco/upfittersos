import { useState, useEffect } from 'react';
import { MapPin, AlertTriangle, Edit2, Plus, RefreshCw, ArrowLeft, Save, Map, Settings2, Activity, ChevronRight, FlaskConical } from 'lucide-react';
import { api } from '../../../lib/api';
import { UnsavedChangesBanner } from '../../../components/UnsavedChangesBanner';
import toast from 'react-hot-toast';
import { usePermissions } from '../../../hooks/usePermissions';

export function AreasAdminTab({ tenantId }: { tenantId: string }) {
    const { checkPermission } = usePermissions();
    const canManageAreas = checkPermission('manage_areas');

    const [areas, setAreas] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit State
    const [selectedArea, setSelectedArea] = useState<any>(null);
    const [initialEditArea, setInitialEditArea] = useState<any>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    const [editForm, setEditForm] = useState({
        label: '',
        type: 'Bay',
        color: '#3b82f6',
        status: 'Active',
        capacity: '',
        wallHeight: 10,
        floorId: 'default',
        notes: ''
    });

    const fetchAreas = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/areas?tenantId=${tenantId}`);
            setAreas(res.data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load map zones.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAreas();
    }, [tenantId]);

    const openAreaProfile = (area: any) => {
        setSelectedArea(area);
        setIsEditing(false);
        const initialFormValues = {
            label: area.label || '',
            type: area.type || 'Bay',
            color: area.color || '#3b82f6',
            status: area.status || 'Active',
            capacity: area.capacity || '',
            wallHeight: area.wallHeight || 10,
            floorId: area.floorId || 'default',
            notes: area.notes || ''
        };
        setEditForm(initialFormValues);
        setInitialEditArea(initialFormValues);
    };

    const openAddArea = () => {
        setSelectedArea({ id: 'new' });
        setIsEditing(true);
        const initialFormValues = {
            label: '',
            type: 'Bay',
            color: '#3b82f6',
            status: 'Active',
            capacity: '',
            wallHeight: 10,
            floorId: 'default',
            notes: ''
        };
        setEditForm(initialFormValues);
        setInitialEditArea(initialFormValues);
    };

    const closeEditArea = () => {
        setSelectedArea(null);
    };

    const handleSaveArea = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedArea) return;
        
        try {
            setIsSaving(true);
            const payload = { ...editForm, tenantId };

            if (selectedArea.id === 'new') {
                await api.post(`/areas`, payload);
                toast.success("Zone registered successfully");
            } else {
                await api.put(`/areas/${selectedArea.id}`, payload);
                toast.success("Zone updated successfully");
            }
            
            fetchAreas();
            closeEditArea();
        } catch (err) {
            console.error(err);
            toast.error("Failed to save area");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteArea = async (areaId: string) => {
        if (!window.confirm("Permanently delete this area? This removes it from the map layout geometry!")) return;
        try {
            await api.delete(`/areas/${areaId}`);
            toast.success("Area removed");
            if (selectedArea?.id === areaId) {
                closeEditArea();
            }
            fetchAreas();
        } catch (err) {
            toast.error("Failed to remove area");
        }
    };

    const getColorForType = (val: string) => {
        switch (val) {
            case 'Bay': return '#3b82f6';
            case 'Parking': return '#9ca3af';
            case 'Office': return '#10b981';
            case 'Equipment': return '#f59e0b';
            case 'Room': return '#8b5cf6';
            case 'Building': return '#1f2937';
            case 'Door - Garage': return '#0ea5e9';
            case 'Door - Man': return '#ef4444';
            case 'Door - Misc': return '#64748b';
            case 'Other': return '#3f3f46';
            default: return '#3b82f6';
        }
    };

    const handleTypeChange = (val: string) => {
        setEditForm({ ...editForm, type: val, color: getColorForType(val) });
    };

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center flex items-center justify-center gap-2"><RefreshCw className="w-5 h-5 animate-spin"/> Loading Facility Geometry...</div>;
    }

    if (selectedArea && isEditing) {
        return (
            <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
                <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => selectedArea.id === 'new' ? closeEditArea() : setIsEditing(false)}
                            className="p-2 border border-zinc-700 bg-zinc-800 rounded-lg hover:bg-zinc-700 hover:text-white text-zinc-400 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-zinc-800 items-center justify-center border border-zinc-700 flex shrink-0" style={{ borderColor: editForm.color }}>
                                <MapPin className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white">
                                    {selectedArea.id === 'new' ? 'Register New Area & Zone' : (editForm.label || 'Unnamed Area')}
                                </h2>
                                <p className="text-zinc-500 font-mono text-sm">{selectedArea.id}</p>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={handleSaveArea}
                        disabled={isSaving}
                        className="hidden md:flex bg-accent hover:bg-accent-hover text-white font-bold px-6 py-2 rounded-lg items-center gap-2 shadow-lg disabled:opacity-50 transition-all font-mono tracking-widest uppercase text-xs"
                    >
                        <Save className="w-4 h-4" /> {isSaving ? 'Saving' : 'Save'}
                    </button>
                </div>

                <form onSubmit={handleSaveArea} className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-10 pb-24">
                    
                    {/* Identification */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <Settings2 className="w-5 h-5 text-accent" /> Dimensions & Detail
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="lg:col-span-2">
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Location Label</label>
                                <input type="text" placeholder="Bay 1, South Parking, etc." value={editForm.label} onChange={(e) => setEditForm({...editForm, label: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Type Focus</label>
                                <select value={editForm.type} onChange={(e) => handleTypeChange(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white appearance-none cursor-pointer">
                                    <option value="Bay">Bay</option>
                                    <option value="Parking">Parking Spot</option>
                                    <option value="Equipment">Machine/Equipment</option>
                                    <option value="Room">Interior Room</option>
                                    <option value="Office">Office</option>
                                    <option value="Building">Building Shell</option>
                                    <option value="Door - Garage">Door - Garage</option>
                                    <option value="Door - Man">Door - Man</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Color Marker</label>
                                <input type="color" value={editForm.color} onChange={(e) => setEditForm({...editForm, color: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 h-[46px] text-sm focus:outline-none focus:border-accent cursor-pointer" />
                            </div>
                        </div>
                    </section>

                    {/* Operational Space */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <Activity className="w-5 h-5 text-indigo-400" /> Operational Scope
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Status</label>
                                <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white appearance-none cursor-pointer">
                                    <option value="Active">Operational & Active</option>
                                    <option value="Maintenance">Under Maintenance</option>
                                    <option value="Inactive">Storage / Inactive</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Capacity / Size Info</label>
                                <input type="text" placeholder="Fits 1 Van..." value={editForm.capacity} onChange={(e) => setEditForm({...editForm, capacity: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Wall Height (Ft)</label>
                                <input type="number" placeholder="10" value={editForm.wallHeight} onChange={(e) => setEditForm({...editForm, wallHeight: parseInt(e.target.value) || 0})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white" />
                            </div>
                        </div>
                    </section>

                    {/* Notes */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <Edit2 className="w-5 h-5 text-orange-400" /> Internal Notes
                        </h3>
                        <textarea 
                            rows={4}
                            placeholder="Add power supply info, restrictions, tool locations..."
                            value={editForm.notes}
                            onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400/50 text-white resize-none"
                        ></textarea>
                    </section>

                    {/* Danger Zone */}
                    {selectedArea.id !== 'new' && (
                        <section className="mt-12 pt-8 border-t border-red-900/30">
                            <h3 className="text-lg font-bold text-red-500 mb-2 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" /> Danger Zone
                            </h3>
                            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h4 className="text-white font-bold text-sm mb-1">Delete Geometry & Data</h4>
                                    <p className="text-zinc-400 text-xs text-balance">Once you delete an area, it is permanently erased from the facility map. Geometrical points will be destroyed.</p>
                                </div>
                                {canManageAreas && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteArea(selectedArea.id)}
                                        className="bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 border border-red-500/20 font-bold px-6 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap"
                                    >
                                        Drop Area
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
                    hasChanges={initialEditArea !== null && JSON.stringify(initialEditArea) !== JSON.stringify(editForm)} 
                    onSave={() => handleSaveArea({ preventDefault: () => {} } as any)} 
                    onDiscard={() => setEditForm(initialEditArea!)} 
                    isSaving={isSaving} 
                />
            </div>
        );
    }

    if (selectedArea && !isEditing) {
        // Safe mapping to area points if it exists.
        const isMapped = selectedArea.points && selectedArea.points.length > 0;
        const dimensions = isMapped ? `${(selectedArea.width/10).toFixed(1)} x ${(selectedArea.height/10).toFixed(1)} ft` : 'Unmapped Location';

        return (
            <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
                {/* Profile Header */}
                <div className="p-6 md:p-8 border-b border-zinc-800 bg-zinc-900/50 flex flex-col gap-6 sticky top-0 z-20 backdrop-blur-md">
                    <div className="flex items-center justify-between">
                        <button onClick={closeEditArea} className="text-zinc-400 hover:text-white flex items-center gap-2"><ArrowLeft className="w-4 h-4"/> Back to Registry</button>
                        {canManageAreas && (
                            <button onClick={() => setIsEditing(true)} className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors border border-zinc-700"><Edit2 className="w-4 h-4"/> Edit Target</button>
                        )}
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-zinc-800 border-2 flex items-center justify-center shrink-0 shadow-inner" style={{ borderColor: selectedArea.color }}>
                            <MapPin className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <div className="flex flex-col items-start gap-2 mb-1">
                                <h2 className="text-3xl font-black text-white tracking-tight">
                                    {selectedArea.label || 'Unnamed Location'}
                                </h2>
                                <div className="flex items-center gap-2">
                                <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
                                    selectedArea.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                    selectedArea.status === 'Maintenance' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                    'bg-zinc-800 text-zinc-400 border-zinc-700'
                                }`}>
                                    {selectedArea.status || 'Active'}
                                </span>
                                <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border bg-zinc-800/50 text-zinc-400 border-zinc-700">{selectedArea.type}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Profile Overview */}
                <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
                    <div className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Status Box */}
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                                <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2"><Map className="w-4 h-4 text-accent"/> Map Status</h3>
                                <div className="space-y-4">
                                    <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Dimensions</p><p className="text-zinc-300 font-medium">{dimensions}</p></div>
                                    <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Capacity</p><p className="text-zinc-300 font-medium">{selectedArea.capacity || '—'}</p></div>
                                </div>
                                {!isMapped && (
                                    <div className="mt-4 bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex gap-3 text-orange-400 text-sm">
                                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                                        <p>This area currently isn't mapped to coordinates on the Facility Map UI. To draw it visually, open the Facility Map Editor and trace its footprint.</p>
                                    </div>
                                )}
                            </div>

                            {/* Notes Box */}
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                                <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400"/> Operational Notes</h3>
                                {selectedArea.notes ? (
                                    <p className="text-zinc-300 whitespace-pre-wrap text-sm leading-relaxed">{selectedArea.notes}</p>
                                ) : <p className="text-zinc-600 italic text-sm">No specific instructions or constraints recorded.</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-zinc-950 relative">
            {/* Alpha Banner */}
            <div className="bg-orange-500/5 border-b border-orange-500/20 px-6 py-3 flex items-start gap-3 shrink-0 relative z-10 transition-colors">
                <FlaskConical className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                    <h4 className="text-orange-400 font-bold text-sm">Feature Preview (Alpha Roadmap)</h4>
                    <p className="text-orange-400/80 text-xs mt-0.5">Area Management interacts directly with the Facility Map Geometry. Modifying or Dropping Areas here will mutate polygon references on the Map UI.</p>
                </div>
            </div>

            {/* Quick Add Bar */}
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 shrink-0 flex items-center justify-between relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-white font-bold tracking-tight">Area Management</h3>
                        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                            Alpha Labs
                        </span>
                    </div>
                    <p className="text-zinc-500 text-xs">Manage bays, parking zones, equipment boundaries, and work areas.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={fetchAreas} className="p-2 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    {canManageAreas && (
                        <button 
                            onClick={openAddArea}
                            className="bg-accent hover:bg-accent-hover text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
                        >
                            <Plus className="w-4 h-4" /> Pre-Assign Area
                        </button>
                    )}
                </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-zinc-900/50 border-b border-zinc-800 text-xs font-black text-zinc-500 uppercase tracking-widest shrink-0">
                <div className="col-span-5 md:col-span-4 object-cover">Location Designation</div>
                <div className="hidden md:block col-span-3">Zone Type</div>
                <div className="col-span-3 md:col-span-2">Op Status</div>
                <div className="col-span-4 md:col-span-3 text-right">Actions</div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto">
                {areas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <MapPin className="w-12 h-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-1">Untracked Terrain</h3>
                        <p className="text-zinc-500 text-sm">Assign a zone or build one from the Facility Map Editor.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800/50">
                        {areas.map((ar) => (
                            <div key={ar.id} onClick={() => openAreaProfile(ar)} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-zinc-900/30 transition-colors group cursor-pointer">
                                <div className="col-span-5 md:col-span-4 flex items-center gap-4">
                                    <div className="w-3 h-3 rounded-full shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.1)]" style={{ backgroundColor: ar.color || '#3b82f6' }}></div>
                                    <span className="font-bold text-sm text-zinc-200 group-hover:text-accent transition-colors truncate">
                                        {ar.label || 'Unnamed Area'}
                                    </span>
                                </div>
                                <div className="hidden md:flex col-span-3 flex-col text-xs text-zinc-400">
                                    <span className="font-medium text-zinc-400 truncate">{ar.type || 'Bay'}</span>
                                    {(!ar.points || ar.points.length === 0) && <span className="text-[10px] uppercase font-black text-orange-400 flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3"/> Unmapped</span>}
                                </div>
                                <div className="col-span-3 md:col-span-2 flex items-center">
                                    <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
                                        ar.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                        ar.status === 'Maintenance' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                        'bg-zinc-800 text-zinc-400 border-zinc-700'
                                    }`}>
                                        {ar.status || 'Active'}
                                    </span>
                                </div>
                                <div className="col-span-4 md:col-span-3 flex items-center justify-end">
                                    <div className="text-zinc-600 group-hover:text-accent transition-colors ml-2 hidden md:block">
                                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
