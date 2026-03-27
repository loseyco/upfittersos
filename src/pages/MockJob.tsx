import { ArrowLeft, User, Car, MapPin, Wrench, Clock, CheckCircle2, Circle, AlertTriangle, FileText, Camera, Info, Package, MoreVertical, PlayCircle, PauseCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export function MockJob() {
    return (
        <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Top Nav & Global Job Status */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <Link to="/" className="inline-flex items-center text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Back to Home
                    </Link>

                    {/* Global Job Status */}
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 overflow-x-auto hide-scrollbar">
                        {['Draft', 'Ready to Start', 'In Progress', 'Blocked', 'Ready for QA', 'Ready for Delivery', 'Delivered'].map((status) => (
                            <div key={status} className={`flex items-center whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-semibold ${status === 'In Progress' ? 'bg-accent/20 text-accent border border-accent/30' : 'text-zinc-500 hover:bg-zinc-800 transition-colors cursor-pointer'}`}>
                                {status}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-end justify-between border-b border-zinc-800 pb-6 mb-6">
                    <div className="w-full md:w-1/2">
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-3xl md:text-4xl font-bold">Job #4052</h1>
                            <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-xs font-bold border border-zinc-700">Template: Custom Pursuit Build</span>
                        </div>
                        <p className="text-zinc-400 font-medium mb-5">Created: Mar 22, 2026 | Assigned to: <span className="text-zinc-200">Team Alpha</span></p>

                        {/* Progress Tracker requested by User */}
                        <div className="w-full max-w-md space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                                <span className="text-accent flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> 75% Complete</span>
                                <span className="text-zinc-400 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">ETA: Mar 26, 14:00</span>
                            </div>
                            <div className="h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800 shadow-inner">
                                <div className="h-full bg-accent relative" style={{ width: '75%' }}></div>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-4 mt-6 md:mt-0">
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-right">
                            <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">Book Time</p>
                            <p className="text-2xl font-black text-white">18.5 <span className="text-sm font-bold text-zinc-600">hrs</span></p>
                        </div>
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-right">
                            <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">Actual Time</p>
                            <p className="text-2xl font-black text-accent">14.2 <span className="text-sm font-bold text-zinc-600">hrs</span></p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content (Vehicle info + Tasks) */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Vehicle & Customer details collapsed into one card for space */}
                        <div className="bg-zinc-900/50 rounded-2xl p-6 border border-white/5 backdrop-blur-sm">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
                                        <Car className="w-4 h-4 text-accent" /> Vehicle Specs
                                    </h2>
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-zinc-200 font-bold text-lg">2023 Ford F-150 Police Responder</p>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div>
                                                <p className="text-xs text-zinc-500 uppercase font-semibold">VIN</p>
                                                <p className="text-zinc-300 font-mono text-sm">1FTFW1E81PKD12345</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-zinc-500 uppercase font-semibold">Unit Number</p>
                                                <p className="text-zinc-300 text-sm">#412</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="border-t border-white/5 pt-4 md:border-t-0 md:pt-0 md:border-l md:pl-6">
                                    <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
                                        <User className="w-4 h-4 text-accent" /> Customer Details
                                    </h2>
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-zinc-200 font-bold text-lg">Springfield Police Dept.</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-zinc-500 uppercase font-semibold">Primary Contact</p>
                                            <p className="text-zinc-300 text-sm">Chief Wiggum (555-0199)</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Intake / Progress Photos */}
                        <div className="bg-zinc-900/50 rounded-2xl p-6 border border-white/5 backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold flex items-center gap-2"><Camera className="w-5 h-5 text-accent" /> Job Media & Intake</h2>
                                <button className="text-xs font-semibold text-accent hover:text-white transition-colors bg-accent/10 px-3 py-1.5 rounded-md">View All Media</button>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                                <div className="aspect-square bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 relative group cursor-pointer">
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none"><span className="font-semibold text-xs text-white">View</span></div>
                                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500">
                                        <Camera className="w-6 h-6 mb-1 opacity-20" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Intake Front</span>
                                    </div>
                                </div>
                                <div className="aspect-square bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 relative group cursor-pointer">
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none"><span className="font-semibold text-xs text-white">View</span></div>
                                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500">
                                        <Camera className="w-6 h-6 mb-1 opacity-20" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Intake Rear</span>
                                    </div>
                                </div>
                                <div className="aspect-square bg-zinc-800 rounded-lg flex flex-col items-center justify-center border border-dashed border-zinc-600 cursor-pointer hover:border-zinc-400 hover:bg-zinc-800/50 transition-colors">
                                    <Camera className="w-5 h-5 text-zinc-400 mb-1" />
                                    <span className="text-zinc-400 text-xs font-medium">Add Photo</span>
                                </div>
                            </div>
                        </div>

                        {/* ADVANCED TASK LIST */}
                        <div className="bg-zinc-900/50 rounded-2xl p-6 border border-white/5 backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Wrench className="w-5 h-5 text-accent" /> Work Order Tasks
                                </h2>
                                <button className="text-xs bg-white text-black font-bold px-3 py-1.5 rounded-md hover:bg-zinc-200 transition-colors">Assign Me to Open Task</button>
                            </div>

                            <div className="space-y-4">
                                {/* Task 1: Finished */}
                                <div className="bg-zinc-800/30 rounded-xl border border-zinc-700/50 p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-3">
                                        <div className="flex items-start gap-3">
                                            <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                                            <div>
                                                <h3 className="font-semibold text-white text-base">Install Whelen Inner Edge FST</h3>
                                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Finished</span>
                                                    <span className="text-xs text-zinc-500 font-medium px-2 border-l border-zinc-700">Actual: <span className="text-zinc-300">1.5h</span> / Book: 1.5h</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex -space-x-2 shrink-0">
                                            <img className="inline-block h-8 w-8 rounded-full ring-2 ring-zinc-900" src="https://i.pravatar.cc/100?img=11" alt="" />
                                            <div className="flex items-center justify-center h-8 w-8 rounded-full ring-2 ring-zinc-900 bg-zinc-800 text-[10px] font-bold text-zinc-400">+1</div>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1 pt-1 hide-scrollbar">
                                        <div className="w-14 h-14 rounded border border-zinc-700/50 bg-zinc-900 overflow-hidden shrink-0 relative group cursor-pointer">
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none"><span className="font-semibold text-[10px] text-white uppercase">View</span></div>
                                            <img src="https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=150&h=150" alt="Lightbar" className="w-full h-full object-cover opacity-80" />
                                        </div>
                                        <div className="w-14 h-14 rounded border border-zinc-700/50 bg-zinc-900 overflow-hidden shrink-0 relative group cursor-pointer">
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none"><span className="font-semibold text-[10px] text-white uppercase">View</span></div>
                                            <img src="https://images.unsplash.com/photo-1605335198031-6e3e5c94d0c1?auto=format&fit=crop&q=80&w=150&h=150" alt="Wiring" className="w-full h-full object-cover opacity-80" />
                                        </div>
                                        <div className="w-14 h-14 rounded border border-dashed border-zinc-700/50 bg-zinc-900/50 hover:bg-zinc-800 transition-colors flex items-center justify-center shrink-0 cursor-pointer text-zinc-500">
                                            <Camera className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>

                                {/* Task 2: In Progress (Multi-User, Parts) */}
                                <div className="bg-zinc-800 border-l-2 border-l-accent rounded-xl border-y border-r border-zinc-700/50 p-4 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4 relative z-10">
                                        <div className="flex items-start gap-3">
                                            <PlayCircle className="w-5 h-5 text-accent mt-0.5 shrink-0 animate-pulse" />
                                            <div>
                                                <h3 className="font-semibold text-white text-base">Configure Qwik Harness Control Panel</h3>
                                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent border border-accent/30 shadow-[0_0_10px_rgba(59,130,246,0.3)]">In Progress</span>
                                                    <span className="text-xs font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded ml-1">⏱️ 02:14:00</span>
                                                    <span className="text-[10px] text-zinc-500 uppercase font-semibold pl-2 border-l border-zinc-700">Book: 3.0h</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="flex -space-x-2">
                                                <img className="inline-block h-8 w-8 rounded-full ring-2 ring-zinc-800" src="https://i.pravatar.cc/100?img=33" alt="" title="Paul L." />
                                                <img className="inline-block h-8 w-8 rounded-full ring-2 ring-zinc-800" src="https://i.pravatar.cc/100?img=12" alt="" title="John D. (Training)" />
                                            </div>
                                            <button className="text-zinc-400 hover:text-white"><MoreVertical className="w-4 h-4" /></button>
                                        </div>
                                    </div>

                                    {/* Task specific Parts & Guides */}
                                    <div className="bg-zinc-900/80 rounded-lg p-3 relative z-10 border border-zinc-800">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Required Parts</h4>
                                            <span className="text-[10px] text-zinc-500">Mgr: <button className="text-accent hover:underline">Edit Status</button></span>
                                        </div>
                                        <div className="space-y-2 mb-4">
                                            <div className="flex items-center justify-between text-sm bg-zinc-800/50 px-3 py-2 rounded border border-white/5">
                                                <span className="text-zinc-300 font-medium">SAE-QH-F150 Base Panel</span>
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400">With Vehicle</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm bg-zinc-800/50 px-3 py-2 rounded border border-white/5">
                                                <span className="text-zinc-300 font-medium">10AWG Power Lead (15ft)</span>
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400">With Vehicle</span>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold py-1.5 rounded transition-colors text-zinc-300">
                                                <FileText className="w-3.5 h-3.5" /> View SOP Guide
                                            </button>
                                            <button className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold py-1.5 rounded transition-colors text-zinc-300">
                                                <Info className="w-3.5 h-3.5 text-yellow-500" /> Tech Tips (2)
                                            </button>
                                            <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded transition-colors flex items-center justify-center" title="Add Photo to Task">
                                                <Camera className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-zinc-700/50 flex justify-between items-center relative z-10 w-full">
                                        <button className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-wider transition-colors bg-emerald-400/10 hover:bg-emerald-400/20 px-3 py-1.5 rounded"><PlayCircle className="w-3.5 h-3.5" /> Clock In to Task</button>
                                        <div className="flex gap-2">
                                            <button className="bg-amber-500/20 text-amber-500 border border-amber-500/30 px-3 py-1.5 rounded text-xs font-bold hover:bg-amber-500/30 transition-colors">Mark Blocked</button>
                                            <button className="bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-500/30 transition-colors">Submit for QA</button>
                                        </div>
                                    </div>
                                </div>

                                {/* Task 3: Blocked (Waiting on part/damaged) */}
                                <div className="bg-amber-900/10 rounded-xl border border-amber-500/20 p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                                            <div>
                                                <h3 className="font-semibold text-white text-base">Push Bumper Assembly (Setina)</h3>
                                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-500 border border-amber-500/30">Blocked</span>
                                                    <span className="text-xs text-zinc-400 font-medium px-2 border-l border-zinc-700">Book: 2.0h</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex -space-x-2 shrink-0 opacity-50 grayscale">
                                            <img className="inline-block h-8 w-8 rounded-full ring-2 ring-zinc-900" src="https://i.pravatar.cc/100?img=5" alt="" />
                                        </div>
                                    </div>
                                    <div className="mt-3 bg-amber-500/10 rounded border border-amber-500/20 p-2.5">
                                        <p className="text-xs text-amber-400 font-medium flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Blocked Reason: <span className="text-amber-200">Main bracket arrived bent. Marked damaged by tech. Awaiting replacement shipment.</span></p>
                                    </div>
                                </div>

                                {/* Task 4: Not Started */}
                                <div className="bg-zinc-800/20 rounded-xl border border-white/5 p-4 opacity-75">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            <Circle className="w-5 h-5 text-zinc-600 mt-0.5 shrink-0" />
                                            <div>
                                                <h3 className="font-semibold text-zinc-300 text-base">Final Wrap Graphics</h3>
                                                <div className="flex items-center gap-2 mt-1.5">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700">Not Started</span>
                                                </div>
                                            </div>
                                        </div>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold text-zinc-500">Unassigned</span>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>

                    {/* Sidebar / Lifecycle Timeline */}
                    <div className="space-y-6">
                        {/* ETA Card */}
                        <div className="bg-zinc-900/50 rounded-2xl p-6 border border-amber-500/20 backdrop-blur-sm relative overflow-hidden group">
                            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500 via-zinc-900 to-zinc-900"></div>
                            <h3 className="text-amber-500/80 text-xs font-bold uppercase tracking-widest mb-1 relative z-10">Estimated Completion</h3>
                            <p className="text-2xl font-black text-amber-500 relative z-10 tracking-tight flex items-center gap-2"><AlertTriangle className="w-5 h-5 mb-0.5" /> ETA Unknown</p>
                            <p className="text-zinc-400 text-xs mt-2 relative z-10 font-medium leading-relaxed">System cannot calculate ETA based on book time. Job is blocked by missing <span className="text-zinc-300 font-bold">Push Bumper Assembly</span> with no inbound tracking data available.</p>
                        </div>

                        {/* Current Location Mini Map */}
                        <div className="bg-zinc-900/50 rounded-2xl p-6 border border-white/5 backdrop-blur-sm text-center relative overflow-hidden group">
                            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-accent via-zinc-900 to-zinc-900 transition-opacity group-hover:opacity-40"></div>
                            <MapPin className="w-10 h-10 text-accent mx-auto mb-3 relative z-10" />
                            <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1 relative z-10">Current Location</h3>
                            <p className="text-4xl font-black text-white relative z-10 tracking-tight">Bay 4</p>
                            <button className="mt-6 text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-md font-semibold transition-colors relative z-10 w-full">Move Vehicle</button>
                        </div>

                        {/* Granular Timeline */}
                        <div className="bg-zinc-900/50 rounded-2xl p-6 border border-white/5 backdrop-blur-sm">
                            <h3 className="text-zinc-400 text-sm font-bold uppercase tracking-wider mb-6 flex items-center gap-2">
                                <Clock className="w-4 h-4" /> Job Lifecycle
                            </h3>
                            <div className="space-y-5 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-emerald-500 before:via-accent before:to-zinc-800">

                                <div className="relative flex items-start gap-4">
                                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-500 shrink-0 z-10 border border-emerald-500/30 mt-0.5">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">Intake Complete</p>
                                        <p className="text-zinc-500 text-xs mt-0.5 font-medium">Mar 22, 08:00 AM • Tagged by Front Desk</p>
                                    </div>
                                </div>

                                <div className="relative flex items-start gap-4">
                                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent shrink-0 z-10 border border-accent/30 mt-0.5">
                                        <PlayCircle className="w-3.5 h-3.5" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">Job Started</p>
                                        <p className="text-zinc-500 text-xs mt-0.5 font-medium">Mar 23, 09:30 AM • Pulled into Bay 4</p>
                                    </div>
                                </div>

                                <div className="relative flex items-start gap-4">
                                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-500 shrink-0 z-10 border border-amber-500/30 mt-0.5">
                                        <PauseCircle className="w-3.5 h-3.5" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">Blocked (Parts Issue)</p>
                                        <p className="text-amber-500/80 text-xs mt-0.5 font-medium bg-amber-500/10 px-2 py-1 rounded inline-block">Duration: 2 days, 4 hrs</p>
                                        <p className="text-zinc-500 text-[10px] mt-1">Mar 23, 11:15 AM to Mar 25, 03:00 PM</p>
                                    </div>
                                </div>

                                <div className="relative flex items-start gap-4">
                                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-accent text-white shrink-0 z-10 border border-accent ring-4 ring-accent/20 mt-0.5">
                                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">In Progress</p>
                                        <p className="text-zinc-500 text-xs mt-0.5 font-medium">Currently active on 1 task</p>
                                    </div>
                                </div>

                                <div className="relative flex items-start gap-4">
                                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-900 border-2 border-zinc-700 shrink-0 z-10 mt-0.5">
                                    </div>
                                    <div>
                                        <p className="font-medium text-zinc-600 text-sm">Ready for QA</p>
                                    </div>
                                </div>
                                <div className="relative flex items-start gap-4">
                                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-900 border-2 border-zinc-700 shrink-0 z-10 mt-0.5">
                                    </div>
                                    <div>
                                        <p className="font-medium text-zinc-600 text-sm">Ready for Delivery</p>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
