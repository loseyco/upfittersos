import sys

path = r'c:\_Projects\SAEGroup\src\pages\TechPortal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("    const [discoveryModal, setDiscoveryModal] = useState<{jobId: string, taskIndex: number, originalTask: any, isOpen: boolean, note: string} | null>(null);\n", "")

start1 = text.find('    const submitDiscoveryNote = async () => {')
end1 = text.find('    const handleCreateUnplannedTask = async () => {')
if start1 != -1 and end1 != -1:
    text = text[:start1] + text[end1:]

start2 = text.find('    const handleToggleDiscoveryClock = async (jobId: string, taskIndex: number, currentTask: any) => {')
end2 = text.find('    if (loading) return null;')
if start2 != -1 and end2 != -1:
    text = text[:start2] + text[end2:]

if 'useNavigate' not in text:
    text = text.replace("import { Link } from 'react-router-dom';", "import { Link, useNavigate } from 'react-router-dom';")

if 'const navigate = useNavigate();' not in text:
    text = text.replace("    const { currentUser, tenantId } = useAuth();", "    const { currentUser, tenantId } = useAuth();\n    const navigate = useNavigate();")

old_assignments = """                                <div className="p-4 space-y-3">
                                    {job.myTasks.map((t: any, idx: number) => {
                                        const isTaskDiscovery = taskTimeLogs.some(log => log.jobId === job.id && log.taskIndex === t.originalIndex && log.isDiscovery);
                                        return (
                                        <div key={idx} className={`rounded-xl border p-4 ${t.status === 'In Progress' ? (isTaskDiscovery ? 'bg-amber-950/30 border-l-2 border-l-amber-500 border-y-amber-500/20 border-r-amber-500/20' : 'bg-zinc-800 border-l-2 border-l-accent border-y-zinc-700/50 border-r-zinc-700/50') : 'bg-zinc-800/30 border-zinc-700/50'}`}>
                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                                <div className="flex items-start gap-3">
                                                    {t.status === 'In Progress' ? (
                                                        <PlayCircle className={`w-5 h-5 ${isTaskDiscovery ? 'text-amber-500' : 'text-accent'} mt-0.5 shrink-0 animate-pulse`} />
                                                    ) : (
                                                        <div className="w-5 h-5 rounded-full border-2 border-zinc-600 mt-0.5 shrink-0" />
                                                    )}
                                                    <div>
                                                        <h3 className="font-semibold text-white text-base">{t.title}</h3>
                                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${t.status === 'In Progress' ? 'bg-accent/20 text-accent border border-accent/30 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>{t.status}</span>
                                                            <span className="text-[10px] text-zinc-500 uppercase font-semibold pl-2 border-l border-zinc-700">Book: {t.bookTime}h</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {t.description && (
                                                    <div className="mt-3 text-sm text-zinc-400 bg-zinc-900/50 p-3 rounded-lg border border-zinc-700/50 whitespace-pre-wrap">
                                                        {t.description}
                                                    </div>
                                                )}
                                                {t.discoveryNotes && t.discoveryNotes.length > 0 && (
                                                    <div className="mt-3 text-sm text-amber-400 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 whitespace-pre-wrap">
                                                        <div className="font-bold text-xs uppercase tracking-widest mb-1">R&D / Discovery Logs</div>
                                                        {t.discoveryNotes.map((dn: any, i: number) => (
                                                            <div key={i} className="mb-2 last:mb-0">
                                                                <span className="font-bold">{dn.authorName}</span>: {dn.text}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            {isTaskDiscovery && (
                                                <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                                                    <h5 className="text-amber-500 font-bold mb-1 flex items-center gap-2"><SearchCode className="w-5 h-5"/> R&D Mode Active</h5>
                                                    <p className="text-amber-500/80 text-sm">Please take detailed photos of your findings using the <strong className="text-amber-400">CompanyCam</strong> mobile app, and document your process deeply to help us build Standard Operating Procedures (SOPs) for future jobs!</p>
                                                </div>
                                            )}
                                            <div className="mt-4 pt-3 border-t border-zinc-700/50 flex flex-wrap gap-2">
                                                {t.status !== 'In Progress' && (
                                                    <button 
                                                        disabled={t.isApproved === false}
                                                        onClick={() => handleUpdateTaskStatus(job.id, t.originalIndex, 'In Progress')} 
                                                        className={`flex-1 ${t.isApproved === false ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 opacity-60 cursor-not-allowed' : 'bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20'} py-2 px-3 rounded text-xs font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap`}
                                                    >
                                                        {t.isApproved === false ? <><span className="text-lg leading-none">⏳</span> Missing Approval</> : <><PlayCircle className="w-4 h-4" /> Clock In</>}
                                                    </button>
                                                )}
                                                {t.status === 'In Progress' && (
                                                    <button onClick={() => handleUpdateTaskStatus(job.id, t.originalIndex, 'Finished')} className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 py-2 px-3 rounded text-xs font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"><CheckCircle2 className="w-4 h-4"/> Mark Finished</button>
                                                )}
                                                {t.status === 'In Progress' && (
                                                    <button 
                                                        onClick={() => handleToggleDiscoveryClock(job.id, t.originalIndex, t)} 
                                                        className={`flex-1 ${isTaskDiscovery ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-500/20' : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border-amber-500/20'} py-2 px-3 rounded text-xs font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap`}
                                                    >
                                                        {isTaskDiscovery ? <><PlayCircle className="w-4 h-4" /> Resume Book Time</> : <><SearchCode className="w-4 h-4" /> Clock R&D Time</>}
                                                    </button>
                                                )}
                                                <button onClick={() => {
                                                    alert("To request an edit for this task or shift, please use the Time Off & Requests tab in the Timeclock app.");
                                                }} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 py-2 px-4 rounded text-xs font-bold transition-colors flex items-center justify-center whitespace-nowrap">Edit Request</button>
                                            </div>
                                        </div>
                                    )})}
                                </div>"""

