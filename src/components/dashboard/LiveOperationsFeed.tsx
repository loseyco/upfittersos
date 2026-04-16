import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Clock, CheckCircle2, AlertTriangle, ShieldCheck, Play, Square, MessageSquare, Briefcase, Filter, ChevronRight, ChevronLeft } from 'lucide-react';

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

export function LiveOperationsFeed({ onEventClick, allJobs, globalVehicles }: { onEventClick?: (event: any) => void, allJobs?: any[], globalVehicles?: any[] }) {
    const { tenantId } = useAuth();
    const [events, setEvents] = useState<any[]>([]);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [filterMenuOpen, setFilterMenuOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState<string[]>([]);

    useEffect(() => {
        if (!tenantId) return;
        const q = query(
            collection(db, 'businesses', tenantId, 'business_events'),
            orderBy('timestamp', 'desc'),
            limit(100)
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

    const toggleFilter = (f: string) => {
        setActiveFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
    };

    const filteredEvents = events.filter(e => {
        if (activeFilters.length === 0) return true;
        if (activeFilters.includes('Time & Tasks') && ['TASK_START', 'TASK_STOP'].includes(e.action)) return true;
        if (activeFilters.includes('Blockers & Notes') && ['BLOCKER_ADDED', 'BLOCKER_RESOLVED', 'NOTE_ADDED'].includes(e.action)) return true;
        if (activeFilters.includes('Status') && ['STATUS_CHANGE'].includes(e.action)) return true;
        return false;
    });

    if (isCollapsed) {
        return (
            <div className="w-12 h-full bg-zinc-950 border-l border-zinc-800 flex flex-col shrink-0 items-center py-4 relative transition-all shadow-[-4px_0_15px_rgba(0,0,0,0.5)] overflow-hidden">
                <button 
                    onClick={() => setIsCollapsed(false)}
                    className="absolute top-20 -left-3 transform -translate-y-1/2 bg-zinc-800 border border-zinc-700 rounded-full p-1 shadow-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors z-20"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)] mb-6 mt-1" title="Live"></div>
                <div className="flex-1 overflow-y-auto no-scrollbar w-full flex flex-col items-center gap-4">
                    {filteredEvents.slice(0, 15).map((e) => (
                        <div key={e.id} className="relative group cursor-pointer" onClick={() => { setIsCollapsed(false); if (onEventClick) onEventClick(e); }}>
                            <div className="bg-zinc-900 border border-zinc-800 rounded-full p-2 group-hover:border-zinc-600 transition-colors">
                                {getIcon(e.action)}
                            </div>
                            <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-zinc-800 border border-zinc-700 text-white text-[10px] whitespace-nowrap px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                {e.details}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="w-80 absolute right-0 top-0 bottom-0 z-50 md:relative h-full bg-zinc-950 border-l border-zinc-800 flex flex-col shrink-0 transition-all shadow-[-4px_0_15px_rgba(0,0,0,0.5)] overflow-hidden">
            <button 
                onClick={() => setIsCollapsed(true)}
                className="absolute top-20 -left-3 transform -translate-y-1/2 bg-zinc-800 border border-zinc-700 rounded-full p-1 shadow-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors z-20 hidden md:flex"
            >
                <ChevronRight className="w-4 h-4" />
            </button>

            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex flex-col shadow-sm z-10 sticky top-0 shrink-0">
                <div className="flex items-center justify-between w-full">
                    <h2 className="font-black text-xs uppercase tracking-widest text-zinc-300 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
                        Live Operations
                    </h2>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                            className={`text-zinc-400 hover:text-white p-1 rounded transition-colors ${activeFilters.length > 0 ? 'text-accent bg-accent/10' : ''}`}
                            title="Filter Events"
                        >
                            <Filter className="w-3.5 h-3.5" />
                        </button>
                        <button 
                            onClick={() => setIsCollapsed(true)} 
                            className="md:hidden text-zinc-400 hover:text-white p-1 rounded transition-colors bg-zinc-800/50"
                        >
                             <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                
                {filterMenuOpen && (
                    <div className="flex flex-wrap gap-1 mt-3">
                        {['Time & Tasks', 'Blockers & Notes', 'Status'].map(f => (
                            <button 
                                key={f}
                                onClick={() => toggleFilter(f)}
                                className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border transition-colors ${activeFilters.includes(f) ? 'border-accent bg-accent/10 text-accent' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                {filteredEvents.length === 0 && (
                    <div className="text-center text-zinc-600 text-xs mt-10 font-bold uppercase tracking-widest">No activity found...</div>
                )}
                {filteredEvents.map((event) => {
                    const assocJob = (allJobs || []).find(j => j.id === event.jobId);
                    const assocVehicle = assocJob ? (globalVehicles || []).find(v => v.id === assocJob.vehicleId) : null;
                    const assocPhoto = event.photoUrl || assocVehicle?.photos?.[0] || assocVehicle?.photoUrl;

                    return (
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
                                {assocPhoto && (
                                    <div className="mt-2 rounded overflow-hidden border border-zinc-700 max-h-32">
                                        <img src={assocPhoto} alt="Associated visual" className="w-full h-full object-cover" />
                                    </div>
                                )}
                                {(event.jobTitle || event.taskTitle) && (
                                    <div className="mt-2 text-[10px] font-medium text-zinc-500 flex flex-col gap-0.5 border-t border-zinc-800/50 pt-2">
                                        {event.jobTitle && <span className="truncate">Job: {event.jobTitle}</span>}
                                        {event.taskTitle && <span className="text-zinc-400 truncate font-bold">Task: {event.taskTitle}</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
