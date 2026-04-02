import { useState, useEffect } from 'react';
import { Building2, Save, MapPin, Mail, Phone, Globe, RefreshCw, Shield, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { formatPhone, unformatPhone } from '../../../lib/formatters';
import { PERMISSION_LABELS, type PermissionKey } from '../../../lib/permissions';
import { UnsavedChangesBanner } from '../../../components/UnsavedChangesBanner';
import { api } from '../../../lib/api';
import toast from 'react-hot-toast';

export function BusinessSettingsTab({ tenantId }: { tenantId: string }) {
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    const [form, setForm] = useState({
        name: '',
        legalName: '',
        email: '',
        phone: '',
        website: '',
        addressStreet: '',
        addressCity: '',
        addressState: '',
        addressZip: '',
        customRoles: {} as Record<string, { label: string, permissions: Partial<Record<PermissionKey, boolean>> }>
    });
    
    // Unsaved changes tracking
    const [initialForm, setInitialForm] = useState<typeof form | null>(null);

    const [newRoleKey, setNewRoleKey] = useState('');
    const [newRoleLabel, setNewRoleLabel] = useState('');
    const [expandedRole, setExpandedRole] = useState<string | null>(null);

    useEffect(() => {
        const fetchBusiness = async () => {
            try {
                const res = await api.get(`/businesses/${tenantId}`);
                const loadedForm = {
                    name: res.data.name || '',
                    legalName: res.data.legalName || '',
                    email: res.data.email || '',
                    phone: formatPhone(res.data.phone),
                    website: res.data.website || '',
                    addressStreet: res.data.addressStreet || '',
                    addressCity: res.data.addressCity || '',
                    addressState: res.data.addressState || '',
                    addressZip: res.data.addressZip || '',
                    customRoles: res.data.customRoles || {}
                };
                setForm(loadedForm);
                setInitialForm(loadedForm);
            } catch (err) {
                console.error(err);
                toast.error("Failed to load business profile.");
            } finally {
                setLoading(false);
            }
        };
        fetchBusiness();
    }, [tenantId]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            const payload = {
                ...form,
                phone: unformatPhone(form.phone)
            };
            await api.put(`/businesses/${tenantId}`, payload);
            toast.success("Business profile saved successfully!");
            setInitialForm(form);
        } catch (err) {
            console.error(err);
            toast.error("Failed to save changes.");
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center flex items-center justify-center gap-2"><RefreshCw className="w-5 h-5 animate-spin"/> Loading Business Profile...</div>;
    }

    const hasChanges = initialForm !== null && JSON.stringify(initialForm) !== JSON.stringify(form);

    return (
        <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
            <UnsavedChangesBanner hasChanges={hasChanges} onSave={() => handleSave({ preventDefault: () => {} } as any)} onDiscard={() => initialForm && setForm(initialForm)} />
            <div className="p-6 md:p-8 border-b border-zinc-800 bg-zinc-900/50 flex flex-col gap-6 sticky top-0 z-20 backdrop-blur-md">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-accent/20 border border-accent/40 rounded-xl flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-accent" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-tight">Business Profile</h2>
                            <p className="text-zinc-500 text-sm">Manage public-facing information and identity.</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-accent hover:bg-accent-hover text-white font-bold px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-lg disabled:opacity-50 transition-colors text-sm tracking-wide"
                    >
                        <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Profile'}
                    </button>
                </div>
            </div>

            <form onSubmit={handleSave} className="p-6 md:p-8 max-w-4xl mx-auto w-full space-y-10 pb-24">
                
                {/* Basic Info */}
                <section>
                    <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-3">
                        <Building2 className="w-4 h-4 text-accent"/> Identity
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Display Name</label>
                            <input type="text" placeholder="Acme Inc" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Legal Name</label>
                            <input type="text" placeholder="Acme Corporation LLC" value={form.legalName} onChange={e => setForm({...form, legalName: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                        </div>
                    </div>
                </section>

                {/* Contact */}
                <section>
                    <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-3">
                        <Phone className="w-4 h-4 text-emerald-400"/> Primary Contact
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1 flex items-center gap-1"><Phone className="w-3 h-3"/> Office Phone</label>
                            <input type="tel" placeholder="(555) 123-4567" value={form.phone} onChange={e => setForm({...form, phone: formatPhone(e.target.value)})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 text-white" />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1 flex items-center gap-1"><Mail className="w-3 h-3"/> Support Email</label>
                            <input type="email" placeholder="hello@acme.com" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 text-white" />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1 flex items-center gap-1"><Globe className="w-3 h-3"/> Website</label>
                            <input type="url" placeholder="https://acme.com" value={form.website} onChange={e => setForm({...form, website: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 text-white" />
                        </div>
                    </div>
                </section>

                {/* Address */}
                <section>
                    <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-3">
                        <MapPin className="w-4 h-4 text-indigo-400"/> Headquarters
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
                        <div className="md:col-span-6">
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Street Address</label>
                            <input type="text" placeholder="123 Commerce Blvd" value={form.addressStreet} onChange={e => setForm({...form, addressStreet: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white" />
                        </div>
                        <div className="md:col-span-3">
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">City</label>
                            <input type="text" placeholder="Austin" value={form.addressCity} onChange={e => setForm({...form, addressCity: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white" />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">State</label>
                            <input type="text" placeholder="TX" maxLength={2} value={form.addressState} onChange={e => setForm({...form, addressState: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white uppercase" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">ZIP Code</label>
                            <input type="text" placeholder="78701" maxLength={10} value={form.addressZip} onChange={e => setForm({...form, addressZip: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white" />
                        </div>
                    </div>
                </section>
                
                {/* Custom Roles & Permissions */}
                <section>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-zinc-800 pb-3">
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2 m-0 p-0 border-none">
                            <Shield className="w-4 h-4 text-rose-400"/> Staff Roles & Permissions
                        </h3>
                        <button 
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-accent/10 hover:bg-accent hover:text-white text-accent font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-xs tracking-wide"
                        >
                            <Save className="w-3 h-3" /> Save Changes
                        </button>
                    </div>
                    
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8 flex flex-col md:flex-row items-end gap-4">
                        <div className="flex-1 w-full">
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Role Identifier (e.g. lead_tech)</label>
                            <input 
                                type="text" 
                                placeholder="machine_operator" 
                                value={newRoleKey} 
                                onChange={e => setNewRoleKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} 
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-rose-500/50 text-white font-mono" 
                            />
                        </div>
                        <div className="flex-1 w-full">
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Display Label</label>
                            <input 
                                type="text" 
                                placeholder="Machine Operator" 
                                value={newRoleLabel} 
                                onChange={e => setNewRoleLabel(e.target.value)} 
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-rose-500/50 text-white" 
                            />
                        </div>
                        <button 
                            type="button"
                            disabled={!newRoleKey || !newRoleLabel}
                            onClick={() => {
                                if (newRoleKey && newRoleLabel) {
                                    setForm(prev => ({
                                        ...prev,
                                        customRoles: {
                                            ...prev.customRoles,
                                            [newRoleKey]: { label: newRoleLabel, permissions: {} }
                                        }
                                    }));
                                    setNewRoleKey('');
                                    setNewRoleLabel('');
                                    setExpandedRole(newRoleKey);
                                }
                            }}
                            className="bg-zinc-800 hover:bg-rose-500 hover:text-white text-white font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-colors shrink-0 w-full md:w-auto"
                        >
                            <Plus className="w-4 h-4" /> Add Role
                        </button>
                    </div>

                    <div className="space-y-4">
                        {Object.entries(form.customRoles || {}).length === 0 ? (
                            <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl">
                                <Shield className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                                <p className="text-zinc-500 text-sm">No custom roles defined. You are using standard defaults.</p>
                            </div>
                        ) : (
                            Object.entries(form.customRoles).map(([roleKey, roleDef]) => (
                                <div key={roleKey} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                                    <div 
                                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-800/50 transition-colors"
                                        onClick={() => setExpandedRole(expandedRole === roleKey ? null : roleKey)}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg">
                                                <Shield className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h4 className="text-white font-bold text-sm tracking-wide">{roleDef.label}</h4>
                                                <p className="text-zinc-500 text-xs font-mono">{roleKey}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <button 
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm(`Delete the custom role "${roleDef.label}"?`)) {
                                                        const freshRoles = { ...form.customRoles };
                                                        delete freshRoles[roleKey];
                                                        setForm({ ...form, customRoles: freshRoles });
                                                    }
                                                }}
                                                className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            {expandedRole === roleKey ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                                        </div>
                                    </div>
                                    
                                    {expandedRole === roleKey && (
                                        <div className="p-6 border-t border-zinc-800 bg-zinc-950/30">
                                            <h5 className="text-[12px] font-black text-zinc-400 uppercase tracking-widest mb-4">Role Permissions</h5>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                {Object.entries(PERMISSION_LABELS).map(([permKey, meta]) => {
                                                    const key = permKey as PermissionKey;
                                                    const isEnabled = roleDef.permissions[key] === true;
                                                    
                                                    const togglePerm = () => {
                                                        setForm(prev => ({
                                                            ...prev,
                                                            customRoles: {
                                                                ...prev.customRoles,
                                                                [roleKey]: {
                                                                    ...prev.customRoles[roleKey],
                                                                    permissions: {
                                                                        ...prev.customRoles[roleKey].permissions,
                                                                        [key]: !isEnabled
                                                                    }
                                                                }
                                                            }
                                                        }));
                                                    };
                                                    
                                                    return (
                                                        <div key={key} className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${isEnabled ? 'bg-amber-500/5 border-amber-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
                                                            <div className="pt-1">
                                                                <div 
                                                                    onClick={togglePerm}
                                                                    className={`w-11 h-6 rounded-full cursor-pointer transition-colors relative flex-shrink-0 ${isEnabled ? 'bg-amber-500' : 'bg-zinc-700'}`}
                                                                >
                                                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                                                </div>
                                                            </div>
                                                            <div className="flex-1">
                                                                <h4 className={`text-sm font-bold mb-1 ${isEnabled ? 'text-white' : 'text-zinc-400'}`}>{meta.label}</h4>
                                                                <p className="text-xs text-zinc-500 leading-relaxed">{meta.description}</p>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </section>
                
            </form>

            <UnsavedChangesBanner 
                hasChanges={hasChanges} 
                onSave={() => handleSave({ preventDefault: () => {} } as any)} 
                onDiscard={() => setForm(initialForm!)} 
                isSaving={isSaving} 
            />
        </div>
    );
}
