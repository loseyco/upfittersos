import { useState, useEffect, useMemo } from 'react';
import { Clock, CheckCircle, XCircle, Search, User, Activity, FileText, Download, Play, Coffee, ScanLine, Settings } from 'lucide-react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { api } from '../../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';

export function TimeAdminTab({ tenantId }: { tenantId: string }) {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'timesheets' | 'requests'>('dashboard');
    const [loading, setLoading] = useState(true);
    
    // Core Data State
    const [timeLogs, setTimeLogs] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [staff, setStaff] = useState<any[]>([]);
    const [businessSettings, setBusinessSettings] = useState<any>(null);
    
    // Settings Modal State
    const [showSettings, setShowSettings] = useState(false);
    const [payCycle, setPayCycle] = useState('biweekly');
    const [anchorDate, setAnchorDate] = useState('');

    // Current precise time injected into calculations for live-ticking
    const [nowTick, setNowTick] = useState(Date.now());

    // 1-minute ticker to force re-renders
    useEffect(() => {
        const tick = setInterval(() => setNowTick(Date.now()), 60000);
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
                setBusinessSettings(busRes.data);
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

    const handleApproveRequest = async (id: string, status: 'approved' | 'rejected') => {
        try {
            await api.put(`/businesses/${tenantId}/time_off_requests/${id}`, { status });
            toast.success(`Request ${status}.`);
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error("Failed to update request.");
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
        const anchor = new Date(anchorDate + "T00:00:00");
        let start = new Date(anchor);
        let end = new Date(anchor);
        
        if (payCycle === 'weekly') {
            const msInWeek = 7 * 24 * 60 * 60 * 1000;
            const diff = now.getTime() - anchor.getTime();
            const weeks = Math.floor(diff / msInWeek);
            start = new Date(anchor.getTime() + weeks * msInWeek);
            end = new Date(start.getTime() + msInWeek - 1000);
        } else if (payCycle === 'biweekly') {
            const msInBiweek = 14 * 24 * 60 * 60 * 1000;
            const diff = now.getTime() - anchor.getTime();
            const biweeks = Math.floor(diff / msInBiweek);
            start = new Date(anchor.getTime() + biweeks * msInBiweek);
            end = new Date(start.getTime() + msInBiweek - 1000);
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

    // Segmented payroll calculation
    const payrollBreakdown = useMemo(() => {
        let hourly = 0;
        let salary = 0;
        let contractor = 0;
        let bookTime = 0;

        filteredTimeLogs.forEach((log: any) => {
            const hours = computeShiftHours(log);
            const user = staffMap.get(log.userId);
            const rate = parseFloat(user?.payRate || '0');
            const type = user?.payType || 'hourly';

            if (type === 'hourly') hourly += (hours * rate);
            if (type === 'contractor') contractor += (hours * rate);
        });

        // Calculate active salary staff base amounts
        staff.forEach((user: any) => {
           if (user.payType === 'salary') {
               salary += parseFloat(user?.payRate || '0');
           }
        });

        return { 
            hourly, 
            salary, 
            contractor, 
            bookTime, 
            total: hourly + salary + contractor + bookTime 
        };
    }, [filteredTimeLogs, staffMap, staff, nowTick]);

    return (
        <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto w-full">
            <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-10 backdrop-blur-md">
                <div>
                    <h2 className="text-2xl font-black text-white">Time & Payroll</h2>
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
                        Time Off Requests
                        {requests.filter((r: any) => r.status === 'pending').length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-black">
                                {requests.filter((r: any) => r.status === 'pending').length}
                            </span>
                        )}
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
                                                    
                                                    return (
                                                        <div key={log.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                                                            <div className="relative">
                                                                {user?.photoURL ? (
                                                                    <img src={user.photoURL} alt="Avatar" className="w-12 h-12 rounded-full object-cover" />
                                                                ) : (
                                                                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                                                                        <User className="w-5 h-5 text-zinc-500" />
                                                                    </div>
                                                                )}
                                                                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-zinc-950 ${isBreak ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-white text-sm">
                                                                    {user ? `${user.firstName || ''} ${user.lastName || user.displayName || ''}` 
                                                                    : (log.userId === currentUser?.uid ? (currentUser?.displayName || 'You') : log.userId)}
                                                                </div>
                                                                <div className="text-xs font-mono text-zinc-500 flex items-center gap-1 mt-1">
                                                                    {isBreak ? (
                                                                         <><Coffee className="w-3 h-3 text-amber-500" /> On Break</>
                                                                    ) : (
                                                                        <><Play className="w-3 h-3 text-emerald-500" /> Clocked In</>
                                                                    )}
                                                                </div>
                                                            </div>
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
                                                <th className="px-6 py-4">Breaks</th>
                                                <th className="px-6 py-4">P. Hours</th>
                                                <th className="px-6 py-4">Rate</th>
                                                <th className="px-6 py-4 text-right">Gross Pay</th>
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
                                                    <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors group cursor-pointer">
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
                                                        <td className="px-6 py-4 text-zinc-400 font-mono">
                                                            {log.breaks?.length || 0}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono font-bold">
                                                                {hours.toFixed(2)}h
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-zinc-500 font-mono text-xs">
                                                            ${rate.toFixed(2)}/h
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <span className="font-bold text-emerald-400 font-mono">
                                                                ${gross.toFixed(2)}
                                                            </span>
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
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {requests.length === 0 ? (
                                    <div className="col-span-full flex flex-col items-center justify-center p-12 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500">
                                        <CheckCircle className="w-12 h-12 mb-4 opacity-20" />
                                        <p>Inbox zero. All time off requests are resolved.</p>
                                    </div>
                                ) : requests.map((req: any) => {
                                    const user = staffMap.get(req.userId);
                                    const userName = user ? `${user.firstName || ''} ${user.lastName || user.displayName || user.email}` : req.userId;

                                    return (
                                        <div key={req.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative flex flex-col">
                                            {req.status === 'pending' && <span className="absolute top-4 right-4 bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase px-2 py-1 rounded">Action Required</span>}
                                            {req.status === 'approved' && <span className="absolute top-4 right-4 bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase px-2 py-1 rounded">Approved</span>}
                                            {req.status === 'rejected' && <span className="absolute top-4 right-4 bg-red-500/10 text-red-500 text-[10px] font-black uppercase px-2 py-1 rounded">Rejected</span>}
                                            
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

                                            {req.status === 'pending' && (
                                                <div className="flex gap-3">
                                                    <button 
                                                        onClick={() => handleApproveRequest(req.id, 'approved')}
                                                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                                                    >
                                                        <CheckCircle className="w-4 h-4" /> Approve
                                                    </button>
                                                    <button 
                                                        onClick={() => handleApproveRequest(req.id, 'rejected')}
                                                        className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/50 font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                                                    >
                                                        <XCircle className="w-4 h-4" /> Reject
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
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
        </div>
    );
}
