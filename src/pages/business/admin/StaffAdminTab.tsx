import { useState, useEffect, useRef } from 'react';
import { Users, Edit2, Trash2, AlertTriangle, CheckCircle2, Plus, ArrowLeft, Save, Briefcase, HeartPulse, DollarSign, FileText, Award, X, PlusCircle, Camera, Eye } from 'lucide-react';
import { api } from '../../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { usePermissions } from '../../../hooks/usePermissions';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { UnsavedChangesBanner } from '../../../components/UnsavedChangesBanner';

export function StaffAdminTab({ tenantId }: { tenantId: string }) {
    const { currentUser } = useAuth();
    const { businessRoles } = usePermissions(tenantId);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [staff, setStaff] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Invite Logic
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('');
    const [isInviting, setIsInviting] = useState(false);

    // Detailed Edit State
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [initialEditForm, setInitialEditForm] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [newSkill, setNewSkill] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Expanded Edit Form State
    const [editForm, setEditForm] = useState({
        firstName: '',
        middleName: '',
        lastName: '',
        nickName: '',
        jobTitle: '',
        department: '',
        workPhone: '',
        mobilePhone: '',
        addressStreet: '',
        addressCity: '',
        addressState: '',
        addressZip: '',
        photoURL: '',
        dob: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        payRate: '',
        payType: 'hourly',
        startDate: '',
        notes: '',
        skills: [] as string[],
        certificates: [] as any[],
        role: '',
        roles: [] as string[],
        customPermissions: {} as Record<string, boolean>
    });
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedUser) return;
        
        try {
            const toastId = toast.loading('Uploading profile picture to Cloud Storage...', { id: 'admin_avatar_upload' });
            const storage = getStorage();
            const storageRef = ref(storage, `users/${selectedUser.uid}/avatar`);
            
            // Set explicit content type so the browser renders the image inline correctly!
            await uploadBytes(storageRef, file, { contentType: file.type });
            const url = await getDownloadURL(storageRef);
            
            // Append a timestamp to the URL to instantly clear the browser's local cache
            const cacheBustedUrl = `${url}&t=${Date.now()}`;
            
            setEditForm(prev => ({ ...prev, photoURL: cacheBustedUrl }));
            
            // Auto-save the uploaded avatar straight to the DB so they don't lose it on refresh!
            await api.post(`/businesses/${tenantId}/staff/${selectedUser.uid}/metadata`, {
                ...editForm,
                photoURL: cacheBustedUrl
            });
            fetchStaff(); // Update the sidebar implicitly
            
            toast.success('Profile picture uploaded successfully.', { id: toastId });
        } catch (err: any) {
            console.error("Avatar upload failed", err);
            toast.error('Failed to upload image.', { id: 'admin_avatar_upload' });
        }
    };

    const fetchStaff = async () => {
        try {
            const res = await api.get(`/businesses/${tenantId}/staff`);
            setStaff(res.data);
            
            // Hydrate from deep-link URL on initial load
            const urlEditUid = searchParams.get('edit');
            if (!selectedUser && urlEditUid) {
                const urlMatch = res.data.find((u: any) => u.uid === urlEditUid);
                if (urlMatch) {
                    setSelectedUser(urlMatch);
                    setEditForm({
                        firstName: urlMatch.firstName || '',
                        middleName: urlMatch.middleName || '',
                        lastName: urlMatch.lastName || '',
                        nickName: urlMatch.nickName || '',
                        jobTitle: urlMatch.jobTitle || '',
                        department: urlMatch.department || '',
                        workPhone: urlMatch.workPhone || '',
                        mobilePhone: urlMatch.mobilePhone || '',
                        addressStreet: urlMatch.addressStreet || urlMatch.address || '',
                        addressCity: urlMatch.addressCity || '',
                        addressState: urlMatch.addressState || '',
                        addressZip: urlMatch.addressZip || '',
                        photoURL: urlMatch.photoURL || '',
                        dob: urlMatch.dob || '',
                        emergencyContactName: urlMatch.emergencyContactName || '',
                        emergencyContactPhone: urlMatch.emergencyContactPhone || '',
                        payRate: urlMatch.payRate || '',
                        payType: urlMatch.payType || 'hourly',
                        startDate: urlMatch.startDate || '',
                        notes: urlMatch.notes || '',
                        skills: urlMatch.skills || [],
                        certificates: urlMatch.certificates || [],
                        role: (urlMatch.roles && urlMatch.roles.length > 0 ? urlMatch.roles[0] : urlMatch.role) || 'staff',
                        roles: urlMatch.roles && urlMatch.roles.length > 0 ? urlMatch.roles : (urlMatch.role ? [urlMatch.role] : []),
                        customPermissions: urlMatch.customPermissions || {}
                    });
                }
            } 
            // Or re-sync existing local state
            else if (selectedUser) {
                const updatedMatch = res.data.find((u: any) => u.uid === selectedUser.uid);
                if (updatedMatch) setSelectedUser(updatedMatch);
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to load staff list.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStaff();
    }, [tenantId]);


    const closeEditUser = () => {
        setSelectedUser(null);
        setSearchParams(prev => {
            prev.delete('edit');
            return prev;
        });
    };

    useEffect(() => {
        if (!searchParams.get('edit') && selectedUser) {
            setSelectedUser(null);
        }
    }, [searchParams.get('edit')]);

    const handleDeactivateUser = async (uid: string, email: string) => {
        if (!window.confirm(`Are you sure you want to deactivate ${email}? They will lose platform access immediately but their historical data will be preserved.`)) return;
        try {
            await api.post(`/businesses/${tenantId}/staff/${uid}/metadata`, {
                status: 'inactive'
            });
            toast.success("User deactivated effectively.");
            if (selectedUser?.uid === uid || searchParams.get('edit') === uid) {
                closeEditUser();
            }
            fetchStaff();
        } catch (err) {
            toast.error("Failed to deactivate user.");
        }
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsInviting(true);
            await api.post(`/businesses/${tenantId}/staff`, { email: inviteEmail, role: inviteRole });
            toast.success("User added successfully.");
            setInviteEmail('');
            fetchStaff();
        } catch (err) {
            toast.error("Failed to add user. Check permissions.");
        } finally {
            setIsInviting(false);
        }
    };

    const handleImpersonate = async (targetUid: string) => {
        try {
            toast.loading("Generating secure overriding identity token...", { id: 'impersonate_staff' });
            const res = await api.post(`/businesses/${tenantId}/staff/${targetUid}/impersonate`);
            const { token } = res.data;
            
            toast.loading("Assuming target identity...", { id: 'impersonate_staff' });
            sessionStorage.setItem('sae_impersonating', 'true');
            await signInWithCustomToken(auth, token);
            
            toast.success("Identity assumed successfully. Entering context.", { id: 'impersonate_staff' });
            navigate('/workspace');
        } catch (error: any) {
            console.error("Impersonation failed", error);
            toast.error(error?.response?.data?.error || "Failed to impersonate identity.", { id: 'impersonate_staff' });
        }
    };

    const openEditUser = (user: any) => {
        setSearchParams(prev => {
            prev.set('edit', user.uid);
            return prev;
        });
        setSelectedUser(user);
        const initialFormValues = {
            firstName: user.firstName || '',
            middleName: user.middleName || '',
            lastName: user.lastName || '',
            nickName: user.nickName || '',
            jobTitle: user.jobTitle || '',
            department: user.department || '',
            workPhone: user.workPhone || '',
            mobilePhone: user.mobilePhone || '',
            addressStreet: user.addressStreet || user.address || '',
            addressCity: user.addressCity || '',
            addressState: user.addressState || '',
            addressZip: user.addressZip || '',
            photoURL: user.photoURL || '',
            dob: user.dob || '',
            emergencyContactName: user.emergencyContactName || '',
            emergencyContactPhone: user.emergencyContactPhone || '',
            payRate: user.payRate || '',
            payType: user.payType || 'hourly',
            startDate: user.startDate || '',
            notes: user.notes || '',
            skills: user.skills || [],
            certificates: user.certificates || [],
            role: (user.roles && user.roles.length > 0 ? user.roles[0] : user.role) || '',
            roles: user.roles && user.roles.length > 0 ? user.roles : (user.role ? [user.role] : []),
            customPermissions: user.customPermissions || {}
        };
        setEditForm(initialFormValues);
        setInitialEditForm(initialFormValues);
        setNewSkill('');
    };

    // Skills logic
    const addSkill = (e: React.KeyboardEvent | React.MouseEvent) => {
        if ('key' in e && e.key !== 'Enter') return;
        e.preventDefault();
        if (!newSkill.trim()) return;
        if (!editForm.skills.includes(newSkill.trim())) {
            setEditForm({...editForm, skills: [...editForm.skills, newSkill.trim()]});
        }
        setNewSkill('');
    };
    
    const removeSkill = (skillToRemove: string) => {
        setEditForm({
            ...editForm,
            skills: editForm.skills.filter(s => s !== skillToRemove)
        });
    };

    // Certs logic
    const addBlankCert = () => {
        setEditForm({
            ...editForm,
            certificates: [
                ...editForm.certificates, 
                { id: Math.random().toString(36).substring(7), name: '', issueDate: '', expirationDate: '', credentialId: '' }
            ]
        });
    };
    
    const updateCert = (id: string, field: string, value: string) => {
        setEditForm({
            ...editForm,
            certificates: editForm.certificates.map(c => c.id === id ? { ...c, [field]: value } : c)
        });
    };
    
    const removeCert = (id: string) => {
        setEditForm({
            ...editForm,
            certificates: editForm.certificates.filter(c => c.id !== id)
        });
    };

    // Helper to format phone numbers on the fly
    const handlePhoneChange = (field: 'workPhone' | 'mobilePhone' | 'emergencyContactPhone', value: string) => {
        const cleaned = ('' + value).replace(/\D/g, '');
        let formatted = cleaned;
        if (cleaned.length > 0) {
            if (cleaned.length <= 3) formatted = `(${cleaned}`;
            else if (cleaned.length <= 6) formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
            else formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
        }
        setEditForm({ ...editForm, [field]: formatted });
    };

    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            
            // UX Trap Fix: Aggressively grab any un-added floating text in the skills input
            let finalSkills = [...editForm.skills];
            if (newSkill.trim() && !finalSkills.includes(newSkill.trim())) {
                finalSkills.push(newSkill.trim());
                setNewSkill('');
            }

            await api.post(`/businesses/${tenantId}/staff/${selectedUser.uid}/metadata`, {
                firstName: editForm.firstName,
                middleName: editForm.middleName,
                lastName: editForm.lastName,
                nickName: editForm.nickName,
                jobTitle: editForm.jobTitle,
                department: editForm.department,
                workPhone: editForm.workPhone,
                mobilePhone: editForm.mobilePhone,
                addressStreet: editForm.addressStreet,
                addressCity: editForm.addressCity,
                addressState: editForm.addressState,
                addressZip: editForm.addressZip,
                photoURL: editForm.photoURL,
                dob: editForm.dob,
                emergencyContactName: editForm.emergencyContactName,
                emergencyContactPhone: editForm.emergencyContactPhone,
                payRate: editForm.payRate,
                payType: editForm.payType,
                startDate: editForm.startDate,
                notes: editForm.notes,
                skills: finalSkills,
                certificates: editForm.certificates,
                customPermissions: editForm.customPermissions,
                role: editForm.role,
                roles: editForm.roles
            });

            toast.success("User profile saved.");
            setInitialEditForm(editForm);
            fetchStaff();
            closeEditUser();
        } catch (err) {
            toast.error("Failed to save user profile.");
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center">Loading Staff List...</div>;
    }

    // ============================================
    // EDIT PANEL VIEW
    // ============================================
    if (selectedUser) {
        return (
            <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
                <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={closeEditUser}
                            className="p-2 border border-zinc-700 bg-zinc-800 rounded-lg hover:bg-zinc-700 hover:text-white text-zinc-400 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="relative w-10 h-10 shrink-0">
                                {editForm.photoURL && (
                                    <img 
                                        key={`header-${editForm.photoURL}`}
                                        src={editForm.photoURL} 
                                        alt="Profile" 
                                        className="w-10 h-10 rounded-full object-cover border border-zinc-700" 
                                        onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                                    />
                                )}
                                <div className={`w-10 h-10 rounded-full bg-zinc-800 items-center justify-center border border-zinc-700 flex ${editForm.photoURL ? 'hidden' : ''}`}>
                                    <Users className="w-5 h-5 text-zinc-500" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white">{selectedUser.firstName || selectedUser.lastName ? [selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(' ') : selectedUser.displayName || 'New User'}</h2>
                                <p className="text-zinc-500 font-mono text-sm">{selectedUser.email}</p>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={handleSaveUser}
                        disabled={isSaving}
                        className="hidden md:flex bg-accent hover:bg-accent-hover text-white font-bold px-6 py-2 rounded-lg items-center gap-2 shadow-lg disabled:opacity-50 transition-all font-mono tracking-widest uppercase text-xs"
                    >
                        <Save className="w-4 h-4" /> {isSaving ? 'Saving' : 'Save'}
                    </button>
                </div>

                <form onSubmit={handleSaveUser} className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-10 pb-24">
                    
                    {/* Legal Naming */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <Users className="w-5 h-5 text-accent" /> Personal Identity
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">First Name</label>
                                <input 
                                    type="text" 
                                    placeholder="Jane"
                                    value={editForm.firstName}
                                    onChange={(e) => setEditForm({...editForm, firstName: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Middle Name</label>
                                <input 
                                    type="text" 
                                    placeholder="R."
                                    value={editForm.middleName}
                                    onChange={(e) => setEditForm({...editForm, middleName: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Last Name</label>
                                <input 
                                    type="text" 
                                    placeholder="Doe"
                                    value={editForm.lastName}
                                    onChange={(e) => setEditForm({...editForm, lastName: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Nickname</label>
                                <input 
                                    type="text" 
                                    placeholder="JD"
                                    value={editForm.nickName}
                                    onChange={(e) => setEditForm({...editForm, nickName: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                />
                            </div>
                        </div>
                    </section>
                    
                    {/* Role & Base Information */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <Briefcase className="w-5 h-5 text-accent" /> Role & Contact
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Assigned Roles</label>
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-wrap gap-2">
                                        {(editForm.roles || []).map((activeRole: string) => (
                                            <div key={activeRole} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold tracking-wider uppercase
                                                ${activeRole === 'business_owner' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                                                'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
                                                {businessRoles[activeRole] ? businessRoles[activeRole]?.label : activeRole.replace('_', ' ')}
                                                
                                                {activeRole !== 'business_owner' && selectedUser.uid !== currentUser?.uid && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            const updated = editForm.roles.filter((r: string) => r !== activeRole);
                                                            setEditForm({...editForm, roles: updated, role: updated.length > 0 ? updated[0] : ''});
                                                        }}
                                                        className="ml-1 text-zinc-500 hover:text-white transition-colors"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <select 
                                            value=""
                                            onChange={(e) => {
                                                const selected = e.target.value;
                                                if (!selected || (editForm.roles || []).includes(selected)) return;
                                                
                                                const updated = [...(editForm.roles || []), selected];
                                                setEditForm({...editForm, roles: updated, role: updated[0]});
                                            }}
                                            disabled={selectedUser.role === 'business_owner' || selectedUser.uid === currentUser?.uid}
                                            className="w-full md:w-auto bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <option value="" disabled>+ Assign Additional Role</option>
                                            {Object.keys(businessRoles || {}).length > 0 && (
                                                <optgroup label="Custom Roles">
                                                    {Object.entries(businessRoles).map(([key, def]: [string, any]) => (
                                                        <option key={key} value={key} disabled={(editForm.roles || []).includes(key)}>{def.label}</option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            <optgroup label="Standard Roles">
                                                <option value="business_owner" disabled>Owner (Unchangeable)</option>
                                            </optgroup>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Job Title</label>
                                <input 
                                    type="text" 
                                    placeholder="Lead Technician"
                                    value={editForm.jobTitle}
                                    onChange={(e) => setEditForm({...editForm, jobTitle: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Department</label>
                                <input 
                                    type="text" 
                                    placeholder="Service Area B"
                                    value={editForm.department}
                                    onChange={(e) => setEditForm({...editForm, department: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Work Phone Ext</label>
                                <input 
                                    type="text" 
                                    placeholder="(555) 123-4567"
                                    value={editForm.workPhone}
                                    onChange={(e) => handlePhoneChange('workPhone', e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Mobile Phone</label>
                                <input 
                                    type="text" 
                                    placeholder="(555) 987-6543"
                                    value={editForm.mobilePhone}
                                    onChange={(e) => handlePhoneChange('mobilePhone', e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3 ml-1">Profile Photo</label>
                                <div className="flex items-center gap-6 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                                    <div 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="relative w-24 h-24 rounded-full bg-zinc-950 border-2 border-dashed border-zinc-700 flex items-center justify-center cursor-pointer group overflow-hidden shrink-0 transition-colors hover:border-accent"
                                    >
                                        {editForm.photoURL && (
                                            <img 
                                                key={`dropzone-${editForm.photoURL}`}
                                                src={editForm.photoURL} 
                                                alt="Profile" 
                                                className="w-full h-full object-cover" 
                                                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                                            />
                                        )}
                                        <div className={`w-full h-full items-center justify-center flex ${editForm.photoURL ? 'hidden' : ''}`}>
                                            <Users className="w-8 h-8 text-zinc-600 group-hover:text-accent transition-colors" />
                                        </div>
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                                            <Camera className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-sm font-bold text-white mb-1">Click image to upload</h4>
                                        <p className="text-xs text-zinc-500 max-w-sm">Accepted formats: JPG, PNG, WEBP. <br/>Recommended size: 256x256px.</p>
                                    </div>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        accept="image/png, image/jpeg, image/webp" 
                                        onChange={handleImageUpload}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Qualifications & Compliance (NEW) */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <Award className="w-5 h-5 text-indigo-400" /> Qualifications & Compliance
                        </h3>

                        <div className="space-y-8">
                            {/* Skills Block */}
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3 ml-1">Trade Skills & Endorsements</label>
                                <div className="flex items-center gap-2 mb-3">
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Master Electrician, CDL Class A, Forklift Certified..."
                                        value={newSkill}
                                        onChange={(e) => setNewSkill(e.target.value)}
                                        onKeyDown={addSkill}
                                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 text-white"
                                    />
                                    <button 
                                        type="button" 
                                        onClick={addSkill}
                                        className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 px-4 py-3 rounded-xl transition-colors font-bold text-sm tracking-wide"
                                    >
                                        Add
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {editForm.skills.map(skill => (
                                        <div key={skill} className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 px-3 py-1.5 rounded-lg text-sm font-bold text-zinc-300">
                                            {skill}
                                            <button type="button" onClick={() => removeSkill(skill)} className="text-zinc-500 hover:text-red-400 transition-colors">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    {editForm.skills.length === 0 && (
                                        <span className="text-zinc-600 text-sm italic py-2">No skills added yet.</span>
                                    )}
                                </div>
                            </div>

                            {/* Certificates Block */}
                            <div>
                                <div className="flex items-center justify-between mb-3 border-t border-zinc-800/50 pt-6">
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Tracked Certificates & Licenses</label>
                                    <button 
                                        type="button" 
                                        onClick={addBlankCert}
                                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                                    >
                                        <PlusCircle className="w-4 h-4" /> Add Certificate
                                    </button>
                                </div>
                                
                                {editForm.certificates.length === 0 ? (
                                    <div className="bg-zinc-900/50 border border-zinc-800 border-dashed rounded-xl p-6 text-center mt-2">
                                        <p className="text-zinc-500 text-sm">No trackable certificates configured.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 mt-2">
                                        {editForm.certificates.map((cert) => (
                                            <div key={cert.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-zinc-900 border border-zinc-700 rounded-xl p-4 items-center relative group">
                                                <div className="md:col-span-4">
                                                    <input 
                                                        type="text" 
                                                        placeholder="Certificate Name (e.g. OSHA 30)"
                                                        value={cert.name}
                                                        onChange={(e) => updateCert(cert.id, 'name', e.target.value)}
                                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 text-white"
                                                    />
                                                </div>
                                                <div className="md:col-span-3">
                                                    <input 
                                                        type="text" 
                                                        placeholder="Credential / License ID"
                                                        value={cert.credentialId}
                                                        onChange={(e) => updateCert(cert.id, 'credentialId', e.target.value)}
                                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 text-white font-mono"
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <div className="relative">
                                                        <span className="absolute -top-2 left-2 bg-zinc-900 px-1 text-[9px] font-black text-zinc-500 uppercase">Issued</span>
                                                        <input 
                                                            type="date" 
                                                            value={cert.issueDate}
                                                            onChange={(e) => updateCert(cert.id, 'issueDate', e.target.value)}
                                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 text-white [color-scheme:dark]"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="md:col-span-2">
                                                    <div className="relative">
                                                        <span className="absolute -top-2 left-2 bg-zinc-900 px-1 text-[9px] font-black text-zinc-500 uppercase">Expires</span>
                                                        <input 
                                                            type="date" 
                                                            value={cert.expirationDate}
                                                            onChange={(e) => updateCert(cert.id, 'expirationDate', e.target.value)}
                                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 text-white [color-scheme:dark]"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="md:col-span-1 flex justify-end">
                                                    <button 
                                                        type="button" 
                                                        onClick={() => removeCert(cert.id)}
                                                        className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Personal & Emergency */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <HeartPulse className="w-5 h-5 text-red-400" /> Personal & Emergency
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Home Address</label>
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                                    <div className="md:col-span-6">
                                        <input 
                                            type="text" 
                                            placeholder="Street Address (e.g. 123 Main St, Apt 4B)"
                                            value={editForm.addressStreet}
                                            onChange={(e) => setEditForm({...editForm, addressStreet: e.target.value})}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-400/50 text-white"
                                        />
                                    </div>
                                    <div className="md:col-span-3">
                                        <input 
                                            type="text" 
                                            placeholder="City"
                                            value={editForm.addressCity}
                                            onChange={(e) => setEditForm({...editForm, addressCity: e.target.value})}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-400/50 text-white"
                                        />
                                    </div>
                                    <div className="md:col-span-1">
                                        <input 
                                            type="text" 
                                            placeholder="State"
                                            maxLength={2}
                                            value={editForm.addressState}
                                            onChange={(e) => setEditForm({...editForm, addressState: e.target.value})}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-400/50 text-white uppercase"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <input 
                                            type="text" 
                                            placeholder="ZIP Code"
                                            maxLength={10}
                                            value={editForm.addressZip}
                                            onChange={(e) => setEditForm({...editForm, addressZip: e.target.value})}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-400/50 text-white"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Date of Birth</label>
                                <input 
                                    type="date" 
                                    value={editForm.dob}
                                    onChange={(e) => setEditForm({...editForm, dob: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-400/50 text-white [color-scheme:dark]"
                                />
                            </div>
                            <div className="hidden md:block"></div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Emergency Contact Name</label>
                                <input 
                                    type="text" 
                                    placeholder="Jane Doe (Wife)"
                                    value={editForm.emergencyContactName}
                                    onChange={(e) => setEditForm({...editForm, emergencyContactName: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-400/50 text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Emergency Contact Phone</label>
                                <input 
                                    type="text" 
                                    placeholder="(555) 987-6543"
                                    value={editForm.emergencyContactPhone}
                                    onChange={(e) => handlePhoneChange('emergencyContactPhone', e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-400/50 text-white"
                                />
                            </div>
                        </div>
                    </section>

                    {/* HR & Compensation */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
                            <DollarSign className="w-5 h-5 text-emerald-400" /> Pay & Employment
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Start Date</label>
                                <input 
                                    type="date" 
                                    value={editForm.startDate}
                                    onChange={(e) => setEditForm({...editForm, startDate: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400/50 text-white [color-scheme:dark]"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Pay Type</label>
                                <select 
                                    value={editForm.payType}
                                    onChange={(e) => setEditForm({...editForm, payType: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400/50 text-white appearance-none cursor-pointer"
                                >
                                    <option value="hourly">Hourly</option>
                                    <option value="salary">Salary</option>
                                    <option value="contractor">Contractor (1099)</option>
                                    <option value="book_time">Book Time (Flat Rate)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">
                                    {editForm.payType === 'salary' ? 'Annual Salary' : editForm.payType === 'contractor' ? '1099 Hourly Rate' : editForm.payType === 'book_time' ? 'Flat Rate Value' : 'Hourly Rate'}
                                </label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
                                    <input 
                                        type="text"
                                        placeholder="25.50"
                                        value={(() => {
                                           if (!editForm.payRate) return '';
                                           const parts = editForm.payRate.split('.');
                                           parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                                           return parts.join('.');
                                        })()}
                                        onChange={(e) => {
                                           let val = e.target.value.replace(/[^0-9.]/g, '');
                                           const parts = val.split('.');
                                           if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                                           setEditForm({...editForm, payRate: val});
                                        }}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-400/50 text-white"
                                    />
                                </div>
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
                            placeholder="Add confidential notes, performance review links, or other HR information here..."
                            value={editForm.notes}
                            onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400/50 text-white resize-none"
                        ></textarea>
                    </section>



                    {selectedUser.uid !== currentUser?.uid && (
                        <section className="mt-12 pt-8 border-t border-zinc-800/50">
                            <h3 className="text-lg font-bold text-amber-500 mb-2 flex items-center gap-2">
                                <Eye className="w-5 h-5" /> Impersonate Workspace Identity
                            </h3>
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h4 className="text-white font-bold text-sm mb-1">View Platform As User</h4>
                                    <p className="text-zinc-400 text-xs text-balance">Assume this user's explicit token identity. You will securely experience the platform identically to this user to test configurations. End the session via the red taskbar.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleImpersonate(selectedUser.uid)}
                                    className="bg-amber-500/10 hover:bg-amber-500 hover:text-black text-amber-500 border border-amber-500/20 font-bold px-6 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap"
                                >
                                    Log In As User
                                </button>
                            </div>
                        </section>
                    )}

                    {selectedUser.role !== 'business_owner' && selectedUser.uid !== currentUser?.uid && (
                        <section className="mt-8">
                            <h3 className="text-lg font-bold text-amber-500 mb-2 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" /> Deactivate Platform Access
                            </h3>
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h4 className="text-white font-bold text-sm mb-1">Deactivate User</h4>
                                    <p className="text-zinc-400 text-xs text-balance">This will instantly revoke their access to the platform and remove them from active rosters, while securely preserving their historical data (like assigned tasks, time logs, and completed jobs) for your records.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleDeactivateUser(selectedUser.uid, selectedUser.email)}
                                    className="bg-amber-500/10 hover:bg-amber-500 hover:text-black text-amber-500 border border-amber-500/20 font-bold px-6 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap"
                                >
                                    Deactivate User
                                </button>
                            </div>
                        </section>
                    )}

                    <div className="pt-8 flex justify-end pb-8">
                        <button 
                            type="submit" 
                            disabled={isSaving}
                            className="w-full md:w-auto bg-accent hover:bg-accent-hover text-white font-bold px-8 py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all font-mono tracking-widest uppercase text-sm"
                        >
                            <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>

                </form>

                <UnsavedChangesBanner 
                    hasChanges={initialEditForm !== null && JSON.stringify(initialEditForm) !== JSON.stringify(editForm)} 
                    onSave={() => handleSaveUser({ preventDefault: () => {} } as any)} 
                    onDiscard={() => setEditForm(initialEditForm!)} 
                    isSaving={isSaving} 
                />
            </div>
        );
    }

    // ============================================
    // LIST VIEW
    // ============================================
    return (
        <div className="flex flex-col h-full bg-zinc-950">
            {/* Quick Add Bar */}
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
                <form onSubmit={handleInvite} className="flex flex-col md:flex-row items-center gap-3">
                    <div className="flex-1 w-full">
                        <input 
                            type="email" 
                            required 
                            placeholder="User Email Address..." 
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent text-white"
                        />
                    </div>
                    <div className="w-full md:w-64 shrink-0">
                        <select 
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent text-white appearance-none cursor-pointer"
                        >
                            {Object.keys(businessRoles || {}).length > 0 && (
                                <optgroup label="Custom Roles">
                                    {Object.entries(businessRoles).map(([key, def]) => (
                                        <option key={key} value={key}>{def.label}</option>
                                    ))}
                                </optgroup>
                            )}
                            <optgroup label="Standard Roles">
                                <option value="" disabled>Unassigned (No Roles)</option>
                            </optgroup>
                        </select>
                    </div>
                    <button 
                        type="submit" 
                        disabled={isInviting}
                        className="w-full md:w-auto bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors shrink-0"
                    >
                        <Plus className="w-4 h-4" /> Add User
                    </button>
                </form>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-zinc-900/50 border-b border-zinc-800 text-xs font-black text-zinc-500 uppercase tracking-widest shrink-0">
                <div className="col-span-6 md:col-span-4">Name / Email</div>
                <div className="col-span-6 md:col-span-3">Role</div>
                <div className="hidden md:block col-span-3">Status</div>
                <div className="hidden md:block col-span-2 text-right">Actions</div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto">
                {staff.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <Users className="w-12 h-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-1">No Staff Found</h3>
                        <p className="text-zinc-500 text-sm">There are no users in this workspace.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800/50">
                        {staff.map((user) => (
                            <div 
                                key={user.uid} 
                                onClick={() => openEditUser(user)}
                                className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-zinc-900/30 transition-colors group cursor-pointer"
                            >
                                <div className="col-span-6 md:col-span-4 flex flex-col">
                                    <div className="flex items-center gap-3">
                                        {/* Avatar */}
                                        <div className="relative w-8 h-8 shrink-0 hidden md:block">
                                            {user.photoURL && (
                                                <img 
                                                    key={`list-${user.photoURL}`}
                                                    src={user.photoURL} 
                                                    alt="Profile" 
                                                    className="w-8 h-8 rounded-full object-cover" 
                                                    onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                                                />
                                            )}
                                            <div className={`w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 items-center justify-center flex ${user.photoURL ? 'hidden' : ''}`}>
                                                <Users className="w-4 h-4 text-zinc-500" />
                                            </div>
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm text-zinc-200 group-hover:text-white transition-colors">{user.firstName || user.lastName ? [user.firstName, user.lastName].filter(Boolean).join(' ') : user.displayName || 'New User'}</span>
                                                {user.jobTitle && <span className="text-[10px] font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded leading-none hidden md:inline-block">{user.jobTitle}</span>}
                                            </div>
                                            <span className="text-xs text-zinc-500 font-mono truncate">{user.email}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-span-6 md:col-span-3 flex items-center justify-end md:justify-start gap-2" onClick={(e) => e.stopPropagation()}>
                                    <span className="text-[10px] sm:text-xs font-black uppercase text-zinc-400 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded truncate">
                                        {user.role === 'business_owner' ? 'OWNER' : user.role === 'department_lead' ? 'DEPT LEAD' : businessRoles[user.role]?.label || user.role.replace('_', ' ')}
                                    </span>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); openEditUser(user); }}
                                        className="md:hidden p-1.5 text-zinc-500 bg-zinc-900 border border-zinc-800 hover:text-accent hover:border-accent/50 rounded transition-colors shrink-0 flex items-center gap-1"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="hidden md:flex col-span-3 items-center gap-1.5">
                                    <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase px-2 py-1 rounded">
                                        <CheckCircle2 className="w-3 h-3" /> Active
                                    </span>
                                </div>
                                <div className="hidden md:flex col-span-2 items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); openEditUser(user); }}
                                        title="Edit User"
                                        className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
