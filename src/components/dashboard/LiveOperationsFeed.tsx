import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Clock, CheckCircle2, AlertTriangle, ShieldCheck, Play, Square, MessageSquare, Briefcase } from 'lucide-react';

const timeAgo = (dateStr: string) => {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });
    const ms = new Date(dateStr).getTime() - Date.now();
    const minutesDiff = Math.round(ms / (1000 * 60));
    const hoursDiff = Math.round(ms / (1000 * 60 * 60));
    const daysDifference = Math.round(ms / (1000 * 60 * 60 * 24));
    
    if (Math.abs(minutesDiff) < 1) return 'now';
    if (Math.abs(hoursDiff) < 1) return rtf.format(minutesDiff, 'minute');
    if (Math.abs(daysDifference) < 1) return rtf.format(hoursDiff, 'hour');
    return rtf.format(daysDifference, 'day');
};

export function LiveOperationsFeed({ onEventClick }: { onEventClick?: (event: any) => void }) {
    const { tenantId } = useAuth();
    const [events, setEvents] = useState<any[]>([]);

    useEffect(() => {
        if (!tenantId) return;
        const q = query(
            collection(db, 'businesses', tenantId, 'business_events'),
            orderBy('timestamp', 'desc'),
            limit(50)
        );
        const unsub = onSnapshot(q, (snap) => {
            setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [tenantId]);

    const getIcon = (action: string) => {
        switch (action) {
            case 'TASK_START': return <Play className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" />;
            case 'TASK_STOP': return <Square className="w-3.5 h-3.5 text-amber-400" fill="currentColor" />;
            case 'STATUS_CHANGE': return <Briefcase className="w-3.5 h-3.5 text-blue-400" />;
            case 'BLOCKER_ADDED': return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
            case 'BLOCKER_RESOLVED': return <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />;
            case 'NOTE_ADDED': return <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />;
            default: return <Clock className="w-3.5 h-3.5 text-zinc-500" />;
        }
    };

    return (
        <div className="w-80 h-full bg-zinc-950 border-l border-zinc-800 flex flex-col shrink-0">
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between shadow-sm z-10 sticky top-0 shrink-0">
                <h2 className="font-black text-xs uppercase tracking-widest text-zinc-300 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
                    Live Operations
                </h2>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                {events.length === 0 && (
                    <div className="text-center text-zinc-600 text-xs mt-10 font-bold uppercase tracking-widest">Waiting for activity...</div>
                )}
                {events.map((event) => (
                    <div key={event.id} 
                         onClick={() => onEventClick && onEventClick(event)}
                         className={`relative pl-7 before:absolute before:left-[11px] before:top-8 before:bottom-[-24px] before:w-[2px] before:bg-zinc-800/50 last:before:hidden group ${onEventClick && event.jobId ? 'cursor-pointer' : ''}`}>
                        <div className="absolute left-[-2px] top-1 bg-zinc-950 rounded-full p-1.5 border border-zinc-800 z-10 group-hover:border-zinc-700 transition-colors shadow-md">
                            {getIcon(event.action)}
                        </div>
                        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-3 hover:bg-zinc-900/80 transition-colors shadow-sm relative overflow-hidden group-hover:border-zinc-700">
                            <div className="flex justify-between items-start mb-1 gap-2">
                                <span className="text-[10px] uppercase font-black tracking-widest text-emerald-500/80">
                                    {(event.userName || 'System').split(' ')[0]}
                                </span>
                                <span className="text-[9px] font-bold text-zinc-500 whitespace-nowrap">
                                    {event.timestamp ? timeAgo(event.timestamp) : ''}
                                </span>
                            </div>
                            <div className="text-xs text-zinc-200 font-medium leading-relaxed drop-shadow-sm">
                                {event.details}
                            </div>
                            {(event.jobTitle || event.taskTitle) && (
                                <div className="mt-2 text-[10px] font-medium text-zinc-500 flex flex-col gap-0.5 border-t border-zinc-800/50 pt-2">
                                    {event.jobTitle && <span className="truncate">Job: {event.jobTitle}</span>}
                                    {event.taskTitle && <span className="text-zinc-400 truncate font-bold">Task: {event.taskTitle}</span>}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
