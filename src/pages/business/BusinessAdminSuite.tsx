import { useState, useEffect } from 'react';
import { Building2, Users, ArrowLeft, Activity, ScanLine, Search, Loader2, ShieldAlert, Truck, Briefcase, Settings, DollarSign, BarChart3, MessageSquare, ClipboardList, Map as MapIcon, MapPin, Clock, Megaphone, Camera, Package, FolderKanban, Database } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StaffAdminTab } from './admin/StaffAdminTab';
import { TasksAdminTab } from './admin/TasksAdminTab';
import { TaskTemplatesAdminTab } from './admin/TaskTemplatesAdminTab';
import { CustomersAdminTab } from './admin/CustomersAdminTab';
import { FacilityMapTab } from './admin/FacilityMapTab';

import { JobsAdminTab } from './admin/JobsAdminTab';
import { VehiclesAdminTab } from './admin/VehiclesAdminTab';
import { InventoryAdminTab } from './admin/InventoryAdminTab';
import { FinancesAdminTab } from './admin/FinancesAdminTab';
import { AreasAdminTab } from './admin/AreasAdminTab';
import { ReportsAdminTab } from './admin/ReportsAdminTab';
import { BusinessSettingsTab } from './admin/BusinessSettingsTab';
import { DepartmentsAdminTab } from './admin/DepartmentsAdminTab';
import { NoticesAdminTab } from './admin/NoticesAdminTab';
import { RolesAdminTab } from './admin/RolesAdminTab';
import { FeedbackAdminTab } from './admin/FeedbackAdminTab';
import { TimeAdminTab } from './admin/TimeAdminTab';
import { CompanyCamTestTab } from './admin/CompanyCamTestTab';
import { AuditLogsTab } from './admin/AuditLogsTab';
import { DeliveriesAdminTab } from './admin/DeliveriesAdminTab';
import { QuickBooksAdminTab } from './admin/QuickBooksAdminTab';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { usePermissions } from '../../hooks/usePermissions';
import { DEFAULT_FEATURE_STATE } from '../../lib/features';
import type { FeatureVersion } from '../../lib/features';

