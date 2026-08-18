import { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight, 
  Printer, 
  Save, 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  Package, 
  Plus, 
  Trash2, 
  CheckSquare, 
  Square, 
  Car, 
  ShieldCheck, 
  Wrench, 
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { openJobPopupWindow } from '../../lib/utils/window';
import { toast } from 'react-hot-toast';

interface TuesdayMeetingReportProps {
  tenantId: string;
}

interface ActionItem {
  id: string;
  text: string;
  assignee: string;
  dueDate: string;
  completed: boolean;
}

interface TuesdayReportNotes {
  shoutouts: string[];
  painPoints: string[];
  shopNeeds: string[];
  actionItems: ActionItem[];
  targetVehicles: string;
  targetHours: string;
  customNotes: string;
}

// Strict Previous Week Monday (00:00:00)
const getLastWeekMonday = (baseDate = new Date()) => {
  const d = new Date(baseDate);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday...
  const daysSinceMonday = (day + 6) % 7; 
  d.setDate(d.getDate() - daysSinceMonday - 7);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Strict Previous Week Sunday (23:59:59.999)
const getLastWeekSunday = (startMonday: Date) => {
  const d = new Date(startMonday);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
};

const formatDateRange = (start: Date, end: Date) => {
  const startStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr} – ${endStr}`;
};

const getWeekDocId = (startMonday: Date) => {
  const y = startMonday.getFullYear();
  const m = String(startMonday.getMonth() + 1).padStart(2, '0');
  const d = String(startMonday.getDate()).padStart(2, '0');
  return `week_${y}_${m}_${d}`;
};

export function TuesdayMeetingReport({ tenantId }: TuesdayMeetingReportProps) {
  const { user, isSuperAdmin, permissions } = useAuthStore();
  const canEdit = isSuperAdmin || permissions['jobs.manage'] || permissions['foreman.view'] || permissions['office.view'];

  // 1. Week Range Navigation State (Strictly Last Week Monday - Sunday)
  const [weekStart, setWeekStart] = useState<Date>(() => getLastWeekMonday());
  const weekEnd = useMemo(() => getLastWeekSunday(weekStart), [weekStart]);
  const weekDocId = useMemo(() => getWeekDocId(weekStart), [weekStart]);

  // 2. Raw Live Data from Firestore
  const [jobs, setJobs] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [timeSessions, setTimeSessions] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  // 3. Persistent Meeting Notes & Action Items State
  const [reportNotes, setReportNotes] = useState<TuesdayReportNotes>({
    shoutouts: ['Great turnaround on the squad wiring harnesses last Thursday.', 'Clean bay handoffs throughout the week.'],
    painPoints: ['Delayed delivery on siren brackets caused mid-week bottleneck.'],
    shopNeeds: ['Need 2 additional automatic wire strippers for Bay 3 & 4.'],
    actionItems: [],
    targetVehicles: '',
    targetHours: '',
    customNotes: ''
  });
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Load Firestore Data
  useEffect(() => {
    if (!tenantId) return;

    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubParts = onSnapshot(collection(db, `businesses/${tenantId}/parts_requests`), (snap) => {
      setPartsRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubSessions = onSnapshot(collection(db, `businesses/${tenantId}/time_sessions`), (snap) => {
      setTimeSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubStaff = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubJobs();
      unsubParts();
      unsubSessions();
      unsubStaff();
    };
  }, [tenantId]);

  // Subscribe to Persistent Tuesday Meeting Notes for the Selected Week
  useEffect(() => {
    if (!tenantId || !weekDocId) return;

    const docRef = doc(db, `businesses/${tenantId}/tuesday_reports`, weekDocId);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<TuesdayReportNotes>;
        setReportNotes(prev => ({
          ...prev,
          shoutouts: Array.isArray(data.shoutouts) ? data.shoutouts : prev.shoutouts,
          painPoints: Array.isArray(data.painPoints) ? data.painPoints : prev.painPoints,
          shopNeeds: Array.isArray(data.shopNeeds) ? data.shopNeeds : prev.shopNeeds,
          actionItems: Array.isArray(data.actionItems) ? data.actionItems : prev.actionItems,
          targetVehicles: data.targetVehicles || '',
          targetHours: data.targetHours || '',
          customNotes: data.customNotes || ''
        }));
      }
    });

    return () => unsub();
  }, [tenantId, weekDocId]);

  // Save Notes to Firestore
  const handleSaveNotes = async () => {
    if (!tenantId || !weekDocId) return;
    setIsSavingNotes(true);
    try {
      await setDoc(doc(db, `businesses/${tenantId}/tuesday_reports`, weekDocId), {
        ...reportNotes,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        updatedAt: serverTimestamp(),
        updatedBy: user?.displayName || user?.email || 'Foreman'
      }, { merge: true });
      toast.success('Tuesday Meeting Notes Saved!');
    } catch (err: any) {
      console.error('Error saving Tuesday meeting report:', err);
      toast.error('Failed to save meeting notes');
    } finally {
      setIsSavingNotes(false);
    }
  };

  // -------------------------------------------------------------
  // ANALYTICS COMPUTATIONS FOR THE SELECTED WEEK
  // -------------------------------------------------------------
  const parseTimestamp = (val: any): Date | null => {
    if (!val) return null;
    if (val.toDate && typeof val.toDate === 'function') return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
    if (val instanceof Date) return val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const isDateInWeek = (dateVal: any) => {
    const d = parseTimestamp(dateVal);
    if (!d) return false;
    return d.getTime() >= weekStart.getTime() && d.getTime() <= weekEnd.getTime();
  };

  // 1. Completed Vehicles in Week
  const completedJobsInWeek = useMemo(() => {
    return jobs.filter(j => {
      const statusLower = (j.status || '').toLowerCase();
      const isCompleteStatus = ['completed', 'closed', 'ready for customer', 'ready_for_customer'].includes(statusLower);
      if (!isCompleteStatus) return false;

      const completionDate = j.completedAt || j.readyForCustomerAt || j.qcApprovedAt || j.updatedAt || j.createdAt;
      return isDateInWeek(completionDate);
    });
  }, [jobs, weekStart, weekEnd]);

  // 2. Book Hours Earned in Week
  const totalEarnedBookHours = useMemo(() => {
    return completedJobsInWeek.reduce((sum, j) => {
      const hrs = Number(j.bookedHours || j.estimatedHours || j.bookHours || 0);
      return sum + (isNaN(hrs) ? 0 : hrs);
    }, 0);
  }, [completedJobsInWeek]);

  // 3. QC Kickbacks & Reworks in Week
  const qcKickbacksInWeek = useMemo(() => {
    const kickbacks: any[] = [];
    jobs.forEach(j => {
      if (Array.isArray(j.qcKickbacks)) {
        j.qcKickbacks.forEach((k: any) => {
          if (isDateInWeek(k.timestamp || k.date || k.createdAt)) {
            kickbacks.push({
              jobId: j.id,
              jobNumber: j.jobNumber || 'N/A',
              customerName: j.customerName || '',
              vehicleInfo: j.vehicleYearMakeModel || '',
              reason: k.reason || k.notes || 'QC Checklist Rework',
              taskName: k.taskName || 'General Upfit',
              inspector: k.inspector || k.userName || 'Foreman',
              date: parseTimestamp(k.timestamp || k.date || k.createdAt)
            });
          }
        });
      }

      // Check status history or kickback flags
      if (j.qcStatus === 'Kickback' || j.status === 'QC Kickback' || j.qcReworkCount > 0) {
        const d = parseTimestamp(j.qcKickbackAt || j.updatedAt);
        if (d && isDateInWeek(d)) {
          kickbacks.push({
            jobId: j.id,
            jobNumber: j.jobNumber || 'N/A',
            customerName: j.customerName || '',
            vehicleInfo: j.vehicleYearMakeModel || '',
            reason: j.qcNotes || j.kickbackReason || 'QC Inspection Rework Required',
            taskName: j.qcFailedTask || 'Upfit QC',
            inspector: j.qcInspectorName || 'Foreman',
            date: d
          });
        }
      }
    });
    return kickbacks;
  }, [jobs, weekStart, weekEnd]);

  // 4. Jobs with 100% First-Time QC Pass
  const cleanQcPassedJobs = useMemo(() => {
    return completedJobsInWeek.filter(j => !j.qcReworkCount && j.qcStatus !== 'Kickback');
  }, [completedJobsInWeek]);

  const qcPassRate = useMemo(() => {
    if (completedJobsInWeek.length === 0) return 100;
    return Math.round((cleanQcPassedJobs.length / completedJobsInWeek.length) * 100);
  }, [completedJobsInWeek, cleanQcPassedJobs]);

  // 5. Active Blockers & Downtime
  const blockedJobs = useMemo(() => {
    return jobs.filter(j => {
      const s = (j.status || '').toLowerCase();
      return s.includes('block') || s.includes('hold') || j.isBlocked || j.isOnHold;
    });
  }, [jobs]);

  // 6. Outstanding Parts Requests
  const pendingParts = useMemo(() => {
    return partsRequests.filter(p => {
      const s = (p.status || '').toLowerCase();
      return !['fulfilled', 'received', 'closed', 'completed'].includes(s);
    });
  }, [partsRequests]);

  // 7. Tech Efficiency & Hours Leaderboard
  const techLeaderboard = useMemo(() => {
    const map: Record<string, { name: string; hoursClocked: number; jobsCompleted: number; earnedBookHours: number }> = {};

    staffList.forEach(s => {
      const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.name || 'Technician';
      map[s.id] = { name, hoursClocked: 0, jobsCompleted: 0, earnedBookHours: 0 };
    });

    // Aggregate Clocked Time
    timeSessions.forEach(session => {
      if (session.clockIn && isDateInWeek(session.clockIn.timestamp)) {
        const staffId = session.staffId || session.userId;
        if (staffId && map[staffId]) {
          const durationHrs = Number(session.totalHours || session.durationHours || 0);
          map[staffId].hoursClocked += isNaN(durationHrs) ? 0 : durationHrs;
        }
      }
    });

    // Aggregate Completed Jobs & Book Time
    completedJobsInWeek.forEach(j => {
      const techId = j.assignedTechId;
      if (techId && map[techId]) {
        map[techId].jobsCompleted += 1;
        const bHrs = Number(j.bookedHours || j.estimatedHours || 0);
        map[techId].earnedBookHours += isNaN(bHrs) ? 0 : bHrs;
      }
    });

    return Object.values(map)
      .filter(t => t.hoursClocked > 0 || t.jobsCompleted > 0)
      .sort((a, b) => b.earnedBookHours - a.earnedBookHours);
  }, [staffList, timeSessions, completedJobsInWeek, weekStart, weekEnd]);

  // Handlers for Editable Lists
  const handleAddShoutout = () => {
    const text = prompt('Enter Team Win / Shoutout:');
    if (text?.trim()) {
      setReportNotes(prev => ({ ...prev, shoutouts: [...prev.shoutouts, text.trim()] }));
    }
  };

  const handleRemoveShoutout = (idx: number) => {
    setReportNotes(prev => ({ ...prev, shoutouts: prev.shoutouts.filter((_, i) => i !== idx) }));
  };

  const handleAddPainPoint = () => {
    const text = prompt('Enter Roadblock / Pain Point:');
    if (text?.trim()) {
      setReportNotes(prev => ({ ...prev, painPoints: [...prev.painPoints, text.trim()] }));
    }
  };

  const handleRemovePainPoint = (idx: number) => {
    setReportNotes(prev => ({ ...prev, painPoints: prev.painPoints.filter((_, i) => i !== idx) }));
  };

  const handleAddShopNeed = () => {
    const text = prompt('Enter Shop / Tooling / Facility Need:');
    if (text?.trim()) {
      setReportNotes(prev => ({ ...prev, shopNeeds: [...prev.shopNeeds, text.trim()] }));
    }
  };

  const handleRemoveShopNeed = (idx: number) => {
    setReportNotes(prev => ({ ...prev, shopNeeds: prev.shopNeeds.filter((_, i) => i !== idx) }));
  };

  const handleAddActionItem = () => {
    const text = prompt('Enter Action Item Task:');
    if (!text?.trim()) return;
    const assignee = prompt('Assigned To (Name):') || 'Team';
    const newItem: ActionItem = {
      id: `act_${Date.now()}`,
      text: text.trim(),
      assignee: assignee.trim(),
      dueDate: 'This Week',
      completed: false
    };
    setReportNotes(prev => ({ ...prev, actionItems: [...prev.actionItems, newItem] }));
  };

  const handleToggleActionItem = (id: string) => {
    setReportNotes(prev => ({
      ...prev,
      actionItems: prev.actionItems.map(item => item.id === id ? { ...item, completed: !item.completed } : item)
    }));
  };

  const handleRemoveActionItem = (id: string) => {
    setReportNotes(prev => ({
      ...prev,
      actionItems: prev.actionItems.filter(item => item.id !== id)
    }));
  };

  const handlePrevWeek = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    setWeekStart(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
  };

  const handleThisWeek = () => {
    setWeekStart(getLastWeekMonday());
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-y-auto print:overflow-visible print:bg-white print:text-black">
      
      {/* ------------------------------------------------------------- */}
      {/* TOP HEADER & CONTROLS */}
      {/* ------------------------------------------------------------- */}
      <div className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4 print:static print:border-b-2 print:border-black">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white print:text-black">
                Tuesday Weekly Operations Review
              </h1>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
                Upfitters Dept
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono flex items-center gap-2 mt-0.5">
              <span>Reviewing Previous Week:</span>
              <strong className="text-zinc-200">{formatDateRange(weekStart, weekEnd)}</strong>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 print:hidden">
          {/* Week Switcher */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 text-xs">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition"
              title="Previous Week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleThisWeek}
              className="px-2.5 py-1 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition"
            >
              Previous Week
            </button>
            <button
              onClick={handleNextWeek}
              className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition"
              title="Next Week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Save Button */}
          {canEdit && (
            <button
              onClick={handleSaveNotes}
              disabled={isSavingNotes}
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 transition active:scale-95 disabled:opacity-50"
            >
              {isSavingNotes ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save Notes</span>
            </button>
          )}

          {/* Print Button */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-bold rounded-xl transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* ------------------------------------------------------------- */}
        {/* EXECUTIVE KPI SUMMARY CARDS */}
        {/* ------------------------------------------------------------- */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">Completed Upfits</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-white">{completedJobsInWeek.length}</span>
              <span className="text-xs text-zinc-500 font-mono">vehicles</span>
            </div>
            <div className="text-[10px] text-emerald-400 font-medium mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Ready for Delivery
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">Earned Book Time</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-amber-400">{totalEarnedBookHours.toFixed(1)}h</span>
            </div>
            <div className="text-[10px] text-zinc-400 font-mono mt-1">
              Shop Book Throughput
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">First-Time QC Pass</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-emerald-400">{qcPassRate}%</span>
              <span className="text-xs text-zinc-500 font-mono">({cleanQcPassedJobs.length}/{completedJobsInWeek.length || 1})</span>
            </div>
            <div className="text-[10px] text-emerald-400/80 font-medium mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Clean Inspections
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">QC Kickbacks</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-rose-400">{qcKickbacksInWeek.length}</span>
              <span className="text-xs text-zinc-500 font-mono">reworks</span>
            </div>
            <div className="text-[10px] text-rose-400/80 font-medium mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Shop Quality Flag
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between col-span-2 sm:col-span-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">Awaiting Parts</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-amber-300">{pendingParts.length}</span>
              <span className="text-xs text-zinc-500 font-mono">requests</span>
            </div>
            <div className="text-[10px] text-amber-400/80 font-medium mt-1 flex items-center gap-1">
              <Package className="w-3 h-3" /> Vendor / Parts Queue
            </div>
          </div>
        </div>

        {/* ============================================================= */}
        {/* SECTION 1: 🟢 THE GOOD (WINS, THROUGHPUT & ACCOMPLISHMENTS) */}
        {/* ============================================================= */}
        <div className="rounded-3xl bg-zinc-900/40 border border-emerald-500/20 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-emerald-400">
                  The Good — Wins & High Performance
                </h2>
                <p className="text-xs text-zinc-400">Completed builds, earned book hours, and team accomplishments</p>
              </div>
            </div>
            {canEdit && (
              <button
                onClick={handleAddShoutout}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-xl transition cursor-pointer print:hidden"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Win / Shoutout</span>
              </button>
            )}
          </div>

          {/* Shoutouts & Team Wins Feed */}
          {reportNotes.shoutouts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {reportNotes.shoutouts.map((shoutout, idx) => (
                <div key={idx} className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl flex items-start justify-between gap-3 text-xs text-emerald-200">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{shoutout}</span>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => handleRemoveShoutout(idx)}
                      className="text-zinc-500 hover:text-rose-400 p-1 rounded transition print:hidden"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
            {/* Completed Vehicles Table (2 cols) */}
            <div className="lg:col-span-2 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-400 px-1">
                <span>Completed Upfits ({completedJobsInWeek.length})</span>
                <span className="text-[10px] text-zinc-500">Click to inspect job</span>
              </div>
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-800/60 max-h-80 overflow-y-auto">
                {completedJobsInWeek.length === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-500 italic">
                    No completed jobs recorded in this week range.
                  </div>
                ) : (
                  completedJobsInWeek.map(j => (
                    <div
                      key={j.id}
                      onClick={(e) => openJobPopupWindow(`/business/${tenantId}/job/${j.id}`, j.id, e)}
                      className="p-3 hover:bg-zinc-900/60 transition cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-zinc-900 rounded-xl border border-zinc-800 text-zinc-400 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition">
                          <Car className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white group-hover:text-emerald-300 transition">
                              Job #{j.jobNumber || j.id.slice(0, 8)}
                            </span>
                            <span className="text-[10px] text-zinc-400 truncate">
                              {j.customerName || j.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                            {j.vehicleYearMakeModel || 'Fleet Vehicle'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-black font-mono text-amber-400">
                          {j.bookedHours || j.estimatedHours || 0}h Booked
                        </span>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {j.assignedTechName || 'Technicians'}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Tech Leaderboard (1 col) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-400 px-1">
                <span>Tech Leaderboard</span>
                <span className="text-[10px] text-emerald-400 font-mono">Earned Book Hrs</span>
              </div>
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-3 space-y-2.5 max-h-80 overflow-y-auto">
                {techLeaderboard.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-500 italic">No labor clocked this week.</div>
                ) : (
                  techLeaderboard.map((tech, rank) => (
                    <div key={rank} className="flex items-center justify-between gap-2 p-2 bg-zinc-900/40 rounded-xl border border-zinc-800/60">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                          rank === 0 ? 'bg-amber-400 text-black' : rank === 1 ? 'bg-zinc-300 text-black' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {rank + 1}
                        </span>
                        <span className="text-xs font-bold text-zinc-200 truncate">{tech.name}</span>
                      </div>
                      <div className="text-right shrink-0 font-mono">
                        <div className="text-xs font-black text-amber-300">{tech.earnedBookHours.toFixed(1)}h</div>
                        <div className="text-[9px] text-zinc-500">{tech.jobsCompleted} jobs</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================= */}
        {/* SECTION 2: 🔴 THE BAD (QC KICKBACKS, BOTTLENECKS & OVERRUNS) */}
        {/* ============================================================= */}
        <div className="rounded-3xl bg-zinc-900/40 border border-rose-500/20 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-rose-400">
                  The Bad — QC Kickbacks & Bottlenecks
                </h2>
                <p className="text-xs text-zinc-400">Quality rework reasons, blocked bays, and labor overruns to address</p>
              </div>
            </div>
            {canEdit && (
              <button
                onClick={handleAddPainPoint}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold rounded-xl transition cursor-pointer print:hidden"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Roadblock Note</span>
              </button>
            )}
          </div>

          {/* Pain Points / Roadblocks List */}
          {reportNotes.painPoints.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {reportNotes.painPoints.map((point, idx) => (
                <div key={idx} className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-2xl flex items-start justify-between gap-3 text-xs text-rose-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => handleRemovePainPoint(idx)}
                      className="text-zinc-500 hover:text-rose-400 p-1 rounded transition print:hidden"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
            {/* QC Kickbacks Log */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-400 px-1">
                <span>QC Kickbacks & Reworks ({qcKickbacksInWeek.length})</span>
                <span className="text-[10px] text-rose-400">Quality Inspection Log</span>
              </div>
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-800/60 max-h-64 overflow-y-auto">
                {qcKickbacksInWeek.length === 0 ? (
                  <div className="p-6 text-center text-xs text-emerald-400/80 italic flex items-center justify-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Zero QC Kickbacks logged this week! Outstanding build quality.</span>
                  </div>
                ) : (
                  qcKickbacksInWeek.map((k, idx) => (
                    <div
                      key={idx}
                      onClick={(e) => openJobPopupWindow(`/business/${tenantId}/job/${k.jobId}`, k.jobId, e)}
                      className="p-3 hover:bg-zinc-900/60 transition cursor-pointer flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-rose-300">Job #{k.jobNumber}</span>
                          <span className="text-[10px] text-zinc-400 truncate">{k.customerName}</span>
                        </div>
                        <p className="text-xs text-zinc-300 mt-1 font-medium">{k.reason}</p>
                        <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-2">
                          <span>Task: {k.taskName}</span>
                          <span>•</span>
                          <span>Inspector: {k.inspector}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Blocked / On Hold Vehicles */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-400 px-1">
                <span>Currently Blocked / On Hold ({blockedJobs.length})</span>
                <span className="text-[10px] text-amber-400">Shop Bottlenecks</span>
              </div>
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-800/60 max-h-64 overflow-y-auto">
                {blockedJobs.length === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-500 italic">
                    No active blocked jobs on the shop floor.
                  </div>
                ) : (
                  blockedJobs.map(j => (
                    <div
                      key={j.id}
                      onClick={(e) => openJobPopupWindow(`/business/${tenantId}/job/${j.id}`, j.id, e)}
                      className="p-3 hover:bg-zinc-900/60 transition cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-amber-300">Job #{j.jobNumber || j.id.slice(0, 8)}</span>
                          <span className="text-[10px] text-zinc-400 truncate">{j.customerName}</span>
                        </div>
                        <p className="text-xs text-zinc-300 mt-0.5">{j.blockedReason || j.holdReason || 'Blocked on parts or clarification'}</p>
                      </div>
                      <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                        {j.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================= */}
        {/* SECTION 3: 🟡 THE NEEDS & FOCUS (ACTION ITEMS & SPRINT GOALS) */}
        {/* ============================================================= */}
        <div className="rounded-3xl bg-zinc-900/40 border border-amber-500/20 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-amber-400">
                  The Needs & Focus — Action Items & Next Week Goals
                </h2>
                <p className="text-xs text-zinc-400">Equipment needs, parts awaiting delivery, and sprint commitments</p>
              </div>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              {canEdit && (
                <>
                  <button
                    onClick={handleAddShopNeed}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tooling Need</span>
                  </button>
                  <button
                    onClick={handleAddActionItem}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Action Item</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Interactive Action Items Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-400 px-1">
                <span>Action Items & Commitments ({reportNotes.actionItems.length})</span>
                <span className="text-[10px] text-indigo-400">Tuesday Commitments</span>
              </div>
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-3 space-y-2 max-h-72 overflow-y-auto">
                {reportNotes.actionItems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-500 italic">
                    No action items created yet. Tap "New Action Item" to add commitments for this week.
                  </div>
                ) : (
                  reportNotes.actionItems.map(item => (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition ${
                        item.completed
                          ? 'bg-zinc-900/30 border-zinc-800/40 text-zinc-500 line-through'
                          : 'bg-zinc-900/70 border-zinc-800 text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer" onClick={() => handleToggleActionItem(item.id)}>
                        {item.completed ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-zinc-500 shrink-0" />
                        )}
                        <span className="text-xs font-medium truncate">{item.text}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-zinc-800 text-zinc-300">
                          {item.assignee}
                        </span>
                        {canEdit && (
                          <button
                            onClick={() => handleRemoveActionItem(item.id)}
                            className="text-zinc-500 hover:text-rose-400 p-1 rounded print:hidden"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Outstanding Parts Awaiting Arrival */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-400 px-1">
                <span>Critical Parts Awaiting Arrival ({pendingParts.length})</span>
                <span className="text-[10px] text-amber-400">Parts Hub Queue</span>
              </div>
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-800/60 max-h-72 overflow-y-auto">
                {pendingParts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-500 italic">
                    All parts requests are fulfilled!
                  </div>
                ) : (
                  pendingParts.slice(0, 10).map(p => (
                    <div key={p.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-bold text-zinc-200 truncate">{p.partName || p.description || 'Custom Part'}</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5 flex items-center gap-2">
                          <span>Qty: {p.quantity || 1}</span>
                          <span>•</span>
                          <span>Job #{p.jobNumber || p.jobId?.slice(0, 6)}</span>
                          {p.vendor && <span>• Vendor: {p.vendor}</span>}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded ${
                        p.urgency === 'Urgent / Blocker' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-zinc-800 text-zinc-300'
                      }`}>
                        {p.status || 'Pending'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Tooling & Facility Needs List */}
          {reportNotes.shopNeeds.length > 0 && (
            <div className="pt-2 space-y-2">
              <span className="text-xs font-bold text-zinc-400 px-1">Tooling, Bay & Facility Needs:</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {reportNotes.shopNeeds.map((need, idx) => (
                  <div key={idx} className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-2xl flex items-start justify-between gap-3 text-xs text-zinc-300">
                    <div className="flex items-start gap-2">
                      <Wrench className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>{need}</span>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => handleRemoveShopNeed(idx)}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded transition print:hidden"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
