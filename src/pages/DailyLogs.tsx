import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, deleteDoc, doc, updateDoc, arrayUnion, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Printer, Trash2, Lightbulb, AlertCircle, Info, Users, Pencil, Calendar, User, Sparkles, MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LogNote {
    id: string;
    text: string;
    createdAt: any;
    userId: string;
    userName: string;
}

interface LogEntry {
    id?: string;
    tenantId: string;
    userId: string;
    userEmail: string;
    date: string;
    category: string;
    content: string;
    peopleInvolved?: string;
    proposedFix?: string;
    actualResolution?: string;
    timeLost?: string;
    createdAt: any;
    notes?: LogNote[];
}

export function DailyLogs() {
    const { currentUser, tenantId } = useAuth();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterCategory, setFilterCategory] = useState<string>('ALL');
    
    // CRUD State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
    const [formData, setFormData] = useState<Partial<LogEntry>>({ category: 'GENERAL', content: '' });
    
    // Notes Thread State
    const [newNoteText, setNewNoteText] = useState<{ [logId: string]: string }>({});

    useEffect(() => {
        fetchLogs();
    }, [currentUser]);

    const fetchLogs = async () => {
        if (!currentUser || !tenantId) return;
        try {
            setLoading(true);
            const q = query(
                collection(db, 'daily_logs'),
                where('tenantId', '==', tenantId),
                where('userEmail', '==', currentUser.email)
            );
            const querySnapshot = await getDocs(q);
            const fetchedLogs: LogEntry[] = [];
            querySnapshot.forEach((doc) => {
                fetchedLogs.push({ id: doc.id, ...doc.data() } as LogEntry);
            });
            
            // Sort client-side to avoid requiring a Firestore Composite Index
            fetchedLogs.sort((a, b) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                return timeB - timeA;
            });
            
            setLogs(fetchedLogs);
        } catch (error) {
            console.error("Error fetching logs: ", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if(confirm('Are you sure you want to delete this log?')) {
            try {
                await deleteDoc(doc(db, 'daily_logs', id));
                setLogs(logs.filter(l => l.id !== id));
            } catch (error) {
                console.error("Error deleting log", error);
            }
        }
    }

    const handleSaveLog = async () => {
        if (!formData.content || !currentUser) return alert("Content is required");
        setLoading(true);
        try {
            if (editingLog && editingLog.id) {
                await updateDoc(doc(db, 'daily_logs', editingLog.id), { ...formData });
                setLogs(logs.map(l => l.id === editingLog.id ? { ...l, ...formData } : l));
            } else {
                const newDoc = {
                    ...formData,
                    category: formData.category || 'GENERAL',
                    date: new Date().toISOString().split('T')[0],
                    userId: currentUser.uid,
                    userEmail: currentUser.email,
                    tenantId: tenantId!,
                    createdAt: new Date()
                };
                const docRef = await addDoc(collection(db, 'daily_logs'), newDoc);
                setLogs([{ id: docRef.id, ...newDoc } as LogEntry, ...logs]);
            }
            setIsModalOpen(false);
            setEditingLog(null);
            setFormData({ category: 'GENERAL', content: '' });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleAddNote = async (logId: string) => {
        const text = newNoteText[logId]?.trim();
        if (!text || !currentUser) return;

        try {
            const newNote: LogNote = {
                id: Date.now().toString(),
                text,
                userId: currentUser.uid,
                userName: currentUser.displayName || currentUser.email || 'User',
                createdAt: new Date(),
            };
            await updateDoc(doc(db, 'daily_logs', logId), {
                notes: arrayUnion(newNote)
            });
            
            setLogs(logs.map(log => 
                log.id === logId ? { ...log, notes: [...(log.notes || []), newNote] } : log
            ));
            setNewNoteText(prev => ({ ...prev, [logId]: '' }));
        } catch (error) {
             console.error("Error adding note", error);
        }
    };

    const getCategoryStyles = (category: string) => {
        switch (category) {
            case 'EFFICIENCY': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
            case 'ISSUE': return 'bg-red-500/10 text-red-500 border-red-500/20';
            case 'HR': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
            case 'IDEA': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'OTHER': return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
            default: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
        }
    };

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'EFFICIENCY': return <Lightbulb className="w-4 h-4 text-yellow-500" />;
            case 'ISSUE': return <AlertCircle className="w-4 h-4 text-red-500" />;
            case 'HR': return <Users className="w-4 h-4 text-purple-400" />;
            case 'IDEA': return <Sparkles className="w-4 h-4 text-emerald-400" />;
            case 'OTHER': return <MoreHorizontal className="w-4 h-4 text-zinc-400" />;
            default: return <Info className="w-4 h-4 text-blue-400" />;
        }
    };

    const counts = {
        ALL: logs.length,
        GENERAL: logs.filter(log => log.category === 'GENERAL').length,
        EFFICIENCY: logs.filter(log => log.category === 'EFFICIENCY').length,
        ISSUE: logs.filter(log => log.category === 'ISSUE').length,
        HR: logs.filter(log => log.category === 'HR').length,
        IDEA: logs.filter(log => log.category === 'IDEA').length,
        OTHER: logs.filter(log => log.category === 'OTHER').length,
    };

    const filteredLogs = filterCategory === 'ALL' ? logs : logs.filter(log => log.category === filterCategory);

    return (
        <div className="min-h-[calc(100vh-64px)] bg-zinc-950 text-white font-sans p-4 md:p-8">
            <div className="max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                            <ArrowLeft className="w-6 h-6 text-zinc-400" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-black text-white tracking-tight">Daily Log & Issues</h1>
                            <p className="text-sm text-zinc-400 font-medium mt-1">Track your thoughts, issues, and efficiency ideas.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <button className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors shadow-sm">
                            <Printer className="w-4 h-4" /> Print
                        </button>
                        <button 
                            onClick={() => { setEditingLog(null); setFormData({ category: 'GENERAL', content: ''}); setIsModalOpen(true); }}
                            className="flex items-center gap-2 px-5 py-2 bg-accent rounded-lg text-sm font-bold text-white hover:bg-accent-hover transition-colors shadow-sm">
                            New Log
                        </button>
                    </div>
                </div>

                {/* Dashboard Cards / Filters */}
                {!loading && logs.length > 0 && (
                    <div className="grid grid-cols-2 lg:grid-cols-7 gap-3 mb-8">
                        {[
                            { id: 'ALL', label: 'All Logs', count: counts.ALL, color: 'border-zinc-700 bg-zinc-900', text: 'text-zinc-300' },
                            { id: 'EFFICIENCY', label: 'Efficiency', count: counts.EFFICIENCY, color: 'border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20', text: 'text-yellow-500' },
                            { id: 'ISSUE', label: 'Issues', count: counts.ISSUE, color: 'border-red-500/30 bg-red-500/10 hover:bg-red-500/20', text: 'text-red-500' },
                            { id: 'HR', label: 'HR', count: counts.HR, color: 'border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20', text: 'text-purple-400' },
                            { id: 'GENERAL', label: 'General', count: counts.GENERAL, color: 'border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20', text: 'text-blue-400' },
                            { id: 'IDEA', label: 'Idea', count: counts.IDEA, color: 'border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20', text: 'text-emerald-400' },
                            { id: 'OTHER', label: 'Other', count: counts.OTHER, color: 'border-zinc-500/30 bg-zinc-500/10 hover:bg-zinc-500/20', text: 'text-zinc-400' },
                        ].map((card) => (
                            <button
                                key={card.id}
                                onClick={() => setFilterCategory(card.id)}
                                className={`p-4 rounded-xl border text-left transition-all ${filterCategory === card.id ? `ring-2 ring-offset-2 ring-offset-zinc-950 ${card.color.split(' ')[0].replace('border-', 'ring-')}` : 'opacity-70 xl:opacity-60 hover:opacity-100'} ${card.color}`}
                            >
                                <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${card.text}`}>{card.label}</div>
                                <div className={`text-2xl font-black ${card.text}`}>{card.count}</div>
                            </button>
                        ))}
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="text-center py-20 bg-zinc-900/50 rounded-2xl border border-zinc-800 shadow-sm mt-8 backdrop-blur-sm">
                        <Lightbulb className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-white mb-2">{logs.length === 0 ? "No logs found" : "No logs in this category"}</h3>
                        <p className="text-zinc-500 mb-6">
                            {logs.length === 0 
                                ? "You haven't recorded any daily logs yet. Use the Seed button above to insert historical records."
                                : "Try clearing your filters to see other logs."}
                        </p>
                    </div>
                ) : (

                <div className="space-y-4">
                    {filteredLogs.map((log) => (
                        <div key={log.id} className="bg-zinc-900/80 p-5 md:p-6 rounded-xl border border-zinc-800 shadow-sm hover:border-zinc-700 transition-colors backdrop-blur-sm">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    {getCategoryIcon(log.category)}
                                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border uppercase tracking-wider ${getCategoryStyles(log.category)}`}>
                                        {log.category.toLowerCase()}
                                    </span>
                                    <span className="text-xs font-medium text-zinc-500">
                                        Logged: {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : new Date().toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-500">
                                    <button onClick={() => { setEditingLog(log); setFormData(log); setIsModalOpen(true); }} className="p-1.5 hover:bg-zinc-800 hover:text-white rounded-md transition-colors"><Pencil className="w-4 h-4" /></button>
                                    <button onClick={() => handleDelete(log.id!)} className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>

                            <p className="text-zinc-200 font-medium leading-relaxed mb-6 text-[15px]">
                                {log.content}
                            </p>

                            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-zinc-500 mb-4">
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-zinc-600" />
                                    Occurred: {log.date}
                                </div>
                                {log.peopleInvolved && (
                                    <div className="flex items-center gap-1.5">
                                        <User className="w-4 h-4 text-zinc-600" />
                                        Involved: {log.peopleInvolved}
                                    </div>
                                )}
                                {log.timeLost && (
                                    <div className="flex items-center gap-1.5">
                                        <AlertCircle className="w-4 h-4 text-red-500/70" />
                                        Time Lost: {log.timeLost}
                                    </div>
                                )}
                            </div>

                            {(log.proposedFix || log.actualResolution) && (
                                <div className="bg-accent/5 border border-accent/10 rounded-lg p-4 mt-2">
                                    {log.proposedFix && (
                                        <>
                                            <div className="text-[10px] font-bold text-accent uppercase tracking-wider mb-1">Proposed Fix / Idea</div>
                                            <p className="text-sm font-medium text-zinc-200">{log.proposedFix}</p>
                                        </>
                                    )}
                                    {log.actualResolution && (
                                        <div className={log.proposedFix ? "mt-3 pt-3 border-t border-accent/10" : ""}>
                                            <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Actual Resolution</div>
                                            <p className="text-sm font-medium text-zinc-200">{log.actualResolution}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Notes Thread */}
                            <div className="mt-6 pt-6 border-t border-zinc-800/50">
                                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> Threaded Notes
                                </h4>
                                
                                {log.notes && log.notes.length > 0 && (
                                    <div className="space-y-3 mb-4 pl-3 border-l-2 border-zinc-800">
                                        {log.notes.map(note => (
                                            <div key={note.id} className="bg-zinc-800/20 rounded-lg p-3 relative group">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-xs font-bold text-blue-400">{note.userName}</span>
                                                    <span className="text-[10px] text-zinc-500">{note.createdAt?.toDate ? note.createdAt.toDate().toLocaleString() : new Date(note.createdAt).toLocaleString()}</span>
                                                </div>
                                                <p className="text-sm text-zinc-300 font-medium">{note.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex gap-2 relative">
                                    <input 
                                        type="text" 
                                        placeholder="Add a note to this thread..."
                                        value={newNoteText[log.id!] || ''}
                                        onChange={(e) => setNewNoteText(prev => ({...prev, [log.id!]: e.target.value}))}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddNote(log.id!)}
                                        className="flex-1 bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-accent focus:bg-zinc-900 transition-colors placeholder:text-zinc-600"
                                    />
                                    <button onClick={() => handleAddNote(log.id!)} className="px-5 py-2 bg-zinc-800 hover:bg-accent hover:text-white text-zinc-300 text-sm font-bold rounded-xl transition-colors">
                                        Post
                                    </button>
                                </div>
                            </div>
                        </div>
                     ))}
                </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
                            <h2 className="text-xl font-bold">{editingLog ? 'Edit Log' : 'New Daily Log'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors">✕</button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 mb-1">Category</label>
                                    <select 
                                        value={formData.category} 
                                        onChange={(e) => setFormData({...formData, category: e.target.value})}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-accent"
                                    >
                                        <option value="GENERAL">GENERAL</option>
                                        <option value="EFFICIENCY">EFFICIENCY</option>
                                        <option value="ISSUE">ISSUE</option>
                                        <option value="IDEA">IDEA</option>
                                        <option value="HR">HR</option>
                                        <option value="OTHER">OTHER</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 mb-1">People Involved <span className="text-zinc-600 font-normal">(Optional)</span></label>
                                    <input 
                                        type="text" 
                                        value={formData.peopleInvolved || ''} 
                                        onChange={(e) => setFormData({...formData, peopleInvolved: e.target.value})}
                                        placeholder="e.g. Paul, Shop Floor..."
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-accent"
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 mb-1">Log Content</label>
                                <textarea 
                                    value={formData.content || ''} 
                                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                                    placeholder="What happened today?"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-3 text-white font-medium focus:outline-none focus:border-accent min-h-[120px] resize-y"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-400 mb-1">Proposed Fix / Idea <span className="text-zinc-600 font-normal">(Optional)</span></label>
                                <textarea 
                                    value={formData.proposedFix || ''} 
                                    onChange={(e) => setFormData({...formData, proposedFix: e.target.value})}
                                    placeholder="Any ideas to improve this or fix the issue?"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-3 text-white font-medium focus:outline-none focus:border-accent min-h-[80px] resize-y"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-zinc-800 bg-zinc-950/50 flex justify-end gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 rounded-lg text-sm font-bold text-zinc-400 hover:text-white transition-colors">Cancel</button>
                            <button onClick={handleSaveLog} className="px-5 py-2 bg-accent rounded-lg text-sm font-bold text-white hover:bg-accent-hover transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                                {editingLog ? 'Save Updates' : 'Publish Log'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
