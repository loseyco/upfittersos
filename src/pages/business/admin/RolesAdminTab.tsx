import { useState, useEffect } from 'react';
import { ShieldAlert, Plus, Save, Trash2, Check, Lock, Edit2, User } from 'lucide-react';
import { api } from '../../../lib/api';
import toast from 'react-hot-toast';
import { usePermissions } from '../../../hooks/usePermissions';
import { PERMISSION_LABELS } from '../../../lib/permissions';
import { useAuth } from '../../../contexts/AuthContext';

export function RolesAdminTab({ tenantId }: { tenantId: string }) {
    const { startSimulation } = useAuth();
    const { businessRoles: remoteRoles, checkPermission } = usePermissions(tenantId);
    
    // We map custom roles entirely natively
    const [roles, setRoles] = useState<Record<string, { label: string, permissions: Record<string, boolean> }>>({});
    const [activeRoleKey, setActiveRoleKey] = useState<string | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    
    useEffect(() => {
        setRoles(remoteRoles || {});
        setIsLoading(false);
    }, [remoteRoles]);

    const handleCreateRole = () => {
        const rawName = prompt("Enter a name for the new Role (e.g. 'Parts Manager'):");
        if (!rawName) return;
        
        // Convert to a system key tag
        const key = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (!key) return toast.error("Invalid role name.");
        if (roles[key]) return toast.error("Role already exists!");
        
        setRoles({
            ...roles,
            [key]: { label: rawName, permissions: {} }
        });
        setActiveRoleKey(key);
        setHasUnsavedChanges(true);
    };

    const handleDeleteRole = (key: string) => {
        if (!window.confirm(`Are you sure you want to delete the custom role '${roles[key].label}'? Any users assigned this role will immediately lose these associated powers.`)) return;
        const updated = { ...roles };
        delete updated[key];
        setRoles(updated);
        if (activeRoleKey === key) setActiveRoleKey(null);
        setHasUnsavedChanges(true);
    };

    const togglePermission = (key: string, permKey: string) => {
        const roleDef = roles[key];
        if (!roleDef) return;
        
        const currentPerms = { ...roleDef.permissions };
        if (currentPerms[permKey]) {
            delete currentPerms[permKey]; // If explicitly unchecking, remove it
        } else {
            currentPerms[permKey] = true;
        }
        
        setRoles({
            ...roles,
            [key]: {
                ...roleDef,
                permissions: currentPerms
            }
        });
        setHasUnsavedChanges(true);
    };

    const handleSave = async () => {
        try {
            toast.loading("Saving role configurations...", { id: 'save_roles' });
            await api.put(`/businesses/${tenantId}`, { customRoles: roles });
            toast.success("Roles updated successfully. Changes applied to all linked staff.", { id: 'save_roles' });
            setHasUnsavedChanges(false);
        } catch (error: any) {
            console.error("Failed to save roles", error);
            const backendMsg = error?.response?.data?.raw || error?.response?.data?.error || "Failed to save role configuration.";
            toast.error(backendMsg, { id: 'save_roles', duration: 8000 });
        }
    };

    if (isLoading) return <div className="p-8 text-center text-zinc-500">Loading roles engine...</div>;

    const activeDef = activeRoleKey ? roles[activeRoleKey] : null;

    return (
        <div className="h-full flex flex-col md:flex-row">
            {/* Roles Index Pane */}
            <div className="w-full md:w-80 border-r border-zinc-800/50 bg-zinc-900/30 flex flex-col shrink-0 h-full overflow-hidden">
                <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
                    <div>
                        <h2 className="text-white font-bold text-sm tracking-wide">Workspace Roles</h2>
                        <p className="text-[10px] text-zinc-500 font-medium tracking-wider uppercase mt-1">Identity & Access Management</p>
                    </div>
                    <button 
                        onClick={handleCreateRole}
                        disabled={hasUnsavedChanges}
                        className="bg-accent/10 hover:bg-accent/20 text-accent p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Create New Role Definition"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-2">
                    {Object.keys(roles).length === 0 ? (
                        <div className="text-center p-6 bg-zinc-900 border border-zinc-800 border-dashed rounded-xl mt-4">
                            <ShieldAlert className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                            <p className="text-xs text-zinc-500 tracking-wide font-medium">No custom roles defined.</p>
                            <p className="text-[10px] text-zinc-600 mt-1">Create one to map specific permissions.</p>
                        </div>
                    ) : (
                        Object.entries(roles).map(([key, def]) => (
                            <button
                                key={key}
                                onClick={() => setActiveRoleKey(key)}
                                className={`w-full text-left px-4 py-3 rounded-xl transition-all border flex items-center justify-between group ${
                                    activeRoleKey === key 
                                    ? 'bg-accent/10 border-accent/20 shadow-lg shadow-accent/5' 
                                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'
                                }`}
                            >
                                <div>
                                    <div className={`font-bold text-sm ${activeRoleKey === key ? 'text-accent' : 'text-zinc-300 group-hover:text-white'}`}>
                                        {def.label}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 font-medium tracking-widest uppercase mt-0.5 w-[140px] truncate">
                                        ID: {key}
                                    </div>
                                </div>
                                <div className="bg-zinc-950 px-2 py-1 rounded border border-zinc-800 text-[10px] text-zinc-400 font-bold">
                                    {Object.keys(def.permissions || {}).length} Perms
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Role Assignment Definition Canvas */}
            <div className="flex-1 overflow-y-auto relative bg-zinc-950">
                {hasUnsavedChanges && (
                    <div className="sticky top-0 z-50 bg-amber-500 flex items-center justify-between px-6 py-3 shadow-lg shadow-amber-500/10">
                        <div className="flex items-center gap-3">
                            <Save className="w-4 h-4 text-black" />
                            <span className="text-sm font-black text-black">Unsaved Role Changes!</span>
                        </div>
                        <button 
                            onClick={handleSave}
                            className="bg-black text-amber-500 hover:bg-zinc-900 px-4 py-1.5 rounded-lg text-xs font-bold tracking-widest uppercase transition-colors"
                        >
                            Commit to Database
                        </button>
                    </div>
                )}
                
                {activeDef ? (
                    <div className="max-w-4xl mx-auto p-6 md:p-12">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-12">
                            <div>
                                <h1 className="text-3xl font-black text-white tracking-tight">{activeDef.label}</h1>
                                <p className="text-zinc-400 text-sm mt-3 leading-relaxed max-w-xl">
                                    Below are all ecosystem privileges natively afforded by the platform. By allocating these boolean flags to <span className="font-bold text-accent">{activeDef.label}</span>, any user assigned this role will inherit the capabilities immediately upon selection. 
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                {checkPermission('simulate_roles') && (
                                    <button 
                                        className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 px-4 py-2 rounded-xl text-amber-500 text-sm font-bold transition-all"
                                        onClick={() => {
                                            if (activeRoleKey) {
                                                startSimulation(activeRoleKey);
                                                toast.success(`Simulation Locked: ${activeDef.label}`);
                                            }
                                        }}
                                        title="Impersonate logic mappings for this role globally"
                                    >
                                        <User className="w-4 h-4" /> View As Role
                                    </button>
                                )}
                                <button className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 px-4 py-2 rounded-xl text-zinc-300 text-sm font-bold transition-all"
                                    onClick={() => {
                                        const rename = prompt("Rename role label:", activeDef.label);
                                        if (rename && rename.trim() && activeRoleKey) {
                                            setRoles({...roles, [activeRoleKey]: {...activeDef, label: rename}});
                                            setHasUnsavedChanges(true);
                                        }
                                    }}>
                                    <Edit2 className="w-4 h-4" /> Rename
                                </button>
                                <button 
                                    className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 px-4 py-2 rounded-xl text-red-500 text-sm font-bold transition-all"
                                    onClick={() => activeRoleKey && handleDeleteRole(activeRoleKey)}
                                >
                                    <Trash2 className="w-4 h-4" /> Delete Entire Role
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {Object.entries(PERMISSION_LABELS).map(([k, meta]) => {
                                // Strip super_admin permissions out of UI to prevent confusion.
                                if (k.startsWith('super_')) return null;

                                const isGranted = activeDef.permissions[k] === true;

                                return (
                                    <div 
                                        key={k} 
                                        onClick={() => togglePermission(activeRoleKey!, k)}
                                        className={`group cursor-pointer p-5 rounded-2xl border transition-all relative overflow-hidden ${
                                            isGranted 
                                                ? 'bg-accent/5 border-accent/30 shadow-[inset_0_0_20px_rgba(var(--color-accent-rgb),0.05)]' 
                                                : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className="pt-0.5">
                                                <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                                                    isGranted 
                                                        ? 'bg-accent border-accent text-zinc-950' 
                                                        : 'bg-zinc-950 border-zinc-700 text-transparent group-hover:border-zinc-500'
                                                }`}>
                                                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                                </div>
                                            </div>
                                            <div>
                                                <h3 className={`font-bold text-sm tracking-wide transition-colors ${isGranted ? 'text-accent' : 'text-zinc-300 group-hover:text-white'}`}>{meta.label}</h3>
                                                <p className="text-xs text-zinc-500 font-medium leading-relaxed mt-1.5">{meta.description}</p>
                                                <div className="mt-3 flex items-center gap-1.5">
                                                    <Lock className={`w-3 h-3 ${isGranted ? 'text-accent/60' : 'text-zinc-700'}`} />
                                                    <span className="text-[9px] font-black tracking-widest uppercase text-zinc-600">Namespace: {k}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                        <div className="w-24 h-24 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6 rotate-12">
                            <ShieldAlert className="w-10 h-10 text-zinc-700 -rotate-12" />
                        </div>
                        <h2 className="text-xl font-black text-white mb-2">No Active Context</h2>
                        <p className="text-zinc-500 text-sm max-w-md text-center text-balance">
                            Select a Custom Role from the left sidebar to explicitly configure its platform access levels, or create a brand new template.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
