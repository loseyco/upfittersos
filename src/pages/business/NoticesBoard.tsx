import { useState, useEffect } from 'react';
import { Megaphone, ArrowLeft } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function NoticesBoard() {
    const { tenantId } = useAuth();
    const navigate = useNavigate();
    const [notices, setNotices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL' || tenantId === 'unassigned') {
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'announcements'), 
            where('tenantId', '==', tenantId),
            where('active', '==', true)
        );
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

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-yellow-500/5 rounded-full blur-[100px] pointer-events-none"></div>

            <div className="max-w-4xl mx-auto w-full flex-1 relative z-10">
                <button 
                    onClick={() => navigate('/dashboard')}
                    className="mb-8 flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm font-bold bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-4 py-2.5 rounded-xl w-fit group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
                </button>

                <div className="flex items-center gap-4 mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 flex flex-col items-center justify-center border border-yellow-500/20 shrink-0">
                        <Megaphone className="w-6 h-6 text-yellow-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight">Company Notices</h1>
                        <p className="text-zinc-400 mt-1 font-medium text-sm">Review important business-wide announcements and memorandums.</p>
                    </div>
                </div>

                {loading ? (
                    <div className="animate-pulse flex flex-col space-y-4">
                        <div className="h-32 bg-zinc-900/50 rounded-3xl border border-zinc-800"></div>
                        <div className="h-32 bg-zinc-900/50 rounded-3xl border border-zinc-800"></div>
                    </div>
                ) : notices.length === 0 ? (
                    <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-12 text-center flex flex-col items-center shadow-inner">
                        <div className="w-16 h-16 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-700">
                            <Megaphone className="w-7 h-7" />
                        </div>
                        <h3 className="text-lg font-black text-white mb-2">No Active Notices</h3>
                        <p className="text-zinc-500 max-w-sm text-sm">You are completely caught up. There are no active global announcements at this time.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {notices.map(notice => (
                            <div key={notice.id} className="bg-zinc-900/60 backdrop-blur-md overflow-hidden border border-zinc-800 hover:border-yellow-500/30 transition-all p-6 md:p-8 rounded-3xl shadow-xl hover:shadow-yellow-500/5">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-yellow-400">Global Memo</span>
                                        </div>
                                        <h4 className="text-2xl font-black text-white tracking-tight">{notice.title}</h4>
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-widest text-zinc-500 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800/80 whitespace-nowrap mt-1">
                                        {notice.createdAt?.toDate ? new Date(notice.createdAt.toDate()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Just now'}
                                    </span>
                                </div>
                                <div className="bg-zinc-950/80 p-5 md:p-6 rounded-2xl border border-zinc-800/80 shadow-inner">
                                    <p className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed">{notice.message}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
