import { useState, useEffect } from 'react';
import { 
    Activity, Clock, AlertTriangle, Users, TrendingUp,
    BarChart3, Calendar, Filter, ArrowRight, ChevronDown, PieChart
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';


const MOCK_TEAM_EFFICIENCY = [
    { id: '1', name: 'Alex M.', role: 'Senior Tech', efficiency: 112, trend: 'up', billedHours: 42, actualHours: 37.5 },
    { id: '2', name: 'Sarah K.', role: 'Lead Install', efficiency: 105, trend: 'up', billedHours: 38, actualHours: 36 },
    { id: '3', name: 'James R.', role: 'Tech II', efficiency: 94, trend: 'down', billedHours: 40, actualHours: 42.5 },
    { id: '4', name: 'Mike T.', role: 'Apprentice', efficiency: 82, trend: 'down', billedHours: 25, actualHours: 30.5 },
];



const FALLBACK_STATE_TRANSITIONS = [
    { from: 'Intake', to: 'In Progress', avgTime: '2.5 hrs', benchmark: '4.0 hrs', status: 'good' },
    { from: 'In Progress', to: 'Pending QA', avgTime: '14.2 hrs', benchmark: '12.0 hrs', status: 'warning' },
    { from: 'Pending QA', to: 'Completed', avgTime: '3.1 hrs', benchmark: '2.0 hrs', status: 'warning' },
];

export function AnalyticsDashboard() {
    const { tenantId } = useAuth();
    const [timeRange] = useState('Last 30 Days');
    
    // Live Data States
    const [bottlenecks, setBottlenecks] = useState<any[]>([]);
    const [teamEfficiency] = useState<any[]>(MOCK_TEAM_EFFICIENCY);
    const [stateTransitions] = useState<any[]>(FALLBACK_STATE_TRANSITIONS);
    
    // KPIs
    const [activeJobsCount, setActiveJobsCount] = useState(0);
    const [blockedJobsCount, setBlockedJobsCount] = useState(0);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL' || tenantId === 'unassigned') return;

        console.log("Fetching live jobs for tenant: ", tenantId);
        const q = query(collection(db, 'jobs'), where('tenantId', '==', tenantId));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedJobs = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));

            // 1. Calculate bottlenecks by grouping non-completed jobs by status
            const blocks: Record<string, number> = {};
            let blockedTotal = 0;
            let activeTotal = 0;

            fetchedJobs.forEach(job => {
                const status = (job.status || 'Unknown').toUpperCase();
                if (status !== 'COMPLETED' && status !== 'CANCELLED') {
                    activeTotal++;
                    if (!['INTAKE', 'IN_PROGRESS', 'DRAFT'].includes(status)) {
                        blocks[status] = (blocks[status] || 0) + 1;
                        blockedTotal++;
                    }
                }
            });

            setActiveJobsCount(activeTotal);
            setBlockedJobsCount(blockedTotal);

            const computedBottlenecks = Object.keys(blocks).map(status => {
                const count = blocks[status];
                // Determine severity simply by volume
                const severity = count > 10 ? 'high' : count > 5 ? 'medium' : 'low';
                return {
                    state: status.replace('_', ' '),
                    count,
                    avgWaitDays: (Math.random() * 3 + 1).toFixed(1), // Mock wait days since job history might not exist yet
                    severity
                };
            }).sort((a, b) => b.count - a.count);

            if (computedBottlenecks.length > 0) {
                setBottlenecks(computedBottlenecks);
            } else {
                 setBottlenecks([
                     { state: 'No Active Blocks Detected', count: 0, avgWaitDays: '0.0', severity: 'low' }
                 ]);
            }
        });

        // Add additional subscriptions for Team Efficiency (Users & auth mapping) if needed here.
        
        return () => {
            unsubscribe();
        };
    }, [tenantId]);

    return (
        <div className="min-h-screen bg-zinc-950 p-6 md:p-10 lg:p-12 overflow-y-auto w-full relative">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full mix-blend-screen" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full mix-blend-screen" />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto space-y-8">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center">
                                <BarChart3 className="w-5 h-5 text-purple-400" />
                            </div>
                            <span className="text-sm font-bold text-purple-400 uppercase tracking-widest">Business Intelligence</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">Efficiency & Operations</h1>
                        <p className="text-zinc-400 mt-3 text-lg max-w-2xl">
                            Real-time insights across team performance, active bottlenecks, and workflow transit times.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all">
                            <Calendar className="w-4 h-4 text-zinc-400" />
                            {timeRange}
                            <ChevronDown className="w-4 h-4 text-zinc-500 ml-2" />
                        </button>
                        <button className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all">
                            <Filter className="w-4 h-4 text-zinc-400" />
                            Filters
                        </button>
                    </div>
                </div>

                {/* KPI Bar */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { title: 'Global Efficiency', value: '102%', label: 'Billed vs Actual', trend: 'up', icon: <TrendingUp className="w-4 h-4" /> },
                        { title: 'Active Open Jobs', value: activeJobsCount.toString(), label: 'In Pipeline', trend: 'down', icon: <Clock className="w-4 h-4" /> },
                        { title: 'Currently Blocked', value: `${blockedJobsCount} Jobs`, label: 'Needs Action', trend: 'up', icon: <AlertTriangle className="w-4 h-4" />, bad: true },
                        { title: 'Active Labor Rate', value: '$135/hr', label: 'Effective Yield', trend: 'up', icon: <Activity className="w-4 h-4" /> }
                    ].map((kpi, idx) => (
                        <div key={idx} className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-3xl p-6 relative overflow-hidden group hover:border-zinc-700 transition-colors">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-zinc-400 text-sm font-bold">{kpi.title}</h3>
                                <div className={`p-2 rounded-lg ${kpi.bad && kpi.trend==='up' ? 'text-red-400 bg-red-500/10' : kpi.trend === 'up' ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'} `}>
                                    {kpi.icon}
                                </div>
                            </div>
                            <div className="text-3xl font-black text-white tracking-tight mb-1">{kpi.value}</div>
                            <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{kpi.label}</div>
                            
                            {/* Hover accent */}
                            <div className="absolute inset-0 rounded-3xl border-2 border-purple-500/0 group-hover:border-purple-500/10 pointer-events-none transition-colors" />
                        </div>
                    ))}
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Left Column: Team Efficiency */}
                    <div className="flex flex-col gap-6 lg:col-span-2">
                        
                        {/* Staff Efficiency Heatboard */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl shadow-black/50">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                                        <Users className="w-5 h-5 text-purple-400" />
                                        Staff Efficiency Index
                                    </h2>
                                    <p className="text-zinc-500 text-sm mt-1">Comparing billed hours against actual logged time per technician.</p>
                                </div>
                                <button className="text-purple-400 hover:text-purple-300 text-sm font-bold flex items-center gap-1 transition-colors">
                                    Deep Dive <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-zinc-800">
                                            <th className="pb-3 text-xs font-bold text-zinc-500 uppercase tracking-widest pl-2">Technician</th>
                                            <th className="pb-3 text-xs font-bold text-zinc-500 uppercase tracking-widest">Efficiency</th>
                                            <th className="pb-3 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Billed Hrs</th>
                                            <th className="pb-3 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right pr-2">Logged Hrs</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {teamEfficiency.map((tech) => (
                                            <tr key={tech.id} className="border-b border-zinc-900/50 hover:bg-zinc-800/20 transition-colors group">
                                                <td className="py-4 pl-2">
                                                    <div className="flex flex-col">
                                                        <span className="text-white font-bold">{tech.name}</span>
                                                        <span className="text-xs text-zinc-500">{tech.role}</span>
                                                    </div>
                                                </td>
                                                <td className="py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-full max-w-[120px] h-2 bg-zinc-800 rounded-full overflow-hidden">
                                                            <div 
                                                                className={`h-full rounded-full ${tech.efficiency >= 100 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`} 
                                                                style={{ width: `${Math.min(tech.efficiency, 100)}%` }} 
                                                            />
                                                        </div>
                                                        <span className={`text-sm font-black ${tech.efficiency >= 100 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {tech.efficiency}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-4 text-right text-zinc-300 font-mono text-sm">{tech.billedHours}h</td>
                                                <td className="py-4 text-right pr-2 text-zinc-400 font-mono text-sm">{tech.actualHours}h</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* State Transitions Tracker */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl shadow-black/50">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                                        <Activity className="w-5 h-5 text-blue-400" />
                                        Workflow Transit Times
                                    </h2>
                                    <p className="text-zinc-500 text-sm mt-1">Average time spent between critical operational states.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {stateTransitions.map((transition, idx) => (
                                    <div key={idx} className="bg-zinc-950 border border-zinc-800/50 rounded-2xl p-4 flex items-center justify-between group hover:border-zinc-700 transition-colors">
                                        <div className="flex items-center gap-4 w-1/3">
                                            <div className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-bold text-zinc-400 w-full text-center truncate">
                                                {transition.from}
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                                            <div className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-bold text-zinc-300 w-full text-center truncate">
                                                {transition.to}
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col items-end pt-1">
                                            <div className="flex items-center gap-3">
                                                 <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest hidden md:inline">Avg Time:</span>
                                                 <span className={`text-xl font-black tracking-tight ${transition.status === 'good' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                     {transition.avgTime}
                                                 </span>
                                            </div>
                                            <span className="text-xs text-zinc-600 font-medium">Goal: &lt;{transition.benchmark}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>

                    {/* Right Column: Bottlenecks */}
                    <div className="flex flex-col gap-6">
                        
                        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl shadow-black/50 h-full">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-black text-white flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-red-500" />
                                    Active Bottlenecks
                                </h2>
                                <PieChart className="w-5 h-5 text-zinc-600" />
                            </div>

                            <p className="text-zinc-500 text-sm mb-6 pb-6 border-b border-zinc-800">
                                Primary reasons jobs are currently stalled in the pipeline.
                            </p>

                            <div className="space-y-5">
                                {bottlenecks.map((bn, idx) => (
                                    <div key={idx} className="relative">
                                        <div className="flex justify-between items-end mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${bn.severity === 'high' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : bn.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                                <span className="text-white font-bold">{bn.state}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-lg font-black text-zinc-300">{bn.count}</span>
                                                <span className="text-xs text-zinc-500 ml-1">Jobs</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-zinc-500 font-medium">Avg wait: {bn.avgWaitDays} days</span>
                                            <div className="w-1/2 h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                                                <div 
                                                    className={`h-full rounded-full ${bn.severity === 'high' ? 'bg-red-500' : bn.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}`} 
                                                    style={{ width: `${Math.min((bn.count / 20) * 100, 100)}%` }} 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 pt-6 border-t border-zinc-800">
                                <button className="w-full py-3 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 rounded-xl text-zinc-300 text-sm font-bold transition-colors flex items-center justify-center gap-2">
                                    View Full Block Report <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
