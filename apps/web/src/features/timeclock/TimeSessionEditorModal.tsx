import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { X, Save, Trash2, AlertCircle, Clock, Check } from 'lucide-react';
import { toast } from 'sonner';

interface TimeSession {
  id: string;
  userId: string;
  userName?: string;
  payType?: string;
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
    notes?: string;
  }>;
  status: string;
  verificationStatus?: string;
  manuallyEdited?: boolean;
  lastEditedBy?: string;
  lastEditedById?: string;
  notes?: string;
  staffNote?: string;
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
  const [notes, setNotes] = useState(session.notes || '');
  const [staffNote, setStaffNote] = useState(session.staffNote || '');

  const [requestDetails, setRequestDetails] = useState<any>(null);

  useEffect(() => {
    const fetchRequest = async () => {
      let activeId = requestId;
      if (!activeId) {
        try {
          const q = query(
            collection(db, `businesses/${tenantId}/time_edit_requests`),
            where('sessionId', '==', session.id),
            where('status', '==', 'pending')
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            activeId = snap.docs[0].id;
          }
        } catch (err) {
          console.warn("Error querying request:", err);
        }
      }

      if (activeId) {
        try {
          const reqSnap = await getDoc(doc(db, `businesses/${tenantId}/time_edit_requests`, activeId));
          if (reqSnap.exists()) {
            setRequestDetails({ id: reqSnap.id, ...reqSnap.data() });
          }
        } catch (err) {
          console.warn("Error loading request doc:", err);
        }
      }
    };

    fetchRequest();
  }, [tenantId, session.id, requestId]);

  const formatDatetimeDisplay = (ts: any) => {
    if (!ts) return 'Active Shift';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      if (isNaN(d.getTime())) return 'Active Shift';
      return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
      return 'Active Shift';
    }
  };

  const getDurationString = (start: any, end: any) => {
    if (!start) return '';
    try {
      const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
      const e = end ? (end.toDate ? end.toDate().getTime() : new Date(end).getTime()) : null;
      if (isNaN(s)) return '';
      if (!e || isNaN(e)) return 'Active';
      const ms = Math.max(0, e - s);
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    } catch {
      return '';
    }
  };

  const getDurationDiffBadge = (
    origStart: any, 
    origEnd: any, 
    propStart: any, 
    propEnd: any,
    origBreaks?: any[],
    propBreaks?: any[]
  ) => {
    if (!origStart || !propStart) return null;
    try {
      const oS = origStart.toDate ? origStart.toDate().getTime() : new Date(origStart).getTime();
      const oE = origEnd ? (origEnd.toDate ? origEnd.toDate().getTime() : new Date(origEnd).getTime()) : null;
      const pS = propStart.toDate ? propStart.toDate().getTime() : new Date(propStart).getTime();
      const pE = propEnd ? (propEnd.toDate ? propEnd.toDate().getTime() : new Date(propEnd).getTime()) : null;
      if (isNaN(oS) || isNaN(pS)) return null;
      
      if (!oE || !pE) return null;
      
      const origMs = Math.max(0, oE - oS);
      const origBreakMs = (origBreaks || []).reduce((acc: number, b: any) => {
        const start = b.start?.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
        const end = b.end ? (b.end.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime()) : Date.now();
        return acc + Math.max(0, end - start);
      }, 0);
      const origNetMs = Math.max(0, origMs - origBreakMs);

      const propMs = Math.max(0, pE - pS);
      const propBreakMs = (propBreaks || []).reduce((acc: number, b: any) => {
        const start = b.start?.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
        const end = b.end ? (b.end.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime()) : Date.now();
        return acc + Math.max(0, end - start);
      }, 0);
      const propNetMs = Math.max(0, propMs - propBreakMs);

      const diffMs = propNetMs - origNetMs;
      
      if (Math.abs(diffMs) < 60000) return null;
      
      const hours = Math.floor(Math.abs(diffMs) / 3600000);
      const minutes = Math.floor((Math.abs(diffMs) % 3600000) / 60000);
      const diffStr = `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;
      
      if (diffMs > 0) {
        return (
          <span className="bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
            +{diffStr} (Increase)
          </span>
        );
      } else {
        return (
          <span className="bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
            -{diffStr} (Decrease)
          </span>
        );
      }
    } catch {
      return null;
    }
  };

  const formatTimeDisplay = (ts: any) => {
    if (!ts) return '';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatBreakDisplay = (b: any) => {
    if (!b || !b.start) return 'Invalid break';
    const typeLabel = b.type === 'lunch' ? 'Lunch' : 'Break';
    const startStr = formatTimeDisplay(b.start);
    const endStr = b.end ? formatTimeDisplay(b.end) : 'Active';
    const durationStr = getDurationString(b.start, b.end);
    return `${typeLabel}: ${startStr} - ${endStr} (${durationStr})`;
  };

  const formatJobDisplay = (j: any) => {
    if (!j) return 'Invalid job';
    const nameStr = j.name || 'Unnamed Job';
    const taskNameStr = j.taskName ? ` (${j.taskName})` : '';
    const bookTimeStr = j.bookTime ? ` [Book: ${j.bookTime}h]` : '';
    const startStr = formatTimeDisplay(j.start);
    const endStr = j.end ? formatTimeDisplay(j.end) : 'Active';
    const durationStr = getDurationString(j.start, j.end);
    return `${nameStr}${taskNameStr}: ${startStr} - ${endStr} (${durationStr})${bookTimeStr}`;
  };

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
    setNotes(session.notes || '');
    setStaffNote(session.staffNote || '');
  }, [session]);

  const handleReject = async () => {
    if (!isAdmin) {
      toast.error("You do not have permission to resolve correction requests.");
      return;
    }
    const activeId = requestId || requestDetails?.id;
    if (!activeId || !requestDetails) return;
    setIsSubmitting(true);
    try {
      const requestRef = doc(db, `businesses/${tenantId}/time_edit_requests`, activeId);
      
      // Revert the session to original values
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, session.id);
      const updates: any = {
        verificationStatus: 'verified',
        updatedAt: serverTimestamp(),
      };

      if (requestDetails.originalClockIn) {
        updates['clockIn.timestamp'] = requestDetails.originalClockIn;
      }
      if (requestDetails.originalClockOut !== undefined) {
        updates['clockOut.timestamp'] = requestDetails.originalClockOut;
        updates.status = requestDetails.originalClockOut ? 'completed' : 'active';
      }
      if (requestDetails.originalBreaks !== undefined) {
        updates.breaks = requestDetails.originalBreaks;
      }
      if (requestDetails.originalJobs !== undefined) {
        updates.jobs = requestDetails.originalJobs;
        updates.jobIds = Array.from(new Set(requestDetails.originalJobs.map((j: any) => j.id)));
      }

      await updateDoc(sessionRef, updates);

      await updateDoc(requestRef, {
        status: 'rejected',
        resolvedAt: serverTimestamp(),
        resolvedBy: user!.displayName || user!.email || 'admin'
      });

      // Log activity to the live timeline
      await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
        type: 'time_session',
        title: 'Correction Rejected',
        message: `Rejected time correction request for ${session.userName || 'Technician'}`,
        timestamp: serverTimestamp(),
        severity: 'error',
        author: user!.displayName || user!.email || 'Admin',
        metadata: {
          requestId: activeId,
          sessionId: session.id,
          technicianName: session.userName || ''
        }
      });

      toast.success("Correction request rejected and session reverted");
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Failed to reject request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin) {
      toast.error("You do not have permission to delete time entries.");
      return;
    }
    if (!window.confirm("Are you sure you want to PERMANENTLY delete this time entry? This cannot be undone.")) return;
    
    setIsSubmitting(true);
    try {
      const clockInDate = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
      const clockInDateStr = clockInDate.toISOString().split('T')[0];
      
      const verificationsSnap = await getDocs(
        query(
          collection(db, `businesses/${tenantId}/timeclock_verifications`),
          where('userId', '==', session.userId)
        )
      );
      
      const isVerified = verificationsSnap.docs.some(doc => {
        const v = doc.data();
        return clockInDateStr >= v.startDate && clockInDateStr <= v.endDate;
      });
      
      if (isVerified) {
        toast.error("This entry is locked because it belongs to a verified pay period. Unlock the timesheet first to delete it.");
        setIsSubmitting(false);
        return;
      }

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
      const clockInDate = session.clockIn.timestamp?.toDate ? session.clockIn.timestamp.toDate() : new Date(session.clockIn.timestamp);
      const clockInDateStr = clockInDate.toISOString().split('T')[0];
      
      const verificationsSnap = await getDocs(
        query(
          collection(db, `businesses/${tenantId}/timeclock_verifications`),
          where('userId', '==', session.userId)
        )
      );
      
      const isVerified = verificationsSnap.docs.some(doc => {
        const v = doc.data();
        return clockInDateStr >= v.startDate && clockInDateStr <= v.endDate;
      });
      
      if (isVerified) {
        toast.error("This entry is locked because it belongs to a verified pay period. Unlock the timesheet first to make edits.");
        setIsSubmitting(false);
        return;
      }

      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, session.id);
      
      // Determine if there are actual changes to the shift timeline (times, breaks, jobs, or remote status)
      // notes changes are excluded from this check
      const originalClockInTime = session.clockIn.timestamp?.toDate 
        ? session.clockIn.timestamp.toDate().getTime() 
        : new Date(session.clockIn.timestamp).getTime();
      const newClockInTime = new Date(clockIn).getTime();

      const originalClockOutTime = session.clockOut?.timestamp
        ? (session.clockOut.timestamp.toDate ? session.clockOut.timestamp.toDate().getTime() : new Date(session.clockOut.timestamp).getTime())
        : null;
      const newClockOutTime = clockOut ? new Date(clockOut).getTime() : null;

      const normalizeBreak = (b: any) => ({
        type: b.type,
        isPaid: b.isPaid,
        start: b.start?.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime(),
        end: b.end ? (b.end.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime()) : null
      });

      const normalizeJob = (j: any) => ({
        id: j.id,
        name: j.name,
        start: j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime(),
        end: j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : null,
        taskId: j.taskId || null,
        taskName: j.taskName || null,
        bookTime: j.bookTime || 0
      });

      const normalizedOrigBreaks = (session.breaks || []).map(normalizeBreak);
      const normalizedNewBreaks = breaks.map(normalizeBreak);
      const normalizedOrigJobs = (session.jobs || []).map(normalizeJob);
      const normalizedNewJobs = jobs.map(normalizeJob);

      const hasTimelineChanges = 
        originalClockInTime !== newClockInTime ||
        originalClockOutTime !== newClockOutTime ||
        JSON.stringify(normalizedOrigBreaks) !== JSON.stringify(normalizedNewBreaks) ||
        JSON.stringify(normalizedOrigJobs) !== JSON.stringify(normalizedNewJobs) ||
        (session.isRemote || false) !== isRemote;

      const updates: any = {
        'clockIn.timestamp': new Date(clockIn),
        isRemote,
        notes: notes.trim(),
        staffNote: staffNote.trim(),
        updatedAt: serverTimestamp(),
      };

      if (hasTimelineChanges || session.manuallyEdited) {
        updates.manuallyEdited = true;
        updates.lastEditedBy = user!.displayName || user!.email || 'Admin';
        updates.lastEditedById = user!.uid;
      }

      if (!session.payType) {
        try {
          const staffSnap = await getDoc(doc(db, `businesses/${tenantId}/staff`, session.userId));
          if (staffSnap.exists()) {
            const sd = staffSnap.data();
            if (sd.payType && sd.payType !== 'inherit') {
              updates.payType = sd.payType;
            } else if (sd.departmentId) {
              const deptRef = doc(db, `businesses/${tenantId}/departments`, sd.departmentId);
              const deptSnap = await getDoc(deptRef);
              if (deptSnap.exists()) {
                updates.payType = deptSnap.data().defaultPayType || 'hourly';
              }
            }
          }
        } catch (err) {
          console.warn("Failed to resolve payType for legacy session edit:", err);
        }
      }

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
          note: staffNote.trim() || 'Staff updated session details directly (needs verification)',
          status: 'pending',
          originalClockIn: session.clockIn.timestamp,
          originalClockOut: session.clockOut?.timestamp || null,
          proposedClockIn: new Date(clockIn),
          proposedClockOut: clockOut ? new Date(clockOut) : null,
          originalBreaks: session.breaks || [],
          proposedBreaks: breaks,
          originalJobs: session.jobs || [],
          proposedJobs: jobs,
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
      } else {
        const activeId = requestId || requestDetails?.id;
        if (activeId) {
          const requestRef = doc(db, `businesses/${tenantId}/time_edit_requests`, activeId);
          await updateDoc(requestRef, {
            status: 'approved',
            resolvedAt: serverTimestamp(),
            resolvedBy: user!.displayName || user!.email || 'admin'
          });

          // Log activity for approved request
          await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
            type: 'time_session',
            title: 'Correction Approved',
            message: `Approved time correction request for ${session.userName || 'Technician'} by ${user!.displayName || user!.email || 'Admin'}`,
            timestamp: serverTimestamp(),
            severity: 'success',
            author: user!.displayName || user!.email || 'Admin',
            metadata: {
              requestId: activeId,
              sessionId: session.id,
              technicianName: session.userName || ''
            }
          });
        } else {
          // Log standard admin edit (no request associated)
          const activityMessage = hasTimelineChanges
            ? `Manually updated and verified time entry for ${session.userName || 'Technician'} by ${user!.displayName || user!.email || 'Admin'}`
            : `Added/updated note on time entry for ${session.userName || 'Technician'} by ${user!.displayName || user!.email || 'Admin'}`;
          
          await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
            type: 'time_session',
            title: hasTimelineChanges ? 'Timecard Updated' : 'Timecard Note Added',
            message: activityMessage,
            timestamp: serverTimestamp(),
            severity: 'info',
            author: user!.displayName || user!.email || 'Admin',
            metadata: {
              sessionId: session.id,
              technicianName: session.userName || ''
            }
          });
        }
      }

      toast.success(isAdmin ? (hasTimelineChanges ? "Time session updated and verified" : "Note saved successfully") : "Time session updated (needs verification)");
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
          {(requestId || requestDetails) && (
            <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-3xl p-5 space-y-4 animate-in fade-in duration-300 shadow-inner">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-amber-500/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-black text-amber-800 dark:text-amber-200 uppercase tracking-wider">
                      Pending Correction Request
                    </p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-tight mt-0.5">
                      Reviewing technician's suggested changes
                    </p>
                  </div>
                </div>
                {requestDetails && getDurationDiffBadge(
                  requestDetails.originalClockIn,
                  requestDetails.originalClockOut,
                  requestDetails.proposedClockIn,
                  requestDetails.proposedClockOut,
                  requestDetails.originalBreaks,
                  requestDetails.proposedBreaks || (requestDetails.originalBreaks === undefined ? session.breaks : undefined)
                )}
              </div>

              {requestDetails && (() => {
                const originalBreaks = requestDetails.originalBreaks;
                const proposedBreaks = requestDetails.proposedBreaks || (originalBreaks === undefined ? session.breaks : undefined);
                const originalJobs = requestDetails.originalJobs;
                const proposedJobs = requestDetails.proposedJobs || (originalJobs === undefined ? session.jobs : undefined);

                return (
                  <div className="space-y-4">
                    {requestDetails.note && (
                      <div className="bg-white/80 dark:bg-zinc-900/40 p-3.5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/80">
                        <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-555 uppercase block tracking-widest">Technician Note / Explanation</span>
                        <p className="text-xs font-semibold text-zinc-850 dark:text-zinc-200 italic mt-1.5 leading-relaxed">
                          "{requestDetails.note}"
                        </p>
                      </div>
                    )}

                    {/* High Contrast Side-by-Side Comparison */}
                    {(requestDetails.originalClockIn || requestDetails.originalClockOut) && (
                      <div className="space-y-2">
                        <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-555 uppercase tracking-widest block ml-1">
                          Timecard Shift Comparison
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Original (Was) */}
                          <div className="bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 dark:border-rose-500/10 rounded-2xl p-4 space-y-3 relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-rose-500/10 px-3 py-1 rounded-bl-xl text-[9px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                              Original (Was)
                            </div>
                            
                            <div className="space-y-2.5 pt-1">
                              <div>
                                <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Clock In</span>
                                <span className="font-mono font-bold text-xs text-rose-600 dark:text-rose-400 line-through">
                                  {formatDatetimeDisplay(requestDetails.originalClockIn)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Clock Out</span>
                                <span className="font-mono font-bold text-xs text-rose-600 dark:text-rose-400 line-through">
                                  {formatDatetimeDisplay(requestDetails.originalClockOut)}
                                </span>
                              </div>

                              {originalBreaks !== undefined ? (
                                originalBreaks.length > 0 ? (
                                  <div className="border-t border-rose-500/10 pt-2.5 space-y-1">
                                    <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Breaks</span>
                                    {originalBreaks.map((b: any, idx: number) => (
                                      <span key={idx} className="font-mono text-[10px] text-rose-600 dark:text-rose-400 line-through block leading-tight">
                                        • {formatBreakDisplay(b)}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="border-t border-rose-500/10 pt-2.5">
                                    <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Breaks</span>
                                    <span className="font-mono text-[10px] text-zinc-500 line-through block leading-tight">None</span>
                                  </div>
                                )
                              ) : (
                                <div className="border-t border-rose-500/10 pt-2.5">
                                  <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Breaks</span>
                                  <span className="font-mono text-[10px] text-zinc-500 italic block leading-tight">Not captured (legacy)</span>
                                </div>
                              )}

                              {originalJobs !== undefined ? (
                                originalJobs.length > 0 ? (
                                  <div className="border-t border-rose-500/10 pt-2.5 space-y-1">
                                    <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Jobs Worked</span>
                                    {originalJobs.map((j: any, idx: number) => (
                                      <span key={idx} className="font-mono text-[10px] text-rose-600 dark:text-rose-400 line-through block leading-tight">
                                        • {formatJobDisplay(j)}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="border-t border-rose-500/10 pt-2.5">
                                    <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Jobs Worked</span>
                                    <span className="font-mono text-[10px] text-zinc-500 line-through block leading-tight">None</span>
                                  </div>
                                )
                              ) : (
                                <div className="border-t border-rose-500/10 pt-2.5">
                                  <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Jobs Worked</span>
                                  <span className="font-mono text-[10px] text-zinc-500 italic block leading-tight">Not captured (legacy)</span>
                                </div>
                              )}

                              <div className="border-t border-rose-500/10 pt-2 flex justify-between items-center">
                                <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase">Duration:</span>
                                <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400 line-through text-right">
                                  {getDurationString(requestDetails.originalClockIn, requestDetails.originalClockOut)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Proposed (Wants) */}
                          <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 dark:border-emerald-500/10 rounded-2xl p-4 space-y-3 relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-emerald-500/10 px-3 py-1 rounded-bl-xl text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider animate-pulse">
                              Proposed (Wants)
                            </div>
                            
                            <div className="space-y-2.5 pt-1">
                              <div>
                                <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Clock In</span>
                                <span className="font-mono font-black text-xs text-emerald-600 dark:text-emerald-400">
                                  {formatDatetimeDisplay(requestDetails.proposedClockIn)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Clock Out</span>
                                <span className="font-mono font-black text-xs text-emerald-600 dark:text-emerald-400">
                                  {formatDatetimeDisplay(requestDetails.proposedClockOut)}
                                </span>
                              </div>

                              {proposedBreaks !== undefined ? (
                                proposedBreaks.length > 0 ? (
                                  <div className="border-t border-emerald-500/10 pt-2.5 space-y-1">
                                    <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Breaks</span>
                                    {proposedBreaks.map((b: any, idx: number) => (
                                      <span key={idx} className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block leading-tight">
                                        • {formatBreakDisplay(b)}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="border-t border-emerald-500/10 pt-2.5">
                                    <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Breaks</span>
                                    <span className="font-mono text-[10px] text-zinc-500 block leading-tight">None</span>
                                  </div>
                                )
                              ) : null}

                              {proposedJobs !== undefined ? (
                                proposedJobs.length > 0 ? (
                                  <div className="border-t border-emerald-500/10 pt-2.5 space-y-1">
                                    <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Jobs Worked</span>
                                    {proposedJobs.map((j: any, idx: number) => (
                                      <span key={idx} className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block leading-tight">
                                        • {formatJobDisplay(j)}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="border-t border-emerald-500/10 pt-2.5">
                                    <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase block">Jobs Worked</span>
                                    <span className="font-mono text-[10px] text-zinc-500 block leading-tight">None</span>
                                  </div>
                                )
                              ) : null}

                              <div className="border-t border-emerald-500/10 pt-2 flex justify-between items-center">
                                <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-505 uppercase">Duration:</span>
                                <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400 text-right">
                                  {getDurationString(requestDetails.proposedClockIn, requestDetails.proposedClockOut)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
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

                  <div className="w-full space-y-1 mt-1">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">Segment Notes / Comments</label>
                    <input
                      type="text"
                      value={j.notes || ''}
                      onChange={(e) => updateJob(i, 'notes', e.target.value)}
                      placeholder="e.g. I believe he was actually on this job..."
                      className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg text-xs font-bold px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/50 outline-none text-zinc-900 dark:text-white"
                    />
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

          {/* Read-only Admin Note for Technicians */}
          {!isAdmin && session.notes && (
            <div className="bg-amber-550/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-3xl p-5 space-y-2 animate-in fade-in duration-300">
              <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest block">Admin Feedback / Correction Note</span>
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 italic">
                "{session.notes}"
              </p>
            </div>
          )}

          {/* Editable Technician Notes */}
          <div className="space-y-2">
            <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-1">
              {isAdmin ? "Technician Notes / Explanation" : "My Notes / Explanation"}
            </label>
            <textarea 
              value={staffNote}
              onChange={(e) => setStaffNote(e.target.value)}
              disabled={!isAdmin && session.verificationStatus === 'verified'}
              placeholder="Provide comments or explanation about this shift (e.g. forgot to clock out, prep work timing)..."
              className="w-full p-4 bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white text-sm min-h-[100px] resize-none disabled:opacity-75"
            />
          </div>

          {/* Admin Notes (Discrepancy Log) */}
          {isAdmin && (
            <div className="space-y-2">
              <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-1">Admin Notes / Discrepancy Log</label>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Leave a note about this shift (e.g. sync discrepancy explanations, reason for adjustments, etc.)..."
                className="w-full p-4 bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white text-sm min-h-[100px] resize-none"
              />
            </div>
          )}
        </div>

        <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row gap-3">
          {(requestId || requestDetails?.id) && isAdmin && (
            <button 
              disabled={isSubmitting}
              onClick={handleReject}
              className="px-6 py-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl font-bold border border-rose-500/20 hover:bg-rose-500/20 transition-all disabled:opacity-50 shrink-0"
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
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 ${
                (requestId || requestDetails?.id) && isAdmin
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
              }`}
            >
              {isSubmitting ? (
                'Processing...'
              ) : (requestId || requestDetails?.id) && isAdmin ? (
                <>
                  <Check className="w-4 h-4" /> Approve & Save Request
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save Changes
                </>
              )}
            </button>
            {isAdmin && (
              <button 
                disabled={isSubmitting}
                onClick={handleDelete}
                className="px-6 py-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl font-bold border border-rose-500/20 hover:bg-rose-500/20 transition-all disabled:opacity-50 shrink-0"
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
