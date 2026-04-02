import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Phone, MapPin, ShieldCheck, LogOut, Check, X, Key, Building, Camera } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';

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
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
                }
            } catch (err) {
                console.error("Failed to load user document", err);
            }
        };
        fetchUserData();
    }, [currentUser]);

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
    const displayRole = role === 'super_admin' ? 'Super Admin' 
                      : role === 'business_owner' ? 'Business Owner' 
                      : role === 'manager' ? 'Manager' 
                      : 'Staff Member';

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
                                ) : currentUser?.displayName ? (
                                    currentUser.displayName[0].toUpperCase()
                                ) : (
                                    <User className="w-12 h-12 text-zinc-600" />
                                )}
                            </div>
                            <div className="absolute -top-1 -right-1 w-6 h-6 bg-accent rounded-full border-2 border-zinc-900 flex items-center justify-center pointer-events-none shadow-lg">
                                <ShieldCheck className="w-3.5 h-3.5 text-white" />
                            </div>
                        </div>
                        <div className="mb-2">
                            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">{currentUser?.displayName || 'Authorized User'}</h1>
                            <div className="flex flex-wrap items-center gap-3 mt-2">
                                <span className={`px-3 py-1 font-bold text-sm rounded-full border ${displayRole === 'Super Admin' ? 'bg-purple-500/20 text-purple-400 border-purple-500/20' : 'bg-accent/20 text-accent border-accent/20'}`}>
                                    {displayRole}
                                </span>
                                <span className="text-zinc-400 font-mono text-xs flex items-center gap-1">
                                    <Building className="w-3.5 h-3.5" /> Tenant: {tenantId === 'GLOBAL' ? 'Global Platform' : tenantId || 'Unassigned'}
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
                                            ) : currentUser?.displayName ? (
                                                currentUser.displayName[0].toUpperCase()
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
