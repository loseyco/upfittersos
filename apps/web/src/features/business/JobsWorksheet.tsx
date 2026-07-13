import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  collection, query, where, orderBy, limit, doc, updateDoc, serverTimestamp, onSnapshot, getDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import {
  Search, FileSpreadsheet, ExternalLink, ChevronDown,
  AlertTriangle, Package, Plus, Maximize, Minimize,
  Mail, Share2, Check, Printer, FileText
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';
import { cn } from '../../lib/utils';
import { useWakeLock } from '../../hooks/useWakeLock';
import { LogoQRCode } from '../../components/LogoQRCode';

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
  const [editingVin, setEditingVin] = useState<{ [jobId: string]: string }>({});
  const [editingCcId, setEditingCcId] = useState<{ [jobId: string]: string }>({});
  const [activeHeaderFilterDropdown, setActiveHeaderFilterDropdown] = useState<string | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({
    priority: 'all',
    location: 'all',
    status: 'all',
    parts: 'all'
  });

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
  const [reportModalTab, setReportModalTab] = useState<'filtered' | 'digest' | 'travelers'>('filtered');
  const [businessName, setBusinessName] = useState('UpFittersOS');
  const [businessLogo, setBusinessLogo] = useState<string | undefined>(undefined);

  // Fetch business details for report header
  useEffect(() => {
    if (!tenantId) return;
    const fetchBusiness = async () => {
      try {
        const snap = await getDoc(doc(db, 'businesses', tenantId));
        if (snap.exists()) {
          const data = snap.data();
          setBusinessName(data.name || 'UpFittersOS');
          setBusinessLogo(data.logoUrl);
        }
      } catch (err) {
        console.warn("Could not fetch business details for report header:", err);
      }
    };
    fetchBusiness();
  }, [tenantId]);

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
    vin: 160,
    companyCam: 150,
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
      const vehicle = job.vehicleId ? vehiclesList.find(v => v.vin === job.vehicleId) : null;
      const vehicleLabel = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}` : 'No Vehicle Assigned';
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
      const isReadyForQC = job.status === 'Ready for QC' || job.status === 'QC' || job.status === 'QC Complete';

      // Needs setup condition
      const isActiveWorkflow = job.status !== 'Completed' && job.status !== 'Closed';
      const hasVin = !!(job.vehicleId || job.vehicle || (job.qbCustomFields && (job.qbCustomFields.vin || job.qbCustomFields['VIN num'])));
      const hasTasks = totalTasks > 0;
      const hasStatus = !!(job.status && job.status !== 'Open');
      const needsSetup = isActiveWorkflow && (!hasVin || !hasTasks || !hasStatus);

       const isActionable = 
        selectedStatusFilter === 'all' || 
        selectedStatusFilter === 'Active' || 
        hasBay || 
        hasTasksNeedingDone || 
        hasQCNeedingDone || 
        isReadyForCustomer || 
        isReadyForQC || 
        needsSetup;
      if (!isActionable) return false;

      // 3. Status Toolbar Dropdown Filter
      const activeBlockers = (job.blockers || []).filter((b: any) => b.status === 'active');
      const isBlocked = activeBlockers.length > 0 || job.status === 'Blocked';

      let resolvedStatus = job.status || 'Open';
      if (isBlocked) resolvedStatus = 'Blocked';

      let matchesStatus = false;
      if (selectedStatusFilter === 'needs_attention') {
        matchesStatus = needsSetup;
      } else {
        matchesStatus = selectedStatusFilter === 'all' ||
          (selectedStatusFilter === 'Active' && (resolvedStatus === 'Active' || resolvedStatus === 'Open')) ||
          (selectedStatusFilter === 'Blocked' && resolvedStatus === 'Blocked') ||
          (selectedStatusFilter === 'Completed' && (resolvedStatus === 'Completed' || resolvedStatus === 'Closed')) ||
          (selectedStatusFilter === job.status);
      }

      if (!matchesStatus) return false;

      // 4. Excel-style Column Filters
      // Priority filter
      if (colFilters.priority !== 'all') {
        const priorityVal = job.priority || '3 Medium';
        if (colFilters.priority === 'urgent' && !priorityVal.includes('5')) return false;
        if (colFilters.priority === 'high' && !priorityVal.includes('4')) return false;
        if (colFilters.priority === 'medium' && !priorityVal.includes('3')) return false;
        if (colFilters.priority === 'low' && !priorityVal.includes('2') && !priorityVal.includes('1') && !priorityVal.includes('0')) return false;
      }

      // Location filter
      if (colFilters.location !== 'all') {
        const resolvedLocationId = zonesList.find(z => z.currentJobId === job.id)?.id || job.bayId || 'none';
        const bay = zonesList.find(z => z.id === resolvedLocationId);
        const bayName = bay ? bay.name : (resolvedLocationId !== 'none' ? resolvedLocationId : 'None');
        if (colFilters.location.toLowerCase() !== bayName.toLowerCase()) return false;
      }

      // Status filter
      if (colFilters.status !== 'all') {
        if (colFilters.status === 'Active' && resolvedStatus !== 'Active' && resolvedStatus !== 'Open') return false;
        if (colFilters.status !== 'Active' && colFilters.status !== resolvedStatus) return false;
      }

      // Parts filter
      if (colFilters.parts !== 'all') {
        const jobParts = partsRequests.filter(p => p.jobId === job.id);
        const totalParts = jobParts.length;
        const missingParts = jobParts.filter(p => p.status === 'pending' || p.status === 'ordered').length;
        
        let partsLabel = 'no_parts';
        if (totalParts > 0) {
          partsLabel = missingParts > 0 ? 'missing' : 'ready';
        }
        if (colFilters.parts !== partsLabel) return false;
      }

      return true;
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

      // 2. Sort by Due Date (ascending: earliest first)
      const getDueDateVal = (j: any) => {
        if (!j.expectedFinishTime) return Infinity;
        const date = j.expectedFinishTime.toDate ? j.expectedFinishTime.toDate() : new Date(j.expectedFinishTime);
        return isNaN(date.getTime()) ? Infinity : date.getTime();
      };

      const dA = getDueDateVal(a);
      const dB = getDueDateVal(b);
      if (dA !== dB) return dA - dB;

      // 3. Sort by Job Status (Workflow order)
      const getStatusWeight = (j: any) => {
        const activeBlockers = (j.blockers || []).filter((b: any) => b.status === 'active');
        if (activeBlockers.length > 0 || j.status === 'Blocked') return 0;
        if (j.status === 'Active') return 1;
        if (j.status === 'Ready for QC') return 2;
        if (j.status === 'Almost Ready') return 3;
        if (j.status === 'Open') return 4;
        if (j.status === 'On Hold') return 5;
        if (j.status === 'Ready for Customer') return 6;
        if (j.status === 'Completed') return 7;
        if (j.status === 'Closed') return 8;
        return 9;
      };

      const wa = getStatusWeight(a);
      const wb = getStatusWeight(b);
      if (wa !== wb) return wa - wb;

      // 4. Sort by last updated
      return (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0);
    });
  }, [jobsList, vehiclesList, searchTerm, selectedStatusFilter, tasksMap, colFilters, zonesList, partsRequests]);

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

  const handleVinChange = async (jobId: string, newVin: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      await updateDoc(jobRef, {
        vehicleId: newVin.trim().toUpperCase(),
        updatedAt: serverTimestamp()
      });
      toast.success(`VIN updated successfully`);
    } catch (err: any) {
      toast.error(`Failed to update VIN: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleCompanyCamIdChange = async (jobId: string, newCcId: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      await updateDoc(jobRef, {
        companyCamId: newCcId.trim(),
        updatedAt: serverTimestamp()
      });
      toast.success(`CompanyCam Project ID updated`);
    } catch (err: any) {
      toast.error(`Failed to update CompanyCam Project ID: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleStatusChange = async (jobId: string, newStatus: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      const updateFields: any = {
        status: newStatus,
        updatedAt: serverTimestamp()
      };
      if (newStatus === 'Ready for Customer') {
        updateFields.readyForCustomerAt = serverTimestamp();
      } else if (['Completed', 'Closed'].includes(newStatus)) {
        updateFields.completedAt = serverTimestamp();
      } else if (['Active', 'Open', 'Ready for QC'].includes(newStatus)) {
        updateFields.readyForCustomerAt = null;
        updateFields.completedAt = null;
      }
      await updateDoc(jobRef, updateFields);
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

  const generateFilteredJobsTextReport = () => {
    const todayStr = new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let text = `📋 UPFITTERS OS - FILTERED JOBS REPORT\n`;
    text += `Report Date: ${todayStr} at ${timeStr}\n`;
    
    // Add current filters summary if any
    const filterParts = [];
    if (searchTerm) filterParts.push(`Search: "${searchTerm}"`);
    if (selectedStatusFilter !== 'all') filterParts.push(`Status Filter: ${selectedStatusFilter}`);
    if (colFilters.priority !== 'all') filterParts.push(`Priority: ${colFilters.priority}`);
    if (colFilters.location !== 'all') filterParts.push(`Location: ${colFilters.location}`);
    if (colFilters.status !== 'all') filterParts.push(`Col Status: ${colFilters.status}`);
    if (colFilters.parts !== 'all') filterParts.push(`Parts: ${colFilters.parts}`);
    
    if (filterParts.length > 0) {
      text += `Applied Filters: ${filterParts.join(', ')}\n`;
    }
    text += `==================================================\n\n`;

    if (filteredJobs.length === 0) {
      text += `No jobs match the current filter configuration.\n`;
    } else {
      filteredJobs.forEach((job, index) => {
        const vehicle = job.vehicleId ? vehiclesList.find(v => v.vin === job.vehicleId) : null;
        const vehicleLabel = vehicle
          ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
          : (job.vehicleId ? `VIN: ${job.vehicleId.slice(-8)}` : 'No Vehicle Assigned');
        
        const jobDesc = `${job.jobNumber ? `#${job.jobNumber} ` : ''}${job.title}`;
        
        text += `${index + 1}. Job: ${jobDesc}\n`;
        text += `   Customer: ${job.customerName || 'N/A'}\n`;
        text += `   Vehicle: ${vehicleLabel}\n`;
        
        const resolvedLocationId = zonesList.find(z => z.currentJobId === job.id)?.id || job.bayId || 'none';
        const bay = zonesList.find(z => z.id === resolvedLocationId);
        const bayName = bay ? bay.name : (resolvedLocationId !== 'none' ? resolvedLocationId : 'None');
        text += `   Location: ${bayName}\n`;
        text += `   Status: ${job.status || 'Open'}\n`;
        
        // Active crew clocked in
        const activeCrewSessions = sessions.filter(s => {
          if (s.status === 'completed') return false;
          return s.jobs?.some((j: any) => !j.end && j.id === job.id);
        });
        if (activeCrewSessions.length > 0) {
          const crewNames = activeCrewSessions.map(s => {
            const staff = staffList.find(st => st.userId === s.userId || st.id === s.userId);
            return staff ? `${staff.firstName} ${staff.lastName}` : s.userName || 'Tech';
          }).join(', ');
          text += `   Clocked Crew: ${crewNames}\n`;
        }

        // Tasks Completed Progress
        const jobTasks = tasksMap[job.id] || [];
        const nonGeneralTasks = jobTasks.filter(t => t.title !== 'General');
        const totalTasks = nonGeneralTasks.length;
        const completedTasks = nonGeneralTasks.filter(t => t.status === 'QC' || t.status === 'QC Complete' || t.status === 'completed').length;
        text += `   Task Progress: ${completedTasks} / ${totalTasks} Completed\n`;
        
        // Remaining tasks checklist
        const activeTasks = nonGeneralTasks.filter(t => t.status !== 'QC' && t.status !== 'QC Complete' && t.status !== 'completed');
        if (activeTasks.length > 0) {
          text += `   Tasks to Do:\n`;
          activeTasks.forEach((task: any) => {
            const assignedStaffNames = task.assignedStaff?.map((s: any) => s.name || s.displayName).join(', ') || 'Unassigned';
            const bookTime = parseFloat(task.bookTime) || 0;
            text += `     [ ] ${task.title} (${bookTime.toFixed(1)}h) - Assigned: ${assignedStaffNames}\n`;
          });
        } else if (totalTasks > 0) {
          text += `   Tasks: All completed! 🏁\n`;
        }

        // Active blockers
        const activeBlockers = (job.blockers || []).filter((b: any) => b.status === 'active');
        if (activeBlockers.length > 0) {
          text += `   ⚠️ Active Blockers:\n`;
          activeBlockers.forEach((b: any) => {
            text += `     - ${b.message} (Logged: ${new Date(b.createdAt).toLocaleDateString()})\n`;
          });
        }

        // Parts Status (Ignore cancelled, fulfilled, or delivered parts)
        const jobParts = partsRequests
          .filter(p => p.jobId === job.id)
          .filter(p => (p.status as string) !== 'fulfilled' && (p.status as string) !== 'cancelled' && (p.status as string) !== 'delivered' && (p.status as string) !== 'inventoried');
        if (jobParts.length > 0) {
          text += `   📦 Parts Checklist:\n`;
          jobParts.forEach((p: any) => {
            text += `     - ${p.partName} (${p.qty || p.quantity || 1}x) - Status: ${p.status || 'requested'}\n`;
          });
        }

        text += `--------------------------------------------------\n\n`;
      });
    }

    text += `Upfitters OS - Real-time Shop Command Center\n`;
    return text;
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
      const vehicle = job.vehicleId ? vehiclesList.find(v => v.vin === job.vehicleId) : null;
      const vehicleLabel = vehicle
        ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
        : (job.vehicleId ? `VIN: ${job.vehicleId.slice(-8)}` : 'No Vehicle Assigned');
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

      // Only add to readyForQc list if explicitly marked as Ready for QC, or if ALL tasks of the job are marked as ready for QC (and there's activity today)
      const isExplicitReadyForQC = job.status === 'Ready for QC';
      const isReadyForCustomerOrClosed = ['Ready for Customer', 'Completed', 'Closed'].includes(job.status || '');
      if (!isReadyForCustomerOrClosed && (isExplicitReadyForQC || (allTasksQcReady && hasQcActivityToday))) {
        const crewNames = Array.from(new Set(nonGeneralTasks.flatMap(t => t.assignedStaff?.map((s: any) => s.name) || []))).join(', ') || 'Unassigned';
        reportSections.readyForQc.push(
          isExplicitReadyForQC 
            ? `🏁 Job ${jobDesc} is marked READY FOR QC (Crew: ${crewNames})`
            : `🏁 Job ${jobDesc} is fully READY FOR QC (All ${totalTasks} tasks completed! Crew: ${crewNames})`
        );
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
      const receivedCount = jobParts.filter(p => {
        const s = (p.status || '').toLowerCase();
        return s === 'received' || s === 'fulfilled' || s === 'delivered' || s === 'inventoried';
      }).length;
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
    setReportModalTab('filtered');
    setIsReportModalOpen(true);
  };

  const handleOpenTravelers = () => {
    setReportModalTab('travelers');
    setIsReportModalOpen(true);
  };

  const handleCopyReportToClipboard = () => {
    const text = reportModalTab === 'filtered' ? generateFilteredJobsTextReport() : generateProgressReport();
    navigator.clipboard.writeText(text);
    toast.success(reportModalTab === 'filtered' ? "Filtered Jobs Report Copied!" : "Progress Digest Copied!", {
      description: reportModalTab === 'filtered' ? "Checklist report copied to your clipboard." : "Daily activity report copied to your clipboard.",
      duration: 3000,
    });
  };

  const handleEmailReportLink = () => {
    const isFiltered = reportModalTab === 'filtered';
    const emailSubject = encodeURIComponent(
      isFiltered 
        ? `Shop Jobs Status Report - ${new Date().toLocaleDateString()}`
        : `Daily Shop Progress Digest - ${new Date().toLocaleDateString()}`
    );
    const text = isFiltered ? generateFilteredJobsTextReport() : generateProgressReport();
    const emailBody = encodeURIComponent(text);
    window.location.href = `mailto:?subject=${emailSubject}&body=${emailBody}`;
    toast.success("Opening Email Client...", {
      description: isFiltered ? "Email prefilled with jobs report." : "Email prefilled with daily shop digest.",
      duration: 3000,
    });
  };

  const handleUpdateTaskStatus = async (jobId: string, taskId: string, nextStatus: string) => {
    setIsUpdating(jobId);
    try {
      const task = tasksMap[jobId]?.find((t: any) => t.id === taskId);
      if ((nextStatus === 'QC' || nextStatus === 'QC Complete') && task?.canComplete === false) {
        toast.error("This task cannot be marked as complete.");
        setIsUpdating(null);
        return;
      }

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

  const uniqueBays = useMemo(() => {
    const bays = new Set<string>();
    jobsList.forEach(job => {
      const resolvedLocationId = zonesList.find(z => z.currentJobId === job.id)?.id || job.bayId;
      if (resolvedLocationId && resolvedLocationId !== 'none') {
        const zoneObj = zonesList.find(z => z.id === resolvedLocationId);
        bays.add(zoneObj ? zoneObj.name : resolvedLocationId);
      }
    });
    return Array.from(bays).sort();
  }, [jobsList, zonesList]);

  const renderHeaderFilter = (colKey: string, options: Array<{ value: string; label: string }>) => {
    const isActive = colFilters[colKey] !== 'all';
    return (
      <div className="inline-block ml-1 relative group no-print">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveHeaderFilterDropdown(activeHeaderFilterDropdown === colKey ? null : colKey);
          }}
          className={cn(
            "p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer inline-flex items-center align-middle",
            isActive ? "text-indigo-500 font-bold" : "text-zinc-400 dark:text-zinc-500"
          )}
          title={`Filter by ${colKey}`}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {activeHeaderFilterDropdown === colKey && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setActiveHeaderFilterDropdown(null)} 
            />
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl p-1.5 z-50 min-w-[140px] max-h-60 overflow-y-auto no-scrollbar animate-in fade-in duration-150 text-left font-sans normal-case text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setColFilters(prev => ({ ...prev, [colKey]: opt.value }));
                    setActiveHeaderFilterDropdown(null);
                  }}
                  className={cn(
                    "w-full px-2 py-1.5 text-left rounded-lg transition-colors flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-850",
                    colFilters[colKey] === opt.value ? "bg-indigo-50/50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold" : ""
                  )}
                >
                  <span>{opt.label}</span>
                  {colFilters[colKey] === opt.value && <Check className="w-3 h-3 text-indigo-500 shrink-0 ml-1.5" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
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
              onClick={handleOpenTravelers}
              className="flex px-4 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-350 hover:text-white text-xs font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2 cursor-pointer"
              title="Print all visible jobs as 8.5x11 Job Cards"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-500" />
              Print Job Cards
            </button>
            <Link
              to={`/business/${tenantId}/job/create`}
              className="flex px-4 py-2 bg-emerald-650 hover:bg-emerald-750 text-white text-xs font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2 border border-emerald-600/20"
              title="Create new native job"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              Create Job
            </Link>
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
              <option value="Ready for QC">Ready for QC</option>
              <option value="Ready for Customer">Ready for Customer</option>
              <option value="Completed">Completed / Closed</option>
              <option value="On Hold">On Hold</option>
              <option value="Almost Ready">Almost Ready</option>
              <option value="needs_attention">⚠️ Needs Setup / Review</option>
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
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.priority }}>
                Priority {renderHeaderFilter('priority', [{ value: 'all', label: 'All Priorities' }, { value: 'urgent', label: 'Urgent (5)' }, { value: 'high', label: 'High (4)' }, { value: 'medium', label: 'Medium (3)' }, { value: 'low', label: 'Low (2/1/0)' }])} {renderResizeHandle('priority')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.dueDate }}>
                Due Date {renderResizeHandle('dueDate')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.status }}>
                Job Status {renderHeaderFilter('status', [{ value: 'all', label: 'All Statuses' }, { value: 'Active', label: 'Active / Open' }, { value: 'Blocked', label: 'Blocked' }, { value: 'Ready for QC', label: 'Ready for QC' }, { value: 'Ready for Customer', label: 'Ready for Customer' }, { value: 'Almost Ready', label: 'Almost Ready' }, { value: 'On Hold', label: 'On Hold' }])} {renderResizeHandle('status')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.dynamicETA }}>
                Est Completion {renderResizeHandle('dynamicETA')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.jobInfo }}>
                Job # & Details {renderResizeHandle('jobInfo')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.vin }}>
                VIN {renderResizeHandle('vin')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.companyCam }}>
                CompanyCam {renderResizeHandle('companyCam')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.location }}>
                Location / Bay {renderHeaderFilter('location', [{ value: 'all', label: 'All Locations' }, ...uniqueBays.map(b => ({ value: b, label: b }))])} {renderResizeHandle('location')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.crew }}>
                Active Staff {renderResizeHandle('crew')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.tasks }}>
                Tasks Completed {renderResizeHandle('tasks')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.parts }}>
                Parts Status {renderHeaderFilter('parts', [{ value: 'all', label: 'All Parts' }, { value: 'missing', label: 'Missing Parts' }, { value: 'ready', label: 'Ready' }, { value: 'no_parts', label: 'No Parts' }])} {renderResizeHandle('parts')}
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
                <td colSpan={12} className="p-16 text-center text-zinc-400 dark:text-zinc-500 font-medium italic">
                  No jobs match the selected filter configuration.
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => {
                // Find vehicle
                const vehicle = job.vehicleId ? vehiclesList.find(v => v.vin === job.vehicleId) : null;
                const vehicleLabel = vehicle
                  ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
                  : (job.vehicleId ? `VIN: ${job.vehicleId.slice(-8)}` : 'No Vehicle Assigned');

                // Tasks stats
                const jobTasks = tasksMap[job.id] || [];
                const nonGeneralTasks = jobTasks.filter(t => t.title !== 'General');
                const totalTasks = nonGeneralTasks.length;
                const completedTasks = nonGeneralTasks.filter(t => t.status === 'QC' || t.status === 'QC Complete' || t.status === 'completed').length;
                const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

                const totalBookTime = nonGeneralTasks.reduce((sum, t) => sum + (t.payBasis === 'hourly' ? 0 : (parseFloat(t.bookTime) || 0)), 0);
                const remainingBookTime = nonGeneralTasks
                  .filter(t => t.status !== 'QC' && t.status !== 'QC Complete' && t.status !== 'completed')
                  .reduce((sum, t) => sum + (t.payBasis === 'hourly' ? 0 : (parseFloat(t.bookTime) || 0)), 0);

                // Parts aggregation
                const jobParts = partsRequests.filter(p => p.jobId === job.id);
                const requestedCount = jobParts.filter(p => (p.status || '').toLowerCase() === 'pending' || (p.status || '').toLowerCase() === 'requested').length;
                const orderedCount = jobParts.filter(p => (p.status || '').toLowerCase() === 'ordered').length;
                const receivedCount = jobParts.filter(p => {
                  const s = (p.status || '').toLowerCase();
                  return s === 'received' || s === 'fulfilled' || s === 'delivered' || s === 'inventoried';
                }).length;
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
                const isReadyForQC = job.status === 'Ready for QC' || (totalTasks > 0 && completedTasks === totalTasks);
                const isReadyForCustomer = job.status === 'Ready for Customer';

                let rowHighlightClass = 'bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900/40';
                if (isBlocked) {
                  rowHighlightClass = 'bg-red-500/[0.04] dark:bg-red-500/[0.02] hover:bg-red-500/[0.08]';
                } else if (isReadyForCustomer || isReadyForQC) {
                  rowHighlightClass = 'bg-emerald-500/[0.06] dark:bg-emerald-500/[0.03] hover:bg-emerald-500/[0.1]';
                } else if (job.status === 'Active' || job.status === 'Open') {
                  rowHighlightClass = 'bg-blue-500/[0.04] dark:bg-blue-500/[0.02] hover:bg-blue-500/[0.08]';
                } else if (job.status === 'Completed' || job.status === 'Closed') {
                  rowHighlightClass = 'bg-zinc-100/50 dark:bg-zinc-900/10 hover:bg-zinc-150/50 dark:hover:bg-zinc-800/20';
                }

                const hasVin = !!(job.vehicleId || job.vehicle || (job.qbCustomFields && (job.qbCustomFields.vin || job.qbCustomFields['VIN num'])));
                const hasTasks = totalTasks > 0;
                const hasStatus = !!(job.status && job.status !== 'Open');
                const needsSetup = job.status !== 'Completed' && job.status !== 'Closed' && (!hasVin || !hasTasks || !hasStatus);

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

                      {/* 4. Job Status (Searchable / Editable Inline) */}
                      <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                        <div className={cn(
                          "w-full font-bold",
                          isBlocked ? "text-red-650 dark:text-red-455" :
                            job.status === 'Active' ? "text-emerald-650 dark:text-emerald-455" :
                              "text-zinc-650 dark:text-zinc-400"
                        )}>
                          <ExcelSearchableSelect
                            options={['Open', 'Active', 'Blocked', 'Almost Ready', 'On Hold', 'Ready for QC', 'Ready for Customer', 'Completed', 'Closed']}
                            value={job.status || 'Open'}
                            onChange={(val) => handleStatusChange(job.id, val)}
                            getLabel={(s) => s}
                            getValue={(s) => s}
                            placeholder="Choose Status..."
                            disabled={!canManage}
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
                            <span className="truncate text-xs font-black hover:text-indigo-500 cursor-pointer flex items-center gap-1" onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}>
                              {job.jobNumber ? `#${job.jobNumber} - ${job.title}` : job.title}
                              {needsSetup && (
                                <span 
                                  className="inline-flex shrink-0 cursor-help"
                                  title={`Setup Required: Missing ${[
                                    !hasVin ? 'VIN/Vehicle' : '',
                                    !hasTasks ? 'Tasks/Crew' : '',
                                    !hasStatus ? 'Workflow Status' : ''
                                  ].filter(Boolean).join(', ')}`}
                                >
                                  <AlertTriangle 
                                    className="w-3.5 h-3.5 text-amber-500 animate-pulse" 
                                  />
                                </span>
                              )}
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

                      {/* VIN (Editable Inline) */}
                      <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center">
                        <div className="flex items-center justify-center px-1">
                          <input
                            type="text"
                            placeholder="No VIN"
                            value={editingVin[job.id] !== undefined ? editingVin[job.id] : (job.vehicleId || '')}
                            onChange={(e) => setEditingVin(prev => ({ ...prev, [job.id]: e.target.value }))}
                            onBlur={() => {
                              const newVal = editingVin[job.id];
                              if (newVal !== undefined) {
                                if (newVal !== (job.vehicleId || '')) {
                                  handleVinChange(job.id, newVal);
                                }
                                setEditingVin(prev => {
                                  const copy = { ...prev };
                                  delete copy[job.id];
                                  return copy;
                                });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            disabled={!canManage}
                            className="bg-transparent hover:bg-zinc-150 focus:bg-zinc-150 dark:hover:bg-zinc-850 dark:focus:bg-zinc-850 border-none outline-none font-mono text-xs text-center font-bold px-1.5 py-0.5 rounded cursor-text w-full max-w-[140px] dark:text-white placeholder-zinc-400 dark:placeholder-zinc-650"
                          />
                        </div>
                      </td>

                      {/* CompanyCam Project ID (Editable Inline) */}
                      <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center">
                        <div className="flex items-center justify-center gap-1.5 px-1 w-full">
                          <input
                            type="text"
                            placeholder="No CompanyCam ID"
                            value={editingCcId[job.id] !== undefined ? editingCcId[job.id] : (job.companyCamId || job.companyCamProjectId || '')}
                            onChange={(e) => setEditingCcId(prev => ({ ...prev, [job.id]: e.target.value }))}
                            onBlur={() => {
                              const newVal = editingCcId[job.id];
                              if (newVal !== undefined) {
                                const currentVal = job.companyCamId || job.companyCamProjectId || '';
                                if (newVal !== currentVal) {
                                  handleCompanyCamIdChange(job.id, newVal);
                                }
                                setEditingCcId(prev => {
                                  const copy = { ...prev };
                                  delete copy[job.id];
                                  return copy;
                                });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            disabled={!canManage}
                            className="bg-transparent hover:bg-zinc-150 focus:bg-zinc-150 dark:hover:bg-zinc-850 dark:focus:bg-zinc-850 border-none outline-none font-mono text-xs text-center font-bold px-1.5 py-0.5 rounded cursor-text w-full min-w-0 max-w-[120px] dark:text-white placeholder-zinc-400 dark:placeholder-zinc-650"
                          />
                          {(job.companyCamId || job.companyCamProjectId) && (
                            <a
                              href={`https://app.companycam.com/projects/${job.companyCamId || job.companyCamProjectId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-500 rounded transition shrink-0"
                              title="Open in CompanyCam"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
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

                              const to = staff?.id 
                                ? `/business/${tenantId}/staff/${staff.id}`
                                : `/business/${tenantId}/performance?staffName=${encodeURIComponent(displayName)}`;

                              return (
                                <Link
                                  key={session.id}
                                  to={to}
                                  onClick={(e) => e.stopPropagation()}
                                  className={cn(
                                    "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black border shrink-0 leading-none hover:text-indigo-600 hover:border-indigo-500/30 transition-all",
                                    isBreak
                                      ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                      : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  )}
                                  title={`${displayName} (${session.status === 'on_break' ? 'Break' : 'Active'})`}
                                >
                                  <span className={cn("w-1.5 h-1.5 rounded-full bg-current shrink-0", !isBreak && "animate-pulse")} />
                                  <span>{displayInitials}</span>
                                </Link>
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
                            {totalBookTime > 0 && (
                              <div className="text-[10px] text-zinc-550 dark:text-zinc-400 mt-1.5 font-bold leading-none">
                                {remainingBookTime.toFixed(1)}h remaining
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 7. Parts Status */}
                      <td className={cn(
                        "p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center transition-colors",
                        requestedCount > 0 ? "bg-red-500/[0.08] dark:bg-red-950/20" :
                          orderedCount > 0 ? "bg-amber-500/[0.08] dark:bg-amber-950/20" : ""
                      )}>
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
                      <td className={cn(
                        "p-1.5 align-middle transition-colors",
                        activeBlockers.length > 0 && "bg-red-500/[0.08] dark:bg-red-950/20"
                      )}>
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
                        <td colSpan={12} className="p-4 sm:p-6">
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
                                                    options={task.canComplete === false ? ['pending', 'in_progress', 'Rework'] : ['pending', 'in_progress', 'QC', 'QC Complete', 'Rework']}
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
                                                  task.status !== 'QC Complete' && task.canComplete !== false && (
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
      {isReportModalOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 worksheet-report-modal-wrapper" onClick={() => setIsReportModalOpen(false)}>
          {/* Injectable Media Print Stylesheet */}
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: letter portrait;
                margin: 0.4in;
              }
              body > *:not(.worksheet-report-modal-wrapper) {
                display: none !important;
                height: 0 !important;
                overflow: hidden !important;
                padding: 0 !important;
                margin: 0 !important;
              }
              .no-print,
              .no-print * {
                display: none !important;
                height: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
              }
              .worksheet-report-modal-wrapper,
              .worksheet-report-modal-container,
              .worksheet-report-modal-container > div,
              .worksheet-report-modal-container > div > div {
                position: static !important;
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                height: auto !important;
                min-height: auto !important;
                max-height: none !important;
                overflow: visible !important;
                background: white !important;
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
                border-radius: 0 !important;
                float: none !important;
                flex: none !important;
                animation: none !important;
                transition: none !important;
                transform: none !important;
                opacity: 1 !important;
                visibility: visible !important;
              }
              #worksheet-report-print-area {
                width: 100% !important;
                max-width: 100% !important;
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                display: block !important;
                position: static !important;
                background: white !important;
                color: black !important;
              }
              .print-no-break {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .page-break {
                page-break-after: always !important;
                break-after: page !important;
              }
            }
          ` }} />

          <div className="w-full max-w-5xl h-[90vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 worksheet-report-modal-container" onClick={e => e.stopPropagation()}>
            {/* Modal Header (Hidden on print) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 gap-4 no-print">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Shop Worksheet Reports</h3>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Generate print-ready or emailable status checklists</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex bg-zinc-150 dark:bg-zinc-800 p-1 rounded-xl">
                <button
                  onClick={() => setReportModalTab('filtered')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    reportModalTab === 'filtered' 
                      ? "bg-white dark:bg-zinc-900 text-indigo-650 dark:text-indigo-400 shadow-sm" 
                      : "text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                  )}
                >
                  Filtered Jobs Report
                </button>
                <button
                  onClick={() => setReportModalTab('travelers')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    reportModalTab === 'travelers' 
                      ? "bg-white dark:bg-zinc-900 text-indigo-650 dark:text-indigo-400 shadow-sm" 
                      : "text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                  )}
                >
                  Job Cards (8.5x11)
                </button>
                <button
                  onClick={() => setReportModalTab('digest')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    reportModalTab === 'digest' 
                      ? "bg-white dark:bg-zinc-900 text-indigo-650 dark:text-indigo-400 shadow-sm" 
                      : "text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                  )}
                >
                  Daily Activity Digest
                </button>
              </div>

              <button 
                onClick={() => setIsReportModalOpen(false)}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Left Side: Preview Panel */}
              <div className="flex-1 overflow-y-auto p-6 bg-zinc-100 dark:bg-zinc-950/40 border-r border-zinc-200 dark:border-zinc-800 no-scrollbar">
                
                {reportModalTab === 'filtered' ? (
                  /* --- FILTERED JOBS HTML REPORT --- */
                  <div className="space-y-4">
                    <div className="flex justify-between items-center no-print">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Document Preview</span>
                      <button 
                        onClick={() => window.print()}
                        className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-bold text-zinc-700 dark:text-zinc-300 transition-all shadow-sm cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-indigo-500" />
                        Print Document
                      </button>
                    </div>

                    {/* Printable Sheet */}
                    <div 
                      id="worksheet-report-print-area" 
                      className="bg-white text-zinc-900 p-8 rounded-2xl border border-zinc-200 shadow-md font-sans mx-auto max-w-[800px] space-y-6"
                    >
                      {/* Sheet Header */}
                      <div className="border-b-2 border-indigo-900 pb-4 flex justify-between items-center">
                        <div>
                          <h1 className="text-2xl font-black uppercase tracking-tight text-indigo-950">SHOP JOBS STATUS REPORT</h1>
                          <p className="text-xs font-bold text-zinc-550 mt-1 uppercase tracking-wider">
                            {businessName} &bull; Worksheet Checklist Summary
                          </p>
                          <div className="mt-2 flex items-center gap-1.5 text-zinc-500 font-semibold text-[10px] uppercase">
                            <span>Report Date:</span>
                            <span className="font-bold text-zinc-800 font-mono">
                              {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div className="flex flex-col items-center gap-1 shrink-0">
                            <LogoQRCode 
                              value={`${window.location.origin}/business/${tenantId}/jobs_worksheet`}
                              size={60}
                              logoUrl={businessLogo}
                              businessName={businessName}
                              type="general"
                            />
                            <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none mt-1">Scan to open Worksheet</span>
                          </div>
                        </div>
                      </div>

                      {/* Filter Details */}
                      <div className="flex flex-wrap gap-2 text-[10px] font-bold text-zinc-550 border-b border-zinc-150 pb-3 no-print">
                        <span className="text-zinc-400 uppercase tracking-wider">Active Filters:</span>
                        {searchTerm && <span className="bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">Search: "{searchTerm}"</span>}
                        {selectedStatusFilter !== 'all' && <span className="bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">Status: {selectedStatusFilter}</span>}
                        {colFilters.priority !== 'all' && <span className="bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">Priority: {colFilters.priority}</span>}
                        {colFilters.location !== 'all' && <span className="bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">Location: {colFilters.location}</span>}
                        {colFilters.status !== 'all' && <span className="bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">Col Status: {colFilters.status}</span>}
                        {colFilters.parts !== 'all' && <span className="bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">Parts: {colFilters.parts}</span>}
                        {!searchTerm && selectedStatusFilter === 'all' && Object.values(colFilters).every(v => v === 'all') && (
                          <span className="text-zinc-400 italic">None - Showing All Active Jobs</span>
                        )}
                        <span className="ml-auto text-indigo-650">{filteredJobs.length} Jobs Listed</span>
                      </div>

                      {/* Jobs checklist cards list */}
                      <div className="space-y-6">
                        {filteredJobs.length === 0 ? (
                          <p className="text-sm text-zinc-500 italic text-center py-8">No jobs match the current filter configuration.</p>
                        ) : (
                          filteredJobs.map((job) => {
                            const vehicle = job.vehicleId ? vehiclesList.find(v => v.vin === job.vehicleId) : null;
                            const vehicleLabel = vehicle
                              ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
                  : (job.vehicleId ? `VIN: ${job.vehicleId.slice(-8)}` : 'No Vehicle Assigned');

                            const jobTasks = tasksMap[job.id] || [];
                            const nonGeneralTasks = jobTasks.filter(t => t.title !== 'General');
                            const totalTasks = nonGeneralTasks.length;
                            const completedTasks = nonGeneralTasks.filter(t => t.status === 'QC' || t.status === 'QC Complete' || t.status === 'completed').length;
                            const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

                            const remainingBookTime = nonGeneralTasks
                              .filter(t => t.status !== 'QC' && t.status !== 'QC Complete' && t.status !== 'completed')
                              .reduce((sum, t) => sum + (t.payBasis === 'hourly' ? 0 : (parseFloat(t.bookTime) || 0)), 0);

                            const jobParts = partsRequests
                               .filter(p => p.jobId === job.id)
                               .filter(p => (p.status as string) !== 'fulfilled' && (p.status as string) !== 'cancelled' && (p.status as string) !== 'delivered' && (p.status as string) !== 'inventoried');
                            const requestedParts = jobParts.filter(p => (p.status || '').toLowerCase() === 'pending' || (p.status || '').toLowerCase() === 'requested');
                            const orderedParts = jobParts.filter(p => (p.status || '').toLowerCase() === 'ordered');

                            const activeCrewSessions = sessions.filter(s => {
                              if (s.status === 'completed') return false;
                              return s.jobs?.some((j: any) => !j.end && j.id === job.id);
                            });

                            const activeBlockers = (job.blockers || []).filter((b: any) => b.status === 'active');
                            const incompleteTasks = nonGeneralTasks.filter(t => t.status !== 'QC' && t.status !== 'QC Complete' && t.status !== 'completed');

                            const resolvedLocationId = zonesList.find(z => z.currentJobId === job.id)?.id || job.bayId || 'none';
                            const bay = zonesList.find(z => z.id === resolvedLocationId);
                            const bayName = bay ? bay.name : (resolvedLocationId !== 'none' ? resolvedLocationId : 'None');

                            return (
                              <div key={job.id} className="p-5 border border-zinc-200 rounded-2xl bg-white shadow-sm space-y-4 print-no-break text-xs text-zinc-800">
                                {/* Card Header */}
                                <div className="flex justify-between items-start border-b border-zinc-100 pb-3">
                                  <div>
                                    <h3 className="text-sm font-bold text-zinc-950">
                                      {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title}
                                    </h3>
                                    <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">
                                      Cust: {job.customerName || 'N/A'} &bull; 🚙 {vehicleLabel}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <span className={cn(
                                      "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border",
                                      (job.priority || '').startsWith('5') ? "bg-red-50 text-red-600 border-red-200" :
                                      (job.priority || '').startsWith('4') ? "bg-amber-50 text-amber-600 border-amber-250" :
                                      "bg-zinc-50 text-zinc-650 border-zinc-200"
                                    )}>
                                      Priority: {job.priority || '3 Medium'}
                                    </span>
                                    <p className="text-[9px] text-zinc-400 mt-1 uppercase tracking-wider font-semibold">
                                      Due: {job.expectedFinishTime ? new Date(job.expectedFinishTime).toLocaleDateString() : 'Not Set'}
                                    </p>
                                  </div>
                                </div>

                                {/* Details Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-zinc-700">
                                  <div>
                                    <span className="block text-[8px] font-black text-zinc-400 uppercase tracking-widest">Status & Location</span>
                                    <span className={cn(
                                      "font-bold text-xs inline-block mt-0.5",
                                      activeBlockers.length > 0 ? "text-red-600" : job.status === 'Active' ? "text-emerald-600" : "text-zinc-700"
                                    )}>
                                      {activeBlockers.length > 0 ? 'Blocked' : job.status || 'Open'}
                                    </span>
                                    <span className="block text-[10px] text-zinc-500 mt-0.5 font-bold">Bay: {bayName}</span>
                                  </div>

                                  <div>
                                    <span className="block text-[8px] font-black text-zinc-400 uppercase tracking-widest">Active Crew</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {activeCrewSessions.length === 0 ? (
                                        <span className="text-[10px] text-zinc-400 italic">No crew logged</span>
                                      ) : (
                                        activeCrewSessions.map(s => {
                                          const staff = staffList.find(st => st.userId === s.userId || st.id === s.userId);
                                          const name = staff ? `${staff.firstName} ${staff.lastName}` : s.userName || 'Tech';
                                          const to = staff?.id 
                                            ? `/business/${tenantId}/staff/${staff.id}`
                                            : `/business/${tenantId}/performance?staffName=${encodeURIComponent(name)}`;
                                          return (
                                            <Link 
                                              key={s.id} 
                                              to={to}
                                              className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-full text-[9px] font-bold border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:text-indigo-600 hover:border-indigo-500/30 transition-all" 
                                              title={name}
                                            >
                                              {name}
                                            </Link>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <span className="block text-[8px] font-black text-zinc-400 uppercase tracking-widest">Parts Status</span>
                                    <div className="mt-1 flex items-center gap-1">
                                      {jobParts.length === 0 ? (
                                        <span className="text-[10px] text-zinc-400 italic">No parts requested</span>
                                      ) : (
                                        <span className={cn(
                                          "px-2 py-0.5 rounded text-[9px] font-bold border",
                                          requestedParts.length > 0 ? "bg-red-50 text-red-600 border-red-200" :
                                          orderedParts.length > 0 ? "bg-amber-50 text-amber-600 border-amber-250" :
                                          "bg-emerald-50 text-emerald-650 border-emerald-250"
                                        )}>
                                          {requestedParts.length > 0 ? `Waiting on ${requestedParts.length} Parts` : 
                                           orderedParts.length > 0 ? `${orderedParts.length} Parts Ordered` : 'All Parts Ready'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Progress Block */}
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-[10px] font-bold">
                                    <span className="text-indigo-650">Tasks Completed: {completedTasks} / {totalTasks}</span>
                                    <span className="font-mono text-zinc-500">{remainingBookTime.toFixed(1)}h remaining</span>
                                  </div>
                                  <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden border border-zinc-200/50">
                                    <div className="bg-indigo-600 h-full transition-all" style={{ width: `${progressPercentage}%` }} />
                                  </div>
                                </div>

                                {/* Active Blockers list */}
                                {activeBlockers.length > 0 && (
                                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
                                    <span className="text-[8px] font-black text-red-500 uppercase tracking-widest block">Active Blockers</span>
                                    {activeBlockers.map((b: any) => (
                                      <p key={b.id} className="text-[10px] text-red-700 font-bold leading-tight">
                                        &bull; {b.message} <span className="text-[9px] font-semibold text-red-500">({new Date(b.createdAt).toLocaleDateString()})</span>
                                      </p>
                                    ))}
                                  </div>
                                )}

                                {/* Checklist of Remaining Tasks */}
                                <div className="space-y-2">
                                  <h4 className="text-[9px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 pb-1">
                                    Remaining Checklist ({incompleteTasks.length})
                                  </h4>
                                  {incompleteTasks.length === 0 ? (
                                    <p className="text-[10px] text-emerald-600 italic font-semibold">All checklist tasks completed! 🏁</p>
                                  ) : (
                                    <div className="space-y-1.5 pl-1">
                                      {incompleteTasks.map(t => {
                                        const assigned = t.assignedStaff?.map((s: any) => s.name || s.displayName).join(', ') || 'Unassigned';
                                        const bTime = parseFloat(t.bookTime) || 0;
                                        return (
                                          <div key={t.id} className="flex justify-between items-center text-[10px] text-zinc-700 font-medium">
                                            <div className="flex items-center gap-2">
                                              <div className="w-3.5 h-3.5 border border-zinc-300 rounded shrink-0 flex items-center justify-center font-bold text-[8px] text-zinc-400">
                                                [ ]
                                              </div>
                                              <span>{t.title} <span className="text-zinc-400">({bTime.toFixed(1)}h)</span></span>
                                            </div>
                                            <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider">
                                              {assigned}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* Parts Checklist */}
                                {jobParts.length > 0 && (
                                  <div className="space-y-2 pt-2 border-t border-zinc-100">
                                    <h4 className="text-[9px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-150 pb-1">
                                      Parts Checklist ({jobParts.length})
                                    </h4>
                                    <div className="space-y-1.5 pl-1">
                                      {jobParts.map((p: any) => (
                                        <div key={p.id} className="flex justify-between items-center text-[10px] text-zinc-700 font-medium">
                                          <div className="flex items-center gap-2">
                                            <span className="text-zinc-400">&bull;</span>
                                            <span>{p.partName} <span className="text-zinc-450 font-bold">({p.qty || p.quantity || 1}x)</span></span>
                                          </div>
                                          <span className={cn(
                                            "px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded border leading-none",
                                            p.status === 'received' || p.status === 'fulfilled' || p.status === 'delivered' || p.status === 'inventoried' ? "bg-emerald-50 text-emerald-600 border-emerald-150" :
                                            p.status === 'ordered' ? "bg-blue-50 text-blue-600 border-blue-150" :
                                            "bg-amber-50 text-amber-600 border-amber-200"
                                          )}>
                                            {p.status || 'requested'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Active Notes Checklist */}
                                {job.work_notes && job.work_notes.length > 0 && (
                                  <div className="space-y-2 pt-2 border-t border-zinc-100">
                                    <h4 className="text-[9px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-150 pb-1">
                                      Active Notes ({job.work_notes.length})
                                    </h4>
                                    <div className="space-y-2 pl-1">
                                      {job.work_notes.map((note: any) => (
                                        <div key={note.id} className="text-[10px] text-zinc-700 leading-tight">
                                          <p className="font-medium">{note.message}</p>
                                          <p className="text-[8px] font-bold text-zinc-450 uppercase mt-0.5">
                                            Added by {note.createdBy} &bull; {new Date(note.createdAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                ) : reportModalTab === 'travelers' ? (
                  /* --- JOB TRAVELER SHEETS --- */
                  <div className="space-y-4 w-full">
                    <div className="flex justify-between items-center no-print">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Job Cards Preview ({filteredJobs.length} pages)</span>
                      <button 
                        onClick={() => window.print()}
                        className="flex items-center gap-1.5 px-3 py-1 bg-indigo-650 hover:bg-indigo-705 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer border border-indigo-600/20 animate-pulse hover:animate-none"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Print All Sheets
                      </button>
                    </div>

                    <div id="worksheet-report-print-area" className="space-y-8 bg-zinc-150 dark:bg-zinc-950 p-2 md:p-6 rounded-2xl border border-zinc-250 dark:border-zinc-800">
                      {filteredJobs.map((job, idx) => {
                        const vehicle = job.vehicleId ? vehiclesList.find(v => v.vin === job.vehicleId) : null;
                        const vehicleLabel = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}` : 'No Vehicle Assigned';
                        const vin = vehicle ? vehicle.vin : job.vehicleId || '';
                        const companyCamVal = job.companyCamId || job.companyCamProjectId || '';

                        return (
                          <div 
                            key={job.id} 
                            className={`bg-white text-zinc-900 p-8 sm:p-12 font-sans mx-auto max-w-[800px] aspect-[8.5/11] border border-zinc-200 shadow-sm flex flex-col justify-between rounded-2xl relative ${
                              idx < filteredJobs.length - 1 ? 'page-break' : ''
                            }`}
                            style={{ pageBreakAfter: 'always', breakAfter: 'page' }}
                          >
                            {/* Top border decor */}
                            <div className="border-b-4 border-indigo-900 pb-6 flex justify-between items-start">
                              <div>
                                <span className="text-[10px] font-black tracking-widest text-indigo-600 uppercase bg-indigo-50 px-2.5 py-1 rounded-md">Job Card</span>
                                <h1 className="text-3xl sm:text-4xl font-black text-indigo-950 mt-3 tracking-tight">JOB #{job.jobNumber || 'N/A'}</h1>
                                <p className="text-base sm:text-lg font-bold text-zinc-700 mt-1">{job.title || 'Untitled Job'}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-black text-zinc-405 uppercase tracking-widest">Status / Priority</p>
                                <p className="text-xs sm:text-sm font-extrabold text-zinc-900 uppercase mt-1">{job.status || 'Open'}</p>
                                <p className="text-[10px] font-bold text-zinc-505 uppercase mt-0.5">{job.priority || '3 - Medium'}</p>
                              </div>
                            </div>

                            {/* Middle Section: Big QR Code */}
                            <div className="flex flex-col items-center justify-center my-auto py-8">
                              <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm">
                                <LogoQRCode 
                                  value={`${window.location.origin}/business/${tenantId}/job/${job.id}`}
                                  size={220}
                                  logoUrl={businessLogo}
                                  businessName={businessName}
                                  type="general"
                                />
                              </div>
                              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-4">Scan QR to open workflow instantly</p>
                            </div>

                            {/* Bottom Section: Customer, CompanyCam, and Vehicle Info */}
                            <div className="border-t-2 border-zinc-200 pt-6 grid grid-cols-1 sm:grid-cols-2 gap-6 bg-zinc-55 p-6 rounded-xl text-left">
                              <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                  <h4 className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Customer Details</h4>
                                  <p className="text-sm sm:text-base font-extrabold text-zinc-900 mt-1">{job.customerName || 'No Customer Assigned'}</p>
                                </div>
                                {companyCamVal && (
                                  <div className="flex flex-col items-center shrink-0 ml-4">
                                    <div className="p-1.5 bg-white border border-zinc-200 rounded-lg shadow-sm">
                                      <LogoQRCode 
                                        value={companyCamVal.startsWith('http') ? companyCamVal : `https://app.companycam.com/projects/${companyCamVal}`}
                                        size={90}
                                        type="general"
                                      />
                                    </div>
                                    <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mt-1">CompanyCam QR</span>
                                  </div>
                                )}
                              </div>
                              <div>
                                <h4 className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Vehicle Details</h4>
                                <p className="text-sm sm:text-base font-extrabold text-zinc-900 mt-1">{vehicleLabel}</p>
                                {vin && (
                                  <p className="text-xs text-zinc-500 font-mono mt-1">VIN: <span className="font-bold text-zinc-700">{vin}</span></p>
                                )}
                              </div>
                            </div>

                            {/* Footer */}
                            <div className="border-t border-zinc-150 pt-4 flex justify-between items-center text-[9px] text-zinc-400 font-black uppercase tracking-wider mt-4">
                              <span>{businessName} &bull; UpfitterOS</span>
                              <span>Printed: {new Date().toLocaleDateString()}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* --- DAILY ACTIVITY DIGEST (Original text viewer) --- */
                  <div className="space-y-4">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Below is a progress summary showing only the shop activity and status changes that occurred today.
                    </p>
                    <textarea
                      readOnly
                      rows={15}
                      value={generateProgressReport()}
                      className="w-full p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl font-mono text-[11px] outline-none dark:text-zinc-200 leading-relaxed overflow-y-auto select-text cursor-text no-print"
                      onClick={e => (e.target as HTMLTextAreaElement).select()}
                      title="Click inside to select all text for copying"
                    />
                  </div>
                )}
              </div>

              {/* Right Side: Actions Panel (Hidden on print) */}
              <div className="w-full md:w-80 p-6 flex flex-col bg-zinc-50 dark:bg-zinc-900 border-t md:border-t-0 border-zinc-200 dark:border-zinc-800 justify-between no-print">
                <div className="space-y-5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-500/10 text-indigo-500 rounded-lg">
                      <Mail className="w-4 h-4" />
                    </div>
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Share & Dispatch Report</h4>
                  </div>

                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {reportModalTab === 'filtered' 
                      ? "Print out the visual checklist report for the shop floor, or email/copy the structured text summary of these filtered jobs."
                      : "Copy or email a text digest summarizing tasks completed, failed QC rework events, active blockers, and bay movements today."}
                  </p>

                  <div className="space-y-2">
                    {reportModalTab === 'filtered' && (
                      <button 
                        onClick={() => window.print()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-indigo-650/10 cursor-pointer"
                      >
                        <Printer className="w-4 h-4" />
                        Print Checklist Report
                      </button>
                    )}

                    <button 
                      onClick={handleEmailReportLink}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 px-4 py-3 border rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer",
                        reportModalTab === 'filtered'
                          ? "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          : "bg-indigo-650 hover:bg-indigo-700 text-white border-transparent shadow-md shadow-indigo-650/10"
                      )}
                    >
                      <Mail className="w-4 h-4 text-indigo-500" />
                      Send Email Report
                    </button>

                    <button 
                      onClick={handleCopyReportToClipboard}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
                    >
                      <Share2 className="w-4 h-4 text-indigo-500" />
                      Copy Clean Text
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-zinc-100 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-[10px] text-zinc-500 space-y-2 mt-6">
                  <p className="font-bold text-zinc-650 dark:text-zinc-350 uppercase tracking-wider">💡 Pro Printing Tip</p>
                  <p>To email the full visual checklist layout, click "Print", choose "Save as PDF" as the destination, and attach the saved PDF file to your email.</p>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
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
