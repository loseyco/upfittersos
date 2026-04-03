import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { Clock, FileText, ArrowLeft, Play, Square, Coffee, ScanLine, Loader2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { usePermissions } from '../../hooks/usePermissions';
import { Scanner } from '@yudiel/react-qr-scanner';

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
    const [requestForm, setRequestForm] = useState({ type: 'pto', date: '', reason: '' });
    const [submittingRequest, setSubmittingRequest] = useState(false);

    // Kiosk Security
    const { checkPermission } = usePermissions();
    const canRemotePunch = checkPermission('bypass_kiosk_timeclock');
    const [isScanning, setIsScanning] = useState(false);
    const [targetAction, setTargetAction] = useState<any>(null);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        fetchActiveLog();
        if (activeTab === 'timesheet') fetchTimesheets();
        if (activeTab === 'requests') fetchRequests();
    }, [tenantId, activeTab]);

    const fetchActiveLog = async () => {
        try {
            // Find an open punch for this user today spanning currently
            // Instead of complex API routes, let's just query via basic API or client side mock API implementation for test if API is not built.
            // Assuming we must use client API for firestore directly or backend route.
            const res = await api.get(`/businesses/${tenantId}/time_logs?userId=${currentUser?.uid}&status=open`);
            if (res.data && res.data.length > 0) {
                setActiveLog(res.data[0]);
            } else {
                setActiveLog(null);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingClock(false);
        }
    };

    const fetchTimesheets = async () => {
        try {
            const res = await api.get(`/businesses/${tenantId}/time_logs?userId=${currentUser?.uid}`);
            setTimeLogs(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchRequests = async () => {
        try {
            const res = await api.get(`/businesses/${tenantId}/time_off_requests?userId=${currentUser?.uid}`);
            setRequests(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleClockAction = async (action: 'clock_in' | 'clock_out' | 'start_break' | 'end_break') => {
        try {
            toast.loading("Processing punch...", { id: 'clock_action' });
            
            // In a real application, backend ensures logic, for this scope we'll construct the object
            // or rely on a new dedicated endpoint. We will just POST to time_logs and let backend handle or direct create.
            // Since backend function wasn't explicitly built, we'll write directly if API supports it, or handle here.
            const now = new Date().toISOString();
            
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
            } else if (action === 'start_break' && activeLog) {
                const breaks = activeLog.breaks || [];
                breaks.push({ start: now, end: null });
                await api.put(`/businesses/${tenantId}/time_logs/${activeLog.id}`, { breaks });
            } else if (action === 'end_break' && activeLog) {
                const breaks = activeLog.breaks || [];
                if (breaks.length > 0) {
                    breaks[breaks.length - 1].end = now;
                    await api.put(`/businesses/${tenantId}/time_logs/${activeLog.id}`, { breaks });
                }
            }

            toast.success("Time recorded successfully.", { id: 'clock_action' });
            fetchActiveLog();
            window.dispatchEvent(new Event('time_punch_updated'));
        } catch (err) {
            console.error(err);
            toast.error("Failed to record time.", { id: 'clock_action' });
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

    const handleInitiatePunch = (action: string) => {
        if (canRemotePunch) {
            handleClockAction(action as any);
            return;
        }

        const preloadedToken = getValidKioskToken();
        if (preloadedToken) {
            // We have a live, valid token pre-scanned via URL deep link!
            handleClockAction(action as any);
            // Wipe the token from the URL so it can't be reused for another action later if they refresh
            setSearchParams(prev => { prev.delete('kiosk'); return prev; }, { replace: true });
        } else {
            // Fall back to opening the in-app scanner 
            setTargetAction(action);
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

            handleClockAction(targetAction as any);
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
                status: 'pending',
                createdAt: new Date().toISOString()
            });
            toast.success("Request submitted.");
            setRequestForm({ type: 'pto', date: '', reason: '' });
            fetchRequests();
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
                    {(['clock', 'timesheet', 'requests'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-2.5 rounded-lg text-sm font-bold capitalize transition-all ${activeTab === tab ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            {tab.replace('requests', 'Time Off')}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-3xl p-6 md:p-10 backdrop-blur-md">
                    
                    {/* Timeclock Tab */}
                    {activeTab === 'clock' && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Clock className="w-24 h-24 text-zinc-800 mb-6" />
                            <h2 className="text-2xl font-black text-white mb-2">My Timeclock</h2>
                            <p className="text-zinc-500 max-w-md mx-auto mb-12">Click below to record your hours or take a break. Remember to always punch out at the end of your shift.</p>
                            
                            {loadingClock ? (
                                <div className="animate-pulse bg-zinc-800 h-16 w-64 rounded-2xl"></div>
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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg">
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
                                                <button 
                                                    onClick={() => handleInitiatePunch('start_break')}
                                                    className="flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/50 text-amber-500 px-6 py-4 rounded-2xl font-bold text-lg transition-all"
                                                >
                                                    {!canRemotePunch && <ScanLine className="w-4 h-4" />} Break
                                                </button>
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
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${log.status === 'closed' ? 'bg-zinc-800 text-zinc-300' : 'bg-blue-500/20 text-blue-400'}`}>
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
                                <h2 className="text-xl font-bold text-white mb-6">Request Time Off</h2>
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
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Date</label>
                                        <input 
                                            type="date"
                                            value={requestForm.date}
                                            onChange={(e) => setRequestForm({...requestForm, date: e.target.value})}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 text-white [color-scheme:dark]"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Reason</label>
                                        <textarea 
                                            value={requestForm.reason}
                                            onChange={(e) => setRequestForm({...requestForm, reason: e.target.value})}
                                            placeholder="Provide details about your request..."
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
        </div>
    );
}
