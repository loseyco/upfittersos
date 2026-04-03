import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, PlusCircle, LayoutList, ListChecks, CheckCircle2, Clock } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

export function FeaturesPlanner() {
    const { currentUser, role } = useAuth();
    const navigate = useNavigate();

    const [features, setFeatures] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // New Feature State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('planned');

    useEffect(() => {
        if (role !== 'super_admin') return;

        const q = query(collection(db, 'site_features'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setFeatures(data);
            setIsLoading(false);
        }, (err) => {
            console.error("Failed to fetch features", err);
            toast.error("Failed to sync feature planner.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [role]);

    if (role !== 'super_admin') {
         return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center p-6">
                <ShieldAlert className="w-16 h-16 text-red-500/50 mb-6" />
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">Access Denied</h2>
                <p className="text-zinc-500 max-w-md">Engineering Protocol Restricted. Super Admin credentials required.</p>
                <button onClick={() => navigate('/workspace')} className="mt-8 text-accent hover:text-white transition-colors flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Return to Hub
                </button>
            </div>
        );
    }

    const handleCreateFeature = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || isSubmitting) return;

        try {
            setIsSubmitting(true);
            await addDoc(collection(db, 'site_features'), {
                title: title.trim(),
                description: description.trim(),
                status,
                apiKeysNeeded: [],
                docsLinks: [],
                whiteboardId: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                authorUid: currentUser?.uid
            });
            setShowModal(false);
            setTitle('');
            setDescription('');
            toast.success("Feature objective logged.");
        } catch (err) {
            console.error("Failed to add feature", err);
            toast.error("Failed to log feature request.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
            {/* Header Toolbar */}
            <div className="h-[72px] border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between px-6 shrink-0 relative z-10 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/admin')} className="p-2 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                            <ListChecks className="w-5 h-5 text-accent" /> Roadmap & Features Planner
                        </h2>
                        <p className="text-zinc-500 text-xs mt-0.5">Track, plan, and discuss platform engineering features.</p>
                    </div>
                </div>
                <button 
                    onClick={() => setShowModal(true)}
                    className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl font-bold text-sm shadow-xl flex items-center gap-2 transition-colors border border-accent/20"
                >
                    <PlusCircle className="w-4 h-4" /> Log Feature
                </button>
            </div>

            <div className="flex-1 p-6 md:p-8 overflow-y-auto">
                <div className="max-w-7xl mx-auto">
                    {/* View Wrapper */}
                    <div className="bg-zinc-900/50 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden">
                        {isLoading ? (
                             <div className="p-12 text-center text-zinc-500 font-bold uppercase tracking-widest text-sm animate-pulse">Syncing Roadmap...</div>
                        ) : features.length === 0 ? (
                             <div className="p-16 text-center">
                                 <LayoutList className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
                                 <h3 className="text-xl font-bold text-white mb-2">No Features Logged</h3>
                                 <p className="text-zinc-500 mb-6 max-w-sm mx-auto">Track your platform's roadmap and upcoming functionality here.</p>
                                 <button onClick={() => setShowModal(true)} className="bg-accent/10 hover:bg-accent/20 text-accent font-bold px-6 py-2.5 rounded-xl border border-accent/20 transition-colors">
                                     Log First Feature
                                 </button>
                             </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-zinc-900 text-left text-xs font-bold text-zinc-500 uppercase tracking-wider">
                                        <tr>
                                            <th className="p-4 pl-6">Feature Name</th>
                                            <th className="p-4">Status</th>
                                            <th className="p-4 text-center">API & Docs</th>
                                            <th className="p-4 text-center">Whiteboard</th>
                                            <th className="p-4 text-right pr-6">Created</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800/50">
                                        {features.map(f => (
                                            <tr key={f.id} onClick={() => navigate(`/admin/features/${f.id}`)} className="hover:bg-white/[0.02] cursor-pointer transition-colors group">
                                                <td className="p-4 pl-6">
                                                    <span className="font-bold text-zinc-200 group-hover:text-white block">{f.title}</span>
                                                    {f.description && <span className="text-xs text-zinc-500 truncate max-w-[250px] inline-block">{f.description}</span>}
                                                </td>
                                                <td className="p-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border
                                                        ${f.status === 'launched' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                                        f.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                                                        'bg-zinc-800 text-zinc-400 border-zinc-700'}`}
                                                    >
                                                        {f.status === 'launched' && <CheckCircle2 className="w-3 h-3" />}
                                                        {f.status === 'in_progress' && <Clock className="w-3 h-3" />}
                                                        {f.status?.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="flex justify-center gap-3 text-xs font-medium">
                                                        <span className={f.apiKeysNeeded?.length > 0 ? "text-cyan-400" : "text-zinc-600"}>API: {f.apiKeysNeeded?.length || 0}</span>
                                                        <span className={f.docsLinks?.length > 0 ? "text-purple-400" : "text-zinc-600"}>Docs: {f.docsLinks?.length || 0}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${f.whiteboardId ? 'bg-emerald-500' : 'bg-zinc-700'}`}></span>
                                                </td>
                                                <td className="p-4 pr-6 text-right text-xs text-zinc-500">
                                                    {f.createdAt?.toDate().toLocaleDateString() || 'Just now'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-xl font-bold mb-6">Log New Feature</h3>
                        <form onSubmit={handleCreateFeature} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Feature Title</label>
                                <input required autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Stripe Billing Integration" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Description</label>
                                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief summary of the feature..." className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white resize-none h-24" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Initial Status</label>
                                <select value={status} onChange={e => setStatus(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white">
                                    <option value="planned">Planned (Backlog)</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="launched">Launched</option>
                                </select>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2.5 rounded-xl transition-colors">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="flex-1 bg-accent hover:bg-accent-hover text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50">
                                    {isSubmitting ? 'Logging...' : 'Save Feature'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
