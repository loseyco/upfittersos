import React, { useMemo } from 'react';
import { Play, Square, Settings, CalendarDays, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export function MyTasksWidget({ allJobs, globalOpenTaskLogs, currentUserId, onTaskClockToggle, onJobClick }: {
    allJobs: any[],
    globalOpenTaskLogs: any[],
    currentUserId?: string,
    onTaskClockToggle: (job: any, task: any, isCurrentlyClockedIn: boolean, logId?: string) => void,
    onJobClick: (job: any, payload?: any) => void
}) {

    const myActiveLogs = useMemo(() => {
        if (!currentUserId) return [];
        return globalOpenTaskLogs.filter(log => log.userId === currentUserId || log.staffId === currentUserId);
    }, [globalOpenTaskLogs, currentUserId]);

    const myAssignedTasks = useMemo(() => {
        if (!currentUserId) return [];
        const tasks: any[] = [];
        allJobs.forEach(job => {
            if (job.status === 'Draft' || job.status === 'Estimate' || job.status === 'Archived' || job.archived) return;
            (job.tasks || []).forEach((t: any, idx: number) => {
                if (t.assignedUids?.includes(currentUserId) || t.assignedTo?.includes(currentUserId)) {
                    if (t.status !== 'Finished' && t.status !== 'Delivered' && t.status !== 'Ready for QA') {
                        // Exclude tasks I'm currently clocked into
                        if (!myActiveLogs.some(log => log.jobId === job.id && log.taskName === t.title)) {
                            tasks.push({
                                job,
                                task: { ...t, originalIndex: idx },
                                jobDueDate: job.dueDate || job.completionEta || job.pickupEta
                            });
                        }
                    }
                }
            });
        });
        
        // Sort by impending due dates or job creation
        tasks.sort((a, b) => {
            const timeA = a.jobDueDate ? new Date(a.jobDueDate).getTime() : Infinity;
            const timeB = b.jobDueDate ? new Date(b.jobDueDate).getTime() : Infinity;
            return timeA - timeB;
        });
        
        return tasks.slice(0, 3); // Max 3 suggestions
    }, [allJobs, currentUserId, myActiveLogs]);

    if (!currentUserId) return null;
    if (myActiveLogs.length === 0 && myAssignedTasks.length === 0) return null;

    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 pl-1">My Quick Actions</h3>
            <div className="flex flex-row overflow-x-auto hide-scrollbar gap-2 pb-1">
                {/* Currently Clocked In */}
                {myActiveLogs.map(log => {
                    const jobInfo = allJobs.find(j => j.id === log.jobId);
                    const taskInfo = jobInfo?.tasks?.find((t: any) => t.title === log.taskName);
                    return (
                        <div key={log.id} 
                             onClick={() => { if (jobInfo) onJobClick(jobInfo, { status: jobInfo.status, focusTask: log.taskName }); }}
                             className="cursor-pointer shrink-0 w-64 bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/60 rounded-lg p-1.5 pl-3 flex items-center justify-between group relative overflow-hidden h-12 drop-shadow-sm transition-colors">
                            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                            <div className="flex flex-col truncate w-full pr-2">
                                <div className="text-[10px] font-bold text-emerald-400 truncate flex items-center gap-1.5">
                                    <Settings className="w-3 h-3 animate-spin" style={{ animationDuration: '3s' }}/> 
                                    {log.taskName}
                                </div>
                                <div className="text-[10px] font-medium text-zinc-400 truncate leading-tight mt-0.5">{jobInfo?.title || 'Unknown Job'}</div>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onTaskClockToggle(jobInfo, taskInfo || { title: log.taskName, originalIndex: log.taskIndex }, true, log.id); }}
                                className="shrink-0 flex items-center justify-center gap-1 bg-red-500 hover:bg-red-600 text-white font-bold text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-md transition-colors shadow-sm"
                            >
                                <Square className="w-2.5 h-2.5 fill-current" /> Stop
                            </button>
                        </div>
                    );
                })}

                {/* Suggested Next Tasks */}
                {myAssignedTasks.map((tInfo, idx) => (
                    <div key={`sug-${idx}`} 
                         onClick={() => onJobClick(tInfo.job, { status: tInfo.job.status, focusTask: tInfo.task.title })}
                         className="cursor-pointer shrink-0 w-64 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-lg p-1.5 pl-3 flex items-center justify-between group h-12 relative overflow-hidden transition-colors">
                        <div className="absolute top-0 left-0 w-1 h-full bg-zinc-800 group-hover:bg-indigo-500 transition-colors"></div>
                        <div className="flex flex-col truncate w-full pr-2">
                            <div className="text-[10px] font-bold text-zinc-300 truncate group-hover:text-white transition-colors">
                                {tInfo.task.title}
                            </div>
                            <div className="text-[9px] font-medium text-zinc-500 truncate leading-tight mt-0.5">{tInfo.job.title}</div>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); onTaskClockToggle(tInfo.job, tInfo.task, false); }}
                            className="shrink-0 flex items-center justify-center gap-1 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white border border-indigo-500/30 font-bold text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-md transition-all shadow-sm"
                        >
                            <Play className="w-2.5 h-2.5 fill-current" /> Start
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
