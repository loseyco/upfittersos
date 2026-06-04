import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, orderBy, getDocs, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { Clock, MapPin, Calendar, MessageSquare, Send, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { TimeSessionEditorModal } from './TimeSessionEditorModal';

interface TimeSession {
  id: string;
  userId: string;
  userName?: string;
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
  jobs?: Array<{
    id: string;
    name: string;
    start: any;
    end?: any;
    taskId?: string | null;
    taskName?: string | null;
    bookTime?: number;
  }>;
  status: string;
  verificationStatus?: string;
}

export function TimeClockHistory({ tenantId }: { tenantId: string }) {
  const { user } = useAuthStore();
  const [requestingEdit, setRequestingEdit] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [editingSession, setEditingSession] = useState<TimeSession | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['time-sessions', tenantId, user?.uid],
    queryFn: async () => {
      if (!user?.uid) return [];
      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('userId', '==', user.uid),
        orderBy('clockIn.timestamp', 'desc'),
        limit(50)
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

  const { data: staffMember } = useQuery({
    queryKey: ['my-staff-record', tenantId, user?.uid],
    queryFn: async () => {
      if (!user?.uid) return null;
      const snap = await getDocs(query(collection(db, `businesses/${tenantId}/staff`), where('userId', '==', user.uid)));
      if (snap.empty) return null;
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
    },
    enabled: !!user?.uid && !!tenantId
  });

  const { data: myDepartment } = useQuery({
    queryKey: ['my-department', tenantId, staffMember?.departmentId],
    queryFn: async () => {
      if (!staffMember?.departmentId) return null;
      const snap = await getDocs(query(collection(db, `businesses/${tenantId}/departments`)));
      const deptDoc = snap.docs.find(d => d.id === staffMember.departmentId);
      return deptDoc ? { id: deptDoc.id, ...deptDoc.data() } as any : null;
    },
    enabled: !!staffMember?.departmentId
  });

  const getRequestForSession = (sessionId: string) => {
    return requests?.find((r: any) => r.sessionId === sessionId);
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

  const calculateSessionPayMs = (session: TimeSession, payType?: string) => {
    const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
    const breakMs = (session.breaks || []).reduce((acc, b) => acc + calculateDuration(b.start, b.end), 0);
    const workMs = totalMs - breakMs;

    if (!session.jobs || session.jobs.length === 0) {
      return payType === 'flat_rate' ? 0 : workMs;
    }

    const taskActualTime: Record<string, number> = {};
    const taskBookTime: Record<string, number> = {};

    session.jobs.forEach((j: any, idx: number) => {
      const key = j.taskId || `manual-${idx}-${j.name}`;
      const start = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
      const end = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : now;
      const segMs = Math.max(0, end - start);

      taskActualTime[key] = (taskActualTime[key] || 0) + segMs;
      if (j.bookTime && j.bookTime > 0) {
        taskBookTime[key] = j.bookTime * 3600000;
      }
    });

    if (payType === 'flat_rate') {
      return Object.values(taskBookTime).reduce((acc, t) => acc + t, 0);
    }

    let adjustmentMs = 0;
    Object.keys(taskBookTime).forEach(key => {
      const actualMs = taskActualTime[key] || 0;
      const bookMs = taskBookTime[key] || 0;
      adjustmentMs += (bookMs - actualMs);
    });

    return Math.max(0, workMs + adjustmentMs);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center p-12">
      <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(todayStart);
  const day = weekStart.getDay(); // 0 is Sunday, 1 is Monday, etc.
  const daysToSubtract = day === 0 ? 6 : day - 1;
  weekStart.setDate(weekStart.getDate() - daysToSubtract);

  let todayMs = 0;
  let weekMs = 0;
  let todayPayMs = 0;
  let weekPayMs = 0;

  let activeCreditMs = 0;
  if (staffMember?.payPeriodBookTimeCredit && staffMember.payPeriodBookTimeCredit > 0) {
    activeCreditMs = staffMember.payPeriodBookTimeCredit * 3600000;
  } else if (myDepartment?.weeklyBookTimeCredit && myDepartment.weeklyBookTimeCredit > 0) {
    activeCreditMs = myDepartment.weeklyBookTimeCredit * 3600000;
  }

  sessions?.forEach(session => {
    const sessionDate = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
    if (!sessionDate) return;

    const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
    const breakMs = (session.breaks || []).reduce((acc, b) => acc + calculateDuration(b.start, b.end), 0);
    const workMs = totalMs - breakMs;
    const payMs = calculateSessionPayMs(session, staffMember?.payType);

    if (sessionDate.getTime() >= weekStart.getTime()) {
      weekMs += workMs;
      weekPayMs += payMs;
    }
    if (sessionDate.getTime() >= todayStart.getTime()) {
      todayMs += workMs;
      todayPayMs += payMs;
    }
  });

  if (weekMs > 0 && activeCreditMs > 0) {
    weekPayMs += activeCreditMs;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Activity Log</h3>
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Recent Sessions</span>
      </div>

      <div className="grid gap-4">
        {sessions?.map((session) => {
          const totalMs = calculateDuration(session.clockIn.timestamp, session.clockOut?.timestamp);
          const breakMs = (session.breaks || []).reduce((acc, b) => acc + calculateDuration(b.start, b.end), 0);
          const workMs = totalMs - breakMs;
          const bookMs = (() => {
            if (!session.jobs || session.jobs.length === 0) return 0;
            const taskBookTime: Record<string, number> = {};
            session.jobs.forEach((j: any, idx: number) => {
              const key = j.taskId || `manual-${idx}-${j.name}`;
              if (j.bookTime && j.bookTime > 0) {
                taskBookTime[key] = j.bookTime * 3600000;
              }
            });
            return Object.values(taskBookTime).reduce((acc, t) => acc + t, 0);
          })();
          const request = getRequestForSession(session.id);

          return (
            <div 
              key={session.id} 
              onClick={() => setEditingSession(session)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm hover:border-indigo-500/30 hover:bg-zinc-50/50 dark:hover:bg-zinc-950/40 transition-all group flex items-center justify-between gap-4 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-zinc-400 group-hover:bg-indigo-500/10 group-hover:text-indigo-500 transition-colors">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight">
                    {formatDate(session.clockIn.timestamp)}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight",
                      session.status === 'completed' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600"
                    )}>
                      {session.status}
                    </span>
                    {session.verificationStatus === 'pending' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-amber-500 text-white animate-pulse">
                        Needs Verification
                      </span>
                    )}
                    {session.verificationStatus === 'verified' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                        Verified
                      </span>
                    )}
                    {request && !session.verificationStatus && (
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

              <div className="flex items-center gap-6">
                <div className="text-right sm:text-left">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Hourly Time</span>
                  <span className="font-mono font-black text-sm text-zinc-900 dark:text-white">{formatDuration(workMs)}</span>
                </div>
                <div className="text-right sm:text-left">
                  <span className="text-[10px] uppercase font-bold text-indigo-500 block tracking-wider">Book Time</span>
                  <span className="font-mono font-black text-sm text-indigo-600 dark:text-indigo-400">{formatDuration(bookMs)}</span>
                </div>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); setEditingSession(session); }}
                  className="p-2 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all cursor-pointer md:opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit Time Entry"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
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

                        // Log activity to the live timeline
                        await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
                          type: 'time_session',
                          title: 'Correction Requested',
                          message: `Requested clock correction: "${editNote.slice(0, 60)}${editNote.length > 60 ? '...' : ''}"`,
                          timestamp: serverTimestamp(),
                          severity: 'warning',
                          author: user!.displayName || user!.email || 'Technician',
                          metadata: {
                            sessionId: requestingEdit,
                            note: editNote
                          }
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

      {/* Inline Session Editor Modal */}
      {editingSession && (
        <TimeSessionEditorModal 
          tenantId={tenantId}
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
