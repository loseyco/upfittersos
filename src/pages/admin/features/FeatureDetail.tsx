import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, ShieldAlert, Key, BookOpen, PenTool, LayoutGrid, MessageSquare, Plus, X, Pencil } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { doc, updateDoc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { WorkflowCanvasTab } from '../../business/admin/WorkflowCanvasTab';

export function FeatureDetail() {
    const { id } = useParams();
    const { currentUser, role } = useAuth();
    const navigate = useNavigate();

    const [feature, setFeature] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'workflow' | 'conversation'>('overview');

    // Overview edit states
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({ title: '', description: '', status: '', apiKeysNeeded: [] as string[], docsLinks: [] as string[] });
    const [newApiItem, setNewApiItem] = useState('');
    const [newDocItem, setNewDocItem] = useState('');
    
    // Conversation State
    const [comments, setComments] = useState<any[]>([]);
    const [newComment, setNewComment] = useState('');
    const commentsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (role !== 'super_admin' || !id) return;
        let isMounted = true;
        
        const docRef = doc(db, 'site_features', id);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists() && isMounted) {
                setFeature({ id: docSnap.id, ...docSnap.data() });
                setIsLoading(false);
            } else if (isMounted) {
                toast.error("Feature not found.");
                navigate('/admin/features');
            }
        });

        // Fetch comments
        const q = query(collection(db, 'site_features', id, 'comments'), orderBy('createdAt', 'asc'));
        const unsubscribeComments = onSnapshot(q, (snap) => {
            if (isMounted) {
                setComments(snap.docs.map(d => ({id: d.id, ...d.data()})));
                setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }
        });

        return () => {
            isMounted = false;
            unsubscribe();
            unsubscribeComments();
        };
    }, [id, role, navigate]);

    if (role !== 'super_admin') {
         return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center p-6">
                <ShieldAlert className="w-16 h-16 text-red-500/50 mb-6" />
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">Access Denied</h2>
            </div>
        );
    }

    if (isLoading || !feature) {
         return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center font-bold tracking-widest text-xs uppercase animate-pulse">Loading Feature Data...</div>;
    }

    const startEditing = () => {
        setEditData({
            title: feature.title,
            description: feature.description,
            status: feature.status,
            apiKeysNeeded: feature.apiKeysNeeded || [],
            docsLinks: feature.docsLinks || []
        });
        setIsEditing(true);
    };

    const handleSaveOverview = async () => {
        try {
            await updateDoc(doc(db, 'site_features', feature.id), {
                title: editData.title,
                description: editData.description,
                status: editData.status,
                apiKeysNeeded: editData.apiKeysNeeded,
                docsLinks: editData.docsLinks,
                updatedAt: serverTimestamp()
            });
            setIsEditing(false);
            toast.success("Feature updated.");
        } catch (err) {
            console.error("Update failed", err);
            toast.error("Failed to update feature properties.");
        }
    };

    const handleGenerateWhiteboard = async () => {
        try {
            toast.loading("Generating blank canvas...", { id: 'wb' });
            // By placing it under global business canvas namespace, WorkflowCanvasTab can pick it up.
            const newDoc = await addDoc(collection(db, 'business_canvases'), {
                name: `Feature Architecture: ${feature.title}`,
                nodes: [],
                edges: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                tenantId: 'GLOBAL'
            });

            await updateDoc(doc(db, 'site_features', feature.id), {
                whiteboardId: newDoc.id,
                updatedAt: serverTimestamp()
            });
            toast.success("Canvas attached.", { id: 'wb' });
        } catch (error) {
            toast.error("Failed to initialize canvas.", { id: 'wb' });
        }
    };

    const handlePostComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;

        try {
            await addDoc(collection(db, 'site_features', feature.id, 'comments'), {
                text: newComment.trim(),
                authorUid: currentUser?.uid,
                authorName: currentUser?.displayName || 'Engineer',
                createdAt: serverTimestamp()
            });
            setNewComment('');
        } catch (e) {
            toast.error("Failed to post comment.");
        }
    };

    return (
        <div className="h-screen bg-zinc-950 text-white flex flex-col font-sans overflow-hidden">
            {/* Header */}
            <div className="h-[72px] border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between px-6 shrink-0 relative z-10 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/admin/features')} className="p-2 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-xl font-black text-white tracking-tight leading-tight">{feature.title}</h2>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                            ${feature.status === 'launched' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                            feature.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 
                            'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}
                        >
                            {feature.status?.replace('_', ' ')}
                        </span>
                    </div>
                </div>
                
                {/* Tab Controls */}
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-1">
                    <button onClick={() => setActiveTab('overview')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-accent text-white shadow-md shadow-accent/20' : 'text-zinc-500 hover:text-zinc-300'}`}>
                        <LayoutGrid className="w-4 h-4" /> Overview
                    </button>
                    <button onClick={() => setActiveTab('workflow')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'workflow' ? 'bg-accent text-white shadow-md shadow-accent/20' : 'text-zinc-500 hover:text-zinc-300'}`}>
                        <PenTool className="w-4 h-4" /> Architecture
                    </button>
                    <button onClick={() => setActiveTab('conversation')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'conversation' ? 'bg-accent text-white shadow-md shadow-accent/20' : 'text-zinc-500 hover:text-zinc-300'}`}>
                        <MessageSquare className="w-4 h-4" /> Discussion
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative bg-zinc-950">
                {activeTab === 'overview' && (
                    <div className="h-full overflow-y-auto p-8">
                        <div className="max-w-4xl mx-auto space-y-6">
                            
                            <div className="bg-zinc-900/40 border border-white/5 p-6 rounded-3xl backdrop-blur-sm relative">
                                {!isEditing ? (
                                    <>
                                        <button onClick={startEditing} className="absolute top-6 right-6 p-2 text-zinc-500 hover:text-white bg-zinc-800 rounded-lg transition-colors border border-zinc-700">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Functional Description</h3>
                                        <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{feature.description || 'No description provided.'}</p>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Title</label>
                                            <input value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white p-3 rounded-xl outline-none focus:border-accent" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Description</label>
                                            <textarea value={editData.description} onChange={e => setEditData({...editData, description: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white p-3 rounded-xl outline-none focus:border-accent h-32" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Status</label>
                                            <select value={editData.status} onChange={e => setEditData({...editData, status: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white p-3 rounded-xl outline-none focus:border-accent">
                                                <option value="planned">Planned (Backlog)</option>
                                                <option value="in_progress">In Progress</option>
                                                <option value="launched">Launched</option>
                                            </select>
                                        </div>
                                        <div className="flex gap-2 justify-end pt-2">
                                            <button onClick={() => setIsEditing(false)} className="px-5 py-2 font-bold text-sm text-white bg-zinc-800 rounded-xl">Cancel</button>
                                            <button onClick={handleSaveOverview} className="px-5 py-2 font-bold text-sm text-white bg-accent hover:bg-accent-hover rounded-xl shadow-lg">Save Overview</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* API Keys Needed */}
                                <div className="bg-zinc-900/40 border border-white/5 p-6 rounded-3xl backdrop-blur-sm">
                                    <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Key className="w-4 h-4 text-cyan-400" /> Required API Keys
                                    </h3>
                                    
                                    <div className="space-y-2 mb-4">
                                        {feature.apiKeysNeeded?.map((keyStr: string, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/80">
                                                <span className="text-sm font-medium text-zinc-300 font-mono">{keyStr}</span>
                                                <button onClick={async () => {
                                                    const newKeys = [...feature.apiKeysNeeded];
                                                    newKeys.splice(idx, 1);
                                                    await updateDoc(doc(db, 'site_features', feature.id), { apiKeysNeeded: newKeys });
                                                }} className="text-zinc-600 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                        {(!feature.apiKeysNeeded || feature.apiKeysNeeded.length === 0) && (
                                            <p className="text-zinc-600 text-sm italic py-2">No API keys required.</p>
                                        )}
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <input 
                                            value={newApiItem} 
                                            onChange={e => setNewApiItem(e.target.value)} 
                                            placeholder="e.g. STRIPE_SECRET_KEY" 
                                            className="flex-1 bg-zinc-950 text-xs font-mono p-2 rounded-lg border border-zinc-800 focus:outline-none focus:border-accent text-white"
                                            onKeyDown={async (e) => {
                                                if (e.key === 'Enter' && newApiItem.trim()) {
                                                    await updateDoc(doc(db, 'site_features', feature.id), { apiKeysNeeded: [...(feature.apiKeysNeeded||[]), newApiItem.trim()] });
                                                    setNewApiItem('');
                                                }
                                            }}
                                        />
                                        <button onClick={async () => {
                                            if (newApiItem.trim()) {
                                                await updateDoc(doc(db, 'site_features', feature.id), { apiKeysNeeded: [...(feature.apiKeysNeeded||[]), newApiItem.trim()] });
                                                setNewApiItem('');
                                            }
                                        }} className="bg-zinc-800 text-white p-2 rounded-lg hover:bg-zinc-700 transition-colors"><Plus className="w-4 h-4" /></button>
                                    </div>
                                </div>

                                {/* Documentation Links */}
                                <div className="bg-zinc-900/40 border border-white/5 p-6 rounded-3xl backdrop-blur-sm">
                                    <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-purple-400" /> Reference Material
                                    </h3>
                                    
                                    <div className="space-y-2 mb-4">
                                        {feature.docsLinks?.map((linkStr: string, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/80">
                                                <a href={linkStr} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-accent hover:underline truncate">{linkStr}</a>
                                                <button onClick={async () => {
                                                    const newLinks = [...feature.docsLinks];
                                                    newLinks.splice(idx, 1);
                                                    await updateDoc(doc(db, 'site_features', feature.id), { docsLinks: newLinks });
                                                }} className="text-zinc-600 hover:text-red-400 transition-colors ml-2"><X className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                        {(!feature.docsLinks || feature.docsLinks.length === 0) && (
                                            <p className="text-zinc-600 text-sm italic py-2">No reference docs linked.</p>
                                        )}
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <input 
                                            value={newDocItem} 
                                            onChange={e => setNewDocItem(e.target.value)} 
                                            placeholder="https://docs..." 
                                            className="flex-1 bg-zinc-950 text-xs p-2 rounded-lg border border-zinc-800 focus:outline-none focus:border-accent text-white"
                                            onKeyDown={async (e) => {
                                                if (e.key === 'Enter' && newDocItem.trim()) {
                                                    await updateDoc(doc(db, 'site_features', feature.id), { docsLinks: [...(feature.docsLinks||[]), newDocItem.trim()] });
                                                    setNewDocItem('');
                                                }
                                            }}
                                        />
                                        <button onClick={async () => {
                                            if (newDocItem.trim()) {
                                                await updateDoc(doc(db, 'site_features', feature.id), { docsLinks: [...(feature.docsLinks||[]), newDocItem.trim()] });
                                                setNewDocItem('');
                                            }
                                        }} className="bg-zinc-800 text-white p-2 rounded-lg hover:bg-zinc-700 transition-colors"><Plus className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'workflow' && (
                    <div className="h-full w-full bg-zinc-950">
                        {feature.whiteboardId ? (
                            <WorkflowCanvasTab tenantId="GLOBAL" canvasId={feature.whiteboardId} onBack={() => {}} />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-zinc-950/80 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.1),rgba(255,255,255,0))]">
                                <PenTool className="w-16 h-16 text-zinc-800 mb-6" />
                                <h2 className="text-2xl font-black text-white tracking-tight mb-3">No Architecture Designed</h2>
                                <p className="text-zinc-500 max-w-md mx-auto mb-8 leading-relaxed">
                                    Attach an infinite logic canvas to visually map out workflows, data schemas, and API lifecycles for this feature.
                                </p>
                                <button 
                                    onClick={handleGenerateWhiteboard}
                                    className="bg-accent hover:bg-accent-hover text-white px-8 py-3.5 rounded-2xl font-bold transition-all shadow-xl shadow-accent/20 flex items-center gap-2 hover:-translate-y-0.5"
                                >
                                    <Plus className="w-5 h-5" /> Initialize Blueprint Canvas
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'conversation' && (
                    <div className="h-full w-full flex flex-col bg-zinc-950">
                        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4">
                            {comments.length === 0 ? (
                                <div className="text-center py-20 text-zinc-500 font-medium">No discussion points yet. Start the conversation.</div>
                            ) : (
                                comments.map(comment => (
                                    <div key={comment.id} className={`flex ${comment.authorUid === currentUser?.uid ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-4 shadow-sm backdrop-blur-sm
                                            ${comment.authorUid === currentUser?.uid 
                                                ? 'bg-accent/20 border-accent/30 text-zinc-100 rounded-br-sm border' 
                                                : 'bg-zinc-900 border-zinc-800 text-zinc-300 rounded-bl-sm border'}`}
                                        >
                                            <div className="flex items-center justify-between gap-4 mb-2">
                                                <span className={`text-[10px] font-bold uppercase tracking-widest ${comment.authorUid === currentUser?.uid ? 'text-accent' : 'text-zinc-500'}`}>{comment.authorName}</span>
                                                <span className="text-[10px] text-zinc-600 font-medium">{comment.createdAt?.toDate().toLocaleString() || 'Just now'}</span>
                                            </div>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{comment.text}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={commentsEndRef} />
                        </div>
                        
                        {/* Post Comment Input */}
                        <div className="p-4 bg-zinc-950 border-t border-zinc-800 shrink-0">
                            <form onSubmit={handlePostComment} className="max-w-4xl mx-auto flex gap-3 relative">
                                <input
                                    type="text"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Add to the discussion..."
                                    className="flex-1 bg-zinc-900 border border-zinc-800 text-white rounded-2xl px-6 py-4 outline-none focus:border-accent text-sm shadow-inner transition-colors"
                                />
                                <button
                                    type="submit"
                                    disabled={!newComment.trim()}
                                    className="px-6 py-4 bg-accent text-white rounded-2xl font-bold hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-accent/20"
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
