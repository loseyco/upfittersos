import { useEffect, useMemo, useState } from 'react';
import {
  collection, query, limit, onSnapshot
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import {
  ExternalLink, AlertTriangle, Package, Mail, Share2, Activity,
  Clock, Wrench, ShieldCheck, MapPin
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Zone {
  id: string;
  name: string;
  type: string;
  currentJobId?: string;
  currentVehicleVin?: string;
  lastAssignedAt?: any;
  isArchived?: boolean;
}

interface PartsRequest {
  id: string;
  jobId: string;
  partName?: string;
  partNumber?: string;
  description?: string;
  status: 'pending' | 'ordered' | 'received' | 'fulfilled' | 'cancelled';
  qty?: number;
}

const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate();
    } catch (e) {
      // fallback
    }
  }
  if (val && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

export function ProgressDigest({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  
  // Live Subscribed Data
  const [jobsList, setJobsList] = useState<any[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [vehiclesList, setVehiclesList] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<PartsRequest[]>([]);
  const [tasksMap, setTasksMap] = useState<Record<string, any[]>>({});

  // Subscriptions Setup
  useEffect(() => {
    if (!tenantId) return;

    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      setJobsList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubZones = onSnapshot(query(collection(db, `businesses/${tenantId}/zones`)), (snap) => {
      setZonesList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubVehicles = onSnapshot(query(collection(db, `businesses/${tenantId}/vehicles`), limit(1000)), (snap) => {
      setVehiclesList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubParts = onSnapshot(query(collection(db, `businesses/${tenantId}/parts_requests`)), (snap) => {
      setPartsRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    return () => {
      unsubJobs();
      unsubZones();
      unsubVehicles();
      unsubParts();
    };
  }, [tenantId]);

  // Subscribe to tasks for each visible Job
  const visibleJobIds = useMemo(() => {
    return jobsList.map(j => j.id);
  }, [jobsList]);

  useEffect(() => {
    if (!tenantId || visibleJobIds.length === 0) {
      setTasksMap({});
      return;
    }

    const unsubs = visibleJobIds.map(jobId => {
      const q = query(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`));
      return onSnapshot(q, (snap) => {
        const jobTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setTasksMap(prev => ({
          ...prev,
          [jobId]: jobTasks
        }));
      }, (err) => {
        console.warn(`Could not subscribe to tasks for job ${jobId}:`, err);
      });
    });

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [tenantId, visibleJobIds]);

  // Activity Resolver for "Today"
  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const isToday = (dateVal: any) => {
    if (!dateVal) return false;
    const d = parseSafeDate(dateVal);
    return d && d >= startOfToday;
  };

  // Compile daily items
  const reportData = useMemo(() => {
    let sections = {
      qcPassed: [] as any[],
      readyForQc: [] as any[],
      rework: [] as any[],
      blockersLogged: [] as any[],
      blockersResolved: [] as any[],
      bayMoves: [] as any[],
      generalUpdates: [] as any[],
      currentBlockers: [] as any[],
      missingParts: [] as any[]
    };

    jobsList.forEach((job) => {
      const vehicle = vehiclesList.find(v => v.vin === job.vehicleId);
      const vehicleLabel = vehicle
        ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
        : (job.vehicleId ? `VIN: ${job.vehicleId.slice(-8)}` : 'N/A');
      const jobDesc = `${job.jobNumber ? `#${job.jobNumber} ` : ''}${job.title} (${vehicleLabel})`;

      // 1. Task progress today
      const jobTasks = tasksMap[job.id] || [];
      const nonGeneralTasks = jobTasks.filter(t => t.title !== 'General');
      
      const totalTasks = nonGeneralTasks.length;
      const allTasksQcReady = totalTasks > 0 && nonGeneralTasks.every(t => 
        t.status === 'QC' || t.status === 'QC Complete' || t.status === 'completed'
      );
      
      const hasQcActivityToday = nonGeneralTasks.some(t => 
        isToday(t.completedAt) || isToday(t.qcCompletedAt) || isToday(t.updatedAt)
      );

      if (allTasksQcReady && hasQcActivityToday) {
        const crewNames = Array.from(new Set(nonGeneralTasks.flatMap(t => t.assignedStaff?.map((s: any) => s.name) || []))).join(', ') || 'Unassigned';
        sections.readyForQc.push({
          jobId: job.id,
          message: `Job ${jobDesc} is fully ready for Quality Control!`,
          subtext: `All ${totalTasks} tasks completed by crew: ${crewNames}`
        });
      }

      nonGeneralTasks.forEach(task => {
        const techNames = task.assignedStaff?.map((s: any) => s.name).join(', ') || 'Unassigned';
        if (task.status === 'QC Complete' && (isToday(task.qcCompletedAt) || isToday(task.updatedAt))) {
          sections.qcPassed.push({
            jobId: job.id,
            taskId: task.id,
            message: `Passed QC: "${task.title}"`,
            subtext: `Job: ${jobDesc} | Crew: ${techNames}`
          });
        } else if (task.status === 'Rework' && (isToday(task.qcFailedAt) || isToday(task.updatedAt))) {
          sections.rework.push({
            jobId: job.id,
            taskId: task.id,
            message: `Flagged Rework: "${task.title}"`,
            subtext: `Reason: ${task.reworkReason || 'Needs adjustments'} | Job: ${jobDesc}`
          });
        }
      });

      // 2. Blockers
      const blockers = job.blockers || [];
      blockers.forEach((b: any) => {
        if (b.status === 'active' && isToday(b.createdAt)) {
          sections.blockersLogged.push({
            jobId: job.id,
            message: `New Blocker Logged on Job ${job.title}`,
            subtext: `"${b.message}"`
          });
        } else if (b.status === 'cleared' && isToday(b.clearedAt)) {
          sections.blockersResolved.push({
            jobId: job.id,
            message: `Blocker Resolved on Job ${job.title}`,
            subtext: `"${b.message}"`
          });
        }
      });

      const activeBlockers = blockers.filter((b: any) => b.status === 'active');
      if (activeBlockers.length > 0 || job.status === 'Blocked') {
        const blockerMsgs = activeBlockers.map((b: any) => `"${b.message}"`).join(', ') || 'Status marked as Blocked';
        sections.currentBlockers.push({
          jobId: job.id,
          message: `${job.jobNumber ? `#${job.jobNumber} - ` : ''}${job.title}`,
          subtext: blockerMsgs
        });
      }

      // 3. Parts status
      const jobParts = partsRequests.filter(p => p.jobId === job.id);
      const requestedCount = jobParts.filter(p => (p.status || '').toLowerCase() === 'pending' || (p.status || '').toLowerCase() === 'requested').length;
      const orderedCount = jobParts.filter(p => (p.status || '').toLowerCase() === 'ordered').length;
      const receivedCount = jobParts.filter(p => (p.status || '').toLowerCase() === 'received' || (p.status || '').toLowerCase() === 'fulfilled').length;
      
      if (requestedCount > 0) {
        sections.missingParts.push({
          jobId: job.id,
          message: `${job.jobNumber ? `#${job.jobNumber} - ` : ''}${job.title}`,
          subtext: `Waiting on ${requestedCount} pending parts (${orderedCount} ordered, ${receivedCount} received)`
        });
      }

      // 4. Bay moves
      const matchedZone = zonesList.find(z => z.currentJobId === job.id);
      if (matchedZone && isToday(matchedZone.lastAssignedAt)) {
        sections.bayMoves.push({
          jobId: job.id,
          message: `Moved to ${matchedZone.name}`,
          subtext: `Job: ${job.title} (${vehicleLabel})`
        });
      }

      // 5. General status
      if (isToday(job.updatedAt)) {
        sections.generalUpdates.push({
          jobId: job.id,
          message: `Job Status: "${job.status || 'Active'}"`,
          subtext: `Job: ${job.title} (${vehicleLabel})`
        });
      }
    });

    return sections;
  }, [jobsList, vehiclesList, partsRequests, zonesList, tasksMap, startOfToday]);

  const compileRawText = () => {
    const todayStr = new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let text = `📋 UPFITTERS OS - DAILY SHOP PROGRESS DIGEST\n`;
    text += `Report Date: ${todayStr}\n`;
    text += `==================================================\n\n`;

    let totalChanges = 0;

    if (reportData.qcPassed.length > 0) {
      text += `🏁 PASSED QUALITY CONTROL TODAY:\n`;
      reportData.qcPassed.forEach(item => text += `   - ${item.message} (${item.subtext})\n`);
      text += `\n`;
      totalChanges += reportData.qcPassed.length;
    }

    if (reportData.readyForQc.length > 0) {
      text += `🔧 COMPLETED BY TECHS & READY FOR QC:\n`;
      reportData.readyForQc.forEach(item => text += `   - ${item.message} (${item.subtext})\n`);
      text += `\n`;
      totalChanges += reportData.readyForQc.length;
    }

    if (reportData.rework.length > 0) {
      text += `⚠️ REWORK / FAILED QC REASONS:\n`;
      reportData.rework.forEach(item => text += `   - ${item.message} (${item.subtext})\n`);
      text += `\n`;
      totalChanges += reportData.rework.length;
    }

    if (reportData.currentBlockers.length > 0) {
      text += `🛑 CURRENT ACTIVE BLOCKERS / ON HOLD:\n`;
      reportData.currentBlockers.forEach(item => text += `   - Job ${item.message}: ${item.subtext}\n`);
      text += `\n`;
      totalChanges += reportData.currentBlockers.length;
    }

    if (reportData.missingParts.length > 0) {
      text += `📦 JOBS CURRENTLY WAITING ON PARTS:\n`;
      reportData.missingParts.forEach(item => text += `   - Job ${item.message}: ${item.subtext}\n`);
      text += `\n`;
      totalChanges += reportData.missingParts.length;
    }

    if (reportData.blockersLogged.length > 0 || reportData.blockersResolved.length > 0) {
      text += `🛑 TODAY'S BLOCKER ACTIVITY:\n`;
      reportData.blockersLogged.forEach(item => text += `   - ${item.message} (${item.subtext})\n`);
      reportData.blockersResolved.forEach(item => text += `   - ${item.message} (${item.subtext})\n`);
      text += `\n`;
      totalChanges += (reportData.blockersLogged.length + reportData.blockersResolved.length);
    }

    if (reportData.bayMoves.length > 0) {
      text += `📍 VEHICLE BAY MOVES:\n`;
      reportData.bayMoves.forEach(item => text += `   - ${item.message} (${item.subtext})\n`);
      text += `\n`;
      totalChanges += reportData.bayMoves.length;
    }

    if (reportData.generalUpdates.length > 0) {
      const uniqueUpdates = reportData.generalUpdates.slice(0, 10);
      text += `📋 OTHER ACTIVE JOB UPDATES:\n`;
      uniqueUpdates.forEach(item => text += `   - ${item.message} (${item.subtext})\n`);
      text += `\n`;
      totalChanges += uniqueUpdates.length;
    }

    if (totalChanges === 0) {
      text += `No activity or status changes recorded in the shop yet today. Let's keep pushing! 💪\n\n`;
    }

    text += `==================================================\n`;
    text += `Upfitters OS - Real-time Shop Command Center\n`;

    return text;
  };

  const handleCopyReport = () => {
    const rawText = compileRawText();
    navigator.clipboard.writeText(rawText);
    toast.success("Progress digest copied to clipboard!");
  };

  const handleEmailReport = () => {
    const rawText = compileRawText();
    const emailSubject = encodeURIComponent(`Daily Shop Progress Digest - ${new Date().toLocaleDateString()}`);
    const emailBody = encodeURIComponent(rawText);
    window.location.href = `mailto:?subject=${emailSubject}&body=${emailBody}`;
    toast.success("Opening Email Client...");
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 bg-zinc-50 dark:bg-zinc-950 font-sans text-xs select-none gap-6 overflow-auto">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:py-5 sm:px-6 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500 shrink-0" />
            Today's Progress
          </h2>
          <p className="text-sm text-zinc-500 mt-1">Real-time what's happened today digest. Keep track of QC completions, active blockers, reworks, and bay moves.</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleCopyReport}
            className="flex px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2"
          >
            <Share2 className="w-3.5 h-3.5 text-zinc-450" />
            Copy Report
          </button>
          <button 
            onClick={handleEmailReport}
            className="flex px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2 border border-indigo-500/20"
          >
            <Mail className="w-3.5 h-3.5 text-white" />
            Email Digest
          </button>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Connected
          </div>
        </div>
      </div>

      {/* Metrics Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        
        {/* QC Passed */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-24">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">QC Passed</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
            {reportData.qcPassed.length}
          </div>
          <div className="text-[9px] text-zinc-400 font-semibold mt-0.5">Tasks passed today</div>
          <div className="absolute right-0 bottom-0 w-24 h-24 bg-emerald-500/[0.02] rounded-full translate-x-8 translate-y-8" />
        </div>

        {/* Ready for QC */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-24">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Ready for QC</span>
            <Wrench className="w-4 h-4 text-indigo-500 shrink-0" />
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
            {reportData.readyForQc.length}
          </div>
          <div className="text-[9px] text-zinc-400 font-semibold mt-0.5">Jobs complete today</div>
          <div className="absolute right-0 bottom-0 w-24 h-24 bg-indigo-500/[0.02] rounded-full translate-x-8 translate-y-8" />
        </div>

        {/* Flagged Rework */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-24">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Reworks</span>
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
            {reportData.rework.length}
          </div>
          <div className="text-[9px] text-zinc-400 font-semibold mt-0.5">Flags logged today</div>
          <div className="absolute right-0 bottom-0 w-24 h-24 bg-rose-500/[0.02] rounded-full translate-x-8 translate-y-8" />
        </div>

        {/* Active Blockers */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-24">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Active Blockers</span>
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
            {reportData.currentBlockers.length}
          </div>
          <div className="text-[9px] text-zinc-400 font-semibold mt-0.5">Jobs currently stuck</div>
          <div className="absolute right-0 bottom-0 w-24 h-24 bg-amber-500/[0.02] rounded-full translate-x-8 translate-y-8" />
        </div>

        {/* Missing Parts */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-24 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Waiting Parts</span>
            <Package className="w-4 h-4 text-blue-500 shrink-0" />
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
            {reportData.missingParts.length}
          </div>
          <div className="text-[9px] text-zinc-400 font-semibold mt-0.5">Jobs missing requests</div>
          <div className="absolute right-0 bottom-0 w-24 h-24 bg-blue-500/[0.02] rounded-full translate-x-8 translate-y-8" />
        </div>

      </div>

      {/* Grid of timelines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Blocks & Parts */}
        <div className="space-y-6">
          
          {/* Active Blockers Alert Board */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
              <h3 className="font-black text-xs uppercase tracking-wider text-zinc-805 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                Blocked & On-Hold Jobs ({reportData.currentBlockers.length})
              </h3>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {reportData.currentBlockers.length === 0 ? (
                <div className="p-6 text-center text-zinc-400 dark:text-zinc-500 italic">No blocked jobs currently!</div>
              ) : (
                reportData.currentBlockers.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 hover:border-red-500/20 cursor-pointer transition active:scale-[0.99] flex flex-col gap-1"
                    onClick={() => navigate(`/business/${tenantId}/job/${item.jobId}`)}
                  >
                    <div className="font-bold text-zinc-900 dark:text-white flex items-center justify-between">
                      <span>{item.message}</span>
                      <ExternalLink className="w-3 h-3 text-zinc-400 shrink-0" />
                    </div>
                    <div className="text-[10px] text-red-500 font-semibold">{item.subtext}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Missing Parts Alerts */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
              <h3 className="font-black text-xs uppercase tracking-wider text-zinc-805 dark:text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500 shrink-0" />
                Waiting on Parts ({reportData.missingParts.length})
              </h3>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {reportData.missingParts.length === 0 ? (
                <div className="p-6 text-center text-zinc-400 dark:text-zinc-500 italic">No jobs waiting on parts!</div>
              ) : (
                reportData.missingParts.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 hover:border-blue-500/20 cursor-pointer transition active:scale-[0.99] flex flex-col gap-1"
                    onClick={() => navigate(`/business/${tenantId}/job/${item.jobId}`)}
                  >
                    <div className="font-bold text-zinc-900 dark:text-white flex items-center justify-between">
                      <span>{item.message}</span>
                      <ExternalLink className="w-3 h-3 text-zinc-400 shrink-0" />
                    </div>
                    <div className="text-[10px] text-blue-500 font-semibold">{item.subtext}</div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Middle Column: QC and Completions */}
        <div className="space-y-6">
          
          {/* Fully Completed / Ready for QC */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
              <h3 className="font-black text-xs uppercase tracking-wider text-zinc-805 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                Fully Completed & QC Ready ({reportData.readyForQc.length})
              </h3>
            </div>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {reportData.readyForQc.length === 0 ? (
                <div className="p-6 text-center text-zinc-400 dark:text-zinc-500 italic">No jobs completed today yet.</div>
              ) : (
                reportData.readyForQc.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 hover:border-emerald-500/20 cursor-pointer transition active:scale-[0.99] flex flex-col gap-1"
                    onClick={() => navigate(`/business/${tenantId}/job/${item.jobId}`)}
                  >
                    <div className="font-bold text-zinc-900 dark:text-white flex items-center justify-between">
                      <span>{item.message}</span>
                      <ExternalLink className="w-3 h-3 text-zinc-400 shrink-0" />
                    </div>
                    <div className="text-[10px] text-emerald-600 font-bold">{item.subtext}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Rework alert board */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
              <h3 className="font-black text-xs uppercase tracking-wider text-zinc-850 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                QC Reworks Flagged Today ({reportData.rework.length})
              </h3>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {reportData.rework.length === 0 ? (
                <div className="p-6 text-center text-zinc-400 dark:text-zinc-500 italic">No reworks logged today!</div>
              ) : (
                reportData.rework.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 hover:border-rose-500/20 cursor-pointer transition active:scale-[0.99] flex flex-col gap-1"
                    onClick={() => navigate(`/business/${tenantId}/job/${item.jobId}`)}
                  >
                    <div className="font-bold text-rose-650 dark:text-rose-400 flex items-center justify-between">
                      <span>{item.message}</span>
                      <ExternalLink className="w-3 h-3 text-zinc-400 shrink-0" />
                    </div>
                    <div className="text-[10px] text-zinc-500 font-semibold">{item.subtext}</div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Other Progress Activity (Bay Moves, Blocker Changes, Tasks Passed) */}
        <div className="space-y-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
            <h3 className="font-black text-xs uppercase tracking-wider text-zinc-805 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-400 shrink-0 animate-spin" style={{ animationDuration: '6s' }} />
              Live Shop Timeline (Today)
            </h3>
          </div>
          
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
            
            {/* Logged Blockers */}
            {reportData.blockersLogged.map((item, idx) => (
              <div key={`bl-${idx}`} className="flex gap-3 text-xs border-l-2 border-red-500 pl-3 py-1">
                <div className="flex-1">
                  <div className="font-black text-zinc-850 dark:text-white">{item.message}</div>
                  <div className="text-[10px] text-zinc-450 dark:text-zinc-500 mt-0.5">{item.subtext}</div>
                </div>
              </div>
            ))}

            {/* Resolved Blockers */}
            {reportData.blockersResolved.map((item, idx) => (
              <div key={`br-${idx}`} className="flex gap-3 text-xs border-l-2 border-emerald-500 pl-3 py-1">
                <div className="flex-1">
                  <div className="font-black text-zinc-850 dark:text-white">{item.message}</div>
                  <div className="text-[10px] text-zinc-450 dark:text-zinc-500 mt-0.5">{item.subtext}</div>
                </div>
              </div>
            ))}

            {/* Bay Moves */}
            {reportData.bayMoves.map((item, idx) => (
              <div key={`bm-${idx}`} className="flex gap-3 text-xs border-l-2 border-indigo-500 pl-3 py-1">
                <div className="flex-1">
                  <div className="font-black text-zinc-850 dark:text-white flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    {item.message}
                  </div>
                  <div className="text-[10px] text-zinc-450 dark:text-zinc-500 mt-0.5">{item.subtext}</div>
                </div>
              </div>
            ))}

            {/* Tasks Passed */}
            {reportData.qcPassed.map((item, idx) => (
              <div key={`qp-${idx}`} className="flex gap-3 text-xs border-l-2 border-emerald-500 pl-3 py-1">
                <div className="flex-1">
                  <div className="font-black text-zinc-850 dark:text-white">{item.message}</div>
                  <div className="text-[10px] text-zinc-450 dark:text-zinc-500 mt-0.5">{item.subtext}</div>
                </div>
              </div>
            ))}

            {/* Other updates */}
            {reportData.generalUpdates.slice(0, 10).map((item, idx) => (
              <div key={`gu-${idx}`} className="flex gap-3 text-xs border-l-2 border-zinc-200 dark:border-zinc-800 pl-3 py-1">
                <div className="flex-1">
                  <div className="font-black text-zinc-800 dark:text-zinc-350">{item.message}</div>
                  <div className="text-[10px] text-zinc-450 dark:text-zinc-500 mt-0.5">{item.subtext}</div>
                </div>
              </div>
            ))}

            {reportData.blockersLogged.length + reportData.blockersResolved.length + reportData.bayMoves.length + reportData.qcPassed.length + reportData.generalUpdates.length === 0 && (
              <div className="p-12 text-center text-zinc-400 dark:text-zinc-500 italic">No shop timeline activity logged today yet.</div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
