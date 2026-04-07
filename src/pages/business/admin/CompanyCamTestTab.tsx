import { useState, useEffect } from 'react';
import { RefreshCw, Camera, FolderOpen } from 'lucide-react';
import { api } from '../../../lib/api';
import toast from 'react-hot-toast';

export function CompanyCamTestTab({ tenantId }: { tenantId: string }) {
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState<any[]>([]);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/companycam/projects?tenantId=${tenantId}`);
            setProjects(res.data);
            toast.success("Fetched CompanyCam projects");
        } catch (err: any) {
            console.error("Failed to fetch CompanyCam projects", err);
            toast.error(err.response?.data?.error || "Failed to fetch projects. Make sure it's connected.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, [tenantId]);

    return (
        <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full p-6 md:p-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                        <Camera className="w-6 h-6 text-blue-500" />
                        CompanyCam Data Sync
                    </h2>
                    <p className="text-zinc-500 text-sm mt-1">
                        This is a live API test pulling data directly from your connected CompanyCam account.
                    </p>
                </div>
                <button
                    onClick={fetchProjects}
                    disabled={loading}
                    className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-accent' : ''}`} />
                    Refresh Feed
                </button>
            </div>

            {loading && projects.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                    <p className="font-bold uppercase tracking-widest text-sm">Querying CompanyCam API...</p>
                </div>
            ) : projects.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center text-zinc-500 flex flex-col items-center justify-center">
                    <FolderOpen className="w-12 h-12 mb-4 text-zinc-700" />
                    <h3 className="text-lg font-bold text-zinc-300 mb-2">No Projects Found</h3>
                    <p>We successfully connected, but no projects were returned from CompanyCam.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projects.map((proj: any) => (
                        <div key={proj.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-blue-500/50 transition-colors flex flex-col">
                            <div className="flex items-start justify-between mb-4">
                                <h3 className="text-lg font-bold text-white leading-tight">{proj.name}</h3>
                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md ${proj.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                                    {proj.status}
                                </span>
                            </div>
                            
                            <div className="space-y-4 mb-4">
                                <div>
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Address</span>
                                    <p className="text-zinc-300 text-sm">{proj.address?.street_address_1 || 'No address'}</p>
                                    <p className="text-zinc-500 text-sm">{proj.address?.city}, {proj.address?.state}</p>
                                </div>
                            </div>

                            <div className="mt-auto border-t border-zinc-800/50 pt-4 flex items-center justify-between">
                                <span className="text-xs font-bold text-zinc-500">{new Date(proj.created_at * 1000).toLocaleDateString()}</span>
                                <div className="text-xs bg-zinc-950 font-mono px-2 py-1 rounded border border-zinc-800 text-zinc-400">
                                    ID: {proj.id}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
