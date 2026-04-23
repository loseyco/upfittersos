import { MapPin, Clock } from 'lucide-react';

function formatDuration(start: Date, end: Date) {
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 60000) return '< 1 min';
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    if (hrs === 0) return `${mins} min${mins !== 1 ? 's' : ''}`;
    return `${hrs} hr${hrs !== 1 ? 's' : ''} ${mins} min`;
}

export function LocationHistoryTimeline({ history }: { history?: any[] }) {
    if (!history || history.length === 0) {
        return (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h2 className="text-sm font-black text-white uppercase tracking-widest mb-4 border-b border-zinc-800 pb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-zinc-500" /> Location History
                </h2>
                <div className="text-sm text-zinc-500 text-center italic py-4">
                    No location history recorded for this vehicle.
                </div>
            </div>
        );
    }

    // Sort descending by enteredAt
    const sortedHistory = [...history].sort((a, b) => new Date(b.enteredAt).getTime() - new Date(a.enteredAt).getTime());

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-sm font-black text-white uppercase tracking-widest mb-6 border-b border-zinc-800 pb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-500" /> Location History
            </h2>
            
            <div className="relative border-l-2 border-zinc-800 ml-3 space-y-6">
                {sortedHistory.map((entry, idx) => {
                    const isCurrent = !entry.exitedAt;
                    const endDate = entry.exitedAt ? new Date(entry.exitedAt) : new Date();
                    const startDate = new Date(entry.enteredAt);
                    const durationStr = formatDuration(startDate, endDate);

                    return (
                        <div key={idx} className="relative pl-6">
                            {/* Dot */}
                            <div className={`absolute -left-[5px] top-1.5 w-2 h-2 rounded-full ring-4 ring-zinc-900 ${isCurrent ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700'}`}></div>
                            
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <h3 className={`text-sm font-bold ${isCurrent ? 'text-white' : 'text-zinc-400'}`}>
                                        {entry.location}
                                    </h3>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        Moved by {entry.movedByEmail ? entry.movedByEmail.split('@')[0] : 'System'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-4 text-xs font-mono font-bold text-zinc-500">
                                    <div className="text-right">
                                        <div className={isCurrent ? 'text-emerald-400' : 'text-zinc-400'}>
                                            {isCurrent ? 'Current Location' : durationStr}
                                        </div>
                                        <div className="text-[9px] uppercase tracking-widest mt-0.5">
                                            {startDate.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                    <Clock className="w-3.5 h-3.5 opacity-50" />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
