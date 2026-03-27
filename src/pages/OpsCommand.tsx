import { Activity, AlertTriangle, LifeBuoy, Wrench, Clock, PackageSearch, AlertCircle, PlayCircle, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

export function OpsCommand() {
    return (
        <div className="flex-1 bg-zinc-950 p-4 md:p-8">
            <div className="max-w-[1600px] mx-auto space-y-6">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                            <Activity className="w-8 h-8 text-accent" />
                            Ops Command: Mission Control
                        </h2>
                        <p className="mt-2 text-zinc-400">Live floor overview, bay utilization, and bottleneck tracking.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full border border-emerald-400/20">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                            LIVE SYNC
                        </span>
                    </div>
                </div>

                {/* Fleet Pipeline & Weekly Stats */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Global Fleet Pipeline</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-6 divide-x divide-zinc-800">
                        <div className="px-4 first:pl-0">
                            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Pending Intake</div>
                            <div className="text-3xl font-black text-white">12</div>
                            <div className="text-[10px] text-zinc-500 font-semibold mt-1">Scheduled next 14 days</div>
                        </div>
                        <div className="px-4">
                            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Active Bays</div>
                            <div className="text-3xl font-black text-white">4</div>
                            <div className="text-[10px] text-emerald-500 font-semibold mt-1">Currently being worked on</div>
                        </div>
                        <div className="px-4">
                            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Ready for QA</div>
                            <div className="text-3xl font-black text-white">3</div>
                            <div className="text-[10px] text-accent font-semibold mt-1">Awaiting inspection</div>
                        </div>
                        <div className="px-4">
                            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Ready for Delivery</div>
                            <div className="text-3xl font-black text-white">5</div>
                            <div className="text-[10px] text-purple-400 font-semibold mt-1">Pending client pickup</div>
                        </div>
                        <div className="px-4">
                            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Weekly Stats</div>
                            <div className="text-3xl font-black text-emerald-400">18</div>
                            <div className="text-[10px] text-zinc-500 font-semibold mt-1">Vehicles delivered this week</div>
                        </div>
                    </div>
                </div>

                {/* Top Bottleneck Alerts */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 border-l-4 border-l-emerald-500 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                        <div className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-1">Active Bays</div>
                        <div className="text-3xl font-black text-white">4 <span className="text-sm font-bold text-zinc-500">/ 6</span></div>
                        <p className="text-xs text-emerald-500 font-semibold mt-2">102% Efficiency Today</p>
                    </div>
                    <div className="bg-amber-900/20 border border-amber-500/20 rounded-xl p-5 border-l-4 border-l-amber-500 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                        <div className="text-sm font-bold text-amber-500/80 uppercase tracking-widest mb-1 flex items-center gap-2"><PackageSearch className="w-4 h-4" /> Waiting Parts</div>
                        <div className="text-3xl font-black text-amber-500">2 <span className="text-sm font-bold text-amber-500/50">Vehicles</span></div>
                        <p className="text-xs text-amber-400/80 font-semibold mt-2">Avg delay: 2.4 days</p>
                    </div>
                    <div className="bg-red-900/20 border border-red-500/20 rounded-xl p-5 border-l-4 border-l-red-500 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                        <div className="text-sm font-bold text-red-500/80 uppercase tracking-widest mb-1 flex items-center gap-2"><LifeBuoy className="w-4 h-4" /> Tech Assists</div>
                        <div className="text-3xl font-black text-red-500">1 <span className="text-sm font-bold text-red-500/50">Active Call</span></div>
                        <p className="text-xs text-red-400/80 font-semibold mt-2">Bay 2 needs help</p>
                    </div>
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 border-l-4 border-l-accent relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                        <div className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-1">Ready For QA</div>
                        <div className="text-3xl font-black text-white">3 <span className="text-sm font-bold text-zinc-500">Vehicles</span></div>
                        <button className="text-xs text-accent font-bold mt-2 hover:underline">Assign Inspector</button>
                    </div>
                </div>

                {/* Primary: Shop Floor Map (Mission Control) */}
                <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-2"><MapPin className="w-5 h-5 text-accent" /> Floor Map</h3>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* The Bays (Main Area) */}
                        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">

                            {/* BAY 1: On Track */}
                            <div className="bg-zinc-900 rounded-xl border-2 border-zinc-800 hover:border-zinc-700 transition-colors flex flex-col h-full overflow-hidden group/bay relative">
                                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover/bay:opacity-100 transition-opacity"></div>
                                {/* Bay Header */}
                                <div className="bg-zinc-950/80 px-4 py-3 border-b border-zinc-800 flex justify-between items-center relative z-10">
                                    <span className="font-black text-xl tracking-tight text-white/50">BAY 1</span>
                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20">
                                        <PlayCircle className="w-3 h-3" /> Active
                                    </span>
                                </div>
                                {/* Bay Content */}
                                <div className="p-4 flex-1 flex flex-col justify-between relative z-10">
                                    <div>
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className="font-bold text-lg text-white">2024 Ford Explorer PIU</h4>
                                            <Link to="/jobs/mock" className="text-xs font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded hover:text-white hover:bg-zinc-700 transition-colors">#4088</Link>
                                        </div>
                                        <p className="text-sm text-zinc-400 font-medium">Lake County Sheriff</p>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-zinc-800/50 flex justify-between items-end">
                                        <div>
                                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Tech Assigned</p>
                                            <div className="flex items-center gap-2">
                                                <img className="h-6 w-6 rounded-full ring-2 ring-zinc-800" src="https://i.pravatar.cc/100?img=33" alt="" title="Paul L." />
                                                <span className="text-sm font-semibold text-zinc-300">Paul L.</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">Time On Job</p>
                                            <p className="text-sm font-mono text-emerald-400">04:12:05</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* BAY 2: Needs Help */}
                            <div className="bg-red-950/20 rounded-xl border-2 border-red-500/30 flex flex-col h-full overflow-hidden relative shadow-[0_0_15px_rgba(239,68,68,0.1)] group/bay">
                                <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
                                {/* Bay Header */}
                                <div className="bg-red-950/40 px-4 py-3 border-b border-red-500/20 flex justify-between items-center relative z-10">
                                    <span className="font-black text-xl tracking-tight text-red-500/70">BAY 2</span>
                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider animate-pulse">
                                        <LifeBuoy className="w-3 h-3" /> Help Requested
                                    </span>
                                </div>
                                {/* Bay Content */}
                                <div className="p-4 flex-1 flex flex-col justify-between relative z-10">
                                    <div>
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className="font-bold text-lg text-white">2023 Chevy Tahoe PPV</h4>
                                            <span className="text-xs font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">#4091</span>
                                        </div>
                                        <p className="text-sm text-zinc-400 font-medium">McHenry PD</p>
                                        <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded p-2 flex items-start gap-2">
                                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                            <p className="text-xs text-red-300 font-medium">"Need a second set of hands to seat the push bumper." - <span className="font-bold">Mike T.</span></p>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-red-500/20 flex justify-between items-center w-full">
                                        <button className="bg-red-500 hover:bg-red-600 text-white font-bold text-xs py-1.5 px-4 rounded w-full transition-colors">Acknowledge / Dispatch Help</button>
                                    </div>
                                </div>
                            </div>

                            {/* BAY 3: Normal / In Progress */}
                            <div className="bg-zinc-900 rounded-xl border-2 border-zinc-800 flex flex-col h-full overflow-hidden">
                                {/* Bay Header */}
                                <div className="bg-zinc-950/80 px-4 py-3 border-b border-zinc-800 flex justify-between items-center">
                                    <span className="font-black text-xl tracking-tight text-white/50">BAY 3</span>
                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-wider border border-accent/20">
                                        <Wrench className="w-3 h-3" /> Rough In
                                    </span>
                                </div>
                                {/* Bay Content */}
                                <div className="p-4 flex-1 flex flex-col justify-between">
                                    <div>
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className="font-bold text-lg text-white">Dodge Charger Pursuit</h4>
                                            <span className="text-xs font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">#4105</span>
                                        </div>
                                        <p className="text-sm text-zinc-400 font-medium">State Police</p>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-zinc-800/50 flex justify-between items-end">
                                        <div>
                                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Tech Assigned</p>
                                            <div className="flex items-center gap-2">
                                                <img className="h-6 w-6 rounded-full ring-2 ring-zinc-800" src="https://i.pravatar.cc/100?img=15" alt="" title="Sarah J." />
                                                <span className="text-sm font-semibold text-zinc-300">Sarah J.</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">Time On Job</p>
                                            <p className="text-sm font-mono text-zinc-300">01:45:12</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* BAY 4: Blocked by Parts */}
                            <div className="bg-amber-950/10 rounded-xl border-2 border-amber-500/30 flex flex-col h-full overflow-hidden relative group/bay">
                                <div className="absolute top-0 right-0 w-full h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(245,158,11,0.03)_10px,rgba(245,158,11,0.03)_20px)] pointer-events-none"></div>
                                {/* Bay Header */}
                                <div className="bg-amber-950/30 px-4 py-3 border-b border-amber-500/20 flex justify-between items-center relative z-10">
                                    <span className="font-black text-xl tracking-tight text-amber-500/60">BAY 4</span>
                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/20 text-amber-500 text-[10px] font-bold uppercase tracking-wider border border-amber-500/30">
                                        <AlertTriangle className="w-3 h-3" /> Blocked
                                    </span>
                                </div>
                                {/* Bay Content */}
                                <div className="p-4 flex-1 flex flex-col justify-between relative z-10">
                                    <div>
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className="font-bold text-lg text-white">2023 Ford F-150 Responder</h4>
                                            <Link to="/jobs/mock" className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded hover:bg-amber-500/20 transition-colors">#4052</Link>
                                        </div>
                                        <p className="text-sm text-zinc-400 font-medium">Springfield PD</p>
                                        <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded p-2 flex flex-col gap-1.5">
                                            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> Blocked 2 Days</p>
                                            <p className="text-xs text-amber-200/80 font-medium">Waiting on Push Bumper Assembly (Setina). Marked damaged on arrival.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Parking Lot / Assembly Area (Sidebar) */}
                        <div className="space-y-4">

                            {/* Parking Lot / Queue */}
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col h-[300px]">
                                <div className="bg-zinc-950 px-4 py-3 border-b border-zinc-800 flex justify-between items-center">
                                    <h4 className="font-bold text-white flex items-center gap-2"><MapPin className="w-4 h-4 text-zinc-500" /> Lot / Queue</h4>
                                    <span className="text-xs font-bold bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">4 Vehicles</span>
                                </div>
                                <div className="p-2 space-y-2 overflow-y-auto hide-scrollbar flex-1">
                                    {/* spot A4 */}
                                    <div className="bg-zinc-800/50 p-2.5 rounded border border-zinc-700/50 flex gap-3">
                                        <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-700 flex flex-col items-center justify-center shrink-0">
                                            <span className="text-[8px] font-bold text-zinc-500 mb-0.5">SPOT</span>
                                            <span className="text-sm font-black text-white">A4</span>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-semibold text-sm text-white truncate max-w-[130px]" title="2024 Tahoe PPV">2024 Tahoe PPV</span>
                                                <span className="text-[9px] font-bold uppercase tracking-wider bg-zinc-700 px-1.5 py-0.5 rounded text-zinc-300 shrink-0">Intake Done</span>
                                            </div>
                                            <p className="text-[10px] text-zinc-500 font-mono">VIN...4912 • Ready for Bay</p>
                                        </div>
                                    </div>

                                    {/* spot C2 */}
                                    <div className="bg-amber-900/10 p-2.5 rounded border border-amber-500/20 flex gap-3">
                                        <div className="w-10 h-10 rounded bg-amber-500/10 border border-amber-500/20 flex flex-col items-center justify-center shrink-0">
                                            <span className="text-[8px] font-bold text-amber-500/70 mb-0.5">SPOT</span>
                                            <span className="text-sm font-black text-amber-500">C2</span>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-semibold text-sm text-white truncate max-w-[130px]" title="2023 F-150">2023 F-150</span>
                                                <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">Parts Hold</span>
                                            </div>
                                            <p className="text-[10px] text-amber-500/60 font-mono">VIN...8821 • Missing Lightbar</p>
                                        </div>
                                    </div>

                                    {/* spot H5 */}
                                    <div className="bg-emerald-900/10 p-2.5 rounded border border-emerald-500/20 flex gap-3">
                                        <div className="w-10 h-10 rounded bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center justify-center shrink-0">
                                            <span className="text-[8px] font-bold text-emerald-500/70 mb-0.5">SPOT</span>
                                            <span className="text-sm font-black text-emerald-500">H5</span>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-semibold text-sm text-white truncate max-w-[130px]" title="Dodge Charger">Dodge Charger</span>
                                                <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">QA Passed</span>
                                            </div>
                                            <p className="text-[10px] text-emerald-500/60 font-mono">Ready for Delivery</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Quick Alerts Feed */}
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col flex-1 min-h-[150px]">
                                <div className="bg-zinc-950 px-4 py-3 border-b border-zinc-800">
                                    <h4 className="font-bold text-zinc-400 text-xs tracking-widest uppercase">Live Dispatch Stream</h4>
                                </div>
                                <div className="p-4 space-y-3 overflow-y-auto hide-scrollbar">
                                    <div className="flex gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0"></div>
                                        <div>
                                            <p className="text-xs text-zinc-300"><span className="font-bold text-white">Bay 2</span> requested assistance.</p>
                                            <p className="text-[10px] text-zinc-500">2 mins ago</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0"></div>
                                        <div>
                                            <p className="text-xs text-zinc-300"><span className="font-bold text-white">Parts Dept</span> marked <span className="font-mono text-amber-400">#4052</span> Bumper arriving tomorrow via UPS.</p>
                                            <p className="text-[10px] text-zinc-500">45 mins ago</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}
