import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, updateDoc, doc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { MessageSquare, Lightbulb, Bug, ThumbsUp, Plus, X, Star, Edit2, Trash2, Save, Workflow, ListFilter, AlertTriangle, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import toast from 'react-hot-toast';

interface Feedback {
    id: string;
    tenantId: string;
    title: string;
    description: string;
    type: 'idea' | 'feature' | 'bug' | 'workflow';
    status: 'open' | 'planning' | 'in_progress' | 'completed' | 'rejected';
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorPhoto?: string;
    screenshotUrl?: string;
    upvotes: string[];
    createdAt: any;
}

export function FeedbackBoard() {
    const { currentUser, tenantId, role } = useAuth();
    const navigate = useNavigate();
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);
    
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<'idea' | 'feature' | 'bug' | 'workflow'>('idea');
    const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');

    const [filterType, setFilterType] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterPriority, setFilterPriority] = useState<string>('all');

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');

    const canEdit = (fb: Feedback) => {
        if (!currentUser) return false;
        if (currentUser.uid === fb.authorId) return true;
        if (role && ['super_admin', 'manager', 'business_owner'].includes(role)) return true;
        return false;
    };

    useEffect(() => {
        if (!tenantId && role !== 'super_admin') return;
        
        const q = role === 'super_admin' 
            ? query(collection(db, 'feedback')) 
            : query(collection(db, 'feedback'), where('tenantId', '==', tenantId));
            
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: Feedback[] = [];
            snapshot.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() } as Feedback);
            });
            // Sort by upvotes locally to preserve real-time updates without complex composite indexes initially
            data.sort((a, b) => (b.upvotes?.length || 0) - (a.upvotes?.length || 0));
            setFeedbacks(data);
        }, (err) => {
            console.error("Failed to fetch feedback:", err);
            toast.error("Failed to load feedback board.");
        });

        return () => unsubscribe();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) {
            toast.error("Please fill out all fields.");
            return;
        }
        if (!currentUser) return;

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'feedback'), {
                title: title.trim(),
                description: description.trim(),
                type,
                priority,
                status: type === 'workflow' ? 'planning' : 'open',
                authorId: currentUser.uid,
                authorName: currentUser.displayName || currentUser.email || 'Unknown User',
                authorEmail: currentUser.email || null,
                authorPhoto: currentUser.photoURL || null,
                tenantId: tenantId,
                upvotes: [currentUser.uid], // Auto upvote own post
                createdAt: serverTimestamp()
            });
            toast.success("Feedback submitted successfully!");
            setTitle('');
            setDescription('');
            setShowForm(false);
        } catch (err) {
            console.error("Error submitting feedback:", err);
            toast.error("Failed to submit. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpvote = async (feedbackId: string, currentUpvotes: string[]) => {
        if (!currentUser) return;
        const ref = doc(db, 'feedback', feedbackId);
        const hasUpvoted = currentUpvotes?.includes(currentUser.uid);

        try {
            if (hasUpvoted) {
                await updateDoc(ref, { upvotes: arrayRemove(currentUser.uid) });
            } else {
                await updateDoc(ref, { upvotes: arrayUnion(currentUser.uid) });
            }
        } catch (err) {
            console.error("Error updating upvote:", err);
            toast.error("Failed to register vote.");
        }
    };

    const startEdit = (fb: Feedback) => {
        setEditingId(fb.id);
        setEditTitle(fb.title);
        setEditDescription(fb.description);
    };

    const handleUpdate = async (id: string) => {
        if (!editTitle.trim() || !editDescription.trim()) return;
        try {
            await updateDoc(doc(db, 'feedback', id), {
                title: editTitle.trim(),
                description: editDescription.trim(),
            });
            setEditingId(null);
            toast.success("Updated successfully!");
        } catch (err) {
            console.error("Error updating feedback:", err);
            toast.error("Failed to update.");
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this request?")) return;
        try {
            await deleteDoc(doc(db, 'feedback', id));
            toast.success("Deleted successfully!");
        } catch (err) {
            console.error("Error deleting feedback:", err);
            toast.error("Failed to delete.");
        }
    };

    const getTypeIcon = (t: string) => {
        switch(t) {
            case 'bug': return <Bug className="w-4 h-4 text-red-400" />;
            case 'feature': return <Star className="w-4 h-4 text-accent" />;
            case 'workflow': return <Workflow className="w-4 h-4 text-blue-400" />;
            default: return <Lightbulb className="w-4 h-4 text-amber-400" />;
        }
    };

    const getTypeColor = (t: string) => {
        switch(t) {
            case 'bug': return 'bg-red-500/10 text-red-400 border-red-500/20';
            case 'feature': return 'bg-accent/10 text-accent border-accent/20';
            case 'workflow': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            default: return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
        }
    };

    const getPriorityIcon = (p?: string) => {
        switch(p) {
            case 'urgent': return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
            case 'high': return <ArrowUp className="w-3.5 h-3.5 text-orange-400" />;
            case 'low': return <ArrowDown className="w-3.5 h-3.5 text-zinc-500" />;
            default: return <Minus className="w-3.5 h-3.5 text-zinc-400" />;
        }
    };

    const getPriorityColor = (p?: string) => {
        switch(p) {
            case 'urgent': return 'text-red-500 border-red-500/30 bg-red-500/10';
            case 'high': return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
            case 'low': return 'text-zinc-500 border-zinc-700 bg-zinc-800/50';
            default: return 'text-zinc-400 border-zinc-700 bg-zinc-800/80';
        }
    };

    // Filtered Feedbacks
    const filteredFeedbacks = feedbacks.filter(fb => {
        if (filterType !== 'all' && fb.type !== filterType) return false;
        if (filterStatus !== 'all' && fb.status !== filterStatus) return false;
        if (filterPriority !== 'all' && (fb.priority || 'normal') !== filterPriority) return false;
        return true;
    });

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8 relative">
            <div className="max-w-5xl mx-auto w-full relative z-10">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 pb-6 border-b border-zinc-800/50 mb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shadow-inner">
                                <MessageSquare className="w-4 h-4 text-zinc-400" />
                            </div>
                            <span className="text-sm font-bold text-zinc-500 uppercase tracking-widest leading-none">Internal Workspace</span>
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">Idea & Bug Board</h1>
                        <p className="text-zinc-400 mt-2 font-medium">Log feature requests, outline workflows, report bugs, and vote on what to build next.</p>
                    </div>
                    <button 
                        onClick={() => setShowForm(!showForm)}
                        className="bg-accent hover:bg-accent-hover text-white font-bold py-2.5 px-6 rounded-xl transition-colors shadow-lg shadow-accent/20 flex items-center gap-2"
                    >
                        {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {showForm ? 'Cancel' : 'New Request'}
                    </button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-zinc-900/40 border border-zinc-800 rounded-2xl">
                    <div className="flex items-center gap-2 text-sm font-bold text-zinc-500 mr-2">
                        <ListFilter className="w-4 h-4" />
                        Filters:
                    </div>
                    
                    <select 
                        value={filterType} 
                        onChange={e => setFilterType(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-bold rounded-lg px-3 py-2 outline-none focus:border-accent"
                    >
                        <option value="all">All Types</option>
                        <option value="workflow">Workflows</option>
                        <option value="feature">Features</option>
                        <option value="idea">Ideas</option>
                        <option value="bug">Bugs</option>
                    </select>

                    <select 
                        value={filterStatus} 
                        onChange={e => setFilterStatus(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-bold rounded-lg px-3 py-2 outline-none focus:border-accent"
                    >
                        <option value="all">All Statuses</option>
                        <option value="open">Open</option>
                        <option value="planning">Planning</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="rejected">Rejected</option>
                    </select>

                    <select 
                        value={filterPriority} 
                        onChange={e => setFilterPriority(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-bold rounded-lg px-3 py-2 outline-none focus:border-accent"
                    >
                        <option value="all">All Priorities</option>
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="normal">Normal</option>
                        <option value="low">Low</option>
                    </select>
                </div>

                {/* Submission Form */}
                {showForm && (
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 mb-8 backdrop-blur-sm animate-in fade-in slide-in-from-top-4">
                        <h2 className="text-xl font-bold text-white mb-4">Submit Feedback or Workflow</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Request Type</label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {(['idea', 'feature', 'bug', 'workflow'] as const).map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setType(t)}
                                            className={`py-3 px-4 rounded-xl border font-bold flex items-center justify-center gap-2 transition-all ${type === t ? getTypeColor(t) + ' border-opacity-50' : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}
                                        >
                                            {getTypeIcon(t)}
                                            <span className="capitalize">{t}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Title</label>
                                    <input 
                                        type="text" 
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        placeholder="Brief summary..."
                                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-accent font-medium placeholder:text-zinc-600"
                                        maxLength={100}
                                    />
                                </div>
                                <div className="w-full md:w-64">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Priority</label>
                                    <select 
                                        value={priority}
                                        onChange={e => setPriority(e.target.value as any)}
                                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-accent font-medium outline-none"
                                    >
                                        <option value="low">Low</option>
                                        <option value="normal">Normal</option>
                                        <option value="high">High</option>
                                        <option value="urgent">Urgent</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Description</label>
                                <textarea 
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Provide more context, expected behavior, or business value..."
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-accent font-medium placeholder:text-zinc-600 min-h-[120px] resize-y"
                                ></textarea>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !title.trim() || !description.trim()}
                                    className="bg-white text-black hover:bg-zinc-200 font-bold py-2.5 px-8 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? 'Submitting...' : 'Post Request'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Feedback List */}
                <div className="space-y-4">
                    {filteredFeedbacks.length === 0 ? (
                        <div className="text-center py-16 text-zinc-500 font-medium bg-zinc-900/20 border border-zinc-800/50 rounded-2xl border-dashed">
                            No requests found matching your filters.
                        </div>
                    ) : (
                        filteredFeedbacks.map(fb => (
                            <div 
                                key={fb.id} 
                                onClick={(e) => {
                                    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('textarea') || (e.target as HTMLElement).closest('a')) return;
                                    navigate(`/business/feedback/${fb.id}`);
                                }}
                                className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 hover:bg-zinc-900 transition-colors flex gap-5 cursor-pointer"
                            >
                                {/* Upvote Sidebar */}
                                <div className="flex flex-col items-center gap-1 shrink-0">
                                    <button 
                                        onClick={() => handleUpvote(fb.id, fb.upvotes || [])}
                                        className={`p-2 rounded-xl transition-colors ${fb.upvotes?.includes(currentUser?.uid || '') ? 'bg-accent/20 text-accent' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                                    >
                                        <ThumbsUp className="w-5 h-5" />
                                    </button>
                                    <span className={`font-black text-lg ${fb.upvotes?.includes(currentUser?.uid || '') ? 'text-accent' : 'text-zinc-300'}`}>
                                        {fb.upvotes?.length || 0}
                                    </span>
                                </div>
                                
                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    {editingId === fb.id ? (
                                        <div className="space-y-3 mb-2">
                                            <input 
                                                value={editTitle}
                                                onChange={e => setEditTitle(e.target.value)}
                                                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg p-2.5 text-white font-bold focus:outline-none focus:border-accent"
                                            />
                                            <textarea 
                                                value={editDescription}
                                                onChange={e => setEditDescription(e.target.value)}
                                                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg p-2.5 text-zinc-300 text-sm focus:outline-none focus:border-accent min-h-[100px] resize-y"
                                            />
                                            <div className="flex items-center gap-2 mt-2">
                                                <button onClick={() => handleUpdate(fb.id)} className="bg-accent text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-accent-hover transition-colors">
                                                    <Save className="w-3.5 h-3.5" /> Save
                                                </button>
                                                <button onClick={() => setEditingId(null)} className="bg-zinc-800 text-zinc-300 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-zinc-700 transition-colors">
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-start justify-between gap-4 mb-2">
                                                <h3 className="text-xl font-bold text-white leading-tight">{fb.title}</h3>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    {canEdit(fb) && (
                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => startEdit(fb)} className="p-1.5 text-zinc-500 hover:text-accent hover:bg-zinc-800 rounded-md transition-colors" title="Edit">
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => handleDelete(fb.id)} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors" title="Delete">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    )}
                                                    <div className={`px-2.5 py-1 flex items-center gap-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${getTypeColor(fb.type)}`}>
                                                        {getTypeIcon(fb.type)}
                                                        {fb.type}
                                                    </div>
                                                    <div className={`px-2.5 py-1 flex items-center gap-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${getPriorityColor(fb.priority || 'normal')}`}>
                                                        {getPriorityIcon(fb.priority || 'normal')}
                                                        {fb.priority || 'normal'}
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-zinc-400 text-sm whitespace-pre-wrap leading-relaxed mb-4">{fb.description}</p>
                                            {fb.screenshotUrl && (
                                                <div className="mb-4">
                                                    <a href={fb.screenshotUrl} target="_blank" rel="noopener noreferrer">
                                                        <img src={fb.screenshotUrl} alt="Attached Snapshot" className="max-w-xs md:max-w-md rounded-xl border border-zinc-700/50 hover:border-accent/50 transition-colors shadow-lg cursor-zoom-in" />
                                                    </a>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    
                                    <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-zinc-600">
                                        <div className="flex items-center gap-1.5 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-800">
                                            <span className={
                                                fb.status === 'completed' ? 'text-green-400' : 
                                                fb.status === 'planning' ? 'text-blue-400' :
                                                fb.status === 'in_progress' ? 'text-amber-400' : 
                                                fb.status === 'rejected' ? 'text-red-500' : 
                                                'text-zinc-400'
                                            }>
                                                {fb.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {fb.authorPhoto ? (
                                                <img src={fb.authorPhoto} alt={fb.authorName} className="w-5 h-5 rounded-full object-cover" />
                                            ) : (
                                                <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400 uppercase">
                                                    {fb.authorName[0] || '?'}
                                                </div>
                                            )}
                                            <span>
                                                Posted by <span className="text-zinc-400">{fb.authorName}</span>
                                                {fb.authorEmail && <span className="text-zinc-500 lowercase ml-1.5 font-medium">({fb.authorEmail})</span>}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

            </div>
        </div>
    );
}
