import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Phone, MapPin, ShieldCheck, LogOut, Check, X, Key, Building, Camera, Bell, Clock, Plus, Trash2, Volume2 } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { usePushNotifications } from '../hooks/usePushNotifications';
import type { CustomReminder } from '../components/GlobalRemindersTracker';

const formatPhoneNumber = (value: string) => {
    if (!value) return value;
    const phoneNumber = value.replace(/[^\d]/g, '');
    const phoneNumberLength = phoneNumber.length;
    
    if (phoneNumberLength < 4) return phoneNumber;
    if (phoneNumberLength < 7) {
        return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    }
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
};

export function UserProfile() {
    const { currentUser, role, tenantId, logout } = useAuth();
    const navigate = useNavigate();

    const [isEditing, setIsEditing] = useState(false);
    const [phone, setPhone] = useState('');
    const [addressStreet, setAddressStreet] = useState('');
    const [addressCity, setAddressCity] = useState('');
    const [addressState, setAddressState] = useState('');
    const [addressZip, setAddressZip] = useState('');
    const [firstName, setFirstName] = useState('');
    const [middleName, setMiddleName] = useState('');
    const [lastName, setLastName] = useState('');
    const [nickName, setNickName] = useState('');
    const [emergencyContactName, setEmergencyContactName] = useState('');
    const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [department, setDepartment] = useState('');
    const [bio, setBio] = useState('');
    const [keepScreenAwake, setKeepScreenAwake] = useState(false);
    const [companyCamToken, setCompanyCamToken] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [businessName, setBusinessName] = useState('Loading...');
    const [deviceSetup, setDeviceSetup] = useState<any>(null);
    const [customReminders, setCustomReminders] = useState<CustomReminder[]>([]);
    const [newReminderRepeat, setNewReminderRepeat] = useState('daily');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { permissionStatus, requestPermissionAndSaveToken, isSubscribing } = usePushNotifications();

    const handleManualInstall = async () => {
        const dp = (window as any).deferredPrompt;
        if (dp) {
            dp.prompt();
            const { outcome } = await dp.userChoice;
            if (outcome === 'accepted') {
                (window as any).deferredPrompt = null;
                toast.success("Installation successful!");
            }
        } else {
            toast.error("Install via your browser menu (Share -> Add to Home Screen on iOS, or Install on Desktop)");
        }
    };

    const handleCompanyCamConnect = async () => {
        try {
            const redirectUri = window.location.origin + '/oauth/companycam';
            // User-level authentication isolated by active tenant workspace
            const res = await api.get(`/companycam/oauth/url?redirectUri=${encodeURIComponent(redirectUri)}&tenantId=${tenantId}`);
            if (res.data?.url) {
                window.open(res.data.url, '_blank', 'width=600,height=700,left=200,top=100');
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to generate CompanyCam authorization URL.");
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser) return;
        
        try {
            const toastId = toast.loading('Transmitting media payload to Cloud Storage...', { id: 'avatar_upload' });
            const storage = getStorage();
            const storageRef = ref(storage, `users/${currentUser.uid}/avatar`);
            
            await uploadBytes(storageRef, file, { contentType: file.type });
            const url = await getDownloadURL(storageRef);
            
            const cacheBustedUrl = `${url}&t=${Date.now()}`;
            
            await updateProfile(currentUser, { photoURL: cacheBustedUrl });
            await setDoc(doc(db, 'users', currentUser.uid), { photoURL: cacheBustedUrl }, { merge: true });
            
            toast.success('Identity visual signature successfully synchronized.', { id: toastId });
            window.location.reload(); 
        } catch (err: any) {
            console.error("Avatar upload failed", err);
            toast.error('Failed to securely process media payload.', { id: 'avatar_upload' });
        }
    };

    useEffect(() => {
        const fetchUserData = async () => {
            if (!currentUser) return;
            try {
                const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    if (data.phone) setPhone(data.phone);
                    if (data.addressStreet) setAddressStreet(data.addressStreet);
                    if (data.addressCity) setAddressCity(data.addressCity);
                    if (data.addressState) setAddressState(data.addressState);
                    if (data.addressZip) setAddressZip(data.addressZip);
                    // Legacy fallback mapping
                    if (!data.addressStreet && data.address) setAddressStreet(data.address);
                    if (data.firstName) setFirstName(data.firstName);
                    if (data.middleName) setMiddleName(data.middleName);
                    if (data.lastName) setLastName(data.lastName);
                    if (data.nickName) setNickName(data.nickName);
                    if (data.emergencyContactName) setEmergencyContactName(data.emergencyContactName);
                    if (data.emergencyContactPhone) setEmergencyContactPhone(data.emergencyContactPhone);
                    if (data.jobTitle) setJobTitle(data.jobTitle);
                    if (data.department) setDepartment(data.department);
                    if (data.bio) setBio(data.bio);
                    if (data.keepScreenAwake !== undefined) setKeepScreenAwake(data.keepScreenAwake);
                    if (data.deviceSetup) setDeviceSetup(data.deviceSetup);

                    
                    if (tenantId && data.companyCamAuth?.[tenantId]?.token) {
                        setCompanyCamToken(data.companyCamAuth[tenantId].token);
                    } else if (data.companyCamToken) {
                        // Legacy fallback during transition
                        setCompanyCamToken(data.companyCamToken);
                    }
                }
            } catch (err) {
                console.error("Failed to load user document", err);
            }
        };
        fetchUserData();
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) return;
        const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (docSn) => {
            if (docSn.exists()) {
                const data = docSn.data();
                if (data.customReminders && Array.isArray(data.customReminders)) {
                    setCustomReminders(data.customReminders as CustomReminder[]);
                } else {
                    setCustomReminders([]);
                }
            }
        });
        return () => unsubscribe();
    }, [currentUser]);

    useEffect(() => {
        if (!tenantId) {
            setBusinessName('Unassigned Identity');
            return;
        }
        if (tenantId === 'GLOBAL') {
            setBusinessName('Global Platform');
            return;
        }
        if (tenantId === 'unassigned') {
            setBusinessName('Unassigned Identity');
            return;
        }
        
        api.get(`/businesses/${tenantId}`)
           .then(res => {
               if (res.data?.name) {
                   setBusinessName(res.data.name);
               } else {
                   setBusinessName(`Tenant: ${tenantId}`);
               }
           })
           .catch(() => setBusinessName(`Tenant: ${tenantId}`));
    }, [tenantId]);

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatPhoneNumber(e.target.value);
        setPhone(formatted);
    };

    const handleSaveProfile = async () => {
        if (!currentUser) return;
        setIsSaving(true);
        try {
            // Dynamically reconstruct the display name
            const newDisplayName = `${firstName} ${lastName}`.trim() || nickName || phone || 'User';
            
            await updateProfile(currentUser, {
                displayName: newDisplayName
            });
            await setDoc(doc(db, 'users', currentUser.uid), {
                firstName: firstName,
                middleName: middleName,
                lastName: lastName,
                nickName: nickName,
                phone: phone,
                addressStreet: addressStreet,
                addressCity: addressCity,
                addressState: addressState,
                addressZip: addressZip,
                emergencyContactName: emergencyContactName,
                emergencyContactPhone: emergencyContactPhone,
                bio: bio,
                keepScreenAwake: keepScreenAwake,
                customReminders: customReminders,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            toast.success("Profile saved successfully.");
            setTimeout(() => {
                // Force a browser reload to explicitly trigger Firebase AuthContext re-evaluation
                window.location.reload();
            }, 1200);
        } catch (error) {
            console.error("Failed to update profile", error);
            toast.error("Failed to securely save profile configuration.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error("Failed to log out", error);
        }
    };

    // Dynamic Role Determination
    const displayRole = role === 'system_owner' ? 'System Owner' : role === 'super_admin' ? 'Super Admin' 
                      : role === 'business_owner' ? 'Business Owner' 
                      : role === 'manager' ? 'Manager' 
                      : 'Staff Member';

    const displayFullName = `${firstName} ${lastName}`.trim() || nickName || currentUser?.displayName || 'Authorized User';

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header Banner */}
                <div className="relative w-full h-40 md:h-56 rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900 group">
                    <div className="absolute inset-0 bg-gradient-to-r from-accent/20 to-zinc-900 z-0"></div>
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-zinc-950 to-transparent z-10"></div>

                    <div className="absolute bottom-6 left-6 md:left-10 z-20 flex flex-col md:flex-row items-end gap-6">
                        <div className="relative">
                            <div className="w-24 h-24 md:w-32 md:h-32 rounded-xl bg-zinc-900 border-4 border-zinc-950 shadow-2xl flex items-center justify-center text-4xl text-accent font-black overflow-hidden relative">
                                {currentUser?.photoURL ? (
                                    <img src={currentUser.photoURL} alt="Profile" className="w-full h-full object-cover" />
                                ) : displayFullName !== 'Authorized User' ? (
                                    displayFullName[0].toUpperCase()
                                ) : (
                                    <User className="w-12 h-12 text-zinc-600" />
                                )}
                            </div>
                            <div className="absolute -top-1 -right-1 w-6 h-6 bg-accent rounded-full border-2 border-zinc-900 flex items-center justify-center pointer-events-none shadow-lg">
                                <ShieldCheck className="w-3.5 h-3.5 text-white" />
                            </div>
                        </div>
                        <div className="mb-2">
                            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">{displayFullName}</h1>
                            <div className="flex flex-wrap items-center gap-3 mt-2">
                                <span className={`px-3 py-1 font-bold text-sm rounded-full border ${displayRole === 'Super Admin' ? 'bg-purple-500/20 text-purple-400 border-purple-500/20' : 'bg-accent/20 text-accent border-accent/20'}`}>
                                    {displayRole}
                                </span>
                                <span className="text-zinc-400 font-mono text-xs flex items-center gap-1">
                                    <Building className="w-3.5 h-3.5" /> {businessName}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Settings Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* Left Column (Quick Actions & Security) */}
                    <div className="space-y-6">
                        {/* System Status Block */}
                        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 backdrop-blur-sm">
                            <h2 className="text-sm font-bold text-zinc-400 mb-4 flex items-center gap-2 uppercase tracking-wider">
                                Account Access
                            </h2>
                            <div className="space-y-3">
                                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center gap-3">
                                    <div className="p-2 bg-zinc-900 rounded-lg text-zinc-400">
                                        <Key className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-white">Password</p>
                                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Last changed 30 days ago</p>
                                    </div>
                                    <button className="text-xs font-bold text-accent hover:text-white transition-colors">Update</button>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex justify-center items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 text-xs font-bold py-3 rounded-xl transition-colors"
                                >
                                    <LogOut className="w-4 h-4" /> Securely Log Out
                                </button>
                            </div>
                        </div>

                        {/* Local Preferences */}
                        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 backdrop-blur-sm">
                            <h2 className="text-sm font-bold text-zinc-400 mb-4 flex items-center gap-2 uppercase tracking-wider">
                                App Preferences
                            </h2>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-white">Keep Screen Awake</p>
                                        <p className="text-[10px] text-zinc-500">Prevent your device from sleeping while using this app.</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={keepScreenAwake}
                                            onChange={async (e) => {
                                                const newValue = e.target.checked;
                                                setKeepScreenAwake(newValue);
                                                if (currentUser) {
                                                    try {
                                                        await setDoc(doc(db, 'users', currentUser.uid), {
                                                            keepScreenAwake: newValue,
                                                            updatedAt: new Date().toISOString()
                                                        }, { merge: true });
                                                        toast.success(newValue ? "Screen will stay awake." : "Screen timeout restored.");
                                                    } catch (err) {
                                                        toast.error("Failed to save preference.");
                                                    }
                                                }
                                            }}
                                        />
                                        <div className={`w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent`}></div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Middle Column (Profile Configuration) */}
                    <div className="md:col-span-2 space-y-6">
                        
                        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <User className="w-5 h-5 text-accent" /> Profile Information
                                </h2>
                                {!isEditing && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="text-xs font-bold text-accent hover:text-white transition-colors"
                                    >
                                        Edit Details
                                    </button>
                                )}
                            </div>
                            
                            {/* Hidden File Input for Avatar */}
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/png, image/jpeg, image/webp" 
                                onChange={handleImageUpload}
                            />

                            <div className="space-y-6">
                                {isEditing && (
                                    <div className="flex items-center gap-4 p-4 bg-zinc-950/50 border border-zinc-800/50 rounded-xl mb-6">
                                        <div className="w-16 h-16 rounded-xl bg-zinc-900 border-2 border-zinc-800 shadow-xl flex items-center justify-center text-xl text-accent font-black overflow-hidden">
                                            {currentUser?.photoURL ? (
                                                <img src={currentUser?.photoURL} alt="Profile" className="w-full h-full object-cover" />
                                            ) : displayFullName !== 'Authorized User' ? (
                                                displayFullName[0].toUpperCase()
                                            ) : (
                                                <User className="w-8 h-8 text-zinc-600" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1">Profile Photo</label>
                                            <p className="text-xs text-zinc-400 mb-2">Upload a professional headshot for your company identity.</p>
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors flex items-center gap-2 border border-zinc-700 hover:border-zinc-600"
                                            >
                                                <Camera className="w-3.5 h-3.5" /> Upload New Photo
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="sm:col-span-2">
                                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2 ml-1 flex items-center gap-2">
                                            <ShieldCheck className="w-3.5 h-3.5" /> Legal Identity
                                        </label>
                                        <div className="w-full bg-zinc-950/30 border border-zinc-800/30 rounded-xl p-4 cursor-not-allowed">
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div>
                                                    <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block mb-1">First Name</label>
                                                    {isEditing ? (
                                                        <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" placeholder="Jane" />
                                                    ) : (
                                                        <div className="text-sm text-zinc-300 font-medium">{firstName || '-'}</div>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block mb-1">Middle Name</label>
                                                    {isEditing ? (
                                                        <input type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" placeholder="A." />
                                                    ) : (
                                                        <div className="text-sm text-zinc-300 font-medium">{middleName || '-'}</div>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block mb-1">Last Name</label>
                                                    {isEditing ? (
                                                        <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" placeholder="Doe" />
                                                    ) : (
                                                        <div className="text-sm text-zinc-300 font-medium">{lastName || '-'}</div>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block mb-1">Nickname</label>
                                                    {isEditing ? (
                                                        <input type="text" value={nickName} onChange={(e) => setNickName(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" placeholder="JD" />
                                                    ) : (
                                                        <div className="text-sm text-accent font-medium">{nickName || '-'}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5 ml-1">Account Email</label>
                                        <div className="w-full bg-zinc-950/30 border border-zinc-800/30 rounded-xl px-4 py-2.5 text-sm text-zinc-500 cursor-not-allowed flex items-center gap-2">
                                            <Mail className="w-4 h-4 opacity-50" /> {currentUser?.email}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5 ml-1">Phone Number</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={phone}
                                                onChange={handlePhoneChange}
                                                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                                                placeholder="(555) 000-0000"
                                                maxLength={14}
                                            />
                                        ) : (
                                            <div className="w-full bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 flex items-center gap-2">
                                                <Phone className="w-4 h-4 text-zinc-500" /> {phone || 'Not provided'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5 ml-1">Home Address</label>
                                        {isEditing ? (
                                            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                                                <div className="md:col-span-6">
                                                    <input type="text" value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent" placeholder="Street Address (e.g. 123 Main St, Apt 4B)" />
                                                </div>
                                                <div className="md:col-span-3">
                                                    <input type="text" value={addressCity} onChange={(e) => setAddressCity(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent" placeholder="City" />
                                                </div>
                                                <div className="md:col-span-1">
                                                    <input type="text" value={addressState} onChange={(e) => setAddressState(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent" placeholder="State" maxLength={2} />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <input type="text" value={addressZip} onChange={(e) => setAddressZip(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent" placeholder="ZIP Code" maxLength={10} />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-full bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 flex items-center gap-2">
                                                <MapPin className="w-4 h-4 text-zinc-500" /> 
                                                {addressStreet || addressCity || addressState || addressZip 
                                                    ? `${addressStreet ? addressStreet + ',' : ''} ${addressCity} ${addressState} ${addressZip}`.trim()
                                                    : 'Not provided'}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5 ml-1">Emergency Contact Name</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={emergencyContactName}
                                                onChange={(e) => setEmergencyContactName(e.target.value)}
                                                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                                                placeholder="Jane Doe (Wife)"
                                            />
                                        ) : (
                                            <div className="w-full bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200">
                                                {emergencyContactName || 'Not provided'}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5 ml-1">Emergency Contact Phone</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={emergencyContactPhone}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setEmergencyContactPhone(formatPhoneNumber(val));
                                                }}
                                                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                                                placeholder="(555) 987-6543"
                                                maxLength={14}
                                            />
                                        ) : (
                                            <div className="w-full bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200">
                                                {emergencyContactPhone || 'Not provided'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-6 pt-2">
                                    <div>
                                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5 ml-1">Timezone</label>
                                        <div className="w-full bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-zinc-500" /> America/Chicago (CST)
                                        </div>
                                    </div>
                                </div>

                                {/* Business Identity Details (Governed By Managers) */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                                    <div>
                                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5 ml-1">Job Title</label>
                                        <div className="w-full bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200">
                                            {jobTitle || 'Not Provisioned by Manager'}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5 ml-1">Department</label>
                                        <div className="w-full bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200">
                                            {department || 'Not Provisioned by Manager'}
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5 ml-1">Professional Bio</label>
                                    {isEditing ? (
                                        <textarea
                                            value={bio}
                                            onChange={(e) => setBio(e.target.value)}
                                            rows={3}
                                            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-none"
                                            placeholder="Write a short biography..."
                                        />
                                    ) : (
                                        <div className="w-full bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-4 py-3 text-sm text-zinc-200 italic">
                                            {bio ? `"${bio}"` : 'No biography provided.'}
                                        </div>
                                    )}
                                </div>

                                {/* Device Configuration */}
                                <div className="pt-6 mt-4 border-t border-zinc-800/50">
                                    <h3 className="text-xs font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-2">
                                        <Bell className="w-4 h-4 text-blue-400"/> Device & Platform Setup
                                    </h3>
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
                                        {/* PWA Install */}
                                        <div className="flex items-center justify-between">
                                            <div className="pr-4">
                                                <h4 className="font-bold text-white">Application Installation</h4>
                                                <p className="text-xs text-zinc-500">Run UpfittersOS natively on your Mobile or Desktop device</p>
                                            </div>
                                            {deviceSetup?.pwaInstalled ? (
                                                <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shrink-0"><Check className="w-3 h-3"/> Installed</span>
                                            ) : (
                                                <button 
                                                    type="button"
                                                    onClick={handleManualInstall}
                                                    className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                                                >
                                                    Install App
                                                </button>
                                            )}
                                        </div>

                                        <div className="w-full h-px bg-zinc-800/50 my-1"></div>

                                        {/* Notifications */}
                                        <div className="flex items-center justify-between">
                                            <div className="pr-4">
                                                <h4 className="font-bold text-white">Push Notifications</h4>
                                                <p className="text-xs text-zinc-500">Enable real-time messaging and operational alerts natively</p>
                                            </div>
                                            {permissionStatus === 'granted' ? (
                                                <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shrink-0"><Check className="w-3 h-3"/> Active</span>
                                            ) : (
                                                <button 
                                                    type="button"
                                                    onClick={requestPermissionAndSaveToken}
                                                    disabled={isSubscribing}
                                                    className="shrink-0 bg-amber-500 hover:bg-amber-400 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                                                >
                                                    {isSubscribing ? 'Connecting...' : 'Enable Push'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Custom Reminders */}
                                <div className="pt-6 mt-4 border-t border-zinc-800/50">
                                    <h3 className="text-xs font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-purple-400"/> Custom Reminders & Alarms
                                    </h3>
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
                                        {customReminders.length === 0 ? (
                                            <p className="text-xs text-zinc-500 italic">No custom reminders set.</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {customReminders.map(r => (
                                                    <div key={r.id} className="flex items-center justify-between bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-bold text-white">{r.time}</span>
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>{r.enabled ? 'ON' : 'OFF'}</span>
                                                                {(r.days || r.monthDay) && (
                                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                                        {r.monthDay ? `Monthly on ${r.monthDay}` : r.days?.includes('0') && r.days?.includes('6') ? 'Weekends' : r.days?.length === 4 ? 'Mon-Thu' : r.days?.length === 5 ? 'Weekdays' : 'Custom Days'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5">
                                                                {r.message}
                                                                {r.sound && <span title="Plays Sound"><Bell className="w-3 h-3 text-zinc-500 inline-block ml-1" /></span>}
                                                                {r.speak && <span title="Speaks Aloud"><Volume2 className="w-3 h-3 text-zinc-500 inline-block" /></span>}
                                                            </div>
                                                        </div>
                                                        {/* Always show delete actions */}
                                                        <button 
                                                            onClick={async () => {
                                                                const newRems = customReminders.filter(x => x.id !== r.id);
                                                                setCustomReminders(newRems);
                                                                if (currentUser) {
                                                                    await setDoc(doc(db, 'users', currentUser.uid), { customReminders: newRems }, { merge: true });
                                                                    toast.success('Reminder deleted');
                                                                }
                                                            }}
                                                            className="p-1.5 text-zinc-500 hover:text-red-400 bg-zinc-900 hover:bg-zinc-800 rounded-md transition-colors"
                                                            title="Delete Reminder"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* Always show add ability */}
                                        <div className="pt-3 border-t border-zinc-800/50 mt-1">
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-end gap-3 w-full">
                                                    <div className="w-24 shrink-0">
                                                        <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block mb-1">Time</label>
                                                        <input 
                                                            type="time" 
                                                            id="newReminderTime"
                                                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent" 
                                                        />
                                                    </div>
                                                    <div className="w-32 shrink-0">
                                                        <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block mb-1">Repeat</label>
                                                        <select 
                                                            value={newReminderRepeat}
                                                            onChange={(e) => setNewReminderRepeat(e.target.value)}
                                                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                                                        >
                                                            <option value="daily">Daily</option>
                                                            <option value="weekdays">Weekdays (M-F)</option>
                                                            <option value="mon-thu">Mon-Thu</option>
                                                            <option value="weekends">Weekends</option>
                                                            <option value="monthly">Monthly (Day)</option>
                                                        </select>
                                                    </div>
                                                    {newReminderRepeat === 'monthly' && (
                                                        <div className="w-16 shrink-0">
                                                            <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block mb-1">Day</label>
                                                            <input 
                                                                type="number" 
                                                                id="newReminderMonthDay"
                                                                min="1" max="31" placeholder="15"
                                                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent" 
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="flex-[2] min-w-0">
                                                        <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block mb-1">Message</label>
                                                        <input 
                                                            type="text" 
                                                            id="newReminderMsg"
                                                            placeholder="Take a break..."
                                                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" 
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            const timeEl = document.getElementById('newReminderTime') as HTMLInputElement;
                                                            const msgEl = document.getElementById('newReminderMsg') as HTMLInputElement;
                                                            const soundEl = document.getElementById('newReminderSound') as HTMLInputElement;
                                                            const speakEl = document.getElementById('newReminderSpeak') as HTMLInputElement;

                                                            if (timeEl.value && msgEl.value) {
                                                                let days: string[] | undefined = undefined;
                                                                let monthDay: number | undefined = undefined;
                                                                
                                                                if (newReminderRepeat === 'weekdays') days = ['1', '2', '3', '4', '5'];
                                                                else if (newReminderRepeat === 'mon-thu') days = ['1', '2', '3', '4'];
                                                                else if (newReminderRepeat === 'weekends') days = ['0', '6'];
                                                                else if (newReminderRepeat === 'monthly') {
                                                                    const dayEl = document.getElementById('newReminderMonthDay') as HTMLInputElement;
                                                                    if (dayEl && dayEl.value) {
                                                                        monthDay = parseInt(dayEl.value, 10);
                                                                    } else {
                                                                        toast.error("Please enter a day of the month");
                                                                        return;
                                                                    }
                                                                }

                                                                const newReminder: CustomReminder = {
                                                                    id: Math.random().toString(36).substr(2, 9),
                                                                    time: timeEl.value,
                                                                    message: msgEl.value,
                                                                    enabled: true,
                                                                    sound: soundEl?.checked || false,
                                                                    speak: speakEl?.checked || false,
                                                                    days,
                                                                    monthDay
                                                                };
                                                                const newRems = [...customReminders, newReminder];
                                                                setCustomReminders(newRems);
                                                                
                                                                timeEl.value = '';
                                                                msgEl.value = '';
                                                                if (newReminderRepeat === 'monthly') {
                                                                    const dayEl = document.getElementById('newReminderMonthDay') as HTMLInputElement;
                                                                    if (dayEl) dayEl.value = '';
                                                                }
                                                                setNewReminderRepeat('daily');
                                                                if (soundEl) soundEl.checked = false;
                                                                if (speakEl) speakEl.checked = false;
                                                                
                                                                if (currentUser) {
                                                                    await setDoc(doc(db, 'users', currentUser.uid), { customReminders: newRems }, { merge: true });
                                                                    toast.success('Reminder added');
                                                                }
                                                            } else {
                                                                toast.error("Time and Message are required");
                                                            }
                                                        }}
                                                        className="shrink-0 bg-zinc-800 hover:bg-zinc-700 text-white font-bold p-2.5 rounded-lg transition-colors mb-[1px]"
                                                        title="Add Reminder"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-4 px-1">
                                                    <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                                                        <input type="checkbox" id="newReminderSound" className="rounded border-zinc-700 bg-zinc-900 text-accent focus:ring-accent" />
                                                        Play Alert Noise
                                                    </label>
                                                    <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                                                        <input type="checkbox" id="newReminderSpeak" className="rounded border-zinc-700 bg-zinc-900 text-accent focus:ring-accent" />
                                                        Speak Aloud
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Personal Integrations */}
                                <div className="pt-6 mt-4 border-t border-zinc-800/50">
                                    <h3 className="text-xs font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-2">
                                        <Camera className="w-4 h-4 text-orange-400"/> Personal Apps & Integrations
                                    </h3>
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="font-bold text-white">CompanyCam</h4>
                                                <p className="text-xs text-zinc-500">Sync projects and photos as yourself</p>
                                            </div>
                                            {companyCamToken ? (
                                                <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1"><Check className="w-3 h-3"/> Connected</span>
                                            ) : (
                                                <span className="bg-zinc-800 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full">Not Connected</span>
                                            )}
                                        </div>
                                        
                                        {!companyCamToken && (
                                            <button 
                                                type="button"
                                                onClick={handleCompanyCamConnect}
                                                className="w-auto ml-auto bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                                            >
                                                Connect Account
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {isEditing && (
                                <div className="mt-8 flex gap-3 pt-6 border-t border-zinc-800/50">
                                    <button
                                        onClick={handleSaveProfile}
                                        disabled={isSaving}
                                        className="flex-[2] flex justify-center items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50"
                                    >
                                        {isSaving ? 'Saving...' : <><Check className="w-4 h-4" /> Save Changes</>}
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(false)}
                                        className="flex-1 flex justify-center items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
                                    >
                                        <X className="w-4 h-4" /> Cancel
                                    </button>
                                </div>
                            )}
                        </div>



                    </div>
                </div>

            </div>
        </div>
    );
}
