import { useState, useEffect, useRef } from 'react';
import { X, AlertTriangle, AlertCircle, ArrowRight, Camera, Loader2, FileText } from 'lucide-react';
import { doc, getDoc, updateDoc, serverTimestamp, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { toast } from 'sonner';

interface TimeAllocationModalProps {
  tenantId: string;
  jobId: string;
  jobTitle: string;
  taskId: string;
  taskTitle: string;
  bookTime?: number;
  timeLogs: any[];
  effectiveUserId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const isGeneralTask = (title?: string) => {
  const t = (title || '').toLowerCase().trim();
  return t === 'general' || t === 'general labor';
};

export function TimeAllocationModal({
  tenantId,
  jobId,
  jobTitle,
  taskId,
  taskTitle,
  bookTime = 0,
  timeLogs,
  effectiveUserId,
  onClose,
  onSuccess
}: TimeAllocationModalProps) {
  const { user } = useAuthStore();
  const [mode, setMode] = useState<'allocate' | 'manual' | 'bypass'>('allocate');
  
  // Note & Photo States
  const [noteText, setNoteText] = useState('');
  const [attachedImages, setAttachedImages] = useState<Array<{ file: File; preview: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  // Time Allocation states
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [manualHours, setManualHours] = useState('0.5');

  // Compute total logged ms for this task from timeLogs
  const loggedMs = (() => {
    return timeLogs.reduce((acc, session) => {
      const taskSegments = (session.jobs || []).filter((j: any) => j.id === jobId && j.taskId === taskId);
      const segMs = taskSegments.reduce((segAcc: number, seg: any) => {
        const start = seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime();
        let endMs = Date.now();
        if (seg.end) {
          endMs = seg.end.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime();
        } else if (session.status === 'completed' || session.clockOut?.timestamp) {
          const clockOutVal = session.clockOut?.timestamp;
          if (clockOutVal) {
            endMs = clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime();
          } else {
            const updatedVal = session.updatedAt || session.createdAt;
            endMs = updatedVal?.toDate ? updatedVal.toDate().getTime() : new Date(updatedVal || start).getTime();
          }
        }
        return segAcc + Math.max(0, endMs - start);
      }, 0);
      return acc + segMs;
    }, 0);
  })();

  const loggedHours = loggedMs / 3600000;
  const needsTimeAllocation = loggedMs === 0 && !isGeneralTask(taskTitle);

  // Find General segments for this user
  const userGeneralSegments = (() => {
    const segments: any[] = [];
    timeLogs.forEach(session => {
      if (session.userId !== effectiveUserId) return;
      (session.jobs || []).forEach((j: any) => {
        if (j.id === jobId && isGeneralTask(j.taskName)) {
          segments.push({
            sessionId: session.id,
            sessionStatus: session.status,
            start: j.start?.toDate ? j.start.toDate() : new Date(j.start),
            end: j.end ? (j.end.toDate ? j.end.toDate() : new Date(j.end)) : null,
            rawSegment: j
          });
        }
      });
    });
    return segments.sort((a, b) => b.start.getTime() - a.start.getTime());
  })();

  const activeGeneralSegment = userGeneralSegments.find(s => !s.end);
  const mostRecentGeneralSegment = userGeneralSegments[0];
  const targetSegment = activeGeneralSegment || mostRecentGeneralSegment;

  const formatDatetimeLocal = (date: Date) => {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const hasInitialized = useRef(false);

  // Pre-populate default times
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    if (needsTimeAllocation) {
      if (targetSegment) {
        const end = targetSegment.end || new Date();
        const start = new Date(end.getTime() - Math.max(15, (bookTime || 0.5) * 60) * 60000);
        
        const clampedStart = start.getTime() < targetSegment.start.getTime() 
          ? targetSegment.start 
          : start;

        setEndTime(formatDatetimeLocal(end));
        setStartTime(formatDatetimeLocal(clampedStart));
        setMode('allocate');
      } else {
        setMode('manual');
      }
    } else {
      setMode('bypass'); // Default to bypass mode if time is already logged
    }
  }, [targetSegment, bookTime, needsTimeAllocation]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const newImages = files.map(file => ({
        file,
        preview: URL.createObjectURL(file)
      }));
      setAttachedImages(prev => [...prev, ...newImages]);
    }
  };

  const handleRemoveImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, idx) => idx !== index));
  };

  const executeTimeAllocation = async (sessionRef: any, jobs: any[]) => {
    const selectStartMs = new Date(startTime).getTime();
    const selectEndMs = new Date(endTime).getTime();

    if (selectStartMs >= selectEndMs) {
      throw new Error('Start time must be before end time');
    }

    const segStartMs = targetSegment.start.getTime();
    const segEndMs = targetSegment.end ? targetSegment.end.getTime() : Date.now();

    if (selectStartMs < segStartMs || selectEndMs > segEndMs) {
      throw new Error('Selected time range must fall inside your General Labor session.');
    }

    const index = jobs.findIndex((j: any) => {
      const jStart = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
      const jEnd = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : null;
      
      return j.id === jobId && 
             isGeneralTask(j.taskName) && 
             jStart === segStartMs && 
             jEnd === (targetSegment.end ? segEndMs : null);
    });

    if (index === -1) {
      throw new Error('Failed to locate General segment for splitting');
    }

    const genSegment = jobs[index];
    const newSegments: any[] = [];

    if (selectStartMs > segStartMs) {
      newSegments.push({
        ...genSegment,
        end: new Date(selectStartMs)
      });
    }

    newSegments.push({
      id: jobId,
      name: jobTitle,
      taskId: taskId,
      taskName: taskTitle,
      bookTime,
      payBasis: genSegment.payBasis || 'book_time',
      start: new Date(selectStartMs),
      end: new Date(selectEndMs)
    });

    if (targetSegment.end) {
      if (segEndMs > selectEndMs) {
        newSegments.push({
          ...genSegment,
          start: new Date(selectEndMs)
        });
      }
    } else {
      newSegments.push({
        ...genSegment,
        start: new Date(selectEndMs),
        end: null
      });
    }

    jobs.splice(index, 1, ...newSegments);

    await updateDoc(sessionRef, {
      jobs,
      jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
      updatedAt: serverTimestamp()
    });
  };

  const executeManualTimeLogging = async () => {
    const hours = parseFloat(manualHours);
    if (isNaN(hours) || hours <= 0) {
      throw new Error('Please enter a valid amount of hours');
    }

    // Query active session directly from Firestore to ensure we check globally,
    // not just within the sessions that already contain this job ID.
    let activeSession = null;
    try {
      const qActive = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('userId', '==', effectiveUserId),
        where('status', 'in', ['active', 'on_break'])
      );
      const snapActive = await getDocs(qActive);
      if (!snapActive.empty) {
        activeSession = { id: snapActive.docs[0].id, ...snapActive.docs[0].data() as any };
      }
    } catch (err) {
      console.warn('Error querying active session in TimeAllocationModal:', err);
    }

    if (activeSession) {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSession.id);
      const jobs = [...(activeSession.jobs || [])];
      const end = new Date();
      const start = new Date(end.getTime() - hours * 3600000);

      jobs.push({
        id: jobId,
        name: jobTitle,
        taskId,
        taskName: taskTitle,
        bookTime,
        payBasis: 'book_time',
        start,
        end
      });

      await updateDoc(sessionRef, {
        jobs,
        jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
        updatedAt: serverTimestamp()
      });
    } else {
      const end = new Date();
      const start = new Date(end.getTime() - hours * 3600000);

      await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
        userId: effectiveUserId,
        status: 'completed',
        clockIn: { timestamp: start, location: 'Manual Entry' },
        clockOut: { timestamp: end, location: 'Manual Entry' },
        jobs: [{
          id: jobId,
          name: jobTitle,
          taskId,
          taskName: taskTitle,
          bookTime,
          payBasis: 'book_time',
          start,
          end
        }],
        jobIds: [jobId],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  };

  const handleCompleteTask = async () => {
    setIsSubmitting(true);
    setUploadStatus('Uploading photos...');
    try {
      // 1. Upload images to Firebase Storage
      const uploadedUrls: string[] = [];
      for (let i = 0; i < attachedImages.length; i++) {
        const img = attachedImages[i];
        setUploadStatus(`Uploading photo ${i + 1} of ${attachedImages.length}...`);
        const storageRef = ref(storage, `businesses/${tenantId}/tasks/${taskId}/${Date.now()}_${img.file.name}`);
        const snapshot = await uploadBytes(storageRef, img.file);
        const url = await getDownloadURL(snapshot.ref);
        uploadedUrls.push(url);
      }

      setUploadStatus('Saving notes...');
      // 2. Fetch task doc to append notes
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId);
      const taskSnap = await getDoc(taskRef);
      if (taskSnap.exists()) {
        const taskData = taskSnap.data();
        const existingNotes = taskData?.task_notes || [];

        if (noteText.trim() || uploadedUrls.length > 0) {
          const newNoteObj = {
            id: crypto.randomUUID(),
            message: noteText.trim(),
            images: uploadedUrls,
            createdAt: new Date().toISOString(),
            createdByUid: user?.uid || '',
            createdByName: user?.displayName || user?.email || 'Staff'
          };
          const updatedNotes = [...existingNotes, newNoteObj];
          await updateDoc(taskRef, {
            task_notes: updatedNotes,
            updatedAt: new Date().toISOString()
          });
        }
      }

      // 3. Log time if needed
      if (needsTimeAllocation) {
        setUploadStatus('Logging time...');
        if (mode === 'allocate') {
          if (!targetSegment) {
            throw new Error('No General session segment found to allocate from.');
          }
          const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, targetSegment.sessionId);
          const sessionSnap = await getDoc(sessionRef);
          if (!sessionSnap.exists()) {
            throw new Error('Time session not found');
          }
          const sessionData = sessionSnap.data();
          const jobs = [...(sessionData.jobs || [])];
          await executeTimeAllocation(sessionRef, jobs);
        } else if (mode === 'manual') {
          await executeManualTimeLogging();
        }
      }

      toast.success('Task successfully completed!');
      onSuccess();
    } catch (err: any) {
      console.error('Error completing task:', err);
      toast.error(err.message || 'Failed to complete task');
    } finally {
      setIsSubmitting(false);
      setUploadStatus('');
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-indigo-500/20 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-indigo-500/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl">
              <FileText className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Complete Task</h2>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">
                {taskTitle}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Stats Review Card */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl grid grid-cols-2 gap-4">
            <div>
              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Time Budget</span>
              <p className="text-lg font-black text-zinc-850 dark:text-zinc-150 mt-1 font-mono">{bookTime.toFixed(1)}h</p>
            </div>
            <div>
              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Logged Actuals</span>
              <p className={`text-lg font-black mt-1 font-mono ${loggedHours > bookTime && bookTime > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                {loggedHours.toFixed(1)}h
              </p>
            </div>
          </div>

          {/* Time Allocation Section (Conditional) */}
          {needsTimeAllocation && (
            <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-850">
              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Time Tracking Required</span>
              
              <div className="flex bg-zinc-100 dark:bg-zinc-950 p-1 rounded-xl gap-1 shrink-0">
                {targetSegment && (
                  <button 
                    type="button"
                    onClick={() => setMode('allocate')}
                    className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                      mode === 'allocate' 
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    Use General
                  </button>
                )}
                <button 
                  type="button"
                  onClick={() => setMode('manual')}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                    mode === 'manual' 
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  Enter Manual
                </button>
                <button 
                  type="button"
                  onClick={() => setMode('bypass')}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                    mode === 'bypass' 
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  Bypass (0h)
                </button>
              </div>

              {mode === 'allocate' && targetSegment && (
                <div className="space-y-4">
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Available General Session</span>
                    <div className="mt-2 text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                      <span>{targetSegment.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{targetSegment.end ? targetSegment.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active Now'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Start Time</label>
                      <input 
                        type="datetime-local" 
                        required
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-2 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">End Time</label>
                      <input 
                        type="datetime-local" 
                        required
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-2 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {mode === 'manual' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Actual Hours Spent</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.1"
                        min="0.1"
                        required
                        value={manualHours}
                        onChange={(e) => setManualHours(e.target.value)}
                        placeholder="e.g. 1.5"
                        className="w-full pl-4 pr-12 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">hours</span>
                    </div>
                  </div>
                </div>
              )}

              {mode === 'bypass' && (
                <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex gap-3 text-left">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-500">Completing with Zero Hours</p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      No timecard adjustment will be made. The task actual duration will remain at <strong>0.0h</strong>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes & Documentation Section */}
          <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-850">
            <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Documentation</span>
            
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Completion Note (Optional)</label>
              <textarea 
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write what was done, parts used, or any notes..."
                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 font-black">Photos (Optional)</label>
              <div className="flex flex-wrap gap-3">
                {attachedImages.map((img, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950">
                    <img src={img.preview} className="w-full h-full object-cover" />
                    <button 
                      type="button" 
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-1 right-1 p-1 bg-zinc-900/80 hover:bg-zinc-900 text-white rounded-full transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                
                <label className="w-20 h-20 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-indigo-500 hover:bg-indigo-500/[0.02] flex flex-col items-center justify-center gap-1 cursor-pointer transition-all">
                  <Camera className="w-5 h-5 text-zinc-400 animate-pulse" />
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Add Photo</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Nudge Alert (Only if allocating time) */}
          {needsTimeAllocation && (
            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl flex gap-3 text-left">
              <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">Efficiency Tip</p>
                <p className="text-[11px] text-indigo-700 dark:text-indigo-300/80 mt-1">
                  In the future, clock directly into tasks as you work on them to capture your true efficiency score!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 shrink-0 flex gap-3 bg-zinc-50 dark:bg-zinc-900/50">
          <button 
            type="button" 
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1 py-3.5 px-4 bg-white dark:bg-zinc-850 hover:bg-zinc-50 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-2xl font-bold transition-all text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          
          <button 
            type="button"
            disabled={isSubmitting}
            onClick={handleCompleteTask}
            className="flex-1 py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 flex justify-center items-center gap-2 text-sm disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">{uploadStatus || 'Saving...'}</span>
              </>
            ) : (
              'Complete Task'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
