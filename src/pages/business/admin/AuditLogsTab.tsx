import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../contexts/AuthContext';
import { Activity, Search, ShieldAlert, Monitor, User } from 'lucide-react';

export function AuditLogsTab({ tenantId }: { tenantId: string }) {
    const { role } = useAuth();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({
        pageViews: false, // Default to false so it doesn't flood the UI instantly
        logins: true,
        crud: true,
        other: true,
        hideImpersonated: true // Filtered by default per user request
    });
    const [roleFilter, setRoleFilter] = useState<'all' | 'staff' | 'user'>('all');
    const [actorFilter, setActorFilter] = useState<'all' | string>('all');

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const isSuperAdmin = role === 'super_admin' || role === 'system_owner';
            
            const logsRef = collection(db, 'auditLogs');
            let q;

            // Tiering: Super Admins can see EVERYTHING if they want, but here we query based on the active viewed tenant. 
            // If they are on a specific tenant's admin suite, we show that tenant's logs.
            // If they are in the Global Platform tier, they might see all (not implemented here yet).
            if (isSuperAdmin && tenantId === 'SYSTEM') {
                q = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
            } else {
                q = query(logsRef, where('tenantId', '==', tenantId), orderBy('timestamp', 'desc'), limit(100));
            }

            const qs = await getDocs(q);
            const data = qs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLogs(data);
        } catch (error) {
            console.error("Failed to fetch audit logs", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (tenantId) fetchLogs();
    }, [tenantId, role]);

    const getActionColor = (action: string) => {
        switch (action) {
            case 'CREATE': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'UPDATE': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
            case 'DELETE': return 'text-red-400 bg-red-400/10 border-red-400/20';
            case 'IMPERSONATE': return 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20';
            case 'LOGIN':
            case 'LOGOUT': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
            case 'PAGE_VIEW': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
            default: return 'text-zinc-400 bg-zinc-800 border-zinc-700';
        }
    };

    // Calculate Stats (GA style)
    const now = new Date().getTime();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const fiveMinsAgo = now - 5 * 60 * 1000;

    let todaysPageViews = 0;
    let todaysLogins = 0;
    const todayActors = new Set<string>();
    const activeActors = new Set<string>();

    logs.forEach(log => {
        // Skip strictly simulated actions from overall KPI stats if we are hiding impersonations, 
        // to prevent false positives in "real user data"
        if (filters.hideImpersonated && log.isImpersonated) return;

        if (!log.timestamp) return;
        const logTime = log.timestamp.seconds * 1000;
        
        if (logTime >= oneDayAgo) {
            if (log.action === 'PAGE_VIEW') todaysPageViews++;
            if (log.action === 'LOGIN') todaysLogins++;
            if (log.actorEmail) todayActors.add(log.actorEmail);
        }
        
        if (logTime >= fiveMinsAgo && log.actorEmail) {
            activeActors.add(log.actorEmail);
        }
    });

    const uniqueActors = Array.from(new Set(logs.map(l => l.actorEmail).filter(Boolean))).sort();

    const filteredLogs = logs.filter(log => {
        const isPageView = log.action === 'PAGE_VIEW';
        const isLogin = log.action === 'LOGIN' || log.action === 'LOGOUT';
        const isCrud = ['CREATE', 'READ', 'UPDATE', 'DELETE'].includes(log.action);
        const isOther = !isPageView && !isLogin && !isCrud;
        const isStaffRole = ['staff', 'admin', 'super_admin', 'system_owner', 'manager'].includes((log.role || '').toLowerCase());

        if (actorFilter !== 'all' && log.actorEmail !== actorFilter) return false;

        if (roleFilter === 'staff' && !isStaffRole) return false;
        if (roleFilter === 'user' && isStaffRole) return false;

        if (filters.hideImpersonated && log.isImpersonated) return false;


        if (!filters.pageViews && isPageView) return false;
        if (!filters.logins && isLogin) return false;
        if (!filters.crud && isCrud) return false;
        if (!filters.other && isOther) return false;

        if (!searchTerm) return true;
        
        return (log.actorEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
               (log.resource || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
               (log.action || '').toLowerCase().includes(searchTerm.toLowerCase());
    });

    return (
        <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
            <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                        <Activity className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Audit & Security Logs</h2>
                        <p className="text-zinc-500 font-mono text-sm">System-level telemetry & action history.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 pb-0">
                <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><User className="w-12 h-12 text-emerald-400" /></div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">Active Now (5m)</p>
                    <p className="text-3xl font-black text-white">{activeActors.size}</p>
                    <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Live Visitors</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-lg relative overflow-hidden group hover:border-purple-500/30 transition-colors">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Activity className="w-12 h-12 text-purple-400" /></div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">Page Views (24h)</p>
                    <p className="text-3xl font-black text-white">{todaysPageViews.toLocaleString()}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-lg relative overflow-hidden group hover:border-blue-500/30 transition-colors">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><ShieldAlert className="w-12 h-12 text-blue-400" /></div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">Logins (24h)</p>
                    <p className="text-3xl font-black text-white">{todaysLogins}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-colors">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Monitor className="w-12 h-12 text-amber-400" /></div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">Unique Users (24h)</p>
                    <p className="text-3xl font-black text-white">{todayActors.size}</p>
                </div>
            </div>

            <div className="p-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="p-4 border-b border-zinc-800 flex items-center gap-4 bg-zinc-900/50">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input 
                                type="text" 
                                placeholder="Search logs by email, resource, or action..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500/50 text-white"
                            />
                        </div>
                        <div className="flex items-center gap-3 ml-auto mr-4 hidden md:flex">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 cursor-pointer hover:text-white transition-colors">
                                <input type="checkbox" checked={filters.crud} onChange={e => setFilters({...filters, crud: e.target.checked})} className="rounded bg-zinc-950 border-zinc-700 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900" />
                                CRUD
                            </label>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 cursor-pointer hover:text-white transition-colors">
                                <input type="checkbox" checked={filters.logins} onChange={e => setFilters({...filters, logins: e.target.checked})} className="rounded bg-zinc-950 border-zinc-700 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900" />
                                Logins
                            </label>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 cursor-pointer hover:text-white transition-colors">
                                <input type="checkbox" checked={filters.pageViews} onChange={e => setFilters({...filters, pageViews: e.target.checked})} className="rounded bg-zinc-950 border-zinc-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-zinc-900" />
                                Page Views
                            </label>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-red-400 cursor-pointer hover:text-red-300 transition-colors ml-2">
                                <input type="checkbox" checked={!filters.hideImpersonated} onChange={e => setFilters({...filters, hideImpersonated: !e.target.checked})} className="rounded bg-zinc-950 border-red-700 text-red-500 focus:ring-red-500 focus:ring-offset-zinc-900" />
                                Show Impersonations
                            </label>
                            <div className="h-4 w-px bg-zinc-700 mx-1"></div>
                            <select
                                value={roleFilter}
                                onChange={e => setRoleFilter(e.target.value as any)}
                                className="bg-zinc-950 border border-zinc-700 text-xs font-bold text-zinc-400 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500/50 hover:text-white transition-colors"
                            >
                                <option value="all">All Roles</option>
                                <option value="staff">Staff Only</option>
                                <option value="user">Users Only</option>
                            </select>
                            <select
                                value={actorFilter}
                                onChange={e => setActorFilter(e.target.value)}
                                className="bg-zinc-950 border border-zinc-700 text-xs font-bold text-zinc-400 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500/50 hover:text-white transition-colors max-w-[150px] truncate"
                            >
                                <option value="all">All Personnel</option>
                                {uniqueActors.map(email => (
                                    <option key={email} value={email}>{email}</option>
                                ))}
                            </select>
                        </div>
                        <button onClick={fetchLogs} className="text-xs shrink-0 font-bold text-zinc-400 hover:text-white px-3 py-2 bg-zinc-800 rounded-lg transition-colors border border-zinc-700">Refresh Data</button>
                    </div>

                    <div className="overflow-x-auto min-h-[500px]">
                        {loading ? (
                            <div className="p-8 text-center text-zinc-500 font-bold">Loading telemetry data...</div>
                        ) : filteredLogs.length === 0 ? (
                            <div className="p-12 text-center flex flex-col items-center">
                                <ShieldAlert className="w-12 h-12 text-zinc-700 mb-4" />
                                <p className="text-zinc-400 font-bold">No audit logs found for this scope.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left text-sm text-zinc-400 border-collapse">
                                <thead className="bg-zinc-950/50 text-xs uppercase tracking-widest text-zinc-500 border-b border-zinc-800">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Timestamp</th>
                                        <th className="px-4 py-3 font-medium">Actor</th>
                                        <th className="px-4 py-3 font-medium">Action & Resource</th>
                                        <th className="px-4 py-3 font-medium">Browser & Device</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50">
                                    {filteredLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="text-zinc-300 font-bold">{log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleDateString() : 'Just now'}</span>
                                                    <span className="text-zinc-600 font-mono text-[10px]">{log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString() : ''}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${log.isImpersonated ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-zinc-800 text-zinc-500'}`}>
                                                        <User className="w-3 h-3" />
                                                    </div>
                                                    <div className="flex flex-col max-w-[150px]">
                                                        <span className={`truncate text-xs font-bold ${log.isImpersonated ? 'text-red-400' : 'text-zinc-300'}`}>{log.actorEmail}</span>
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[9px] font-mono text-zinc-500 uppercase">{log.role || 'Unknown'}</span>
                                                            {log.isImpersonated && <span className="text-[8px] font-black tracking-widest text-red-500 bg-red-500/10 px-1 py-0.5 rounded border border-red-500/20">IMPERSONATED</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-wider ${getActionColor(log.action)}`}>
                                                        {log.action}
                                                    </span>
                                                    <span className="text-xs font-mono text-zinc-400 truncate max-w-xs block" title={log.resource}>{log.resource}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {log.browserData ? (
                                                    <div className="flex flex-col group relative">
                                                        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                                                            <Monitor className="w-3.5 h-3.5 text-zinc-600" />
                                                            <span className="truncate max-w-[120px]">{log.browserData.platform || 'Unknown'}</span>
                                                            <span className="text-[10px] text-zinc-600">({log.browserData.screenWidth}x{log.browserData.screenHeight})</span>
                                                        </div>
                                                        <div className="hidden group-hover:block absolute z-20 bottom-full left-0 mb-2 p-3 bg-zinc-800 text-xs text-zinc-300 rounded-lg shadow-xl border border-zinc-700 min-w-[300px]">
                                                            <b>User Agent:</b> {log.browserData.userAgent}<br/>
                                                            <b>Viewport:</b> {log.browserData.screenWidth}x{log.browserData.screenHeight}<br/>
                                                            <b>Timezone:</b> {log.browserData.timezone}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-zinc-600 uppercase font-bold tracking-wider">No Telemetry</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
