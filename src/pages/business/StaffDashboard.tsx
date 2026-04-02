import { useState, useEffect } from 'react';
import { Users, PlusCircle, Building2, Trash2, Edit2, ClipboardList, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

export function StaffDashboard() {
    const { currentUser } = useAuth();
    
    const [staff, setStaff] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [tenantId, setTenantId] = useState<string | null>(null);

    // Invite Form
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('staff');
    const [isInviting, setIsInviting] = useState(false);

    // Metadata Editing
    const [editingUid, setEditingUid] = useState<string | null>(null);
    const [metadataEdit, setMetadataEdit] = useState({ jobTitle: '', department: '' });
    const [isSavingMetadata, setIsSavingMetadata] = useState(false);

    // Tasks Management Modal
    const [selectedUserForTasks, setSelectedUserForTasks] = useState<any | null>(null);
    const [isAssigningTask, setIsAssigningTask] = useState(false);

    const fetchData = async (activeTenant: string) => {
        try {
            const [staffRes, tasksRes] = await Promise.all([
                api.get(`/businesses/${activeTenant}/staff`),
                api.get(`/tasks?tenantId=${activeTenant}`)
            ]);
            setStaff(staffRes.data);
            setTasks(tasksRes.data);
        } catch (err) {
            console.error("Failed to load ecosystem data", err);
        }
    };

    useEffect(() => {
        const fetchClaimsAndStaff = async () => {
            if (!currentUser) return;
            try {
                const idTokenResult = await currentUser.getIdTokenResult();
                const activeTenant = idTokenResult.claims.tenantId as string;
                
                if (!activeTenant || activeTenant === 'GLOBAL' || activeTenant === 'unassigned') {
                    setLoading(false);
                    return;
                }

                setTenantId(activeTenant);
                await fetchData(activeTenant);
            } catch (err) {
                console.error("Failed to authenticate workspace", err);
            } finally {
                setLoading(false);
            }
        };

        fetchClaimsAndStaff();
    }, [currentUser]);

    const handleInviteStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenantId) return;

        try {
            setIsInviting(true);
            await api.post(`/businesses/${tenantId}/staff`, {
                email: inviteEmail,
                role: inviteRole
            });
            setInviteEmail('');
            setInviteRole('staff');
            
            await fetchData(tenantId);
            toast.success("Global identity successfully bound to your workspace.");
            
        } catch (err) {
            console.error("Failed to invite staff", err);
            toast.error("Failed to bind user to your workspace. Please verify you have Owner permissions.");
        } finally {
            setIsInviting(false);
        }
    };

    const handleDeleteUser = async (uid: string, email: string) => {
        if (!tenantId) return;
        if (!window.confirm(`Are you absolutely sure you want to permanently delete the identity for ${email}?`)) return;
        
        try {
            await api.delete(`/businesses/${tenantId}/staff/${uid}`);
            await fetchData(tenantId);
            toast.success("Identity permanently eradicated from your workspace.");
        } catch (err) {
            console.error("Failed to delete user", err);
            toast.error("Failed to delete user identity.");
        }
    };

    const handleRoleChange = async (uid: string, newRole: string) => {
        if (!tenantId) return;
        try {
            await api.post('/roles/assign', {
                targetUid: uid,
                role: newRole,
                tenantId: tenantId
            });
            await fetchData(tenantId);
            toast.success("Operational role shifted.");
        } catch (err) {
            console.error("Failed to reassign role", err);
            toast.error("Failed to assign new role.");
        }
    };

    const handleUpdateMetadata = async (uid: string) => {
        if (!tenantId) return;
        try {
            setIsSavingMetadata(true);
            await api.post(`/businesses/${tenantId}/staff/${uid}/metadata`, {
                jobTitle: metadataEdit.jobTitle,
                department: metadataEdit.department
            });
            await fetchData(tenantId);
            setEditingUid(null);
            toast.success("Identity metadata securely updated.");
        } catch (err) {
            console.error("Failed to update user metadata", err);
            toast.error("Failed to synchronize metadata to the identity profile.");
        } finally {
            setIsSavingMetadata(false);
        }
    };

    const handleAssignInterview = async (uid: string) => {
        if (!tenantId) return;
        try {
            setIsAssigningTask(true);
            await api.post('/tasks', {
                tenantId,
                assigneeUid: uid,
                type: 'interview',
                title: 'Staff Assessment & Feedback Interview'
            });
            toast.success("Interview task successfully assigned.");
            await fetchData(tenantId);
        } catch (err) {
            console.error("Failed to assign task", err);
            toast.error("Failed to assign new task.");
        } finally {
            setIsAssigningTask(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold">Authenticating Workspace...</div>;
    }

    if (!tenantId) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center p-6">
                <Building2 className="w-16 h-16 text-zinc-800 mb-6" />
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">No Workspace Assigned</h2>
                <p className="text-zinc-500 max-w-md">Your operational identity is not currently bound to an active tenant. If you believe this is an error, please contact the System Administrator.</p>
            </div>
        );
    }

    // Modal view for user tasks
    const activeUserTasks = selectedUserForTasks ? tasks.filter(t => t.assigneeUid === selectedUserForTasks.uid) : [];

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8 relative">
            
            {/* User Tasks Modal */}
            {selectedUserForTasks && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <ClipboardList className="w-5 h-5 text-accent" /> Tasks: {selectedUserForTasks.displayName || selectedUserForTasks.email}
                                </h3>
                                <p className="text-sm text-zinc-500 mt-1">Manage performance assessments and assignments.</p>
                            </div>
                            <button onClick={() => setSelectedUserForTasks(null)} className="text-zinc-500 hover:text-white transition-colors bg-zinc-800 p-2 rounded-full">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 flex-1 overflow-y-auto space-y-4">
                            <div className="flex justify-end mb-4">
                                <button 
                                    onClick={() => handleAssignInterview(selectedUserForTasks.uid)}
                                    disabled={isAssigningTask}
                                    className="bg-accent/10 border border-accent/20 text-accent hover:bg-accent hover:text-white text-sm font-bold py-2 px-4 rounded-xl transition-all disabled:opacity-50"
                                >
                                    {isAssigningTask ? 'Assigning...' : '+ Assign New Interview'}
                                </button>
                            </div>

                            {activeUserTasks.length === 0 ? (
                                <div className="text-center py-12 text-zinc-500 font-medium border border-dashed border-zinc-800 rounded-xl">
                                    No tasks have been assigned to this user yet.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {activeUserTasks.map(task => (
                                        <div key={task.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 shadow-inner">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h4 className="text-lg font-bold text-white">{task.title}</h4>
                                                    <span className="text-xs text-zinc-500">Created: {new Date(task.createdAt?._seconds * 1000 || Date.now()).toLocaleDateString()}</span>
                                                </div>
                                                <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md border ${task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                                                    {task.status}
                                                </span>
                                            </div>

                                            {task.type === 'interview' && task.status === 'completed' && task.feedback && (
                                                <div className="space-y-4 mt-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                                                    <div>
                                                        <h5 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">The Good</h5>
                                                        <p className="text-sm text-zinc-300">{task.feedback.good || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <h5 className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">The Bad & The Ugly</h5>
                                                        <p className="text-sm text-zinc-300">{task.feedback.badUgly || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <h5 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Wish List</h5>
                                                        <p className="text-sm text-zinc-300">{task.feedback.wishlist || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <h5 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Position Thoughts</h5>
                                                        <p className="text-sm text-zinc-300">{task.feedback.positionNotes || 'N/A'}</p>
                                                    </div>
                                                </div>
                                            )}
                                            {task.status === 'pending' && (
                                                <p className="text-sm text-zinc-500 italic mt-2">Awaiting completion by the employee.</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-5xl mx-auto space-y-8">
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-white mb-1">Company Staff</h1>
                        <p className="text-sm font-medium text-zinc-500">Manage operational access, secure identities, and performance tasks.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Active Roster Panel */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 shadow-2xl">
                            <h3 className="text-lg font-bold flex items-center gap-2 mb-6 text-white tracking-tight">
                                <Users className="w-5 h-5 text-accent" /> Active Roster
                            </h3>
                            
                            <div className="space-y-3">
                                {staff.map(user => {
                                    const pendingTasksCount = tasks.filter(t => t.assigneeUid === user.uid && t.status === 'pending').length;
                                    
                                    return (
                                        <div key={user.uid} className={`bg-zinc-950 p-4 rounded-xl border transition-colors group ${editingUid === user.uid ? 'border-accent/50' : 'border-zinc-800 hover:border-zinc-700'}`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm text-zinc-200 group-hover:text-white transition-colors">{user.displayName || 'Provisioned Employee'}</span>
                                                        {user.jobTitle && <span className="text-[10px] font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">{user.jobTitle}</span>}
                                                    </div>
                                                    <span className="text-xs text-zinc-500">{user.email}</span>
                                                    {pendingTasksCount > 0 && (
                                                        <span className="text-[10px] text-orange-400 font-bold mt-1 inline-block">
                                                            {pendingTasksCount} Pending Task{pendingTasksCount > 1 ? 's' : ''}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-right flex flex-wrap items-center justify-end gap-2">
                                                    <select 
                                                        value={user.role} 
                                                        onChange={(e) => handleRoleChange(user.uid, e.target.value)}
                                                        className="bg-zinc-800 border border-zinc-700 hover:border-accent text-zinc-300 text-[10px] font-black uppercase tracking-wider px-2 py-1.5 rounded shadow-sm appearance-none outline-none cursor-pointer text-center-last"
                                                    >
                                                        <option value="business_owner">BUSINESS_OWNER</option>
                                                        <option value="manager">MANAGER</option>
                                                        <option value="department_lead">DEPARTMENT_LEAD</option>
                                                        <option value="parts_guy">PARTS_GUY</option>
                                                        <option value="staff">STAFF</option>
                                                        <option value="super_admin" disabled>SUPER_ADMIN</option>
                                                    </select>
                                                    
                                                    <button 
                                                        onClick={() => setSelectedUserForTasks(user)}
                                                        className="bg-zinc-900 border border-zinc-700 p-1.5 rounded hover:bg-emerald-500/10 hover:border-emerald-500/30 text-emerald-400 transition-colors ml-1 flex items-center gap-1"
                                                        title="Manage Tasks & Interviews"
                                                    >
                                                        <ClipboardList className="w-3.5 h-3.5" />
                                                    </button>
                                                    
                                                    <button 
                                                        onClick={() => {
                                                            if (editingUid === user.uid) {
                                                                setEditingUid(null);
                                                            } else {
                                                                setEditingUid(user.uid);
                                                                setMetadataEdit({ jobTitle: user.jobTitle || '', department: user.department || '' });
                                                            }
                                                        }}
                                                        className={`p-1.5 rounded transition-colors ${editingUid === user.uid ? 'bg-accent text-white' : 'bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white'}`}
                                                        title="Modify Base Identity Metadata"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteUser(user.uid, user.email)} 
                                                        className="bg-zinc-900 border border-zinc-700 p-1.5 rounded text-zinc-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500 transition-colors ml-1" 
                                                        title="Eradicate Identity"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {editingUid === user.uid && (
                                                <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-col sm:flex-row gap-3 items-end">
                                                    <div className="w-full sm:w-1/2">
                                                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Rank / Job Title</label>
                                                        <input 
                                                            type="text" 
                                                            value={metadataEdit.jobTitle} 
                                                            onChange={(e) => setMetadataEdit({...metadataEdit, jobTitle: e.target.value})}
                                                            placeholder="Lead Technician"
                                                            className="w-full bg-zinc-900 border border-zinc-700 focus:border-accent rounded text-sm px-3 py-2 text-white outline-none"
                                                        />
                                                    </div>
                                                    <div className="w-full sm:w-1/2">
                                                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Department assignment</label>
                                                        <input 
                                                            type="text" 
                                                            value={metadataEdit.department} 
                                                            onChange={(e) => setMetadataEdit({...metadataEdit, department: e.target.value})}
                                                            placeholder="Service Area B"
                                                            className="w-full bg-zinc-900 border border-zinc-700 focus:border-accent rounded text-sm px-3 py-2 text-white outline-none"
                                                        />
                                                    </div>
                                                    <button 
                                                        disabled={isSavingMetadata}
                                                        onClick={() => handleUpdateMetadata(user.uid)}
                                                        className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs uppercase px-4 py-2.5 rounded shadow-sm disabled:opacity-50 transition-colors shrink-0"
                                                    >
                                                        {isSavingMetadata ? 'Saving...' : 'Save Metadata'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {staff.length === 0 && (
                                    <div className="py-12 text-center text-zinc-500 text-sm font-medium border border-dashed border-zinc-800 rounded-2xl">
                                        No staff identities are currently bound to this commercial workspace.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Binding Panel */}
                    <div className="space-y-4">
                        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-white/5 rounded-3xl p-6 shadow-2xl sticky top-8">
                            <h3 className="text-lg font-bold flex items-center gap-2 mb-6 text-white tracking-tight">
                                <PlusCircle className="w-5 h-5 text-emerald-400" /> Delegate Access
                            </h3>
                            
                            <form onSubmit={handleInviteStaff} className="space-y-5">
                                <div>
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Employee Email</label>
                                    <input 
                                        required 
                                        type="email" 
                                        value={inviteEmail} 
                                        onChange={e => setInviteEmail(e.target.value)} 
                                        placeholder="employee@company.com" 
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white shadow-inner transition-colors" 
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Operational Role</label>
                                    <select 
                                        value={inviteRole} 
                                        onChange={e => setInviteRole(e.target.value)} 
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white shadow-inner transition-colors appearance-none"
                                    >
                                        <option value="manager">Manager</option>
                                        <option value="department_lead">Department Lead</option>
                                        <option value="parts_guy">Parts Guy</option>
                                        <option value="staff">Standard Staff / Technician</option>
                                    </select>
                                </div>
                                
                                <button 
                                    type="submit" 
                                    disabled={isInviting} 
                                    className="w-full mt-2 bg-accent text-white hover:bg-accent-hover font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
                                >
                                    {isInviting ? 'Binding Global Identity...' : 'Execute Assignment'}
                                </button>
                                
                                <p className="text-[10px] text-zinc-500 leading-relaxed font-medium text-center px-2">
                                    Executing an assignment generates a secure corporate identity and physically binds it to this server instance.
                                </p>
                            </form>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
