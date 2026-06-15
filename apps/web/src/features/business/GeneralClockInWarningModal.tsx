import { X, AlertCircle, Play, ArrowRight } from 'lucide-react';

interface GeneralClockInWarningModalProps {
  assignedTasks: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
  onClockIntoTask: (taskId: string, taskTitle: string) => void;
  onClockIntoGeneral: () => void;
  onClose: () => void;
}

export function GeneralClockInWarningModal({
  assignedTasks,
  onClockIntoTask,
  onClockIntoGeneral,
  onClose
}: GeneralClockInWarningModalProps) {
  return (
    <div 
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-amber-500/20 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-amber-500/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-xl">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">General Labor Clock In</h2>
              <p className="text-[11px] font-extrabold text-zinc-550 dark:text-zinc-400 uppercase tracking-wider mt-1">
                Please Read Carefully
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          <div className="space-y-2">
            <p className="text-sm font-bold text-zinc-850 dark:text-zinc-200">
              Please be sure there is no specific task assigned to what you are working on.
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-350 leading-relaxed font-medium">
              If you are working on one of your assigned tasks, please clock into it directly so your hours are tracked correctly and your efficiency is credited.
            </p>
          </div>

          {/* Assigned Tasks List */}
          <div className="space-y-3">
            <span className="block text-[11px] font-black text-zinc-500 dark:text-zinc-450 uppercase tracking-wider">
              Your Assigned Tasks on this Job
            </span>
            <div className="space-y-2">
              {assignedTasks.map((task) => (
                <div 
                  key={task.id}
                  className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-2xl flex items-center justify-between gap-4 group hover:border-indigo-500/30 transition-all duration-200"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {task.title}
                    </h4>
                    {task.description && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 font-medium leading-normal whitespace-normal">
                        {task.description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onClockIntoTask(task.id, task.title)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md hover:shadow-lg shadow-indigo-500/10 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    Clock In
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 shrink-0 flex flex-col gap-3 bg-zinc-50 dark:bg-zinc-900/50">
          <button 
            type="button"
            onClick={onClockIntoGeneral}
            className="w-full py-3.5 px-4 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-2xl font-black uppercase tracking-wider text-xs transition-all flex justify-center items-center gap-2"
          >
            Clock into General Labor anyway
            <ArrowRight className="w-4 h-4" />
          </button>
          <button 
            type="button" 
            onClick={onClose}
            className="w-full py-3.5 px-4 bg-white dark:bg-zinc-850 hover:bg-zinc-50 text-zinc-650 dark:text-zinc-300 border border-zinc-250 dark:border-zinc-700 rounded-2xl font-bold transition-all text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