export function BusinessAdminSuite() {
    const { tenantId, role } = useAuth();
    const { checkPermission, loading } = usePermissions();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // Super Admin Workspace Selection State
    const [businesses, setBusinesses] = useState<any[]>([]);
    const [isLoadingSpaces, setIsLoadingSpaces] = useState(false);
    
    // Feature flag state
    const [enabledFeatures, setEnabledFeatures] = useState<Record<string, FeatureVersion>>({});

    // Fetch workspaces if global super admin
    useEffect(() => {
        if ((role === 'system_owner' || role === 'super_admin') && (tenantId === 'GLOBAL' || !tenantId)) {
            const fetchSpaces = async () => {
                setIsLoadingSpaces(true);
                try {
                    const res = await api.get('/businesses');
                    setBusinesses(res.data);
                } catch (err) {
                    console.error("Failed to fetch available workspaces", err);
                    toast.error("Could not fetch target workspaces.");
                } finally {
                    setIsLoadingSpaces(false);
                }
            };
            fetchSpaces();
        }
    }, [role, tenantId]);

    // Fetch local workspace features
    useEffect(() => {
        const fetchWorkspaceFlags = async () => {
            if (tenantId && tenantId !== 'GLOBAL' && tenantId !== 'unassigned') {
                try {
                    const res = await api.get(`/businesses/${tenantId}`);
                    if (res.data) {
                        const isDev = window.location.hostname.includes('dev.') || window.location.hostname === 'localhost';
                        if (isDev && res.data.enabledFeaturesDev) {
                            setEnabledFeatures(res.data.enabledFeaturesDev);
                        } else {
                            setEnabledFeatures(res.data.enabledFeatures || {});
                        }
                    }
                } catch (err) {
                    console.error("Failed to load workspace flags", err);
                }
            }
        };
        fetchWorkspaceFlags();
    }, [tenantId]);

    const handleJumpCommand = async (targetId: string) => {
        try {
            toast.loading("Establishing contextual proxy...", { id: 'jump' });
            const res = await api.post('/admin/enter-workspace', { targetTenantId: targetId });
            const { token } = res.data;
            
            sessionStorage.setItem('sae_impersonating', 'true');
            await signInWithCustomToken(auth, token);
            toast.success("Workspace control established.", { id: 'jump' });
        } catch (error) {
            console.error("Failed to inject override token", error);
            toast.error("Topological jump failed.", { id: 'jump' });
        }
    };
    
    const isHidden = (featureId: string): boolean => {
        if (role === 'system_owner' || role === 'super_admin') return false; // super admins bypass
        const version = enabledFeatures[featureId] || DEFAULT_FEATURE_STATE[featureId] || 'disabled';
        return version === 'disabled';
    };

    // Sidebar Navigation Items conditionally loaded based on granular permissions or role defaults AND deployment rings
    const navItems: Array<{ id: string, label: string, icon: React.ElementType }> = [
        // Core Operations
        ...(checkPermission('view_jobs') && !isHidden('jobs') ? [{ id: 'jobs', label: 'Job Management', icon: Briefcase }] : []),
        ...(checkPermission('manage_jobs') && !isHidden('jobs') ? [{ id: 'task_templates', label: 'Service Catalog', icon: Briefcase }] : []),
        ...(checkPermission('manage_tasks') && !isHidden('tasks') ? [{ id: 'tasks', label: 'Assigned Tasks', icon: ClipboardList }] : []),
        // Customers & Assets
        ...(checkPermission('view_customers') && !isHidden('customers') ? [{ id: 'customers', label: 'Customer Management', icon: Users }] : []),
        ...(checkPermission('view_vehicles') && !isHidden('vehicles') ? [{ id: 'vehicles', label: 'Fleet & Vehicles', icon: Truck }] : []),
        // Supply Chain
        ...(checkPermission('view_inventory') && !isHidden('inventory') ? [{ id: 'inventory', label: 'Inventory (WMS)', icon: ScanLine }] : []),
        ...(checkPermission('view_deliveries') && !isHidden('deliveries') ? [{ id: 'deliveries', label: 'Receiving (Deliveries)', icon: Package }] : []),
        // Logistics & Finance
        ...(checkPermission('manage_timesheets') && !isHidden('time') ? [{ id: 'time', label: 'Time & Payroll', icon: Clock }] : []),
        ...(checkPermission('view_financials') && !isHidden('finances') ? [{ id: 'finances', label: 'Finances & Billing*', icon: DollarSign }] : []),
        ...(checkPermission('view_financials') && !isHidden('reports') ? [{ id: 'reports', label: 'Reports & Analytics*', icon: BarChart3 }] : []),
        // Facilities
        ...(checkPermission('view_areas') && !isHidden('areas') ? [{ id: 'areas', label: 'Area Management', icon: MapPin }] : []),
        ...(checkPermission('manage_facility_map') && !isHidden('facility_map') ? [{ id: 'facility', label: 'Facility Map Editor', icon: MapIcon }] : []),
        // HR & Infrastructure
        ...(checkPermission('manage_staff') && !isHidden('staff') ? [{ id: 'staff', label: 'Staff Directory', icon: Users }] : []),
        ...(checkPermission('manage_settings') ? [{ id: 'departments', label: 'Departments', icon: FolderKanban }] : []),
        ...(checkPermission('manage_roles') && !isHidden('roles') ? [{ id: 'roles', label: 'Roles & Access Rules', icon: ShieldAlert }] : []),
        ...(checkPermission('manage_settings') ? [{ id: 'settings', label: 'Business Profile', icon: Settings }] : []),
        // Internal Infrastructure
        ...(checkPermission('manage_settings') ? [{ id: 'quickbooks', label: 'QuickBooks Sync', icon: Database }] : []),
        ...(checkPermission('manage_settings') && !isHidden('notices') ? [{ id: 'notices', label: 'Global Notices', icon: Megaphone }] : []),
        ...(checkPermission('manage_settings') && !isHidden('feedback') ? [{ id: 'feedback', label: 'Feedback & Ideas', icon: MessageSquare }] : []),
        ...(checkPermission('view_audit_logs') && !isHidden('audit') ? [{ id: 'audit', label: 'Security & Audit Logs', icon: ShieldAlert }] : []),
        ...(checkPermission('manage_settings') && !isHidden('companycam') ? [{ id: 'companycam', label: 'CompanyCam Test', icon: Camera }] : [])
    ];

    const hasAdminAccess = navItems.length > 0;

    // Safely resolve the currently active tab URL parameter
    const requestedTab = searchParams.get('tab');
    const validTabs = navItems.map(n => n.id);
    const activeTab = validTabs.includes(requestedTab || '') ? requestedTab : validTabs[0];

    const handleTabSwitch = (tabId: string) => {
        setSearchParams(prev => {
            prev.set('tab', tabId);
            prev.delete('edit'); // clear edit pane when switching tabs
            return prev;
        });
    };

    // Fallback if they are loading
    if (loading) return <div className="min-h-screen bg-zinc-950"></div>;

    // Direct eviction if they managed to navigate to the URL without baseline access
    if (!hasAdminAccess) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center p-6">
                <ShieldAlert className="w-16 h-16 text-red-500/50 mb-6" />
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">Access Denied</h2>
                <p className="text-zinc-500 max-w-md">Your profile has not been assigned administrative clearance for this workspace.</p>
                <button onClick={() => navigate('/dashboard')} className="mt-8 text-accent hover:text-white transition-colors flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Return to Hub
                </button>
            </div>
        );
    }

    if (!tenantId || tenantId === 'GLOBAL' || tenantId === 'unassigned') {
        if (role === 'system_owner' || role === 'super_admin') {
            return (
                <div className="min-h-screen bg-zinc-950 p-6 md:p-12 relative overflow-y-auto w-full">
                    {/* Background Detail */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>
                    
                    <div className="max-w-4xl mx-auto w-full relative z-10 flex flex-col pt-10">
                        <div className="mb-10 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shadow-inner">
                                        <Activity className="w-5 h-5 text-accent" />
                                    </div>
                                    <span className="text-sm font-bold text-accent uppercase tracking-widest">Super Admin Protocol</span>
                                </div>
                                <h1 className="text-4xl font-black text-white tracking-tight">Select Target Workspace</h1>
                                <p className="text-zinc-400 mt-2 max-w-xl">You are operating in global orbit. Select a commercial tenant below to securely inject your administrative authority into their local context without occupying an employee seat.</p>
                            </div>
                            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm font-bold bg-zinc-900 hover:bg-zinc-800 px-4 py-2.5 rounded-xl border border-zinc-800">
                                <ArrowLeft className="w-4 h-4" /> Hub 
                            </button>
                        </div>

                        {isLoadingSpaces ? (
                            <div className="flex flex-col items-center justify-center p-20 text-zinc-500">
                                <Loader2 className="w-8 h-8 animate-spin mb-4 text-accent" />
                                <span className="font-bold text-sm uppercase tracking-widest">Scanning Network...</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {businesses.filter((b: any) => b.status !== 'archived').map((business: any) => (
                                    <button 
                                        key={business.id}
                                        onClick={() => handleJumpCommand(business.id)}
                                        className="group flex flex-col items-start bg-zinc-900/50 hover:bg-zinc-800/80 border border-zinc-800 hover:border-accent/40 rounded-2xl p-6 text-left transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-400 group-hover:text-accent transition-colors">
                                            <Building2 className="w-5 h-5" />
                                        </div>
                                        <h3 className="text-xl font-bold text-white mb-1 group-hover:text-accent transition-colors">{business.name}</h3>
                                        <p className="text-sm text-zinc-500 mb-4">{business.industry || 'Commercial Tenant'}</p>
                                        
                                        <div className="mt-auto flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500 group-hover:text-accent transition-colors">
                                            <ScanLine className="w-3.5 h-3.5" /> Inject Context
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center p-6">
                <Building2 className="w-16 h-16 text-zinc-800 mb-6" />
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">No Workspace Assigned</h2>
                <p className="text-zinc-500 max-w-md">You must be bound to a commercial tenant to access the Business Administration Suite.</p>
                <button onClick={() => navigate('/dashboard')} className="mt-8 text-accent hover:text-white transition-colors flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Return to Hub
                </button>
            </div>
        );
    }

    return (
        <div className="h-[100dvh] bg-zinc-950 flex flex-col md:flex-row overflow-hidden font-sans">
            
            {/* Nav Container (Top on Mobile, Left on Desktop) */}
            <div className="w-full md:w-64 bg-zinc-950 border-b md:border-b-0 md:border-r border-zinc-800 flex flex-col shrink-0 flex-none relative z-10">
                <div className="p-4 md:p-6 border-b border-zinc-800/50 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-white tracking-tight">Admin Suite</h2>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest hidden md:block">Workspace Management</span>
                    </div>
                    {/* Mobile Quit Button */}
                    <div className="md:hidden flex items-center gap-2">
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('open-global-search'))}
                            className="px-2 py-1.5 rounded-lg text-xs font-bold text-indigo-400 hover:text-white bg-indigo-500/10 border border-indigo-500/20 transition-colors shadow-sm"
                        >
                            <Search className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => navigate('/dashboard')}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                    </div>
                </div>

                <div className="pt-4 px-4 hidden md:flex items-center gap-2 shrink-0">
                    <button 
                        onClick={() => navigate('/dashboard')}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900/50 hover:bg-zinc-800/80 border border-zinc-800/50 hover:border-zinc-700 transition-all shadow-sm"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
                    </button>
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('open-global-search'))}
                        className="px-3 py-2.5 rounded-lg text-xs font-bold text-indigo-400 hover:text-white bg-indigo-500/10 border border-indigo-500/20 transition-colors shadow-sm"
                        title="Search Command Hub"
                    >
                        <Search className="w-4 h-4" />
                    </button>
                </div>

                <nav className="flex-1 p-2 md:p-4 flex flex-row md:flex-col overflow-x-auto overflow-y-auto space-x-2 md:space-x-0 md:space-y-1 no-scrollbar pb-6 md:pb-20">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => handleTabSwitch(item.id)}
                            className={`flex shrink-0 md:w-full items-center justify-center md:justify-start gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg text-xs md:text-sm font-bold transition-all whitespace-nowrap ${
                                activeTab === item.id 
                                ? 'bg-accent/10 text-accent border border-accent/20' 
                                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
                            }`}
                        >
                            <item.icon className={`w-4 h-4 ${activeTab === item.id ? 'text-accent' : 'text-zinc-500'}`} />
                            {item.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col bg-zinc-900 overflow-hidden relative z-0 md:shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
                {/* Dynamic Content Loading */}
                <div className="flex-1 overflow-hidden relative">
                    {activeTab === 'settings' && <BusinessSettingsTab tenantId={tenantId} />}
                    {activeTab === 'departments' && <DepartmentsAdminTab tenantId={tenantId} />}
                    {activeTab === 'roles' && <RolesAdminTab tenantId={tenantId} />}
                    {activeTab === 'staff' && <StaffAdminTab tenantId={tenantId} />}
                    {activeTab === 'tasks' && <TasksAdminTab tenantId={tenantId} />}
                    {activeTab === 'task_templates' && <TaskTemplatesAdminTab tenantId={tenantId} />}
                    {activeTab === 'customers' && <CustomersAdminTab tenantId={tenantId} />}
                    { activeTab === 'vehicles' && <VehiclesAdminTab tenantId={tenantId} />}
                    { activeTab === 'jobs' && <JobsAdminTab tenantId={tenantId} /> }
                    { activeTab === 'areas' && <AreasAdminTab tenantId={tenantId} /> }
                    { activeTab === 'inventory' && <InventoryAdminTab tenantId={tenantId} /> }
                    { activeTab === 'time' && <TimeAdminTab tenantId={tenantId} /> }
                    { activeTab === 'finances' && <FinancesAdminTab tenantId={tenantId} /> }
                    { activeTab === 'quickbooks' && <QuickBooksAdminTab tenantId={tenantId} /> }
                    { activeTab === 'reports' && <ReportsAdminTab tenantId={tenantId} /> }
                    { activeTab === 'feedback' && <FeedbackAdminTab tenantId={tenantId} /> }
                    { activeTab === 'notices' && <NoticesAdminTab tenantId={tenantId} /> }
                    { activeTab === 'companycam' && <CompanyCamTestTab tenantId={tenantId} /> }
                    { activeTab === 'audit' && <AuditLogsTab tenantId={tenantId} /> }
                    { activeTab === 'deliveries' && <DeliveriesAdminTab tenantId={tenantId} /> }

                    {activeTab === 'facility' && <FacilityMapTab tenantId={tenantId} />}
                </div>
            </div>

        </div>
    );
}
