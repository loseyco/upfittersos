import { useState, useEffect } from 'react';
import { Building2, Save, MapPin, Mail, Phone, Globe, RefreshCw, Link2, CheckCircle } from 'lucide-react';
import { formatPhone, unformatPhone } from '../../../lib/formatters';
import { type PermissionKey } from '../../../lib/permissions';
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
        customRoles: {} as Record<string, { label: string, permissions: Partial<Record<PermissionKey, boolean>> }>,
        companyCamToken: '',
        qboRealmId: ''
    });
    
    // Unsaved changes tracking
    const [initialForm, setInitialForm] = useState<typeof form | null>(null);


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
                    customRoles: res.data.customRoles || {},
                    companyCamToken: res.data.companyCamToken || '',
                    qboRealmId: res.data.qboRealmId || ''
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

    const handleCompanyCamConnect = async () => {
        try {
            // Provide the intended redirect URI matching the catcher route
            const redirectUri = window.location.origin + '/oauth/companycam';
            const res = await api.get(`/companycam/oauth/url?redirectUri=${encodeURIComponent(redirectUri)}&tenantId=${tenantId}`);
            if (res.data?.url) {
                window.location.href = res.data.url;
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to generate CompanyCam authorization URL.");
        }
    };

    const handleQBOConnect = async () => {
        try {
            const res = await api.get(`/qbo/auth?tenantId=${tenantId}`);
            if (res.data?.url) {
                window.location.href = res.data.url;
            }
        } catch (err) {
            console.error('Failed to get QBO OAuth URL', err);
            toast.error("Failed to generate QuickBooks authorization URL.");
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
                
                {/* Integrations */}
                <section>
                    <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-3">
                        <Link2 className="w-4 h-4 text-orange-400"/> Integrations
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-white">CompanyCam</h4>
                                    <p className="text-xs text-zinc-500">Sync projects and photos</p>
                                </div>
                                {form.companyCamToken ? (
                                    <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Connected</span>
                                ) : (
                                    <span className="bg-zinc-800 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full">Not Connected</span>
                                )}
                            </div>
                            
                            {!form.companyCamToken && (
                                <button 
                                    type="button"
                                    onClick={handleCompanyCamConnect}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg text-sm transition-colors"
                                >
                                    Connect CompanyCam
                                </button>
                            )}
                        </div>

                        {/* QuickBooks */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-white">QuickBooks Online</h4>
                                    <p className="text-xs text-zinc-500">Sync invoices and live inventory</p>
                                </div>
                                {form.qboRealmId ? (
                                    <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Connected</span>
                                ) : (
                                    <span className="bg-zinc-800 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full">Not Connected</span>
                                )}
                            </div>
                            
                            {!form.qboRealmId && (
                                <button 
                                    type="button"
                                    onClick={handleQBOConnect}
                                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg text-sm transition-colors"
                                >
                                    Connect QuickBooks
                                </button>
                            )}
                        </div>
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
