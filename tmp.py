import sys
path = 'c:\\_Projects\\SAEGroup\\src\\pages\\TechPortal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

import re

new_text = '''                                <div className="p-4 space-y-3">
                                    {job.myTasks.map((t: any, idx: number) => {
                                        const isClockedIn = taskTimeLogs.some(log => log.jobId === job.id && log.taskIndex === t.originalIndex);
                                        const isTaskDiscovery = isClockedIn && taskTimeLogs.find(log => log.jobId === job.id && log.taskIndex === t.originalIndex)?.isDiscovery;
                                        const effectiveStatus = isClockedIn ? 'In Progress' : t.status;

                                        return (
                                        <div 
                                            key={idx} 
                                            onClick={() => navigate(/business/tech/task/\/\)} 
                                            className={cursor-pointer rounded-xl border p-4 group transition-all duration-300 hover:ring-2 hover:ring-accent/50 \}
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex items-center gap-3">
                                                    {effectiveStatus === 'In Progress' ? (
                                                        <div className="w-8 h-8 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 shadow-inner">
                                                            <PlayCircle className={w-4 h-4 \ animate-pulse} />
                                                        </div>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 shadow-inner">
                                                            <div className="w-2 h-2 rounded-full bg-zinc-700" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <h3 className={ont-bold text-sm transition-colors \}>{t.title}</h3>
                                                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                                            <span className={inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest \}>{effectiveStatus === 'In Progress' ? (isTaskDiscovery ? 'R&D Active' : 'Clocked In') : t.status}</span>
                                                            <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest flex items-center gap-1">
                                                                <Wrench className="w-3 h-3 text-zinc-600" /> {t.bookTime}h Book
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0 flex items-center gap-4">
                                                    <span className={	ext-[10px] font-black uppercase tracking-widest flex items-center gap-1 transition-colors \}>
                                                        Open Workspace <ArrowRight className="w-4 h-4" />
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )})}
                                </div>'''

start_str = '<div className="p-4 space-y-3">'
end_str = '                    {/* 3. Shop Floor Pool Categories */}'

start_idx = text.find(start_str)
end_idx = text.find(end_str)

if start_idx != -1 and end_idx != -1:
    left = text[:start_idx]
    right = text[end_idx:]
    final_text = left + new_text + "\n                            </div>\n                        </div>\n\n" + right
    with open(path, 'w', encoding='utf-8') as f:
        f.write(final_text)
    print("Replaced successfully")
else:
    print("Could not find start or end")
