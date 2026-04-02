import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, serverTimestamp, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
    CalendarDays, 
    CheckCircle2, 
    Circle, 
    Plus, 
    Clock, 
    Package, 
    AlertTriangle, 
    Users, 
    BookOpen,
    Trash2,
    Save,
    Calendar,
    Pencil,
    Wrench,
    Zap
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface ActionItem {
    id: string;
    text: string;
    completed: boolean;
    assignee?: string;
}

interface Meeting {
    id?: string;
    tenantId: string;
    title: string;
    date: string;
    notes: string;
    actionItems: ActionItem[];
    createdAt?: any;
    createdBy?: string;
}

interface LogReference {
    id: string;
    category: string;
    content: string;
    date: string;
}

export function MeetingNotes() {
    const { currentUser, tenantId } = useAuth();
    
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    
    // Form State
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');
    const [actionItems, setActionItems] = useState<ActionItem[]>([]);
    const [newActionItem, setNewActionItem] = useState('');
    
    // Context State
    const [recentLogs, setRecentLogs] = useState<LogReference[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchMeetings();
        fetchContextLogs();
    }, []);

    const fetchMeetings = async () => {
        if (!tenantId) return;
        try {
            const q = query(collection(db, 'meetings'), where('tenantId', '==', tenantId));
            const snapshot = await getDocs(q);
            const loadedMeetings = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Meeting[];
            
            // Sort client-side to avoid composite index requirement initially
            loadedMeetings.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            setMeetings(loadedMeetings);
            
            // Auto open the most recent meeting if none is selected
            if (loadedMeetings.length > 0 && !activeMeeting) {
                setActiveMeeting(loadedMeetings[0]);
            }
        } catch (error) {
            console.error("Error fetching meetings:", error);
        }
    };

    const fetchContextLogs = async () => {
        if (!tenantId) return;
        try {
            // Fetch the recent logs that are classified as ISSUE or EFFICIENCY to review in standup
            const q = query(collection(db, 'daily_logs'), where('tenantId', '==', tenantId));
            const snapshot = await getDocs(q);
            const logs = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as any))
                .sort((a,b) => {
                    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                    return timeB - timeA;
                })
                .filter(log => log.category === 'ISSUE' || log.category === 'EFFICIENCY')
                .slice(0, 4) // Keep only top 4 relevant ones
                .map(log => ({
                    id: log.id,
                    category: log.category,
                    content: log.content,
                    date: log.date
                }));
            setRecentLogs(logs);
        } catch (error) {
            console.error("Error fetching context logs:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleNewMeeting = () => {
        setIsEditing(true);
        setActiveMeeting(null);
        setTitle(`Morning Standup - ${new Date().toLocaleDateString()}`);
        setDate(new Date().toISOString().split('T')[0]);
        setNotes('');
        setActionItems([]);
    };

    const handleMorningUpfitTemplate = () => {
        setIsEditing(true);
        setActiveMeeting(null);
        setTitle(`Morning Upfitting Sync - ${new Date().toLocaleDateString()}`);
        setDate(new Date().toISOString().split('T')[0]);
        setNotes(`### 🎯 Today's Primary Objective:\n\n\n### 🚧 Blockers / Dependencies:\n- \n\n### 📋 Notes:\n`);
        setActionItems([
            { id: Date.now().toString() + '1', text: 'Review new vehicle intakes & verify check-in photos', completed: false },
            { id: Date.now().toString() + '2', text: 'Assign bays and specific tasks to techs', completed: false },
            { id: Date.now().toString() + '3', text: 'Check inventory status for current jobs (harnesses, lights, etc.)', completed: false },
            { id: Date.now().toString() + '4', text: 'Review yesterday\'s unresolved Daily Logs', completed: false }
        ]);
    };

    const handleEditMeeting = (meeting: Meeting) => {
        setIsEditing(true);
        setActiveMeeting(meeting);
        setTitle(meeting.title);
        setDate(meeting.date);
        setNotes(meeting.notes || '');
        setActionItems(meeting.actionItems || []);
    };

    const handleAddActionItem = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newActionItem.trim()) return;
        
        setActionItems([...actionItems, {
            id: Date.now().toString(),
            text: newActionItem.trim(),
            completed: false
        }]);
        setNewActionItem('');
    };

    const toggleActionItem = (id: string) => {
        setActionItems(items => items.map(item => 
            item.id === id ? { ...item, completed: !item.completed } : item
        ));
    };

    const removeActionItem = (id: string) => {
        setActionItems(items => items.filter(item => item.id !== id));
    };

    const handleSave = async () => {
        if (!title.trim() || !currentUser) return;
        setLoading(true);

        const meetingData = {
            title,
            date,
            notes,
            actionItems,
            createdBy: currentUser.email
        };

        try {
            if (activeMeeting?.id) {
                // Update
                const docRef = doc(db, 'meetings', activeMeeting.id);
                await updateDoc(docRef, meetingData);
            } else {
                // Create
                await addDoc(collection(db, 'meetings'), {
                    ...meetingData,
                    tenantId: tenantId,
                    createdAt: serverTimestamp()
                });
            }
            setIsEditing(false);
            fetchMeetings();
        } catch (error) {
            console.error("Error saving meeting:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!activeMeeting?.id || !window.confirm('Are you sure you want to delete this meeting?')) return;
        setLoading(true);
        try {
            await deleteDoc(doc(db, 'meetings', activeMeeting.id));
            setIsEditing(false);
            setActiveMeeting(null);
            fetchMeetings();
        } catch (error) {
            console.error("Error deleting meeting:", error);
        } finally {
            setLoading(false);
        }
    };

    const cancelEdit = () => {
        setIsEditing(false);
        if (meetings.length > 0 && !activeMeeting) {
            setActiveMeeting(meetings[0]);
        }
    };

    return (
        <div className="flex-1 flex flex-col md:flex-row bg-zinc-950 font-sans text-white h-[calc(100vh-64px)] overflow-hidden">
            
            {/* Left Sidebar: Meeting History */}
            <div className="w-full md:w-80 border-r border-zinc-800 bg-zinc-900/50 flex flex-col shrink-0 overflow-y-auto hidden-scrollbar">
                <div className="p-4 border-b border-zinc-800 sticky top-0 bg-zinc-900/90 backdrop-blur-md z-10 flex justify-between items-center">
                    <h2 className="text-sm font-bold tracking-wider uppercase text-zinc-400 flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-accent" />
                        Agendas
                    </h2>
                    <button 
                        onClick={() => {
                            setIsEditing(false);
                            setActiveMeeting(null);
                        }}
                        className="p-1.5 bg-accent/10 text-accent rounded hover:bg-accent hover:text-white transition-colors border border-accent/20"
                        title="New Meeting"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
                
                <div className="p-3 space-y-2">
                    {meetings.length === 0 && !loading && (
                        <p className="text-xs text-zinc-600 text-center py-8">No meetings saved yet.</p>
                    )}
                    {meetings.map((mtg) => (
                        <button
                            key={mtg.id}
                            onClick={() => {
                                setIsEditing(false);
                                setActiveMeeting(mtg);
                            }}
                            className={`w-full text-left p-3 rounded-xl border transition-all ${activeMeeting?.id === mtg.id && !isEditing ? 'bg-zinc-800 border-zinc-700 shadow-md' : 'bg-transparent border-transparent hover:bg-zinc-800/50 hover:border-zinc-800'}`}
                        >
                            <div className="font-bold text-sm text-white truncate">{mtg.title}</div>
                            <div className="flex items-center justify-between mt-1.5">
                                <span className="text-[10px] text-zinc-500 font-mono">{mtg.date}</span>
                                <div className="flex items-center gap-1 text-[10px] text-zinc-400 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                    {mtg.actionItems?.filter(i => i.completed).length || 0}/{mtg.actionItems?.length || 0}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Center: Editor / View */}
            <div className="flex-1 flex flex-col overflow-y-auto hidden-scrollbar bg-zinc-950 relative">
                {isEditing ? (
                    <div className="p-6 md:p-10 max-w-3xl mx-auto w-full">
                        <div className="mb-8">
                            <input 
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full bg-transparent text-3xl font-black text-white focus:outline-none placeholder:text-zinc-700 mb-2 border-b border-zinc-800 focus:border-accent pb-2 transition-colors"
                                placeholder="Meeting Title..."
                            />
                            <div className="flex items-center gap-2 text-zinc-400">
                                <Calendar className="w-4 h-4" />
                                <input 
                                    type="date"
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-300 focus:outline-none focus:border-accent"
                                />
                            </div>
                        </div>

                        {/* Action Items Builder */}
                        <div className="mb-10">
                            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-wide">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Action Items
                            </h3>
                            
                            <div className="space-y-2 mb-3">
                                {actionItems.map((item) => (
                                    <div key={item.id} className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 rounded-lg p-2 group">
                                        <button onClick={() => toggleActionItem(item.id)} className="text-zinc-500 hover:text-emerald-400 shrink-0">
                                            {item.completed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5" />}
                                        </button>
                                        <input 
                                            type="text"
                                            value={item.text}
                                            onChange={(e) => {
                                                setActionItems(items => items.map(i => i.id === item.id ? { ...i, text: e.target.value } : i));
                                            }}
                                            className={`w-full bg-transparent focus:outline-none text-sm transition-colors ${item.completed ? 'text-zinc-500 line-through' : 'text-white'}`}
                                        />
                                        <button onClick={() => removeActionItem(item.id)} className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <form onSubmit={handleAddActionItem} className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={newActionItem}
                                    onChange={e => setNewActionItem(e.target.value)}
                                    placeholder="Add new action item..."
                                    className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-accent rounded-lg px-3 py-2 text-sm text-white outline-none"
                                />
                                <button type="submit" disabled={!newActionItem.trim()} className="bg-zinc-800 text-white px-3 py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-50">
                                    <Plus className="w-4 h-4" />
                                </button>
                            </form>
                        </div>

                        {/* General Notes Editor */}
                        <div className="mb-10">
                            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-wide">
                                <BookOpen className="w-4 h-4 text-blue-400" /> Meeting Notes & Decisions
                            </h3>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Document discussion points, roadblocks, and operational decisions here..."
                                className="w-full h-64 bg-zinc-900 border border-zinc-800 focus:border-accent rounded-xl p-4 text-sm text-zinc-300 outline-none leading-relaxed resize-y"
                            />
                        </div>

                        <div className="flex gap-3 justify-end sticky bottom-6">
                            <button onClick={cancelEdit} className="px-6 py-2.5 rounded-xl font-bold text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSave} disabled={loading} className="px-6 py-2.5 rounded-xl font-bold text-sm text-zinc-950 bg-white hover:bg-zinc-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)] flex items-center gap-2 disabled:opacity-50">
                                <Save className="w-4 h-4" /> {activeMeeting?.id ? 'Update' : 'Save'} Agenda
                            </button>
                        </div>
                    </div>
                ) : activeMeeting ? (
                    <div className="p-6 md:p-10 max-w-3xl mx-auto w-full">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h1 className="text-3xl font-black text-white mb-2">{activeMeeting.title}</h1>
                                <p className="text-zinc-500 font-mono text-sm flex items-center gap-2">
                                    <Calendar className="w-3.5 h-3.5" /> {activeMeeting.date}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleEditMeeting(activeMeeting)} className="p-2 bg-zinc-900 text-zinc-400 hover:text-white rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors" title="Edit">
                                    <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={handleDelete} className="p-2 bg-zinc-900 text-zinc-400 hover:text-red-400 rounded-lg border border-zinc-800 hover:border-red-900 transition-colors" title="Delete">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {activeMeeting.actionItems?.length > 0 && (
                            <div className="mb-10 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6">
                                <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wide flex items-center justify-between">
                                    <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Action Items</span>
                                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700">
                                        {activeMeeting.actionItems.filter(i => i.completed).length} / {activeMeeting.actionItems.length}
                                    </span>
                                </h3>
                                <div className="space-y-3">
                                    {activeMeeting.actionItems.map(item => (
                                        <div key={item.id} className="flex items-start gap-3 group">
                                            <div className="mt-0.5 text-zinc-600 shrink-0">
                                                {item.completed ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4" />}
                                            </div>
                                            <p className={`text-sm leading-relaxed ${item.completed ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                                                {item.text}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeMeeting.notes && (
                            <div>
                                <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wide flex items-center gap-2">
                                    <BookOpen className="w-4 h-4 text-blue-400" /> Notes & Discussion
                                </h3>
                                <div className="prose prose-invert max-w-none text-zinc-300 text-sm leading-loose whitespace-pre-wrap bg-zinc-900/20 p-6 rounded-2xl border border-zinc-800/50">
                                    {activeMeeting.notes}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
                        <Users className="w-16 h-16 mb-4 opacity-20" />
                        <h3 className="text-xl font-bold text-white mb-2">No Meeting Selected</h3>
                        <p className="max-w-sm mb-8">Select an agenda from the left or quickly start a new standard meeting below.</p>
                        
                        <div className="flex flex-col gap-4 w-full max-w-sm">
                            <button onClick={handleMorningUpfitTemplate} className="w-full px-6 py-4 rounded-xl font-bold text-sm text-white bg-zinc-900 border border-zinc-700 hover:border-accent hover:bg-zinc-800 transition-all flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                        <Zap className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-white">Morning Upfitting Sync</div>
                                        <div className="text-xs font-normal text-zinc-500">Standard daily template</div>
                                    </div>
                                </div>
                                <Plus className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" />
                            </button>

                            <button onClick={handleNewMeeting} className="w-full px-6 py-4 rounded-xl font-bold text-sm text-zinc-400 bg-transparent border border-zinc-800 hover:text-white hover:border-zinc-700 transition-colors flex items-center justify-center gap-2">
                                <Plus className="w-4 h-4" /> Blank Meeting
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Sidebar: Context Data (Dynamic Agendas) */}
            <div className="w-full md:w-80 border-l border-zinc-800 bg-zinc-900/30 flex flex-col shrink-0 overflow-y-auto hidden-scrollbar">
                <div className="p-4 border-b border-zinc-800 sticky top-0 bg-zinc-950/90 backdrop-blur-md z-10">
                    <h2 className="text-sm font-bold tracking-wider uppercase text-zinc-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        Live Context
                    </h2>
                </div>
                
                <div className="p-4 space-y-6">
                    {/* Dynamic Firebase Logs */}
                    <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center justify-between">
                            Recent Logs & Issues
                            <Link to="/logs" className="text-[10px] text-accent hover:underline">View All</Link>
                        </h3>
                        {recentLogs.length === 0 ? (
                            <p className="text-xs text-zinc-600 bg-zinc-900/50 border border-zinc-800 p-3 rounded-lg">No recent issues found in daily logs.</p>
                        ) : (
                            <div className="space-y-2">
                                {recentLogs.map(log => (
                                    <div key={log.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 group relative overflow-hidden">
                                        <div className={`absolute top-0 left-0 bottom-0 w-1 ${log.category === 'ISSUE' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                                        <div className="pl-2">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[9px] font-bold text-zinc-500 uppercase">{log.category} • {log.date}</span>
                                            </div>
                                            <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed">{log.content}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Mock Pipeline Data */}
                    <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Jobs Pipeline</h3>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                    <Wrench className="w-4 h-4 text-emerald-500" />
                                    <span className="text-xs font-medium text-white">In Garage (Active)</span>
                                </div>
                                <span className="text-sm font-black text-white">4</span>
                            </div>
                            <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-yellow-500" />
                                    <span className="text-xs font-medium text-white">Intake Tomorrow</span>
                                </div>
                                <span className="text-sm font-black text-white">2</span>
                            </div>
                        </div>
                    </div>

                    {/* Mock Inventory Blockers */}
                    <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Inventory Blockers</h3>
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                                <Package className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-red-200 mb-0.5">Qwik Harness Shortage</p>
                                    <p className="text-[10px] text-red-200/70 leading-relaxed">Waiting on shipment for 2 Tahoes in Bay 3. ETA pushed to Thursday.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                </div>
            </div>
        </div>
    );
}
