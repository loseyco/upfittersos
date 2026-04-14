import { useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { AlertOctagon, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export function GlobalAlertsSystem() {
    const { tenantId } = useAuth();

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL' || tenantId === 'unassigned') {
            return;
        }

        const q = query(
            collection(db, 'announcements'), 
            where('tenantId', '==', tenantId),
            where('active', '==', true)
        );

        let initialLoad = true;

        const unsub = onSnapshot(q, (snapshot) => {
            if (initialLoad) {
                initialLoad = false;
                return;
            }

            snapshot.docChanges().forEach(change => {
                // If a notice is newly added or toggled active while we are watching:
                if (change.type === 'added') {
                    const noticeData = { id: change.doc.id, ...(change.doc.data() as any) };
                    
                    toast((t) => (
                        <div className="flex flex-col gap-2 w-full min-w-[350px] max-w-lg">
                            <style>{`
                                @keyframes police-strobe {
                                    0%, 20% { box-shadow: 0 0 40px rgba(239, 68, 68, 0.5) inset, 0 0 30px rgba(239, 68, 68, 0.8); border-color: #ef4444; }
                                    25%, 45% { box-shadow: 0 0 10px rgba(24, 24, 27, 0.5); border-color: #27272a; }
                                    50%, 70% { box-shadow: 0 0 40px rgba(59, 130, 246, 0.5) inset, 0 0 30px rgba(59, 130, 246, 0.8); border-color: #3b82f6; }
                                    75%, 100% { box-shadow: 0 0 10px rgba(24, 24, 27, 0.5); border-color: #27272a; }
                                }
                                .police-toast-system {
                                    animation: police-strobe 0.6s infinite !important;
                                    background: rgba(9, 9, 11, 0.95) !important;
                                    border: 2px solid transparent;
                                    backdrop-filter: blur(8px);
                                }
                            `}</style>
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/50">
                                    <AlertOctagon className="w-6 h-6 text-red-500 animate-pulse" />
                                </div>
                                <div className="flex-1 flex flex-col justify-center min-w-0">
                                    <p className="text-xl font-black text-white uppercase tracking-tighter truncate">{noticeData.title || 'CRITICAL BULLETIN'}</p>
                                    <p className="text-sm font-medium text-zinc-300 mt-1 line-clamp-3">{noticeData.message || 'Please check the Notices Board immediately.'}</p>
                                    <p className="text-[9px] font-bold text-red-500 mt-2 uppercase tracking-widest animate-pulse opacity-70">
                                        System Broadcast Event Triggered
                                    </p>
                                </div>
                                <button
                                    onClick={() => toast.dismiss(t.id)}
                                    className="text-zinc-500 hover:text-white transition-colors bg-zinc-900 border border-zinc-700 hover:border-zinc-500 rounded-lg p-2 shadow-sm shrink-0"
                                >
                                    <XCircle className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ), {
                        duration: 12000,
                        id: `system_alert_${noticeData.id}`,
                        className: 'police-toast-system',
                        style: {
                            color: '#fff',
                            padding: '24px',
                            borderRadius: '16px',
                            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)'
                        }
                    });
                }
            });
        });

        return () => unsub();
    }, [tenantId]);

    return null;
}
