import { useState, useMemo } from 'react';
import { X, Search, Check, Loader2 } from 'lucide-react';

interface Job {
  id: string;
  title: string;
  jobNumber?: string;
  customerName?: string;
  status?: string;
}

interface UnassignedTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (whatDidYouDo: string, selectedJobId: string | null) => Promise<void>;
  jobs: Job[];
}

export function UnassignedTaskModal({
  isOpen,
  onClose,
  onSubmit,
  jobs,
}: UnassignedTaskModalProps) {
  const [whatDidYouDo, setWhatDidYouDo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter jobs based on search query
  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return jobs;
    const query = searchQuery.toLowerCase();
    return jobs.filter((job) => {
      const title = (job.title || '').toLowerCase();
      const jobNum = (job.jobNumber || '').toLowerCase();
      const customer = (job.customerName || '').toLowerCase();
      return title.includes(query) || jobNum.includes(query) || customer.includes(query);
    });
  }, [jobs, searchQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatDidYouDo.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(whatDidYouDo, selectedJobId);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-955/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <h3 className="text-lg font-bold text-white">Complete Unassigned Task</h3>
          <button 
            type="button"
            onClick={onClose} 
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* What did you do */}
          <div className="space-y-2">
            <label className="block text-xs font-black uppercase tracking-widest text-zinc-450">
              What did you do? <span className="text-rose-500">*</span>
            </label>
            <textarea
              autoFocus
              required
              rows={3}
              value={whatDidYouDo}
              onChange={(e) => setWhatDidYouDo(e.target.value)}
              placeholder="Describe what you worked on..."
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
            />
          </div>

          {/* Job Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-black uppercase tracking-widest text-zinc-450">
              Assign to a Job (Optional)
            </label>
            
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search jobs by title, number, or customer..."
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>

            {/* List of Jobs */}
            <div className="max-h-48 overflow-y-auto border border-zinc-800 rounded-xl bg-zinc-950 divide-y divide-zinc-850 custom-scrollbar">
              {/* Keep Unassigned option */}
              <button
                type="button"
                onClick={() => setSelectedJobId(null)}
                className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors text-sm font-medium ${
                  selectedJobId === null ? 'bg-indigo-600/10 text-indigo-455' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
                }`}
              >
                <span>Keep Unassigned / No Job</span>
                {selectedJobId === null && <Check className="w-4 h-4 shrink-0" />}
              </button>

              {filteredJobs.length > 0 ? (
                filteredJobs.map((job) => {
                  const isSelected = selectedJobId === job.id;
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedJobId(job.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                        isSelected ? 'bg-indigo-600/10 text-indigo-455' : 'text-zinc-300 hover:text-white hover:bg-zinc-900/40'
                      }`}
                    >
                      <div className="min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-zinc-500">
                            #{job.jobNumber || 'N/A'}
                          </span>
                          {job.status && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 leading-none">
                              {job.status}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold truncate mt-0.5">{job.title}</p>
                        {job.customerName && (
                          <p className="text-xs text-zinc-500 truncate">{job.customerName}</p>
                        )}
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-indigo-400 shrink-0" />}
                    </button>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-zinc-500 italic">
                  No jobs found matching your search.
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2.5 bg-zinc-805 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-sm font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !whatDidYouDo.trim()}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer shadow-md shadow-indigo-600/20 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Complete & Save'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
