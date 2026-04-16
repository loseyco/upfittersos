import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, collection, query, where, updateDoc, addDoc } from 'firebase/firestore';
import { Play, Square, Loader2, ShieldCheck, ChevronRight, ArrowLeft, Clock, User, Wrench, Camera, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

export function JobExecutionPortal({ jobId, allStaff }: { jobId: string, allStaff?: any[] }) {
    const { tenantId, currentUser } = useAuth();
    const [job, setJob] = useState<any>(null);
    const [openLogs, setOpenLogs] = useState<any[]>([]);
    const [activeTask, setActiveTask] = useState<any>(null);
    const [uploadingMedia, setUploadingMedia] = useState(false);

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
                }
            }
        });
        return () => unsub();
    }, [jobId, tenantId, activeTask]);

    // Subscribe to Time Logs for this specific job
    useEffect(() => {
        if (!jobId || !tenantId) return;
        const q = query(
            collection(db, 'businesses', tenantId, 'task_time_logs'),
            where('jobId', '==', jobId),
            where('status', '==', 'open')
        );
        const unsub = onSnapshot(q, (snap) => {
            setOpenLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length || !job?.id || !activeTask?.title || !tenantId) return;
        
        setUploadingMedia(true);
        try {
            const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
            const storage = getStorage();
            
            const file = e.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const pRef = ref(storage, `job_media/${tenantId}/${job.id}/tasks/${activeTask.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}/${fileName}`);
            
            await uploadBytes(pRef, file);
            const url = await getDownloadURL(pRef);
            
            // Save to task in DB
            const updatedTasks = [...(job.tasks || [])];
            const taskIdx = updatedTasks.findIndex(t => t.title === activeTask.title);
            if (taskIdx > -1) {
                if (!updatedTasks[taskIdx].photos) updatedTasks[taskIdx].photos = [];
                updatedTasks[taskIdx].photos.push({ url, uploadedAt: new Date().toISOString(), uploaderId: currentUser?.uid });
                
                await updateDoc(doc(db, 'jobs', job.id), {
                    tasks: updatedTasks
                });
                
                // Active task updates via onSnapshot
            }
            toast.success("Photo uploaded successfully!");
        } catch (err) {
            console.error("Photo upload failed:", err);
            toast.error("Failed to upload photo.");
        } finally {
            setUploadingMedia(false);
            e.target.value = '';
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
                        
                        {/* Clock Actions */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                            <div>
                                <h2 className="text-lg font-black text-white uppercase tracking-widest mb-1">{myActiveLog ? 'Currently Working' : 'Time Tracking'}</h2>
                                <p className="text-sm text-zinc-500 max-w-sm">{myActiveLog ? 'Your timer is actively logging right now.' : 'Clock into this task to log your hours for payroll and reporting.'}</p>
                            </div>
                            
                            <button
                                onClick={() => handleTaskClockToggle(activeTask, !!myActiveLog, myActiveLog?.id)}
                                className={`shrink-0 flex items-center gap-3 px-8 py-3.5 rounded-xl font-black uppercase tracking-widest transition-all ${myActiveLog ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20' : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 scale-105'}`}
                            >
                                {myActiveLog ? <><Square className="w-5 h-5 fill-current"/> Stop Working</> : <><Play className="w-5 h-5 fill-current"/> Start Task</>}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Media Section */}
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-2">
                                    <h2 className="text-sm font-black text-white uppercase tracking-widest">Task Photos</h2>
                                    <label className={`cursor-pointer w-8 h-8 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center transition-colors ${uploadingMedia ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {uploadingMedia ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
                                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                                    </label>
                                </div>
                                
                                {activeTask.photos && activeTask.photos.length > 0 ? (
                                    <div className="grid grid-cols-3 gap-2">
                                        {activeTask.photos.map((p: any, idx: number) => (
                                            <div key={idx} className="aspect-square bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800 relative group">
                                                <img src={p.url} className="w-full h-full object-cover" alt="Task photo" />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-8 text-zinc-500 border-2 border-dashed border-zinc-800 rounded-xl text-sm">
                                        <Camera className="w-6 h-6 mb-2 opacity-50"/>
                                        <p>No photos attached</p>
                                    </div>
                                )}
                            </div>
                            
                            {/* Parts Section */}
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                                <h2 className="text-sm font-black text-white uppercase tracking-widest mb-4 border-b border-zinc-800 pb-2">Associated Parts</h2>
                                <div className="flex flex-col items-center justify-center p-8 text-zinc-500 border-2 border-dashed border-zinc-800 rounded-xl text-sm">
                                    <Wrench className="w-6 h-6 mb-2 opacity-50"/>
                                    <p>No parts tracked.</p>
                                </div>
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
