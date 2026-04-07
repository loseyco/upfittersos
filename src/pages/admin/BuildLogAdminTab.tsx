import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PlusCircle, Search, Trash2, Edit2, Loader2, ListChecks, CheckCircle2, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface ChangelogEntry {
    id: string;
    version: string;
    date: string;
    title: string;
    description: string;
    features: string[];
    fixes: string[];
    createdAt?: any;
}

const SEED_DATA = [
    {
        version: 'v1.0.8',
        date: 'Apr 6, 2026',
        title: 'The Telemetry & Control Update',
        description: 'Significant enhancements to the administrative toolbelt including a comprehensive audit telemetry suite and strict system owner privileges.',
        features: [
            'Global audit logging system to record logins, page views, and non-CRUD events.',
            'Advanced administrative UI for filtering high-volume telemetry data.',
            'System Owner privileges have been finalized and mapped across all security nodes.',
            'Full independent module toggling (CRM, Fleet, Jobs, Areas, Inventory, Finances, Reports) from the Super Admin dashboard.'
        ],
        fixes: [
            'Resolved persistent bugs restricting data gating between business domains.'
        ]
    },
    {
        version: 'v1.0.7',
        date: 'Apr 5, 2026',
        title: 'The Field Connectivity Patch',
        description: 'Modernizing the technician experience by shifting integration models and revamping the Technician Portal workflow.',
        features: [
            'Transitioned CompanyCam integration from a single business-token to a secure, per-user authentication model.',
            'Dynamic missing-connection prompts implemented across staff profiles.',
            'Integrated Firestore data streams to populate active job assignments on the shop floor.'
        ],
        fixes: [
            'Eliminated static mockup constraints on the Technician Portal interface.'
        ]
    },
    {
        version: 'v1.0.6',
        date: 'Apr 3, 2026',
        title: 'The Real-Time Payroll Update',
        description: 'Finalized robust tracking for both tasks and compensation, bridging real-world time-tracking into actionable accounting sets.',
        features: [
            'Alpha Preview of Real-Time Payroll administration systems.',
            'On-the-fly currency formatting logic implemented for salary/rate inputs.',
            'Granular atomicity on backend transaction locking to prevent timesheet double-payments.',
            'Single-click CSV export utility designed explicitly for QuickBooks Online compatibility.'
        ],
        fixes: [
            'Addressed TypeScript compilation errors throughout the Business Admin Suite.'
        ]
    },
    {
        version: 'v1.0.5',
        date: 'Apr 3, 2026',
        title: 'Data Ecosystem Harmonization',
        description: 'Major milestones achieved in syncing internal business operations with industry-standard external SaaS apps.',
        features: [
            'Built a multi-tenant OAuth 2.0 gateway for QuickBooks Online and CompanyCam.',
            'Bi-directional QuickBooks Inventory API integration, synchronizing active stock levels.',
            'Added native "Last Updated By" metadata indexing to Canvas Gallery nodes.',
            'Native OneNote-style rich text editor implemented in real-time meeting workspaces.'
        ],
        fixes: [
            'Optimized multi-node selection interactions within the Blueprint Logic Engine.',
            'Resolved "Unsaved Changes" persistence bug after user profile updates.'
        ]
    },
    {
        version: 'v1.0.4',
        date: 'Apr 2, 2026',
        title: 'Identity & Environment Layer',
        description: 'Overhaul of area mapping strategies and global platform messaging mechanisms.',
        features: [
            'Deployed global business announcements framework via NoticesAdminTab.',
            'Clean separation of Area metadata logic vs. visual Facility Map geometries.',
            'Overhauled Meeting Management UI to support scalable, dropdown-based dataset selection.'
        ],
        fixes: [
            'Removed hardcoded dashboard simulation data, wiring up real platform states.',
            'Repaired SSO login routing preventing users from submitting feedback.'
        ]
    }
];

