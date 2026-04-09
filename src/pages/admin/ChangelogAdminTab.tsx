import { useState, useEffect } from 'react';
import { Plus, Send, Trash2, History, GitCommit } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

export function ChangelogAdminTab() {
    const [history, setHistory] = useState<any[]>([]);
    const [isDrafting, setIsDrafting] = useState(false);
    const [isSending, setIsSending] = useState(false);
    
    const [form, setForm] = useState({
        version: '',
        title: '',
        description: '',
        features: '',
        fixes: '',
        recipients: 'p.losey@saegrp.com' // default team
    });

    useEffect(() => {
        const q = query(collection(db, 'changelogs'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsub();
    }, []);

    const handleAutoFill = async () => {
        try {
            toast.loading("Scanning local Git history...", { id: 'git' });
            
            let sinceQuery = '';
            if (history.length > 0 && history[0].createdAt) {
                // Ensure the Firebase Timestamp has resolved before calling toDate()
                const date = typeof history[0].createdAt.toDate === 'function' 
                    ? history[0].createdAt.toDate() 
                    : new Date();
                sinceQuery = `?since=${encodeURIComponent(date.toISOString())}`;
            }

            const res = await api.get(`/admin/git-commits${sinceQuery}`);
            const commits: string[] = res.data.commits || [];
            
            if (commits.length === 0) {
                toast.error("No recent commits found.", { id: 'git' });
                return;
            }

            const fixes = commits.filter(c => c.toLowerCase().includes('fix') || c.toLowerCase().includes('resolve') || c.toLowerCase().includes('patch'));
            const features = commits.filter(c => !fixes.includes(c));

            setForm(prev => ({
                ...prev,
                features: [...features.map(f => `• ${f}`), prev.features].filter(x => x).join('\n'),
                fixes: [...fixes.map(f => `• ${f}`), prev.fixes].filter(x => x).join('\n')
            }));

            toast.success(`Loaded ${commits.length} commits!`, { id: 'git' });
        } catch (error) {
            console.error(error);
            toast.error("Git history unavailable. Are you running locally?", { id: 'git' });
        }
    };

    const handlePublish = async () => {
        if (!form.version || !form.title || !form.recipients) {
            toast.error("Version, Title, and Recipients are required.");
            return;
        }

        const featuresArray = form.features.split('\n').map(f => f.trim()).filter(f => f.length > 0);
        const fixesArray = form.fixes.split('\n').map(f => f.trim()).filter(f => f.length > 0);

        try {
            setIsSending(true);
            toast.loading("Publishing to database...");

            const payload = {
                version: form.version,
                date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                title: form.title,
                description: form.description,
                features: featuresArray,
                fixes: fixesArray,
                createdAt: serverTimestamp()
            };

            // Save to database
            const docRef = await addDoc(collection(db, 'changelogs'), payload);

            toast.loading("Dispatching emails...", { id: 'email' });
            
            // Dispatch Email via Cloud Function
            await api.post('/admin/dispatch-changelog', {
                changelogId: docRef.id,
                recipients: form.recipients.split(',').map(r => r.trim()).filter(r => r.length > 0)
            });

            toast.dismiss();
            toast.success("Changelog successfully published and emailed!");
            
            setIsDrafting(false);
            setForm({ ...form, title: '', description: '', features: '', fixes: '', version: '' });

        } catch (error) {
            console.error("Failed to publish changelog", error);
            toast.error("Failed to publish or send email.");
        } finally {
            setIsSending(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this historical changelog record? This won't unsend emails.")) return;
        try {
            await deleteDoc(doc(db, 'changelogs', id));
            toast.success("Record deleted.");
        } catch (error) {
            toast.error("Failed to delete record.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
                        <History className="w-6 h-6 text-emerald-400" /> Platform Updates & Changelogs
                    </h2>
                    <p className="text-zinc-500 text-sm mt-1">Draft new version updates and broadcast to the team globally.</p>
                </div>
                {!isDrafting && (
                    <button 
                        onClick={() => setIsDrafting(true)}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg"
                    >
                        <Plus className="w-4 h-4" /> Draft New Update
                    </button>
                )}
            </div>

            {isDrafting ? (
                <div className="bg-zinc-900 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-white">Compose Update Email</h3>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={handleAutoFill} 
                                className="flex items-center gap-2 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 text-xs font-bold border border-amber-500/20 bg-zinc-950 px-3 py-1.5 rounded-lg transition-all"
                            >
                                <GitCommit className="w-4 h-4" /> Auto-Fill (Local Git)
                            </button>
                            <button onClick={() => setIsDrafting(false)} className="text-zinc-500 hover:text-white text-sm font-bold bg-zinc-800 px-3 py-1.5 rounded-lg">Cancel</button>
                        </div>
                    </div>

                    <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Version String</label>
                                <input 
                                    type="text" 
                                    value={form.version} 
                                    onChange={(e) => setForm({...form, version: e.target.value})} 
                                    placeholder="e.g. v1.2.0-beta" 
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-emerald-500 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Email Recipients (Comma Separated)</label>
                                <input 
                                    type="text" 
                                    value={form.recipients} 
                                    onChange={(e) => setForm({...form, recipients: e.target.value})} 
                                    placeholder="team@domain.com" 
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-emerald-500 transition-colors"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Release Title</label>
                            <input 
                                type="text" 
                                value={form.title} 
                                onChange={(e) => setForm({...form, title: e.target.value})} 
                                placeholder="e.g. Inventory Management & Reporting Upgrades" 
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-emerald-500 transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Release Summary / Description</label>
                            <textarea 
                                value={form.description} 
                                onChange={(e) => setForm({...form, description: e.target.value})} 
                                placeholder="A brief paragraph summarizing what this update brings..." 
                                rows={2}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-emerald-500 transition-colors resize-none"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 text-blue-400">Features & Enhancements (One per line)</label>
                                <textarea 
                                    value={form.features} 
                                    onChange={(e) => setForm({...form, features: e.target.value})} 
                                    placeholder="Added robust inventory tracking..." 
                                    rows={5}
                                    className="w-full bg-zinc-950 border border-blue-500/20 rounded-xl px-4 py-3 text-white focus:border-blue-500 transition-colors resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 text-amber-500">Bug Fixes & Patches (One per line)</label>
                                <textarea 
                                    value={form.fixes} 
                                    onChange={(e) => setForm({...form, fixes: e.target.value})} 
                                    placeholder="Resolved memory leak in map view..." 
                                    rows={5}
                                    className="w-full bg-zinc-950 border border-amber-500/20 rounded-xl px-4 py-3 text-white focus:border-amber-500 transition-colors resize-none"
                                />
                            </div>
                        </div>

                        <button 
                            onClick={handlePublish}
                            disabled={isSending}
                            className="w-full flex justify-center items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 mt-4 disabled:opacity-50"
                        >
                            {isSending ? 'Dispatching...' : <><Send className="w-4 h-4" /> Publish Changelog & Send Broadcast</>}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                    <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
                        <History className="w-5 h-5 text-emerald-400" /> Dispatch History
                    </h3>

                    <div className="space-y-4">
                        {history.length === 0 ? (
                            <div className="text-center py-12 text-zinc-500 border-2 border-dashed border-zinc-800 rounded-2xl">
                                No changelogs pushed yet.
                            </div>
                        ) : (
                            history.map(log => (
                                <div key={log.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors group">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase px-2 py-1 rounded">
                                                    {log.version}
                                                </span>
                                                <span className="text-xs font-bold text-zinc-500">{log.date || new Date().toLocaleDateString()}</span>
                                            </div>
                                            <h4 className="text-lg font-bold text-white">{log.title}</h4>
                                        </div>
                                        <button 
                                            onClick={() => handleDelete(log.id)}
                                            className="p-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-500/10"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <p className="text-sm text-zinc-400 leading-relaxed mb-4">{log.description}</p>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {log.features && log.features.length > 0 && (
                                            <div className="space-y-1">
                                                <h5 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Enhancements</h5>
                                                <ul className="list-disc list-inside text-xs text-zinc-300 space-y-1 ml-1">
                                                    {log.features.map((f: string, i: number) => <li key={i} className="line-clamp-1">{f}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                        {log.fixes && log.fixes.length > 0 && (
                                            <div className="space-y-1">
                                                <h5 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Fixes</h5>
                                                <ul className="list-disc list-inside text-xs text-zinc-300 space-y-1 ml-1">
                                                    {log.fixes.map((f: string, i: number) => <li key={i} className="line-clamp-1">{f}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
