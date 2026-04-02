import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, Send, CheckCircle2, CircleDashed, Clock, ChevronDown, Workflow, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface Comment {
    id: string;
    text: string;
    authorId: string;
    authorName: string;
    authorPhoto?: string;
    createdAt: any;
}

export function FeedbackDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    
    const [feedback, setFeedback] = useState<any>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const [businessName, setBusinessName] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        
        const fetchDetails = async () => {
            try {
                const docRef = doc(db, 'feedback', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const mappedFeedback = { id: docSnap.id, ...docSnap.data() } as any;
                    setFeedback(mappedFeedback);
                    
                    // Background fetch to resolve raw tenant ID to a human readable business name
                    if (mappedFeedback.tenantId && mappedFeedback.tenantId !== 'GLOBAL') {
                        api.get(`/businesses/${mappedFeedback.tenantId}`)
                           .then(res => setBusinessName(res.data?.name || 'Local Workspace'))
                           .catch(() => setBusinessName('Unknown Business'));
                    }
                    
                } else {
                    toast.error("Feedback not found.");
                    navigate('/business/feedback');
                }
            } catch (err) {
                console.error("Error fetching feedback:", err);
                toast.error("Failed to load details.");
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();

        // Listen to comments
        const q = query(collection(db, `feedback/${id}/comments`), orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const commentsData = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as Comment[];
            setComments(commentsData);
        });

        return () => unsubscribe();
    }, [id, navigate]);

    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !currentUser || !id) return;

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, `feedback/${id}/comments`), {
                text: newComment.trim(),
                authorId: currentUser.uid,
                authorName: currentUser.displayName || currentUser.email || 'Admin',
                authorPhoto: currentUser.photoURL || null,
                createdAt: serverTimestamp()
            });
            setNewComment('');
        } catch (err) {
            console.error("Error adding comment:", err);
            toast.error("Failed to post comment.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStatusChange = async (newStatus: 'open' | 'planning' | 'in_progress' | 'completed' | 'rejected') => {
        if (!id) return;
        try {
            await updateDoc(doc(db, 'feedback', id), { status: newStatus });
            setFeedback({ ...feedback, status: newStatus });
            setShowStatusMenu(false);
            toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
        } catch (err) {
            console.error("Error updating status:", err);
            toast.error("Failed to update status.");
        }
    };

    const handlePriorityChange = async (newPriority: 'low' | 'normal' | 'high' | 'urgent') => {
        if (!id) return;
        try {
            await updateDoc(doc(db, 'feedback', id), { priority: newPriority });
            setFeedback({ ...feedback, priority: newPriority });
            toast.success(`Priority updated to ${newPriority}`);
        } catch (err) {
            console.error("Error updating priority:", err);
            toast.error("Failed to update priority.");
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-zinc-950 flex items-center justify-center font-bold text-zinc-500 uppercase tracking-widest text-sm animate-pulse">Establishing Secure Uplink...</div>;
    }

    if (!feedback) return null;

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
            case 'planning': return <Workflow className="w-4 h-4 text-blue-400" />;
            case 'in_progress': return <Clock className="w-4 h-4 text-amber-400" />;
            case 'rejected': return <X className="w-4 h-4 text-red-500" />;
            default: return <CircleDashed className="w-4 h-4 text-zinc-400" />;
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

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8 text-white flex flex-col items-center">
            
            {/* Background Glow Overlay */}
            <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[150px] pointer-events-none"></div>

            <div className="max-w-5xl w-full relative z-10">
                {/* Header Navigation */}
                <button 
                    onClick={() => navigate('/business/feedback')} 
                    className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-8 font-bold text-sm bg-zinc-900/50 hover:bg-zinc-800 px-5 py-2.5 rounded-xl border border-white/5 w-fit"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Idea Board
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Main Content Column */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Feedback Origin Card */}
                        <div className="bg-zinc-900 border border-zinc-800 shadow-2xl rounded-3xl p-6 md:p-8 relative">
                            <div className="flex items-center gap-3 mb-6">
                                <div className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border
                                    ${feedback.type === 'bug' ? 'bg-red-500/10 text-red-500 border-red-500/30' :
                                      feedback.type === 'feature' ? 'bg-accent/10 text-accent border-accent/30' :
                                      feedback.type === 'workflow' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                                      'bg-amber-500/10 text-amber-400 border-amber-500/30'}
                                `}>
                                    {feedback.type} Report
                                </div>
                                
                                <select 
                                    value={feedback.priority || 'normal'}
                                    onChange={(e) => handlePriorityChange(e.target.value as any)}
                                    className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border outline-none cursor-pointer appearance-none ${getPriorityColor(feedback.priority || 'normal')}`}
                                >
                                    <option value="low">Low Priority</option>
                                    <option value="normal">Normal Priority</option>
                                    <option value="high">High Priority</option>
                                    <option value="urgent">Urgent Priority</option>
                                </select>
                                <div className="relative">
                                    <button 
                                        onClick={() => setShowStatusMenu(!showStatusMenu)}
                                        className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-md border border-zinc-700 transition-colors shadow-sm"
                                    >
                                        {getStatusIcon(feedback.status)} {feedback.status.replace('_', ' ')} <ChevronDown className="w-3 h-3 ml-1" />
                                    </button>
                                    
                                    {showStatusMenu && (
                                        <div className="absolute top-full left-0 mt-2 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-20">
                                            <button onClick={() => handleStatusChange('open')} className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm font-bold text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"><CircleDashed className="w-4 h-4 text-zinc-400" /> Open</button>
                                            <button onClick={() => handleStatusChange('planning')} className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm font-bold text-zinc-300 hover:bg-blue-500/20 hover:text-blue-400 transition-colors border-t border-zinc-700/50"><Workflow className="w-4 h-4 text-blue-400" /> Planning</button>
                                            <button onClick={() => handleStatusChange('in_progress')} className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm font-bold text-zinc-300 hover:bg-amber-500/20 hover:text-amber-400 transition-colors border-t border-zinc-700/50"><Clock className="w-4 h-4 text-amber-400" /> In Progress</button>
                                            <button onClick={() => handleStatusChange('completed')} className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm font-bold text-zinc-300 hover:bg-emerald-500/20 hover:text-emerald-400 transition-colors border-t border-zinc-700/50"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Completed</button>
                                            <button onClick={() => handleStatusChange('rejected')} className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm font-bold text-zinc-300 hover:bg-red-500/20 hover:text-red-500 transition-colors border-t border-zinc-700/50"><X className="w-4 h-4 text-red-500" /> Rejected</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-6 leading-tight text-white">{feedback.title}</h1>
                            <p className="text-zinc-400 text-base md:text-lg leading-relaxed whitespace-pre-wrap mb-8 pb-8 border-b border-zinc-800/80">{feedback.description}</p>
                            
                            {feedback.screenshotUrl && (
                                <div className="space-y-4 pt-2">
                                    <h3 className="text-sm font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-accent animate-pulse"></div> Visual Payload Context
                                    </h3>
                                    <a href={feedback.screenshotUrl} target="_blank" rel="noopener noreferrer" className="block w-full group overflow-hidden rounded-2xl border border-zinc-700 hover:border-accent transition-colors shadow-2xl">
                                        <div className="relative">
                                            <img src={feedback.screenshotUrl} alt="Feedback Screenshot" className="w-full group-hover:scale-[1.02] transition-transform duration-500" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="bg-zinc-900 border border-zinc-700 text-white font-bold px-4 py-2 rounded-xl text-sm shadow-xl">Expand Full Screen</span>
                                            </div>
                                        </div>
                                    </a>
                                </div>
                            )}

                        </div>

                        {/* Comments Thread */}
                        <div className="space-y-6 pt-4">
                            <h3 className="text-xl font-bold flex items-center gap-2 text-white">Diagnostic Logs</h3>
                            
                            <div className="space-y-4">
                                {comments.map((comment) => (
                                    <div key={comment.id} className={`flex gap-4 p-5 rounded-2xl border ${comment.authorId === currentUser?.uid ? 'bg-accent/5 border-accent/20' : 'bg-zinc-900 border-zinc-800'}`}>
                                        <div className="flex-shrink-0">
                                            {comment.authorPhoto ? (
                                                <img src={comment.authorPhoto} alt={comment.authorName} className="w-10 h-10 rounded-full object-cover shadow-lg border border-zinc-700" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 font-bold uppercase text-sm">
                                                    {comment.authorName[0]}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="font-bold text-white text-sm">{comment.authorName}</span>
                                                <span className="text-[10px] text-zinc-500 font-mono tracking-tighter uppercase">
                                                    {comment.createdAt ? new Date(comment.createdAt.toDate()).toLocaleString() : 'Just now'}
                                                </span>
                                            </div>
                                            <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{comment.text}</p>
                                        </div>
                                    </div>
                                ))}
                                {comments.length === 0 && (
                                    <div className="p-10 text-center bg-zinc-900/40 rounded-3xl border border-zinc-800 border-dashed flex flex-col items-center">
                                        <CheckCircle2 className="w-8 h-8 text-zinc-700 mb-3" />
                                        <span className="text-zinc-500 italic text-sm font-medium">No diagnostic logs recorded yet. Initiate dialogue below.</span>
                                    </div>
                                )}
                            </div>

                            {/* Comment Input */}
                            <form onSubmit={handleAddComment} className="flex gap-4 relative mt-6 pt-2">
                                <div className="flex-shrink-0 pt-2 hidden md:block">
                                    {currentUser?.photoURL ? (
                                        <img src={currentUser.photoURL} alt="You" className="w-[46px] h-[46px] rounded-full object-cover shadow-lg border-2 border-zinc-800" />
                                    ) : (
                                        <div className="w-[46px] h-[46px] rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center text-zinc-400 font-bold uppercase text-sm">
                                            {currentUser?.displayName?.[0] || 'U'}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 relative group">
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Append diagnostic notes or replies..."
                                        className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-3xl pl-5 pr-16 py-4 text-sm focus:outline-none focus:border-accent text-white resize-none h-28 shadow-inner transition-colors"
                                        required
                                    />
                                    <div className="absolute bottom-4 right-4">
                                        <button 
                                            type="submit" 
                                            disabled={isSubmitting || !newComment.trim()}
                                            className="bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent text-white p-3 rounded-2xl transition-all shadow-lg group-focus-within:shadow-accent/20"
                                        >
                                            <Send className="w-4 h-4 translate-x-px -translate-y-px" />
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>

                    {/* Meta Sidebar */}
                    <div className="space-y-6">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl">
                            <h3 className="text-[10px] font-black text-zinc-500 tracking-widest uppercase mb-5 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-zinc-600"></div> User Metadata
                            </h3>
                            
                            <div className="flex items-center gap-4 bg-zinc-950 p-4 border border-zinc-800 rounded-2xl">
                                {feedback.authorPhoto ? (
                                    <img src={feedback.authorPhoto} alt="Author" className="w-12 h-12 rounded-xl object-cover bg-zinc-800 border border-zinc-700" />
                                ) : (
                                    <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xl font-black text-zinc-400 uppercase">
                                        {feedback.authorName[0]}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-white text-sm truncate">{feedback.authorName}</div>
                                    {feedback.authorEmail && <div className="text-[10px] text-zinc-500 font-mono tracking-tight truncate mt-0.5">{feedback.authorEmail}</div>}
                                </div>
                            </div>
                            
                            <div className="mt-6 space-y-4 pb-6 border-b border-zinc-800/80">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-500 font-bold uppercase tracking-wider">Tenant Bind</span>
                                    <div className="flex flex-col items-end">
                                        {businessName && <span className="font-bold text-white mb-1.5">{businessName}</span>}
                                        <span className="text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded shadow-sm">{feedback.tenantId}</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-500 font-bold uppercase tracking-wider">Trace ID</span>
                                    <span className="text-zinc-400 font-mono tracking-tighter">{feedback.id.substring(0, 8)}...</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-500 font-bold uppercase tracking-wider">Capture Time</span>
                                    <span className="text-white font-medium">{feedback.createdAt ? new Date(feedback.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-500 font-bold uppercase tracking-wider">Capture Date</span>
                                    <span className="text-white font-medium">{feedback.createdAt ? new Date(feedback.createdAt.toDate()).toLocaleDateString() : 'N/A'}</span>
                                </div>
                            </div>

                            <div className="mt-6">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Payload Origin Router Path</span>
                                <div className="bg-zinc-950 border border-zinc-800 shadow-inner rounded-xl p-3 text-[10px] text-zinc-400 font-mono break-all font-bold">
                                    {feedback.path || '/GLOBAL_WIDGET'}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                </div>
            </div>
        </div>
    );
}
