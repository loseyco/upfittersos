import { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { X, Save, Trash2, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

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
  status: string;
}

interface TimeSessionEditorModalProps {
  tenantId: string;
  session: TimeSession;
  onClose: () => void;
  onSaved: () => void;
  requestId?: string; // Optional request ID if editing from a correction request
}

export function TimeSessionEditorModal({ tenantId, session, onClose, onSaved, requestId }: TimeSessionEditorModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [isRemote, setIsRemote] = useState(session.isRemote || false);
  const [breaks, setBreaks] = useState(session.breaks || []);

  useEffect(() => {
    // Format timestamps for datetime-local input (YYYY-MM-DDTHH:mm)
    const formatForInput = (ts: any) => {
      if (!ts) return '';
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };

    setClockIn(formatForInput(session.clockIn.timestamp));
    setClockOut(formatForInput(session.clockOut?.timestamp));
  }, [session]);

  const handleReject = async () => {
    if (!requestId) return;
    setIsSubmitting(true);
    try {
      const requestRef = doc(db, `businesses/${tenantId}/time_edit_requests`, requestId);
      await updateDoc(requestRef, {
        status: 'rejected',
        resolvedAt: serverTimestamp(),
        resolvedBy: 'admin'
      });
      toast.success("Correction request rejected");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Failed to reject request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to PERMANENTLY delete this time entry? This cannot be undone.")) return;
    
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Delete the session
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, session.id);
      batch.delete(sessionRef);

      // 2. Delete any associated requests
      const requestsQ = query(
        collection(db, `businesses/${tenantId}/time_edit_requests`),
        where('sessionId', '==', session.id)
      );
      const requestsSnap = await getDocs(requestsQ);
      requestsSnap.docs.forEach(d => batch.delete(d.ref));

      await batch.commit();

      toast.success("Time entry deleted");
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete session");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, session.id);
      
      const updates: any = {
        'clockIn.timestamp': new Date(clockIn),
        isRemote,
        updatedAt: serverTimestamp()
      };

      if (clockOut) {
        updates['clockOut.timestamp'] = new Date(clockOut);
        updates.status = 'completed';
      } else {
        updates['clockOut.timestamp'] = null;
        updates.status = 'active';
      }

      // Sync updated breaks if needed (for now keeping as is, but could add break editor here)
      updates.breaks = breaks;

      await updateDoc(sessionRef, updates);

      // If there's an associated request, mark it as approved
      if (requestId) {
        const requestRef = doc(db, `businesses/${tenantId}/time_edit_requests`, requestId);
        await updateDoc(requestRef, {
          status: 'approved',
          resolvedAt: serverTimestamp(),
          resolvedBy: 'admin' // Could get actual admin name
        });
      }

      toast.success("Time session updated");
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Failed to update session");
    } finally {
      setIsSubmitting(false);
    }
  };

  const addBreak = () => {
    setBreaks([...breaks, { type: 'normal', start: new Date(), end: new Date(), isPaid: true }]);
  };

  const removeBreak = (index: number) => {
    setBreaks(breaks.filter((_, i) => i !== index));
  };

  const updateBreak = (index: number, field: string, value: any) => {
    const newBreaks = [...breaks];
    if (field === 'start' || field === 'end') {
      newBreaks[index] = { ...newBreaks[index], [field]: new Date(value) };
    } else {
      newBreaks[index] = { ...newBreaks[index], [field]: value };
    }
    setBreaks(newBreaks);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-500" />
              Edit Time Entry
            </h3>
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mt-0.5">{session.userName} • {session.id.slice(0,8)}</p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto no-scrollbar space-y-8">
          {requestId && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800 dark:text-amber-200 uppercase tracking-tight">Correction Request Associated</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 italic">Approving this edit will automatically resolve the pending request.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-1">Clock In Time</label>
              <input 
                type="datetime-local" 
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
                className="w-full p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-1">Clock Out Time</label>
              <input 
                type="datetime-local" 
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
                className="w-full p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white text-sm"
              />
              <p className="text-[10px] text-zinc-400 ml-1">Leave blank if shift is still active.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-1">Breaks</label>
              <button 
                onClick={addBreak}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
              >
                + Add Break
              </button>
            </div>
            
            <div className="space-y-3">
              {breaks.map((b, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-3 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">Start</label>
                    <input 
                      type="datetime-local"
                      value={new Date((b.start.toDate ? b.start.toDate() : new Date(b.start)).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16)}
                      onChange={(e) => updateBreak(i, 'start', e.target.value)}
                      className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm font-bold text-zinc-900 dark:text-white"
                    />
                  </div>
                  <div className="flex-1 space-y-1 border-l border-zinc-200 dark:border-zinc-800 pl-3">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">End</label>
                    <input 
                      type="datetime-local"
                      value={b.end ? new Date((b.end.toDate ? b.end.toDate() : new Date(b.end)).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16) : ''}
                      onChange={(e) => updateBreak(i, 'end', e.target.value)}
                      className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm font-bold text-zinc-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <select 
                      value={b.type}
                      onChange={(e) => updateBreak(i, 'type', e.target.value)}
                      className="bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg text-xs font-bold px-3 py-1.5"
                    >
                      <option value="lunch">Lunch</option>
                      <option value="normal">Break</option>
                    </select>
                    <button 
                      onClick={() => removeBreak(i)}
                      className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {breaks.length === 0 && (
                <p className="text-xs text-zinc-500 italic text-center py-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">No breaks recorded for this session.</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
            <input 
              type="checkbox" 
              id="remote"
              checked={isRemote}
              onChange={(e) => setIsRemote(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
            />
            <label htmlFor="remote" className="text-sm font-bold text-zinc-900 dark:text-white cursor-pointer select-none">
              Mark as Remote Shift
            </label>
          </div>
        </div>

        <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row gap-3">
          {requestId && (
            <button 
              disabled={isSubmitting}
              onClick={handleReject}
              className="px-6 py-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl font-bold border border-rose-500/20 hover:bg-rose-500/20 transition-all disabled:opacity-50"
            >
              Reject Request
            </button>
          )}
          <div className="flex-1 flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 rounded-xl font-bold border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
            >
              Cancel
            </button>
            <button 
              disabled={isSubmitting || !clockIn}
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : <><Save className="w-4 h-4" /> Save Changes</>}
            </button>
            <button 
              disabled={isSubmitting}
              onClick={handleDelete}
              className="px-6 py-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl font-bold border border-rose-500/20 hover:bg-rose-500/20 transition-all disabled:opacity-50"
              title="Delete Entry"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
