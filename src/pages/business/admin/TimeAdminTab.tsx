import { useState, useEffect, useMemo } from 'react';
import { Clock, CheckCircle, XCircle, Search, User, Activity, FileText, Download, Play, Coffee, ScanLine, Settings, FlaskConical } from 'lucide-react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { api } from '../../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';

const toLocalISOString = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const tzOffsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
};

export function TimeAdminTab({ tenantId }: { tenantId: string }) {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'timesheets' | 'requests' | 'payroll'>('dashboard');
    const [loading, setLoading] = useState(true);
    const [isFinalizing, setIsFinalizing] = useState(false);
    
    // Core Data State
    const [timeLogs, setTimeLogs] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [staff, setStaff] = useState<any[]>([]);
    
    // Settings Modal State
    const [showSettings, setShowSettings] = useState(false);
    const [payCycle, setPayCycle] = useState('biweekly');
    const [anchorDate, setAnchorDate] = useState('');

    // Editing Modal State
    const [showManageModal, setShowManageModal] = useState(false);
    const [editingLog, setEditingLog] = useState<{ id: string, clockIn: string, clockOut: string, requestId?: string, breaks?: {start: string, end: string}[] }>({ id: '', clockIn: '', clockOut: '' });

    // Current precise time injected into calculations for live-ticking
    const [nowTick, setNowTick] = useState(Date.now());

    // 1-second ticker to force live re-renders for the payroll dashboard
    useEffect(() => {
        const tick = setInterval(() => setNowTick(Date.now()), 1000);
        return () => clearInterval(tick);
    }, []);

    // Real-time Push Data
    useEffect(() => {
        if (!tenantId) return;
        fetchData(false);
        
        const qLogs = query(collection(db, 'businesses', tenantId, 'time_logs'));
        const unsubLogs = onSnapshot(qLogs, (snapshot) => {
            const logs: any[] = [];
            snapshot.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
            setTimeLogs(logs);
        });

        const qReqs = query(collection(db, 'businesses', tenantId, 'time_off_requests'));
        const unsubReqs = onSnapshot(qReqs, (snapshot) => {
            const reqs: any[] = [];
            snapshot.forEach(doc => reqs.push({ id: doc.id, ...doc.data() }));
            setRequests(reqs);
        });
        
        return () => {
            unsubLogs();
            unsubReqs();
        };
    }, [tenantId]); // Maintain stable background connection regardless of activeTab

    const fetchData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            // Load staff simultaneously for identity resolution
            const staffRes = await api.get(`/businesses/${tenantId}/staff`);
            setStaff(staffRes.data);

            const busRes = await api.get(`/businesses/${tenantId}`);
            if (busRes.data) {
                if (busRes.data.payPeriodConfig) {
                    setPayCycle(busRes.data.payPeriodConfig.cycle || 'biweekly');
                    setAnchorDate(busRes.data.payPeriodConfig.anchorDate || '');
                }
            }
            // time_logs and time_off_requests are now streamed live via WebSockets above
        } catch (err) {
            console.error(err);
            toast.error("Failed to fetch time management data.");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const handleSaveSettings = async () => {
        try {
            await api.put(`/businesses/${tenantId}`, {
                payPeriodConfig: {
                    cycle: payCycle,
                    anchorDate: anchorDate,
                }
            });
            toast.success("Payroll Settings Saved!");
            setShowSettings(false);
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error("Failed to save payroll settings.");
        }
    };

    const handleApproveRequest = async (id: string, status: 'approved' | 'rejected' | 'pending') => {
        try {
            await api.put(`/businesses/${tenantId}/time_off_requests/${id}`, { status });
            toast.success(`Request ${status}.`);
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error("Failed to update request.");
        }
    };

    const handleApplyFix = async () => {
        try {
            await api.put(`/businesses/${tenantId}/time_logs/${editingLog.id}`, {
                clockIn: editingLog.clockIn ? new Date(editingLog.clockIn).toISOString() : null,
                clockOut: editingLog.clockOut ? new Date(editingLog.clockOut).toISOString() : null,
                ...(editingLog.breaks ? { breaks: editingLog.breaks.map((b:any) => ({
                    start: b.start ? new Date(b.start).toISOString() : null,
                    end: b.end ? new Date(b.end).toISOString() : null,
                    type: 'unpaid' // default manual edits to unpaid breaks
                }))} : {})
            });
            if (editingLog.requestId) {
                await api.put(`/businesses/${tenantId}/time_off_requests/${editingLog.requestId}`, { status: 'approved' });
            }
            toast.success("Timesheet directly mutated.");
            setShowManageModal(false);
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error("Failed to mutate timesheet.");
        }
    };

    // --- Computed Properties ---
    
    // Hash map for O(1) staff identity resolution
    const staffMap = useMemo(() => {
        const map = new Map();
        staff.forEach((s: any) => {
            if (s.uid) map.set(s.uid, s);
            if (s.id) map.set(s.id, s);
        });
        return map;
    }, [staff]);

    const activeStaffIds = useMemo(() => {
        return timeLogs.filter((l: any) => l.status === 'open').map((l: any) => l.userId);
    }, [timeLogs]);

    const computeShiftHours = (log: any): number => {
        if (!log.clockIn) return 0;
        const start = new Date(log.clockIn).getTime();
        const end = log.clockOut ? new Date(log.clockOut).getTime() : nowTick;
        
        let totalMs = end - start;
        
        if (log.breaks && Array.isArray(log.breaks)) {
            log.breaks.forEach((b: any) => {
                if (b.start && b.end) {
                    totalMs -= (new Date(b.end).getTime() - new Date(b.start).getTime());
                }
            });
        }
        
        return Math.max(0, totalMs / (1000 * 60 * 60));
    };

    const activePayPeriod = useMemo(() => {
        // Wait for config
        if (!anchorDate || !payCycle) return null;
        
        const now = new Date(nowTick);
        const rawDate = new Date(anchorDate);
        const baseDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;
        
        const anchor = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0, 0);
        let start = new Date(anchor);
        let end = new Date(anchor);

        const anchorUTC = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
        const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        const daysDiff = Math.round((nowUTC - anchorUTC) / (24 * 60 * 60 * 1000));

        if (payCycle === 'weekly') {
            const weeksElapsed = daysDiff > 0 ? Math.ceil(daysDiff / 7) : Math.floor(daysDiff / 7);
            
            end = new Date(anchor);
            end.setDate(end.getDate() + (weeksElapsed * 7));
            end.setHours(23, 59, 59, 999);
            
            start = new Date(end);
            start.setDate(start.getDate() - 7);
            start.setHours(0, 0, 0, 0);
        } else if (payCycle === 'biweekly') {
            const biweeksElapsed = daysDiff > 0 ? Math.ceil(daysDiff / 14) : Math.floor(daysDiff / 14);
            
            end = new Date(anchor);
            end.setDate(end.getDate() + (biweeksElapsed * 14));
            end.setHours(23, 59, 59, 999);
            
            start = new Date(end);
            start.setDate(start.getDate() - 14);
            start.setHours(0, 0, 0, 0);
        } else if (payCycle === 'monthly') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        } else if (payCycle === 'semimonthly') {
            if (now.getDate() <= 15) {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59);
            } else {
                start = new Date(now.getFullYear(), now.getMonth(), 16);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            }
        }
        
        return { start, end };
    }, [anchorDate, payCycle, nowTick]);

    const filteredTimeLogs = useMemo(() => {
        if (!activePayPeriod) return timeLogs;
        return timeLogs.filter((log: any) => {
            const logTime = new Date(log.clockIn).getTime();
            return logTime >= activePayPeriod.start.getTime() && logTime <= activePayPeriod.end.getTime();
        });
    }, [timeLogs, activePayPeriod]);

    // Segmented payroll calculation mapped down to the individual employee vector
    const payrollBreakdown = useMemo(() => {
        let hourly = 0; let salary = 0; let contractor = 0; let bookTime = 0;
        const employeeMap = new Map();

        filteredTimeLogs.forEach((log: any) => {
            const hours = computeShiftHours(log);
            const user = staffMap.get(log.userId);
            if (!user) return;
            const rate = parseFloat(user.payRate || '0');
            const type = user.payType || 'hourly';

            if (!employeeMap.has(user.uid)) {
               employeeMap.set(user.uid, { name: `${user.firstName} ${user.lastName}`, type, totalHours: 0, rate, gross: 0 });
            }
            const emp = employeeMap.get(user.uid);
            emp.totalHours += hours;

            if (type === 'hourly') {
                 hourly += (hours * rate);
                 emp.gross += (hours * rate);
            }
            if (type === 'contractor') {
                 contractor += (hours * rate);
                 emp.gross += (hours * rate);
            }
        });

        // Calculate active salary staff base amounts (pro-rated per cycle)
        staff.forEach((user: any) => {
           if (user.payType === 'salary') {
               const annual = parseFloat(user?.payRate || '0');
               let divisor = 26; // biweekly default
               if (payCycle === 'weekly') divisor = 52;
               else if (payCycle === 'monthly') divisor = 12;
               else if (payCycle === 'semimonthly') divisor = 24;
               
               const gross = Math.round((annual / divisor) * 100) / 100;
               salary += gross;

               if (!employeeMap.has(user.uid)) {
                   employeeMap.set(user.uid, { name: `${user.firstName} ${user.lastName}`, type: 'salary', totalHours: 0, rate: annual, gross });
               } else {
                   // If they had logs for attendance, just sync gross
                   employeeMap.get(user.uid).gross = gross;
                   employeeMap.get(user.uid).rate = annual;
               }
           }
        });

        return { 
            hourly, salary, contractor, bookTime, 
            total: hourly + salary + contractor + bookTime,
            employeeBreakdown: Array.from(employeeMap.values())
        };
    }, [filteredTimeLogs, staffMap, staff, nowTick, payCycle]);

    const handleFinalizePayroll = async () => {
        if (!activePayPeriod) return;
        
        const openLogs = filteredTimeLogs.filter((log: any) => log.status === 'open');
        if (openLogs.length > 0) {
            toast.error(`Cannot finalize. There are ${openLogs.length} active time punches. Ask staff to clock out first.`, { id: 'payroll_err' });
            return;
        }

        const unpaidLogs = filteredTimeLogs.filter((log: any) => log.status === 'closed');
        if (unpaidLogs.length === 0) {
            toast.error("There are no unpaid timesheets to process for this sequence.", { id: 'payroll_err' });
            return;
        }

        try {
            setIsFinalizing(true);
            const toastId = toast.loading('Locking and finalizing payroll...', { id: 'payroll_process' });
            
            const payload = {
                startDate: activePayPeriod.start.toISOString(),
                endDate: activePayPeriod.end.toISOString(),
                totals: payrollBreakdown,
                timeLogIds: unpaidLogs.map((log: any) => log.id),
                timeOffRequestIds: [] // PTO arrays to be added
            };

            await api.post(`/businesses/${tenantId}/payroll_runs`, payload);
            toast.success('Payroll sequence finalized and locked successfully!', { id: toastId });
            fetchData();
            
            // Allow immediate jump to the new run? 
            // In future, redirect to the View Run detail modal
        } catch (err: any) {
            console.error("Payroll finalization failed:", err);
            toast.error(err.response?.data?.error || 'Failed to lock payroll records.', { id: 'payroll_process' });
        } finally {
            setIsFinalizing(false);
        }
    };

    const handleExportCSV = () => {
        const rows = [
            ["Employee Name", "Pay Type", "Total Hours", "Pay Rate", "Gross Pay Est."]
        ];

        payrollBreakdown.employeeBreakdown.forEach((emp: any) => {
            rows.push([
                `"${emp.name}"`, 
                emp.type, 
                emp.totalHours.toFixed(2), 
                emp.rate.toFixed(2), 
                emp.gross.toFixed(2)
            ]);
        });

        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Payroll_Export_${activePayPeriod?.start.toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
            {/* Alpha Banner */}
            <div className="bg-orange-500/5 border-b border-orange-500/20 px-6 py-3 flex items-start gap-3 shrink-0 relative z-20">
                <FlaskConical className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                    <h4 className="text-orange-400 font-bold text-sm">Feature Preview (Alpha Roadmap)</h4>
                    <p className="text-orange-400/80 text-xs mt-0.5">Time & Payroll tracking is currently in active development. You may start testing it now, but expect rapid updates and potential data resets prior to stable release.</p>
                </div>
            </div>

            <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-10 backdrop-blur-md">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-2xl font-black text-white">Time & Payroll</h2>
                        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                            Alpha Labs
                        </span>
                    </div>
                    <p className="text-zinc-500 text-sm font-medium">Manage staff hours, real-time tracking, and automated payroll.</p>
                    {activePayPeriod && (
                        <div className="mt-2 inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-emerald-400 font-bold text-xs uppercase tracking-widest">
                            <Activity className="w-3 h-3" />
                            Current Cycle: {activePayPeriod.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {activePayPeriod.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowSettings(true)}
                        className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                    >
                        <Settings className="w-4 h-4" /> Config
                    </button>
                    <button 
                        onClick={() => window.open(`/business/${tenantId}/kiosk`, '_blank')}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2 mr-2"
                    >
                        <ScanLine className="w-4 h-4" /> Launch Kiosk
                    </button>
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
                    <button 
                        onClick={() => setActiveTab('dashboard')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <Activity className="w-4 h-4" /> Live Dashboard
                    </button>
                    <button 
                        onClick={() => setActiveTab('timesheets')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'timesheets' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        Timesheets
                    </button>
                    <button 
                        onClick={() => setActiveTab('requests')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors relative flex items-center gap-2 ${activeTab === 'requests' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        Requests
                        {requests.filter((r: any) => r.status === 'pending').length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-black">
                                {requests.filter((r: any) => r.status === 'pending').length}
                            </span>
                        )}
                    </button>
                    <button 
                        onClick={() => setActiveTab('payroll')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 border-l border-zinc-800 ml-1 pl-5 ${activeTab === 'payroll' ? 'bg-emerald-500/10 text-emerald-400' : 'text-emerald-500 hover:bg-emerald-500/5'}`}
                    >
                        <Download className="w-4 h-4" /> Run Payroll
                    </button>
                </div>
                </div>
            </div>

            <div className="p-6">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-24 text-zinc-500">
                        <Clock className="w-8 h-8 animate-spin mb-4 opacity-50" />
                        <p className="font-medium animate-pulse">Calculating Timesheets...</p>
                    </div>
                ) : (
                    <>
                        {/* Live Dashboard View */}
                        {activeTab === 'dashboard' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <Activity className="w-24 h-24 text-emerald-500" />
                                        </div>
                                        <div className="flex items-center justify-between mb-2 z-10 relative">
                                            <h3 className="text-zinc-500 text-sm font-bold uppercase tracking-widest">Currently Clocked In</h3>
                                        </div>
                                        <div className="text-4xl font-black text-white flex items-baseline gap-2 relative z-10">
                                            {activeStaffIds.length} <span className="text-lg font-medium text-zinc-500">of {staff.length}</span>
                                        </div>
                                    </div>
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <FileText className="w-24 h-24 text-indigo-500" />
                                        </div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-zinc-500 text-sm font-bold uppercase tracking-widest">Total Cycle Shifts</h3>
                                        </div>
                                        <div className="text-4xl font-black text-white">
                                            {filteredTimeLogs.length}
                                        </div>
                                    </div>
                                    <div className="bg-zinc-900 border border-emerald-500/20 rounded-xl p-6 relative overflow-hidden group flex flex-col justify-between">
                                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <Clock className="w-24 h-24 text-emerald-500" />
                                        </div>
                                        <div>
                                            <h3 className="text-emerald-500/70 text-sm font-bold uppercase tracking-widest mb-1">Estimated Gross Payroll</h3>
                                            <div className="text-4xl font-black text-emerald-400">
                                                ${payrollBreakdown.total.toFixed(2)}
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-emerald-500/10 relative z-10">
                                            <div>
                                                <div className="text-[10px] uppercase font-bold tracking-widest text-emerald-500/50">Hourly</div>
                                                <div className="text-xs font-mono font-bold text-emerald-400/80">${payrollBreakdown.hourly.toFixed(2)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] uppercase font-bold tracking-widest text-emerald-500/50">Salary Cycle Base</div>
                                                <div className="text-xs font-mono font-bold text-emerald-400/80">${payrollBreakdown.salary.toFixed(2)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mt-6">
                                    <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
                                        <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Active Personnel
                                        </h3>
                                    </div>
                                    <div className="p-4">
                                        {activeStaffIds.length === 0 ? (
                                            <div className="text-center p-8 text-zinc-500">
                                                No staff are currently clocked in.
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                {timeLogs.filter((l: any) => l.status === 'open').map((log: any) => {
                                                    const user = staffMap.get(log.userId);
                                                    const isBreak = log.breaks?.length ? !log.breaks[log.breaks.length - 1].end : false;

                                                    const todaysLogs = timeLogs.filter((l: any) => l.userId === log.userId && new Date(l.clockIn).toDateString() === new Date().toDateString());
                                                    const todaysHours = todaysLogs.reduce((acc: number, l: any) => acc + computeShiftHours(l), 0);
                                                    
                                                    const cycleEmp = payrollBreakdown.employeeBreakdown.find((e: any) => e.name === `${user?.firstName} ${user?.lastName}`);
                                                    const cycleHours = cycleEmp ? cycleEmp.totalHours : 0;
                                                    
                                                    let activeTask = '';
                                                    let taskTime = '';
                                                    if (log.notes?.length) {
                                                        const lastNote = log.notes[log.notes.length - 1];
                                                        if (lastNote.text.startsWith('Started Task:')) {
                                                            activeTask = lastNote.text.replace('Started Task: ', '');
                                                            const msElapsed = nowTick - new Date(lastNote.time).getTime();
                                                            const hrs = Math.floor(msElapsed / 3600000);
                                                            const mins = Math.floor((msElapsed % 3600000) / 60000);
                                                            taskTime = `${hrs}h ${mins}m`;
                                                        }
                                                    }
                                                    
                                                    return (
                                                        <div key={log.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="relative">
                                                                        {user?.photoURL ? (
                                                                            <img src={user.photoURL} alt="Avatar" className="w-10 h-10 rounded-full object-cover" />
                                                                        ) : (
                                                                            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                                                                                <User className="w-4 h-4 text-zinc-500" />
                                                                            </div>
                                                                        )}
                                                                        <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-zinc-950 ${isBreak ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                                                    </div>
                                                                    <div>
                                                                        <div className="font-bold text-white text-sm">
                                                                            {user ? `${user.firstName || ''} ${user.lastName || user.displayName || ''}` 
                                                                            : (log.userId === currentUser?.uid ? (currentUser?.displayName || 'You') : log.userId)}
                                                                        </div>
                                                                        <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-1 mt-0.5">
                                                                            {isBreak ? (
                                                                                <><Coffee className="w-3 h-3 text-amber-500" /> ON BREAK</>
                                                                            ) : (
                                                                                <><Play className="w-3 h-3 text-emerald-500" /> CLOCKED IN</>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">In At</div>
                                                                    <div className="text-xs font-mono text-emerald-400 font-bold">{new Date(log.clockIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                                                </div>
                                                            </div>
                                                            
                                                            {(activeTask || todaysHours > 0) && (
                                                                <div className="bg-zinc-900 border border-zinc-800/50 rounded-lg p-3 space-y-2">
                                                                    {activeTask && (
                                                                        <div className="flex justify-between items-center bg-zinc-800/20 px-2 py-1.5 rounded">
                                                                            <span className="text-[10px] text-zinc-400 truncate flex-1">{activeTask}</span>
                                                                            <span className="text-xs font-mono font-bold text-blue-400 ml-2 shrink-0">{taskTime}</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="grid grid-cols-2 gap-2 text-center divide-x divide-zinc-800">
                                                                        <div>
                                                                            <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold mb-0.5">Today</div>
                                                                            <div className="text-xs font-mono font-bold text-white">{todaysHours.toFixed(2)}h</div>
                                                                        </div>
                                                                        <div>
                                                                            <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold mb-0.5">Period</div>
                                                                            <div className="text-xs font-mono font-bold text-emerald-500">{cycleHours.toFixed(2)}h</div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Timesheets View */}
                        {activeTab === 'timesheets' && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                                    <div className="flex-1 flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                                        <Search className="w-4 h-4 text-zinc-500" />
                                        <input 
                                            type="text" 
                                            placeholder="Search by Staff Name..." 
                                            className="bg-transparent border-none focus:outline-none text-sm text-white w-full"
                                        />
                                    </div>
                                    <button className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                                        <Download className="w-4 h-4" /> Export CSV
                                    </button>
                                </div>

                                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-zinc-800/50 text-zinc-400 text-xs uppercase font-bold tracking-widest border-b border-zinc-800">
                                            <tr>
                                                <th className="px-6 py-4">Employee</th>
                                                <th className="px-6 py-4">Shift In</th>
                                                <th className="px-6 py-4">Shift Out</th>
                                                <th className="px-6 py-4">Activity</th>
                                                <th className="px-6 py-4">P. Hours</th>
                                                <th className="px-6 py-4 text-right">Gross Pay</th>
                                                <th className="px-6 py-4"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800">
                                            {filteredTimeLogs.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">
                                                        No timesheets generated for the current pay period.
                                                    </td>
                                                </tr>
                                            ) : filteredTimeLogs.map((log: any) => {
                                                const user = staffMap.get(log.userId);
                                                const userName = user 
                                                    ? `${user.firstName || ''} ${user.lastName || user.displayName || user.email}` 
                                                    : (log.userId === currentUser?.uid ? (currentUser?.displayName || 'You') : log.userId);
                                                const userPhoto = user?.photoURL || (log.userId === currentUser?.uid ? currentUser?.photoURL : null);
                                                const hours = computeShiftHours(log);
                                                const rate = parseFloat(user?.payRate || '0');
                                                const gross = hours * rate;

                                                return (
                                                    <tr key={log.id} 
                                                        onClick={() => {
                                                            setEditingLog({
                                                                id: log.id,
                                                                clockIn: log.clockIn ? toLocalISOString(log.clockIn) : '',
                                                                clockOut: log.clockOut ? toLocalISOString(log.clockOut) : '',
                                                                breaks: (log.breaks || []).map((b: any) => ({
                                                                    start: b.start ? toLocalISOString(b.start) : '',
                                                                    end: b.end ? toLocalISOString(b.end) : ''
                                                                }))
                                                            });
                                                            setShowManageModal(true);
                                                        }}
                                                        className="hover:bg-zinc-800/30 transition-colors group cursor-pointer"
                                                    >
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white border border-zinc-700 overflow-hidden shrink-0">
                                                                    {userPhoto ? <img src={userPhoto} alt="" className="w-full h-full object-cover" /> : userName.charAt(0).toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-white">{userName}</div>
                                                                    {log.status === 'open' && <div className="text-[10px] text-emerald-500 font-black uppercase tracking-wider">Active Shift</div>}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-zinc-300">{new Date(log.clockIn).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                                        <td className="px-6 py-4 text-zinc-400">{log.clockOut ? new Date(log.clockOut).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}</td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                {log.breaks?.length > 0 && <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest uppercase">{log.breaks.length} BRK</span>}
                                                                {log.notes?.length > 0 && (
                                                                    <div className="relative group/notes inline-block cursor-help">
                                                                        <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 border border-emerald-500/20 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                                                            <FileText className="w-3 h-3" /> {log.notes.length} Notes
                                                                        </span>
                                                                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover/notes:block w-72 p-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 text-xs">
                                                                            <div className="font-bold text-white mb-3 uppercase tracking-widest border-b border-zinc-800 pb-2 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-500"/> Shift Timeline</div>
                                                                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                                                                {log.notes.map((n: any, i: number) => (
                                                                                    <div key={i} className="flex gap-2">
                                                                                        <span className="text-zinc-500 font-mono shrink-0 mt-0.5">{new Date(n.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                                                        <span className="text-zinc-300 bg-zinc-800/50 p-1.5 rounded flex-1 border border-zinc-700/50">{n.text}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {(!log.breaks?.length && !log.notes?.length) && <span className="text-zinc-600 text-xs">—</span>}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono font-bold">
                                                                {hours.toFixed(2)}h
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <span className="font-bold text-emerald-400 font-mono">
                                                                ${gross.toFixed(2)}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingLog({
                                                                        id: log.id,
                                                                        clockIn: log.clockIn ? toLocalISOString(log.clockIn) : '',
                                                                        clockOut: log.clockOut ? toLocalISOString(log.clockOut) : ''
                                                                    });
                                                                    setShowManageModal(true);
                                                                }}
                                                                className="opacity-0 group-hover:opacity-100 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-3 py-1.5 rounded-lg transition-all text-xs font-bold"
                                                            >
                                                                Inspect
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Requests View */}
                        {activeTab === 'requests' && (
                            <div className="space-y-12">
                                <div>
                                    <h2 className="text-xl font-bold text-white mb-6">Action Required</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {requests.filter((r: any) => r.status === 'pending').length === 0 ? (
                                            <div className="col-span-full flex flex-col items-center justify-center p-12 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500">
                                                <CheckCircle className="w-12 h-12 mb-4 opacity-20" />
                                                <p>Inbox zero. All time off and edit requests are resolved.</p>
                                            </div>
                                        ) : requests.filter((r: any) => r.status === 'pending').map((req: any) => {
                                            const user = staffMap.get(req.userId);
                                            const userName = user ? `${user.firstName || ''} ${user.lastName || user.displayName || user.email}` : req.userId;

                                            return (
                                                <div key={req.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative flex flex-col">
                                                    <span className="absolute top-4 right-4 bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase px-2 py-1 rounded">Action Required</span>
                                                    
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                                                            {user?.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full rounded-full object-cover" /> : <User className="w-5 h-5 text-zinc-400" />}
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold text-white text-sm">{userName}</h3>
                                                            <p className="text-xs text-zinc-500">Submitted: {new Date(req.createdAt).toLocaleDateString()}</p>
                                                        </div>
                                                    </div>

                                                    <div className="mb-4 bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex-1">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Type</span>
                                                            <span className="font-bold text-white capitalize">{req.type.replace('_', ' ')}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between mb-4">
                                                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Date</span>
                                                            <span className="font-bold text-white">{req.date}</span>
                                                        </div>
                                                        <div className="text-sm text-zinc-400">
                                                            <span className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Reason provided</span>
                                                            "{req.reason}"
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <div className="flex gap-3">
                                                            {req.type !== 'missed_punch' && (
                                                                <button 
                                                                    onClick={() => handleApproveRequest(req.id, 'approved')}
                                                                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                                                                >
                                                                    <CheckCircle className="w-4 h-4" /> Approve
                                                                </button>
                                                            )}
                                                            <button 
                                                                onClick={() => handleApproveRequest(req.id, 'rejected')}
                                                                className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/50 font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                                                            >
                                                                <XCircle className="w-4 h-4" /> Reject
                                                            </button>
                                                        </div>
                                                        {req.type === 'missed_punch' && req.targetLogId && (
                                                            <button 
                                                                onClick={() => {
                                                                    const existingLog = timeLogs.find(l => l.id === req.targetLogId);
                                                                    setEditingLog({ 
                                                                        id: req.targetLogId, 
                                                                        clockIn: req.requestedClockIn ? toLocalISOString(req.requestedClockIn) : '', 
                                                                        clockOut: req.requestedClockOut ? toLocalISOString(req.requestedClockOut) : '', 
                                                                        requestId: req.id,
                                                                        breaks: existingLog ? (existingLog.breaks || []).map((b: any) => ({
                                                                            start: b.start ? toLocalISOString(b.start) : '',
                                                                            end: b.end ? toLocalISOString(b.end) : ''
                                                                        })) : []
                                                                    });
                                                                    setShowManageModal(true);
                                                                }}
                                                                className="w-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/50 font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                                                            >
                                                                <Settings className="w-4 h-4" /> Review Fix
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {requests.filter((r: any) => r.status !== 'pending').length > 0 && (
                                    <div>
                                        <h2 className="text-xl font-bold text-white mb-6">Historical Log</h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {requests.filter((r: any) => r.status !== 'pending').map((req: any) => {
                                                const user = staffMap.get(req.userId);
                                                const userName = user ? `${user.firstName || ''} ${user.lastName || user.displayName || user.email}` : req.userId;

                                                return (
                                                    <div key={req.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative flex flex-col opacity-75">
                                                        {req.status === 'approved' && <span className="absolute top-4 right-4 bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase px-2 py-1 rounded">Approved</span>}
                                                        {req.status === 'rejected' && <span className="absolute top-4 right-4 bg-red-500/10 text-red-500 text-[10px] font-black uppercase px-2 py-1 rounded">Rejected</span>}
                                                        
                                                        <div className="flex items-center gap-3 mb-4">
                                                            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                                                                {user?.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full rounded-full object-cover grayscale" /> : <User className="w-5 h-5 text-zinc-400" />}
                                                            </div>
                                                            <div>
                                                                <h3 className="font-bold text-white text-sm">{userName}</h3>
                                                                <p className="text-xs text-zinc-500">Submitted: {new Date(req.createdAt).toLocaleDateString()}</p>
                                                            </div>
                                                        </div>

                                                        <div className="mb-4 bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex-1">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Type</span>
                                                                <span className="font-bold text-white capitalize">{req.type.replace('_', ' ')}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between mb-4">
                                                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Date</span>
                                                                <span className="font-bold text-white">{req.date}</span>
                                                            </div>
                                                            <div className="text-sm text-zinc-400">
                                                                <span className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Reason provided</span>
                                                                "{req.reason}"
                                                            </div>
                                                        </div>

                                                        <div className="space-y-3">
                                                            <div className="flex gap-3">
                                                                <button 
                                                                    onClick={() => handleApproveRequest(req.id, 'pending')}
                                                                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                                                                >
                                                                    Move Back to Inbox
                                                                </button>
                                                            </div>
                                                            {req.targetLogId && (
                                                                <button 
                                                                    onClick={() => {
                                                                        const existingLog = timeLogs.find(l => l.id === req.targetLogId);
                                                                        setEditingLog({ 
                                                                            id: req.targetLogId, 
                                                                            clockIn: req.requestedClockIn ? toLocalISOString(req.requestedClockIn) : (existingLog?.clockIn ? toLocalISOString(existingLog.clockIn) : ''), 
                                                                            clockOut: req.requestedClockOut ? toLocalISOString(req.requestedClockOut) : (existingLog?.clockOut ? toLocalISOString(existingLog.clockOut) : ''), 
                                                                            requestId: req.id,
                                                                            breaks: existingLog ? (existingLog.breaks || []).map((b: any) => ({
                                                                                start: b.start ? toLocalISOString(b.start) : '',
                                                                                end: b.end ? toLocalISOString(b.end) : ''
                                                                            })) : []
                                                                        });
                                                                        setShowManageModal(true);
                                                                    }}
                                                                    className="w-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/50 font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                                                                >
                                                                    <Settings className="w-4 h-4" /> Open Inspector
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Payroll Finalization View */}
                        {activeTab === 'payroll' && (
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                                <div className="mb-6 pb-6 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                                            <Download className="w-5 h-5 text-emerald-500" /> Run Payroll & Export
                                        </h3>
                                        <p className="text-sm text-zinc-400">Finalize the active cycle to calculate exact totals (including PTO) and map to QuickBooks.</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <button 
                                            onClick={handleExportCSV}
                                            className="font-bold px-6 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
                                        >
                                            <Download className="w-4 h-4" /> Download QBO CSV
                                        </button>
                                        <button 
                                            onClick={handleFinalizePayroll}
                                            disabled={isFinalizing}
                                            className={`font-bold px-6 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shrink-0 ${isFinalizing ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'}`}
                                        >
                                            <CheckCircle className="w-4 h-4" /> {isFinalizing ? 'Locking Sequence...' : 'Lock & Finalize Sequence'}
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="space-y-6">
                                    <h4 className="font-bold text-zinc-500 text-xs uppercase tracking-widest bg-zinc-950 inline-block px-3 py-1 rounded-lg border border-zinc-800">
                                        Sequence Window: {activePayPeriod?.start.toLocaleDateString()} — {activePayPeriod?.end.toLocaleDateString()}
                                    </h4>
                                    
                                    <div className="bg-zinc-950 border border-emerald-500/20 rounded-xl p-8 relative overflow-hidden">
                                        <div className="absolute -top-12 -right-12">
                                            <Activity className="w-48 h-48 text-emerald-500 opacity-5" />
                                        </div>
                                        <div className="flex flex-col md:flex-row justify-between items-center relative z-10 gap-6">
                                            <div>
                                                <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2"><div className="w-2 h-2 rounded-full border border-emerald-500 animate-pulse bg-emerald-500/50"></div> Total Projected Expenditures</h4>
                                                <div className="text-5xl font-black text-emerald-400 font-mono tracking-tighter">
                                                    ${payrollBreakdown.total.toFixed(2)}
                                                </div>
                                            </div>
                                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 w-full md:w-64">
                                                <div className="flex justify-between items-center py-2 border-b border-zinc-800/50">
                                                    <span className="text-xs font-bold text-zinc-500 uppercase">Hourly Pay</span>
                                                    <span className="text-sm text-zinc-300 font-bold font-mono">${payrollBreakdown.hourly.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-2 border-b border-zinc-800/50">
                                                    <span className="text-xs font-bold text-zinc-500 uppercase">Salary (Base)</span>
                                                    <span className="text-sm text-zinc-300 font-bold font-mono">${payrollBreakdown.salary.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-2">
                                                    <span className="text-xs font-bold text-amber-500 uppercase px-1.5 py-0.5 bg-amber-500/10 rounded">PTO Extrapolations</span>
                                                    <span className="text-sm text-amber-500 font-bold font-mono">$0.00</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6">
                                        <h4 className="text-yellow-500 font-bold text-sm mb-2">Phase 10 & 11 Development Notice</h4>
                                        <p className="text-zinc-400 text-sm">The PTO computation logic and Shift Exception (Late/Early) algorithms are currently under construction. QuickBooks Online mapping configuration options will appear here once the core logic engine is stabilized.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Payroll Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowSettings(false)}></div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-lg relative z-10 shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-black text-white flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-accent" /> Payroll Configuration
                                </h2>
                                <p className="text-zinc-500 text-xs mt-1">Define the cadence for payroll calculations.</p>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-white transition-colors">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Pay Period Cycle</label>
                                <select 
                                    value={payCycle}
                                    onChange={(e) => setPayCycle(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white appearance-none cursor-pointer"
                                >
                                    <option value="weekly">Weekly</option>
                                    <option value="biweekly">Bi-Weekly</option>
                                    <option value="semimonthly">Semi-Monthly (1st & 15th)</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                                <p className="text-zinc-500 text-xs mt-2 ml-1">Determines how often the dashboard resets.</p>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Reference Pay Period Date</label>
                                <input 
                                    type="date"
                                    value={anchorDate}
                                    onChange={(e) => setAnchorDate(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent text-white [color-scheme:dark]"
                                />
                                <p className="text-zinc-500 text-xs mt-2 ml-1">Select the exact date your current or upcoming payroll cycle ends. We use this to calculate all future periods.</p>
                            </div>
                        </div>
                        <div className="p-6 border-t border-zinc-800 bg-zinc-900/30 flex justify-end">
                            <button 
                                onClick={handleSaveSettings}
                                className="bg-accent hover:bg-accent-hover text-white font-bold px-8 py-3 rounded-xl transition-all shadow-lg"
                            >
                                Save Configuration
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Manage Time Log Modal */}
            {showManageModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowManageModal(false)}></div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-lg relative z-10 shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-black text-emerald-400 flex items-center gap-2">
                                    <Clock className="w-5 h-5" /> Edit Timesheet
                                </h2>
                                <p className="text-zinc-500 text-xs mt-1">Manually edit the exact clock in and out times for this shift.</p>
                            </div>
                            <button onClick={() => setShowManageModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                            {(() => {
                                const selectedLog = timeLogs.find((l: any) => l.id === editingLog.id);
                                return selectedLog && (
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
                                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800/50 pb-2 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-500" /> Shift Inspector Summary</h3>
                                        {editingLog.breaks !== undefined && (
                                            <div>
                                                <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 flex items-center justify-between">
                                                    <span>Recorded Breaks</span>
                                                    <button onClick={() => setEditingLog({...editingLog, breaks: [...(editingLog.breaks || []), {start: '', end: ''}]})} className="text-emerald-500 hover:text-emerald-400">Add Break</button>
                                                </div>
                                                <div className="space-y-2">
                                                    {editingLog.breaks.map((b: any, i: number) => (
                                                        <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-zinc-950 p-2 rounded border border-zinc-800">
                                                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                                                <Coffee className="w-4 h-4 text-amber-500 shrink-0" />
                                                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest block sm:hidden">Start Time</span>
                                                            </div>
                                                            <input 
                                                                type="datetime-local" 
                                                                value={b.start}
                                                                onChange={(e) => {
                                                                    const newBreaks = [...editingLog.breaks!];
                                                                    newBreaks[i].start = e.target.value;
                                                                    setEditingLog({...editingLog, breaks: newBreaks});
                                                                }}
                                                                className="flex-1 w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 [color-scheme:dark]"
                                                            />
                                                            <span className="hidden sm:inline text-zinc-500">—</span>
                                                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest block sm:hidden mt-1 ml-6">End Time</span>
                                                            <input 
                                                                type="datetime-local" 
                                                                value={b.end}
                                                                onChange={(e) => {
                                                                    const newBreaks = [...editingLog.breaks!];
                                                                    newBreaks[i].end = e.target.value;
                                                                    setEditingLog({...editingLog, breaks: newBreaks});
                                                                }}
                                                                className="flex-1 w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 [color-scheme:dark]"
                                                            />
                                                            <button 
                                                                onClick={() => {
                                                                    const newBreaks = editingLog.breaks!.filter((_, bi) => bi !== i);
                                                                    setEditingLog({...editingLog, breaks: newBreaks});
                                                                }}
                                                                className="w-full sm:w-auto mt-2 sm:mt-0 text-red-500 hover:text-red-400 hover:bg-red-500/20 p-1.5 bg-red-500/10 rounded flex items-center justify-center transition-colors"
                                                            >
                                                                <XCircle className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {editingLog.breaks.length === 0 && (
                                                        <div className="text-xs text-zinc-600 italic">No breaks active.</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        {selectedLog.notes?.length > 0 && (
                                            <div>
                                                <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1">Shift Notes & Activity</div>
                                                <div className="space-y-1">
                                                    {selectedLog.notes.map((n: any, i: number) => (
                                                        <div key={i} className="text-xs text-zinc-300 flex items-start gap-2 bg-zinc-950 p-2 rounded">
                                                            <FileText className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                                                            <div className="flex-1">
                                                                <div className="text-zinc-500 font-mono text-[10px] mb-0.5">{new Date(n.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                                                <div>{n.text}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {(!editingLog.breaks?.length && !selectedLog.notes?.length) && (
                                            <div className="text-xs text-zinc-500 italic">No notes or breaks recorded for this shift.</div>
                                        )}
                                    </div>
                                );
                            })()}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Force Clock In</label>
                                    <input 
                                        type="datetime-local"
                                    value={editingLog.clockIn}
                                    onChange={(e) => setEditingLog({...editingLog, clockIn: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-white [color-scheme:dark]"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Force Clock Out</label>
                                <input 
                                    type="datetime-local"
                                    value={editingLog.clockOut}
                                    onChange={(e) => setEditingLog({...editingLog, clockOut: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-white [color-scheme:dark]"
                                />
                            </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-zinc-800 bg-zinc-900/30 flex justify-end">
                            <button 
                                onClick={handleApplyFix}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-8 py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
