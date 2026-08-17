import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  doc, onSnapshot, collection, query, where, updateDoc, addDoc, serverTimestamp, getDocs, limit 
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebase/config';
import { 
  ArrowLeft, MapPin, Car, AlertCircle,
  Package, Copy, Check, Edit3, Smartphone, X, AlertTriangle,
  Camera, ExternalLink,
  ChevronRight, ChevronDown, Plus, Layers,
  Printer, Upload, MessageSquare, Timer,
  RefreshCw, ZoomIn, TrendingDown, TrendingUp, Activity, Search,
  CheckCircle2, Warehouse, LayoutDashboard, ClipboardCheck
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth/store';
import { setPreferredJobViewVersion } from '../../lib/utils/window';
import { toast } from 'sonner';
import { JobChat } from './components/JobChat';
import { PartsRequestModal } from './PartsRequestModal';
import { LogoQRCode } from '../../components/LogoQRCode';

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
  const { user, impersonatedStaff } = useAuthStore();
  const effectiveUserId = impersonatedStaff?.id || user?.uid || '';

  // Tab State
  const [activeTab, setActiveTab] = useState<
    'overview' | 'tasks' | 'staff' | 'timelog' | 'telemetry' | 'photos' | 'takeoffs' | 'parts' | 'chat'
  >('overview');
  const [taskSubTab, setTaskSubTab] = useState<'tasks' | 'takeoffs'>('tasks');
  const [staffSubTab, setStaffSubTab] = useState<'roster' | 'timelog' | 'telemetry'>('roster');

  // Core Firestore Subscriptions State
  const [job, setJob] = useState<any>(null);
  const [allStaff, setAllStaff] = useState<any[]>([]);
  const [vehicle, setVehicle] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [takeoffs, setTakeoffs] = useState<any[]>([]);
  const [timeSessions, setTimeSessions] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [nativePhotos, setNativePhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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
  const [isPrintTravelerOpen, setIsPrintTravelerOpen] = useState(false);
  const [isEtaTrendModalOpen, setIsEtaTrendModalOpen] = useState(false);

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
  
  // QC Kickback Reason State
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

  // 2. Subscribe to Business Staff Roster & Zones
  useEffect(() => {
    if (!tenantId) return;
    const staffRef = collection(db, `businesses/${tenantId}/staff`);
    const unsubStaff = onSnapshot(staffRef, (snap) => {
      setAllStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Staff listener suppressed:", err));

    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Zones listener suppressed:", err));

    return () => {
      unsubStaff();
      unsubZones();
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
                             matchedZone?.type === 'bay' || 
                             (typeof job?.location === 'string' && job.location.toLowerCase().includes('bay')) ||
                             (typeof job?.parkingSpot === 'string' && job.parkingSpot.toLowerCase().includes('bay'));

    const isCurrentlyInLot = !isCurrentlyInBay && (
      matchedZone?.type === 'parking' || 
      (typeof job?.parkingSpot === 'string' && job.parkingSpot.trim() !== '') || 
      (typeof job?.location === 'string' && job.location.trim() !== '')
    );

    if (isCurrentlyInBay) {
      const activeBayStartMs = parseTimestampMs(job?.inBaySince || job?.bayAssignedAt || job?.lastMovedAt || job?.lastStatusChangedAt || job?.updatedAt || job?.createdAt);
      if (activeBayStartMs > 0 && nowMs > activeBayStartMs) {
        baySeconds += Math.floor((nowMs - activeBayStartMs) / 1000);
      }
    } else if (isCurrentlyInLot) {
      const activeLotStartMs = parseTimestampMs(job?.inLotSince || job?.parkingAssignedAt || job?.lastMovedAt || job?.lastStatusChangedAt || job?.updatedAt || job?.createdAt);
      if (activeLotStartMs > 0 && nowMs > activeLotStartMs) {
        parkingSeconds += Math.floor((nowMs - activeLotStartMs) / 1000);
      }
    }

    return {
      bayTimeHours: (baySeconds / 3600).toFixed(1),
      parkingTimeHours: (parkingSeconds / 3600).toFixed(1)
    };
  }, [job, matchedZone]);

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
        checkedBy: nextChecked ? (user?.displayName || user?.email || 'Inspector') : null
      });
      toast.success(`Checklist item updated`);
    } catch (err: any) {
      toast.error(`Failed to update takeoff: ${err.message}`);
    }
  };

  // Task Status Toggle for Mobile Upfitters
  const handleToggleTaskStatus = async (task: any) => {
    if (!tenantId || !jobId || !task.id) return;
    const currentStatus = task.status || 'pending';
    const nextStatus = currentStatus === 'completed' || currentStatus === 'QC Complete' ? 'in_progress' : 'completed';

    try {
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, task.id);
      await updateDoc(taskRef, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
        completedAt: nextStatus === 'completed' ? new Date().toISOString() : null,
        completedBy: user?.displayName || user?.email || 'Upfitter'
      });

      toast.success(`Task marked as ${nextStatus === 'completed' ? 'Completed' : 'In Progress'}`);
    } catch (err: any) {
      toast.error(`Failed to update task: ${err.message}`);
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
            { id: 'photos', label: `Photos (${nativePhotos.length + companyCamPhotos.length})`, icon: Camera },
            { id: 'parts', label: `Parts (${partsRequests.length})`, icon: Package },
            { id: 'staff', label: `Staff & Time (${staffRoster.length})`, icon: Timer },
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
                {/* Grouped Accordions */}
                {filteredTaskGroups.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 italic">No tasks found for this category.</div>
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

                              return (
                                <div
                                  key={task.id}
                                  className={cn(
                                    "p-3 rounded-xl transition flex items-center justify-between gap-3 group",
                                    isCompleted ? "bg-zinc-950/40 opacity-75" : isInProgress ? "bg-indigo-500/5 border border-indigo-500/20" : "bg-zinc-950/60"
                                  )}
                                >
                                  {/* Left: Interactive Checkbox */}
                                  <button
                                    onClick={() => handleToggleTaskStatus(task)}
                                    className={cn(
                                      "w-8 h-8 rounded-lg flex items-center justify-center transition shrink-0 active:scale-90",
                                      isCompleted ? "bg-emerald-500 text-white" : "bg-zinc-900 border border-zinc-700 text-transparent hover:border-zinc-500"
                                    )}
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>

                                  {/* Center: Title & Metadata */}
                                  <div
                                    onClick={() => setSelectedTask(task)}
                                    className="flex-1 min-w-0 cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2">
                                      <h4 className={cn("text-xs font-bold truncate", isCompleted ? "line-through text-zinc-400" : "text-zinc-100")}>
                                        {task.title || task.name}
                                      </h4>
                                      {isInProgress && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-400 font-bold uppercase shrink-0 animate-pulse">
                                          In Progress
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-400">
                                      <span className="font-mono text-indigo-400 font-semibold">{task.bookTime || 0}h Book</span>
                                      {task.assignedToName && <span>Assigned: {task.assignedToName}</span>}
                                      {(() => {
                                        const key = (task.title || task.name || '').trim().toLowerCase();
                                        const photoCount = taskRefPhotoCounts[key] || task.historicalPhotoCount || 0;
                                        return photoCount > 0 ? (
                                          <span className="text-violet-400 flex items-center gap-1 font-semibold">
                                            <Camera className="w-3 h-3" />
                                            {photoCount} SOP Photos
                                          </span>
                                        ) : null;
                                      })()}
                                    </div>
                                  </div>

                                  {/* Right: Quick Action Pill */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={() => {
                                        setSelectedTaskForPart(task);
                                        setIsPartRequestOpen(true);
                                      }}
                                      className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-400 transition"
                                      title="Request part for this task"
                                    >
                                      <Package className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setSelectedTask(task)}
                                      className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
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
              
              {/* Task Status Toggle & Book Hours */}
              <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">Book Time</span>
                  <div className="text-lg font-black text-white">{selectedTask.bookTime || '0.0'}h</div>
                </div>

                <button
                  onClick={() => handleToggleTaskStatus(selectedTask)}
                  className={cn(
                    "h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition",
                    ['completed', 'QC Complete'].includes(selectedTask.status)
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  )}
                >
                  <Check className="w-4 h-4" />
                  <span>{['completed', 'QC Complete'].includes(selectedTask.status) ? 'Completed' : 'Mark Completed'}</span>
                </button>
              </div>

              {/* Task Request Part Button */}
              <button
                onClick={() => {
                  setSelectedTaskForPart(selectedTask);
                  setIsPartRequestOpen(true);
                }}
                className="w-full h-11 bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 text-amber-400 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-98 transition"
              >
                <Package className="w-4 h-4" />
                <span>Request Part for this Task</span>
              </button>

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

      {/* Full-Page Print Portal for @media print */}
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

    </div>
  );
}
