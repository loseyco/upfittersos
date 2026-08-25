import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, 
  Clock, 
  Search, 
  ExternalLink, 
  ShieldCheck, 
  AlertCircle, 
  Timer, 
  Printer, 
  FileText,
  CheckCircle,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { 
  collection, 
  collectionGroup, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { cn } from '../../lib/utils';
import { JobDetailsModal } from './JobDetailsModal';

interface CompletedTaskItem {
  id: string;
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  customerName: string;
  vehicleInfo: string;
  taskTitle: string;
  category: string;
  bookTime: number;
  payBasis: string;
  status: string;
  completedAt: Date | null;
  completedAtMs: number;
  completedAtStr: string;
  completedByStaffId: string;
  completedByStaffName: string;
  assignedStaffNames: string[];
  clockedSeconds: number;
  clockedStr: string;
  efficiencyPct: number | null;
  isQCPassed: boolean;
  isAwaitingQC: boolean;
  isQCKickback: boolean;
  qcCompletedAt: Date | null;
  qcCompletedBy: string;
  qcNotes: string;
  taskNotes: string;
  rawTask: any;
}

function parseSafeDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val === 'object' && 'seconds' in val && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (typeof val === 'object' && 'toDate' in val && typeof val.toDate === 'function') {
    return val.toDate();
  }
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function getRelativeTimeStr(date: Date): string {
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  return `${diffDay}d ago`;
}

export function TaskCompletionAudit() {
  const params = useParams();
  const splat = params['*'] || '';
  const pathParts = splat.split('/').filter(Boolean);
  const routeTenantId = params.tenantId || params.businessId || pathParts[0];

  const { user } = useAuthStore();
  const navigate = useNavigate();

  const tenantId = routeTenantId || (user as any)?.tenantId || '7jlg4IA2G6lvDJ0S5Vbp';

  const [loading, setLoading] = useState(true);
  const [tasksList, setTasksList] = useState<CompletedTaskItem[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [jobsMap, setJobsMap] = useState<Record<string, any>>({});
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  const [qcStatusFilter, setQcStatusFilter] = useState<'all' | 'qc_passed' | 'awaiting_qc' | 'kickback'>('all');
  const [dateFilterMode, setDateFilterMode] = useState<'this_week' | 'today' | 'last_week' | 'all'>('this_week');

  // Selected Job Modal
  const [selectedJobForModal, setSelectedJobForModal] = useState<any | null>(null);

  // Quick QC Passing state
  const [quickQCInProgressId, setQuickQCInProgressId] = useState<string | null>(null);

  // 1. Fetch Staff & Jobs & Tasks
  useEffect(() => {
    if (!tenantId) return;

    let isMounted = true;

    const loadAuditData = async () => {
      setLoading(true);
      try {
        // Fetch Staff
        const staffSnap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
        const fetchedStaff: any[] = staffSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (isMounted) setStaffList(fetchedStaff);

        // Fetch All Jobs for quick lookup
        const jobsSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs`));
        const jMap: Record<string, any> = {};
        jobsSnap.docs.forEach(d => {
          jMap[d.id] = { id: d.id, ...d.data() };
        });
        if (isMounted) setJobsMap(jMap);

        // Fetch Time Sessions for clocked duration matching
        const sessionsSnap = await getDocs(collection(db, `businesses/${tenantId}/time_sessions`));
        const taskClockedMap: Record<string, number> = {};
        sessionsSnap.docs.forEach(d => {
          const s = d.data();
          (s.jobs || []).forEach((j: any) => {
            if (j.taskId) {
              const startMs = j.start?.toDate ? j.start.toDate().getTime() : (j.start ? new Date(j.start).getTime() : 0);
              const endMs = j.end?.toDate ? j.end.toDate().getTime() : (j.end ? new Date(j.end).getTime() : (s.clockOut?.timestamp?.toDate ? s.clockOut.timestamp.toDate().getTime() : Date.now()));
              const durSec = Math.max(0, Math.round((endMs - startMs) / 1000));
              taskClockedMap[j.taskId] = (taskClockedMap[j.taskId] || 0) + durSec;
            }
          });
        });

        // Query all completed tasks across jobs subcollections
        const qCompleted = query(
          collectionGroup(db, 'tasks'),
          where('tenantId', '==', tenantId),
          where('status', 'in', ['completed', 'Completed', 'QC', 'QC Complete', 'qc_complete'])
        );

        const tasksSnap = await getDocs(qCompleted);
        const parsedItems: CompletedTaskItem[] = [];

        tasksSnap.docs.forEach(docSnap => {
          const t: any = docSnap.data();
          const pParts = docSnap.ref.path.split('/');
          const jobId = t.jobId || pParts[3] || 'unknown';
          const job = jMap[jobId] || {};

          const compDate = parseSafeDate(t.completedAt || t.completedDate || t.finishedAt || t.qcCompletedAt || t.updatedAt);
          const compMs = compDate ? compDate.getTime() : 0;

          const qcDate = parseSafeDate(t.qcCompletedAt || t.qcPassedAt);
          const isQCPassed = t.status === 'QC Complete' || t.status === 'qc_complete' || Boolean(t.qcCompletedAt);
          const isAwaitingQC = t.status === 'QC' || (t.status === 'completed' && !isQCPassed);
          const isQCKickback = t.status === 'kickback' || t.status === 'rejected';

          const bookHours = parseFloat(t.bookTime || t.hours || '0');
          const clockedSec = taskClockedMap[docSnap.id] || (t.elapsedTime ? parseFloat(t.elapsedTime) : 0);
          const clockedHours = clockedSec / 3600;

          let effPct: number | null = null;
          if (clockedHours > 0 && bookHours > 0) {
            effPct = Math.round((bookHours / clockedHours) * 100);
          }

          // Resolve Completing Tech
          const staffDoc = fetchedStaff.find((s: any) => s.id === t.completedByStaffId || s.userId === t.completedByStaffId);
          const completingTechName = t.completedByStaffName || t.completedBy || (staffDoc ? (staffDoc.name || `${staffDoc.firstName || ''} ${staffDoc.lastName || ''}`.trim()) : 'Technician');

          const assignedNames = (Array.isArray(t.assignedStaff) && t.assignedStaff.length > 0)
            ? t.assignedStaff.map((s: any) => s.name || s.displayName).filter(Boolean)
            : (Array.isArray(t.assignedStaffIds)
                ? t.assignedStaffIds.map((id: string) => {
                    const st = fetchedStaff.find((s: any) => s.id === id || s.userId === id);
                    return st ? (st.name || `${st.firstName || ''} ${st.lastName || ''}`.trim()) : null;
                  }).filter(Boolean)
                : []);

          const vehicleStr = [job.year || job.vehicleYear, job.make || job.vehicleMake, job.model || job.vehicleModel]
            .filter(Boolean).join(' ') || job.vehicleInfo || job.vehicle || 'Vehicle';

          parsedItems.push({
            id: docSnap.id,
            jobId,
            jobNumber: job.jobNumber || job.number || 'N/A',
            jobTitle: job.title || job.name || 'Job',
            customerName: job.customerName || job.customer || 'Customer',
            vehicleInfo: vehicleStr,
            taskTitle: t.title || t.name || 'Task',
            category: (t.category || t.department || t.taskGroup || 'GENERAL').toUpperCase(),
            bookTime: bookHours,
            payBasis: t.payBasis || 'book_time',
            status: t.status,
            completedAt: compDate,
            completedAtMs: compMs,
            completedAtStr: compDate ? compDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Unknown',
            completedByStaffId: t.completedByStaffId || '',
            completedByStaffName: completingTechName,
            assignedStaffNames: assignedNames.length > 0 ? assignedNames : [completingTechName],
            clockedSeconds: clockedSec,
            clockedStr: clockedHours > 0 ? (clockedHours < 0.1 ? `${Math.round(clockedSec / 60)}m` : `${clockedHours.toFixed(1)}h`) : '—',
            efficiencyPct: effPct,
            isQCPassed,
            isAwaitingQC,
            isQCKickback,
            qcCompletedAt: qcDate,
            qcCompletedBy: t.qcCompletedBy || t.qcInspectorName || '',
            qcNotes: t.qcNote || t.qcNotes || '',
            taskNotes: t.notes || t.description || t.instructions || '',
            rawTask: t
          });
        });

        // Sort descending by completed timestamp
        parsedItems.sort((a, b) => b.completedAtMs - a.completedAtMs);

        if (isMounted) {
          setTasksList(parsedItems);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading task completions feed:", err);
        if (isMounted) setLoading(false);
      }
    };

    loadAuditData();

    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  // 2. Date Bounds Calculation
  const dateBounds = useMemo(() => {
    const now = new Date();
    if (dateFilterMode === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { startMs: start.getTime(), endMs: end.getTime() };
    }
    if (dateFilterMode === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      const start = new Date(now.setDate(diff));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { startMs: start.getTime(), endMs: end.getTime() };
    }
    if (dateFilterMode === 'last_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7;
      const start = new Date(now.setDate(diff));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { startMs: start.getTime(), endMs: end.getTime() };
    }
    return { startMs: 0, endMs: Infinity };
  }, [dateFilterMode]);

  // 3. Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasksList.filter(t => {
      // Date Filter
      if (dateFilterMode !== 'all') {
        if (t.completedAtMs < dateBounds.startMs || t.completedAtMs > dateBounds.endMs) {
          return false;
        }
      }

      // Staff Filter
      if (selectedStaffId !== 'all') {
        const staffDoc = staffList.find((s: any) => s.id === selectedStaffId || s.userId === selectedStaffId);
        const matchName = staffDoc ? (staffDoc.name || `${staffDoc.firstName || ''} ${staffDoc.lastName || ''}`.trim()).toLowerCase() : '';
        const isMatch = t.completedByStaffId === selectedStaffId || 
                        t.completedByStaffName.toLowerCase().includes(matchName) ||
                        t.assignedStaffNames.some(n => n.toLowerCase().includes(matchName));
        if (!isMatch) return false;
      }

      // QC Status Filter
      if (qcStatusFilter === 'qc_passed' && !t.isQCPassed) return false;
      if (qcStatusFilter === 'awaiting_qc' && !t.isAwaitingQC) return false;
      if (qcStatusFilter === 'kickback' && !t.isQCKickback) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTask = t.taskTitle.toLowerCase().includes(q);
        const inJob = t.jobNumber.toLowerCase().includes(q) || t.customerName.toLowerCase().includes(q);
        const inTech = t.completedByStaffName.toLowerCase().includes(q);
        const inCat = t.category.toLowerCase().includes(q);
        if (!inTask && !inJob && !inTech && !inCat) return false;
      }

      return true;
    });
  }, [tasksList, dateBounds, dateFilterMode, selectedStaffId, qcStatusFilter, searchQuery, staffList]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalCompleted = filteredTasks.length;
    const totalBook = filteredTasks.reduce((sum, t) => sum + t.bookTime, 0);
    const totalClockedSec = filteredTasks.reduce((sum, t) => sum + t.clockedSeconds, 0);
    const totalClockedHours = totalClockedSec / 3600;
    const awaitingQC = filteredTasks.filter(t => t.isAwaitingQC).length;
    const qcPassed = filteredTasks.filter(t => t.isQCPassed).length;

    const overallEff = totalClockedHours > 0 ? Math.round((totalBook / totalClockedHours) * 100) : null;

    return {
      totalCompleted,
      totalBook,
      totalClockedHours,
      awaitingQC,
      qcPassed,
      overallEff
    };
  }, [filteredTasks]);

  // 1-Click Quick Pass QC Handler
  const handleQuickQCPass = async (item: CompletedTaskItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (quickQCInProgressId === item.id) return;
    setQuickQCInProgressId(item.id);

    try {
      const inspectorName = user?.displayName || user?.email || 'QC Inspector';
      const inspectorUid = user?.uid || 'inspector';

      const taskRef = doc(db, `businesses/${tenantId}/jobs/${item.jobId}/tasks`, item.id);
      await updateDoc(taskRef, {
        status: 'QC Complete',
        qcCompletedAt: new Date().toISOString(),
        qcCompletedBy: inspectorName,
        qcCompletedByStaffId: inspectorUid,
        updatedAt: new Date()
      });

      // Update local state smoothly
      setTasksList(prev => prev.map(t => {
        if (t.id === item.id) {
          return {
            ...t,
            status: 'QC Complete',
            isQCPassed: true,
            isAwaitingQC: false,
            qcCompletedAt: new Date(),
            qcCompletedBy: inspectorName
          };
        }
        return t;
      }));
    } catch (err) {
      console.error("Failed to quick-pass QC:", err);
    } finally {
      setQuickQCInProgressId(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>Completed Tasks & QC Feed</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-bold">
                  {summaryMetrics.totalCompleted} Completed
                </span>
              </h1>
              <p className="text-xs text-zinc-400 font-medium mt-0.5">
                Real-time reverse-chronological audit of finished shop floor tasks, technician attribution, and QC status.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => window.print()}
            className="h-9 px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-bold inline-flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
          >
            <Printer className="w-3.5 h-3.5 text-zinc-400" />
            <span>Print Sheet</span>
          </button>

          <button
            type="button"
            onClick={() => navigate(`/business/${tenantId}/yellowsheets`)}
            className="h-9 px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-black inline-flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Yellow Sheets</span>
          </button>
        </div>
      </div>

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5 flex flex-col justify-between shadow-sm">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            Tasks Completed
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white font-mono">{summaryMetrics.totalCompleted}</span>
            <span className="text-[10px] text-zinc-500 font-bold">tasks</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5 flex flex-col justify-between shadow-sm">
          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1">
            <Timer className="w-3 h-3" />
            Book Time Earned
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-indigo-300 font-mono">{summaryMetrics.totalBook.toFixed(1)}h</span>
            <span className="text-[10px] text-zinc-500 font-bold">hrs</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5 flex flex-col justify-between shadow-sm">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-400" />
            Clocked Wrench Time
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-300 font-mono">{summaryMetrics.totalClockedHours.toFixed(1)}h</span>
            <span className="text-[10px] text-zinc-500 font-bold">hrs</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5 flex flex-col justify-between shadow-sm">
          <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Awaiting QC
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-400 font-mono">{summaryMetrics.awaitingQC}</span>
            <span className="text-[10px] text-zinc-500 font-bold">pending</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5 flex flex-col justify-between shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            QC Verified
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-400 font-mono">{summaryMetrics.qcPassed}</span>
            <span className="text-[10px] text-zinc-500 font-bold">verified</span>
          </div>
        </div>
      </div>

      {/* 3. Filter Controls Toolbar */}
      <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-3.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shadow-md">
        {/* Date Filter Buttons */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800/90 shrink-0">
          {(['this_week', 'today', 'last_week', 'all'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setDateFilterMode(mode)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-black transition capitalize cursor-pointer",
                dateFilterMode === mode 
                  ? "bg-indigo-600 text-white shadow-sm" 
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {mode === 'this_week' ? 'This Week' : mode === 'today' ? 'Today' : mode === 'last_week' ? 'Last Week' : 'All Time'}
            </button>
          ))}
        </div>

        {/* Search & Staff & QC Filters */}
        <div className="flex items-center gap-2 flex-wrap flex-1 justify-end">
          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search task, job #, customer, tech..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Technician Dropdown */}
          <select
            value={selectedStaffId}
            onChange={e => setSelectedStaffId(e.target.value)}
            className="h-8 px-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Technicians</option>
            {staffList.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim()}
              </option>
            ))}
          </select>

          {/* QC Status Filter */}
          <select
            value={qcStatusFilter}
            onChange={e => setQcStatusFilter(e.target.value as any)}
            className="h-8 px-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All QC States</option>
            <option value="awaiting_qc">🟡 Awaiting QC</option>
            <option value="qc_passed">✅ QC Passed</option>
            <option value="kickback">🔴 Kickback</option>
          </select>
        </div>
      </div>

      {/* 4. High-Density Completed Tasks Table */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-indigo-400">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <span className="text-xs font-bold text-zinc-400">Loading real-time completed tasks...</span>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckCircle2 className="w-12 h-12 text-zinc-700 mb-3" />
            <h3 className="text-sm font-bold text-zinc-300">No Completed Tasks Found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mt-1">
              No tasks matched your current filter criteria. Try expanding your date range or clearing search filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/80 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                  <th className="py-2.5 px-3.5">Completed Date / Time</th>
                  <th className="py-2.5 px-3.5">Task & Category</th>
                  <th className="py-2.5 px-3.5">Job & Customer</th>
                  <th className="py-2.5 px-3.5">Technician</th>
                  <th className="py-2.5 px-3.5 text-right">Book Time</th>
                  <th className="py-2.5 px-3.5 text-right">Clocked Time</th>
                  <th className="py-2.5 px-3.5 text-center">QC Status</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-xs">
                {filteredTasks.map(item => (
                  <tr 
                    key={`${item.jobId}_${item.id}`}
                    onClick={() => navigate(`/business/${tenantId}/jobs/${item.jobId}/v3`)}
                    className="hover:bg-zinc-800/40 transition group cursor-pointer"
                  >
                    {/* 1. Completed Date / Time */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-zinc-200 text-xs">
                          {item.completedAtStr}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {item.completedAt ? getRelativeTimeStr(item.completedAt) : 'Recent'}
                        </span>
                      </div>
                    </td>

                    {/* 2. Task Title & Category */}
                    <td className="py-2.5 px-3.5 max-w-[280px]">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">
                            {item.category}
                          </span>
                          <span className="font-bold text-zinc-100 group-hover:text-indigo-300 transition truncate">
                            {item.taskTitle}
                          </span>
                        </div>
                        {item.taskNotes && (
                          <span className="text-[10px] text-zinc-400 italic truncate max-w-[260px]">
                            {item.taskNotes}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. Job # & Customer */}
                    <td className="py-2.5 px-3.5 max-w-[220px]">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-indigo-400 text-xs">
                            #{item.jobNumber}
                          </span>
                          <span className="text-zinc-300 font-medium text-xs truncate">
                            {item.customerName}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 truncate">
                          {item.vehicleInfo}
                        </span>
                      </div>
                    </td>

                    {/* 4. Technician */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center text-[10px] font-black">
                          {item.completedByStaffName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-zinc-200 text-xs">
                          {item.completedByStaffName}
                        </span>
                      </div>
                    </td>

                    {/* 5. Book Time */}
                    <td className="py-2.5 px-3.5 text-right font-mono font-black text-indigo-300 text-xs whitespace-nowrap">
                      {item.bookTime.toFixed(1)}h
                    </td>

                    {/* 6. Clocked Time & Efficiency */}
                    <td className="py-2.5 px-3.5 text-right font-mono text-xs whitespace-nowrap">
                      <div className="flex flex-col items-end">
                        <span className="text-zinc-200 font-medium">
                          {item.clockedStr}
                        </span>
                        {item.efficiencyPct !== null && (
                          <span className={cn(
                            "text-[9px] font-black px-1 py-0.2 rounded",
                            item.efficiencyPct >= 100 ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"
                          )}>
                            {item.efficiencyPct}% eff
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 7. QC Status Badge */}
                    <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                      {item.isQCPassed ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black" title={`QC Passed by ${item.qcCompletedBy || 'Inspector'}`}>
                          <ShieldCheck className="w-3 h-3 shrink-0" />
                          <span>QC Passed</span>
                        </div>
                      ) : item.isQCKickback ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-black">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Kickback</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-black">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>Awaiting QC</span>
                        </div>
                      )}
                    </td>

                    {/* 8. Actions */}
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {item.isAwaitingQC && (
                          <button
                            type="button"
                            onClick={(e) => handleQuickQCPass(item, e)}
                            disabled={quickQCInProgressId === item.id}
                            className="h-6 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase tracking-wider inline-flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                            title="1-Click QC Pass this completed task"
                          >
                            {quickQCInProgressId === item.id ? (
                              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-2.5 h-2.5" />
                            )}
                            <span>QC Pass</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            const foundJob = jobsMap[item.jobId] || { id: item.jobId, jobNumber: item.jobNumber };
                            setSelectedJobForModal(foundJob);
                          }}
                          className="h-6 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-[10px] inline-flex items-center gap-1 border border-zinc-700 active:scale-95 cursor-pointer"
                          title="Open Job Overview"
                        >
                          <ExternalLink className="w-2.5 h-2.5 text-indigo-400" />
                          <span>Job</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Job Details Modal */}
      {selectedJobForModal && (
        <JobDetailsModal
          tenantId={tenantId}
          job={selectedJobForModal}
          onClose={() => setSelectedJobForModal(null)}
          onUpdate={() => {}}
        />
      )}
    </div>
  );
}
