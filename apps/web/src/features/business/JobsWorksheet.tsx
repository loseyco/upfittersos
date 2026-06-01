import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import {
  collection, query, where, orderBy, limit, doc, updateDoc, serverTimestamp, onSnapshot
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import {
  Search, FileSpreadsheet, ExternalLink, ChevronDown,
  AlertTriangle, Package, Plus, Maximize, Minimize,
  Mail, Share2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';
import { cn } from '../../lib/utils';
import { useWakeLock } from '../../hooks/useWakeLock';

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  userId?: string;
  techNumber?: string;
  isArchived?: boolean;
  fireDate?: any;
  departmentId?: string;
}

interface TimeSession {
  id: string;
  userId: string;
  userName?: string;
  clockIn: { timestamp: any; location?: string; onSite?: boolean; };
  clockOut?: { timestamp: any; location?: string; onSite?: boolean; };
  breaks: Array<{ type: 'lunch' | 'normal'; start: any; end?: any; isPaid: boolean; }>;
  jobs?: Array<{ id: string; name: string; start: any; end?: any; taskId?: string; taskName?: string; }>;
  status: string;
}

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

const projectWorkingHours = (startDate: Date, totalHours: number, schedule: any) => {
  if (totalHours <= 0) return startDate;
  
  const days = schedule?.days || [1, 2, 3, 4, 5];
  const startStr = schedule?.startTime || "08:00";
  const endStr = schedule?.endTime || "17:00";
  
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  
  const dailyWorkMs = ((endH * 60 + endM) - (startH * 60 + startM)) * 60000;
  if (dailyWorkMs <= 0 || days.length === 0) return startDate;
  
  let current = new Date(startDate);
  let remainingMs = totalHours * 3600000;
  
  while (remainingMs > 0) {
    const dayOfWeek = current.getDay();
    const mappedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    
    if (!days.includes(mappedDay)) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }
    
    const startOfShift = new Date(current);
    startOfShift.setHours(startH, startM, 0, 0);
    
    const endOfShift = new Date(current);
    endOfShift.setHours(endH, endM, 0, 0);
    
    if (current >= endOfShift) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }
    
    if (current < startOfShift) {
      current = new Date(startOfShift);
    }
    
    const msLeftInShift = endOfShift.getTime() - current.getTime();
    
    if (remainingMs <= msLeftInShift) {
      current = new Date(current.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= msLeftInShift;
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
    }
  }
  
  return current;
};

const calculateDynamicETA = (job: any, tasks: any[], departments: any[]) => {
  if (!tasks || tasks.length === 0) return null;
  const nonGeneralTasks = tasks.filter(t => t && t.title !== 'General');
  const incompleteTasks = nonGeneralTasks.filter(t => t && t.status !== 'QC Complete' && t.status !== 'QC');
  
  if (incompleteTasks.length === 0 && (job?.status === 'Ready for Customer' || job?.status === 'Completed')) {
     return null;
  }
  if (incompleteTasks.length === 0) {
     return parseSafeDate(job?.expectedFinishTime);
  }
  
  const deptHours: Record<string, number> = {};
  incompleteTasks.forEach(t => {
    const d = t.departmentId || 'unassigned';
    deptHours[d] = (deptHours[d] || 0) + (parseFloat(t.bookTime) || 0);
  });
  
  const totalHours = Object.values(deptHours).reduce((sum, h) => sum + h, 0);
  if (totalHours <= 0) return null;
  
  const nowTime = new Date();
  let maxETA = nowTime;
  
  Object.entries(deptHours).forEach(([deptId, hours]) => {
    const dept = departments.find(d => d.id === deptId);
    const schedule = dept?.defaultSchedule;
    const eta = projectWorkingHours(nowTime, hours, schedule);
    if (eta > maxETA) {
      maxETA = eta;
    }
  });
  
  return maxETA;
};

