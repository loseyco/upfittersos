import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, orderBy, getDocs, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { Clock, MapPin, Pizza, Coffee, Calendar, Timer, MessageSquare, Send, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface TimeSession {
  id: string;
  clockIn: {
    timestamp: any;
    location?: string;
    onSite?: boolean;
  };
  clockOut?: {
    timestamp: any;
    location?: string;
    onSite?: boolean;
  };
  isRemote?: boolean;
  breaks: Array<{
    type: 'lunch' | 'normal';
    start: any;
    end?: any;
    isPaid: boolean;
  }>;
  status: string;
}

export function TimeClockHistory({ tenantId }: { tenantId: string }) {
  const { user } = useAuthStore();
  const [requestingEdit, setRequestingEdit] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['time-sessions', tenantId, user?.uid],
    queryFn: async () => {
      if (!user?.uid) return [];
      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('userId', '==', user.uid),
        orderBy('clockIn.timestamp', 'desc'),
        limit(20)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeSession));
    },
    enabled: !!user?.uid && !!tenantId
  });

  const { data: requests } = useQuery({
    queryKey: ['time-edit-requests', tenantId, user?.uid],
    queryFn: async () => {
      if (!user?.uid) return [];
      const q = query(
        collection(db, `businesses/${tenantId}/time_edit_requests`),
        where('userId', '==', user.uid)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: !!user?.uid && !!tenantId
  });

  const getRequestForSession = (sessionId: string) => {
    return requests?.find((r: any) => r.sessionId === sessionId);
  };

  const formatTime = (ts: any) => {
    if (!ts) return '--:--';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts: any) => {
    if (!ts) return '--';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const calculateDuration = (start: any, end: any) => {
    if (!start) return 0;
    const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
    const e = end ? (end.toDate ? end.toDate().getTime() : new Date(end).getTime()) : now;
    return Math.max(0, e - s);
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  if (isLoading) return (
    <div className="flex items-center justify-center p-12">
      <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Recent Activity</h3>
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Last 20 Sessions</span>
      </div>

      <div className="grid gap-4">
        {sessions?.map((session) => {
          const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
          const breakMs = session.breaks.reduce((acc, b) => acc + calculateDuration(b.start, b.end), 0);
          const workMs = totalMs - breakMs;
          const request = getRequestForSession(session.id);

          return (
            <div key={session.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm hover:border-indigo-500/30 transition-all group">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-zinc-400 group-hover:bg-indigo-500/10 group-hover:text-indigo-500 transition-colors">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight">
                        {formatDate(session.clockIn.timestamp)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight",
                          session.status === 'completed' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600"
                        )}>
                          {session.status}
                        </span>
                        {request && (
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ring-1 ring-inset",
                            (request as any).status === 'pending' ? "bg-amber-500/10 text-amber-600 ring-amber-500/20" : "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
                          )}>
                            Edit {(request as any).status}
                          </span>
                        )}
                        {session.isRemote && (
                          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white uppercase tracking-tight">
                            <MapPin className="w-2.5 h-2.5" /> Remote
                          </span>
                        )}
                        {!session.isRemote && session.clockIn.onSite === false && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-rose-500 uppercase">
                            <MapPin className="w-3 h-3" /> Off-site
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row items-start md:items-center gap-4 flex-1">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 flex-1">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Clock In</p>
                        <p className="text-sm font-black text-zinc-900 dark:text-white font-mono">{formatTime(session.clockIn.timestamp)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Clock Out</p>
                        <p className="text-sm font-black text-zinc-900 dark:text-white font-mono">{formatTime(session.clockOut?.timestamp)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Breaks</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black text-zinc-900 dark:text-white font-mono">{formatDuration(breakMs)}</span>
                          <div className="flex -space-x-1">
                            {session.breaks.map((b, i) => (
                              <div key={i} className="p-1 bg-zinc-100 dark:bg-zinc-800 rounded-full border border-white dark:border-zinc-900" title={`${b.type} break`}>
                                {b.type === 'lunch' ? <Pizza className="w-2.5 h-2.5 text-zinc-500" /> : <Coffee className="w-2.5 h-2.5 text-zinc-500" />}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Total Work</p>
                        <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono flex items-center gap-2">
                          <Timer className="w-3.5 h-3.5" />
                          {formatDuration(workMs)}
                        </p>
                      </div>
                    </div>
                    
                    {!request && (
                      <button 
                        onClick={() => setRequestingEdit(session.id)}
                        className="p-2 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"
                        title="Request Correction"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Edit Request Modal */}
        {requestingEdit && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Request Correction</h3>
                </div>
                <button onClick={() => setRequestingEdit(null)} className="p-2 text-zinc-400 hover:text-zinc-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-zinc-500">Please describe the error in your time record (e.g. forgot to clock out, incorrect break time).</p>
                <textarea 
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Tell us what needs to be changed..."
                  className="w-full h-32 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white text-sm resize-none"
                />
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setRequestingEdit(null)}
                    className="flex-1 px-6 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl font-bold hover:bg-zinc-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={!editNote.trim() || isSubmitting}
                    onClick={async () => {
                      setIsSubmitting(true);
                      try {
                        await addDoc(collection(db, `businesses/${tenantId}/time_edit_requests`), {
                          sessionId: requestingEdit,
                          userId: user!.uid,
                          userName: user!.displayName || user!.email,
                          note: editNote,
                          status: 'pending',
                          createdAt: serverTimestamp()
                        });
                        toast.success("Correction request submitted");
                        setRequestingEdit(null);
                        setEditNote('');
                      } catch (e) {
                        toast.error("Failed to submit request");
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'Submitting...' : <><Send className="w-4 h-4" /> Send Request</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {sessions?.length === 0 && (
          <div className="text-center p-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
            <Clock className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-500 font-medium">No time sessions recorded yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
