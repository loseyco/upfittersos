import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  doc, onSnapshot, collection, query, where, updateDoc, addDoc, setDoc, deleteDoc, serverTimestamp, getDocs, limit, orderBy 
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebase/config';
import { 
  ArrowLeft, MapPin, Car, AlertCircle,
  Package, Copy, Check, Edit3, Smartphone, X, AlertTriangle,
  Camera, ExternalLink,
  ChevronRight, ChevronDown, Plus, Layers,
  Printer, Upload, MessageSquare, Timer,
  RefreshCw, ZoomIn, TrendingDown, TrendingUp, Activity, Search,
  CheckCircle2, Warehouse, LayoutDashboard, ClipboardCheck,
  Pencil, Trash2, Play, Square, CornerDownLeft,
  Wrench, Clock, FileText, Users, ShieldCheck
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth/store';
import { setPreferredJobViewVersion } from '../../lib/utils/window';
import { toast } from 'sonner';
import { JobChat } from './components/JobChat';
import { PartsRequestModal } from './PartsRequestModal';
import { LogoQRCode } from '../../components/LogoQRCode';
import { TaskTitleAutocomplete } from './TaskTitleAutocomplete';
import { useJobClock } from '../timeclock/useJobClock';
import { SearchableStaffMultiPicker } from './components/SearchableStaffMultiPicker';

const getConditionPrintColor = (condition: string) => {
  switch(condition) {
    case 'Good': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'Broken': return 'text-rose-700 bg-rose-50 border-rose-200';
    case 'Missing Parts': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Needs Repair': return 'text-orange-700 bg-orange-50 border-orange-200';
    default: return 'text-zinc-700 bg-zinc-50 border-zinc-200';
  }
};

// Safe Date Formatting Helper - Prevents "Invalid Date"
function formatDateSafe(val: any, includeTime: boolean = false): string {
  if (!val) return 'N/A';
  try {
    let d: Date | null = null;
    if (typeof val === 'object' && 'seconds' in val && typeof val.seconds === 'number') {
      d = new Date(val.seconds * 1000);
    } else if (typeof val === 'object' && 'toDate' in val && typeof val.toDate === 'function') {
      d = val.toDate();
    } else if (val instanceof Date) {
      d = val;
    } else if (typeof val === 'string' || typeof val === 'number') {
      d = new Date(val);
    }

    if (!d || isNaN(d.getTime())) return 'N/A';

    return includeTime 
      ? d.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
  } catch (err) {
    return 'N/A';
  }
}

// Convert any Firestore timestamp / ISO / Date safely into milliseconds
function parseTimestampMs(val: any): number {
  if (!val) return 0;
  if (typeof val === 'object' && 'seconds' in val && typeof val.seconds === 'number') {
    return val.seconds * 1000;
  }
  if (typeof val === 'object' && 'toDate' in val && typeof val.toDate === 'function') {
    return val.toDate().getTime();
  }
  if (val instanceof Date) {
    return val.getTime();
  }
  const parsed = new Date(val).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

// Canonical Staff Resolver (Deduplicates Multiple Accounts / Staff Docs into 1 Identity)
function getCanonicalStaff(rawStaff: any, allStaff: any[] = []): { id: string; name: string; email: string } {
  if (!rawStaff) return { id: 'unassigned', name: 'Unassigned', email: '' };

  const rawId = rawStaff.id || rawStaff.staffId || rawStaff.userId || rawStaff.uid || '';
  const rawEmail = (rawStaff.email || '').toLowerCase().trim();
  const rawName = (rawStaff.name || rawStaff.displayName || '').trim();

  // 1. Direct ID match
  const matchedById = allStaff.find(s => s.id === rawId || s.userId === rawId || s.uid === rawId);
  if (matchedById) {
    return {
      id: matchedById.id,
      name: matchedById.name || matchedById.displayName || rawName || 'Technician',
      email: (matchedById.email || rawEmail || '').toLowerCase()
    };
  }

  // 2. Direct Email match
  if (rawEmail) {
    const matchedByEmail = allStaff.find(s => (s.email || '').toLowerCase().trim() === rawEmail);
    if (matchedByEmail) {
      return {
        id: matchedByEmail.id,
        name: matchedByEmail.name || matchedByEmail.displayName || rawName || 'Technician',
        email: rawEmail
      };
    }
  }

  // 3. Direct Name match
  if (rawName && rawName.toLowerCase() !== 'technician' && rawName.toLowerCase() !== 'unassigned') {
    const matchedByName = allStaff.find(s => (s.name || s.displayName || '').toLowerCase().trim() === rawName.toLowerCase());
    if (matchedByName) {
      return {
        id: matchedByName.id,
        name: matchedByName.name || matchedByName.displayName || rawName,
        email: (matchedByName.email || rawEmail || '').toLowerCase()
      };
    }
  }

  // 4. Stable Fallback
  return {
    id: rawId || (rawEmail ? `email_${rawEmail}` : (rawName ? `name_${rawName.replace(/\s+/g, '_')}` : 'unassigned')),
    name: rawName || 'Technician',
    email: rawEmail
  };
}

export function JobDetailPageV3({ 
  tenantId, 
  setDynamicTitle 
}: { 
  tenantId: string; 
  setDynamicTitle?: (title: string | null) => void; 
}) {
  const { '*': splat } = useParams();
  const pathParts = (splat || '').split('/').filter(Boolean);
  const jobId = pathParts[1] || '';

  const navigate = useNavigate();
  const { user, impersonatedStaff, isSuperAdmin, permissions } = useAuthStore();
  const effectiveUserId = impersonatedStaff?.id || user?.uid || '';
  const canManageTasks = isSuperAdmin || permissions['tasks.manage'] || permissions['jobs.manage'] || permissions['foreman.view'] || permissions['office.view'];
  const { clockIntoJob, clockOutOfJob, isProcessing: isClockingJob } = useJobClock(tenantId);

  // Tab State
  const [activeTab, setActiveTab] = useState<
    'overview' | 'tasks' | 'qc' | 'photos' | 'parts' | 'staff' | 'history' | 'chat' | 'takeoffs' | 'timelog' | 'telemetry'
  >('overview');
  const [taskSubTab, setTaskSubTab] = useState<'tasks' | 'takeoffs'>('tasks');
  const [staffSubTab, setStaffSubTab] = useState<'roster' | 'timelog' | 'telemetry'>('roster');

  // Core Firestore Subscriptions State
  const [job, setJob] = useState<any>(null);
  const [allStaff, setAllStaff] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [taskDefaults, setTaskDefaults] = useState<Record<string, number>>({});
  const [qbItems, setQbItems] = useState<any[]>([]);
  const [vehicle, setVehicle] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [takeoffs, setTakeoffs] = useState<any[]>([]);
  const [timeSessions, setTimeSessions] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [nativePhotos, setNativePhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Clean Logged-in Staff Attribution
  const currentStaffMember = useMemo(() => {
    return allStaff.find(s => 
      s.id === effectiveUserId || 
      s.userId === effectiveUserId || 
      s.uid === effectiveUserId || 
      (user?.email && s.email && s.email.toLowerCase() === user.email.toLowerCase())
    );
  }, [allStaff, effectiveUserId, user?.email]);

  const effectiveStaffName = useMemo(() => {
    if (impersonatedStaff?.name) return impersonatedStaff.name;
    if (currentStaffMember) {
      const combined = `${currentStaffMember.firstName || ''} ${currentStaffMember.lastName || ''}`.trim();
      return combined || currentStaffMember.displayName || currentStaffMember.name || currentStaffMember.fullName || (user?.displayName || user?.email?.split('@')[0] || 'Staff');
    }
    return user?.displayName || user?.email?.split('@')[0] || 'Staff';
  }, [currentStaffMember, impersonatedStaff, user]);

  const effectiveStaffId = currentStaffMember?.id || effectiveUserId;

  // Quick Task Creation State (with automatic defaults & multi-staff memory)
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskBookTime, setNewTaskBookTime] = useState<string | number>('');
  const [newTaskDeptId, setNewTaskDeptId] = useState<string>('');
  const [newTaskStaffIds, setNewTaskStaffIds] = useState<string[]>([]);
  const [lastDepartmentId, setLastDepartmentId] = useState<string>('');
  const [lastAssignedStaffIds, setLastAssignedStaffIds] = useState<string[]>([]);
  const [isAddingTask, setIsAddingTask] = useState(false);

  // Task Edit Modal State
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDesc, setEditTaskDesc] = useState('');
  const [editTaskBookTime, setEditTaskBookTime] = useState<string | number>('');
  const [editTaskDeptId, setEditTaskDeptId] = useState('');
  const [editTaskStaffIds, setEditTaskStaffIds] = useState<string[]>([]);
  const [isSavingTaskEdit, setIsSavingTaskEdit] = useState(false);
  const [clockingTaskState, setClockingTaskState] = useState<{ id: string; action: 'in' | 'out' } | null>(null);

  // CompanyCam Photos State
  const [companyCamPhotos, setCompanyCamPhotos] = useState<any[]>([]);
  const [loadingCcPhotos, setLoadingCcPhotos] = useState<boolean>(false);
  const [isSyncToCcOpen, setIsSyncToCcOpen] = useState(false);
  const [selectedPhotosForCcSync, setSelectedPhotosForCcSync] = useState<string[]>([]);
  const [isSyncingToCc, setIsSyncingToCc] = useState(false);
  const [isBidirectionalSyncing, setIsBidirectionalSyncing] = useState(false);
  const [photoFilterTab, setPhotoFilterTab] = useState<'all' | 'upfitters' | 'companycam' | 'unsynced'>('all');

  // Task Drawer / Modal State
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [selectedTaskCategory, setSelectedTaskCategory] = useState<string>('all');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Cross-Job Historical Task Reference Photos State
  const [historicalRefPhotos, setHistoricalRefPhotos] = useState<any[]>([]);
  const [taskRefPhotoCounts, setTaskRefPhotoCounts] = useState<Record<string, number>>({});
  const [loadingRefPhotos, setLoadingRefPhotos] = useState<boolean>(false);
  const [refFilter, setRefFilter] = useState<'all' | 'vehicle' | 'customer'>('all');

  // Parts Request Modal State
  const [isPartRequestOpen, setIsPartRequestOpen] = useState(false);
  const [selectedTaskForPart, setSelectedTaskForPart] = useState<any>(null);

  // Print Modals
  const [showReportModal, setShowReportModal] = useState(false);
  const [isPrintTravelerOpen, setIsPrintTravelerOpen] = useState(false);
  const [isEtaTrendModalOpen, setIsEtaTrendModalOpen] = useState(false);
  const [businessName, setBusinessName] = useState<string>('Business');
  const [businessLogo, setBusinessLogo] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);

  // Comprehensive Job Edit Modal State
  const [isJobEditOpen, setIsJobEditOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    title: '',
    jobNumber: '',
    customerName: '',
    vehicleYear: '',
    vehicleMake: '',
    vehicleModel: '',
    vin: '',
    stockNumber: '',
    unitNumber: '',
    purchaseOrderNumber: '',
    salesOrderNumber: '',
    scheduledEndDate: '',
    priority: 'Normal',
    status: 'In Bay',
    parkingSpot: '',
    companyCamId: '',
    description: '',
    notes: ''
  });

  // Lightbox Modal
  const [activeLightboxPhoto, setActiveLightboxPhoto] = useState<any>(null);

  // Copy state
  const [copiedVin, setCopiedVin] = useState(false);

  // Modal / Drawer state for PWA controls
  const [spotModalOpen, setSpotModalOpen] = useState(false);
  const [newLocationSpot, setNewLocationSpot] = useState('');
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [isEditLocationPickerOpen, setIsEditLocationPickerOpen] = useState(false);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  
  // QC System & Kickback Inspection States
  const [qcFilter, setQcFilter] = useState<'all' | 'awaiting_qc' | 'qc_passed' | 'rework'>('all');
  const [qcKickbackModalTask, setQcKickbackModalTask] = useState<any | null>(null);
  const [qcKickbackTaskReason, setQcKickbackTaskReason] = useState('');
  const [isQCPassingTaskId, setIsQCPassingTaskId] = useState<string | null>(null);
  const [isBulkQCPassing, setIsBulkQCPassing] = useState(false);
  const [kickbackModalOpen, setKickbackModalOpen] = useState(false);
  const [kickbackReason, setKickbackReason] = useState('');

  // Blocker Management State
  const [isBlockerModalOpen, setIsBlockerModalOpen] = useState(false);
  const [newBlockerMsg, setNewBlockerMsg] = useState('');
  const [isAddingBlocker, setIsAddingBlocker] = useState(false);
  const [resolvingBlockerId, setResolvingBlockerId] = useState<string | null>(null);

  // Shop Location & Bay Picker Search & Filter State
  const [zoneSearch, setZoneSearch] = useState('');
  const [zoneFilterType, setZoneFilterType] = useState<'all' | 'bays' | 'lot'>('all');

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // 1. Subscribe to live Firestore Job details
  useEffect(() => {
    if (!tenantId || !jobId) return;

    const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
    const unsub = onSnapshot(jobRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const fullJob = { id: docSnap.id, ...data };
        setJob(fullJob);

        let dateStr = '';
        if (data.scheduledEndDate) {
          try {
            const d = typeof data.scheduledEndDate === 'object' && 'seconds' in data.scheduledEndDate
              ? new Date(data.scheduledEndDate.seconds * 1000)
              : new Date(data.scheduledEndDate);
            if (!isNaN(d.getTime())) {
              dateStr = d.toISOString().split('T')[0];
            }
          } catch (e) {
            // ignore
          }
        }

        const loc = data.parkingSpot || data.location || data.bayId || '';
        const isInBayLocation = Boolean(data.bayId || (loc && loc.toLowerCase().includes('bay')));
        const resolvedInitialStatus = (data.status && data.status !== 'Pending') 
          ? data.status 
          : isInBayLocation 
            ? 'In Bay' 
            : (data.status || 'Pending');

        setEditFormData({
          title: data.title || '',
          jobNumber: data.jobNumber || data.jobName || data.number || data.ListID || '',
          customerName: data.customerName || data.company || data.customer || '',
          vehicleYear: data.vehicleYear || '',
          vehicleMake: data.vehicleMake || '',
          vehicleModel: data.vehicleModel || '',
          vin: data.vin || data.vehicleId || '',
          stockNumber: data.stockNumber || '',
          unitNumber: data.unitNumber || '',
          purchaseOrderNumber: data.purchaseOrderNumber || data.poNumber || '',
          salesOrderNumber: data.salesOrderNumber || data.soNumber || '',
          scheduledEndDate: dateStr,
          priority: data.priority || 'Normal',
          status: resolvedInitialStatus,
          parkingSpot: loc,
          companyCamId: data.companyCamId || data.companyCamProjectId || '',
          description: data.description || '',
          notes: data.notes || ''
        });
        if (setDynamicTitle) {
          const num = data.jobNumber || data.jobName || data.number || data.ListID || 'Job';
          setDynamicTitle(`#${num} - ${data.title || 'Details'}`);
        }
      } else {
        setJob(null);
      }
      setLoading(false);
    }, (err) => {
      console.warn("Job V3 listener error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [tenantId, jobId, setDynamicTitle]);

  // 2. Subscribe to Business Staff Roster, Departments & Zones
  useEffect(() => {
    if (!tenantId) return;
    const staffRef = collection(db, 'businesses', tenantId, 'staff');
    const unsubStaff = onSnapshot(staffRef, (snap) => {
      const activeStaff = snap.docs
        .map(d => {
          const data = d.data();
          const name = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.displayName || data.name || data.fullName;
          return { id: d.id, ...data, name };
        })
        .filter((s: any) => 
          !s.isArchived && 
          !s.fireDate && 
          !s.isDeviceAccount && 
          s.status !== 'inactive' && 
          s.status !== 'archived' && 
          s.status !== 'fired' && 
          s.status !== 'terminated' &&
          s.active !== false
        );
      setAllStaff(activeStaff);
    }, (err) => console.warn("Staff listener suppressed:", err));

    const unsubDepts = onSnapshot(collection(db, `businesses/${tenantId}/departments`), (snap) => {
      const depts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDepartments(depts);
      // Auto-default department to "Upfitters"
      const upfitterDept = depts.find((d: any) => {
        const name = (d.name || d.title || d.id || '').toLowerCase();
        return name === 'upfitters' || name === 'upfitting' || name.includes('upfit');
      });
      if (upfitterDept) {
        setLastDepartmentId(prev => prev || upfitterDept.id);
        setNewTaskDeptId(prev => prev || upfitterDept.id);
      } else if (depts.length > 0) {
        setLastDepartmentId(prev => prev || depts[0].id);
        setNewTaskDeptId(prev => prev || depts[0].id);
      }
    }, (err) => console.warn("Departments listener suppressed:", err));

    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Zones listener suppressed:", err));

    const unsubDefaults = onSnapshot(collection(db, `businesses/${tenantId}/task_defaults`), (snap) => {
      const defs: Record<string, number> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.title && typeof data.bookTime === 'number') {
          defs[data.title] = data.bookTime;
        }
      });
      setTaskDefaults(defs);
    }, (err) => console.warn("Task defaults listener suppressed:", err));

    Promise.all([
      getDocs(collection(db, `businesses/${tenantId}/qb_items`)),
      getDocs(collection(db, `businesses/${tenantId}/native_tasks`))
    ]).then(([qbSnap, nativeSnap]) => {
      const qb = qbSnap.docs.map(d => ({ id: d.id, ...d.data(), _source: 'QuickBooks' }));
      const native = nativeSnap.docs.map(d => ({ id: d.id, ...d.data(), _source: 'Native' }));
      const serviceItems = qb.filter((item: any) => 
        item.Type === 'Service' || 
        item.ItemType === 'Service' ||
        !item.Type
      );
      setQbItems([...serviceItems, ...native]);
    }).catch(err => console.warn("Task items load suppressed:", err));

    return () => {
      unsubStaff();
      unsubDepts();
      unsubZones();
      unsubDefaults();
    };
  }, [tenantId]);

  // 2b. Subscribe to All Active Jobs to compute live Bay & Zone Occupancy stats
  const [allActiveJobs, setAllActiveJobs] = useState<any[]>([]);
  const [customerDirectory, setCustomerDirectory] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      setAllActiveJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("All jobs listener suppressed:", err));
    return () => unsub();
  }, [tenantId]);

  // Subscribe to Business details for print headers
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(doc(db, 'businesses', tenantId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.name) setBusinessName(data.name);
        if (data.logoUrl) setBusinessLogo(data.logoUrl);
      }
    }, (err) => console.warn("Business doc listener suppressed:", err));
    return () => unsub();
  }, [tenantId]);

  // Subscribe to Chat Messages for Job Details Print Sheet
  useEffect(() => {
    if (!tenantId || !jobId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/jobs/${jobId}/chat_messages`),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setChatMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Chat messages listener suppressed:", err));
    return () => unsub();
  }, [tenantId, jobId]);

  // Subscribe to Customers Directory (Native & QuickBooks)
  useEffect(() => {
    if (!tenantId) return;

    let nativeList: any[] = [];
    let qbList: any[] = [];

    const updateMergedState = () => {
      const mergedMap = new Map<string, any>();

      qbList.forEach(c => {
        const name = c.name || c.displayName || c.CompanyName || c.FullName || c.company || '';
        if (name) {
          mergedMap.set(name.toLowerCase().trim(), {
            id: c.ListID || c.id,
            name: name,
            displayName: c.displayName || name,
            CompanyName: c.CompanyName || name,
            email: c.email || c.Email || '',
            mobilePhone: c.mobilePhone || c.Phone || '',
            source: 'QuickBooks'
          });
        }
      });

      nativeList.forEach(c => {
        const name = c.name || c.displayName || c.CompanyName || c.FullName || c.company || '';
        if (name) {
          const key = name.toLowerCase().trim();
          if (!mergedMap.has(key)) {
            mergedMap.set(key, {
              id: c.id,
              name: name,
              displayName: c.displayName || name,
              email: c.email || '',
              mobilePhone: c.mobilePhone || c.phone || '',
              source: 'Directory'
            });
          }
        }
      });

      // Also gather customers from existing jobs
      allActiveJobs.forEach(j => {
        const name = j.customerName || j.company || j.customer || '';
        if (name && name.trim()) {
          const key = name.toLowerCase().trim();
          if (!mergedMap.has(key)) {
            mergedMap.set(key, {
              id: `job_cust_${key}`,
              name: name.trim(),
              displayName: name.trim(),
              source: 'Job History'
            });
          }
        }
      });

      const list = Array.from(mergedMap.values());
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setCustomerDirectory(list);
    };

    const unsubNative = onSnapshot(collection(db, `businesses/${tenantId}/customers`), (snap) => {
      nativeList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateMergedState();
    }, (err) => console.warn("Customers listener suppressed:", err));

    const unsubQb = onSnapshot(collection(db, `businesses/${tenantId}/qb_customers`), (snap) => {
      qbList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateMergedState();
    }, (err) => console.warn("QB Customers listener suppressed:", err));

    return () => {
      unsubNative();
      unsubQb();
    };
  }, [tenantId, allActiveJobs]);

  // Click outside to dismiss customer dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-resolve raw zone_ ID in editFormData.parkingSpot to human-readable zone name
  useEffect(() => {
    if (zones.length > 0 && editFormData.parkingSpot && editFormData.parkingSpot.startsWith('zone_')) {
      const matched = zones.find(z => z.id === editFormData.parkingSpot);
      if (matched) {
        setEditFormData(prev => ({ ...prev, parkingSpot: matched.name }));
      }
    }
  }, [zones, editFormData.parkingSpot]);

  // 3. Subscribe to Linked Vehicle Doc with NHTSA Auto-Decode Fallback
  useEffect(() => {
    const vinOrId = (job?.vehicleId || job?.vin || '').trim();
    if (!tenantId || !vinOrId) {
      setVehicle(null);
      return;
    }

    let isMounted = true;
    const vRef = doc(db, `businesses/${tenantId}/vehicles`, vinOrId);
    const unsub = onSnapshot(vRef, async (docSnap) => {
      if (docSnap.exists()) {
        const vData = { id: docSnap.id, ...docSnap.data() };
        if (isMounted) {
          setVehicle(vData);
          setEditFormData(prev => ({
            ...prev,
            vehicleYear: prev.vehicleYear || (vData as any).year || '',
            vehicleMake: prev.vehicleMake || (vData as any).make || '',
            vehicleModel: prev.vehicleModel || (vData as any).model || ''
          }));
        }
      } else {
        // Fallback: Query by VIN field
        try {
          const q = query(
            collection(db, `businesses/${tenantId}/vehicles`),
            where('vin', '==', vinOrId),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty && isMounted) {
            const d = snap.docs[0];
            const vData = { id: d.id, ...d.data() };
            setVehicle(vData);
            setEditFormData(prev => ({
              ...prev,
              vehicleYear: prev.vehicleYear || (vData as any).year || '',
              vehicleMake: prev.vehicleMake || (vData as any).make || '',
              vehicleModel: prev.vehicleModel || (vData as any).model || ''
            }));
            return;
          }
        } catch (e) {
          // ignore
        }

        // Fallback: Auto-decode via NHTSA API for 17-char VIN
        if (vinOrId.length === 17 && isMounted) {
          try {
            const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vinOrId}?format=json`);
            const data = await res.json();
            const result = data.Results?.[0];
            if (result && result.Make && isMounted) {
              const decodedVehicle = {
                id: vinOrId,
                vin: vinOrId,
                year: result.ModelYear || '',
                make: result.Make || '',
                model: result.Model || '',
                vehicleType: result.VehicleType || ''
              };
              setVehicle(decodedVehicle);
              setEditFormData(prev => ({
                ...prev,
                vehicleYear: prev.vehicleYear || result.ModelYear || '',
                vehicleMake: prev.vehicleMake || result.Make || '',
                vehicleModel: prev.vehicleModel || result.Model || ''
              }));
            }
          } catch (apiErr) {
            console.warn("NHTSA auto-decode failed:", apiErr);
          }
        }
      }
    }, (err) => console.warn("Vehicle listener suppressed:", err));

    return () => {
      isMounted = false;
      unsub();
    };
  }, [tenantId, job?.vehicleId, job?.vin]);

  // 4. Subscribe to Job Tasks
  useEffect(() => {
    if (!tenantId || !jobId) return;

    const tasksRef = collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`);
    const unsub = onSnapshot(tasksRef, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a: any, b: any) => {
        const orderA = typeof a.order === 'number' ? a.order : 9999;
        const orderB = typeof b.order === 'number' ? b.order : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.title || a.name || '').localeCompare(b.title || b.name || '');
      });
      setTasks(docs);
    }, (err) => console.warn("Tasks listener suppressed:", err));

    return () => unsub();
  }, [tenantId, jobId]);

  // 5. Subscribe to Job History Subcollection
  useEffect(() => {
    if (!tenantId || !jobId) return;

    const historyRef = collection(db, `businesses/${tenantId}/jobs/${jobId}/history`);
    const unsub = onSnapshot(historyRef, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a: any, b: any) => {
        const timeA = parseTimestampMs(a.createdAt);
        const timeB = parseTimestampMs(b.createdAt);
        return timeB - timeA;
      });
      setHistoryLogs(docs);
    }, (err) => console.warn("History listener suppressed:", err));

    return () => unsub();
  }, [tenantId, jobId]);

  // 6. Subscribe to Takeoffs Subcollection
  useEffect(() => {
    if (!tenantId || !jobId) return;

    const takeoffsRef = collection(db, `businesses/${tenantId}/jobs/${jobId}/takeoffs`);
    const unsub = onSnapshot(takeoffsRef, (snap) => {
      setTakeoffs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Takeoffs listener suppressed:", err));

    return () => unsub();
  }, [tenantId, jobId]);

  // 7. Subscribe to Time Sessions logged for this job
  useEffect(() => {
    if (!tenantId || !jobId) return;

    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('jobIds', 'array-contains', jobId)
    );

    const unsub = onSnapshot(q, (snap) => {
      setTimeSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Time sessions listener suppressed:", err));

    return () => unsub();
  }, [tenantId, jobId]);

  // 8. Subscribe to Parts Requests for this job
  useEffect(() => {
    if (!tenantId || !jobId) return;

    const q = query(
      collection(db, `businesses/${tenantId}/parts_requests`),
      where('jobId', '==', jobId)
    );

    const unsub = onSnapshot(q, (snap) => {
      setPartsRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Parts requests listener suppressed:", err));

    return () => unsub();
  }, [tenantId, jobId]);

  // 9. Subscribe to Native UpfittersOS Photos Subcollection
  useEffect(() => {
    if (!tenantId || !jobId) return;

    const photosRef = collection(db, `businesses/${tenantId}/jobs/${jobId}/photos`);
    const unsub = onSnapshot(photosRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => parseTimestampMs(b.createdAt) - parseTimestampMs(a.createdAt));
      setNativePhotos(list);
    }, (err) => console.warn("Native photos listener suppressed:", err));

    return () => unsub();
  }, [tenantId, jobId]);

  // 10. Fetch CompanyCam Photos if Project Linked
  const fetchCompanyCamPhotos = async () => {
    const ccProjectId = job?.companyCamId || job?.companyCamProjectId;
    if (!ccProjectId || !jobId) return;

    setLoadingCcPhotos(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const apiBaseLocal = 'http://localhost:5001/saegroup-c6487/us-central1/api';
      const apiBaseProd = 'https://us-central1-saegroup-c6487.cloudfunctions.net/api';

      let res;
      if (isLocal) {
        try {
          res = await fetch(`${apiBaseLocal}/jobs/${jobId}/companycam-photos`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'x-tenant-id': tenantId || ''
            }
          });
        } catch (localErr) {
          res = await fetch(`${apiBaseProd}/jobs/${jobId}/companycam-photos`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'x-tenant-id': tenantId || ''
            }
          });
        }
      } else {
        res = await fetch(`${apiBaseProd}/jobs/${jobId}/companycam-photos`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-tenant-id': tenantId || ''
          }
        });
      }

      if (res && res.ok) {
        const data = await res.json();
        setCompanyCamPhotos(Array.isArray(data) ? data : (data.photos || []));
      }
    } catch (err: any) {
      console.warn("CompanyCam photos fetch suppressed:", err);
    } finally {
      setLoadingCcPhotos(false);
    }
  };

  useEffect(() => {
    if (job?.companyCamId || job?.companyCamProjectId) {
      fetchCompanyCamPhotos();
    }
  }, [jobId, job?.companyCamId, job?.companyCamProjectId]);

  // Unified Native UpfittersOS Photos (Subcollection + Job Media Array)
  const allNativePhotos = useMemo(() => {
    const list: any[] = [...nativePhotos];
    const seenUrls = new Set<string>(nativePhotos.map(p => p.url).filter(Boolean));

    if (Array.isArray(job?.media)) {
      job.media.forEach((m: any, idx: number) => {
        const url = typeof m === 'string' ? m : m?.url;
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          list.push({
            id: m?.id || `job_media_${idx}`,
            url: url,
            caption: typeof m === 'object' ? (m.caption || m.label || 'Job Attachment') : 'Job Attachment',
            uploadedBy: typeof m === 'object' ? (m.uploadedBy || m.creator || 'Technician') : 'Technician',
            createdAt: typeof m === 'object' ? m.createdAt : job?.createdAt,
            source: 'UpfittersOS',
            syncedToCc: typeof m === 'object' ? Boolean(m.syncedToCc || m.ccId || m.source === 'CompanyCam') : false
          });
        }
      });
    }

    return list;
  }, [nativePhotos, job?.media, job?.createdAt]);

  // CompanyCam Photo Sync Analysis
  const { unsyncedToCc } = useMemo(() => {
    const ccUrls = new Set<string>();
    const ccIds = new Set<string>();
    
    companyCamPhotos.forEach(cc => {
      if (cc.id) ccIds.add(String(cc.id));
      const url = cc.url || cc.uris?.original || cc.uris?.web || cc.uris?.[0]?.uri;
      if (url) ccUrls.add(url);
    });

    // UpfittersOS photos not yet in CompanyCam
    const toCc = allNativePhotos.filter(np => {
      if (!np.url) return false;
      if (np.syncedToCc || np.ccId) return false;
      if (ccUrls.has(np.url) || (np.ccId && ccIds.has(String(np.ccId)))) return false;
      return true;
    });

    return {
      unsyncedToCc: toCc
    };
  }, [allNativePhotos, companyCamPhotos]);

  // 1-Click Push Sync to CompanyCam Handler
  const handleSyncPhotosToCompanyCam = async () => {
    const ccProjectId = job?.companyCamId || job?.companyCamProjectId;
    if (!ccProjectId) {
      toast.error('No CompanyCam Project ID is linked to this job.');
      return;
    }

    if (unsyncedToCc.length === 0) {
      toast.success('All UpfittersOS photos are already in CompanyCam!');
      return;
    }

    setIsBidirectionalSyncing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const urlsToPush = unsyncedToCc.map(p => p.url).filter(Boolean);
      
      const apiBaseProd = 'https://us-central1-saegroup-c6487.cloudfunctions.net/api';
      const res = await fetch(`${apiBaseProd}/jobs/${jobId}/companycam-photos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        },
        body: JSON.stringify({ urls: urlsToPush })
      });

      if (res && res.ok) {
        // Persist syncedToCc flag in Firestore so it remains synced across reloads
        if (Array.isArray(job?.media)) {
          const updatedMedia = job.media.map((m: any) => {
            const u = typeof m === 'string' ? m : m?.url;
            if (urlsToPush.includes(u)) {
              return typeof m === 'string' ? { url: m, syncedToCc: true } : { ...m, syncedToCc: true };
            }
            return m;
          });
          await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
            media: updatedMedia
          }).catch(() => {});
        }

        for (const np of nativePhotos) {
          if (urlsToPush.includes(np.url) && np.id) {
            await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/photos`, np.id), {
              syncedToCc: true
            }).catch(() => {});
          }
        }

        toast.success(`Successfully synced ${urlsToPush.length} photo(s) to CompanyCam Project #${ccProjectId}!`);
        await fetchCompanyCamPhotos();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to push photos to CompanyCam.');
      }
    } catch (err: any) {
      console.error('CompanyCam sync error:', err);
      toast.error(`CompanyCam sync error: ${err.message}`);
    } finally {
      setIsBidirectionalSyncing(false);
    }
  };

  // 11. Preload Historical Task Reference Photo Counts across all tasks
  useEffect(() => {
    if (!tenantId || tasks.length === 0) return;

    const jobsQuery = query(
      collection(db, `businesses/${tenantId}/jobs`),
      where('status', 'in', ['Completed', 'Closed', 'Ready for Customer', 'Ready for QC']),
      limit(25)
    );

    getDocs(jobsQuery).then(async (jobsSnap) => {
      const counts: Record<string, number> = {};

      for (const jDoc of jobsSnap.docs) {
        if (jDoc.id === jobId) continue;
        try {
          const [pastTasksSnap, pastPhotosSnap] = await Promise.all([
            getDocs(collection(db, `businesses/${tenantId}/jobs/${jDoc.id}/tasks`)),
            getDocs(collection(db, `businesses/${tenantId}/jobs/${jDoc.id}/photos`))
          ]);

          const photoCount = pastPhotosSnap.size;
          if (photoCount > 0) {
            pastTasksSnap.docs.forEach(t => {
              const key = (t.data().title || t.data().name || '').trim().toLowerCase();
              if (key) {
                counts[key] = (counts[key] || 0) + photoCount;
              }
            });
          }
        } catch (err) {
          // ignore
        }
      }

      setTaskRefPhotoCounts(counts);
    }).catch((err) => console.warn("Task ref photo counts fetch error:", err));
  }, [tenantId, tasks.length, jobId]);

  // 12. Cross-Job Historical Reference Photos Loader (Triggered when task selected)
  useEffect(() => {
    if (!tenantId || !selectedTask) {
      setHistoricalRefPhotos([]);
      return;
    }

    const taskTitle = (selectedTask.title || selectedTask.name || '').trim().toLowerCase();
    if (!taskTitle || taskTitle === 'general') {
      setHistoricalRefPhotos([]);
      return;
    }

    setLoadingRefPhotos(true);

    // Query past completed jobs in tenant
    const jobsQuery = query(
      collection(db, `businesses/${tenantId}/jobs`),
      where('status', 'in', ['Completed', 'Closed', 'Ready for Customer', 'Ready for QC']),
      limit(25)
    );

    getDocs(jobsQuery).then(async (jobsSnap) => {
      const matchedPhotos: any[] = [];

      for (const jobDoc of jobsSnap.docs) {
        if (jobDoc.id === jobId) continue; // Skip current job
        const jobData = jobDoc.data();

        // Check tasks subcollection of past job
        try {
          const pastTasksSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs/${jobDoc.id}/tasks`));
          const hasMatchingTask = pastTasksSnap.docs.some(t => {
            const pTitle = (t.data().title || t.data().name || '').trim().toLowerCase();
            return pTitle === taskTitle;
          });

          if (hasMatchingTask) {
            // Fetch photos from this matching past job
            const pastPhotosSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs/${jobDoc.id}/photos`));
            pastPhotosSnap.docs.forEach(pDoc => {
              const pData = pDoc.data();
              matchedPhotos.push({
                id: pDoc.id,
                url: pData.url || pData.photoUrl || pData.imageUrl,
                caption: pData.caption || pData.title || selectedTask.title,
                jobId: jobDoc.id,
                jobNumber: jobData.jobNumber || jobDoc.id.slice(0, 6),
                customerName: jobData.customerName || jobData.company || jobData.customer || 'Customer',
                vehicleYearMakeModel: `${jobData.vehicleYear || ''} ${jobData.vehicleMake || ''} ${jobData.vehicleModel || ''}`.trim() || 'Vehicle',
                vehicleVin: jobData.vin || jobData.vehicleId || '',
                createdAt: pData.createdAt,
                technicianName: pData.technicianName || pData.createdBy || 'Upfitter'
              });
            });
          }
        } catch (err) {
          // ignore subcollection read failures
        }
      }

      setHistoricalRefPhotos(matchedPhotos);
      setLoadingRefPhotos(false);
    }).catch(err => {
      console.warn("Historical reference photos query error:", err);
      setLoadingRefPhotos(false);
    });
  }, [tenantId, selectedTask, jobId]);

  // Deduplicated Canonical Staff Roster Computation
  const staffRoster = useMemo(() => {
    const map: Record<string, {
      id: string;
      name: string;
      email: string;
      clockedMs: number;
      completedBookHours: number;
      tasksWorked: number;
    }> = {};

    const getOrCreate = (rawStaff: any) => {
      const canonical = getCanonicalStaff(rawStaff, allStaff);
      const key = canonical.id;
      if (!map[key]) {
        map[key] = {
          id: canonical.id,
          name: canonical.name,
          email: canonical.email,
          clockedMs: 0,
          completedBookHours: 0,
          tasksWorked: 0
        };
      }
      return map[key];
    };

    // Aggregate Clocked Time from Time Sessions
    timeSessions.forEach(session => {
      if (!session.staffId && !session.userId) return;
      const canonical = getCanonicalStaff({ id: session.staffId || session.userId, name: session.staffName || session.userName }, allStaff);
      const entry = map[canonical.id] || getOrCreate(canonical);

      const jobSegments = (session.jobs || []).filter((j: any) => j.id === jobId);
      jobSegments.forEach((seg: any) => {
        const start = parseTimestampMs(seg.start);
        const end = seg.end ? parseTimestampMs(seg.end) : parseTimestampMs(session.clockOut?.timestamp || Date.now());
        if (start && end && end >= start) {
          entry.clockedMs += (end - start);
        }
      });
    });

    // Aggregate Completed Book Hours & Task Counts
    tasks.forEach(t => {
      const isCompleted = ['completed', 'QC Complete', 'QC'].includes(t.status);
      const bookHours = parseFloat(t.bookTime) || 0;

      (t.assignedStaff || []).forEach((staffRaw: any) => {
        const canonical = getCanonicalStaff(staffRaw, allStaff);
        const entry = map[canonical.id] || getOrCreate(canonical);
        entry.tasksWorked += 1;
        if (isCompleted) {
          entry.completedBookHours += bookHours;
        }
      });
    });

    return Object.values(map).sort((a, b) => b.clockedMs - a.clockedMs);
  }, [timeSessions, tasks, allStaff, jobId]);

  // Categorized Task Accordions Data Structure
  const taskGroupList = useMemo(() => {
    const groups: Record<string, { categoryName: string; tasks: any[] }> = {};

    tasks.forEach(task => {
      const cat = (task.category || 'General Labor').trim();
      if (!groups[cat]) {
        groups[cat] = { categoryName: cat, tasks: [] };
      }
      groups[cat].tasks.push(task);
    });

    return Object.values(groups).sort((a, b) => b.tasks.length - a.tasks.length);
  }, [tasks]);

  // Filtered Task Groups for Categories Tab
  const filteredTaskGroups = useMemo(() => {
    if (selectedTaskCategory === 'all') return taskGroupList;
    return taskGroupList.filter(g => g.categoryName === selectedTaskCategory);
  }, [taskGroupList, selectedTaskCategory]);

  // Toggle Category Collapsed State
  const toggleCategoryCollapse = (catName: string) => {
    setCollapsedCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
  };

  // Context-Aware Database Field Resolutions
  const vehicleVinRaw = vehicle?.vin || job?.vin || '';
  const vehicleVinDisplay = vehicleVinRaw || '⚪ Pending Vehicle Intake (Imported via QuickBooks)';
  const vehicleStockNumber = vehicle?.stockNumber || vehicle?.unitNumber || job?.stockNumber || job?.unitNumber || `Order #${job?.jobNumber || job?.ListID || '2236427'}`;
  const vehicleYearMakeModel = vehicle 
    ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
    : `${job?.vehicleYear || ''} ${job?.vehicleMake || ''} ${job?.vehicleModel || job?.title || 'RoscoePD 1 (Vehicle Unassigned)'}`.trim();
  const customerDisplayName = job?.customerName || job?.company || job?.customer || job?.ParentRef?.FullName || 'Roscoe PD';
  const jobDisplayNumber = job?.jobNumber || job?.jobName || job?.number || job?.ListID || jobId.slice(0, 8);
  // Resolve User-Friendly Zone / Location Name (Prioritize job.parkingSpot / job.bayId directly)
  const matchedZone = zones.find(z => 
    (job?.parkingSpot && (z.name === job.parkingSpot || z.id === job.parkingSpot)) ||
    (job?.bayId && (z.id === job.bayId || z.name === job.bayId)) ||
    (job?.location && (z.name === job.location || z.id === job.location)) ||
    (!job?.parkingSpot && !job?.bayId && z.currentJobId === jobId)
  );
  const rawSpot = job?.parkingSpot || job?.location || '';
  const isRawSpotValid = rawSpot && !rawSpot.startsWith('zone_') && !rawSpot.startsWith('bay_');

  const parkingLocationDisplay = matchedZone 
    ? matchedZone.name 
    : (isRawSpotValid 
      ? rawSpot 
      : (job?.bayId && !job.bayId.startsWith('zone_') 
        ? `Bay ${job.bayId}` 
        : '⚪ Unassigned Shop Location'));

  // Enriched Zones with Live Occupancy & Stationed Job Details
  const enrichedZones = useMemo(() => {
    return zones.map(z => {
      // Find what job is stationed in this zone
      const occupant = allActiveJobs.find((j: any) => 
        j.id !== jobId &&
        (j.bayId === z.id || j.bayId === z.name || j.parkingSpot === z.name || j.parkingSpot === z.id || j.location === z.name || z.currentJobId === j.id) &&
        !['Completed', 'Archived'].includes(j.status)
      );

      const isCurrentJobAssigned = Boolean(
        job?.bayId === z.id || 
        job?.bayId === z.name || 
        job?.parkingSpot === z.name || 
        job?.parkingSpot === z.id || 
        job?.location === z.name || 
        z.currentJobId === jobId
      );

      let occupantDetails: any = null;
      if (occupant) {
        occupantDetails = {
          id: occupant.id,
          jobNumber: occupant.jobNumber || occupant.jobName || occupant.number || occupant.id.slice(0, 7),
          title: occupant.title || occupant.name || 'Job',
          customerName: occupant.customerName || occupant.company || occupant.customer || 'Agency',
          vehicle: `${occupant.vehicleYear || ''} ${occupant.vehicleMake || ''} ${occupant.vehicleModel || ''}`.trim() || occupant.vehicleYearMakeModel || occupant.title || '',
          status: occupant.status || 'In Bay'
        };
      }

      const isBay = z.type === 'bay' || z.name?.toLowerCase().includes('bay');

      return {
        ...z,
        isBay,
        isOccupied: Boolean(occupant),
        isCurrentJobAssigned,
        occupantDetails
      };
    });
  }, [zones, allActiveJobs, job, jobId]);

  // Real-time Bay & Parking Lot Telemetry Computation (Live Active Floor & Yard Duration)
  const { bayTimeHours, parkingTimeHours } = useMemo(() => {
    let baySeconds = job?.totalBayTimeSeconds || 0;
    let parkingSeconds = job?.totalParkingTimeSeconds || 0;

    const nowMs = Date.now();
    const isCurrentlyInBay = (job?.bayId && job.bayId !== 'none') || 
                             job?.status === 'In Bay' ||
                             matchedZone?.type === 'bay' || 
                             (typeof job?.location === 'string' && job.location.toLowerCase().includes('bay')) ||
                             (typeof job?.parkingSpot === 'string' && job.parkingSpot.toLowerCase().includes('bay'));

    const isCurrentlyInLot = !isCurrentlyInBay && (
      matchedZone?.type === 'parking' || 
      (typeof job?.parkingSpot === 'string' && job.parkingSpot.trim() !== '') || 
      (typeof job?.location === 'string' && job.location.trim() !== '')
    );

    if (isCurrentlyInBay) {
      // Find move to bay in history logs if inBaySince is not stored on doc
      let bayMoveLogMs = 0;
      if (Array.isArray(historyLogs) && historyLogs.length > 0) {
        const bayMoveLogs = historyLogs.filter((l: any) => {
          const text = ((l.title || '') + ' ' + (l.description || '') + ' ' + (l.toLocation || '') + ' ' + (l.toStatus || '') + ' ' + (l.to || '')).toLowerCase();
          return text.includes('bay') || (l.type === 'location_change' && text.includes('bay')) || (l.type === 'status_change' && text.includes('in bay'));
        });
        if (bayMoveLogs.length > 0) {
          const sorted = [...bayMoveLogs].sort((a, b) => parseTimestampMs(a.createdAt || a.timestamp) - parseTimestampMs(b.createdAt || b.timestamp));
          bayMoveLogMs = parseTimestampMs(sorted[0].createdAt || sorted[0].timestamp);
        }
      }

      // DO NOT fallback to job?.updatedAt because updatedAt gets refreshed on every edit/action!
      const activeBayStartMs = parseTimestampMs(
        job?.inBaySince || 
        job?.bayAssignedAt || 
        (bayMoveLogMs > 0 ? bayMoveLogMs : null) || 
        job?.lastStatusChangedAt || 
        job?.lastMovedAt || 
        job?.startDate || 
        job?.scheduledStartDate || 
        job?.scheduledDate || 
        job?.date || 
        job?.createdAt || 
        job?.TimeCreated
      );
      if (activeBayStartMs > 0 && nowMs > activeBayStartMs) {
        baySeconds += Math.floor((nowMs - activeBayStartMs) / 1000);
      }
    } else if (isCurrentlyInLot) {
      let lotMoveLogMs = 0;
      if (Array.isArray(historyLogs) && historyLogs.length > 0) {
        const lotMoveLogs = historyLogs.filter((l: any) => {
          const text = ((l.title || '') + ' ' + (l.description || '') + ' ' + (l.toLocation || '') + ' ' + (l.to || '')).toLowerCase();
          return text.includes('yard') || text.includes('lot') || text.includes('parking') || l.type === 'location_change';
        });
        if (lotMoveLogs.length > 0) {
          const sorted = [...lotMoveLogs].sort((a, b) => parseTimestampMs(a.createdAt || a.timestamp) - parseTimestampMs(b.createdAt || b.timestamp));
          lotMoveLogMs = parseTimestampMs(sorted[0].createdAt || sorted[0].timestamp);
        }
      }

      const activeLotStartMs = parseTimestampMs(
        job?.inLotSince || 
        job?.parkingAssignedAt || 
        (lotMoveLogMs > 0 ? lotMoveLogMs : null) || 
        job?.lastStatusChangedAt || 
        job?.lastMovedAt || 
        job?.startDate || 
        job?.scheduledStartDate || 
        job?.scheduledDate || 
        job?.date || 
        job?.createdAt || 
        job?.TimeCreated
      );
      if (activeLotStartMs > 0 && nowMs > activeLotStartMs) {
        parkingSeconds += Math.floor((nowMs - activeLotStartMs) / 1000);
      }
    }

    return {
      bayTimeHours: (baySeconds / 3600).toFixed(1),
      parkingTimeHours: (parkingSeconds / 3600).toFixed(1)
    };
  }, [job, matchedZone, historyLogs]);

  // Filtered Reference Photos
  const filteredRefPhotos = useMemo(() => {
    if (refFilter === 'all') return historicalRefPhotos;
    if (refFilter === 'vehicle') {
      const currentV = vehicleYearMakeModel.toLowerCase();
      return historicalRefPhotos.filter(p => p.vehicleYearMakeModel.toLowerCase() === currentV);
    }
    if (refFilter === 'customer') {
      const currentC = customerDisplayName.toLowerCase();
      return historicalRefPhotos.filter(p => p.customerName.toLowerCase() === currentC);
    }
    return historicalRefPhotos;
  }, [historicalRefPhotos, refFilter, vehicleYearMakeModel, customerDisplayName]);

  // Helper: Project labor forward across specific staff working schedule (custom shift start/end, working days, off-days)
  const projectStaffWorkHours = (startDate: Date, totalHoursNeeded: number, schedule?: any) => {
    const days = schedule?.days && schedule.days.length > 0 ? schedule.days.map(Number) : [1, 2, 3, 4, 5];
    const startStr = schedule?.startTime || "08:00";
    const endStr = schedule?.endTime || "17:00";

    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);

    const dailyWorkMs = ((endH * 60 + (endM || 0)) - (startH * 60 + (startM || 0))) * 60000;
    if (dailyWorkMs <= 0 || days.length === 0) {
      return new Date(startDate.getTime() + totalHoursNeeded * 3600000);
    }

    let current = new Date(startDate);
    let remainingMs = totalHoursNeeded * 3600000;
    let guard = 0;

    while (remainingMs > 0 && guard < 180) {
      guard++;
      const dayOfWeek = current.getDay();
      const mappedDay = dayOfWeek === 0 ? 7 : dayOfWeek; // 1 = Mon, 7 = Sun

      if (!days.includes(mappedDay)) {
        current.setDate(current.getDate() + 1);
        current.setHours(startH, startM || 0, 0, 0);
        continue;
      }

      const startOfShift = new Date(current);
      startOfShift.setHours(startH, startM || 0, 0, 0);

      const endOfShift = new Date(current);
      endOfShift.setHours(endH, endM || 0, 0, 0);

      if (current < startOfShift) {
        current = new Date(startOfShift);
      }

      if (current >= endOfShift) {
        current.setDate(current.getDate() + 1);
        current.setHours(startH, startM || 0, 0, 0);
        continue;
      }

      const msLeftInShift = endOfShift.getTime() - current.getTime();
      if (remainingMs <= msLeftInShift) {
        current = new Date(current.getTime() + remainingMs);
        remainingMs = 0;
      } else {
        remainingMs -= msLeftInShift;
        current.setDate(current.getDate() + 1);
        current.setHours(startH, startM || 0, 0, 0);
      }
    }

    return current;
  };

  // Dynamic ETA & Schedule Projection (Considers Remaining Book Hours, Individual Staff Schedules, and Shop Calendar)
  const etaDetails = useMemo(() => {
    const incompleteTasks = tasks.filter(t => !['completed', 'QC Complete', 'QC'].includes(t.status));
    const remainingBookHours = incompleteTasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);

    if (incompleteTasks.length === 0) {
      return {
        etaDate: null,
        etaString: 'Completed',
        remainingHours: 0,
        status: 'completed',
        badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        varianceText: 'All Tasks Finished'
      };
    }

    if (remainingBookHours <= 0) {
      return {
        etaDate: null,
        etaString: 'In Progress',
        remainingHours: 0,
        status: 'in_progress',
        badgeColor: 'text-zinc-400 bg-zinc-800 border-zinc-700',
        varianceText: `${incompleteTasks.length} task(s) remaining`
      };
    }

    // Group remaining book hours by individual assigned technician
    const staffQueues: Record<string, { staffName: string; hours: number; schedule?: any }> = {};
    let unassignedHours = 0;

    incompleteTasks.forEach(t => {
      const bookHours = parseFloat(t.bookTime) || 0;
      const assigned = t.assignedStaff && t.assignedStaff.length > 0 ? t.assignedStaff : null;

      if (assigned) {
        const splitHours = bookHours / assigned.length;
        assigned.forEach((s: any) => {
          const techDoc = allStaff.find(st => st.id === s.id || st.name?.toLowerCase() === s.name?.toLowerCase());
          const key = techDoc?.id || s.id || s.name;
          if (!staffQueues[key]) {
            staffQueues[key] = {
              staffName: techDoc?.name || s.name || 'Technician',
              hours: 0,
              schedule: techDoc?.individualSchedule || techDoc?.schedule
            };
          }
          staffQueues[key].hours += splitHours;
        });
      } else {
        unassignedHours += bookHours;
      }
    });

    const nowTime = new Date();
    let maxProjectedETA = nowTime;

    // Project each assigned staff member's queue forward along their specific individual work schedule
    Object.values(staffQueues).forEach(queue => {
      const techETA = projectStaffWorkHours(nowTime, queue.hours, queue.schedule);
      if (techETA > maxProjectedETA) {
        maxProjectedETA = techETA;
      }
    });

    // If unassigned hours remain, project across assigned tech bandwidth or shop default
    if (unassignedHours > 0) {
      const assignedTechCount = Math.max(1, Object.keys(staffQueues).length);
      const effectiveUnassignedHours = unassignedHours / assignedTechCount;
      const unassignedETA = projectStaffWorkHours(nowTime, effectiveUnassignedHours);
      if (unassignedETA > maxProjectedETA) {
        maxProjectedETA = unassignedETA;
      }
    }

    const current = maxProjectedETA;

    // Compare with Delivery Deadline
    let varianceStatus = 'on_track';
    let varianceText = 'On Track';
    let badgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

    if (job?.scheduledEndDate || job?.dueDate) {
      const deadlineMs = parseTimestampMs(job.scheduledEndDate || job.dueDate);
      if (deadlineMs > 0) {
        const diffHours = (deadlineMs - current.getTime()) / 3600000;
        if (diffHours < -2) {
          varianceStatus = 'behind';
          varianceText = `Behind (${Math.abs(diffHours).toFixed(1)}h past due)`;
          badgeColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
        } else if (diffHours < 2) {
          varianceStatus = 'at_risk';
          varianceText = 'Pace Warning / At Risk';
          badgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        } else {
          varianceStatus = 'on_track';
          varianceText = `On Track (${diffHours.toFixed(1)}h ahead)`;
          badgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        }
      }
    }

    const etaString = current.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    return {
      etaDate: current,
      etaString,
      remainingHours: remainingBookHours,
      assignedTechCount: Object.keys(staffQueues).length || 1,
      status: varianceStatus,
      badgeColor,
      varianceText
    };
  }, [tasks, allStaff, job?.scheduledEndDate, job?.dueDate]);

  // ETA Trend History & Burndown Trajectory Reconstructed from Task Milestones
  const etaTrendData = useMemo(() => {
    const totalInitialBookHours = tasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);
    const jobCreationMs = parseTimestampMs(job?.createdAt || job?.TimeCreated || (Date.now() - 3 * 86400000));
    
    // Chronologically sort completed tasks
    const completedTasksList = tasks
      .filter(t => ['completed', 'QC Complete', 'QC'].includes(t.status))
      .map(t => ({
        id: t.id,
        title: t.title || t.name || 'Task',
        bookHours: parseFloat(t.bookTime) || 0,
        timestamp: parseTimestampMs(t.completedAt || t.qcPassedAt || t.updatedAt || jobCreationMs)
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    const points: Array<{
      timestamp: number;
      label: string;
      remainingBookHours: number;
      projectedETA: Date;
      event: string;
      xPct: number;
      yPct: number;
    }> = [];

    // 1. Initial Intake Point
    const initialETA = projectStaffWorkHours(new Date(jobCreationMs), totalInitialBookHours);
    points.push({
      timestamp: jobCreationMs,
      label: 'Intake',
      remainingBookHours: totalInitialBookHours,
      projectedETA: initialETA,
      event: `Initial Scope: ${totalInitialBookHours.toFixed(1)}h booked`,
      xPct: 0,
      yPct: 15
    });

    // 2. Intermediate Task Completions
    let rollingRemaining = totalInitialBookHours;
    completedTasksList.forEach((ct, idx) => {
      rollingRemaining = Math.max(0, rollingRemaining - ct.bookHours);
      const checkpointDate = new Date(Math.max(ct.timestamp, jobCreationMs));
      const projected = projectStaffWorkHours(checkpointDate, rollingRemaining);
      points.push({
        timestamp: ct.timestamp,
        label: `Task ${idx + 1}`,
        remainingBookHours: rollingRemaining,
        projectedETA: projected,
        event: `${ct.title} (-${ct.bookHours.toFixed(1)}h)`,
        xPct: 0,
        yPct: 0
      });
    });

    // 3. Current Live Point
    if (etaDetails.etaDate) {
      points.push({
        timestamp: Date.now(),
        label: 'Now',
        remainingBookHours: etaDetails.remainingHours,
        projectedETA: etaDetails.etaDate,
        event: `Current Dynamic ETA: ${etaDetails.etaString}`,
        xPct: 100,
        yPct: 0
      });
    }

    // Normalize SVG coordinate percentages
    const maxHours = Math.max(...points.map(p => p.remainingBookHours), 1);
    points.forEach((p, idx) => {
      p.xPct = points.length <= 1 ? 50 : Math.round((idx / (points.length - 1)) * 100);
      p.yPct = Math.round(85 - (p.remainingBookHours / maxHours) * 70);
    });

    const svgPath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.xPct} ${p.yPct}`).join(' ');
    const svgArea = `${svgPath} L 100 100 L 0 100 Z`;

    // Trend Direction & Delta
    let trendDirection: 'shrinking' | 'growing' | 'stable' = 'stable';
    let deltaHours = 0;
    if (points.length >= 2) {
      const firstETA = points[0].projectedETA.getTime();
      const lastETA = points[points.length - 1].projectedETA.getTime();
      deltaHours = (lastETA - firstETA) / 3600000;
      if (deltaHours < -0.3) trendDirection = 'shrinking';
      else if (deltaHours > 0.3) trendDirection = 'growing';
    }

    return {
      points,
      svgPath,
      svgArea,
      trendDirection,
      deltaHours: Math.abs(deltaHours).toFixed(1),
      initialETA,
      currentETA: etaDetails.etaDate,
      totalInitialBookHours,
      remainingBookHours: etaDetails.remainingHours
    };
  }, [tasks, job, etaDetails]);

  // Unified Comprehensive Time Log & Activity Feed
  const rawUnifiedTimeline = useMemo(() => {
    const list: Array<{
      id: string;
      category: 'creation' | 'moves' | 'labor' | 'qc' | 'completions';
      title: string;
      description: string;
      timestamp: any;
      user?: string;
      badgeColor?: string;
      iconSymbol?: string;
    }> = [];

    // 1. Job Creation Event
    if (job?.createdAt || job?.TimeModified) {
      list.push({
        id: 'evt-creation',
        category: 'creation',
        title: 'Job Created & Synchronized',
        description: `Job #${jobDisplayNumber} created for customer ${customerDisplayName} (${job?.notes || 'QuickBooks Sync'})`,
        timestamp: job.createdAt || job.TimeModified,
        user: job.createdBy || 'QuickBooks Sync',
        badgeColor: 'emerald',
        iconSymbol: '📅'
      });
    }

    // 2. Vehicle Assignment Event
    if (job?.vehicleId || vehicle || vehicleVinRaw) {
      list.push({
        id: 'evt-vehicle',
        category: 'creation',
        title: 'Vehicle Associated',
        description: `VIN: ${vehicleVinRaw || 'Unassigned'} • ${vehicleYearMakeModel}`,
        timestamp: vehicle?.createdAt || job?.createdAt || job?.updatedAt,
        user: 'Intake Agent',
        badgeColor: 'blue',
        iconSymbol: '🚗'
      });
    }

    // 3. Location and Bay Moves from History Logs
    historyLogs.forEach((log) => {
      const isMove = log.type === 'location_change' || log.type === 'bay_move' || (log.title || '').toLowerCase().includes('moved');
      const isStatus = log.type === 'status_change';

      if (isMove) {
        list.push({
          id: `hist-${log.id}`,
          category: 'moves',
          title: log.title || 'Location Relocation',
          description: log.description || `Moved to ${log.toLocation || log.location || 'New Zone'}`,
          timestamp: log.createdAt || log.timestamp,
          user: log.createdBy || 'Shop Foreman',
          badgeColor: 'amber',
          iconSymbol: '📍'
        });
      } else if (isStatus) {
        const isQcEvent = (log.toStatus || '').toLowerCase().includes('qc');
        list.push({
          id: `hist-${log.id}`,
          category: isQcEvent ? 'qc' : 'completions',
          title: log.title || `Status updated to ${log.toStatus}`,
          description: log.description || `Transitioned to ${log.toStatus}`,
          timestamp: log.createdAt || log.timestamp,
          user: log.createdBy || 'Operations Gatekeeper',
          badgeColor: isQcEvent ? 'rose' : 'emerald',
          iconSymbol: isQcEvent ? '🛡️' : '🏁'
        });
      }
    });

    // 4. Labor Clock In & Clock Out Events from Time Sessions
    timeSessions.forEach((session) => {
      const canonical = getCanonicalStaff({ id: session.staffId || session.userId, name: session.staffName || session.userName }, allStaff);
      const jobSegments = (session.jobs || []).filter((j: any) => j.id === jobId);

      jobSegments.forEach((seg: any, idx: number) => {
        if (seg.start) {
          list.push({
            id: `clockin-${session.id}-${idx}`,
            category: 'labor',
            title: `Clock In • ${canonical.name}`,
            description: `Started task: "${seg.taskName || 'General Labor'}"`,
            timestamp: seg.start,
            user: canonical.name,
            badgeColor: 'indigo',
            iconSymbol: '⏱️'
          });
        }
        if (seg.end) {
          const durationHours = ((parseTimestampMs(seg.end) - parseTimestampMs(seg.start)) / 3600000).toFixed(2);
          list.push({
            id: `clockout-${session.id}-${idx}`,
            category: 'labor',
            title: `Clock Out • ${canonical.name}`,
            description: `Completed shift segment (${durationHours}h) on "${seg.taskName || 'General Labor'}"`,
            timestamp: seg.end,
            user: canonical.name,
            badgeColor: 'indigo',
            iconSymbol: '⏹️'
          });
        }
      });
    });

    // 5. Task Completions & QC Records
    tasks.forEach(t => {
      if (t.completedAt) {
        list.push({
          id: `task-comp-${t.id}`,
          category: 'completions',
          title: `Task Completed: ${t.title}`,
          description: `Book Time Earned: ${t.bookTime || 0}h • Category: ${t.category || 'General'}`,
          timestamp: t.completedAt,
          user: t.completedBy || 'Upfitter',
          badgeColor: 'emerald',
          iconSymbol: '✅'
        });
      }
      if (t.qcCompletedAt) {
        list.push({
          id: `task-qc-${t.id}`,
          category: 'qc',
          title: `QC Passed: ${t.title}`,
          description: `Verified by Quality Inspector (${t.qcInspectorName || 'Foreman'})`,
          timestamp: t.qcCompletedAt,
          user: t.qcInspectorName || 'QC Inspector',
          badgeColor: 'emerald',
          iconSymbol: '🛡️'
        });
      }
      if (t.qcFailedAt || t.status === 'Rework') {
        list.push({
          id: `task-rework-${t.id}`,
          category: 'qc',
          title: `QC Kickback Flagged: ${t.title}`,
          description: `Reason: ${t.reworkReason || t.kickbackReason || 'Adjustment needed'}`,
          timestamp: t.qcFailedAt || t.updatedAt,
          user: t.qcInspectorName || 'QC Inspector',
          badgeColor: 'rose',
          iconSymbol: '⚠️'
        });
      }
    });

    // Sort descending (newest at top)
    return list.sort((a, b) => parseTimestampMs(b.timestamp) - parseTimestampMs(a.timestamp));
  }, [job, vehicle, vehicleVinRaw, vehicleYearMakeModel, customerDisplayName, jobDisplayNumber, historyLogs, timeSessions, allStaff, tasks, jobId]);

  // Native Photo Upload Handler
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !tenantId || !jobId) return;

    setIsUploadingPhoto(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();

        await new Promise((resolve) => {
          reader.onload = async (event) => {
            const base64Url = event.target?.result as string;
            if (base64Url) {
              const photosRef = collection(db, `businesses/${tenantId}/jobs/${jobId}/photos`);
              await addDoc(photosRef, {
                url: base64Url,
                caption: file.name,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                createdBy: user?.displayName || user?.email || 'Upfitter',
                userId: effectiveUserId,
                createdAt: serverTimestamp()
              });
            }
            resolve(true);
          };
          reader.readAsDataURL(file);
        });
      }
      toast.success(`Successfully uploaded ${files.length} photo(s)!`);
    } catch (err: any) {
      toast.error(`Photo upload error: ${err.message}`);
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Sync Selected Photos Modal Handler
  const handleSyncSelectedPhotosToCompanyCam = async () => {
    if (selectedPhotosForCcSync.length === 0 || !jobId) {
      toast.error('Select at least one photo to sync.');
      return;
    }

    setIsSyncingToCc(true);
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:5001' : '';
      const res = await fetch(`${apiBase}/jobs/${jobId}/companycam-photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoIds: selectedPhotosForCcSync,
          photos: nativePhotos.filter(p => selectedPhotosForCcSync.includes(p.id))
        })
      });

      if (res.ok) {
        toast.success(`Synced ${selectedPhotosForCcSync.length} photo(s) to CompanyCam!`);
        setIsSyncToCcOpen(false);
        setSelectedPhotosForCcSync([]);
        fetchCompanyCamPhotos();
      } else {
        toast.error('Failed to sync photos to CompanyCam.');
      }
    } catch (err: any) {
      toast.error(`CompanyCam sync error: ${err.message}`);
    } finally {
      setIsSyncingToCc(false);
    }
  };

  // VIN Auto-Decoder via Firestore Fleet DB and NHTSA VPIC API
  const [isDecodingVin, setIsDecodingVin] = useState(false);

  const decodeVinNHTSA = async (vinToDecode: string) => {
    const cleanVin = vinToDecode.trim().toUpperCase();
    if (cleanVin.length !== 17) {
      toast.error('VIN must be exactly 17 characters to decode');
      return;
    }

    setIsDecodingVin(true);
    try {
      // 1. Check local Firestore fleet database
      const q = query(
        collection(db, `businesses/${tenantId}/vehicles`),
        where('vin', '==', cleanVin),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const vData = snap.docs[0].data();
        setEditFormData(prev => ({
          ...prev,
          vehicleYear: vData.year || prev.vehicleYear,
          vehicleMake: vData.make || prev.vehicleMake,
          vehicleModel: vData.model || prev.vehicleModel
        }));
        toast.success(`Vehicle matched from fleet database: ${vData.year || ''} ${vData.make || ''} ${vData.model || ''}`);
        return;
      }

      // 2. Decode via NHTSA VPIC API
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${cleanVin}?format=json`);
      const data = await res.json();
      const result = data.Results?.[0];
      if (result && result.Make) {
        setEditFormData(prev => ({
          ...prev,
          vehicleYear: result.ModelYear || prev.vehicleYear,
          vehicleMake: result.Make || prev.vehicleMake,
          vehicleModel: result.Model || prev.vehicleModel
        }));
        toast.success(`Decoded VIN: ${result.ModelYear || ''} ${result.Make || ''} ${result.Model || ''}`);
      } else {
        toast.error('Could not decode VIN specifications from NHTSA');
      }
    } catch (err: any) {
      console.warn("VIN decode error:", err);
      toast.error(`VIN lookup failed: ${err.message}`);
    } finally {
      setIsDecodingVin(false);
    }
  };

  // Save Comprehensive Job Edit Form
  const handleSaveJobEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !jobId) return;

    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      const updatePayload: any = {
        title: editFormData.title.trim(),
        jobNumber: editFormData.jobNumber.trim(),
        customerName: editFormData.customerName.trim(),
        vehicleYear: editFormData.vehicleYear.trim(),
        vehicleMake: editFormData.vehicleMake.trim(),
        vehicleModel: editFormData.vehicleModel.trim(),
        vin: editFormData.vin.trim().toUpperCase(),
        stockNumber: editFormData.stockNumber.trim(),
        unitNumber: editFormData.unitNumber.trim(),
        purchaseOrderNumber: editFormData.purchaseOrderNumber.trim(),
        salesOrderNumber: editFormData.salesOrderNumber.trim(),
        priority: editFormData.priority,
        status: editFormData.status,
        companyCamId: editFormData.companyCamId.trim(),
        companyCamProjectId: editFormData.companyCamId.trim(),
        description: editFormData.description.trim(),
        notes: editFormData.notes.trim(),
        updatedAt: serverTimestamp()
      };

      // Match Zone for Location & Bay Assignment
      const cleanSpot = editFormData.parkingSpot.trim();
      const targetZone = zones.find(z => z.name === cleanSpot || z.id === cleanSpot);
      const spotName = targetZone ? targetZone.name : cleanSpot;
      const isBay = targetZone ? (targetZone.type === 'bay' || targetZone.name?.toLowerCase().includes('bay')) : cleanSpot.toLowerCase().includes('bay');
      const newBayId = isBay ? (targetZone?.id || cleanSpot) : null;

      updatePayload.parkingSpot = spotName;
      updatePayload.location = spotName;
      updatePayload.bayId = newBayId;

      if (editFormData.scheduledEndDate) {
        updatePayload.scheduledEndDate = new Date(`${editFormData.scheduledEndDate}T17:00:00`);
      }

      await updateDoc(jobRef, updatePayload);

      // Sync zone document currentJobId if assigned to a work bay
      if (targetZone && isBay) {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, targetZone.id), {
          currentJobId: jobId
        }).catch(() => {});
      }

      toast.success('Job details updated successfully!');
      setIsJobEditOpen(false);
    } catch (err: any) {
      toast.error(`Failed to update job: ${err.message}`);
    }
  };

  // Status Change Handler with Gatekeeper Enforcement
  const handleSelectStatus = async (newStatus: string) => {
    if (!tenantId || !jobId || !job) return;

    if (newStatus === 'QC Kickback') {
      setStatusModalOpen(false);
      setKickbackModalOpen(true);
      return;
    }

    if (newStatus === 'Blocked') {
      setStatusModalOpen(false);
      setIsBlockerModalOpen(true);
      return;
    }

    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      const oldStatus = job.status || 'Active';

      const updatePayload: any = {
        status: newStatus,
        updatedAt: serverTimestamp(),
        lastStatusChangedAt: serverTimestamp(),
        lastStatusChangedBy: user?.displayName || user?.email || 'User'
      };

      if (newStatus === 'Ready for QC') {
        updatePayload.readyForQcAt = serverTimestamp();
        updatePayload.readyForQcBy = user?.displayName || user?.email || 'User';
      } else if (newStatus === 'Ready for Customer') {
        updatePayload.readyForCustomerAt = serverTimestamp();
        updatePayload.readyForCustomerBy = user?.displayName || user?.email || 'User';
      } else if (newStatus === 'Completed') {
        updatePayload.completedAt = serverTimestamp();
      }

      await updateDoc(jobRef, updatePayload);

      // Append to timeline / audit history
      const historyRef = collection(db, `businesses/${tenantId}/jobs/${jobId}/history`);
      await addDoc(historyRef, {
        type: 'status_change',
        title: `Status changed to ${newStatus}`,
        description: `Status updated from ${oldStatus} ➔ ${newStatus}`,
        fromStatus: oldStatus,
        toStatus: newStatus,
        createdAt: serverTimestamp(),
        createdBy: user?.displayName || user?.email || 'User',
        userId: effectiveUserId
      });

      toast.success(`Job status updated to "${newStatus}"`);
      setStatusModalOpen(false);
    } catch (err: any) {
      toast.error(`Failed to update status: ${err.message}`);
    }
  };

  // Blocker Lists Memo
  const activeBlockers = useMemo(() => {
    const arr = Array.isArray(job?.blockers) ? job.blockers : [];
    return arr.filter((b: any) => b && b.status === 'active');
  }, [job?.blockers]);

  const resolvedBlockers = useMemo(() => {
    const arr = Array.isArray(job?.blockers) ? job.blockers : [];
    return arr.filter((b: any) => b && b.status === 'resolved');
  }, [job?.blockers]);

  // Add Production Blocker
  const handleAddBlocker = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newBlockerMsg.trim() || !tenantId || !jobId) return;

    setIsAddingBlocker(true);
    try {
      const newBlocker = {
        id: crypto.randomUUID(),
        message: newBlockerMsg.trim(),
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: user?.displayName || user?.email || 'Staff',
        createdById: user?.uid || ''
      };

      const currentBlockers = Array.isArray(job?.blockers) ? job.blockers : [];
      const updatedBlockers = [...currentBlockers, newBlocker];

      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        blockers: updatedBlockers,
        status: 'Blocked',
        updatedAt: serverTimestamp()
      });

      // Write to history audit subcollection
      try {
        await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/history`), {
          type: 'blocker_added',
          title: 'Production Blocker Added',
          description: `Added blocker: ${newBlockerMsg.trim()}`,
          createdAt: serverTimestamp(),
          user: user?.displayName || user?.email || 'Staff'
        });
      } catch (e) {
        // ignore
      }

      setNewBlockerMsg('');
      toast.success('Blocker added — Job marked as Blocked');
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to add blocker: ${err.message}`);
    } finally {
      setIsAddingBlocker(false);
    }
  };

  // Resolve an existing blocker
  const handleResolveBlocker = async (blockerId: string) => {
    if (!tenantId || !jobId) return;

    setResolvingBlockerId(blockerId);
    try {
      const currentBlockers = Array.isArray(job?.blockers) ? job.blockers : [];
      const updatedBlockers = currentBlockers.map((b: any) =>
        b.id === blockerId
          ? {
              ...b,
              status: 'resolved',
              resolvedAt: new Date().toISOString(),
              resolvedBy: user?.displayName || user?.email || 'Staff'
            }
          : b
      );

      const remainingActive = updatedBlockers.filter((b: any) => b.status === 'active');
      const resolvedBlocker = currentBlockers.find((b: any) => b.id === blockerId);

      const hasBay = Boolean(job?.bayId || (job?.parkingSpot && job.parkingSpot.toLowerCase().includes('bay')) || (job?.location && job.location.toLowerCase().includes('bay')));
      const restoredStatus = hasBay ? 'In Bay' : 'Pending';

      const updatePayload: any = {
        blockers: updatedBlockers,
        updatedAt: serverTimestamp()
      };

      if (remainingActive.length === 0 && job?.status === 'Blocked') {
        updatePayload.status = restoredStatus;
      }

      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), updatePayload);

      // Write to history audit subcollection
      try {
        await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/history`), {
          type: 'blocker_resolved',
          title: 'Production Blocker Resolved',
          description: `Resolved blocker: ${resolvedBlocker?.message || 'Obstacle cleared'}`,
          createdAt: serverTimestamp(),
          user: user?.displayName || user?.email || 'Staff'
        });
      } catch (e) {
        // ignore
      }

      toast.success('Blocker resolved');
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to resolve blocker: ${err.message}`);
    } finally {
      setResolvingBlockerId(null);
    }
  };

  // Submit QC Kickback with notes
  const handleConfirmKickback = async () => {
    if (!tenantId || !jobId || !job || !kickbackReason.trim()) {
      toast.error('Please enter a specific kickback reason.');
      return;
    }

    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      const oldStatus = job.status || 'Ready for QC';

      await updateDoc(jobRef, {
        status: 'QC Kickback',
        qcKickbackReason: kickbackReason.trim(),
        qcKickbackAt: serverTimestamp(),
        qcKickbackBy: user?.displayName || user?.email || 'QC Inspector',
        updatedAt: serverTimestamp()
      });

      // Append to timeline / audit history
      const historyRef = collection(db, `businesses/${tenantId}/jobs/${jobId}/history`);
      await addDoc(historyRef, {
        type: 'qc_kickback',
        title: 'QC Kickback Flagged',
        description: `Kickback Reason: "${kickbackReason.trim()}" (Status: ${oldStatus} ➔ QC Kickback)`,
        fromStatus: oldStatus,
        toStatus: 'QC Kickback',
        reason: kickbackReason.trim(),
        createdAt: serverTimestamp(),
        createdBy: user?.displayName || user?.email || 'QC Inspector',
        userId: effectiveUserId
      });

      toast.success('QC Kickback logged successfully. Upfitters notified.');
      setKickbackModalOpen(false);
      setKickbackReason('');
    } catch (err: any) {
      toast.error(`Failed to log kickback: ${err.message}`);
    }
  };

  // Parking Spot / Location Change Handler
  const handleUpdateLocation = async (chosenSpot?: string) => {
    const targetSpot = (chosenSpot !== undefined ? chosenSpot : newLocationSpot).trim();
    if (!tenantId || !jobId) return;

    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      const oldSpot = job?.parkingSpot || job?.location || 'Unassigned';

      const targetZone = zones.find(z => z.name === targetSpot || z.id === targetSpot);
      const spotName = targetZone ? targetZone.name : targetSpot;
      const isBay = targetZone ? (targetZone.type === 'bay' || targetZone.name?.toLowerCase().includes('bay')) : targetSpot.toLowerCase().includes('bay');
      const newBayId = isBay ? (targetZone?.id || targetSpot) : null;

      const updatePayload: any = {
        parkingSpot: spotName,
        location: spotName,
        bayId: newBayId,
        updatedAt: serverTimestamp()
      };

      // Auto-set status to In Bay if moving to a work bay and status was Pending
      if (isBay && (job?.status === 'Pending' || !job?.status)) {
        updatePayload.status = 'In Bay';
      }

      // Optimistically update local job state
      setJob((prev: any) => ({
        ...prev,
        parkingSpot: spotName,
        location: spotName,
        bayId: newBayId,
        ...(isBay && (prev?.status === 'Pending' || !prev?.status) ? { status: 'In Bay' } : {})
      }));

      await updateDoc(jobRef, updatePayload);

      // Clear previous zones that were assigned to this job
      const previousZones = zones.filter(z => z.currentJobId === jobId && (!targetZone || z.id !== targetZone.id));
      for (const pz of previousZones) {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, pz.id), {
          currentJobId: null
        }).catch(() => {});
      }

      // Sync target zone document currentJobId if assigned to a work bay
      if (targetZone && isBay) {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, targetZone.id), {
          currentJobId: jobId
        }).catch(() => {});
      }

      // Log location move to activity and timeline safely
      try {
        const activityRef = collection(db, `businesses/${tenantId}/jobs/${jobId}/activity`);
        await addDoc(activityRef, {
          type: 'location_change',
          title: `Vehicle moved to ${spotName || 'Unassigned'}`,
          description: `Relocated from ${oldSpot} ➔ ${spotName || 'Unassigned'}`,
          fromLocation: oldSpot,
          toLocation: spotName || 'Unassigned',
          createdAt: serverTimestamp(),
          createdBy: user?.displayName || user?.email || 'User',
          userId: effectiveUserId
        }).catch(() => {});
      } catch (_) {}

      toast.success(`Vehicle location updated to "${spotName || 'Unassigned'}"`);
      setSpotModalOpen(false);
      setNewLocationSpot('');
    } catch (err: any) {
      toast.error(`Failed to update location: ${err.message}`);
    }
  };

  // Interactive Takeoff Toggle Handler
  const handleToggleTakeoff = async (item: any) => {
    if (!tenantId || !jobId || !item.id) return;
    try {
      const nextChecked = !item.checked;
      const takeoffRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/takeoffs`, item.id);
      await updateDoc(takeoffRef, {
        checked: nextChecked,
        checkedAt: nextChecked ? serverTimestamp() : null,
        checkedBy: nextChecked ? effectiveStaffName : null,
        checkedByStaffId: nextChecked ? effectiveStaffId : null,
        checkedByStaffName: nextChecked ? effectiveStaffName : null
      });
      toast.success(`Checklist item updated`);
    } catch (err: any) {
      toast.error(`Failed to update takeoff: ${err.message}`);
    }
  };

  // Task Status Toggle for Mobile Upfitters (Enforces assignment & auto clock-out)
  const handleToggleTaskStatus = async (task: any) => {
    if (!tenantId || !jobId || !task.id) return;

    // Only allow marking complete if assigned or manager
    const isAssigned = isUserAssignedToTask(task);
    if (!isAssigned && !canManageTasks) {
      toast.error("You must be assigned to this task to mark it completed.");
      return;
    }

    const currentStatus = task.status || 'pending';
    const isNowCompleted = currentStatus === 'completed' || currentStatus === 'QC Complete' || currentStatus === 'QC';
    const nextStatus = isNowCompleted ? 'in_progress' : 'completed';

    try {
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, task.id);
      
      // If acting user is a manager checking off on behalf of assigned tech, credit assigned tech!
      const assignedId = (Array.isArray(task.assignedStaffIds) && task.assignedStaffIds.length > 0)
        ? task.assignedStaffIds[0]
        : (task.assignedTechId || (Array.isArray(task.assignedStaff) && task.assignedStaff[0]?.id) || task.assignedTo);
      const assignedName = task.assignedTechName || (Array.isArray(task.assignedStaff) && task.assignedStaff[0]?.name);

      const targetCompleterId = isAssigned ? effectiveStaffId : (assignedId || effectiveStaffId);
      const targetCompleterName = isAssigned ? effectiveStaffName : (assignedName || effectiveStaffName);

      await updateDoc(taskRef, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
        completedAt: nextStatus === 'completed' ? new Date().toISOString() : null,
        completedBy: targetCompleterName,
        completedByStaffId: targetCompleterId,
        completedByStaffName: targetCompleterName,
        closedByStaffId: effectiveStaffId,
        closedByStaffName: effectiveStaffName
      });

      // Write to history audit log
      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/history`), {
        type: 'task_status',
        action: nextStatus === 'completed' ? 'task_completed' : 'task_in_progress',
        title: `Task ${nextStatus === 'completed' ? 'Completed' : 'Moved In Progress'}`,
        details: `${task.title || task.name || 'Task'} marked as ${nextStatus === 'completed' ? 'Completed' : 'In Progress'}`,
        description: `${task.title || task.name || 'Task'} marked as ${nextStatus === 'completed' ? 'Completed' : 'In Progress'}`,
        taskId: task.id,
        user: effectiveStaffName,
        userName: effectiveStaffName,
        userId: effectiveStaffId,
        createdAt: serverTimestamp()
      }).catch(() => {});

      // Automatically clock out of task if currently clocked into it when marking complete
      if (nextStatus === 'completed' && isUserClockedIntoTask(task.id)) {
        try {
          await clockOutOfJob(jobId, task.id);
        } catch (clockErr) {
          console.warn("Auto clock-out on task completion error:", clockErr);
        }
      }

      toast.success(`Task marked as ${nextStatus === 'completed' ? 'Completed' : 'In Progress'}`);
    } catch (err: any) {
      toast.error(`Failed to update task: ${err.message}`);
    }
  };

  // QC System Action Handlers
  const handlePassTaskQC = async (t: any) => {
    if (!tenantId || !jobId || !t.id) return;
    setIsQCPassingTaskId(t.id);
    try {
      const inspectorName = effectiveStaffName || user?.displayName || user?.email || 'QC Inspector';
      const inspectorUid = effectiveStaffId || user?.uid || 'inspector';

      const updateData: any = {
        status: 'QC Complete',
        qcCompletedAt: new Date().toISOString(),
        qcCompletedBy: inspectorName,
        qcCompletedByStaffId: inspectorUid,
        updatedAt: serverTimestamp()
      };

      // Preserve completing technician attribution if already completed
      if (!t.completedByStaffId) {
        const assignedId = (Array.isArray(t.assignedStaffIds) && t.assignedStaffIds.length > 0)
          ? t.assignedStaffIds[0]
          : (t.assignedTechId || (Array.isArray(t.assignedStaff) && t.assignedStaff[0]?.id) || t.assignedTo);
        if (assignedId) {
          updateData.completedByStaffId = assignedId;
          updateData.completedByStaffName = t.assignedTechName || (Array.isArray(t.assignedStaff) && t.assignedStaff[0]?.name) || 'Technician';
          updateData.completedBy = updateData.completedByStaffName;
        }
      }

      const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, t.id);
      await updateDoc(taskRef, updateData);

      // Write to history audit log
      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/history`), {
        type: 'qc_passed',
        action: 'qc_passed',
        title: `QC Passed: "${t.title}"`,
        details: `Task inspection verified and signed off by ${inspectorName}`,
        taskId: t.id,
        user: inspectorName,
        userName: inspectorName,
        userId: inspectorUid,
        createdAt: serverTimestamp()
      }).catch(() => {});

      toast.success(`Task "${t.title}" QC Verified!`);
    } catch (err: any) {
      console.error("Failed to pass QC:", err);
      toast.error(`QC Pass failed: ${err.message}`);
    } finally {
      setIsQCPassingTaskId(null);
    }
  };

  const handleBulkPassAllQC = async () => {
    if (!tenantId || !jobId || tasks.length === 0) return;
    const pendingQCTasks = tasks.filter(t => ['completed', 'QC'].includes(t.status) && !t.qcCompletedAt && t.status !== 'QC Complete');
    if (pendingQCTasks.length === 0) {
      toast.info("All completed tasks are already QC verified!");
      return;
    }

    setIsBulkQCPassing(true);
    const inspectorName = effectiveStaffName || user?.displayName || user?.email || 'QC Inspector';
    const inspectorUid = effectiveStaffId || user?.uid || 'inspector';

    try {
      for (const t of pendingQCTasks) {
        const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, t.id);
        const updateData: any = {
          status: 'QC Complete',
          qcCompletedAt: new Date().toISOString(),
          qcCompletedBy: inspectorName,
          qcCompletedByStaffId: inspectorUid,
          updatedAt: serverTimestamp()
        };
        if (!t.completedByStaffId) {
          const assignedId = (Array.isArray(t.assignedStaffIds) && t.assignedStaffIds.length > 0)
            ? t.assignedStaffIds[0]
            : (t.assignedTechId || (Array.isArray(t.assignedStaff) && t.assignedStaff[0]?.id) || t.assignedTo);
          if (assignedId) {
            updateData.completedByStaffId = assignedId;
            updateData.completedByStaffName = t.assignedTechName || (Array.isArray(t.assignedStaff) && t.assignedStaff[0]?.name) || 'Technician';
            updateData.completedBy = updateData.completedByStaffName;
          }
        }
        await updateDoc(taskRef, updateData);
      }

      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/history`), {
        type: 'qc_bulk_passed',
        action: 'qc_bulk_passed',
        title: `Bulk QC Verification: ${pendingQCTasks.length} tasks passed`,
        details: `All ${pendingQCTasks.length} completed tasks verified by ${inspectorName}`,
        user: inspectorName,
        userName: inspectorName,
        userId: inspectorUid,
        createdAt: serverTimestamp()
      }).catch(() => {});

      toast.success(`QC Passed all ${pendingQCTasks.length} completed tasks!`);
    } catch (err: any) {
      console.error("Bulk QC error:", err);
      toast.error(`Bulk QC failed: ${err.message}`);
    } finally {
      setIsBulkQCPassing(false);
    }
  };

  const handleConfirmTaskKickback = async () => {
    if (!tenantId || !jobId || !qcKickbackModalTask || !qcKickbackTaskReason.trim()) {
      toast.error("Please enter a kickback reason.");
      return;
    }

    try {
      const inspectorName = effectiveStaffName || user?.displayName || user?.email || 'QC Inspector';
      const inspectorUid = effectiveStaffId || user?.uid || 'inspector';

      const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, qcKickbackModalTask.id);
      
      const newNote = {
        id: crypto.randomUUID(),
        message: `[QC KICKBACK / REWORK NEEDED] ${qcKickbackTaskReason.trim()}`,
        createdAt: new Date().toISOString(),
        createdByUid: inspectorUid,
        createdByName: inspectorName
      };

      await updateDoc(taskRef, {
        status: 'in_progress',
        qcFailedAt: new Date().toISOString(),
        qcFailedBy: inspectorName,
        qcKickbackReason: qcKickbackTaskReason.trim(),
        task_notes: [...(qcKickbackModalTask.task_notes || []), newNote],
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/history`), {
        type: 'qc_kickback',
        action: 'qc_kickback',
        title: `Task Kicked Back: "${qcKickbackModalTask.title}"`,
        details: `Sent to rework by ${inspectorName}. Reason: ${qcKickbackTaskReason.trim()}`,
        taskId: qcKickbackModalTask.id,
        user: inspectorName,
        userName: inspectorName,
        userId: inspectorUid,
        createdAt: serverTimestamp()
      }).catch(() => {});

      toast.error(`Task "${qcKickbackModalTask.title}" kicked back for rework`);
      setQcKickbackModalTask(null);
      setQcKickbackTaskReason('');
    } catch (err: any) {
      console.error("Kickback error:", err);
      toast.error(`Failed to kick back task: ${err.message}`);
    }
  };

  // Auto Book-Time Lookup on Task Title Change
  const handleTaskTitleChange = (val: string) => {
    setNewTaskTitle(val);
    if (!val) return;
    const trimmed = val.trim();
    const isDiagRepair = trimmed.toLowerCase() === 'labor:diagnose/repair';
    if (taskDefaults[trimmed] !== undefined) {
      setNewTaskBookTime(taskDefaults[trimmed]);
    } else if (isDiagRepair) {
      setNewTaskBookTime(1.0);
    } else {
      const matchedItem = qbItems.find(item => 
        (item.FullName || item.Name || item.title || '').toLowerCase() === trimmed.toLowerCase()
      );
      if (matchedItem && (matchedItem.bookTime || matchedItem.rate || matchedItem.hours)) {
        setNewTaskBookTime(matchedItem.bookTime || matchedItem.rate || matchedItem.hours || 0);
      }
    }
  };

  // Rapid Task Creation (Enter-key friendly, carries forward multi-staff & dept)
  const handleCreateTask = async (overrideCategory?: string) => {
    if (!canManageTasks) {
      toast.error("You do not have permission to add tasks.");
      return;
    }
    const title = newTaskTitle.trim();
    if (!title) {
      toast.error("Please enter a task title.");
      return;
    }

    setIsAddingTask(true);
    try {
      const isDiagRepair = title.toLowerCase() === 'labor:diagnose/repair';
      const defaultHours = isDiagRepair ? 1 : 0;
      const parsedBookTime = Number(newTaskBookTime) || defaultHours;
      const targetCategory = overrideCategory || (selectedTaskCategory !== 'all' ? selectedTaskCategory : 'General Labor');

      const staffIdsToUse = newTaskStaffIds.length > 0 ? newTaskStaffIds : lastAssignedStaffIds;
      const assignedStaffMembers: any[] = [];
      staffIdsToUse.forEach(staffId => {
        const found = allStaff.find(s => s.id === staffId || s.userId === staffId);
        if (found) {
          const name = `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name || found.displayName || 'Technician';
          assignedStaffMembers.push({ id: found.id, name });
        }
      });

      const maxOrder = tasks.reduce((max, t) => typeof t.order === 'number' && t.order > max ? t.order : max, 0);

      const taskData = {
        title,
        name: title,
        description: newTaskDesc.trim() || '',
        bookTime: parsedBookTime,
        payBasis: 'book_time',
        status: 'pending',
        taskGroup: targetCategory,
        departmentId: newTaskDeptId || lastDepartmentId || '',
        assignedStaff: assignedStaffMembers,
        assignedStaffIds: assignedStaffMembers.map(s => s.id),
        assignedToName: assignedStaffMembers.map(s => s.name).join(', '),
        order: maxOrder + 10,
        tenantId,
        jobId,
        createdAt: serverTimestamp(),
        createdBy: effectiveStaffName,
        createdByStaffId: effectiveStaffId,
        createdByStaffName: effectiveStaffName,
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), taskData);

      // Save task default if new
      if (parsedBookTime > 0) {
        const docId = encodeURIComponent(title);
        setDoc(doc(db, `businesses/${tenantId}/task_defaults`, docId), {
          title,
          bookTime: parsedBookTime,
          updatedAt: serverTimestamp()
        }, { merge: true }).catch(() => {});
      }

      // Activity audit log
      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/history`), {
        type: 'task_added',
        action: 'task_added',
        title: `Added task "${title}"`,
        details: `Added task "${title}" (${parsedBookTime}h) to ${targetCategory}`,
        description: `Added task "${title}" (${parsedBookTime}h) to ${targetCategory}`,
        user: effectiveStaffName,
        userName: effectiveStaffName,
        userId: effectiveStaffId,
        createdAt: serverTimestamp()
      }).catch(() => {});

      // Update job total estimatedHours
      const updatedTotalBook = tasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0) + parsedBookTime;
      await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}`), {
        estimatedHours: updatedTotalBook,
        bookedHours: updatedTotalBook,
        updatedAt: serverTimestamp()
      }).catch(() => {});

      // Remember last department and multi-staff
      if (newTaskDeptId) setLastDepartmentId(newTaskDeptId);
      if (newTaskStaffIds.length > 0) setLastAssignedStaffIds(newTaskStaffIds);

      // Reset fields while preserving department & tech memory
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskBookTime('');
      toast.success(`✓ Task added: ${title}`);

      // Auto re-focus title input
      setTimeout(() => {
        const el = document.getElementById('new-task-title-input');
        el?.focus();
      }, 50);
    } catch (err: any) {
      console.error("Error adding task:", err);
      toast.error("Failed to add task: " + err.message);
    } finally {
      setIsAddingTask(false);
    }
  };

  // Delete Task with confirmation
  const handleDeleteTask = async (taskId: string, taskTitle: string) => {
    if (!canManageTasks) return;
    if (!confirm(`Are you sure you want to delete "${taskTitle}"?`)) return;

    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId));
      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/history`), {
        type: 'task_deleted',
        action: 'task_deleted',
        title: `Deleted task "${taskTitle}"`,
        details: `Deleted task "${taskTitle}"`,
        description: `Deleted task "${taskTitle}"`,
        user: effectiveStaffName,
        userName: effectiveStaffName,
        userId: effectiveStaffId,
        createdAt: serverTimestamp()
      }).catch(() => {});
      toast.success(`Deleted task "${taskTitle}"`);
    } catch (err: any) {
      console.error("Error deleting task:", err);
      toast.error("Failed to delete task.");
    }
  };

  // Open Edit Task Modal
  const handleOpenEditTask = (task: any) => {
    setEditingTask(task);
    setEditTaskTitle(task.title || task.name || '');
    setEditTaskDesc(task.description || task.notes || '');
    setEditTaskBookTime(task.bookTime || 0);
    setEditTaskDeptId(task.departmentId || '');
    const existingStaffIds: string[] = task.assignedStaffIds || (task.assignedStaff || []).map((s: any) => s.id || s.uid) || [];
    setEditTaskStaffIds(existingStaffIds);
  };

  // Save Task Edit
  const handleSaveEditedTask = async () => {
    if (!editingTask || !canManageTasks) return;
    setIsSavingTaskEdit(true);
    try {
      const parsedBookTime = Number(editTaskBookTime) || 0;
      const assignedStaffMembers: any[] = [];
      editTaskStaffIds.forEach(staffId => {
        const found = allStaff.find(s => s.id === staffId || s.userId === staffId);
        if (found) {
          const name = `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name || found.displayName || 'Technician';
          assignedStaffMembers.push({ id: found.id, name });
        }
      });

      await updateDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, editingTask.id), {
        title: editTaskTitle.trim() || editingTask.title,
        name: editTaskTitle.trim() || editingTask.title,
        description: editTaskDesc.trim(),
        bookTime: parsedBookTime,
        departmentId: editTaskDeptId || '',
        assignedStaff: assignedStaffMembers,
        assignedStaffIds: assignedStaffMembers.map(s => s.id),
        assignedToName: assignedStaffMembers.map(s => s.name).join(', '),
        updatedBy: effectiveStaffName,
        updatedByStaffId: effectiveStaffId,
        updatedByStaffName: effectiveStaffName,
        updatedAt: serverTimestamp()
      });

      // Write to history audit log
      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/history`), {
        type: 'task_updated',
        action: 'task_updated',
        title: `Updated task "${editTaskTitle.trim() || editingTask.title}"`,
        details: `Updated task details & assigned staff: ${assignedStaffMembers.map(s => s.name).join(', ') || 'Unassigned'}`,
        description: `Updated task details & assigned staff: ${assignedStaffMembers.map(s => s.name).join(', ') || 'Unassigned'}`,
        taskId: editingTask.id,
        user: effectiveStaffName,
        userName: effectiveStaffName,
        userId: effectiveStaffId,
        createdAt: serverTimestamp()
      }).catch(() => {});

      toast.success("Task updated!");
      setEditingTask(null);
    } catch (err: any) {
      console.error("Error saving task edit:", err);
      toast.error("Failed to update task.");
    } finally {
      setIsSavingTaskEdit(false);
    }
  };

  // Calculate actual clocked milliseconds per task across all sessions
  const getTaskClockedMs = (taskId: string) => {
    let totalMs = 0;
    timeSessions.forEach((session: any) => {
      if (session.jobs && Array.isArray(session.jobs)) {
        session.jobs.forEach((j: any) => {
          if (j.id === jobId && j.taskId === taskId) {
            const startMs = parseTimestampMs(j.start);
            const endMs = j.end ? parseTimestampMs(j.end) : Date.now();
            if (startMs > 0) {
              totalMs += Math.max(0, endMs - startMs);
            }
          }
        });
      }
    });
    return totalMs;
  };

  // Check if current user is actively clocked into this task
  const isUserClockedIntoTask = (taskId: string) => {
    return timeSessions.some((s: any) => {
      const matchesUser = s.userId === effectiveUserId || s.staffId === effectiveUserId;
      if (!matchesUser) return false;
      const isActive = ['active', 'on_break'].includes(s.status) && !s.clockOut;
      if (!isActive || !s.jobs) return false;
      return s.jobs.some((j: any) => !j.end && j.id === jobId && j.taskId === taskId);
    });
  };

  // Get list of technicians currently clocked into this task
  const getClockedInStaffForTask = (taskId: string) => {
    const activeStaff: any[] = [];
    timeSessions.forEach((s: any) => {
      if (['active', 'on_break'].includes(s.status) && !s.clockOut && s.jobs) {
        const matchingJob = s.jobs.find((j: any) => !j.end && j.id === jobId && j.taskId === taskId);
        if (matchingJob) {
          activeStaff.push({
            name: s.userName || s.staffName || 'Technician',
            start: matchingJob.start
          });
        }
      }
    });
    return activeStaff;
  };

  // Helper to check if current logged-in user / technician is assigned to a specific task
  const isUserAssignedToTask = (task: any) => {
    if (!task) return false;
    
    // Find current user's staff record
    const currentStaffMember = allStaff.find(s => 
      s.id === effectiveUserId || 
      s.userId === effectiveUserId || 
      s.uid === effectiveUserId || 
      (user?.email && s.email && s.email.toLowerCase() === user.email.toLowerCase())
    );

    const validUserIds = [
      effectiveUserId, 
      user?.uid, 
      currentStaffMember?.id, 
      currentStaffMember?.userId, 
      currentStaffMember?.uid
    ].filter(Boolean);

    const assignedIds: string[] = [
      ...(task.assignedStaffIds || []),
      ...(task.assignedStaff || []).map((s: any) => s.id || s.uid || s.userId)
    ].filter(Boolean);

    if (assignedIds.length === 0) {
      return false;
    }

    return assignedIds.some(id => validUserIds.includes(id));
  };

  // Clock In to Task with immediate loading spinner (enforces assignment requirement)
  const handleTaskClockIn = async (task: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (clockingTaskState) return;

    if (!isUserAssignedToTask(task)) {
      toast.error("You must be assigned to this task before you can clock in.");
      return;
    }

    setClockingTaskState({ id: task.id, action: 'in' });
    try {
      await clockIntoJob(jobId, job?.title || 'Job', task.id, task.title || task.name);
    } catch (err: any) {
      console.error("Task clock-in error:", err);
      toast.error("Failed to clock in: " + (err.message || 'Unknown error'));
    } finally {
      setClockingTaskState(null);
    }
  };

  // Clock Out of Task with immediate loading spinner
  const handleTaskClockOut = async (task: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (clockingTaskState) return;
    setClockingTaskState({ id: task.id, action: 'out' });
    try {
      await clockOutOfJob(jobId, task.id);
    } catch (err: any) {
      console.error("Task clock-out error:", err);
      toast.error("Failed to clock out: " + (err.message || 'Unknown error'));
    } finally {
      setClockingTaskState(null);
    }
  };

  // Calculate task summary metrics
  const taskStats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => ['completed', 'QC', 'QC Complete'].includes(t.status)).length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const totalBookHours = tasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);
    const completedBookHours = tasks
      .filter(t => ['completed', 'QC', 'QC Complete'].includes(t.status))
      .reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);

    return { total, completed, inProgress, totalBookHours, completedBookHours };
  }, [tasks]);

  // QC Notes derivation for report
  const qcNotes = useMemo(() => {
    return tasks.flatMap((task: any) => 
      (task.task_notes || [])
        .filter((note: any) => (note.message || '').startsWith('[QC '))
        .map((note: any) => {
          const isPass = (note.message || '').startsWith('[QC VERIFIED]');
          const cleanMessage = (note.message || '')
            .replace('[QC VERIFIED]', '')
            .replace('[QC FAILED]', '')
            .trim();
          return {
            id: note.id || `${task.id}_${note.createdAt}`,
            taskId: task.id,
            taskTitle: task.title || task.name,
            isPass,
            message: cleanMessage,
            images: note.images || [],
            createdAt: note.createdAt,
            createdByName: note.createdByName || note.userName || 'Inspector'
          };
        })
    ).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tasks]);

  const qcPhotoNotes = useMemo(() => qcNotes.filter((qc: any) => qc.images && qc.images.length > 0), [qcNotes]);

  // Staff Workload Allocation Stats for report
  const staffStats = useMemo(() => {
    const statsMap: Record<string, {
      name: string;
      id: string;
      totalHours: number;
      completedHours: number;
      totalTasks: number;
      completedTasks: number;
      clockedHours: number;
    }> = {};

    tasks.forEach(task => {
      const isCompleted = ['QC', 'QC Complete', 'completed', 'Completed'].includes(task.status);
      const actualMs = getTaskClockedMs(task.id);
      const taskActualHours = actualMs / 3600000;
      const bookTime = task.payBasis === 'hourly' ? taskActualHours : (parseFloat(task.bookTime) || 0);

      const assignedStaff = (task.assignedStaff && task.assignedStaff.length > 0)
        ? task.assignedStaff
        : (task.assignedStaffIds || []).map((sid: string) => {
            const found = allStaff.find(s => s.id === sid || s.userId === sid);
            return { id: sid, name: found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name : 'Technician' };
          });

      if (assignedStaff.length === 0) {
        const staffId = 'unassigned';
        const staffName = 'Unassigned';
        if (!statsMap[staffId]) {
          statsMap[staffId] = {
            name: staffName,
            id: staffId,
            totalHours: 0,
            completedHours: 0,
            totalTasks: 0,
            completedTasks: 0,
            clockedHours: 0
          };
        }
        statsMap[staffId].totalHours += bookTime;
        statsMap[staffId].totalTasks += 1;
        statsMap[staffId].clockedHours += taskActualHours;
        if (isCompleted) {
          statsMap[staffId].completedHours += bookTime;
          statsMap[staffId].completedTasks += 1;
        }
      } else {
        const portionBook = bookTime / assignedStaff.length;
        const portionClocked = taskActualHours / assignedStaff.length;

        assignedStaff.forEach((staff: any) => {
          const staffId = staff.id || staff.uid;
          const staffName = staff.name || staff.displayName || 'Technician';

          if (!statsMap[staffId]) {
            statsMap[staffId] = {
              name: staffName,
              id: staffId,
              totalHours: 0,
              completedHours: 0,
              totalTasks: 0,
              completedTasks: 0,
              clockedHours: 0
            };
          }

          statsMap[staffId].totalHours += portionBook;
          statsMap[staffId].totalTasks += 1;
          statsMap[staffId].clockedHours += portionClocked;
          if (isCompleted) {
            statsMap[staffId].completedHours += portionBook;
            statsMap[staffId].completedTasks += 1;
          }
        });
      }
    });

    return Object.values(statsMap);
  }, [tasks, timeSessions, allStaff]);

  // Overall Job Efficiency Stats for report
  const jobEfficiencyStats = useMemo(() => {
    const totalBook = tasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);
    let totalActualMs = 0;
    tasks.forEach(t => {
      totalActualMs += getTaskClockedMs(t.id);
    });
    const totalActual = totalActualMs / 3600000;
    const variance = totalActual - totalBook;
    const efficiency = totalActual > 0 ? (totalBook / totalActual) * 100 : (totalBook > 0 ? 100 : 0);

    return { totalBook, totalActual, variance, efficiency };
  }, [tasks, timeSessions]);

  const totalBookHours = useMemo(() => tasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0), [tasks]);
  const completedBookHours = useMemo(() => tasks.filter(t => ['completed', 'QC Complete', 'QC'].includes(t.status)).reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0), [tasks]);
  const jobProgress = useMemo(() => totalBookHours > 0 ? Math.min(100, Math.round((completedBookHours / totalBookHours) * 100)) : (tasks.length > 0 ? Math.round((tasks.filter(t => ['completed', 'QC Complete', 'QC'].includes(t.status)).length / tasks.length) * 100) : 0), [totalBookHours, completedBookHours, tasks]);
  const formatJobDate = (dateVal: any) => dateVal ? formatDateSafe(dateVal) : 'N/A';

  if (loading) {
    return (
      <div className="w-full max-w-full overflow-x-hidden min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 animate-pulse mb-4">
          <Smartphone className="w-6 h-6" />
        </div>
        <div className="text-sm font-bold text-zinc-300">Loading Job Details V3...</div>
        <div className="text-xs text-zinc-500 mt-1">Apple PWA Mobile Engine</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="w-full max-w-full overflow-x-hidden min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-amber-500 mb-3" />
        <h2 className="text-base font-bold text-zinc-200">Job Record Not Found</h2>
        <p className="text-xs text-zinc-500 max-w-xs mt-1">Select a job from the Upfitting directory to open V3 details.</p>
        <button 
          onClick={() => navigate('/upfitters')}
          className="mt-5 h-11 px-5 bg-zinc-900 border border-zinc-800 rounded-2xl text-xs font-bold text-zinc-300 hover:text-white active:scale-95"
        >
          Back to Upfitting Hub
        </button>
      </div>
    );
  }

  const statusColor = job.status === 'Ready for Customer' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : job.status === 'Ready for QC' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    : job.status === 'In Bay' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    : job.status === 'QC Kickback' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    : 'bg-zinc-800 text-zinc-300 border-zinc-700';

  return (
    <div className="w-full max-w-full overflow-x-hidden min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-36">
      
      {/* Hidden File Input for Direct Device Camera / Photo Upload */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handlePhotoUpload} 
        accept="image/*" 
        multiple 
        className="hidden" 
      />

      {/* ========================================================================= */}
      {/* APPLE PWA STICKY TOP HEADER HUD (Touch target >=44px, zero overflow)     */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-30 w-full bg-zinc-950/90 backdrop-blur-md border-b border-zinc-900 px-4 py-3 no-print">
        <div className="max-w-6xl mx-auto space-y-2.5">
          <div className="flex items-center justify-between gap-2.5 max-w-full overflow-x-hidden">
            <div className="flex items-center gap-2.5 min-w-0">
              <button 
                onClick={() => navigate(-1)} 
                className="w-11 h-11 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white active:scale-95 transition-all flex items-center justify-center flex-shrink-0"
                aria-label="Go Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-black text-red-500 tracking-wider truncate">
                    #{jobDisplayNumber}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-bold uppercase truncate">
                    {customerDisplayName}
                  </span>
                </div>
                <h1 className="text-sm font-bold text-zinc-100 truncate leading-tight mt-0.5">
                  {job.title || job.name || 'Job Details'}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              
              {/* Quick Action: Print Job Details Sheet */}
              <button
                onClick={() => setShowReportModal(true)}
                className="h-11 px-3 bg-indigo-600/20 border border-indigo-500/40 hover:bg-indigo-600/30 text-indigo-200 text-xs font-bold rounded-2xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                title="Preview and Print Comprehensive Job Details Sheet"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Details Sheet</span>
              </button>

              {/* Quick Action: Print Traveler */}
              <button
                onClick={() => setIsPrintTravelerOpen(true)}
                className="h-11 px-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs font-bold rounded-2xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                title="Print Traveler Card & QR Code"
              >
                <Printer className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Traveler</span>
              </button>

              {/* Quick Action: Edit Job */}
              <button
                onClick={() => setIsJobEditOpen(true)}
                className="h-11 px-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs font-bold rounded-2xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                title="Edit Job Details"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Edit</span>
              </button>

              {/* Switch to Classic View Toggle */}
              <button
                onClick={() => {
                  setPreferredJobViewVersion('classic');
                  toast.success('Saved preference: Opening jobs in Classic view by default');
                  navigate(`/business/${tenantId}/job/${jobId}`);
                }}
                className="h-11 px-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs font-bold rounded-2xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                title="Switch to Classic Job Detail view and save preference"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden sm:inline">Classic</span>
              </button>

              {/* Status Picker Button */}
              <button
                onClick={() => setStatusModalOpen(true)}
                className={cn("h-11 px-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 active:scale-95 transition-all", statusColor)}
              >
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                <span className="truncate max-w-[110px]">{job.status || 'Active'}</span>
              </button>
            </div>
          </div>

          {/* Sub-Header Location, Dynamic ETA & Vehicle Quick Info */}
          <div className="pt-2 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-400 gap-2 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 flex-wrap">
              <div 
                onClick={() => setSpotModalOpen(true)}
                className="flex items-center gap-1.5 text-amber-400 font-mono font-bold hover:underline cursor-pointer truncate"
              >
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{parkingLocationDisplay}</span>
                <Edit3 className="w-3 h-3 text-zinc-500 shrink-0" />
              </div>

              <div className="flex items-center gap-1.5 font-bold truncate">
                <Timer className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="text-zinc-200">ETA: {etaDetails.etaString}</span>
                <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0", etaDetails.badgeColor)}>
                  {etaDetails.varianceText}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-zinc-300 font-semibold truncate ml-auto">
              <Car className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span className="truncate">{vehicleYearMakeModel}</span>
            </div>
          </div>

          {/* Active Blocker Alert Banner */}
          {(activeBlockers.length > 0 || job.status === 'Blocked') && (
            <div 
              onClick={() => setIsBlockerModalOpen(true)}
              className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-2 cursor-pointer hover:bg-rose-500/15 transition group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1 rounded-lg bg-rose-500/20 text-rose-400 shrink-0 animate-pulse">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                    <span>🚨 Active Production Blocker</span>
                    {activeBlockers.length > 1 && (
                      <span className="text-rose-300 font-bold text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20">
                        {activeBlockers.length} active
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-rose-200 truncate">
                    {activeBlockers[0]?.message || job.blocker || 'Job is currently blocked by a production obstacle.'}
                  </div>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsBlockerModalOpen(true);
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shrink-0 transition active:scale-95 shadow-md cursor-pointer"
              >
                Manage ({activeBlockers.length})
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ========================================================================= */}
      {/* RESPONSIVE TAB NAVIGATION (Zero Side-Scrolling, Aligned to max-w-6xl)     */}
      {/* ========================================================================= */}
      <nav className="sticky top-[95px] z-20 w-full bg-zinc-950/95 backdrop-blur border-b border-zinc-900 px-4 py-2 no-print">
        <div className="max-w-6xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar sm:overflow-visible">
          {[
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'tasks', label: `Tasks (${tasks.length})`, icon: Layers },
            { id: 'qc', label: `QC Gate (${tasks.filter(t => t.status === 'QC Complete' || Boolean(t.qcCompletedAt)).length}/${tasks.filter(t => ['completed', 'QC Complete', 'QC'].includes(t.status)).length})`, icon: ShieldCheck },
            { id: 'photos', label: `Photos (${nativePhotos.length + companyCamPhotos.length})`, icon: Camera },
            { id: 'parts', label: `Parts (${partsRequests.length})`, icon: Package },
            { id: 'staff', label: `Staff & Time (${staffRoster.length})`, icon: Timer },
            { id: 'history', label: `History (${rawUnifiedTimeline.length})`, icon: Activity },
            { id: 'chat', label: 'Team Chat', icon: MessageSquare }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id || (tab.id === 'tasks' && activeTab === 'takeoffs') || (tab.id === 'staff' && (activeTab === 'timelog' || activeTab === 'telemetry'));
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "h-10 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shrink-0 text-center",
                  isActive
                    ? "bg-zinc-800 text-white font-black shadow-sm border border-zinc-700 ring-1 ring-white/10"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent"
                )}
              >
                <Icon className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-red-500" : "text-zinc-500")} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ========================================================================= */}
      {/* MAIN TAB CONTENT CONTAINER                                                */}
      {/* ========================================================================= */}
      <main className="px-4 py-5 max-w-6xl mx-auto space-y-6">

        {/* ------------------------------------------------------------------------- */}
        {/* TAB 1: OVERVIEW                                                           */}
        {/* ------------------------------------------------------------------------- */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Metrics KPI Bar with Dynamic ETA */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Tasks Progress</div>
                <div className="text-xl font-black text-white mt-0.5">{taskStats.completed} / {taskStats.total}</div>
                <div className="text-[10px] text-emerald-400 font-bold mt-0.5">
                  {taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0}% Done
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Book Hours</div>
                <div className="text-xl font-black text-white mt-0.5">{taskStats.completedBookHours.toFixed(1)}h</div>
                <div className="text-[10px] text-zinc-400 font-semibold mt-0.5">of {taskStats.totalBookHours.toFixed(1)}h booked</div>
              </div>

              <div 
                onClick={() => setIsEtaTrendModalOpen(true)}
                className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-indigo-500/50 hover:bg-zinc-900/90 transition cursor-pointer group flex flex-col justify-between"
                title="Click to view ETA Trending & Burndown Velocity Chart"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Dynamic ETA</span>
                    <span className="text-[9px] font-bold text-indigo-400 opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                      <Activity className="w-2.5 h-2.5" /> Trend
                    </span>
                  </div>
                  <div className="text-sm font-black text-indigo-400 mt-1 truncate">{etaDetails.etaString}</div>
                  
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={cn("text-[9px] font-bold truncate", etaDetails.status === 'behind' ? "text-rose-400" : etaDetails.status === 'at_risk' ? "text-amber-400" : "text-emerald-400")}>
                      {etaDetails.varianceText}
                    </span>
                    {etaTrendData.trendDirection === 'shrinking' && (
                      <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-0.5">
                        <TrendingDown className="w-2.5 h-2.5" /> -{etaTrendData.deltaHours}h
                      </span>
                    )}
                    {etaTrendData.trendDirection === 'growing' && (
                      <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-0.5">
                        <TrendingUp className="w-2.5 h-2.5" /> +{etaTrendData.deltaHours}h
                      </span>
                    )}
                  </div>
                </div>

                {/* Mini SVG Sparkline */}
                {etaTrendData.points.length > 1 && (
                  <div className="mt-2 h-7 w-full">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                      <defs>
                        <linearGradient id="etaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={etaTrendData.trendDirection === 'growing' ? '#f43f5e' : '#6366f1'} stopOpacity="0.35" />
                          <stop offset="100%" stopColor={etaTrendData.trendDirection === 'growing' ? '#f43f5e' : '#6366f1'} stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <polygon points={etaTrendData.svgArea} fill="url(#etaGradient)" />
                      <polyline
                        fill="none"
                        stroke={etaTrendData.trendDirection === 'growing' ? '#f43f5e' : '#818cf8'}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={etaTrendData.svgPath}
                      />
                    </svg>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Active Bay Time</div>
                <div className="text-xl font-black text-white mt-0.5">{bayTimeHours}h</div>
                <div className="text-[10px] text-blue-400 font-bold mt-0.5">Floor Duration</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lot Parking Time</div>
                <div className="text-xl font-black text-white mt-0.5">{parkingTimeHours}h</div>
                <div className="text-[10px] text-amber-400 font-bold mt-0.5">Yard Duration</div>
              </div>
            </div>

            {/* Vehicle & Customer Specifications Card */}
            <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-red-500" />
                  Vehicle Identification & Order Info
                </h3>
                <span className="text-[10px] font-mono text-zinc-400">{vehicleStockNumber}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-zinc-500 font-medium block">VIN Number:</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono font-bold text-zinc-100">{vehicleVinDisplay}</span>
                    {vehicleVinRaw && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(vehicleVinRaw);
                          setCopiedVin(true);
                          setTimeout(() => setCopiedVin(false), 2000);
                          toast.success('VIN copied to clipboard');
                        }}
                        className="p-1 text-zinc-400 hover:text-white"
                        title="Copy VIN"
                      >
                        {copiedVin ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-zinc-500 font-medium block">Customer / Agency:</span>
                  <span className="font-bold text-zinc-100 block mt-0.5">{customerDisplayName}</span>
                </div>

                <div>
                  <span className="text-zinc-500 font-medium block">Target Delivery Date:</span>
                  <span className="font-bold text-zinc-100 block mt-0.5">{formatDateSafe(job.scheduledEndDate || job.dueDate)}</span>
                </div>

                <div>
                  <span className="text-zinc-500 font-medium block">Purchase Order / SO:</span>
                  <span className="font-mono text-zinc-300 block mt-0.5">
                    PO: {job.purchaseOrderNumber || job.poNumber || 'N/A'} • SO: {job.salesOrderNumber || job.soNumber || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                onClick={() => setIsPrintTravelerOpen(true)}
                className="h-12 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-zinc-200 active:scale-95 transition"
              >
                <Printer className="w-4 h-4 text-indigo-400" />
                <span>Traveler Card</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-12 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-zinc-200 active:scale-95 transition"
              >
                <Camera className="w-4 h-4 text-violet-400" />
                <span>Add Photos</span>
              </button>

              <button
                onClick={() => {
                  setSelectedTaskForPart(null);
                  setIsPartRequestOpen(true);
                }}
                className="h-12 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-zinc-200 active:scale-95 transition cursor-pointer"
              >
                <Package className="w-4 h-4 text-amber-400" />
                <span>Request Part</span>
              </button>

              <button
                onClick={() => setActiveTab('chat')}
                className="h-12 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-zinc-200 active:scale-95 transition cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span>Team Chat</span>
              </button>
            </div>

            {/* Production Blockers Card */}
            <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
                <h3 className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Production Blockers & Issues ({activeBlockers.length})
                </h3>
                <button
                  onClick={() => setIsBlockerModalOpen(true)}
                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Blocker</span>
                </button>
              </div>

              {activeBlockers.length === 0 ? (
                <div className="py-3 px-4 rounded-xl bg-zinc-950/40 border border-zinc-800/50 flex items-center justify-between">
                  <span className="text-xs text-zinc-500 italic">No active blockers holding up this job.</span>
                  <button
                    onClick={() => setIsBlockerModalOpen(true)}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold rounded-lg transition active:scale-95 cursor-pointer"
                  >
                    + Flag Issue
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeBlockers.map((b: any) => (
                    <div key={b.id} className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-rose-200">{b.message}</p>
                        <div className="text-[10px] text-rose-400/80 mt-0.5 font-medium">
                          Reported by {b.createdBy || 'Staff'} • {formatDateSafe(b.createdAt, true)}
                        </div>
                      </div>

                      <button
                        onClick={() => handleResolveBlocker(b.id)}
                        disabled={resolvingBlockerId === b.id}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-xl shrink-0 transition active:scale-95 flex items-center gap-1 cursor-pointer"
                      >
                        {resolvingBlockerId === b.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        <span>Resolve</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Job Timeline & Recent History Preview Card */}
            <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  Recent Job History & Activity ({rawUnifiedTimeline.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                >
                  <span>View Full Log</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {rawUnifiedTimeline.length === 0 ? (
                <div className="p-4 text-center text-zinc-500 italic text-xs">
                  No activity recorded yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {rawUnifiedTimeline.slice(0, 5).map((evt) => (
                    <div
                      key={evt.id}
                      className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/70 flex items-start gap-3 text-xs"
                    >
                      <div className="text-sm mt-0.5 shrink-0">{evt.iconSymbol || '📜'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-zinc-100 truncate">{evt.title}</h4>
                          <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                            {formatDateSafe(evt.timestamp, true)}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">{evt.description}</p>
                      </div>
                    </div>
                  ))}
                  {rawUnifiedTimeline.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className="w-full py-2 text-center text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/5 rounded-xl border border-dashed border-indigo-500/20 transition cursor-pointer"
                    >
                      View all {rawUnifiedTimeline.length} history events ➔
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* TAB 2: TASKS & INSPECTION TAKEOFFS                                        */}
        {/* ------------------------------------------------------------------------- */}
        {(activeTab === 'tasks' || activeTab === 'takeoffs') && (
          <div className="space-y-4">
            {/* Unified Filter Bar: Task Categories + Inspection Checklist */}
            <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => {
                    setTaskSubTab('tasks');
                    setSelectedTaskCategory('all');
                  }}
                  className={cn(
                    "h-9 px-3.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer",
                    taskSubTab === 'tasks' && selectedTaskCategory === 'all'
                      ? "bg-red-500 text-white font-black shadow-sm"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                  )}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>All Tasks ({tasks.length})</span>
                </button>

                {taskGroupList.map(group => (
                  <button
                    key={group.categoryName}
                    onClick={() => {
                      setTaskSubTab('tasks');
                      setSelectedTaskCategory(group.categoryName);
                    }}
                    className={cn(
                      "h-9 px-3.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 active:scale-95 cursor-pointer",
                      taskSubTab === 'tasks' && selectedTaskCategory === group.categoryName
                        ? "bg-red-500 text-white font-black shadow-sm"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                    )}
                  >
                    <span>{group.categoryName}</span>
                    <span className="opacity-60 text-[10px]">({group.tasks.length})</span>
                  </button>
                ))}
              </div>

              {/* Right: Inspection Checklist Toggle */}
              <button
                type="button"
                onClick={() => setTaskSubTab(prev => prev === 'takeoffs' ? 'tasks' : 'takeoffs')}
                className={cn(
                  "h-9 px-3.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer ml-auto",
                  taskSubTab === 'takeoffs'
                    ? "bg-indigo-600 text-white font-black shadow-sm border border-indigo-500"
                    : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                )}
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Inspection Checklist ({takeoffs.filter(t => t.checked).length}/{takeoffs.length || 6})</span>
              </button>
            </div>

            {taskSubTab === 'tasks' ? (
              <div className="space-y-4">
                {/* Rapid Task Creation Bar (For Authorized Staff) */}
                {canManageTasks && (
                  <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-lg space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5" />
                        Quick Add Task to Job
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Auto Book Time • Tab + Enter to Add
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      {/* Title Autocomplete */}
                      <div className="sm:col-span-3 bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-1 flex items-center">
                        <TaskTitleAutocomplete
                          id="new-task-title-input"
                          value={newTaskTitle}
                          onChange={handleTaskTitleChange}
                          qbItems={qbItems}
                          placeholder="Task title (e.g. Sirens, Harness)..."
                          onPressEnter={() => handleCreateTask()}
                          className="w-full"
                          inputClassName="text-xs text-white placeholder-zinc-500 font-medium"
                        />
                      </div>

                      {/* Notes / Description */}
                      <div className="sm:col-span-3 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 flex items-center">
                        <input
                          type="text"
                          value={newTaskDesc}
                          onChange={(e) => setNewTaskDesc(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTask(); }}
                          placeholder="Notes / instructions..."
                          className="w-full bg-transparent border-none outline-none text-xs text-zinc-200 placeholder-zinc-500 font-medium"
                        />
                      </div>

                      {/* Book Time (hrs) */}
                      <div className="sm:col-span-1 bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-1 flex items-center">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={newTaskBookTime}
                          onChange={(e) => setNewTaskBookTime(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTask(); }}
                          placeholder="0.0h"
                          className="w-full bg-transparent border-none outline-none text-xs text-indigo-400 font-mono font-bold placeholder-zinc-600"
                        />
                      </div>

                      {/* Department Select */}
                      <div className="sm:col-span-2 bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-1 flex items-center">
                        <select
                          value={newTaskDeptId || lastDepartmentId}
                          onChange={(e) => {
                            setNewTaskDeptId(e.target.value);
                            setLastDepartmentId(e.target.value);
                          }}
                          className="w-full bg-transparent border-none outline-none text-xs text-zinc-300 font-medium cursor-pointer"
                        >
                          {departments.map((dept) => (
                            <option key={dept.id} value={dept.id} className="bg-zinc-900 text-zinc-200">
                              {dept.name || dept.title || dept.id}
                            </option>
                          ))}
                          {departments.length === 0 && (
                            <option value="upfitters" className="bg-zinc-900 text-zinc-200">Upfitters</option>
                          )}
                        </select>
                      </div>

                      {/* Multi-Staff Searchable Picker */}
                      <div className="sm:col-span-3">
                        <SearchableStaffMultiPicker
                          allStaff={allStaff}
                          selectedStaffIds={newTaskStaffIds.length > 0 ? newTaskStaffIds : lastAssignedStaffIds}
                          onChange={(ids) => {
                            setNewTaskStaffIds(ids);
                            setLastAssignedStaffIds(ids);
                          }}
                          placeholder="Search & assign tech(s)..."
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-zinc-500">
                        Category: <strong className="text-zinc-400">{selectedTaskCategory === 'all' ? 'General Labor' : selectedTaskCategory}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCreateTask()}
                        disabled={isAddingTask}
                        className="h-8 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 active:scale-95 shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
                      >
                        {isAddingTask ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
                        <span>Add Task (↵)</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Grouped Accordions */}
                {filteredTaskGroups.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 italic bg-zinc-900/40 rounded-2xl border border-zinc-800">
                    No tasks found for this category.
                  </div>
                ) : (
                  filteredTaskGroups.map((group) => {
                    const isCollapsed = !!collapsedCategories[group.categoryName];
                    const completedCount = group.tasks.filter(t => ['completed', 'QC Complete', 'QC'].includes(t.status)).length;
                    const totalGroupCount = group.tasks.length;

                    return (
                      <div key={group.categoryName} className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 overflow-hidden">
                        {/* Accordion Group Header */}
                        <button
                          onClick={() => toggleCategoryCollapse(group.categoryName)}
                          className="w-full p-4 flex items-center justify-between bg-zinc-900/90 hover:bg-zinc-850 transition text-left"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-zinc-500">
                              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                            <h3 className="font-black text-xs uppercase tracking-wider text-zinc-200 truncate">{group.categoryName}</h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono font-bold">
                              {completedCount}/{totalGroupCount}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-indigo-400">
                              {group.tasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0).toFixed(1)}h
                            </span>
                          </div>
                        </button>

                        {/* Task List Inside Category */}
                        {!isCollapsed && (
                          <div className="divide-y divide-zinc-800/60 p-2 space-y-1.5">
                            {group.tasks.map((task) => {
                              const isCompleted = ['completed', 'QC Complete', 'QC'].includes(task.status);
                              const isInProgress = task.status === 'in_progress';
                              const isClockedIn = isUserClockedIntoTask(task.id);
                              const actualMs = getTaskClockedMs(task.id);
                              const actualHours = (actualMs / (1000 * 60 * 60)).toFixed(1);
                              const bookHours = parseFloat(task.bookTime) || 0;
                              const isOverrun = bookHours > 0 && (actualMs / 3600000) > bookHours;
                              const activeTechs = getClockedInStaffForTask(task.id);
                              const deptName = departments.find(d => d.id === task.departmentId)?.name || task.departmentName;
                              
                              // Multi-staff list
                              const assignedStaffList: any[] = (task.assignedStaff && task.assignedStaff.length > 0)
                                ? task.assignedStaff
                                : (task.assignedStaffIds || []).map((sid: string) => {
                                    const found = allStaff.find(s => s.id === sid || s.userId === sid);
                                    return { id: sid, name: found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name : 'Tech' };
                                  });

                              const taskNotes = task.description || task.notes;

                              return (
                                <div
                                  key={task.id}
                                  className={cn(
                                    "p-3 rounded-xl transition flex flex-col md:flex-row md:items-center justify-between gap-3 group",
                                    isCompleted 
                                      ? "bg-zinc-950/40 opacity-75" 
                                      : isClockedIn 
                                      ? "bg-rose-500/10 border border-rose-500/30" 
                                      : isInProgress 
                                      ? "bg-indigo-500/5 border border-indigo-500/20" 
                                      : "bg-zinc-950/60 border border-zinc-850"
                                  )}
                                >
                                  {/* Left Section: Checkbox & Main Info */}
                                  <div className="flex items-start gap-3 flex-1 min-w-0">
                                    {/* Interactive Checkbox */}
                                    <button
                                      onClick={() => handleToggleTaskStatus(task)}
                                      className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center transition shrink-0 active:scale-90 mt-0.5 cursor-pointer",
                                        isCompleted ? "bg-emerald-500 text-white" : "bg-zinc-900 border border-zinc-700 text-transparent hover:border-zinc-500"
                                      )}
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>

                                    {/* Title, Notes & Badges */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 
                                          onClick={() => setSelectedTask(task)}
                                          className={cn("text-xs font-bold cursor-pointer hover:text-indigo-400 transition", isCompleted ? "line-through text-zinc-400" : "text-zinc-100")}
                                        >
                                          {task.title || task.name}
                                        </h4>
                                        {isInProgress && !isClockedIn && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-400 font-bold uppercase shrink-0 animate-pulse">
                                            In Progress
                                          </span>
                                        )}
                                        {isClockedIn && (
                                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-black uppercase shrink-0 animate-pulse flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                            You are Clocked In
                                          </span>
                                        )}
                                        {activeTechs.length > 0 && !isClockedIn && (
                                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center gap-1 animate-pulse shrink-0">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                            {activeTechs.map(t => t.name).join(', ')} Clocked In
                                          </span>
                                        )}
                                      </div>

                                      {/* Task Notes / Description */}
                                      {taskNotes && (
                                        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                                          {taskNotes}
                                        </p>
                                      )}

                                      {/* Metadata Badges */}
                                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-zinc-400 flex-wrap">
                                        {/* Book Hours */}
                                        <span className="font-mono text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                          {task.bookTime || 0}h Book
                                        </span>

                                        {/* Actual Clocked Hours */}
                                        <span className={cn(
                                          "font-mono font-bold px-1.5 py-0.5 rounded",
                                          isOverrun ? "bg-rose-500/20 text-rose-300" : actualMs > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-900 text-zinc-500"
                                        )}>
                                          {actualHours}h Actual
                                        </span>

                                        {/* Department Badge */}
                                        {deptName && (
                                          <span className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-medium">
                                            🏢 {deptName}
                                          </span>
                                        )}

                                        {/* Assigned Staff Badges */}
                                        {assignedStaffList.length > 0 ? (
                                          assignedStaffList.map((st: any) => (
                                            <span 
                                              key={st.id} 
                                              onClick={() => canManageTasks && handleOpenEditTask(task)}
                                              className={cn(
                                                "bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 px-2 py-0.5 rounded font-medium text-[10px] flex items-center gap-1",
                                                canManageTasks && "cursor-pointer hover:bg-indigo-500/20 hover:border-indigo-500/50 hover:text-white transition"
                                              )}
                                              title={canManageTasks ? "Click to edit assigned staff" : undefined}
                                            >
                                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                                              {st.name}
                                            </span>
                                          ))
                                        ) : (
                                          <span 
                                            onClick={() => canManageTasks && handleOpenEditTask(task)}
                                            className={cn(
                                              "text-zinc-500 text-[10px] italic px-1.5 py-0.5 rounded",
                                              canManageTasks && "cursor-pointer hover:bg-zinc-800 hover:text-indigo-400 border border-dashed border-zinc-800 transition"
                                            )}
                                            title={canManageTasks ? "Click to assign staff" : undefined}
                                          >
                                            {canManageTasks ? "+ Assign Tech" : "Unassigned"}
                                          </span>
                                        )}

                                        {/* SOP Reference Photos */}
                                        {(() => {
                                          const key = (task.title || task.name || '').trim().toLowerCase();
                                          const photoCount = taskRefPhotoCounts[key] || task.historicalPhotoCount || 0;
                                          return photoCount > 0 ? (
                                            <span 
                                              onClick={() => setSelectedTask(task)}
                                              className="text-violet-400 hover:text-violet-300 flex items-center gap-1 font-semibold cursor-pointer bg-violet-500/10 px-1.5 py-0.5 rounded"
                                            >
                                              <Camera className="w-3 h-3" />
                                              {photoCount} SOP Photos
                                            </span>
                                          ) : null;
                                        })()}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right Section: Action Controls */}
                                  <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                                    {/* Clock In / Out Button with Precise Action Spinner */}
                                    {(() => {
                                      const isClockingThis = clockingTaskState?.id === task.id;
                                      const isClockingIn = isClockingThis && clockingTaskState?.action === 'in';
                                      const isClockingOut = isClockingThis && clockingTaskState?.action === 'out';

                                      if (isClockingIn) {
                                        return (
                                          <button
                                            type="button"
                                            disabled
                                            className="h-8 px-3 rounded-xl bg-indigo-600/80 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-indigo-600/20 opacity-90 cursor-wait"
                                          >
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                            <span>Clocking In...</span>
                                          </button>
                                        );
                                      }

                                      if (isClockingOut) {
                                        return (
                                          <button
                                            type="button"
                                            disabled
                                            className="h-8 px-3 rounded-xl bg-rose-500/80 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-rose-500/20 opacity-90 cursor-wait"
                                          >
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                            <span>Clocking Out...</span>
                                          </button>
                                        );
                                      }

                                      if (isClockedIn) {
                                        return (
                                          <button
                                            type="button"
                                            onClick={(e) => handleTaskClockOut(task, e)}
                                            disabled={isClockingJob}
                                            className="h-8 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-rose-500/20 active:scale-95 transition cursor-pointer"
                                          >
                                            <Square className="w-3 h-3 fill-current" />
                                            <span>Clock Out</span>
                                          </button>
                                        );
                                      }

                                      if (!isCompleted && (isUserAssignedToTask(task) || isClockedIn)) {
                                        return (
                                          <button
                                            type="button"
                                            onClick={(e) => handleTaskClockIn(task, e)}
                                            disabled={isClockingJob}
                                            className="h-8 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-indigo-600/20 active:scale-95 transition cursor-pointer"
                                          >
                                            <Play className="w-3 h-3 fill-current" />
                                            <span>Clock In</span>
                                          </button>
                                        );
                                      }

                                      return null;
                                    })()}

                                    {/* Request Part */}
                                    <button
                                      onClick={() => {
                                        setSelectedTaskForPart(task);
                                        setIsPartRequestOpen(true);
                                      }}
                                      className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-400 transition cursor-pointer"
                                      title="Request part for this task"
                                    >
                                      <Package className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Edit Task (Authorized Staff) */}
                                    {canManageTasks && (
                                      <button
                                        onClick={() => handleOpenEditTask(task)}
                                        className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
                                        title="Edit task details & book hours"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    )}

                                    {/* Delete Task (Authorized Staff) */}
                                    {canManageTasks && (
                                      <button
                                        onClick={() => handleDeleteTask(task.id, task.title || task.name)}
                                        className="p-2 rounded-xl bg-zinc-900 hover:bg-rose-950/50 text-zinc-400 hover:text-rose-400 transition cursor-pointer"
                                        title="Delete task"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}

                                    {/* Open Task Drawer & Reference Photos */}
                                    <button
                                      onClick={() => setSelectedTask(task)}
                                      className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
                                      title="View task details and SOP reference photos"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              /* Takeoffs Checklist Sub-View */
              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-zinc-200">Vehicle Intake Inspection Checklist</h3>
                    <p className="text-[11px] text-zinc-500">Verify body, lighting, power, and customer items</p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                    {takeoffs.filter(t => t.checked).length}/{takeoffs.length || 6} Checked
                  </span>
                </div>

                {takeoffs.length === 0 ? (
                  <div className="space-y-2">
                    {[
                      { id: 't1', label: 'Body Condition & Scratch Inspection', checked: true },
                      { id: 't2', label: 'Glass, Mirrors & Lens Condition', checked: true },
                      { id: 't3', label: 'Emergency Lighting & Siren Function Test', checked: false },
                      { id: 't4', label: 'Console & 12V Power System Check', checked: false },
                      { id: 't5', label: 'Customer Personal Items Removed', checked: true },
                      { id: 't6', label: 'Keys & Keyfob Count Verified', checked: true }
                    ].map((item) => (
                      <div key={item.id} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/60 flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-200">{item.label}</span>
                        <span className={cn("text-[10px] px-2 py-0.5 rounded font-bold", item.checked ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500")}>
                          {item.checked ? 'Passed / Verified' : 'Pending Check'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {takeoffs.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleToggleTakeoff(item)}
                        className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/60 flex items-center justify-between cursor-pointer hover:bg-zinc-900 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={cn("w-5 h-5 rounded-md flex items-center justify-center", item.checked ? "bg-emerald-500 text-white" : "bg-zinc-800 border border-zinc-700")}>
                            {item.checked && <Check className="w-3.5 h-3.5" />}
                          </div>
                          <span className="text-xs font-bold text-zinc-200">{item.title || item.label || 'Check item'}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">{item.checkedBy || 'Pending'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* TAB: QUALITY CONTROL (QC) INSPECTION SUITE                                 */}
        {/* ------------------------------------------------------------------------- */}
        {activeTab === 'qc' && (
          <div className="space-y-6">
            {/* QC Quality Gate Header Banner */}
            <div className="p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800/90 shadow-2xl backdrop-blur space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-white tracking-tight">Quality Control Inspection Gate</h2>
                      <span className={cn(
                        "text-[10px] font-black uppercase px-2 py-0.5 rounded-full border",
                        tasks.filter(t => t.status === 'QC Complete' || Boolean(t.qcCompletedAt)).length === tasks.length && tasks.length > 0
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                          : "bg-amber-500/20 text-amber-400 border-amber-500/40"
                      )}>
                        {tasks.filter(t => t.status === 'QC Complete' || Boolean(t.qcCompletedAt)).length} of {tasks.length} Verified
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 font-medium mt-0.5">
                      Verify technician workmanship, inspect completed tasks, issue rework kickbacks, and sign off for customer delivery.
                    </p>
                  </div>
                </div>

                {/* Bulk Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleBulkPassAllQC}
                    disabled={isBulkQCPassing || tasks.filter(t => ['completed', 'QC'].includes(t.status) && !t.qcCompletedAt && t.status !== 'QC Complete').length === 0}
                    className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs inline-flex items-center gap-1.5 shadow-lg active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                  >
                    {isBulkQCPassing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Bulk Pass Completed ({tasks.filter(t => ['completed', 'QC'].includes(t.status) && !t.qcCompletedAt && t.status !== 'QC Complete').length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (job.status === 'Ready for Customer') {
                        toast.info("Job is already Ready for Customer");
                        return;
                      }
                      try {
                        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
                          status: 'Ready for Customer',
                          readyForCustomerAt: new Date().toISOString(),
                          readyForCustomerBy: effectiveStaffName,
                          readyForCustomerById: effectiveStaffId,
                          updatedAt: serverTimestamp()
                        });
                        toast.success("Job status set to Ready for Customer!");
                      } catch (e: any) {
                        toast.error(`Status update failed: ${e.message}`);
                      }
                    }}
                    className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs inline-flex items-center gap-1.5 shadow-lg active:scale-95 transition cursor-pointer"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    <span>Sign-Off: Ready for Customer</span>
                  </button>
                </div>
              </div>

              {/* Progress Summary KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-800/80">
                <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="text-[10px] font-black uppercase text-zinc-500">Total Job Tasks</div>
                  <div className="text-xl font-black text-white font-mono mt-0.5">{tasks.length}</div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="text-[10px] font-black uppercase text-emerald-400">QC Passed</div>
                  <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">
                    {tasks.filter(t => t.status === 'QC Complete' || Boolean(t.qcCompletedAt)).length}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="text-[10px] font-black uppercase text-amber-400">Awaiting QC</div>
                  <div className="text-xl font-black text-amber-400 font-mono mt-0.5">
                    {tasks.filter(t => ['completed', 'QC'].includes(t.status) && t.status !== 'QC Complete' && !t.qcCompletedAt).length}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
                  <div className="text-[10px] font-black uppercase text-rose-400">In Progress / Rework</div>
                  <div className="text-xl font-black text-rose-400 font-mono mt-0.5">
                    {tasks.filter(t => !['completed', 'QC Complete', 'QC'].includes(t.status)).length}
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-2xl">
                {(['all', 'awaiting_qc', 'qc_passed', 'rework'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setQcFilter(f)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-black transition capitalize active:scale-95 cursor-pointer",
                      qcFilter === f ? "bg-zinc-800 text-white shadow-sm border border-zinc-700" : "text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    {f === 'all' ? `All Tasks (${tasks.length})` :
                     f === 'awaiting_qc' ? `🟡 Awaiting QC (${tasks.filter(t => ['completed', 'QC'].includes(t.status) && !t.qcCompletedAt && t.status !== 'QC Complete').length})` :
                     f === 'qc_passed' ? `✅ QC Passed (${tasks.filter(t => t.status === 'QC Complete' || Boolean(t.qcCompletedAt)).length})` :
                     `🔴 Incomplete / Rework (${tasks.filter(t => !['completed', 'QC Complete', 'QC'].includes(t.status)).length})`}
                  </button>
                ))}
              </div>
            </div>

            {/* QC Tasks Deck */}
            <div className="space-y-3">
              {tasks
                .filter(t => {
                  const isDone = ['completed', 'QC Complete', 'QC'].includes(t.status);
                  const isPass = t.status === 'QC Complete' || Boolean(t.qcCompletedAt);
                  const isAwaiting = isDone && !isPass;
                  const isRework = !isDone;

                  if (qcFilter === 'awaiting_qc') return isAwaiting;
                  if (qcFilter === 'qc_passed') return isPass;
                  if (qcFilter === 'rework') return isRework;
                  return true;
                })
                .map((t, idx) => {
                  const isDone = ['completed', 'QC Complete', 'QC'].includes(t.status);
                  const isPass = t.status === 'QC Complete' || Boolean(t.qcCompletedAt);
                  const isKickback = t.qcFailedAt || t.qcKickbackReason;

                  const booked = parseFloat(t.bookTime || t.hours || '0');
                  const clockedMs = getTaskClockedMs(t.id);
                  const clockedHours = clockedMs / 3600000;

                  return (
                    <div 
                      key={t.id || `task_${idx}`}
                      className={cn(
                        "p-4 rounded-2xl border transition shadow-sm space-y-3",
                        isPass 
                          ? "bg-zinc-900/60 border-emerald-500/20 hover:border-emerald-500/40" 
                          : isKickback 
                            ? "bg-rose-950/20 border-rose-500/30" 
                            : isDone 
                              ? "bg-zinc-900/80 border-amber-500/20 hover:border-amber-500/40"
                              : "bg-zinc-900/40 border-zinc-800/80 opacity-80"
                      )}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                              {t.category || t.department || t.taskGroup || 'GENERAL'}
                            </span>
                            <h4 className="text-sm font-black text-white truncate">
                              {t.title || t.name || 'Task'}
                            </h4>
                            <span className="text-xs font-mono font-bold text-indigo-400">
                              {booked.toFixed(1)}h Book
                            </span>
                            {clockedHours > 0 && (
                              <span className="text-xs font-mono font-medium text-amber-400">
                                • {clockedHours < 0.1 ? `${Math.round(clockedMs / 60000)}m` : `${clockedHours.toFixed(1)}h`} clocked
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
                            <span>Tech: <strong className="text-zinc-200">{t.completedByStaffName || t.completedBy || t.assignedTechName || 'Assigned Tech'}</strong></span>
                            {t.completedAt && (
                              <span>• Completed: <strong className="text-zinc-300">{new Date(t.completedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong></span>
                            )}
                          </div>
                        </div>

                        {/* Status Badge & QC Actions */}
                        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                          {isPass ? (
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-black">
                              <ShieldCheck className="w-4 h-4" />
                              <span>QC Passed</span>
                            </div>
                          ) : isDone ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handlePassTaskQC(t)}
                                disabled={isQCPassingTaskId === t.id}
                                className="h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs inline-flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                              >
                                {isQCPassingTaskId === t.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                )}
                                <span>Pass QC</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setQcKickbackModalTask(t);
                                  setQcKickbackTaskReason('');
                                }}
                                className="h-8 px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs inline-flex items-center gap-1.5 active:scale-95 cursor-pointer"
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                <span>Kickback</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-zinc-500 italic px-2.5 py-1 rounded-lg bg-zinc-800/50">
                              Task In Progress
                            </span>
                          )}
                        </div>
                      </div>

                      {/* QC Sign-off or Kickback reason display */}
                      {isPass && t.qcCompletedBy && (
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 font-medium flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            Inspected and signed off by <strong>{t.qcCompletedBy}</strong> {t.qcCompletedAt ? `on ${new Date(t.qcCompletedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
                          </span>
                        </div>
                      )}

                      {isKickback && (
                        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 font-medium space-y-1">
                          <div className="font-bold flex items-center gap-1.5 text-rose-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Rework Required (Kicked back by {t.qcFailedBy || 'Inspector'}):
                          </div>
                          <p className="text-rose-200 italic pl-5">{t.qcKickbackReason || 'Please inspect wiring and mounting.'}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* TAB 3: STAFF ROSTER, TIME LOG & BAY TELEMETRY HUB                         */}
        {/* ------------------------------------------------------------------------- */}
        {(activeTab === 'staff' || activeTab === 'timelog' || activeTab === 'telemetry') && (
          <div className="space-y-4">
            {/* Sub-View Switcher: Staff vs Time Log vs Bay Telemetry */}
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-900 border border-zinc-800 w-fit flex-wrap">
              <button
                type="button"
                onClick={() => setStaffSubTab('roster')}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95",
                  staffSubTab === 'roster' ? "bg-zinc-800 text-white font-black shadow-sm border border-zinc-700" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <span>👨‍🔧 Staff Roster ({staffRoster.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setStaffSubTab('timelog')}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95",
                  staffSubTab === 'timelog' ? "bg-zinc-800 text-white font-black shadow-sm border border-zinc-700" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <span>⏱️ Timeline & Audit ({rawUnifiedTimeline.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setStaffSubTab('telemetry')}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95",
                  staffSubTab === 'telemetry' ? "bg-zinc-800 text-white font-black shadow-sm border border-zinc-700" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <span>📡 Bay Telemetry ({bayTimeHours}h)</span>
              </button>
            </div>

            {staffSubTab === 'roster' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {staffRoster.map((member) => (
                  <div key={member.id} className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-400">
                        {member.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-white">{member.name}</h4>
                        <div className="text-[10px] text-zinc-400">{member.email || 'Technician'}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-black text-indigo-400">{(member.clockedMs / 3600000).toFixed(1)}h</div>
                      <div className="text-[10px] text-emerald-400 font-bold">{member.completedBookHours.toFixed(1)}h Book</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {staffSubTab === 'timelog' && (
              <div className="space-y-3">
                {rawUnifiedTimeline.map((evt) => (
                  <div key={evt.id} className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-3">
                    <div className="text-base mt-0.5">{evt.iconSymbol || '📜'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-zinc-100 truncate">{evt.title}</h4>
                        <span className="text-[10px] text-zinc-500 font-mono">{formatDateSafe(evt.timestamp, true)}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{evt.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {staffSubTab === 'telemetry' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Active Work Bay Duration</span>
                    <div className="text-2xl font-black text-blue-400 mt-1">{bayTimeHours}h</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Parking Lot Duration</span>
                    <div className="text-2xl font-black text-amber-400 mt-1">{parkingTimeHours}h</div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Current Assigned Zone</span>
                    <div className="text-sm font-bold text-zinc-200 mt-0.5">{parkingLocationDisplay}</div>
                  </div>
                  <button
                    onClick={() => setSpotModalOpen(true)}
                    className="h-10 px-4 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl active:scale-95 cursor-pointer"
                  >
                    Relocate Spot
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* TAB 6: PHOTOS & COMPANYCAM LIVE STREAM                                    */}
        {/* ------------------------------------------------------------------------- */}
        {activeTab === 'photos' && (
          <div className="space-y-5">
            
            {/* Action Bar: Upload & 1-Click Bi-Directional Sync */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className="h-10 px-4 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploadingPhoto ? 'Uploading...' : 'Upload Photos / Camera'}</span>
                </button>

                {(job.companyCamId || job.companyCamProjectId) ? (
                  <button
                    onClick={handleSyncPhotosToCompanyCam}
                    disabled={isBidirectionalSyncing || loadingCcPhotos}
                    className={cn(
                      "h-10 px-4 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all cursor-pointer shadow-md active:scale-95",
                      unsyncedToCc.length === 0
                        ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40"
                    )}
                    title="Push local UpfittersOS photos to the linked CompanyCam project"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", (isBidirectionalSyncing || loadingCcPhotos) && "animate-spin text-amber-400")} />
                    <span>
                      {isBidirectionalSyncing 
                        ? 'Pushing to CompanyCam...' 
                        : unsyncedToCc.length === 0
                          ? `✓ Synced to CompanyCam (${companyCamPhotos.length})` 
                          : `Sync ${unsyncedToCc.length} Photo(s) to CompanyCam`}
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsJobEditOpen(true)}
                    className="h-10 px-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-blue-400" />
                    <span>Link CompanyCam Project ID</span>
                  </button>
                )}
              </div>

              {(job.companyCamId || job.companyCamProjectId) && (
                <div className="flex items-center gap-2">
                  <a
                    href={`https://app.companycam.com/projects/${job.companyCamId || job.companyCamProjectId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-10 px-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-blue-500/20 transition"
                  >
                    <span>CompanyCam Project #{job.companyCamId || job.companyCamProjectId}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    onClick={() => fetchCompanyCamPhotos()}
                    disabled={loadingCcPhotos}
                    className="h-10 w-10 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-xl flex items-center justify-center transition cursor-pointer"
                    title="Refresh CompanyCam Stream"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", loadingCcPhotos && "animate-spin text-blue-400")} />
                  </button>
                </div>
              )}
            </div>

            {/* Filter Sub-Tabs */}
            <div className="flex items-center gap-1.5 bg-zinc-950/80 p-1 rounded-xl border border-zinc-800/80 w-fit flex-wrap">
              <button
                type="button"
                onClick={() => setPhotoFilterTab('all')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer",
                  photoFilterTab === 'all' ? "bg-violet-600 text-white shadow-sm" : "text-zinc-400 hover:text-white"
                )}
              >
                All Photos ({allNativePhotos.length + companyCamPhotos.length})
              </button>
              <button
                type="button"
                onClick={() => setPhotoFilterTab('upfitters')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer",
                  photoFilterTab === 'upfitters' ? "bg-amber-500 text-zinc-950 shadow-sm" : "text-zinc-400 hover:text-white"
                )}
              >
                ⚡ UpfittersOS ({allNativePhotos.length})
              </button>
              {(job.companyCamId || job.companyCamProjectId) && (
                <button
                  type="button"
                  onClick={() => setPhotoFilterTab('companycam')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer",
                    photoFilterTab === 'companycam' ? "bg-blue-600 text-white shadow-sm" : "text-zinc-400 hover:text-white"
                  )}
                >
                  📷 CompanyCam ({companyCamPhotos.length})
                </button>
              )}
            </div>

            {/* Photos Gallery Grid */}
            <div className="space-y-6">
              {/* 1. UpfittersOS Section */}
              {(photoFilterTab === 'all' || photoFilterTab === 'upfitters') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <span>⚡ UpfittersOS Photos</span>
                      <span className="text-zinc-500 font-mono">({allNativePhotos.length})</span>
                    </h4>
                  </div>

                  {allNativePhotos.length === 0 ? (
                    <div className="p-6 text-center text-zinc-500 bg-zinc-900/30 rounded-2xl border border-zinc-800/40 italic text-xs">
                      No UpfittersOS photos uploaded yet. Tap "Upload Photos / Camera" to capture intake or completed photos.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      {allNativePhotos.map((photo) => {
                        const isSyncedToCc = photo.syncedToCc || Boolean(photo.ccId) || companyCamPhotos.some(cc => {
                          const ccUrl = cc.url || cc.uris?.original || cc.uris?.web || cc.uris?.[0]?.uri;
                          return ccUrl === photo.url || (photo.ccId && String(cc.id) === String(photo.ccId));
                        });

                        return (
                          <div
                            key={photo.id}
                            className="group relative aspect-square rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-sm flex flex-col justify-between"
                          >
                            <img 
                              src={photo.url} 
                              alt={photo.caption || 'Job Photo'} 
                              onClick={() => setActiveLightboxPhoto(photo)}
                              className="w-full h-full object-cover group-hover:scale-105 transition cursor-pointer" 
                            />

                            {/* Top Badges */}
                            <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none">
                              <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/70 text-amber-300 backdrop-blur-sm">
                                Upfitters
                              </span>
                              {isSyncedToCc && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 backdrop-blur-sm">
                                  ✓ In CC
                                </span>
                              )}
                            </div>

                            {/* Bottom Caption Overlay */}
                            <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent text-[9px] text-zinc-300">
                              <div className="font-bold truncate text-white">{photo.caption || 'Job Photo'}</div>
                              <div className="text-[8px] text-zinc-400 truncate">{photo.uploadedBy || 'Technician'}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 2. CompanyCam Live Feed Section */}
              {(job.companyCamId || job.companyCamProjectId) && (photoFilterTab === 'all' || photoFilterTab === 'companycam') && (
                <div className="space-y-2 pt-4 border-t border-zinc-900">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5" />
                      <span>CompanyCam Project Feed</span>
                      <span className="text-zinc-500 font-mono">({companyCamPhotos.length})</span>
                    </h4>
                  </div>

                  {companyCamPhotos.length === 0 ? (
                    <div className="p-6 text-center text-zinc-500 bg-blue-500/5 rounded-2xl border border-blue-500/10 italic text-xs">
                      No CompanyCam photos found for Project #{job.companyCamId || job.companyCamProjectId}.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      {companyCamPhotos.map((photo: any, idx: number) => {
                        const photoUrl = photo.url || photo.uris?.original || photo.uris?.web || photo.uris?.[0]?.uri || photo.uris?.thumbnail;

                        return (
                          <div
                            key={photo.id || idx}
                            className="group relative aspect-square rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-sm flex flex-col justify-between"
                          >
                            <img 
                              src={photoUrl} 
                              alt="CompanyCam" 
                              onClick={() => setActiveLightboxPhoto({ url: photoUrl, caption: `CompanyCam photo by ${photo.creator_name || 'Technician'}` })}
                              className="w-full h-full object-cover group-hover:scale-105 transition cursor-pointer" 
                            />

                            {/* Top Badge */}
                            <div className="absolute top-2 left-2 flex items-center pointer-events-none">
                              <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-950/80 border border-blue-500/30 text-blue-300 backdrop-blur-sm">
                                CompanyCam
                              </span>
                            </div>

                            {/* Bottom Caption Overlay */}
                            <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent text-[9px] text-zinc-300">
                              <div className="font-bold truncate text-white">{photo.creator_name || 'CompanyCam'}</div>
                              <div className="text-[8px] text-zinc-400 truncate">
                                {photo.created_at ? formatDateSafe(new Date(photo.created_at * 1000), true) : 'CompanyCam Photo'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* TAB 7: INTERACTIVE TAKEOFFS & VEHICLE INTAKE CHECKLIST                    */}
        {/* ------------------------------------------------------------------------- */}
        {activeTab === 'takeoffs' && (
          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300">Vehicle Intake Inspection Checklist</h3>
              {takeoffs.length === 0 ? (
                <div className="space-y-2">
                  {[
                    { id: 't1', label: 'Body Condition & Scratch Inspection', checked: true },
                    { id: 't2', label: 'Glass, Mirrors & Lens Condition', checked: true },
                    { id: 't3', label: 'Emergency Lighting & Siren Function Test', checked: false },
                    { id: 't4', label: 'Console & 12V Power System Check', checked: false },
                    { id: 't5', label: 'Customer Personal Items Removed', checked: true },
                    { id: 't6', label: 'Keys & Keyfob Count Verified', checked: true }
                  ].map((item) => (
                    <div key={item.id} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800/60 flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200">{item.label}</span>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded font-bold", item.checked ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500")}>
                        {item.checked ? 'Passed / Verified' : 'Pending Check'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {takeoffs.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleToggleTakeoff(item)}
                      className="p-3 rounded-xl bg-zinc-900 border border-zinc-800/60 flex items-center justify-between cursor-pointer hover:bg-zinc-800/50 transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={cn("w-5 h-5 rounded-md flex items-center justify-center", item.checked ? "bg-emerald-500 text-white" : "bg-zinc-800 border border-zinc-700")}>
                          {item.checked && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-xs font-bold text-zinc-200">{item.title || item.label || 'Check item'}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">{item.checkedBy || 'Pending'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* TAB 8: PARTS REQUEST HUB                                                  */}
        {/* ------------------------------------------------------------------------- */}
        {activeTab === 'parts' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300">Parts Requests ({partsRequests.length})</h3>
              <button
                onClick={() => {
                  setSelectedTaskForPart(null);
                  setIsPartRequestOpen(true);
                }}
                className="h-10 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black rounded-xl flex items-center gap-1.5 active:scale-95 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Request Part</span>
              </button>
            </div>

            {partsRequests.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 bg-zinc-900/30 rounded-2xl border border-zinc-800/40 italic">
                No parts requests logged for this job. Tap "+ Request Part" if you need components from inventory.
              </div>
            ) : (
              <div className="space-y-2">
                {partsRequests.map((part) => (
                  <div key={part.id} className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-100">{part.partName || 'Part'}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">Qty: {part.quantity || 1}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        Task: {part.taskTitle || 'General'} • Requested by: {part.requestedBy || 'Upfitter'}
                      </div>
                    </div>

                    <span className={cn(
                      "text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider",
                      part.status === 'RECEIVED' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                      part.status === 'ORDERED' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                      "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    )}>
                      {part.status || 'PENDING'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* TAB 9: LIVE TEAM CHAT & NOTES HUB                                        */}
        {/* ------------------------------------------------------------------------- */}
        {activeTab === 'chat' && (
          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-4">
            <JobChat tenantId={tenantId} jobId={jobId} />
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* TAB 10: DEDICATED JOB HISTORY & TIMELINE AUDIT LOG                        */}
        {/* ------------------------------------------------------------------------- */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  Job Timeline & Audit History
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Complete chronological history of task completions, labor intervals, moves, blockers, and QC actions.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/25 px-3 py-1.5 rounded-xl">
                {rawUnifiedTimeline.length} Total Events
              </span>
            </div>

            {rawUnifiedTimeline.length === 0 ? (
              <div className="p-10 rounded-3xl bg-zinc-900/40 border border-zinc-800 text-center space-y-2">
                <FileText className="w-8 h-8 text-zinc-600 mx-auto" />
                <div className="text-xs text-zinc-400 font-medium">No history events recorded for this job yet.</div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {rawUnifiedTimeline.map((evt) => (
                  <div 
                    key={evt.id} 
                    className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition flex items-start gap-3.5 group shadow-sm"
                  >
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-lg shrink-0 group-hover:scale-105 transition">
                      {evt.iconSymbol || '📜'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <h4 className="text-xs font-bold text-zinc-100 truncate">{evt.title}</h4>
                          {evt.category && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-semibold uppercase shrink-0">
                              {evt.category}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                          {formatDateSafe(evt.timestamp, true)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                        {evt.description}
                      </p>
                      {evt.user && (
                        <div className="text-[10px] text-zinc-500 mt-1.5 flex items-center gap-1">
                          <span>Recorded by:</span>
                          <span className="font-semibold text-zinc-300">{evt.user}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ========================================================================= */}
      {/* TASK DETAIL DRAWER WITH CROSS-JOB HISTORICAL REFERENCE PHOTOS             */}
      {/* ========================================================================= */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-lg h-full bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden">
            
            {/* Drawer Header */}
            <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
              <div className="min-w-0 flex-1 pr-2">
                <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Task Details</span>
                <h3 className="text-sm font-bold text-zinc-100 truncate mt-0.5">{selectedTask.title || selectedTask.name}</h3>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="w-10 h-10 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="p-4 flex-1 overflow-y-auto space-y-5">
              
              {/* Task Status Toggle, Clocking & Book Hours */}
              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Book vs Actual</span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-xl font-black text-white">{selectedTask.bookTime || '0.0'}h</span>
                      <span className="text-xs text-zinc-400 font-mono">
                        ({(getTaskClockedMs(selectedTask.id) / 3600000).toFixed(1)}h logged)
                      </span>
                    </div>
                  </div>

                  {/* Complete Button */}
                  <button
                    onClick={() => handleToggleTaskStatus(selectedTask)}
                    className={cn(
                      "h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition cursor-pointer",
                      ['completed', 'QC Complete'].includes(selectedTask.status)
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    )}
                  >
                    <Check className="w-4 h-4" />
                    <span>{['completed', 'QC Complete'].includes(selectedTask.status) ? 'Completed' : 'Mark Completed'}</span>
                  </button>
                </div>

                {/* Clock In / Out on Task */}
                <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                  <span className="text-xs text-zinc-400 font-medium">Technician Timeclock:</span>
                  {(() => {
                    const isClockingThis = clockingTaskState?.id === selectedTask.id;
                    const isClockingIn = isClockingThis && clockingTaskState?.action === 'in';
                    const isClockingOut = isClockingThis && clockingTaskState?.action === 'out';

                    if (isClockingIn) {
                      return (
                        <button
                          type="button"
                          disabled
                          className="h-9 px-4 rounded-xl bg-indigo-600/80 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-indigo-600/20 opacity-90 cursor-wait"
                        >
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Clocking In...</span>
                        </button>
                      );
                    }

                    if (isClockingOut) {
                      return (
                        <button
                          type="button"
                          disabled
                          className="h-9 px-4 rounded-xl bg-rose-500/80 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-rose-500/20 opacity-90 cursor-wait"
                        >
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Clocking Out...</span>
                        </button>
                      );
                    }

                    if (isUserClockedIntoTask(selectedTask.id)) {
                      return (
                        <button
                          type="button"
                          onClick={(e) => handleTaskClockOut(selectedTask, e)}
                          disabled={isClockingJob}
                          className="h-9 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-rose-500/20 active:scale-95 transition cursor-pointer"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>Clock Out of Task</span>
                        </button>
                      );
                    }

                    if (isUserAssignedToTask(selectedTask) || isUserClockedIntoTask(selectedTask.id)) {
                      return (
                        <button
                          type="button"
                          onClick={(e) => handleTaskClockIn(selectedTask, e)}
                          disabled={isClockingJob}
                          className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-indigo-600/20 active:scale-95 transition cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Clock In to Task</span>
                        </button>
                      );
                    }

                    return null;
                  })()}
                </div>
              </div>

              {/* Task Notes / Instructions */}
              {(selectedTask.description || selectedTask.notes) && (
                <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/70 space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Installation Notes & Instructions</span>
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {selectedTask.description || selectedTask.notes}
                  </p>
                </div>
              )}

              {/* Department & Staff Assignment */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-zinc-900/40 border border-zinc-800/70">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">Department</span>
                  <div className="text-xs font-bold text-zinc-200 mt-1">
                    {departments.find(d => d.id === selectedTask.departmentId)?.name || selectedTask.departmentName || 'General Labor'}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-zinc-900/40 border border-zinc-800/70">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">Assigned Tech</span>
                  <div className="text-xs font-bold text-zinc-200 mt-1 truncate">
                    {selectedTask.assignedToName || selectedTask.assignedStaff?.[0]?.name || (selectedTask.assignedStaffIds?.[0] ? allStaff.find(s => s.id === selectedTask.assignedStaffIds[0])?.name : 'Unassigned')}
                  </div>
                </div>
              </div>

              {/* Task Actions: Edit & Request Part */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    setSelectedTaskForPart(selectedTask);
                    setIsPartRequestOpen(true);
                  }}
                  className="h-11 bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 text-amber-400 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-98 transition cursor-pointer"
                >
                  <Package className="w-4 h-4" />
                  <span>Request Part</span>
                </button>

                {canManageTasks && (
                  <button
                    onClick={() => handleOpenEditTask(selectedTask)}
                    className="h-11 bg-zinc-900 border border-zinc-800 hover:border-indigo-500/40 text-zinc-200 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-98 transition cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                    <span>Edit Task</span>
                  </button>
                )}
              </div>

              {/* ------------------------------------------------------------------- */}
              {/* CROSS-JOB HISTORICAL REFERENCE PHOTOS SECTION                       */}
              {/* ------------------------------------------------------------------- */}
              <div className="space-y-3 pt-3 border-t border-zinc-900">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" />
                    Historical Reference Photos ({historicalRefPhotos.length})
                  </h4>
                  {loadingRefPhotos && <span className="text-[10px] text-zinc-500 animate-pulse">Searching past jobs...</span>}
                </div>

                {/* Filter Dimension Pills: All / Same Vehicle / Same Customer */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setRefFilter('all')}
                    className={cn(
                      "h-8 px-2.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1",
                      refFilter === 'all' ? "bg-indigo-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"
                    )}
                  >
                    All ({historicalRefPhotos.length})
                  </button>

                  <button
                    onClick={() => setRefFilter('vehicle')}
                    className={cn(
                      "h-8 px-2.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 truncate max-w-[200px]",
                      refFilter === 'vehicle' ? "bg-indigo-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"
                    )}
                    title={`Same Vehicle: ${vehicleYearMakeModel}`}
                  >
                    <Car className="w-3 h-3 shrink-0" />
                    <span className="truncate">Same Vehicle ({historicalRefPhotos.filter(p => p.vehicleYearMakeModel.toLowerCase() === vehicleYearMakeModel.toLowerCase()).length})</span>
                  </button>

                  <button
                    onClick={() => setRefFilter('customer')}
                    className={cn(
                      "h-8 px-2.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 truncate max-w-[200px]",
                      refFilter === 'customer' ? "bg-indigo-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"
                    )}
                    title={`Same Customer: ${customerDisplayName}`}
                  >
                    <span className="truncate">Same Customer ({historicalRefPhotos.filter(p => p.customerName.toLowerCase() === customerDisplayName.toLowerCase()).length})</span>
                  </button>
                </div>

                {/* Reference Photo Cards */}
                {filteredRefPhotos.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 bg-zinc-900/30 rounded-2xl border border-zinc-800/40 italic text-xs">
                    {loadingRefPhotos ? 'Searching past completed jobs for wiring/mounting photos...' : 'No historical reference photos found for this task title.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredRefPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        onClick={() => setActiveLightboxPhoto(photo)}
                        className="group rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-indigo-500/40 transition cursor-pointer flex flex-col"
                      >
                        <div className="aspect-[4/3] w-full overflow-hidden bg-black relative">
                          <img src={photo.url} alt={photo.caption} className="w-full h-full object-cover group-hover:scale-105 transition" />
                          <div className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded-md text-white">
                            <ZoomIn className="w-3 h-3" />
                          </div>
                        </div>
                        <div className="p-2 space-y-0.5">
                          <div className="text-[11px] font-bold text-zinc-200 truncate">#{photo.jobNumber} • {photo.customerName}</div>
                          <div className="text-[10px] text-zinc-500 truncate">🚙 {photo.vehicleYearMakeModel}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* BLOCKER MANAGEMENT MODAL                                                  */}
      {/* ========================================================================= */}
      {isBlockerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-zinc-100">Production Blockers & Issues</h3>
                  <p className="text-[11px] text-zinc-500">Track and resolve obstacles preventing upfit progress</p>
                </div>
              </div>

              <button onClick={() => setIsBlockerModalOpen(false)} className="text-zinc-500 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
              {/* Add New Blocker Form */}
              <form onSubmit={handleAddBlocker} className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                <label className="block text-zinc-300 font-bold text-xs">Flag New Blocker</label>
                <textarea
                  value={newBlockerMsg}
                  onChange={(e) => setNewBlockerMsg(e.target.value)}
                  placeholder="e.g. Waiting on custom console bracket from warehouse / Customer changed spec..."
                  rows={2}
                  className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-600 text-xs focus:border-rose-500 focus:outline-none resize-none"
                  required
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isAddingBlocker || !newBlockerMsg.trim()}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md"
                  >
                    {isAddingBlocker ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    <span>Add Blocker</span>
                  </button>
                </div>
              </form>

              {/* Active Blockers List */}
              <div className="space-y-2">
                <div className="text-[11px] font-black uppercase tracking-wider text-rose-400 flex items-center justify-between">
                  <span>Active Blockers ({activeBlockers.length})</span>
                </div>

                {activeBlockers.length === 0 ? (
                  <div className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/40 text-center text-zinc-500 italic">
                    No active blockers on this job.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeBlockers.map((b: any) => (
                      <div key={b.id} className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-rose-200">{b.message}</p>
                          <div className="text-[10px] text-rose-400/80 mt-1 font-medium">
                            Reported by {b.createdBy || 'Staff'} • {formatDateSafe(b.createdAt, true)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleResolveBlocker(b.id)}
                          disabled={resolvingBlockerId === b.id}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shrink-0 transition active:scale-95 flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          {resolvingBlockerId === b.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Resolve</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resolved Blockers Archive */}
              {resolvedBlockers.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                  <div className="text-[11px] font-black uppercase tracking-wider text-zinc-500">
                    Resolved History ({resolvedBlockers.length})
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {resolvedBlockers.map((b: any) => (
                      <div key={b.id} className="p-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/60 flex items-center justify-between text-zinc-400">
                        <div className="min-w-0">
                          <span className="line-through text-zinc-400 text-xs">{b.message}</span>
                          <div className="text-[9px] text-zinc-500 mt-0.5">
                            Cleared by {b.resolvedBy || 'Staff'} • {formatDateSafe(b.resolvedAt || b.createdAt, true)}
                          </div>
                        </div>
                        <span className="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                          Resolved
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => setIsBlockerModalOpen(false)}
                className="h-10 px-5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl active:scale-95 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TASK EDIT MODAL (Authorized Staff)                                        */}
      {/* ========================================================================= */}
      {editingTask && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl space-y-4">
            <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Edit Task Record</span>
                <h3 className="text-sm font-bold text-white mt-0.5 truncate">{editingTask.title || editingTask.name}</h3>
              </div>
              <button
                onClick={() => setEditingTask(null)}
                className="w-8 h-8 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Title */}
              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Task Title</label>
                <input
                  type="text"
                  value={editTaskTitle}
                  onChange={(e) => setEditTaskTitle(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs font-semibold focus:border-indigo-500 outline-none"
                  placeholder="Task title..."
                />
              </div>

              {/* Description / Notes */}
              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Instructions & Notes</label>
                <textarea
                  rows={3}
                  value={editTaskDesc}
                  onChange={(e) => setEditTaskDesc(e.target.value)}
                  className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs leading-relaxed focus:border-indigo-500 outline-none resize-none"
                  placeholder="Add specific installation notes, wire routing directions, or details..."
                />
              </div>

              {/* Book Hours & Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Book Hours */}
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Book Hours</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editTaskBookTime}
                    onChange={(e) => setEditTaskBookTime(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-indigo-400 font-mono font-bold text-xs focus:border-indigo-500 outline-none"
                    placeholder="0.0h"
                  />
                </div>

                {/* Department */}
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Department</label>
                  <select
                    value={editTaskDeptId}
                    onChange={(e) => setEditTaskDeptId(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs font-semibold focus:border-indigo-500 outline-none cursor-pointer"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id} className="bg-zinc-900 text-white">
                        {d.name || d.title || d.id}
                      </option>
                    ))}
                    {departments.length === 0 && (
                      <option value="upfitters" className="bg-zinc-900 text-white">Upfitters</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Assigned Staff (Searchable Multi-Staff Embedded) */}
              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Assigned Technicians ({editTaskStaffIds.length})
                </label>
                <SearchableStaffMultiPicker
                  allStaff={allStaff}
                  selectedStaffIds={editTaskStaffIds}
                  onChange={setEditTaskStaffIds}
                  mode="embedded"
                  placeholder="Search staff by name, role, or department..."
                />
              </div>
            </div>

            <div className="p-4 bg-zinc-900/50 border-t border-zinc-900 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="h-10 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditedTask}
                disabled={isSavingTaskEdit}
                className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/20 active:scale-95 transition disabled:opacity-50 cursor-pointer"
              >
                {isSavingTaskEdit && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PARTS REQUEST MODAL INTEGRATION                                           */}
      {/* ========================================================================= */}
      {isPartRequestOpen && (
        <PartsRequestModal
          tenantId={tenantId}
          jobId={jobId}
          jobTitle={job.title || 'Job'}
          taskId={selectedTaskForPart?.id}
          taskTitle={selectedTaskForPart?.title}
          user={user}
          onClose={() => {
            setIsPartRequestOpen(false);
            setSelectedTaskForPart(null);
          }}
          onSuccess={() => {
            setIsPartRequestOpen(false);
            setSelectedTaskForPart(null);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* PRINT TRAVELER CARD MODAL (Classic Big QR & CompanyCam Dual Print Layout) */}
      {/* ========================================================================= */}
      {isPrintTravelerOpen && (
        <>
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: letter portrait;
                margin: 0.4in;
              }
              body > *:not(.traveler-print-wrapper) {
                display: none !important;
                height: 0 !important;
                overflow: hidden !important;
                padding: 0 !important;
                margin: 0 !important;
              }
              .traveler-print-wrapper {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                height: auto !important;
                min-height: auto !important;
                overflow: visible !important;
                background: white !important;
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
                border-radius: 0 !important;
              }
            }
          ` }} />

          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 no-print">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-xl w-full flex flex-col gap-4 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh]">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800 shrink-0">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Printer className="w-4 h-4 text-indigo-400" />
                  Job Traveler Card Preview
                </h3>
                <button 
                  onClick={() => setIsPrintTravelerOpen(false)}
                  className="text-xs font-bold text-zinc-500 hover:text-zinc-300"
                >
                  ✕ Close
                </button>
              </div>

              {/* Screen-visible preview container */}
              <div className="border border-zinc-800 rounded-2xl p-4 bg-zinc-950 max-h-[60vh] overflow-y-auto flex flex-col items-center custom-scrollbar w-full">
                <div 
                  id="single-job-card-preview"
                  className="bg-white text-zinc-900 p-6 font-sans w-full max-w-[440px] flex flex-col justify-between rounded-xl shadow-md my-1 text-left"
                >
                  {/* Header info */}
                  <div className="border-b-2 border-indigo-900 pb-3 flex justify-between items-start">
                    <div>
                      <span className="text-[8px] font-black tracking-widest text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded">Job Card</span>
                      <h1 className="text-xl font-black text-indigo-950 mt-1 tracking-tight">JOB #{jobDisplayNumber}</h1>
                      {job.title && job.title !== jobDisplayNumber && (
                        <p className="text-xs font-bold text-zinc-700 mt-0.5">{job.title}</p>
                      )}
                      <p className="text-xs font-extrabold text-indigo-900 mt-1 uppercase tracking-wide">Customer: {customerDisplayName}</p>
                      <p className="text-xs font-extrabold text-zinc-800 mt-0.5 uppercase tracking-wide">Vehicle: {vehicleYearMakeModel}</p>
                      {vehicleVinRaw && (
                        <p className="text-[11px] font-mono text-zinc-600 mt-0.5 font-bold">VIN: {vehicleVinRaw}</p>
                      )}
                    </div>
                  </div>

                  {/* Main Big UpfittersOS QR Code */}
                  <div className="flex flex-col items-center justify-center my-4 py-2 w-full">
                    <div className="p-2 bg-white border border-zinc-200 rounded-xl shadow-sm">
                      <LogoQRCode 
                        value={`${window.location.origin}/business/${tenantId}/job/${jobId}`}
                        size={160}
                        type="general"
                      />
                    </div>
                    <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mt-2">Scan QR to open job details</p>
                  </div>

                  {/* CompanyCam Dual QR Code Box */}
                  {(() => {
                    const ccId = job.companyCamId || job.companyCamProjectId || '';
                    return ccId ? (
                      <div className="border-t border-zinc-200 pt-2.5 bg-zinc-50 p-2.5 rounded-lg text-left text-[10px]">
                        <div className="flex items-center gap-3">
                          <div className="p-1 bg-white border border-zinc-200 rounded-md shadow-sm shrink-0">
                            <LogoQRCode 
                              value={ccId.startsWith('http') ? ccId : `https://app.companycam.com/projects/${ccId}`}
                              size={60}
                              type="general"
                            />
                          </div>
                          <div>
                            <h4 className="font-black text-zinc-400 uppercase tracking-widest text-[8px]">CompanyCam Photos</h4>
                            <p className="text-[10px] font-bold text-zinc-800 mt-0.5">Scan QR to view photos</p>
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Footer */}
                  <div className="border-t border-zinc-150 pt-2 flex justify-between items-center text-[8px] text-zinc-400 font-black uppercase tracking-wider mt-2">
                    <span>UpfittersOS</span>
                    <span>Printed: {new Date().toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800 shrink-0">
                <button
                  onClick={() => setIsPrintTravelerOpen(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Traveler</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* JOB DETAILS SHEET PRINT MODAL (Comprehensive Report)                      */}
      {/* ========================================================================= */}
      {showReportModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200 job-report-modal-wrapper">
          {/* Print Style Injector */}
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: letter portrait;
                margin: 0.4in;
              }

              /* 1. Hide everything under body that isn't the modal wrapper */
              body > *:not(.job-report-modal-wrapper) {
                display: none !important;
                height: 0 !important;
                overflow: hidden !important;
                padding: 0 !important;
                margin: 0 !important;
              }

              /* 2. Hide any headers/buttons/sidebars marked no-print inside the modal */
              .no-print,
              .no-print * {
                display: none !important;
                height: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
              }

              /* 3. Reset the modal wrapper and ALL intermediate layout containers to simple block containers with auto-height and no animation/transform offsets */
              .job-report-modal-wrapper,
              .job-report-modal-container,
              .job-report-modal-container > div,
              .job-report-modal-container > div > div {
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

              /* 4. Style the print card itself to take full width naturally starting at the top of Page 1 */
              #job-report-print-area {
                width: 100% !important;
                max-width: 100% !important;
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                display: block !important;
                position: static !important;
                animation: none !important;
                transition: none !important;
                transform: none !important;
              }

              /* 5. Prevent splitting cards in half */
              .print-no-break {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
          ` }} />

          <div className="w-full max-w-4xl h-[90vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 job-report-modal-container">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 no-print shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Job Details Sheet</h3>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Preview or Print</p>
                </div>
              </div>
              <button 
                onClick={() => setShowReportModal(false)}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Report Preview */}
              <div className="flex-1 overflow-y-auto p-6 bg-zinc-100 dark:bg-zinc-950/40 custom-scrollbar">
                <div className="mb-3 flex justify-between items-center no-print">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Document Preview</span>
                  <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Print Details Sheet
                  </button>
                </div>

                {/* Printable Area Wrapper */}
                <div 
                  id="job-report-print-area" 
                  className="bg-white text-zinc-900 p-8 rounded-2xl border border-zinc-200 shadow-md font-sans mx-auto max-w-[800px]"
                >
                  {/* Print Header */}
                  <div className="border-b-2 border-indigo-900 pb-4 mb-6 flex justify-between items-start">
                    <div>
                      <h1 className="text-2xl font-black uppercase tracking-tight text-indigo-950">JOB DETAILS SHEET</h1>
                      <p className="text-sm font-bold text-zinc-500 mt-1 uppercase tracking-wider">
                        {customerDisplayName || 'Walk-in Customer'} &bull; Job #{jobDisplayNumber}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div className="flex flex-col items-end">
                        <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Report Date</div>
                        <div className="text-xs font-bold font-mono">{new Date().toLocaleDateString()}</div>
                      </div>
                      <LogoQRCode 
                        value={`${window.location.origin}/business/${tenantId}/job/${jobId}`} 
                        size={60} 
                        logoUrl={businessLogo}
                        businessName={businessName}
                        type="job"
                      />
                    </div>
                  </div>

                  {/* Overview Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 mb-6 text-xs print-no-break">
                    <div>
                      <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Job Title</span>
                      <span className="font-bold text-zinc-800">{job.title || job.name}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Vehicle</span>
                      <span className="font-bold text-zinc-800 block">
                        {vehicleYearMakeModel || 'Not Specified'}
                      </span>
                      {vehicleVinRaw && (
                        <span className="font-mono text-[10px] text-zinc-500 block truncate">
                          VIN: {vehicleVinRaw}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Scheduled Bay</span>
                      <span className="font-bold text-zinc-800">{job.bay || job.parkingSpot || 'Main Floor'}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Scheduled Start</span>
                      <span className="font-bold text-zinc-800">{formatJobDate(job.scheduledStartDate || job.createdAt)}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Deadline</span>
                      <span className="font-bold text-zinc-800">{formatJobDate(job.scheduledEndDate || job.deadline)}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-indigo-500 uppercase tracking-widest">Dynamic ETA</span>
                      <span className="font-bold text-indigo-900">{etaDetails.etaString}</span>
                    </div>
                    <div className="col-span-2 sm:col-span-3 mt-2 pt-2 border-t border-indigo-100 flex items-center justify-between">
                      <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Total Job Progress</span>
                      <div className="flex items-center gap-3 w-4/5">
                        <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${jobProgress}%` }} />
                        </div>
                        <span className="font-bold font-mono text-zinc-800 text-xs whitespace-nowrap">
                          {completedBookHours.toFixed(1)}h / {totalBookHours.toFixed(1)}h ({jobProgress}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Staff Workload Section */}
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-6 text-xs print-no-break">
                    <h3 className="text-xs font-black text-zinc-700 border-b border-zinc-200 pb-1.5 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Staff Workload Allocation
                    </h3>
                    {staffStats.length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">No staff assigned.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-zinc-200 text-zinc-400 font-bold uppercase tracking-wider text-[9px]">
                              <th className="py-1">Technician</th>
                              <th className="py-1 text-center">Tasks (Done / Total)</th>
                              <th className="py-1 text-right">Time Clocked</th>
                              <th className="py-1 text-right">Book Time Earned</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {staffStats.map(s => (
                              <tr key={s.id}>
                                <td className="py-2 font-bold text-zinc-700">{s.name}</td>
                                <td className="py-2 text-center text-zinc-500">{s.completedTasks} / {s.totalTasks}</td>
                                <td className="py-2 text-right font-mono font-bold text-zinc-700">
                                  {s.clockedHours.toFixed(1)}h
                                </td>
                                <td className="py-2 text-right font-mono font-bold text-indigo-700">
                                  {s.completedHours.toFixed(1)}h
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Missing Parts Section */}
                  <div className="mb-6 print-no-break">
                    <h2 className="text-xs font-black text-amber-600 border-b border-amber-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5" />
                      Missing / Pending Parts
                    </h2>
                    {partsRequests.filter(p => p.status !== 'received' && p.status !== 'delivered' && p.status !== 'fulfilled' && p.status !== 'inventoried').length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">No parts pending requests.</p>
                    ) : (
                      <div className="divide-y divide-zinc-100">
                        {partsRequests.filter(p => p.status !== 'received' && p.status !== 'delivered' && p.status !== 'fulfilled' && p.status !== 'inventoried').map(p => (
                          <div key={p.id} className="py-2.5 flex justify-between items-center gap-4">
                            <div>
                              <h4 className="text-xs font-bold text-zinc-800">{p.partName || p.title || p.description}</h4>
                              <p className="text-[10px] text-zinc-400 mt-0.5">
                                Qty: {p.quantity || 1} &bull; {p.taskTitle ? `Task: ${p.taskTitle}` : 'General Part'}
                              </p>
                            </div>
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-widest rounded border border-amber-200">
                              {p.status || 'requested'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Removed Parts (Takeoffs) Section */}
                  <div className="mb-6 print-no-break">
                    <h2 className="text-xs font-black text-amber-600 border-b border-amber-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      Removed Parts (Takeoffs)
                    </h2>
                    {takeoffs.length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">No removed parts logged.</p>
                    ) : (
                      <div className="divide-y divide-zinc-100">
                        {takeoffs.map(t => (
                          <div key={t.id} className="py-2.5 flex justify-between items-start gap-4">
                            <div className="flex gap-3">
                              {t.photoUrls && t.photoUrls.length > 0 && (
                                <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200">
                                  <img src={t.photoUrls[0]} alt={t.name} className="w-full h-full object-cover" />
                                </div>
                              )}
                              <div>
                                <h4 className="text-xs font-bold text-zinc-800">{t.name || t.partName}</h4>
                                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                                  {t.serialNumber && (
                                    <>
                                      <span>S/N: <span className="font-mono">{t.serialNumber}</span></span>
                                      <span>&bull;</span>
                                    </>
                                  )}
                                  {t.location && (
                                    <>
                                      <span>Loc: {t.location}</span>
                                      {t.notes && <span>&bull;</span>}
                                    </>
                                  )}
                                  {t.notes && (
                                    <span className="italic">Note: {t.notes}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className={cn(
                              "px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded border shrink-0",
                              getConditionPrintColor(t.condition)
                            )}>
                              {t.condition || 'Good'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Efficiency Report Summary */}
                  {jobEfficiencyStats.totalActual > 0 && (
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-6 text-xs print-no-break">
                      <div className="flex items-center justify-between mb-3 border-b border-zinc-200 pb-2">
                        <h3 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-1.5">
                          <Timer className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                          Job Efficiency Metrics
                        </h3>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                          <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Total Book Allotment</span>
                          <span className="font-mono font-bold text-zinc-800 text-sm">{jobEfficiencyStats.totalBook.toFixed(1)}h</span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Total Clocked Hours</span>
                          <span className="font-mono font-bold text-zinc-800 text-sm">{jobEfficiencyStats.totalActual.toFixed(1)}h</span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Variance</span>
                          <span className={cn(
                            "font-mono font-bold text-sm",
                            jobEfficiencyStats.variance > 0.1 ? "text-rose-600" : "text-emerald-600"
                          )}>
                            {jobEfficiencyStats.variance > 0 ? `+${jobEfficiencyStats.variance.toFixed(1)}h` : `${jobEfficiencyStats.variance.toFixed(1)}h`}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest">Overall Efficiency</span>
                          <span className={cn(
                            "font-mono font-bold text-sm px-1.5 py-0.5 rounded",
                            jobEfficiencyStats.efficiency && jobEfficiencyStats.efficiency >= 100 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          )}>
                            {jobEfficiencyStats.efficiency ? `${jobEfficiencyStats.efficiency.toFixed(0)}%` : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tasks Pending Section */}
                  <div className="mb-6 print-no-break">
                    <h2 className="text-xs font-black text-indigo-600 border-b border-indigo-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      What Needs to be Done
                    </h2>
                    {tasks.filter(t => t.status !== 'QC' && t.status !== 'QC Complete' && t.status !== 'completed').length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">All tasks completed successfully!</p>
                    ) : (
                      <div className="divide-y divide-zinc-100">
                        {tasks.filter(t => t.status !== 'QC' && t.status !== 'QC Complete' && t.status !== 'completed').map(t => {
                          const loggedMs = getTaskClockedMs(t.id);
                          const clockedHours = loggedMs / 3600000;
                          const bookHours = parseFloat(t.bookTime) || 0;
                          const isOverBook = bookHours > 0 && clockedHours > bookHours;
                          const diff = clockedHours - bookHours;
                          const assignedList = (t.assignedStaff && t.assignedStaff.length > 0)
                            ? t.assignedStaff
                            : (t.assignedStaffIds || []).map((sid: string) => {
                                const found = allStaff.find(s => s.id === sid || s.userId === sid);
                                return { id: sid, name: found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name : 'Technician' };
                              });
                          
                          return (
                            <div key={t.id} className="py-2.5 flex justify-between items-start gap-4">
                              <div>
                                <h4 className="text-xs font-bold text-zinc-800">{t.title || t.name}</h4>
                                {(t.description || t.notes) && <p className="text-[10px] text-zinc-400 mt-0.5">{t.description || t.notes}</p>}
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest">
                                    Assigned: {assignedList.length === 0 ? (
                                      'Unassigned'
                                    ) : (
                                      assignedList.map((s: any) => s.name).join(', ')
                                    )}
                                  </span>
                                  {bookHours > 0 && (
                                    <>
                                      <span className="text-zinc-300">•</span>
                                      <span className="text-[9px] text-zinc-400 font-semibold font-mono">Budget: {bookHours}h &bull; Actual: {clockedHours.toFixed(1)}h</span>
                                      {isOverBook && (
                                        <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[8px] font-black uppercase tracking-widest border border-rose-100 flex items-center gap-0.5">
                                          <AlertTriangle className="w-2.5 h-2.5" />
                                          +{diff.toFixed(1)}h Over
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                              <span className="font-mono text-xs font-bold text-indigo-600">
                                {bookHours > 0 ? `${clockedHours.toFixed(1)}h / ${bookHours.toFixed(1)}h` : `${clockedHours.toFixed(1)}h`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Awaiting QC Section */}
                  <div className="mb-6 print-no-break">
                    <h2 className="text-xs font-black text-amber-600 border-b border-amber-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      Awaiting QC Inspection
                    </h2>
                    {tasks.filter(t => t.status === 'QC').length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">No tasks awaiting QC.</p>
                    ) : (
                      <div className="divide-y divide-zinc-100">
                        {tasks.filter(t => t.status === 'QC').map(t => {
                          const loggedMs = getTaskClockedMs(t.id);
                          const clockedHours = loggedMs / 3600000;
                          const assignedList = (t.assignedStaff && t.assignedStaff.length > 0)
                            ? t.assignedStaff
                            : (t.assignedStaffIds || []).map((sid: string) => {
                                const found = allStaff.find(s => s.id === sid || s.userId === sid);
                                return { id: sid, name: found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name : 'Technician' };
                              });
                          
                          return (
                            <div key={t.id} className="py-2.5 flex justify-between items-start gap-4">
                              <div>
                                <h4 className="text-xs font-bold text-zinc-800">{t.title || t.name}</h4>
                                {(t.description || t.notes) && <p className="text-[10px] text-zinc-400 mt-0.5">{t.description || t.notes}</p>}
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                                    Completed by: {t.completedByStaffName || t.completedBy || (assignedList.length === 0 ? 'Unassigned' : assignedList.map((s: any) => s.name).join(', '))}
                                  </span>
                                  <span className="text-zinc-300">•</span>
                                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-widest rounded border border-amber-200">
                                    Ready for QC
                                  </span>
                                </div>
                              </div>
                              <span className="font-mono text-xs font-bold text-zinc-500">{clockedHours.toFixed(1)}h</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* QC Verified (Without Photos) Section */}
                  <div className="mb-6 print-no-break">
                    <h2 className="text-xs font-black text-emerald-600 border-b border-emerald-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      QC Verified (Without Photos)
                    </h2>
                    {tasks.filter(t => (t.status === 'QC Complete' || t.status === 'completed') && !qcNotes.some(q => q.taskId === t.id && q.images.length > 0)).length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">No tasks verified without photos.</p>
                    ) : (
                      <div className="divide-y divide-zinc-100">
                        {tasks.filter(t => (t.status === 'QC Complete' || t.status === 'completed') && !qcNotes.some(q => q.taskId === t.id && q.images.length > 0)).map(t => {
                          const loggedMs = getTaskClockedMs(t.id);
                          const clockedHours = loggedMs / 3600000;
                          const qcNote = qcNotes.find((q: any) => q.taskId === t.id);
                          const qcByName = t.qcCompletedBy || qcNote?.createdByName;
                          const assignedList = (t.assignedStaff && t.assignedStaff.length > 0)
                            ? t.assignedStaff
                            : (t.assignedStaffIds || []).map((sid: string) => {
                                const found = allStaff.find(s => s.id === sid || s.userId === sid);
                                return { id: sid, name: found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name : 'Technician' };
                              });

                          return (
                            <div key={t.id} className="py-2.5 flex justify-between items-start gap-4">
                              <div>
                                <h4 className="text-xs font-bold text-zinc-800">{t.title || t.name}</h4>
                                {(t.description || t.notes) && <p className="text-[10px] text-zinc-400 mt-0.5">{t.description || t.notes}</p>}
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest">
                                    Completed by: {t.completedByStaffName || t.completedBy || (assignedList.length === 0 ? 'Unassigned' : assignedList.map((s: any) => s.name).join(', '))}
                                  </span>
                                  {qcByName && (
                                    <>
                                      <span className="text-zinc-300">•</span>
                                      <span className="text-[9px] font-bold text-indigo-700 uppercase tracking-widest">
                                        QC'd by: {qcByName}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <span className="font-mono text-xs font-bold text-emerald-600">{clockedHours.toFixed(1)}h</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Quality Control (QC) Section */}
                  {qcPhotoNotes.length > 0 && (
                    <div className="mb-6 print-no-break">
                      <h2 className="text-xs font-black text-indigo-900 border-b border-indigo-200 pb-1 mb-4 uppercase tracking-widest flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                        Quality Control (QC) Inspection
                      </h2>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {qcPhotoNotes.map((qc: any) => (
                          <div 
                            key={qc.id} 
                            className="border border-zinc-200 rounded-xl overflow-hidden flex flex-col bg-zinc-50/50 print:break-inside-avoid print:bg-white"
                            style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                          >
                            {/* Photo (if any) */}
                            {qc.images && qc.images.length > 0 ? (
                              <div className="aspect-[4/3] bg-zinc-100 overflow-hidden border-b border-zinc-200">
                                <img 
                                  src={qc.images[0]} 
                                  alt="QC Verification" 
                                  className="object-cover w-full h-full"
                                />
                              </div>
                            ) : (
                              <div className="aspect-[4/3] bg-zinc-50 border-b border-zinc-100 flex flex-col items-center justify-center text-zinc-400 gap-1 print:hidden">
                                <Camera className="w-6 h-6 opacity-30" />
                                <span className="text-[9px] font-medium">No photo attached</span>
                              </div>
                            )}

                            {/* Card Content */}
                            <div className="p-3 flex-1 flex flex-col justify-between space-y-2 text-[11px]">
                              <div className="space-y-1">
                                <div className="flex justify-between items-start gap-1.5">
                                  <h4 className="font-bold text-zinc-800 line-clamp-2 leading-tight">
                                    {qc.taskTitle}
                                  </h4>
                                  <span className={cn(
                                    "text-[9px] px-1.5 py-0.5 rounded font-black uppercase border tracking-wider shrink-0",
                                    qc.isPass 
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                      : "bg-rose-50 text-rose-700 border-rose-200"
                                  )}>
                                    {qc.isPass ? 'Passed' : 'Failed'}
                                  </span>
                                </div>

                                {qc.message && (
                                  <p className="text-zinc-600 leading-relaxed whitespace-pre-wrap mt-1 print:line-clamp-none">
                                    {qc.message}
                                  </p>
                                )}
                              </div>

                              <div className="border-t border-zinc-100 pt-1.5 text-[9px] text-zinc-400 flex flex-col">
                                <span>Inspector: <strong className="text-zinc-600 font-bold">{qc.createdByName}</strong></span>
                                <span>Date: {new Date(qc.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active Job Notes Section */}
                  <div className="mb-6 print-no-break">
                    <h2 className="text-xs font-black text-indigo-600 border-b border-indigo-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Active Job Notes
                    </h2>
                    {(!job.work_notes || job.work_notes.length === 0) && !job.notes && !job.description ? (
                      <p className="text-xs text-zinc-400 italic">No job notes recorded.</p>
                    ) : (
                      <div className="divide-y divide-zinc-150 space-y-2">
                        {job.description && (
                          <div className="py-2">
                            <p className="text-xs text-zinc-800 leading-relaxed font-medium">{job.description}</p>
                            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-1">Scope Description</p>
                          </div>
                        )}
                        {job.notes && (
                          <div className="py-2">
                            <p className="text-xs text-zinc-800 leading-relaxed font-medium">{job.notes}</p>
                            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-1">General Notes</p>
                          </div>
                        )}
                        {(job.work_notes || []).map((note: any) => (
                          <div key={note.id || note.createdAt} className="py-2.5">
                            <p className="text-xs text-zinc-800 leading-relaxed font-medium">{note.message || note.text}</p>
                            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-1.5">
                              Added by {note.createdBy || note.userName || 'Staff'} &bull; {formatDateSafe(note.createdAt, true)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Job Chat / General Notes Section */}
                  <div className="mb-6 print-no-break">
                    <h2 className="text-xs font-black text-indigo-900 border-b border-indigo-200 pb-1 mb-3 uppercase tracking-widest flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Job Chat (Team Log)
                    </h2>
                    {chatMessages.filter((m: any) => !m.isSystem).length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">No chat messages recorded.</p>
                    ) : (
                      <div className="divide-y divide-zinc-150">
                        {chatMessages.filter((m: any) => !m.isSystem).map((msg: any) => {
                          const dateObj = msg.createdAt 
                            ? (typeof msg.createdAt.toDate === 'function' ? msg.createdAt.toDate() : new Date(msg.createdAt))
                            : null;
                          const formattedTime = dateObj 
                            ? dateObj.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                            : '';
                          return (
                            <div key={msg.id} className="py-2.5">
                              <p className="text-xs text-zinc-800 leading-relaxed font-medium whitespace-pre-wrap">{msg.message}</p>
                              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-1.5">
                                Posted by {msg.senderName} &bull; {formattedTime}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Print QR Codes Footer */}
                  <div className="mt-8 pt-6 border-t-2 border-zinc-200 flex justify-end items-center gap-8 print-no-break">
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <h4 className="text-xs font-bold text-zinc-800">Scan to View Job</h4>
                        <p className="text-[9px] text-zinc-400 mt-0.5 font-medium">Open in UpfittersOS</p>
                      </div>
                      <LogoQRCode 
                        value={`${window.location.origin}/business/${tenantId}/job/${jobId}`} 
                        size={60} 
                        logoUrl={businessLogo}
                        businessName={businessName}
                        type="job"
                      />
                    </div>

                    {(job.companyCamId || job.companyCamProjectId) && (
                      <div className="flex items-center gap-3 text-right">
                        <div>
                          <h4 className="text-xs font-bold text-zinc-800">Scan for Photos</h4>
                          <p className="text-[9px] text-zinc-400 mt-0.5 font-medium">Open CompanyCam</p>
                        </div>
                        <LogoQRCode 
                          value={(() => {
                            const cc = job.companyCamId || job.companyCamProjectId;
                            return cc.startsWith('http') ? cc : `https://app.companycam.com/projects/${cc}`;
                          })()} 
                          size={60} 
                          type="general"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Full-Page Print Portal for @media print (Traveler Card) */}
      {isPrintTravelerOpen && createPortal(
        <div className="traveler-print-wrapper" style={{ display: 'none' }}>
          <div className="bg-white text-zinc-900 p-12 font-sans mx-auto max-w-[800px] h-[10.2in] flex flex-col justify-between text-left">
            <div className="border-b-4 border-indigo-900 pb-6 flex justify-between items-start">
              <div>
                <span className="text-[10px] font-black tracking-widest text-indigo-600 uppercase bg-indigo-50 px-2.5 py-1 rounded-md">Job Card</span>
                <h1 className="text-3xl sm:text-4xl font-black text-indigo-950 mt-3 tracking-tight">JOB #{jobDisplayNumber}</h1>
                {job.title && job.title !== jobDisplayNumber && (
                  <p className="text-base sm:text-lg font-bold text-zinc-700 mt-1">{job.title}</p>
                )}
                <p className="text-sm sm:text-base font-extrabold text-indigo-900 mt-2 uppercase tracking-wide">Customer: {customerDisplayName}</p>
                <p className="text-sm sm:text-base font-extrabold text-zinc-800 mt-1 uppercase tracking-wide">Vehicle: {vehicleYearMakeModel}</p>
                {vehicleVinRaw && (
                  <p className="text-sm text-zinc-600 font-mono mt-0.5 font-bold">VIN: {vehicleVinRaw}</p>
                )}
              </div>
            </div>

            {/* Big Center QR Code */}
            <div className="flex flex-col items-center justify-center my-auto py-8">
              <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm">
                <LogoQRCode 
                  value={`${window.location.origin}/business/${tenantId}/job/${jobId}`}
                  size={240}
                  type="general"
                />
              </div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-4">Scan QR to open job details instantly</p>
            </div>

            {/* Bottom CompanyCam Box */}
            {(() => {
              const ccId = job.companyCamId || job.companyCamProjectId || '';
              return ccId ? (
                <div className="border-t-2 border-zinc-200 pt-6 bg-zinc-50 p-6 rounded-xl text-left">
                  <div className="flex items-center gap-4">
                    <div className="p-1.5 bg-white border border-zinc-200 rounded-lg shadow-sm shrink-0">
                      <LogoQRCode 
                        value={ccId.startsWith('http') ? ccId : `https://app.companycam.com/projects/${ccId}`}
                        size={90}
                        type="general"
                      />
                    </div>
                    <div>
                      <h4 className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">CompanyCam Photos</h4>
                      <p className="text-xs sm:text-sm font-extrabold text-zinc-800 mt-1">Scan QR to view photos</p>
                    </div>
                  </div>
                </div>
              ) : null;
            })()}

            <div className="border-t border-zinc-200 pt-3 flex justify-between items-center text-[10px] text-zinc-400 font-black uppercase tracking-wider">
              <span>UpfittersOS</span>
              <span>Printed: {new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* ETA TRENDING & BURNDOWN VELOCITY MODAL                                    */}
      {/* ========================================================================= */}
      {isEtaTrendModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-zinc-100">ETA Velocity & Burndown Trajectory</h3>
                  <p className="text-[11px] text-zinc-500">Historical progression of completion estimates across task milestones</p>
                </div>
              </div>

              <button onClick={() => setIsEtaTrendModalOpen(false)} className="text-zinc-500 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
              {/* Top Stats Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 font-bold uppercase">Current ETA</div>
                  <div className="text-xs font-black text-indigo-400 mt-0.5">{etaDetails.etaString}</div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 font-bold uppercase">Initial Projected</div>
                  <div className="text-xs font-bold text-zinc-300 mt-0.5">
                    {etaTrendData.initialETA ? etaTrendData.initialETA.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'Intake'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 font-bold uppercase">Remaining Scope</div>
                  <div className="text-xs font-bold text-zinc-200 mt-0.5">
                    {etaTrendData.remainingBookHours.toFixed(1)}h of {etaTrendData.totalInitialBookHours.toFixed(1)}h
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 font-bold uppercase">Trajectory Trend</div>
                  <div className={cn("text-xs font-black mt-0.5 flex items-center gap-1", etaTrendData.trendDirection === 'shrinking' ? "text-emerald-400" : etaTrendData.trendDirection === 'growing' ? "text-rose-400" : "text-zinc-300")}>
                    {etaTrendData.trendDirection === 'shrinking' && <TrendingDown className="w-3 h-3" />}
                    {etaTrendData.trendDirection === 'growing' && <TrendingUp className="w-3 h-3" />}
                    <span>{etaTrendData.trendDirection === 'shrinking' ? `Shrinking (-${etaTrendData.deltaHours}h)` : etaTrendData.trendDirection === 'growing' ? `Expanding (+${etaTrendData.deltaHours}h)` : 'On Schedule'}</span>
                  </div>
                </div>
              </div>

              {/* Interactive SVG Trajectory Graph */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-zinc-400 flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-indigo-400" />
                    Remaining Labor Hours Burndown
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {etaTrendData.points.length} Milestone Checkpoints
                  </span>
                </div>

                <div className="h-44 w-full pt-3 pb-2 relative">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="modalEtaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={etaTrendData.trendDirection === 'growing' ? '#f43f5e' : '#6366f1'} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={etaTrendData.trendDirection === 'growing' ? '#f43f5e' : '#6366f1'} stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Grid lines */}
                    <line x1="0" y1="20" x2="100" y2="20" stroke="#27272a" strokeDasharray="2" strokeWidth="0.5" />
                    <line x1="0" y1="50" x2="100" y2="50" stroke="#27272a" strokeDasharray="2" strokeWidth="0.5" />
                    <line x1="0" y1="80" x2="100" y2="80" stroke="#27272a" strokeDasharray="2" strokeWidth="0.5" />

                    <polygon points={etaTrendData.svgArea} fill="url(#modalEtaGradient)" />
                    <polyline
                      fill="none"
                      stroke={etaTrendData.trendDirection === 'growing' ? '#f43f5e' : '#818cf8'}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={etaTrendData.svgPath}
                    />

                    {/* Checkpoint Dots */}
                    {etaTrendData.points.map((p, idx) => (
                      <circle
                        key={idx}
                        cx={p.xPct}
                        cy={p.yPct}
                        r="2.5"
                        className={cn(
                          "transition-all",
                          idx === etaTrendData.points.length - 1
                            ? "fill-indigo-400 stroke-white stroke-1"
                            : "fill-zinc-900 stroke-indigo-400 stroke-1"
                        )}
                      />
                    ))}
                  </svg>
                </div>

                <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-1 border-t border-zinc-900">
                  <span>Intake ({etaTrendData.totalInitialBookHours.toFixed(1)}h)</span>
                  <span>Current Remaining ({etaTrendData.remainingBookHours.toFixed(1)}h)</span>
                </div>
              </div>

              {/* Milestone Event Audit History */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Milestone Burndown History
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {etaTrendData.points.map((p, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-zinc-900 text-zinc-400 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-zinc-200">{p.event}</div>
                          <div className="text-[10px] text-zinc-500">{formatDateSafe(p.timestamp, true)}</div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-indigo-400">{p.remainingBookHours.toFixed(1)}h left</div>
                        <div className="text-[10px] text-zinc-500">
                          ETA: {p.projectedETA.toLocaleDateString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-zinc-800 shrink-0">
              <button
                onClick={() => setIsEtaTrendModalOpen(false)}
                className="h-10 px-5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl active:scale-95 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* COMPREHENSIVE JOB EDIT MODAL                                               */}
      {/* ========================================================================= */}
      {isJobEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveJobEdit} className="w-full max-w-2xl max-h-[90vh] bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-red-500/10 text-red-400">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-zinc-100">Edit Job Details & Specifications</h3>
                  <p className="text-[11px] text-zinc-500">Update vehicle identification, order metadata, and location</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/business/${tenantId}/job/${jobId}/edit`)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-bold rounded-xl border border-zinc-700 flex items-center gap-1.5 transition active:scale-95"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Full Task Editor</span>
                </button>
                <button type="button" onClick={() => setIsJobEditOpen(false)} className="p-1 text-zinc-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4 text-xs overflow-y-auto pr-1 flex-1">
              {/* Section 1: Order & Identification */}
              <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl space-y-3">
                <div className="text-[11px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  <span>Order & Identification</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Job Title</label>
                    <input
                      type="text"
                      value={editFormData.title}
                      onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                      placeholder="e.g. 4981527 - Patrol Upfit"
                      className="w-full h-11 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 font-bold text-base sm:text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Job / Order #</label>
                    <input
                      type="text"
                      value={editFormData.jobNumber}
                      onChange={(e) => setEditFormData({ ...editFormData, jobNumber: e.target.value })}
                      placeholder="e.g. 4981527"
                      className="w-full h-11 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 font-mono text-base sm:text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 relative" ref={customerDropdownRef}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-zinc-400 font-bold">Customer / Agency</label>
                      {editFormData.customerName && (
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {customerDirectory.some(c => c.name.toLowerCase() === editFormData.customerName.toLowerCase().trim()) ? '✓ Matched Customer' : 'Custom / Unsaved'}
                        </span>
                      )}
                    </div>
                    
                    <div className="relative">
                      <input
                        type="text"
                        value={editFormData.customerName}
                        onChange={(e) => {
                          setEditFormData({ ...editFormData, customerName: e.target.value });
                          setIsCustomerDropdownOpen(true);
                        }}
                        onFocus={() => setIsCustomerDropdownOpen(true)}
                        placeholder="Start typing to search customer or agency..."
                        className="w-full h-11 pl-3 pr-8 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-base sm:text-xs font-semibold focus:outline-none focus:border-amber-500/50"
                      />
                      {editFormData.customerName ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditFormData({ ...editFormData, customerName: '' });
                            setIsCustomerDropdownOpen(true);
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <Search className="w-3.5 h-3.5 text-zinc-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      )}
                    </div>

                    {/* Autocomplete Typeahead Dropdown */}
                    {isCustomerDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto p-1.5 space-y-1 font-sans">
                        {(() => {
                          const query = (editFormData.customerName || '').toLowerCase().trim();
                          const matches = customerDirectory.filter(c => {
                            if (!query) return true;
                            const name = (c.name || '').toLowerCase();
                            const disp = (c.displayName || '').toLowerCase();
                            const comp = (c.CompanyName || '').toLowerCase();
                            const email = (c.email || '').toLowerCase();
                            return name.includes(query) || disp.includes(query) || comp.includes(query) || email.includes(query);
                          });

                          if (matches.length === 0) {
                            return (
                              <div className="p-3 text-center">
                                <p className="text-xs text-zinc-400 font-medium">No matching customers found</p>
                                <p className="text-[10px] text-zinc-500 mt-0.5">
                                  Will save as new customer: <span className="text-amber-400 font-bold">"{editFormData.customerName}"</span>
                                </p>
                              </div>
                            );
                          }

                          return matches.slice(0, 15).map((c) => {
                            const isSelected = editFormData.customerName.toLowerCase().trim() === c.name.toLowerCase().trim();
                            return (
                              <div
                                key={c.id || c.name}
                                onClick={() => {
                                  setEditFormData({ ...editFormData, customerName: c.name });
                                  setIsCustomerDropdownOpen(false);
                                }}
                                className={cn(
                                  "p-2 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition",
                                  isSelected 
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" 
                                    : "hover:bg-zinc-800 text-zinc-200"
                                )}
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-bold truncate flex items-center gap-1.5">
                                    <span>{c.name}</span>
                                    {c.source && (
                                      <span className={cn(
                                        "text-[8px] px-1.5 py-0.2 rounded font-mono font-bold uppercase",
                                        c.source === 'QuickBooks' ? "bg-sky-500/10 text-sky-400 border border-sky-500/20" : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                                      )}>
                                        {c.source}
                                      </span>
                                    )}
                                  </div>
                                  {(c.email || c.mobilePhone) && (
                                    <div className="text-[10px] text-zinc-500 truncate">
                                      {c.email} {c.mobilePhone && `• ${c.mobilePhone}`}
                                    </div>
                                  )}
                                </div>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Target Delivery Date</label>
                    <input
                      type="date"
                      value={editFormData.scheduledEndDate}
                      onChange={(e) => setEditFormData({ ...editFormData, scheduledEndDate: e.target.value })}
                      className="w-full h-11 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 font-bold text-base sm:text-xs cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Status</label>
                    <select
                      value={editFormData.status}
                      onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                      className="w-full h-11 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 font-bold text-base sm:text-xs cursor-pointer"
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Bay">In Bay / Active</option>
                      <option value="Ready for QC">Ready for QC</option>
                      <option value="QC Kickback">QC Kickback</option>
                      <option value="Ready for Customer">Ready for Customer</option>
                      <option value="Completed">Completed</option>
                      <option value="On Hold">On Hold</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Priority</label>
                    <select
                      value={editFormData.priority}
                      onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value })}
                      className="w-full h-11 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 font-bold text-base sm:text-xs cursor-pointer"
                    >
                      <option value="Normal">Normal</option>
                      <option value="High">High</option>
                      <option value="Urgent">🚨 Urgent</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Vehicle Specifications */}
              <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl space-y-3">
                <div className="text-[11px] font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5" />
                  <span>Vehicle Specifications</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Year</label>
                    <input
                      type="text"
                      value={editFormData.vehicleYear}
                      onChange={(e) => setEditFormData({ ...editFormData, vehicleYear: e.target.value })}
                      placeholder="e.g. 2026"
                      className="w-full h-11 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-base sm:text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Make</label>
                    <input
                      type="text"
                      value={editFormData.vehicleMake}
                      onChange={(e) => setEditFormData({ ...editFormData, vehicleMake: e.target.value })}
                      placeholder="e.g. Chevrolet"
                      className="w-full h-11 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-base sm:text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Model</label>
                    <input
                      type="text"
                      value={editFormData.vehicleModel}
                      onChange={(e) => setEditFormData({ ...editFormData, vehicleModel: e.target.value })}
                      placeholder="e.g. Traverse / Tahoe"
                      className="w-full h-11 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-base sm:text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-zinc-400 font-bold">VIN (17 Characters)</label>
                      {editFormData.vin && (
                        <button
                          type="button"
                          onClick={() => decodeVinNHTSA(editFormData.vin)}
                          disabled={isDecodingVin || editFormData.vin.length !== 17}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                          title="Check VIN via fleet database and NHTSA API"
                        >
                          {isDecodingVin ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>Checking VIN...</span>
                            </>
                          ) : (
                            <>
                              <Search className="w-3 h-3" />
                              <span>Auto-Decode VIN</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={editFormData.vin}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setEditFormData(prev => ({ ...prev, vin: val }));
                        if (val.length === 17) {
                          decodeVinNHTSA(val);
                        }
                      }}
                      placeholder="1FTFW3L50..."
                      maxLength={17}
                      className="w-full h-11 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 font-mono font-bold text-base sm:text-xs tracking-wider uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Stock / Unit #</label>
                    <input
                      type="text"
                      value={editFormData.stockNumber || editFormData.unitNumber}
                      onChange={(e) => setEditFormData({ ...editFormData, stockNumber: e.target.value, unitNumber: e.target.value })}
                      placeholder="Unit # / Stock #"
                      className="w-full h-11 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 font-mono text-base sm:text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Shop Location & Active Bay Assignment with Live Occupancy */}
              <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Shop Location & Active Bay Assignment</span>
                  </div>
                </div>

                {/* Selected Location Summary & Collapsible Spot Picker */}
                {(() => {
                  const resolvedZone = zones.find(z => 
                    (editFormData.parkingSpot && (z.name === editFormData.parkingSpot || z.id === editFormData.parkingSpot)) ||
                    (job?.bayId && (z.id === job.bayId || z.name === job.bayId))
                  );
                  const isWithCustomer = editFormData.parkingSpot === 'With Customer';
                  const displaySpotName = resolvedZone 
                    ? resolvedZone.name 
                    : (isWithCustomer 
                      ? 'With Customer' 
                      : (editFormData.parkingSpot && !editFormData.parkingSpot.startsWith('zone_') && editFormData.parkingSpot.length < 25
                        ? editFormData.parkingSpot 
                        : '⚪ Unassigned / Float (Not stationed)'));
                  const isBay = resolvedZone ? (resolvedZone.type === 'bay' || resolvedZone.name.toLowerCase().includes('bay')) : Boolean(editFormData.parkingSpot?.toLowerCase().includes('bay'));
                  const badgeLabel = isWithCustomer ? 'Off-Site' : (displaySpotName.includes('Unassigned') ? 'Unassigned' : (isBay ? 'Work Bay' : 'Yard Spot'));

                  return (
                    <div className="space-y-3">
                      {/* Current Location Banner */}
                      <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn(
                            "p-2.5 rounded-xl border shrink-0",
                            isWithCustomer ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : (isBay ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-zinc-800 text-zinc-300 border-zinc-700")
                          )}>
                            {isWithCustomer ? <span className="text-sm">🤝</span> : (isBay ? <Warehouse className="w-4 h-4" /> : <MapPin className="w-4 h-4" />)}
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Assigned Location</span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-white truncate">{displaySpotName}</span>
                              <span className={cn(
                                "text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold uppercase border",
                                isWithCustomer && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                                isBay && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                                !isWithCustomer && !isBay && "bg-zinc-800 text-zinc-400 border-zinc-700"
                              )}>
                                {badgeLabel}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setIsEditLocationPickerOpen(prev => !prev)}
                            className={cn(
                              "h-8 px-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border",
                              isEditLocationPickerOpen
                                ? "bg-amber-500 text-zinc-950 border-amber-400 shadow-sm"
                                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700"
                            )}
                          >
                            <MapPin className="w-3 h-3" />
                            <span>{isEditLocationPickerOpen ? 'Hide Picker' : 'Change Spot'}</span>
                          </button>
                          {editFormData.parkingSpot && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditFormData(prev => ({ ...prev, parkingSpot: '' }));
                                setIsEditLocationPickerOpen(false);
                              }}
                              className="h-8 px-2 rounded-xl text-[10px] font-bold text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition border border-transparent"
                              title="Clear assigned spot"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Collapsible Spot Selection Grid */}
                      {isEditLocationPickerOpen && (
                        <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-2xl space-y-2 animate-in fade-in zoom-in-95 duration-150">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1 bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-800">
                              <button
                                type="button"
                                onClick={() => setZoneFilterType('all')}
                                className={cn(
                                  "px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer",
                                  zoneFilterType === 'all' ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-white"
                                )}
                              >
                                All ({enrichedZones.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setZoneFilterType('bays')}
                                className={cn(
                                  "px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer",
                                  zoneFilterType === 'bays' ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-white"
                                )}
                              >
                                Bays ({enrichedZones.filter(z => z.isBay).length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setZoneFilterType('lot')}
                                className={cn(
                                  "px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer",
                                  zoneFilterType === 'lot' ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-white"
                                )}
                              >
                                Yard ({enrichedZones.filter(z => !z.isBay).length})
                              </button>
                            </div>

                            <div className="relative flex-1 min-w-[120px]">
                              <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={zoneSearch}
                                onChange={(e) => setZoneSearch(e.target.value)}
                                placeholder="Filter spot name..."
                                className="w-full h-7 pl-6 pr-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 text-[11px] placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
                            {/* Clear / Unassigned Card */}
                            <div
                              onClick={() => {
                                setEditFormData(prev => ({ ...prev, parkingSpot: '' }));
                                setIsEditLocationPickerOpen(false);
                              }}
                              className={cn(
                                "p-2 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2",
                                !editFormData.parkingSpot
                                  ? "bg-zinc-800/90 border-amber-500/60 shadow-sm"
                                  : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm">⚪</span>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-zinc-200">Unassigned / Float</div>
                                  <div className="text-[9px] text-zinc-500">Not stationed in bay or yard</div>
                                </div>
                              </div>
                              {!editFormData.parkingSpot && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                            </div>

                            {/* With Customer Card */}
                            <div
                              onClick={() => {
                                setEditFormData(prev => ({ ...prev, parkingSpot: 'With Customer' }));
                                setIsEditLocationPickerOpen(false);
                              }}
                              className={cn(
                                "p-2 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2",
                                editFormData.parkingSpot === 'With Customer'
                                  ? "bg-blue-500/10 border-blue-500 shadow-md ring-1 ring-blue-500/30"
                                  : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm">🤝</span>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-blue-300">With Customer</div>
                                  <div className="text-[9px] text-zinc-500">Off-site • Not on lot</div>
                                </div>
                              </div>
                              {editFormData.parkingSpot === 'With Customer' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                            </div>

                            {enrichedZones
                              .filter(z => {
                                if (zoneFilterType === 'bays' && !z.isBay) return false;
                                if (zoneFilterType === 'lot' && z.isBay) return false;
                                if (zoneSearch.trim()) {
                                  const query = zoneSearch.toLowerCase();
                                  return z.name?.toLowerCase().includes(query) || (z.occupantDetails && (
                                    z.occupantDetails.jobNumber?.toLowerCase().includes(query) ||
                                    z.occupantDetails.customerName?.toLowerCase().includes(query)
                                  ));
                                }
                                return true;
                              })
                              .map((z) => {
                                const isSelected = editFormData.parkingSpot === z.name || editFormData.parkingSpot === z.id;
                                return (
                                  <div
                                    key={z.id}
                                    onClick={() => {
                                      setEditFormData(prev => ({
                                        ...prev,
                                        parkingSpot: z.name,
                                        status: (z.isBay && (prev.status === 'Pending' || !prev.status)) ? 'In Bay' : prev.status
                                      }));
                                      setIsEditLocationPickerOpen(false);
                                    }}
                                    className={cn(
                                      "p-2 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-1 relative group",
                                      isSelected
                                        ? "bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-500/30"
                                        : z.isOccupied
                                          ? "bg-zinc-900/80 border-rose-500/30 hover:border-rose-500/60"
                                          : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        {z.isBay ? <Warehouse className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                                        <span className="text-xs font-bold text-zinc-100 truncate">{z.name}</span>
                                        <span className="text-[8px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-bold uppercase shrink-0">
                                          {z.isBay ? 'Bay' : 'Yard'}
                                        </span>
                                      </div>

                                      {isSelected ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                      ) : z.isOccupied ? (
                                        <span className="text-[8px] font-bold uppercase text-rose-400 px-1 rounded bg-rose-500/10 shrink-0">
                                          Occupied
                                        </span>
                                      ) : (
                                        <span className="text-[8px] font-bold text-emerald-400">Empty</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* CompanyCam Project ID Field */}
                <div className="pt-2 border-t border-zinc-800/80">
                  <label className="block text-zinc-400 font-bold text-xs mb-1">CompanyCam Project ID</label>
                  <input
                    type="text"
                    value={editFormData.companyCamId}
                    onChange={(e) => setEditFormData({ ...editFormData, companyCamId: e.target.value })}
                    placeholder="e.g. 102468372"
                    className="w-full h-11 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 font-mono text-base sm:text-xs"
                  />
                </div>
              </div>

              {/* Section 4: Notes & Instructions */}
              <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl space-y-3">
                <div className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Notes & Work Instructions</span>
                </div>

                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Work Description / Instructions</label>
                  <textarea
                    rows={2}
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    placeholder="General upfit scope and technician instructions..."
                    className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-base sm:text-xs resize-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Internal Notes</label>
                  <textarea
                    rows={2}
                    value={editFormData.notes}
                    onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                    placeholder="Internal shop notes or QuickBooks sync remarks..."
                    className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-base sm:text-xs resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800 shrink-0">
              <button type="button" onClick={() => setIsJobEditOpen(false)} className="h-11 px-4 text-xs font-bold text-zinc-400 hover:text-white">
                Cancel
              </button>
              <button type="submit" className="h-11 px-6 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl active:scale-95 transition flex items-center gap-1.5 shadow-lg shadow-red-950/40">
                <Check className="w-4 h-4" />
                <span>Save All Changes</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FULL-SCREEN LIGHTBOX MODAL                                                */}
      {/* ========================================================================= */}
      {activeLightboxPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <button
            onClick={() => setActiveLightboxPhoto(null)}
            className="absolute top-4 right-4 w-12 h-12 rounded-full bg-zinc-900/80 text-white flex items-center justify-center active:scale-95"
          >
            <X className="w-6 h-6" />
          </button>
          <img src={activeLightboxPhoto.url} alt={activeLightboxPhoto.caption} className="max-w-full max-h-[80vh] object-contain rounded-2xl" />
          <div className="mt-3 text-center text-xs text-zinc-300 font-bold max-w-md">
            {activeLightboxPhoto.caption || 'Photo Preview'}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STATUS PICKER MODAL                                                       */}
      {/* ========================================================================= */}
      {statusModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <h3 className="text-xs font-black uppercase text-zinc-200">Change Job Status</h3>
              <button onClick={() => setStatusModalOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {[
                { label: 'In Bay / In Progress', val: 'In Bay', color: 'text-blue-400' },
                { label: 'Ready for QC Inspection', val: 'Ready for QC', color: 'text-amber-400' },
                { label: 'QC Kickback (Flag Rework)', val: 'QC Kickback', color: 'text-rose-400' },
                { label: 'Ready for Customer Pickup', val: 'Ready for Customer', color: 'text-emerald-400' },
                { label: 'Completed / Handed Off', val: 'Completed', color: 'text-purple-400' }
              ].map((s) => (
                <button
                  key={s.val}
                  onClick={() => handleSelectStatus(s.val)}
                  className={cn(
                    "w-full h-11 px-4 rounded-xl text-xs font-bold flex items-center justify-between transition active:scale-95 bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700",
                    s.color
                  )}
                >
                  <span>{s.label}</span>
                  {job.status === s.val && <Check className="w-4 h-4 text-emerald-400" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QC KICKBACK REASON MODAL                                                  */}
      {/* ========================================================================= */}
      {kickbackModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-3 shadow-2xl">
            <h3 className="text-xs font-black uppercase text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              QC Kickback Reason
            </h3>
            <p className="text-xs text-zinc-400">Specify why this job failed Quality Control so technicians can address the rework:</p>
            <textarea
              rows={3}
              value={kickbackReason}
              onChange={(e) => setKickbackReason(e.target.value)}
              placeholder="e.g. Reverse lights harness loose in rear pillar..."
              className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-base sm:text-xs resize-none"
            />
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button onClick={() => setKickbackModalOpen(false)} className="h-10 px-4 text-xs font-bold text-zinc-400">Cancel</button>
              <button onClick={handleConfirmKickback} className="h-10 px-5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl active:scale-95">
                Confirm Kickback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SYNC PHOTOS TO COMPANYCAM MODAL                                           */}
      {/* ========================================================================= */}
      {isSyncToCcOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <h3 className="text-xs font-black uppercase text-blue-400 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4" />
                Sync Photos to CompanyCam
              </h3>
              <button onClick={() => setIsSyncToCcOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Select which photos from UpfittersOS you want to push to linked CompanyCam Project #{job.companyCamId || job.companyCamProjectId}:
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {nativePhotos.map((photo) => {
                const isSelected = selectedPhotosForCcSync.includes(photo.id);
                return (
                  <div
                    key={photo.id}
                    onClick={() => {
                      setSelectedPhotosForCcSync(prev => 
                        isSelected ? prev.filter(id => id !== photo.id) : [...prev, photo.id]
                      );
                    }}
                    className={cn(
                      "p-2.5 rounded-xl border flex items-center gap-3 cursor-pointer transition",
                      isSelected ? "bg-blue-500/10 border-blue-500/30" : "bg-zinc-950 border-zinc-800 hover:border-zinc-700"
                    )}
                  >
                    <img src={photo.url} alt="thumbnail" className="w-12 h-12 object-cover rounded-lg bg-black shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-zinc-200 truncate">{photo.caption || 'Photo'}</div>
                      <div className="text-[10px] text-zinc-500">{formatDateSafe(photo.createdAt, true)}</div>
                    </div>
                    <div className={cn(
                      "w-5 h-5 rounded-md flex items-center justify-center border",
                      isSelected ? "bg-blue-600 border-blue-500 text-white" : "border-zinc-700 bg-zinc-900"
                    )}>
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button onClick={() => setIsSyncToCcOpen(false)} className="h-10 px-4 text-xs font-bold text-zinc-400">
                Cancel
              </button>
              <button
                onClick={handleSyncSelectedPhotosToCompanyCam}
                disabled={isSyncingToCc || selectedPhotosForCcSync.length === 0}
                className="h-10 px-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl active:scale-95 transition flex items-center gap-1.5"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isSyncingToCc && "animate-spin")} />
                <span>{isSyncingToCc ? 'Syncing...' : `Sync ${selectedPhotosForCcSync.length} Photo(s)`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RELOCATE PARKING SPOT / BAY MODAL                                         */}
      {/* ========================================================================= */}
      {spotModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-3.5 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-zinc-100">Relocate Vehicle Location</h3>
                  <p className="text-[11px] text-zinc-500">Pick an active work bay or yard parking spot</p>
                </div>
              </div>

              <button onClick={() => setSpotModalOpen(false)} className="text-zinc-500 hover:text-white p-1">
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
                    All Spots ({enrichedZones.length})
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

                <div className="relative flex-1 min-w-[140px]">
                  <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={zoneSearch}
                    onChange={(e) => setZoneSearch(e.target.value)}
                    placeholder="Search bays / jobs..."
                    className="w-full h-8 pl-7 pr-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-[11px] placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Zones & Live Occupancy List */}
            <div className="space-y-2 overflow-y-auto pr-1 flex-1">
              {/* Unassigned Spot Card */}
              <div
                onClick={() => handleUpdateLocation('')}
                className={cn(
                  "p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3",
                  !job.parkingSpot && !job.bayId
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
                {!job.parkingSpot && !job.bayId && <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />}
              </div>

              {/* With Customer Card */}
              <div
                onClick={() => handleUpdateLocation('With Customer')}
                className={cn(
                  "p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3",
                  job.parkingSpot === 'With Customer' || job.location === 'With Customer'
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
                {(job.parkingSpot === 'With Customer' || job.location === 'With Customer') && (
                  <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                )}
              </div>

              {enrichedZones
                .filter(z => {
                  if (zoneFilterType === 'bays' && !z.isBay) return false;
                  if (zoneFilterType === 'lot' && z.isBay) return false;
                  if (zoneSearch.trim()) {
                    const query = zoneSearch.toLowerCase();
                    const matchesName = z.name?.toLowerCase().includes(query);
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
                      onClick={() => handleUpdateLocation(z.name)}
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
                          <span className="text-xs font-black text-zinc-100 truncate">{z.name}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-bold uppercase shrink-0">
                            {z.isBay ? 'Work Bay' : 'Yard Spot'}
                          </span>
                        </div>

                        {isCurrent ? (
                          <div className="flex items-center gap-1 text-[10px] font-black uppercase text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 shrink-0">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Current Spot</span>
                          </div>
                        ) : null}
                      </div>

                      {/* Live Occupant Preview */}
                      {z.isOccupied && z.occupantDetails ? (
                        <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-0.5 text-[10px]">
                          <div className="font-bold text-rose-300 flex items-center justify-between truncate">
                            <span>🚨 Occupied: #{z.occupantDetails.jobNumber}</span>
                            <span className="text-[9px] font-semibold text-rose-400/80 uppercase">{z.occupantDetails.status}</span>
                          </div>
                          <div className="text-zinc-400 truncate">
                            {z.occupantDetails.customerName} {z.occupantDetails.vehicle && `• ${z.occupantDetails.vehicle}`}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[10px] text-emerald-400 font-medium">
                          <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Available • Empty</span>
                          </div>
                          <span className="text-zinc-500 group-hover:text-amber-400 font-bold text-[9px]">Click to Assign ➔</span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => setSpotModalOpen(false)}
                className="h-10 px-5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl active:scale-95 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TASK LEVEL QC KICKBACK MODAL */}
      {qcKickbackModalTask && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-xs font-black uppercase text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Task QC Kickback: {qcKickbackModalTask.title}</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setQcKickbackModalTask(null);
                  setQcKickbackTaskReason('');
                }}
                className="w-7 h-7 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Specify what failed inspection and what rework needs to be performed by the technician:
            </p>

            <textarea
              rows={3}
              value={qcKickbackTaskReason}
              onChange={(e) => setQcKickbackTaskReason(e.target.value)}
              placeholder="e.g. Wire routing pinch near console base bracket. Needs zip-tie anchor."
              className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:border-rose-500 focus:outline-none resize-none"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button 
                type="button"
                onClick={() => {
                  setQcKickbackModalTask(null);
                  setQcKickbackTaskReason('');
                }} 
                className="h-10 px-4 text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleConfirmTaskKickback} 
                className="h-10 px-5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl active:scale-95 shadow-md cursor-pointer"
              >
                Confirm Kickback & Send to Rework
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
