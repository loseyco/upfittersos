import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Globe, Activity, LogOut, User, ShieldAlert, BookOpen, Megaphone, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { api } from '../lib/api';
import { GlobalFeedbackWidget } from '../components/GlobalFeedbackWidget';
import { GlobalTimeTracker } from '../components/GlobalTimeTracker';
import { useWakeLock } from '../hooks/useWakeLock';
import { APP_NAME } from '../lib/constants';
export function MainLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const { currentUser, logout, tenantId, signInWithGoogle, simulatedRole, endSimulation } = useAuth();

    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [businessName, setBusinessName] = useState(APP_NAME);
    const [apiVersion, setApiVersion] = useState<string>('checking...');
    const [keepScreenAwake, setKeepScreenAwake] = useState(false);
    const [profileName, setProfileName] = useState<string>('Authorized User');
    
    const [activeNotice, setActiveNotice] = useState<any | null>(null);
    const [dismissedNotices, setDismissedNotices] = useState<string[]>([]);
    
    useWakeLock(keepScreenAwake);

    const isImpersonating = sessionStorage.getItem('sae_impersonating') === 'true';

    // Autoresolve the actual tenant company name for the header logo
    useEffect(() => {
        if (tenantId && tenantId !== 'GLOBAL' && tenantId !== 'unassigned') {
            api.get(`/businesses/${tenantId}`).then(res => {
                if (res.data?.name) setBusinessName(res.data.name);
            }).catch(() => setBusinessName(APP_NAME));
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
        { path: currentUser ? '/workspace' : '/', icon: Globe, label: currentUser ? 'Dashboard' : 'Public' },
        { path: '/documents', icon: BookOpen, label: 'Docs' },
        ...(currentUser && isSuperAdmin ? [{ path: '/admin', icon: Activity, label: 'Super Admin' }] : [])
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

            {/* Global Time Tracker */}
            <GlobalTimeTracker />

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

            <header className="bg-zinc-900 border-b border-zinc-800 p-3 md:p-4 shrink-0 flex items-center justify-between z-50">
                <div className="flex items-center gap-2 md:gap-4">
                    <Link to={currentUser ? '/workspace' : '/'}>
                        <h1 className="tour-logo text-lg md:text-xl font-bold tracking-tight text-white shrink-0 hover:text-accent transition-colors">{businessName}</h1>
                    </Link>
                </div>
                <div className="flex items-center gap-2 md:gap-4">                    
                    {currentUser ? (
                    <div className="flex items-center gap-3 ml-2 border-l border-zinc-800 pl-4">
                        <Link to="/profile" className="flex items-center gap-3 hover:bg-zinc-800/50 p-1.5 rounded-lg transition-colors cursor-pointer" title="View HR Profile">
                            <div className="hidden lg:flex flex-col items-end">
                                <span className="text-sm font-bold text-white leading-none">{profileName}</span>
                                <span className="text-[10px] text-zinc-500 font-medium">{currentUser.email}</span>
                            </div>
                            <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold border border-accent/30 shrink-0 overflow-hidden">
                                {currentUser.photoURL ? (
                                    <img src={currentUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                                ) : profileName !== 'Authorized User' ? (
                                    profileName[0].toUpperCase()
                                ) : (
                                    <User className="w-4 h-4" />
                                )}
                            </div>
                        </Link>
                        <button
                            onClick={() => logout()}
                            className="ml-1 p-2 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Sign Out"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <Link
                        to="/login"
                        className="ml-2 px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-lg transition-colors shadow"
                    >
                        Sign In
                    </Link>
                )}
                </div>
            </header>

            {/* Main Content Area (padding bottom on mobile for tab bar, desktop for footer) */}
            <main className="flex-1 flex flex-col relative overflow-y-auto w-full pb-[72px] md:pb-[32px]">
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
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.5)]">
                <nav className="flex items-center overflow-x-auto overflow-y-hidden touch-pan-x flex-nowrap snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-2 py-2 pb-safe w-full">
                    {mobileNavItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex flex-col items-center justify-center min-w-[76px] w-[76px] snap-center py-1.5 gap-1 transition-colors shrink-0 ${isActive ? 'text-accent' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                <item.icon className="w-5 h-5" />
                                <span className="text-[10px] font-medium whitespace-nowrap">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
            
            <GlobalFeedbackWidget />
        </div>
    );
}
