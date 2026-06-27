import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDoc,
  getDocs,
  where,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  startAfter
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../../lib/firebase/config';
import {
  Briefcase, 
  FileText, 
  ShoppingCart, 
  Calendar, 
  ChevronLeft,
  ChevronRight, 
  ChevronDown,
  Info, 
  Package, 
  Search, 
  Layers,
  Wrench,
  User,
  ClipboardList,
  Clock,
  AlertCircle,
  Camera,
  Check,
  Plus,
  Loader2,
  ShieldAlert,
  CheckSquare,
  ClipboardCheck,
  XCircle,
  Share2,
  ExternalLink,
  Download,
  X
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useJobClock } from '../timeclock/useJobClock';
import { useAuthStore } from '../../lib/auth/store';
import { useTimeclockStore } from '../../lib/store/timeclockStore';
import { useSearchParams } from 'react-router-dom';

interface QBJobDetailsPlaceholderProps {
  tenantId: string;
}

export function QBJobDetailsPlaceholder({ tenantId }: QBJobDetailsPlaceholderProps) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<any>(null);
  const [hasMoreJobs, setHasMoreJobs] = useState(true);
  const [isLoadingMoreJobs, setIsLoadingMoreJobs] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlJobId = searchParams.get('id');

  const selectedJob = jobs.find((j: any) => j.id === urlJobId) || null;

  // Set default job if none selected
  useEffect(() => {
    if (jobs.length > 0 && !urlJobId) {
      setSearchParams({ id: jobs[0].id }, { replace: true });
    }
  }, [urlJobId, jobs, setSearchParams]);

  // Dynamic Title & OpenGraph Meta SEO tags for message/text/email previews
  useEffect(() => {
    if (!selectedJob) {
      document.title = 'Job Details | UpfitterOS';
      return;
    }

    const title = `Job #${selectedJob.jobNumber || ''} - ${selectedJob.title} | UpfitterOS`;
    document.title = title;

    const updateMeta = (property: string, content: string) => {
      let meta = document.head.querySelector(`meta[property="${property}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    const updateMetaName = (name: string, content: string) => {
      let meta = document.head.querySelector(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', name);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    updateMeta('og:title', title);
    updateMeta('og:description', `Customer: ${selectedJob.customerName || 'N/A'} - View workflow tasks, labor records, and parts tracker in UpfitterOS.`);
    updateMeta('og:type', 'website');
    updateMeta('og:url', window.location.href);
    
    updateMetaName('description', `Customer: ${selectedJob.customerName || 'N/A'} - View workflow tasks, labor records, and parts tracker in UpfitterOS.`);
  }, [selectedJob]);

  // Timeclock & Auth Hooks
  const { clockIntoJob, clockOutOfJob, isProcessing: isClocking } = useJobClock(tenantId);
  const { user, impersonatedStaff, permissions, isSuperAdmin } = useAuthStore();
  const { activeSessionId } = useTimeclockStore();
  
  const canManageTasks = isSuperAdmin || permissions?.['jobs.manage'] === true;
  
  const activeOperatorId = impersonatedStaff?.id || user?.uid || '';
  const activeOperatorName = impersonatedStaff 
    ? impersonatedStaff.name
    : (user?.displayName || user?.email || 'Technician');
  
  // QuickBooks data
  const [estimates, setEstimates] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  
  // Native data
  const [nativeTasks, setNativeTasks] = useState<any[]>([]);
  const [nativeParts, setNativeParts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const remainingBookTime = nativeTasks
    .filter((t: any) => t.status !== 'Completed')
    .reduce((sum: number, t: any) => sum + (Number(t.bookTime ?? t.bookHours) || 0), 0);

  const totalBookTime = nativeTasks
    .reduce((sum: number, t: any) => sum + (Number(t.bookTime ?? t.bookHours) || 0), 0);

  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarFilter, setSidebarFilter] = useState<'all' | 'qb' | 'native'>('all');
  
  // Tab state derived from URL ?tab=... parameter
  const urlTab = searchParams.get('tab') as any;
  const activeTab = ['overview', 'tasks', 'qc', 'labor', 'partsTracker', 'companycam', 'estimates', 'invoices', 'purchaseOrders'].includes(urlTab)
    ? urlTab
    : 'overview';

  const setActiveTab = (tabName: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tabName);
    setSearchParams(newParams, { replace: true });
  };

  // CompanyCam States
  const [ccPhotos, setCcPhotos] = useState<any[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [ccLinkInput, setCcLinkInput] = useState('');
  const [isSavingCcLink, setIsSavingCcLink] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [ccRefreshTrigger, setCcRefreshTrigger] = useState(0);

  // Modal & Interactive states
  const [activeTaskForCompletion, setActiveTaskForCompletion] = useState<any | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionPhoto, setCompletionPhoto] = useState<File | null>(null);
  const [completionPhotoPreview, setCompletionPhotoPreview] = useState<string | null>(null);
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  const [activeTaskForRejection, setActiveTaskForRejection] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [activeTaskForParts, setActiveTaskForParts] = useState<any | null>(null);
  const [newPartName, setNewPartName] = useState('');
  const [newPartNumber, setNewPartNumber] = useState('');
  const [newPartBin, setNewPartBin] = useState('');
  const [newPartQty, setNewPartQty] = useState(1);
  const [isAddingPart, setIsAddingPart] = useState(false);

  // Autocomplete suggestions based on user input
  const matchedInventoryItems = newPartName.trim().length >= 2
    ? inventory.filter((item: any) => 
        item.name.toLowerCase().includes(newPartName.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(newPartName.toLowerCase()))
      ).slice(0, 3)
    : [];

  // Look up if a requested part is already received or ordered on the job
  const getWorkOrderPartStatus = () => {
    if (!newPartName.trim() && !newPartNumber.trim()) return null;
    
    // Check QuickBooks parts tracker
    const qbMatch = qbPartsTracker.find(item => 
      (newPartName && item.itemName.toLowerCase().includes(newPartName.toLowerCase())) ||
      (newPartNumber && item.itemName.toLowerCase().includes(newPartNumber.toLowerCase()))
    );

    // Check Native requested parts
    const nativeMatch = nativeParts.find(p => 
      (newPartName && p.partName.toLowerCase().includes(newPartName.toLowerCase())) ||
      (newPartNumber && p.partNumber && p.partNumber.toLowerCase().includes(newPartNumber.toLowerCase()))
    );

    if (qbMatch) {
      if (qbMatch.received > 0) {
        return {
          status: 'received',
          source: 'QuickBooks Work Order',
          received: qbMatch.received,
          needed: qbMatch.needed
        };
      }
      if (qbMatch.ordered > qbMatch.received) {
        return {
          status: 'ordered',
          source: 'QuickBooks Purchase Order',
          received: qbMatch.received,
          needed: qbMatch.needed
        };
      }
    }

    if (nativeMatch) {
      if (nativeMatch.status === 'received' || nativeMatch.status === 'delivered') {
        return {
          status: 'received',
          source: 'Local Parts Request',
          received: nativeMatch.quantity,
          needed: nativeMatch.quantity
        };
      }
      if (nativeMatch.status === 'ordered') {
        return {
          status: 'ordered',
          source: 'Local Parts Request',
          received: 0,
          needed: nativeMatch.quantity
        };
      }
    }

    return null;
  };

  const workOrderPartStatus = getWorkOrderPartStatus();

  const handleShareJobLink = async () => {
    if (!selectedJob) return;
    const shareUrl = window.location.href;
    const shareTitle = `Job #${selectedJob.jobNumber || ''} - ${selectedJob.title}`;
    const shareText = `Check out the progress details for Job: ${selectedJob.title} (${selectedJob.customerName || 'No customer'}).`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        toast.success('Shared successfully!');
      } catch (err) {
        console.error('Error sharing link:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link copied to clipboard!');
      } catch (err) {
        console.error('Error copying link:', err);
        toast.error('Failed to copy link.');
      }
    }
  };

  const handleConnectCompanyCam = async () => {
    try {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const apiBase = isLocal 
        ? 'http://localhost:5001/saegroup-c6487/us-central1/api'
        : 'https://us-central1-saegroup-c6487.cloudfunctions.net/api';
        
      const token = await auth.currentUser?.getIdToken();
      const redirectUri = window.location.origin + window.location.pathname;

      const res = await fetch(`${apiBase}/companycam/oauth/url?redirectUri=${encodeURIComponent(redirectUri)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        throw new Error('Failed to get auth URL');
      }

      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err: any) {
      console.error('Error initiating CompanyCam OAuth:', err);
      toast.error('Failed to initiate CompanyCam connection: ' + err.message);
    }
  };

  const handleLinkCompanyCamProject = async (inputVal: string) => {
    if (!selectedJob || !tenantId) return;
    const trimmed = inputVal.trim();
    if (!trimmed) {
      toast.error('Please enter a valid Project ID or URL');
      return;
    }

    setIsSavingCcLink(true);
    try {
      // Parse ID from URL or use as is
      let ccId = trimmed;
      const urlMatch = trimmed.match(/\/projects\/(\d+)/);
      if (urlMatch && urlMatch[1]) {
        ccId = urlMatch[1];
      }

      const jobRef = doc(db, `businesses/${tenantId}/jobs`, selectedJob.id);
      await updateDoc(jobRef, {
        companyCamId: ccId,
        updatedAt: serverTimestamp()
      });

      // Update local reference copy
      selectedJob.companyCamId = ccId; 

      toast.success('CompanyCam Project linked successfully!');
      setCcRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error('Error linking CompanyCam project:', err);
      toast.error('Failed to link project: ' + err.message);
    } finally {
      setIsSavingCcLink(false);
    }
  };

  const handleUnlinkCompanyCamProject = async () => {
    if (!selectedJob || !tenantId) return;
    if (!window.confirm('Are you sure you want to unlink CompanyCam from this job?')) return;
    
    setIsSavingCcLink(true);
    try {
      const jobRef = doc(db, `businesses/${tenantId}/jobs`, selectedJob.id);
      await updateDoc(jobRef, {
        companyCamId: '',
        updatedAt: serverTimestamp()
      });

      selectedJob.companyCamId = '';

      toast.success('CompanyCam Project unlinked.');
      setCcPhotos([]);
      setCcRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error('Error unlinking project:', err);
      toast.error('Failed to unlink project.');
    } finally {
      setIsSavingCcLink(false);
    }
  };

  // Fetch CompanyCam photos if linked
  useEffect(() => {
    const fetchCcPhotos = async () => {
      if (!selectedJob || !tenantId) return;
      const jobId = selectedJob.id;
      const ccProjectId = selectedJob.companyCamId || selectedJob.companyCamProjectId;
      if (!ccProjectId) {
        setCcPhotos([]);
        return;
      }

      setIsLoadingPhotos(true);
      setPhotosError(null);
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
                'x-tenant-id': tenantId
              }
            });
          } catch (localErr) {
            console.warn("Local functions emulator not reachable, falling back to prod", localErr);
            res = await fetch(`${apiBaseProd}/jobs/${jobId}/companycam-photos`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'x-tenant-id': tenantId
              }
            });
          }
        } else {
          res = await fetch(`${apiBaseProd}/jobs/${jobId}/companycam-photos`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'x-tenant-id': tenantId
            }
          });
        }

        if (!res.ok) {
          throw new Error(`Failed to fetch photos: ${res.statusText}`);
        }
        const data = await res.json();
        setCcPhotos(data || []);
      } catch (err: any) {
        console.error("Error fetching CompanyCam photos:", err);
        setPhotosError(err.message);
      } finally {
        setIsLoadingPhotos(false);
      }
    };

    fetchCcPhotos();
  }, [selectedJob?.id, selectedJob?.companyCamId, selectedJob?.companyCamProjectId, tenantId, ccRefreshTrigger]);

  // Add Task Modal states
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskBookTime, setNewTaskBookTime] = useState(0);
  const [newTaskPayBasis, setNewTaskPayBasis] = useState<'book_time' | 'hourly'>('book_time');
  const [isAddingTask, setIsAddingTask] = useState(false);

  // Add Job Modal states
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobNumber, setNewJobNumber] = useState('');
  const [newJobCustomerName, setNewJobCustomerName] = useState('');
  const [isAddingJob, setIsAddingJob] = useState(false);

  // Expansions & Logs
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);

  // Fetch initial jobs or query matches (debounced)
  useEffect(() => {
    async function searchJobs() {
      setIsLoadingJobs(true);
      try {
        const jobsRef = collection(db, `businesses/${tenantId}/jobs`);
        let q = query(jobsRef, orderBy('createdAt', 'desc'), limit(25));
        if (searchQuery.trim().length > 0) {
          // Fetch up to 150 jobs to support searching older jobs server-side
          q = query(jobsRef, orderBy('createdAt', 'desc'), limit(150));
        }
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // If there is a deep-linked job ID, ensure it is fetched and included in the jobs state
        if (urlJobId && !list.some(j => j.id === urlJobId)) {
          try {
            const docRef = doc(db, `businesses/${tenantId}/jobs`, urlJobId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              list.unshift({
                id: docSnap.id,
                ...docSnap.data()
              });
            }
          } catch (docErr) {
            console.error('Error fetching deep-linked job:', docErr);
          }
        }

        setJobs(list);
        
        if (searchQuery.trim().length === 0) {
          setLastVisibleDoc(snap.docs[snap.docs.length - 1] || null);
          setHasMoreJobs(snap.docs.length === 25);
        } else {
          setLastVisibleDoc(null);
          setHasMoreJobs(false);
        }
      } catch (err) {
        console.error('Error fetching jobs:', err);
        toast.error('Failed to load recent jobs.');
      } finally {
        setIsLoadingJobs(false);
      }
    }

    const timer = setTimeout(() => {
      searchJobs();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, tenantId]);

  // Fetch subsequent pages of jobs (lazy load on scroll)
  const fetchMoreJobs = async () => {
    if (isLoadingMoreJobs || !hasMoreJobs || !lastVisibleDoc || searchQuery.trim().length > 0) return;
    setIsLoadingMoreJobs(true);
    try {
      const jobsRef = collection(db, `businesses/${tenantId}/jobs`);
      const q = query(
        jobsRef, 
        orderBy('createdAt', 'desc'), 
        startAfter(lastVisibleDoc), 
        limit(25)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const newJobs = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setJobs(prev => [...prev, ...newJobs]);
        setLastVisibleDoc(snap.docs[snap.docs.length - 1]);
        setHasMoreJobs(snap.docs.length === 25);
      } else {
        setHasMoreJobs(false);
      }
    } catch (err) {
      console.error('Error fetching more jobs:', err);
    } finally {
      setIsLoadingMoreJobs(false);
    }
  };

  const handleSidebarScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      fetchMoreJobs();
    }
  };

  // Fetch the last completed QuickBooks sync time
  useEffect(() => {
    async function fetchLastSync() {
      try {
        const q = query(
          collection(db, 'businesses', tenantId, 'activity_feed'),
          where('type', '==', 'qbwc_sync'),
          orderBy('createdAt', 'desc'),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const syncDoc = snap.docs[0].data();
          const date = syncDoc.timestamp?.toDate?.() || 
                       (syncDoc.timestamp ? new Date(syncDoc.timestamp) : null) || 
                       (syncDoc.createdAt ? new Date(syncDoc.createdAt) : null);
          if (date) {
            setLastSyncTime(date.toLocaleString());
          }
        } else {
          // Fallback to qbwc_queue if activity_feed is empty
          const qQueue = query(
            collection(db, 'qbwc_queue'),
            where('tenantId', '==', tenantId),
            limit(100)
          );
          const snapQueue = await getDocs(qQueue);
          const sorted = snapQueue.docs
            .map(d => ({ id: d.id, ...d.data() } as any))
            .sort((a: any, b: any) => {
              const getMs = (item: any) => {
                const val = item.completedAt || item.createdAt;
                if (val?.seconds) return val.seconds * 1000;
                return new Date(val || 0).getTime();
              };
              return getMs(b) - getMs(a);
            });
          
          const completedItem = sorted.find((item: any) => item.status === 'completed');
          if (completedItem) {
            const date = completedItem.completedAt?.toDate?.() || 
                         (completedItem.completedAt ? new Date(completedItem.completedAt) : null) || 
                         (completedItem.createdAt ? new Date(completedItem.createdAt) : null);
            if (date) {
              setLastSyncTime(date.toLocaleString());
            }
          }
        }
      } catch (err) {
        console.error('Error fetching last sync time:', err);
      }
    }
    fetchLastSync();
  }, [tenantId]);

  // Listen to local/native subcollection data (tasks & parts requests) in real time
  useEffect(() => {
    if (!selectedJob || !tenantId) return;
    const jobId = selectedJob.id;

    // Real-time Tasks subscription
    const tasksRef = collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`);
    const unsubscribeTasks = onSnapshot(tasksRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNativeTasks(list);
    }, (err) => {
      console.error('Error listening to tasks:', err);
    });

    // Real-time Parts Requests subscription
    const partsQuery = query(
      collection(db, `businesses/${tenantId}/parts_requests`), 
      where('jobId', '==', jobId)
    );
    const unsubscribeParts = onSnapshot(partsQuery, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNativeParts(list);
    });

    // Real-time Time sessions subscription
    const timeQuery = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('jobIds', 'array-contains', jobId)
    );
    const unsubscribeTime = onSnapshot(timeQuery, (snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTimeLogs(logs);
    }, (err) => {
      console.error('Error listening to time sessions:', err);
    });

    // Real-time Inventory subscription
    const inventoryRef = collection(db, `businesses/${tenantId}/inventory_items`);
    const unsubscribeInventory = onSnapshot(inventoryRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setInventory(list);
    }, (err) => {
      console.error('Error listening to inventory:', err);
    });

    return () => {
      unsubscribeTasks();
      unsubscribeParts();
      unsubscribeTime();
      unsubscribeInventory();
    };
  }, [selectedJob?.id, tenantId]);

  // Fetch QuickBooks Details (one-time query) for the selected job
  useEffect(() => {
    if (!selectedJob || !tenantId) return;

    async function fetchJobDetails() {
      setIsLoadingDetails(true);
      setEstimates([]);
      setInvoices([]);
      setPurchaseOrders([]);

      const jobQbId = selectedJob.quickbooksId || selectedJob.id;

      try {
        let estList: any[] = [];
        let invList: any[] = [];
        let matchedPos: any[] = [];

        if (jobQbId && !jobQbId.startsWith('job_')) {
          // 1. Fetch Estimates
          const estRef = collection(db, `businesses/${tenantId}/qb_estimates`);
          const estQuery = query(estRef, orderBy('txnDate', 'desc'), limit(150));
          const estSnap = await getDocs(estQuery);
          const allEsts = estSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          estList = allEsts.filter((est: any) => {
            if (est.customerRef === jobQbId || est.CustomerRef?.ListID === jobQbId) return true;
            const fullName = (est.CustomerRef?.FullName || '').toLowerCase();
            if (selectedJob.title && fullName.includes(selectedJob.title.toLowerCase())) return true;
            if (selectedJob.jobNumber && fullName.includes(selectedJob.jobNumber.toLowerCase())) return true;
            return false;
          });
          
          // 2. Fetch Invoices
          const invRef = collection(db, `businesses/${tenantId}/qb_invoices`);
          const invQuery = query(invRef, orderBy('txnDate', 'desc'), limit(150));
          const invSnap = await getDocs(invQuery);
          const allInvs = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          invList = allInvs.filter((inv: any) => {
            if (inv.customerRef === jobQbId || inv.CustomerRef?.ListID === jobQbId) return true;
            const fullName = (inv.CustomerRef?.FullName || '').toLowerCase();
            if (selectedJob.title && fullName.includes(selectedJob.title.toLowerCase())) return true;
            if (selectedJob.jobNumber && fullName.includes(selectedJob.jobNumber.toLowerCase())) return true;
            return false;
          });

          // 3. Fetch Purchase Orders
          const poRef = collection(db, `businesses/${tenantId}/qb_purchase_orders`);
          const poQuery = query(poRef, orderBy('txnDate', 'desc'), limit(150));
          const poSnap = await getDocs(poQuery);
          const allPos = poSnap.docs.map(d => ({ id: d.id, ...d.data() }));

          matchedPos = allPos.filter((po: any) => {
            if (po.customerRef === jobQbId || po.CustomerRef?.ListID === jobQbId) return true;
            const fullName = (po.CustomerRef?.FullName || '').toLowerCase();
            if (selectedJob.title && fullName.includes(selectedJob.title.toLowerCase())) return true;
            if (selectedJob.jobNumber && fullName.includes(selectedJob.jobNumber.toLowerCase())) return true;
            
            const lines = getLineItems(po, 'purchaseOrder');
            return lines.some((line: any) => {
              const lineListId = line.CustomerRef?.ListID;
              const lineFullName = (line.CustomerRef?.FullName || '').toLowerCase();
              return lineListId === jobQbId || 
                (selectedJob.title && lineFullName.includes(selectedJob.title.toLowerCase())) ||
                (selectedJob.jobNumber && lineFullName.includes(selectedJob.jobNumber.toLowerCase()));
            });
          });
        }

        setEstimates(estList);
        setInvoices(invList);
        setPurchaseOrders(matchedPos);



      } catch (err) {
        console.error('Error fetching job details:', err);
      } finally {
        setIsLoadingDetails(false);
      }
    }

    fetchJobDetails();
  }, [selectedJob?.id, tenantId]);

  // Helper to extract line items defensively
  function getLineItems(txn: any, type: 'estimate' | 'invoice' | 'purchaseOrder'): any[] {
    let linesSource: any = null;
    if (type === 'estimate') linesSource = txn.EstimateLineRet || txn.estimateLineRet;
    else if (type === 'invoice') linesSource = txn.InvoiceLineRet || txn.invoiceLineRet;
    else if (type === 'purchaseOrder') linesSource = txn.PurchaseOrderLineRet || txn.purchaseOrderLineRet;

    if (!linesSource) return [];
    return Array.isArray(linesSource) ? linesSource : [linesSource];
  }

  function formatCurrency(amount: any) {
    const val = Number(amount);
    if (isNaN(val)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  }

  // Extract and group all labor line items across Estimates, Invoices, and Purchase Orders
  const laborLines = (() => {
    const list: any[] = [];
    
    estimates.forEach(est => {
      const lines = getLineItems(est, 'estimate');
      lines.forEach(line => {
        const itemName = line.ItemRef?.FullName || '';
        if (itemName.toLowerCase().startsWith('labor')) {
          list.push({
            txnId: est.id,
            txnType: 'estimate',
            refNumber: est.refNumber || 'Draft',
            date: est.txnDate || '',
            item: itemName,
            description: line.Desc || line.Description || '',
            qty: Number(line.Quantity) || 0,
            rate: Number(line.Rate) || 0,
            amount: Number(line.Amount) || 0
          });
        }
      });
    });

    invoices.forEach(inv => {
      const lines = getLineItems(inv, 'invoice');
      lines.forEach(line => {
        const itemName = line.ItemRef?.FullName || '';
        if (itemName.toLowerCase().startsWith('labor')) {
          list.push({
            txnId: inv.id,
            txnType: 'invoice',
            refNumber: inv.refNumber || 'Draft',
            date: inv.txnDate || '',
            item: itemName,
            description: line.Desc || line.Description || '',
            qty: Number(line.Quantity) || 0,
            rate: Number(line.Rate) || 0,
            amount: Number(line.Amount) || 0
          });
        }
      });
    });

    purchaseOrders.forEach(po => {
      const lines = getLineItems(po, 'purchaseOrder');
      lines.forEach(line => {
        const itemName = line.ItemRef?.FullName || '';
        if (itemName.toLowerCase().startsWith('labor')) {
          list.push({
            txnId: po.id,
            txnType: 'purchaseOrder',
            refNumber: po.refNumber || 'Draft',
            date: po.txnDate || '',
            item: itemName,
            description: line.Desc || line.Description || '',
            qty: Number(line.Quantity) || 0,
            rate: Number(line.Rate || line.Cost) || 0,
            amount: Number(line.Amount) || 0
          });
        }
      });
    });

    return list;
  })();

  // Auto-sync QuickBooks Labor Lines into Native Tasks subcollection
  useEffect(() => {
    if (!selectedJob || !tenantId || laborLines.length === 0 || isLoadingDetails) return;

    const syncLaborTasks = async () => {
      // Find labor lines from Estimates
      const estimateLaborLines = laborLines.filter(line => line.txnType === 'estimate');
      if (estimateLaborLines.length === 0) return;

      // Group estimate labor lines by item name and sum their quantities
      const estimateLaborGroup: Record<string, { item: string; description: string; qty: number; refNumber: string }> = {};
      estimateLaborLines.forEach(line => {
        const key = line.item.toLowerCase();
        if (estimateLaborGroup[key]) {
          estimateLaborGroup[key].qty += line.qty;
        } else {
          estimateLaborGroup[key] = {
            item: line.item,
            description: line.description,
            qty: line.qty,
            refNumber: line.refNumber
          };
        }
      });

      try {
        const groups = Object.values(estimateLaborGroup);
        const batchPromises = groups.map(async (groupItem) => {
          // Check if a task with this name already exists in nativeTasks
          const existingTask = nativeTasks.find((t: any) => 
            t.name?.toLowerCase() === groupItem.item.toLowerCase() ||
            (t.title && t.title.toLowerCase() === groupItem.item.toLowerCase())
          );

          if (!existingTask) {
            console.log(`Auto-creating native task for QuickBooks labor item: ${groupItem.item}`);
            const tasksRef = collection(db, `businesses/${tenantId}/jobs/${selectedJob.id}/tasks`);
            await addDoc(tasksRef, {
              name: groupItem.item,
              description: groupItem.description || `Labor line item from QuickBooks Estimate #${groupItem.refNumber}`,
              bookTime: groupItem.qty,
              payBasis: 'book_time',
              status: 'Pending',
              source: 'QuickBooks Sync',
              createdAt: serverTimestamp()
            });
          } else if (existingTask.bookTime !== groupItem.qty) {
            console.log(`Updating book time for existing task ${existingTask.id} to ${groupItem.qty} hrs`);
            const taskRef = doc(db, `businesses/${tenantId}/jobs/${selectedJob.id}/tasks`, existingTask.id);
            await updateDoc(taskRef, {
              bookTime: groupItem.qty
            });
          }
        });

        await Promise.all(batchPromises);
      } catch (syncErr) {
        console.error('Error auto-syncing QuickBooks labor tasks:', syncErr);
      }
    };

    syncLaborTasks();
  }, [selectedJob?.id, laborLines, nativeTasks, tenantId, isLoadingDetails]);

  // Compute labor summary statistics
  const laborSummary = (() => {
    let totalEstAmount = 0;
    let totalInvAmount = 0;
    let totalHours = 0;

    laborLines.forEach(line => {
      if (line.txnType === 'estimate') {
        totalEstAmount += line.amount;
        totalHours += line.qty;
      } else if (line.txnType === 'invoice') {
        totalInvAmount += line.amount;
      }
    });

    return { totalEstAmount, totalInvAmount, totalHours };
  })();

  // QuickBooks Parts Tracking Comparison (Estimates vs Purchase Orders)
  const qbPartsTracker = (() => {
    const tracker: Record<string, {
      itemName: string;
      desc: string;
      needed: number;
      ordered: number;
      received: number;
      missing: number;
    }> = {};

    // 1. Gather all non-labor items from Estimates (what is needed)
    estimates.forEach(est => {
      const lines = getLineItems(est, 'estimate');
      lines.forEach(line => {
        const itemName = line.ItemRef?.FullName || '';
        // Skip labor
        if (itemName.toLowerCase().startsWith('labor')) return;
        if (!itemName) return;

        if (!tracker[itemName]) {
          tracker[itemName] = {
            itemName,
            desc: line.Desc || line.Description || '',
            needed: 0,
            ordered: 0,
            received: 0,
            missing: 0
          };
        }
        tracker[itemName].needed += Number(line.Quantity) || 0;
      });
    });

    // 2. Gather all non-labor items from Purchase Orders (what has been ordered / received)
    purchaseOrders.forEach(po => {
      const lines = getLineItems(po, 'purchaseOrder');
      lines.forEach(line => {
        const itemName = line.ItemRef?.FullName || '';
        if (itemName.toLowerCase().startsWith('labor')) return;
        if (!itemName) return;

        if (!tracker[itemName]) {
          tracker[itemName] = {
            itemName,
            desc: line.Desc || line.Description || '',
            needed: 0,
            ordered: 0,
            received: 0,
            missing: 0
          };
        }
        const qty = Number(line.Quantity) || 0;
        const receivedQty = Number(line.ReceivedQuantity ?? line.Quantity) || 0;
        
        tracker[itemName].ordered += qty;
        tracker[itemName].received += receivedQty;
      });
    });

    // 3. Compute missing quantities
    const list = Object.values(tracker);
    list.forEach(item => {
      const diff = item.needed - item.ordered;
      item.missing = diff > 0 ? diff : 0;
    });

    return list;
  })();

  // Group native parts requests by status category
  const nativePartsGrouped = (() => {
    const needingOrder: any[] = [];
    const ordered: any[] = [];
    const withVehicle: any[] = [];
    const other: any[] = [];

    nativeParts.forEach(part => {
      const status = (part.status || '').toLowerCase();
      if (status === 'pending') {
        needingOrder.push(part);
      } else if (status === 'ordered' || status === 'in_transit' || status === 'out_for_delivery') {
        ordered.push(part);
      } else if (status === 'received' || status === 'fulfilled' || status === 'installed') {
        withVehicle.push(part);
      } else {
        other.push(part);
      }
    });

    return { needingOrder, ordered, withVehicle, other };
  })();

  // --- Task Interactive Handlers ---
  const handleStartTask = async (task: any) => {
    if (!selectedJob) return;
    if (!activeSessionId) {
      toast.error('Please clock in for the day first.');
      return;
    }
    
    try {
      await clockIntoJob(selectedJob.id, selectedJob.title, task.id, task.title);
      
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${selectedJob.id}/tasks`, task.id);
      await updateDoc(taskRef, {
        status: 'In Progress',
        clockedInUserId: activeOperatorId,
        clockedInUserName: activeOperatorName,
        startedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Error starting task:', err);
      toast.error('Failed to start task.');
    }
  };

  const handlePauseTask = async (task: any) => {
    if (!selectedJob) return;
    try {
      await clockOutOfJob(selectedJob.id, task.id);
      
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${selectedJob.id}/tasks`, task.id);
      await updateDoc(taskRef, {
        status: 'Pending',
        clockedInUserId: null,
        clockedInUserName: null
      });
    } catch (err) {
      console.error('Error pausing task:', err);
      toast.error('Failed to pause task.');
    }
  };

  const handleStartCompleteTask = (task: any) => {
    setActiveTaskForCompletion(task);
    setCompletionNotes('');
    setCompletionPhoto(null);
    setCompletionPhotoPreview(null);
  };

  const handleConfirmCompleteTask = async () => {
    if (!selectedJob || !activeTaskForCompletion) return;
    setIsCompletingTask(true);
    
    try {
      const jobId = selectedJob.id;
      const taskId = activeTaskForCompletion.id;
      
      let photoUrl = '';
      if (completionPhoto) {
        const storageRef = ref(storage, `businesses/${tenantId}/tasks/${taskId}/completion_${Date.now()}_${completionPhoto.name}`);
        const snapshot = await uploadBytes(storageRef, completionPhoto);
        photoUrl = await getDownloadURL(snapshot.ref);
      }
      
      await clockOutOfJob(jobId, taskId);
      
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId);
      await updateDoc(taskRef, {
        status: 'Ready for QC',
        clockedInUserId: null,
        clockedInUserName: null,
        completionNotes: completionNotes.trim() || null,
        completionPhotoUrl: photoUrl || null,
        completedByUserId: activeOperatorId,
        completedByUserName: activeOperatorName,
        completedAt: serverTimestamp()
      });
      
      toast.success(`Task "${activeTaskForCompletion.title}" marked as Ready for QC!`);
      setActiveTaskForCompletion(null);
    } catch (err) {
      console.error('Error completing task:', err);
      toast.error('Failed to complete task.');
    } finally {
      setIsCompletingTask(false);
    }
  };

  const handleApproveQC = async (task: any) => {
    if (!selectedJob) return;
    try {
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${selectedJob.id}/tasks`, task.id);
      await updateDoc(taskRef, {
        status: 'Completed',
        qcApprovedByUserId: activeOperatorId,
        qcApprovedByUserName: activeOperatorName,
        qcApprovedAt: serverTimestamp()
      });
      toast.success(`Task "${task.title || task.name}" QC Approved!`);
    } catch (err) {
      console.error('Error approving QC:', err);
      toast.error('Failed to approve QC.');
    }
  };

  const handleRejectQC = async (task: any, reason: string) => {
    if (!selectedJob) return;
    try {
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${selectedJob.id}/tasks`, task.id);
      await updateDoc(taskRef, {
        status: 'Not Started',
        helpRequested: true,
        helpRequestedBy: activeOperatorName,
        helpRequestedAt: serverTimestamp(),
        description: (task.description || '') + `\n\n[QC REJECTED BY ${activeOperatorName}]: ${reason}`,
        qcRejectedReason: reason,
        qcRejectedAt: serverTimestamp()
      });
      toast.warning(`Task "${task.title || task.name}" QC Rejected and returned to tasks.`);
    } catch (err) {
      console.error('Error rejecting QC:', err);
      toast.error('Failed to reject QC.');
    }
  };

  const handleToggleHelpFlag = async (task: any) => {
    if (!selectedJob) return;
    try {
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${selectedJob.id}/tasks`, task.id);
      const flagVal = !task.helpRequested;
      await updateDoc(taskRef, {
        helpRequested: flagVal,
        helpRequestedBy: flagVal ? activeOperatorName : null,
        helpRequestedAt: flagVal ? serverTimestamp() : null
      });
      
      if (flagVal) {
        toast.warning(`Requested help for "${task.title}"`);
      } else {
        toast.success(`Cleared help request for "${task.title}"`);
      }
    } catch (err) {
      console.error('Error toggling help flag:', err);
      toast.error('Failed to update help request.');
    }
  };

  const handleRequestPartFromTask = async () => {
    if (!selectedJob || !activeTaskForParts || !newPartName.trim()) return;
    setIsAddingPart(true);
    
    try {
      await addDoc(collection(db, `businesses/${tenantId}/parts_requests`), {
        jobId: selectedJob.id,
        jobName: selectedJob.title,
        partName: newPartName.trim(),
        partNumber: newPartNumber.trim(),
        bin: newPartBin.trim(),
        quantity: Number(newPartQty) || 1,
        status: 'pending',
        requestedBy: activeOperatorName,
        requestedById: activeOperatorId,
        taskId: activeTaskForParts.id,
        taskName: activeTaskForParts.name || activeTaskForParts.title || 'General',
        createdAt: serverTimestamp()
      });
      
      toast.success(`Requested "${newPartName.trim()}"`);
      setActiveTaskForParts(null);
      setNewPartName('');
      setNewPartNumber('');
      setNewPartBin('');
      setNewPartQty(1);
    } catch (err) {
      console.error('Error requesting part:', err);
      toast.error('Failed to request part.');
    } finally {
      setIsAddingPart(false);
    }
  };

  const handleAddTask = async () => {
    if (!selectedJob || !newTaskTitle.trim()) return;
    setIsAddingTask(true);
    try {
      await addDoc(collection(db, `businesses/${tenantId}/jobs/${selectedJob.id}/tasks`), {
        title: newTaskTitle.trim(),
        name: newTaskTitle.trim(),
        description: newTaskDesc.trim(),
        bookTime: newTaskPayBasis === 'hourly' ? 0 : Number(newTaskBookTime) || 0,
        payBasis: newTaskPayBasis,
        status: 'Not Started',
        tenantId: tenantId,
        source: 'Native',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast.success(`Created task "${newTaskTitle.trim()}"`);
      setIsAddTaskOpen(false);
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskBookTime(0);
      setNewTaskPayBasis('book_time');
    } catch (err) {
      console.error('Error creating task:', err);
      toast.error('Failed to create task.');
    } finally {
      setIsAddingTask(false);
    }
  };

  const handleAddJob = async () => {
    if (!newJobTitle.trim()) return;
    setIsAddingJob(true);
    try {
      const jobPayload = {
        title: newJobTitle.trim(),
        jobNumber: newJobNumber.trim() || null,
        customerName: newJobCustomerName.trim() || null,
        source: 'Native',
        status: 'Open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, `businesses/${tenantId}/jobs`), jobPayload);
      
      const newJob = { id: docRef.id, ...jobPayload };
      setJobs(prev => [newJob, ...prev]);
      setSearchParams({ id: docRef.id }, { replace: true });
      
      toast.success(`Created job "${newJobTitle.trim()}"`);
      setIsAddJobOpen(false);
      setNewJobTitle('');
      setNewJobNumber('');
      setNewJobCustomerName('');
    } catch (err) {
      console.error('Error creating job:', err);
      toast.error('Failed to create job.');
    } finally {
      setIsAddingJob(false);
    }
  };

  // Helper to extract segments for a specific task
  const getTaskTimeSegments = (taskId: string) => {
    const segments: any[] = [];
    timeLogs.forEach((session: any) => {
      if (!session.jobs) return;
      session.jobs.forEach((seg: any) => {
        if (seg.taskId === taskId) {
          segments.push({
            staffName: session.userName || session.staffName || 'Technician',
            start: seg.start?.toDate?.() || new Date(seg.start),
            end: seg.end ? (seg.end?.toDate?.() || new Date(seg.end)) : null,
            durationMs: seg.end
              ? (new Date(seg.end?.toDate?.() || seg.end).getTime() - new Date(seg.start?.toDate?.() || seg.start).getTime())
              : null
          });
        }
      });
    });
    return segments.sort((a, b) => b.start.getTime() - a.start.getTime());
  };

  const getTaskParts = (taskId: string) => {
    return nativeParts.filter((part: any) => part.taskId === taskId);
  };

  const formatDuration = (ms: number) => {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };


  const handleCyclePartStatus = async (part: any) => {
    const statusCycle: Record<string, string> = {
      'pending': 'ordered',
      'ordered': 'received',
      'received': 'fulfilled',
      'fulfilled': 'pending'
    };
    
    const nextStatus = statusCycle[part.status] || 'pending';
    try {
      const partRef = doc(db, `businesses/${tenantId}/parts_requests`, part.id);
      await updateDoc(partRef, {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
      toast.success(`Part status updated to ${nextStatus.toUpperCase()}`);
    } catch (err) {
      console.error('Error cycling part status:', err);
      toast.error('Failed to update part status.');
    }
  };

  const filteredJobs = jobs.filter(job => {
    // 1. Search Query filter
    const term = searchQuery.toLowerCase();
    const matchesSearch = (
      (job.title || '').toLowerCase().includes(term) ||
      (job.jobNumber || '').toLowerCase().includes(term) ||
      (job.customerName || '').toLowerCase().includes(term)
    );
    if (!matchesSearch) return false;

    // 2. Sidebar segment filter
    const isNative = job.source === 'Native' || !job.quickbooksId;
    if (sidebarFilter === 'qb') return !isNative;
    if (sidebarFilter === 'native') return isNative;
    return true;
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-zinc-950 text-white overflow-hidden flex-col md:flex-row">
      {/* Sidebar Jobs list */}
      <div className={cn(
        "w-full md:w-80 border-r border-zinc-800 bg-zinc-900/40 flex flex-col shrink-0 h-full",
        urlJobId ? "hidden md:flex" : "flex"
      )}>
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2 text-indigo-400">
              <Briefcase className="w-5 h-5 text-indigo-400" />
              Recent Jobs
            </h2>
            <div className="flex items-center gap-1.5">
              {canManageTasks && (
                <button
                  onClick={() => {
                    setIsAddJobOpen(true);
                    setNewJobTitle('');
                    setNewJobNumber('');
                    setNewJobCustomerName('');
                  }}
                  className="bg-indigo-650/20 hover:bg-indigo-600 border border-indigo-500/30 hover:border-indigo-500 text-white p-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center shadow-sm"
                  title="Add Job Manually"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
              {lastSyncTime && (
                <span className="text-[10px] bg-emerald-950/45 text-emerald-450 border border-emerald-900/40 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Connected
                </span>
              )}
            </div>
          </div>

          {lastSyncTime && (
            <div className="mb-3 px-3 py-1.5 rounded-xl bg-zinc-950/60 border border-zinc-850/80 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
              <span className="flex items-center gap-1 font-semibold text-zinc-500">
                <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> Last Sync:
              </span>
              <span className="font-bold text-zinc-300">{lastSyncTime}</span>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-zinc-500"
            />
          </div>
          
          {/* Segment Filter */}
          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-850 mt-3 flex-wrap">
            <button
              onClick={() => setSidebarFilter('all')}
              className={cn(
                "flex-1 text-[10px] font-bold py-1 px-2 rounded-lg transition-all text-center",
                sidebarFilter === 'all' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-350"
              )}
            >
              All
            </button>
            <button
              onClick={() => setSidebarFilter('qb')}
              className={cn(
                "flex-1 text-[10px] font-bold py-1 px-2 rounded-lg transition-all text-center whitespace-nowrap",
                sidebarFilter === 'qb' ? "bg-zinc-800 text-blue-400 shadow-sm" : "text-zinc-500 hover:text-zinc-350"
              )}
            >
              QuickBooks
            </button>
            <button
              onClick={() => setSidebarFilter('native')}
              className={cn(
                "flex-1 text-[10px] font-bold py-1 px-2 rounded-lg transition-all text-center",
                sidebarFilter === 'native' ? "bg-zinc-800 text-emerald-400 shadow-sm" : "text-zinc-500 hover:text-zinc-350"
              )}
            >
              Native
            </button>
          </div>
        </div>

        <div 
          onScroll={handleSidebarScroll}
          className="flex-1 overflow-y-auto p-2 space-y-1"
        >
          {isLoadingJobs ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mb-2"></div>
              <p className="text-sm">Loading jobs...</p>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500">No jobs found</div>
          ) : (
            <>
              {filteredJobs.map((job) => {
                const isSelected = selectedJob?.id === job.id;
                const isNative = job.source === 'Native' || !job.quickbooksId;
                return (
                  <button
                    key={job.id}
                    onClick={() => setSearchParams({ id: job.id, tab: 'overview' }, { replace: true })}
                    className={cn(
                      "w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group",
                      isSelected 
                        ? "bg-indigo-600/10 border border-indigo-500 text-white" 
                        : "hover:bg-zinc-800/60 border border-transparent text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-semibold text-sm truncate text-zinc-100 group-hover:text-white">
                          {job.title}
                        </span>
                        {job.jobNumber && (
                          <span className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded-full font-mono shrink-0">
                            #{job.jobNumber}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500 truncate">{job.customerName || 'No customer'}</span>
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wide uppercase",
                          isNative 
                            ? "bg-emerald-955/40 text-emerald-450 border border-emerald-900/30" 
                            : "bg-blue-955/40 text-blue-450 border border-blue-900/30"
                        )}>
                          {isNative ? 'Native' : 'QB'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className={cn("w-4 h-4 text-zinc-650 transition-transform group-hover:translate-x-0.5", isSelected && "text-indigo-400")} />
                  </button>
                );
              })}

              {isLoadingMoreJobs && (
                <div className="flex justify-center items-center gap-2 py-4 text-zinc-500 text-xs font-bold font-mono">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  <span>Loading older jobs...</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Details Display Area */}
      <div className={cn(
        "flex-1 min-w-0 flex flex-col bg-zinc-950 overflow-hidden h-full",
        !urlJobId ? "hidden md:flex" : "flex"
      )}>
        {selectedJob ? (
          <>
            {/* Header */}
            <div className="p-6 border-b border-zinc-800 bg-zinc-900/20 shrink-0">
              {urlJobId && (
                <button
                  onClick={() => setSearchParams({}, { replace: true })}
                  className="md:hidden flex items-center gap-1.5 text-zinc-400 hover:text-white mb-4 text-xs font-bold bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-xl transition-all self-start shadow-md"
                >
                  <ChevronLeft className="w-4 h-4 text-indigo-400" />
                  Back to Jobs
                </button>
              )}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                    <h1 className="text-2xl font-bold tracking-tight text-white">{selectedJob.title}</h1>
                    {selectedJob.jobNumber && (
                      <span className="bg-indigo-900/40 text-indigo-300 border border-indigo-850 px-2.5 py-0.5 rounded-full text-xs font-mono">
                        Job #{selectedJob.jobNumber}
                      </span>
                    )}
                    {totalBookTime > 0 && (
                      <span className="text-indigo-400 text-xs font-bold px-2.5 py-0.5 bg-indigo-955/20 border border-indigo-900/30 rounded-full flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-455" />
                        Est. Remaining: {remainingBookTime.toFixed(1)} hrs (of {totalBookTime.toFixed(1)} total)
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400">
                    Customer: <span className="text-zinc-200 font-medium">{selectedJob.customerName || 'N/A'}</span>
                  </p>
                </div>
                
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex gap-2">
                    <button
                      onClick={handleShareJobLink}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer border border-indigo-500/30"
                      title="Share this Job Link"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Share</span>
                    </button>

                    {selectedJob.quickbooksId ? (
                      <div className="bg-blue-950/40 border border-blue-900/60 p-2 px-3 rounded-xl flex items-center gap-2 text-blue-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                        <span className="text-xs font-mono">QB ID: {selectedJob.quickbooksId}</span>
                      </div>
                    ) : (
                      <div className="bg-emerald-950/40 border border-emerald-900/60 p-2 px-3 rounded-xl flex items-center gap-2 text-emerald-450">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                        <span className="text-xs font-mono">Native App Job</span>
                      </div>
                    )}
                  </div>
                  {lastSyncTime && (
                    <span className="text-[11px] text-zinc-500 flex items-center gap-1 font-medium font-mono">
                      <Clock className="w-3.5 h-3.5 text-zinc-650" />
                      Last Sync: {lastSyncTime}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Flat Tabs Switcher */}
            <div className="px-6 border-b border-zinc-800 bg-zinc-900/25 flex overflow-x-auto whitespace-nowrap gap-x-2 shrink-0 scroll-smooth custom-scrollbar pb-1.5">
              <button
                onClick={() => setActiveTab('overview')}
                className={cn(
                  "py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'overview' 
                    ? "border-indigo-500 text-indigo-400 font-bold" 
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Info className="w-4 h-4 text-violet-400" />
                Overview
              </button>

              <button
                onClick={() => setActiveTab('tasks')}
                className={cn(
                  "py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'tasks' 
                    ? "border-indigo-500 text-indigo-400 font-bold" 
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                )}
              >
                <ClipboardList className="w-4 h-4 text-indigo-455" />
                Worksheet Tasks
                <span className="bg-zinc-850 text-zinc-455 px-2 py-0.5 rounded-full text-xs font-mono">
                  {nativeTasks.filter((t: any) => t.status !== 'Ready for QC' && t.status !== 'Completed').length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('qc')}
                className={cn(
                  "py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'qc' 
                    ? "border-indigo-500 text-indigo-400 font-bold" 
                    : "border-transparent text-zinc-400 hover:text-zinc-205"
                )}
              >
                <ShieldAlert className="w-4 h-4 text-emerald-450 animate-pulse" />
                QC Sign-off
                {nativeTasks.filter((t: any) => t.status === 'Ready for QC').length > 0 && (
                  <span className="bg-emerald-950/80 border border-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse">
                    {nativeTasks.filter((t: any) => t.status === 'Ready for QC').length}
                  </span>
                )}
              </button>


              <button
                onClick={() => setActiveTab('labor')}
                className={cn(
                  "py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'labor' 
                    ? "border-indigo-500 text-indigo-400 font-bold" 
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Wrench className="w-4 h-4 text-amber-500" />
                Labor Only
                <span className="bg-zinc-850 text-zinc-455 px-2 py-0.5 rounded-full text-xs font-mono">
                  {laborLines.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('partsTracker')}
                className={cn(
                  "py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'partsTracker' 
                    ? "border-indigo-500 text-indigo-400 font-bold" 
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Package className="w-4 h-4 text-emerald-500" />
                Parts Tracker
                <span className="bg-zinc-850 text-zinc-455 px-2 py-0.5 rounded-full text-xs font-mono">
                  {qbPartsTracker.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('companycam')}
                className={cn(
                  "py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'companycam' 
                    ? "border-indigo-500 text-indigo-400 font-bold" 
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Camera className="w-4 h-4 text-pink-500" />
                CompanyCam
                {selectedJob.companyCamId || selectedJob.companyCamProjectId ? (
                  <span className="bg-zinc-850 text-zinc-455 px-2 py-0.5 rounded-full text-xs font-mono">
                    {ccPhotos.length}
                  </span>
                ) : (
                  <span className="bg-amber-950/40 text-amber-550 border border-amber-900/30 px-1.5 py-0.5 rounded text-[10px] font-bold">
                    Unlinked
                  </span>
                )}
              </button>

              <span className="self-stretch w-px bg-zinc-800 my-3 mx-1" />

              <button
                onClick={() => setActiveTab('estimates')}
                className={cn(
                  "py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'estimates' 
                    ? "border-indigo-500 text-indigo-400 font-bold" 
                    : "border-transparent text-zinc-400 hover:text-zinc-205"
                )}
              >
                <Layers className="w-4 h-4 text-zinc-450" />
                QB Estimates
                <span className="bg-zinc-850 text-zinc-455 px-2 py-0.5 rounded-full text-xs font-mono">
                  {estimates.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('invoices')}
                className={cn(
                  "py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'invoices' 
                    ? "border-indigo-500 text-indigo-400 font-bold" 
                    : "border-transparent text-zinc-400 hover:text-zinc-205"
                )}
              >
                <FileText className="w-4 h-4 text-zinc-450" />
                QB Invoices
                <span className="bg-zinc-850 text-zinc-455 px-2 py-0.5 rounded-full text-xs font-mono">
                  {invoices.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('purchaseOrders')}
                className={cn(
                  "py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0",
                  activeTab === 'purchaseOrders' 
                    ? "border-indigo-500 text-indigo-400 font-bold" 
                    : "border-transparent text-zinc-400 hover:text-zinc-205"
                )}
              >
                <ShoppingCart className="w-4 h-4 text-zinc-450" />
                QB Purchase Orders
                <span className="bg-zinc-850 text-zinc-455 px-2 py-0.5 rounded-full text-xs font-mono">
                  {purchaseOrders.length}
                </span>
              </button>
            </div>

            {/* List and Line Items content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoadingDetails ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-2"></div>
                  <p className="text-sm text-zinc-400">Loading details...</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Offline notification warning if the job is Native or has no QB sync record, only shown for QB subtabs */}
                  {(activeTab === 'estimates' || activeTab === 'invoices' || activeTab === 'purchaseOrders' || activeTab === 'labor') && 
                    (estimates.length === 0 && invoices.length === 0 && purchaseOrders.length === 0) && (
                      <div className="bg-zinc-900/50 border border-zinc-850 rounded-2xl p-4 flex gap-3 text-sm text-zinc-400 mb-4">
                        <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-zinc-200">No QuickBooks data synced for this job.</p>
                          <p className="text-xs text-zinc-500 mt-1">
                            If this job was created manually and the QuickBooks Web Connector is not running, 
                            QuickBooks records will not exist in UpfittersOS. Try checking the <strong>Worksheet Tasks</strong> tab to view local tasks and parts!
                          </p>
                        </div>
                      </div>
                    )}

                  {/* 0. Overview Tab */}
                  {activeTab === 'overview' && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      {/* Dashboard Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-zinc-700 transition-all">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform"></div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Job Title</span>
                            <h3 className="text-lg font-bold text-zinc-150 mt-1 line-clamp-1">{selectedJob.title}</h3>
                          </div>
                          <div className="mt-4 flex items-center justify-between">
                            <span className="text-xs text-zinc-400"># {selectedJob.jobNumber || 'Native'}</span>
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase",
                              selectedJob.source === 'Native' || !selectedJob.quickbooksId
                                ? "bg-emerald-955/20 text-emerald-450 border border-emerald-900/30"
                                : "bg-blue-955/20 text-blue-450 border border-blue-900/30"
                            )}>
                              {selectedJob.source || 'Native'}
                            </span>
                          </div>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-zinc-700 transition-all">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform"></div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Work Progress</span>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-3xl font-extrabold text-white">
                                {nativeTasks.filter((t: any) => t.status === 'Completed').length}
                              </span>
                              <span className="text-zinc-500">/ {nativeTasks.length} tasks</span>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
                            <span>Ready for QC</span>
                            <span className="font-bold text-emerald-450">{nativeTasks.filter((t: any) => t.status === 'Ready for QC').length}</span>
                          </div>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-zinc-700 transition-all">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform"></div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Estimated Time</span>
                            <div className="flex items-baseline gap-1.5 mt-1">
                              <span className="text-3xl font-extrabold text-violet-400">{remainingBookTime.toFixed(1)}</span>
                              <span className="text-xs text-zinc-400 font-medium">hrs remaining</span>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center justify-between text-xs text-zinc-505">
                            <span>Total Book Time</span>
                            <span className="font-semibold text-zinc-300">{totalBookTime.toFixed(1)} hrs</span>
                          </div>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-zinc-700 transition-all">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform"></div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Active Operators</span>
                            <div className="flex items-center gap-1.5 mt-2">
                              {nativeTasks.some((t: any) => t.status === 'In Progress') ? (
                                <div className="flex -space-x-2 overflow-hidden">
                                  {Array.from(new Set(nativeTasks.filter((t: any) => t.status === 'In Progress' && t.clockedInOperatorName).map((t: any) => t.clockedInOperatorName))).map((op: any, oIdx) => (
                                    <div key={oIdx} className="inline-block h-6 w-6 rounded-full ring-2 ring-zinc-900 bg-indigo-650 flex items-center justify-center text-[10px] font-bold text-white uppercase" title={op}>
                                      {op.charAt(0)}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-zinc-600 italic">No operators active</span>
                              )}
                            </div>
                          </div>
                          <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                            <span>Active Now</span>
                            <span className="font-bold text-blue-450 animate-pulse">
                              {nativeTasks.filter((t: any) => t.status === 'In Progress').length} tasks
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Detail Panels */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Vehicle & Shop Location */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-lg space-y-4">
                          <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2 border-b border-zinc-850 pb-3">
                            <Wrench className="w-4 h-4 text-indigo-400" />
                            Linked Vehicle & Location
                          </h3>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-850">
                              <span className="text-zinc-500 block mb-1">Location in Shop</span>
                              <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                                {selectedJob.locationName || selectedJob.location || 'Not Checked In'}
                              </span>
                            </div>
                            <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-850">
                              <span className="text-zinc-500 block mb-1">VIN Number</span>
                              <span className="font-mono font-semibold text-zinc-350">{selectedJob.vin || 'No VIN Linked'}</span>
                            </div>
                            <div className="col-span-2 bg-zinc-950/50 p-3 rounded-xl border border-zinc-850 flex items-center justify-between">
                              <div>
                                <span className="text-zinc-500 block mb-1">Vehicle Description</span>
                                <span className="font-semibold text-zinc-200 text-sm">
                                  {selectedJob.vehicleYear || ''} {selectedJob.vehicleMake || ''} {selectedJob.vehicleModel || ''}
                                </span>
                              </div>
                              {selectedJob.vehicleColor && (
                                <span className="text-[10px] px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-400 font-bold uppercase">
                                  {selectedJob.vehicleColor}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Customer & QuickBooks Info */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-lg space-y-4">
                          <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2 border-b border-zinc-850 pb-3">
                            <Info className="w-4 h-4 text-violet-400" />
                            Customer & QuickBooks Details
                          </h3>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div className="col-span-2 bg-zinc-950/50 p-3 rounded-xl border border-zinc-850">
                              <span className="text-zinc-500 block mb-1">Customer Account</span>
                              <span className="font-bold text-zinc-200 text-sm">{selectedJob.customerName || 'No Customer Account Linked'}</span>
                            </div>
                            <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-850">
                              <span className="text-zinc-500 block mb-1">Job ID</span>
                              <span className="font-mono text-zinc-300 truncate block">{selectedJob.id}</span>
                            </div>
                            <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-850">
                              <span className="text-zinc-500 block mb-1">QuickBooks Reference</span>
                              <span className="font-mono text-zinc-300 truncate block">{selectedJob.quickbooksId || 'Not Synced'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* CompanyCam Overview Card */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-lg space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-850 pb-3">
                          <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                            <Camera className="w-4 h-4 text-pink-500" />
                            CompanyCam Project
                          </h3>
                          {(selectedJob.companyCamId || selectedJob.companyCamProjectId) && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => setActiveTab('companycam')}
                                className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-bold transition-all border border-zinc-700"
                              >
                                View Gallery ({ccPhotos.length})
                              </button>
                              <a
                                href={`https://app.companycam.com/projects/${selectedJob.companyCamId || selectedJob.companyCamProjectId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1 bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition-all"
                              >
                                Open Project
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          )}
                        </div>

                        {selectedJob.companyCamId || selectedJob.companyCamProjectId ? (
                          <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2 bg-zinc-950/40 p-3 rounded-xl border border-zinc-850">
                              <div className="flex items-center gap-2">
                                <span className="text-zinc-500">Project ID:</span>
                                <span className="font-mono font-bold text-zinc-300">{selectedJob.companyCamId || selectedJob.companyCamProjectId}</span>
                              </div>
                              <button
                                onClick={handleUnlinkCompanyCamProject}
                                disabled={isSavingCcLink}
                                className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase tracking-wider"
                              >
                                Unlink Project
                              </button>
                            </div>

                            {isLoadingPhotos ? (
                              <div className="flex items-center gap-2 text-zinc-500 text-xs py-4 justify-center">
                                <Loader2 className="w-4 h-4 animate-spin text-pink-500" />
                                <span>Loading photos...</span>
                              </div>
                            ) : ccPhotos.length === 0 ? (
                              <div className="text-center py-6 text-xs text-zinc-500 italic">
                                No photos uploaded to this project yet.
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                                {ccPhotos.slice(0, 6).map((photo: any, pIdx: number) => {
                                  const imgUrl = photo.uris?.[0]?.uri || '';
                                  return (
                                    <div
                                      key={photo.id || pIdx}
                                      onClick={() => {
                                        setActiveTab('companycam');
                                        setSelectedPhotoIndex(pIdx);
                                      }}
                                      className="relative aspect-video rounded-xl overflow-hidden cursor-pointer border border-zinc-850 hover:border-zinc-700 transition-all hover:scale-105 active:scale-95 group/pic"
                                    >
                                      <img
                                        src={imgUrl}
                                        alt="CompanyCam overview"
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/pic:opacity-100 flex items-center justify-center transition-opacity">
                                        <Camera className="w-4 h-4 text-white" />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-zinc-950/45 p-4 rounded-xl border border-zinc-850/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-zinc-350">No CompanyCam project linked.</p>
                              <p className="text-xs text-zinc-500 mt-0.5">Link a project to see real-time photos and uploads inside the job worksheet.</p>
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto shrink-0 max-w-sm">
                              <input
                                type="text"
                                placeholder="Paste Project ID or URL..."
                                value={ccLinkInput}
                                onChange={(e) => setCcLinkInput(e.target.value)}
                                className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-pink-500 placeholder-zinc-600 flex-1 min-w-0"
                              />
                              <button
                                onClick={() => {
                                  handleLinkCompanyCamProject(ccLinkInput);
                                  setCcLinkInput('');
                                }}
                                disabled={isSavingCcLink}
                                className="bg-pink-650 hover:bg-pink-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 shrink-0 whitespace-nowrap"
                              >
                                {isSavingCcLink ? 'Linking...' : 'Link Project'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 0.5. QC Sign-off Tab */}
                  {activeTab === 'qc' && (
                    nativeTasks.filter((t: any) => t.status === 'Ready for QC').length === 0 ? (
                      <EmptyState message="No tasks are currently waiting for Quality Control sign-off." icon={ClipboardCheck} />
                    ) : (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg animate-in fade-in duration-200">
                        <div className="p-5 border-b border-zinc-850 bg-zinc-900/60 flex items-center justify-between">
                          <h3 className="font-bold text-zinc-150 text-sm flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-emerald-450" />
                            QC Verification Queue
                          </h3>
                          <span className="text-xs text-zinc-500">Items await manager sign-off</span>
                        </div>
                        <div className="divide-y divide-zinc-850">
                          {nativeTasks
                            .filter((t: any) => t.status === 'Ready for QC')
                            .map((task) => (
                              <div key={task.id} className="p-6 flex flex-col md:flex-row md:items-start justify-between gap-6 hover:bg-zinc-900/40 transition-colors">
                                <div className="space-y-3 flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-base text-zinc-100 truncate">{task.title || task.name}</h4>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-955/40 text-amber-450 border border-amber-900/30 uppercase font-bold">
                                      Ready for QC
                                    </span>
                                  </div>
                                  
                                  {task.description && (
                                    <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed whitespace-pre-line bg-zinc-950/40 p-3 rounded-xl border border-zinc-850">
                                      {task.description}
                                    </p>
                                  )}

                                  <div className="flex items-start gap-4 text-xs pt-1">
                                    {task.completionPhotoUrl && (
                                      <a 
                                        href={task.completionPhotoUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="relative w-28 h-20 rounded-xl overflow-hidden border border-zinc-800 hover:border-indigo-500 transition-all shrink-0 group"
                                      >
                                        <img src={task.completionPhotoUrl} alt="Completion Proof" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-all">
                                          View Photo
                                        </div>
                                      </a>
                                    )}
                                    <div className="space-y-1.5 min-w-0">
                                      <div>
                                        <span className="text-zinc-505 block text-[10px] uppercase font-bold tracking-wider">Completed By</span>
                                        <span className="font-semibold text-zinc-300">{task.completedByUserName || 'Technician'}</span>
                                      </div>
                                      {task.completionNotes && (
                                        <div>
                                          <span className="text-zinc-505 block text-[10px] uppercase font-bold tracking-wider">Technician Notes</span>
                                          <p className="italic text-zinc-350">"{task.completionNotes}"</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end md:self-start">
                                  <button
                                    onClick={() => handleApproveQC(task)}
                                    className="bg-emerald-650 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg"
                                  >
                                    <Check className="w-4 h-4" />
                                    Approve QC
                                  </button>
                                  <button
                                    onClick={() => setActiveTaskForRejection(task)}
                                    className="bg-zinc-950 border border-zinc-850 hover:border-zinc-700 hover:bg-zinc-900 text-zinc-400 hover:text-rose-400 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                                  >
                                    <XCircle className="w-4 h-4" />
                                    Send Back
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )
                  )}

                  {/* 1. Worksheet Tasks Tab */}
                  {activeTab === 'tasks' && (
                    nativeTasks.length === 0 ? (
                      <EmptyState message="No tasks have been set up for this Job yet." icon={ClipboardList} />
                    ) : (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg animate-in fade-in duration-200">
                        <div className="p-5 border-b border-zinc-850 bg-zinc-900/60 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <h3 className="font-bold text-base text-zinc-150 flex items-center gap-2">
                              <ClipboardList className="w-5 h-5 text-indigo-400" />
                              Live Tasks Worksheet
                            </h3>
                            {canManageTasks && (
                              <button
                                onClick={() => {
                                  setIsAddTaskOpen(true);
                                  setNewTaskTitle('');
                                  setNewTaskDesc('');
                                  setNewTaskBookTime(0);
                                  setNewTaskPayBasis('book_time');
                                }}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add Task
                              </button>
                            )}
                          </div>
                          {activeSessionId ? (
                            <span className="text-[10px] bg-emerald-950/40 text-emerald-450 border border-emerald-900/50 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Operator: {activeOperatorName}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-amber-955/40 text-amber-450 border border-amber-900/50 px-2 py-0.5 rounded font-mono font-bold">
                              Day Timeclock Offline (Must clock in to track tasks)
                            </span>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                           <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-855 bg-zinc-955 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                                <th className="py-3 px-4 w-10"></th>
                                <th className="py-3 px-5">Task Name</th>
                                <th className="py-3 px-5">Description</th>
                                <th className="py-3 px-5 text-center w-24">Book Time</th>
                                <th className="py-3 px-5 text-center w-36">Status / Operator</th>
                                <th className="py-3 px-5 text-right w-44">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-850">
                              {nativeTasks.map((task) => {
                                const isCurrentClocked = task.status === 'In Progress' && task.clockedInUserId === activeOperatorId;
                                const isOtherClocked = task.status === 'In Progress' && task.clockedInUserId !== activeOperatorId;
                                const isExpanded = expandedTaskId === task.id;

                                return (
                                  <React.Fragment key={task.id}>
                                    <tr className={cn(
                                      "hover:bg-zinc-900/40 transition-colors",
                                      task.helpRequested && "bg-rose-955/10 hover:bg-rose-955/20",
                                      isExpanded && "bg-indigo-950/5 hover:bg-indigo-950/10"
                                    )}>
                                      {/* Chevron Toggle */}
                                      <td 
                                        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                                        className="py-3.5 px-4 align-top cursor-pointer text-zinc-500 hover:text-zinc-200 transition-colors"
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="w-4 h-4" />
                                        ) : (
                                          <ChevronRight className="w-4 h-4" />
                                        )}
                                      </td>

                                      {/* Task Name */}
                                      <td 
                                        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                                        className="py-3.5 px-5 font-semibold text-zinc-150 align-top cursor-pointer group"
                                      >
                                        <div className="flex items-start gap-2">
                                          {task.helpRequested && (
                                            <span className="flex h-2 w-2 shrink-0 rounded-full bg-rose-500 animate-ping mt-1.5" title="Help Needed!" />
                                          )}
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                              <span className={cn("font-bold text-zinc-100 group-hover:text-indigo-455 transition-colors", task.status === 'Completed' && "line-through text-zinc-500")}>
                                                {task.name || task.title || 'Untitled Task'}
                                              </span>
                                              {/* Source badge */}
                                              {task.quickbooksId || task.qbLineId || task.serviceRef || task.source === 'QuickBooks' ? (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-955/40 text-blue-450 border border-blue-900/40 font-bold uppercase tracking-wider">
                                                  QB
                                                </span>
                                              ) : (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-955/40 text-emerald-450 border border-emerald-900/40 font-bold uppercase tracking-wider">
                                                  App
                                                </span>
                                              )}
                                            </div>
                                            {task.helpRequested && (
                                              <span className="inline-block px-1.5 py-0.5 rounded bg-rose-955/60 border border-rose-900/50 text-[9px] font-bold text-rose-455 uppercase animate-pulse">
                                                HELP FLAG
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </td>

                                      {/* Simple Description */}
                                      <td 
                                        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                                        className="py-3.5 px-5 text-zinc-400 align-top max-w-xs cursor-pointer"
                                      >
                                        <div className="line-clamp-2 text-zinc-400 text-xs leading-relaxed">
                                          {task.description || <span className="text-zinc-600 italic">No description provided. Click to expand.</span>}
                                        </div>
                                      </td>

                                      {/* Book Time / Pay Basis */}
                                      <td className="py-3.5 px-5 text-center align-top font-mono font-semibold">
                                        {task.payBasis === 'hourly' ? (
                                          <span className="text-amber-450 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-amber-955/40 border border-amber-900/40 rounded inline-block mt-1">
                                            Hourly
                                          </span>
                                        ) : (
                                          <div className="flex flex-col items-center">
                                            <span className="text-zinc-200">
                                              {task.bookTime ?? task.bookHours ? `${task.bookTime ?? task.bookHours} hrs` : '0 hrs'}
                                            </span>
                                            <span className="text-[9px] text-zinc-500 uppercase tracking-wide">
                                              Book Time
                                            </span>
                                          </div>
                                        )}
                                      </td>

                                      {/* Status / Operator */}
                                      <td className="py-3.5 px-5 text-center align-top">
                                        <div className="flex flex-col items-center gap-1.5">
                                          <span className={cn(
                                            "text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border",
                                            task.status === 'Completed' && "bg-emerald-955/20 text-emerald-450 border-emerald-900/50",
                                            task.status === 'Ready for QC' && "bg-amber-955/20 text-amber-450 border-amber-900/50",
                                            task.status === 'In Progress' && "bg-blue-955/40 text-blue-450 border-blue-900/50 animate-pulse",
                                            task.status === 'Not Started' && "bg-zinc-800 text-zinc-450 border-zinc-700/50"
                                          )}>
                                            {task.status || 'Not Started'}
                                          </span>
                                          {task.status === 'In Progress' && task.clockedInOperatorName && (
                                            <span className="text-[10px] text-blue-400 font-semibold truncate max-w-[120px] bg-blue-955/20 px-1.5 py-0.5 rounded border border-blue-900/30">
                                              Active: {task.clockedInOperatorName}
                                            </span>
                                          )}
                                          {(task.status === 'Ready for QC' || task.status === 'Completed') && task.completedByOperatorName && (
                                            <span className="text-[10px] text-zinc-450 font-medium truncate max-w-[120px]">
                                              By: {task.completedByOperatorName}
                                            </span>
                                          )}
                                        </div>
                                      </td>

                                      {/* Actions */}
                                      <td className="py-3.5 px-5 text-right align-top">
                                        <div className="flex justify-end items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                          {/* Toggle Help Flag */}
                                          <button
                                            onClick={() => handleToggleHelpFlag(task)}
                                            className={cn(
                                              "p-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center justify-center shrink-0",
                                              task.helpRequested 
                                                ? "bg-rose-955 border-rose-800 text-rose-455 hover:bg-rose-900/40" 
                                                : "bg-zinc-950 border-zinc-850 hover:border-zinc-700 text-zinc-455 hover:text-zinc-200"
                                            )}
                                            title={task.helpRequested ? "Resolve Help Request" : "Request Help"}
                                          >
                                            <AlertCircle className="w-4 h-4" />
                                          </button>

                                          {/* Clock In / Out / Completed */}
                                          {task.status === 'Completed' ? (
                                            <span className="text-zinc-500 text-xs font-semibold px-2.5 py-1">Completed</span>
                                          ) : task.status === 'Ready for QC' ? (
                                            <span className="text-amber-400 text-xs font-bold px-2.5 py-1 bg-amber-955/20 border border-amber-900/30 rounded-lg flex items-center gap-1">
                                              <CheckSquare className="w-3.5 h-3.5" />
                                              Ready for QC
                                            </span>
                                          ) : (
                                            <>
                                              {isCurrentClocked ? (
                                                <>
                                                  <button
                                                    onClick={() => handlePauseTask(task)}
                                                    disabled={isClocking}
                                                    className="bg-blue-650 hover:bg-blue-600 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0"
                                                  >
                                                    Clock Out
                                                  </button>
                                                  <button
                                                    onClick={() => handleStartCompleteTask(task)}
                                                    disabled={isClocking}
                                                    className="bg-emerald-650 hover:bg-emerald-600 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1"
                                                  >
                                                    <Check className="w-3.5 h-3.5" />
                                                    Complete
                                                  </button>
                                                </>
                                              ) : (
                                                <>
                                                  <button
                                                    onClick={() => handleStartTask(task)}
                                                    disabled={isClocking || isOtherClocked || !activeSessionId}
                                                    className={cn(
                                                      "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0",
                                                      (isOtherClocked || isClocking)
                                                        ? "bg-zinc-900 text-zinc-655 border border-zinc-850 cursor-not-allowed" 
                                                        : !activeSessionId
                                                          ? "bg-zinc-900 text-zinc-600 border border-zinc-850 cursor-not-allowed"
                                                          : "bg-zinc-950 border border-zinc-850 hover:border-zinc-700 text-zinc-200 hover:text-white hover:bg-zinc-900"
                                                    )}
                                                    title={isOtherClocked ? "Another operator is active on this task" : !activeSessionId ? "Must clock into general shift first" : "Clock into Task"}
                                                  >
                                                    Clock In
                                                  </button>
                                                  <button
                                                    onClick={() => handleStartCompleteTask(task)}
                                                    disabled={isClocking}
                                                    className="bg-emerald-950/40 border border-emerald-900/50 hover:bg-emerald-900/40 text-emerald-400 hover:text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1"
                                                    title="Mark completed directly (QC Verification)"
                                                  >
                                                    <Check className="w-3.5 h-3.5" />
                                                    Complete
                                                  </button>
                                                </>
                                              )}
                                            </>
                                          )}

                                          {/* Request Parts for this Task */}
                                          <button
                                            onClick={() => {
                                              setActiveTaskForParts(task);
                                              setNewPartName('');
                                              setNewPartQty(1);
                                            }}
                                            className="bg-zinc-950 border border-zinc-850 hover:border-zinc-700 hover:bg-zinc-900/40 text-zinc-455 hover:text-zinc-250 p-1.5 rounded-lg text-xs transition-all flex items-center justify-center shrink-0"
                                            title="Request Parts for this Task"
                                          >
                                            <Plus className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>

                                    {/* Expanded Details Row */}
                                    {isExpanded && (
                                      <tr className="bg-zinc-900/20 border-b border-zinc-850 animate-in fade-in duration-200">
                                        <td colSpan={6} className="py-4 px-6">
                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                                            {/* Left Column: Description & Metadata */}
                                            <div className="space-y-4">
                                              <div>
                                                <h4 className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] mb-1">Full Description</h4>
                                                <p className="text-zinc-200 bg-zinc-950/50 p-3 rounded-xl border border-zinc-850 leading-relaxed whitespace-pre-line">
                                                  {task.description || 'No description was provided for this task.'}
                                                </p>
                                              </div>
                                              
                                              {task.status === 'Completed' && (
                                                <div className="bg-emerald-955/10 border border-emerald-900/30 rounded-xl p-3 space-y-2">
                                                  <div className="text-[10px] uppercase font-bold text-emerald-450">Completion Proof</div>
                                                  {task.completedNotes && (
                                                    <p className="text-zinc-350 italic">"{task.completedNotes}"</p>
                                                  )}
                                                  <div className="text-[10px] text-zinc-500">
                                                    Completed by: <span className="font-semibold text-zinc-300">{task.completedByOperatorName || 'Technician'}</span>
                                                  </div>
                                                  {task.completedPhotoUrl && (
                                                    <a 
                                                      href={task.completedPhotoUrl} 
                                                      target="_blank" 
                                                      rel="noopener noreferrer" 
                                                      className="block relative w-32 h-24 rounded-lg overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-all cursor-pointer group"
                                                    >
                                                      <img src={task.completedPhotoUrl} alt="Proof of work" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-all">
                                                        View Full Photo
                                                      </div>
                                                    </a>
                                                  )}
                                                </div>
                                              )}
                                            </div>

                                            {/* Middle Column: Times In & Out */}
                                            <div className="space-y-3">
                                              <h4 className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5 text-indigo-405" />
                                                Timeclock Sessions
                                              </h4>
                                              <div className="bg-zinc-950/50 border border-zinc-850 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                                                {getTaskTimeSegments(task.id).length === 0 ? (
                                                  <p className="p-4 text-center text-zinc-600 italic">No timeclock logs recorded.</p>
                                                ) : (
                                                  <table className="w-full text-left text-[11px] border-collapse">
                                                    <thead>
                                                      <tr className="border-b border-zinc-850 bg-zinc-950 text-zinc-500 font-semibold uppercase text-[9px]">
                                                        <th className="py-2 px-3">Operator</th>
                                                        <th className="py-2 px-3">Clock In / Out</th>
                                                        <th className="py-2 px-3 text-right">Duration</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-zinc-850 text-zinc-350">
                                                      {getTaskTimeSegments(task.id).map((seg, sIdx) => (
                                                        <tr key={sIdx} className="hover:bg-zinc-900/30">
                                                          <td className="py-2 px-3 font-semibold text-zinc-200">{seg.staffName}</td>
                                                          <td className="py-2 px-3 font-mono">
                                                            <div className="text-zinc-350">
                                                              In: {seg.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                            <div className="text-zinc-500 text-[10px]">
                                                              Out: {seg.end ? seg.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (
                                                                <span className="text-emerald-450 animate-pulse font-bold">Active Now</span>
                                                              )}
                                                            </div>
                                                          </td>
                                                          <td className="py-2 px-3 text-right font-mono font-semibold text-zinc-405">
                                                            {seg.durationMs ? formatDuration(seg.durationMs) : '--'}
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                )}
                                              </div>
                                            </div>

                                            {/* Right Column: Related Parts Requests */}
                                            <div className="space-y-3">
                                              <h4 className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                                                <Package className="w-3.5 h-3.5 text-amber-500" />
                                                Parts Requests for Task
                                              </h4>
                                              <div className="bg-zinc-950/50 border border-zinc-850 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                                                {getTaskParts(task.id).length === 0 ? (
                                                  <p className="p-4 text-center text-zinc-600 italic">No parts requested for this task.</p>
                                                ) : (
                                                  <table className="w-full text-left text-[11px] border-collapse">
                                                    <thead>
                                                      <tr className="border-b border-zinc-850 bg-zinc-950 text-zinc-500 font-semibold uppercase text-[9px]">
                                                        <th className="py-2 px-3">Part Name</th>
                                                        <th className="py-2 px-3 text-center">Qty</th>
                                                        <th className="py-2 px-3 text-right">Status</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-zinc-850 text-zinc-350">
                                                      {getTaskParts(task.id).map((part, pIdx) => (
                                                        <tr key={pIdx} className="hover:bg-zinc-900/30">
                                                          <td className="py-2 px-3 font-semibold text-zinc-200">{part.partName}</td>
                                                          <td className="py-2 px-3 text-center font-mono">{part.quantity}</td>
                                                          <td className="py-2 px-3 text-right">
                                                            <span className={cn(
                                                              "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border",
                                                              part.status === 'received' && "bg-emerald-950/40 text-emerald-450 border-emerald-900/30",
                                                              part.status === 'ordered' && "bg-blue-955/40 text-blue-450 border-blue-900/30",
                                                              part.status === 'pending' && "bg-zinc-800 text-zinc-450 border-zinc-700/30"
                                                            )}>
                                                              {part.status}
                                                            </span>
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  )}

                  {/* 2. Labor Only Tab */}
                  {activeTab === 'labor' && (
                    laborLines.length === 0 ? (
                      <EmptyState message="No synced QuickBooks labor line items found for this Job." icon={Wrench} />
                    ) : (
                      <div className="space-y-6 animate-in fade-in duration-200">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col shadow-sm">
                            <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1">Total Estimated Labor</span>
                            <span className="text-xl font-bold text-indigo-400">{formatCurrency(laborSummary.totalEstAmount)}</span>
                          </div>
                          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col shadow-sm">
                            <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1">Total Invoiced Labor</span>
                            <span className="text-xl font-bold text-emerald-450">{formatCurrency(laborSummary.totalInvAmount)}</span>
                          </div>
                          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col shadow-sm">
                            <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1">Estimated Labor Hours</span>
                            <span className="text-xl font-bold text-amber-450">{laborSummary.totalHours.toLocaleString()} hrs</span>
                          </div>
                        </div>

                        {/* Labor Table */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-zinc-850 bg-zinc-955 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                                  <th className="py-2.5 px-5">Source Transaction</th>
                                  <th className="py-2.5 px-5">Item / Service Name</th>
                                  <th className="py-2.5 px-5">Description</th>
                                  <th className="py-2.5 px-5 text-center w-20">Qty / Hrs</th>
                                  <th className="py-2.5 px-5 text-right w-28">Rate</th>
                                  <th className="py-2.5 px-5 text-right w-32">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-850 text-zinc-300">
                                {laborLines.map((line, idx) => (
                                  <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                                    <td className="py-3.5 px-5 text-zinc-350 align-top font-semibold">
                                      <span className="bg-zinc-850 text-zinc-400 px-2 py-0.5 rounded text-[10px] font-mono mr-1.5 uppercase">
                                        {line.txnType}
                                      </span>
                                      {line.refNumber}
                                    </td>
                                    <td className="py-3.5 px-5 font-semibold text-zinc-150 align-top">
                                      <div className="flex items-center gap-1.5">
                                        <Wrench className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                        <span className="truncate max-w-[180px]">{line.item}</span>
                                      </div>
                                    </td>
                                    <td className="py-3.5 px-5 text-zinc-400 whitespace-pre-line max-w-sm align-top leading-relaxed">
                                      {line.description}
                                    </td>
                                    <td className="py-3.5 px-5 text-center text-zinc-300 align-top font-mono">
                                      {line.qty}
                                    </td>
                                    <td className="py-3.5 px-5 text-right text-zinc-300 align-top font-mono">
                                      {formatCurrency(line.rate)}
                                    </td>
                                    <td className="py-3.5 px-5 text-right font-bold text-zinc-100 align-top font-mono">
                                      {formatCurrency(line.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )
                  )}

                  {/* 3. Parts Tracker Tab (Combines Local Requests & QB Tracker!) */}
                  {activeTab === 'partsTracker' && (
                    <div className="space-y-8 animate-in fade-in duration-200">
                      {/* Local Parts Requests Section */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-base text-zinc-100 flex items-center gap-2">
                            <Wrench className="w-5 h-5 text-amber-500" />
                            Local Parts Requested (Technician Workspace)
                          </h3>
                          <span className="text-xs text-zinc-500 font-medium font-mono">
                            {nativeParts.length} Requests
                          </span>
                        </div>

                        {nativeParts.length === 0 ? (
                          <div className="p-5 text-center text-xs text-zinc-550 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/20">
                            No technician parts requests submitted yet. Use "Request Parts" from a task.
                          </div>
                        ) : (
                          <div className="space-y-6">
                            {/* KPI Metrics */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col shadow-sm border-l-4 border-l-rose-500">
                                <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1">Needs Ordering</span>
                                <span className="text-xl font-bold text-rose-450">{nativePartsGrouped.needingOrder.length} Items</span>
                              </div>
                              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col shadow-sm border-l-4 border-l-blue-500">
                                <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1">Ordered / On the Way</span>
                                <span className="text-xl font-bold text-blue-450">{nativePartsGrouped.ordered.length} Items</span>
                              </div>
                              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col shadow-sm border-l-4 border-l-emerald-500">
                                <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1">With Vehicle / Received</span>
                                <span className="text-xl font-bold text-emerald-450">{nativePartsGrouped.withVehicle.length} Items</span>
                              </div>
                            </div>
                            
                            {nativePartsGrouped.needingOrder.length > 0 && (
                              <PartsTableSection 
                                title="1. Needs to be Ordered (Pending)"
                                titleColor="text-rose-400"
                                parts={nativePartsGrouped.needingOrder}
                                statusBadgeClass="bg-rose-955/40 text-rose-455 border border-rose-900/50"
                                onCycleStatus={handleCyclePartStatus}
                                inventory={inventory}
                              />
                            )}
                            {nativePartsGrouped.ordered.length > 0 && (
                              <PartsTableSection 
                                title="2. Ordered & On the Way"
                                titleColor="text-blue-400"
                                parts={nativePartsGrouped.ordered}
                                statusBadgeClass="bg-blue-955/40 text-blue-450 border border-blue-900/50"
                                onCycleStatus={handleCyclePartStatus}
                                inventory={inventory}
                              />
                            )}
                            {nativePartsGrouped.withVehicle.length > 0 && (
                              <PartsTableSection 
                                title="3. With the Vehicle / Received"
                                titleColor="text-emerald-400"
                                parts={nativePartsGrouped.withVehicle}
                                statusBadgeClass="bg-emerald-955/40 text-emerald-450 border border-emerald-900/50"
                                onCycleStatus={handleCyclePartStatus}
                                inventory={inventory}
                              />
                            )}
                            {nativePartsGrouped.other.length > 0 && (
                              <PartsTableSection 
                                title="Other / Archived Requests"
                                titleColor="text-zinc-400"
                                parts={nativePartsGrouped.other}
                                statusBadgeClass="bg-zinc-800 text-zinc-450 border border-zinc-700/50"
                                onCycleStatus={handleCyclePartStatus}
                                inventory={inventory}
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {/* QuickBooks Synced Parts Tracker Section */}
                      <div className="space-y-4 pt-6 border-t border-zinc-800">
                        <h3 className="font-bold text-base text-zinc-100 flex items-center gap-2">
                          <Package className="w-5 h-5 text-indigo-400" />
                          QuickBooks Synced Parts Comparison
                        </h3>
                        {qbPartsTracker.length === 0 ? (
                          <div className="p-5 text-center text-xs text-zinc-550 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/20">
                            No synced QuickBooks estimate parts found.
                          </div>
                        ) : (
                          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-zinc-850 bg-zinc-950 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                                    <th className="py-2.5 px-5">Part / Item Name</th>
                                    <th className="py-2.5 px-5">Description</th>
                                    <th className="py-2.5 px-5 text-center w-24">Needed (Est)</th>
                                    <th className="py-2.5 px-5 text-center w-24">Ordered (PO)</th>
                                    <th className="py-2.5 px-5 text-center w-24">Received</th>
                                    <th className="py-2.5 px-5 text-right w-28">Status / Missing</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-850 text-zinc-300">
                                  {qbPartsTracker.map((item, idx) => {
                                    const isFullyReceived = item.received >= item.needed && item.needed > 0;
                                    const isOnTheWay = item.ordered > item.received;
                                    const needsOrdering = item.missing > 0;

                                    return (
                                      <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                                        <td className="py-3.5 px-5 font-semibold text-zinc-150 align-top">
                                          {item.itemName}
                                        </td>
                                        <td className="py-3.5 px-5 text-zinc-400 whitespace-pre-line max-w-sm align-top leading-relaxed">
                                          {item.desc}
                                        </td>
                                        <td className="py-3.5 px-5 text-center font-mono align-top text-zinc-250 font-semibold">
                                          {item.needed}
                                        </td>
                                        <td className="py-3.5 px-5 text-center font-mono align-top text-zinc-355">
                                          {item.ordered}
                                        </td>
                                        <td className="py-3.5 px-5 text-center font-mono align-top text-emerald-450">
                                          {item.received}
                                        </td>
                                        <td className="py-3.5 px-5 text-right align-top">
                                          <div className="flex flex-col items-end gap-1">
                                            {isFullyReceived ? (
                                              <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-emerald-950/40 text-emerald-450 border border-emerald-900/50">
                                                Fully Received
                                              </span>
                                            ) : isOnTheWay ? (
                                              <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-blue-955/40 text-blue-450 border border-blue-900/50">
                                                On The Way ({item.ordered - item.received} more)
                                              </span>
                                            ) : needsOrdering ? (
                                              <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-rose-955/40 text-rose-450 border border-rose-900/50">
                                                Needs Ordering ({item.missing} missing)
                                              </span>
                                            ) : (
                                              <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-zinc-800 text-zinc-450 border border-zinc-700/50">
                                                Stock Check
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 3.5. CompanyCam Gallery Tab */}
                  {activeTab === 'companycam' && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-lg space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-850 pb-3">
                          <div>
                            <h3 className="font-bold text-zinc-200 text-base flex items-center gap-2">
                              <Camera className="w-5 h-5 text-pink-500" />
                              CompanyCam Media Gallery
                            </h3>
                            <p className="text-xs text-zinc-500 mt-0.5 font-medium">Real-time photos from the linked project</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleConnectCompanyCam}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all border border-zinc-750"
                            >
                              <Camera className="w-3.5 h-3.5 text-pink-500" />
                              <span>Connect Account</span>
                            </button>
                            {(selectedJob.companyCamId || selectedJob.companyCamProjectId) && (
                              <a
                                href={`https://app.companycam.com/projects/${selectedJob.companyCamId || selectedJob.companyCamProjectId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-650 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all"
                              >
                                <span>Open in CompanyCam</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>

                        {selectedJob.companyCamId || selectedJob.companyCamProjectId ? (
                          <>
                            {isLoadingPhotos ? (
                              <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-550">
                                <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs font-bold uppercase tracking-wider">Retrieving project photos...</span>
                              </div>
                            ) : photosError ? (
                              <div className="flex flex-col items-center justify-center py-12 gap-3 text-rose-500">
                                <AlertCircle className="w-8 h-8" />
                                <div className="text-center">
                                  <span className="text-sm font-bold block">Failed to load CompanyCam photos</span>
                                  <span className="text-xs opacity-75 block mt-0.5">{photosError}</span>
                                </div>
                                <button
                                  onClick={handleConnectCompanyCam}
                                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-705 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 mt-1"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  <span>Connect your CompanyCam Account</span>
                                </button>
                              </div>
                            ) : ccPhotos.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-20 gap-2 text-zinc-550 border border-dashed border-zinc-800 rounded-2xl">
                                <Camera className="w-10 h-10 opacity-30 text-pink-500" />
                                <span className="text-sm font-semibold">No photos uploaded to this project yet.</span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {ccPhotos.map((photo, index) => {
                                  const imgUrl = photo.uris?.[0]?.uri || '';
                                  const dateStr = photo.captured_at 
                                    ? new Date(photo.captured_at * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                    : 'Unknown Date';
                                    
                                  return (
                                    <div 
                                      key={photo.id || index}
                                      onClick={() => setSelectedPhotoIndex(index)}
                                      className="relative aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer shadow-md border border-zinc-800 group/item transition-all duration-300 hover:scale-[1.02] hover:border-zinc-700"
                                    >
                                      <img 
                                        src={imgUrl} 
                                        alt={`CompanyCam photo by ${photo.creator_name || 'Technician'}`}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover/item:scale-105"
                                        loading="lazy"
                                      />
                                      
                                      <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/90 via-black/40 to-transparent text-white flex flex-col justify-end opacity-90 group-hover/item:opacity-100">
                                        <span className="text-[10px] font-bold text-pink-400 truncate uppercase tracking-wider">{photo.creator_name || 'Technician'}</span>
                                        <span className="text-[11px] font-medium mt-0.5 truncate text-zinc-300">{dateStr}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div className="flex justify-between items-center text-xs text-zinc-500 border-t border-zinc-850 pt-4 mt-4 font-sans">
                              <span>Linked Project ID: <strong className="font-mono text-zinc-400">{selectedJob.companyCamId || selectedJob.companyCamProjectId}</strong></span>
                              <button
                                onClick={handleUnlinkCompanyCamProject}
                                disabled={isSavingCcLink}
                                className="text-red-400 hover:text-red-300 font-bold uppercase tracking-wider text-[10px]"
                              >
                                Unlink Project
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="bg-zinc-950/40 p-8 rounded-xl border border-zinc-850/80 flex flex-col items-center text-center gap-4 py-16">
                            <Camera className="w-12 h-12 text-pink-500 opacity-40 animate-pulse" />
                            <div>
                              <h4 className="text-base font-bold text-zinc-300">No CompanyCam project linked.</h4>
                              <p className="text-xs text-zinc-550 mt-1 max-w-md">Paste a CompanyCam project link or project ID below to sync and view real-time site photos, proof attachments, and operator updates.</p>
                            </div>
                            <div className="flex items-center gap-2 w-full max-w-md mt-2">
                              <input
                                type="text"
                                placeholder="Paste CompanyCam URL or Project ID..."
                                value={ccLinkInput}
                                onChange={(e) => setCcLinkInput(e.target.value)}
                                className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-pink-505 placeholder-zinc-600 flex-1 min-w-0"
                              />
                              <button
                                onClick={() => {
                                  handleLinkCompanyCamProject(ccLinkInput);
                                  setCcLinkInput('');
                                }}
                                disabled={isSavingCcLink}
                                className="bg-pink-650 hover:bg-pink-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shrink-0 whitespace-nowrap"
                              >
                                {isSavingCcLink ? 'Linking...' : 'Link Project'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 4. QB Estimates Tab */}
                  {activeTab === 'estimates' && (
                    estimates.length === 0 ? (
                      <EmptyState message="No synced Estimates found for this Job." icon={Layers} />
                    ) : (
                      estimates.map((est) => (
                        <TransactionCard 
                          key={est.id}
                          title={`Estimate #${est.refNumber || 'Draft'}`}
                          date={est.txnDate}
                          amount={est.subtotal}
                          status={est.isClosed ? 'Closed' : 'Active'}
                          statusType={est.isClosed ? 'info' : 'success'}
                          lines={getLineItems(est, 'estimate')}
                          formatCurrency={formatCurrency}
                        />
                      ))
                    )
                  )}

                  {/* 5. QB Invoices Tab */}
                  {activeTab === 'invoices' && (
                    invoices.length === 0 ? (
                      <EmptyState message="No synced Invoices found for this Job." icon={FileText} />
                    ) : (
                      invoices.map((inv) => (
                        <TransactionCard 
                          key={inv.id}
                          title={`Invoice #${inv.refNumber || 'Draft'}`}
                          date={inv.txnDate}
                          amount={inv.subtotal}
                          status={inv.isPaid ? 'Paid' : `Balance Remaining: ${formatCurrency(inv.balanceRemaining)}`}
                          statusType={inv.isPaid ? 'success' : 'error'}
                          lines={getLineItems(inv, 'invoice')}
                          formatCurrency={formatCurrency}
                        />
                      ))
                    )
                  )}

                  {/* 6. QB Purchase Orders Tab */}
                  {activeTab === 'purchaseOrders' && (
                    purchaseOrders.length === 0 ? (
                      <EmptyState message="No synced Purchase Orders found for this Job." icon={ShoppingCart} />
                    ) : (
                      purchaseOrders.map((po) => (
                        <TransactionCard 
                          key={po.id}
                          title={`Purchase Order #${po.refNumber || 'Draft'}`}
                          date={po.txnDate}
                          amount={po.totalAmount}
                          status={po.isFullyReceived ? 'Fully Received' : 'Pending/Partial'}
                          statusType={po.isFullyReceived ? 'success' : 'warning'}
                          lines={getLineItems(po, 'purchaseOrder')}
                          formatCurrency={formatCurrency}
                          extraDetails={
                            <p className="text-xs text-zinc-400 mt-1">
                              Vendor: <span className="text-zinc-200 font-medium">{po.vendorName || 'N/A'}</span>
                            </p>
                          }
                        />
                      ))
                    )
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-zinc-500">
            <Briefcase className="w-12 h-12 text-zinc-650 mb-3" />
            <p className="text-sm">Select a job from the sidebar to inspect details.</p>
          </div>
        )}
      {/* 1. Task Completion Modal */}
      {activeTaskForCompletion && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-500" />
                Complete Task
              </h3>
              <p className="text-xs text-zinc-400 mt-1">"{activeTaskForCompletion.name}"</p>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Completion Notes</label>
                <textarea
                  placeholder="Enter any notes, issues, or details about the work done..."
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  className="w-full h-24 bg-zinc-950 border border-zinc-805 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder-zinc-650 resize-none text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Upload Photo (Optional)</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-955 border border-zinc-805 hover:bg-zinc-900/60 cursor-pointer text-xs font-semibold text-zinc-300 hover:text-white transition-all">
                    <Camera className="w-4 h-4 text-emerald-455" />
                    <span>Choose Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setCompletionPhoto(file);
                          setCompletionPhotoPreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                  </label>
                  {completionPhotoPreview && (
                    <div className="relative w-16 h-12 rounded overflow-hidden border border-zinc-800">
                      <img src={completionPhotoPreview} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setActiveTaskForCompletion(null)}
                disabled={isCompletingTask}
                className="px-4 py-2 text-xs font-bold text-zinc-450 hover:text-zinc-205 hover:bg-zinc-800/40 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCompleteTask}
                disabled={isCompletingTask}
                className="bg-emerald-650 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
              >
                {isCompletingTask ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Complete Task
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Request Parts Modal */}
      {activeTaskForParts && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" />
                Request Parts
              </h3>
              <p className="text-xs text-zinc-400 mt-1">Requesting parts for task: "{activeTaskForParts.name}"</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Part Name / Description</label>
                <input
                  type="text"
                  placeholder="e.g. 100W Siren Speaker, Fascua Light Bracket..."
                  value={newPartName}
                  onChange={(e) => setNewPartName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-805 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-zinc-650 text-zinc-200"
                />
                
                {/* Autocomplete Suggestions */}
                {matchedInventoryItems.length > 0 && (
                  <div className="mt-1.5 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-850 shadow-2xl animate-in slide-in-from-top-1 duration-150">
                    {matchedInventoryItems.map((item: any) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setNewPartName(item.name);
                          setNewPartNumber(item.sku || '');
                          setNewPartBin(item.binLocation || item.bin || '');
                        }}
                        className="w-full text-left p-3 text-xs hover:bg-indigo-950/20 transition-colors flex justify-between items-center"
                      >
                        <div>
                          <p className="font-semibold text-zinc-200">{item.name}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">SKU: {item.sku || 'N/A'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-zinc-300 font-bold font-mono">{item.quantityOnHand ?? 0} in stock</p>
                          <p className="text-[9px] text-zinc-500 font-medium">Bin: {item.binLocation || item.bin || 'N/A'}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Part Number / SKU</label>
                  <input
                    type="text"
                    placeholder="e.g. SKU-12345"
                    value={newPartNumber}
                    onChange={(e) => setNewPartNumber(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-805 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-zinc-200 font-mono placeholder-zinc-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Storage Bin</label>
                  <input
                    type="text"
                    placeholder="e.g. Bin C5, Aisle 3"
                    value={newPartBin}
                    onChange={(e) => setNewPartBin(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-805 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-zinc-200 placeholder-zinc-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Quantity Needed</label>
                <input
                  type="number"
                  min={1}
                  value={newPartQty}
                  onChange={(e) => setNewPartQty(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-zinc-950 border border-zinc-805 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-zinc-200 font-mono"
                />
              </div>

              {/* Work Order Warning/Status Banner */}
              {workOrderPartStatus && (
                <div className={cn(
                  "p-3.5 rounded-2xl border flex gap-3 text-xs leading-relaxed animate-in fade-in duration-200",
                  workOrderPartStatus.status === 'received'
                    ? "bg-rose-955/20 border-rose-900/40 text-rose-300"
                    : "bg-indigo-955/20 border-indigo-900/40 text-indigo-300"
                )}>
                  <Info className={cn("w-5 h-5 shrink-0 mt-0.5", workOrderPartStatus.status === 'received' ? "text-rose-450 animate-bounce" : "text-indigo-400")} />
                  <div>
                    <p className="font-bold uppercase tracking-wider text-[10px]">
                      {workOrderPartStatus.status === 'received' ? '⚠️ Already with Vehicle' : 'ℹ️ Already Ordered'}
                    </p>
                    <p className="mt-1">
                      This item matches a part on the <strong>{workOrderPartStatus.source}</strong> that has been{' '}
                      {workOrderPartStatus.status === 'received' ? 'received / delivered' : 'ordered'}{' '}
                      (Qty: {workOrderPartStatus.received} of {workOrderPartStatus.needed}).
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setActiveTaskForParts(null)}
                disabled={isAddingPart}
                className="px-4 py-2 text-xs font-bold text-zinc-450 hover:text-zinc-205 hover:bg-zinc-800/40 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestPartFromTask}
                disabled={isAddingPart || !newPartName.trim()}
                className="bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
              >
                {isAddingPart ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Submit Request
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Add Task Modal */}
      {isAddTaskOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" />
                Add New Task
              </h3>
              <p className="text-xs text-zinc-400 mt-1">Create a local native task for this job</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Task Title / Name</label>
                <input
                  type="text"
                  placeholder="e.g. Install Front Visor Lightbar..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-805 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-505 placeholder-zinc-650 text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  placeholder="Describe the specific steps, components, or wiring details..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full h-20 bg-zinc-955 border border-zinc-805 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-505 placeholder-zinc-655 resize-none text-zinc-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Pay Basis</label>
                  <select
                    value={newTaskPayBasis}
                    onChange={(e: any) => setNewTaskPayBasis(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-805 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-505 text-zinc-300"
                  >
                    <option value="book_time">Book Time</option>
                    <option value="hourly">Hourly</option>
                  </select>
                </div>

                {newTaskPayBasis === 'book_time' && (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Book Time Hours</label>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      value={newTaskBookTime}
                      onChange={(e) => setNewTaskBookTime(Math.max(0, Number(e.target.value)))}
                      className="w-full bg-zinc-950 border border-zinc-805 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-505 text-zinc-200 font-mono"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsAddTaskOpen(false)}
                disabled={isAddingTask}
                className="px-4 py-2 text-xs font-bold text-zinc-450 hover:text-zinc-205 hover:bg-zinc-800/40 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTask}
                disabled={isAddingTask || !newTaskTitle.trim()}
                className="bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
              >
                {isAddingTask ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Create Task
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Add Job Modal */}
      {isAddJobOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-400" />
                Add New Job Manually
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Create a native job record. If matched during a QuickBooks sync, it will automatically link and pull records.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 font-sans">Job Title / Name</label>
                <input
                  type="text"
                  placeholder="e.g. Police Utility, 12345, or John Doe Build..."
                  value={newJobTitle}
                  onChange={(e) => setNewJobTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-805 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-505 placeholder-zinc-650 text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 font-sans">Job Number (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 12345"
                  value={newJobNumber}
                  onChange={(e) => setNewJobNumber(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-805 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-505 placeholder-zinc-650 text-zinc-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 font-sans">Customer Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Los Angeles PD, City of Colton..."
                  value={newJobCustomerName}
                  onChange={(e) => setNewJobCustomerName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-805 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-505 placeholder-zinc-650 text-zinc-200"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsAddJobOpen(false)}
                disabled={isAddingJob}
                className="px-4 py-2 text-xs font-bold text-zinc-450 hover:text-zinc-205 hover:bg-zinc-800/40 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddJob}
                disabled={isAddingJob || !newJobTitle.trim()}
                className="bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
              >
                {isAddingJob ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Create Job
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 4. QC Rejection Modal */}
      {activeTaskForRejection && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="font-bold text-lg text-rose-450 flex items-center gap-2">
                <XCircle className="w-5 h-5 animate-pulse" />
                Reject QC Sign-off
              </h3>
              <p className="text-xs text-zinc-400 mt-1">Specify why this task is being rejected and returned to the worksheet.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Rejection Reason</label>
                <textarea
                  placeholder="Explain what needs to be fixed or adjusted..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500 placeholder-zinc-700 text-zinc-250 min-h-[100px]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setActiveTaskForRejection(null);
                  setRejectionReason('');
                }}
                className="bg-zinc-950 border border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!rejectionReason.trim()) {
                    toast.error('Rejection reason is required.');
                    return;
                  }
                  handleRejectQC(activeTaskForRejection, rejectionReason.trim());
                  setActiveTaskForRejection(null);
                  setRejectionReason('');
                }}
                className="bg-rose-650 hover:bg-rose-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-rose-900/20"
              >
                Reject & Send Back
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 5. CompanyCam Lightbox Overlay */}
      {selectedPhotoIndex !== null && (
        createPortal(
          <div 
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSelectedPhotoIndex(null);
              if (e.key === 'ArrowLeft') {
                setSelectedPhotoIndex(prev => prev !== null ? (prev > 0 ? prev - 1 : ccPhotos.length - 1) : null);
              }
              if (e.key === 'ArrowRight') {
                setSelectedPhotoIndex(prev => prev !== null ? (prev < ccPhotos.length - 1 ? prev + 1 : 0) : null);
              }
            }}
            tabIndex={0}
            ref={(el) => el?.focus()}
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent text-white z-10">
              <div>
                <h4 className="font-bold text-sm text-white">
                  Photo {selectedPhotoIndex + 1} of {ccPhotos.length}
                </h4>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5 font-mono">
                  Project: {selectedJob.title}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={ccPhotos[selectedPhotoIndex]?.uris?.[0]?.uri || ''}
                  download={`cc_photo_${selectedPhotoIndex}.jpg`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white"
                  title="Open Original Image"
                >
                  <Download className="w-5 h-5" />
                </a>
                
                <button
                  onClick={() => setSelectedPhotoIndex(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Main Image */}
            <div className="relative flex-1 flex items-center justify-center p-4">
              {/* Prev Button */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPhotoIndex(prev => prev !== null ? (prev > 0 ? prev - 1 : ccPhotos.length - 1) : null);
                }}
                className="absolute left-4 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all border border-white/10"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <img 
                src={ccPhotos[selectedPhotoIndex]?.uris?.[0]?.uri || ''} 
                alt="CompanyCam Detail View" 
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl select-none"
              />

              {/* Next Button */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPhotoIndex(prev => prev !== null ? (prev < ccPhotos.length - 1 ? prev + 1 : 0) : null);
                }}
                className="absolute right-4 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all border border-white/10"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {/* Bottom Bar Info */}
            <div className="p-4 bg-gradient-to-t from-black/80 to-transparent text-white text-center pb-6 z-10">
              <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Uploaded By</p>
              <h5 className="font-bold text-sm text-pink-400 mt-0.5">
                {ccPhotos[selectedPhotoIndex]?.creator_name || 'Technician'}
              </h5>
              <p className="text-[11px] text-zinc-400 font-semibold mt-1">
                {ccPhotos[selectedPhotoIndex]?.captured_at 
                  ? new Date(ccPhotos[selectedPhotoIndex].captured_at * 1000).toLocaleString() 
                  : 'Unknown Date'}
              </p>
            </div>
          </div>,
          document.body
        )
      )}
      </div>
    </div>
  );
}

// Transaction Card component with line items table
function TransactionCard({ 
  title, 
  date, 
  amount, 
  status, 
  statusType, 
  lines, 
  formatCurrency,
  extraDetails 
}: { 
  title: string;
  date: string;
  amount: number;
  status: string;
  statusType: 'success' | 'warning' | 'error' | 'info';
  lines: any[];
  formatCurrency: (amount: any) => string;
  extraDetails?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg hover:border-zinc-700/60 transition-colors">
      {/* Top summary row */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/60 cursor-pointer select-none border-b border-zinc-850 hover:bg-zinc-900/80 transition-colors"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-base text-white">{title}</h3>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-semibold border",
              statusType === 'success' && "bg-emerald-950/40 text-emerald-450 border-emerald-900/50",
              statusType === 'warning' && "bg-amber-950/40 text-amber-450 border-amber-900/50",
              statusType === 'error' && "bg-rose-950/40 text-rose-450 border-rose-900/50",
              statusType === 'info' && "bg-blue-950/40 text-blue-450 border-blue-900/50"
            )}>
              {status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-400">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-zinc-550" />
              {date || 'No Date'}
            </span>
            <span className="text-zinc-650">•</span>
            <span className="flex items-center gap-1 font-semibold text-zinc-300">
              Total: {formatCurrency(amount)}
            </span>
            <span className="text-zinc-650">•</span>
            <span>{lines.length} Line Items</span>
          </div>
          {extraDetails}
        </div>

        <button 
          className="text-zinc-400 hover:text-white text-xs font-semibold shrink-0 border border-zinc-800 hover:border-zinc-700 bg-zinc-950 px-3 py-1.5 rounded-lg transition-all"
        >
          {isOpen ? 'Collapse Lines' : 'Expand Lines'}
        </button>
      </div>

      {/* Line Items Table */}
      {isOpen && (
        <div className="overflow-x-auto">
          {lines.length === 0 ? (
            <div className="p-5 text-center text-xs text-zinc-550 flex items-center justify-center gap-1.5">
              <Info className="w-4 h-4 text-zinc-600" /> No individual line items returned.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-850 bg-zinc-950 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-5">Item / Part</th>
                  <th className="py-2.5 px-5">Description</th>
                  <th className="py-2.5 px-5 text-center w-20">Qty</th>
                  <th className="py-2.5 px-5 text-right w-28">Rate</th>
                  <th className="py-2.5 px-5 text-right w-32">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850">
                {lines.map((line, idx) => {
                  const itemName = line.ItemRef?.FullName || 'Unknown Item';
                  const desc = line.Desc || line.Description || '';
                  const qty = line.Quantity ?? '';
                  const rate = line.Rate ?? line.Cost ?? '';
                  const amount = line.Amount ?? '';

                  return (
                    <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="py-3 px-5 font-semibold text-zinc-150 align-top">
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-zinc-550 shrink-0" />
                          <span className="truncate max-w-[180px]">{itemName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-5 text-zinc-400 whitespace-pre-line max-w-sm align-top leading-relaxed">
                        {desc}
                      </td>
                      <td className="py-3 px-5 text-center text-zinc-300 align-top font-mono">
                        {qty}
                      </td>
                      <td className="py-3 px-5 text-right text-zinc-300 align-top font-mono">
                        {rate !== '' ? formatCurrency(rate) : ''}
                      </td>
                      <td className="py-3 px-5 text-right font-bold text-zinc-100 align-top font-mono">
                        {amount !== '' ? formatCurrency(amount) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// Simple empty state helper
function EmptyState({ message, icon: Icon }: { message: string; icon: any }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 border border-dashed border-zinc-850 rounded-2xl bg-zinc-950/40">
      <Icon className="w-9 h-9 text-zinc-650 mb-2.5" />
      <p className="text-sm text-zinc-400">{message}</p>
    </div>
  );
}

// Grouped table section for Native parts requested
function PartsTableSection({ 
  title, 
  titleColor, 
  parts, 
  statusBadgeClass,
  onCycleStatus,
  inventory = []
}: { 
  title: string; 
  titleColor: string; 
  parts: any[]; 
  statusBadgeClass: string; 
  onCycleStatus?: (part: any) => void;
  inventory?: any[];
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-2xl overflow-hidden shadow-lg">
      <div className="p-4 border-b border-zinc-855 bg-zinc-900/40 flex justify-between items-center">
        <h4 className={cn("font-bold text-sm", titleColor)}>{title}</h4>
        <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono font-bold">
          {parts.length}
        </span>
      </div>
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-zinc-950">
        <table className="w-full text-left text-xs border-collapse min-w-[700px]">
          <thead>
            <tr className="border-b border-zinc-855 bg-zinc-950 text-zinc-400 font-semibold uppercase tracking-wider text-[9px]">
              <th className="py-2.5 px-5">Part Requested</th>
              <th className="py-2.5 px-5 w-24">SKU / Number</th>
              <th className="py-2.5 px-5 text-center w-24">In Stock</th>
              <th className="py-2.5 px-5 text-center w-28">Storage Bin</th>
              <th className="py-2.5 px-5">Related Task</th>
              <th className="py-2.5 px-5">Requested By</th>
              <th className="py-2.5 px-5 text-center w-12">Qty</th>
              <th className="py-2.5 px-5 text-center w-28">Status</th>
              <th className="py-2.5 px-5 text-right w-24">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-850 text-zinc-300">
            {parts.map((part) => {
              // Find matching inventory item by part number (SKU) or name
              const invMatch = inventory.find((inv: any) => 
                (part.partNumber && inv.sku?.toLowerCase() === part.partNumber.toLowerCase()) ||
                (inv.name.toLowerCase() === part.partName.toLowerCase())
              );
              const sku = part.partNumber || invMatch?.sku || '';
              const inStock = invMatch?.quantityOnHand ?? null;
              const bin = part.bin || invMatch?.binLocation || invMatch?.bin || '';
              const isWithVehicle = part.status === 'received' || part.status === 'delivered' || part.status === 'with_vehicle';

              return (
                <tr key={part.id} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="py-3 px-5 font-semibold text-zinc-150 align-middle">
                    <div className="flex items-center gap-2">
                      <Package className={cn("w-3.5 h-3.5 shrink-0", isWithVehicle ? "text-emerald-450" : "text-zinc-550")} />
                      <div className="flex flex-col">
                        <span>{part.partName}</span>
                        {isWithVehicle && (
                          <span className="text-[8px] text-emerald-400 font-bold uppercase tracking-wider mt-0.5">
                            ✓ With Vehicle
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-5 align-middle font-mono font-medium text-zinc-400">
                    {sku ? sku : <span className="text-zinc-650 italic">N/A</span>}
                  </td>
                  <td className="py-3 px-5 text-center align-middle font-mono font-bold">
                    {inStock !== null ? (
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px]",
                        inStock <= 0 
                          ? "bg-rose-955/20 text-rose-450 border border-rose-900/30" 
                          : "bg-emerald-955/20 text-emerald-450 border border-emerald-900/30"
                      )}>
                        {inStock} in stock
                      </span>
                    ) : (
                      <span className="text-zinc-650 italic">N/A</span>
                    )}
                  </td>
                  <td className="py-3 px-5 text-center align-middle font-semibold text-zinc-350">
                    {bin ? (
                      <span className="bg-zinc-850 px-2 py-0.5 rounded border border-zinc-800 text-[10px] text-indigo-300">
                        {bin}
                      </span>
                    ) : (
                      <span className="text-zinc-650 italic">N/A</span>
                    )}
                  </td>
                  <td className="py-3 px-5 text-zinc-450 align-middle truncate max-w-[120px]">
                    <span className="font-semibold text-zinc-300">{part.taskName || 'General'}</span>
                  </td>
                  <td className="py-3 px-5 text-zinc-400 align-middle">
                    <div className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                      <span className="truncate max-w-[100px]">{part.requestedBy}</span>
                    </div>
                  </td>
                  <td className="py-3 px-5 text-center text-zinc-300 align-middle font-mono font-bold">
                    {part.quantity}
                  </td>
                  <td className="py-3 px-5 text-center align-middle">
                    <button
                      onClick={() => onCycleStatus?.(part)}
                      disabled={!onCycleStatus}
                      className={cn(
                        "text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wide border inline-block transition-all",
                        statusBadgeClass,
                        onCycleStatus && "hover:opacity-80 active:scale-95 cursor-pointer"
                      )}
                      title={onCycleStatus ? "Click to cycle status" : undefined}
                    >
                      {part.status}
                    </button>
                  </td>
                  <td className="py-3 px-5 text-right text-zinc-400 align-middle font-mono">
                    {part.createdAt ? (
                      new Date(part.createdAt.seconds * 1000 || part.createdAt).toLocaleDateString()
                    ) : 'N/A'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
