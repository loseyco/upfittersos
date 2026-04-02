import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Building2, Package, Activity, ArrowRight, ScanLine, ClipboardList, Map as MapIcon, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { usePermissions } from '../../hooks/usePermissions';

export function WorkspaceHub() {
    const { currentUser, tenantId, role } = useAuth();
    const { checkPermission, loading } = usePermissions();
    const [businessName, setBusinessName] = useState('Loading Workspace...');

    useEffect(() => {
        const fetchWorkspaceMeta = async () => {
            if (!currentUser || !tenantId) return;
            try {
                if (tenantId !== 'GLOBAL' && tenantId !== 'unassigned') {
                    // Fetch the precise name of the business using localized contextual API
                    const res = await api.get(`/businesses/${tenantId}`);
                    if (res.data && res.data.name) {
                        setBusinessName(res.data.name);
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
    
    // Safely evaluate if user has any access to the management cluster tabs
    const adminPermissions: any[] = [
        'manage_settings', 'manage_roles', 'manage_staff', 'manage_tasks',
        'view_customers', 'view_vehicles', 'view_jobs', 'view_inventory',
        'view_financials', 'manage_canvases'
    ];
    const hasAdminAccess = hasValidWorkspace && adminPermissions.some(p => checkPermission(p));

    const apps: any[] = [
        { name: 'My Tasks', desc: 'View and complete assigned administrative and executive tasks.', icon: ClipboardList, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'hover:border-orange-500/50', link: '/business/tasks', badge: '' },
        { name: 'Universal Scanner', desc: 'Activate your device camera to resolve physical QR stickers.', icon: ScanLine, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'hover:border-emerald-500/50', link: '/scan', badge: '' }
    ];

    if (!loading && checkPermission('view_facility_map')) {
        apps.unshift({ name: 'Facility Map', desc: 'Interactive floorplan of the business campus.', icon: MapIcon, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'hover:border-purple-500/50', link: '/business/facility', badge: '' });
    }

    if (!loading && checkPermission('manage_jobs')) {
        apps.unshift({ name: 'Mission Control', desc: 'Live operations overview to monitor floor activity and bottlenecks.', icon: Activity, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'hover:border-indigo-500/50', link: '/business/ops', badge: '' });
    }

    if (!loading && checkPermission('manage_canvases')) {
        apps.unshift({ name: 'Workflow Whiteboards', desc: 'Create and manage logic canvases to organize operational procedures.', icon: Workflow, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'hover:border-cyan-500/50', link: '/business/canvases', badge: '' });
    }

    if (!loading && hasAdminAccess) {
        apps.unshift({ name: 'Business Admin Suite', desc: 'Full-screen operational management for your workspace.', icon: Building2, color: 'text-zinc-300', bg: 'bg-zinc-700/20', border: 'hover:border-zinc-500/50', link: '/business/manage', badge: '' });
    }

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

                    {apps.length === 0 ? (
                        <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-12 text-center text-zinc-500 flex flex-col items-center justify-center">
                            <Package className="w-12 h-12 mb-4 text-zinc-700" />
                            <h3 className="text-lg font-bold text-zinc-300 mb-2">No Active Modules</h3>
                            <p>You currently do not have any operational modules explicitly assigned to your identity clearance.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {apps.map((app, idx) => (
                                <Link
                                    key={idx}
                                    to={app.link}
                                    className={`group flex flex-col bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-3xl p-6 transition-all duration-300 ${app.badge ? 'opacity-80 cursor-not-allowed' : 'hover:-translate-y-1 shadow-xl hover:shadow-2xl ' + app.border}`}
                                    onClick={(e) => app.badge && e.preventDefault()}
                                >
                                    <div className="flex items-center justify-between mb-6">
                                        <div className={`w-14 h-14 rounded-2xl ${app.bg} flex items-center justify-center border border-white/5 ${!app.badge && 'group-hover:scale-110'} transition-transform`}>
                                            <app.icon className={`w-7 h-7 ${app.color}`} />
                                        </div>
                                        {app.badge && (
                                            <div className="bg-zinc-800 border border-zinc-700 text-[10px] font-black tracking-widest text-zinc-400 uppercase px-2.5 py-1 rounded-md">
                                                {app.badge}
                                            </div>
                                        )}
                                    </div>
                                    <h3 className={`text-xl font-black text-white tracking-tight mb-2 ${!app.badge && 'group-hover:text-accent'} transition-colors`}>{app.name}</h3>
                                    <p className="text-sm text-zinc-400 font-medium leading-relaxed flex-1">{app.desc}</p>

                                    <div className={`mt-6 flex items-center text-xs font-bold uppercase tracking-widest transition-colors ${app.badge ? 'text-zinc-600' : 'text-zinc-500 group-hover:text-white'}`}>
                                        {app.badge ? 'Module Locked' : 'Launch Module'} {!app.badge && <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-2 transition-transform" />}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
