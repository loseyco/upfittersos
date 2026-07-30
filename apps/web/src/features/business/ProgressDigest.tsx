import { useEffect, useMemo, useState } from 'react';
import {
  collection, query, limit, onSnapshot
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import {
  ExternalLink, AlertTriangle, Package, Mail, Share2, Activity,
  Wrench, ShieldCheck, Sparkles, CheckCircle2,
  Printer, User, Tag, Search, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

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
  status: string;
  qty?: number;
  quantity?: number;
  createdAt?: any;
  orderedAt?: any;
  receivedAt?: any;
  timestamp?: any;
  requestedBy?: string;
  createdByName?: string;
  notes?: string;
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
  const [staffList, setStaffList] = useState<any[]>([]);
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [sessionsList, setSessionsList] = useState<any[]>([]);

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

    const unsubStaff = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubDepts = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      setDepartmentsList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const unsubSessions = onSnapshot(collection(db, `businesses/${tenantId}/time_sessions`), (snap) => {
      setSessionsList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    return () => {
      unsubJobs();
      unsubZones();
      unsubVehicles();
      unsubParts();
      unsubStaff();
      unsubDepts();
      unsubSessions();
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

  // Simplified Today's Operations Log Feed (Derived from DailyLogV3 format)
  const todaysOperationsLogFeed = useMemo(() => {
    const feed: any[] = [];
    const today = new Date();

    const isSameDate = (d: Date | null) => {
      if (!d) return false;
      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      );
    };

    // Helper to resolve staff member
    const resolveStaff = (actorId?: string, actorName?: string) => {
      const found = staffList.find(s => s.id === actorId || s.userId === actorId || s.name === actorName || `${s.firstName || ''} ${s.lastName || ''}`.trim() === actorName);
      let name = found ? `${found.firstName || found.name || ''} ${found.lastName || ''}`.trim() : (actorName || 'Tech');
      if (name.toLowerCase().includes('kathy')) name = 'Technician';
      return name;
    };

    // 1. Task Events (Done, Blocked, Notes)
    const combinedTasksMap: Record<string, any[]> = { ...tasksMap };
    jobsList.forEach(j => {
      if (Array.isArray(j.tasks) && j.tasks.length > 0) {
        const existing = combinedTasksMap[j.id] || [];
        const existingIds = new Set(existing.map((t: any) => t.id));
        const embedded = j.tasks
          .filter((t: any) => t && (t.id || t.name || t.title) && !existingIds.has(t.id))
          .map((t: any, idx: number) => ({ id: t.id || `embedded_${idx}`, jobId: j.id, ...t }));
        combinedTasksMap[j.id] = [...existing, ...embedded];
      }
    });

    Object.entries(combinedTasksMap).forEach(([jobId, tasks]) => {
      const job = jobsList.find(j => j.id === jobId);
      tasks.forEach(t => {
        const taskTitle = t.name || t.title || 'Task';
        const bookTimeVal = parseFloat(t.bookTime || t.estimatedHours || t.hours || '0');

        // Task Done
        const compDate = parseSafeDate(t.completedAt || t.completedDate || t.qcCompletedAt || t.closedAt);
        if (compDate && isSameDate(compDate)) {
          const who = resolveStaff(t.completedByStaffId || t.completedBy || t.assignedTo, t.completedByStaffName);
          const rawStatus = (t.status || 'READY FOR QC').toUpperCase();
          const taskStatus = ['QC', 'READY_FOR_QC'].includes(rawStatus) ? 'READY FOR QC' : rawStatus;
          feed.push({
            id: `task_done_${t.id}_${compDate.getTime()}`,
            timestamp: compDate,
            timeStr: compDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            badgeLabel: taskStatus === 'READY FOR QC' ? 'READY FOR QC' : 'TASK DONE',
            badgeClass: taskStatus === 'READY FOR QC' 
              ? 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
            who,
            jobId,
            jobNumber: job?.jobNumber || 'N/A',
            jobTitle: job?.customerName || job?.title || 'Upfit Job',
            details: `Task Completed: "${taskTitle}" ${bookTimeVal > 0 ? `(${bookTimeVal}h Book)` : ''}`,
            note: t.note || t.notes || t.qcNote || ''
          });
        }

        // Task Blocked / On Hold
        const statusLower = (t.status || '').toLowerCase().trim();
        const isBlocked = t.isBlocked === true || t.is_blocked === true || ['blocked', 'on_hold', 'hold', 'issue', 'needs_part', 'needs_parts', 'waiting_parts', 'waiting'].includes(statusLower);
        if (isBlocked) {
          const blockedDate = parseSafeDate(t.blockedAt || t.blockedDate || t.blocked_at || t.holdAt || t.updatedAt || t.createdAt);
          if (blockedDate && isSameDate(blockedDate)) {
            const who = resolveStaff(t.blockedBy || t.updatedBy, t.blockedByName || t.updatedByName);
            feed.push({
              id: `task_blocked_${t.id}_${blockedDate.getTime()}`,
              timestamp: blockedDate,
              timeStr: blockedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              badgeLabel: statusLower === 'on_hold' || statusLower === 'hold' ? 'ON HOLD' : 'BLOCKED',
              badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
              who,
              jobId,
              jobNumber: job?.jobNumber || 'N/A',
              jobTitle: job?.customerName || job?.title || 'Upfit Job',
              details: `Task Blocked: "${taskTitle}"`,
              note: t.blockedReason || t.blockReason || t.issue || t.reason || ''
            });
          }
        }

        // Task Note Added
        const noteEvents = Array.isArray(t.notesHistory) ? t.notesHistory : (Array.isArray(t.comments) ? t.comments : []);
        if (noteEvents.length > 0) {
          noteEvents.forEach((n: any, nIdx: number) => {
            const nDate = parseSafeDate(n.createdAt || n.timestamp || n.date);
            if (nDate && isSameDate(nDate)) {
              const who = resolveStaff(n.userId || n.authorId || n.createdBy, n.userName || n.authorName);
              feed.push({
                id: `task_note_${t.id}_${nIdx}_${nDate.getTime()}`,
                timestamp: nDate,
                timeStr: nDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                badgeLabel: 'TASK NOTE',
                badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
                who,
                jobId,
                jobNumber: job?.jobNumber || 'N/A',
                jobTitle: job?.customerName || job?.title || 'Upfit Job',
                details: `Note Added to Task "${taskTitle}"`,
                note: n.text || n.content || n.note || n.comment || ''
              });
            }
          });
        }
      });
    });

    // 2. Timeclock Shift Events (Clock In / Clock Out)
    sessionsList.forEach(s => {
      const stMember = staffList.find(st => st.id === s.userId || st.userId === s.userId);
      const who = stMember ? `${stMember.firstName || stMember.name || 'Staff'} ${stMember.lastName || ''}`.trim() : 'Staff Member';

      // Clock In
      const clockInDate = parseSafeDate(s.clockIn || s.startTime || s.createdAt);
      if (clockInDate && isSameDate(clockInDate)) {
        feed.push({
          id: `shift_in_${s.id}_${clockInDate.getTime()}`,
          timestamp: clockInDate,
          timeStr: clockInDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          badgeLabel: 'CLOCK IN',
          badgeClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
          who,
          jobId: '',
          jobNumber: '--',
          jobTitle: '',
          details: `Clocked in (${s.deptName || stMember?.department || 'General Shop'})`,
          note: s.notes || ''
        });
      }

      // Clock Out
      const clockOutDate = parseSafeDate(s.clockOut || s.endTime);
      if (clockOutDate && isSameDate(clockOutDate)) {
        feed.push({
          id: `shift_out_${s.id}_${clockOutDate.getTime()}`,
          timestamp: clockOutDate,
          timeStr: clockOutDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          badgeLabel: 'CLOCK OUT',
          badgeClass: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20',
          who,
          jobId: '',
          jobNumber: '--',
          jobTitle: '',
          details: `Clocked out of shift`,
          note: s.notes || ''
        });
      }
    });

    // 3. Parts Requests Events
    partsRequests.forEach(p => {
      const pDate = parseSafeDate(p.createdAt || p.orderedAt || p.receivedAt || p.timestamp);
      if (pDate && isSameDate(pDate)) {
        const job = jobsList.find(j => j.id === p.jobId);
        const pStatus = (p.status || 'pending').toUpperCase();
        feed.push({
          id: `part_${p.id}_${pDate.getTime()}`,
          timestamp: pDate,
          timeStr: pDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          badgeLabel: `PARTS ${pStatus}`,
          badgeClass: pStatus === 'RECEIVED' || pStatus === 'FULFILLED' 
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
            : pStatus === 'ORDERED'
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          who: p.requestedBy || p.createdByName || 'Parts Team',
          jobId: p.jobId || '',
          jobNumber: job?.jobNumber || 'N/A',
          jobTitle: job?.customerName || job?.title || 'Upfit Job',
          details: `Parts Request [${pStatus}]: ${p.qty || 1}x ${p.partName || p.description || 'Part'}${p.partNumber ? ` (#${p.partNumber})` : ''}`,
          note: p.notes || ''
        });
      }
    });

    // Sort descending by timestamp
    return feed.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [jobsList, tasksMap, sessionsList, partsRequests, staffList]);

  // Operations Log Column Filters & Category Filter
  const [logCategoryFilter, setLogCategoryFilter] = useState<string>('all');
  const [logStaffFilter, setLogStaffFilter] = useState<string>('all');
  const [logBadgeFilter, setLogBadgeFilter] = useState<string>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');

  // Extract unique staff names and badge labels present in today's log feed for Excel-style column dropdowns
  const availableLogStaff = useMemo(() => {
    const set = new Set<string>();
    todaysOperationsLogFeed.forEach(item => {
      if (item.who && item.who !== 'Tech' && item.who !== 'Staff Member') {
        set.add(item.who);
      }
    });
    return Array.from(set).sort();
  }, [todaysOperationsLogFeed]);

  const availableLogBadges = useMemo(() => {
    const set = new Set<string>();
    todaysOperationsLogFeed.forEach(item => {
      if (item.badgeLabel) set.add(item.badgeLabel);
    });
    return Array.from(set).sort();
  }, [todaysOperationsLogFeed]);

  // Filtered Today's Operations Log Feed
  const filteredOperationsLogFeed = useMemo(() => {
    return todaysOperationsLogFeed.filter(item => {
      // 1. Category Filter (Tasks & QC vs Timeclock vs Parts vs Bay Moves)
      if (logCategoryFilter === 'tasks') {
        if (!['TASK DONE', 'READY FOR QC', 'TASK BLOCKED', 'ON HOLD', 'TASK NOTE', 'TASK PHOTO', 'QC PASSED', 'QC REWORK'].includes(item.badgeLabel)) return false;
      } else if (logCategoryFilter === 'shifts') {
        if (!['CLOCK IN', 'CLOCK OUT', 'LUNCH START', 'LUNCH END', 'BREAK START', 'BREAK END', 'TASK START', 'TASK END'].includes(item.badgeLabel)) return false;
      } else if (logCategoryFilter === 'parts') {
        if (!item.badgeLabel.startsWith('PARTS')) return false;
      }

      // 2. Specific Badge Filter (Excel Column Filter)
      if (logBadgeFilter !== 'all' && item.badgeLabel !== logBadgeFilter) {
        return false;
      }

      // 3. Staff Member Filter (Excel Column Filter)
      if (logStaffFilter !== 'all' && item.who !== logStaffFilter) {
        return false;
      }

      // 4. Search Query Filter
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase().trim();
        const detailsLower = (item.details || '').toLowerCase();
        const whoLower = (item.who || '').toLowerCase();
        const jobNumLower = (item.jobNumber || '').toLowerCase();
        const jobTitleLower = (item.jobTitle || '').toLowerCase();
        const noteLower = (item.note || '').toLowerCase();

        if (!detailsLower.includes(q) && !whoLower.includes(q) && !jobNumLower.includes(q) && !jobTitleLower.includes(q) && !noteLower.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [todaysOperationsLogFeed, logCategoryFilter, logStaffFilter, logBadgeFilter, logSearchQuery]);

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
      missingParts: [] as any[],
      readyForCustomerToday: [] as any[],
      completedToday: [] as any[]
    };

    jobsList.forEach((job) => {
      const vehicle = job.vehicleId ? vehiclesList.find(v => v.vin === job.vehicleId) : null;
      const vehicleLabel = vehicle
        ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
        : (job.vehicleId ? `VIN: ${job.vehicleId.slice(-8)}` : 'No Vehicle Assigned');
      const jobDesc = `${job.jobNumber ? `#${job.jobNumber} ` : ''}${job.title} (${vehicleLabel})`;

      // Track Ready for Customer Today
      const isReadyForCustomerToday = job.readyForCustomerAt
        ? isToday(job.readyForCustomerAt)
        : (job.status === 'Ready for Customer' && isToday(job.updatedAt));
      
      if (isReadyForCustomerToday) {
        const timeVal = job.readyForCustomerAt || job.updatedAt;
        const timeStr = timeVal ? new Date(parseSafeDate(timeVal)!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        sections.readyForCustomerToday.push({
          jobId: job.id,
          message: `${job.jobNumber ? `#${job.jobNumber} - ` : ''}${job.title}`,
          subtext: `Ready for customer since ${timeStr}`
        });
      }

      // Track Completed Today (complete meaning with customer, not our problem anymore)
      const isCompletedToday = job.completedAt
        ? isToday(job.completedAt)
        : (['Completed', 'Closed'].includes(job.status || '') && isToday(job.updatedAt));

      if (isCompletedToday) {
        const timeVal = job.completedAt || job.updatedAt;
        const timeStr = timeVal ? new Date(parseSafeDate(timeVal)!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        sections.completedToday.push({
          jobId: job.id,
          message: `${job.jobNumber ? `#${job.jobNumber} - ` : ''}${job.title}`,
          subtext: `Completed & picked up since ${timeStr}`
        });
      }

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

      const isExplicitReadyForQC = job.status === 'Ready for QC';
      const isReadyForCustomerOrClosed = ['Ready for Customer', 'Completed', 'Closed'].includes(job.status || '');
      if (!isReadyForCustomerOrClosed && (isExplicitReadyForQC || (allTasksQcReady && hasQcActivityToday))) {
        const crewNames = Array.from(new Set(nonGeneralTasks.flatMap(t => t.assignedStaff?.map((s: any) => s.name) || []))).join(', ') || 'Unassigned';
        sections.readyForQc.push({
          jobId: job.id,
          message: isExplicitReadyForQC ? `Job ${jobDesc} is marked Ready for QC` : `Job ${jobDesc} is fully ready for Quality Control!`,
          subtext: isExplicitReadyForQC ? `Status: Ready for QC | Crew: ${crewNames}` : `All ${totalTasks} tasks completed by crew: ${crewNames}`
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
      const receivedCount = jobParts.filter(p => {
        const status = (p.status || '').toLowerCase();
        return status === 'received' || status === 'fulfilled' || status === 'inventoried';
      }).length;
      
      const waitingParts = jobParts.filter(p => {
        const status = (p.status || '').toLowerCase();
        return ['pending', 'requested', 'ordered'].includes(status);
      });

      if (requestedCount > 0 || orderedCount > 0) {
        sections.missingParts.push({
          jobId: job.id,
          message: `${job.jobNumber ? `#${job.jobNumber} - ` : ''}${job.title}`,
          subtext: `Waiting on ${requestedCount} pending parts (${orderedCount} ordered, ${receivedCount} received)`,
          partsList: waitingParts
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

  // Labor and session tracking memos
  const parsedSessionsToday = useMemo(() => {
    return sessionsList.filter((sess: any) => {
      if (!sess.clockIn?.timestamp) return false;
      const d = parseSafeDate(sess.clockIn.timestamp);
      return d && d >= startOfToday;
    });
  }, [sessionsList, startOfToday]);

  const staffCompletedTasks = useMemo(() => {
    const map: Record<string, any[]> = {};
    jobsList.forEach(job => {
      const tasks = tasksMap[job.id] || [];
      tasks.forEach(task => {
        const isComp = (task.status === 'QC Complete' && isToday(task.qcCompletedAt)) ||
                       (task.status === 'completed' && isToday(task.completedAt));
        if (isComp && task.assignedStaff) {
          task.assignedStaff.forEach((s: any) => {
            if (!s.id) return;
            if (!map[s.id]) map[s.id] = [];
            map[s.id].push({
              jobId: job.id,
              jobNumber: job.jobNumber,
              jobTitle: job.title,
              taskId: task.id,
              taskTitle: task.title,
              bookTime: parseFloat(task.bookTime) || 0
            });
          });
        }
      });
    });
    return map;
  }, [jobsList, tasksMap, startOfToday]);

  const jobsWithProgress = useMemo(() => {
    const list: any[] = [];
    const activeJobIds = new Set<string>();
    
    const addIds = (items: any[]) => items.forEach(item => { if (item.jobId) activeJobIds.add(item.jobId); });
    addIds(reportData.qcPassed);
    addIds(reportData.readyForQc);
    addIds(reportData.rework);
    addIds(reportData.blockersLogged);
    addIds(reportData.blockersResolved);
    addIds(reportData.bayMoves);
    addIds(reportData.readyForCustomerToday);
    addIds(reportData.completedToday);
    
    parsedSessionsToday.forEach((sess: any) => {
      if (sess.jobs) {
        sess.jobs.forEach((j: any) => {
          const startTime = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
          if (startTime >= startOfToday.getTime()) {
            activeJobIds.add(j.id);
          }
        });
      }
    });

    jobsList.forEach(job => {
      if (!activeJobIds.has(job.id)) return;
      
      const vehicle = job.vehicleId ? vehiclesList.find(v => v.vin === job.vehicleId) : null;
      const vehicleLabel = vehicle
        ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
        : (job.vehicleId ? `VIN: ${job.vehicleId.slice(-8)}` : 'No Vehicle Assigned');
        
      const jobTasks = tasksMap[job.id] || [];
      const completedToday = jobTasks.filter(t => 
        (t.status === 'QC Complete' && isToday(t.qcCompletedAt)) ||
        (t.status === 'completed' && isToday(t.completedAt))
      );
      
      const activeTasks = jobTasks.filter(t => t.status === 'In Progress' || t.status === 'Active');
      
      let totalLaborMs = 0;
      parsedSessionsToday.forEach((sess: any) => {
        if (sess.jobs) {
          sess.jobs.forEach((j: any) => {
            if (j.id === job.id) {
              const start = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
              const end = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : Date.now();
              const startClamped = Math.max(start, startOfToday.getTime());
              const duration = Math.max(0, end - startClamped);
              totalLaborMs += duration;
            }
          });
        }
      });
      
      const jobBlockers = (job.blockers || []).filter((b: any) => b.status === 'active');
      
      const nonGeneralTasks = jobTasks.filter(t => t.title !== 'General');
      const completedCount = nonGeneralTasks.filter(t => t.status === 'completed' || t.status === 'QC Complete').length;
      const progressPercent = nonGeneralTasks.length > 0 ? Math.round((completedCount / nonGeneralTasks.length) * 100) : 0;

      list.push({
        id: job.id,
        jobNumber: job.jobNumber || '',
        title: job.title,
        status: job.status,
        vehicleLabel,
        completedToday,
        activeTasks,
        laborHours: totalLaborMs / 3600000,
        blockers: jobBlockers,
        progressPercent,
        totalTasks: nonGeneralTasks.length,
        completedTasksCount: completedCount
      });
    });
    
    return list;
  }, [jobsList, reportData, parsedSessionsToday, vehiclesList, tasksMap, startOfToday]);

  const workedStaffByDept = useMemo(() => {
    const groups: Record<string, { deptName: string; staff: any[] }> = {};
    
    departmentsList.forEach(d => {
      groups[d.id] = {
        deptName: d.name,
        staff: []
      };
    });
    
    groups['unknown'] = {
      deptName: 'Other / Unassigned',
      staff: []
    };
    
    staffList.forEach((staff: any) => {
      if (staff.isArchived || staff.fireDate) return;
      
      const staffSessions = parsedSessionsToday.filter(sess => 
        sess.userId === staff.id || sess.userId === staff.userId
      );
      
      let totalClockedMs = 0;
      let isClockedIn = false;
      let activeJobName = '';
      let activeTaskName = '';
      
      staffSessions.forEach((sess: any) => {
        const start = sess.clockIn?.timestamp?.toDate ? sess.clockIn.timestamp.toDate().getTime() : new Date(sess.clockIn?.timestamp).getTime();
        const end = sess.clockOut?.timestamp?.toDate ? sess.clockOut.timestamp.toDate().getTime() : (sess.clockOut?.timestamp ? new Date(sess.clockOut?.timestamp).getTime() : null);
        
        const sessionStart = Math.max(start, startOfToday.getTime());
        const sessionEnd = end ? end : Date.now();
        
        totalClockedMs += Math.max(0, sessionEnd - sessionStart);
        
        if (!sess.clockOut?.timestamp) {
          isClockedIn = true;
          if (sess.jobs) {
            const activeJobSeg = sess.jobs.find((j: any) => !j.end);
            if (activeJobSeg) {
              activeJobName = activeJobSeg.name || 'Job';
              activeTaskName = activeJobSeg.taskName || '';
            }
          }
        }
      });
      
      const completedTasks = staffCompletedTasks[staff.id] || [];
      const clockedHours = totalClockedMs / 3600000;
      
      const hasActivity = clockedHours > 0 || completedTasks.length > 0 || isClockedIn;
      if (!hasActivity) return;
      
      const deptId = staff.departmentId || 'unknown';
      if (!groups[deptId]) {
        groups[deptId] = {
          deptName: 'Other / Unassigned',
          staff: []
        };
      }
      
      const totalBookHours = completedTasks.reduce((sum, t) => sum + (t.bookTime || 0), 0);
      const efficiency = clockedHours > 0 ? (totalBookHours / clockedHours) * 100 : 0;
      
      const workedJobNames = new Set<string>();
      staffSessions.forEach((sess: any) => {
        if (sess.jobs) {
          sess.jobs.forEach((j: any) => {
            workedJobNames.add(j.name || 'Job');
          });
        }
      });
      
      groups[deptId].staff.push({
        id: staff.id,
        name: `${staff.firstName} ${staff.lastName}`.trim(),
        title: staff.jobTitle || 'Technician',
        clockedHours,
        bookHoursCompleted: totalBookHours,
        efficiency,
        isClockedIn,
        activeJobName,
        activeTaskName,
        completedTasks,
        workedJobs: Array.from(workedJobNames)
      });
    });
    
    return Object.values(groups).filter(g => g.staff.length > 0);
  }, [staffList, departmentsList, parsedSessionsToday, staffCompletedTasks, startOfToday]);

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

    if (reportData.readyForCustomerToday.length > 0) {
      text += `✨ READY FOR CUSTOMER TODAY:\n`;
      reportData.readyForCustomerToday.forEach(item => text += `   - ${item.message} (${item.subtext})\n`);
      text += `\n`;
      totalChanges += reportData.readyForCustomerToday.length;
    }

    if (reportData.completedToday.length > 0) {
      text += `🤝 COMPLETED / PICKED UP TODAY:\n`;
      reportData.completedToday.forEach(item => text += `   - ${item.message} (${item.subtext})\n`);
      text += `\n`;
      totalChanges += reportData.completedToday.length;
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
      reportData.missingParts.forEach(item => {
        text += `   - Job ${item.message}: ${item.subtext}\n`;
        if (item.partsList && item.partsList.length > 0) {
          item.partsList.forEach((p: any) => {
            text += `     • [${p.status.toUpperCase()}] ${p.qty || 1}x ${p.partName || 'Unnamed Part'}${p.partNumber ? ` (#${p.partNumber})` : ''}\n`;
          });
        }
      });
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

    if (jobsWithProgress.length > 0) {
      text += `📈 JOB PRODUCTION & PROGRESS DETAILS:\n`;
      jobsWithProgress.forEach(job => {
        text += `   • Job: ${job.jobNumber ? `#${job.jobNumber} - ` : ''}${job.title} (${job.vehicleLabel})\n`;
        text += `     Status: ${job.status} | Progress: ${job.progressPercent}% (${job.completedTasksCount}/${job.totalTasks} tasks)\n`;
        if (job.completedToday.length > 0) {
          text += `     Completed Tasks:\n` + job.completedToday.map((t: any) => `       - ${t.title} (${t.assignedStaff?.map((s: any) => s.name).join(', ') || 'Unassigned'})`).join('\n') + `\n`;
        }
        if (job.activeTasks.length > 0) {
          text += `     Active Tasks: ${job.activeTasks.map((t: any) => t.title).join(', ')}\n`;
        }
        if (job.blockers.length > 0) {
          text += `     ⚠️ Stuck on: ${job.blockers.map((b: any) => b.message).join(', ')}\n`;
        }
        if (job.laborHours > 0) {
          text += `     Clocked Labor Today: ${job.laborHours.toFixed(2)} hours\n`;
        }
        text += `\n`;
      });
      text += `\n`;
      totalChanges += jobsWithProgress.length;
    }

    if (workedStaffByDept.length > 0) {
      text += `👥 LABOR & DEPARTMENT PERFORMANCE:\n`;
      workedStaffByDept.forEach(group => {
        text += `   📁 ${group.deptName} Department:\n`;
        group.staff.forEach((tech: any) => {
          const statusStr = tech.isClockedIn 
            ? `Clocked In (Working on: ${tech.activeJobName}${tech.activeTaskName ? ` - ${tech.activeTaskName}` : ''})`
            : 'Clocked Out';
          text += `     - ${tech.name} (${tech.title}):\n`;
          text += `       Status: ${statusStr}\n`;
          text += `       Hours Clocked: ${tech.clockedHours.toFixed(2)}h | Book Hours Earned: ${tech.bookHoursCompleted.toFixed(2)}h\n`;
          text += `       Efficiency: ${tech.clockedHours > 0 ? tech.efficiency.toFixed(0) + '%' : 'N/A'}\n`;
          if (tech.workedJobs.length > 0) {
            text += `       Jobs Touched: ${tech.workedJobs.join(', ')}\n`;
          }
        });
        text += `\n`;
      });
      text += `\n`;
      totalChanges += workedStaffByDept.length;
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
    <div className="flex-1 flex flex-col p-4 sm:p-6 bg-zinc-50 dark:bg-zinc-955 font-sans text-xs select-none gap-6 overflow-auto">
      
      {/* Screen view content */}
      <div className="flex-1 flex flex-col gap-6 screen-only">
        
        {/* Header Panel */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:py-5 sm:px-6 rounded-2xl shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500 shrink-0" />
              Today's Progress
            </h2>
            <p className="text-sm text-zinc-505 mt-1">Real-time what's happened today digest. Keep track of QC completions, active blockers, reworks, and bay moves.</p>
          </div>

          <div className="flex items-center gap-3 font-sans">
            <button 
              onClick={() => window.print()}
              className="flex px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2 border border-indigo-500/20"
            >
              <Printer className="w-3.5 h-3.5 text-white" />
              Print Report
            </button>
            <button 
              onClick={handleCopyReport}
              className="flex px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2"
            >
              <Share2 className="w-3.5 h-3.5 text-zinc-450" />
              Copy Report
            </button>
            <button 
              onClick={handleEmailReport}
              className="flex px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2"
            >
              <Mail className="w-3.5 h-3.5 text-zinc-450" />
              Email Digest
            </button>
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Connected
            </div>
          </div>
        </div>

        {/* Metrics Summary Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
          
          {/* QC Passed */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-24">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">QC Passed</span>
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
            <div className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
              {reportData.qcPassed.length}
            </div>
            <div className="text-[9px] text-zinc-450 font-semibold mt-0.5">Tasks passed today</div>
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
            <div className="text-[9px] text-zinc-450 font-semibold mt-0.5">Jobs ready for inspection</div>
            <div className="absolute right-0 bottom-0 w-24 h-24 bg-indigo-500/[0.02] rounded-full translate-x-8 translate-y-8" />
          </div>

          {/* Ready for Customer */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-24">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Ready Customer</span>
              <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
            </div>
            <div className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
              {reportData.readyForCustomerToday.length}
            </div>
            <div className="text-[9px] text-zinc-455 font-semibold mt-0.5">Jobs ready today</div>
            <div className="absolute right-0 bottom-0 w-24 h-24 bg-violet-500/[0.02] rounded-full translate-x-8 translate-y-8" />
          </div>

          {/* Completed Today */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-24">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Completed / Done</span>
              <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
            </div>
            <div className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
              {reportData.completedToday.length}
            </div>
            <div className="text-[9px] text-zinc-450 font-semibold mt-0.5">With customer today</div>
            <div className="absolute right-0 bottom-0 w-24 h-24 bg-teal-500/[0.02] rounded-full translate-x-8 translate-y-8" />
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
            <div className="text-[9px] text-zinc-450 font-semibold mt-0.5">Flags logged today</div>
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
            <div className="text-[9px] text-zinc-450 font-semibold mt-0.5">Jobs currently stuck</div>
            <div className="absolute right-0 bottom-0 w-24 h-24 bg-amber-500/[0.02] rounded-full translate-x-8 translate-y-8" />
          </div>

          {/* Missing Parts */}
          <div 
            onClick={() => navigate(`/business/${tenantId}/parts_worksheet`)}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-24 cursor-pointer hover:shadow-md hover:border-blue-500/50 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none group-hover:text-blue-500 transition-colors">Waiting Parts</span>
              <Package className="w-4 h-4 text-blue-500 shrink-0" />
            </div>
            <div className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
              {reportData.missingParts.length}
            </div>
            <div className="text-[9px] text-zinc-450 font-semibold mt-0.5">Jobs missing requests</div>
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
                      {item.partsList && item.partsList.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-blue-500/10 dark:border-blue-500/5 flex flex-col gap-1.5 text-xs">
                          {item.partsList.map((part: any) => (
                            <div 
                              key={part.id} 
                              className="flex justify-between items-center text-zinc-600 dark:text-zinc-300"
                            >
                              <span className="truncate flex-1 pr-2 text-xs">
                                <span className="font-mono text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1 py-0.5 rounded mr-1.5 font-bold">
                                  {part.qty || 1}x
                                </span>
                                <span className="font-bold">{part.partName || 'Unnamed Part'}</span>
                                {part.partNumber && (
                                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono ml-1.5">
                                    #{part.partNumber}
                                  </span>
                                )}
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider shrink-0 ${
                                (part.status || '').toLowerCase() === 'ordered'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              }`}>
                                {part.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
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
                      <div className="font-bold text-rose-650 dark:text-rose-450 flex items-center justify-between">
                        <span>{item.message}</span>
                        <ExternalLink className="w-3 h-3 text-zinc-400 shrink-0" />
                      </div>
                      <div className="text-[10px] text-zinc-500 font-semibold">{item.subtext}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Ready for Customer Today */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
                <h3 className="font-black text-xs uppercase tracking-wider text-zinc-805 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
                  Ready for Customer Today ({reportData.readyForCustomerToday.length})
                </h3>
              </div>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {reportData.readyForCustomerToday.length === 0 ? (
                  <div className="p-6 text-center text-zinc-400 dark:text-zinc-500 italic">No jobs marked ready for customer today yet.</div>
                ) : (
                  reportData.readyForCustomerToday.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/10 hover:border-violet-500/20 cursor-pointer transition active:scale-[0.99] flex flex-col gap-1"
                      onClick={() => navigate(`/business/${tenantId}/job/${item.jobId}`)}
                    >
                      <div className="font-bold text-zinc-900 dark:text-white flex items-center justify-between">
                        <span>{item.message}</span>
                        <ExternalLink className="w-3 h-3 text-zinc-400 shrink-0" />
                      </div>
                      <div className="text-[10px] text-violet-650 dark:text-violet-400 font-bold">{item.subtext}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Right Column: Today's Operations Log (All event types with Excel Column Filters) */}
          <div className="space-y-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
            
            {/* Header & Full Log Shortcut */}
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5 flex-wrap gap-2">
              <div>
                <h3 className="font-black text-xs uppercase tracking-wider text-zinc-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400 shrink-0" />
                  Today's Operations Log ({filteredOperationsLogFeed.length} / {todaysOperationsLogFeed.length})
                </h3>
                <span className="text-[10px] text-zinc-400 font-semibold">Real-time shop log activity feed</span>
              </div>

              <button
                onClick={() => navigate(`/business/${tenantId}/daily_log`)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 text-[11px] font-mono font-bold rounded-lg border border-amber-500/20 transition cursor-pointer"
                title="Open full Daily Operations Log"
              >
                <span>Full Daily Log</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            
            {/* Category Preset Pills & Excel-Style Column Dropdown Filters */}
            <div className="space-y-2 bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800/80">
              
              {/* Row 1: Category Preset Pills */}
              <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                <button
                  onClick={() => setLogCategoryFilter('all')}
                  className={cn(
                    "px-2 py-0.5 rounded font-extrabold uppercase transition cursor-pointer",
                    logCategoryFilter === 'all' ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  All ({todaysOperationsLogFeed.length})
                </button>
                <button
                  onClick={() => setLogCategoryFilter('tasks')}
                  className={cn(
                    "px-2 py-0.5 rounded font-extrabold uppercase transition cursor-pointer",
                    logCategoryFilter === 'tasks' ? "bg-teal-500/20 text-teal-300 border border-teal-500/30" : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  ⚡ Tasks & QC
                </button>
                <button
                  onClick={() => setLogCategoryFilter('shifts')}
                  className={cn(
                    "px-2 py-0.5 rounded font-extrabold uppercase transition cursor-pointer",
                    logCategoryFilter === 'shifts' ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  ⏱️ Shifts
                </button>
                <button
                  onClick={() => setLogCategoryFilter('parts')}
                  className={cn(
                    "px-2 py-0.5 rounded font-extrabold uppercase transition cursor-pointer",
                    logCategoryFilter === 'parts' ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  📦 Parts
                </button>
              </div>

              {/* Row 2: Excel-Style Column Dropdowns & Search */}
              <div className="flex items-center gap-2 flex-wrap text-[10px] pt-1">
                {/* Event Type / Badge Column Filter */}
                <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-0.5">
                  <Tag className="w-3 h-3 text-amber-400 shrink-0" />
                  <select
                    value={logBadgeFilter}
                    onChange={e => setLogBadgeFilter(e.target.value)}
                    className="bg-transparent text-zinc-800 dark:text-zinc-200 font-bold focus:outline-none cursor-pointer text-[10px]"
                    title="Excel Column Filter: Event Type / Badge"
                  >
                    <option value="all" className="bg-zinc-900 text-zinc-200">Type: All Event Badges</option>
                    {availableLogBadges.map(b => (
                      <option key={b} value={b} className="bg-zinc-900 text-zinc-200">{b}</option>
                    ))}
                  </select>
                </div>

                {/* Staff Member / Who Column Filter */}
                <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-0.5">
                  <User className="w-3 h-3 text-indigo-400 shrink-0" />
                  <select
                    value={logStaffFilter}
                    onChange={e => setLogStaffFilter(e.target.value)}
                    className="bg-transparent text-zinc-800 dark:text-zinc-200 font-bold focus:outline-none cursor-pointer text-[10px]"
                    title="Excel Column Filter: Staff Member (Who)"
                  >
                    <option value="all" className="bg-zinc-900 text-zinc-200">Who: All Staff</option>
                    {availableLogStaff.map(s => (
                      <option key={s} value={s} className="bg-zinc-900 text-zinc-200">{s}</option>
                    ))}
                  </select>
                </div>

                {/* Quick Search Input */}
                <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-0.5 flex-1 min-w-[120px]">
                  <Search className="w-3 h-3 text-zinc-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Filter log entries..."
                    value={logSearchQuery}
                    onChange={e => setLogSearchQuery(e.target.value)}
                    className="bg-transparent text-zinc-800 dark:text-zinc-200 font-bold focus:outline-none w-full placeholder:text-zinc-500 text-[10px]"
                  />
                  {logSearchQuery && (
                    <button onClick={() => setLogSearchQuery('')} className="text-zinc-400 hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Reset Filters button if any active */}
                {(logCategoryFilter !== 'all' || logStaffFilter !== 'all' || logBadgeFilter !== 'all' || logSearchQuery) && (
                  <button
                    onClick={() => {
                      setLogCategoryFilter('all');
                      setLogStaffFilter('all');
                      setLogBadgeFilter('all');
                      setLogSearchQuery('');
                    }}
                    className="text-amber-400 hover:text-amber-300 font-bold text-[9px] uppercase cursor-pointer underline"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

            </div>

            {/* Feed List */}
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {filteredOperationsLogFeed.length === 0 ? (
                <div className="p-10 text-center text-zinc-400 dark:text-zinc-500 italic text-xs">
                  {todaysOperationsLogFeed.length === 0 ? "No shop operations logged yet today." : "No log entries match the selected column filters."}
                </div>
              ) : (
                filteredOperationsLogFeed.map((item, idx) => (
                  <div 
                    key={item.id || idx} 
                    className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 transition flex flex-col gap-1 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded font-mono font-black uppercase text-[8px] border",
                          item.badgeClass || "bg-zinc-800 text-zinc-300 border-zinc-700"
                        )}>
                          {item.badgeLabel}
                        </span>
                        <span className="font-mono text-zinc-500 font-semibold">{item.timeStr}</span>
                      </div>

                      {item.who && (
                        <span className="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                          <User className="w-3 h-3 text-zinc-400" />
                          {item.who}
                        </span>
                      )}
                    </div>

                    <div className="font-bold text-zinc-900 dark:text-white mt-0.5">
                      {item.details}
                    </div>

                    {item.jobNumber && item.jobNumber !== 'N/A' && item.jobNumber !== '--' && (
                      <div 
                        onClick={() => item.jobId && navigate(`/business/${tenantId}/job/${item.jobId}`)}
                        className="text-[10px] text-amber-500 hover:text-amber-400 font-mono font-bold flex items-center gap-1 cursor-pointer w-fit"
                      >
                        <span>JOB #{item.jobNumber} {item.jobTitle ? `• ${item.jobTitle}` : ''}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </div>
                    )}

                    {item.note && (
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 italic bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded border border-zinc-200/50 dark:border-zinc-800/50 mt-1">
                        "{item.note}"
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

          </div>

        </div>

      </div>

      {/* ========================================================
          PRINT REPORT LAYOUT
      ======================================================== */}
      <div className="print-report-container hidden w-full max-w-4xl mx-auto p-8 font-sans bg-white text-black">
        
        {/* PAGE 1: EXECUTIVE BRIEFING */}
        <div className="print-page bg-white text-black flex flex-col justify-between">
          <div>
            {/* Header */}
            <div className="border-b-4 border-black pb-4 mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-extrabold uppercase tracking-tight text-black">DAILY OPERATIONS CENTER REPORT</h1>
                <p className="text-[10px] text-zinc-650 font-bold uppercase tracking-wider mt-1">Upfitters OS • Executive Production Briefing</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-none">Report Date</p>
                <p className="text-base font-black text-black mt-1">
                  {new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>

            {/* KPI Summary Block */}
            <div className="mb-6">
              <table className="w-full text-center-print">
                <thead>
                  <tr>
                    <th className="font-bold text-[8px] uppercase tracking-wider p-2" style={{ width: '12.5%' }}>QC Passed</th>
                    <th className="font-bold text-[8px] uppercase tracking-wider p-2" style={{ width: '12.5%' }}>Ready for QC</th>
                    <th className="font-bold text-[8px] uppercase tracking-wider p-2" style={{ width: '12.5%' }}>Ready Cust.</th>
                    <th className="font-bold text-[8px] uppercase tracking-wider p-2" style={{ width: '12.5%' }}>Completed</th>
                    <th className="font-bold text-[8px] uppercase tracking-wider p-2" style={{ width: '12.5%' }}>QC Reworks</th>
                    <th className="font-bold text-[8px] uppercase tracking-wider p-2" style={{ width: '12.5%' }}>Active Blockers</th>
                    <th className="font-bold text-[8px] uppercase tracking-wider p-2" style={{ width: '12.5%' }}>Waiting Parts</th>
                    <th className="font-bold text-[8px] uppercase tracking-wider p-2" style={{ width: '12.5%' }}>Worked Jobs</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-extrabold text-[10pt] p-2">{reportData.qcPassed.length}</td>
                    <td className="font-extrabold text-[10pt] p-2">{reportData.readyForQc.length}</td>
                    <td className="font-extrabold text-[10pt] p-2">{reportData.readyForCustomerToday.length}</td>
                    <td className="font-extrabold text-[10pt] p-2">{reportData.completedToday.length}</td>
                    <td className="font-extrabold text-[10pt] p-2 text-rose-700">{reportData.rework.length}</td>
                    <td className="font-extrabold text-[10pt] p-2 text-red-700">{reportData.currentBlockers.length}</td>
                    <td className="font-extrabold text-[10pt] p-2">{reportData.missingParts.length}</td>
                    <td className="font-extrabold text-[10pt] p-2">{jobsWithProgress.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Stuck Blockers */}
            <div className="mb-6">
              <h2 className="text-[10px] font-black uppercase text-red-700 tracking-wider mb-2 border-b border-zinc-300 pb-1">
                ⚠️ CURRENT ACTIVE BLOCKERS & ON-HOLD PRODUCTION ({reportData.currentBlockers.length})
              </h2>
              {reportData.currentBlockers.length === 0 ? (
                <p className="text-[9px] italic text-zinc-500">No active blockers currently on the shop floor.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr>
                      <th style={{ width: '35%' }} className="p-2 font-bold text-[8px] uppercase tracking-wider">Blocked Job / Vehicle</th>
                      <th style={{ width: '65%' }} className="p-2 font-bold text-[8px] uppercase tracking-wider">Reason / Blocker Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.currentBlockers.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-bold text-[8.5pt]">{item.message}</td>
                        <td className="p-2 text-[8.5pt]">{item.subtext}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Timeline Log */}
            <div>
              <h2 className="text-[10px] font-black uppercase text-black tracking-wider mb-2 border-b border-zinc-300 pb-1">
                ⚡ LIVE SHOP TIMELINE LOG (TODAY'S OPERATIONS)
              </h2>
              <div className="space-y-1 text-[9px] max-h-[380px] overflow-hidden">
                {reportData.blockersLogged.map((item, idx) => (
                  <div key={`pl-bl-${idx}`} className="flex gap-2 py-0.5 border-b border-zinc-100">
                    <span className="text-red-600 font-extrabold shrink-0">[BLOCKER LOGGED]</span>
                    <span>{item.message} - {item.subtext}</span>
                  </div>
                ))}
                {reportData.blockersResolved.map((item, idx) => (
                  <div key={`pl-br-${idx}`} className="flex gap-2 py-0.5 border-b border-zinc-100">
                    <span className="text-emerald-600 font-extrabold shrink-0">[BLOCKER CLEARED]</span>
                    <span>{item.message} - {item.subtext}</span>
                  </div>
                ))}
                {reportData.rework.map((item, idx) => (
                  <div key={`pl-rw-${idx}`} className="flex gap-2 py-0.5 border-b border-zinc-100">
                    <span className="text-rose-600 font-extrabold shrink-0">[QC REWORK FLAGGED]</span>
                    <span>{item.message} - {item.subtext}</span>
                  </div>
                ))}
                {reportData.qcPassed.map((item, idx) => (
                  <div key={`pl-qp-${idx}`} className="flex gap-2 py-0.5 border-b border-zinc-100">
                    <span className="text-emerald-600 font-extrabold shrink-0">[QC PASSED]</span>
                    <span>{item.message} - {item.subtext}</span>
                  </div>
                ))}
                {reportData.bayMoves.map((item, idx) => (
                  <div key={`pl-bm-${idx}`} className="flex gap-2 py-0.5 border-b border-zinc-100">
                    <span className="text-indigo-600 font-extrabold shrink-0">[BAY MOVE]</span>
                    <span>{item.message} - {item.subtext}</span>
                  </div>
                ))}
                {reportData.readyForCustomerToday.map((item, idx) => (
                  <div key={`pl-rc-${idx}`} className="flex gap-2 py-0.5 border-b border-zinc-100">
                    <span className="text-violet-650 font-extrabold shrink-0">[READY CUSTOMER]</span>
                    <span>{item.message} - {item.subtext}</span>
                  </div>
                ))}
                {reportData.completedToday.map((item, idx) => (
                  <div key={`pl-ct-${idx}`} className="flex gap-2 py-0.5 border-b border-zinc-100">
                    <span className="text-teal-600 font-extrabold shrink-0">[JOB COMPLETED]</span>
                    <span>{item.message} - {item.subtext}</span>
                  </div>
                ))}
                {reportData.blockersLogged.length + reportData.blockersResolved.length + reportData.rework.length + reportData.qcPassed.length + reportData.bayMoves.length + reportData.readyForCustomerToday.length + reportData.completedToday.length === 0 && (
                  <p className="italic text-zinc-500 py-4 text-center">No shop timeline activity logged today yet.</p>
                )}
              </div>
            </div>

          </div>
          
          <div className="border-t border-zinc-400 pt-2 text-center text-[8px] text-zinc-500">
            <p>Upfitters OS Daily Operations Report • Page 1 of 3 (Executive Summary)</p>
            <p className="mt-0.5">Generated automatically on {new Date().toLocaleString()}</p>
          </div>
        </div>

        {/* PAGE 2: JOB PRODUCTION & PROGRESS REPORT */}
        <div className="print-page bg-white text-black flex flex-col justify-between print-page-break">
          <div>
            <div className="border-b-4 border-black pb-4 mb-4">
              <h2 className="text-xl font-extrabold uppercase text-black">JOB PRODUCTION & PROGRESS REPORT</h2>
              <p className="text-[10px] text-zinc-650 font-bold uppercase tracking-wider mt-1">Detailed list of active jobs with progress today</p>
            </div>
            
            {jobsWithProgress.length === 0 ? (
              <p className="italic text-zinc-500 text-xs py-8 text-center border border-dashed border-zinc-300 rounded">
                No job activity or progress recorded today.
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Job / Vehicle Details</th>
                    <th style={{ width: '15%' }}>Job Status</th>
                    <th style={{ width: '40%' }}>Today's Activity / Completed Tasks</th>
                    <th style={{ width: '10%' }} className="text-right">Clocked Labor</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsWithProgress.map((job, idx) => {
                    const completedTasksStr = job.completedToday.length > 0 
                      ? job.completedToday.map((t: any) => `✓ ${t.title} (${t.assignedStaff?.map((s: any) => s.name).join(', ') || 'Unassigned'})`).join('\n') 
                      : '';
                      
                    const activeTasksStr = job.activeTasks.length > 0
                      ? `Active tasks: ${job.activeTasks.map((t: any) => t.title).join(', ')}`
                      : '';
                      
                    const blockersStr = job.blockers.length > 0
                      ? `🛑 Stuck: ${job.blockers.map((b: any) => b.message).join(', ')}`
                      : '';
                      
                    return (
                      <tr key={idx}>
                        <td>
                          <div className="font-bold text-black leading-snug">
                            {job.jobNumber ? `#${job.jobNumber} - ` : ''}{job.title}
                          </div>
                          <div className="text-[8px] text-zinc-500 mt-0.5 font-medium">{job.vehicleLabel}</div>
                        </td>
                        <td>
                          <div className="font-extrabold text-[8.5pt]">{job.status}</div>
                          <div className="text-[7.5px] text-zinc-500 mt-0.5 font-bold">
                            {job.progressPercent}% ({job.completedTasksCount}/{job.totalTasks} tasks)
                          </div>
                        </td>
                        <td className="whitespace-pre-line leading-tight text-[8pt]">
                          {completedTasksStr && <div className="text-emerald-700 font-bold mb-1">{completedTasksStr}</div>}
                          {activeTasksStr && <div className="text-zinc-650 italic mb-1">{activeTasksStr}</div>}
                          {blockersStr && <div className="text-red-700 font-extrabold mb-1">{blockersStr}</div>}
                          {!completedTasksStr && !activeTasksStr && !blockersStr && (
                            <div className="text-zinc-500 italic">Job updated / Bay move detected</div>
                          )}
                        </td>
                        <td className="text-right font-mono font-bold text-black">
                          {job.laborHours > 0 ? `${job.laborHours.toFixed(2)}h` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t border-zinc-400 pt-2 text-center text-[8px] text-zinc-500">
            <p>Upfitters OS Daily Operations Report • Page 2 of 3 (Job Progress Detail)</p>
            <p className="mt-0.5">Generated automatically on {new Date().toLocaleString()}</p>
          </div>
        </div>

        {/* PAGE 3: DEPARTMENT LABOR & PERFORMANCE REPORT */}
        <div className="print-page bg-white text-black flex flex-col justify-between print-page-break">
          <div>
            <div className="border-b-4 border-black pb-4 mb-4">
              <h2 className="text-xl font-extrabold uppercase text-black">LABOR & DEPARTMENT PERFORMANCE</h2>
              <p className="text-[10px] text-zinc-655 font-bold uppercase tracking-wider mt-1">Technician worked hours, book hours earned, and daily efficiency by department</p>
            </div>

            {workedStaffByDept.length === 0 ? (
              <p className="italic text-zinc-500 text-xs py-8 text-center border border-dashed border-zinc-300 rounded">
                No technician clocked hours or task labor activity recorded today.
              </p>
            ) : (
              workedStaffByDept.map((group, deptIdx) => (
                <div key={deptIdx} className="mb-6 print-section">
                  <h3 className="text-[10px] font-black uppercase text-black tracking-wide border-b border-zinc-400 pb-1 mb-2">
                    📁 {group.deptName} Department ({group.staff.length} Active Technicians)
                  </h3>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th style={{ width: '25%' }}>Technician</th>
                        <th style={{ width: '22%' }}>Real-time Status Today</th>
                        <th style={{ width: '13%' }} className="text-right">Clocked Labor</th>
                        <th style={{ width: '13%' }} className="text-right">Book Earned</th>
                        <th style={{ width: '12%' }} className="text-right">Efficiency</th>
                        <th style={{ width: '15%' }}>Jobs Touched Today</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.staff.map((tech, techIdx) => (
                        <tr key={techIdx}>
                          <td>
                            <div className="font-bold text-black">{tech.name}</div>
                            <div className="text-[7.5px] text-zinc-500 font-bold uppercase">{tech.title}</div>
                          </td>
                          <td className="text-[8px] leading-tight">
                            {tech.isClockedIn ? (
                              <div>
                                <span className="inline-block w-1.5 h-1.5 bg-emerald-600 rounded-full mr-1 animate-pulse" />
                                <span className="text-emerald-700 font-bold uppercase tracking-wider text-[7.5px]">CLOCKED IN</span>
                                {tech.activeJobName && (
                                  <div className="text-zinc-650 font-medium truncate max-w-[150px] mt-0.5">
                                    {tech.activeJobName} {tech.activeTaskName ? `(${tech.activeTaskName})` : ''}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-zinc-450 font-bold uppercase tracking-wider text-[7.5px]">CLOCKED OUT</span>
                            )}
                          </td>
                          <td className="text-right font-mono font-medium">{tech.clockedHours.toFixed(2)}h</td>
                          <td className="text-right font-mono font-bold text-emerald-700">{tech.bookHoursCompleted.toFixed(2)}h</td>
                          <td className="text-right font-mono">
                            {tech.clockedHours > 0 ? (
                              <span className={`font-bold ${tech.efficiency >= 100 ? 'text-emerald-700' : 'text-zinc-800'}`}>
                                {tech.efficiency.toFixed(0)}%
                              </span>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="text-[7.5px] leading-tight text-zinc-650">
                            {tech.workedJobs.length > 0 ? (
                              tech.workedJobs.map((j: string, i: number) => (
                                <div key={i} className="truncate max-w-[120px]">• {j}</div>
                              ))
                            ) : (
                              <span className="text-zinc-400 italic">No job clocks</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-zinc-400 pt-2 text-center text-[8px] text-zinc-500">
            <p>Upfitters OS Daily Operations Report • Page 3 of 3 (Labor & Performance Detail)</p>
            <p className="mt-0.5">Generated automatically on {new Date().toLocaleString()}</p>
          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide screen-only stuff */
          .screen-only,
          #root > div > div:first-child,
          #root > div > div > header,
          header,
          aside,
          nav,
          button,
          .no-print,
          .impersonation-banner,
          .toaster {
            display: none !important;
          }

          /* Force show print container */
          .print-report-container {
            display: block !important;
            background: white !important;
            color: black !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            overflow: visible !important;
          }

          /* Reset viewport height and overflow */
          body, html, #root, #root > div, main, .flex-1, .overflow-auto {
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            max-height: none !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }

          /* Define print page */
          .print-page {
            page-break-after: always !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            background: white !important;
            color: black !important;
            width: 100% !important;
            min-height: 9.5in !important;
            box-sizing: border-box !important;
            padding: 0.5in !important;
          }

          .print-page-break {
            page-break-before: always !important;
            break-before: page !important;
          }

          .print-page:last-of-type {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          /* Black and white colors */
          body, p, span, div, td, th, table, tr, h1, h2, h3, h4, h5, h6 {
            color: #000000 !important;
          }

          /* Table borders collapse */
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin-top: 10px !important;
            margin-bottom: 20px !important;
          }
          th, td {
            border: 1px solid #71717a !important;
            padding: 6px 10px !important;
            text-align: left !important;
            font-size: 8pt !important;
            line-height: 1.2 !important;
          }
          th {
            background-color: #f4f4f5 !important;
            font-weight: bold !important;
          }

          .text-center-print th, .text-center-print td {
            text-align: center !important;
          }

          .print-section {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      ` }} />

    </div>
  );
}
