import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  CheckCircle, 
  Clock, 
  ExternalLink, 
  Search, 
  AlertCircle, 
  Trash2,
  ChevronDown,
  Bug,
  Lightbulb,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

type Priority = 'low' | 'medium' | 'high' | 'urgent';

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
  priority?: Priority;
  createdAt: any;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  high: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  urgent: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

export function FeedbackReports({ tenantId }: { tenantId?: string }) {
  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'bug' | 'feature' | 'general'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');

  useEffect(() => {
    let q = query(collection(db, 'feedback_reports'), orderBy('createdAt', 'desc'));
    if (tenantId) {
      q = query(
        collection(db, 'feedback_reports'),
        where('tenantId', '==', tenantId)
      );
    }
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: FeedbackReport[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as FeedbackReport);
      });

      if (tenantId) {
        // Sort in memory by createdAt descending to avoid composite index requirements
        data.sort((a, b) => {
          const getMs = (val: any) => {
            if (!val) return 0;
            if (val.seconds) return val.seconds * 1000 + (val.nanoseconds ? val.nanoseconds / 1000000 : 0);
            if (typeof val.toDate === 'function') return val.toDate().getTime();
            return new Date(val).getTime() || 0;
          };
          return getMs(b.createdAt) - getMs(a.createdAt);
        });
      }

      setReports(data);
      setLoading(false);
    }, (error) => {
      console.error('FeedbackReports fetch error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesSearch = 
        report.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.userEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.userName?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = typeFilter === 'all' || report.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || report.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [reports, searchQuery, typeFilter, statusFilter]);

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

  const handleUpdatePriority = async (id: string, priority: Priority) => {
    try {
      await updateDoc(doc(db, 'feedback_reports', id), { priority });
      toast.success(`Priority updated to ${priority}`);
    } catch (err) {
      console.error('Error updating priority:', err);
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
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-2 flex items-center gap-3">
            Mission Control <span className="text-indigo-500 font-normal">/ Feedback</span>
          </h1>
          <p className="text-neutral-400 text-lg">Manage platform bugs, feature requests, and community feedback.</p>
        </div>
        
        <div className="flex items-center gap-4 bg-neutral-900/50 p-4 rounded-2xl border border-neutral-800 backdrop-blur-md">
          <div className="text-center px-4 border-r border-neutral-800">
            <div className="text-2xl font-bold text-white">{reports.filter(r => r.status === 'open').length}</div>
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Open Items</div>
          </div>
          <div className="text-center px-4">
            <div className="text-2xl font-bold text-indigo-400">{reports.filter(r => r.type === 'bug' && r.status === 'open').length}</div>
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Active Bugs</div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col lg:flex-row gap-4 bg-neutral-900/80 p-2 rounded-2xl border border-neutral-800 sticky top-4 z-20 backdrop-blur-xl">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
          <input
            type="text"
            placeholder="Search descriptions, emails, or names..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/40 border border-neutral-800 rounded-xl pl-12 pr-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter */}
          <div className="flex bg-black/40 p-1 rounded-xl border border-neutral-800">
            {(['all', 'bug', 'feature', 'general'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  typeFilter === t
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex bg-black/40 p-1 rounded-xl border border-neutral-800">
            {(['all', 'open', 'resolved'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  statusFilter === s
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'text-neutral-500 hover:text-neutral-300'
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
          {filteredReports.map((report) => (
            <motion.div
              layout
              key={report.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`group bg-neutral-900 border ${report.status === 'resolved' ? 'border-neutral-800 opacity-60' : 'border-neutral-800'} rounded-3xl overflow-hidden flex flex-col transition-all hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/5`}
            >
              {/* Image Preview */}
              <div className="aspect-video bg-neutral-950 relative overflow-hidden group/image">
                {report.imageUrl ? (
                  <>
                    <img 
                      src={report.imageUrl} 
                      alt="Screenshot" 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover/image:scale-110" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity" />
                    <a 
                      href={report.imageUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="absolute bottom-4 right-4 bg-white/10 backdrop-blur-md border border-white/20 px-3 py-2 rounded-xl text-xs font-medium text-white flex items-center gap-2 opacity-0 group-hover/image:opacity-100 transition-all translate-y-2 group-hover/image:translate-y-0"
                    >
                      <ExternalLink size={14} /> Full View
                    </a>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-neutral-700 gap-2">
                    <AlertCircle size={32} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">No Visual Context</span>
                  </div>
                )}
                
                {/* Type Badge Overlay */}
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 border backdrop-blur-md ${
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
              </div>

              {/* Content */}
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="space-y-1 flex-1">
                    <p className="text-neutral-200 text-sm leading-relaxed whitespace-pre-wrap line-clamp-3 group-hover:line-clamp-none transition-all">
                      {report.description}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-black/40 border border-neutral-800/50">
                    <div>
                      <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-1">Reporter</div>
                      <div className="text-xs text-neutral-300 truncate">{report.userEmail || 'Anonymous'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-1">Date</div>
                      <div className="text-xs text-neutral-300">
                        {report.createdAt?.toDate().toLocaleDateString() || 'Recent'}
                      </div>
                    </div>
                    <div className="col-span-2 border-t border-neutral-800/50 mt-1 pt-2">
                      <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-1">Origin Route</div>
                      <div className="text-xs text-neutral-400 font-mono truncate">{report.route}</div>
                    </div>
                  </div>

                  {/* Actions Area */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <select
                          value={report.priority || 'medium'}
                          onChange={(e) => handleUpdatePriority(report.id, e.target.value as Priority)}
                          className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/20 ${PRIORITY_COLORS[report.priority || 'medium']}`}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                        <ChevronDown size={12} className="-ml-6 text-neutral-400 pointer-events-none" />
                      </div>

                      <button
                        onClick={() => handleDelete(report.id)}
                        className="p-2 text-neutral-600 hover:text-rose-400 transition-colors"
                        title="Delete report"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <button
                      onClick={() => handleToggleStatus(report.id, report.status)}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                        report.status === 'open' 
                          ? 'bg-white text-black hover:bg-neutral-200' 
                          : 'bg-neutral-800 text-indigo-400 border border-indigo-500/20'
                      }`}
                    >
                      {report.status === 'open' ? (
                        <><Clock size={16} /> Mark Resolved</>
                      ) : (
                        <><CheckCircle size={16} /> Resolved</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredReports.length === 0 && (
          <div className="col-span-full py-24 text-center border-2 border-dashed border-neutral-800 rounded-3xl flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center text-neutral-700">
              <Search size={32} />
            </div>
            <div className="space-y-1">
              <h3 className="text-white font-bold text-lg">No matching reports found</h3>
              <p className="text-neutral-500 text-sm">Try adjusting your filters or search query to find what you're looking for.</p>
            </div>
            <button 
              onClick={() => { setSearchQuery(''); setTypeFilter('all'); setStatusFilter('all'); }}
              className="text-indigo-400 text-xs font-bold uppercase tracking-widest hover:text-indigo-300 transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
