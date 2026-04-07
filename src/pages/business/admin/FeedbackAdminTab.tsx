import { useState, useEffect } from 'react';
import { db } from '../../../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Lightbulb, Bug, Star, Workflow, AlertTriangle, ArrowUp, ArrowDown, Minus, FlaskConical } from 'lucide-react';
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

export function FeedbackAdminTab({ tenantId }: { tenantId: string }) {
    const navigate = useNavigate();
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [loading, setLoading] = useState(true);



    const [filterType, setFilterType] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');

    useEffect(() => {
        if (!tenantId) return;
        
        const q = query(collection(db, 'feedback'), where('tenantId', '==', tenantId));
            
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: Feedback[] = [];
            snapshot.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() } as Feedback);
            });
            // Sort by upvotes locally
            data.sort((a, b) => (b.upvotes?.length || 0) - (a.upvotes?.length || 0));
            setFeedbacks(data);
            setLoading(false);
        }, (err) => {
            console.error("Failed to fetch feedback:", err);
            toast.error("Failed to load feedback list.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [tenantId]);

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

    const filteredFeedbacks = feedbacks.filter(fb => {
        if (filterType !== 'all' && fb.type !== filterType) return false;
        if (filterStatus !== 'all' && fb.status !== filterStatus) return false;
        return true;
    });

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center">Loading Feedback...</div>;
    }

    return (
        <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
            {/* Alpha Banner */}
            <div className="bg-orange-500/5 border-b border-orange-500/20 px-6 py-3 flex items-start gap-3 shrink-0 relative z-20">
                <FlaskConical className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                    <h4 className="text-orange-400 font-bold text-sm">Feature Preview (Alpha Roadmap)</h4>
                    <p className="text-orange-400/80 text-xs mt-0.5">Feedback & Ideas is currently in active development. You may start testing it now, but expect rapid updates and potential data resets prior to stable release.</p>
                </div>
            </div>

            <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex flex-col md:flex-row items-start md:items-center justify-between sticky top-0 z-10 backdrop-blur-md gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shadow-inner">
                            <MessageSquare className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h2 className="text-2xl font-black text-white">Feedback & Ideas</h2>
                                <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded mt-0.5">
                                    Alpha Labs
                                </span>
                            </div>
                            <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest mt-1">Submitted by your staff</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <select 
                        value={filterType} 
                        onChange={e => setFilterType(e.target.value)}
                        className="flex-1 md:flex-none bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-bold rounded-lg px-3 py-2.5 outline-none focus:border-accent"
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
                        className="flex-1 md:flex-none bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-bold rounded-lg px-3 py-2.5 outline-none focus:border-accent"
                    >
                        <option value="all">All Statuses</option>
                        <option value="open">Open</option>
                        <option value="planning">Planning</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>
            </div>

            <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-6 pb-24">
                {filteredFeedbacks.length === 0 ? (
                    <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-12 text-center text-zinc-500 flex flex-col items-center justify-center">
                        <MessageSquare className="w-12 h-12 mb-4 text-zinc-700" />
                        <h3 className="text-lg font-bold text-zinc-300 mb-2">No Feedback Yet</h3>
                        <p>Your team hasn't submitted any ideas, bugs, or workflow feedback yet.</p>
                    </div>
                ) : (
                    filteredFeedbacks.map(fb => (
                        <div 
                            key={fb.id} 
                            onClick={(e) => {
                                if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('textarea') || (e.target as HTMLElement).closest('a') || (e.target as HTMLElement).closest('select')) return;
                                navigate(`/business/feedback/${fb.id}`);
                            }}
                            className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 transition-all duration-300 hover:border-zinc-600 hover:bg-zinc-900/80 shadow-xl cursor-pointer"
                        >
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                                <div className="flex items-start gap-4">
                                    <div className="flex flex-col items-center gap-1 shrink-0 bg-zinc-950 border border-zinc-800 rounded-xl p-3 min-w-[60px] shadow-inner">
                                        <ArrowUp className="w-5 h-5 text-zinc-400" />
                                        <span className="font-black text-lg text-white">
                                            {fb.upvotes?.length || 0}
                                        </span>
                                    </div>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-3 mb-2">
                                            <h3 className="text-xl font-black text-white">{fb.title}</h3>
                                            <div className={`px-2.5 py-1 flex items-center gap-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${getTypeColor(fb.type)}`}>
                                                {getTypeIcon(fb.type)}
                                                {fb.type}
                                            </div>
                                            <div className={`px-2.5 py-1 flex items-center gap-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${getPriorityColor(fb.priority || 'normal')}`}>
                                                {getPriorityIcon(fb.priority || 'normal')}
                                                {fb.priority || 'normal'}
                                            </div>
                                        </div>
                                        <p className="text-zinc-400 text-sm whitespace-pre-wrap leading-relaxed">{fb.description}</p>
                                    </div>
                                </div>
                            </div>

                            {fb.screenshotUrl && (
                                <div className="mb-6 ml-[76px]">
                                    <a href={fb.screenshotUrl} target="_blank" rel="noopener noreferrer">
                                        <img src={fb.screenshotUrl} alt="Attached Snapshot" className="max-w-[200px] md:max-w-xs rounded-xl border border-zinc-700/50 hover:border-accent/50 transition-colors shadow-lg cursor-zoom-in" />
                                    </a>
                                </div>
                            )}
                            
                            <div className="ml-[76px] flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-zinc-800/50">
                                <div className="flex items-center gap-3">
                                    {fb.authorPhoto ? (
                                        <img src={fb.authorPhoto} alt={fb.authorName} className="w-6 h-6 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-400 uppercase">
                                            {fb.authorName[0] || '?'}
                                        </div>
                                    )}
                                    <span className="text-xs font-bold text-zinc-500 tracking-wider">
                                        SUBMITTED BY <span className="text-zinc-300">{fb.authorName}</span>
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Status:</span>
                                    <span className={`text-xs font-black uppercase tracking-wider ${
                                        fb.status === 'completed' ? 'text-green-400' : 
                                        fb.status === 'planning' ? 'text-blue-400' :
                                        fb.status === 'in_progress' ? 'text-amber-400' : 
                                        fb.status === 'rejected' ? 'text-red-500' : 
                                        'text-zinc-400'
                                    }`}>
                                        {fb.status.replace('_', ' ')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
