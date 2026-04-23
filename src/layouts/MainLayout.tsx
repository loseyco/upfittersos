import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { X, ChevronLeft, LogOut, Megaphone, User, Globe, LayoutDashboard, CarFront, Activity, ShieldAlert, ScanLine, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { api } from '../lib/api';
import { GlobalFeedbackWidget } from '../components/GlobalFeedbackWidget';
import { GlobalRemindersTracker } from '../components/GlobalRemindersTracker';
import { useWakeLock } from '../hooks/useWakeLock';
import { APP_NAME } from '../lib/constants';
import { PWAPrompt } from '../components/PWAPrompt';
import { usePermissions } from '../hooks/usePermissions';
import { TimeClockApp } from '../pages/business/TimeClockApp';
import toast from 'react-hot-toast';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../lib/firebase';

export function MainLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const { currentUser, logout, tenantId, signInWithGoogle, simulatedRole, endSimulation } = useAuth();

    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [businessName, setBusinessName] = useState(APP_NAME);
    const [businessIcon, setBusinessIcon] = useState<string | null>(null);
    const [apiVersion, setApiVersion] = useState<string>('checking...');
    const [keepScreenAwake, setKeepScreenAwake] = useState(false);
    const [profileName, setProfileName] = useState<string>('Authorized User');
    
    const [activeNotice, setActiveNotice] = useState<any | null>(null);
    const [dismissedNotices, setDismissedNotices] = useState<string[]>([]);
    
    const { checkPermission } = usePermissions();
    const [allStaff, setAllStaff] = useState<any[]>([]);
    
    useWakeLock(keepScreenAwake);

    const isImpersonating = sessionStorage.getItem('sae_impersonating') === 'true';

    // Autoresolve the actual tenant company name for the header logo
    useEffect(() => {
        if (tenantId && tenantId !== 'GLOBAL' && tenantId !== 'unassigned') {
            api.get(`/businesses/${tenantId}`).then(res => {
                if (res.data?.name) setBusinessName(res.data.name);
                if (res.data?.pwaIconUrl) setBusinessIcon(res.data.pwaIconUrl);
            }).catch(() => {
                setBusinessName(APP_NAME);
                setBusinessIcon(null);
            });
        } else if (tenantId === 'GLOBAL') {
            setBusinessName('Global Command');
        } else {
            setBusinessName(APP_NAME);
        }

        // Parallel fetch API telemetry
        api.get('/version')
            .then(res => setApiVersion(`api.v${res.data?.version || '?'}`))
            .catch(() => setApiVersion('api.offline'));

        // Notices logic
        try {
            const saved = localStorage.getItem('sae_dismissed_notices');
            if (saved) setDismissedNotices(JSON.parse(saved));
        } catch (e) {}

        if (tenantId && tenantId !== 'GLOBAL' && tenantId !== 'unassigned') {
            const q = query(
                collection(db, 'announcements'), 
                where('tenantId', '==', tenantId),
                where('active', '==', true)
            );

            const unsub = onSnapshot(q, (snapshot) => {
                if (!snapshot.empty) {
                    const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    fetched.sort((a: any, b: any) => {
                        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                        return timeB - timeA;
                    });
                    setActiveNotice(fetched[0]);
                } else {
                    setActiveNotice(null);
                }
            });

            return () => unsub();
        } else {
            setActiveNotice(null);
        }

    }, [tenantId]);

    // Apply Dynamic SEO & PWA Branding
    useEffect(() => {
        document.title = `${businessName} | ${APP_NAME}`;
        
        let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
        
        if (businessIcon) {
            // Update Favicon natively
            let iconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
            if (iconLink) iconLink.href = businessIcon;

            // Generate Dynamic PWA Manifest to override colors and home screen logo
            const manifestObject = {
                name: businessName,
                short_name: businessName,
                start_url: "/",
                display: "standalone",
                background_color: "#000000",
                theme_color: "#18181b",
                icons: [
                    {
                        src: businessIcon,
                        sizes: "192x192 512x512",
                        type: "image/png"
                    }
                ]
            };

            const blob = new Blob([JSON.stringify(manifestObject)], { type: 'application/json' });
            if (manifestLink) {
                manifestLink.href = URL.createObjectURL(blob);
            }
        }
    }, [businessName, businessIcon]);

    // Fetch Staff for Impersonation / View As
    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        api.get(`/businesses/${tenantId}/staff`).then(res => {
            setAllStaff(res.data || []);
        }).catch(err => console.error("Failed to load staff", err));
    }, [tenantId]);

    const handleImpersonateUser = async (targetUid: string) => {
        if (!targetUid) return;
        try {
            toast.loading("Assume identity...", { id: 'impersonate_dash' });
            const res = await api.post(`/businesses/${tenantId}/staff/${targetUid}/impersonate`);
            const { token } = res.data;
            
            sessionStorage.setItem('sae_impersonating', 'true');
            await signInWithCustomToken(auth, token);
            
            toast.success("Identity assumed.", { id: 'impersonate_dash' });
            window.location.reload();
        } catch (error: any) {
            console.error("Impersonation failed", error);
            toast.error(error?.response?.data?.error || "Failed to impersonate identity.", { id: 'impersonate_dash' });
        }
    };

    useEffect(() => {
        if (currentUser) {
            // Prevent forced auth refresh if we are currently holding a delicate contextual proxy token
            const isProxying = sessionStorage.getItem('sae_impersonating') === 'true';
            currentUser.getIdTokenResult(!isProxying).then(res => {
                setIsSuperAdmin(res.claims.role === 'system_owner' || res.claims.role === 'super_admin');
            }).catch(() => setIsSuperAdmin(false));

            // Subscribe to user preferences and profile
            const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setKeepScreenAwake(!!data.keepScreenAwake);
                    
                    const fn = data.firstName || '';
                    const ln = data.lastName || '';
                    const full = `${fn} ${ln}`.trim();
                    if (full) {
                        setProfileName(full);
                    } else if (data.nickName) {
                        setProfileName(data.nickName);
                    }
                } else {
                    setKeepScreenAwake(false);
                }
            });

            return () => unsubscribe();
        } else {
            setIsSuperAdmin(false);
            setKeepScreenAwake(false);
        }
        
        if ((currentUser as any)?.displayName) {
            setProfileName((currentUser as any).displayName);
        } else {
            setProfileName('Authorized User');
        }
    }, [currentUser, location.pathname]);

    const handleEndImpersonation = async () => {
        try {
            sessionStorage.removeItem('sae_impersonating');
            await logout();
            
            // Immediately restore authentic Global Admin identity
            await signInWithGoogle();
            navigate('/admin');
        } catch (err) {
            console.error("Failed to terminate impersonation session", err);
            navigate('/login');
        }
    };

    const handleDismissNotice = () => {
        if (activeNotice) {
            const updated = [...dismissedNotices, activeNotice.id];
            setDismissedNotices(updated);
            localStorage.setItem('sae_dismissed_notices', JSON.stringify(updated));
        }
    };

    const mobileNavItems = [
        { path: currentUser ? '/workspace' : '/', icon: currentUser ? LayoutDashboard : Globe, label: currentUser ? 'Hub' : 'Public' },
        ...(currentUser ? [
            { path: '/business/vehicles', icon: CarFront, label: 'Vehicles' },
            { path: '/profile', icon: User, label: 'Profile' }
        ] : []),
        ...(currentUser && isSuperAdmin ? [{ path: '/admin', icon: Activity, label: 'Admin' }] : [])
    ];

    return (
        <div className="min-h-screen flex flex-col w-full overflow-x-hidden relative">

            {/* Global Impersonation Killswitch */}
            {isImpersonating && (
                <div className="w-full h-12 bg-red-500 text-white z-[60] flex items-center justify-between px-6 font-bold text-sm shadow-lg shadow-red-500/20 sticky top-0">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" />
                        <span className="hidden sm:inline">CRITICAL COMMAND:</span> You are currently overriding a user identity. All actions are live.
                    </div>
                    <button
                        onClick={handleEndImpersonation}
                        className="bg-black/20 hover:bg-black/40 px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors border border-black/10"
                    >
                        <LogOut className="w-4 h-4" /> End Session
                    </button>
                </div>
            )}

            {/* Global Role Simulation Killswitch */}
            {simulatedRole && (
                <div className="w-full h-12 bg-amber-500 text-black z-[50] flex items-center justify-between px-6 font-bold text-sm shadow-lg shadow-amber-500/20 sticky top-0">
                    <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span className="hidden sm:inline">ROLE SIMULATION:</span> You are viewing the platform with strictly '{simulatedRole}' capabilities.
                    </div>
                    <button
                        onClick={endSimulation}
                        className="bg-black/10 hover:bg-black/20 px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors border border-black/10"
                    >
                        <LogOut className="w-4 h-4" /> End Simulation
                    </button>
                </div>
            )}

            <GlobalRemindersTracker />

            {/* Global Announcement Banner */}
            {activeNotice && !dismissedNotices.includes(activeNotice.id) && (
                <div className="w-full bg-yellow-500/10 border-b border-yellow-500/20 text-white z-[45] flex items-center justify-between px-4 md:px-6 py-2 md:py-3 shadow-lg backdrop-blur-md relative">
                    <div className="flex items-start md:items-center gap-3 w-full">
                        <div className="bg-yellow-500/20 text-yellow-400 p-1.5 rounded-lg shrink-0 mt-0.5 md:mt-0 border border-yellow-500/30">
                            <Megaphone className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 flex-1 min-w-0">
                            <span className="font-black text-xs md:text-sm uppercase tracking-wide text-yellow-500 shrink-0">{activeNotice.title}</span>
                            <span className="hidden md:block w-1.5 h-1.5 rounded-full bg-yellow-500/50 shrink-0"></span>
                            <span className="text-xs md:text-sm font-medium text-zinc-300 md:truncate max-w-2xl">{activeNotice.message}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 md:gap-4 shrink-0 pl-2 md:pl-4">
                        <Link to="/workspace/notices" className="hidden md:block text-xs font-bold text-yellow-500 hover:text-white transition-colors underline-offset-4 hover:underline whitespace-nowrap">
                            View All Notices
                        </Link>
                        <button
                            onClick={handleDismissNotice}
                            className="text-zinc-500 hover:text-white p-1 hover:bg-white/10 rounded-md transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Standard Global Welcome Ribbon */}
            <div className="flex items-center justify-between bg-zinc-900 border-b border-zinc-800 p-2 md:p-3 shadow-sm w-full z-40 shrink-0">
                <div className="flex items-center gap-3">
                    {location.pathname !== '/' && location.pathname !== '/admin' && location.pathname !== '/workspace' && (
                        <div className="flex items-center gap-1.5 mr-2 shrink-0">
                            <Link 
                                to="/workspace"
                                className="bg-blue-900/20 hover:bg-blue-600/30 text-blue-400 hover:text-white p-1.5 rounded-lg transition-colors border border-blue-500/20 hover:border-blue-500/50 flex flex-col items-center justify-center shrink-0"
                                title="Return to Hub"
                            >
                                <LayoutDashboard className="w-5 h-5 mx-0.5" />
                            </Link>
                            <button 
                                onClick={() => navigate(-1)}
                                className="bg-zinc-800/50 hover:bg-zinc-700/50 text-zinc-400 hover:text-white p-1.5 rounded-lg transition-colors border border-zinc-700/50 flex flex-col items-center justify-center shrink-0"
                                title="Go Back"
                            >
                                <ChevronLeft className="w-5 h-5 mx-0.5" />
                            </button>
                        </div>
                    )}
                    <Link to="/profile" className="flex items-center gap-3 hover:bg-zinc-800/50 p-1.5 -ml-1.5 rounded-lg transition-colors cursor-pointer group" title="View HR Profile">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold border border-accent/30 shrink-0 overflow-hidden">
                            {currentUser?.photoURL ? (
                                <img src={currentUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-4 h-4" />
                            )}
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-[13px] md:text-sm font-black text-white leading-tight tracking-wide group-hover:text-accent transition-colors">
                                Welcome back, {profileName.split(' ')[0]}
                            </h1>
                            <span className="text-[9px] md:text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none mt-0.5 truncate max-w-[120px] md:max-w-[200px]">
                                {businessName}
                            </span>
                        </div>
                    </Link>
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                    {(isSuperAdmin || checkPermission('manage_staff')) && allStaff && allStaff.length > 0 && (
                        <div className="hidden lg:flex items-center gap-2">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">View As</span>
                            <select 
                                value="" 
                                onChange={(e) => handleImpersonateUser(e.target.value)}
                                className="text-xs bg-zinc-950 border border-zinc-800 text-zinc-300 font-medium rounded-lg px-2 py-1 outline-none focus:border-accent appearance-none cursor-pointer hover:border-zinc-700 transition-colors max-w-[150px]"
                            >
                                <option value="" disabled>Select User...</option>
                                {allStaff.filter(s => s.uid !== currentUser?.uid).map(staff => (
                                    <option key={staff.uid} value={staff.uid}>
                                        {staff.firstName} {staff.lastName}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('open-global-search'))}
                        className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500 hover:text-white p-1.5 md:p-2 rounded-lg transition-colors shadow-sm ml-1"
                        title="Search Command Hub"
                    >
                        <Search className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => { logout(); window.location.href = '/login'; }}
                        className="bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white p-1.5 md:p-2 rounded-lg transition-colors shadow-sm ml-1"
                        title="Sign Out"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                    {(isSuperAdmin || checkPermission('manage_staff')) && (
                            <Link to="/business/manage" className="text-[10px] md:text-[11px] font-black tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 hover:bg-accent hover:text-black px-2 md:px-4 py-1.5 md:py-2 rounded-lg transition-all shadow-sm flex items-center gap-1.5 shrink-0 ml-1">
                            <ShieldAlert className="w-3.5 h-3.5 hidden sm:block" /> Back Office
                            </Link>
                    )}
                </div>
            </div>

            {/* Standard Global TimeClock Widget */}
            {currentUser && location.pathname !== '/business/time' && location.pathname !== '/login' && location.pathname !== '/' && (
                <div className="w-full shrink-0 z-30 bg-zinc-950 border-b border-zinc-900 shadow-sm relative pt-1 pb-1 px-4 md:px-0">
                    <TimeClockApp isWidget={true} />
                </div>
            )}

            {/* Main Content Area (padding bottom on mobile for tab bar, desktop for footer) */}
            <main className="flex-1 flex flex-col relative overflow-y-auto w-full pb-[72px] md:pb-[32px] bg-zinc-950 md:bg-black/20">
                <Outlet />
            </main>

            {/* Desktop Footer Nav */}
            <footer className="hidden md:flex fixed bottom-0 left-0 right-0 h-[32px] bg-zinc-950 border-t border-zinc-900 z-40 items-center justify-between px-6 shrink-0 flex-wrap overflow-hidden">
                <div className="flex items-center gap-8">
                    <Link to="/documents" className={`text-[11px] font-medium transition-colors tracking-wide ${location.pathname.startsWith('/documents') ? 'text-zinc-400' : 'text-zinc-600 hover:text-zinc-400'}`}>DOCUMENTATION</Link>
                    {!currentUser && (
                        <Link to="/" className={`text-[11px] font-medium transition-colors tracking-wide ${location.pathname === '/' ? 'text-zinc-400' : 'text-zinc-600 hover:text-zinc-400'}`}>PUBLIC NODE</Link>
                    )}
                    {currentUser && isSuperAdmin && (
                        <Link to="/admin" className={`text-[11px] font-medium transition-colors tracking-wide ${location.pathname === '/admin' ? 'text-zinc-400' : 'text-zinc-600 hover:text-zinc-400'}`}>GLOBAL COMMAND</Link>
                    )}
                    {currentUser && isSuperAdmin && (
                        <a href="https://api-saegrp.web.app" target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium tracking-wide text-zinc-600 hover:text-zinc-400 transition-colors">API DOCS</a>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-zinc-700 tracking-widest font-mono uppercase">{apiVersion}</span>
                </div>
            </footer>

            {/* Mobile Bottom Tab Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-900/90 backdrop-blur-2xl border-t border-zinc-800/80 z-50 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
                <div className="flex justify-around items-center h-[72px] px-2">
                    {mobileNavItems.map((item, idx) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <button
                                key={idx}
                                onClick={() => navigate(item.path)}
                                className={`flex flex-col items-center justify-center space-y-1 w-full relative ${
                                    isActive ? 'text-blue-500' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                <item.icon className="w-5 h-5" />
                                <span className={`text-[10px] font-black uppercase tracking-widest ${
                                    isActive ? 'opacity-100' : 'opacity-70'
                                }`}>{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
            <GlobalFeedbackWidget />
            {currentUser && <PWAPrompt />}
        </div>
    );
}
