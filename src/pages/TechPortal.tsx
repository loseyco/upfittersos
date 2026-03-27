import { Wrench, PlayCircle, PauseCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export function TechPortal() {
    return (
        <div className="flex-1 bg-zinc-950 p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* 1. Personal Dashboard & Header */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Welcome & Time Clock Controls */}
                    <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                            <div>
                                <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                                    <span className="bg-accent/10 p-2 rounded-lg"><Wrench className="w-6 h-6 text-accent" /></span>
                                    Good morning, Paul L.
                                </h2>
                                <p className="mt-2 text-zinc-400">Current Shift: <span className="text-white font-mono font-bold ml-1 tracking-wider">04:12:05</span></p>
                            </div>
                            <div className="flex flex-col gap-2 w-full sm:w-auto">
                                <button className="w-full sm:w-auto bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 px-6 py-2.5 rounded-lg text-sm font-bold tracking-wide uppercase transition-colors flex items-center justify-center gap-2">
                                    <PauseCircle className="w-4 h-4" /> Start Break
                                </button>
                                <button className="w-full sm:w-auto bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-6 py-2.5 rounded-lg text-sm font-bold tracking-wide uppercase transition-colors flex items-center justify-center gap-2">
                                    Punch Out
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Book Time Metrics */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-center">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 text-center">Weekly Book Time</h3>
                        <div className="flex items-end justify-center gap-2 mb-3">
                            <span className="text-4xl font-black text-emerald-400">34.5</span>
                            <span className="text-zinc-500 font-bold mb-1">/ 40 hrs</span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-2 mb-2 overflow-hidden">
                            <div className="bg-emerald-400 h-2 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]" style={{ width: '86%' }}></div>
                        </div>
                        <p className="text-center text-xs font-semibold text-zinc-400">Targeting minimum for benefits</p>

                        <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center px-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Queued Potential:</span>
                            <span className="text-sm font-bold text-accent">+12.0 hrs</span>
                        </div>
                    </div>
                </div>

                {/* Main Content Split */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* 2. My Active Assignments (Grouped by Job) */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-semibold text-white">My Assignments</h3>
                            <span className="bg-zinc-800 text-zinc-300 text-xs font-bold px-2 py-1 rounded">2 Jobs Active</span>
                        </div>

                        {/* Job Group 1 */}
                        <div className="bg-zinc-900/50 rounded-2xl border border-white/5 overflow-hidden">
                            {/* Job Header */}
                            <div className="bg-zinc-800/50 p-4 border-b border-zinc-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <Link to="/jobs/mock" className="text-sm font-mono text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20 hover:bg-accent/20 transition-colors">Job #4052</Link>
                                        <span className="text-xs text-zinc-400 font-medium">Springfield PD</span>
                                    </div>
                                    <h4 className="text-lg font-bold text-white">2023 Ford F-150 Responder</h4>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-1">Assigned Book Time</p>
                                    <p className="text-lg font-bold text-accent">3.0 hrs</p>
                                </div>
                            </div>

                            {/* Tasks within Job */}
                            <div className="p-4 space-y-3">
                                {/* Task: In Progress */}
                                <div className="bg-zinc-800 border-l-2 border-l-accent rounded-xl border-y border-r border-zinc-700/50 p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            <PlayCircle className="w-5 h-5 text-accent mt-0.5 shrink-0 animate-pulse" />
                                            <div>
                                                <h3 className="font-semibold text-white text-base">Configure Qwik Harness Panel</h3>
                                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent border border-accent/30 shadow-[0_0_10px_rgba(59,130,246,0.3)]">In Progress</span>
                                                    <span className="text-xs font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded ml-1">⏱️ 02:14:00</span>
                                                    <span className="text-[10px] text-zinc-500 uppercase font-semibold pl-2 border-l border-zinc-700">Book: 3.0h</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex -space-x-2 shrink-0">
                                            <img className="inline-block h-8 w-8 rounded-full ring-2 ring-zinc-800" src="https://i.pravatar.cc/100?img=33" alt="" />
                                            <img className="inline-block h-8 w-8 rounded-full ring-2 ring-zinc-800" src="https://i.pravatar.cc/100?img=12" alt="" />
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-zinc-700/50">
                                        <button className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 py-2 rounded text-xs font-bold transition-colors">Submit Task for QA</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Job Group 2 */}
                        <div className="bg-zinc-900/50 rounded-2xl border border-white/5 overflow-hidden">
                            <div className="bg-zinc-800/50 p-4 border-b border-zinc-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="text-sm font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">Job #4088</span>
                                        <span className="text-xs text-zinc-400 font-medium">Lake County Sheriff</span>
                                    </div>
                                    <h4 className="text-lg font-bold text-white">2024 Ford Explorer PIU</h4>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-1">Assigned Book Time</p>
                                    <p className="text-lg font-bold text-white">9.0 hrs</p>
                                </div>
                            </div>

                            <div className="p-4 space-y-3">
                                {/* Task: Not Started */}
                                <div className="bg-zinc-800/30 rounded-xl border border-zinc-700/50 p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            <div className="w-5 h-5 rounded-full border-2 border-zinc-600 mt-0.5 shrink-0" />
                                            <div>
                                                <h3 className="font-semibold text-zinc-300 text-base">Full Lightbar Setup & Wiring</h3>
                                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700">Ready</span>
                                                    <span className="text-[10px] text-zinc-500 uppercase font-semibold pl-2 border-l border-zinc-700">Book: 9.0h</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex -space-x-2 shrink-0 opacity-80">
                                            <img className="inline-block h-8 w-8 rounded-full ring-2 ring-zinc-800" src="https://i.pravatar.cc/100?img=33" alt="" />
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-zinc-700/50">
                                        <button className="w-full bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 py-2 rounded text-xs font-bold transition-colors flex items-center justify-center gap-2"><PlayCircle className="w-4 h-4" /> Clock In to Task</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* 3. Shop Floor Pool (Available Tasks) */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-zinc-400">Shop Pool</h3>
                            <span className="text-xs font-bold text-accent">Claim Work</span>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                            {/* Pool Item */}
                            <div className="bg-zinc-800/50 hover:bg-zinc-800 transition-colors border border-zinc-700/50 rounded-lg p-3 group">
                                <p className="text-xs font-mono text-zinc-500 mb-1">Job #4102</p>
                                <h4 className="font-bold text-sm text-zinc-200 mb-2">Install Front Grill Ligths (Pair)</h4>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-emerald-400">+1.5 hrs Book</span>
                                    <button className="text-[10px] font-bold uppercase tracking-wider bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded transition-colors hidden group-hover:block">Claim Task</button>
                                </div>
                            </div>

                            {/* Pool Item */}
                            <div className="bg-zinc-800/50 hover:bg-zinc-800 transition-colors border border-zinc-700/50 rounded-lg p-3 group">
                                <p className="text-xs font-mono text-zinc-500 mb-1">Job #4099</p>
                                <h4 className="font-bold text-sm text-zinc-200 mb-2">Center Console Prep & Drill</h4>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-emerald-400">+2.0 hrs Book</span>
                                    <button className="text-[10px] font-bold uppercase tracking-wider bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded transition-colors hidden group-hover:block">Claim Task</button>
                                </div>
                            </div>

                            {/* Pool Item */}
                            <div className="bg-zinc-800/50 hover:bg-zinc-800 transition-colors border border-zinc-700/50 rounded-lg p-3 group">
                                <p className="text-xs font-mono text-zinc-500 mb-1">Facility Operations</p>
                                <h4 className="font-bold text-sm text-zinc-200 mb-2">Bay 4 Deep Clean</h4>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-emerald-400">+1.0 hrs Book</span>
                                    <button className="text-[10px] font-bold uppercase tracking-wider bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded transition-colors hidden group-hover:block">Claim Task</button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