new_assignments = """                                <div className="p-4 space-y-3">
                                    {job.myTasks.map((t: any, idx: number) => {
                                        const isClockedIn = taskTimeLogs.some(log => log.jobId === job.id && log.taskIndex === t.originalIndex);
                                        const isTaskDiscovery = isClockedIn && taskTimeLogs.find(log => log.jobId === job.id && log.taskIndex === t.originalIndex)?.isDiscovery;
                                        const effectiveStatus = isClockedIn ? 'In Progress' : t.status;

                                        return (
                                        <div 
                                            key={idx} 
                                            onClick={() => navigate(`/business/tech/task/${job.id}/${t.originalIndex}`)} 
                                            className={`cursor-pointer rounded-xl border p-4 group transition-all duration-300 hover:ring-2 hover:ring-accent/50 ${effectiveStatus === 'In Progress' ? (isTaskDiscovery ? 'bg-amber-950/30 border-l-4 border-amber-500 shadow-lg shadow-amber-500/5 hover:border-amber-400' : 'bg-zinc-800/80 border-l-4 border-emerald-500 shadow-lg shadow-emerald-500/5 hover:border-emerald-400') : 'bg-zinc-900/50 hover:bg-zinc-800/80 border-zinc-700/50 border-l-4'}`}
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex items-center gap-3">
                                                    {effectiveStatus === 'In Progress' ? (
                                                        <div className="w-8 h-8 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 shadow-inner">
                                                            <PlayCircle className={`w-4 h-4 ${isTaskDiscovery ? 'text-amber-500' : 'text-emerald-400'} animate-pulse`} />
                                                        </div>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 shadow-inner">
                                                            <div className="w-2 h-2 rounded-full bg-zinc-700" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <h3 className={`font-bold text-sm transition-colors ${effectiveStatus === 'In Progress' ? 'text-white group-hover:text-emerald-300' : 'text-zinc-300 group-hover:text-accent'}`}>{t.title}</h3>
                                                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${effectiveStatus === 'In Progress' ? (isTaskDiscovery ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30') : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700'}`}>{effectiveStatus === 'In Progress' ? (isTaskDiscovery ? 'R&D Active' : 'Clocked In') : t.status}</span>
                                                            <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest flex items-center gap-1">
                                                                <Wrench className="w-3 h-3 text-zinc-600" /> {t.bookTime}h Book
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0 flex items-center gap-4">
                                                    <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 transition-colors ${effectiveStatus === 'In Progress' ? 'text-emerald-500 group-hover:text-emerald-400' : 'text-zinc-600 group-hover:text-accent'}`}>
                                                        Open Workspace <ArrowRight className="w-4 h-4" />
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )})}
                                </div>"""

text = text.replace(old_assignments, new_assignments)


