import { useState, useEffect } from 'react';
import { Megaphone, Plus, Trash2, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { collection, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../contexts/AuthContext';

export function NoticesAdminTab({ tenantId }: { tenantId: string }) {
    const { currentUser } = useAuth();
    const [notices, setNotices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [showForm, setShowForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [isActive, setIsActive] = useState(true);

    const [editMode, setEditMode] = useState<any | null>(null);

    useEffect(() => {
        if (!tenantId || tenantId === 'unassigned') {
            setLoading(false);
            return;
        }

        setLoading(true);
        const q = query(collection(db, 'announcements'), where('tenantId', '==', tenantId));
        const unsub = onSnapshot(q, (s) => {
            const fetched = s.docs.map(d => ({ id: d.id, ...d.data() }));
            fetched.sort((a: any, b: any) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                return timeB - timeA;
            });
            setNotices(fetched);
            setLoading(false);
        });

        return () => unsub();
    }, [tenantId]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !message.trim()) return toast.error("Title and message required");

        try {
            setIsSubmitting(true);
            if (editMode) {
                await updateDoc(doc(db, 'announcements', editMode.id), {
                    title,
                    message,
                    active: isActive
                });
                toast.success("Notice updated");
            } else {
                await addDoc(collection(db, 'announcements'), {
                    tenantId,
                    title,
                    message,
                    active: isActive,
                    authorUid: currentUser?.uid,
                    createdAt: serverTimestamp()
                });
                toast.success("Notice published");
            }
            setShowForm(false);
            setEditMode(null);
            setTitle('');
            setMessage('');
            setIsActive(true);
        } catch (err) {
            console.error(err);
            toast.error("Failed to save notice");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Permanently delete this notice?")) return;
        try {
            await deleteDoc(doc(db, 'announcements', id));
            toast.success("Notice deleted");
        } catch (err) {
            toast.error("Failed to delete notice");
        }
    };

    const toggleStatus = async (id: string, currentStatus: boolean) => {
        try {
            await updateDoc(doc(db, 'announcements', id), { active: !currentStatus });
            toast.success(currentStatus ? "Notice deactivated" : "Notice activated");
        } catch (err) {
            toast.error("Failed to update status");
        }
    };

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center">Loading Notices...</div>;
    }

    return (
        <div className="flex flex-col h-full bg-zinc-950">
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 shrink-0 flex items-center justify-between relative z-10">
                <div>
                    <h3 className="text-white font-bold tracking-tight">Global Notices</h3>
                    <p className="text-zinc-500 text-xs mt-0.5">Manage business-wide announcements visible to all staff.</p>
                </div>
                <button 
                    onClick={() => {
                        setShowForm(!showForm);
                        if (!showForm) {
                            setEditMode(null);
                            setTitle('');
                            setMessage('');
                            setIsActive(true);
                        }
                    }}
                    className="bg-accent hover:bg-accent-hover text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
                >
                    {showForm ? 'Cancel' : <><Plus className="w-4 h-4" /> New Notice</>}
                </button>
            </div>

            {showForm && (
                <div className="p-6 bg-zinc-900 border-b border-zinc-800 shrink-0">
                    <form onSubmit={handleSave} className="max-w-2xl space-y-4">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-white font-bold flex items-center gap-2">
                                <Megaphone className="w-5 h-5 text-accent" /> {editMode ? 'Edit Notice' : 'New Notice'}
                            </h4>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Title (Max 60 chars)</label>
                            <input 
                                type="text" 
                                required
                                maxLength={60}
                                placeholder="e.g. IMMEDIATELY - SHOP SUPPLIES"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Message Body</label>
                            <textarea 
                                required
                                rows={4}
                                placeholder="Effective immediately..."
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent text-white resize-y"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={e => setIsActive(e.target.checked)}
                                    className="w-4 h-4 rounded border-zinc-700 text-accent focus:ring-accent bg-zinc-950"
                                />
                                <span className="text-sm font-bold text-white">Active (Visible to Staff)</span>
                            </label>
                        </div>
                        <div className="pt-2">
                            <button 
                                type="submit" 
                                disabled={isSubmitting}
                                className="bg-accent hover:bg-accent-hover text-white disabled:opacity-50 font-bold px-6 py-2.5 rounded-lg transition-colors text-sm shadow-lg"
                            >
                                {isSubmitting ? 'Saving...' : 'Publish Notice'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {notices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <Megaphone className="w-12 h-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-1">No Notices Found</h3>
                        <p className="text-zinc-500 text-sm">There are no global announcements yet.</p>
                    </div>
                ) : (
                    notices.map((notice) => (
                        <div key={notice.id} className={`bg-zinc-900 border ${notice.active ? 'border-accent/30' : 'border-zinc-800'} rounded-2xl p-6 relative group transition-colors`}>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="text-lg font-black text-white">{notice.title}</h4>
                                    <span className="text-xs text-zinc-500 font-mono mt-1 block">
                                        {notice.createdAt?.toDate ? new Date(notice.createdAt.toDate()).toLocaleString() : 'Just now'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => toggleStatus(notice.id, notice.active)}
                                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded border transition-colors ${notice.active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}
                                    >
                                        {notice.active ? 'Active' : 'Inactive'}
                                    </button>
                                </div>
                            </div>
                            <p className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed">{notice.message}</p>
                            
                            {/* Actions overlay */}
                            <div className="absolute top-4 right-4 flex opacity-0 group-hover:opacity-100 transition-opacity gap-2 bg-zinc-900/90 p-1 rounded-lg backdrop-blur shadow-lg border border-zinc-800">
                                <button 
                                    onClick={() => {
                                        setEditMode(notice);
                                        setTitle(notice.title);
                                        setMessage(notice.message);
                                        setIsActive(notice.active);
                                        setShowForm(true);
                                    }}
                                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => handleDelete(notice.id)}
                                    className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
