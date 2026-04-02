import { useState, useEffect } from 'react';
import { Briefcase, AlertTriangle, Edit2, Plus, RefreshCw, ArrowLeft, Save, FileText, Tag, ChevronRight, Truck, User, DollarSign, Wrench, Settings2, Trash2, FlaskConical } from 'lucide-react';
import { api } from '../../../lib/api';
import { UnsavedChangesBanner } from '../../../components/UnsavedChangesBanner';
import toast from 'react-hot-toast';

import { usePermissions } from '../../../hooks/usePermissions';

export function JobsAdminTab({ tenantId }: { tenantId: string }) {
    const { checkPermission } = usePermissions();
    // Assuming if they can access admin, they have generic platform access, 
    // or standard managed roles apply. We check for a generic manage_jobs perms if it exists.
    const canManageJobs = checkPermission('manage_jobs') || true; // Fallback to true if perm doesn't exist yet, but in reality it might be checkPermission('manage_jobs')

    const [jobs, setJobs] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [staff, setStaff] = useState<any[]>([]);
    // const [inventory, setInventory] = useState<any[]>([]); // unused
    const [loading, setLoading] = useState(true);

    // Edit State
    const [selectedJob, setSelectedJob] = useState<any>(null);
    const [initialEditJob, setInitialEditJob] = useState<any>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [activeProfileTab, setActiveProfileTab] = useState('info');
    const [isSaving, setIsSaving] = useState(false);
    
    const [newTag, setNewTag] = useState('');

    const [editForm, setEditForm] = useState({
        title: '',
        description: '',
        status: 'Pending',
        priority: 'Medium',
        customerId: '',
        vehicleId: '',
        assignedStaffId: '',
        dueDate: '',
        notes: '',
        tags: [] as string[],
        parts: [] as any[],
        laborLines: [] as any[]
    });

    const fetchData = async () => {
        try {
            setLoading(true);
            const [jobsRes, custRes, vehRes, staffRes] = await Promise.all([
                api.get(`/jobs?tenantId=${tenantId}`),
                api.get(`/customers?tenantId=${tenantId}`),
                api.get(`/vehicles?tenantId=${tenantId}`),
                api.get(`/businesses/${tenantId}/staff`),
            ]);
            setJobs(jobsRes.data);
            setCustomers(custRes.data);
            setVehicles(vehRes.data);
            setStaff(staffRes.data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load operations data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [tenantId]);

    const openJobProfile = (job: any) => {
        setSelectedJob(job);
        setIsEditing(false);
        setActiveProfileTab('info');
        const initialFormValues = {
            title: job.title || '',
            description: job.description || '',
            status: job.status || 'Pending',
            priority: job.priority || 'Medium',
            customerId: job.customerId || '',
            vehicleId: job.vehicleId || '',
            assignedStaffId: job.assignedStaffId || '',
            dueDate: job.dueDate || '',
            notes: job.notes || '',
            tags: job.tags || [],
            parts: job.parts || [],
            laborLines: job.laborLines || []
        };
        setEditForm(initialFormValues);
        setInitialEditJob(initialFormValues);
        setNewTag('');
    };

    const openAddJob = () => {
        setSelectedJob({ id: 'new' });
        setIsEditing(true);
        setActiveProfileTab('info');
        const initialFormValues = {
            title: '',
            description: '',
            status: 'Pending',
            priority: 'Medium',
            customerId: '',
            vehicleId: '',
            assignedStaffId: '',
            dueDate: '',
            notes: '',
            tags: [],
            parts: [],
            laborLines: []
        };
        setEditForm(initialFormValues);
        setInitialEditJob(initialFormValues);
        setNewTag('');
    };

    const closeEditJob = () => {
        setSelectedJob(null);
    };

    const handleSaveJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedJob) return;
        
        try {
            setIsSaving(true);
            
            let finalTags = [...editForm.tags];
            if (newTag.trim() && !finalTags.includes(newTag.trim())) {
                finalTags.push(newTag.trim());
                setNewTag('');
            }
            
            const payload = { ...editForm, tags: finalTags, tenantId };

            if (selectedJob.id === 'new') {
                await api.post(`/jobs`, payload);
                toast.success("Work Order created successfully");
            } else {
                await api.put(`/jobs/${selectedJob.id}`, payload);
                toast.success("Work Order updated successfully");
            }
            
            fetchData();
            closeEditJob();
        } catch (err) {
            console.error(err);
            toast.error("Failed to save job");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteJob = async (jobId: string) => {
        if (!window.confirm("Permanently delete this work order?")) return;
        try {
            await api.delete(`/jobs/${jobId}`);
            toast.success("Job deleted");
            if (selectedJob?.id === jobId) {
                closeEditJob();
            }
            fetchData();
        } catch (err) {
            toast.error("Failed to delete job");
        }
    };

    // Calculate Totals
    const calculatePartsTotal = () => {
        return editForm.parts.reduce((acc, part) => acc + (Number(part.price) * Number(part.quantity)), 0);
    };
    
    const calculateLaborTotal = () => {
        return editForm.laborLines.reduce((acc, line) => acc + (Number(line.rate) * Number(line.hours)), 0);
    };
    
    const calculateGrandTotal = () => {
        return calculatePartsTotal() + calculateLaborTotal();
    };

    // Helper finders
    const getCustomerName = (cId: string) => {
        const c = customers.find(x => x.id === cId);
        if (!c) return '—';
        return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Unnamed Customer';
    };

    const getVehicleName = (vId: string) => {
        const v = vehicles.find(x => x.id === vId);
        if (!v) return '—';
        return `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || 'Unknown Vehicle';
    };
    
    const getStaffName = (sId: string) => {
        const s = staff.find(x => x.uid === sId);
        if (!s) return '—';
        return s.displayName || s.email || 'Unknown Staff';
    };

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center flex items-center justify-center gap-2"><RefreshCw className="w-5 h-5 animate-spin"/> Loading Ops Data...</div>;
    }

    if (selectedJob && isEditing) {
        return (
            <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
                <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => selectedJob.id === 'new' ? closeEditJob() : setIsEditing(false)}
                            className="p-2 border border-zinc-700 bg-zinc-800 rounded-lg hover:bg-zinc-700 hover:text-white text-zinc-400 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                                <Briefcase className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white">
                                    {selectedJob.id === 'new' ? 'New Work Order' : (editForm.title || 'Untitled Job')}
                                </h2>
                                {selectedJob.id !== 'new' && <p className="text-zinc-500 font-mono text-sm">ID: {selectedJob.id.substring(0,8).toUpperCase()}</p>}
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={handleSaveJob}
                        disabled={isSaving}
                        className="hidden md:flex bg-accent hover:bg-accent-hover text-white font-bold px-6 py-2 rounded-lg items-center gap-2 shadow-lg disabled:opacity-50 transition-all font-mono tracking-widest uppercase text-xs"
                    >
                        <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Work Order'}
                    </button>
                </div>

                {/* Profile Tabs Config for Edit Mode */}
                <div className="px-6 md:px-8 border-b border-zinc-800/50 flex gap-6 overflow-x-auto no-scrollbar pt-6">
                    {[
                        { id: 'info', label: 'General Info & Assignments' },
                        { id: 'items', label: 'Parts & Labor (Invoice)' },
                        { id: 'notes', label: 'Processing Notes' }
                    ].map(t => (
                        <button 
                            key={t.id} 
                            type="button"
                            onClick={() => setActiveProfileTab(t.id)}
                            className={`pb-3 text-sm font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap ${activeProfileTab === t.id ? 'border-accent text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                        >{t.label}</button>
                    ))}
                </div>

                <form onSubmit={handleSaveJob} className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-10 pb-40">
                    
                    {activeProfileTab === 'info' && (
                        <>
                            {/* Definition */}
                            <section>
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                                    <Settings2 className="w-5 h-5 text-accent" /> Work Order Definition
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <div className="md:col-span-3">
                                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Job Title</label>
                                        <input required type="text" placeholder="e.g. Full Suspension Upfit" value={editForm.title} onChange={(e) => setEditForm({...editForm, title: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Due Date</label>
                                        <input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({...editForm, dueDate: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white font-mono" />
                                    </div>
                                    <div className="md:col-span-4">
                                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Scope of Work</label>
                                        <textarea rows={3} placeholder="Describe the full scope of work required..." value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white resize-none" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                                    <div>
                                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Status</label>
                                        <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white appearance-none cursor-pointer">
                                            <option value="Pending">Pending / Estimate</option>
                                            <option value="In Progress">In Progress (Active)</option>
                                            <option value="Awaiting Parts">Awaiting Parts</option>
                                            <option value="Completed">Completed / Billed</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Priority</label>
                                        <select value={editForm.priority} onChange={(e) => setEditForm({...editForm, priority: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white appearance-none cursor-pointer">
                                            <option value="Low">Low</option>
                                            <option value="Medium">Medium</option>
                                            <option value="High">High</option>
                                            <option value="Critical">Critical</option>
                                        </select>
                                    </div>
                                </div>
                            </section>

                            {/* Assignments */}
                            <section>
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                                    <User className="w-5 h-5 text-indigo-400" /> Operational Assignments
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Customer</label>
                                        <select value={editForm.customerId} onChange={(e) => setEditForm({...editForm, customerId: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white appearance-none cursor-pointer">
                                            <option value="">-- Internal / Unassigned --</option>
                                            {customers.map(c => (
                                                <option key={c.id} value={c.id}>{getCustomerName(c.id)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Target Vehicle / Asset</label>
                                        <select value={editForm.vehicleId} onChange={(e) => setEditForm({...editForm, vehicleId: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white appearance-none cursor-pointer">
                                            <option value="">-- No specific vehicle --</option>
                                            {vehicles.filter(v => editForm.customerId ? v.customerId === editForm.customerId : true).map(v => (
                                                <option key={v.id} value={v.id}>{getVehicleName(v.id)}</option>
                                            ))}
                                        </select>
                                        {editForm.customerId && vehicles.filter(v => v.customerId === editForm.customerId).length === 0 && (
                                            <p className="text-zinc-600 text-[10px] mt-1 ml-1">Select customer has no fleet vehicles.</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Assigned Technician / Lead</label>
                                        <select value={editForm.assignedStaffId} onChange={(e) => setEditForm({...editForm, assignedStaffId: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white appearance-none cursor-pointer">
                                            <option value="">-- Unassigned --</option>
                                            {staff.map(s => (
                                                <option key={s.uid} value={s.uid}>{getStaffName(s.uid)}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                                    <Tag className="w-5 h-5 text-amber-500" /> Tracking Tags
                                </h3>
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <input 
                                            type="text" 
                                            placeholder="e.g. Electrical, Warranty, Urgent"
                                            value={newTag}
                                            onChange={(e) => setNewTag(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    if (!newTag.trim()) return;
                                                    if (!editForm.tags.includes(newTag.trim())) {
                                                        setEditForm({...editForm, tags: [...editForm.tags, newTag.trim()]});
                                                    }
                                                    setNewTag('');
                                                }
                                            }}
                                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 text-white"
                                        />
                                        <button type="button" onClick={() => {
                                             if (!newTag.trim()) return;
                                             if (!editForm.tags.includes(newTag.trim())) {
                                                 setEditForm({...editForm, tags: [...editForm.tags, newTag.trim()]});
                                             }
                                             setNewTag('');
                                        }} className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-4 py-3 rounded-xl transition-colors font-bold text-sm tracking-wide">
                                            Add
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {editForm.tags.map(tag => (
                                            <div key={tag} className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 px-3 py-1.5 rounded-lg text-sm font-bold text-zinc-300">
                                                <Tag className="w-3 h-3 text-amber-500" />
                                                {tag}
                                                <button type="button" onClick={() => {
                                                     setEditForm({...editForm, tags: editForm.tags.filter(t => t !== tag)});
                                                }} className="text-zinc-500 hover:text-red-400 transition-colors ml-1">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </>
                    )}

                    {activeProfileTab === 'items' && (
                        <div className="space-y-12">
                            {/* Materials / Parts */}
                            <section>
                                <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-2">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <DollarSign className="w-5 h-5 text-emerald-500" /> Materials & Parts
                                    </h3>
                                    <button type="button" onClick={() => {
                                        setEditForm({...editForm, parts: [...editForm.parts, { inventoryId: '', name: '', quantity: 1, price: 0 }]});
                                    }} className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors">
                                        + Add Blank Part
                                    </button>
                                </div>

                                {editForm.parts.length === 0 ? (
                                    <p className="text-zinc-500 text-sm italic py-4">No materials logged on this work order yet.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {editForm.parts.map((part, idx) => (
                                            <div key={idx} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex flex-col md:flex-row md:items-center gap-4">
                                                <div className="flex-1">
                                                    <input type="text" placeholder="Part description or name" value={part.name} onChange={(e) => {
                                                        const p = [...editForm.parts];
                                                        p[idx].name = e.target.value;
                                                        setEditForm({...editForm, parts: p});
                                                    }} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none" />
                                                </div>
                                                <div className="flex items-center gap-4 shrink-0">
                                                    <div className="w-24">
                                                        <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1 ml-1 font-bold">Qty</label>
                                                        <input type="number" min="0" value={part.quantity} onChange={(e) => {
                                                            const p = [...editForm.parts];
                                                            p[idx].quantity = e.target.value === '' ? '' : Number(e.target.value);
                                                            setEditForm({...editForm, parts: p});
                                                        }} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none font-mono" />
                                                    </div>
                                                    <div className="w-32">
                                                        <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1 ml-1 font-bold">Unit Price</label>
                                                        <input type="number" step="0.01" value={part.price} onChange={(e) => {
                                                            const p = [...editForm.parts];
                                                            p[idx].price = e.target.value === '' ? '' : Number(e.target.value);
                                                            setEditForm({...editForm, parts: p});
                                                        }} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none font-mono" />
                                                    </div>
                                                    <div className="w-32 hidden md:block">
                                                        <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1 ml-1 font-bold">Ext Price</label>
                                                        <div className="w-full bg-zinc-900 border border-transparent px-3 py-2 text-sm text-zinc-400 font-mono font-bold text-right pt-2">
                                                            ${(Number(part.quantity) * Number(part.price)).toFixed(2)}
                                                        </div>
                                                    </div>
                                                    <button type="button" onClick={() => {
                                                        const p = [...editForm.parts];
                                                        p.splice(idx, 1);
                                                        setEditForm({...editForm, parts: p});
                                                    }} className="mt-5 p-2 text-zinc-500 hover:text-red-400 transition-colors bg-zinc-900 rounded-lg border border-zinc-800 hover:border-red-500/50"><Trash2 className="w-4 h-4"/></button>
                                                </div>
                                            </div>
                                        ))}
                                        <div className="flex justify-end pt-4 pr-12 md:pr-16">
                                            <div className="text-right">
                                                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Materials Total</p>
                                                <p className="text-xl font-bold font-mono text-emerald-400">${calculatePartsTotal().toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* Labor Lines */}
                            <section>
                                <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-2">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Wrench className="w-5 h-5 text-indigo-400" /> Labor Operations
                                    </h3>
                                    <button type="button" onClick={() => {
                                        setEditForm({...editForm, laborLines: [...editForm.laborLines, { description: '', hours: 1, rate: 0 }]});
                                    }} className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors">
                                        + Add Labor Line
                                    </button>
                                </div>

                                {editForm.laborLines.length === 0 ? (
                                    <p className="text-zinc-500 text-sm italic py-4">No labor operations billed on this work order yet.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {editForm.laborLines.map((line, idx) => (
                                            <div key={idx} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex flex-col md:flex-row md:items-center gap-4">
                                                <div className="flex-1">
                                                    <input type="text" placeholder="Task description (e.g., Installation, Diagnostics)" value={line.description} onChange={(e) => {
                                                        const l = [...editForm.laborLines];
                                                        l[idx].description = e.target.value;
                                                        setEditForm({...editForm, laborLines: l});
                                                    }} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500/50 focus:outline-none" />
                                                </div>
                                                <div className="flex items-center gap-4 shrink-0">
                                                    <div className="w-24">
                                                        <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1 ml-1 font-bold">Hours</label>
                                                        <input type="number" step="0.1" min="0" value={line.hours} onChange={(e) => {
                                                            const l = [...editForm.laborLines];
                                                            l[idx].hours = e.target.value === '' ? '' : Number(e.target.value);
                                                            setEditForm({...editForm, laborLines: l});
                                                        }} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500/50 focus:outline-none font-mono" />
                                                    </div>
                                                    <div className="w-32">
                                                        <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1 ml-1 font-bold">Hourly Rate</label>
                                                        <input type="number" step="0.01" value={line.rate} onChange={(e) => {
                                                            const l = [...editForm.laborLines];
                                                            l[idx].rate = e.target.value === '' ? '' : Number(e.target.value);
                                                            setEditForm({...editForm, laborLines: l});
                                                        }} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500/50 focus:outline-none font-mono" />
                                                    </div>
                                                    <div className="w-32 hidden md:block">
                                                        <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1 ml-1 font-bold">Line Total</label>
                                                        <div className="w-full bg-zinc-900 border border-transparent px-3 py-2 text-sm text-zinc-400 font-mono font-bold text-right pt-2">
                                                            ${(Number(line.hours) * Number(line.rate)).toFixed(2)}
                                                        </div>
                                                    </div>
                                                    <button type="button" onClick={() => {
                                                        const l = [...editForm.laborLines];
                                                        l.splice(idx, 1);
                                                        setEditForm({...editForm, laborLines: l});
                                                    }} className="mt-5 p-2 text-zinc-500 hover:text-red-400 transition-colors bg-zinc-900 rounded-lg border border-zinc-800 hover:border-red-500/50"><Trash2 className="w-4 h-4"/></button>
                                                </div>
                                            </div>
                                        ))}
                                        <div className="flex justify-end pt-4 pr-12 md:pr-16">
                                            <div className="text-right">
                                                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Labor Total</p>
                                                <p className="text-xl font-bold font-mono text-indigo-400">${calculateLaborTotal().toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </section>
                            
                            <section className="bg-zinc-900 p-6 md:p-8 rounded-2xl border border-zinc-800 mt-12 flex justify-between items-center">
                                <div>
                                    <h3 className="text-white font-black text-xl">Work Order Total</h3>
                                    <p className="text-zinc-500 text-xs">Excludes applicable taxes or discounts.</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl font-black font-mono text-white">${calculateGrandTotal().toFixed(2)}</p>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeProfileTab === 'notes' && (
                        <section>
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                                <FileText className="w-5 h-5 text-orange-400" /> Internal Notes & Documentation
                            </h3>
                            <textarea 
                                rows={8}
                                placeholder="Add diagnostics, internal tracking notes, customer requests..."
                                value={editForm.notes}
                                onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400/50 text-white resize-none"
                            ></textarea>
                        </section>
                    )}

                    {/* Danger Zone */}
                    {selectedJob.id !== 'new' && (
                        <section className="mt-12 pt-8 border-t border-red-900/30">
                            <h3 className="text-lg font-bold text-red-500 mb-2 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" /> Danger Zone
                            </h3>
                            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h4 className="text-white font-bold text-sm mb-1">Abandon / Delete Work Order</h4>
                                    <p className="text-zinc-400 text-xs text-balance">This action is irreversible and permanently removes the job record. It will not refund or automatically restock inventory consumed.</p>
                                </div>
                                {canManageJobs && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteJob(selectedJob.id)}
                                        className="bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 border border-red-500/20 font-bold px-6 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap"
                                    >
                                        Delete Work Order
                                    </button>
                                )}
                            </div>
                        </section>
                    )}
                </form>

                <UnsavedChangesBanner 
                    hasChanges={initialEditJob !== null && JSON.stringify(initialEditJob) !== JSON.stringify(editForm)} 
                    onSave={() => handleSaveJob({ preventDefault: () => {} } as any)} 
                    onDiscard={() => setEditForm(initialEditJob!)} 
                    isSaving={isSaving} 
                />
            </div>
        );
    }

    if (selectedJob && !isEditing) {
        const partsTotal = selectedJob.parts ? selectedJob.parts.reduce((a:any,p:any)=>a+(Number(p.price)*Number(p.quantity)),0) : 0;
        const laborTotal = selectedJob.laborLines ? selectedJob.laborLines.reduce((a:any,l:any)=>a+(Number(l.rate)*Number(l.hours)),0) : 0;

        return (
            <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
                {/* Profile Header */}
                <div className="p-6 md:p-8 border-b border-zinc-800 bg-zinc-900/50 flex flex-col gap-6 sticky top-0 z-20 backdrop-blur-md">
                    <div className="flex items-center justify-between">
                        <button onClick={closeEditJob} className="text-zinc-400 hover:text-white flex items-center gap-2"><ArrowLeft className="w-4 h-4"/> Back to Logistics</button>
                        {canManageJobs && (
                            <button onClick={() => setIsEditing(true)} className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors border border-zinc-700"><Edit2 className="w-4 h-4"/> Edit Job</button>
                        )}
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 shadow-inner">
                            <Briefcase className="w-8 h-8 text-blue-400" />
                        </div>
                        <div className="flex-1 w-full flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <h2 className="text-3xl font-black text-white tracking-tight">
                                        {selectedJob.title || 'Untitled Job'}
                                    </h2>
                                    <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
                                        selectedJob.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                        selectedJob.status === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                        selectedJob.status === 'Awaiting Parts' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                        'bg-zinc-800 text-zinc-400 border-zinc-700'
                                    }`}>
                                        {selectedJob.status || 'Pending'}
                                    </span>
                                    <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
                                        selectedJob.priority === 'Critical' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                        selectedJob.priority === 'High' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                        'bg-zinc-800 text-zinc-400 border-zinc-700'
                                    }`}>
                                        {selectedJob.priority || 'Medium'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-2">
                                    <p className="text-sm font-mono text-zinc-500 tracking-wide">ID: {selectedJob.id.toUpperCase()}</p>
                                    <span className="text-zinc-700">•</span>
                                    <p className="text-xs font-bold text-zinc-400 flex items-center gap-1"><User className="w-3 h-3"/> {selectedJob.customerId ? getCustomerName(selectedJob.customerId) : 'Internal / No Customer'}</p>
                                </div>
                            </div>
                            <div className="text-right hidden md:block">
                                <p className="text-[10px] uppercase font-black text-zinc-500 tracking-widest mb-1">Invoice Total</p>
                                <p className="text-2xl font-mono text-white font-bold">${(partsTotal + laborTotal).toFixed(2)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
                    {/* Read Only General Overview */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                            <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2"><Settings2 className="w-4 h-4 text-accent"/> Overview & Scope</h3>
                            <div className="space-y-4">
                                <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Vehicle / Asset</p><p className="text-zinc-300 font-medium">{selectedJob.vehicleId ? getVehicleName(selectedJob.vehicleId) : '—'}</p></div>
                                <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Assigned To</p><p className="text-zinc-300 font-medium">{selectedJob.assignedStaffId ? getStaffName(selectedJob.assignedStaffId) : 'Unassigned'}</p></div>
                                <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Due Date</p><p className="text-zinc-300 font-medium">{selectedJob.dueDate || 'No Set Deadline'}</p></div>
                                <div className="pt-2">
                                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Scope Details</p>
                                    <p className="text-zinc-300 whitespace-pre-wrap text-sm leading-relaxed">{selectedJob.description || 'No description provided.'}</p>
                                </div>
                            </div>
                        </div>
                         
                        <div className="space-y-8">
                             <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                                <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-2"><Tag className="w-4 h-4 text-amber-500"/> Tracking Tags</h3>
                                <div className="flex flex-wrap gap-2">
                                    {selectedJob.tags && selectedJob.tags.length > 0 ? selectedJob.tags.map((t: string) => (
                                        <span key={t} className="px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg text-xs font-bold">{t}</span>
                                    )) : <span className="text-zinc-600 text-sm italic">No tags associated.</span>}
                                </div>
                            </div>

                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                                <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-2"><FileText className="w-4 h-4 text-orange-400"/> Operational Notes</h3>
                                {selectedJob.notes ? (
                                    <p className="text-zinc-300 whitespace-pre-wrap text-sm leading-relaxed">{selectedJob.notes}</p>
                                ) : <p className="text-zinc-600 italic text-sm">No notes written.</p>}
                            </div>
                        </div>
                    </div>

                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden mt-8">
                        <div className="p-6 border-b border-zinc-800 bg-zinc-900">
                             <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-500"/> Consolidated Invoice Breakdown</h3>
                        </div>
                        
                        <div className="p-6 md:p-8">
                            <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-2 mb-4">Materials & Parts</h4>
                            {(!selectedJob.parts || selectedJob.parts.length === 0) ? (
                                <p className="text-zinc-600 text-sm italic mb-6">No parts logged.</p>
                            ) : (
                                <div className="space-y-2 mb-8">
                                    {selectedJob.parts.map((p: any, i: number) => (
                                        <div key={i} className="flex justify-between items-center text-sm group hover:bg-zinc-800/30 p-2 rounded">
                                            <div className="flex-1 text-zinc-300 font-medium pr-4">{p.name || 'Unnamed Part'}</div>
                                            <div className="w-24 text-zinc-500 font-mono hidden md:block text-right">{p.quantity} x ${(Number(p.price)||0).toFixed(2)}</div>
                                            <div className="w-24 text-white font-mono font-bold text-right">${(Number(p.quantity)*Number(p.price)||0).toFixed(2)}</div>
                                        </div>
                                    ))}
                                    <div className="flex justify-end pt-2 text-sm font-bold font-mono text-emerald-400">
                                        Materials Total: ${partsTotal.toFixed(2)}
                                    </div>
                                </div>
                            )}

                            <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-2 mb-4">Labor Operations</h4>
                            {(!selectedJob.laborLines || selectedJob.laborLines.length === 0) ? (
                                <p className="text-zinc-600 text-sm italic mb-6">No labor logged.</p>
                            ) : (
                                <div className="space-y-2 mb-8">
                                    {selectedJob.laborLines.map((l: any, i: number) => (
                                        <div key={i} className="flex justify-between items-center text-sm group hover:bg-zinc-800/30 p-2 rounded">
                                            <div className="flex-1 text-zinc-300 font-medium pr-4">{l.description || 'Unnamed Labor'}</div>
                                            <div className="w-32 text-zinc-500 font-mono hidden md:block text-right">{l.hours} hrs @ ${(Number(l.rate)||0).toFixed(2)}/hr</div>
                                            <div className="w-24 text-white font-mono font-bold text-right">${(Number(l.hours)*Number(l.rate)||0).toFixed(2)}</div>
                                        </div>
                                    ))}
                                    <div className="flex justify-end pt-2 text-sm font-bold font-mono text-indigo-400">
                                        Labor Total: ${laborTotal.toFixed(2)}
                                    </div>
                                </div>
                            )}

                            <div className="border-t border-zinc-700 pt-6 mt-6 flex justify-between items-end">
                                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Total Estimated Cost</p>
                                <p className="text-3xl font-black font-mono text-white">${(partsTotal + laborTotal).toFixed(2)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-zinc-950 relative">
            <div className="bg-orange-500/5 border-b border-orange-500/20 px-6 py-3 flex items-start gap-3 shrink-0 relative z-10">
                <FlaskConical className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                    <h4 className="text-orange-400 font-bold text-sm">Feature Preview (Alpha Roadmap)</h4>
                    <p className="text-orange-400/80 text-xs mt-0.5">Job Management is currently in active development. You may start testing it now, but expect rapid updates and potential data resets prior to stable release.</p>
                </div>
            </div>

            <div className="p-4 bg-zinc-900 border-b border-zinc-800 shrink-0 flex items-center justify-between relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-white font-bold tracking-tight">Jobs & Dispatch</h3>
                        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                            Alpha Labs
                        </span>
                    </div>
                    <p className="text-zinc-500 text-xs">Manage work orders, assignments, and invoicing lines.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={fetchData} className="p-2 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    {canManageJobs && (
                        <button 
                            onClick={openAddJob}
                            className="bg-accent hover:bg-accent-hover text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
                        >
                            <Plus className="w-4 h-4" /> New Work Order
                        </button>
                    )}
                </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-zinc-900/50 border-b border-zinc-800 text-xs font-black text-zinc-500 uppercase tracking-widest shrink-0">
                <div className="col-span-5 md:col-span-4">Job Ticket</div>
                <div className="hidden md:block col-span-3">Customer / Asset</div>
                <div className="col-span-2 md:col-span-2 text-center">Status</div>
                <div className="col-span-5 md:col-span-3 text-right">Actions</div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto">
                {jobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <Briefcase className="w-12 h-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-1">No Active Jobs</h3>
                        <p className="text-zinc-500 text-sm">Create a new work order to begin tracking production.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800/50">
                        {jobs.map((job) => (
                            <div key={job.id} onClick={() => openJobProfile(job)} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-zinc-900/30 transition-colors group cursor-pointer">
                                <div className="col-span-5 md:col-span-4 flex flex-col pr-2">
                                    <span className="font-bold text-sm text-zinc-200 group-hover:text-accent transition-colors truncate">
                                        {job.title || 'Untitled Work Order'}
                                    </span>
                                    <span className="text-[10px] font-mono text-zinc-500 mt-0.5 tracking-wider truncate">
                                        #{job.id.substring(0,8).toUpperCase()}
                                        {job.priority !== 'Medium' && ` • ${job.priority}`}
                                    </span>
                                </div>
                                <div className="hidden md:flex col-span-3 flex-col text-xs text-zinc-400">
                                    <span className="font-bold text-zinc-300 truncate">{job.customerId ? getCustomerName(job.customerId) : 'No Customer'}</span>
                                    <span className="font-medium text-zinc-500 mt-0.5 truncate flex items-center gap-1"><Truck className="w-3 h-3"/> {job.vehicleId ? getVehicleName(job.vehicleId) : 'No Vehicle'}</span>
                                </div>
                                <div className="col-span-2 md:col-span-2 flex items-center justify-center">
                                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest rounded border whitespace-nowrap ${
                                        job.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                        job.status === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                        job.status === 'Awaiting Parts' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                        'bg-zinc-800 text-zinc-400 border-zinc-700'
                                    }`}>
                                        {job.status || 'Pending'}
                                    </span>
                                </div>
                                <div className="col-span-5 md:col-span-3 flex items-center justify-end">
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
