import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, onSnapshot, doc, updateDoc, serverTimestamp, 
  addDoc, getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { 
  Search, Calendar, Clock, Car, RefreshCw,
  Wrench, Check, ChevronRight,
  FileText, Image as ImageIcon, Plus,
  Camera, MessageSquare, Send, Trash2,
  Eye, User, Maximize2, Minimize2, Package,
  RotateCcw, MapPin, Warehouse, CheckCircle2, X, Pencil,
  Printer
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { submitAuditLog } from '../../lib/logging/audit';
import { JobDetailsReportPrintModal } from '../../components/JobDetailsReportPrintModal';

interface OfficeJobsOverviewSheetProps {
  tenantId: string;
}

const isTaskCompleted = (t: any) => {
  if (!t) return false;
  if (t.completed === true || t.isCompleted === true) return true;
  const s = (t.status || '').toLowerCase().trim();
  return ['completed', 'complete', 'qc', 'qc complete', 'closed', 'done'].includes(s);
};

const extractVehicleString = (job: any, vehicleObj?: any): string => {
  if (typeof job?.vehicleYearMakeModel === 'string' && job.vehicleYearMakeModel.trim()) {
    return job.vehicleYearMakeModel.trim();
  }
  if (vehicleObj && (vehicleObj.year || vehicleObj.make || vehicleObj.model)) {
    return `${vehicleObj.year || ''} ${vehicleObj.make || ''} ${vehicleObj.model || ''}`.trim();
  }
  if (typeof job?.vehicle === 'string' && job.vehicle.trim()) {
    return job.vehicle.trim();
  }
  if (job?.vehicle && typeof job.vehicle === 'object') {
    const s = `${job.vehicle.year || ''} ${job.vehicle.make || ''} ${job.vehicle.model || ''}`.trim();
    if (s) return s;
  }
  if (typeof job?.vehicleName === 'string' && job.vehicleName.trim()) {
    return job.vehicleName.trim();
  }
  return 'Vehicle';
};

const extractVinString = (job: any, vehicleObj?: any): string => {
  if (typeof job?.vehicleVin === 'string' && job.vehicleVin.trim()) {
    return job.vehicleVin.trim();
  }
  if (vehicleObj && typeof vehicleObj.vin === 'string' && vehicleObj.vin.trim()) {
    return vehicleObj.vin.trim();
  }
  if (vehicleObj && typeof vehicleObj.vinNumber === 'string' && vehicleObj.vinNumber.trim()) {
    return vehicleObj.vinNumber.trim();
  }
  if (typeof job?.vin === 'string' && job.vin.trim()) {
    return job.vin.trim();
  }
  if (typeof job?.vinNumber === 'string' && job.vinNumber.trim()) {
    return job.vinNumber.trim();
  }
  if (job?.vehicle && typeof job.vehicle === 'object' && typeof job.vehicle.vin === 'string' && job.vehicle.vin.trim()) {
    return job.vehicle.vin.trim();
  }
  if (typeof job?.vehicleId === 'string' && job.vehicleId.trim()) {
    return job.vehicleId.trim();
  }
  return 'N/A';
};

const extractCustomerNameString = (job: any): string => {
  if (typeof job?.customerName === 'string' && job.customerName.trim()) {
    return job.customerName.trim();
  }
  if (typeof job?.customer === 'string' && job.customer.trim()) {
    return job.customer.trim();
  }
  if (job?.customer && typeof job.customer === 'object' && typeof job.customer.name === 'string' && job.customer.name.trim()) {
    return job.customer.name.trim();
  }
  return 'Customer';
};

const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val === 'object') {
    if (val.toDate && typeof val.toDate === 'function') return val.toDate();
    if (val.seconds !== undefined) return new Date(val.seconds * 1000);
    if (val._seconds !== undefined) return new Date(val._seconds * 1000);
    if (val.timestamp !== undefined) return parseSafeDate(val.timestamp);
    if (val.time !== undefined) return parseSafeDate(val.time);
    if (val.date !== undefined) return parseSafeDate(val.date);
    if (val.startTime !== undefined) return parseSafeDate(val.startTime);
    if (val.endTime !== undefined) return parseSafeDate(val.endTime);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

// Project work forward along working shift hours (default weekdays 8:00 AM - 4:30 PM)
function projectWorkHours(startDate: Date, hoursNeeded: number): Date {
  if (hoursNeeded <= 0) return new Date(startDate);

  let current = new Date(startDate);
  let remainingHours = hoursNeeded;

  const defaultStartHour = 8;
  const defaultEndHour = 16.5; // 4:30 PM

  let iterations = 0;
  while (remainingHours > 0 && iterations < 300) {
    iterations++;
    const dayOfWeek = current.getDay(); // 0 = Sun, 6 = Sat

    if (dayOfWeek === 0) {
      current.setDate(current.getDate() + 1);
      current.setHours(defaultStartHour, 0, 0, 0);
      continue;
    }
    if (dayOfWeek === 6) {
      current.setDate(current.getDate() + 2);
      current.setHours(defaultStartHour, 0, 0, 0);
      continue;
    }

    const currentHour = current.getHours() + current.getMinutes() / 60;

    if (currentHour < defaultStartHour) {
      current.setHours(defaultStartHour, 0, 0, 0);
      continue;
    }

    if (currentHour >= defaultEndHour) {
      current.setDate(current.getDate() + 1);
      current.setHours(defaultStartHour, 0, 0, 0);
      continue;
    }

    const availableToday = defaultEndHour - currentHour;
    if (remainingHours <= availableToday) {
      const finishHourDecimal = currentHour + remainingHours;
      const finishHour = Math.floor(finishHourDecimal);
      const finishMin = Math.round((finishHourDecimal - finishHour) * 60);
      current.setHours(finishHour, finishMin, 0, 0);
      remainingHours = 0;
      break;
    } else {
      remainingHours -= availableToday;
      current.setDate(current.getDate() + 1);
      current.setHours(defaultStartHour, 0, 0, 0);
    }
  }

  return current;
}

// Calculate available staff working hours between now and a target deadline
function calculateAvailableWorkHours(from: Date, to: Date, techCount: number): number {
  if (to <= from || techCount <= 0) return 0;

  let current = new Date(from);
  let totalShiftHours = 0;
  const defaultStartHour = 8;
  const defaultEndHour = 16.5;

  let iterations = 0;
  while (current < to && iterations < 300) {
    iterations++;
    const day = current.getDay();

    if (day === 0 || day === 6) {
      current.setDate(current.getDate() + 1);
      current.setHours(defaultStartHour, 0, 0, 0);
      continue;
    }

    const currentHour = current.getHours() + current.getMinutes() / 60;
    const sameDayAsTarget = current.toDateString() === to.toDateString();
    const endHourForDay = sameDayAsTarget ? Math.min(defaultEndHour, to.getHours() + to.getMinutes() / 60) : defaultEndHour;

    const startHourForDay = Math.max(defaultStartHour, Math.min(defaultEndHour, currentHour));

    if (endHourForDay > startHourForDay) {
      totalShiftHours += (endHourForDay - startHourForDay);
    }

    current.setDate(current.getDate() + 1);
    current.setHours(defaultStartHour, 0, 0, 0);
  }

  return totalShiftHours * techCount;
}

export function OfficeJobsOverviewSheet({ tenantId }: OfficeJobsOverviewSheetProps) {
  const navigate = useNavigate();
  const { user, isSuperAdmin, permissions, impersonatedStaff } = useAuthStore();

  // Permission Checks:
  // - canViewJobs: Required to open job details popup or navigate to job pages
  // - canManageJobs: Required to adjust deadlines, customer pickup ETAs, and triage jobs
  const canViewJobs = isSuperAdmin || Boolean(permissions['jobs.view'] || permissions['jobs.manage']);
  const canManageJobs = isSuperAdmin || Boolean(permissions['jobs.manage'] || permissions['office.view'] || permissions['jobs.qc'] || !user);

  // Core Data Collections
  const [jobs, setJobs] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [timeSessions, setTimeSessions] = useState<any[]>([]);
  const [tasksMap, setTasksMap] = useState<Record<string, any[]>>({});
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic Effective Staff Name (Robust lookup from staff list, displayName, and email)
  const currentStaffDoc = useMemo(() => {
    return staff.find(s => 
      (s.email && user?.email && s.email.toLowerCase().trim() === user.email.toLowerCase().trim()) ||
      (s.userId && user?.uid && s.userId === user.uid)
    );
  }, [staff, user]);

  const effectiveStaffName = impersonatedStaff?.name || 
    (currentStaffDoc ? (currentStaffDoc.name || `${currentStaffDoc.firstName || ''} ${currentStaffDoc.lastName || ''}`.trim()) : '') ||
    user?.displayName || 
    (user?.email?.toLowerCase().includes('losey') ? 'Patrick Losey' : 
      (user?.email?.toLowerCase().includes('paul') ? 'Paul Oeffling' : 
        (user?.email?.toLowerCase().includes('eric') ? 'Eric Schildkraut' : (user?.email?.split('@')[0] || 'Patrick Losey'))));
  const effectiveStaffId = impersonatedStaff?.id || currentStaffDoc?.id || user?.uid || 'office';

  // Periodic Clock State (for detecting 4:00 PM Front spot trigger & live ticking timers)
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const [nowTime, setNowTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      const n = new Date();
      setCurrentHour(n.getHours());
      setNowTime(n);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Search & Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyOnSite, setOnlyOnSite] = useState(true);
  const [filterTab, setFilterTab] = useState<
    'all' | 'blocked' | 'parts' | 'ready_qc' | 'ready_customer' | 'service' | 'in_bay' | 'in_yard'
  >('all');
  const sortBy = 'deadline';
  const sortAsc = true;

  // Fullscreen State & Action Processing State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPickingUpJobId, setIsPickingUpJobId] = useState<string | null>(null);
  const [isUndoingJobId, setIsUndoingJobId] = useState<string | null>(null);
  const [showWithCustomerBottomSection, setShowWithCustomerBottomSection] = useState(true);

  // Confirmation Modal State for Customer Picked Up
  const [confirmPickupJob, setConfirmPickupJob] = useState<any | null>(null);

  // V3 Location & Work Bay Relocation Modal State
  const [editingLocationJob, setEditingLocationJob] = useState<any | null>(null);
  const [zoneFilterType, setZoneFilterType] = useState<'all' | 'bays' | 'lot'>('all');
  const [zoneSearch, setZoneSearch] = useState('');
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);

  // Customer Pickup ETA Modal State
  const [editingPickupJob, setEditingPickupJob] = useState<any | null>(null);
  const [pickupDateTimeInput, setPickupDateTimeInput] = useState('');
  const [pickupNotesInput, setPickupNotesInput] = useState('');
  const [isUpdatingPickupEta, setIsUpdatingPickupEta] = useState(false);

  // Parts Requested & Blockers Inspector Modal States
  const [viewingPartsModalJob, setViewingPartsModalJob] = useState<any | null>(null);
  const [viewingBlockerModalJob, setViewingBlockerModalJob] = useState<any | null>(null);

  // 🖨️ Print Job Details Report Modal State
  const [printJobModalData, setPrintJobModalData] = useState<{
    isOpen: boolean;
    jobId: string;
    jobData?: any;
  }>({
    isOpen: false,
    jobId: ''
  });

  const handleOpenPrintJobModal = (job: any, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setPrintJobModalData({
      isOpen: true,
      jobId: job.id,
      jobData: job
    });
  };

  // Opened Job Popup Windows Map (Re-clicking focuses the window up front without losing background sheet)
  const openedWindowsRef = useRef<Record<string, Window>>({});

  const openJobInWindow = (jobId: string, e?: React.MouseEvent) => {
    if (e) {
      const target = e.target as HTMLElement;
      if (target && (target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('[data-no-row-click="true"]'))) {
        return;
      }
      e.stopPropagation();
    }
    if (!canViewJobs) {
      toast.error("Permission required: You do not have permission to view Job Details.");
      return;
    }
    const url = `/business/${tenantId}/job/${jobId}`;
    const windowName = `UpfittersOS_Job_${jobId}`;
    
    // Popup window size: smaller than 1920x1080 (e.g. 1420x880 centered)
    const screenW = window.screen.availWidth || 1920;
    const screenH = window.screen.availHeight || 1080;
    const width = Math.min(1420, Math.floor(screenW * 0.82));
    const height = Math.min(880, Math.floor(screenH * 0.85));
    const left = Math.max(20, Math.floor((screenW - width) / 2));
    const top = Math.max(20, Math.floor((screenH - height) / 2));

    const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes,toolbar=no,menubar=no,location=yes`;

    const existingWindow = openedWindowsRef.current[jobId];
    if (existingWindow && !existingWindow.closed) {
      try {
        existingWindow.focus();
      } catch (_) {
        const newWin = window.open(url, windowName, features);
        if (newWin) {
          openedWindowsRef.current[jobId] = newWin;
          newWin.focus();
        }
      }
    } else {
      const newWin = window.open(url, windowName, features);
      if (newWin) {
        openedWindowsRef.current[jobId] = newWin;
        try {
          newWin.focus();
        } catch (_) {}
      } else {
        navigate(url);
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error("Fullscreen request failed:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => {
          console.error("Exit fullscreen failed:", err);
        });
      }
    }
  };

  // Production Deadline Editing Modal State
  const [editingDeadlineJob, setEditingDeadlineJob] = useState<any | null>(null);
  const [customDeadlineDate, setCustomDeadlineDate] = useState('');
  const [customDeadlineTime, setCustomDeadlineTime] = useState('16:30');
  const [isUpdatingDeadline, setIsUpdatingDeadline] = useState(false);

  // Task Notes, Tech Notes & Photos Drawer State
  const [taskModalJob, setTaskModalJob] = useState<any | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [officeNotesInput, setOfficeNotesInput] = useState('');
  const [newTechNoteInput, setNewTechNoteInput] = useState('');
  const [photoCaptionInput, setPhotoCaptionInput] = useState('');
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Quick Add Task Form State
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskBookTime, setNewTaskBookTime] = useState('1.0');
  const [newTaskOfficeNotes, setNewTaskOfficeNotes] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const isJobCompleted = (job: any) => {
    if (!job) return false;
    if (
      job.isArchived === true || 
      job.isCompleted === true || 
      job.completed === true || 
      job.isClosed === true || 
      job.delivered === true ||
      job.isDelivered === true
    ) return true;

    const s = String(job.status || job.stage || '').toLowerCase().trim();
    return [
      'completed', 'complete', 'closed', 'delivered', 
      'picked up', 'picked_up', 'archived', 'invoiced', 
      'paid', 'done', 'cancelled', 'canceled',
      'customer delivery complete'
    ].includes(s);
  };

  // Real-time Firestore Subscriptions
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);

    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      const loadedJobs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJobs(loadedJobs);
      setLoading(false);
    });

    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), (snap) => {
      setVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubStaff = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setStaff(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubParts = onSnapshot(collection(db, `businesses/${tenantId}/parts_requests`), (snap) => {
      setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubAudit = onSnapshot(collection(db, `businesses/${tenantId}/audit_logs`), (snap) => {
      setAuditLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubSessions = onSnapshot(collection(db, `businesses/${tenantId}/time_sessions`), (snap) => {
      setTimeSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubJobs();
      unsubVehicles();
      unsubStaff();
      unsubZones();
      unsubParts();
      unsubAudit();
      unsubSessions();
    };
  }, [tenantId]);

  // Subscribe to tasks subcollections for active jobs
  useEffect(() => {
    if (!tenantId || jobs.length === 0) return;

    const unsubs: Array<() => void> = [];
    const activeJobs = jobs.filter(j => !isJobCompleted(j));

    activeJobs.forEach(job => {
      const unsub = onSnapshot(collection(db, `businesses/${tenantId}/jobs/${job.id}/tasks`), (snap) => {
        const tList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setTasksMap(prev => ({
          ...prev,
          [job.id]: tList
        }));
      });
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach(u => u());
    };
  }, [tenantId, jobs]);

  // Compute Active Job Rows with Strict Zone Matching & Dynamic Telemetry
  const enrichedRows = useMemo(() => {
    const now = new Date();

    return jobs
      .filter(j => !isJobCompleted(j))
      .map(job => {
        // Vehicle Matching & Safe String Parsing
        const vehicle = vehicles.find(v => v.id === job.vehicleId || v.vin === job.vehicleVin);
        
        const vehicleInfo = extractVehicleString(job, vehicle);
        const vinNumber = extractVinString(job, vehicle);

        let stockNumber = '';
        if (typeof job.vehicleStockNumber === 'string') stockNumber = job.vehicleStockNumber.trim();
        else if (typeof vehicle?.stockNumber === 'string') stockNumber = vehicle.stockNumber.trim();
        else if (typeof vehicle?.stockNo === 'string') stockNumber = vehicle.stockNo.trim();
        else if (typeof job.stockNumber === 'string') stockNumber = job.stockNumber.trim();

        const customerName = extractCustomerNameString(job);

        const jobTitle = typeof job.title === 'string' 
          ? job.title 
          : (typeof job.name === 'string' ? job.name : 'Upfit Job');

        const jobNumber = String(job.jobNumber || job.number || 'N/A');

        // Tasks & Book Hours
        const jobTasks = tasksMap[job.id] || (Array.isArray(job.tasks) ? job.tasks : []);
        const totalTasks = jobTasks.length;
        const completedTasks = jobTasks.filter(isTaskCompleted).length;
        const remainingTasks = Math.max(0, totalTasks - completedTasks);

        const totalBookHours = jobTasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0) || (parseFloat(job.estimatedHours) || parseFloat(job.bookedHours) || 0);
        const completedBookHours = jobTasks.filter(isTaskCompleted).reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);
        const remainingBookHours = Math.max(0, totalBookHours - completedBookHours);

        // Strict Active Zone Occupant Matching (Vehicle is on-site only if actively assigned to a physical bay/parking spot in zones)
        const matchedZone = zones.find(z => !z.isArchived && (
            (job.bayId && z.id === job.bayId) || 
            (job.zoneId && z.id === job.zoneId) || 
            (job.parkingSpot && z.name?.toLowerCase().trim() === String(job.parkingSpot).toLowerCase().trim()) || 
            (job.location && z.name?.toLowerCase().trim() === String(job.location).toLowerCase().trim())
          ))
          || zones.find(z => !z.isArchived && z.currentJobId === job.id)
          || zones.find(z => !z.isArchived && (
              (z.currentJobNumber && job.jobNumber && String(z.currentJobNumber).trim() === String(job.jobNumber).trim()) ||
              (z.currentVehicleVin && vinNumber && vinNumber !== 'N/A' && z.currentVehicleVin.toLowerCase().trim() === vinNumber.toLowerCase().trim()) ||
              (z.currentVehicleId && job.vehicleId && z.currentVehicleId === job.vehicleId) ||
              (Array.isArray(z.assignedJobIds) && z.assignedJobIds.includes(job.id))
            ));

        const isOnSite = Boolean(matchedZone || job.bayId || job.parkingSpot || (job.location && job.location !== 'Off-Site Pipeline'));
        const locationName = (matchedZone ? matchedZone.name : (job.parkingSpot || job.location || (job.bayId ? `Bay ${job.bayId}` : 'Off-Site Pipeline')));
        const isInBay = Boolean(matchedZone ? matchedZone.type === 'bay' : (locationName.toLowerCase().includes('bay') || Boolean(job.bayId)));

        // Check if vehicle is in a "Front" spot after 4:00 PM (16:00) and needs to be moved to the secure back lot
        const isFrontSpot = Boolean(locationName && locationName.toLowerCase().includes('front'));
        const isFrontSpotAfter4Pm = isFrontSpot && currentHour >= 16;

        // Assigned Staff & Live Clocked-In Techs
        const assignedStaffList: Array<{ id: string; name: string; isClockedIn: boolean }> = [];
        const assignedNames = new Set<string>();

        if (Array.isArray(job.assignedStaff)) {
          job.assignedStaff.forEach((s: any) => {
            if (s.name && !assignedNames.has(s.name)) {
              assignedNames.add(s.name);
              assignedStaffList.push({ id: s.id || '', name: s.name, isClockedIn: false });
            }
          });
        }
        if (job.assignedTechName && !assignedNames.has(job.assignedTechName)) {
          assignedNames.add(job.assignedTechName);
          assignedStaffList.push({ id: job.assignedTechId || '', name: job.assignedTechName, isClockedIn: false });
        }

        jobTasks.forEach(t => {
          if (Array.isArray(t.assignedStaff)) {
            t.assignedStaff.forEach((s: any) => {
              if (s.name && !assignedNames.has(s.name)) {
                assignedNames.add(s.name);
                assignedStaffList.push({ id: s.id || '', name: s.name, isClockedIn: false });
              }
            });
          }
        });

        // Check if ANY technician is actively clocked into this job right this second
        const liveClockedTechs: string[] = [];
        timeSessions.forEach(session => {
          // Strictly only evaluate active on-the-clock sessions (not clocked out, not completed, status === 'active')
          if (session.status === 'active' && !session.clockOut && session.jobs && Array.isArray(session.jobs)) {
            const hasActiveJobSegment = session.jobs.some((j: any) => j.id === job.id && !j.end);
            if (hasActiveJobSegment) {
              const techName = session.staffName || session.userName || 'Technician';
              liveClockedTechs.push(techName);
              const foundStaff = assignedStaffList.find(s => s.id === session.userId || s.name === techName);
              if (foundStaff) {
                foundStaff.isClockedIn = true;
              } else {
                assignedStaffList.push({ id: session.userId || '', name: techName, isClockedIn: true });
              }
            }
          }
        });

        // Dynamic ETA Calculation based on staff bandwidth & remaining book time
        const effectiveTechCount = Math.max(1, assignedStaffList.length);
        const projectedEtaDate = projectWorkHours(now, remainingBookHours / effectiveTechCount);
        const etaString = projectedEtaDate.toLocaleDateString([], { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric', 
          hour: 'numeric', 
          minute: '2-digit' 
        });

        // Production Deadline Comparison & Feasibility Engine
        const rawDeadline = job.scheduledEndDate || job.targetDeliveryDate || job.promisedDeliveryDate || job.dueDate;
        const deadlineDate = parseSafeDate(rawDeadline);
        const deadlineString = deadlineDate ? deadlineDate.toLocaleDateString([], { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric', 
          hour: 'numeric', 
          minute: '2-digit' 
        }) : 'No Deadline Set';

        // Feasibility Calculation
        let feasibilityStatus: 'feasible' | 'tight' | 'impossible' | 'no_deadline' | 'completed' = 'no_deadline';
        let feasibilityMessage = 'No Deadline';
        let bufferHours = 0;

        // Active Blockers (Tier 1 Priority)
        const blockers = Array.isArray(job.blockers) ? job.blockers.filter((b: any) => b.status !== 'resolved' && b.status !== 'cleared') : [];
        const hasBlockers = blockers.length > 0 || (job.status || '').toLowerCase().includes('blocked');

        // Requested Parts (Tier 2 Priority - Excludes parts that are delivered / with vehicle / fulfilled)
        const isPartStillPending = (p: any) => {
          if (!p) return false;
          const status = String(p.status || '').toLowerCase().trim();
          if ([
            'delivered', 'with_vehicle', 'with vehicle', 'fulfilled', 
            'installed', 'completed', 'staged', 'ready', 'received',
            'cancelled', 'canceled', 'closed', 'done'
          ].includes(status)) {
            return false;
          }
          return ['pending', 'requested', 'request', 'ordered', 'backordered', 'need_to_order', 'in_transit', 'open'].includes(status) || status === '';
        };

        const jobParts = partsRequests.filter(p => 
          (p.jobId === job.id || p.job_id === job.id) && isPartStillPending(p)
        );
        const hasPartsRequest = jobParts.length > 0;
        const partsRequestCount = jobParts.length;

        // Service vs Build Classification
        const rawJobType = (job.jobType || job.type || job.serviceType || (job.department === 'Service' ? 'service' : '') || '').toLowerCase().trim();
        const isService = rawJobType === 'service' || rawJobType === 'repair' || rawJobType === 'triage' || job.department === 'Service' || job.isService === true;
        const isWarranty = rawJobType === 'warranty' || job.isWarranty === true;
        const jobCategory: 'service' | 'warranty' | 'build' = isWarranty ? 'warranty' : (isService ? 'service' : 'build');

        // Raw Status & QC State Detection
        const statusLower = (job.status || 'in_bay').toLowerCase();
        const isReadyForCustomer = statusLower.includes('customer') || statusLower === 'ready for customer' || statusLower === 'ready for pickup' || statusLower === 'ready_for_pickup';

        // Check if all tasks are finished and whether all have passed QC
        const allTasksFinished = totalTasks > 0 && completedTasks === totalTasks;
        const allTasksQcPassed = totalTasks > 0 && jobTasks.every(t => 
          t.qcPassed === true || 
          t.isQcPassed === true || 
          (t.status || '').toLowerCase().includes('qc passed') || 
          (t.status || '').toLowerCase().includes('qc complete')
        );
        const isJobQcPassed = job.qcPassed === true || job.isQcPassed === true || statusLower.includes('qc passed') || statusLower.includes('qc complete');

        // Ready for QC: If explicitly marked QC, OR when all tasks are finished but QC is not yet passed (and not yet Ready for Customer)
        const isReadyForQc = (statusLower.includes('qc') || statusLower === 'ready for qc' || (allTasksFinished && !allTasksQcPassed && !isJobQcPassed)) && !isReadyForCustomer;

        if (completedTasks === totalTasks && totalTasks > 0) {
          feasibilityStatus = 'completed';
          feasibilityMessage = 'Tasks Finished';
        } else if (deadlineDate) {
          const availableCapacityHours = calculateAvailableWorkHours(now, deadlineDate, effectiveTechCount);
          bufferHours = availableCapacityHours - remainingBookHours;

          if (deadlineDate < now) {
            feasibilityStatus = 'impossible';
            const pastDueHours = (now.getTime() - deadlineDate.getTime()) / 3600000;
            feasibilityMessage = `⚠️ Past Due (${pastDueHours.toFixed(1)}h)`;
          } else if (remainingBookHours > availableCapacityHours) {
            feasibilityStatus = 'impossible';
            const deficit = remainingBookHours - availableCapacityHours;
            feasibilityMessage = `🔴 Can't Happen (-${deficit.toFixed(1)}h)`;
          } else if (bufferHours < 2.0) {
            feasibilityStatus = 'tight';
            feasibilityMessage = `🟡 Tight (+${bufferHours.toFixed(1)}h)`;
          } else {
            feasibilityStatus = 'feasible';
            feasibilityMessage = `🟢 Can Happen (+${bufferHours.toFixed(1)}h)`;
          }
        }

        // How long it has been ready for customer
        let readyDurationString = 'Just now';
        const readyDate = parseSafeDate(job.readyForCustomerAt || job.readyAt || job.qcCompletedAt || job.statusUpdatedAt || job.updatedAt);
        if (readyDate) {
          const diffMs = Math.max(0, now.getTime() - readyDate.getTime());
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMins / 60);
          const diffDays = Math.floor(diffHours / 24);

          if (diffDays > 0) {
            readyDurationString = `${diffDays}d ${diffHours % 24}h`;
          } else if (diffHours > 0) {
            readyDurationString = `${diffHours}h ${diffMins % 60}m`;
          } else if (diffMins > 0) {
            readyDurationString = `${diffMins}m`;
          } else {
            readyDurationString = '< 1m';
          }
        }

        // Customer Pickup ETA (Expected date & time customer arrives to pick up)
        const rawPickupEta = job.customerPickupEta || job.customerPickupEtaDate || job.scheduledPickupDate || job.pickupEta;
        const pickupEtaDate = parseSafeDate(rawPickupEta);
        const pickupEtaString = pickupEtaDate ? pickupEtaDate.toLocaleDateString([], {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }) : '';
        const customerPickupNotes = job.customerPickupNotes || '';

        // Check if vehicle needs to be moved UP FRONT for customer pickup (ONLY if already Ready for Customer, within 1 hour of pickup ETA, and NOT in a front spot)
        const isWithin1HourOfPickup = Boolean(pickupEtaDate && (pickupEtaDate.getTime() - now.getTime() <= 3600000));
        const needsMoveToFront = Boolean(isReadyForCustomer && !isFrontSpot && isWithin1HourOfPickup && isOnSite);

        // Priority Rank for strict shop floor sorting:
        // 1 = Blocked
        // 2 = Requested Parts
        // 3 = Ready for QC
        // 4 = Ready for Customer
        // 5 = The rest (sorted by target delivery deadline)
        let priorityRank = 5;
        if (hasBlockers) {
          priorityRank = 1;
        } else if (hasPartsRequest) {
          priorityRank = 2;
        } else if (isReadyForQc) {
          priorityRank = 3;
        } else if (isReadyForCustomer) {
          priorityRank = 4;
        }

        return {
          id: job.id,
          rawJob: job,
          jobNumber,
          title: jobTitle,
          customerName,
          vehicleInfo,
          vinNumber,
          stockNumber,
          locationName,
          isInBay,
          isOnSite,
          isFrontSpot,
          isFrontSpotAfter4Pm,
          jobCategory,
          isService,
          isWarranty,
          priorityRank,
          totalTasks,
          completedTasks,
          remainingTasks,
          totalBookHours,
          completedBookHours,
          remainingBookHours,
          assignedStaffList,
          liveClockedTechs,
          isLiveWorking: liveClockedTechs.length > 0,
          projectedEtaDate,
          etaString,
          rawDeadline,
          deadlineDate,
          deadlineString,
          feasibilityStatus,
          feasibilityMessage,
          bufferHours,
          hasBlockers,
          blockers,
          blockersCount: blockers.length,
          activeBlockerMessage: blockers[0]?.message || blockers[0]?.reason || blockers[0]?.notes || job.blockReason || job.blockNotes || 'Blocked by shop floor management.',
          hasPartsRequest,
          partsRequestCount,
          jobParts,
          status: job.status || 'In Bay',
          isReadyForQc,
          isReadyForCustomer,
          readyDurationString,
          pickupEtaDate,
          pickupEtaString,
          customerPickupNotes,
          needsMoveToFront
        };
      });
  }, [jobs, vehicles, staff, zones, partsRequests, timeSessions, tasksMap, currentHour]);

  // Pinned "Ready for Customer" Top Deck Rows
  const readyForCustomerRows = useMemo(() => {
    return enrichedRows.filter(r => r.isReadyForCustomer && (onlyOnSite ? r.isOnSite : true));
  }, [enrichedRows, onlyOnSite]);

  // With Customer / Delivered (Last 7 Days)
  const withCustomerRows = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const queryLower = searchQuery.toLowerCase().trim();

    return jobs
      .filter(j => {
        // Must be completed / delivered / with customer
        const completed = isJobCompleted(j) || (j.parkingSpot === 'With Customer') || (j.location === 'With Customer');
        if (!completed) return false;

        const compDate = parseSafeDate(j.pickedUpAt || j.deliveredAt || j.completedAt || j.closedAt || j.updatedAt || j.createdAt);
        if (!compDate) return false;
        return compDate >= sevenDaysAgo;
      })
      .map(job => {
        const compDate = parseSafeDate(job.pickedUpAt || job.deliveredAt || job.completedAt || job.closedAt || job.updatedAt || job.createdAt);
        const matchingVehicle = vehicles.find(v => v.id === job.vehicleId || (v.vin && job.vin && v.vin.toLowerCase().trim() === job.vin.toLowerCase().trim()));
        const vehicleInfo = extractVehicleString(job, matchingVehicle);
        const vinNumber = extractVinString(job, matchingVehicle);
        const customerName = extractCustomerNameString(job);
        const jobNumber = String(job.jobNumber || job.number || job.id?.slice(0, 6) || 'N/A');
        const previousParkingSpot = typeof job.previousParkingSpot === 'string' && job.previousParkingSpot.trim()
          ? job.previousParkingSpot.trim()
          : (typeof job.location === 'string' && job.location.trim() ? job.location.trim() : (typeof job.parkingSpot === 'string' && job.parkingSpot.trim() ? job.parkingSpot.trim() : 'Front 1'));

        const rawActor = job.pickedUpBy || job.markedWithCustomerBy || job.deliveredBy || job.completedBy;
        let markedBy = '';
        if (rawActor && typeof rawActor === 'string' && rawActor.trim() && !['staff', 'office', 'office staff', 'system', 'unknown', 'null', 'undefined'].includes(rawActor.toLowerCase().trim())) {
          const matchStaff = staff.find(s => {
            if (!s) return false;
            if (s.id && s.id === rawActor) return true;
            if (s.userId && s.userId === rawActor) return true;
            if (s.email && s.email.toLowerCase() === rawActor.toLowerCase()) return true;
            if (s.name && s.name.toLowerCase() === rawActor.toLowerCase()) return true;
            const fullName = `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase();
            return Boolean(fullName && fullName === rawActor.toLowerCase());
          });
          if (matchStaff) {
            markedBy = (matchStaff.firstName || matchStaff.lastName)
              ? `${matchStaff.firstName || ''} ${matchStaff.lastName || ''}`.trim()
              : (matchStaff.name || rawActor);
          } else {
            markedBy = rawActor;
          }
        }

        // If not stored directly on job doc, check real audit logs for this exact job
        if (!markedBy) {
          const jobAudit = auditLogs.find(a => 
            (a.targetEntityId === job.id || a.details?.jobId === job.id || (job.jobNumber && a.details?.jobNumber === job.jobNumber)) &&
            (a.details?.action === 'CUSTOMER_PICKED_UP' || a.details?.action === 'CUSTOMER_PICKUP_ETA_UPDATED' || a.details?.action === 'JOB_STATUS_CHANGED')
          );
          if (jobAudit?.details?.staffName && typeof jobAudit.details.staffName === 'string' && jobAudit.details.staffName.trim()) {
            markedBy = jobAudit.details.staffName.trim();
          }
        }

        // If still not found, check staff ID references
        if (!markedBy && (job.pickedUpById || job.completedById)) {
          const targetId = job.pickedUpById || job.completedById;
          const matchStaff = staff.find(s => (s.id && s.id === targetId) || (s.userId && s.userId === targetId));
          if (matchStaff) {
            markedBy = (matchStaff.firstName || matchStaff.lastName)
              ? `${matchStaff.firstName || ''} ${matchStaff.lastName || ''}`.trim()
              : (matchStaff.name || '');
          }
        }

        let deliveredTimeStr = 'Recently';
        if (compDate) {
          const diffMs = now.getTime() - compDate.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          if (diffHours < 1) {
            deliveredTimeStr = `${Math.max(1, Math.round(diffMs / (1000 * 60)))}m ago`;
          } else if (diffHours < 24) {
            deliveredTimeStr = `${Math.round(diffHours)}h ago`;
          } else {
            const diffDays = Math.floor(diffHours / 24);
            deliveredTimeStr = `${diffDays}d ago (${compDate.toLocaleDateString([], { month: 'numeric', day: 'numeric' })})`;
          }
        }

        return {
          id: job.id,
          jobNumber,
          customerName,
          vehicleInfo,
          vinNumber,
          completedAt: compDate,
          deliveredTimeStr,
          markedBy,
          previousStatus: typeof job.previousStatus === 'string' ? job.previousStatus : 'Ready for Customer',
          previousParkingSpot,
          rawJob: job
        };
      })
      .filter(row => {
        if (!queryLower) return true;
        const searchable = `${row.jobNumber} ${row.customerName} ${row.vehicleInfo} ${row.vinNumber}`.toLowerCase();
        return searchable.includes(queryLower);
      })
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));
  }, [jobs, vehicles, staff, auditLogs, searchQuery]);

  // Filtered & Searched Rows (for Main Lower Table)
  const filteredRows = useMemo(() => {
    const queryLower = searchQuery.toLowerCase().trim();

    return enrichedRows.filter(row => {
      // If onlyOnSite is enabled, only show vehicles physically in a bay or parking area
      if (onlyOnSite && !row.isOnSite) return false;

      // When viewing 'all', exclude ready_for_customer from bottom table since it is prominently pinned in the top deck!
      if (filterTab === 'all' && row.isReadyForCustomer) return false;

      // Tab Category Filters (activated when clicking KPI cards)
      if (filterTab === 'blocked' && !row.hasBlockers) return false;
      if (filterTab === 'parts' && !row.hasPartsRequest) return false;
      if (filterTab === 'ready_qc' && !row.isReadyForQc) return false;
      if (filterTab === 'ready_customer' && !row.isReadyForCustomer) return false;
      if (filterTab === 'service' && !row.isService && !row.isWarranty) return false;
      if (filterTab === 'in_bay' && !row.isInBay) return false;
      if (filterTab === 'in_yard' && (!row.isOnSite || row.isInBay)) return false;

      // Global Search matching
      if (!queryLower) return true;

      const searchableString = [
        row.jobNumber,
        row.title,
        row.customerName,
        row.vehicleInfo,
        row.vinNumber,
        row.stockNumber,
        row.locationName,
        row.status,
        row.jobCategory,
        row.feasibilityMessage,
        row.pickupEtaString,
        row.customerPickupNotes,
        ...row.assignedStaffList.map(s => s.name),
        ...row.liveClockedTechs,
        ...(tasksMap[row.id] || []).map(t => t.title || t.name)
      ].join(' ').toLowerCase();

      return searchableString.includes(queryLower);
    }).sort((a, b) => {
      // Pin Ready for QC to the top rows above deadline ones
      if (a.isReadyForQc !== b.isReadyForQc) {
        return a.isReadyForQc ? -1 : 1;
      }

      if (sortBy === 'deadline') {
        const aTime = a.deadlineDate ? a.deadlineDate.getTime() : 9999999999999;
        const bTime = b.deadlineDate ? b.deadlineDate.getTime() : 9999999999999;
        return sortAsc ? aTime - bTime : bTime - aTime;
      }
      if (sortBy === 'priority') {
        if (a.priorityRank !== b.priorityRank) {
          return a.priorityRank - b.priorityRank;
        }
        const aTime = a.deadlineDate?.getTime() || 9999999999999;
        const bTime = b.deadlineDate?.getTime() || 9999999999999;
        return aTime - bTime;
      }
      if (sortBy === 'eta') {
        return sortAsc 
          ? a.projectedEtaDate.getTime() - b.projectedEtaDate.getTime()
          : b.projectedEtaDate.getTime() - a.projectedEtaDate.getTime();
      }
      if (sortBy === 'progress') {
        const aPct = a.totalTasks > 0 ? a.completedTasks / a.totalTasks : 0;
        const bPct = b.totalTasks > 0 ? b.completedTasks / b.totalTasks : 0;
        return sortAsc ? aPct - bPct : bPct - aPct;
      }
      if (sortBy === 'jobNumber') {
        return sortAsc ? a.jobNumber.localeCompare(b.jobNumber) : b.jobNumber.localeCompare(a.jobNumber);
      }
      return 0;
    });
  }, [enrichedRows, onlyOnSite, filterTab, searchQuery, sortBy, sortAsc, tasksMap]);

  // KPI Summary Metric Counters
  const kpis = useMemo(() => {
    const onSiteRows = enrichedRows.filter(r => r.isOnSite);
    const scopeRows = onlyOnSite ? onSiteRows : enrichedRows;

    return {
      totalVisible: scopeRows.length,
      totalOnSite: onSiteRows.length,
      blocked: onSiteRows.filter(r => r.hasBlockers).length,
      partsCount: onSiteRows.filter(r => r.hasPartsRequest).length,
      readyQc: onSiteRows.filter(r => r.isReadyForQc).length,
      readyCustomer: onSiteRows.filter(r => r.isReadyForCustomer).length,
      serviceCount: onSiteRows.filter(r => r.isService || r.isWarranty).length,
      inBay: onSiteRows.filter(r => r.isInBay).length,
      inYard: onSiteRows.filter(r => !r.isInBay).length,
      liveClockedCount: onSiteRows.filter(r => r.isLiveWorking).length,
      impossibleCount: onSiteRows.filter(r => r.feasibilityStatus === 'impossible').length,
      withCustomerCount: withCustomerRows.length,
      totalPipeline: enrichedRows.length
    };
  }, [enrichedRows, onlyOnSite, withCustomerRows]);

function formatElapsedDuration(startDate: Date | null, targetDate: Date = new Date()): string {
  if (!startDate) return '';
  const diffMs = Math.max(0, targetDate.getTime() - startDate.getTime());
  const totalMins = Math.floor(diffMs / 60000);
  if (totalMins < 1) return '< 1m';
  if (totalMins < 60) return `${totalMins}m`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Live Floor Staff Telemetry (Working on Task, On Break/Lunch, Floor Available, Clocked Out for Day)
  const staffFloorStatusList = useMemo(() => {
    const today = new Date();
    const isToday = (d: Date | null) => {
      if (!d) return false;
      return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    };

    // Helper to resolve staff doc strictly without false-matching undefined values
    const resolveStaffDoc = (session: any) => {
      const sUserId = session.userId || session.uid;
      const sEmail = (session.userEmail || session.email || '').toLowerCase().trim();
      const sName = (session.staffName || session.userName || '').toLowerCase().trim();

      return staff.find(st => {
        if (sUserId && (st.id === sUserId || (st.userId && st.userId === sUserId) || (st.uid && st.uid === sUserId))) return true;
        if (sEmail && st.email && st.email.toLowerCase().trim() === sEmail) return true;
        if (sName) {
          const stFullName = `${st.firstName || ''} ${st.lastName || ''}`.trim().toLowerCase();
          if (st.name && st.name.toLowerCase().trim() === sName) return true;
          if (stFullName && stFullName === sName) return true;
        }
        return false;
      });
    };

    // Group sessions by unique staff key for today
    const activeSessionsByStaff: Record<string, { session: any; staffDoc: any; staffName: string }> = {};
    const latestEndedSessionsByStaff: Record<string, { session: any; staffDoc: any; staffName: string }> = {};

    timeSessions.forEach(session => {
      const clockInDate = parseSafeDate(session.clockIn || session.startTime || session.createdAt);
      const clockOutDate = parseSafeDate(session.clockOut || session.endTime || session.closedAt);
      
      const isTodaySession = isToday(clockInDate) || isToday(clockOutDate) || isToday(parseSafeDate(session.createdAt));
      if (!isTodaySession) return;

      const isClockedOut = Boolean(clockOutDate || session.status === 'completed' || session.status === 'closed' || session.status === 'clocked_out');
      const isClockedIn = Boolean(clockInDate) && !isClockedOut && (session.status === 'active' || session.status === 'on_break' || !session.status);

      const staffDoc = resolveStaffDoc(session);
      const staffName = (staffDoc?.firstName || staffDoc?.lastName)
        ? `${staffDoc.firstName || ''} ${staffDoc.lastName || ''}`.trim()
        : (staffDoc?.name || session.staffName || session.userName || 'Staff Member');

      const staffKey = staffDoc?.id || session.userId || session.userEmail || staffName.toLowerCase().trim();
      if (!staffKey) return;

      if (isClockedIn) {
        activeSessionsByStaff[staffKey] = { session, staffDoc, staffName };
      } else if (isClockedOut) {
        const thisEnd = clockOutDate ? clockOutDate.getTime() : (clockInDate ? clockInDate.getTime() : 0);
        const prev = latestEndedSessionsByStaff[staffKey];
        const prevClockOut = prev ? parseSafeDate(prev.session.clockOut || prev.session.endTime || prev.session.closedAt) : null;
        const prevEnd = prevClockOut ? prevClockOut.getTime() : 0;
        if (thisEnd >= prevEnd) {
          latestEndedSessionsByStaff[staffKey] = { session, staffDoc, staffName };
        }
      }
    });

    const renderedKeys = new Set<string>();
    const list: any[] = [];

    // 1. Currently Clocked-In Staff (Working on Task, On Break, or Clocked In)
    Object.entries(activeSessionsByStaff).forEach(([key, { session, staffName }]) => {
      renderedKeys.add(key);

      const breaks = Array.isArray(session.breaks) ? session.breaks : [];
      const activeBreak = breaks.find((b: any) => !b.end);
      const isOnBreak = Boolean(activeBreak);
      const breakType = activeBreak?.type === 'lunch' ? 'Lunch' : 'Break';

      const sessionJobs = Array.isArray(session.jobs) ? session.jobs : [];
      const activeJobSegment = sessionJobs.find((j: any) => !j.end);

      let currentJob: any = null;
      let currentTask: any = null;

      if (activeJobSegment) {
        currentJob = jobs.find(j => j.id === activeJobSegment.id || j.id === activeJobSegment.jobId || j.jobNumber === activeJobSegment.jobNumber);
        if (activeJobSegment.taskId && currentJob) {
          const jobTasks = tasksMap[currentJob.id] || currentJob.tasks || [];
          currentTask = jobTasks.find((t: any) => t.id === activeJobSegment.taskId);
        }
      }

      if (!currentJob && session.activeJobId) {
        currentJob = jobs.find(j => j.id === session.activeJobId);
      }

      const jobNumber = currentJob ? (currentJob.jobNumber || currentJob.number || 'N/A') : (activeJobSegment?.jobNumber || null);
      const customerName = currentJob ? (currentJob.customerName || currentJob.customer || '') : (activeJobSegment?.customerName || '');
      const taskTitle = currentTask ? (currentTask.name || currentTask.title || '') : (activeJobSegment?.taskTitle || activeJobSegment?.taskName || null);
      const bayOrSpot = currentJob?.bayId || currentJob?.parkingSpot || currentJob?.location || null;

      const clockInDate = parseSafeDate(session.clockIn?.timestamp || session.clockIn?.time || session.clockIn || session.startTime);
      const clockInTimeStr = clockInDate ? clockInDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

      // Durations:
      let durationStr = '';
      if (isOnBreak) {
        const breakStartDate = parseSafeDate(activeBreak?.start || activeBreak?.startTime);
        durationStr = formatElapsedDuration(breakStartDate, nowTime);
      } else if (jobNumber) {
        const taskStartDate = parseSafeDate(activeJobSegment?.start || activeJobSegment?.startTime || clockInDate);
        durationStr = formatElapsedDuration(taskStartDate, nowTime);
      } else {
        durationStr = formatElapsedDuration(clockInDate, nowTime);
      }

      list.push({
        status: isOnBreak ? 'break' : jobNumber ? 'working' : 'floor',
        staffName,
        isOnBreak,
        breakType,
        jobNumber,
        customerName,
        taskTitle,
        bayOrSpot,
        clockInTimeStr,
        durationStr,
        clockOutTimeStr: null,
        sessionId: session.id,
        userId: session.userId || key
      });
    });

    // 2. Staff Who Clocked Out for the Day Today
    Object.entries(latestEndedSessionsByStaff).forEach(([key, { session, staffName }]) => {
      if (renderedKeys.has(key)) return;
      renderedKeys.add(key);

      const clockInDate = parseSafeDate(session.clockIn?.timestamp || session.clockIn?.time || session.clockIn || session.startTime);
      const clockOutDate = parseSafeDate(session.clockOut?.timestamp || session.clockOut?.time || session.clockOut || session.endTime);
      const clockOutTimeStr = clockOutDate ? clockOutDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Out';
      const durationStr = (clockInDate && clockOutDate) ? formatElapsedDuration(clockInDate, clockOutDate) : '';

      list.push({
        status: 'out',
        staffName,
        isOnBreak: false,
        breakType: null,
        jobNumber: null,
        customerName: null,
        taskTitle: null,
        bayOrSpot: null,
        clockInTimeStr: null,
        clockOutTimeStr,
        durationStr,
        sessionId: session.id,
        userId: session.userId || key
      });
    });

    return list.sort((a, b) => {
      const order: Record<string, number> = { working: 1, break: 2, floor: 3, out: 4 };
      if (order[a.status] !== order[b.status]) {
        return order[a.status] - order[b.status];
      }
      return a.staffName.localeCompare(b.staffName);
    });
  }, [timeSessions, staff, jobs, tasksMap, nowTime]);

  // Enriched Zones for V3 Location Editor Modal (Live occupancy & work bay mapping)
  const enrichedZones = useMemo(() => {
    return zones.map(z => {
      const isCurrentJobAssigned = editingLocationJob && (
        editingLocationJob.rawJob?.zoneId === z.id ||
        (editingLocationJob.locationName && (
          z.name?.toLowerCase().trim() === editingLocationJob.locationName.toLowerCase().trim() ||
          z.code?.toLowerCase().trim() === editingLocationJob.locationName.toLowerCase().trim()
        ))
      );

      // Check if zone is occupied by another active job
      const occupiedByJob = jobs.find(j => 
        !isJobCompleted(j) &&
        j.id !== editingLocationJob?.id && (
          j.zoneId === z.id ||
          (j.parkingSpot && (j.parkingSpot.toLowerCase().trim() === z.name?.toLowerCase().trim() || j.parkingSpot.toLowerCase().trim() === z.code?.toLowerCase().trim())) ||
          (j.location && (j.location.toLowerCase().trim() === z.name?.toLowerCase().trim() || j.location.toLowerCase().trim() === z.code?.toLowerCase().trim()))
        )
      );

      let occupantDetails: any = null;
      if (occupiedByJob) {
        occupantDetails = {
          jobNumber: occupiedByJob.jobNumber || occupiedByJob.number,
          customerName: occupiedByJob.customerName || occupiedByJob.customer,
          vehicle: occupiedByJob.vehicleYearMakeModel || occupiedByJob.vehicle
        };
      }

      const isBay = Boolean(
        z.isBay === true ||
        (z.category && z.category.toLowerCase().includes('bay')) ||
        (z.type && z.type.toLowerCase().includes('bay')) ||
        (z.name && z.name.toLowerCase().startsWith('bay'))
      );

      const isOccupied = isCurrentJobAssigned ? false : Boolean(occupiedByJob || z.isOccupied === true);

      return {
        ...z,
        isBay,
        isOccupied,
        isCurrentJobAssigned,
        occupantDetails
      };
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [zones, jobs, editingLocationJob]);

  // V3 Location Relocation Handler
  const handleUpdateLocation = async (chosenSpot: string) => {
    if (!tenantId || !editingLocationJob) return;
    setIsUpdatingLocation(true);
    try {
      const spotName = chosenSpot.trim();
      const oldSpot = editingLocationJob.locationName || 'Unassigned';

      // 1. Identify Target Zone
      const targetZone = enrichedZones.find(z => 
        z.name?.toLowerCase().trim() === spotName.toLowerCase().trim() ||
        z.code?.toLowerCase().trim() === spotName.toLowerCase().trim()
      );

      const isInBay = Boolean(
        targetZone?.isBay ||
        spotName.toLowerCase().startsWith('bay')
      );

      const jobRef = doc(db, `businesses/${tenantId}/jobs`, editingLocationJob.id);
      await updateDoc(jobRef, {
        parkingSpot: spotName || null,
        location: spotName || null,
        bayId: isInBay ? (targetZone?.id || spotName) : null,
        zoneId: targetZone?.id || null,
        updatedAt: serverTimestamp(),
        updatedBy: effectiveStaffName,
        updatedById: effectiveStaffId
      });

      // 2. Update Vehicle record if present
      const vehicleId = editingLocationJob.rawJob?.vehicleId || vehicles.find(v => v.vin && editingLocationJob.vinNumber && editingLocationJob.vinNumber !== 'N/A' && v.vin.toLowerCase().trim() === editingLocationJob.vinNumber.toLowerCase().trim())?.id;
      if (vehicleId) {
        const vehicleRef = doc(db, `businesses/${tenantId}/vehicles`, vehicleId);
        await updateDoc(vehicleRef, {
          parkingSpot: spotName || null,
          location: spotName || null,
          bayId: isInBay ? (targetZone?.id || spotName) : null,
          zoneId: targetZone?.id || null,
          status: spotName === 'With Customer' ? 'delivered' : 'on_site',
          isWithCustomer: spotName === 'With Customer',
          updatedAt: serverTimestamp()
        }).catch(err => console.warn("Vehicle update warn:", err));
      }

      // 3. Clear Old Zone Occupancy
      const previousAssignedZones = zones.filter(z => 
        z.currentJobId === editingLocationJob.id && (!targetZone || z.id !== targetZone.id)
      );
      for (const pz of previousAssignedZones) {
        const pzRef = doc(db, `businesses/${tenantId}/zones`, pz.id);
        await updateDoc(pzRef, {
          currentJobId: null,
          currentJobNumber: null,
          currentVehicleId: null,
          currentVehicleVin: null,
          isOccupied: false,
          updatedAt: serverTimestamp()
        }).catch(err => console.warn(`Clear zone ${pz.id} err:`, err));
      }

      // 4. Mark New Zone as Occupied
      if (targetZone) {
        const tzRef = doc(db, `businesses/${tenantId}/zones`, targetZone.id);
        await updateDoc(tzRef, {
          currentJobId: editingLocationJob.id,
          currentJobNumber: editingLocationJob.jobNumber,
          currentVehicleId: vehicleId || null,
          currentVehicleVin: editingLocationJob.vinNumber !== 'N/A' ? editingLocationJob.vinNumber : null,
          isOccupied: true,
          updatedAt: serverTimestamp()
        }).catch(err => console.warn(`Occupancy zone ${targetZone.id} err:`, err));
      }

      // 5. Submit Audit Log
      submitAuditLog(tenantId, {
        userId: user?.uid || 'office',
        actionType: 'DATA_MUTATION',
        targetEntityId: editingLocationJob.id,
        details: {
          action: 'VEHICLE_LOCATION_CHANGED',
          jobId: editingLocationJob.id,
          jobNumber: editingLocationJob.jobNumber,
          customerName: editingLocationJob.customerName,
          previousLocation: oldSpot,
          newLocation: spotName || 'Unassigned',
          staffName: effectiveStaffName
        }
      });

      // 6. Write to Activity Feed for Daily Operations Log Feed
      await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
        type: 'location_changed',
        action: 'VEHICLE_LOCATION_CHANGED',
        title: 'Vehicle Relocated',
        message: `Relocated vehicle to ${spotName || 'Unassigned'} (from ${oldSpot})`,
        author: effectiveStaffName,
        staffName: effectiveStaffName,
        staffId: effectiveStaffId,
        metadata: {
          jobId: editingLocationJob.id,
          jobNumber: editingLocationJob.jobNumber,
          customerName: editingLocationJob.customerName,
          vehicle: editingLocationJob.vehicleInfo,
          previousZone: oldSpot,
          newZone: spotName || 'Unassigned'
        },
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString()
      }).catch(err => console.warn("Activity feed add err:", err));

      toast.success(`Vehicle relocated to ${spotName || 'Unassigned'}!`);
      setEditingLocationJob(null);
    } catch (err: any) {
      console.error("Relocation error:", err);
      toast.error("Failed to relocate vehicle: " + (err.message || 'Unknown error'));
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  // Open Confirmation Modal for Customer Picked Up
  const handleCustomerPickedUp = (row: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!row) return;

    if (!canManageJobs) {
      toast.error("Permission required to mark job as Customer Picked Up");
      return;
    }

    setConfirmPickupJob(row);
  };

  // Execute Confirmed Customer Picked Up
  const executeCustomerPickedUp = async () => {
    if (!tenantId || !confirmPickupJob) return;
    const row = confirmPickupJob;

    setIsPickingUpJobId(row.id);
    try {
      const nowIso = new Date().toISOString();
      const currentSpot = row.locationName || row.parkingSpot || row.rawJob?.parkingSpot || row.rawJob?.location || row.previousParkingSpot || 'Front 1';
      const currentStatus = row.status || row.rawJob?.status || 'Ready for Customer';
      const currentZoneId = row.rawJob?.zoneId || row.zoneId || null;
      const currentBayId = row.rawJob?.bayId || row.bayId || null;

      // 1. Update Job Document: Mark as Completed & Clear Bay / Spot Assignments
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, row.id);
      await updateDoc(jobRef, {
        status: 'Completed',
        stage: 'Completed',
        isCompleted: true,
        completed: true,
        delivered: true,
        isDelivered: true,
        pickedUpAt: nowIso,
        deliveredAt: nowIso,
        completedAt: nowIso,
        pickedUpBy: effectiveStaffName,
        pickedUpById: effectiveStaffId,
        markedWithCustomerBy: effectiveStaffName,
        deliveredBy: effectiveStaffName,
        completedBy: effectiveStaffName,
        bayId: null,
        zoneId: null,
        parkingSpot: null,
        parkingKeyNumber: null,
        parkingKey: null,
        location: null,
        previousStatus: currentStatus,
        previousParkingSpot: currentSpot,
        previousZoneId: currentZoneId,
        previousBayId: currentBayId,
        updatedAt: serverTimestamp()
      });

      // 2. Clear Any Assigned Zone in Firestore
      const assignedZones = zones.filter(z => 
        z.currentJobId === row.id || 
        (z.currentVehicleVin && row.vinNumber && row.vinNumber !== 'N/A' && z.currentVehicleVin.toLowerCase().trim() === row.vinNumber.toLowerCase().trim()) ||
        (z.currentVehicleId && row.rawJob?.vehicleId && z.currentVehicleId === row.rawJob?.vehicleId)
      );

      for (const z of assignedZones) {
        const zoneRef = doc(db, `businesses/${tenantId}/zones`, z.id);
        await updateDoc(zoneRef, {
          currentJobId: null,
          currentJobNumber: null,
          currentVehicleId: null,
          currentVehicleVin: null,
          isOccupied: false,
          updatedAt: serverTimestamp()
        }).catch(err => console.warn(`Could not clear zone ${z.id}:`, err));
      }

      // 3. Clear Vehicle Record Location if present
      if (row.rawJob?.vehicleId) {
        const vehicleRef = doc(db, `businesses/${tenantId}/vehicles`, row.rawJob.vehicleId);
        await updateDoc(vehicleRef, {
          parkingSpot: null,
          bayId: null,
          zoneId: null,
          currentJobId: null,
          status: 'delivered',
          isWithCustomer: true,
          updatedAt: serverTimestamp()
        }).catch(err => console.warn(`Could not clear vehicle ${row.rawJob.vehicleId}:`, err));
      }

      // 4. Audit Log
      submitAuditLog(tenantId, {
        userId: user?.uid || 'office',
        actionType: 'DATA_MUTATION',
        targetEntityId: row.id,
        details: {
          action: 'CUSTOMER_PICKED_UP',
          jobId: row.id,
          jobNumber: row.jobNumber,
          customerName: row.customerName,
          staffName: effectiveStaffName,
          clearedLocation: currentSpot
        }
      });

      toast.success(
        `Job #${row.jobNumber} marked as Customer Picked Up! (You can undo this anytime at the bottom of the page)`,
        { duration: 6000 }
      );
      setConfirmPickupJob(null);
    } catch (err: any) {
      console.error("Error marking job as picked up:", err);
      toast.error("Failed to complete pickup action: " + (err.message || 'Unknown error'));
    } finally {
      setIsPickingUpJobId(null);
    }
  };

  // 1-Click Undo "Mark as With Customer": Reopens Job & Restores to Exact Previous Parking Spot / Ready for Customer
  const handleUndoWithCustomer = async (row: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tenantId || !row) return;

    if (!canManageJobs) {
      toast.error("Permission required to undo With Customer status");
      return;
    }

    setIsUndoingJobId(row.id);
    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, row.id);
      const targetStatus = row.previousStatus || row.rawJob?.previousStatus || 'Ready for Customer';
      const targetSpot = row.previousParkingSpot || row.rawJob?.previousParkingSpot || 'Front 1';
      const targetZoneId = row.rawJob?.previousZoneId || null;
      const targetBayId = row.rawJob?.previousBayId || (targetSpot.toLowerCase().startsWith('bay') ? targetSpot : null);

      await updateDoc(jobRef, {
        status: targetStatus,
        stage: targetStatus,
        isCompleted: false,
        completed: false,
        delivered: false,
        isDelivered: false,
        isArchived: false,
        isClosed: false,
        pickedUpAt: null,
        deliveredAt: null,
        completedAt: null,
        parkingSpot: targetSpot,
        location: targetSpot,
        zoneId: targetZoneId,
        bayId: targetBayId,
        updatedAt: serverTimestamp()
      });

      // Restore vehicle status if present
      const vehicleId = row.rawJob?.vehicleId || vehicles.find(v => (v.vin && row.vinNumber && row.vinNumber !== 'N/A' && v.vin.toLowerCase().trim() === row.vinNumber.toLowerCase().trim()) || v.id === row.rawJob?.vehicleId)?.id;
      if (vehicleId) {
        const vehicleRef = doc(db, `businesses/${tenantId}/vehicles`, vehicleId);
        await updateDoc(vehicleRef, {
          parkingSpot: targetSpot,
          location: targetSpot,
          status: 'on_site',
          isWithCustomer: false,
          zoneId: targetZoneId,
          bayId: targetBayId,
          updatedAt: serverTimestamp()
        }).catch(err => console.warn(`Could not update vehicle ${vehicleId}:`, err));
      }

      // Re-occupy matching zone in zones collection
      const matchingZone = zones.find(z => 
        (targetZoneId && z.id === targetZoneId) ||
        (z.name && z.name.toLowerCase().trim() === targetSpot.toLowerCase().trim()) ||
        (z.code && z.code.toLowerCase().trim() === targetSpot.toLowerCase().trim()) ||
        (z.label && z.label.toLowerCase().trim() === targetSpot.toLowerCase().trim())
      );

      if (matchingZone) {
        const zoneRef = doc(db, `businesses/${tenantId}/zones`, matchingZone.id);
        await updateDoc(zoneRef, {
          currentJobId: row.id,
          currentJobNumber: row.jobNumber,
          currentVehicleId: vehicleId || null,
          currentVehicleVin: row.vinNumber !== 'N/A' ? row.vinNumber : null,
          isOccupied: true,
          updatedAt: serverTimestamp()
        }).catch(err => console.warn(`Could not reoccupy zone ${matchingZone.id}:`, err));
      }

      // Submit audit log
      submitAuditLog(tenantId, {
        userId: user?.uid || 'office',
        actionType: 'DATA_MUTATION',
        targetEntityId: row.id,
        details: {
          action: 'JOB_REOPENED_FROM_CUSTOMER',
          jobId: row.id,
          jobNumber: row.jobNumber,
          restoredStatus: targetStatus,
          restoredSpot: targetSpot,
          staffName: effectiveStaffName
        }
      });

      toast.success(`Job #${row.jobNumber} returned to "${targetStatus}" at spot ${targetSpot}!`);
    } catch (err: any) {
      console.error("Error undoing with customer status:", err);
      toast.error("Failed to undo With Customer status: " + (err.message || 'Unknown error'));
    } finally {
      setIsUndoingJobId(null);
    }
  };

  // Open & Save Customer Pickup ETA Modal
  const handleOpenPickupEtaModal = (row: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canManageJobs) {
      toast.error("Permission required to adjust Customer Pickup ETA");
      return;
    }
    setEditingPickupJob(row);
    if (row.pickupEtaDate) {
      const yr = row.pickupEtaDate.getFullYear();
      const mo = String(row.pickupEtaDate.getMonth() + 1).padStart(2, '0');
      const da = String(row.pickupEtaDate.getDate()).padStart(2, '0');
      const hr = String(row.pickupEtaDate.getHours()).padStart(2, '0');
      const mi = String(row.pickupEtaDate.getMinutes()).padStart(2, '0');
      setPickupDateTimeInput(`${yr}-${mo}-${da}T${hr}:${mi}`);
    } else {
      const tmrw = new Date();
      tmrw.setDate(tmrw.getDate() + 1);
      const yr = tmrw.getFullYear();
      const mo = String(tmrw.getMonth() + 1).padStart(2, '0');
      const da = String(tmrw.getDate()).padStart(2, '0');
      setPickupDateTimeInput(`${yr}-${mo}-${da}T08:00`);
    }
    setPickupNotesInput(row.customerPickupNotes || '');
  };

  const handleSavePickupEta = async (targetDate: Date | null, notes?: string) => {
    if (!editingPickupJob || !tenantId) return;
    if (!canManageJobs) {
      toast.error("Permission required to adjust Customer Pickup ETA");
      return;
    }
    setIsUpdatingPickupEta(true);

    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, editingPickupJob.id);
      const isoString = targetDate ? targetDate.toISOString() : null;

      await updateDoc(jobRef, {
        customerPickupEta: isoString,
        customerPickupEtaDate: isoString,
        customerPickupNotes: (notes !== undefined ? notes : pickupNotesInput).trim() || null,
        customerPickupScheduledBy: effectiveStaffName,
        customerPickupScheduledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      submitAuditLog(tenantId, {
        userId: user?.uid || 'office',
        actionType: 'DATA_MUTATION',
        details: {
          action: 'CUSTOMER_PICKUP_ETA_UPDATED',
          jobId: editingPickupJob.id,
          jobNumber: editingPickupJob.jobNumber,
          pickupEta: isoString,
          notes: (notes !== undefined ? notes : pickupNotesInput).trim(),
          staffName: effectiveStaffName
        }
      });

      if (targetDate) {
        toast.success(`Pickup ETA set for Job #${editingPickupJob.jobNumber}`, {
          description: `Scheduled: ${targetDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
        });
      } else {
        toast.success(`Job #${editingPickupJob.jobNumber} set to No Pickup Time Assigned`);
      }

      setEditingPickupJob(null);
    } catch (err: any) {
      console.error("Failed to update pickup ETA:", err);
      toast.error(`Failed to update pickup ETA: ${err.message}`);
    } finally {
      setIsUpdatingPickupEta(false);
    }
  };

  const handleApplyPickupPreset = (preset: 'today_8am' | 'today_3pm' | 'tmrw_8am' | 'tmrw_4pm') => {
    const now = new Date();
    const target = new Date();

    if (preset === 'today_8am') {
      target.setHours(8, 0, 0, 0);
    } else if (preset === 'today_3pm') {
      target.setHours(15, 0, 0, 0);
    } else if (preset === 'tmrw_8am') {
      target.setDate(now.getDate() + 1);
      target.setHours(8, 0, 0, 0);
    } else if (preset === 'tmrw_4pm') {
      target.setDate(now.getDate() + 1);
      target.setHours(16, 0, 0, 0);
    }

    handleSavePickupEta(target);
  };

  const handleApplyCustomPickupEta = () => {
    if (!pickupDateTimeInput) {
      toast.error("Please choose a pickup date and time");
      return;
    }
    const target = new Date(pickupDateTimeInput);
    if (isNaN(target.getTime())) {
      toast.error("Invalid date or time");
      return;
    }
    handleSavePickupEta(target);
  };

  // Toggle Job Classification: Build <-> Service <-> Warranty
  const handleToggleJobType = async (row: any, targetType: 'build' | 'service' | 'warranty', e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tenantId) return;

    if (!canManageJobs) {
      toast.error("Permission required to change job classification");
      return;
    }

    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, row.id);
      await updateDoc(jobRef, {
        jobType: targetType,
        isService: targetType === 'service' || targetType === 'warranty',
        isWarranty: targetType === 'warranty',
        department: targetType === 'service' ? 'Service' : (targetType === 'warranty' ? 'Warranty' : 'Upfitting'),
        priority: targetType === 'service' ? 'Urgent' : (row.rawJob?.priority || 'Normal'),
        droppedOffAt: targetType === 'service' ? (row.rawJob?.droppedOffAt || new Date().toISOString()) : null,
        updatedAt: serverTimestamp()
      });

      submitAuditLog(tenantId, {
        userId: user?.uid || 'office',
        actionType: 'DATA_MUTATION',
        details: {
          action: 'JOB_TYPE_UPDATED',
          jobId: row.id,
          jobNumber: row.jobNumber,
          newType: targetType,
          staffName: effectiveStaffName
        }
      });

      toast.success(`Job #${row.jobNumber} classified as ${targetType.toUpperCase()}`, {
        description: targetType === 'service' 
          ? "Flagged for immediate Service / Rapid Triage drop-off inspection!"
          : `Classification updated to ${targetType}`
      });
    } catch (err: any) {
      console.error("Failed to update job type:", err);
      toast.error(`Error updating job classification: ${err.message}`);
    }
  };

  // Handle Quick Deadline Update Presets & Custom
  const handleOpenDeadlineModal = (row: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canManageJobs) {
      toast.error("Permission required to adjust delivery deadline");
      return;
    }
    setEditingDeadlineJob(row);

    if (row.deadlineDate) {
      const yr = row.deadlineDate.getFullYear();
      const mo = String(row.deadlineDate.getMonth() + 1).padStart(2, '0');
      const da = String(row.deadlineDate.getDate()).padStart(2, '0');
      setCustomDeadlineDate(`${yr}-${mo}-${da}`);

      const hr = String(row.deadlineDate.getHours()).padStart(2, '0');
      const mi = String(row.deadlineDate.getMinutes()).padStart(2, '0');
      setCustomDeadlineTime(`${hr}:${mi}`);
    } else {
      const tmrw = new Date();
      tmrw.setDate(tmrw.getDate() + 1);
      const yr = tmrw.getFullYear();
      const mo = String(tmrw.getMonth() + 1).padStart(2, '0');
      const da = String(tmrw.getDate()).padStart(2, '0');
      setCustomDeadlineDate(`${yr}-${mo}-${da}`);
      setCustomDeadlineTime('16:30');
    }
  };

  const handleApplyDeadline = async (targetDate: Date) => {
    if (!editingDeadlineJob || !tenantId) return;
    if (!canManageJobs) {
      toast.error("Permission required to adjust delivery deadline");
      return;
    }
    setIsUpdatingDeadline(true);

    try {
      const isoString = targetDate.toISOString();
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, editingDeadlineJob.id);

      await updateDoc(jobRef, {
        scheduledEndDate: isoString,
        targetDeliveryDate: isoString,
        promisedDeliveryDate: isoString,
        dueDate: isoString,
        updatedAt: serverTimestamp()
      });

      toast.success(`Delivery deadline updated for Job #${editingDeadlineJob.jobNumber}`, {
        description: `New Target: ${targetDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      });

      setEditingDeadlineJob(null);
    } catch (err: any) {
      console.error("Failed to update deadline:", err);
      toast.error(`Error updating deadline: ${err.message}`);
    } finally {
      setIsUpdatingDeadline(false);
    }
  };

  const handleApplyPreset = (type: 'today_end' | 'tomorrow_noon' | 'tomorrow_end' | 'friday_end' | 'next_monday_end') => {
    const now = new Date();
    const target = new Date();

    if (type === 'today_end') {
      target.setHours(16, 30, 0, 0);
    } else if (type === 'tomorrow_noon') {
      target.setDate(now.getDate() + 1);
      target.setHours(12, 0, 0, 0);
    } else if (type === 'tomorrow_end') {
      target.setDate(now.getDate() + 1);
      target.setHours(16, 30, 0, 0);
    } else if (type === 'friday_end') {
      const day = now.getDay();
      const daysUntilFri = (5 - day + 7) % 7 || 7;
      target.setDate(now.getDate() + daysUntilFri);
      target.setHours(16, 30, 0, 0);
    } else if (type === 'next_monday_end') {
      const day = now.getDay();
      const daysUntilMon = (1 - day + 7) % 7 || 7;
      target.setDate(now.getDate() + daysUntilMon);
      target.setHours(16, 30, 0, 0);
    }

    handleApplyDeadline(target);
  };

  const handleApplyCustomDeadline = () => {
    if (!customDeadlineDate) {
      toast.error("Please choose a date");
      return;
    }
    const [year, month, day] = customDeadlineDate.split('-').map(Number);
    const [hour, minute] = (customDeadlineTime || '16:30').split(':').map(Number);
    const target = new Date(year, month - 1, day, hour, minute, 0);
    handleApplyDeadline(target);
  };

  // Open Task Notes & Photos Drawer for a Job
  const handleOpenTaskNotesModal = (row: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canViewJobs) {
      toast.error("Permission required: You do not have permission to view or edit Job Tasks.");
      return;
    }
    setTaskModalJob(row);
    const jobTaskList = tasksMap[row.id] || [];
    if (jobTaskList.length > 0) {
      const firstTask = jobTaskList[0];
      setActiveTaskId(firstTask.id);
      setOfficeNotesInput(firstTask.officeInstructions || firstTask.notes || '');
    } else {
      setActiveTaskId(null);
      setOfficeNotesInput('');
    }
  };

  // Switch Active Task in Drawer
  const handleSelectTaskInDrawer = (task: any) => {
    setActiveTaskId(task.id);
    setOfficeNotesInput(task.officeInstructions || task.notes || '');
    setNewTechNoteInput('');
    setPhotoCaptionInput('');
    setPhotoUrlInput('');
  };

  // Save Office Instructions & Notes to Firestore
  const handleSaveOfficeNotes = async () => {
    if (!taskModalJob || !activeTaskId || !tenantId) return;
    setIsSavingNote(true);

    try {
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${taskModalJob.id}/tasks`, activeTaskId);
      const currentTaskSnap = await getDoc(taskRef);
      const currentTaskData = currentTaskSnap.data() || {};
      const existingNotes = Array.isArray(currentTaskData.task_notes) ? currentTaskData.task_notes : [];

      const newNoteEntry = {
        id: `note_${Date.now()}`,
        text: officeNotesInput.trim(),
        authorName: effectiveStaffName,
        authorId: effectiveStaffId,
        authorRole: 'Office Staff',
        isOfficeNote: true,
        createdAt: new Date().toISOString()
      };

      await updateDoc(taskRef, {
        officeInstructions: officeNotesInput.trim(),
        notes: officeNotesInput.trim(),
        task_notes: [...existingNotes, newNoteEntry],
        lastOfficeUpdateAt: serverTimestamp(),
        lastOfficeUpdatedBy: effectiveStaffName,
        updatedAt: serverTimestamp()
      });

      submitAuditLog(tenantId, {
        userId: user?.uid || 'office',
        actionType: 'DATA_MUTATION',
        details: {
          action: 'TASK_NOTE_UPDATED',
          jobId: taskModalJob.id,
          taskId: activeTaskId,
          note: officeNotesInput.trim(),
          staffName: effectiveStaffName
        }
      });

      toast.success("Office instructions & notes saved to task!");
    } catch (err: any) {
      console.error("Failed to save task notes:", err);
      toast.error(`Error saving notes: ${err.message}`);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Add Tech Progress Note Entry
  const handleAddTechNote = async () => {
    if (!taskModalJob || !activeTaskId || !tenantId || !newTechNoteInput.trim()) return;
    setIsSavingNote(true);

    try {
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${taskModalJob.id}/tasks`, activeTaskId);
      const currentTaskSnap = await getDoc(taskRef);
      const currentTaskData = currentTaskSnap.data() || {};
      const existingNotes = Array.isArray(currentTaskData.task_notes) ? currentTaskData.task_notes : [];

      const newNoteEntry = {
        id: `tech_${Date.now()}`,
        text: newTechNoteInput.trim(),
        authorName: effectiveStaffName,
        authorId: effectiveStaffId,
        authorRole: 'Tech / Shop Log',
        isOfficeNote: false,
        createdAt: new Date().toISOString()
      };

      await updateDoc(taskRef, {
        task_notes: [...existingNotes, newNoteEntry],
        lastNoteAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setNewTechNoteInput('');
      toast.success("Note logged on task!");
    } catch (err: any) {
      console.error("Failed to append tech note:", err);
      toast.error(`Error adding note: ${err.message}`);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Upload Photo File to Firebase Storage & Attach to Task
  const handlePhotoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !taskModalJob || !activeTaskId || !tenantId) return;

    setIsUploadingPhoto(true);
    try {
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const storageRef = ref(storage, `businesses/${tenantId}/jobs/${taskModalJob.id}/tasks/${activeTaskId}/${fileName}`);

      const snap = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snap.ref);

      const taskRef = doc(db, `businesses/${tenantId}/jobs/${taskModalJob.id}/tasks`, activeTaskId);
      const currentTaskSnap = await getDoc(taskRef);
      const currentTaskData = currentTaskSnap.data() || {};
      const existingPhotos = Array.isArray(currentTaskData.photos) ? currentTaskData.photos : [];

      const photoRecord = {
        id: `photo_${Date.now()}`,
        url: downloadUrl,
        caption: photoCaptionInput.trim() || file.name,
        uploadedBy: effectiveStaffName,
        uploadedAt: new Date().toISOString(),
        source: 'Office Upload'
      };

      await updateDoc(taskRef, {
        photos: [...existingPhotos, photoRecord],
        updatedAt: serverTimestamp()
      });

      // Also push to Job-level Photos collection so technicians see it in Bay Terminal gallery
      await addDoc(collection(db, `businesses/${tenantId}/jobs/${taskModalJob.id}/photos`), {
        url: downloadUrl,
        caption: photoCaptionInput.trim() || `Task Attachment: ${currentTaskData.title || 'Task'}`,
        taskId: activeTaskId,
        taskName: currentTaskData.title || currentTaskData.name || 'Task',
        uploadedBy: effectiveStaffName,
        createdAt: serverTimestamp(),
        source: 'Office Task Upload'
      });

      setPhotoCaptionInput('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success("Photo uploaded and attached to task & bay terminal!");
    } catch (err: any) {
      console.error("Photo upload failed:", err);
      toast.error(`Photo upload failed: ${err.message}`);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Attach Image via URL / CompanyCam link
  const handleAttachPhotoUrl = async () => {
    if (!photoUrlInput.trim() || !taskModalJob || !activeTaskId || !tenantId) return;
    setIsUploadingPhoto(true);

    try {
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${taskModalJob.id}/tasks`, activeTaskId);
      const currentTaskSnap = await getDoc(taskRef);
      const currentTaskData = currentTaskSnap.data() || {};
      const existingPhotos = Array.isArray(currentTaskData.photos) ? currentTaskData.photos : [];

      const photoRecord = {
        id: `photo_${Date.now()}`,
        url: photoUrlInput.trim(),
        caption: photoCaptionInput.trim() || 'Reference Diagram / Attachment',
        uploadedBy: effectiveStaffName,
        uploadedAt: new Date().toISOString(),
        source: photoUrlInput.includes('companycam') ? 'CompanyCam Link' : 'Web URL'
      };

      await updateDoc(taskRef, {
        photos: [...existingPhotos, photoRecord],
        updatedAt: serverTimestamp()
      });

      setPhotoUrlInput('');
      setPhotoCaptionInput('');
      toast.success("Image URL attached to task!");
    } catch (err: any) {
      console.error("Failed to attach image URL:", err);
      toast.error(`Failed to attach URL: ${err.message}`);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Delete Photo from Task
  const handleDeletePhoto = async (photoId: string) => {
    if (!taskModalJob || !activeTaskId || !tenantId) return;

    try {
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${taskModalJob.id}/tasks`, activeTaskId);
      const currentTaskSnap = await getDoc(taskRef);
      const currentTaskData = currentTaskSnap.data() || {};
      const existingPhotos = Array.isArray(currentTaskData.photos) ? currentTaskData.photos : [];
      const updatedPhotos = existingPhotos.filter((p: any) => p.id !== photoId);

      await updateDoc(taskRef, {
        photos: updatedPhotos,
        updatedAt: serverTimestamp()
      });

      toast.success("Photo removed from task");
    } catch (err: any) {
      console.error("Failed to delete photo:", err);
      toast.error(`Failed to delete photo: ${err.message}`);
    }
  };

  // Create New Task Directly from Office Sheet
  const handleCreateNewTask = async () => {
    if (!taskModalJob || !newTaskTitle.trim() || !tenantId) return;
    setIsCreatingTask(true);

    try {
      const taskData = {
        title: newTaskTitle.trim(),
        name: newTaskTitle.trim(),
        bookTime: parseFloat(newTaskBookTime) || 1.0,
        status: 'In Bay',
        completed: false,
        officeInstructions: newTaskOfficeNotes.trim(),
        notes: newTaskOfficeNotes.trim(),
        task_notes: newTaskOfficeNotes.trim() ? [{
          id: `note_${Date.now()}`,
          text: newTaskOfficeNotes.trim(),
          authorName: effectiveStaffName,
          authorId: effectiveStaffId,
          authorRole: 'Office Staff',
          isOfficeNote: true,
          createdAt: new Date().toISOString()
        }] : [],
        photos: [],
        createdBy: effectiveStaffName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const newDocRef = await addDoc(collection(db, `businesses/${tenantId}/jobs/${taskModalJob.id}/tasks`), taskData);

      submitAuditLog(tenantId, {
        userId: user?.uid || 'office',
        actionType: 'DATA_MUTATION',
        details: {
          action: 'TASK_CREATED',
          jobId: taskModalJob.id,
          taskTitle: newTaskTitle.trim(),
          bookTime: parseFloat(newTaskBookTime) || 1.0,
          staffName: effectiveStaffName
        }
      });

      toast.success(`Task "${newTaskTitle.trim()}" added to Job #${taskModalJob.jobNumber}`);
      setIsAddingTask(false);
      setNewTaskTitle('');
      setNewTaskBookTime('1.0');
      setNewTaskOfficeNotes('');
      setActiveTaskId(newDocRef.id);
    } catch (err: any) {
      console.error("Failed to create task:", err);
      toast.error(`Failed to create task: ${err.message}`);
    } finally {
      setIsCreatingTask(false);
    }
  };

  const activeJobTasks = taskModalJob ? (tasksMap[taskModalJob.id] || []) : [];
  const activeTask = activeJobTasks.find(t => t.id === activeTaskId) || null;

  return (
    <div className="w-full space-y-1.5 p-1 sm:p-2 animate-in fade-in duration-200">
      
      {/* ========================================================================= */}
      {/* HEADER: TITLE, SEARCH & QUICK ACTIONS (TIGHT PADDING, CRISP FONTS)         */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 bg-zinc-900/60 py-1.5 px-3 rounded-xl border border-zinc-800/80 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 font-bold shrink-0">
            <Car className="w-3.5 h-3.5" />
          </div>
          <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-2 flex-wrap">
            <span>Office Jobs Overview Sheet</span>
            <span className="text-[11px] px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-300 font-mono border border-emerald-500/30">
              {kpis.totalOnSite} On-Site
            </span>
          </h1>
        </div>

        {/* Global Multi-Field Search Bar & Header Action Controls */}
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <button
            onClick={() => setOnlyOnSite(!onlyOnSite)}
            className={cn(
              "h-7 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer border shrink-0",
              onlyOnSite 
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm" 
                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
            )}
            title="Toggle between only showing vehicles physically on site vs all scheduled pipeline jobs"
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", onlyOnSite ? "bg-emerald-400 animate-pulse" : "bg-zinc-500")} />
            <span>{onlyOnSite ? `On-Site (${kpis.totalOnSite})` : `All (${kpis.totalPipeline})`}</span>
          </button>

          <div className="relative flex-1 md:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Job #, Customer, VIN..."
              className="w-full h-7 pl-7 pr-2.5 bg-zinc-950/80 border border-zinc-700/80 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-inner"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className={cn(
              "h-7 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer border shrink-0",
              isFullscreen
                ? "bg-indigo-600 border-indigo-500 text-white shadow-md font-black"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700"
            )}
            title={isFullscreen ? "Exit Full Screen Mode" : "Expand Sheet to Full Screen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-white" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span className="hidden sm:inline">{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</span>
          </button>

          <button
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 300);
            }}
            className="h-7 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer border border-zinc-700 shrink-0"
            title="Refresh Sheet"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-indigo-400")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 TOP KPI CARDS RIBBON (ULTRA-COMPACT, CRISP READABLE NUMBERS)           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
        <div 
          onClick={() => setFilterTab('all')}
          className={cn(
            "py-1 px-2.5 rounded-lg border transition cursor-pointer active:scale-95 flex items-center justify-between sm:flex-col sm:items-start",
            filterTab === 'all' 
              ? "bg-zinc-800/90 border-indigo-500/50 shadow-md shadow-indigo-500/10" 
              : "bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700"
          )}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Total On-Site</div>
          <div className="text-base font-black text-white leading-none">{kpis.totalOnSite}</div>
        </div>

        {/* 1. Blocked / Issues (Top Priority) */}
        <div 
          onClick={() => setFilterTab('blocked')}
          className={cn(
            "py-1 px-2.5 rounded-lg border transition cursor-pointer active:scale-95 flex items-center justify-between sm:flex-col sm:items-start",
            filterTab === 'blocked' 
              ? "bg-rose-500/20 border-rose-500/60 shadow-md shadow-rose-500/20" 
              : "bg-zinc-900/50 border-zinc-800/80 hover:border-rose-500/40"
          )}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            <span>⚠️ Blocked</span>
          </div>
          <div className="text-base font-black text-rose-300 leading-none">{kpis.blocked}</div>
        </div>

        {/* 2. Requested Parts (2nd Priority) */}
        <div 
          onClick={() => setFilterTab('parts')}
          className={cn(
            "py-1 px-2.5 rounded-lg border transition cursor-pointer active:scale-95 flex items-center justify-between sm:flex-col sm:items-start",
            filterTab === 'parts' 
              ? "bg-amber-500/20 border-amber-500/60 shadow-md shadow-amber-500/20" 
              : "bg-zinc-900/50 border-zinc-800/80 hover:border-amber-500/40"
          )}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
            <Package className="w-2.5 h-2.5 text-amber-400" />
            <span>Parts Req</span>
          </div>
          <div className="text-base font-black text-amber-300 leading-none">{kpis.partsCount}</div>
        </div>

        {/* 3. Ready for QC (3rd Priority) */}
        <div 
          onClick={() => setFilterTab('ready_qc')}
          className={cn(
            "py-1 px-2.5 rounded-lg border transition cursor-pointer active:scale-95 flex items-center justify-between sm:flex-col sm:items-start",
            filterTab === 'ready_qc' 
              ? "bg-purple-500/20 border-purple-500/60 shadow-md shadow-purple-500/20" 
              : "bg-zinc-900/50 border-zinc-800/80 hover:border-purple-500/40"
          )}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-purple-400">Ready for QC</div>
          <div className="text-base font-black text-purple-300 leading-none">{kpis.readyQc}</div>
        </div>

        {/* 4. Ready for Customer (4th Priority) */}
        <div 
          onClick={() => setFilterTab('ready_customer')}
          className={cn(
            "py-1 px-2.5 rounded-lg border transition cursor-pointer active:scale-95 flex items-center justify-between sm:flex-col sm:items-start",
            filterTab === 'ready_customer' 
              ? "bg-emerald-500/20 border-emerald-500/60 shadow-md shadow-emerald-500/20" 
              : "bg-zinc-900/50 border-zinc-800/80 hover:border-emerald-500/40"
          )}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-400">Ready for Pickup</div>
          <div className="text-base font-black text-emerald-300 leading-none">{kpis.readyCustomer}</div>
        </div>

        {/* 5. Service Drop-Offs */}
        <div 
          onClick={() => setFilterTab('service')}
          className={cn(
            "py-1 px-2.5 rounded-lg border transition cursor-pointer active:scale-95 flex items-center justify-between sm:flex-col sm:items-start",
            filterTab === 'service' 
              ? "bg-amber-500/20 border-amber-500/60 shadow-md shadow-amber-500/20" 
              : "bg-zinc-900/50 border-zinc-800/80 hover:border-amber-500/40"
          )}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Service / Triage</span>
          </div>
          <div className="text-base font-black text-amber-300 leading-none">{kpis.serviceCount}</div>
        </div>

        {/* 6. In Work Bays */}
        <div 
          onClick={() => setFilterTab('in_bay')}
          className={cn(
            "py-1 px-2.5 rounded-lg border transition cursor-pointer active:scale-95 flex items-center justify-between sm:flex-col sm:items-start",
            filterTab === 'in_bay' 
              ? "bg-zinc-800/90 border-blue-500/50 shadow-md shadow-blue-500/10" 
              : "bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700"
          )}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">In Work Bays</div>
          <div className="text-base font-black text-blue-400 leading-none">{kpis.inBay}</div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🚗 READY FOR CUSTOMER PICKUP DECK (PINNED DIRECTLY UNDER KPIS)             */}
      {/* ========================================================================= */}
      {readyForCustomerRows.length > 0 && (
        <div className="bg-emerald-950/20 border border-emerald-500/40 rounded-xl p-1.5 sm:p-2 shadow-md backdrop-blur-md space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <span>🚗 Ready for Customer Pickup</span>
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-black border border-emerald-500/30">
                  {readyForCustomerRows.length} Vehicles
                </span>
              </h2>
            </div>
            <span className="text-[11px] text-zinc-400">
              QC-passed & staged for pickup • 1-click completes job & frees spot (Undo anytime at bottom of page)
            </span>
          </div>

          <div className="overflow-x-auto bg-zinc-950/80 rounded-lg border border-emerald-500/20">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/90 text-zinc-400 uppercase text-[9px] font-black tracking-wider">
                  <th className="py-1 px-2.5 font-black">Job #</th>
                  <th className="py-1 px-2.5 font-black">Customer</th>
                  <th className="py-1 px-2.5 font-black">Vehicle & VIN</th>
                  <th className="py-1 px-2.5 font-black">Location</th>
                  <th className="py-1 px-2.5 font-black">Ready Duration</th>
                  <th className="py-1 px-2.5 font-black">Customer Pickup ETA</th>
                  <th className="py-1 px-2.5 font-black text-right">Pickup Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {readyForCustomerRows.map(row => (
                  <tr 
                    key={row.id}
                    onClick={(e) => canViewJobs && openJobInWindow(row.id, e)}
                    className={cn(
                      "transition",
                      canViewJobs ? "hover:bg-emerald-950/20 cursor-pointer group" : "cursor-default"
                    )}
                  >
                    {/* 1. Job # */}
                    <td className="py-1 px-2.5">
                      <span className={cn(
                        "font-mono font-black text-xs",
                        canViewJobs ? "text-indigo-400 group-hover:text-indigo-300" : "text-zinc-300"
                      )}>
                        #{row.jobNumber}
                      </span>
                    </td>

                    {/* 2. Customer */}
                    <td className="py-1 px-2.5 font-bold text-zinc-100 truncate max-w-[180px] text-xs">
                      {row.customerName}
                    </td>

                    {/* 3. Vehicle & VIN */}
                    <td className="py-1 px-2.5 text-zinc-300 text-xs">
                      <span className="font-semibold">{row.vehicleInfo}</span>
                      {row.vinNumber !== 'N/A' && (
                        <span className="text-zinc-500 font-mono text-[10px] ml-2">
                          VIN: {row.vinNumber}
                        </span>
                      )}
                    </td>

                    {/* 4. Location (Click to open V3 Location Editor) */}
                    <td 
                      className="py-1 px-2.5"
                      data-no-row-click="true"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingLocationJob(row);
                        setZoneFilterType('all');
                        setZoneSearch('');
                      }}
                    >
                      <button
                        type="button"
                        data-no-row-click="true"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingLocationJob(row);
                          setZoneFilterType('all');
                          setZoneSearch('');
                        }}
                        className="group/loc cursor-pointer text-left transition hover:scale-105 active:scale-95 inline-flex items-center gap-1"
                        title="Click to relocate vehicle / change work bay or parking spot"
                      >
                        {row.isFrontSpotAfter4Pm ? (
                          <span 
                            className="px-2 py-0.5 rounded-lg text-xs font-black inline-flex items-center gap-1.5 border bg-rose-500/25 border-rose-500/60 text-rose-200 shadow-lg shadow-rose-500/30 animate-pulse"
                            title="After 4:00 PM: Vehicle in Front spot must be moved to secure back lot!"
                          >
                            <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping shrink-0" />
                            <span>{row.locationName} • Move to Back</span>
                          </span>
                        ) : row.needsMoveToFront ? (
                          <span 
                            className="px-2 py-0.5 rounded-lg text-xs font-black inline-flex items-center gap-1.5 border bg-amber-500/25 border-amber-500/60 text-amber-200 shadow-lg shadow-amber-500/30 animate-pulse"
                            title="Within 1 hour of Customer Pickup ETA: Move vehicle up front!"
                          >
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                            <span>{row.locationName} • Move to Front</span>
                          </span>
                        ) : (
                          <span className={cn(
                            "px-2 py-0.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 border group-hover/loc:border-amber-500/60 group-hover/loc:bg-amber-500/10",
                            row.isInBay
                              ? "bg-blue-500/10 text-blue-300 border-blue-500/30"
                              : "bg-zinc-800/80 text-zinc-300 border-zinc-700/80"
                          )}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", row.isInBay ? "bg-blue-400" : "bg-zinc-400")} />
                            <span>{row.locationName}</span>
                          </span>
                        )}
                        <Pencil className="w-3 h-3 text-amber-400/80 group-hover/loc:text-amber-300 shrink-0 transition" />
                      </button>
                    </td>

                    {/* 5. How long ready */}
                    <td className="py-1 px-2.5">
                      <span className="font-mono font-bold text-emerald-400 text-xs inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-emerald-400" />
                        <span>Ready {row.readyDurationString}</span>
                      </span>
                    </td>

                    {/* 6. Customer Pickup ETA (Interactive Editor Button) */}
                    <td className="py-1 px-2.5">
                      {row.pickupEtaString ? (
                        <button
                          type="button"
                          onClick={(e) => handleOpenPickupEtaModal(row, e)}
                          className="px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer active:scale-95 group/eta"
                          title={row.customerPickupNotes ? `Notes: ${row.customerPickupNotes}` : "Click to adjust customer pickup ETA"}
                        >
                          <Calendar className="w-3 h-3 text-emerald-400" />
                          <span>{row.pickupEtaString}</span>
                          <Pencil className="w-2.5 h-2.5 text-emerald-400/70 group-hover/eta:text-emerald-200 transition" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleOpenPickupEtaModal(row, e)}
                          className="px-2 py-0.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700/80 text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer active:scale-95"
                          title="Click to set estimated customer pickup date & time"
                        >
                          <Plus className="w-3 h-3 text-zinc-400" />
                          <span>Set Pickup ETA</span>
                          <Pencil className="w-2.5 h-2.5 text-zinc-500 ml-0.5" />
                        </button>
                      )}
                    </td>

                    {/* 7. Action Buttons */}
                    <td className="py-1 px-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleOpenPrintJobModal(row, e)}
                          className="h-6 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 hover:text-indigo-300 text-zinc-300 border border-zinc-700 font-bold text-xs inline-flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                          title="Print Job Details Report"
                        >
                          <Printer className="w-3 h-3" />
                          <span className="hidden sm:inline">Print</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleCustomerPickedUp(row, e)}
                          disabled={isPickingUpJobId === row.id}
                          className="h-6 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-sm shadow-emerald-600/25 active:scale-95 cursor-pointer disabled:opacity-50"
                          title="Mark as customer picked up (clears bay/parking spot & completes job)"
                        >
                          {isPickingUpJobId === row.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          <span>Customer Picked Up</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🟢 ULTRA-COMPACT LIVE CLOCKED-IN STAFF & ACTIVE TASKS HORIZONTAL STRIP      */}
      {/* ========================================================================= */}
      <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl px-3 py-1.5 shadow-md backdrop-blur-md flex items-center gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0 pr-2.5 border-r border-zinc-800">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300 whitespace-nowrap">
            Shop Staff ({staffFloorStatusList.filter(s => s.status !== 'out').length} Active)
          </span>
        </div>

        {staffFloorStatusList.length === 0 ? (
          <div className="text-[11px] text-zinc-500 italic py-0.5">
            No technicians recorded today.
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
            {staffFloorStatusList.map(st => (
              <div
                key={st.sessionId || st.userId || st.staffName}
                className={cn(
                  "h-6 px-2 rounded-lg border text-xs inline-flex items-center gap-1.5 shrink-0 transition select-none shadow-sm",
                  st.status === 'break' 
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : st.status === 'working'
                      ? "bg-zinc-950/80 border-zinc-700/80 text-zinc-200"
                      : st.status === 'out'
                        ? "bg-zinc-950/50 border-zinc-800 text-zinc-400 opacity-60 hover:opacity-100"
                        : "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                )}
                title={
                  st.status === 'break' 
                    ? `${st.staffName} is on ${st.breakType} (Clocked in ${st.clockInTimeStr})`
                    : st.status === 'working'
                      ? `${st.staffName}: Working on #${st.jobNumber} (${st.customerName}) - ${st.taskTitle || 'Active Job'}`
                      : st.status === 'out'
                        ? `${st.staffName}: Clocked out today at ${st.clockOutTimeStr} (Worked ${st.durationStr})`
                        : `${st.staffName}: Clocked in (${st.clockInTimeStr}) - General Floor / Available`
                }
              >
                {/* Tech Name */}
                <div className={cn(
                  "flex items-center gap-1 font-bold whitespace-nowrap text-[11px]",
                  st.status === 'out' ? "text-zinc-400" : "text-zinc-100"
                )}>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    st.status === 'break' ? "bg-amber-400" : st.status === 'out' ? "bg-zinc-500" : "bg-emerald-400"
                  )} />
                  <span>{st.staffName}</span>
                </div>

                {/* Separator */}
                <span className="text-zinc-600 font-mono text-[9px]">|</span>

                {/* Active Task / Break / Out Status */}
                {st.status === 'break' ? (
                  <span className="text-[10px] font-black uppercase text-amber-400 inline-flex items-center gap-1">
                    <span>☕ {st.breakType}</span>
                    {st.durationStr && (
                      <span className="font-mono text-[9px] bg-amber-400/20 px-1 py-0.2 rounded font-bold text-amber-300">
                        {st.durationStr}
                      </span>
                    )}
                  </span>
                ) : st.status === 'working' ? (
                  <div className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap">
                    <span className="font-mono font-black text-indigo-400 bg-indigo-500/10 px-1 py-0.2 rounded border border-indigo-500/20 text-[9px]">
                      #{st.jobNumber}
                    </span>
                    {st.taskTitle ? (
                      <span className="text-zinc-300 font-semibold truncate max-w-[130px] text-[10px]" title={st.taskTitle}>
                        {st.taskTitle}
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-[10px] truncate max-w-[110px]">
                        {st.customerName}
                      </span>
                    )}
                    {st.bayOrSpot && (
                      <span className="text-zinc-500 font-mono text-[9px]">
                        ({st.bayOrSpot})
                      </span>
                    )}
                    {st.durationStr && (
                      <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20 inline-flex items-center gap-0.5" title="Time spent on this task">
                        <span>⏱️</span>
                        <span>{st.durationStr}</span>
                      </span>
                    )}
                  </div>
                ) : st.status === 'out' ? (
                  <div className="inline-flex items-center gap-1 text-[10px] text-zinc-400 font-mono whitespace-nowrap">
                    <span>Clocked Out • {st.clockOutTimeStr}</span>
                    {st.durationStr && <span className="text-[9px] text-zinc-500">({st.durationStr})</span>}
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 whitespace-nowrap">
                    <span>Clocked In</span>
                    {st.durationStr && (
                      <span className="font-mono text-[9px] text-emerald-300 bg-emerald-500/15 px-1 py-0.2 rounded border border-emerald-500/25">
                        ⏱️ {st.durationStr}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MAIN HIGH-DENSITY JOBS SHEET TABLE (TIGHT PADDING, CRISP READABLE TEXT)    */}
      {/* ========================================================================= */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/70 text-zinc-400 uppercase text-[10px] font-black tracking-wider">
                <th className="py-2 px-3 font-black">Job & Customer</th>
                <th className="py-2 px-3 font-black">Vehicle Specs & VIN</th>
                <th className="py-2 px-3 font-black">Location / Bay</th>
                <th className="py-2 px-3 font-black">Assigned Techs</th>
                <th className="py-2 px-3 font-black">Tasks & Notes</th>
                <th className="py-2 px-3 font-black">Delivery Deadline</th>
                <th className="py-2 px-3 font-black">Dynamic ETA</th>
                <th className="py-2 px-3 font-black text-right">Status & Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500 italic text-xs">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2 text-indigo-400 font-bold">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Loading active shop floor jobs...</span>
                      </div>
                    ) : (
                      <span>No active jobs match the selected filter or search query.</span>
                    )}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const progressPct = row.totalTasks > 0 ? Math.round((row.completedTasks / row.totalTasks) * 100) : 0;

                  return (
                    <tr
                      key={row.id}
                      onClick={(e) => canViewJobs && openJobInWindow(row.id, e)}
                      className={cn(
                        "transition",
                        canViewJobs ? "group cursor-pointer" : "cursor-default",
                        row.hasBlockers 
                          ? "bg-rose-950/20 hover:bg-rose-900/30" 
                          : row.hasPartsRequest 
                            ? "bg-amber-950/15 hover:bg-amber-900/25"
                            : canViewJobs ? "hover:bg-zinc-800/40" : ""
                      )}
                    >
                      {/* 1. Job Number & Customer */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "font-mono font-black text-sm",
                            canViewJobs ? "text-indigo-400 group-hover:text-indigo-300" : "text-zinc-300"
                          )}>
                            #{row.jobNumber}
                          </span>

                          {/* 1-Click Classification Toggle */}
                          <button
                            type="button"
                            onClick={(e) => {
                              const nextType = row.jobCategory === 'build' ? 'service' : (row.jobCategory === 'service' ? 'warranty' : 'build');
                              handleToggleJobType(row, nextType, e);
                            }}
                            className={cn(
                              "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border transition cursor-pointer active:scale-95 flex items-center gap-1",
                              row.isService && !row.isWarranty && "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10 animate-pulse",
                              row.isWarranty && "bg-purple-500/20 text-purple-300 border-purple-500/40",
                              !row.isService && !row.isWarranty && "bg-zinc-800/90 text-zinc-400 border-zinc-700 hover:text-white"
                            )}
                            title="Click to toggle: Build ➔ Service Drop-Off ➔ Warranty"
                          >
                            {row.isService && !row.isWarranty && <span>⚡ Service Drop-Off</span>}
                            {row.isWarranty && <span>🛡️ Warranty</span>}
                            {!row.isService && !row.isWarranty && <span>🏗️ Build</span>}
                          </button>

                          {/* 🚫 Blocked Badge with Interactive Hover Popover & Click Modal */}
                          {row.hasBlockers && (
                            <div className="relative group/blocker inline-block" data-no-row-click="true">
                              <button 
                                type="button"
                                data-no-row-click="true"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setViewingBlockerModalJob(row);
                                }}
                                className="px-1.5 py-0.5 rounded bg-rose-500/25 hover:bg-rose-500/35 border border-rose-500/50 text-rose-200 font-black text-[9px] animate-pulse flex items-center gap-1 cursor-pointer transition active:scale-95"
                                title="Click to view blocker details"
                              >
                                <span>⚠️ Blocked</span>
                              </button>

                              {/* Hover Popover Modal (Opens UP to prevent bottom scrollbar overflow) */}
                              <div className="hidden group-hover/blocker:block absolute left-0 bottom-full mb-1.5 z-50 w-72 bg-zinc-950/95 border border-rose-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-xl pointer-events-none">
                                <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2">
                                  <div className="flex items-center gap-1.5 text-xs font-black text-rose-400">
                                    <span>⚠️</span>
                                    <span>Active Blocker Details</span>
                                  </div>
                                  <span className="text-[10px] font-mono text-zinc-500">
                                    #{row.jobNumber}
                                  </span>
                                </div>

                                {row.blockers && row.blockers.length > 0 ? (
                                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {row.blockers.map((b: any, idx: number) => (
                                      <div key={b.id || idx} className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs">
                                        <div className="font-bold text-rose-300 text-[11px]">
                                          {b.reason || b.title || b.type || 'Production Blocker'}
                                        </div>
                                        {(b.notes || b.message || b.description) && (
                                          <div className="text-[10px] text-zinc-300 mt-0.5 whitespace-pre-wrap">
                                            {b.notes || b.message || b.description}
                                          </div>
                                        )}
                                        {b.createdByName && (
                                          <div className="text-[9px] text-zinc-500 mt-1">
                                            Logged by: {b.createdByName}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-zinc-300 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                                    {row.activeBlockerMessage || 'Job flagged as blocked on the shop floor.'}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 📦 Parts Requested Badge with Interactive Hover Popover & Click Modal */}
                          {row.hasPartsRequest && (
                            <div className="relative group/parts inline-block" data-no-row-click="true">
                              <button 
                                type="button"
                                data-no-row-click="true"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setViewingPartsModalJob(row);
                                }}
                                className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-black text-[9px] flex items-center gap-1 cursor-pointer transition active:scale-95"
                                title="Click to view parts request details"
                              >
                                <Package className="w-2.5 h-2.5" />
                                <span>Parts Req ({row.partsRequestCount})</span>
                              </button>

                              {/* Hover Popover Modal (Opens UP to prevent bottom scrollbar overflow) */}
                              <div className="hidden group-hover/parts:block absolute left-0 bottom-full mb-1.5 z-50 w-80 bg-zinc-950/95 border border-amber-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-xl pointer-events-none">
                                <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2">
                                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
                                    <Package className="w-3.5 h-3.5" />
                                    <span>Requested Parts ({row.partsRequestCount})</span>
                                  </div>
                                  <span className="text-[10px] font-mono text-zinc-500">
                                    #{row.jobNumber}
                                  </span>
                                </div>

                                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                                  {row.jobParts && row.jobParts.map((p: any, idx: number) => {
                                    const partName = p.partName || p.description || p.name || p.partNumber || 'Requested Item';
                                    const partNumber = p.partNumber || p.sku || p.pn || '';
                                    const qty = p.quantity || p.qty || 1;
                                    const status = String(p.status || 'pending').toLowerCase();
                                    const techName = p.requestedByName || p.requestedBy || p.techName || p.userName || '';

                                    return (
                                      <div key={p.id || idx} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="font-bold text-zinc-200 text-[11px] truncate">
                                              {partName}
                                            </div>
                                            {partNumber && (
                                              <div className="text-[10px] text-zinc-400 font-mono">
                                                PN: {partNumber}
                                              </div>
                                            )}
                                          </div>
                                          <span className={cn(
                                            "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 border",
                                            status.includes('ordered') || status.includes('transit')
                                              ? "bg-blue-500/20 border-blue-500/30 text-blue-300"
                                              : status.includes('staged') || status.includes('ready') || status.includes('received')
                                                ? "bg-purple-500/20 border-purple-500/30 text-purple-300"
                                                : "bg-amber-500/20 border-amber-500/30 text-amber-300"
                                          )}>
                                            {status.replace('_', ' ')}
                                          </span>
                                        </div>

                                        <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1 pt-1 border-t border-zinc-800/60 font-mono">
                                          <span>Qty: {qty}</span>
                                          {techName && <span>Req: {techName}</span>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="font-bold text-zinc-100 truncate max-w-[200px] text-xs mt-0.5">
                          {row.customerName}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate max-w-[200px]">
                          {row.title}
                        </div>
                      </td>

                      {/* 2. Vehicle Specs & VIN */}
                      <td className="py-2 px-3">
                        <div className="font-bold text-zinc-200 truncate max-w-[180px] text-xs">
                          {row.vehicleInfo}
                        </div>
                        <div className="font-mono text-[10px] text-zinc-400 truncate mt-0.5">
                          VIN: {row.vinNumber}
                        </div>
                        {row.stockNumber && (
                          <div className="text-[10px] text-zinc-500 font-mono">
                            Stock: #{row.stockNumber}
                          </div>
                        )}
                      </td>

                      {/* 3. Location / Bay (Read-only on lower table) */}
                      <td className="py-2 px-3">
                        {row.isFrontSpotAfter4Pm ? (
                          <span 
                            className="px-2 py-1 rounded-lg text-xs font-black inline-flex items-center gap-1.5 border bg-rose-500/25 border-rose-500/60 text-rose-200 shadow-lg shadow-rose-500/30 animate-pulse"
                            title="After 4:00 PM: Move vehicle from Front parking to back lot!"
                          >
                            <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping shrink-0" />
                            <span>{row.locationName} • Move to Back</span>
                          </span>
                        ) : row.needsMoveToFront ? (
                          <span 
                            className="px-2 py-1 rounded-lg text-xs font-black inline-flex items-center gap-1.5 border bg-amber-500/25 border-amber-500/60 text-amber-200 shadow-lg shadow-amber-500/30 animate-pulse"
                            title="Within 1 hour of Customer Pickup ETA: Move vehicle up front!"
                          >
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                            <span>{row.locationName} • Move to Front</span>
                          </span>
                        ) : (
                          <span className={cn(
                            "px-2 py-0.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 border",
                            row.isInBay
                              ? "bg-blue-500/10 text-blue-300 border-blue-500/30"
                              : "bg-zinc-800/80 text-zinc-300 border-zinc-700/80"
                          )}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", row.isInBay ? "bg-blue-400" : "bg-zinc-400")} />
                            <span>{row.locationName}</span>
                          </span>
                        )}
                      </td>

                      {/* 4. Assigned Techs & Live Clocked */}
                      <td className="py-2 px-3">
                        {row.assignedStaffList.length === 0 ? (
                          <span className="text-xs text-zinc-500 italic">Unassigned</span>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              {row.assignedStaffList.map((st) => (
                                <span
                                  key={st.id || st.name}
                                  className={cn(
                                    "px-1.5 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1",
                                    st.isClockedIn 
                                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm" 
                                      : "bg-zinc-800/80 border-zinc-700 text-zinc-300"
                                  )}
                                >
                                  {st.isClockedIn && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  )}
                                  <span>{st.name}</span>
                                </span>
                              ))}
                            </div>
                            {row.isLiveWorking && (
                              <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                <Wrench className="w-3 h-3 animate-spin" />
                                <span>Actively Working</span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 5. Tasks Completed / Remaining & Notes Hub (View-Only unless user has jobs.view / jobs.manage) */}
                      <td className="py-2 px-3">
                        {canViewJobs ? (
                          <button
                            type="button"
                            onClick={(e) => handleOpenTaskNotesModal(row, e)}
                            className="w-full min-w-[120px] text-left p-1.5 px-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-800 border border-zinc-800 hover:border-indigo-500/50 transition cursor-pointer group/task"
                            title="Click to open task notes, tech logs, and photo hub"
                          >
                            <div className="flex items-center justify-between text-xs font-bold text-zinc-200">
                              <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3 text-indigo-400" />
                                <span>{row.completedTasks}/{row.totalTasks} Done</span>
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="text-zinc-400 font-mono text-[10px]">
                                  {row.remainingBookHours.toFixed(1)}h left
                                </span>
                                <Pencil className="w-2.5 h-2.5 text-zinc-500 group-hover/task:text-indigo-300 transition" />
                              </div>
                            </div>
                            <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-1 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  progressPct === 100 ? "bg-emerald-500" : progressPct > 50 ? "bg-indigo-500" : "bg-amber-500"
                                )}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </button>
                        ) : (
                          <div 
                            className="w-full min-w-[120px] text-left p-1.5 px-2.5 rounded-xl bg-zinc-950/40 border border-zinc-800/80 cursor-default select-none"
                            title="Task progress (View-Only)"
                          >
                            <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                              <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3 text-zinc-500" />
                                <span>{row.completedTasks}/{row.totalTasks} Done</span>
                              </span>
                              <span className="text-zinc-500 font-mono text-[10px]">
                                {row.remainingBookHours.toFixed(1)}h left
                              </span>
                            </div>
                            <div className="w-full bg-zinc-800/80 rounded-full h-1.5 mt-1 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  progressPct === 100 ? "bg-emerald-500" : progressPct > 50 ? "bg-indigo-500" : "bg-amber-500"
                                )}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 6. Delivery Deadline & Possibility Status */}
                      <td className="py-2 px-3">
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={(e) => handleOpenDeadlineModal(row, e)}
                            className="px-2.5 py-1 rounded-xl bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-700 text-left transition group/dl hover:border-indigo-500/50 cursor-pointer block w-full max-w-[140px]"
                            title="Click to adjust delivery deadline"
                          >
                            <div className="text-[9px] text-zinc-500 font-bold uppercase flex items-center justify-between">
                              <span>Deadline</span>
                              <div className="flex items-center gap-1">
                                <Pencil className="w-2.5 h-2.5 text-zinc-500 group-hover/dl:text-indigo-300 transition" />
                                <Calendar className="w-2.5 h-2.5 text-zinc-400 group-hover/dl:text-indigo-400" />
                              </div>
                            </div>
                            <div className="font-bold text-zinc-200 text-xs mt-0.5 truncate">
                              {row.deadlineString}
                            </div>
                          </button>
                          
                          <div>
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 border",
                              row.feasibilityStatus === 'feasible' && "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
                              row.feasibilityStatus === 'tight' && "bg-amber-500/10 border-amber-500/25 text-amber-400",
                              row.feasibilityStatus === 'impossible' && "bg-rose-500/15 border-rose-500/40 text-rose-300 animate-pulse",
                              (row.feasibilityStatus === 'completed' || row.completedTasks === row.totalTasks) && "bg-teal-500/10 border-teal-500/25 text-teal-300",
                              row.feasibilityStatus === 'no_deadline' && "bg-zinc-800 border-zinc-700 text-zinc-400"
                            )}>
                              {row.completedTasks === row.totalTasks && row.totalTasks > 0 ? 'Tasks Finished' : row.feasibilityMessage}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 7. Dynamic ETA */}
                      <td className="py-2 px-3">
                        <div className="font-mono text-xs font-black text-indigo-300 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-indigo-400" />
                          <span>{row.etaString}</span>
                        </div>
                      </td>

                      {/* 8. Status & Quick Actions */}
                      <td className="py-2 px-3 text-right">
                        <div className="inline-flex flex-col items-end gap-1">
                          {row.isReadyForQc ? (
                            <span className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-amber-400 text-zinc-950 border-2 border-amber-500 shadow-md shadow-amber-500/20 inline-flex items-center gap-1 animate-pulse">
                              <span>⚠️ READY FOR QC</span>
                            </span>
                          ) : (
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                              row.isReadyForCustomer && "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
                              !row.isReadyForCustomer && "bg-zinc-800 text-zinc-300 border-zinc-700"
                            )}>
                              {row.status}
                            </span>
                          )}

                          <div className="flex items-center gap-1.5 mt-0.5">
                            <button
                              type="button"
                              onClick={(e) => handleOpenPrintJobModal(row, e)}
                              className="px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 hover:text-indigo-300 text-zinc-300 border border-zinc-700 text-[10px] font-bold inline-flex items-center gap-1 transition shadow-sm active:scale-95 cursor-pointer"
                              title="Print Job Details Report"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Print</span>
                            </button>

                            {canViewJobs && (
                              <span 
                                onClick={(e) => openJobInWindow(row.id, e)}
                                className="text-[10px] font-bold text-indigo-400 group-hover:text-indigo-300 flex items-center gap-0.5 cursor-pointer hover:underline"
                              >
                                <span>Open</span>
                                <ChevronRight className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🚙 JOBS WITH CUSTOMER (LAST 7 DAYS) - BOTTOM TAB & RECOVERY HUB            */}
      {/* ========================================================================= */}
      <div className="bg-zinc-950/80 border border-blue-500/30 rounded-2xl p-3 sm:p-4 shadow-xl space-y-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 flex-wrap px-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
            <h2 className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-2">
              <span>🚙 Jobs With Customer (Last 7 Days)</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-mono font-black border border-blue-500/30">
                {withCustomerRows.length} Vehicles
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 hidden sm:inline">
              Accidentally marked as picked up? Click <strong className="text-amber-300 font-bold">"Undo"</strong> to instantly restore to shop floor & Ready for Customer.
            </span>
            <button
              type="button"
              onClick={() => setShowWithCustomerBottomSection(!showWithCustomerBottomSection)}
              className="text-xs font-bold text-zinc-300 hover:text-white px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 cursor-pointer active:scale-95 transition"
            >
              {showWithCustomerBottomSection ? '▲ Collapse' : '▼ Expand'}
            </button>
          </div>
        </div>

        {showWithCustomerBottomSection && (
          <div className="overflow-x-auto bg-zinc-950/90 rounded-xl border border-zinc-800/80">
            {withCustomerRows.length === 0 ? (
              <div className="py-6 text-center text-zinc-500 italic text-xs">
                No vehicles have been marked as With Customer in the last 7 days.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/90 text-zinc-400 uppercase text-[9px] font-black tracking-wider">
                    <th className="py-2 px-3 font-black">Job #</th>
                    <th className="py-2 px-3 font-black">Customer</th>
                    <th className="py-2 px-3 font-black">Vehicle & VIN</th>
                    <th className="py-2 px-3 font-black">Delivered / Handed Off</th>
                    <th className="py-2 px-3 font-black">Previous Spot</th>
                    <th className="py-2 px-3 font-black text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {withCustomerRows.map(row => (
                    <tr 
                      key={row.id}
                      onClick={(e) => canViewJobs && openJobInWindow(row.id, e)}
                      className={cn(
                        "transition",
                        canViewJobs ? "hover:bg-blue-950/20 cursor-pointer group" : "cursor-default"
                      )}
                    >
                      {/* 1. Job # */}
                      <td className="py-2 px-3">
                        <span className={cn(
                          "font-mono font-black text-xs",
                          canViewJobs ? "text-blue-400 group-hover:text-blue-300" : "text-zinc-300"
                        )}>
                          #{row.jobNumber}
                        </span>
                      </td>

                      {/* 2. Customer */}
                      <td className="py-2 px-3 font-bold text-zinc-100 truncate max-w-[200px] text-xs">
                        {row.customerName}
                      </td>

                      {/* 3. Vehicle & VIN */}
                      <td className="py-2 px-3 text-zinc-300 text-xs">
                        <span className="font-semibold">{row.vehicleInfo}</span>
                        {row.vinNumber !== 'N/A' && (
                          <span className="text-zinc-500 font-mono text-[10px] ml-2">
                            VIN: {row.vinNumber}
                          </span>
                        )}
                      </td>

                      {/* 4. Delivered Time & Who Marked */}
                      <td className="py-2 px-3 text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-blue-300 font-bold flex items-center gap-1.5 font-mono">
                            <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span>{row.deliveredTimeStr}</span>
                          </span>
                          {row.markedBy && (
                            <span className="text-[10px] text-zinc-400 font-medium ml-5 truncate max-w-[150px]" title={`Marked by ${row.markedBy}`}>
                              by <strong className="text-zinc-200 font-semibold">{row.markedBy}</strong>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. Previous Spot */}
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-zinc-900 border border-zinc-800 text-zinc-300">
                          {row.previousParkingSpot}
                        </span>
                      </td>

                      {/* 6. Undo & Open Actions */}
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => handleUndoWithCustomer(row, e)}
                            disabled={isUndoingJobId === row.id}
                            className="h-7 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-black inline-flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50 shadow-sm"
                            title="Undo 'With Customer' and return vehicle back to shop floor & Ready for Customer"
                          >
                            {isUndoingJobId === row.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3 h-3" />
                            )}
                            <span>Undo "With Customer"</span>
                          </button>

                            <button
                              type="button"
                              onClick={(e) => handleOpenPrintJobModal(row, e)}
                              className="h-7 px-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 hover:text-indigo-300 text-zinc-300 border border-zinc-700/80 text-xs font-bold inline-flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                              title="Print Job Details Report"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Print</span>
                            </button>

                            {canViewJobs && (
                              <button
                                type="button"
                                onClick={(e) => openJobInWindow(row.id, e)}
                                className="h-7 px-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 text-xs font-bold inline-flex items-center gap-1 transition active:scale-95 cursor-pointer"
                              >
                                <Eye className="w-3 h-3 text-indigo-400" />
                                <span>View</span>
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* CUSTOMER PICKUP ETA SCHEDULER MODAL                                       */}
      {/* ========================================================================= */}
      {editingPickupJob && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Customer Delivery Queue</span>
                <h3 className="text-base font-black text-white mt-0.5">
                  Set Customer Pickup ETA • #{editingPickupJob.jobNumber}
                </h3>
              </div>
              <button
                onClick={() => setEditingPickupJob(null)}
                className="w-8 h-8 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Vehicle & Customer Overview */}
            <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-1 text-xs">
              <div className="flex items-center justify-between text-zinc-300">
                <span>Customer:</span>
                <span className="font-bold text-white">{editingPickupJob.customerName}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Vehicle:</span>
                <span className="font-semibold text-zinc-200">{editingPickupJob.vehicleInfo}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Current Location:</span>
                <span className="font-bold text-emerald-400">{editingPickupJob.locationName}</span>
              </div>
            </div>

            {/* Quick 1-Click Pickup Presets */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase text-zinc-400 tracking-wider">Quick Presets</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyPickupPreset('today_8am')}
                  disabled={isUpdatingPickupEta}
                  className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 text-left transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <div className="text-white font-bold">Today 8am</div>
                  <div className="text-[10px] text-zinc-500">Morning 8:00 AM</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPickupPreset('today_3pm')}
                  disabled={isUpdatingPickupEta}
                  className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 text-left transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <div className="text-white font-bold">Today 3pm</div>
                  <div className="text-[10px] text-zinc-500">Afternoon 3:00 PM</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPickupPreset('tmrw_8am')}
                  disabled={isUpdatingPickupEta}
                  className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 text-left transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <div className="text-white font-bold">Tomorrow 8am</div>
                  <div className="text-[10px] text-zinc-500">Next Day 8:00 AM</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPickupPreset('tmrw_4pm')}
                  disabled={isUpdatingPickupEta}
                  className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 text-left transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <div className="text-white font-bold">Tomorrow 4pm</div>
                  <div className="text-[10px] text-zinc-500">End of Shift 4:00 PM</div>
                </button>
              </div>
            </div>

            {/* Combined Date & Time Picker */}
            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
              <label className="text-[11px] font-black uppercase text-zinc-400 tracking-wider">Custom Date & Time</label>
              <div>
                <input
                  type="datetime-local"
                  value={pickupDateTimeInput}
                  onChange={(e) => setPickupDateTimeInput(e.target.value)}
                  className="w-full h-10 px-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Pickup Notes / Driver Contact (Optional)</label>
                <input
                  type="text"
                  value={pickupNotesInput}
                  onChange={(e) => setPickupNotesInput(e.target.value)}
                  placeholder="e.g. Chief Miller picking up, trailer transport required..."
                  className="w-full h-9 px-3 mt-1 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => handleSavePickupEta(null, '')}
                disabled={isUpdatingPickupEta}
                className="h-10 px-3.5 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                title="Clear pickup ETA and set to no pickup time assigned"
              >
                <span>✕ Clear / No Pickup Time Assigned</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPickupJob(null)}
                  className="h-10 px-4 rounded-xl text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyCustomPickupEta}
                  disabled={isUpdatingPickupEta}
                  className="h-10 px-5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingPickupEta ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Pickup ETA</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TASK NOTES, TECH LOGS & PHOTO HUB DRAWER / MODAL                          */}
      {/* ========================================================================= */}
      {taskModalJob && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-4xl max-h-[90vh] bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-indigo-400 text-sm">#{taskModalJob.jobNumber}</span>
                    <span className="text-zinc-200 font-bold text-base">{taskModalJob.customerName}</span>
                    <span className="text-xs text-zinc-400 font-normal">({taskModalJob.vehicleInfo})</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Office Instructions, Tech Notes & Photo Attachments
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAddingTask(true)}
                  className="h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Task</span>
                </button>
                <button
                  onClick={() => {
                    setTaskModalJob(null);
                    setActiveTaskId(null);
                    setIsAddingTask(false);
                  }}
                  className="w-9 h-9 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Drawer Body: 2-Column Layout */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
              
              {/* Left Column: Tasks List (4 cols) */}
              <div className="md:col-span-4 p-4 space-y-2 bg-zinc-950/50 overflow-y-auto max-h-[70vh]">
                <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2 flex items-center justify-between">
                  <span>Job Tasks ({activeJobTasks.length})</span>
                  <span className="text-zinc-500">{taskModalJob.completedTasks}/{taskModalJob.totalTasks} Done</span>
                </div>

                {activeJobTasks.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 italic text-xs">
                    No tasks created yet for this job.
                  </div>
                ) : (
                  activeJobTasks.map(task => {
                    const isDone = isTaskCompleted(task);
                    const isSelected = task.id === activeTaskId;
                    const photoCount = Array.isArray(task.photos) ? task.photos.length : 0;
                    const noteCount = Array.isArray(task.task_notes) ? task.task_notes.length : (task.notes ? 1 : 0);

                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => handleSelectTaskInDrawer(task)}
                        className={cn(
                          "w-full text-left p-3 rounded-2xl border transition-all cursor-pointer block",
                          isSelected
                            ? "bg-indigo-600/15 border-indigo-500 text-white shadow-md"
                            : "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-xs line-clamp-1">{task.title || task.name}</span>
                          <span className={cn(
                            "text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                            isDone ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                          )}>
                            {isDone ? 'Done' : 'Active'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2 text-[10px] text-zinc-400 font-mono">
                          <span>{parseFloat(task.bookTime || '1.0').toFixed(1)}h Book</span>
                          <span className="flex items-center gap-2">
                            {noteCount > 0 && <span>📝 {noteCount}</span>}
                            {photoCount > 0 && <span>📸 {photoCount}</span>}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Right Column: Task Notes & Photos Editor (8 cols) */}
              <div className="md:col-span-8 p-4 sm:p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                {activeTask ? (
                  <>
                    {/* Task Title & Status Header */}
                    <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                          Task Details • {parseFloat(activeTask.bookTime || '1.0').toFixed(1)}h Book Time
                        </span>
                        <h2 className="text-base font-black text-white mt-0.5">
                          {activeTask.title || activeTask.name}
                        </h2>
                      </div>
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                        isTaskCompleted(activeTask) ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                      )}>
                        {activeTask.status || 'In Bay'}
                      </span>
                    </div>

                    {/* Section 1: Office Notes & Work Instructions (Editable) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Office Instructions for Technicians</span>
                        </label>
                        <span className="text-[10px] text-zinc-500">Visible on Bay Terminal</span>
                      </div>
                      <textarea
                        rows={3}
                        value={officeNotesInput}
                        onChange={(e) => setOfficeNotesInput(e.target.value)}
                        placeholder="Add specific installation instructions, customer requests, or part notes..."
                        className="w-full p-3 bg-zinc-900/90 border border-zinc-700/80 rounded-2xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-inner"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleSaveOfficeNotes}
                          disabled={isSavingNote}
                          className="h-8 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          {isSavingNote ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Save Office Notes</span>
                        </button>
                      </div>
                    </div>

                    {/* Section 2: Photos & Reference Diagrams */}
                    <div className="space-y-3 pt-4 border-t border-zinc-800">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Task Photos & Reference Diagrams ({Array.isArray(activeTask.photos) ? activeTask.photos.length : 0})</span>
                        </label>
                      </div>

                      {/* Photo Upload & URL Inputs */}
                      <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <input
                              type="file"
                              accept="image/*"
                              ref={fileInputRef}
                              onChange={handlePhotoFileUpload}
                              className="hidden"
                              id="office-photo-upload"
                            />
                            <label
                              htmlFor="office-photo-upload"
                              className="h-10 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 w-full"
                            >
                              <Camera className="w-4 h-4 text-indigo-400" />
                              <span>{isUploadingPhoto ? 'Uploading Photo...' : 'Upload Photo / Diagram'}</span>
                            </label>
                          </div>

                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={photoUrlInput}
                              onChange={(e) => setPhotoUrlInput(e.target.value)}
                              placeholder="Paste Image URL / CompanyCam link..."
                              className="h-10 px-3 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1"
                            />
                            <button
                              type="button"
                              onClick={handleAttachPhotoUrl}
                              disabled={!photoUrlInput.trim() || isUploadingPhoto}
                              className="h-10 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                            >
                              Attach
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          value={photoCaptionInput}
                          onChange={(e) => setPhotoCaptionInput(e.target.value)}
                          placeholder="Optional photo caption (e.g. Passenger antenna placement requirement)..."
                          className="w-full h-8 px-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Photo Gallery Grid */}
                      {Array.isArray(activeTask.photos) && activeTask.photos.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          {activeTask.photos.map((photo: any) => (
                            <div
                              key={photo.id || photo.url}
                              className="group relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900/80 aspect-video shadow-md"
                            >
                              <img
                                src={photo.url}
                                alt={photo.caption || 'Task photo'}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                                <div className="flex justify-end gap-1">
                                  <button
                                    onClick={() => setPreviewPhotoUrl(photo.url)}
                                    className="p-1 rounded bg-black/60 text-white hover:text-indigo-400"
                                    title="View Full Size"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePhoto(photo.id)}
                                    className="p-1 rounded bg-black/60 text-rose-400 hover:text-rose-300"
                                    title="Remove Photo"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="text-[10px] text-white font-semibold truncate">
                                  {photo.caption || 'Photo'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-zinc-500 text-xs italic">
                          No photos or diagrams attached to this task yet.
                        </div>
                      )}
                    </div>

                    {/* Section 3: Tech Notes & Activity Stream */}
                    <div className="space-y-3 pt-4 border-t border-zinc-800">
                      <label className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Technician Progress Logs & Notes</span>
                      </label>

                      <div className="space-y-2">
                        {Array.isArray(activeTask.task_notes) && activeTask.task_notes.length > 0 ? (
                          activeTask.task_notes.map((note: any) => (
                            <div
                              key={note.id}
                              className={cn(
                                "p-3 rounded-2xl border text-xs space-y-1",
                                note.isOfficeNote 
                                  ? "bg-indigo-500/10 border-indigo-500/30 text-zinc-200" 
                                  : "bg-zinc-900 border-zinc-800 text-zinc-300"
                              )}
                            >
                              <div className="flex items-center justify-between text-[10px] text-zinc-400 font-semibold">
                                <span className="font-bold text-white flex items-center gap-1">
                                  <span>{note.authorName || 'Staff'}</span>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{note.authorRole || 'Log'}</span>
                                </span>
                                <span className="font-mono">
                                  {note.createdAt ? new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-200 font-medium leading-relaxed">
                                {note.text}
                              </p>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-3 text-zinc-500 text-xs italic">
                            No tech notes logged yet.
                          </div>
                        )}
                      </div>

                      {/* Append Note Input */}
                      <div className="flex gap-2 pt-2">
                        <input
                          type="text"
                          value={newTechNoteInput}
                          onChange={(e) => setNewTechNoteInput(e.target.value)}
                          placeholder="Log a progress note or remark..."
                          className="h-9 px-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1"
                        />
                        <button
                          type="button"
                          onClick={handleAddTechNote}
                          disabled={!newTechNoteInput.trim() || isSavingNote}
                          className="h-9 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 border border-zinc-700"
                        >
                          <Send className="w-3 h-3 text-indigo-400" />
                          <span>Post Note</span>
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-16 text-zinc-500 text-xs italic">
                    Select a task from the list on the left to view and edit notes and photos.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK ADD TASK MODAL                                                      */}
      {/* ========================================================================= */}
      {isAddingTask && taskModalJob && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-black text-white">Add Task to #{taskModalJob.jobNumber}</h3>
              <button
                onClick={() => setIsAddingTask(false)}
                className="w-8 h-8 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Task Title</label>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="e.g. Install Whelen Siren & Speaker"
                  className="w-full h-10 px-3 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Book Time (Hours)</label>
                <input
                  type="number"
                  step="0.25"
                  value={newTaskBookTime}
                  onChange={(e) => setNewTaskBookTime(e.target.value)}
                  className="w-full h-10 px-3 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Office Instructions</label>
                <textarea
                  rows={2}
                  value={newTaskOfficeNotes}
                  onChange={(e) => setNewTaskOfficeNotes(e.target.value)}
                  placeholder="Instructions for the technician..."
                  className="w-full p-2.5 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsAddingTask(false)}
                className="h-9 px-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNewTask}
                disabled={!newTaskTitle.trim() || isCreatingTask}
                className="h-9 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-md"
              >
                {isCreatingTask ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Create Task</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FULL PHOTO PREVIEW MODAL                                                  */}
      {/* ========================================================================= */}
      {previewPhotoUrl && (
        <div 
          onClick={() => setPreviewPhotoUrl(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-150"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl">
            <img 
              src={previewPhotoUrl} 
              alt="Preview" 
              className="w-full h-full object-contain max-h-[85vh]"
            />
            <button
              onClick={() => setPreviewPhotoUrl(null)}
              className="absolute top-4 right-4 w-9 h-9 rounded-2xl bg-black/70 text-white flex items-center justify-center font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* INTERACTIVE PRODUCTION DEADLINE ADJUSTMENT MODAL                          */}
      {/* ========================================================================= */}
      {editingDeadlineJob && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Pace & Scheduling Engine</span>
                <h3 className="text-base font-black text-white mt-0.5">
                  Adjust Delivery Deadline • #{editingDeadlineJob.jobNumber}
                </h3>
              </div>
              <button
                onClick={() => setEditingDeadlineJob(null)}
                className="w-8 h-8 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Current Work Scope Snapshot */}
            <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-zinc-300">
                <span>Remaining Book Time:</span>
                <span className="font-mono font-black text-white">{editingDeadlineJob.remainingBookHours.toFixed(1)} Hours</span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Assigned Staff:</span>
                <span className="font-bold text-indigo-400">
                  {editingDeadlineJob.assignedStaffList.map((s: any) => s.name).join(', ') || '1 Tech (Default)'}
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Realistic Earliest ETA:</span>
                <span className="font-mono font-black text-emerald-400">{editingDeadlineJob.etaString}</span>
              </div>
            </div>

            {/* Quick 1-Click Presets */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase text-zinc-400 tracking-wider">Quick Presets</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyPreset('today_end')}
                  disabled={isUpdatingDeadline}
                  className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 text-left transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <div className="text-white font-bold">Today 4:30 PM</div>
                  <div className="text-[10px] text-zinc-500">End of Shift Today</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('tomorrow_noon')}
                  disabled={isUpdatingDeadline}
                  className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 text-left transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <div className="text-white font-bold">Tomorrow 12:00 PM</div>
                  <div className="text-[10px] text-zinc-500">Midday Tomorrow</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('tomorrow_end')}
                  disabled={isUpdatingDeadline}
                  className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 text-left transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <div className="text-white font-bold">Tomorrow 4:30 PM</div>
                  <div className="text-[10px] text-zinc-500">End of Shift Tomorrow</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('friday_end')}
                  disabled={isUpdatingDeadline}
                  className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 text-left transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <div className="text-white font-bold">Friday 4:30 PM</div>
                  <div className="text-[10px] text-zinc-500">End of Week Delivery</div>
                </button>
              </div>
            </div>

            {/* Custom Date & Time Picker */}
            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
              <label className="text-[11px] font-black uppercase text-zinc-400 tracking-wider">Custom Target Deadline</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={customDeadlineDate}
                  onChange={(e) => setCustomDeadlineDate(e.target.value)}
                  className="h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="time"
                  value={customDeadlineTime}
                  onChange={(e) => setCustomDeadlineTime(e.target.value)}
                  className="h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingDeadlineJob(null)}
                className="h-10 px-4 rounded-xl text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyCustomDeadline}
                disabled={isUpdatingDeadline}
                className="h-10 px-5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isUpdatingDeadline ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save Deadline</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONFIRMATION MODAL: CUSTOMER PICKED UP                                    */}
      {/* ========================================================================= */}
      {confirmPickupJob && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setConfirmPickupJob(null)}
        >
          <div 
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase text-zinc-100">Confirm Customer Pickup</h3>
                <p className="text-xs text-zinc-400">Complete job & mark vehicle with customer</p>
              </div>
            </div>

            <div className="p-3.5 bg-zinc-950/80 rounded-2xl border border-zinc-800/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 font-medium">Job Number:</span>
                <span className="font-mono font-black text-indigo-400">#{confirmPickupJob.jobNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 font-medium">Customer:</span>
                <span className="font-bold text-zinc-100 truncate max-w-[220px]">{confirmPickupJob.customerName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 font-medium">Vehicle:</span>
                <span className="font-semibold text-zinc-200 truncate max-w-[220px]">{confirmPickupJob.vehicleInfo}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 font-medium">Current Location:</span>
                <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                  {confirmPickupJob.locationName || 'Front 1'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 leading-relaxed">
              💡 <strong>Note:</strong> Marking as picked up will complete the job and clear the parking spot. You can always <strong>undo this change</strong> anytime at the bottom of the page in the <em>Jobs With Customer</em> section.
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmPickupJob(null)}
                className="h-9 px-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeCustomerPickedUp}
                disabled={isPickingUpJobId === confirmPickupJob.id}
                className="h-9 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isPickingUpJobId === confirmPickupJob.id ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Confirm Picked Up</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* V3 RELOCATE VEHICLE / SHOP LOCATION & WORK BAY PICKER MODAL              */}
      {/* ========================================================================= */}
      {editingLocationJob && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setEditingLocationJob(null)}
        >
          <div 
            className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-3.5 shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-zinc-100">
                    Relocate Vehicle • #{editingLocationJob.jobNumber}
                  </h3>
                  <p className="text-[11px] text-zinc-400 truncate max-w-[280px]">
                    {editingLocationJob.customerName} — {editingLocationJob.vehicleInfo}
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setEditingLocationJob(null)} 
                className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setZoneFilterType('all')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer",
                      zoneFilterType === 'all' ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    All ({enrichedZones.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoneFilterType('bays')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer",
                      zoneFilterType === 'bays' ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    Work Bays ({enrichedZones.filter(z => z.isBay).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoneFilterType('lot')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer",
                      zoneFilterType === 'lot' ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    Yard & Lot ({enrichedZones.filter(z => !z.isBay).length})
                  </button>
                </div>

                <div className="relative flex-1 min-w-[130px]">
                  <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={zoneSearch}
                    onChange={(e) => setZoneSearch(e.target.value)}
                    placeholder="Search bays, spots, jobs..."
                    className="w-full h-8 pl-7 pr-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-[11px] placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Zones & Live Occupancy List */}
            <div className="space-y-2 overflow-y-auto pr-1 flex-1">
              {/* Unassigned Spot Card */}
              <div
                onClick={() => !isUpdatingLocation && handleUpdateLocation('')}
                className={cn(
                  "p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3",
                  !editingLocationJob.locationName || editingLocationJob.locationName === 'Unassigned'
                    ? "bg-zinc-800 border-amber-500 shadow-sm ring-1 ring-amber-500/30"
                    : "bg-zinc-950/70 border-zinc-800 hover:border-zinc-700"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg">⚪</span>
                  <div>
                    <div className="text-xs font-bold text-zinc-100">Unassigned / Float</div>
                    <div className="text-[10px] text-zinc-500">Clear vehicle bay assignment</div>
                  </div>
                </div>
                {(!editingLocationJob.locationName || editingLocationJob.locationName === 'Unassigned') && (
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                )}
              </div>

              {/* With Customer Card */}
              <div
                onClick={() => !isUpdatingLocation && handleUpdateLocation('With Customer')}
                className={cn(
                  "p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3",
                  editingLocationJob.locationName === 'With Customer'
                    ? "bg-blue-500/10 border-blue-500 shadow-md ring-1 ring-blue-500/30"
                    : "bg-zinc-950/70 border-zinc-800 hover:border-blue-500/50"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg">🤝</span>
                  <div>
                    <div className="text-xs font-bold text-blue-300">With Customer</div>
                    <div className="text-[10px] text-zinc-500">Vehicle off-site • Not on shop lot</div>
                  </div>
                </div>
                {editingLocationJob.locationName === 'With Customer' && (
                  <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                )}
              </div>

              {enrichedZones
                .filter(z => {
                  if (zoneFilterType === 'bays' && !z.isBay) return false;
                  if (zoneFilterType === 'lot' && z.isBay) return false;
                  if (zoneSearch.trim()) {
                    const query = zoneSearch.toLowerCase();
                    const matchesName = z.name?.toLowerCase().includes(query) || z.code?.toLowerCase().includes(query);
                    const matchesOccupant = z.occupantDetails && (
                      z.occupantDetails.jobNumber?.toLowerCase().includes(query) ||
                      z.occupantDetails.customerName?.toLowerCase().includes(query) ||
                      z.occupantDetails.vehicle?.toLowerCase().includes(query)
                    );
                    return matchesName || matchesOccupant;
                  }
                  return true;
                })
                .map((z) => {
                  const isCurrent = z.isCurrentJobAssigned;
                  return (
                    <div
                      key={z.id}
                      onClick={() => !isUpdatingLocation && handleUpdateLocation(z.name || z.code)}
                      className={cn(
                        "p-3 rounded-2xl border transition cursor-pointer flex flex-col justify-between gap-2 group",
                        isCurrent
                          ? "bg-indigo-500/10 border-indigo-500 shadow-md ring-1 ring-indigo-500/30"
                          : z.isOccupied
                            ? "bg-zinc-950/80 border-rose-500/30 hover:border-rose-500/60"
                            : "bg-zinc-950/70 border-zinc-800 hover:border-amber-500/50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {z.isBay ? <Warehouse className="w-4 h-4 text-amber-400 shrink-0" /> : <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />}
                          <span className="text-xs font-black text-zinc-100 truncate">{z.name || z.code}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-bold uppercase shrink-0">
                            {z.isBay ? 'Work Bay' : 'Yard Spot'}
                          </span>
                        </div>

                        {isCurrent ? (
                          <div className="flex items-center gap-1 text-[10px] font-black uppercase text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 shrink-0">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Assigned</span>
                          </div>
                        ) : z.isOccupied ? (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 shrink-0">
                            <span>Occupied</span>
                          </div>
                        ) : (
                          <div className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
                            Available
                          </div>
                        )}
                      </div>

                      {/* Occupant details if occupied by another vehicle */}
                      {z.occupantDetails && !isCurrent && (
                        <div className="text-[10px] text-zinc-400 bg-zinc-900/90 p-1.5 px-2 rounded-xl border border-zinc-800 flex items-center justify-between gap-2">
                          <span className="text-rose-300 font-bold font-mono">#{z.occupantDetails.jobNumber}</span>
                          <span className="truncate text-zinc-300">{z.occupantDetails.customerName}</span>
                          <span className="text-zinc-500 truncate">{z.occupantDetails.vehicle}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📦 REQUESTED PARTS DETAIL MODAL DIALOG                                    */}
      {/* ========================================================================= */}
      {viewingPartsModalJob && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-950 border border-amber-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <span className="text-[10px] uppercase font-black text-amber-400 tracking-wider flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  <span>Requested Parts ({viewingPartsModalJob.partsRequestCount})</span>
                </span>
                <h3 className="text-base font-black text-white mt-0.5">
                  #{viewingPartsModalJob.jobNumber} • {viewingPartsModalJob.customerName}
                </h3>
              </div>
              <button
                onClick={() => setViewingPartsModalJob(null)}
                className="w-8 h-8 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-xs flex items-center justify-between">
              <div>
                <span className="text-zinc-400">Vehicle:</span> <span className="text-zinc-100 font-bold">{viewingPartsModalJob.vehicleInfo}</span>
              </div>
              <div className="font-mono text-zinc-400 text-[11px]">
                VIN: {viewingPartsModalJob.vinNumber}
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {viewingPartsModalJob.jobParts && viewingPartsModalJob.jobParts.length > 0 ? (
                viewingPartsModalJob.jobParts.map((p: any, idx: number) => {
                  const partName = p.partName || p.description || p.name || p.partNumber || 'Requested Part';
                  const partNumber = p.partNumber || p.sku || p.pn || '';
                  const qty = p.quantity || p.qty || 1;
                  const status = String(p.status || 'pending').toLowerCase();
                  const techName = p.requestedByName || p.requestedBy || p.techName || p.userName || '';

                  return (
                    <div key={p.id || idx} className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-zinc-100 text-xs">
                            {partName}
                          </div>
                          {partNumber && (
                            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                              Part #: {partNumber}
                            </div>
                          )}
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border shrink-0",
                          status.includes('ordered') || status.includes('transit')
                            ? "bg-blue-500/20 border-blue-500/30 text-blue-300"
                            : status.includes('staged') || status.includes('ready') || status.includes('received')
                              ? "bg-purple-500/20 border-purple-500/30 text-purple-300"
                              : "bg-amber-500/20 border-amber-500/30 text-amber-300"
                        )}>
                          {status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1.5 border-t border-zinc-800 font-mono">
                        <span>Quantity: <strong className="text-zinc-200">{qty}</strong></span>
                        {techName && <span>Requested by: <strong className="text-zinc-200">{techName}</strong></span>}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-zinc-500 italic text-xs">
                  No active pending parts requests recorded for this job.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setViewingPartsModalJob(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ⚠️ PRODUCTION BLOCKER DETAIL MODAL DIALOG                                */}
      {/* ========================================================================= */}
      {viewingBlockerModalJob && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-950 border border-rose-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <span className="text-[10px] uppercase font-black text-rose-400 tracking-wider flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>Active Production Blocker</span>
                </span>
                <h3 className="text-base font-black text-white mt-0.5">
                  #{viewingBlockerModalJob.jobNumber} • {viewingBlockerModalJob.customerName}
                </h3>
              </div>
              <button
                onClick={() => setViewingBlockerModalJob(null)}
                className="w-8 h-8 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-xs flex items-center justify-between">
              <div>
                <span className="text-zinc-400">Vehicle:</span> <span className="text-zinc-100 font-bold">{viewingBlockerModalJob.vehicleInfo}</span>
              </div>
              <div className="font-mono text-zinc-400 text-[11px]">
                VIN: {viewingBlockerModalJob.vinNumber}
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {viewingBlockerModalJob.blockers && viewingBlockerModalJob.blockers.length > 0 ? (
                viewingBlockerModalJob.blockers.map((b: any, idx: number) => (
                  <div key={b.id || idx} className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 space-y-1.5">
                    <div className="font-black text-rose-300 text-xs">
                      {b.reason || b.title || b.type || 'Production Blocker'}
                    </div>
                    {(b.notes || b.message || b.description) && (
                      <div className="text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
                        {b.notes || b.message || b.description}
                      </div>
                    )}
                    {b.createdByName && (
                      <div className="text-[10px] text-zinc-400 pt-1 border-t border-rose-500/20 font-mono">
                        Logged by: {b.createdByName}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-xs text-zinc-200 leading-relaxed">
                  {viewingBlockerModalJob.activeBlockerMessage || 'Job flagged as blocked on the shop floor.'}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setViewingBlockerModalJob(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🖨️ JOB DETAILS REPORT PRINT MODAL (1-Click Print From Overview Sheet)     */}
      {/* ========================================================================= */}
      {printJobModalData.isOpen && (
        <JobDetailsReportPrintModal
          isOpen={printJobModalData.isOpen}
          onClose={() => setPrintJobModalData({ isOpen: false, jobId: '' })}
          jobId={printJobModalData.jobId}
          tenantId={tenantId}
          initialJobData={printJobModalData.jobData}
        />
      )}

    </div>
  );
}
