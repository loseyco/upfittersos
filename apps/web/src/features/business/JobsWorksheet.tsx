import { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection, query, where, orderBy, limit, doc, updateDoc, serverTimestamp, onSnapshot
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import {
  Search, FileSpreadsheet, ExternalLink, ChevronDown,
  AlertTriangle, Package, Plus, Maximize, Minimize
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
  const { permissions, isSuperAdmin } = useAuthStore();
  const canManage = isSuperAdmin || permissions['jobs.manage'] || permissions['timeclock.manage'];

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

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
                  <tr
                    key={job.id}
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
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center">
                      {totalTasks === 0 ? (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-650 italic px-2">No tasks</span>
                      ) : (
                        <div className="flex flex-col items-center px-2 w-full">
                          <span className="font-extrabold text-[10px] text-indigo-600 dark:text-indigo-400 mb-1">
                            {completedTasks} / {totalTasks} Tasks
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
