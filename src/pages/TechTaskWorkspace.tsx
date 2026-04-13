import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, PlayCircle, CheckCircle2, SearchCode, X, MapPin, Wrench, PauseCircle, AlertTriangle, Clock, PlusCircle, Camera, Image as ImageIcon, ChevronLeft, ChevronRight, ShieldCheck, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';

export function TechTaskWorkspace() {
    const { jobId, taskIndexStr } = useParams();
    const taskIndex = parseInt(taskIndexStr || '0', 10);
    const navigate = useNavigate();
    const { currentUser, tenantId } = useAuth();
    const { checkPermission } = usePermissions();
    const canQA = checkPermission('manage_qa');

    const [job, setJob] = useState<any>(null);
    const [vehicleName, setVehicleName] = useState('Unknown Vehicle');
    const [customerName, setCustomerName] = useState('Unknown Customer');
    const [taskTimeLogs, setTaskTimeLogs] = useState<any[]>([]);
    const [blockerModal, setBlockerModal] = useState<{isOpen: boolean, note: string} | null>(null);
    const [manualTimeModal, setManualTimeModal] = useState<{isOpen: boolean, isDiscovery: boolean} | null>(null);
    const [editLogModal, setEditLogModal] = useState<{isOpen: boolean, log: any} | null>(null);
    const [uploadingPhotos, setUploadingPhotos] = useState(false);
    const [uploadingQAPhotos, setUploadingQAPhotos] = useState(false);
    const [techPhotoLightbox, setTechPhotoLightbox] = useState<number | null>(null);
    const [qaPhotoLightbox, setQaPhotoLightbox] = useState<number | null>(null);
    const [newNoteText, setNewNoteText] = useState('');
    const [newQANoteText, setNewQANoteText] = useState('');

    useEffect(() => {
        if (!jobId || !tenantId) return;

        // Listen to specific job
        const unsubJob = onSnapshot(doc(db, 'jobs', jobId), async (s) => {
            if (s.exists()) {
                const jData = { id: s.id, ...s.data() } as any;
                setJob(jData);

                // Fetch minimal auxiliary info
                if (jData.vehicleId) {
                    const vSnap = await getDoc(doc(db, 'vehicles', jData.vehicleId));
                    if (vSnap.exists()) {
                        const v = vSnap.data();
                        setVehicleName(`${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim());
                    }
                }
                if (jData.customerId) {
                    const cSnap = await getDoc(doc(db, 'customers', jData.customerId));
                    if (cSnap.exists()) {
                        const c = cSnap.data();
                        setCustomerName([c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Unknown Customer');
                    }
                }
            }
        });

        const unsubLogs = onSnapshot(query(collection(db, 'businesses', tenantId, 'task_time_logs'), where('userId', '==', currentUser?.uid), where('jobId', '==', jobId)), (s) => {
            setTaskTimeLogs(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubJob();
            unsubLogs();
        };
    }, [jobId, tenantId, currentUser?.uid]);

    if (!job || !job.tasks || !job.tasks[taskIndex]) {
        return (
            <div className="flex-1 bg-zinc-950 p-8 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-accent border-r-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm">Loading Workspace...</p>
                </div>
            </div>
        );
    }

    const computeShiftHours = (log: any): number => {
        if (!log.clockIn) return 0;
        let totalMs = 0;
        const outTime = log.clockOut ? new Date(log.clockOut).getTime() : Date.now();
        totalMs = outTime - new Date(log.clockIn).getTime();

        if (log.breaks && Array.isArray(log.breaks)) {
            log.breaks.forEach((b: any) => {
                if (b.start && b.type !== 'paid') {
                    const bEnd = b.end ? new Date(b.end).getTime() : Date.now();
                    totalMs -= (bEnd - new Date(b.start).getTime());
                }
            });
        }
        return Math.max(0, totalMs / (1000 * 60 * 60));
    };

    const task = job.tasks[taskIndex];
    const isClockedIn = taskTimeLogs.some(log => log.jobId === job.id && log.taskIndex === taskIndex && log.status === 'open');
    const effectiveStatus = isClockedIn ? 'In Progress' : task.status;

    const taskLogsForThisTask = taskTimeLogs.filter(log => log.jobId === job.id && log.taskIndex === taskIndex);
    const hoursSpent = taskLogsForThisTask.reduce((acc, log) => acc + computeShiftHours(log), 0);
    const bookTimeVal = Number(task.bookTime) || 0;
    const percentage = bookTimeVal > 0 ? (hoursSpent / bookTimeVal) * 100 : 0;
    const clampedPercentage = Math.min(100, Math.max(0, percentage));




    const handleUpdateTaskStatus = async (newStatus: string, startAsDiscovery: boolean = false, blockerNote?: string) => {
        try {
            const jobRef = doc(db, 'jobs', jobId as string);
            const updatedTasks = [...job.tasks];
            
            if (newStatus === 'Blocked' && blockerNote) {
                if (!updatedTasks[taskIndex].blockers) updatedTasks[taskIndex].blockers = [];
                updatedTasks[taskIndex].blockers.push({
                    text: blockerNote,
                    time: new Date().toISOString(),
                    authorUid: currentUser?.uid,
                    authorName: currentUser?.displayName || 'Unknown'
                });
            }
            
            updatedTasks[taskIndex].status = newStatus;

            if ((newStatus === 'In Progress' || newStatus === 'Finished' || newStatus === 'Paused' || newStatus === 'Blocked') && currentUser) {
                if (!updatedTasks[taskIndex].assignedUids) updatedTasks[taskIndex].assignedUids = [];
                if (!updatedTasks[taskIndex].assignedUids.includes(currentUser.uid)) {
                    updatedTasks[taskIndex].assignedUids.push(currentUser.uid);
                }
            }

            if (newStatus === 'Finished' && updatedTasks[taskIndex].status === 'Ready for QA') {
                updatedTasks[taskIndex].qaAuthorUid = currentUser?.uid || null;
                updatedTasks[taskIndex].qaAuthorName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'System';
                updatedTasks[taskIndex].qaTimestamp = new Date().toISOString();
            }

            const updatePayload: any = { tasks: updatedTasks };

            if (newStatus === 'Finished') {
                // If this is the last open task, advance the entire job to Invoicing Phase
                const allFinished = updatedTasks.every((t: any) => t.status === 'Finished' || t.status === 'Cancelled');
                if (allFinished) {
                    updatePayload.status = 'Ready for Invoicing';
                }
            }

            await updateDoc(jobRef, updatePayload);
            
            if ((newStatus === 'In Progress' || newStatus === 'Finished' || newStatus === 'Paused' || newStatus === 'Blocked') && currentUser && tenantId) {
                try {
                    const { getDocs, addDoc } = await import('firebase/firestore');
                    
                    const qTaskOpen = query(collection(db, 'businesses', tenantId, 'task_time_logs'), where('userId', '==', currentUser.uid), where('status', '==', 'open'));
                    const openTasksSnap = await getDocs(qTaskOpen);
                    const now = new Date().toISOString();
                    
                    for (const activeDoc of openTasksSnap.docs) {
                        await updateDoc(doc(db, 'businesses', tenantId, 'task_time_logs', activeDoc.id), {
                            clockOut: now,
                            status: 'closed'
                        });
                    }

                    if (newStatus === 'In Progress') {
                        await addDoc(collection(db, 'businesses', tenantId, 'task_time_logs'), {
                            userId: currentUser.uid,
                            jobId: jobId,
                            taskIndex: taskIndex,
                            taskName: updatedTasks[taskIndex].title,
                            vehicleName: vehicleName,
                            bookTime: updatedTasks[taskIndex].bookTime || 0,
                            clockIn: now,
                            clockOut: null,
                            status: 'open',
                            isDiscovery: startAsDiscovery
                        });
                    }

                    const qObj = query(collection(db, 'businesses', tenantId, 'time_logs'), where('userId', '==', currentUser.uid), where('status', '==', 'open'));
                    const activeTimeLogSnap = await getDocs(qObj);
                    const prefix = newStatus === 'In Progress' ? (startAsDiscovery ? 'Started R&D Task' : 'Started Task') : (newStatus === 'Paused' || newStatus === 'Blocked' ? 'Paused Task' : ((newStatus as string) === 'Ready for QA' ? 'Submitted for QA' : 'Finished Task'));
                    
                    if (!activeTimeLogSnap.empty) {
                        const activeLogDoc = activeTimeLogSnap.docs[0];
                        const activeLog = activeLogDoc.data();
                        
                        const newNote = {
                            text: `${prefix}: ${updatedTasks[taskIndex].title} - ${vehicleName}`,
                            time: now
                        };
                        
                        const updatedNotes = [...(activeLog.notes || []), newNote];
                        await updateDoc(doc(db, 'businesses', tenantId, 'time_logs', activeLogDoc.id), { notes: updatedNotes });
                    } else if (newStatus === 'In Progress') {
                        await addDoc(collection(db, 'businesses', tenantId, 'time_logs'), {
                            userId: currentUser.uid,
                            clockIn: now,
                            status: 'open',
                            breaks: [],
                            notes: [{
                                text: `Started Shift implicitly via Task: ${updatedTasks[taskIndex].title} - ${vehicleName}`,
                                time: now
                            }]
                        });
                    }
                } catch (noteErr) {
                    console.error("Failed to manage timeclock hooks:", noteErr);
                }
            }

            toast.success(`Task marked as ${newStatus}`);
            if (newStatus === 'Ready for QA' || newStatus === 'Finished') navigate('/business/tech');
        } catch (err) {
            console.error(err);
            toast.error("Failed to update task");
        }
    };

    const submitManualTime = async () => {
        if (!manualTimeModal || !job || !tenantId || !currentUser) return;
        const inStr = (document.getElementById('manualClockIn') as HTMLInputElement).value;
        const outStr = (document.getElementById('manualClockOut') as HTMLInputElement).value;
        
        if (!inStr || !outStr) {
            toast.error("Please provide both a start and stop time.");
            return;
        }

        try {
            const { addDoc, collection } = await import('firebase/firestore');
            const inDate = new Date(inStr);
            const outDate = new Date(outStr);
            
            if (outDate.getTime() <= inDate.getTime()) {
                toast.error("Clock Out time must be after Clock In.");
                return;
            }
            
            await addDoc(collection(db, 'businesses', tenantId, 'task_time_logs'), {
                userId: currentUser.uid,
                jobId: jobId,
                taskIndex: taskIndex,
                taskName: `[MANUAL] ${job.tasks[taskIndex]?.title || 'Task'}`,
                vehicleName: vehicleName,
                bookTime: job.tasks[taskIndex]?.bookTime || 0,
                clockIn: inDate.toISOString(),
                clockOut: outDate.toISOString(),
                status: 'closed',
                isDiscovery: manualTimeModal.isDiscovery,
                needsReview: true,
                manualEntry: true,
                authorName: currentUser.displayName || 'Tech'
            });
            
            toast.success("Manual time flagged for review");
            setManualTimeModal(null);
        } catch (e) {
            console.error(e);
            toast.error("Failed to add manual time");
        }
    };

    const handleSubmitNote = async (isQA: boolean = false) => {
        const text = isQA ? newQANoteText : newNoteText;
        if (!text.trim() || !job || !tenantId || !currentUser) return;
        try {
            const jobRef = doc(db, 'jobs', jobId as string);
            const updatedTasks = [...job.tasks];
            
            if (isQA) {
                if (!updatedTasks[taskIndex].qaNotes) updatedTasks[taskIndex].qaNotes = [];
                updatedTasks[taskIndex].qaNotes.push({
                    text: text.trim(),
                    authorName: currentUser.displayName || 'QA Inspector',
                    time: new Date().toISOString()
                });
                setNewQANoteText('');
            } else {
                if (!updatedTasks[taskIndex].techNotes) updatedTasks[taskIndex].techNotes = [];
                updatedTasks[taskIndex].techNotes.push({
                    text: text.trim(),
                    authorName: currentUser.displayName || 'Tech',
                    time: new Date().toISOString()
                });
                setNewNoteText('');
            }

            await updateDoc(jobRef, { tasks: updatedTasks });
            toast.success(isQA ? "QA Note added" : "Note added");
        } catch (e) {
            console.error(e);
            toast.error("Failed to add note");
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isQA: boolean = false) => {
        if (!e.target.files || e.target.files.length === 0 || !tenantId || !jobId) return;
        if (isQA) setUploadingQAPhotos(true);
        else setUploadingPhotos(true);
        
        try {
            const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
            const storage = getStorage();
            const updatedTasks = [...job.tasks];
            
            if (isQA) {
                if (!updatedTasks[taskIndex].qaPhotos) updatedTasks[taskIndex].qaPhotos = [];
            } else {
                if (!updatedTasks[taskIndex].photos) updatedTasks[taskIndex].photos = [];
            }

            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];
                const storageRef = ref(storage, `job_media/${tenantId}/${jobId}/task_${taskIndex}_${isQA ? 'qa_' : ''}${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file, { contentType: file.type });
                const url = await getDownloadURL(storageRef);
                
                const photoObj = {
                    url,
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: currentUser?.displayName || (isQA ? 'QA Inspector' : 'Tech')
                };

                if (isQA) {
                    updatedTasks[taskIndex].qaPhotos.push(photoObj);
                } else {
                    updatedTasks[taskIndex].photos.push(photoObj);
                }
            }
            const jobRef = doc(db, 'jobs', jobId as string);
            await updateDoc(jobRef, { tasks: updatedTasks });
            toast.success("Photos uploaded successfully");
        } catch (err) {
            console.error(err);
            toast.error("Failed to upload photos");
        } finally {
            if (isQA) setUploadingQAPhotos(false);
            else setUploadingPhotos(false);
            e.target.value = ''; // clear input
        }
    };

    const handleSaveEditLog = async (logId: string, updates: any) => {
        try {
            await updateDoc(doc(db, 'businesses', tenantId!, 'task_time_logs', logId), {
                ...updates,
                needsReview: true,
                manualEntry: true
            });
            toast.success("Task time updated");
            setEditLogModal(null);
        } catch(err) {
            console.error(err);
            toast.error("Failed to update task time");
        }
    };

    const handleDeleteLog = async (logId: string) => {
        try {
            if (!confirm("Are you sure you want to permanently delete this task time log?")) return;
            await deleteDoc(doc(db, 'businesses', tenantId!, 'task_time_logs', logId));
            toast.success("Task time deleted");
            setEditLogModal(null);
        } catch(err) {
            console.error(err);
            toast.error("Failed to delete task time");
        }
    };

    return (
        <div className="flex-1 bg-zinc-950 flex flex-col min-h-screen relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] pointer-events-none translate-x-1/3 -translate-y-1/3"></div>
            
            {/* Header */}
            <div className="p-6 md:px-8 md:py-6 flex items-start sm:items-center justify-between border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md relative z-10 flex-col sm:flex-row gap-4 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/business/tech')} className="bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 p-2.5 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5"/>
                    </button>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            {effectiveStatus === 'In Progress' ? (
                                <span className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Clocked In</span>
                            ) : task.status === 'Blocked' ? (
                                <span className="flex items-center gap-1.5 text-red-500 text-[10px] font-black uppercase tracking-widest bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20"><AlertTriangle className="w-3 h-3"/> Task Blocked</span>
                            ) : effectiveStatus === 'Ready for QA' ? (
                                <span className="flex items-center gap-1.5 text-blue-400 text-[10px] font-black uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20"><ShieldCheck className="w-3 h-3"/> Pending QA Inspection</span>
                            ) : (
                                <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest bg-zinc-800/50 px-2 py-0.5 rounded border border-zinc-800">Not Clocked In</span>
                            )}
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black text-white">{task.title}</h1>
                        <button onClick={() => navigate(`/business/jobs/${job.id}`)} className="text-left text-zinc-400 hover:text-accent font-medium text-sm mt-1 transition-colors flex flex-wrap items-center gap-2">
                            <span>{vehicleName} &bull; {customerName}</span>
                            <span className="text-accent/50 text-[10px] uppercase font-black tracking-widest bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">View Main Job</span>
                        </button>
                        
                        {bookTimeVal > 0 && (
                            <div className="flex flex-col gap-1.5 w-full sm:min-w-[250px] max-w-[300px] mt-4 relative z-10">
                                <div className="flex items-center justify-between text-[10px] font-bold tracking-widest text-zinc-500 uppercase px-0.5">
                                    <div className="flex items-center gap-1.5"><Wrench className="w-3 h-3 text-zinc-600" /> Book Time</div>
                                    <div className="flex gap-2.5 items-center">
                                        <span className="text-white">{hoursSpent.toFixed(2)}h <span className="text-zinc-600 font-medium">/</span> {bookTimeVal.toFixed(2)}h</span>
                                        <span className={`px-1.5 py-0.5 rounded ${percentage > 100 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                            {percentage.toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden border border-zinc-700/50 shadow-inner">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(var(--color-primary),0.5)] ${percentage > 100 ? 'bg-red-500 shadow-red-500/50' : 'bg-emerald-400 shadow-emerald-400/50'}`} 
                                        style={{ width: `${clampedPercentage}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Embedded Inline Action Buttons for fast Desktop access */}
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    {effectiveStatus === 'Ready for QA' ? (
                        canQA ? (
                            <>
                                <button onClick={() => handleUpdateTaskStatus('Finished')} className="flex flex-1 sm:flex-none items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-lg text-sm uppercase tracking-widest transition-colors shadow-lg">
                                    <ShieldCheck className="w-4 h-4"/> QA Passed
                                </button>
                                <button onClick={() => {
                                    handleUpdateTaskStatus('Paused');
                                    setBlockerModal({ isOpen: true, note: 'QA FAILED: ' });
                                }} className="flex flex-1 sm:flex-none items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-5 py-2.5 rounded-lg text-sm font-black uppercase tracking-widest transition-colors">
                                    <XCircle className="w-4 h-4"/> QA Reject (Return to Tech)
                                </button>
                            </>
                        ) : (
                            <div className="flex items-center justify-center gap-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-6 py-2.5 rounded-lg text-sm font-black uppercase tracking-widest cursor-default">
                                <ShieldCheck className="w-4 h-4" /> Waiting for QA Inspector
                            </div>
                        )
                    ) : effectiveStatus !== 'In Progress' ? (
                        <>
                            <button 
                                disabled={task.isApproved === false}
                                onClick={() => handleUpdateTaskStatus('In Progress')} 
                                className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-black uppercase tracking-widest transition-colors ${task.isApproved === false ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 opacity-60 cursor-not-allowed' : 'bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20'}`}
                            >
                                {task.isApproved === false ? <><span className="text-lg leading-none">⏳</span> Missing Approval</> : <><PlayCircle className="w-4 h-4" /> Clock In (Book)</>}
                            </button>
                            <button 
                                disabled={task.isApproved === false}
                                onClick={() => handleUpdateTaskStatus('In Progress', true)} 
                                className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-black uppercase tracking-widest transition-colors ${task.isApproved === false ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 opacity-60 cursor-not-allowed' : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20'}`}
                            >
                                {task.isApproved === false ? <><span className="text-lg leading-none">⏳</span> Missing Approval</> : <><SearchCode className="w-4 h-4" /> Clock In (R&D)</>}
                            </button>
                            <button 
                                disabled={task.isApproved === false || (effectiveStatus as any) === 'Finished'}
                                onClick={() => handleUpdateTaskStatus('Ready for QA')} 
                                className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-black uppercase tracking-widest transition-colors ${task.isApproved === false || (effectiveStatus as any) === 'Finished' ? 'bg-emerald-500/10 text-emerald-500/50 border border-emerald-500/20 opacity-60 cursor-not-allowed' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'}`}
                            >
                                <CheckCircle2 className="w-4 h-4"/> {(effectiveStatus as any) === 'Finished' ? 'Finished' : 'Submit for QA'}
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => handleUpdateTaskStatus('Paused')} className="flex flex-1 sm:flex-none items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50 px-5 py-2.5 rounded-lg text-sm font-black uppercase tracking-widest transition-colors">
                                <PauseCircle className="w-4 h-4"/> Pause Task
                            </button>
                            <button onClick={() => setBlockerModal({ isOpen: true, note: '' })} className="flex flex-1 sm:flex-none items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-5 py-2.5 rounded-lg text-sm font-black uppercase tracking-widest transition-colors">
                                <AlertTriangle className="w-4 h-4"/> Report Blocker
                            </button>
                            <button onClick={() => handleUpdateTaskStatus('Ready for QA')} className="flex flex-1 sm:flex-none items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-5 py-2.5 rounded-lg text-sm font-black uppercase tracking-widest transition-colors">
                                <CheckCircle2 className="w-4 h-4"/> Submit for QA
                            </button>
                        </>
                    )}
                </div>
            </div>
            
            {/* Main Workspace Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 custom-scrollbar">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* SOPs & Directions Card */}
                    <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-inner relative overflow-hidden">
                        <h3 className="text-sm font-black text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2"><MapPin className="w-4 h-4 text-indigo-400" /> Standard Operating Procedure</h3>
                        {task.directions || task.sops ? (
                            <div className="text-zinc-400 bg-zinc-950/50 rounded-xl p-5 border border-zinc-800/50 whitespace-pre-wrap leading-relaxed text-[15px]">
                                {task.directions || task.sops}
                            </div>
                        ) : (
                            <div className="text-zinc-600 bg-zinc-950/50 rounded-xl p-8 border border-zinc-800/50 border-dashed text-center">
                                No SOPs or Tech Directions available for this procedure.
                            </div>
                        )}
                    </div>
                    
                    {/* Required Parts Container */}
                    {task.parts && task.parts.length > 0 && (
                        <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-inner">
                            <h3 className="text-sm font-black text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2"><SearchCode className="w-4 h-4 text-teal-400" /> Required Inventory Parts</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {task.parts.map((p: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center bg-zinc-950 rounded-xl p-3 border border-zinc-800/50 transition-colors hover:border-zinc-700">
                                        <span className="text-zinc-300 font-bold text-sm line-clamp-1 pr-2">{p.name || 'Unknown Part'}</span>
                                        <span className="text-teal-400 font-black px-2.5 py-1 bg-teal-500/10 rounded-lg text-xs shadow-inner shrink-0">{p.quantity}x</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {(task.qaPhotos?.length > 0 || task.qaNotes?.length > 0 || (effectiveStatus === 'Ready for QA' && canQA)) && (
                        <div className="bg-sky-950/20 shadow-[0_0_20px_rgba(56,189,248,0.05)] border border-sky-500/30 rounded-2xl p-6 relative overflow-hidden">
                            <h3 className="text-sm font-black text-sky-400 uppercase tracking-widest flex items-center gap-2 mb-6"><ShieldCheck className="w-5 h-5 text-sky-400" /> QA Inspection Report</h3>
                            
                            {/* QA Photos */}
                            <div className="mb-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-xs font-bold text-sky-300 uppercase tracking-widest flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> QA Photos</h4>
                                    {effectiveStatus === 'Ready for QA' && canQA && (
                                        <div>
                                            <input type="file" id="qaPhotoUpload" multiple accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, true)} disabled={uploadingQAPhotos} />
                                            <label htmlFor="qaPhotoUpload" className={`text-xs bg-sky-900/40 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 px-3 py-1.5 rounded transition-colors font-bold flex items-center gap-1 cursor-pointer ${uploadingQAPhotos ? 'opacity-50 pointer-events-none' : ''}`}>
                                                {uploadingQAPhotos ? <div className="w-3.5 h-3.5 border-2 border-sky-400 border-r-transparent rounded-full animate-spin" /> : <Camera className="w-3.5 h-3.5"/>}
                                                {uploadingQAPhotos ? 'Uploading...' : 'Add QA Photos'}
                                            </label>
                                        </div>
                                    )}
                                </div>
                                {(!task.qaPhotos || task.qaPhotos.length === 0) ? (
                                    <div className="text-sky-500/50 bg-sky-950/20 rounded-xl p-6 border border-sky-500/20 border-dashed text-center text-sm font-medium">
                                        No QA photos.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                        {task.qaPhotos.map((photo: any, i: number) => (
                                            <div key={i} onClick={() => setQaPhotoLightbox(i)} className="aspect-square bg-zinc-950 rounded-xl border border-sky-500/30 overflow-hidden relative group cursor-pointer hover:border-sky-400 transition-colors">
                                                <img src={photo.url} alt="QA Documentation" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none">
                                                    <span className="text-[10px] text-zinc-300 font-bold truncate">{photo.uploadedBy}</span>
                                                    <span className="text-[10px] text-zinc-500">{new Date(photo.uploadedAt).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* QA Notes */}
                            <div>
                                <h4 className="text-xs font-bold text-sky-300 uppercase tracking-widest flex items-center gap-1.5 mb-4"><SearchCode className="w-3.5 h-3.5" /> QA Notes</h4>
                                <div className="space-y-3 mb-4">
                                    {(!task.qaNotes || task.qaNotes.length === 0) ? (
                                        <div className="text-sky-500/50 bg-sky-950/20 rounded-xl p-4 border border-sky-500/20 border-dashed text-center text-sm font-medium">
                                            No QA findings logged.
                                        </div>
                                    ) : (
                                        task.qaNotes.map((note: any, i: number) => (
                                            <div key={i} className="bg-sky-950/30 rounded-xl p-4 border border-sky-500/20">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sky-300 font-bold text-sm">{note.authorName}</span>
                                                    <span className="text-xs text-sky-500/70 font-mono">{new Date(note.time).toLocaleString()}</span>
                                                </div>
                                                <p className="text-sky-100/80 text-sm whitespace-pre-wrap">{note.text}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                                {effectiveStatus === 'Ready for QA' && canQA && (
                                    <div className="bg-sky-950/40 rounded-xl border border-sky-500/30 p-2 flex gap-2">
                                        <textarea 
                                            value={newQANoteText}
                                            onChange={(e) => setNewQANoteText(e.target.value)}
                                            placeholder="Write QA findings, rework instructions, or approval notes..."
                                            className="w-full bg-transparent text-sm text-white placeholder-sky-500/50 resize-none h-12 p-2 focus:outline-none custom-scrollbar"
                                        />
                                        <button 
                                            disabled={!newQANoteText.trim()}
                                            onClick={() => handleSubmitNote(true)}
                                            className="self-end bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/30 disabled:opacity-50 disabled:hover:bg-sky-500/20 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                                        >
                                            Save Note
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Task Photos Container */}
                    <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-inner relative overflow-hidden">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-black text-zinc-300 uppercase tracking-widest flex items-center gap-2"><ImageIcon className="w-4 h-4 text-zinc-400" /> Tech Photos</h3>
                            {effectiveStatus !== 'Ready for QA' && (
                                <div>
                                    <input type="file" id="photoUpload" multiple accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, false)} disabled={uploadingPhotos} />
                                    <label htmlFor="photoUpload" className={`text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50 px-3 py-1.5 rounded transition-colors font-bold flex items-center gap-1 cursor-pointer ${uploadingPhotos ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {uploadingPhotos ? <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-r-transparent rounded-full animate-spin" /> : <Camera className="w-3.5 h-3.5"/>}
                                        {uploadingPhotos ? 'Uploading...' : 'Add Photos'}
                                    </label>
                                </div>
                            )}
                        </div>

                        {(!task.photos || task.photos.length === 0) ? (
                            <div className="text-zinc-600 bg-zinc-950/50 rounded-xl p-8 border border-zinc-800/50 border-dashed text-center text-sm font-medium">
                                No tech documentation photos have been uploaded for this task.
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {task.photos.map((photo: any, i: number) => (
                                    <div key={i} onClick={() => setTechPhotoLightbox(i)} className="aspect-square bg-zinc-950 rounded-xl border border-zinc-800/50 overflow-hidden relative group cursor-pointer hover:border-zinc-500/50 transition-colors">
                                        <img src={photo.url} alt="Task Documentation" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none">
                                            <span className="text-[10px] text-zinc-300 font-bold truncate">{photo.uploadedBy}</span>
                                            <span className="text-[10px] text-zinc-500">{new Date(photo.uploadedAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Tech Notes Log */}
                    <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-inner relative overflow-hidden">
                        <h3 className="text-sm font-black text-zinc-300 uppercase tracking-widest flex items-center gap-2 mb-4"><SearchCode className="w-4 h-4 text-emerald-400" /> Tech Notes</h3>
                        
                        <div className="space-y-3 mb-4">
                            {(!task.techNotes || task.techNotes.length === 0) ? (
                                <div className="text-zinc-600 bg-zinc-950/50 rounded-xl p-6 border border-zinc-800/50 border-dashed text-center text-sm font-medium">
                                    No notes have been logged onto this task yet.
                                </div>
                            ) : (
                                task.techNotes.map((note: any, i: number) => (
                                    <div key={i} className="bg-zinc-950 rounded-xl p-4 border border-zinc-800/50">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-zinc-300 font-bold text-sm">{note.authorName}</span>
                                            <span className="text-xs text-zinc-500 font-mono">{new Date(note.time).toLocaleString()}</span>
                                        </div>
                                        <p className="text-zinc-400 text-sm whitespace-pre-wrap">{note.text}</p>
                                    </div>
                                ))
                            )}
                        </div>

                        {effectiveStatus !== 'Ready for QA' && (
                            <div className="bg-zinc-950 rounded-xl border border-zinc-800/80 p-2 flex gap-2">
                                <textarea 
                                    value={newNoteText}
                                    onChange={(e) => setNewNoteText(e.target.value)}
                                    placeholder="Write a note, finding, or internal memo on this task..."
                                    className="w-full bg-transparent text-sm text-white placeholder-zinc-500 resize-none h-12 p-2 focus:outline-none custom-scrollbar"
                                />
                                <button 
                                    disabled={!newNoteText.trim()}
                                    onClick={() => handleSubmitNote(false)}
                                    className="self-end bg-accent/10 hover:bg-accent/20 text-accent disabled:opacity-50 disabled:hover:bg-accent/10 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                                >
                                    Save Note
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Task Activity Log */}
                    <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-inner">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-black text-zinc-300 uppercase tracking-widest flex items-center gap-2"><Clock className="w-4 h-4 text-emerald-400" /> Task Activity</h3>
                            <button onClick={() => setManualTimeModal({isOpen: true, isDiscovery: false})} className="text-xs bg-zinc-800 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400 px-3 py-1.5 rounded transition-colors font-bold flex items-center gap-1">
                                <PlusCircle className="w-3.5 h-3.5"/> Manual Entry
                            </button>
                        </div>
                        {taskTimeLogs.length === 0 ? (
                            <div className="text-zinc-600 bg-zinc-950/50 rounded-xl p-8 border border-zinc-800/50 border-dashed text-center text-sm font-medium">
                                No time has been logged on this task yet.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {[...taskTimeLogs].sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime()).map((log, i) => (
                                    <div key={i} onClick={() => setEditLogModal({isOpen: true, log})} className="flex justify-between items-center bg-zinc-950 rounded-xl p-3 border border-zinc-800/50 cursor-pointer hover:bg-zinc-900 transition-colors group">
                                        <div className="flex flex-col">
                                            <span className="text-zinc-300 font-bold text-sm flex flex-wrap items-center gap-2">
                                                {log.userId === currentUser?.uid ? 'You' : (log.authorName || 'Another Tech')}
                                                {log.isDiscovery && <span className="bg-amber-500/10 text-amber-500 text-[10px] uppercase font-black px-1.5 py-0.5 rounded">R&D</span>}
                                                {log.manualEntry && <span className="bg-indigo-500/10 text-indigo-400 text-[10px] uppercase font-black px-1.5 py-0.5 rounded">Manual</span>}
                                                {log.needsReview && <span className="bg-pink-500/10 text-pink-400 text-[10px] uppercase font-black px-1.5 py-0.5 rounded">Needs Review</span>}
                                            </span>
                                            <span className="text-zinc-500 text-xs mt-0.5">
                                                {new Date(log.clockIn).toLocaleDateString([], {month: 'numeric', day: 'numeric', year: '2-digit'})} &bull; {new Date(log.clockIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {log.clockOut ? new Date(log.clockOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Active'}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            {log.clockOut ? (
                                                <span className="text-zinc-400 font-mono text-sm">{computeShiftHours(log).toFixed(2)}h</span>
                                            ) : (
                                                <span className="text-accent font-bold text-xs uppercase animate-pulse">Running</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>



            {/* Blocker Modal Inner */}
            {blockerModal && blockerModal.isOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative">
                        <button onClick={() => setBlockerModal(null)} className="absolute top-4 right-4 text-zinc-500 hover:text-white p-3 bg-zinc-950 hover:bg-zinc-800 rounded-full transition-colors z-10">
                            <X className="w-5 h-5"/>
                        </button>
                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500"/> Flag Task as Blocked</h3>
                        <p className="text-sm text-zinc-400 mb-4 font-mono">For task: <span className="text-accent">{task.title}</span></p>
                        
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2 mb-6">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] leading-tight text-red-400 font-medium">Reporting a blocker will automatically pause any active timers and clock you out of this shift.</p>
                        </div>
                        
                        <textarea 
                            value={blockerModal.note}
                            onChange={(e) => setBlockerModal({...blockerModal, note: e.target.value})}
                            placeholder="Why are you blocked? Missing parts? Needs manager approval? Waiting on another tech?"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500 text-white h-32 resize-none mb-4"
                        />
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setBlockerModal(null)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-zinc-400 hover:bg-zinc-800 transition-colors">Cancel</button>
                            <button 
                                onClick={async () => {
                                    await handleUpdateTaskStatus('Blocked', false, blockerModal.note);
                                    setBlockerModal(null);
                                }}
                                disabled={!blockerModal.note.trim()}
                                className="bg-red-500/20 text-red-500 border border-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50 px-5 py-2.5 rounded-lg text-sm font-bold transition-all"
                            >
                                Report Blocker
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manual Time Entry Modal Inner */}
            {manualTimeModal && manualTimeModal.isOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
                        <button onClick={() => setManualTimeModal(null)} className="absolute top-4 right-4 text-zinc-500 hover:text-white p-3 bg-zinc-950 hover:bg-zinc-800 rounded-full transition-colors z-10">
                            <X className="w-5 h-5"/>
                        </button>
                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Clock className="w-5 h-5 text-indigo-400"/> Manual Time Entry</h3>
                        <p className="text-sm text-zinc-400 mb-6 font-mono">For task: <span className="text-accent">{task.title}</span></p>
                        
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Clock In</label>
                                <input 
                                    type="datetime-local" 
                                    defaultValue={new Date(Date.now() - 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                                    id="manualClockIn"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Clock Out</label>
                                <input 
                                    type="datetime-local" 
                                    defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                                    id="manualClockOut"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-white"
                                />
                            </div>
                        </div>

                        <div className="mb-6 flex items-center gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                            <input 
                                type="checkbox"
                                id="isDiscToggle"
                                checked={manualTimeModal.isDiscovery}
                                onChange={(e) => setManualTimeModal({...manualTimeModal, isDiscovery: e.target.checked})}
                                className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900"
                            />
                            <label htmlFor="isDiscToggle" className="text-sm font-bold text-zinc-300">Log as Diagnostics / R&D Time</label>
                        </div>
                        
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setManualTimeModal(null)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-zinc-400 hover:bg-zinc-800 transition-colors">Cancel</button>
                            <button 
                                onClick={submitManualTime}
                                className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 hover:bg-indigo-500 hover:text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all"
                            >
                                Submit for Review
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Edit Log Modal */}
            {editLogModal && editLogModal.isOpen && editLogModal.log && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative">
                        <button onClick={() => setEditLogModal(null)} className="absolute top-4 right-4 text-zinc-500 hover:text-white p-3 bg-zinc-950 hover:bg-zinc-800 rounded-full transition-colors z-10">
                            <X className="w-5 h-5"/>
                        </button>
                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Clock className="w-5 h-5 text-accent"/> Edit Time Log</h3>
                        <p className="text-sm text-zinc-400 mb-6 font-mono">Modifying entry for: <span className="text-accent">{editLogModal.log.authorName || 'Tech'}</span></p>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Clock In</label>
                                <input 
                                    type="datetime-local" 
                                    defaultValue={new Date(new Date(editLogModal.log.clockIn).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                                    id="editClockIn"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Clock Out</label>
                                <input 
                                    type="datetime-local" 
                                    defaultValue={editLogModal.log.clockOut ? new Date(new Date(editLogModal.log.clockOut).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                                    id="editClockOut"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white"
                                />
                                <p className="text-[10px] text-zinc-500 mt-1">Leave blank if still actively running.</p>
                            </div>
                            
                            <label className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 p-4 rounded-xl cursor-pointer hover:border-amber-500/50 transition-colors">
                                <input 
                                    type="checkbox" 
                                    id="editIsDiscovery"
                                    defaultChecked={editLogModal.log.isDiscovery}
                                    className="w-4 h-4 rounded appearance-none border border-zinc-700 bg-zinc-900 checked:bg-amber-500 checked:border-amber-500 relative after:content-[''] after:absolute after:hidden checked:after:block after:left-[5px] after:top-[2px] after:w-1.5 after:h-2.5 after:border-white after:border-r-2 after:border-b-2 after:rotate-45"
                                />
                                <div>
                                    <div className="text-sm font-bold text-amber-500">Diagnostic / R&D Time</div>
                                    <div className="text-[10px] text-zinc-500">Flag this log block as unpredictable exploratory time.</div>
                                </div>
                            </label>
                        </div>
                        
                        <div className="flex justify-between items-center gap-3">
                            <button 
                                onClick={() => handleDeleteLog(editLogModal.log.id)}
                                className="px-4 py-2.5 rounded-lg text-sm font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                            >
                                Delete
                            </button>
                            <div className="flex gap-3">
                                <button onClick={() => setEditLogModal(null)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-zinc-400 hover:bg-zinc-800 transition-colors">Cancel</button>
                                <button 
                                    onClick={() => {
                                        const inStr = (document.getElementById('editClockIn') as HTMLInputElement).value;
                                        const outStr = (document.getElementById('editClockOut') as HTMLInputElement).value;
                                        const isDisc = (document.getElementById('editIsDiscovery') as HTMLInputElement).checked;
                                        const updates: any = { isDiscovery: isDisc };
                                        if (inStr) updates.clockIn = new Date(inStr).toISOString();
                                        if (outStr) {
                                            updates.clockOut = new Date(outStr).toISOString();
                                            updates.status = 'closed';
                                        } else {
                                            updates.clockOut = null;
                                            updates.status = 'open';
                                        }
                                        handleSaveEditLog(editLogModal.log.id, updates);
                                    }}
                                    className="bg-accent/20 text-accent border border-accent hover:bg-accent hover:text-black px-5 py-2.5 rounded-lg text-sm font-bold transition-all"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tech Photo Lightbox */}
            {techPhotoLightbox !== null && task.photos && task.photos[techPhotoLightbox] && (
                <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[100] flex items-center justify-center">
                    <button onClick={() => setTechPhotoLightbox(null)} className="absolute top-6 right-6 text-zinc-500 hover:text-white p-2 bg-zinc-900/50 rounded-full transition-colors z-[110]">
                        <X className="w-6 h-6"/>
                    </button>
                    
                    {task.photos.length > 1 && (
                        <>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setTechPhotoLightbox(techPhotoLightbox === 0 ? task.photos.length - 1 : techPhotoLightbox - 1);
                                }}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-3 bg-black/50 hover:bg-black/80 rounded-full transition-all z-[110]"
                            >
                                <ChevronLeft className="w-8 h-8"/>
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setTechPhotoLightbox(techPhotoLightbox === task.photos.length - 1 ? 0 : techPhotoLightbox + 1);
                                }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-3 bg-black/50 hover:bg-black/80 rounded-full transition-all z-[110]"
                            >
                                <ChevronRight className="w-8 h-8"/>
                            </button>
                        </>
                    )}

                    <div className="relative w-full h-full max-w-5xl mx-auto p-4 flex flex-col items-center justify-center" onClick={() => setTechPhotoLightbox(null)}>
                        <img 
                            src={task.photos[techPhotoLightbox].url} 
                            alt={`Photo ${techPhotoLightbox + 1}`} 
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <div className="mt-6 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="text-white font-bold">{task.photos[techPhotoLightbox].uploadedBy || 'Tech'}</div>
                            <div className="text-zinc-500 text-sm mt-1">{new Date(task.photos[techPhotoLightbox].uploadedAt).toLocaleString()}</div>
                            <div className="text-zinc-600 text-xs mt-2 font-mono flex items-center justify-center gap-2">
                                {task.photos.map((_: any, idx: number) => (
                                    <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === techPhotoLightbox ? 'bg-white' : 'bg-zinc-800'}`} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* QA Photo Lightbox */}
            {qaPhotoLightbox !== null && task.qaPhotos && task.qaPhotos[qaPhotoLightbox] && (
                <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[100] flex items-center justify-center">
                    <button onClick={() => setQaPhotoLightbox(null)} className="absolute top-6 right-6 text-zinc-500 hover:text-white p-2 bg-zinc-900/50 rounded-full transition-colors z-[110]">
                        <X className="w-6 h-6"/>
                    </button>
                    
                    {task.qaPhotos.length > 1 && (
                        <>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setQaPhotoLightbox(qaPhotoLightbox === 0 ? task.qaPhotos.length - 1 : qaPhotoLightbox - 1);
                                }}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-3 bg-black/50 hover:bg-black/80 rounded-full transition-all z-[110]"
                            >
                                <ChevronLeft className="w-8 h-8"/>
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setQaPhotoLightbox(qaPhotoLightbox === task.qaPhotos.length - 1 ? 0 : qaPhotoLightbox + 1);
                                }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-3 bg-black/50 hover:bg-black/80 rounded-full transition-all z-[110]"
                            >
                                <ChevronRight className="w-8 h-8"/>
                            </button>
                        </>
                    )}

                    <div className="relative w-full h-full max-w-5xl mx-auto p-4 flex flex-col items-center justify-center" onClick={() => setQaPhotoLightbox(null)}>
                        <img 
                            src={task.qaPhotos[qaPhotoLightbox].url} 
                            alt={`QA Photo ${qaPhotoLightbox + 1}`} 
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-sky-500/50"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <div className="mt-6 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="text-sky-400 font-bold flex items-center justify-center gap-2">
                                <ShieldCheck className="w-4 h-4"/> {task.qaPhotos[qaPhotoLightbox].uploadedBy || 'QA Inspector'}
                            </div>
                            <div className="text-zinc-500 text-sm mt-1">{new Date(task.qaPhotos[qaPhotoLightbox].uploadedAt).toLocaleString()}</div>
                            <div className="text-zinc-600 text-xs mt-2 font-mono flex items-center justify-center gap-2">
                                {task.qaPhotos.map((_: any, idx: number) => (
                                    <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === qaPhotoLightbox ? 'bg-sky-400' : 'bg-zinc-800'}`} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
