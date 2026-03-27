import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Phone, MapPin, Calendar, Clock, DollarSign, FileText, Download, Briefcase, Award, AlertCircle, TrendingUp, ShieldCheck, LogOut, Check, X } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

export function UserProfile() {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();

    const [isEditing, setIsEditing] = useState(false);
    const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
    const [phone, setPhone] = useState('+1 (555) 019-3921');
    const [address, setAddress] = useState('1234 Pursuit Dr, Unit B\nSpringfield, IL 62701');
    const [isSaving, setIsSaving] = useState(false);

    const handleSaveProfile = async () => {
        if (!currentUser) return;
        setIsSaving(true);
        try {
            await updateProfile(currentUser, {
                displayName: displayName
            });
            setIsEditing(false);
        } catch (error) {
            console.error("Failed to update profile", error);
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

    // Mock Data for the Profile (would come from Firestore later)
    const hireDate = "Oct 12, 2024";
    const role = currentUser?.email?.toLowerCase().includes('p.losey') ? "Upfitter" : "Lead Pursuit Technician";
    const employeeId = "SAE-4092";

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header Banner */}
                <div className="relative w-full h-48 md:h-64 rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900 group">
                    <div className="absolute inset-0 bg-gradient-to-r from-accent/20 to-zinc-900 z-0"></div>
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-zinc-950 to-transparent z-10"></div>

                    {/* Abstract tech background graphic */}
                    <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>

                    <div className="absolute bottom-6 left-6 md:left-10 z-20 flex flex-col md:flex-row items-end gap-6">
                        <div className="w-24 h-24 md:w-32 md:h-32 rounded-xl bg-zinc-900 border-4 border-zinc-950 shadow-2xl flex items-center justify-center text-4xl text-accent font-black overflow-hidden relative">
                            {currentUser?.displayName ? currentUser.displayName[0].toUpperCase() : 'U'}
                            {/* Verified Badge */}
                            <div className="absolute -top-1 -right-1 w-6 h-6 bg-accent rounded-full border-2 border-zinc-900 flex items-center justify-center">
                                <ShieldCheck className="w-3.5 h-3.5 text-white" />
                            </div>
                        </div>
                        <div className="mb-2">
                            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">{currentUser?.displayName || 'Authorized User'}</h1>
                            <div className="flex flex-wrap items-center gap-3 mt-2">
                                <span className="px-3 py-1 bg-accent/20 text-accent font-bold text-sm rounded-full border border-accent/20">{role}</span>
                                <span className="text-zinc-400 font-mono text-xs flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> ID: {employeeId}</span>
                                <span className="text-zinc-500 font-mono text-xs flex items-center gap-1 border-l border-zinc-700 pl-3"><Calendar className="w-3.5 h-3.5" /> Hired: {hireDate}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Dashboard Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* Left Column (HR & Contact) */}
                    <div className="space-y-6">
                        {/* Personal Contact Info */}
                        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 backdrop-blur-sm">
                            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <User className="w-5 h-5 text-accent" /> Personal File
                            </h2>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <User className="w-4 h-4 text-zinc-500 mt-1" />
                                    <div className="w-full">
                                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Full Name</p>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={displayName}
                                                onChange={(e) => setDisplayName(e.target.value)}
                                                className="mt-1 block w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                                placeholder="Enter full name"
                                            />
                                        ) : (
                                            <p className="text-sm font-medium text-zinc-200">{currentUser?.displayName || 'Not Set'}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Mail className="w-4 h-4 text-zinc-500 mt-1" />
                                    <div>
                                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Email (Work)</p>
                                        <p className="text-sm font-medium text-zinc-200">{currentUser?.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Phone className="w-4 h-4 text-zinc-500 mt-1" />
                                    <div className="w-full">
                                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Phone (Mobile)</p>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                className="mt-1 block w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                        ) : (
                                            <p className="text-sm font-medium text-zinc-200">{phone}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <MapPin className="w-4 h-4 text-zinc-500 mt-1" />
                                    <div className="w-full">
                                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Address</p>
                                        {isEditing ? (
                                            <textarea
                                                value={address}
                                                onChange={(e) => setAddress(e.target.value)}
                                                className="mt-1 block w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                                rows={2}
                                            />
                                        ) : (
                                            <p className="text-sm font-medium text-zinc-200 whitespace-pre-wrap">{address}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {isEditing ? (
                                <div className="mt-5 flex gap-2">
                                    <button
                                        onClick={() => setIsEditing(false)}
                                        className="flex-1 flex justify-center items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold py-2 rounded-lg transition-colors"
                                    >
                                        <X className="w-4 h-4" /> Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveProfile}
                                        disabled={isSaving}
                                        className="flex-1 flex justify-center items-center gap-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold py-2 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {isSaving ? 'Saving...' : <><Check className="w-4 h-4" /> Save Profile</>}
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="mt-5 w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold py-2 rounded-lg transition-colors"
                                >
                                    Edit Profile Info
                                </button>
                            )}
                        </div>

                        {/* Emergency Contact */}
                        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 backdrop-blur-sm">
                            <h2 className="text-sm font-bold text-zinc-400 mb-4 flex items-center gap-2 uppercase tracking-wider">
                                <AlertCircle className="w-4 h-4 text-red-400" /> Emergency Contact
                            </h2>
                            <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                                <p className="font-bold text-zinc-200">Jane Smith (Spouse)</p>
                                <p className="text-sm text-zinc-400">+1 (555) 993-2011</p>
                            </div>
                        </div>

                        {/* System Actions */}
                        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 backdrop-blur-sm">
                            <h2 className="text-sm font-bold text-zinc-400 mb-4 flex items-center gap-2 uppercase tracking-wider">
                                System Status
                            </h2>
                            <button
                                onClick={handleLogout}
                                className="w-full flex justify-center items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 text-xs font-bold py-2.5 rounded-lg transition-colors"
                            >
                                <LogOut className="w-4 h-4" /> Securely Log Out
                            </button>
                        </div>
                    </div>

                    {/* Middle Column (Payroll & Compensation) */}
                    <div className="md:col-span-2 space-y-6">

                        {/* KPI Row (Earnings & PTO) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="bg-zinc-900/80 p-5 rounded-2xl border border-zinc-800 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                                    Next Paycheck <Clock className="w-3.5 h-3.5" />
                                </p>
                                <p className="text-2xl font-black text-white">Mar 31</p>
                                <p className="text-xs font-semibold text-accent mt-1 bg-accent/10 inline-block px-2 py-0.5 rounded">Projected: $3,240.50</p>
                            </div>

                            <div className="bg-zinc-900/80 p-5 rounded-2xl border border-zinc-800 shadow-sm">
                                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                                    YTD Earnings <DollarSign className="w-3.5 h-3.5" />
                                </p>
                                <p className="text-2xl font-black text-white">$24,850</p>
                                <p className="text-xs font-semibold text-emerald-400 mt-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +12% vs last year</p>
                            </div>

                            <div className="bg-zinc-900/80 p-5 rounded-2xl border border-zinc-800 shadow-sm sm:col-span-2 lg:col-span-1">
                                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                                    Available PTO <Calendar className="w-3.5 h-3.5" />
                                </p>
                                <p className="text-2xl font-black text-white">42 hrs</p>
                                <button className="mt-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white w-full py-1.5 rounded transition-colors">Request Time Off</button>
                            </div>
                        </div>

                        {/* Recent Paystubs */}
                        <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 backdrop-blur-sm overflow-hidden">
                            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-accent" /> Pay History & Tax Forms
                                </h2>
                                <button className="text-xs font-bold text-accent hover:text-white transition-colors">View All Statements</button>
                            </div>
                            <div className="divide-y divide-zinc-800/50">
                                {[
                                    { date: 'Mar 15, 2026', period: 'Mar 01 - Mar 14', net: '$3,150.20', status: 'Deposited' },
                                    { date: 'Feb 28, 2026', period: 'Feb 15 - Feb 28', net: '$3,420.00', status: 'Deposited' },
                                    { date: 'Feb 14, 2026', period: 'Feb 01 - Feb 14', net: '$2,980.50', status: 'Deposited' },
                                ].map((stub, i) => (
                                    <div key={i} className="p-4 hover:bg-zinc-800/30 transition-colors flex items-center justify-between group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 border border-zinc-700 group-hover:bg-accent/10 group-hover:text-accent group-hover:border-accent/30 transition-all">
                                                <DollarSign className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-zinc-200">{stub.date}</p>
                                                <p className="text-xs text-zinc-500 font-medium">Period: {stub.period}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <p className="font-black text-white">{stub.net}</p>
                                                <p className="text-[10px] font-bold text-emerald-500 uppercase">{stub.status}</p>
                                            </div>
                                            <button className="text-zinc-500 hover:text-white bg-zinc-800 p-2 rounded-md transition-colors border border-zinc-700" title="Download Paystub PDF">
                                                <Download className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Tax Documents Footer */}
                            <div className="bg-zinc-900 p-4 border-t border-zinc-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <FileText className="w-4 h-4 text-yellow-500" />
                                    <span className="text-sm font-semibold text-zinc-300">2025 W-2 Form Available</span>
                                </div>
                                <button className="text-xs font-bold bg-yellow-500/10 text-yellow-500 px-3 py-1.5 rounded-md border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors hidden sm:block">
                                    Download W-2
                                </button>
                            </div>
                        </div>

                        {/* Training & Accreditations */}
                        <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 backdrop-blur-sm p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Award className="w-5 h-5 text-accent" /> Accreditations & SOPs
                                </h2>
                                <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded border border-emerald-400/20">All Required Certs Active</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="border border-zinc-700/50 rounded-xl p-4 bg-zinc-800/30">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="font-bold text-sm text-white">EV High-Voltage Handling</p>
                                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <p className="text-xs text-zinc-400 font-medium mb-3">Required for all Mach-E and Lightning pursuit builds.</p>
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase">Valid until: Dec 2026</p>
                                </div>
                                <div className="border border-zinc-700/50 rounded-xl p-4 bg-zinc-800/30">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="font-bold text-sm text-white">Whelen Core Mastery</p>
                                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <p className="text-xs text-zinc-400 font-medium mb-3">Tier 2 certification for complex wiring harnesses.</p>
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase">Valid until: Mar 2028</p>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
