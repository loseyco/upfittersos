import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Clock, Coffee, Play } from 'lucide-react';
import { Link } from 'react-router-dom';

export function GlobalTimeTracker() {
    const { currentUser, tenantId } = useAuth();
    const [activeLog, setActiveLog] = useState<any>(null);
    const [elapsedTime, setElapsedTime] = useState<string>('00:00:00');
    
    const fetchActiveLog = async () => {
        if (!currentUser || !tenantId || tenantId === 'GLOBAL' || tenantId === 'unassigned') {
            setActiveLog(null);
            return;
        }
        try {
            const res = await api.get(`/businesses/${tenantId}/time_logs?userId=${currentUser.uid}&status=open`);
            if (res.data && res.data.length > 0) {
                setActiveLog(res.data[0]);
            } else {
                setActiveLog(null);
            }
        } catch (err) {
            console.error('Failed to fetch active time log', err);
            setActiveLog(null);
        }
    };

    useEffect(() => {
        fetchActiveLog();
        
        const handleUpdate = () => fetchActiveLog();
        window.addEventListener('time_punch_updated', handleUpdate);
        return () => window.removeEventListener('time_punch_updated', handleUpdate);
    }, [currentUser, tenantId]);

    // Timer logic
    useEffect(() => {
        if (!activeLog) return;
        
        const updateTimer = () => {
            const start = new Date(activeLog.clockIn).getTime();
            const now = new Date().getTime();
            
            let totalMs = now - start;
            
            if (activeLog.breaks && Array.isArray(activeLog.breaks)) {
                activeLog.breaks.forEach((b: any) => {
                    const bStart = new Date(b.start).getTime();
                    // If break is ongoing (no end), subtract from bStart to now
                    const bEnd = b.end ? new Date(b.end).getTime() : now;
                    totalMs -= (bEnd - bStart);
                });
            }
            
            const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
            const hrs = Math.floor(totalSeconds / 3600);
            const mins = Math.floor((totalSeconds % 3600) / 60);
            const secs = totalSeconds % 60;
            
            setElapsedTime(
                `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
            );
        };
        
        updateTimer(); // initial
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [activeLog]);

    if (!activeLog) return null;

    const onBreak = activeLog.breaks?.length > 0 && !activeLog.breaks[activeLog.breaks.length - 1].end;

    return (
        <div className={`w-full h-12 flex items-center justify-between px-4 sm:px-6 font-bold text-sm shadow-sm sticky top-0 z-[45] backdrop-blur-md transition-colors ${onBreak ? 'bg-amber-500/20 text-amber-500 border-b border-amber-500/30' : 'bg-emerald-500/20 text-emerald-500 border-b border-emerald-500/30'}`}>
            <div className="flex items-center gap-2 sm:gap-3">
                {onBreak ? <Coffee className="w-4 h-4 animate-pulse" /> : <Play className="w-4 h-4 animate-pulse" />}
                <div className="flex items-center gap-2">
                    <span className="hidden leading-none sm:inline mt-0.5">{onBreak ? 'ON BREAK:' : 'ACTIVE SHIFT:'}</span>
                    <span className="font-mono text-base tracking-widest">{elapsedTime}</span>
                </div>
            </div>
            
            <Link 
                to="/business/time" 
                className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors border shadow-sm text-xs ${onBreak ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600' : 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600'}`}
            >
                <Clock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Manage Time</span>
            </Link>
        </div>
    );
}
