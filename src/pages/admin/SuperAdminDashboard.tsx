import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Building2, Users, Database, Activity, PlusCircle, ChevronRight, ShieldAlert, CheckCircle2, X, Settings, CreditCard, LayoutDashboard, Trash2, Eye, Bug, Key, ListChecks, Package } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { PERMISSION_LABELS, DEFAULT_PERMISSIONS } from '../../lib/permissions';
import { APP_FEATURES, DEFAULT_FEATURE_STATE } from '../../lib/features';
import type { FeatureVersion } from '../../lib/features';
import { AuditLogsTab } from '../business/admin/AuditLogsTab';
import { BuildLogAdminTab } from './BuildLogAdminTab';

export function SuperAdminDashboard() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    
    // UI States (Synched to URL for deep linking / refresh survival)
    // UI States (Synched to URL for deep linking / refresh survival)
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = (searchParams.get('tab') as 'workspaces' | 'users' | 'pricing' | 'settings' | 'dictionary' | 'modules' | 'analytics' | 'builds') || 'workspaces';
    
    const setActiveTab = (tab: string) => {
        setSearchParams(prev => {
            prev.set('tab', tab);
            return prev;
        });
    };

    // Data States
    const [businesses, setBusinesses] = useState<any[]>([]);
    const [globalUsers, setGlobalUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const workspaceId = searchParams.get('workspace');
    // Derived state from loaded businesses
    const selectedWorkspace = businesses.find(b => b.id === workspaceId) || null;

    const setSelectedWorkspace = (biz: any | null) => {
        setSearchParams(prev => {
            if (biz) {
                prev.set('workspace', biz.id);
            } else {
                prev.delete('workspace');
            }
            return prev;
        });
    };

    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newOwner, setNewOwner] = useState('');
    const [newPlan, setNewPlan] = useState('free');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Invite Modal States
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('staff');
    const [isInviting, setIsInviting] = useState(false);

    // Setup Link State
    const [setupLinkDetails, setSetupLinkDetails] = useState<{email: string, link: string} | null>(null);

    const fetchBusinesses = async () => {
        try {
            setLoading(true);
            const [resBusinesses, resUsers] = await Promise.all([
                api.get('/businesses'),
                api.get('/users')
            ]);
            setBusinesses(resBusinesses.data);
            setGlobalUsers(resUsers.data);
        } catch (err) {
            console.error("Failed to load global data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (currentUser) {
            fetchBusinesses();
        }
    }, [currentUser]);

    const handleProvision = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            const res = await api.post('/businesses', {
                name: newName,
                ownerEmail: newOwner,
                subscriptionPlan: newPlan
            });
            setIsModalOpen(false);
            setNewName('');
            setNewOwner('');
            
            if (res.data.setupLink) {
                setSetupLinkDetails({ email: newOwner, link: res.data.setupLink });
            } else {
                toast.success("Workspace securely provisioned.");
            }
            
            fetchBusinesses();
        } catch (err) {
            console.error("Failed to provision", err);
            toast.error("Error provisioning workspace.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInviteStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedWorkspace) return;
        try {
            setIsInviting(true);
            const res = await api.post(`/businesses/${selectedWorkspace.id}/staff`, {
                email: inviteEmail,
                role: inviteRole
            });
            
            if (res.data.setupLink) {
                setSetupLinkDetails({ email: inviteEmail, link: res.data.setupLink });
            } else {
                toast.success("Identity mapped to workspace.");
            }
            
            setInviteEmail('');
            setInviteRole('staff');
            // Re-fetch users to see the new staff mapped to this tenant
            fetchBusinesses();
        } catch (err) {
            console.error("Failed to invite staff", err);
            toast.error("Failed to map user to workspace.");
        } finally {
            setIsInviting(false);
        }
    };

    const handleDeleteUser = async (uid: string, email: string) => {
        if (!selectedWorkspace) return;
        if (!window.confirm(`Are you absolutely sure you want to permanently delete the identity for ${email}?`)) return;
        
        try {
            await api.delete(`/businesses/${selectedWorkspace.id}/staff/${uid}`);
            toast.success("Identity permanently eradicated.");
            fetchBusinesses();
        } catch (err) {
            console.error("Failed to delete user", err);
            toast.error("Failed to delete user identity.");
        }
    };

    const handleRoleChange = async (uid: string, newRole: string) => {
        if (!selectedWorkspace) return;
        try {
            await api.post('/roles/assign', {
                targetUid: uid,
                role: newRole,
                tenantId: selectedWorkspace.id
            });
            toast.success("Operational role shifted.");
            fetchBusinesses();
        } catch (err) {
            console.error("Failed to reassign role", err);
            toast.error("Failed to assign new role.");
        }
    };

    const handleImpersonate = async (targetUid: string) => {
        try {
            toast.loading("Generating secure overriding identity token...", { id: 'impersonate' });
            const res = await api.post('/admin/impersonate', { targetUid });
            const { token } = res.data;
            
            toast.loading("Assuming target identity...", { id: 'impersonate' });
            sessionStorage.setItem('sae_impersonating', 'true');
            await signInWithCustomToken(auth, token);
            
            toast.success("Identity assumed successfully. Entering target workspace.", { id: 'impersonate' });
            // By design, Firebase Auth state instantly drops the SuperAdmin custom claim locally
            // and forcefully unmounts this protected View, sending us into the user's /workspace !
        } catch (error: any) {
            console.error("Impersonation failed", error);
            toast.error(error?.response?.data?.error || "Failed to impersonate identity.", { id: 'impersonate' });
        }
    };

    const handleEnterWorkspace = async (targetTenantId: string) => {
        try {
            toast.loading("Executing secure topological jump into target workspace...", { id: 'enter-workspace' });
            const res = await api.post('/admin/enter-workspace', { targetTenantId });
            const { token } = res.data;
            
            toast.loading("Assuming contextual authority...", { id: 'enter-workspace' });
            sessionStorage.setItem('sae_impersonating', 'true');
            await signInWithCustomToken(auth, token);
            
            toast.success("Contextual authority established. Bouncing to Hub.", { id: 'enter-workspace' });
            navigate('/workspace');
        } catch (error: any) {
            console.error("Workspace jump failed", error);
            toast.error(error?.response?.data?.error || "Failed to enter workspace.", { id: 'enter-workspace' });
        }
    };

    const handleUpdateFeature = async (featureId: string, version: FeatureVersion, isDevList: boolean = false) => {
        if (!selectedWorkspace) return;
        try {
            const currentFeatures = selectedWorkspace.enabledFeatures || {};
            const currentFeaturesDev = selectedWorkspace.enabledFeaturesDev || {};
            
            const payload: any = {};
            if (isDevList) {
                payload.enabledFeaturesDev = { ...currentFeaturesDev, [featureId]: version };
            } else {
                payload.enabledFeatures = { ...currentFeatures, [featureId]: version };
            }
            
            await api.put(`/businesses/${selectedWorkspace.id}`, payload);
            toast.success(`Feature flag updated for ${isDevList ? 'Dev' : 'Live'}.`);
            fetchBusinesses(); // Refresh local list
        } catch (err) {
            console.error("Failed to update feature", err);
            toast.error("Failed to update feature flag.");
        }
    };

    const totalActive = businesses.filter(b => b.status === 'active').length;
    const totalStaff = businesses.reduce((acc, b) => acc + (b.metrics?.totalStaff || 0), 0);
    const totalMRR = businesses.reduce((acc, b) => acc + (b.metrics?.MRR || 0), 0);

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col md:flex-row">
            
            {/* Setup Link Modal */}
            {setupLinkDetails && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-emerald-500/30 rounded-2xl w-full max-w-lg p-8 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-blue-500"></div>
                        <h3 className="text-xl font-black mb-2 flex items-center gap-2">
                            <CheckCircle2 className="w-6 h-6 text-emerald-400" /> Identity Provisioned
                        </h3>
                        <p className="text-sm text-zinc-400 mb-6 font-medium">
                            A secure shell account was generated for <span className="text-white font-bold">{setupLinkDetails.email}</span>. 
                            Since their identity was dynamically created, they require a password configuration link to access the platform.
                        </p>
                        
                        <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 mb-6 relative">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <ShieldAlert className="w-3 h-3 text-red-400" /> Single-Use Setup Link
                            </p>
                            <div className="flex gap-2">
                                <input 
                                    readOnly 
                                    value={setupLinkDetails.link} 
                                    className="flex-1 bg-zinc-900 text-emerald-400 text-xs font-mono p-3 rounded-lg border border-zinc-700 outline-none selection:bg-emerald-500/30"
                                />
                                <button 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        navigator.clipboard.writeText(setupLinkDetails.link);
                                        toast.success("Link mapped to clipboard!");
                                    }}
                                    className="bg-white hover:bg-zinc-200 text-zinc-950 px-5 py-2 rounded-lg font-bold text-sm transition-all shadow-md active:scale-95"
                                >
                                    Copy
                                </button>
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-3 font-medium">Send this link securely to the assigned network identity to complete configuration.</p>
                        </div>

                        <button onClick={() => setSetupLinkDetails(null)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3.5 rounded-xl transition-all border border-zinc-700">
                            Acknowledge & Close
                        </button>
                    </div>
                </div>
            )}

            {/* Provisioning Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <PlusCircle className="w-5 h-5 text-accent" /> New Workspace
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleProvision} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Workspace Name</label>
                                <input required type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Metro Fleet Services" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Owner Email (Optional)</label>
                                <input type="email" value={newOwner} onChange={e => setNewOwner(e.target.value)} placeholder="owner@email.com" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Subscription Tier</label>
                                <select value={newPlan} onChange={e => setNewPlan(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent text-white">
                                    <option value="free">Free Base Platform</option>
                                    <option value="custom" disabled>A La Carte Options (Coming Soon)</option>
                                </select>
                            </div>
                            <button type="submit" disabled={isSubmitting} className="w-full mt-4 bg-accent hover:bg-accent-hover text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50">
                                {isSubmitting ? 'Provisioning...' : 'Provision Workspace'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Sidebar Navigation */}
            <div className="w-full md:w-64 bg-zinc-900/50 border-r border-white/5 p-4 md:p-6 flex flex-col gap-8 md:min-h-screen">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                            <ShieldAlert className="w-5 h-5 text-purple-400" />
                        </div>
                        <h1 className="text-xl font-black tracking-tight text-white leading-tight">Global Command</h1>
                    </div>
                    <p className="text-zinc-500 font-mono text-[10px] break-all">{currentUser?.email || 'Authorized Target'}</p>
                </div>

                <nav className="flex-1 space-y-2">
                    <button onClick={() => setActiveTab('workspaces')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm ${activeTab === 'workspaces' ? 'bg-accent/10 text-accent border border-accent/20' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'}`}>
                        <LayoutDashboard className="w-4 h-4" /> Workspaces
                    </button>
                    <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm ${activeTab === 'users' ? 'bg-accent/10 text-accent border border-accent/20' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'}`}>
                        <Users className="w-4 h-4" /> Network Users
                    </button>
                    <button onClick={() => setActiveTab('pricing')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm ${activeTab === 'pricing' ? 'bg-accent/10 text-accent border border-accent/20' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'}`}>
                        <CreditCard className="w-4 h-4" /> Pricing & Plans
                    </button>
                    <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm ${activeTab === 'settings' ? 'bg-accent/10 text-accent border border-accent/20' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'}`}>
                        <Settings className="w-4 h-4" /> System Settings
                    </button>
                    <button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm ${activeTab === 'analytics' ? 'bg-accent/10 text-accent border border-accent/20' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'}`}>
                        <Activity className="w-4 h-4" /> Global Analytics
                    </button>
                    <button onClick={() => setActiveTab('dictionary')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm ${activeTab === 'dictionary' ? 'bg-accent/10 text-accent border border-accent/20' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'}`}>
                        <Key className="w-4 h-4" /> Access Dictionary
                    </button>
                    <button onClick={() => setActiveTab('modules')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm ${activeTab === 'modules' ? 'bg-accent/10 text-accent border border-accent/20' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'}`}>
                        <Package className="w-4 h-4" /> Module Registry
                    </button>
                    <button onClick={() => setActiveTab('builds')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm ${activeTab === 'builds' ? 'bg-accent/10 text-accent border border-accent/20' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'}`}>
                        <ListChecks className="w-4 h-4" /> Build Logs
                    </button>
                    
                    <button onClick={() => navigate('/admin/features')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent !mt-8`}>
                        <ListChecks className="w-4 h-4 text-cyan-400" /> Roadmap & Features
                    </button>
                    <button onClick={() => navigate('/business/feedback')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent`}>
                        <Bug className="w-4 h-4 text-emerald-400" /> Idea & Bug Board
                    </button>
                </nav>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 p-4 md:p-8 overflow-y-auto">
                <div className="max-w-6xl mx-auto space-y-8">

                    {/* KPI Metrics Strip */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-zinc-900/50 backdrop-blur-md rounded-2xl p-5 border border-white/5">
                            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Active Businesses</p>
                            <div className="flex items-center justify-between">
                                <p className="text-3xl font-black">{loading ? '-' : totalActive}</p>
                                <Building2 className="w-6 h-6 text-blue-400 opacity-50" />
                            </div>
                        </div>
                        <div className="bg-zinc-900/50 backdrop-blur-md rounded-2xl p-5 border border-white/5">
                            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Total Staff</p>
                            <div className="flex items-center justify-between">
                                <p className="text-3xl font-black">{loading ? '-' : totalStaff}</p>
                                <Users className="w-6 h-6 text-emerald-400 opacity-50" />
                            </div>
                        </div>
                        <div className="bg-zinc-900/50 backdrop-blur-md rounded-2xl p-5 border border-white/5">
                            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Network MRR</p>
                            <div className="flex items-center justify-between">
                                <p className="text-3xl font-black">{loading ? '-' : `$${totalMRR.toLocaleString()}`}</p>
                                <Database className="w-6 h-6 text-purple-400 opacity-50" />
                            </div>
                        </div>
                        <div className="bg-zinc-900/50 backdrop-blur-md rounded-2xl p-5 border border-white/5">
                            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">API Health</p>
                            <div className="flex items-center justify-between">
                                <p className="text-3xl font-black text-emerald-400">OK</p>
                                <Activity className="w-6 h-6 text-emerald-400 opacity-50" />
                            </div>
                        </div>
                    </div>

                    {/* Tab Views */}
                    {activeTab === 'workspaces' && (
                        <div className="space-y-6">
                            
                            {!selectedWorkspace ? (
                                <>
                                    <div className="flex justify-between items-center">
                                        <h2 className="text-2xl font-bold flex items-center gap-2">
                                            <Building2 className="w-6 h-6 text-accent" /> Deployed SaaS Workspaces
                                        </h2>
                                        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-white text-black hover:bg-zinc-200 px-4 py-2 rounded-xl font-bold transition-all shadow-lg active:scale-95 text-sm">
                                            <PlusCircle className="w-4 h-4" /> Provision Workspace
                                        </button>
                                    </div>
                                    
                                    <div className="bg-zinc-900/50 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="bg-zinc-900 text-left text-xs font-bold text-zinc-500 uppercase tracking-wider">
                                                        <th className="p-4 pl-6">Workspace Name</th>
                                                        <th className="p-4">Owner Contact</th>
                                                        <th className="p-4 text-center">Staff Count</th>
                                                        <th className="p-4">Status & Plan</th>
                                                        <th className="p-4 text-right pr-6">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-800/50">
                                                    {loading ? (
                                                        <tr><td colSpan={5} className="p-8 text-center text-zinc-500">Loading workspaces...</td></tr>
                                                    ) : businesses.length === 0 ? (
                                                        <tr><td colSpan={5} className="p-8 text-center text-zinc-500">No client workspaces provisioned yet.</td></tr>
                                                    ) : (
                                                        businesses.map((biz) => {
                                                            const bizStaffCount = globalUsers.filter(u => u.tenantId === biz.id).length;
                                                            return (
                                                                <tr key={biz.id} onClick={() => setSelectedWorkspace(biz)} className="hover:bg-white/[0.02] transition-colors cursor-pointer group">
                                                                    <td className="p-4 pl-6">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold text-xs">
                                                                                {biz.name.substring(0, 2).toUpperCase()}
                                                                            </div>
                                                                            <span className="font-bold text-sm text-zinc-200 group-hover:text-white transition-colors">{biz.name}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-4">
                                                                        <span className="text-sm font-medium text-zinc-400">{biz.ownerEmail}</span>
                                                                    </td>
                                                                    <td className="p-4 text-center">
                                                                        <span className="inline-flex items-center justify-center bg-zinc-800 text-zinc-300 text-xs font-bold px-2 py-1 rounded-md border border-zinc-700 min-w-[2rem]">
                                                                            {bizStaffCount}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-4">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                                                <CheckCircle2 className="w-3 h-3" /> {biz.status}
                                                                            </span>
                                                                            <span className="text-xs font-bold text-zinc-500 uppercase border border-zinc-700 px-2 py-1 rounded w-[45px] text-center">{biz.subscriptionPlan}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-4 pr-6 text-right">
                                                                        <button className="p-2 -mr-2 text-zinc-500 hover:text-white transition-colors">
                                                                            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                /* Workspace Details Drill-down */
                                <div className="space-y-6">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                        <div className="flex items-center gap-4">
                                            <button onClick={() => setSelectedWorkspace(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors font-bold text-sm bg-zinc-900 px-4 py-2 rounded-xl border border-white/5">
                                                <ChevronRight className="w-4 h-4 rotate-180" /> Back to Workspaces
                                            </button>
                                            
                                            <button 
                                                onClick={() => {
                                                    const staff = globalUsers.filter(u => u.tenantId === selectedWorkspace.id);
                                                    if (staff.length === 0) {
                                                        toast.error("Cannot launch empty workspace. Assign a user first.");
                                                        return;
                                                    }
                                                    handleEnterWorkspace(selectedWorkspace.id);
                                                }} 
                                                className="flex items-center gap-2 bg-accent/10 text-accent hover:bg-accent/20 hover:text-white px-4 py-2 rounded-xl font-bold border border-accent/20 transition-all text-sm shadow-lg shadow-accent/5"
                                            >
                                                <Eye className="w-4 h-4" /> Launch Workspace
                                            </button>
                                        </div>
                                        <span className="text-sm font-bold bg-blue-500/10 text-blue-400 px-4 py-2 rounded-xl border border-blue-500/20 flex items-center gap-2">
                                            <Building2 className="w-4 h-4" /> {selectedWorkspace.name}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                        
                                        {/* Staff Directory Panel */}
                                        <div className="lg:col-span-2 bg-zinc-900 border border-white/5 rounded-3xl p-6">
                                            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
                                                <Users className="w-5 h-5 text-blue-400" /> Authorized Identities
                                            </h3>
                                            <div className="space-y-3">
                                                {globalUsers.filter(u => u.tenantId === selectedWorkspace.id).map(user => (
                                                    <div key={user.uid} className="flex items-center justify-between bg-zinc-950 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors group">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-sm text-zinc-200 group-hover:text-white transition-colors">{user.displayName || 'Provisioned User'}</span>
                                                            <span className="text-xs text-zinc-500">{user.email}</span>
                                                        </div>
                                                        <div className="text-right flex items-center gap-3">
                                                            <select 
                                                                value={user.role} 
                                                                onChange={(e) => handleRoleChange(user.uid, e.target.value)}
                                                                className="bg-zinc-800 border border-zinc-700 hover:border-accent text-zinc-300 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm appearance-none outline-none cursor-pointer text-center text-center-last"
                                                            >
                                                                <option value="business_owner">BUSINESS_OWNER</option>
                                                                <option value="manager">MANAGER</option>
                                                                <option value="department_lead">DEPARTMENT_LEAD</option>
                                                                <option value="parts_guy">PARTS_GUY</option>
                                                                <option value="system_owner" disabled>SYSTEM_OWNER</option>
                                                                <option value="super_admin" disabled>SUPER_ADMIN</option>
                                                                <option value="staff">STAFF</option>
                                                            </select>
                                                            <button 
                                                                onClick={() => handleImpersonate(user.uid)} 
                                                                className="text-zinc-600 hover:text-accent transition-colors ml-1" 
                                                                title="Impersonate Identity"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteUser(user.uid, user.email)} 
                                                                className="text-zinc-600 hover:text-red-500 transition-colors ml-1" 
                                                                title="Delete Identity"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {globalUsers.filter(u => u.tenantId === selectedWorkspace.id).length === 0 && (
                                                    <p className="text-zinc-500 text-sm py-4">No staff identities mapped to this workspace yet.</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Invite Form Panel */}
                                        <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6">
                                            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
                                                <PlusCircle className="w-5 h-5 text-emerald-400" /> Delegate Access
                                            </h3>
                                            <form onSubmit={handleInviteStaff} className="space-y-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
                                                    <input required type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="employee@domain.com" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent text-white" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Assigned Role</label>
                                                    <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent text-white">
                                                        <option value="business_owner">Business Owner (Full Access)</option>
                                                        <option value="manager">Manager</option>
                                                        <option value="department_lead">Department Lead</option>
                                                        <option value="staff">Staff / Technician</option>
                                                    </select>
                                                </div>
                                                <p className="text-[10px] text-zinc-500 leading-relaxed font-medium">Inviting a user instantly maps their Google or internal identity to this workspace. If they do not exist, a shell account is generated natively.</p>
                                                <button type="submit" disabled={isInviting} className="w-full mt-2 bg-emerald-500 text-white hover:bg-emerald-600 font-bold py-2.5 rounded-xl transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50">
                                                    {isInviting ? 'Binding Identity...' : 'Execute Assignment'}
                                                </button>
                                            </form>
                                        </div>

                                        {/* Feature Flags Panel */}
                                        <div className="lg:col-span-3 bg-zinc-900 border border-white/5 rounded-3xl p-6 mt-2 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                                <Package className="w-48 h-48" />
                                            </div>
                                            <h3 className="text-lg font-bold flex items-center gap-2 mb-2 relative">
                                                <Package className="w-5 h-5 text-accent" /> Business Application Routing
                                            </h3>
                                            <p className="text-zinc-500 text-sm mb-6 relative z-10 max-w-2xl">
                                                Control which operational modules are mapped to this tenant's workspace. Applications can be completely restricted or staged via alpha/beta ring-deployments to allow isolated testing.
                                            </p>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
                                                {APP_FEATURES.map(feature => {
                                                    const businessFeatures = selectedWorkspace.enabledFeatures || {};
                                                    const businessFeaturesDev = selectedWorkspace.enabledFeaturesDev || {};
                                                    const currentVersion: FeatureVersion = businessFeatures[feature.id] || DEFAULT_FEATURE_STATE[feature.id] || 'disabled';
                                                    const currentDevVersion: FeatureVersion = businessFeaturesDev[feature.id] || DEFAULT_FEATURE_STATE[feature.id] || 'disabled';
                                                    
                                                    const availableForThisFeature = feature.availableVersions;
                                                    
                                                    return (
                                                        <div key={feature.id} className="bg-zinc-950/50 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between hover:border-zinc-700 transition-colors">
                                                            <div>
                                                                <h4 className="font-bold text-white text-sm mb-1">{feature.name}</h4>
                                                                <p className="text-[10px] text-zinc-500 mb-4">{feature.description}</p>
                                                            </div>
                                                            {/* React HMR Trigger */}
                                                            <div className="flex flex-col gap-3">
                                                                <div className="flex flex-col gap-1.5">
                                                                    <label className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">Live Ring</label>
                                                                    <select 
                                                                        value={currentVersion} 
                                                                        onChange={(e) => handleUpdateFeature(feature.id, e.target.value as FeatureVersion, false)}
                                                                        className={`w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-2 text-xs font-bold outline-none cursor-pointer appearance-none transition-colors
                                                                            ${currentVersion === 'live' ? 'text-emerald-400' : 
                                                                              currentVersion === 'beta' ? 'text-blue-400' : 
                                                                              currentVersion === 'alpha' ? 'text-purple-400' : 'text-zinc-500'}
                                                                        `}
                                                                    >
                                                                        {availableForThisFeature.includes('disabled') && <option value="disabled">Locked (Hidden)</option>}
                                                                        {availableForThisFeature.includes('alpha') && <option value="alpha">Alpha (Lab Mode)</option>}
                                                                        {availableForThisFeature.includes('beta') && <option value="beta">Beta (Preview)</option>}
                                                                        {availableForThisFeature.includes('live') && <option value="live">Live (Production)</option>}
                                                                    </select>
                                                                </div>
                                                                <div className="flex flex-col gap-1.5">
                                                                    <label className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">Dev Ring</label>
                                                                    <select 
                                                                        value={currentDevVersion} 
                                                                        onChange={(e) => handleUpdateFeature(feature.id, e.target.value as FeatureVersion, true)}
                                                                        className={`w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-2 text-xs font-bold outline-none cursor-pointer appearance-none transition-colors
                                                                            ${currentDevVersion === 'live' ? 'text-emerald-400' : 
                                                                              currentDevVersion === 'beta' ? 'text-blue-400' : 
                                                                              currentDevVersion === 'alpha' ? 'text-purple-400' : 'text-zinc-500'}
                                                                        `}
                                                                    >
                                                                        {availableForThisFeature.includes('disabled') && <option value="disabled">Locked (Hidden)</option>}
                                                                        {availableForThisFeature.includes('alpha') && <option value="alpha">Alpha (Lab Mode)</option>}
                                                                        {availableForThisFeature.includes('beta') && <option value="beta">Beta (Preview)</option>}
                                                                        {availableForThisFeature.includes('live') && <option value="live">Live (Production)</option>}
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            )}

                        </div>
                    )}

                    {activeTab === 'users' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h2 className="text-2xl font-bold flex items-center gap-2">
                                    <Users className="w-6 h-6 text-accent" /> Network Identity Matrix
                                </h2>
                            </div>
                            
                            <div className="bg-zinc-900/50 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-zinc-900 text-left text-xs font-bold text-zinc-500 uppercase tracking-wider">
                                                <th className="p-4 pl-6">Platform Identity</th>
                                                <th className="p-4">Contact</th>
                                                <th className="p-4 text-center">Global Role</th>
                                                <th className="p-4">Tenant Mapping</th>
                                                <th className="p-4 text-right pr-6">Joined</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/50">
                                            {loading ? (
                                                <tr><td colSpan={5} className="p-8 text-center text-zinc-500">Scanning global identity matrix...</td></tr>
                                            ) : globalUsers.length === 0 ? (
                                                <tr><td colSpan={5} className="p-8 text-center text-zinc-500">No identities found in the ecosystem.</td></tr>
                                            ) : (
                                                globalUsers.map((user) => (
                                                    <tr key={user.uid} className="hover:bg-white/[0.02] transition-colors cursor-pointer group">
                                                        <td className="p-4 pl-6">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs">
                                                                    {(user.displayName || user.email || 'U').substring(0, 1).toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <span className="font-bold text-sm text-zinc-200 group-hover:text-white transition-colors block">{user.displayName || 'Un-named User'}</span>
                                                                    <span className="text-[10px] text-zinc-600 font-mono tracking-tighter">{user.uid}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="text-sm font-medium text-zinc-400">{user.email}</span>
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            <span className={`inline-flex items-center justify-center text-xs font-bold px-2 py-1 rounded border min-w-[5rem] uppercase tracking-wider
                                                                ${user.role === 'system_owner' ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20' :
                                                                user.role === 'super_admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 
                                                                user.role === 'business_owner' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                                                                'bg-zinc-800 text-zinc-400 border-zinc-700'}
                                                            `}>
                                                                {user.role}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className={`text-xs font-bold border px-2 py-1 rounded
                                                                ${user.tenantId === 'unassigned' ? 'text-zinc-500 border-zinc-500 border-dashed' : 'text-zinc-300 border-zinc-600'}
                                                            `}>
                                                                {user.tenantId === 'unassigned' ? 'Unassigned' : 
                                                                 user.tenantId === 'GLOBAL' ? 'Global Platform' :
                                                                 businesses.find(b => b.id === user.tenantId)?.name || user.tenantId}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 pr-6 flex items-center justify-end gap-3 mt-1">
                                                             <span className="text-xs text-zinc-500">{new Date(user.creationTime).toLocaleDateString()}</span>
                                                             {user.uid !== currentUser?.uid && (
                                                                 <button onClick={(e) => { e.stopPropagation(); handleImpersonate(user.uid); }} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-accent hover:text-white text-zinc-400 flex items-center justify-center transition-colors" title="View As User">
                                                                     <Eye className="w-4 h-4" />
                                                                 </button>
                                                             )}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'pricing' && (
                        <div className="space-y-4">
                            <h2 className="text-2xl font-bold flex items-center gap-2 mb-6">
                                <CreditCard className="w-6 h-6 text-accent" /> Global Pricing Config
                            </h2>
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                                <Database className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-white mb-2">Platform Economics</h3>
                                <p className="text-zinc-500 max-w-md mx-auto">This module will interface with the core billing engine to define platform-wide Subscription Tiers, feature gating flags, and direct a-la-carte upgrades for businesses.</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="space-y-4">
                            <h2 className="text-2xl font-bold flex items-center gap-2 mb-6">
                                <Settings className="w-6 h-6 text-accent" /> System Settings
                            </h2>
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                                <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-white mb-2">Infrastructure Controls</h3>
                                <p className="text-zinc-500 max-w-md mx-auto">Global kill-switches, API rate limit overrides, and system-wide maintenance mode toggles.</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'analytics' && (
                        <div className="h-[800px] bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                            <AuditLogsTab tenantId="SYSTEM" />
                        </div>
                    )}

                    {activeTab === 'dictionary' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-2xl font-bold flex items-center gap-2">
                                    <Key className="w-6 h-6 text-accent" /> Upfitter OS Architecture
                                </h2>
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-black uppercase px-3 py-1.5 rounded-lg tracking-widest">Global Governance Active</span>
                            </div>
                            
                            <p className="text-zinc-400 text-sm max-w-3xl leading-relaxed">
                                This dictionary outlines the hardcoded platform capabilities mapped to baseline ecosystem identities. Custom Business roles stack additively on top of these defaults across individual workspaces. Super Admins bypass all flags universally.
                            </p>

                            <div className="bg-zinc-900/50 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden mt-6">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left whitespace-nowrap">
                                        <thead className="text-xs text-zinc-500 uppercase bg-zinc-900 border-b border-zinc-800 tracking-wider">
                                            <tr>
                                                <th className="px-6 py-4 font-black">Capability Target</th>
                                                <th className="px-6 py-4 text-center font-bold">Business Owner (Default)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/50">
                                            {Object.entries(PERMISSION_LABELS).map(([key, info]) => {
                                                if (key === 'super_admin_core') return null; // Skip skeleton key
                                                return (
                                                    <tr key={key} className="hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-zinc-200">{info.label}</span>
                                                                <span className="text-[10px] text-zinc-500 font-mono mt-0.5">{key}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            {DEFAULT_PERMISSIONS['business_owner']?.[key as keyof typeof PERMISSION_LABELS] 
                                                                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" /> 
                                                                : <span className="text-zinc-700">-</span>}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'modules' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center mb-2">
                                <div>
                                    <h2 className="text-2xl font-bold flex items-center gap-2">
                                        <Package className="w-6 h-6 text-accent" /> Platform Module Registry
                                    </h2>
                                    <p className="text-zinc-400 mt-1 max-w-2xl">
                                        Toggle which deployment rings (Alpha, Beta, Live) are physically available for provisioning to businesses. Enabling a ring globally allows managers to assign it.
                                    </p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                                {APP_FEATURES.map(feature => {
                                    return (
                                        <div key={feature.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-[40px] -mr-10 -mt-10 group-hover:bg-accent/10 transition-colors pointer-events-none"></div>
                                            <h3 className="text-lg font-black text-white tracking-tight mb-1 relative z-10">{feature.name}</h3>
                                            <p className="text-xs text-zinc-500 mb-6 font-medium relative z-10">{feature.description}</p>
                                            
                                            <div className="space-y-2.5 relative z-10">
                                                {['alpha', 'beta', 'live'].map((v) => {
                                                    const ver = v as FeatureVersion;
                                                    const isEnabled = feature.availableVersions.includes(ver);
                                                    return (
                                                        <div key={v} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isEnabled ? 'bg-zinc-950/50 border-accent/30' : 'bg-zinc-950 border-zinc-800 opacity-50'}`}>
                                                            <div className="flex justify-between items-center w-full">
                                                                <span className={`text-[10px] uppercase font-black tracking-widest ${isEnabled ? (v === 'live' ? 'text-emerald-400' : v === 'beta' ? 'text-blue-400' : 'text-purple-400') : 'text-zinc-600'}`}>
                                                                    {v} Ring
                                                                </span>
                                                                <span className={`text-[9px] font-bold uppercase tracking-widest ${isEnabled ? 'text-accent' : 'text-zinc-600'}`}>
                                                                    {isEnabled ? 'Available' : 'Pending Build'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === 'builds' && (
                        <div className="space-y-6">
                            <BuildLogAdminTab />
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