export function JobsWorksheet({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const { user, permissions, isSuperAdmin } = useAuthStore();
  const canManage = isSuperAdmin || permissions['jobs.manage'] || permissions['timeclock.manage'];

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  useWakeLock(isFullscreen);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    const nextFullscreen = !isFullscreen;
    setIsFullscreen(nextFullscreen);

    if (nextFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(err => {
          console.warn("Standard fullscreen blocked:", err.message);
        });
      } else if ((containerRef.current as any).webkitRequestFullscreen) {
        (containerRef.current as any).webkitRequestFullscreen();
      }
      toast.success("Optimized Mode Active", {
        description: "Keep Screen Awake is now active for this worksheet.",
        duration: 5000,
      });
    } else {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Blocker modal/inline state
  const [activeBlockerJobId, setActiveBlockerJobId] = useState<string | null>(null);
  const [newBlockerMsg, setNewBlockerMsg] = useState('');

  // Report Modal state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [generatedReportText, setGeneratedReportText] = useState('');

  // Live Subscription Data
  const [jobsList, setJobsList] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [vehiclesList, setVehiclesList] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<PartsRequest[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [tasksMap, setTasksMap] = useState<Record<string, any[]>>({});

  // Column Resizing State (Excel style)
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    jobInfo: 220,
    priority: 80,
    dueDate: 130,
    dynamicETA: 130,
    location: 130,
    status: 120,
    crew: 180,
    tasks: 150,
    parts: 140,
    blockers: 150
  });

  const startColResizing = (e: React.PointerEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[colKey];

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setColWidths(prev => ({
        ...prev,
        [colKey]: Math.max(60, startWidth + deltaX)
      }));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const renderResizeHandle = (colKey: string) => (
    <div
      onPointerDown={(e) => startColResizing(e, colKey)}
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors z-30 select-none"
      style={{ touchAction: 'none' }}
    />
  );



  // Subscriptions Setup
  useEffect(() => {
    if (!tenantId) return;

    // 1. Listen to active/actionable jobs (ignore Completed/Closed to prevent heavy historical loading)
    const qJobs = query(
      collection(db, `businesses/${tenantId}/jobs`),
      where('status', 'not-in', ['Completed', 'Closed'])
    );
    const unsubJobs = onSnapshot(qJobs, (snap) => {
      setJobsList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    // 2. Listen to staff
    const unsubStaff = onSnapshot(query(collection(db, `businesses/${tenantId}/staff`)), (snap) => {
      const activeStaff = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as StaffMember))
        .filter(s => !s.isArchived && !s.fireDate);
      setStaffList(activeStaff);
    });

    // 3. Listen to zones
    const unsubZones = onSnapshot(query(collection(db, `businesses/${tenantId}/zones`)), (snap) => {
      setZonesList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    // 4. Listen to vehicles
    const unsubVehicles = onSnapshot(query(collection(db, `businesses/${tenantId}/vehicles`), limit(1000)), (snap) => {
      setVehiclesList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    // 5. Listen to parts requests
    const unsubParts = onSnapshot(query(collection(db, `businesses/${tenantId}/parts_requests`)), (snap) => {
      setPartsRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    // 5b. Listen to departments
    const unsubDepts = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 7. Listen to time sessions for today
    const qSessions = query(collection(db, `businesses/${tenantId}/time_sessions`), orderBy('clockIn.timestamp', 'desc'), limit(200));
    const unsubSessions = onSnapshot(qSessions, (snap) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allSessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeSession));
      const todaySessions = allSessions.filter(s => {
        if (!s.clockIn?.timestamp) return false;
        const date = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
        return date >= today || s.status !== 'completed';
      });
      setSessions(todaySessions);
    });

    return () => {
      unsubJobs();
      unsubStaff();
      unsubZones();
      unsubVehicles();
      unsubParts();
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

  // Helper date calculators
  const formatFinishDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toISOString().split('T')[0];
  };

  const getDaysRemaining = (timestamp: any) => {
    if (!timestamp) return null;
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffTime = date.getTime() - Date.now();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Filtered and resolved Jobs matching search and status configuration
  const filteredJobs = useMemo(() => {
    return jobsList.filter(job => {
      // 1. Search Query Filter
      const vehicle = vehiclesList.find(v => v.vin === job.vehicleId);
      const vehicleLabel = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}` : '';
      const matchesSearch =
        (job.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.jobNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.vehicleId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        vehicleLabel.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      // 2. Actionable Filter logic (On Site, Tasks Needing Done, QC Pending, or Ready for Customer)
      const resolvedLocationId = zonesList.find(z => z.currentJobId === job.id)?.id || job.bayId;
      const hasBay = !!resolvedLocationId && resolvedLocationId !== 'none';
      const jobTasks = tasksMap[job.id] || [];
      const nonGeneralTasks = jobTasks.filter(t => t.title !== 'General');
      const totalTasks = nonGeneralTasks.length;
      const completedTasks = nonGeneralTasks.filter(t => t.status === 'QC' || t.status === 'QC Complete' || t.status === 'completed').length;
      const hasTasksNeedingDone = totalTasks > completedTasks;
      const hasQCNeedingDone = nonGeneralTasks.some(t => t.status === 'QC' || t.status === 'in_review');
      const isReadyForCustomer = job.status === 'Ready for Customer';

      const isActionable = hasBay || hasTasksNeedingDone || hasQCNeedingDone || isReadyForCustomer;
      if (!isActionable) return false;

      // 3. Status Toolbar Dropdown Filter
      const activeBlockers = (job.blockers || []).filter((b: any) => b.status === 'active');
      const isBlocked = activeBlockers.length > 0 || job.status === 'Blocked';

      let resolvedStatus = job.status || 'Open';
      if (isBlocked) resolvedStatus = 'Blocked';

      const matchesStatus = selectedStatusFilter === 'all' ||
        (selectedStatusFilter === 'Active' && (resolvedStatus === 'Active' || resolvedStatus === 'Open')) ||
        (selectedStatusFilter === 'Blocked' && resolvedStatus === 'Blocked') ||
        (selectedStatusFilter === 'Completed' && (resolvedStatus === 'Completed' || resolvedStatus === 'Closed')) ||
        (selectedStatusFilter === job.status);

      return matchesStatus;
    }).sort((a, b) => {
      // 1. Sort by Priority (descending: 5 - Urgent down to 0 - Not Ready)
      const getPriorityVal = (j: any) => {
        const p = j.priority;
        if (!p) return 3; // Default to 3 (Medium)
        const parsed = parseInt(p.split(' ')[0]);
        return isNaN(parsed) ? 3 : parsed;
      };

      const pA = getPriorityVal(a);
      const pB = getPriorityVal(b);
      if (pA !== pB) return pB - pA; // Highest priority first

      // 2. Sort by Blockers & Status
      const statusWeight = (j: any) => {
        const activeBlockers = (j.blockers || []).filter((b: any) => b.status === 'active');
        if (activeBlockers.length > 0 || j.status === 'Blocked') return 0;
        if (j.status === 'Active') return 1;
        if (j.status === 'Open') return 2;
        return 3;
      };
      const wa = statusWeight(a);
      const wb = statusWeight(b);
      if (wa !== wb) return wa - wb;

      // 3. Sort by last updated
      return (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0);
    });
  }, [jobsList, vehiclesList, searchTerm, selectedStatusFilter, tasksMap]);

  // Edits Handlers
  const handleDueDateChange = async (jobId: string, newDateStr: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      await updateDoc(jobRef, {
        expectedFinishTime: newDateStr ? new Date(newDateStr).toISOString() : null,
        updatedAt: serverTimestamp()
      });
      toast.success('Job due date updated');
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleLocationChange = async (jobId: string, newBayId: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      const jobDoc = jobsList.find(j => j.id === jobId);

      // 1. Clear old linked zone for this job
      const oldZone = zonesList.find(z => z.currentJobId === jobId);
      if (oldZone) {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, oldZone.id), {
          currentJobId: null,
          currentVehicleVin: null,
          updatedAt: serverTimestamp()
        });
      }

      // 2. Set new bayId on the job
      await updateDoc(jobRef, {
        bayId: newBayId === 'none' ? null : newBayId,
        updatedAt: serverTimestamp()
      });

      // 3. Assign new linked zone
      if (newBayId && newBayId !== 'none') {
        const targetZone = zonesList.find(z => z.id === newBayId || z.name === newBayId);
        if (targetZone) {
          await updateDoc(doc(db, `businesses/${tenantId}/zones`, targetZone.id), {
            currentJobId: jobId,
            currentVehicleVin: jobDoc?.vehicleId || null,
            lastAssignedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }
      toast.success('Location updated successfully');
    } catch (err: any) {
      toast.error(`Failed to assign location: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  const handlePriorityChange = async (jobId: string, newPriority: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      await updateDoc(jobRef, {
        priority: newPriority,
        updatedAt: serverTimestamp()
      });
      toast.success(`Priority updated to ${newPriority}`);
    } catch (err: any) {
      toast.error(`Failed to update priority: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleStatusChange = async (jobId: string, newStatus: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      await updateDoc(jobRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      toast.success(`Job status changed to ${newStatus}`);
    } catch (err: any) {
      toast.error(`Failed to update status: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  // Blocker Management
  const handleAddBlocker = async () => {
    if (!activeBlockerJobId || !newBlockerMsg.trim()) return;
    setIsUpdating(activeBlockerJobId);
    try {
      const job = jobsList.find(j => j.id === activeBlockerJobId);
      const newBlockerObj = {
        id: Math.random().toString(36).substr(2, 9),
        message: newBlockerMsg.trim(),
        status: 'active',
        createdAt: new Date().toISOString()
      };
      const updatedBlockers = [...(job?.blockers || []), newBlockerObj];
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, activeBlockerJobId), {
        blockers: updatedBlockers,
        status: 'Blocked',
        updatedAt: serverTimestamp()
      });
      toast.success('Active blocker logged');
      setActiveBlockerJobId(null);
      setNewBlockerMsg('');
    } catch (err: any) {
      toast.error('Failed to log blocker');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleClearBlockers = async (jobId: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      const job = jobsList.find(j => j.id === jobId);
      const updatedBlockers = (job?.blockers || []).map((b: any) => ({ ...b, status: 'cleared', clearedAt: new Date().toISOString() }));
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        blockers: updatedBlockers,
        status: 'Active',
        updatedAt: serverTimestamp()
      });
      toast.success('All active blockers resolved');
    } catch (err: any) {
      toast.error('Failed to clear blockers');
    } finally {
      setIsUpdating(null);
    }
  };

  const generateProgressReport = () => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const isToday = (dateVal: any) => {
      if (!dateVal) return false;
      const d = parseSafeDate(dateVal);
      return d && d >= startOfToday;
    };

    let reportSections = {
      qcPassed: [] as string[],
      readyForQc: [] as string[],
      rework: [] as string[],
      blockersLogged: [] as string[],
      blockersResolved: [] as string[],
      bayMoves: [] as string[],
      generalUpdates: [] as string[],
      currentBlockers: [] as string[],
      missingParts: [] as string[]
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

      // Only add to readyForQc list if ALL tasks of the job are marked as ready for QC (and there's activity today)
      if (allTasksQcReady && hasQcActivityToday) {
        const crewNames = Array.from(new Set(nonGeneralTasks.flatMap(t => t.assignedStaff?.map((s: any) => s.name) || []))).join(', ') || 'Unassigned';
        reportSections.readyForQc.push(`🏁 Job ${jobDesc} is fully READY FOR QC (All ${totalTasks} tasks completed! Crew: ${crewNames})`);
      }

      // Check for individual tasks passed QC or rework today
      nonGeneralTasks.forEach(task => {
        const techNames = task.assignedStaff?.map((s: any) => s.name).join(', ') || 'Unassigned';
        if (task.status === 'QC Complete' && (isToday(task.qcCompletedAt) || isToday(task.updatedAt))) {
          reportSections.qcPassed.push(`✅ Task Passed QC: "${task.title}" on Job ${jobDesc} (Techs: ${techNames})`);
        } else if (task.status === 'Rework' && (isToday(task.qcFailedAt) || isToday(task.updatedAt))) {
          reportSections.rework.push(`⚠️ Flagged for Rework (Failed QC): "${task.title}" on Job ${jobDesc} (Techs: ${techNames})`);
        }
      });

      // 2. Blockers logged / resolved today
      const blockers = job.blockers || [];
      blockers.forEach((b: any) => {
        if (b.status === 'active' && isToday(b.createdAt)) {
          reportSections.blockersLogged.push(`🛑 Blocker Logged on Job ${jobDesc}: "${b.message}"`);
        } else if (b.status === 'cleared' && isToday(b.clearedAt)) {
          reportSections.blockersResolved.push(`🟢 Blocker Resolved on Job ${jobDesc}: "${b.message}"`);
        }
      });

      // Current active blockers (regardless of logged day)
      const activeBlockers = blockers.filter((b: any) => b.status === 'active');
      if (activeBlockers.length > 0 || job.status === 'Blocked') {
        const blockerMsgs = activeBlockers.map((b: any) => `"${b.message}"`).join(', ') || 'Status marked as Blocked';
        reportSections.currentBlockers.push(`🛑 Job ${jobDesc}: ${blockerMsgs}`);
      }

      // Current missing parts (regardless of requested day)
      const jobParts = partsRequests.filter(p => p.jobId === job.id);
      const requestedCount = jobParts.filter(p => (p.status || '').toLowerCase() === 'pending' || (p.status || '').toLowerCase() === 'requested').length;
      const orderedCount = jobParts.filter(p => (p.status || '').toLowerCase() === 'ordered').length;
      const receivedCount = jobParts.filter(p => (p.status || '').toLowerCase() === 'received' || (p.status || '').toLowerCase() === 'fulfilled').length;
      if (requestedCount > 0) {
        reportSections.missingParts.push(`📦 Job ${jobDesc}: Waiting on ${requestedCount} pending/requested parts (${orderedCount} ordered, ${receivedCount} received)`);
      }

      // 3. Location / Bay moves today
      const matchedZone = zonesList.find(z => z.currentJobId === job.id);
      if (matchedZone && isToday(matchedZone.lastAssignedAt)) {
        reportSections.bayMoves.push(`📍 Job ${jobDesc} moved into ${matchedZone.name}`);
      }

      // 4. General Status Updates Today
      if (isToday(job.updatedAt)) {
        reportSections.generalUpdates.push(`📋 Job ${jobDesc} status updated to: "${job.status || 'Active'}"`);
      }
    });

    const todayStr = new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let text = `📋 UPFITTERS OS - DAILY SHOP PROGRESS DIGEST\n`;
    text += `Report Date: ${todayStr}\n`;
    text += `==================================================\n\n`;

    let totalChanges = 0;

    if (reportSections.qcPassed.length > 0) {
      text += `🏁 PASSED QUALITY CONTROL TODAY:\n`;
      reportSections.qcPassed.forEach(item => text += `   ${item}\n`);
      text += `\n`;
      totalChanges += reportSections.qcPassed.length;
    }

    if (reportSections.readyForQc.length > 0) {
      text += `🔧 COMPLETED BY TECHS & READY FOR QC:\n`;
      reportSections.readyForQc.forEach(item => text += `   ${item}\n`);
      text += `\n`;
      totalChanges += reportSections.readyForQc.length;
    }

    if (reportSections.rework.length > 0) {
      text += `⚠️ REWORK / FAILED QC REASONS:\n`;
      reportSections.rework.forEach(item => text += `   ${item}\n`);
      text += `\n`;
      totalChanges += reportSections.rework.length;
    }

    if (reportSections.currentBlockers.length > 0) {
      text += `🛑 CURRENT ACTIVE BLOCKERS / ON HOLD:\n`;
      reportSections.currentBlockers.forEach(item => text += `   ${item}\n`);
      text += `\n`;
      totalChanges += reportSections.currentBlockers.length;
    }

    if (reportSections.missingParts.length > 0) {
      text += `📦 JOBS CURRENTLY WAITING ON PARTS:\n`;
      reportSections.missingParts.forEach(item => text += `   ${item}\n`);
      text += `\n`;
      totalChanges += reportSections.missingParts.length;
    }

    if (reportSections.blockersLogged.length > 0 || reportSections.blockersResolved.length > 0) {
      text += `🛑 TODAY'S BLOCKER ACTIVITY:\n`;
      reportSections.blockersLogged.forEach(item => text += `   ${item}\n`);
      reportSections.blockersResolved.forEach(item => text += `   ${item}\n`);
      text += `\n`;
      totalChanges += (reportSections.blockersLogged.length + reportSections.blockersResolved.length);
    }

    if (reportSections.bayMoves.length > 0) {
      text += `📍 VEHICLE BAY MOVES:\n`;
      reportSections.bayMoves.forEach(item => text += `   ${item}\n`);
      text += `\n`;
      totalChanges += reportSections.bayMoves.length;
    }

    if (reportSections.generalUpdates.length > 0) {
      const uniqueUpdates = reportSections.generalUpdates.slice(0, 10);
      text += `📋 OTHER ACTIVE JOB UPDATES:\n`;
      uniqueUpdates.forEach(item => text += `   ${item}\n`);
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

  const handleOpenReport = () => {
    const reportText = generateProgressReport();
    setGeneratedReportText(reportText);
    setIsReportModalOpen(true);
  };

  const handleCopyReportToClipboard = () => {
    navigator.clipboard.writeText(generatedReportText);
    toast.success("Progress Digest Copied!", {
      description: "Daily activity report copied to your clipboard.",
      duration: 3000,
    });
  };

  const handleEmailReportLink = () => {
    const emailSubject = encodeURIComponent(`Daily Shop Progress Digest - ${new Date().toLocaleDateString()}`);
    const emailBody = encodeURIComponent(generatedReportText);
    window.location.href = `mailto:?subject=${emailSubject}&body=${emailBody}`;
    toast.success("Opening Email Client...", {
      description: "Email prefilled with daily shop digest.",
      duration: 3000,
    });
  };

  const handleUpdateTaskStatus = async (jobId: string, taskId: string, nextStatus: string) => {
    setIsUpdating(jobId);
    try {
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId);
      const updateData: any = {
        status: nextStatus,
        updatedAt: new Date().toISOString()
      };

      if (nextStatus === 'QC') {
        updateData.completedAt = new Date().toISOString();
        updateData.completedBy = user?.displayName || user?.email || 'Worksheet';
        updateData.completedByStaffName = user?.displayName || user?.email || 'Worksheet';
      } else if (nextStatus === 'QC Complete') {
        updateData.qcCompletedAt = new Date().toISOString();
        updateData.qcCompletedBy = user?.displayName || user?.email || 'Worksheet';
      } else if (nextStatus === 'Rework') {
        updateData.qcFailedAt = new Date().toISOString();
        updateData.qcFailedBy = user?.displayName || user?.email || 'Worksheet';
      }

      await updateDoc(taskRef, updateData);
      toast.success(`Task marked as ${nextStatus}`);
    } catch (err: any) {
      toast.error(`Failed to update task status: ...`);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleAssignStaffToTask = async (jobId: string, taskId: string, staffId: string) => {
    setIsUpdating(jobId);
    try {
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId);
      if (staffId === 'unassigned') {
        await updateDoc(taskRef, {
          assignedStaffIds: [],
          assignedStaff: [],
          updatedAt: new Date().toISOString()
        });
        toast.success('Task unassigned');
      } else {
        const staff = staffList.find(s => s.id === staffId);
        if (staff) {
          const staffObj = {
            id: staff.id,
            uid: staff.userId || staff.id,
            name: `${staff.firstName} ${staff.lastName}`,
            displayName: `${staff.firstName} ${staff.lastName}`
          };
          await updateDoc(taskRef, {
            assignedStaffIds: [staff.id],
            assignedStaff: [staffObj],
            updatedAt: new Date().toISOString()
          });
          toast.success(`Task assigned to ${staffObj.name}`);
        }
      }
    } catch (err: any) {
      toast.error(`Failed to assign task: ...`);
    } finally {
      setIsUpdating(null);
    }
  };



  return (
    <div 
      ref={containerRef}
      className={cn(
        "h-full flex flex-col bg-zinc-50 dark:bg-zinc-950 font-sans text-xs select-none",
        isFullscreen ? "fixed inset-0 z-[9999] p-4 space-y-4 bg-zinc-950 w-screen h-screen overflow-auto" : ""
      )}
    >
      
      {/* ----------------------------------------------------
          TOP WORKBOARD HEADER
      ---------------------------------------------------- */}
      <div className="flex flex-col gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:py-5 sm:px-6 rounded-2xl shadow-sm mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-500" />
              Jobs Worksheet
            </h2>
            <p className="text-sm text-zinc-500 mt-1">Excel-style live job worksheet. Manage job due dates, bay locations, blockers, and crew assignments directly.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isFullscreen && (
              <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Worksheet Mode</span>
              </div>
            )}
            <button 
              onClick={handleOpenReport}
              className="flex px-4 py-2 bg-indigo-650 hover:bg-indigo-705 text-white text-xs font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2 animate-pulse hover:animate-none border border-indigo-600/20"
              title="Open shop activity progress report digest"
            >
              <Mail className="w-3.5 h-3.5 text-white" />
              Shop Progress Report
            </button>
            <button 
              onClick={toggleFullscreen}
              className="flex px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2"
            >
              {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
              {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
            </button>
            <div className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Connected
            </div>
          </div>
        </div>

        {/* Filters and Inputs Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full border-t border-zinc-100 dark:border-zinc-800 pt-3">

          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search jobs by #, customer, VIN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 transition dark:text-white"
            />
          </div>

          {/* Job status Filter */}
          <div className="relative w-full sm:w-44">
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 transition dark:text-white"
            >
              <option value="all">All Job Statuses</option>
              <option value="Active">Active / Open</option>
              <option value="Blocked">Blocked</option>
              <option value="Completed">Completed / Closed</option>
              <option value="On Hold">On Hold</option>
              <option value="Almost Ready">Almost Ready</option>
            </select>
          </div>

          {/* Legend */}
          <div className="hidden lg:flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ml-auto select-none">
            <span>Row Hints:</span>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/10 dark:bg-red-950/20 border border-red-500/20" /> Blocked</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/10 dark:bg-emerald-950/20 border border-emerald-500/20" /> Active</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-zinc-100 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-800" /> Finished</div>
          </div>
        </div>
      </div>

      {/* Mobile Swipe Hint */}
      <div className="md:hidden flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl mb-3 font-bold text-[10px] uppercase tracking-wider animate-pulse border border-indigo-500/15">
        <span>↔ Swipe table horizontally to view all columns</span>
      </div>

      {/* ----------------------------------------------------
          SPREADSHEET GRID VIEW CONTAINER
      ---------------------------------------------------- */}
      <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-2xl shadow-sm relative no-scrollbar min-h-[500px]">
        <table className="w-full text-left border-collapse table-fixed">

          {/* Header Row */}
          <thead>
            <tr className="bg-zinc-150 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-extrabold uppercase select-none sticky top-0 z-40">
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.jobInfo }}>
                Job # & Details {renderResizeHandle('jobInfo')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.priority }}>
                Priority {renderResizeHandle('priority')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.dueDate }}>
                Due Date {renderResizeHandle('dueDate')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.dynamicETA }}>
                Est Completion {renderResizeHandle('dynamicETA')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.location }}>
                Location / Bay {renderResizeHandle('location')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.status }}>
                Job Status {renderResizeHandle('status')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.crew }}>
                Active Staff {renderResizeHandle('crew')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.tasks }}>
                Tasks Completed {renderResizeHandle('tasks')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.parts }}>
                Parts Status {renderResizeHandle('parts')}
              </th>
              <th className="p-2.5 relative align-middle" style={{ width: colWidths.blockers }}>
                Active Blockers {renderResizeHandle('blockers')}
              </th>
            </tr>
          </thead>

          {/* Grid Rows */}
          <tbody>
            {filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-16 text-center text-zinc-400 dark:text-zinc-500 font-medium italic">
                  No jobs match the selected filter configuration.
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => {
                // Find vehicle
                const vehicle = vehiclesList.find(v => v.vin === job.vehicleId);
                const vehicleLabel = vehicle
                  ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
                  : (job.vehicleId ? `VIN: ${job.vehicleId.slice(-8)}` : null);

                // Tasks stats
                const jobTasks = tasksMap[job.id] || [];
                const nonGeneralTasks = jobTasks.filter(t => t.title !== 'General');
                const totalTasks = nonGeneralTasks.length;
                const completedTasks = nonGeneralTasks.filter(t => t.status === 'QC' || t.status === 'QC Complete' || t.status === 'completed').length;
                const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

                // Parts aggregation
                const jobParts = partsRequests.filter(p => p.jobId === job.id);
                const requestedCount = jobParts.filter(p => (p.status || '').toLowerCase() === 'pending' || (p.status || '').toLowerCase() === 'requested').length;
                const orderedCount = jobParts.filter(p => (p.status || '').toLowerCase() === 'ordered').length;
                const receivedCount = jobParts.filter(p => (p.status || '').toLowerCase() === 'received' || (p.status || '').toLowerCase() === 'fulfilled').length;
                const hasParts = requestedCount + orderedCount + receivedCount > 0;

                let partsBadgeColor = 'bg-zinc-100 text-zinc-500 border-zinc-200/50 dark:bg-zinc-900/30 dark:text-zinc-500 dark:border-zinc-800';
                let partsLabel = 'No Parts';

                if (hasParts) {
                  if (requestedCount === 0 && orderedCount === 0) {
                    partsBadgeColor = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50';
                    partsLabel = `Ready (${receivedCount})`;
                  } else if (requestedCount > 0) {
                    partsBadgeColor = 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-950/25 dark:text-red-400 dark:border-red-900/50 animate-pulse';
                    partsLabel = `Req (${requestedCount}/${orderedCount}/${receivedCount})`;
                  } else {
                    partsBadgeColor = 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/50';
                    partsLabel = `Ord (${requestedCount}/${orderedCount}/${receivedCount})`;
                  }
                }

                // Active Crew: Find techs currently clocked into this job
                const activeCrewSessions = sessions.filter(s => {
                  if (s.status === 'completed') return false;
                  return s.jobs?.some((j: any) => !j.end && j.id === job.id);
                });

                // Blocker status resolver
                const activeBlockers = (job.blockers || []).filter((b: any) => b.status === 'active');
                const isBlocked = activeBlockers.length > 0 || job.status === 'Blocked';

                // Row Highlights consistent with Staff Worksheet
                let rowHighlightClass = 'bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900/40';
                if (isBlocked) {
                  rowHighlightClass = 'bg-red-500/[0.04] dark:bg-red-500/[0.02] hover:bg-red-500/[0.08]';
                } else if (job.status === 'Active' || job.status === 'Open') {
                  rowHighlightClass = 'bg-emerald-500/[0.04] dark:bg-emerald-500/[0.02] hover:bg-emerald-500/[0.08]';
                } else if (job.status === 'Completed' || job.status === 'Closed') {
                  rowHighlightClass = 'bg-zinc-100/50 dark:bg-zinc-900/10 hover:bg-zinc-150/50 dark:hover:bg-zinc-800/20';
                }

                const daysLeft = getDaysRemaining(job.expectedFinishTime);
                const isOverdue = daysLeft !== null && daysLeft < 0 && job.status !== 'Completed' && job.status !== 'Closed';

                return (
                  <Fragment key={job.id}>
                    <tr
                      className={cn(
                        "border-b border-zinc-200 dark:border-zinc-800/80 transition-colors font-medium text-zinc-800 dark:text-zinc-300",
                        rowHighlightClass,
                        isUpdating === job.id && "opacity-60 pointer-events-none"
                      )}
                    >
                      {/* 1. Job # & Details */}
                      <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle font-bold text-zinc-900 dark:text-white">
                        <div className="flex items-center gap-2 px-1 min-w-0">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                            isBlocked ? "bg-red-500/10 text-red-600" :
                              job.status === 'Active' ? "bg-emerald-500/10 text-emerald-600" :
                                "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                          )}>
                            {job.jobNumber ? '#' : 'J'}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="truncate text-xs font-black hover:text-indigo-500 cursor-pointer" onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}>
                              {job.jobNumber ? `#${job.jobNumber} - ${job.title}` : job.title}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5 text-[9px] font-semibold text-zinc-400 leading-none">
                              {job.customerName && <span className="truncate max-w-[100px]">Cust: {job.customerName}</span>}
                              {vehicleLabel && <span className="truncate max-w-[120px]">🚙 {vehicleLabel}</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}
                            className="p-1 text-zinc-400 hover:text-indigo-500 rounded transition shrink-0 ml-auto"
                            title="View Job Details"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* 1b. Priority (Searchable / Editable Inline) */}
                      <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center">
                        <div className={cn(
                          "w-full font-bold text-xs rounded",
                          (job.priority || '').startsWith('5') ? "text-rose-600 dark:text-rose-455 font-extrabold" :
                            (job.priority || '').startsWith('4') ? "text-amber-600 dark:text-amber-455" :
                              (job.priority || '').startsWith('0') ? "text-zinc-400 dark:text-zinc-500" :
                                "text-zinc-650 dark:text-zinc-400"
                        )}>
                          <ExcelSearchableSelect
                            options={['0 - Not Ready', '1 - Low', '2 - Medium-Low', '3 - Medium', '4 - High', '5 - Urgent']}
                            value={(() => {
                              const p = job.priority;
                              if (!p) return '3 - Medium';
                              if (p === '0') return '0 - Not Ready';
                              if (p === '1') return '1 - Low';
                              if (p === '2') return '2 - Medium-Low';
                              if (p === '3') return '3 - Medium';
                              if (p === '4') return '4 - High';
                              if (p === '5') return '5 - Urgent';
                              return p;
                            })()}
                            onChange={(val) => handlePriorityChange(job.id, val)}
                            getLabel={(p) => p}
                            getValue={(p) => p}
                            placeholder="Select Priority..."
                            disabled={!canManage}
                          />
                        </div>
                      </td>

                      {/* 2. Due Date (Editable Inline) */}
                      <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center">
                        <div className="flex items-center justify-center px-1">
                          <input
                            type="date"
                            value={formatFinishDate(job.expectedFinishTime)}
                            onChange={(e) => handleDueDateChange(job.id, e.target.value)}
                            disabled={!canManage}
                            className={cn(
                              "bg-transparent border-none outline-none font-mono text-xs text-center font-bold px-1.5 py-0.5 rounded cursor-pointer max-w-[110px] dark:text-white dark:bg-zinc-900/60",
                              isOverdue ? "text-red-500 bg-red-500/5" : "text-zinc-700"
                            )}
                            style={{ colorScheme: 'dark' }}
                          />
                        </div>
                      </td>

                      {/* 2b. Est Completion (Dynamic ETA) */}
                      <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center">
                        <div className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 px-1">
                          {(() => {
                            const jobTasks = tasksMap[job.id] || [];
                            const eta = calculateDynamicETA(job, jobTasks, departments);
                            if (!eta) return 'Not Set';
                            return eta.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                          })()}
                        </div>
                      </td>

                      {/* 3. Location / Bay (Searchable / Editable Inline) */}
                      <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                        <div className="w-full text-zinc-850 dark:text-zinc-300 font-bold">
                          <ExcelSearchableSelect
                            options={[
                              { id: 'none', name: '-- Off-site --' },
                              ...zonesList.filter(z => !z.isArchived)
                            ]}
                            value={zonesList.find(z => z.currentJobId === job.id)?.id || job.bayId || 'none'}
                            onChange={(val) => handleLocationChange(job.id, val)}
                            getLabel={(z) => z.name}
                            getValue={(z) => z.id}
                            placeholder="Choose Location..."
                            disabled={!canManage}
                          />
                        </div>
                      </td>

                      {/* 4. Job Status (Searchable / Editable Inline) */}
                      <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                        <div className={cn(
                          "w-full font-bold",
                          isBlocked ? "text-red-650 dark:text-red-455" :
                            job.status === 'Active' ? "text-emerald-650 dark:text-emerald-455" :
                              "text-zinc-650 dark:text-zinc-400"
                        )}>
                          <ExcelSearchableSelect
                            options={['Open', 'Active', 'Blocked', 'Almost Ready', 'On Hold', 'Ready for QA', 'Ready for Customer', 'Completed', 'Closed']}
                            value={job.status || 'Open'}
                            onChange={(val) => handleStatusChange(job.id, val)}
                            getLabel={(s) => s}
                            getValue={(s) => s}
                            placeholder="Choose Status..."
                            disabled={!canManage}
                          />
                        </div>
                      </td>

                      {/* 5. Active Crew */}
                      <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                        <div className="flex flex-wrap gap-1 items-center px-1">
                          {activeCrewSessions.length === 0 ? (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-650 italic">No crew logged</span>
                          ) : (
                            activeCrewSessions.map(session => {
                              const staff = staffList.find(s => s.userId === session.userId || s.id === session.userId);
                              const displayInitials = staff ? (staff.firstName?.[0] || '') + (staff.lastName?.[0] || '') : 'T';
                              const displayName = staff ? `${staff.firstName || ''} ${staff.lastName || ''}`.trim() : session.userName || 'Tech';
                              const isBreak = session.status === 'on_break';

                              return (
                                <div
                                  key={session.id}
                                  className={cn(
                                    "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black border shrink-0 leading-none",
                                    isBreak
                                      ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                      : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  )}
                                  title={`${displayName} (${session.status === 'on_break' ? 'Break' : 'Active'})`}
                                >
                                  <span className={cn("w-1.5 h-1.5 rounded-full bg-current shrink-0", !isBreak && "animate-pulse")} />
                                  <span>{displayInitials}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </td>

                      {/* 6. Tasks Completed (Progress Bar) */}
                      <td 
                        onClick={() => setExpandedJobId(prev => prev === job.id ? null : job.id)}
                        className={cn(
                          "p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center cursor-pointer select-none transition-all duration-200",
                          expandedJobId === job.id 
                            ? "bg-indigo-500/10 dark:bg-indigo-500/20 shadow-inner" 
                            : "hover:bg-indigo-500/5 dark:hover:bg-indigo-500/5"
                        )}
                      >
                        {totalTasks === 0 ? (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-650 italic px-2">No tasks</span>
                        ) : (
                          <div className="flex flex-col items-center px-2 w-full">
                            <span className="font-extrabold text-[10px] text-indigo-600 dark:text-indigo-400 mb-1 flex items-center justify-center gap-1">
                              {completedTasks} / {totalTasks} Tasks
                              <ChevronDown className={cn("w-3 h-3 text-indigo-500 transition-transform duration-200", expandedJobId === job.id && "rotate-180")} />
                            </span>
                            <div className="w-full bg-zinc-150 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden border border-zinc-200/40 dark:border-zinc-800">
                              <div
                                className="bg-indigo-500 h-full transition-all duration-300"
                                style={{ width: `${progressPercentage}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 7. Parts Status */}
                      <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center">
                        <div className="flex items-center justify-center">
                          <div
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-black border leading-none shrink-0 flex items-center gap-1",
                              partsBadgeColor
                            )}
                            title={hasParts ? `${receivedCount} received, ${orderedCount} ordered, ${requestedCount} requested` : 'No parts requested'}
                          >
                            <Package className="w-3 h-3 shrink-0" />
                            <span>{partsLabel}</span>
                          </div>
                        </div>
                      </td>

                      {/* 8. Active Blockers */}
                      <td className="p-1.5 align-middle">
                        <div className="flex flex-col gap-1 w-full min-w-0">
                          {activeBlockers.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {activeBlockers.map((blocker: any) => (
                                <div
                                  key={blocker.id}
                                  className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-600 dark:text-red-400"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate flex-1" title={blocker.message}>
                                    {blocker.message}
                                  </span>
                                </div>
                              ))}
                              {canManage && (
                                <button
                                  onClick={() => handleClearBlockers(job.id)}
                                  className="text-[9px] font-extrabold uppercase text-red-500 hover:text-red-700 bg-red-500/5 px-2 py-1 rounded w-fit transition active:scale-95 border border-red-500/15"
                                >
                                  Resolve Blockers
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => setActiveBlockerJobId(job.id)}
                              disabled={!canManage}
                              className="flex items-center gap-1 px-2 py-1 border border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-650 rounded-lg text-zinc-450 hover:text-zinc-650 text-[10px] font-semibold w-fit transition active:scale-95"
                            >
                              <Plus className="w-3 h-3" /> Log Blocker
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    
                    {expandedJobId === job.id && (
                      <tr className="bg-zinc-50/50 dark:bg-zinc-900/30 border-b border-zinc-200 dark:border-zinc-800">
                        <td colSpan={10} className="p-4 sm:p-6">
                          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm space-y-4">
                            
                            {/* Panel Header */}
                            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-805 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0 animate-pulse" />
                                <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-900 dark:text-white">
                                  Task Checklist for Job {job.jobNumber ? `#${job.jobNumber}` : ''} - {job.title}
                                </h4>
                              </div>
                              <button
                                onClick={() => setExpandedJobId(null)}
                                className="text-[10px] font-black uppercase text-zinc-450 hover:text-zinc-650 bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded transition hover:scale-95"
                              >
                                Close Panel
                              </button>
                            </div>

                            {/* Task List */}
                            {(() => {
                              const activeTasks = jobTasks.filter(t => t.title !== 'General' && t.status !== 'QC Complete' && t.status !== 'completed' && t.status !== 'QC');
                              if (activeTasks.length === 0) {
                                return (
                                  <div className="p-6 text-center text-zinc-400 dark:text-zinc-500 font-medium italic">
                                    No active tasks remaining for this job. All tasks are completed.
                                  </div>
                                );
                              }
                              return (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                                        <th className="pb-2 w-1/3">Task Title & Description</th>
                                        <th className="pb-2 w-1/4">Assigned Tech</th>
                                        <th className="pb-2 w-1/6">Status</th>
                                        <th className="pb-2 text-right">Quick Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                      {activeTasks.map((task) => {
                                        const staffOptions = [
                                          { id: 'unassigned', name: 'Unassigned' },
                                          ...staffList.map(s => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))
                                        ];

                                        return (
                                          <tr key={task.id} className="text-xs">
                                            {/* Title & Desc */}
                                            <td 
                                              onClick={() => navigate(`/business/${tenantId}/task/${job.id}/${task.id}`)}
                                              className="py-2.5 pr-4 align-top cursor-pointer group"
                                            >
                                              <div className="font-bold text-zinc-900 dark:text-white group-hover:text-indigo-500 group-hover:underline transition-colors">{task.title}</div>
                                              {task.description && (
                                                <div className="text-[10px] text-zinc-450 dark:text-zinc-500 mt-0.5 line-clamp-2" title={task.description}>
                                                  {task.description}
                                                </div>
                                              )}
                                            </td>

                                            {/* Tech Select */}
                                            <td className="py-2.5 pr-4 align-top">
                                              <div className="w-full max-w-[180px]">
                                                <ExcelSearchableSelect
                                                  options={staffOptions}
                                                  value={task.assignedStaffIds?.[0] || 'unassigned'}
                                                  onChange={(val) => handleAssignStaffToTask(job.id, task.id, val)}
                                                  getLabel={(o) => o.name}
                                                  getValue={(o) => o.id}
                                                  placeholder="Assign Tech..."
                                                />
                                              </div>
                                            </td>

                                            {/* Status Badge */}
                                            <td className="py-2.5 pr-4 align-top">
                                              <span className={cn(
                                                "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border leading-none mt-1.5",
                                                task.status === 'QC Complete' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                                task.status === 'QC' ? "bg-amber-500/10 text-amber-600 border-amber-500/20 animate-pulse" :
                                                task.status === 'Rework' ? "bg-red-500/10 text-red-600 border-red-500/20" :
                                                task.status === 'in_progress' ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                                                "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-400 dark:border-zinc-800"
                                              )}>
                                                {task.status || 'Pending'}
                                              </span>
                                            </td>

                                            {/* Quick Actions */}
                                            <td className="py-2.5 align-top text-right">
                                              <div className="flex items-center justify-end gap-1.5">
                                                
                                                {/* General Status Dropdown */}
                                                <div className="w-[120px] text-left">
                                                  <ExcelSearchableSelect
                                                    options={['pending', 'in_progress', 'QC', 'QC Complete', 'Rework']}
                                                    value={task.status || 'pending'}
                                                    onChange={(val) => handleUpdateTaskStatus(job.id, task.id, val)}
                                                    getLabel={(s) => s.toUpperCase()}
                                                    getValue={(s) => s}
                                                    placeholder="Status..."
                                                  />
                                                </div>

                                                {/* Contextual quick button */}
                                                {task.status === 'QC' ? (
                                                  <>
                                                    <button
                                                      onClick={() => handleUpdateTaskStatus(job.id, task.id, 'QC Complete')}
                                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-[9px] uppercase tracking-wider transition active:scale-95 shadow-sm"
                                                      title="Pass Quality Control"
                                                    >
                                                      Pass
                                                    </button>
                                                    <button
                                                      onClick={() => handleUpdateTaskStatus(job.id, task.id, 'Rework')}
                                                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-lg text-[9px] uppercase tracking-wider transition active:scale-95 shadow-sm"
                                                      title="Fail Quality Control (Rework)"
                                                    >
                                                      Fail
                                                    </button>
                                                  </>
                                                ) : (
                                                  task.status !== 'QC Complete' && (
                                                    <button
                                                      onClick={() => handleUpdateTaskStatus(job.id, task.id, 'QC')}
                                                      className="px-2.5 py-1 bg-indigo-650 hover:bg-indigo-700 text-white font-extrabold rounded-lg text-[9px] uppercase tracking-wider transition active:scale-95 shadow-sm"
                                                      title="Send to Quality Control"
                                                    >
                                                      Complete
                                                    </button>
                                                  )
                                                )}
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ----------------------------------------------------
          BLOCKER POPUP MODAL
      ---------------------------------------------------- */}
      {activeBlockerJobId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setActiveBlockerJobId(null)}>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-zinc-150 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <h3 className="font-black text-xs uppercase tracking-wider text-zinc-850 dark:text-white">Log Active Blocker</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">What is holding up this job?</label>
                <textarea
                  autoFocus
                  rows={3}
                  value={newBlockerMsg}
                  onChange={e => setNewBlockerMsg(e.target.value)}
                  placeholder="e.g. Waiting on customer approval, missing harness adapter kit, vehicle is blocked in bay 6..."
                  className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white placeholder-zinc-400"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                <button
                  onClick={() => setActiveBlockerJobId(null)}
                  className="px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddBlocker}
                  disabled={!newBlockerMsg.trim()}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md shadow-red-600/10 transition"
                >
                  Apply Blocker
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          PROGRESS DIGEST POPUP MODAL
      ---------------------------------------------------- */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsReportModalOpen(false)}>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-zinc-150 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-500 shrink-0" />
                <h3 className="font-black text-xs uppercase tracking-wider text-zinc-850 dark:text-white">Shop Progress Activity Digest</h3>
              </div>
              <button 
                onClick={() => setIsReportModalOpen(false)}
                className="text-xs font-black uppercase text-zinc-400 hover:text-zinc-650 dark:hover:text-white"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Below is a progress summary showing only the shop activity and status changes that occurred today.
              </p>
              
              <textarea
                readOnly
                rows={15}
                value={generatedReportText}
                className="w-full p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl font-mono text-[11px] outline-none dark:text-zinc-200 leading-relaxed overflow-y-auto select-text cursor-text"
                onClick={e => (e.target as HTMLTextAreaElement).select()}
                title="Click inside to select all text for copying"
              />
              
              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider select-none">
                  💡 Tip: Click inside the box to select all text instantly!
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyReportToClipboard}
                    className="flex items-center gap-1.5 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl text-xs transition"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Copy to Clipboard
                  </button>
                  <button
                    onClick={handleEmailReportLink}
                    className="flex items-center gap-1.5 px-5 py-2 bg-indigo-650 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/10 transition"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Send Email
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ExcelSearchableSelectProps<T> {
  options: T[];
  value: string;
  onChange: (value: string) => void;
  getLabel: (option: T) => string;
  getValue: (option: T) => string;
  placeholder?: string;
  disabled?: boolean;
}

function ExcelSearchableSelect<T>({
  options,
  value,
  onChange,
  getLabel,
  getValue,
  placeholder = 'Select...',
  disabled = false
}: ExcelSearchableSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => getValue(o) === value);
  const filteredOptions = options.filter(o => {
    const label = getLabel(o);
    return label && label.toLowerCase().includes(search.toLowerCase());
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        onChange(getValue(filteredOptions[0]));
      }
      setIsOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-7 font-sans select-none">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setSearch('');
          }
        }}
        className={cn(
          "w-full h-full text-left px-2 py-1 text-xs font-bold bg-transparent border-none outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800/60 rounded flex items-center justify-between cursor-pointer group",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span className="truncate pr-2 dark:text-zinc-350">
          {selectedOption ? (getLabel(selectedOption) || '') : placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[180px] max-w-[280px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-[150] overflow-hidden">
          <div className="p-1.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type to filter..."
              className="w-full bg-transparent border-none outline-none text-xs dark:text-white placeholder-zinc-400"
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const optVal = getValue(option);
                const isSelected = optVal === value;
                return (
                  <button
                    key={optVal}
                    type="button"
                    onClick={() => {
                      onChange(optVal);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={cn(
                      "w-full px-2 py-1.5 text-left text-xs font-semibold rounded-lg transition-colors truncate block",
                      isSelected
                        ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                        : "text-zinc-750 dark:text-zinc-350 hover:bg-zinc-55 dark:hover:bg-zinc-850"
                    )}
                  >
                    {getLabel(option) || ''}
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center text-[10px] text-zinc-400 italic">No matches found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
