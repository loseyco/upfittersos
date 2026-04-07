import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { Clock, FileText, ArrowLeft, Play, ScanLine, Activity } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { usePermissions } from '../../hooks/usePermissions';
import { Scanner } from '@yudiel/react-qr-scanner';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, where } from 'firebase/firestore';

const LiveDuration = ({ startTime }: { startTime: string }) => {
    const [elapsed, setElapsed] = useState('');

    useEffect(() => {
        const update = () => {
            const diff = Math.max(0, Date.now() - new Date(startTime).getTime());
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            setElapsed(`${h}h ${m}m`);
        };
        update();
        const interval = setInterval(update, 60000);
        return () => clearInterval(interval);
    }, [startTime]);

    return <span>{elapsed}</span>;
};

const toLocalISOString = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const tzOffsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
};

export function TimeClockApp() {
    const { currentUser, tenantId } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<'clock' | 'timesheet' | 'requests'>('clock');
    
    // Clock State
    const [activeLog, setActiveLog] = useState<any>(null);
    const [loadingClock, setLoadingClock] = useState(true);
    
    // Timesheet State
    const [timeLogs, setTimeLogs] = useState<any[]>([]);
    
    // Request State
    const [requests, setRequests] = useState<any[]>([]);
    const [requestForm, setRequestForm] = useState({ type: 'pto', date: '', reason: '', requestedClockIn: '', requestedClockOut: '', targetLogId: '' });
    const [submittingRequest, setSubmittingRequest] = useState(false);

    // Shift Notes State
    const [noteInput, setNoteInput] = useState('');
    const [isAddingNote, setIsAddingNote] = useState(false);
    
    // Assigned Tasks State
    const [myAssignedTasks, setMyAssignedTasks] = useState<any[]>([]);
    const [selectedTaskNote, setSelectedTaskNote] = useState('');
    const [taskSearchQuery, setTaskSearchQuery] = useState('');
    const [isTaskDropdownOpen, setIsTaskDropdownOpen] = useState(false);
    const [logDisplayLimit, setLogDisplayLimit] = useState(10);
    const [showScrollTop, setShowScrollTop] = useState(false);

    // Removed Reference Data State since it's mapped directly inside the hook

    // Kiosk Security
    const { checkPermission } = usePermissions();
    const canRemotePunch = checkPermission('bypass_kiosk_timeclock');
    const [isScanning, setIsScanning] = useState(false);
    const [targetAction, setTargetAction] = useState<{action: string, breakType?: 'paid'|'unpaid'} | null>(null);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL' || !currentUser?.uid) return;
        
        setLoadingClock(true);
        const unsubLogs = onSnapshot(
            query(collection(db, 'businesses', tenantId, 'time_logs')),
            (snap) => {
                let logs: any[] = snap.docs.map(d => ({id: d.id, ...d.data()}));
                logs = logs.filter(l => l.userId === currentUser.uid);
                logs.sort((a, b) => new Date(b.clockIn || 0).getTime() - new Date(a.clockIn || 0).getTime());
                
                const openLogs = logs.filter(l => l.status === 'open');
                setActiveLog(openLogs.length > 0 ? openLogs[0] : null);
                setTimeLogs(logs);
                setLoadingClock(false);
            },
            (err) => {
                console.error(err);
                setLoadingClock(false);
            }
        );

        let unsubRequests = () => {};
        if (activeTab === 'requests') {
            unsubRequests = onSnapshot(
                collection(db, 'businesses', tenantId, 'time_off_requests'),
                (snap) => {
                    let reqs: any[] = snap.docs.map(d => ({id: d.id, ...d.data()}));
                    reqs = reqs.filter(r => r.userId === currentUser.uid);
                    reqs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                    setRequests(reqs);
                },
                (err) => console.error(err)
            );
        }

        let unsubCustomers = () => {};
        let unsubVehicles = () => {};

        const unsubJobs = onSnapshot(query(collection(db, 'jobs'), where('tenantId', '==', tenantId)), (snap) => {
            const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            unsubVehicles();
            unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('tenantId', '==', tenantId)), (vSnap) => {
                const fetchedVehicles = vSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
                
                unsubCustomers();
                unsubCustomers = onSnapshot(query(collection(db, 'customers'), where('tenantId', '==', tenantId)), (cSnap) => {
                    const fetchedCustomers = cSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

                    const myTasks: any[] = [];
                    fetched.filter((j: any) => !j.archived).forEach((j: any) => {
                        if (!j.tasks) return;
                        j.tasks.forEach((t: any, idx: number) => {
                            if (t.status !== 'Finished' && t.assignedUids?.includes(currentUser.uid)) {
                                const matchedVehicle = fetchedVehicles.find(v => v.id === j.vehicleId);
                                const vehStr = matchedVehicle ? `${matchedVehicle.year||''} ${matchedVehicle.make||''} ${matchedVehicle.model||''} ${matchedVehicle.vin||''}`.trim() : 'Vehicle';
                                
                                const matchedCustomer = fetchedCustomers.find(c => c.id === j.customerId);
                                const custStr = matchedCustomer ? `${matchedCustomer.firstName||''} ${matchedCustomer.lastName||''} ${matchedCustomer.company||''}`.trim() : '';

                                myTasks.push({
                                    jobId: j.id,
                                    jobTitle: j.title || 'Untitled Job',
                                    taskTitle: t.title,
                                    taskIndex: idx,
                                    bookTime: t.bookTime || 0,
                                    vehicleName: vehStr,
                                    customerName: custStr,
                                    isApproved: t.isApproved
                                });
                            }
                        });
                    });
                    setMyAssignedTasks(myTasks);
                });
            });
        });

        return () => {
            unsubLogs();
            unsubRequests();
            unsubJobs();
            unsubVehicles();
            unsubCustomers();
        };
    }, [tenantId, activeTab, currentUser?.uid]);

    // Infinite Scroll and Scroll to Top listener
    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 300) {
                setShowScrollTop(true);
            } else {
                setShowScrollTop(false);
            }

            // Lazy load more history items when scrolling near the bottom of the page
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 250) {
                setLogDisplayLimit(prev => prev + 10);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [activeLog]);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleClockAction = async (action: 'clock_in' | 'clock_out' | 'start_break' | 'end_break', breakType: 'unpaid' | 'paid' = 'unpaid') => {
        try {
            toast.loading("Processing punch...", { id: 'clock_action' });
            
            const now = new Date().toISOString();
            
            const { getDocs, updateDoc, doc, collection, query, where } = await import('firebase/firestore');
            const qTaskOpen = query(collection(db, 'businesses', tenantId as string, 'task_time_logs'), where('userId', '==', currentUser?.uid || ''), where('status', '==', 'open'));
            const openTasksSnap = await getDocs(qTaskOpen);

            if (action === 'clock_in') {
                await api.post(`/businesses/${tenantId}/time_logs`, {
                    userId: currentUser?.uid,
                    clockIn: now,
                    status: 'open',
                    breaks: []
                });
            } else if (action === 'clock_out' && activeLog) {
                await api.put(`/businesses/${tenantId}/time_logs/${activeLog.id}`, {
                    clockOut: now,
                    status: 'closed'
                });
                
                // Automatically clock out of active sub-tasks
                for (const activeTask of openTasksSnap.docs) {
                    await updateDoc(doc(db, 'businesses', tenantId as string, 'task_time_logs', activeTask.id), {
                        clockOut: now,
                        status: 'closed'
                    });
                }
            } else if (action === 'start_break' && activeLog) {
                const breaks = activeLog.breaks || [];
                breaks.push({ start: now, end: null, type: breakType });
                await api.put(`/businesses/${tenantId}/time_logs/${activeLog.id}`, { breaks });
                
                // Automatically pause active sub-tasks
                for (const activeTask of openTasksSnap.docs) {
                    const tData = activeTask.data();
                    const tBreaks = tData.breaks || [];
                    tBreaks.push({ start: now, end: null, type: breakType });
                    await updateDoc(doc(db, 'businesses', tenantId as string, 'task_time_logs', activeTask.id), { breaks: tBreaks });
                }
            } else if (action === 'end_break' && activeLog) {
                const breaks = activeLog.breaks || [];
                if (breaks.length > 0) {
                    breaks[breaks.length - 1].end = now;
                    await api.put(`/businesses/${tenantId}/time_logs/${activeLog.id}`, { breaks });
                }
                
                // Automatically resume active sub-tasks
                for (const activeTask of openTasksSnap.docs) {
                    const tData = activeTask.data();
                    const tBreaks = tData.breaks || [];
                    if (tBreaks.length > 0) {
                        tBreaks[tBreaks.length - 1].end = now;
                        await updateDoc(doc(db, 'businesses', tenantId as string, 'task_time_logs', activeTask.id), { breaks: tBreaks });
                    }
                }
            }

            toast.success("Time recorded successfully.", { id: 'clock_action' });
            window.dispatchEvent(new Event('time_punch_updated'));
        } catch (err) {
            console.error(err);
            toast.error("Failed to record time.", { id: 'clock_action' });
        }
    };

    const handleAddNote = async (overrideText?: string) => {
        const textToSave = overrideText || noteInput.trim();
        if (!textToSave || !activeLog) return;
        try {
            setIsAddingNote(true);
            const newNote = {
                text: textToSave,
                time: new Date().toISOString()
            };
            const updatedNotes = [...(activeLog.notes || []), newNote];
            await api.put(`/businesses/${tenantId}/time_logs/${activeLog.id}`, { notes: updatedNotes });
            setNoteInput('');
            toast.success("Note added successfully");
        } catch (e) {
            console.error(e);
            toast.error("Failed to add note");
        } finally {
            setIsAddingNote(false);
        }
    };

    const handleSwitchTask = async (taskStr: string) => {
        try {
            setIsAddingNote(true);
            const { getDocs, addDoc, updateDoc, doc, collection, query, where } = await import('firebase/firestore');
            const now = new Date().toISOString();
            
            const tInfo = JSON.parse(taskStr);
            
            const qTaskOpen = query(collection(db, 'businesses', tenantId as string, 'task_time_logs'), where('userId', '==', currentUser?.uid), where('status', '==', 'open'));
            const openTasksSnap = await getDocs(qTaskOpen);
            
            for (const activeDoc of openTasksSnap.docs) {
                await updateDoc(doc(db, 'businesses', tenantId as string, 'task_time_logs', activeDoc.id), {
                    clockOut: now,
                    status: 'closed'
                });
            }

            await addDoc(collection(db, 'businesses', tenantId as string, 'task_time_logs'), {
                userId: currentUser?.uid,
                jobId: tInfo.jobId,
                taskIndex: tInfo.taskIndex,
                taskName: tInfo.taskTitle,
                vehicleName: tInfo.vehicleName,
                bookTime: tInfo.bookTime,
                clockIn: now,
                clockOut: null,
                status: 'open'
            });

            if (activeLog) {
                const newNote = {
                    text: `Started Task: ${tInfo.taskTitle} - ${tInfo.jobTitle}`,
                    time: now
                };
                const updatedNotes = [...(activeLog.notes || []), newNote];
                await api.put(`/businesses/${tenantId}/time_logs/${activeLog.id}`, { notes: updatedNotes });
            }

            setSelectedTaskNote('');
            toast.success("Switched Task successfully");
            window.dispatchEvent(new Event('time_punch_updated'));
        } catch (e) {
            console.error(e);
            toast.error("Failed to switch task");
        } finally {
            setIsAddingNote(false);
        }
    };

    const getValidKioskToken = () => {
        const kioskToken = searchParams.get('kiosk');
        if (!kioskToken) return null;
        try {
            const decoded = atob(kioskToken);
            const parts = decoded.split(':');
            if (parts[0] !== 'SAE_KIOSK_OTP' || parts[1] !== tenantId) return null;
            
            const timestamp = parseInt(parts[2], 10);
            const ageInSeconds = (Date.now() - timestamp) / 1000;
            
            if (ageInSeconds > 60 || ageInSeconds < -5) return null; // expired
            return decoded;
        } catch {
            return null;
        }
    };

    const handleLogEdit = (n: any) => {
        setActiveTab('requests');
        setRequestForm({
            type: 'missed_punch',
            date: new Date(n.time).toISOString().split('T')[0],
            reason: `Edit shift log: "${n.text}"`,
            requestedClockIn: '',
            requestedClockOut: '',
            targetLogId: activeLog?.id || ''
        });
    };

    const handleInitiatePunch = (action: string, breakType: 'unpaid'|'paid' = 'unpaid') => {
        if (canRemotePunch) {
            handleClockAction(action as any, breakType);
            return;
        }

        const preloadedToken = getValidKioskToken();
        if (preloadedToken) {
            // We have a live, valid token pre-scanned via URL deep link!
            handleClockAction(action as any, breakType);
            // Wipe the token from the URL so it can't be reused for another action later if they refresh
            setSearchParams(prev => { prev.delete('kiosk'); return prev; }, { replace: true });
        } else {
            // Fall back to opening the in-app scanner 
            setTargetAction({ action, breakType });
            setIsScanning(true);
        }
    };

    const handleKioskScan = (rawValue: string) => {
        setIsScanning(false);
        try {
            let tokenToVerify = rawValue;
            
            // If the scanned value is a URL (from our deep link), extract the token!
            if (rawValue.includes('?kiosk=')) {
                try {
                    const url = new URL(rawValue);
                    const kioskParam = url.searchParams.get('kiosk');
                    if (kioskParam) {
                        tokenToVerify = atob(kioskParam);
                    }
                } catch {
                    // Ignore URL parse error and fall through
                }
            } else if (!rawValue.startsWith('SAE_KIOSK_OTP')) {
                // Try decoding just in case it's raw base64 (legacy fallback)
                try {
                    tokenToVerify = atob(rawValue);
                } catch {
                    tokenToVerify = rawValue;
                }
            }

            const parts = tokenToVerify.split(':');
            if (parts[0] !== 'SAE_KIOSK_OTP' || parts[1] !== tenantId) {
                toast.error("Invalid Station QR Code.");
                setTargetAction(null);
                return;
            }
            
            const timestamp = parseInt(parts[2], 10);
            const ageInSeconds = (Date.now() - timestamp) / 1000;
            
            // Ensure token was generated in the last 60 seconds (allows minor clock drift margin)
            if (ageInSeconds > 60 || ageInSeconds < -5) {
                toast.error("QR Code expired. Please rescan the live kiosk screen.");
                setTargetAction(null);
                return;
            }

            handleClockAction(targetAction?.action as any, targetAction?.breakType);
            setTargetAction(null);
        } catch (e) {
            toast.error("Failed to read Kiosk secure code.");
            setTargetAction(null);
        }
    };

    const handleSubmitRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSubmittingRequest(true);
            await api.post(`/businesses/${tenantId}/time_off_requests`, {
                userId: currentUser?.uid,
                type: requestForm.type,
                date: requestForm.date,
                reason: requestForm.reason,
                requestedClockIn: requestForm.requestedClockIn ? new Date(requestForm.requestedClockIn).toISOString() : '',
                requestedClockOut: requestForm.requestedClockOut ? new Date(requestForm.requestedClockOut).toISOString() : '',
                targetLogId: requestForm.targetLogId,
                status: 'pending',
                createdAt: new Date().toISOString()
            });
            toast.success("Request submitted.");
            setRequestForm({ type: 'pto', date: '', reason: '', requestedClockIn: '', requestedClockOut: '', targetLogId: '' });
        } catch (err) {
            toast.error("Failed to submit request.");
        } finally {
            setSubmittingRequest(false);
        }
    };

    // Determine current state of the active log
    const onBreak = activeLog?.breaks?.length > 0 && !activeLog.breaks[activeLog.breaks.length - 1].end;

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col">
            <div className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 pb-6">
                    <div className="flex items-center gap-4">
                        <Link to="/workspace" className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Clock className="w-4 h-4 text-blue-400" />
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Workspace Application</span>
                            </div>
                            <h1 className="text-3xl font-black text-white">Time & Attendance</h1>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-2 p-1 bg-zinc-900/50 border border-zinc-800 rounded-xl max-w-fit">
                    {[
                        { id: 'clock', label: 'Clock' },
                        { id: 'timesheet', label: 'Timesheet' },
                        { id: 'requests', label: 'PTO & Requests' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`px-6 py-2.5 rounded-lg text-sm font-bold capitalize transition-all ${activeTab === tab.id ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-3xl p-6 md:p-10 backdrop-blur-md">
                    
                    {/* Timeclock Tab */}
                    {activeTab === 'clock' && (
                        <div className="flex flex-col py-4 w-full">
                            {loadingClock ? (
                                <div className="animate-pulse bg-zinc-800 h-16 w-64 rounded-2xl mx-auto"></div>
                            ) : isScanning ? (
                                <div className="w-full max-w-sm mx-auto aspect-square rounded-2xl overflow-hidden border-2 border-accent relative shadow-[0_0_50px_rgba(255,255,255,0.05)]">
                                    <div className="absolute top-4 left-0 right-0 z-10 flex justify-center pointer-events-none">
                                        <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-white font-bold text-sm tracking-widest uppercase">
                                            Scan Tablet Screen
                                        </div>
                                    </div>
                                    <Scanner
                                        onScan={(detected: any[]) => {
                                            if (detected.length > 0 && detected[0].rawValue) {
                                                handleKioskScan(detected[0].rawValue);
                                            }
                                        }}
                                        onError={(err) => console.log(err)}
                                    />
                                    <button 
                                        onClick={() => {
                                            setIsScanning(false);
                                            setTargetAction(null);
                                        }}
                                        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-700 px-6 py-2 rounded-xl text-white font-bold hover:bg-zinc-800 transition-colors"
                                    >
                                        Cancel Scan
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                                    {!activeLog ? (
                                        <button 
                                            onClick={() => handleInitiatePunch('clock_in')}
                                            className={`md:col-span-2 flex items-center justify-center gap-3 text-white px-8 py-5 rounded-2xl font-black text-xl transition-all hover:scale-105 active:scale-95 shadow-xl ${canRemotePunch ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20'}`}
                                        >
                                            {!canRemotePunch ? <><ScanLine className="w-6 h-6" /> Scan Kiosk to Clock In</> : <><Play className="w-6 h-6" /> Remote Clock In</>}
                                        </button>
                                    ) : (
                                        <>
                                            {!onBreak ? (
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => handleInitiatePunch('start_break', 'unpaid')}
                                                        className="flex-1 flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/50 text-amber-500 px-2 py-4 rounded-2xl font-bold text-sm transition-all"
                                                    >
                                                        {!canRemotePunch && <ScanLine className="w-4 h-4" />} Unpaid Break (Lunch)
                                                    </button>
                                                    <button 
                                                        onClick={() => handleInitiatePunch('start_break', 'paid')}
                                                        className="flex-1 flex items-center justify-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/50 text-blue-500 px-2 py-4 rounded-2xl font-bold text-sm transition-all"
                                                    >
                                                        {!canRemotePunch && <ScanLine className="w-4 h-4" />} Paid Rest Break
                                                    </button>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => handleInitiatePunch('end_break')}
                                                    className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 border border-amber-400 text-white px-6 py-4 rounded-2xl font-bold text-lg transition-all shadow-lg shadow-amber-500/20"
                                                >
                                                    {!canRemotePunch && <ScanLine className="w-4 h-4" />} Return
                                                </button>
                                            )}

                                            <button 
                                                onClick={() => handleInitiatePunch('clock_out')}
                                                disabled={onBreak}
                                                className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-6 py-4 rounded-2xl font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {!canRemotePunch && !onBreak && <ScanLine className="w-4 h-4" />} Clock Out
                                            </button>
                                            
                                            <div className="md:col-span-2 mt-6 text-sm font-bold text-zinc-500 flex flex-col items-center gap-1">
                                                <span>Active Shift Started at: {new Date(activeLog.clockIn).toLocaleTimeString()}</span>
                                                {canRemotePunch && <span className="text-emerald-500 text-[10px] uppercase tracking-widest flex items-center gap-1"><Play className="w-3 h-3" /> Remote Override Authorized</span>}
                                            </div>

                                            {/* Notes / Tasks Section */}
                                            <div className="md:col-span-2 mt-8 text-left w-full border-t border-zinc-800/50 pt-8">
                                                <h3 className="text-white font-bold mb-4 flex items-center gap-2"><FileText className="w-4 h-4"/> Shift Notes & Tasks</h3>
                                                
                                                {/* Combined Activity / Task selection block */}
                                                {(() => {
                                                    const activeNoteRecord = activeLog.notes && activeLog.notes.length > 0 && !activeLog.notes[activeLog.notes.length - 1].text.startsWith('Finished Task:') ? activeLog.notes[activeLog.notes.length - 1] : null;
                                                    const activeNoteText = activeNoteRecord?.text || '';
                                                    
                                                    return (
                                                        <div className="flex flex-col gap-3 mb-6 bg-emerald-500/10 border border-emerald-500/20 p-4 pt-3 rounded-xl shadow-inner">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
                                                                    <Activity className="w-3 h-3" /> Current Activity Dashboard
                                                                </div>
                                                                {activeNoteRecord && (
                                                                    <div className="text-emerald-400 font-mono font-bold text-xs bg-emerald-500/20 px-2 py-0.5 rounded shadow-sm border border-emerald-500/20">
                                                                        <LiveDuration startTime={activeNoteRecord.time} />
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {myAssignedTasks.length > 0 ? (
                                                                <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                                                                    <div className="relative flex-1 w-full sm:w-auto">
                                                                        <div 
                                                                            onClick={() => setIsTaskDropdownOpen(!isTaskDropdownOpen)}
                                                                            className="w-full bg-zinc-900/80 border border-emerald-500/30 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-emerald-50 font-bold hover:border-emerald-500/50 transition-colors cursor-pointer flex justify-between items-center"
                                                                        >
                                                                            <span className="truncate">
                                                                                {selectedTaskNote && selectedTaskNote !== 'OTHER' 
                                                                                    ? (() => { try { const p = JSON.parse(selectedTaskNote); return `${p.jobTitle} → ${p.taskTitle}`; } catch { return 'Selected'; } })() 
                                                                                    : selectedTaskNote === 'OTHER' ? 'Other (Manual Note)' : (activeNoteText || "Idle / Off Task (Select an activity)")}
                                                                            </span>
                                                                            <svg className={`shrink-0 w-3 h-3 ml-2 transition-transform ${isTaskDropdownOpen ? 'rotate-180 text-emerald-400' : 'text-emerald-500'}`} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                                                                        </div>
                                                                        
                                                                        {isTaskDropdownOpen && (
                                                                            <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-800 border border-zinc-700/80 rounded-lg shadow-2xl z-50 overflow-hidden flex flex-col max-h-[350px]">
                                                                                <div className="p-2 border-b border-zinc-700/50 shrink-0 sticky top-0 bg-zinc-800">
                                                                                    <div className="relative">
                                                                                        <input 
                                                                                            type="text" 
                                                                                            autoFocus
                                                                                            placeholder="Type to filter tasks, VIN, customer..." 
                                                                                            value={taskSearchQuery}
                                                                                            onChange={(e) => setTaskSearchQuery(e.target.value)}
                                                                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-md py-2.5 pl-3 pr-8 text-sm text-white focus:outline-none focus:border-emerald-500 placeholder:text-zinc-500 focus:ring-1 focus:ring-emerald-500/50"
                                                                                        />
                                                                                        {taskSearchQuery && (
                                                                                            <button onClick={() => setTaskSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-white">
                                                                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="overflow-y-auto p-1 py-1 space-y-0.5 custom-scrollbar">
                                                                                    {taskSearchQuery.trim() === '' && (
                                                                                        <div 
                                                                                            onClick={() => { setSelectedTaskNote('OTHER'); setIsTaskDropdownOpen(false); setTaskSearchQuery(''); }}
                                                                                            className="px-3 py-2.5 rounded hover:bg-emerald-500/10 hover:text-white text-sm text-zinc-300 cursor-pointer transition-colors"
                                                                                        >
                                                                                            Other (Manual Note)
                                                                                        </div>
                                                                                    )}
                                                                                    
                                                                                    <div className="px-3 pt-3 pb-1 text-[11px] font-bold text-zinc-400">Assigned Tasks</div>
                                                                                    {myAssignedTasks.filter(t => {
                                                                                        if (!taskSearchQuery) return true;
                                                                                        const searchStr = `${t.jobTitle} ${t.taskTitle} ${t.vehicleName} ${t.customerName}`.toLowerCase();
                                                                                        return searchStr.includes(taskSearchQuery.toLowerCase());
                                                                                    }).map((t, idx) => (
                                                                                        <div 
                                                                                            key={idx}
                                                                                            onClick={() => {
                                                                                                if (t.isApproved !== false) {
                                                                                                    setSelectedTaskNote(JSON.stringify(t));
                                                                                                    setIsTaskDropdownOpen(false);
                                                                                                    setTaskSearchQuery('');
                                                                                                }
                                                                                            }}
                                                                                            className={`px-3 py-2.5 rounded text-sm flex flex-col gap-0.5 transition-colors ${t.isApproved === false ? 'opacity-50 cursor-not-allowed bg-zinc-900/30' : 'cursor-pointer hover:bg-emerald-500/10 text-white hover:text-emerald-400'}`}
                                                                                        >
                                                                                            <div className="flex items-center gap-1.5 font-medium">
                                                                                                {t.isApproved === false && <span className="text-[10px] bg-amber-500/20 text-amber-500 px-1 py-0.5 rounded uppercase font-black">Pending</span>}
                                                                                                <span className={t.isApproved === false ? 'text-zinc-500' : ''}>{t.jobTitle} &rarr; {t.taskTitle}</span>
                                                                                            </div>
                                                                                            <div className="text-[10px] text-zinc-500 flex items-center gap-2">
                                                                                                {t.customerName && <span>{t.customerName}</span>}
                                                                                                {t.customerName && t.vehicleName && <span className="opacity-50">•</span>}
                                                                                                {t.vehicleName && <span>{t.vehicleName}</span>}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                    {myAssignedTasks.filter(t => {
                                                                                        if (!taskSearchQuery) return true;
                                                                                        const searchStr = `${t.jobTitle} ${t.taskTitle} ${t.vehicleName} ${t.customerName}`.toLowerCase();
                                                                                        return searchStr.includes(taskSearchQuery.toLowerCase());
                                                                                    }).length === 0 && (
                                                                                        <div className="px-3 py-4 text-center text-sm text-zinc-500 italic">No tasks match "{taskSearchQuery}"</div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    {(() => {
                                                                        let isAlreadyActive = false;
                                                                        if (selectedTaskNote && selectedTaskNote !== 'OTHER') {
                                                                            try {
                                                                                const parsed = JSON.parse(selectedTaskNote);
                                                                                isAlreadyActive = activeNoteText.includes(parsed.taskTitle) && activeNoteText.includes(parsed.jobTitle);
                                                                            } catch {}
                                                                        }
                                                                        
                                                                        if (isAlreadyActive) {
                                                                            return (
                                                                                <div className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 px-4 py-3 rounded-lg text-sm font-bold shrink-0 whitespace-nowrap cursor-not-allowed hidden sm:block">
                                                                                    Already Active
                                                                                </div>
                                                                            );
                                                                        }

                                                                        return selectedTaskNote && selectedTaskNote !== 'OTHER' && (
                                                                            <button 
                                                                                onClick={() => handleSwitchTask(selectedTaskNote)}
                                                                                disabled={isAddingNote}
                                                                                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-3 rounded-lg text-sm font-bold transition-colors shrink-0 whitespace-nowrap shadow-lg shadow-emerald-500/20 w-full sm:w-auto"
                                                                            >
                                                                                Switch to Selected
                                                                            </button>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            ) : (
                                                                <div className="text-emerald-500/70 text-sm italic">No active tasks assigned to you.</div>
                                                            )}

                                                            {(!myAssignedTasks.length || selectedTaskNote === 'OTHER') && (
                                                                <div className="flex gap-2 mt-2">
                                                                    <input 
                                                                        type="text"
                                                                        value={noteInput}
                                                                        onChange={(e) => setNoteInput(e.target.value)}
                                                                        placeholder={activeNoteText ? "Type new note..." : "What are you doing now?"}
                                                                        className="flex-1 bg-zinc-900 border border-emerald-500/30 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-white"
                                                                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote() }}
                                                                    />
                                                                    <button 
                                                                        onClick={() => handleAddNote()}
                                                                        disabled={isAddingNote || !noteInput.trim()}
                                                                        className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg text-sm font-bold transition-colors shrink-0 whitespace-nowrap border border-zinc-700"
                                                                    >
                                                                        Switch / Log Activity
                                                                    </button>
                                                                </div>
                                                            )}
                                                            
                                                            <Link 
                                                                to="/business/tech"
                                                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center whitespace-nowrap shadow-lg shadow-emerald-500/20 w-full mt-2"
                                                            >
                                                                Open Staff Job Portal (Manage Tasks)
                                                            </Link>
                                                        </div>
                                                    )
                                                })()}

                                                {/* History Log view */}
                                                {(() => {
                                                    const events: any[] = [];
                                                    if (activeLog.clockIn) events.push({ time: activeLog.clockIn, text: 'Shift Started', type: 'system' });
                                                    if (activeLog.clockOut) events.push({ time: activeLog.clockOut, text: 'Shift Ended', type: 'system' });
                                                    if (activeLog.breaks) {
                                                        activeLog.breaks.forEach((b: any) => {
                                                            if (b.start) events.push({ time: b.start, text: `Started ${b.type === 'paid' ? 'Paid Rest' : 'Unpaid Meal'} Break`, type: 'system' });
                                                            if (b.end) events.push({ time: b.end, text: `Ended ${b.type === 'paid' ? 'Paid Rest' : 'Unpaid Meal'} Break`, type: 'system' });
                                                        });
                                                    }
                                                    if (activeLog.notes) {
                                                        activeLog.notes.forEach((n: any) => {
                                                            events.push({ time: n.time, text: n.text, type: 'note', raw: n });
                                                        });
                                                    }
                                                    events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
                                                    
                                                    return (
                                                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
                                                            {events.length === 0 ? (
                                                                <div className="text-zinc-500 text-sm italic">No shift logs yet.</div>
                                                            ) : (
                                                                <div className="space-y-1">
                                                                    {events.reverse().slice(0, logDisplayLimit).map((ev: any, idx: number) => (
                                                                        <div 
                                                                            key={idx} 
                                                                            onClick={() => ev.type === 'note' && ev.raw ? handleLogEdit(ev.raw) : null}
                                                                            className={`group flex gap-3 text-sm p-2 rounded-lg transition-colors items-center ${ev.type === 'note' ? 'hover:bg-zinc-800/50 cursor-pointer' : ''}`}
                                                                        >
                                                                            <div className="text-zinc-500 font-mono shrink-0">{new Date(ev.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                                            <div className={`flex-1 px-3 py-1.5 rounded-lg border flex items-center ${ev.type === 'note' ? 'text-zinc-300 bg-zinc-800/50 border-zinc-700/50' : 'text-blue-400 bg-blue-500/10 border-blue-500/20 font-bold text-xs uppercase tracking-widest'}`}>
                                                                                {ev.text}
                                                                            </div>
                                                                            {ev.type === 'note' && <div className="text-xs text-accent font-bold opacity-0 group-hover:opacity-100 pr-2">Request Edit</div>}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Timesheet Tab */}
                    {activeTab === 'timesheet' && (
                        <div>
                            <h2 className="text-xl font-bold text-white mb-6">Recent Timesheets</h2>
                            {timeLogs.length === 0 ? (
                                <div className="text-center py-12 text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-2xl">
                                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    No logged time found.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {timeLogs.map((log: any) => (
                                        <div key={log.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
                                            <div>
                                                <div className="font-bold text-white mb-1">{new Date(log.clockIn).toLocaleDateString()}</div>
                                                <div className="text-xs text-zinc-500">
                                                    In: {new Date(log.clockIn).toLocaleTimeString()} {log.clockOut ? `— Out: ${new Date(log.clockOut).toLocaleTimeString()}` : ' (Active)'}
                                                </div>
                                            </div>
                                            <div className="mt-3 md:mt-0 flex gap-2">
                                                <button 
                                                    onClick={() => {
                                                        setActiveTab('requests');
                                                        setRequestForm(prev => ({
                                                            ...prev, 
                                                            type: 'missed_punch', 
                                                            date: new Date(log.clockIn).toISOString().split('T')[0], 
                                                            reason: `Requesting to edit timesheet on ${new Date(log.clockIn).toLocaleDateString()}:\n\n`,
                                                            targetLogId: log.id,
                                                            requestedClockIn: toLocalISOString(log.clockIn),
                                                            requestedClockOut: toLocalISOString(log.clockOut)
                                                        }));
                                                    }} 
                                                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-3 py-1 rounded-full text-xs font-bold transition-colors border border-zinc-700"
                                                >
                                                    Request Edit
                                                </button>
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${log.status === 'closed' ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
                                                    {log.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Time Off Tab */}
                    {activeTab === 'requests' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                            <div>
                                <h2 className="text-xl font-bold text-white mb-6">Requests</h2>
                                <form onSubmit={handleSubmitRequest} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Request Type</label>
                                        <select 
                                            value={requestForm.type}
                                            onChange={(e) => setRequestForm({...requestForm, type: e.target.value})}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 text-white"
                                            required
                                        >
                                            <option value="pto">Paid Time Off (PTO)</option>
                                            <option value="sick">Sick Leave</option>
                                            <option value="late">Late Notice</option>
                                            <option value="unpaid">Unpaid Leave</option>
                                            <option value="missed_punch">Missed Punch / Fix Timesheet</option>
                                        </select>
                                    </div>
                                    {requestForm.type !== 'missed_punch' && (
                                        <div>
                                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Date</label>
                                            <input 
                                                type="date"
                                                value={requestForm.date}
                                                onChange={(e) => setRequestForm({...requestForm, date: e.target.value})}
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 text-white [color-scheme:dark]"
                                                required={requestForm.type !== 'missed_punch'}
                                            />
                                        </div>
                                    )}
                                    {requestForm.type === 'missed_punch' && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Requested Clock In</label>
                                                <input 
                                                    type="datetime-local"
                                                    value={requestForm.requestedClockIn}
                                                    onChange={(e) => setRequestForm({...requestForm, requestedClockIn: e.target.value})}
                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 text-white [color-scheme:dark]"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Requested Clock Out</label>
                                                <input 
                                                    type="datetime-local"
                                                    value={requestForm.requestedClockOut}
                                                    onChange={(e) => setRequestForm({...requestForm, requestedClockOut: e.target.value})}
                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 text-white [color-scheme:dark]"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Reason</label>
                                        <textarea 
                                            value={requestForm.reason}
                                            onChange={(e) => setRequestForm({...requestForm, reason: e.target.value})}
                                            placeholder={requestForm.type === 'missed_punch' ? "Please specify your actual clock in and clock out times..." : "Provide details about your request..."}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 text-white min-h-[100px]"
                                            required
                                        ></textarea>
                                    </div>
                                    <button 
                                        type="submit"
                                        disabled={submittingRequest}
                                        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-colors disabled:opacity-50"
                                    >
                                        {submittingRequest ? 'Submitting...' : 'Submit Request'}
                                    </button>
                                </form>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white mb-6">Recent Requests</h2>
                                <div className="space-y-3">
                                    {requests.length === 0 ? (
                                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-500 text-sm">
                                            No recent time off requests.
                                        </div>
                                    ) : requests.map((req: any) => (
                                        <div key={req.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="font-bold text-white capitalize">{req.type.replace('_', ' ')}: {req.date}</div>
                                                {req.status === 'pending' && <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded text-[10px] font-black uppercase">Pending</span>}
                                                {req.status === 'approved' && <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-[10px] font-black uppercase">Approved</span>}
                                                {req.status === 'rejected' && <span className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded text-[10px] font-black uppercase">Rejected</span>}
                                            </div>
                                            <div className="text-xs text-zinc-400 line-clamp-2">{req.reason}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Scroll to Top Button */}
            {showScrollTop && (
                <button
                    onClick={scrollToTop}
                    className="fixed bottom-6 right-6 p-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-zinc-700/50 transition-all z-50 group hover:scale-110"
                    aria-label="Scroll to top"
                >
                    <svg className="w-6 h-6 group-hover:-translate-y-1 transition-transform" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                </button>
            )}

        </div>
    );
}
