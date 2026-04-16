import { useState, useEffect } from 'react';
import { useRef } from 'react';
import { Building2, Save, MapPin, Mail, Phone, Globe, RefreshCw, Link2, CheckCircle, Calculator, Camera, Plus, Trash2 } from 'lucide-react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
        qboRealmId: '',
        standardShopRate: 150,
        burdenMultiplier: 1.3,
        averageStaffHourlyCost: 25,
        defaultSopSupplies: 0,
        defaultShipping: 0,
        easyPostApiKey: '',
        pwaIconUrl: '',
        externalLinks: [] as { title: string, url: string }[]
    });
    
    // Internal files
    const iconFileInputRef = useRef<HTMLInputElement>(null);
    
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
                    qboRealmId: res.data.qboRealmId || '',
                    standardShopRate: res.data.standardShopRate !== undefined ? Number(res.data.standardShopRate) : 150,
                    burdenMultiplier: res.data.burdenMultiplier !== undefined ? Number(res.data.burdenMultiplier) : 1.3,
                    averageStaffHourlyCost: res.data.averageStaffHourlyCost !== undefined ? Number(res.data.averageStaffHourlyCost) : 25,
                    defaultSopSupplies: res.data.defaultSopSupplies !== undefined ? Number(res.data.defaultSopSupplies) : 0,
                    defaultShipping: res.data.defaultShipping !== undefined ? Number(res.data.defaultShipping) : 0,
                    easyPostApiKey: res.data.easyPostApiKey || '',
                    pwaIconUrl: res.data.pwaIconUrl || '',
                    externalLinks: res.data.externalLinks || []
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

    const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        try {
            const toastId = toast.loading('Uploading custom app icon...', { id: 'icon_upload' });
            const storage = getStorage();
            const storageRef = ref(storage, `businesses/${tenantId}/pwa_icon`);
            
            await uploadBytes(storageRef, file, { contentType: file.type });
            const url = await getDownloadURL(storageRef);
            
            const cacheBustedUrl = `${url}&t=${Date.now()}`;
            
            setForm({ ...form, pwaIconUrl: cacheBustedUrl });
            toast.success('App Icon uploaded. Remember to save your profile!', { id: toastId });
        } catch (err) {
            console.error("Icon upload failed", err);
            toast.error('Failed to process image payload.', { id: 'icon_upload' });
        }
    };


    const handleQBOConnect = async () => {
        try {
            const res = await api.get(`/qbo/auth?tenantId=${tenantId}&_t=${Date.now()}`);
            if (res.data?.url) {
                window.open(res.data.url, '_blank', 'width=600,height=700,left=200,top=100');
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

            <form onSubmit={handleSave} className="p-6 md:p-8 max-w-4xl mx-auto w-full space-y-10 pb-40">
                
                {/* Basic Info */}
                <section>
                    <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-3">
                        <Building2 className="w-4 h-4 text-accent"/> Identity & Application Branding
                    </h3>

                    <input 
                        type="file" 
                        ref={iconFileInputRef} 
                        className="hidden" 
                        accept="image/png, image/jpeg, image/webp" 
                        onChange={handleIconUpload}
                    />

                    <div className="flex items-center gap-4 p-4 bg-zinc-950/50 border border-zinc-800/50 rounded-xl mb-6">
                        <div className="w-16 h-16 rounded-xl bg-zinc-900 border-2 border-zinc-800 shadow-xl flex items-center justify-center text-xl text-accent font-black overflow-hidden shrink-0">
                            {form.pwaIconUrl ? (
                                <img src={form.pwaIconUrl} alt="App Icon" className="w-full h-full object-cover" />
                            ) : (
                                <Building2 className="w-8 h-8 text-zinc-600" />
                            )}
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1">Custom App Icon (PWA)</label>
                            <p className="text-xs text-zinc-400 mb-2">Upload a square logo (e.g. 512x512) to override the default application icon when users install UpfittersOS to their device homescreen.</p>
                            <button 
                                type="button"
                                onClick={() => iconFileInputRef.current?.click()}
                                className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors flex items-center gap-2 border border-zinc-700 hover:border-zinc-600"
                            >
                                <Camera className="w-3.5 h-3.5" /> Select Icon Image
                            </button>
                        </div>
                    </div>

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

                {/* External Sites & Social Media */}
                <section>
                    <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-3">
                        <Link2 className="w-4 h-4 text-blue-400"/> External Sites & Social Media
                    </h3>
                    <div className="flex flex-col gap-4">
                        {form.externalLinks.map((link, idx) => (
                            <div key={idx} className="flex items-center gap-4">
                                <input type="text" placeholder="Title (e.g. Facebook)" value={link.title} onChange={e => {
                                    const newLinks = [...form.externalLinks];
                                    newLinks[idx].title = e.target.value;
                                    setForm({...form, externalLinks: newLinks});
                                }} className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-white" />
                                <input type="url" placeholder="https://..." value={link.url} onChange={e => {
                                    const newLinks = [...form.externalLinks];
                                    newLinks[idx].url = e.target.value;
                                    setForm({...form, externalLinks: newLinks});
                                }} className="flex-[2] bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-white" />
                                <button type="button" onClick={() => {
                                    const newLinks = form.externalLinks.filter((_, i) => i !== idx);
                                    setForm({...form, externalLinks: newLinks});
                                }} className="w-[50px] h-[46px] shrink-0 bg-zinc-900 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 border border-zinc-800 rounded-xl flex items-center justify-center transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        <button type="button" onClick={() => {
                            setForm({...form, externalLinks: [...form.externalLinks, { title: '', url: '' }]});
                        }} className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors border-dashed">
                            <Plus className="w-4 h-4" /> Add External Link
                        </button>
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

                        {/* EasyPost */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-white">EasyPost</h4>
                                    <p className="text-xs text-zinc-500">
                                        Live package tracking API Key. <a href="https://www.easypost.com/" target="_blank" rel="noreferrer" className="text-orange-400 hover:text-orange-300 transition-colors">Get a free key</a>
                                    </p>
                                </div>
                                {form.easyPostApiKey ? (
                                    <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Active</span>
                                ) : (
                                    <span className="bg-zinc-800 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full">Not Set</span>
                                )}
                            </div>
                            <input
                                type="password"
                                placeholder="ezp_test_..."
                                value={form.easyPostApiKey}
                                onChange={e => setForm({...form, easyPostApiKey: e.target.value})}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-orange-500 text-white font-mono placeholder:text-zinc-700"
                            />
                        </div>
                    </div>
                </section>
                {/* Financial & Job Settings */}
                <section>
                    <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-3">
                        <Calculator className="w-4 h-4 text-amber-400"/> Financial & Cost Accrual Settings
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Standard Shop Rate</label>
                            <div className="relative group">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-500 font-black group-focus-within:text-amber-400 transition-colors text-lg">$</span>
                                <input 
                                    type="number" 
                                    min="0" 
                                    step="1" 
                                    value={form.standardShopRate} 
                                    onChange={e => setForm({...form, standardShopRate: parseFloat(e.target.value) || 0})} 
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-12 py-4 text-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono font-black shadow-inner transition-all [&::-webkit-inner-spin-button]:appearance-none" 
                                />
                                <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-zinc-600 font-bold text-xs uppercase tracking-widest">/hr</span>
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-2 px-1">Default rate billed to customers for shop labor. Editable per-job.</p>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Labor Burden Multiplier</label>
                            <div className="relative group">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-500 font-black text-xl group-focus-within:text-amber-400 transition-colors">×</span>
                                <input 
                                    type="number" 
                                    min="1" 
                                    step="0.01" 
                                    value={form.burdenMultiplier} 
                                    onChange={e => setForm({...form, burdenMultiplier: parseFloat(e.target.value) || 1})} 
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-4 text-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono font-black shadow-inner transition-all [&::-webkit-inner-spin-button]:appearance-none" 
                                />
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-2 px-1">Multiplier on staff wages to cover employer taxes, utilities, and overhead (e.g. 1.3 = 30% burden overhead).</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        <div>
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Average Staff Hourly Cost</label>
                            <div className="relative group">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-500 font-black group-focus-within:text-amber-400 transition-colors text-lg">$</span>
                                <input 
                                    type="number" 
                                    min="0" 
                                    step="1" 
                                    value={form.averageStaffHourlyCost} 
                                    onChange={e => setForm({...form, averageStaffHourlyCost: parseFloat(e.target.value) || 0})} 
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-12 py-4 text-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono font-black shadow-inner transition-all [&::-webkit-inner-spin-button]:appearance-none" 
                                />
                                <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-zinc-600 font-bold text-xs uppercase tracking-widest">/hr</span>
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-2 px-1">Baseline wage used to blindly forecast minimum internal labor costs during the initial quoting phase.</p>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Default Shop Supplies</label>
                            <div className="relative group">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-500 font-black group-focus-within:text-amber-400 transition-colors text-lg">$</span>
                                <input 
                                    type="number" 
                                    min="0" 
                                    step="0.01" 
                                    value={form.defaultSopSupplies} 
                                    onChange={e => setForm({...form, defaultSopSupplies: parseFloat(e.target.value) || 0})} 
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-4 text-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono font-black shadow-inner transition-all [&::-webkit-inner-spin-button]:appearance-none" 
                                />
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-2 px-1">Default fee for Shop Supplies added to new jobs. Editable per-job.</p>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Default Shipping Rule</label>
                            <div className="relative group">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-500 font-black group-focus-within:text-amber-400 transition-colors text-lg">$</span>
                                <input 
                                    type="number" 
                                    min="0" 
                                    step="0.01" 
                                    value={form.defaultShipping} 
                                    onChange={e => setForm({...form, defaultShipping: parseFloat(e.target.value) || 0})} 
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-4 text-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white font-mono font-black shadow-inner transition-all [&::-webkit-inner-spin-button]:appearance-none" 
                                />
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-2 px-1">Default Shipping/Freight fee flat rate for new jobs. Editable per-job.</p>
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
