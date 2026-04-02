import { useState, useEffect } from 'react';
import { Users, Building2, UserCircle, Briefcase, Mail, Phone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';

export function Coworkers() {
    const { currentUser } = useAuth();
    
    const [staff, setStaff] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStaff = async () => {
            if (!currentUser) return;
            try {
                const idTokenResult = await currentUser.getIdTokenResult();
                const activeTenant = idTokenResult.claims.tenantId as string;
                
                if (!activeTenant || activeTenant === 'GLOBAL' || activeTenant === 'unassigned') {
                    setLoading(false);
                    return;
                }

                // Any user bound to the activeTenant is legally allowed to read this roster
                const res = await api.get(`/businesses/${activeTenant}/staff`);
                setStaff(res.data);
                
            } catch (err) {
                console.error("Failed to load coworker directory", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStaff();
    }, [currentUser]);

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="max-w-6xl mx-auto relative z-10 space-y-10">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 pb-6 border-b border-zinc-800/50">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shadow-inner">
                                <Building2 className="w-4 h-4 text-zinc-400" />
                            </div>
                            <span className="text-sm font-bold text-zinc-500 uppercase tracking-widest leading-none">Internal Network</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight">Company Directory</h1>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="bg-accent/20 text-accent border border-accent/30 text-xs font-black tracking-wider px-3 py-1.5 rounded-lg flex items-center gap-2">
                            <Users className="w-4 h-4" /> {staff.length} Active Staff
                        </span>
                    </div>
                </div>

                {/* Read-Only Directory Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? (
                        <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center py-12 text-zinc-500 font-bold tracking-widest uppercase">
                            Securely Handshaking Directory...
                        </div>
                    ) : staff.length === 0 ? (
                        <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-zinc-900/40 border border-zinc-800 rounded-3xl p-12 text-center text-zinc-500 flex flex-col items-center justify-center">
                            <Users className="w-12 h-12 mb-4 text-zinc-700" />
                            <h3 className="text-lg font-bold text-zinc-300 mb-2">No Active Identities Found</h3>
                            <p>There are no staff members officially bound to your operational workspace.</p>
                        </div>
                    ) : (
                        staff.map(user => (
                            <div key={user.uid} className="bg-zinc-900/40 backdrop-blur-md p-6 rounded-3xl border border-zinc-800/80 hover:border-zinc-700/80 transition-all hover:shadow-xl hover:-translate-y-1 flex flex-col group">
                                
                                {/* Top Identity / Role Row */}
                                <div className="flex items-start justify-between mb-4">
                                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/5 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform overflow-hidden">
                                        {user.photoURL ? (
                                            <img src={user.photoURL} alt={user.displayName || "Avatar"} className="w-full h-full object-cover" />
                                        ) : user.displayName ? (
                                            <span className="text-2xl font-black text-zinc-300">{user.displayName.charAt(0).toUpperCase()}</span>
                                        ) : (
                                            <UserCircle className="w-10 h-10 text-zinc-500" />
                                        )}
                                    </div>
                                    <span className={`inline-flex items-center text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest border
                                        ${user.role === 'business_owner' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.1)]' : 
                                        user.role === 'manager' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                                        user.role === 'department_lead' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                        'bg-zinc-800 text-zinc-400 border-zinc-700'}
                                    `}>
                                        <Briefcase className="w-3 h-3 mr-1.5" /> {user.role.replace('_', ' ')}
                                    </span>
                                </div>
                                
                                {/* Employee Details */}
                                <div className="mb-4">
                                    <h4 className="font-black text-white text-2xl leading-tight truncate group-hover:text-accent transition-colors">{user.displayName || 'Provisioned Identity'}</h4>
                                    
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-sm font-bold text-zinc-300 truncate">{user.jobTitle || 'Staff Member'}</span>
                                        {user.department && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-zinc-700"></span>
                                                <span className="text-sm font-medium text-zinc-500 truncate">{user.department}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Bio Snippet */}
                                <div className="mb-6 h-12">
                                    <p className="text-xs text-zinc-500 italic line-clamp-2 leading-relaxed">
                                        {user.bio ? `"${user.bio}"` : 'No professional biography provided.'}
                                    </p>
                                </div>
                                
                                {/* Contact Drawer */}
                                <div className="mt-auto pt-5 border-t border-zinc-800/50 flex flex-col gap-3">
                                    <div className="flex items-center gap-3 text-sm font-medium group/link">
                                        <div className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-500 group-hover/link:text-accent group-hover/link:border-accent/30 transition-colors">
                                            <Mail className="w-4 h-4" />
                                        </div>
                                        <a href={`mailto:${user.email}`} className="text-zinc-400 hover:text-white transition-colors truncate flex-1">
                                            {user.email}
                                        </a>
                                    </div>
                                    
                                    {user.phone && (
                                        <div className="flex items-center gap-3 text-sm font-medium group/link">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-500 group-hover/link:text-accent group-hover/link:border-accent/30 transition-colors">
                                                <Phone className="w-4 h-4" />
                                            </div>
                                            <a href={`tel:${user.phone}`} className="text-zinc-400 hover:text-white transition-colors truncate flex-1">
                                                {user.phone}
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
