import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Building2, Package, Activity, ArrowRight, ScanLine, ClipboardList, Map as MapIcon, Workflow, Presentation, Clock, Bug, Megaphone, Wrench, Calculator, Star, ChevronUp, ChevronDown, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { usePermissions } from '../../hooks/usePermissions';
import { DEFAULT_FEATURE_STATE } from '../../lib/features';
import type { FeatureVersion } from '../../lib/features';

export function WorkspaceHub() {
    const { currentUser, tenantId, role } = useAuth();
    const { checkPermission, loading } = usePermissions();
    const [businessName, setBusinessName] = useState('Loading Workspace...');
    const [enabledFeatures, setEnabledFeatures] = useState<Record<string, FeatureVersion>>({});
    const [favorites, setFavorites] = useState<string[]>([]);

    useEffect(() => {
        if (currentUser?.uid) {
            const saved = localStorage.getItem(`workspaceFavorites_${currentUser.uid}`);
            if (saved) {
                try { setFavorites(JSON.parse(saved)); } catch (e) {}
            }
        }
    }, [currentUser?.uid]);

    const updateFavorites = (newFavs: string[]) => {
        setFavorites(newFavs);
        if (currentUser?.uid) {
            localStorage.setItem(`workspaceFavorites_${currentUser.uid}`, JSON.stringify(newFavs));
        }
    };

    const toggleFavorite = (appName: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (favorites.includes(appName)) {
            updateFavorites(favorites.filter(n => n !== appName));
        } else {
            updateFavorites([...favorites, appName]);
        }
    };

    const moveFavorite = (appName: string, direction: 'up' | 'down', e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = favorites.indexOf(appName);
        if (idx === -1) return;
        const newFavs = [...favorites];
        if (direction === 'up' && idx > 0) {
            [newFavs[idx - 1], newFavs[idx]] = [newFavs[idx], newFavs[idx - 1]];
        } else if (direction === 'down' && idx < newFavs.length - 1) {
            [newFavs[idx + 1], newFavs[idx]] = [newFavs[idx], newFavs[idx + 1]];
        }
        updateFavorites(newFavs);
    };

    useEffect(() => {
        const fetchWorkspaceMeta = async () => {
            if (!currentUser || !tenantId) return;
            try {
                if (tenantId !== 'GLOBAL' && tenantId !== 'unassigned') {
                    const res = await api.get(`/businesses/${tenantId}`);
                    if (res.data && res.data.name) {
                        setBusinessName(res.data.name);
                        const isDev = window.location.hostname === 'localhost' || window.location.hostname.includes('dev.');
                        setEnabledFeatures(isDev ? (res.data.enabledFeaturesDev || {}) : (res.data.enabledFeatures || {}));
                    } else {
                        setBusinessName('Corporate Workspace');
                    }
                } else {
                    setBusinessName('Unassigned Identity');
                }
            } catch (err) {
                console.error("Failed to load workspace meta", err);
                setBusinessName('Access Restricted');
            }
        };
        fetchWorkspaceMeta();
    }, [currentUser, tenantId]);

    const hasValidWorkspace = tenantId && tenantId !== 'GLOBAL' && tenantId !== 'unassigned';
    const isSuperAdmin = role === 'system_owner' || role === 'super_admin';
    
    const getAccessMeta = (featureId: string): { badge: string; isLocked: boolean } => {
        if (isSuperAdmin) return { badge: '', isLocked: false }; // Super admins see everything unimpeded
        const version = enabledFeatures[featureId] || DEFAULT_FEATURE_STATE[featureId] || 'disabled';
        if (version === 'disabled') return { badge: 'LOCKED', isLocked: true };
        if (version === 'alpha') return { badge: 'ALPHA PREVIEW', isLocked: false };
        if (version === 'beta') return { badge: 'BETA PREVIEW', isLocked: false };
        return { badge: '', isLocked: false };
    };

    const isHidden = (featureId: string): boolean => {
        if (isSuperAdmin) return false;
        const version = enabledFeatures[featureId] || DEFAULT_FEATURE_STATE[featureId] || 'disabled';
        return version === 'disabled';
    };
    
    // Safely evaluate if user has any access to the management cluster tabs
    const adminPermissions: any[] = [
        'manage_settings', 'manage_roles', 'manage_staff', 'manage_tasks',
        'view_customers', 'view_vehicles', 'view_jobs', 'view_inventory',
        'view_financials', 'manage_canvases'
    ];
    const hasAdminAccess = hasValidWorkspace && adminPermissions.some(p => checkPermission(p));

    const apps: any[] = [];

    if (hasValidWorkspace && !isHidden('estimate_builder')) {
        apps.push({ name: 'Job Manager', desc: 'Construct and manage accurate job scopes with line items.', icon: Calculator, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'hover:border-indigo-500/50', link: '/business/jobs', ...getAccessMeta('estimate_builder') });
    }

    if (hasValidWorkspace && !isHidden('messenger')) {
        apps.push({ name: 'Real-Time Messenger', desc: 'Secure staff communication and live push alerts.', icon: MessageSquare, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'hover:border-rose-500/50', link: '/business/messenger', ...getAccessMeta('messenger') });
    }

    // Tech Portal added below
    if (hasValidWorkspace && !isHidden('tech')) {
        apps.push({ name: 'Technician Portal', desc: 'Clock into assigned jobs, view vehicle details, and mark tasks as finished.', icon: Wrench, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'hover:border-amber-500/50', link: '/business/tech', ...getAccessMeta('tech') });
    }

    if (!isHidden('time')) apps.push({ name: 'Time & Attendance', desc: 'Record hours, view your timesheet, and request time off.', icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'hover:border-blue-500/50', link: '/business/time', ...getAccessMeta('time') });
    if (!isHidden('meetings')) apps.push({ name: 'Meeting Workspace', desc: 'Join active business meetings, view recorded minutes, and track action items.', icon: Presentation, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'hover:border-pink-500/50', link: '/business/meetings', ...getAccessMeta('meetings') });
    if (!isHidden('tasks')) apps.push({ name: 'My Tasks', desc: 'View and complete assigned administrative and executive tasks.', icon: ClipboardList, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'hover:border-orange-500/50', link: '/business/tasks', ...getAccessMeta('tasks') });
    if (!isHidden('scanner')) apps.push({ name: 'Universal Scanner', desc: 'Activate your device camera to resolve physical QR stickers.', icon: ScanLine, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'hover:border-emerald-500/50', link: '/scan', ...getAccessMeta('scanner') });

    // Notices app applies to everyone by default unless hidden
    if (!isHidden('notices')) apps.unshift({ name: 'Announcements', desc: 'Read internal communications and business-wide memos.', icon: Megaphone, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'hover:border-yellow-500/50', link: '/workspace/notices', ...getAccessMeta('notices') });

    if (!loading && checkPermission('view_facility_map') && !isHidden('facility_map')) {
        apps.unshift({ name: 'Facility Map', desc: 'Interactive floorplan of the business campus.', icon: MapIcon, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'hover:border-purple-500/50', link: '/business/facility', ...getAccessMeta('facility_map') });
    }

    if (!loading && (checkPermission('manage_jobs') || checkPermission('manage_staff')) && !isHidden('field_map')) {
        apps.unshift({ name: 'Field Map', desc: 'Live operations map tracking technicians and personnel in the field.', icon: MapIcon, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'hover:border-blue-500/50', link: '/business/field-map', ...getAccessMeta('field_map') });
    }

    if (!loading && checkPermission('manage_jobs') && !isHidden('ops')) {
        apps.unshift({ name: 'Mission Control', desc: 'Live operations overview to monitor floor activity and bottlenecks.', icon: Activity, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'hover:border-indigo-500/50', link: '/business/ops', ...getAccessMeta('ops') });
    }

    if (!loading && checkPermission('manage_canvases') && !isHidden('canvases')) {
        apps.unshift({ name: 'Workflow Whiteboards', desc: 'Create and manage logic canvases to organize operational procedures.', icon: Workflow, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'hover:border-cyan-500/50', link: '/business/canvases', ...getAccessMeta('canvases') });
    }

    if (!isHidden('feedback') && isSuperAdmin) {
        apps.unshift({ name: 'Idea & Bug Board', desc: 'Global feedback review system.', icon: Bug, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'hover:border-emerald-500/50', link: '/business/feedback', ...getAccessMeta('feedback') });
    }

    if (!loading && hasAdminAccess) {
        apps.unshift({ name: 'Business Admin Suite', desc: 'Full-screen operational management for your workspace.', icon: Building2, color: 'text-zinc-300', bg: 'bg-zinc-700/20', border: 'hover:border-zinc-500/50', link: '/business/manage', badge: '', isLocked: false });
    }

    const sortedApps = [...apps].sort((a, b) => {
        const aFav = favorites.indexOf(a.name);
        const bFav = favorites.indexOf(b.name);
        if (aFav !== -1 && bFav !== -1) return aFav - bFav;
        if (aFav !== -1) return -1;
        if (bFav !== -1) return 1;
        return 0; // maintain default order if neither favorited
    });

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8 relative overflow-hidden flex flex-col">

            {/* Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="max-w-6xl mx-auto w-full relative z-10 space-y-10 flex-1">

                {/* Header Profile */}
                <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 pb-6 border-b border-zinc-800/50">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shadow-inner">
                                <Building2 className="w-4 h-4 text-zinc-400" />
                            </div>
                            <span className="text-sm font-bold text-zinc-500 uppercase tracking-widest leading-none">Operational Dashboard</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight">{businessName}</h1>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-zinc-400">Identity Bound As</span>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="bg-accent/20 text-accent border border-accent/30 text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-lg">
                                {role?.replace('_', ' ') || 'Staff'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Main Launchpad Grid */}
                <div>
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-accent" /> Platform Applications
                    </h2>

                    {sortedApps.length === 0 ? (
                        <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-12 text-center text-zinc-500 flex flex-col items-center justify-center">
                            <Package className="w-12 h-12 mb-4 text-zinc-700" />
                            <h3 className="text-lg font-bold text-zinc-300 mb-2">No Active Modules</h3>
                            <p>You currently do not have any operational modules explicitly assigned to your identity clearance.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {sortedApps.map((app, idx) => {
                                const CardWrapper = app.action ? 'button' : Link;
                                const wrapperProps = app.action 
                                    ? { type: 'button' as const, onClick: (e: any) => { if(app.isLocked) e.preventDefault(); else app.action(); } } 
                                    : { to: app.link, onClick: (e: any) => app.isLocked && e.preventDefault() };
                                
                                return (
                                <CardWrapper
                                    key={idx}
                                    {...(wrapperProps as any)}
                                    className={`text-left group flex flex-col bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-3xl p-6 transition-all duration-300 ${app.isLocked ? 'opacity-80 cursor-not-allowed' : 'hover:-translate-y-1 shadow-xl hover:shadow-2xl ' + app.border}`}
                                >
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-14 h-14 rounded-2xl ${app.bg} flex items-center justify-center border border-white/5 ${!app.isLocked && 'group-hover:scale-110'} transition-transform shrink-0`}>
                                                <app.icon className={`w-7 h-7 ${app.color}`} />
                                            </div>
                                            {app.badge && (
                                                <div className={`border text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-md ${app.badge.includes('ALPHA') ? 'bg-zinc-900 border-accent/30 text-accent/80' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                                                    {app.badge}
                                                </div>
                                            )}
                                        </div>

                                        {/* Heart/Favorite Actions */}
                                        <div className="flex items-center gap-1 z-20">
                                            {favorites.includes(app.name) && (
                                                <>
                                                    <button type="button" onClick={(e) => moveFavorite(app.name, 'up', e)} className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent" disabled={favorites.indexOf(app.name) === 0}>
                                                        <ChevronUp className="w-4 h-4" />
                                                    </button>
                                                    <button type="button" onClick={(e) => moveFavorite(app.name, 'down', e)} className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent" disabled={favorites.indexOf(app.name) === favorites.length - 1}>
                                                        <ChevronDown className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                            <button type="button" onClick={(e) => toggleFavorite(app.name, e)} className={`p-2 rounded-md transition-colors group/fav ${favorites.includes(app.name) ? 'text-yellow-400 hover:bg-yellow-400/10' : 'text-zinc-500 hover:bg-zinc-800 hover:text-yellow-400'}`}>
                                                <Star fill={favorites.includes(app.name) ? "currentColor" : "none"} className={`w-5 h-5 ${!favorites.includes(app.name) && 'opacity-0 group-hover:opacity-100 group-hover/fav:opacity-100'} transition-opacity`} />
                                            </button>
                                        </div>
                                    </div>
                                    <h3 className={`text-xl font-black text-white tracking-tight mb-2 ${!app.isLocked && 'group-hover:text-accent'} transition-colors`}>{app.name}</h3>
                                    <p className="text-sm text-zinc-400 font-medium leading-relaxed flex-1">{app.desc}</p>

                                    <div className={`mt-6 flex items-center text-xs font-bold uppercase tracking-widest transition-colors ${app.isLocked ? 'text-zinc-600' : 'text-zinc-500 group-hover:text-white'}`}>
                                        {app.isLocked ? 'Module Locked' : 'Launch Module'} {!app.isLocked && <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-2 transition-transform" />}
                                    </div>
                                </CardWrapper>
                            )})}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
