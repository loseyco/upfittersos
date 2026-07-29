import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, where, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  CheckCircle, 
  Clock, 
  ExternalLink, 
  Search, 
  AlertCircle, 
  Trash2,
  Bug,
  Lightbulb,
  MessageSquare,
  Zap,
  Play,
  Flame,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';

interface FeedbackReport {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  tenantId: string | null;
  type: 'bug' | 'feature' | 'general';
  description: string;
  imageUrl: string | null;
  route: string;
  status: 'open' | 'resolved';
  priorityNum?: number; // 0 to 5
  priority?: string;
  convertedTaskId?: string;
  convertedJobId?: string;
  convertedTaskTitle?: string;
  createdAt: any;
}

const PRIORITY_BADGES: Record<number, { label: string; bg: string; text: string; border: string }> = {
  5: { label: '🔥 5 - DO NOW', bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-500/40' },
  4: { label: '⚡ 4 - HIGH', bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40' },
  3: { label: '🟦 3 - MEDIUM', bg: 'bg-indigo-500/20', text: 'text-indigo-300', border: 'border-indigo-500/40' },
  2: { label: '🟢 2 - LOW', bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40' },
  1: { label: '⚪ 1 - LOWEST', bg: 'bg-zinc-800', text: 'text-zinc-300', border: 'border-zinc-700' },
  0: { label: '🔘 0 - NO PRIORITY', bg: 'bg-slate-800/60', text: 'text-slate-400', border: 'border-slate-700/60' },
};

export function FeedbackReports({ tenantId }: { tenantId?: string }) {
  const { user, tenantId: authTenantId } = useAuthStore();
  const effectiveTenantId = tenantId || authTenantId || '';

  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'bug' | 'feature' | 'general'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'date'>('priority');

  // Convert Modal State
  const [convertingReport, setConvertingReport] = useState<FeedbackReport | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [bookTime, setBookTime] = useState('1.0');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  useEffect(() => {
    let q = query(collection(db, 'feedback_reports'), orderBy('createdAt', 'desc'));
    if (effectiveTenantId) {
      q = query(
        collection(db, 'feedback_reports'),
        where('tenantId', '==', effectiveTenantId)
      );
    }
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: FeedbackReport[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        let pNum = typeof d.priorityNum === 'number' ? d.priorityNum : 0;
        if (!('priorityNum' in d) && d.priority) {
          if (d.priority === 'urgent') pNum = 5;
          else if (d.priority === 'high') pNum = 4;
          else if (d.priority === 'medium') pNum = 3;
          else if (d.priority === 'low') pNum = 2;
        }

        data.push({
          id: docSnap.id,
          ...d,
          priorityNum: pNum
        } as FeedbackReport);
      });

      setReports(data);
      setLoading(false);
    }, (error) => {
      console.error('FeedbackReports fetch error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [effectiveTenantId]);

  const filteredReports = useMemo(() => {
    let result = reports.filter((report) => {
      const matchesSearch = 
        report.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.userEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.userName?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = typeFilter === 'all' || report.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || report.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });

    return result.sort((a, b) => {
      if (sortBy === 'priority') {
        const pDiff = (b.priorityNum || 0) - (a.priorityNum || 0);
        if (pDiff !== 0) return pDiff;
      }
      const getMs = (val: any) => {
        if (!val) return 0;
        if (val.seconds) return val.seconds * 1000;
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        return new Date(val).getTime() || 0;
      };
      return getMs(b.createdAt) - getMs(a.createdAt);
    });
  }, [reports, searchQuery, typeFilter, statusFilter, sortBy]);

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    try {
      await updateDoc(doc(db, 'feedback_reports', id), {
        status: currentStatus === 'open' ? 'resolved' : 'open',
      });
      toast.success(`Marked as ${currentStatus === 'open' ? 'resolved' : 'open'}`);
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update status');
    }
  };

  const handleUpdatePriorityNum = async (id: string, priorityNum: number) => {
    try {
      await updateDoc(doc(db, 'feedback_reports', id), { priorityNum });
      toast.success(`Priority set to ${priorityNum}`);
    } catch (err) {
      console.error('Error updating priorityNum:', err);
      toast.error('Failed to update priority');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this report?')) return;
    try {
      await deleteDoc(doc(db, 'feedback_reports', id));
      toast.success('Report deleted');
    } catch (err) {
      console.error('Error deleting report:', err);
      toast.error('Failed to delete report');
    }
  };

  // Convert Feedback/Request into Real Workable Task for Clock-In
  const handleOpenConvertModal = (report: FeedbackReport) => {
    setConvertingReport(report);
    setTaskTitle(report.description.slice(0, 90).replace(/\n/g, ' '));
    setBookTime('1.0');
  };

  const handleCreateWorkableTask = async () => {
    if (!convertingReport || !effectiveTenantId) return;

    setIsCreatingTask(true);
    try {
      // Find or create "Software & Dev Backlog" Job for the tenant
      const jobsSnap = await getDocs(query(collection(db, `businesses/${effectiveTenantId}/jobs`), where('title', '==', 'UpfittersOS Dev Backlog')));
      let devJobId = '';
      if (!jobsSnap.empty) {
        devJobId = jobsSnap.docs[0].id;
      } else {
        const newJobRef = await addDoc(collection(db, `businesses/${effectiveTenantId}/jobs`), {
          title: 'UpfittersOS Dev Backlog',
          jobNumber: 'DEV-9999',
          customerName: 'Internal Dev & Software Roadmap',
          status: 'In Progress',
          createdAt: serverTimestamp()
        });
        devJobId = newJobRef.id;
      }

      // Add Task to Dev Job subcollection
      const parsedHours = parseFloat(bookTime) || 1.0;
      const taskRef = await addDoc(collection(db, `businesses/${effectiveTenantId}/jobs/${devJobId}/tasks`), {
        title: taskTitle.trim(),
        name: taskTitle.trim(),
        jobId: devJobId,
        taskGroup: 'Software Dev',
        bookTime: parsedHours,
        estimatedHours: parsedHours,
        status: 'READY FOR WORK',
        assignedTo: user?.uid || '',
        assignedToName: user?.displayName || user?.email || 'PJ Losey',
        notes: `Converted from feedback report: ${convertingReport.description}`,
        feedbackReportId: convertingReport.id,
        createdAt: serverTimestamp()
      });

      // Also create document in unassigned_tasks pool for instant clock-in
      await addDoc(collection(db, `businesses/${effectiveTenantId}/unassigned_tasks`), {
        taskId: taskRef.id,
        jobId: devJobId,
        title: taskTitle.trim(),
        name: taskTitle.trim(),
        bookTime: parsedHours,
        status: 'pending',
        assignedTo: user?.uid || '',
        createdAt: serverTimestamp()
      });

      // Update Feedback Report document
      await updateDoc(doc(db, 'feedback_reports', convertingReport.id), {
        convertedTaskId: taskRef.id,
        convertedJobId: devJobId,
        convertedTaskTitle: taskTitle.trim(),
        priorityNum: Math.max(convertingReport.priorityNum || 0, 4) // Auto boost priority to High/4 when converted
      });

      toast.success('⚡ Workable dev task created! Ready for clock-in.');
      setConvertingReport(null);
    } catch (err) {
      console.error('Error converting to task:', err);
      toast.error('Failed to create task.');
    } finally {
      setIsCreatingTask(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4 text-neutral-400">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-sm font-medium">Scanning feedback system...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 font-sans text-zinc-100 select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2 flex items-center gap-3">
            Feedback & Dev Roadmap <span className="text-indigo-400 font-normal">/ Priority Tasks</span>
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm">
            Rank priority (0 to 5) on feature requests & bugs, and convert items into workable labor tasks to clock in to.
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-zinc-950 p-4 rounded-2xl border border-zinc-800/80">
          <div className="text-center px-4 border-r border-zinc-800">
            <div className="text-2xl font-black text-rose-400">{reports.filter(r => r.priorityNum === 5 && r.status === 'open').length}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-extrabold">🔥 5 (Do Now)</div>
          </div>
          <div className="text-center px-4 border-r border-zinc-800">
            <div className="text-2xl font-black text-white">{reports.filter(r => r.status === 'open').length}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-extrabold">Open Reports</div>
          </div>
          <div className="text-center px-4">
            <div className="text-2xl font-black text-indigo-400">{reports.filter(r => r.convertedTaskId).length}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-extrabold">Tasks Created</div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col lg:flex-row gap-4 bg-zinc-900/90 p-3 rounded-2xl border border-zinc-800 sticky top-4 z-20 backdrop-blur-xl shadow-xl">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
          <input
            type="text"
            placeholder="Search descriptions, emails, or names..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sort By Priority Toggle */}
          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setSortBy('priority')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                sortBy === 'priority' ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" /> Sort Priority (5 to 0)
            </button>
            <button
              onClick={() => setSortBy('date')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                sortBy === 'date' ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-teal-400" /> Newest Date
            </button>
          </div>

          {/* Type Filter */}
          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            {(['all', 'bug', 'feature', 'general'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  typeFilter === t
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            {(['all', 'open', 'resolved'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  statusFilter === s
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filteredReports.map((report) => {
            const pInfo = PRIORITY_BADGES[report.priorityNum || 0] || PRIORITY_BADGES[0];

            return (
              <motion.div
                layout
                key={report.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`group bg-zinc-900 border ${report.status === 'resolved' ? 'border-zinc-800/60 opacity-60' : 'border-zinc-800'} rounded-3xl overflow-hidden flex flex-col transition-all hover:border-indigo-500/50 hover:shadow-2xl`}
              >
                {/* Image Preview */}
                <div className="aspect-video bg-zinc-950 relative overflow-hidden group/image">
                  {report.imageUrl ? (
                    <>
                      <img 
                        src={report.imageUrl} 
                        alt="Screenshot" 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover/image:scale-110" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity" />
                      <a 
                        href={report.imageUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="absolute bottom-3 right-3 bg-zinc-900/90 backdrop-blur-md border border-zinc-700 px-3 py-1.5 rounded-xl text-xs font-medium text-white flex items-center gap-2 opacity-0 group-hover/image:opacity-100 transition-all translate-y-2 group-hover/image:translate-y-0"
                      >
                        <ExternalLink size={14} /> Full View
                      </a>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 gap-2">
                      <AlertCircle size={32} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">No Visual Screenshot</span>
                    </div>
                  )}
                  
                  {/* Type Badge Overlay */}
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <div className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 border backdrop-blur-md ${
                      report.type === 'bug' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                      report.type === 'feature' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' :
                      'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {report.type === 'bug' && <Bug size={12} />}
                      {report.type === 'feature' && <Lightbulb size={12} />}
                      {report.type === 'general' && <MessageSquare size={12} />}
                      {report.type}
                    </div>
                  </div>

                  {/* Priority Badge Overlay */}
                  <div className="absolute top-3 right-3">
                    <div className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold uppercase tracking-wider border backdrop-blur-md ${pInfo.bg} ${pInfo.text} ${pInfo.border}`}>
                      {pInfo.label}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col space-y-4">
                  <div className="flex-1">
                    <p className="text-zinc-100 text-xs leading-relaxed whitespace-pre-wrap font-medium">
                      {report.description}
                    </p>
                  </div>

                  {/* Converted Task Badge */}
                  {report.convertedTaskId && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <div className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider">Workable Dev Task Created</div>
                          <div className="text-xs font-bold text-white truncate max-w-[180px]">{report.convertedTaskTitle || 'Dev Task'}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => window.open(`/business/${effectiveTenantId}/task/${report.convertedJobId}/${report.convertedTaskId}`, '_blank')}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded-lg transition flex items-center gap-1 cursor-pointer shrink-0"
                        title="Open Task Details"
                      >
                        <Play className="w-3 h-3 fill-current" /> Task
                      </button>
                    </div>
                  )}

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                    <div>
                      <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Reporter</div>
                      <div className="text-[11px] text-zinc-300 truncate">{report.userEmail || 'Anonymous'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Date</div>
                      <div className="text-[11px] text-zinc-300">
                        {report.createdAt?.toDate ? report.createdAt.toDate().toLocaleDateString() : 'Recent'}
                      </div>
                    </div>
                    <div className="col-span-2 border-t border-zinc-800/60 mt-1 pt-1.5">
                      <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Origin Route</div>
                      <div className="text-[10px] text-zinc-400 font-mono truncate">{report.route}</div>
                    </div>
                  </div>

                  {/* Actions & Priority Selector */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      {/* Priority Scale Selector (0 to 5) */}
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-[10px] font-extrabold text-zinc-400 uppercase">Priority:</span>
                        <select
                          value={report.priorityNum || 0}
                          onChange={(e) => handleUpdatePriorityNum(report.id, parseInt(e.target.value))}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border bg-zinc-950 cursor-pointer focus:outline-none focus:border-indigo-500 ${pInfo.text} ${pInfo.border}`}
                        >
                          <option value={5}>🔥 5 - DO NOW (Urgent)</option>
                          <option value={4}>⚡ 4 - HIGH</option>
                          <option value={3}>🟦 3 - MEDIUM</option>
                          <option value={2}>🟢 2 - LOW</option>
                          <option value={1}>⚪ 1 - LOWEST</option>
                          <option value={0}>🔘 0 - NO PRIORITY</option>
                        </select>
                      </div>

                      <button
                        onClick={() => handleDelete(report.id)}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors"
                        title="Delete report"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Convert to Workable Task Button */}
                    {!report.convertedTaskId && (
                      <button
                        onClick={() => handleOpenConvertModal(report)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-lg shadow-indigo-600/20 cursor-pointer"
                      >
                        <Zap className="w-4 h-4 fill-current text-amber-300" />
                        <span>Convert to Workable Task</span>
                      </button>
                    )}

                    {/* Resolve Toggle Button */}
                    <button
                      onClick={() => handleToggleStatus(report.id, report.status)}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer ${
                        report.status === 'open' 
                          ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white' 
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {report.status === 'open' ? (
                        <><Clock size={14} /> Mark Resolved</>
                      ) : (
                        <><CheckCircle size={14} /> Resolved</>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredReports.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-zinc-800 rounded-3xl flex flex-col items-center gap-3">
            <AlertCircle size={32} className="text-zinc-600" />
            <div className="space-y-1">
              <h3 className="text-white font-bold text-base">No matching reports or dev items found</h3>
              <p className="text-zinc-500 text-xs">Try adjusting your filters or search query.</p>
            </div>
            <button 
              onClick={() => { setSearchQuery(''); setTypeFilter('all'); setStatusFilter('all'); setSortBy('priority'); }}
              className="text-indigo-400 text-xs font-bold uppercase tracking-wider hover:underline"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Convert to Workable Task Modal */}
      {convertingReport && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <Zap className="w-5 h-5 fill-current text-amber-300" />
                <span>Convert Request to Workable Dev Task</span>
              </div>
              <button onClick={() => setConvertingReport(null)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 font-sans text-xs">
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80">
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Original User Request / Feedback</div>
                <div className="text-zinc-300 whitespace-pre-wrap">{convertingReport.description}</div>
              </div>

              <div>
                <label className="block text-zinc-400 font-bold mb-1.5 uppercase text-[10px]">Workable Task Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-semibold focus:outline-none focus:border-indigo-500"
                  placeholder="Task Title for timeclock..."
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-bold mb-1.5 uppercase text-[10px]">Estimated Book Hours (Dev Estimate)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={bookTime}
                  onChange={(e) => setBookTime(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConvertingReport(null)}
                className="px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 font-bold hover:text-white"
              >
                Cancel
              </button>
              <button
                disabled={isCreatingTask || !taskTitle.trim()}
                onClick={handleCreateWorkableTask}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-2 disabled:opacity-50"
              >
                <Zap className="w-4 h-4 fill-current text-amber-300" />
                <span>{isCreatingTask ? 'Creating Task...' : 'Create Task & Enable Clock-In'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

