import { useState, useEffect } from 'react';
import { ClipboardList, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export function TasksDashboard() {
    const { currentUser, tenantId } = useAuth();
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal state for Interview
    const [activeTask, setActiveTask] = useState<any | null>(null);
    const [feedback, setFeedback] = useState({ good: '', badUgly: '', wishlist: '', positionNotes: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!currentUser || !tenantId || tenantId === 'GLOBAL' || tenantId === 'unassigned') {
            setLoading(false);
            return;
        }

        setLoading(true);
        const q = query(
            collection(db, 'tasks'),
            where('tenantId', '==', tenantId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedTasks = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }));
            
            loadedTasks.sort((a: any, b: any) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?._seconds ? a.createdAt._seconds * 1000 : 0);
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?._seconds ? b.createdAt._seconds * 1000 : 0);
                return timeB - timeA;
            });
            
            setTasks(loadedTasks);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching tasks:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, tenantId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            await api.put(`/tasks/${activeTask.id}`, {
                status: 'completed',
                feedback
            });
            toast.success("Task securely submitted.");
            setActiveTask(null);
        } catch (err) {
            toast.error("Failed to submit assignment.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenTask = (task: any) => {
        if (task.status === 'completed') return;
        setActiveTask(task);
        if (task.type === 'interview') {
            setFeedback({ good: '', badUgly: '', wishlist: '', positionNotes: '' });
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold">Synchronizing Tasks...</div>;
    }

    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const completedTasks = tasks.filter(t => t.status === 'completed');

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8 relative">
            
            {/* Task Action Modal */}
            {activeTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-zinc-900 border border-zinc-700/50 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-zinc-800/50 flex justify-between items-center bg-zinc-900">
                            <div>
                                <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                    <ClipboardList className="w-5 h-5 text-accent" /> {activeTask.title}
                                </h3>
                                <p className="text-sm text-zinc-500 mt-1">Please provide honest and direct feedback below.</p>
                            </div>
                            <button onClick={() => setActiveTask(null)} className="text-zinc-500 hover:text-white transition-colors bg-zinc-800 p-2 rounded-full">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 flex-1 overflow-y-auto">
                            {activeTask.type === 'interview' && (
                                <form id="taskForm" onSubmit={handleSubmit} className="space-y-6">
                                    <div>
                                        <label className="block text-xs font-black text-emerald-400 uppercase tracking-widest mb-2 ml-1">The Good</label>
                                        <textarea 
                                            required 
                                            value={feedback.good} 
                                            onChange={e => setFeedback({...feedback, good: e.target.value})} 
                                            placeholder="What is working well? What do you enjoy?" 
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 text-white shadow-inner min-h-[100px] resize-y" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-red-400 uppercase tracking-widest mb-2 ml-1">The Bad & The Ugly</label>
                                        <textarea 
                                            required 
                                            value={feedback.badUgly} 
                                            onChange={e => setFeedback({...feedback, badUgly: e.target.value})} 
                                            placeholder="What is stressful, broken, or needs immediate fixing?" 
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-red-500/50 text-white shadow-inner min-h-[100px] resize-y" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-purple-400 uppercase tracking-widest mb-2 ml-1">Wish List</label>
                                        <textarea 
                                            required 
                                            value={feedback.wishlist} 
                                            onChange={e => setFeedback({...feedback, wishlist: e.target.value})} 
                                            placeholder="If you had a magic wand, what tools or changes would you ask for?" 
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 text-white shadow-inner min-h-[100px] resize-y" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-blue-400 uppercase tracking-widest mb-2 ml-1">Thoughts on your position</label>
                                        <textarea 
                                            required 
                                            value={feedback.positionNotes} 
                                            onChange={e => setFeedback({...feedback, positionNotes: e.target.value})} 
                                            placeholder="How do you feel about your role? Evolving responsibilities?" 
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-white shadow-inner min-h-[100px] resize-y" 
                                        />
                                    </div>
                                </form>
                            )}
                        </div>

                        <div className="p-6 border-t border-zinc-800 flex justify-end bg-zinc-900">
                            <button 
                                type="submit" 
                                form="taskForm"
                                disabled={isSubmitting} 
                                className="bg-accent text-white hover:bg-accent-hover font-bold py-3 px-8 rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSubmitting ? 'Submitting...' : 'Mark as Completed'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-4xl mx-auto space-y-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800/50 pb-6">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-white mb-2 flex items-center gap-3">
                            <ClipboardList className="w-8 h-8 text-orange-400" /> Executive Tasks
                        </h1>
                        <p className="text-sm font-medium text-zinc-500">View and respond to pending administrative or required tasks.</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Pending Action Items
                    </h2>
                    
                    {pendingTasks.length === 0 ? (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-12 text-center flex flex-col items-center">
                            <CheckCircle2 className="w-12 h-12 text-emerald-500/50 mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">You're all caught up!</h3>
                            <p className="text-sm text-zinc-500">There are no pending tasks assigned to you right now.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {pendingTasks.map(task => (
                                <div 
                                    key={task.id} 
                                    onClick={() => handleOpenTask(task)}
                                    className="bg-zinc-900 border border-orange-500/20 hover:border-orange-500/50 rounded-2xl p-6 cursor-pointer transition-all hover:bg-zinc-900/80 hover:-translate-y-1 shadow-xl group"
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="bg-orange-500/10 text-orange-400 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md">
                                            Action Required
                                        </span>
                                        <span className="text-xs text-zinc-600 font-medium">Assigned: {new Date(task.createdAt?._seconds * 1000 || Date.now()).toLocaleDateString()}</span>
                                    </div>
                                    <h3 className="text-xl font-bold text-white group-hover:text-orange-400 transition-colors">{task.title}</h3>
                                    <p className="text-sm text-zinc-500 mt-2">Click to open and complete this required assignment.</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {completedTasks.length > 0 && (
                    <div className="space-y-6 pt-8 border-t border-zinc-800/50">
                        <h2 className="text-xl font-bold text-zinc-400 flex items-center gap-2">
                            Previously Completed
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {completedTasks.map(task => (
                                <div key={task.id} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 opacity-70">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> Done
                                        </span>
                                        <span className="text-xs text-zinc-600 font-medium">{task.completedAt ? new Date(task.completedAt._seconds * 1000).toLocaleDateString() : new Date().toLocaleDateString()}</span>
                                    </div>
                                    <h3 className="text-base font-bold text-zinc-300">{task.title}</h3>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