export const BuildLogAdminTab = () => {
    const [entries, setEntries] = useState<ChangelogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSeeding, setIsSeeding] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [version, setVersion] = useState('');
    const [dateString, setDateString] = useState(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [features, setFeatures] = useState<string[]>([]);
    const [fixes, setFixes] = useState<string[]>([]);

    const [newFeature, setNewFeature] = useState('');
    const [newFix, setNewFix] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const q = query(collection(db, 'changelogs'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ChangelogEntry[];
            // Ensure arrays exist
            const formattedData = data.map(d => ({
                ...d,
                features: d.features || [],
                fixes: d.fixes || [],
            }));
            setEntries(formattedData);
        } catch (error: any) {
            console.error("Failed to fetch changelogs:", error);
            toast.error("Failed to load build logs.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const resetForm = () => {
        setVersion('');
        setDateString(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
        setTitle('');
        setDescription('');
        setFeatures([]);
        setFixes([]);
        setNewFeature('');
        setNewFix('');
        setEditingId(null);
    };

    const handleOpenCreate = () => {
        resetForm();
        setIsModalOpen(true);
    };

    const handleOpenEdit = (entry: ChangelogEntry) => {
        setVersion(entry.version || '');
        setDateString(entry.date || '');
        setTitle(entry.title || '');
        setDescription(entry.description || '');
        setFeatures(entry.features || []);
        setFixes(entry.fixes || []);
        setEditingId(entry.id);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            const entryData = {
                version,
                date: dateString,
                title,
                description,
                features,
                fixes,
            };

            if (editingId) {
                await updateDoc(doc(db, 'changelogs', editingId), entryData);
                toast.success('Build log updated.');
            } else {
                await addDoc(collection(db, 'changelogs'), {
                    ...entryData,
                    createdAt: serverTimestamp()
                });
                toast.success('Build log published.');
            }

            setIsModalOpen(false);
            fetchLogs();
        } catch (error: any) {
            console.error('Error saving build log:', error);
            toast.error('Failed to save build log.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to permanently delete this build log entry?")) return;
        try {
            await deleteDoc(doc(db, 'changelogs', id));
            toast.success("Entry deleted.");
            setEntries(prev => prev.filter(e => e.id !== id));
        } catch (error) {
            console.error("Failed to delete entry:", error);
            toast.error("Failed to delete entry.");
        }
    };

    const handleSeed = async () => {
        if (!window.confirm("Seed the database? This will clear current logs and add predefined ones. Action cannot be undone.")) return;
        try {
            setIsSeeding(true);
            toast.loading("Clearing current timeline...");
            // Clear existing
            const existing = await getDocs(query(collection(db, 'changelogs')));
            const promises = existing.docs.map(docSnap => deleteDoc(doc(db, 'changelogs', docSnap.id)));
            await Promise.all(promises);

            toast.loading("Deploying new entries...", { id: "seed" });
            const colRef = collection(db, 'changelogs');
            const itemsToInsert = [...SEED_DATA].reverse();
            
            for (const item of itemsToInsert) {
                await addDoc(colRef, {
                    ...item,
                    createdAt: serverTimestamp()
                });
                await new Promise(r => setTimeout(r, 600)); 
            }

            toast.success("Build logs successfully seeded!", { id: "seed" });
            fetchLogs();
        } catch (error) {
            console.error("Seed error", error);
            toast.error("Failed to seed database.", { id: "seed" });
        } finally {
            setIsSeeding(false);
        }
    };

    const addFeatureListItem = () => {
        if (!newFeature.trim()) return;
        setFeatures(prev => [...prev, newFeature.trim()]);
        setNewFeature('');
    };

    const removeFeatureListItem = (index: number) => {
        setFeatures(prev => prev.filter((_, i) => i !== index));
    };

    const addFixListItem = () => {
        if (!newFix.trim()) return;
        setFixes(prev => [...prev, newFix.trim()]);
        setNewFix('');
    };

    const removeFixListItem = (index: number) => {
        setFixes(prev => prev.filter((_, i) => i !== index));
    };

    const filteredEntries = entries.filter(e => 
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        e.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
                        <ListChecks className="w-6 h-6 text-accent" /> Platform Build Logs
                    </h2>
                    <p className="text-sm text-zinc-400 mt-1">
                        Manage global release notes and updates visible to all users.
                    </p>
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:min-w-[300px]">
                        <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder="Search logs..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:border-accent outline-none transition-colors"
                        />
                    </div>
                    <button 
                        onClick={handleSeed}
                        disabled={isSeeding}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 whitespace-nowrap transition-colors shadow-lg active:scale-95 disabled:opacity-50"
                    >
                        <Loader2 className={`w-4 h-4 ${isSeeding ? 'animate-spin' : 'hidden'}`} />
                        Seed Data
                    </button>
                    <button 
                        onClick={handleOpenCreate}
                        className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 whitespace-nowrap transition-colors shadow-lg active:scale-95"
                    >
                        <PlusCircle className="w-4 h-4" /> New Log
                    </button>
                </div>
            </div>

            <div className="bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden backdrop-blur-md">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-zinc-900 text-left text-xs font-bold text-zinc-500 uppercase tracking-wider">
                                <th className="p-4 pl-6">Version</th>
                                <th className="p-4">Date</th>
                                <th className="p-4">Update Summary</th>
                                <th className="p-4 text-center">Changes</th>
                                <th className="p-4 text-right pr-6">Manage</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-zinc-500">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                        Loading build logs...
                                    </td>
                                </tr>
                            ) : filteredEntries.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-zinc-500">
                                        {searchQuery ? 'No matching logs found.' : 'No build logs documented yet.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredEntries.map(entry => (
                                    <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="p-4 pl-6">
                                            <span className="font-bold text-white text-sm bg-zinc-800 px-2 py-1 rounded-md border border-zinc-700">
                                                {entry.version}
                                            </span>
                                        </td>
                                        <td className="p-4 whitespace-nowrap text-sm text-zinc-400">
                                            {entry.date}
                                        </td>
                                        <td className="p-4">
                                            <div>
                                                <p className="font-bold text-zinc-200 text-sm mb-1">{entry.title}</p>
                                                <p className="text-xs text-zinc-500 line-clamp-1">{entry.description}</p>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20" title="Features">
                                                    +{entry.features.length}
                                                </span>
                                                <span className="text-[10px] font-bold bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20" title="Fixes">
                                                    ~{entry.fixes.length}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 pr-6 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => handleOpenEdit(entry)}
                                                    className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
                                                    title="Edit Log"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(entry.id)}
                                                    className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors"
                                                    title="Delete Log"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Editor Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl shadow-2xl relative my-8">
                        <div className="sticky top-0 bg-zinc-900/90 backdrop-blur-md rounded-t-2xl z-10 border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                {editingId ? <Edit2 className="w-5 h-5 text-accent" /> : <PlusCircle className="w-5 h-5 text-accent" />}
                                {editingId ? 'Edit Build Log' : 'Draft New Log'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white p-2">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Version Number</label>
                                    <input required type="text" value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g. v1.4.2" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-accent" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Release Date</label>
                                    <input required type="text" value={dateString} onChange={e => setDateString(e.target.value)} placeholder="e.g. Apr 12, 2026" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-accent" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Headline</label>
                                <input required type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. The Speed Update" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-accent" />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Brief Description</label>
                                <textarea required value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Summarize the core impact of this update..." className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-accent resize-none"></textarea>
                            </div>

                            <div className="space-y-4">
                                {/* Features Builder */}
                                <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl">
                                    <div className="flex items-center justify-between mb-3">
                                        <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> New Features
                                        </label>
                                    </div>
                                    <div className="space-y-2 mb-3">
                                        {features.map((feat, idx) => (
                                            <div key={idx} className="flex items-start gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-2 group">
                                                <p className="flex-1 text-sm text-zinc-300">{feat}</p>
                                                <button type="button" onClick={() => removeFeatureListItem(idx)} className="text-zinc-600 hover:text-red-400 transition-colors">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={newFeature} 
                                            onChange={e => setNewFeature(e.target.value)} 
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeatureListItem(); } }}
                                            placeholder="What's new?" 
                                            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-emerald-500 text-white" 
                                        />
                                        <button type="button" onClick={addFeatureListItem} className="bg-zinc-800 hover:bg-emerald-500 text-white text-xs font-bold px-3 rounded-lg transition-colors whitespace-nowrap">Add</button>
                                    </div>
                                </div>

                                {/* Fixes Builder */}
                                <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl">
                                    <div className="flex items-center justify-between mb-3">
                                        <label className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> Fixes & Improvements
                                        </label>
                                    </div>
                                    <div className="space-y-2 mb-3">
                                        {fixes.map((fix, idx) => (
                                            <div key={idx} className="flex items-start gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-2 group">
                                                <p className="flex-1 text-sm text-zinc-300">{fix}</p>
                                                <button type="button" onClick={() => removeFixListItem(idx)} className="text-zinc-600 hover:text-red-400 transition-colors">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={newFix} 
                                            onChange={e => setNewFix(e.target.value)} 
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFixListItem(); } }}
                                            placeholder="What got fixed?" 
                                            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 text-white" 
                                        />
                                        <button type="button" onClick={addFixListItem} className="bg-zinc-800 hover:bg-blue-500 text-white text-xs font-bold px-3 rounded-lg transition-colors whitespace-nowrap">Add</button>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-zinc-800">
                                <button type="submit" disabled={isSubmitting} className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50">
                                    {isSubmitting ? 'Saving...' : (editingId ? 'Update Log' : 'Publish to Timeline')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
