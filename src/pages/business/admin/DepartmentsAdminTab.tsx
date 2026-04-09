import { useState, useEffect } from 'react';
import { FolderKanban, Save, Plus, Trash2, RefreshCw, ArrowLeft, Briefcase, Calculator, Users, Activity } from 'lucide-react';
import { api } from '../../../lib/api';
import { UnsavedChangesBanner } from '../../../components/UnsavedChangesBanner';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

export function DepartmentsAdminTab({ tenantId }: { tenantId: string }) {
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    
    const [departments, setDepartments] = useState<{ id: string, name: string, burdenMultiplier: number, standardShopRate: number, averageStaffHourlyCost?: number }[]>([]);
    const [staff, setStaff] = useState<any[]>([]);
    const [jobs, setJobs] = useState<any[]>([]);
    
    // Edit Form State
    const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<any>(null);
    const [initialEditForm, setInitialEditForm] = useState<any>(null);

    useEffect(() => {
        if (!tenantId || tenantId === 'unassigned') return;
        
        let unsubJobs: () => void;
        
        const loadInitialData = async () => {
            try {
                const res = await api.get(`/businesses/${tenantId}`);
                const depts = res.data.departments || [];
                setDepartments(depts);
                
                try {
                    const staffRes = await api.get(`/businesses/${tenantId}/staff`);
                    setStaff(staffRes.data || []);
                } catch (e) {
                    console.error("Failed to load staff", e);
                }
                
                unsubJobs = onSnapshot(query(collection(db, 'jobs'), where('tenantId', '==', tenantId)), (s) => {
                    setJobs(s.docs.map(d => ({ id: d.id, ...d.data() })));
                });
                
                // Rehydrate deep-linked state from URL
                const urlEditId = searchParams.get('edit');
                if (urlEditId) {
                    const match = depts.find((d: any) => d.id === urlEditId);
                    if (match) {
                        setSelectedDeptId(match.id);
                        setEditForm({ ...match });
                        setInitialEditForm({ ...match });
                    } else if (urlEditId === 'new') {
                        // New department skeleton
                        const skeleton = { id: Date.now().toString(), name: '', burdenMultiplier: 1.3, standardShopRate: 150 };
                        setSelectedDeptId('new');
                        setEditForm(skeleton);
                        setInitialEditForm(skeleton);
                    }
                } else {
                    setSelectedDeptId(null);
                    setEditForm(null);
                    setInitialEditForm(null);
                }
            } catch (err) {
                console.error(err);
                toast.error("Failed to load departments.");
            } finally {
                setLoading(false);
            }
        };

        loadInitialData();
        return () => {
            if (unsubJobs) unsubJobs();
        };
    }, [tenantId]);

    // Close Editor
    const closeEdit = () => {
        setSelectedDeptId(null);
        setEditForm(null);
        setInitialEditForm(null);
        setSearchParams(prev => {
            prev.delete('edit');
            return prev;
        });
    };

    // Open Editor
    const openEdit = (deptOrNew: 'new' | any) => {
        if (deptOrNew === 'new') {
            setSearchParams(prev => {
                prev.set('edit', 'new');
                return prev;
            });
            const skeleton = { id: Date.now().toString(), name: '', burdenMultiplier: 1.3, standardShopRate: 150 };
            setSelectedDeptId('new');
            setEditForm(skeleton);
            setInitialEditForm(skeleton);
        } else {
            setSearchParams(prev => {
                prev.set('edit', deptOrNew.id);
                return prev;
            });
            setSelectedDeptId(deptOrNew.id);
            setEditForm({ ...deptOrNew });
            setInitialEditForm({ ...deptOrNew });
        }
    };

    const handleSaveDepartment = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!editForm.name || !editForm.name.trim()) {
            toast.error("Department name is required.");
            return;
        }

        try {
            setIsSaving(true);
            
            // Build absolute fresh array tracking the updated data
            let newDepartments = [...departments];
            
            if (selectedDeptId === 'new') {
                newDepartments.push(editForm);
            } else {
                const idx = newDepartments.findIndex(d => d.id === editForm.id);
                if (idx !== -1) {
                    newDepartments[idx] = editForm;
                } else {
                    newDepartments.push(editForm);
                }
            }

            await api.put(`/businesses/${tenantId}`, { departments: newDepartments });
            toast.success("Department saved successfully!");
            setDepartments(newDepartments);
            
            // Update tracking to allow them to keep editing
            if (selectedDeptId === 'new') {
                setSelectedDeptId(editForm.id);
                setSearchParams(prev => { prev.set('edit', editForm.id); return prev; });
            }
            setInitialEditForm(editForm);
        } catch (err) {
            console.error(err);
            toast.error("Failed to save department.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (idOfDept: string) => {
        if (!window.confirm("Are you sure you want to completely delete this department?")) return;
        
        try {
            setIsSaving(true);
            const newDepartments = departments.filter((d: any) => d.id !== idOfDept);
            await api.put(`/businesses/${tenantId}`, { departments: newDepartments });
            toast.success("Department deleted successfully.");
            setDepartments(newDepartments);
            closeEdit();
        } catch (err) {
            console.error("Failed to delete", err);
            toast.error("Failed to delete department.");
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center flex items-center justify-center gap-2"><RefreshCw className="w-5 h-5 animate-spin"/> Loading Departments...</div>;
    }

    const hasChanges = initialEditForm !== null && JSON.stringify(initialEditForm) !== JSON.stringify(editForm);

    // Compute Derived Stats
    const deptStaff = staff.filter(s => 
        (editForm?.name && String(s.department).trim().toLowerCase() === String(editForm.name).trim().toLowerCase()) || 
        (s.departmentRoles && s.departmentRoles.some((dr: any) => String(dr.departmentName).trim().toLowerCase() === String(editForm?.name).trim().toLowerCase()))
    );

    const activeDeptTasks = jobs.reduce((acc, job) => {
        if (job.status === 'Completed' || job.status === 'Archived' || job.archived) return acc;
        const deptTasksCount = (job.tasks || []).filter((t: any) => String(t.departmentId) === String(selectedDeptId)).length;
        return acc + deptTasksCount;
    }, 0);

    // ============================================
    // EDIT PANEL VIEW
    // ============================================
    if (selectedDeptId && editForm) {
        return (
            <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
                <UnsavedChangesBanner hasChanges={hasChanges} onSave={() => handleSaveDepartment({ preventDefault: () => {} } as any)} onDiscard={() => setEditForm(initialEditForm)} />
                <div className="p-6 md:p-8 border-b border-zinc-800 bg-zinc-900/50 flex flex-col gap-6 sticky top-0 z-20 backdrop-blur-md">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={closeEdit}
                                className="p-2 border border-zinc-700 bg-zinc-800 rounded-lg hover:bg-zinc-700 hover:text-white text-zinc-400 transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div className="w-12 h-12 bg-purple-500/20 border border-purple-500/40 rounded-xl flex items-center justify-center">
                                <Briefcase className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white tracking-tight">{editForm.name || 'New Department'}</h2>
                                <p className="text-zinc-500 text-sm">{selectedDeptId === 'new' ? 'Configuration' : 'Edit profile & rates'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {selectedDeptId !== 'new' && (
                                <button 
                                    type="button"
                                    onClick={() => handleDelete(selectedDeptId)}
                                    className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 font-bold p-2.5 rounded-lg transition-colors text-sm"
                                    title="Delete Department"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                            <button 
                                onClick={handleSaveDepartment}
                                disabled={isSaving}
                                className="bg-accent hover:bg-accent-hover text-white font-bold px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-lg disabled:opacity-50 transition-colors text-sm tracking-wide"
                            >
                                <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Profile'}
                            </button>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSaveDepartment} className="p-6 md:p-8 max-w-3xl mx-auto w-full space-y-10 pb-40">
                    <section>
                        <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-3">
                            <Briefcase className="w-4 h-4 text-purple-400"/> Identity
                        </h3>
                        <div>
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Title</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Graphic Design"
                                value={editForm.name}
                                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 text-white"
                            />
                        </div>
                    </section>
                    
                    <section>
                        <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-3">
                            <Calculator className="w-4 h-4 text-amber-400"/> Financial Benchmarks
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Standard Shop Rate</label>
                                <div className="relative group">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-500 font-black group-focus-within:text-amber-400 transition-colors text-lg">$</span>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        step="1" 
                                        value={editForm.standardShopRate} 
                                        onChange={e => setEditForm({...editForm, standardShopRate: parseFloat(e.target.value) || 0})} 
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-12 py-3 text-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono font-black shadow-inner transition-all [&::-webkit-inner-spin-button]:appearance-none" 
                                    />
                                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-zinc-600 font-bold text-xs uppercase tracking-widest">/hr</span>
                                </div>
                                <p className="text-[10px] text-zinc-500 mt-2">The default billable rate charged to clients for work performed by this department.</p>
                            </div>
                            
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Labor Burden Multiplier</label>
                                <div className="relative group">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-500 font-black text-xl group-focus-within:text-amber-400 transition-colors">×</span>
                                    <input 
                                        type="number" 
                                        min="1" 
                                        step="0.01" 
                                        value={editForm.burdenMultiplier} 
                                        onChange={e => setEditForm({...editForm, burdenMultiplier: parseFloat(e.target.value) || 1})} 
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono font-black shadow-inner transition-all [&::-webkit-inner-spin-button]:appearance-none" 
                                    />
                                </div>
                                <p className="text-[10px] text-zinc-500 mt-2">Multiplier on staff target wages to account for general department overhead (taxes, utilities).</p>
                            </div>

                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 md:col-span-2">
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Average Staff Hourly Cost (Optional)</label>
                                <div className="relative group max-w-sm">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-500 font-black group-focus-within:text-amber-400 transition-colors text-lg">$</span>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        step="1" 
                                        value={editForm.averageStaffHourlyCost || ''} 
                                        onChange={e => setEditForm({...editForm, averageStaffHourlyCost: parseFloat(e.target.value) || 0})} 
                                        placeholder="Use Global Baseline"
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-12 py-3 text-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono font-black shadow-inner transition-all placeholder:text-zinc-700 [&::-webkit-inner-spin-button]:appearance-none" 
                                    />
                                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-zinc-600 font-bold text-xs uppercase tracking-widest">/hr</span>
                                </div>
                                <p className="text-[10px] text-zinc-500 mt-2">Overrides the business-wide fallback staff cost used during early quoting phases.</p>
                            </div>
                        </div>
                    </section>

                    {selectedDeptId !== 'new' && (
                        <section>
                            <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-3">
                                <Users className="w-4 h-4 text-emerald-400"/> Operational Context
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Staff Roster Roster Box */}
                                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800/50">
                                        <div>
                                            <h4 className="text-white font-bold text-sm">Assigned Personnel</h4>
                                            <p className="text-zinc-500 text-xs">Staff mapped to this department layout</p>
                                        </div>
                                        <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                                            <span className="text-emerald-400 font-black">{deptStaff.length}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {deptStaff.length === 0 ? (
                                            <p className="text-xs text-zinc-600 italic text-center py-4">No staff configured for this department</p>
                                        ) : (
                                            deptStaff.map(s => (
                                                <div key={s.uid} className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0">
                                                        {s.photoURL ? <img src={s.photoURL} alt="pfp" className="w-full h-full object-cover"/> : <Users className="w-4 h-4 text-zinc-500 m-2"/>}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-zinc-300 font-bold leading-tight">{s.firstName} {s.lastName || s.displayName}</p>
                                                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{s.jobTitle || 'Technician'}</p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Active Job Tasks */}
                                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800/50">
                                        <div>
                                            <h4 className="text-white font-bold text-sm">Pipeline Workload</h4>
                                            <p className="text-zinc-500 text-xs">Active uncompleted tasks routed here</p>
                                        </div>
                                        <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/20">
                                            <span className="text-blue-400 font-black">{activeDeptTasks}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center justify-center py-8 text-center bg-zinc-950/50 border border-zinc-800/50 rounded-lg">
                                        <Activity className="w-8 h-8 text-zinc-700 mb-2" />
                                        <h5 className="text-white font-black">{activeDeptTasks} Open Tasks</h5>
                                        <p className="text-xs text-zinc-500 mt-1 max-w-[200px] text-balance">Track specific active tasks in the Job Manager</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                </form>
            </div>
        );
    }

    // ============================================
    // LIST VIEW
    // ============================================
    return (
        <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
            <div className="p-6 md:p-8 border-b border-zinc-800 bg-zinc-900/50 flex flex-col gap-6 sticky top-0 z-20 backdrop-blur-md">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-500/20 border border-purple-500/40 rounded-xl flex items-center justify-center">
                            <FolderKanban className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-tight">Departments Directory</h2>
                            <p className="text-zinc-500 text-sm">Manage business departments, burden multipliers, and hourly shop rates.</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => openEdit('new')}
                        className="bg-accent hover:bg-accent-hover text-white font-bold px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-lg transition-colors text-sm tracking-wide"
                    >
                        <Plus className="w-4 h-4" /> Add Department
                    </button>
                </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-zinc-900/50 border-b border-zinc-800 text-xs font-black text-zinc-500 uppercase tracking-widest shrink-0">
                <div className="col-span-5 md:col-span-4">Department Title</div>
                <div className="hidden md:block col-span-3">Standard Rate</div>
                <div className="col-span-3 md:col-span-2">Overhead Burden</div>
                <div className="col-span-4 md:col-span-3 text-right">Actions</div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto pb-40">
                {departments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <FolderKanban className="w-12 h-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-2">No Departments Founded</h3>
                        <p className="text-zinc-500 max-w-sm mb-6 text-sm">You haven't structured any operational departments yet. Create one to organize staff and standardize shop rates.</p>
                        <button 
                            onClick={() => openEdit('new')}
                            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-white font-bold px-6 py-2.5 rounded-lg flex items-center gap-2 transition-all text-sm tracking-wide shadow-sm"
                        >
                            <Plus className="w-4 h-4" /> Add First Department
                        </button>
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800/50">
                        {departments.map((dept) => (
                            <div 
                                key={dept.id} 
                                onClick={() => openEdit(dept)}
                                className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-zinc-900/30 transition-colors group cursor-pointer"
                            >
                                <div className="col-span-5 md:col-span-4 flex items-center gap-4">
                                    <div className="w-3 h-3 rounded-full shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.1)] bg-purple-500"></div>
                                    <span className="font-bold text-sm text-zinc-200 group-hover:text-accent transition-colors truncate">
                                        {dept.name || 'Unnamed Department'}
                                    </span>
                                </div>
                                <div className="hidden md:flex col-span-3 flex-col text-sm text-zinc-300 font-mono font-medium">
                                    ${dept.standardShopRate}/hr
                                    {dept.averageStaffHourlyCost && (
                                        <span className="text-[10px] text-zinc-500 font-sans tracking-wide uppercase font-bold mt-0.5">Base Override: ${dept.averageStaffHourlyCost}/hr</span>
                                    )}
                                </div>
                                <div className="col-span-3 md:col-span-2 flex items-center">
                                    <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border bg-amber-500/10 text-amber-500 border-amber-500/20 font-mono">
                                        × {dept.burdenMultiplier}
                                    </span>
                                </div>
                                <div className="col-span-4 md:col-span-3 flex items-center justify-end">
                                    <div className="text-zinc-600 group-hover:text-accent transition-colors ml-2 hidden md:block">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 group-hover:translate-x-1 transition-transform"><path d="m9 18 6-6-6-6"/></svg>
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