old_pool = """                            {poolTasks.length === 0 ? (
                                <p className="text-zinc-500 text-sm text-center py-4">No unassigned tasks available.</p>
                            ) : poolTasks.map((pt, i) => (
                                <div key={i} className={`transition-colors border rounded-lg p-3 group ${pt.isApproved === false ? 'bg-zinc-900/50 border-amber-500/10' : 'bg-zinc-800/50 hover:bg-zinc-800 border-zinc-700/50'}`}>
                                    <div className="flex items-start justify-between mb-1">
                                        <p className="text-[10px] uppercase font-bold text-zinc-500 line-clamp-1">{pt.jobTitle}</p>
                                        {pt.isApproved === false && <span className="text-[10px] font-black uppercase tracking-widest text-amber-500/70 border border-amber-500/20 px-1.5 rounded-sm">Pending</span>}
                                    </div>
                                    <h4 className={`font-bold text-sm mb-2 ${pt.isApproved === false ? 'text-zinc-500' : 'text-zinc-200'}`}>{pt.title}</h4>
                                    <div className="flex items-center justify-between">
                                        <span className={`text-xs font-bold ${pt.isApproved === false ? 'text-zinc-600' : 'text-emerald-400'}`}>+{pt.bookTime} hrs Book</span>
                                        {pt.isApproved !== false ? (
                                            <button onClick={() => handleUpdateTaskStatus(pt.jobId, pt.taskIndex, 'In Progress')} className="text-[10px] font-bold uppercase tracking-wider bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded transition-colors hidden group-hover:block">Claim Task</button>
                                        ) : (
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500/40">LOCKED</span>
                                        )}
                                    </div>
                                </div>
                            ))}"""

new_pool = """                            {poolTasks.length === 0 ? (
                                <p className="text-zinc-600 font-bold text-sm text-center py-8 bg-zinc-900/50 rounded-2xl border border-zinc-800 border-dashed">No unassigned tasks available.</p>
                            ) : poolTasks.map((pt, i) => (
                                <div key={i} className={`relative transition-all duration-300 border rounded-2xl p-4 group ${pt.isApproved === false ? 'bg-zinc-950/80 border-amber-500/20 shadow-amber-500/5' : 'bg-zinc-900/60 hover:bg-zinc-800/80 border-zinc-700/50 hover:border-indigo-500/30'}`}>
                                    <div className="flex items-start justify-between mb-1.5">
                                        <p className="text-[10px] uppercase font-black tracking-widest text-zinc-500 line-clamp-1">{pt.jobTitle}</p>
                                        {pt.isApproved === false && <span className="text-[10px] font-black uppercase tracking-widest text-amber-500/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Pending</span>}
                                    </div>
                                    <h4 className={`font-bold text-sm mb-3 ${pt.isApproved === false ? 'text-zinc-500' : 'text-zinc-100'}`}>{pt.title}</h4>
                                    <div className="flex items-end justify-between mt-auto">
                                        <span className={`text-xs font-black tracking-widest uppercase ${pt.isApproved === false ? 'text-zinc-600' : 'text-emerald-400'}`}>+{pt.bookTime} hrs Book</span>
                                        {pt.isApproved !== false ? (
                                            <button onClick={(e) => { e.stopPropagation(); navigate(`/business/tech/task/${pt.jobId}/${pt.taskIndex}`); }} className="text-[10px] font-black uppercase tracking-widest bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1.5 rounded-lg transition-colors shadow-lg shadow-indigo-500/20 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 flex items-center gap-1.5">View <ArrowRight className="w-3 h-3"/></button>
                                        ) : (
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500/40">LOCKED</span>
                                        )}
                                    </div>
                                </div>
                            ))}"""

text = text.replace(old_pool, new_pool)

if "ArrowRight" not in text:
    text = text.replace("import { Wrench, PlayCircle, PauseCircle, CheckCircle2, SearchCode, X, Plus, MapPin } from 'lucide-react';", "import { Wrench, PlayCircle, PauseCircle, CheckCircle2, SearchCode, X, Plus, MapPin, ArrowRight } from 'lucide-react';")

start_dm = text.find('            {/* Discovery Modal */}')
end_dm = text.find('            {/* Unplanned Task Modal */}')
if start_dm != -1 and end_dm != -1:
    text = text[:start_dm] + text[end_dm:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Replacement Complete.")