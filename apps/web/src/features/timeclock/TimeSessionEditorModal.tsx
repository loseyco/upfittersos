import { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
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
}

interface TimeSessionEditorModalProps {
  tenantId: string;
  session: TimeSession;
  onClose: () => void;
  onSaved: () => void;
  requestId?: string; // Optional request ID if editing from a correction request
}

export function TimeSessionEditorModal({ tenantId, session, onClose, onSaved, requestId }: TimeSessionEditorModalProps) {
  const { user, permissions = {}, isSuperAdmin } = useAuthStore();
  const isAdmin = isSuperAdmin || !!permissions['timeclock.manage'];
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [isRemote, setIsRemote] = useState(session.isRemote || false);
  const [breaks, setBreaks] = useState(session.breaks || []);
  const [jobs, setJobs] = useState(session.jobs || []);

  const formatDatetimeLocal = (dateVal: any) => {
    if (!dateVal) return '';
    try {
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

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

      updates.breaks = breaks;
      updates.jobs = jobs;
      updates.jobIds = Array.from(new Set(jobs.map((j: any) => j.id)));

      // Admin edits are verified live; technician edits are live but marked pending verification
      if (isAdmin) {
        updates.verificationStatus = 'verified';
      } else {
        updates.verificationStatus = 'pending';
      }

      await updateDoc(sessionRef, updates);

      // Create a pending request automatically if saved by regular staff member
      if (!isAdmin) {
        const q = query(
          collection(db, `businesses/${tenantId}/time_edit_requests`),
          where('sessionId', '==', session.id),
          where('status', '==', 'pending')
        );
        const snap = await getDocs(q);
        
        const requestData = {
          sessionId: session.id,
          userId: user!.uid,
          userName: user!.displayName || user!.email,
          note: 'Staff updated session details directly (needs verification)',
          status: 'pending',
          updatedAt: serverTimestamp()
        };

        if (snap.empty) {
          await addDoc(collection(db, `businesses/${tenantId}/time_edit_requests`), {
            ...requestData,
            createdAt: serverTimestamp()
          });
        } else {
          await updateDoc(snap.docs[0].ref, requestData);
        }
      } else if (requestId) {
        const requestRef = doc(db, `businesses/${tenantId}/time_edit_requests`, requestId);
        await updateDoc(requestRef, {
          status: 'approved',
          resolvedAt: serverTimestamp(),
          resolvedBy: user!.displayName || user!.email || 'admin'
        });
      }

      toast.success(isAdmin ? "Time session updated and verified" : "Time session updated (needs verification)");
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
      newBreaks[index] = { ...newBreaks[index], [field]: value ? new Date(value) : null };
    } else {
      newBreaks[index] = { ...newBreaks[index], [field]: value };
    }
    setBreaks(newBreaks);
  };

  const addJob = () => {
    setJobs([...jobs, { id: 'manual', name: 'Manual Entry', start: new Date(), end: new Date() }]);
  };

  const removeJob = (index: number) => {
    setJobs(jobs.filter((_, i) => i !== index));
  };

  const updateJob = (index: number, field: string, value: any) => {
    const newJobs = [...jobs];
    if (field === 'start' || field === 'end') {
      newJobs[index] = { ...newJobs[index], [field]: value ? new Date(value) : null };
    } else {
      newJobs[index] = { ...newJobs[index], [field]: value };
    }
    setJobs(newJobs);
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
              <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-1">Jobs Worked</label>
              <button 
                onClick={addJob}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
              >
                + Add Job
              </button>
            </div>
            
            <div className="space-y-3">
              {jobs.map((j: any, i) => (
                <div key={`job-${i}`} className="flex flex-col gap-3 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl relative">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">Start Time</label>
                      <input 
                        type="datetime-local"
                        value={formatDatetimeLocal(j.start)}
                        onChange={(e) => updateJob(i, 'start', e.target.value)}
                        className="w-full bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-bold text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">End Time</label>
                      <input 
                        type="datetime-local"
                        value={formatDatetimeLocal(j.end)}
                        onChange={(e) => updateJob(i, 'end', e.target.value)}
                        className="w-full bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-bold text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-3 mt-1 pt-3 border-t border-zinc-100 dark:border-zinc-900">
                    <div className="flex-1 w-full space-y-1">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">Job / Task Name</label>
                      <input
                        type="text"
                        value={j.name}
                        onChange={(e) => updateJob(i, 'name', e.target.value)}
                        placeholder="Job Name"
                        className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg text-xs font-bold px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/50 outline-none text-zinc-900 dark:text-white"
                      />
                      {j.taskName && (
                        <p className="text-[10px] text-zinc-400 font-medium ml-1">Task: <span className="font-bold text-indigo-500">{j.taskName}</span></p>
                      )}
                    </div>
                    
                    <div className="w-full sm:w-24 space-y-1">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">Book Time (h)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={j.bookTime ?? 0}
                        onChange={(e) => updateJob(i, 'bookTime', parseFloat(e.target.value) || 0)}
                        placeholder="0.0"
                        className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg text-xs font-bold px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/50 outline-none text-zinc-900 dark:text-white"
                      />
                    </div>

                    <button 
                      onClick={() => removeJob(i)}
                      className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors mt-4 self-end shrink-0"
                      title="Remove job segment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {jobs.length === 0 && (
                <p className="text-xs text-zinc-500 italic text-center py-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">No jobs recorded for this session.</p>
              )}
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
                <div key={`break-${i}`} className="flex flex-col sm:flex-row gap-3 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">Start</label>
                    <input 
                      type="datetime-local"
                      value={formatDatetimeLocal(b.start)}
                      onChange={(e) => updateBreak(i, 'start', e.target.value)}
                      className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm font-bold text-zinc-900 dark:text-white"
                    />
                  </div>
                  <div className="flex-1 space-y-1 border-l border-zinc-200 dark:border-zinc-800 pl-3">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">End</label>
                    <input 
                      type="datetime-local"
                      value={formatDatetimeLocal(b.end)}
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
            {isAdmin && (
              <button 
                disabled={isSubmitting}
                onClick={handleDelete}
                className="px-6 py-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl font-bold border border-rose-500/20 hover:bg-rose-500/20 transition-all disabled:opacity-50"
                title="Delete Entry"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
