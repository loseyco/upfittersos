import { useState, useEffect } from 'react';
import { Users, AlertTriangle, Edit2, Plus, RefreshCw, Building2, FlaskConical, ArrowLeft, Save, MapPin, Tag, FileText, User, ClipboardList, Activity, ChevronRight } from 'lucide-react';
import { formatPhone, unformatPhone } from '../../../lib/formatters';
import { UnsavedChangesBanner } from '../../../components/UnsavedChangesBanner';
import { api } from '../../../lib/api';
import toast from 'react-hot-toast';
import { usePermissions } from '../../../hooks/usePermissions';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

export function CustomersAdminTab({ tenantId }: { tenantId: string }) {
    const { checkPermission } = usePermissions();
    const canManageCustomers = checkPermission('manage_customers');

    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit State
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
    const [initialEditCustomer, setInitialEditCustomer] = useState<any>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [activeProfileTab, setActiveProfileTab] = useState('info');
    
    // Cross-Module Context
    const [customerVehicles, setCustomerVehicles] = useState<any[]>([]);
    const [showQuickAddVehicle, setShowQuickAddVehicle] = useState(false);
    const [quickAddVehicleForm, setQuickAddVehicleForm] = useState({ year: '', make: '', model: '', vin: '', licensePlate: '' });
    
    const [customerJobs, setCustomerJobs] = useState<any[]>([]);
    const [showQuickAddJob, setShowQuickAddJob] = useState(false);
    const [quickAddJobForm, setQuickAddJobForm] = useState({ title: '', priority: 'Medium' });
    const [isSaving, setIsSaving] = useState(false);
    const [newTag, setNewTag] = useState('');
    const [editForm, setEditForm] = useState({
        firstName: '',
        middleName: '',
        lastName: '',
        nickName: '',
        company: '',
        email: '',
        mobilePhone: '',
        workPhone: '',
        addressStreet: '',
        addressCity: '',
        addressState: '',
        addressZip: '',
        status: 'Active',
        notes: '',
        tags: [] as string[],
        defaultDiscount: 0,
        website: ''
    });

    const openCustomerProfile = (customer: any) => {
        setSelectedCustomer(customer);
        setIsEditing(false);
        setActiveProfileTab('info');
        const initialFormValues = {
            firstName: customer.firstName || '',
            middleName: customer.middleName || '',
            lastName: customer.lastName || '',
            nickName: customer.nickName || '',
            company: customer.company || '',
            email: customer.email || '',
            mobilePhone: formatPhone(customer.mobilePhone),
            workPhone: formatPhone(customer.workPhone),
            addressStreet: customer.addressStreet || '',
            addressCity: customer.addressCity || '',
            addressState: customer.addressState || '',
            addressZip: customer.addressZip || '',
            status: customer.status || 'Active',
            notes: customer.notes || '',
            tags: customer.tags || [],
            defaultDiscount: customer.defaultDiscount || 0,
            website: customer.website || ''
        };
        setEditForm(initialFormValues);
        setInitialEditCustomer(initialFormValues);
        setNewTag('');
    };

    const openAddCustomer = () => {
        setSelectedCustomer({ id: 'new' });
        setIsEditing(true);
        const initialFormValues = {
            firstName: '',
            middleName: '',
            lastName: '',
            nickName: '',
            company: '',
            email: '',
            mobilePhone: '',
            workPhone: '',
            addressStreet: '',
            addressCity: '',
            addressState: '',
            addressZip: '',
            status: 'Active',
            notes: '',
            tags: [],
            defaultDiscount: 0,
            website: ''
        };
        setEditForm(initialFormValues);
        setInitialEditCustomer(initialFormValues);
        setNewTag('');
    };

    const closeEditCustomer = () => {
        setSelectedCustomer(null);
    };

    const handleSaveCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCustomer) return;
        
        try {
            setIsSaving(true);
            let finalTags = [...editForm.tags];
            if (newTag.trim() && !finalTags.includes(newTag.trim())) {
                finalTags.push(newTag.trim());
                setNewTag('');
            }

            const payload = {
                ...editForm,
                mobilePhone: unformatPhone(editForm.mobilePhone),
                workPhone: unformatPhone(editForm.workPhone),
                tags: finalTags
            };

            if (selectedCustomer.id === 'new') {
                await api.post(`/customers`, {
                    ...payload,
                    tenantId
                });
                toast.success("Customer added successfully");
            } else {
                await api.put(`/customers/${selectedCustomer.id}`, payload);
                toast.success("Customer updated successfully");
            }
            closeEditCustomer();
        } catch (err) {
            console.error(err);
            toast.error("Failed to save customer");
        } finally {
            setIsSaving(false);
        }
    };

    const addTag = (e: React.KeyboardEvent | React.MouseEvent) => {
        if ('key' in e && e.key !== 'Enter') return;
        e.preventDefault();
        if (!newTag.trim()) return;
        if (!editForm.tags.includes(newTag.trim())) {
            setEditForm({...editForm, tags: [...editForm.tags, newTag.trim()]});
        }
        setNewTag('');
    };
    
    const removeTag = (tagToRemove: string) => {
        setEditForm({
            ...editForm,
            tags: editForm.tags.filter(t => t !== tagToRemove)
        });
    };
    useEffect(() => {
        if (!tenantId || tenantId === 'unassigned') {
            setLoading(false);
            return;
        }
        
        setLoading(true);

        const unsubCustomers = onSnapshot(query(collection(db, 'customers'), where('tenantId', '==', tenantId)), (s) => {
            let fetched = s.docs.map(d => ({ id: d.id, ...d.data() }) as any);
            // Hide QuickBooks Sub-Jobs from the root customer view
            fetched = fetched.filter(c => !c.sublevel || c.sublevel === 0);
            
            fetched.sort((a: any, b: any) => {
                const nameA = (a.firstName || '') + ' ' + (a.lastName || '');
                const nameB = (b.firstName || '') + ' ' + (b.lastName || '');
                return nameA.localeCompare(nameB);
            });
            setCustomers(fetched);
            setLoading(false);
        });

        return () => unsubCustomers();
    }, [tenantId]);

    // Contextual Hydration
    useEffect(() => {
        if (!selectedCustomer || selectedCustomer.id === 'new') return;
        
        let unsubVehicles: (() => void) | undefined;
        let unsubJobs: (() => void) | undefined;

        if (activeProfileTab === 'vehicles') {
            unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('tenantId', '==', tenantId), where('customerId', '==', selectedCustomer.id)), (s) => {
                setCustomerVehicles(s.docs.map(d => ({id: d.id, ...d.data()})));
            });
        } else if (activeProfileTab === 'jobs') {
            unsubJobs = onSnapshot(query(collection(db, 'jobs'), where('tenantId', '==', tenantId), where('customerId', '==', selectedCustomer.id)), (s) => {
                const loaded = s.docs.map(d => ({id: d.id, ...d.data()}));
                loaded.sort((a: any, b: any) => {
                    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?._seconds ? a.createdAt._seconds * 1000 : 0);
                    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?._seconds ? b.createdAt._seconds * 1000 : 0);
                    return timeB - timeA;
                });
                setCustomerJobs(loaded);
            });
        }

        return () => {
            if (unsubVehicles) unsubVehicles();
            if (unsubJobs) unsubJobs();
        };
    }, [activeProfileTab, selectedCustomer, tenantId]);

    const handleDeleteCustomer = async (customerId: string) => {
        if (!window.confirm("Permanently delete this customer?")) return;
        try {
            await api.delete(`/customers/${customerId}`);
            toast.success("Customer removed");
            if (selectedCustomer?.id === customerId) {
                closeEditCustomer();
            }
        } catch (err) {
            toast.error("Failed to remove customer");
        }
    };

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center flex items-center justify-center gap-2"><RefreshCw className="w-5 h-5 animate-spin"/> Loading Customers...</div>;
    }

    if (selectedCustomer && isEditing) {
        return (
            <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
                <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => selectedCustomer.id === 'new' ? closeEditCustomer() : setIsEditing(false)}
                            className="p-2 border border-zinc-700 bg-zinc-800 rounded-lg hover:bg-zinc-700 hover:text-white text-zinc-400 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-zinc-800 items-center justify-center border border-zinc-700 flex shrink-0">
                                <User className="w-5 h-5 text-zinc-500" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white">
                                    {selectedCustomer.id === 'new' ? 'New Customer' : (editForm.firstName || editForm.lastName ? [editForm.firstName, editForm.lastName].filter(Boolean).join(' ') : 'Unnamed Customer')}
                                </h2>
                                {editForm.company && <p className="text-zinc-500 font-mono text-sm">{editForm.company}</p>}
                            </div>
                        </div>
                    </div>
                    <button 
                        type="submit" 
                        disabled={isSaving}
                        className="w-full md:w-auto bg-accent hover:bg-accent-hover text-white font-bold px-8 py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all font-mono tracking-widest uppercase text-sm"
                    >
                        <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>

                <form onSubmit={handleSaveCustomer} className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-10 pb-24">
                    
                    {/* Identity */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <User className="w-5 h-5 text-accent" /> Identity & Contact
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">First Name</label>
                                <input type="text" placeholder="Jane" value={editForm.firstName} onChange={(e) => setEditForm({...editForm, firstName: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Middle Name</label>
                                <input type="text" placeholder="R." value={editForm.middleName} onChange={(e) => setEditForm({...editForm, middleName: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Last Name</label>
                                <input type="text" placeholder="Doe" value={editForm.lastName} onChange={(e) => setEditForm({...editForm, lastName: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Nickname</label>
                                <input type="text" placeholder="JD" value={editForm.nickName} onChange={(e) => setEditForm({...editForm, nickName: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-6">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Company</label>
                                <div className="relative">
                                    <Building2 className="w-4 h-4 absolute left-4 top-3.5 text-zinc-600" />
                                    <input type="text" placeholder="Acme Inc." value={editForm.company} onChange={(e) => setEditForm({...editForm, company: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Status</label>
                                <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white appearance-none cursor-pointer">
                                    <option value="Active">Active</option>
                                    <option value="Lead">Lead</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Email</label>
                                <input type="email" placeholder="jane@example.com" value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Website URL</label>
                                <input type="url" placeholder="https://example.com" value={editForm.website} onChange={(e) => setEditForm({...editForm, website: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Mobile Phone</label>
                                <input type="text" placeholder="(555) 123-4567" value={editForm.mobilePhone} onChange={(e) => setEditForm({...editForm, mobilePhone: formatPhone(e.target.value)})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Work Phone (Ext)</label>
                                <input type="text" placeholder="(555) 987-6543" value={editForm.workPhone} onChange={(e) => setEditForm({...editForm, workPhone: formatPhone(e.target.value)})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1 shadow-sm text-green-400 flex items-center gap-1">Default Discount (%)</label>
                                <div className="relative group">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-500 font-black group-focus-within:text-green-400 transition-colors text-lg">%</span>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        max="100"
                                        value={editForm.defaultDiscount || 0} 
                                        onChange={(e) => setEditForm({...editForm, defaultDiscount: Math.max(0, Math.min(100, Number(e.target.value)))})} 
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 font-mono text-sm focus:outline-none focus:border-green-500/50 text-white transition-all shadow-inner focus:ring-1 focus:ring-green-500/50" 
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Address */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <MapPin className="w-5 h-5 text-indigo-400" /> Address Details
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
                            <div className="md:col-span-6">
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Street Address</label>
                                <input type="text" placeholder="123 Commerce Blvd" value={editForm.addressStreet} onChange={(e) => setEditForm({...editForm, addressStreet: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white" />
                            </div>
                            <div className="md:col-span-3">
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">City</label>
                                <input type="text" placeholder="Austin" value={editForm.addressCity} onChange={(e) => setEditForm({...editForm, addressCity: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white" />
                            </div>
                            <div className="md:col-span-1">
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">State</label>
                                <input type="text" placeholder="TX" maxLength={2} value={editForm.addressState} onChange={(e) => setEditForm({...editForm, addressState: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white uppercase" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">ZIP Code</label>
                                <input type="text" placeholder="78701" maxLength={10} value={editForm.addressZip} onChange={(e) => setEditForm({...editForm, addressZip: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white" />
                            </div>
                        </div>
                    </section>
                    
                    {/* Tags & Metadata */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <Tag className="w-5 h-5 text-amber-500" /> Categorization & Tags
                        </h3>
                        <div>
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3 ml-1">Tags (Press Enter to Add)</label>
                            <div className="flex items-center gap-2 mb-3">
                                <input 
                                    type="text" 
                                    placeholder="e.g. VIP, Wholesale, Local"
                                    value={newTag}
                                    onChange={(e) => setNewTag(e.target.value)}
                                    onKeyDown={addTag}
                                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 text-white"
                                />
                                <button type="button" onClick={addTag} className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-4 py-3 rounded-xl transition-colors font-bold text-sm tracking-wide">
                                    Add Tag
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {editForm.tags.map(tag => (
                                    <div key={tag} className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 px-3 py-1.5 rounded-lg text-sm font-bold text-zinc-300">
                                        <Tag className="w-3 h-3 text-amber-500" />
                                        {tag}
                                        <button type="button" onClick={() => removeTag(tag)} className="text-zinc-500 hover:text-red-400 transition-colors ml-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                        </button>
                                    </div>
                                ))}
                                {editForm.tags.length === 0 && <span className="text-zinc-600 text-sm italic py-2">No tags added yet.</span>}
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
                            placeholder="Add account notes, interaction history, or operational details..."
                            value={editForm.notes}
                            onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400/50 text-white resize-none"
                        ></textarea>
                    </section>

                    {/* Danger Zone */}
                    {selectedCustomer.id !== 'new' && (
                        <section className="mt-12 pt-8 border-t border-red-900/30">
                            <h3 className="text-lg font-bold text-red-500 mb-2 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" /> Danger Zone
                            </h3>
                            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h4 className="text-white font-bold text-sm mb-1">Delete Customer Account</h4>
                                    <p className="text-zinc-400 text-xs text-balance">Once you delete a customer, there is no going back. This will permanently erase their profile and unlink their vehicles and job history.</p>
                                </div>
                                {canManageCustomers && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteCustomer(selectedCustomer.id)}
                                        className="bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 border border-red-500/20 font-bold px-6 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap"
                                    >
                                        Delete Customer
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
                    hasChanges={initialEditCustomer !== null && JSON.stringify(initialEditCustomer) !== JSON.stringify(editForm)} 
                    onSave={() => handleSaveCustomer({ preventDefault: () => {} } as any)} 
                    onDiscard={() => setEditForm(initialEditCustomer!)} 
                    isSaving={isSaving} 
                />
            </div>
        );
    }

    if (selectedCustomer && !isEditing) {
        return (
            <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
                {/* Profile Header */}
                <div className="p-6 md:p-8 border-b border-zinc-800 bg-zinc-900/50 flex flex-col gap-6 sticky top-0 z-20 backdrop-blur-md">
                    <div className="flex items-center justify-between">
                        <button onClick={closeEditCustomer} className="text-zinc-400 hover:text-white flex items-center gap-2"><ArrowLeft className="w-4 h-4"/> Back to Customers</button>
                        {canManageCustomers && (
                            <button onClick={() => setIsEditing(true)} className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors border border-zinc-700"><Edit2 className="w-4 h-4"/> Edit Profile</button>
                        )}
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 shadow-inner">
                            <User className="w-8 h-8 text-zinc-500" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-3xl font-black text-white tracking-tight">
                                    {editForm.firstName || editForm.lastName ? [editForm.firstName, editForm.lastName].filter(Boolean).join(' ') : 'Unnamed Customer'}
                                </h2>
                                <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
                                    editForm.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                    editForm.status === 'Lead' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                    'bg-zinc-800 text-zinc-400 border-zinc-700'
                                }`}>
                                    {editForm.status || 'Active'}
                                </span>
                            </div>
                            {editForm.company && <p className="text-lg text-zinc-400 font-medium">{editForm.company}</p>}
                        </div>
                    </div>
                    
                    {/* Profile Tabs Config */}
                    <div className="flex items-center gap-6 border-b border-zinc-800/50 -mb-6 md:-mb-8 overflow-x-auto no-scrollbar pb-3">
                        {[
                            { id: 'info', label: 'Basic Info' },
                            { id: 'activity', label: 'Activity & Notes' },
                            { id: 'jobs', label: 'Job History' },
                            { id: 'vehicles', label: 'Vehicles' }
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
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                 {/* Contact Box */}
                                 <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                                     <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2"><User className="w-4 h-4 text-accent"/> Contact Info</h3>
                                     <div className="space-y-4">
                                         <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Email</p><p className="text-zinc-300 font-medium">{editForm.email || '—'}</p></div>
                                         <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Mobile</p><p className="text-zinc-300 font-medium font-mono">
                                            {editForm.mobilePhone ? <a className="text-accent underline" href={`tel:${unformatPhone(editForm.mobilePhone)}`}>{editForm.mobilePhone}</a> : '—'}
                                         </p></div>
                                         <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Work Phone</p><p className="text-zinc-300 font-medium font-mono">
                                            {editForm.workPhone ? <a className="text-accent underline" href={`tel:${unformatPhone(editForm.workPhone)}`}>{editForm.workPhone}</a> : '—'}
                                         </p></div>
                                         <div className="pt-2 border-t border-zinc-800/50 mt-2">
                                             <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1 text-green-500/80">Default Discount</p>
                                             <p className="text-green-400 font-black text-lg font-mono">{editForm.defaultDiscount ? `${editForm.defaultDiscount}%` : '0%'}</p>
                                         </div>
                                     </div>
                                 </div>
                                 {/* Address Box */}
                                 <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                                     <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2"><MapPin className="w-4 h-4 text-indigo-400"/> Address</h3>
                                     {editForm.addressStreet ? (
                                         <div className="text-zinc-300 leading-relaxed font-medium">
                                             <p>{editForm.addressStreet}</p>
                                             <p>{editForm.addressCity}{editForm.addressState ? `, ${editForm.addressState}` : ''} {editForm.addressZip}</p>
                                         </div>
                                     ) : <p className="text-zinc-600 italic text-sm">No address on file.</p>}
                                 </div>
                             </div>
                             
                             {/* Tags & Metadata */}
                             <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                                 <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-2"><Tag className="w-4 h-4 text-amber-500"/> Categorization</h3>
                                 <div className="flex flex-wrap gap-2">
                                     {editForm.tags?.length > 0 ? editForm.tags.map(t => (
                                         <span key={t} className="px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg text-xs font-bold">{t}</span>
                                     )) : <span className="text-zinc-600 text-sm italic">No tags associated.</span>}
                                 </div>
                             </div>
                         </div>
                     )}

                     {activeProfileTab === 'activity' && (
                         <div className="space-y-6">
                             {editForm.notes && (
                                 <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-6">
                                    <h3 className="text-sm font-bold text-orange-400 mb-4 uppercase tracking-widest flex items-center gap-2"><FileText className="w-4 h-4"/> Internal Notes</h3>
                                    <p className="text-zinc-300 whitespace-pre-wrap text-sm leading-relaxed">{editForm.notes}</p>
                                 </div>
                             )}
                             <div className="bg-zinc-900/50 border border-zinc-800 border-dashed rounded-2xl p-12 text-center">
                                 <Activity className="w-8 h-8 text-zinc-700 mx-auto mb-4" />
                                 <h3 className="text-zinc-400 font-bold mb-1">No Recent Activity</h3>
                                 <p className="text-zinc-600 text-sm">Activity logging will track customer interactions.</p>
                             </div>
                         </div>
                     )}

                     {activeProfileTab === 'jobs' && (
                         <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-white font-bold text-lg">Work Orders & Jobs</h3>
                                <button 
                                    onClick={() => setShowQuickAddJob(!showQuickAddJob)}
                                    className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors border border-zinc-700"
                                >
                                    {showQuickAddJob ? 'Cancel' : '+ Quick Add Job'}
                                </button>
                            </div>

                            {showQuickAddJob && (
                                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                                    <h4 className="text-accent font-bold text-sm uppercase tracking-widest mb-4">Open New Work Order</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="md:col-span-3">
                                            <input type="text" placeholder="Job Title / Description" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" value={quickAddJobForm.title} onChange={e => setQuickAddJobForm({...quickAddJobForm, title: e.target.value})} />
                                        </div>
                                        <div className="md:col-span-1">
                                            <select className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white appearance-none cursor-pointer" value={quickAddJobForm.priority} onChange={e => setQuickAddJobForm({...quickAddJobForm, priority: e.target.value})}>
                                                <option value="Low">Low Priority</option>
                                                <option value="Medium">Medium</option>
                                                <option value="High">High</option>
                                                <option value="Critical">Critical</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-end">
                                        <button 
                                            onClick={async () => {
                                                try {
                                                    if (!quickAddJobForm.title) {
                                                        toast.error("Job title is required");
                                                        return;
                                                    }
                                                    const payload = { ...quickAddJobForm, customerId: selectedCustomer.id, tenantId, status: 'Pending' };
                                                    await api.post('/jobs', payload);
                                                    setShowQuickAddJob(false);
                                                    setQuickAddJobForm({ title: '', priority: 'Medium' });
                                                    toast.success("Work Order Created!");
                                                } catch (e) {
                                                    toast.error("Failed to create work order.");
                                                }
                                            }}
                                            className="bg-accent hover:bg-accent-hover text-white font-bold px-6 py-2 rounded-lg text-sm"
                                        >
                                            Create Job
                                        </button>
                                    </div>
                                </div>
                            )}

                            {customerJobs.length === 0 && !showQuickAddJob ? (
                                <div className="bg-zinc-900/50 border border-zinc-800 border-dashed rounded-2xl p-12 text-center">
                                    <ClipboardList className="w-8 h-8 text-zinc-700 mx-auto mb-4" />
                                    <h3 className="text-zinc-400 font-bold mb-1">No Job History</h3>
                                    <p className="text-zinc-600 text-sm">Create a new job to start tracking work for this customer.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 mt-4">
                                    {customerJobs.map(j => (
                                        <div key={j.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between hover:border-zinc-700 transition-colors cursor-pointer">
                                            <div>
                                                <h4 className="text-white font-bold text-sm">{j.title || 'Untitled Job'}</h4>
                                                <p className="text-zinc-500 text-xs mt-1 font-mono">ID: {j.id.slice(0, 8).toUpperCase()}</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest rounded border ${
                                                    j.priority === 'Critical' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                                                    j.priority === 'High' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 
                                                    'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                }`}>
                                                    {j.priority || 'Medium'}
                                                </span>
                                                <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
                                                    j.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                                    j.status === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                    'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                }`}>
                                                    {j.status || 'Pending'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                         </div>
                     )}
                     
                     {activeProfileTab === 'vehicles' && (
                         <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-white font-bold text-lg">Customer Fleet</h3>
                                <button 
                                    onClick={() => setShowQuickAddVehicle(!showQuickAddVehicle)}
                                    className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors border border-zinc-700"
                                >
                                    {showQuickAddVehicle ? 'Cancel' : '+ Quick Add Vehicle'}
                                </button>
                            </div>

                            {showQuickAddVehicle && (
                                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                                    <h4 className="text-accent font-bold text-sm uppercase tracking-widest mb-4">Register New Asset</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                        <div className="md:col-span-1">
                                            <input type="text" placeholder="Year" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" value={quickAddVehicleForm.year} onChange={e => setQuickAddVehicleForm({...quickAddVehicleForm, year: e.target.value})} />
                                        </div>
                                        <div className="md:col-span-2">
                                            <input type="text" placeholder="Make" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" value={quickAddVehicleForm.make} onChange={e => setQuickAddVehicleForm({...quickAddVehicleForm, make: e.target.value})} />
                                        </div>
                                        <div className="md:col-span-2">
                                            <input type="text" placeholder="Model" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" value={quickAddVehicleForm.model} onChange={e => setQuickAddVehicleForm({...quickAddVehicleForm, model: e.target.value})} />
                                        </div>
                                        <div className="md:col-span-3">
                                            <input type="text" placeholder="VIN" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white uppercase font-mono" value={quickAddVehicleForm.vin} onChange={e => setQuickAddVehicleForm({...quickAddVehicleForm, vin: e.target.value})} />
                                        </div>
                                        <div className="md:col-span-2">
                                            <input type="text" placeholder="License Plate" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white uppercase font-mono" value={quickAddVehicleForm.licensePlate} onChange={e => setQuickAddVehicleForm({...quickAddVehicleForm, licensePlate: e.target.value.toUpperCase()})} />
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-end">
                                        <button 
                                            onClick={async () => {
                                                try {
                                                    const payload = { ...quickAddVehicleForm, customerId: selectedCustomer.id, tenantId, status: 'Active' };
                                                    await api.post('/vehicles', payload);
                                                    setShowQuickAddVehicle(false);
                                                    setQuickAddVehicleForm({ year: '', make: '', model: '', vin: '', licensePlate: '' });
                                                    toast.success("Vehicle registered and linked!");
                                                } catch (e) {
                                                    toast.error("Failed to register vehicle.");
                                                }
                                            }}
                                            className="bg-accent hover:bg-accent-hover text-white font-bold px-6 py-2 rounded-lg text-sm"
                                        >
                                            Save Asset
                                        </button>
                                    </div>
                                </div>
                            )}

                            {customerVehicles.length === 0 && !showQuickAddVehicle ? (
                                <div className="bg-zinc-900/50 border border-zinc-800 border-dashed rounded-2xl p-12 text-center">
                                    <Activity className="w-8 h-8 text-zinc-700 mx-auto mb-4" />
                                    <h3 className="text-zinc-400 font-bold mb-1">No Linked Vehicles</h3>
                                    <p className="text-zinc-600 text-sm">Associate a vehicle or fleet asset with this profile to start tracking.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    {customerVehicles.map(v => (
                                        <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col hover:border-zinc-700 transition-colors cursor-pointer">
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="text-white font-bold">{(v.year || v.make || v.model) ? `${v.year} ${v.make} ${v.model}`.trim() : 'Unnamed Vehicle'}</h4>
                                                <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded border ${
                                                    v.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                                    'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                }`}>
                                                    {v.status || 'Active'}
                                                </span>
                                            </div>
                                            <p className="text-zinc-500 text-xs font-mono">{v.vin || 'No VIN'}</p>
                                            {v.licensePlate && <p className="text-zinc-400 mt-2 text-[10px] uppercase font-black px-1.5 py-0.5 border border-zinc-800 rounded bg-zinc-950 w-fit">{v.licensePlate}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}
                         </div>
                     )}
                </div>
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
                    <p className="text-orange-400/80 text-xs mt-0.5">Customer Management is currently in active development. You may start testing it now, but expect rapid updates and potential data resets prior to stable release.</p>
                </div>
            </div>

            {/* Quick Add Bar */}
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 shrink-0 flex items-center justify-between relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-white font-bold tracking-tight">Customer Management</h3>
                        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                            Alpha Labs
                        </span>
                    </div>
                    <p className="text-zinc-500 text-xs">Manage client portfolios tracked in this workspace.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-xs font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Live
                    </div>
                    {canManageCustomers && (
                        <button 
                            onClick={openAddCustomer}
                            className="bg-accent hover:bg-accent-hover text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
                        >
                            <Plus className="w-4 h-4" /> Add Customer
                        </button>
                    )}
                </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-zinc-900/50 border-b border-zinc-800 text-xs font-black text-zinc-500 uppercase tracking-widest shrink-0">
                <div className="col-span-4 object-cover">Name / Company</div>
                <div className="col-span-3">Contact Info</div>
                <div className="hidden md:block col-span-3">Status</div>
                <div className="col-span-5 md:col-span-2 text-right">Actions</div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto">
                {customers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <Users className="w-12 h-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-1">No Customers Found</h3>
                        <p className="text-zinc-500 text-sm">Add a customer to start building your client list.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800/50">
                        {customers.map((customer) => (
                            <div key={customer.id} onClick={() => openCustomerProfile(customer)} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-zinc-900/30 transition-colors group cursor-pointer">
                                <div className="col-span-4 flex flex-col">
                                    <span className="font-bold text-sm text-zinc-200 group-hover:text-accent transition-colors">
                                        {customer.firstName} {customer.lastName}
                                        {!customer.firstName && !customer.lastName && <span className="text-zinc-500 italic group-hover:text-accent/70">No Name</span>}
                                    </span>
                                    {customer.company && <span className="text-xs text-zinc-500 mt-0.5">{customer.company}</span>}
                                </div>
                                <div className="col-span-3 flex flex-col text-xs text-zinc-400">
                                    {customer.email && <span>{customer.email}</span>}
                                    {customer.mobilePhone && <span className="font-mono mt-0.5">{formatPhone(customer.mobilePhone)}</span>}
                                    {!customer.email && !customer.mobilePhone && <span className="text-zinc-600">-</span>}
                                </div>
                                <div className="hidden md:flex col-span-3 items-center">
                                    <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
                                        customer.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                        customer.status === 'Lead' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                        'bg-zinc-800 text-zinc-400 border-zinc-700'
                                    }`}>
                                        {customer.status || 'Active'}
                                    </span>
                                </div>
                                <div className="col-span-5 md:col-span-2 flex items-center justify-end">
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
