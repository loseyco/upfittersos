import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, collection, query, where, updateDoc, addDoc } from 'firebase/firestore';
import { Play, Square, Loader2, ShieldCheck, ChevronRight, ArrowLeft, Clock, User, Wrench, Camera, Plus, Lock, Unlock, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { logBusinessActivity } from '../../lib/activityLogger';

export function JobExecutionPortal({ jobId, allStaff, focusTask }: { jobId: string, allStaff?: any[], focusTask?: string }) {
    const { tenantId, currentUser } = useAuth();
    const [job, setJob] = useState<any>(null);
    const [openLogs, setOpenLogs] = useState<any[]>([]);
    const [closedLogs, setClosedLogs] = useState<any[]>([]);
    const [activeTask, setActiveTask] = useState<any>(null);
    const [uploadingMedia, setUploadingMedia] = useState(false);

    // Notes State
    const [noteText, setNoteText] = useState("");
    const [noteIsBlocker, setNoteIsBlocker] = useState(false);
    const [notePhotoUrl, setNotePhotoUrl] = useState<string | null>(null);
    const [uploadingNoteMedia, setUploadingNoteMedia] = useState(false);

    const hasInitiallyFocusedRef = useRef(false);

    // Subscribe to Job Data
    useEffect(() => {
        if (!jobId || !tenantId) return;
        const unsub = onSnapshot(doc(db, 'jobs', jobId), (snap) => {
            if (snap.exists()) {
                const j = { id: snap.id, ...snap.data() };
                setJob(j);
                if (activeTask) {
                    // Update active task if it changed
                    const updated = j.tasks?.find((t: any) => t.title === activeTask.title);
                    if (updated) setActiveTask(updated);
                } else if (focusTask && j.tasks && !hasInitiallyFocusedRef.current) {
                    hasInitiallyFocusedRef.current = true;
                    if (focusTask === 'blocked') {
                        const blockedTask = j.tasks.find((t: any) => t.status === 'Blocked');
                        if (blockedTask) setActiveTask(blockedTask);
                    } else {
                        const targetTask = j.tasks.find((t: any) => t.title === focusTask);
                        if (targetTask) setActiveTask(targetTask);
                    }
                }
            }
        });
        return () => unsub();
    }, [jobId, tenantId, activeTask, focusTask]);

    // Subscribe to Time Logs for this specific job
    useEffect(() => {
        if (!jobId || !tenantId) return;
        const qOpen = query(
            collection(db, 'businesses', tenantId, 'task_time_logs'),
            where('jobId', '==', jobId),
            where('status', '==', 'open')
        );
        const unsubOpen = onSnapshot(qOpen, (snap) => {
            setOpenLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        
        const qClosed = query(
            collection(db, 'businesses', tenantId, 'task_time_logs'),
            where('jobId', '==', jobId),
            where('status', '==', 'closed')
        );
        const unsubClosed = onSnapshot(qClosed, (snap) => {
            setClosedLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        
        return () => {
            unsubOpen();
            unsubClosed();
        };
    }, [jobId, tenantId]);

    const handleTaskClockToggle = async (task: any, isClockedIn: boolean, logId?: string) => {
        if (!currentUser?.uid || !tenantId || !job) return;
        try {
            const now = new Date().toISOString();
            if (isClockedIn && logId) {
                toast.loading("Clocking out...", { id: 'ep_clock' });
                await updateDoc(doc(db, 'businesses', tenantId, 'task_time_logs', logId), {
                    clockOut: now,
                    status: 'closed'
                });
                toast.success("Stopped task", { id: 'ep_clock' });
            } else {
                toast.loading("Starting task...", { id: 'ep_clock' });
                const vDetails = job.vehicleDetails || {};
                const vehStr = [vDetails.year, vDetails.make, vDetails.model, vDetails.vin?.slice(-6)].filter(Boolean).join(' ') || 'Vehicle';
                
                await addDoc(collection(db, 'businesses', tenantId, 'task_time_logs'), {
                    userId: currentUser.uid,
                    jobId: job.id,
                    taskIndex: task.originalIndex !== undefined ? task.originalIndex : (job.tasks?.findIndex((t: any) => t.title === task.title)),
                    taskName: task.title,
                    vehicleName: vehStr,
                    bookTime: task.bookTime || 0,
                    clockIn: now,
                    clockOut: null,
                    status: 'open',
                    isDiscovery: false
                });
                toast.success("Started task!", { id: 'ep_clock' });
            }
        } catch (err) {
            console.error("Failed to toggle task", err);
            toast.error("Failed to update clock", { id: 'ep_clock' });
        }
    };

    const handleDeleteNotePhoto = async (noteId: string) => {
        if (!job?.id || !activeTask?.title || !tenantId) return;
        try {
            const updatedTasks = [...(job.tasks || [])];
            const taskIdx = updatedTasks.findIndex(t => t.title === activeTask.title);
            if (taskIdx > -1 && updatedTasks[taskIdx].notes) {
                const noteIdx = updatedTasks[taskIdx].notes.findIndex((n: any) => n.id === noteId);
                if (noteIdx > -1 && updatedTasks[taskIdx].notes[noteIdx].photoUrl) {
                    updatedTasks[taskIdx].notes[noteIdx].photoUrl = null;
                    await updateDoc(doc(db, 'jobs', job.id), { tasks: updatedTasks });
                    toast.success("Photo removed from note");
                }
            }
        } catch (err) {
            console.error("Failed to delete note photo", err);
            toast.error("Failed to remove photo");
        }
    };

    const handleAddNote = async () => {
        if (!noteText.trim() || !job?.id || !activeTask?.title) return;
        
        try {
            const updatedTasks = [...(job.tasks || [])];
            const taskIdx = updatedTasks.findIndex(t => t.title === activeTask.title);
            if (taskIdx > -1) {
                if (!Array.isArray(updatedTasks[taskIdx].notes)) {
                    updatedTasks[taskIdx].notes = [];
                }
                const newNote = {
                    id: Math.random().toString(36).substring(2, 9),
                    text: noteText,
                    authorId: currentUser?.uid,
                    timestamp: new Date().toISOString(),
                    isBlocker: noteIsBlocker,
                    isResolved: false,
                    photoUrl: notePhotoUrl
                };
                updatedTasks[taskIdx].notes.push(newNote);
                
                if (noteIsBlocker) {
                    updatedTasks[taskIdx].status = 'Blocked';
                }
                
                await updateDoc(doc(db, 'jobs', job.id), {
                    tasks: updatedTasks
                });

                logBusinessActivity(tenantId!, {
                    action: noteIsBlocker ? 'BLOCKER_ADDED' : 'NOTE_ADDED',
                    jobId: job.id,
                    jobTitle: job.title || 'Unknown Job',
                    taskTitle: activeTask.title,
                    userId: currentUser?.uid || 'Unknown',
                    userName: currentUser?.displayName || 'Tech',
                    details: noteIsBlocker ? `Reported blocker: "${noteText}"` : `Added note: "${noteText}"`
                });

                toast.success(noteIsBlocker ? "Blocker reported!" : "Note added");
                setNoteText("");
                setNoteIsBlocker(false);
                setNotePhotoUrl(null);
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to add note");
        }
    };
    
    const handleNoteFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length || !job?.id || !activeTask?.title || !tenantId) return;
        
        setUploadingNoteMedia(true);
        try {
            const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
            const storage = getStorage();
            
            const file = e.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `note_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const pRef = ref(storage, `job_media/${tenantId}/${job.id}/tasks/${activeTask.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}/${fileName}`);
            
            await uploadBytes(pRef, file);
            const url = await getDownloadURL(pRef);
            
            setNotePhotoUrl(url);
            toast.success("Photo attached to note!");
        } catch (err) {
            console.error(err);
            toast.error("Failed to upload photo for note.");
        } finally {
            setUploadingNoteMedia(false);
            e.target.value = '';
        }
    };

    const handleResolveBlocker = async (noteId: string) => {
        if (!job?.id || !activeTask?.title) return;
        try {
            const updatedTasks = [...(job.tasks || [])];
            const taskIdx = updatedTasks.findIndex(t => t.title === activeTask.title);
            if (taskIdx > -1 && updatedTasks[taskIdx].notes) {
                const noteIdx = updatedTasks[taskIdx].notes.findIndex((n: any) => n.id === noteId);
                if (noteIdx > -1) {
                    updatedTasks[taskIdx].notes[noteIdx].isResolved = true;
                    
                    // Automatically un-block the task if this was the last active blocker
                    const hasOtherBlockers = updatedTasks[taskIdx].notes.some((n: any) => n.isBlocker && !n.isResolved);
                    if (!hasOtherBlockers && updatedTasks[taskIdx].status === 'Blocked') {
                        updatedTasks[taskIdx].status = 'In Progress';
                    }

                    await updateDoc(doc(db, 'jobs', job.id), {
                        tasks: updatedTasks
                    });

                    logBusinessActivity(tenantId!, {
                        action: 'BLOCKER_RESOLVED',
                        jobId: job.id,
                        jobTitle: job.title || 'Unknown Job',
                        taskTitle: activeTask.title,
                        userId: currentUser?.uid || 'Unknown',
                        userName: currentUser?.displayName || 'Tech',
                        details: `Resolved blocker on task.`
                    });

                    toast.success("Blocker resolved!");
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleMarkQA = async () => {
        if (!job?.id || !activeTask?.title) return;
        try {
            const updatedTasks = [...(job.tasks || [])];
            const taskIdx = updatedTasks.findIndex(t => t.title === activeTask.title);
            if (taskIdx > -1) {
                updatedTasks[taskIdx].status = 'Ready for QA';
                await updateDoc(doc(db, 'jobs', job.id), { tasks: updatedTasks });

                logBusinessActivity(tenantId!, {
                    action: 'STATUS_CHANGE',
                    jobId: job.id,
                    jobTitle: job.title || 'Unknown Job',
                    taskTitle: activeTask.title,
                    userId: currentUser?.uid || 'Unknown',
                    userName: currentUser?.displayName || 'Tech',
                    details: 'Marked task as Ready for QA'
                });

                toast.success('Task marked ready for QA');
            }
        } catch (err) {
            console.error(err);
        }
    };

    if (!job) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-500" />
                <p>Loading Workspace...</p>
            </div>
        );
    }

    if (activeTask) {
        const myActiveLog = openLogs.find(l => l.taskName === activeTask.title && l.userId === currentUser?.uid);
        
        const closedLogsForThisTask = closedLogs.filter(l => l.taskName === activeTask.title);
        let totalTimeSpentMs = 0;
        closedLogsForThisTask.forEach(l => {
            const ms = new Date(l.clockOut).getTime() - new Date(l.clockIn).getTime();
            totalTimeSpentMs += Math.max(0, ms);
        });
        const totalHrs = (totalTimeSpentMs / 3600000).toFixed(2);
        const bookHrs = activeTask.bookTime || 0;
        
        return (
            <div className="flex flex-col h-full bg-zinc-950">
                {/* Header */}
                <div className="shrink-0 border-b border-zinc-800 bg-zinc-900 p-6">
                    <button 
                        onClick={() => setActiveTask(null)}
                        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-bold uppercase tracking-widest mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to Job Overview
                    </button>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                                Task details
                            </span>
                        </div>
                        <h1 className="text-3xl font-black text-white">{activeTask.title}</h1>
                        <p className="text-sm text-zinc-500 mt-2 max-w-3xl">{activeTask.description || 'No description provided.'}</p>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                    <div className="max-w-3xl mx-auto space-y-6">
                        
                        {/* Task Stats Block */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest block mb-1">Total Time Accrued</span>
                                <span className="text-xl font-mono text-white">{totalHrs} <span className="text-sm text-zinc-500">HRS</span></span>
                            </div>
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest block mb-1">Book Time</span>
                                <span className="text-xl font-mono text-zinc-300">{bookHrs > 0 ? bookHrs : '--'} <span className="text-sm text-zinc-500">HRS</span></span>
                            </div>
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 col-span-2 flex flex-col justify-center">
                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest block mb-1 text-right">Time logs on this task</span>
                                <div className="flex items-center justify-end -space-x-2">
                                    {Array.from(new Set(closedLogsForThisTask.map(l => l.userId))).map((uid: any) => {
                                        const staff = (allStaff || []).find((s: any) => s.uid === uid);
                                        return staff?.profilePicUrl ? (
                                            <img key={uid} src={staff.profilePicUrl} className="w-8 h-8 rounded-full border-2 border-zinc-900 object-cover" title={`${staff.firstName} ${staff.lastName}`} />
                                        ) : (
                                            <div key={uid} className="w-8 h-8 rounded-full bg-zinc-700 border-2 border-zinc-900 flex items-center justify-center text-xs font-bold text-white capitalize">
                                                {staff?.firstName?.[0] || '?'}
                                            </div>
                                        );
                                    })}
                                    {closedLogsForThisTask.length === 0 && <span className="text-xs text-zinc-500">No shifts recorded</span>}
                                </div>
                            </div>
                        </div>

                        {/* Clock Actions */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                            <div>
                                <h2 className="text-lg font-black text-white uppercase tracking-widest mb-1">{myActiveLog ? 'Currently Working' : 'Time Tracking'}</h2>
                                <p className="text-sm text-zinc-500 max-w-sm">{myActiveLog ? 'Your timer is actively logging right now.' : 'Clock into this task to log your hours for payroll and reporting.'}</p>
                            </div>
                            
                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <button
                                    onClick={() => handleTaskClockToggle(activeTask, !!myActiveLog, myActiveLog?.id)}
                                    className={`flex-1 shrink-0 flex items-center justify-center gap-3 px-8 py-3.5 rounded-xl font-black uppercase tracking-widest transition-all ${myActiveLog ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20' : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 scale-105'}`}
                                >
                                    {myActiveLog ? <><Square className="w-5 h-5 fill-current"/> Stop Working</> : <><Play className="w-5 h-5 fill-current"/> Start Task</>}
                                </button>
                                
                                {!myActiveLog && activeTask.status !== 'Ready for QA' && (
                                    <button 
                                        onClick={handleMarkQA}
                                        className="shrink-0 flex items-center gap-2 px-6 py-3.5 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 rounded-xl font-bold text-sm tracking-wide transition-colors"
                                    >
                                        <ShieldCheck className="w-4 h-4"/> Ready for QA
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Associated Parts Block */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                            <h2 className="text-sm font-black text-white uppercase tracking-widest mb-4 border-b border-zinc-800 pb-2">Associated Parts</h2>
                            <div className="flex flex-col items-center justify-center p-8 text-zinc-500 border-2 border-dashed border-zinc-800 rounded-xl text-sm">
                                <Wrench className="w-6 h-6 mb-2 opacity-50"/>
                                <p>No parts tracked.</p>
                            </div>
                        </div>

                        {/* Field Notes Section */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mt-6">
                            <div className="p-6 border-b border-zinc-800">
                                <h2 className="text-lg font-black text-white uppercase tracking-widest">Field Notes & Blockers</h2>
                                <p className="text-sm text-zinc-500">Document issues, status updates, or roadblockers encountered.</p>
                            </div>
                            
                            {/* Input Form */}
                            <div className="p-4 bg-zinc-950 flex flex-col gap-3">
                                <textarea 
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[80px]"
                                    placeholder="Type a new update..."
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                />
                                {notePhotoUrl && (
                                    <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-zinc-700">
                                        <img src={notePhotoUrl} alt="Note attachment" className="w-full h-full object-cover" />
                                        <button onClick={() => setNotePhotoUrl(null)} className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white rounded p-0.5">
                                            <Square className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <label className={`cursor-pointer w-8 h-8 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center transition-colors ${uploadingNoteMedia ? 'opacity-50 pointer-events-none' : ''}`} title="Attach Photo">
                                            {uploadingNoteMedia ? <Loader2 className="w-4 h-4 animate-spin"/> : <Camera className="w-4 h-4"/>}
                                            <input type="file" accept="image/*" className="hidden" onChange={handleNoteFileUpload} />
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input 
                                                type="checkbox" 
                                                className="w-4 h-4 rounded border-zinc-700 text-red-500 focus:ring-red-500 focus:ring-offset-zinc-900 bg-zinc-800"
                                                checked={noteIsBlocker}
                                                onChange={(e) => setNoteIsBlocker(e.target.checked)}
                                            />
                                            <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 group-hover:text-zinc-300">Mark as Blocking item</span>
                                        </label>
                                    </div>
                                    
                                    <button 
                                        onClick={handleAddNote}
                                        disabled={!noteText.trim() && !notePhotoUrl}
                                        className="px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-widest bg-emerald-500 text-black hover:bg-emerald-400 transition-colors disabled:opacity-50"
                                    >
                                        Post Note
                                    </button>
                                </div>
                            </div>

                            {/* Note Threads */}
                            <div className="p-6 space-y-4">
                                {(Array.isArray(activeTask.notes) ? activeTask.notes : []).map((note: any, idx: number) => {
                                    const author = (allStaff || []).find((s: any) => s.uid === note.authorId);
                                    return (
                                        <div key={idx} className={`p-4 rounded-xl border ${note.isBlocker && !note.isResolved ? 'bg-red-500/10 border-red-500/30' : 'bg-zinc-950 border-zinc-800'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    {author?.profilePicUrl ? (
                                                        <img src={author.profilePicUrl} className="w-5 h-5 rounded-full object-cover" alt="Avatar"/>
                                                    ) : (
                                                        <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[8px] font-bold text-white capitalize">
                                                            {author?.firstName?.[0] || '?'}
                                                        </div>
                                                    )}
                                                    <span className="text-sm font-bold text-zinc-300">{author?.firstName} {author?.lastName}</span>
                                                    <span className="text-xs text-zinc-600">{new Date(note.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                </div>
                                                
                                                {note.isBlocker && (
                                                    <div className="flex items-center gap-2">
                                                        {note.isResolved ? (
                                                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded px-1.5 py-0.5 uppercase tracking-widest font-bold">Resolved Block</span>
                                                        ) : (
                                                            <button 
                                                                onClick={() => handleResolveBlocker(note.id)}
                                                                className="text-[10px] bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors border border-red-500/20 rounded px-2 py-0.5 uppercase tracking-widest font-bold"
                                                            >
                                                                Unblock
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <p className={`text-sm ${note.isBlocker && !note.isResolved ? 'text-red-200' : 'text-zinc-400'} whitespace-pre-wrap`}>
                                                {note.text}
                                            </p>
                                            {note.photoUrl && (
                                                <div className="mt-3 relative rounded-lg overflow-hidden border border-zinc-800 inline-block group/img">
                                                    <img src={note.photoUrl} alt="Note photo" className="max-w-[200px] h-auto object-cover hover:opacity-90 cursor-pointer" onClick={() => window.open(note.photoUrl, '_blank')}/>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteNotePhoto(note.id); }}
                                                        className="absolute top-1 right-1 bg-black/60 hover:bg-red-500 hover:text-white text-zinc-300 rounded p-1 opacity-0 group-hover/img:opacity-100 transition-all border border-zinc-700 hover:border-red-400 shadow-md backdrop-blur-sm"
                                                        title="Delete Photo"
                                                    >
                                                        <Square className="w-4 h-4 fill-current"/>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {(!Array.isArray(activeTask.notes) || activeTask.notes.length === 0) && (
                                    <div className="text-center italic text-sm text-zinc-500 py-4">
                                        No notes for this task yet.
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-zinc-950">
            {/* Header */}
            <div className="shrink-0 border-b border-zinc-800 bg-zinc-900 p-6 md:p-8 flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                            {job.status}
                        </span>
                        {job.tagNumber && (
                            <span className="bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                                Tag #{job.tagNumber}
                            </span>
                        )}
                        {job.parkedLocation && (
                            <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                                {job.parkedLocation}
                            </span>
                        )}
                    </div>
                    <h1 className="text-3xl font-black text-white">{job.title || 'Untitled Work Order'}</h1>
                    
                    <div className="flex gap-6 mt-4">
                        {job.customer && (
                            <div className="text-sm">
                                <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mb-1">Customer</p>
                                <p className="text-white font-medium">{job.customer.firstName} {job.customer.lastName}</p>
                            </div>
                        )}
                        {job.vehicleDetails && (
                            <div className="text-sm">
                                <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mb-1">Vehicle</p>
                                <p className="text-white font-medium">{job.vehicleDetails.year} {job.vehicleDetails.make} {job.vehicleDetails.model}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                <div className="max-w-4xl mx-auto space-y-4">
                    <h2 className="text-sm font-black text-white uppercase tracking-widest border-b border-zinc-800 pb-2 mb-6">Work Order Tasks</h2>
                    
                    {(job.tasks || []).map((task: any, idx: number) => {
                        const activeLogsForTask = openLogs.filter(l => l.taskName === task.title);
                        const isClockedIn = activeLogsForTask.some(l => l.userId === currentUser?.uid);
                        
                        return (
                            <div 
                                key={idx} 
                                onClick={() => setActiveTask(task)}
                                className={`group bg-zinc-900 border ${isClockedIn ? 'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-zinc-800 hover:border-zinc-700'} rounded-2xl p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-all hover:bg-zinc-800/50`}
                            >
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className={`text-lg font-bold ${isClockedIn ? 'text-emerald-400' : 'text-white'}`}>{task.title}</h3>
                                        {isClockedIn && <span className="flex items-center gap-1 text-[10px] uppercase font-black tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 animate-pulse"><Play className="w-3 h-3"/> Active</span>}
                                        {task.status === 'Ready for QA' && <span className="flex items-center gap-1 text-[10px] uppercase font-black tracking-widest text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20"><ShieldCheck className="w-3 h-3"/> QA pending</span>}
                                    </div>

                                    {/* Task Stats Row */}
                                    <div className="flex flex-wrap items-center gap-4 text-xs font-bold font-mono text-zinc-500">
                                        <div className="flex items-center gap-1.5" title="Book Time">
                                            <Clock className="w-3.5 h-3.5" />
                                            {task.bookTime ? `${task.bookTime} HR` : 'N/A'}
                                        </div>
                                        <div className="flex items-center gap-1.5" title="Active Technicians">
                                            <User className="w-3.5 h-3.5" />
                                            {activeLogsForTask.length > 0 ? (
                                                <div className="flex -space-x-2 mr-1">
                                                    {activeLogsForTask.map((log: any, i: number) => {
                                                        const staff = (allStaff || []).find((s: any) => s.uid === log.userId);
                                                        return staff?.profilePicUrl ? (
                                                            <img key={i} src={staff.profilePicUrl} className="w-5 h-5 rounded-full border border-zinc-900 object-cover" title={`${staff.firstName} ${staff.lastName}`} />
                                                        ) : (
                                                            <div key={i} className="w-5 h-5 rounded-full bg-zinc-700 border border-zinc-900 flex items-center justify-center text-[8px] font-bold text-white capitalize">
                                                                {staff?.firstName?.[0] || '?'}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <span>unassigned</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5" title="Parts Status">
                                            <Wrench className="w-3.5 h-3.5" />
                                            <span>OK</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="shrink-0 p-2 bg-zinc-950/50 rounded-xl group-hover:bg-zinc-950 transition-colors border border-zinc-800">
                                    <ChevronRight className={`w-5 h-5 ${isClockedIn ? 'text-emerald-500' : 'text-zinc-600 group-hover:text-white'}`} />
                                </div>
                            </div>
                        );
                    })}
                    
                    {(!job.tasks || job.tasks.length === 0) && (
                        <div className="text-zinc-600 text-sm italic py-8 text-center border-2 border-dashed border-zinc-800 rounded-2xl">
                            No tasks found on this Work Order.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
