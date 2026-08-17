import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ClipboardList, AlertTriangle, Package, Car, Camera, CheckCircle2, 
  Search, Clock, MapPin, Calendar, Save, ArrowRight,
  ExternalLink, CheckSquare, RefreshCw, Printer
} from 'lucide-react';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, 
  serverTimestamp, limit, getDoc 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth/store';
import { toast, Toaster } from 'sonner';
import { LogoQRCode } from '../../components/LogoQRCode';
import { createPortal } from 'react-dom';

interface ForemanTodoListProps {
  tenantId: string;
}

export function ForemanTodoList({ tenantId }: ForemanTodoListProps) {
  const navigate = useNavigate();
  const { permissions, isSuperAdmin } = useAuthStore();
  const canManage = isSuperAdmin || (permissions && (permissions['jobs.manage'] || permissions['foreman.view']));

  // Firebase states
  const [jobsList, setJobsList] = useState<any[]>([]);
  const [vehiclesList, setVehiclesList] = useState<any[]>([]);
  const [zonesList, setZonesList] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [tasksMap, setTasksMap] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  // UI/Interactive states
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'draft' | 'blockers' | 'vin' | 'cc' | 'qc' | 'parts' | 'duedate' | 'location' | 'traveler'>('all');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [printingJob, setPrintingJob] = useState<any | null>(null);
  const companyCamVal = printingJob ? (printingJob.companyCamId || printingJob.companyCamProjectId || '') : '';
  const [businessName, setBusinessName] = useState('UpFittersOS');
  const [businessLogo, setBusinessLogo] = useState<string | undefined>(undefined);

  /*
  const _activateDraftJob = async (jobId: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        status: 'Active',
        isDraft: false,
        needsAttention: false,
        updatedAt: serverTimestamp()
      });
      toast.success("Job activated and ready for shop floor!");
    } catch (e: any) {
      toast.error(`Failed to activate job: ${e.message}`);
    } finally {
      setIsUpdating(null);
    }
  };
  */

  // Local editing states for quick actions
  const [tempVin, setTempVin] = useState<Record<string, string>>({});
  const [tempCc, setTempCc] = useState<Record<string, string>>({});

  // 1. Subscribe to basic data collections
  useEffect(() => {
    if (!tenantId) return;

    const qJobs = query(
      collection(db, `businesses/${tenantId}/jobs`),
      where('status', 'not-in', ['Completed', 'Closed'])
    );
    const unsubJobs = onSnapshot(qJobs, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
                       .filter(j => {
                         if (j.isArchived) return false;
                         if (j.createdAt) {
                           const created = j.createdAt.toDate ? j.createdAt.toDate() : new Date(j.createdAt);
                           const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
                           if (!isNaN(created.getTime()) && created.getTime() < oneYearAgo) return false;
                         }
                         return true;
                       });
      setJobsList(list);
      setLoading(false);
    }, (err) => console.error("Jobs subscription error:", err));

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

  // 2. Subscribe to tasks for all active visible jobs
  const jobIds = useMemo(() => jobsList.map(j => j.id), [jobsList]);
  useEffect(() => {
    if (!tenantId || jobIds.length === 0) return;

    const unsubs = jobIds.map(jobId => {
      const q = query(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`));
      return onSnapshot(q, (snap) => {
        const jobTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setTasksMap(prev => ({
          ...prev,
          [jobId]: jobTasks
        }));
      });
    });

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [tenantId, jobIds]);

  // Fetch business details for report header
  useEffect(() => {
    if (!tenantId) return;
    const fetchBusiness = async () => {
      try {
        const snap = await getDoc(doc(db, 'businesses', tenantId));
        if (snap.exists()) {
          const data = snap.data();
          setBusinessName(data.name || 'UpFittersOS');
          setBusinessLogo(data.logoUrl || data.logo || undefined);
        }
      } catch (e) {
        console.warn("Failed to fetch business details", e);
      }
    };
    fetchBusiness();
  }, [tenantId]);

  // Handle printing traveler page manually from modal button
  const handlePrintJobCard = async () => {
    if (!printingJob) return;
    
    // Tiny delay to ensure DOM is ready for print
    setTimeout(async () => {
      window.print();
      try {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, printingJob.id), {
          travelerPrintedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        toast.success("Job Card marked as printed!");
      } catch (e: any) {
        console.warn("Failed to mark Job Card as printed", e);
      }
      setPrintingJob(null);
    }, 100);
  };

  // Quick Action handlers
  const saveVin = async (jobId: string) => {
    const val = tempVin[jobId];
    if (val === undefined || !canManage) return;
    setIsUpdating(jobId);
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        vehicleId: val.trim().toUpperCase(),
        updatedAt: serverTimestamp()
      });
      toast.success("VIN updated successfully");
      setTempVin(prev => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    } catch (e: any) {
      toast.error(`Failed to update VIN: ${e.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  const saveCompanyCam = async (jobId: string) => {
    const val = tempCc[jobId];
    if (val === undefined || !canManage) return;
    setIsUpdating(jobId);
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        companyCamId: val.trim(),
        updatedAt: serverTimestamp()
      });
      toast.success("CompanyCam ID updated successfully");
      setTempCc(prev => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    } catch (e: any) {
      toast.error(`Failed to update CompanyCam: ${e.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  const updateDueDate = async (jobId: string, dateStr: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      const finishDate = dateStr ? new Date(dateStr + 'T17:00:00') : null;
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        expectedFinishTime: finishDate ? serverTimestamp() : null, // Fallback to simpler timestamp if needed, but match worksheet
        updatedAt: serverTimestamp()
      });
      // Try setting expectedFinishTime properly as Date
      if (finishDate) {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
          expectedFinishTime: finishDate,
          updatedAt: serverTimestamp()
        });
      }
      toast.success("Due date updated");
    } catch (e: any) {
      toast.error(`Failed to update due date: ${e.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  const assignLocation = async (jobId: string, zoneId: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      const oldZone = zonesList.find(z => z.currentJobId === jobId);
      if (oldZone) {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, oldZone.id), {
          currentJobId: null,
          currentVehicleVin: null,
          updatedAt: serverTimestamp()
        });
      }

      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        bayId: zoneId === 'none' ? null : zoneId,
        updatedAt: serverTimestamp()
      });

      if (zoneId && zoneId !== 'none') {
        const target = zonesList.find(z => z.id === zoneId);
        const jobDoc = jobsList.find(j => j.id === jobId);
        if (target) {
          await updateDoc(doc(db, `businesses/${tenantId}/zones`, target.id), {
            currentJobId: jobId,
            currentVehicleVin: jobDoc?.vehicleId || null,
            lastAssignedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }
      toast.success("Location assigned");
    } catch (e: any) {
      toast.error(`Failed to assign location: ${e.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  const resolveBlockers = async (jobId: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      const job = jobsList.find(j => j.id === jobId);
      const cleared = (job?.blockers || []).map((b: any) => ({ 
        ...b, 
        status: 'cleared', 
        clearedAt: new Date().toISOString() 
      }));
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        blockers: cleared,
        status: 'Active',
        updatedAt: serverTimestamp()
      });
      toast.success("All blockers cleared");
    } catch (e: any) {
      toast.error("Failed to clear blockers");
    } finally {
      setIsUpdating(null);
    }
  };

  const markReadyForCustomer = async (jobId: string) => {
    if (!canManage) return;
    setIsUpdating(jobId);
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        status: 'Ready for Customer',
        readyForCustomerAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast.success("Job marked Ready for Customer!");
    } catch (e: any) {
      toast.error("Failed to update status");
    } finally {
      setIsUpdating(null);
    }
  };

  // Helper date calculators
  const formatFinishDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toISOString().split('T')[0];
  };

  // Process and calculate todo items for each job
  const todoItems = useMemo(() => {
    return jobsList.map(job => {
      const vehicle = job.vehicleId ? vehiclesList.find(v => v.vin === job.vehicleId || v.id === job.vehicleId) : null;
      const isOnSite = !!(vehicle && vehicle.arrivedAt && !vehicle.departedAt);
      const isScheduledInFuture = !!(job.scheduledStartDate && new Date(job.scheduledStartDate).getTime() > Date.now());

      const createdAtDate = job.createdAt
        ? (job.createdAt.toDate ? job.createdAt.toDate() : new Date(job.createdAt))
        : null;
      const isCreatedAfterMayFirst = createdAtDate && createdAtDate.getTime() >= new Date('2026-05-01T00:00:00').getTime();

      if (!isOnSite && !isScheduledInFuture && !isCreatedAfterMayFirst) {
        return {
          job,
          vehicleLabel: '',
          totalTasks: 0,
          completedTasks: 0,
          alerts: [],
          hasAlerts: false
        };
      }



      const vehicleLabel = vehicle
        ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
        : (job.vehicleId ? `VIN: ...${job.vehicleId.slice(-8)}` : 'No Vehicle');

      const jobTasks = tasksMap[job.id] || [];
      const nonGeneralTasks = jobTasks.filter(t => t.title !== 'General');
      const totalTasks = nonGeneralTasks.length;
      const completedTasks = nonGeneralTasks.filter(t => t.status === 'QC' || t.status === 'QC Complete' || t.status === 'completed').length;

      // 1. Needs VIN
      const needsVin = !(job.vehicleId || job.vehicle || (job.qbCustomFields && (job.qbCustomFields.vin || job.qbCustomFields['VIN num'])));
      
      // 2. Missing CompanyCam
      const needsCc = !(job.companyCamId || job.companyCamProjectId);

      // 3. Needs QC
      const isExplicitQC = job.status === 'Ready for QC';
      const isAllTasksDone = totalTasks > 0 && completedTasks === totalTasks;
      const needsQc = (isExplicitQC || isAllTasksDone) && !['Ready for Customer', 'Completed', 'Closed'].includes(job.status);

      // 4. Blockers
      const activeBlockers = (job.blockers || []).filter((b: any) => b.status === 'active');
      const isBlocked = activeBlockers.length > 0 || job.status === 'Blocked';

      // 5. Parts
      const jobParts = partsRequests.filter(p => p.jobId === job.id);
      const requestedParts = jobParts.filter(p => (p.status || '').toLowerCase() === 'pending' || (p.status || '').toLowerCase() === 'requested');
      const orderedParts = jobParts.filter(p => (p.status || '').toLowerCase() === 'ordered');
      const isPartsMissing = requestedParts.length > 0;
      const isPartsOrdered = orderedParts.length > 0 && requestedParts.length === 0;

      // 6. Needs Due Date
      const needsDueDate = !job.expectedFinishTime;

      // 7. Needs Location
      const jobLocation = zonesList.find(z => z.currentJobId === job.id);
      const needsLocation = !jobLocation && !job.bayId;

      // Compile alerts list
      const alerts: Array<{ type: string; severity: 'high' | 'medium' | 'low'; label: string; description: string }> = [];
      if (job.status === 'Draft' || job.isDraft) {
        alerts.push({
          type: 'draft',
          severity: 'high',
          label: 'Draft Job (Needs Activation)',
          description: 'Synced from QuickBooks. Review task assignments and convert to active job.'
        });
      }
      if (isBlocked) {
        alerts.push({ 
          type: 'blockers', 
          severity: 'high', 
          label: 'Blocked', 
          description: activeBlockers.map((b: any) => b.message).join(', ') || 'Marked as blocked.' 
        });
      }
      if (needsQc) {
        alerts.push({ 
          type: 'qc', 
          severity: 'high', 
          label: 'Ready for QC', 
          description: isAllTasksDone ? 'All tasks complete! Needs foreman inspection.' : 'Marked explicitly as Ready for QC.' 
        });
      }
      if (isPartsMissing) {
        alerts.push({ 
          type: 'parts', 
          severity: 'high', 
          label: 'Parts Missing', 
          description: `${requestedParts.length} parts requested but not ordered.` 
        });
      }
      if (isPartsOrdered) {
        alerts.push({ 
          type: 'parts', 
          severity: 'medium', 
          label: 'Waiting on Parts', 
          description: `${orderedParts.length} parts ordered. Waiting for delivery.` 
        });
      }
      if (needsVin) {
        alerts.push({ 
          type: 'vin', 
          severity: 'medium', 
          label: 'VIN Missing', 
          description: 'No VIN assigned. Needs vehicle intake setup.' 
        });
      }
      if (needsCc) {
        alerts.push({ 
          type: 'cc', 
          severity: 'medium', 
          label: 'No CompanyCam', 
          description: 'No CompanyCam Project ID linked.' 
        });
      }
      if (needsDueDate) {
        alerts.push({ 
          type: 'duedate', 
          severity: 'low', 
          label: 'No Due Date', 
          description: 'Expected completion date is not configured.' 
        });
      }
      if (needsLocation) {
        alerts.push({ 
          type: 'location', 
          severity: 'low', 
          label: 'No Bay Assigned', 
          description: 'Job is active but not allocated to a physical bay/parking zone.' 
        });
      }
      
      const needsTraveler = !job.travelerPrintedAt;
      if (needsTraveler) {
        alerts.push({ 
          type: 'traveler', 
          severity: 'medium', 
          label: 'Job Card Missing', 
          description: 'Job Card has not been printed yet.' 
        });
      }

      return {
        job,
        vehicleLabel,
        totalTasks,
        completedTasks,
        alerts,
        hasAlerts: alerts.length > 0
      };
    }).filter(item => item.hasAlerts);
  }, [jobsList, vehiclesList, zonesList, partsRequests, tasksMap]);

  // Compute metrics for dashboard cards
  const metrics = useMemo(() => {
    let blockers = 0;
    let qc = 0;
    let vin = 0;
    let cc = 0;
    let parts = 0;
    let location = 0;
    let traveler = 0;

    todoItems.forEach(item => {
      item.alerts.forEach(a => {
        if (a.type === 'blockers') blockers++;
        if (a.type === 'qc') qc++;
        if (a.type === 'vin') vin++;
        if (a.type === 'cc') cc++;
        if (a.type === 'parts') parts++;
        if (a.type === 'location') location++;
        if (a.type === 'traveler') traveler++;
      });
    });

    return { blockers, qc, vin, cc, parts, location, traveler, totalActionable: todoItems.length };
  }, [todoItems]);

  // Search & filter implementation
  const filteredTodoItems = useMemo(() => {
    return todoItems.filter(item => {
      // 1. Search Query filter
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchesJobNo = (item.job.jobNumber || '').toLowerCase().includes(query);
        const matchesCust = (item.job.customerName || '').toLowerCase().includes(query);
        const matchesVehicle = item.vehicleLabel.toLowerCase().includes(query);
        if (!matchesJobNo && !matchesCust && !matchesVehicle) return false;
      }

      // 2. Alert Type filter
      if (activeFilter !== 'all') {
        return item.alerts.some(a => a.type === activeFilter);
      }

      return true;
    }).sort((a, b) => {
      // Sort: Highest severity first
      const getWeight = (alertsList: any[]) => {
        if (alertsList.some(a => a.severity === 'high')) return 3;
        if (alertsList.some(a => a.severity === 'medium')) return 2;
        return 1;
      };
      return getWeight(b.alerts) - getWeight(a.alerts);
    });
  }, [todoItems, searchTerm, activeFilter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 text-zinc-500">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
        <p className="font-semibold text-sm">Loading Foreman Action Center...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen text-zinc-900 dark:text-zinc-150">
      <Toaster position="top-right" richColors />

      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-indigo-500" />
            Shop Foreman Action Center
          </h1>
          <p className="text-xs text-zinc-500 font-medium">
            Real-time checklist of active jobs requiring management interventions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search job, customer, VIN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none text-xs font-semibold shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
            />
          </div>
          <button 
            onClick={() => {
              setSearchTerm('');
              setActiveFilter('all');
            }}
            className="p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-100 transition shadow-sm text-zinc-650"
            title="Reset Filters"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
        <button 
          onClick={() => setActiveFilter('blockers')}
          className={cn(
            "p-4 rounded-2xl border text-left transition relative overflow-hidden group shadow-sm",
            activeFilter === 'blockers'
              ? "bg-red-500/10 border-red-500/40 dark:bg-red-950/20"
              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-red-500/30"
          )}
        >
          <div className="absolute right-3 top-3 text-red-500 opacity-20 group-hover:scale-110 transition-transform">
            <AlertTriangle className="w-12 h-12" />
          </div>
          <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Active Blockers</p>
          <p className="text-2xl font-black text-red-650 dark:text-red-400 mt-1">{metrics.blockers}</p>
        </button>

        <button 
          onClick={() => setActiveFilter('qc')}
          className={cn(
            "p-4 rounded-2xl border text-left transition relative overflow-hidden group shadow-sm",
            activeFilter === 'qc'
              ? "bg-indigo-500/10 border-indigo-500/40 dark:bg-indigo-950/20"
              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/30"
          )}
        >
          <div className="absolute right-3 top-3 text-indigo-500 opacity-20 group-hover:scale-110 transition-transform">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Needs QC</p>
          <p className="text-2xl font-black text-indigo-650 dark:text-indigo-400 mt-1">{metrics.qc}</p>
        </button>

        <button 
          onClick={() => setActiveFilter('vin')}
          className={cn(
            "p-4 rounded-2xl border text-left transition relative overflow-hidden group shadow-sm",
            activeFilter === 'vin'
              ? "bg-amber-500/10 border-amber-500/40 dark:bg-amber-950/20"
              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-amber-500/30"
          )}
        >
          <div className="absolute right-3 top-3 text-amber-500 opacity-20 group-hover:scale-110 transition-transform">
            <Car className="w-12 h-12" />
          </div>
          <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Needs VIN</p>
          <p className="text-2xl font-black text-amber-650 dark:text-amber-400 mt-1">{metrics.vin}</p>
        </button>

        <button 
          onClick={() => setActiveFilter('cc')}
          className={cn(
            "p-4 rounded-2xl border text-left transition relative overflow-hidden group shadow-sm",
            activeFilter === 'cc'
              ? "bg-purple-500/10 border-purple-500/40 dark:bg-purple-950/20"
              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-purple-500/30"
          )}
        >
          <div className="absolute right-3 top-3 text-purple-500 opacity-20 group-hover:scale-110 transition-transform">
            <Camera className="w-12 h-12" />
          </div>
          <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">No CompanyCam</p>
          <p className="text-2xl font-black text-purple-650 dark:text-purple-400 mt-1">{metrics.cc}</p>
        </button>

        <button 
          onClick={() => setActiveFilter('parts')}
          className={cn(
            "p-4 rounded-2xl border text-left transition relative overflow-hidden group shadow-sm",
            activeFilter === 'parts'
              ? "bg-orange-500/10 border-orange-500/40 dark:bg-orange-950/20"
              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-orange-500/30"
          )}
        >
          <div className="absolute right-3 top-3 text-orange-500 opacity-20 group-hover:scale-110 transition-transform">
            <Package className="w-12 h-12" />
          </div>
          <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Waiting on Parts</p>
          <p className="text-2xl font-black text-orange-650 dark:text-orange-400 mt-1">{metrics.parts}</p>
        </button>

        <button 
          onClick={() => setActiveFilter('location')}
          className={cn(
            "p-4 rounded-2xl border text-left transition relative overflow-hidden group shadow-sm",
            activeFilter === 'location'
              ? "bg-cyan-500/10 border-cyan-500/40 dark:bg-cyan-950/20"
              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-cyan-500/30"
          )}
        >
          <div className="absolute right-3 top-3 text-cyan-500 opacity-20 group-hover:scale-110 transition-transform">
            <MapPin className="w-12 h-12" />
          </div>
          <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">No Location</p>
          <p className="text-2xl font-black text-cyan-650 dark:text-cyan-400 mt-1">{metrics.location}</p>
        </button>

        <button 
          onClick={() => setActiveFilter('traveler')}
          className={cn(
            "p-4 rounded-2xl border text-left transition relative overflow-hidden group shadow-sm",
            activeFilter === 'traveler'
              ? "bg-indigo-500/10 border-indigo-500/40 dark:bg-indigo-950/20"
              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/30"
          )}
        >
          <div className="absolute right-3 top-3 text-indigo-500 opacity-20 group-hover:scale-110 transition-transform">
            <Printer className="w-12 h-12" />
          </div>
          <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">No Traveler</p>
          <p className="text-2xl font-black text-indigo-650 dark:text-indigo-400 mt-1">{metrics.traveler}</p>
        </button>
      </div>

      {/* Filter Tabs Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <button
          onClick={() => setActiveFilter('all')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-bold transition",
            activeFilter === 'all'
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "bg-zinc-150 text-zinc-650 dark:bg-zinc-900 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          )}
        >
          All Items ({metrics.totalActionable})
        </button>
        {metrics.blockers > 0 && (
          <button
            onClick={() => setActiveFilter('blockers')}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5",
              activeFilter === 'blockers'
                ? "bg-red-500 text-white"
                : "bg-red-500/10 text-red-600 hover:bg-red-500/20"
            )}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Blockers ({metrics.blockers})
          </button>
        )}
        {metrics.qc > 0 && (
          <button
            onClick={() => setActiveFilter('qc')}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5",
              activeFilter === 'qc'
                ? "bg-indigo-500 text-white"
                : "bg-indigo-500/10 text-indigo-650 hover:bg-indigo-500/20"
            )}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Needs QC ({metrics.qc})
          </button>
        )}
        {metrics.vin > 0 && (
          <button
            onClick={() => setActiveFilter('vin')}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5",
              activeFilter === 'vin'
                ? "bg-amber-500 text-white"
                : "bg-amber-500/10 text-amber-650 hover:bg-amber-500/20"
            )}
          >
            <Car className="w-3.5 h-3.5" /> Needs VIN ({metrics.vin})
          </button>
        )}
        {metrics.cc > 0 && (
          <button
            onClick={() => setActiveFilter('cc')}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5",
              activeFilter === 'cc'
                ? "bg-purple-500 text-white"
                : "bg-purple-500/10 text-purple-650 hover:bg-purple-500/20"
            )}
          >
            <Camera className="w-3.5 h-3.5" /> No CompanyCam ({metrics.cc})
          </button>
        )}
        {metrics.parts > 0 && (
          <button
            onClick={() => setActiveFilter('parts')}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5",
              activeFilter === 'parts'
                ? "bg-orange-500 text-white"
                : "bg-orange-500/10 text-orange-650 hover:bg-orange-500/20"
            )}
          >
            <Package className="w-3.5 h-3.5" /> Parts ({metrics.parts})
          </button>
        )}
        {metrics.location > 0 && (
          <button
            onClick={() => setActiveFilter('location')}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5",
              activeFilter === 'location'
                ? "bg-cyan-500 text-white"
                : "bg-cyan-500/10 text-cyan-650 hover:bg-cyan-500/20"
            )}
          >
            <MapPin className="w-3.5 h-3.5" /> No Bay ({metrics.location})
          </button>
        )}
        {metrics.traveler > 0 && (
          <button
            onClick={() => setActiveFilter('traveler')}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5",
              activeFilter === 'traveler'
                ? "bg-indigo-500 text-white"
                : "bg-indigo-500/10 text-indigo-650 hover:bg-indigo-500/20"
            )}
          >
            <Printer className="w-3.5 h-3.5" /> Traveler Missing ({metrics.traveler})
          </button>
        )}
      </div>

      {/* Main Action Items List */}
      <div className="space-y-4">
        {filteredTodoItems.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-16 text-center shadow-sm">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4 animate-bounce" />
            <h3 className="text-base font-black text-zinc-900 dark:text-white">Foreman Checklist Clear!</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-450 mt-1 max-w-sm mx-auto">
              Nice work. All active jobs are fully configured with VINs, CompanyCam links, active bays, and active tasks. No blockers logged.
            </p>
          </div>
        ) : (
          filteredTodoItems.map(({ job, vehicleLabel, totalTasks, completedTasks, alerts }) => {
            const isJobUpdating = isUpdating === job.id;

            return (
              <div 
                key={job.id} 
                className={cn(
                  "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm transition flex flex-col lg:flex-row lg:items-start justify-between gap-6 hover:shadow-md relative overflow-hidden",
                  isJobUpdating && "opacity-60 pointer-events-none"
                )}
              >
                {/* Left side: Job Identification */}
                <div className="flex-1 space-y-3 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span 
                      onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}
                      className="text-sm font-black text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      #{job.jobNumber || 'No Job #'}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-700">|</span>
                    <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">
                      {job.customerName || 'No Customer Name'}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs font-semibold text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Car className="w-3.5 h-3.5 shrink-0" />
                      {vehicleLabel}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      Tasks: {completedTasks}/{totalTasks} ({totalTasks > 0 ? Math.round((completedTasks/totalTasks)*100) : 0}%)
                    </span>
                    {job.expectedFinishTime && (
                      <span className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-650 px-2 py-0.5 rounded">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        Due: {formatFinishDate(job.expectedFinishTime)}
                      </span>
                    )}
                  </div>

                  {/* List of active alerts on this job */}
                  <div className="space-y-2 mt-2">
                    {alerts.map((alert, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "flex items-start gap-2.5 p-2.5 rounded-xl border text-xs font-semibold",
                          alert.severity === 'high' 
                            ? "bg-red-500/[0.04] border-red-500/15 text-red-700 dark:text-red-400" 
                            : alert.severity === 'medium'
                              ? "bg-amber-500/[0.04] border-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400"
                        )}
                      >
                        {alert.type === 'blockers' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />}
                        {alert.type === 'qc' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />}
                        {alert.type === 'vin' && <Car className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />}
                        {alert.type === 'cc' && <Camera className="w-4 h-4 shrink-0 mt-0.5 text-purple-500" />}
                        {alert.type === 'parts' && <Package className="w-4 h-4 shrink-0 mt-0.5 text-orange-500" />}
                        {alert.type === 'duedate' && <Calendar className="w-4 h-4 shrink-0 mt-0.5 text-zinc-400" />}
                        {alert.type === 'location' && <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-cyan-500" />}
                        {alert.type === 'traveler' && <Printer className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />}
                        <div className="min-w-0">
                          <p className="font-bold uppercase text-[9px] tracking-wider mb-0.5">{alert.label}</p>
                          <p className="leading-relaxed opacity-90">{alert.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right side: Quick Fix Actions Panel */}
                <div className="w-full lg:w-72 flex flex-col gap-3 justify-end self-stretch border-t lg:border-t-0 lg:border-l border-zinc-150 dark:border-zinc-800/80 pt-4 lg:pt-0 lg:pl-5 shrink-0">
                  <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Foreman Actions</p>
                  
                  {/* VIN Quick Fix */}
                  {alerts.some(a => a.type === 'vin') && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-zinc-500">Assign VIN</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="Enter 17-digit VIN..."
                          value={tempVin[job.id] ?? ''}
                          onChange={(e) => setTempVin(prev => ({ ...prev, [job.id]: e.target.value }))}
                          maxLength={17}
                          className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 px-2 py-1 w-full rounded text-xs font-mono outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          onClick={() => saveVin(job.id)}
                          disabled={!(tempVin[job.id]?.length === 17) || !canManage}
                          className="p-1.5 bg-indigo-500 hover:bg-indigo-650 text-white rounded disabled:opacity-40 transition"
                          title="Save VIN"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* CompanyCam Quick Fix */}
                  {alerts.some(a => a.type === 'cc') && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-zinc-500">Link CompanyCam</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="Project ID or URL..."
                          value={tempCc[job.id] ?? ''}
                          onChange={(e) => setTempCc(prev => ({ ...prev, [job.id]: e.target.value }))}
                          className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 px-2 py-1 w-full rounded text-xs font-semibold outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          onClick={() => saveCompanyCam(job.id)}
                          disabled={!tempCc[job.id]?.trim() || !canManage}
                          className="p-1.5 bg-indigo-500 hover:bg-indigo-650 text-white rounded disabled:opacity-40 transition"
                          title="Save CompanyCam"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Assign Bay/Location */}
                  {alerts.some(a => a.type === 'location') && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-zinc-500">Assign Location</label>
                      <select
                        onChange={(e) => assignLocation(job.id, e.target.value)}
                        defaultValue="none"
                        className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 px-2 py-1 w-full rounded text-xs font-semibold outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="none">-- Assign Bay --</option>
                        {zonesList.filter(z => !z.isArchived && z.type === 'bay').map(z => (
                          <option key={z.id} value={z.id}>{z.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Set Due Date */}
                  {alerts.some(a => a.type === 'duedate') && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-zinc-500">Set Due Date</label>
                      <input
                        type="date"
                        onChange={(e) => updateDueDate(job.id, e.target.value)}
                        className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 px-2 py-1 w-full rounded text-xs font-semibold outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Resolve Active Blocker */}
                  {alerts.some(a => a.type === 'blockers') && (
                    <button
                      onClick={() => resolveBlockers(job.id)}
                      disabled={!canManage}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-red-500/10 hover:bg-red-500 text-red-650 hover:text-white rounded-xl border border-red-500/25 text-xs font-bold transition active:scale-95 disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Resolve Active Blockers
                    </button>
                  )}

                  {/* Resolve QC Complete */}
                  {alerts.some(a => a.type === 'qc') && (
                    <button
                      onClick={() => markReadyForCustomer(job.id)}
                      disabled={!canManage}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-650 hover:text-white rounded-xl border border-indigo-500/25 text-xs font-bold transition active:scale-95 disabled:opacity-40"
                    >
                      <CheckSquare className="w-4 h-4 shrink-0" />
                      Approve QC (Ready for Customer)
                    </button>
                  )}

                  {/* Print Job Traveler */}
                  <button
                    onClick={() => setPrintingJob(job)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-indigo-500/10 hover:bg-indigo-650 text-indigo-650 hover:text-white rounded-xl border border-indigo-500/25 text-xs font-bold transition active:scale-95 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 shrink-0" />
                    {job.travelerPrintedAt ? 'Reprint Job Traveler' : 'Print Job Traveler'}
                  </button>

                  {/* View Details quick navigation */}
                  <button 
                    onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-350 rounded-xl text-xs font-bold transition"
                  >
                    View Full Job Details
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Injectable Media Print Stylesheet */}
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

      {/* Screen-Visible Print Preparation Modal */}
      {printingJob && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-2xl w-full flex flex-col gap-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Printer className="w-4 h-4 text-indigo-500" />
                Preparing Job Card
              </h3>
              <button 
                onClick={() => setPrintingJob(null)}
                className="text-xs font-bold text-zinc-500 hover:text-zinc-300"
              >
                ✕ Cancel
              </button>
            </div>
            
            <p className="text-xs text-zinc-400">
              Sending Job Card to printer. If the print dialog does not open automatically, click the print button below.
            </p>             {/* Preview container (visible on screen) */}
            <div className="border border-zinc-800 rounded-2xl p-6 bg-zinc-950 max-h-[55vh] overflow-y-auto flex flex-col items-center custom-scrollbar w-full">
              <div 
                id="single-job-card-preview"
                className="bg-white text-zinc-900 p-8 font-sans w-full max-w-[480px] min-h-[620px] flex flex-col justify-between rounded-xl shadow-md my-2"
              >
                {/* Job Card Content */}
                <div className="border-b-2 border-indigo-900 pb-3 flex justify-between items-start text-left">
                  <div>
                    <span className="text-[8px] font-black tracking-widest text-indigo-650 uppercase bg-indigo-50 px-2 py-0.5 rounded">Job Card</span>
                    <h1 className="text-xl font-black text-indigo-950 mt-1 tracking-tight">JOB #{printingJob.jobNumber || 'N/A'}</h1>
                    {printingJob.title && printingJob.title !== printingJob.jobNumber && (
                      <p className="text-xs font-bold text-zinc-700 mt-0.5">{printingJob.title}</p>
                    )}
                    <p className="text-xs font-extrabold text-indigo-900 mt-1.5 uppercase tracking-wide">Customer: {printingJob.customerName || 'No Customer Assigned'}</p>
                    <p className="text-xs font-extrabold text-zinc-800 mt-1 uppercase tracking-wide">Vehicle: {(() => {
                      const vehicle = printingJob.vehicleId ? vehiclesList.find(v => v.vin === printingJob.vehicleId || v.id === printingJob.vehicleId) : null;
                      return vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}` : 'No Vehicle Assigned';
                    })()}</p>
                    {printingJob.vehicleId && (
                      <p className="text-[11px] font-mono text-zinc-550 mt-0.5 font-bold">VIN: {printingJob.vehicleId}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center my-4 w-full">
                  <div className="p-2 bg-white border border-zinc-200 rounded-xl shadow-sm scale-90">
                    <LogoQRCode 
                      value={`${window.location.origin}/business/${tenantId}/job/${printingJob.id}`}
                      size={150}
                      logoUrl={businessLogo}
                      businessName={businessName}
                      type="general"
                    />
                  </div>
                  <p className="text-[8px] font-black text-zinc-405 uppercase tracking-widest mt-2">Scan QR to open job details</p>
                </div>

                {/* CompanyCam details box */}
                {companyCamVal && (
                  <div className="border-t border-zinc-200 pt-3 bg-zinc-55 p-3 rounded-lg text-left text-[10px]">
                    <div className="flex items-center gap-3">
                      <div className="p-1 bg-white border border-zinc-200 rounded-md shadow-sm shrink-0 scale-90">
                        <LogoQRCode 
                          value={companyCamVal.startsWith('http') ? companyCamVal : `https://app.companycam.com/projects/${companyCamVal}`}
                          size={55}
                          type="general"
                        />
                      </div>
                      <div>
                        <h4 className="font-black text-zinc-400 uppercase tracking-widest text-[8px]">CompanyCam Photos</h4>
                        <p className="text-[10px] font-bold text-zinc-850 mt-0.5">Scan QR to view photos</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t border-zinc-150 pt-2 flex justify-between items-center text-[8px] text-zinc-400 font-black uppercase tracking-wider mt-2">
                  <span>{businessName}</span>
                  <span>Printed: {new Date().toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPrintingJob(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handlePrintJobCard}
                className="px-4 py-2 bg-indigo-650 hover:bg-indigo-755 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-indigo-600/20"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal to document.body for clean, root-level @media print visibility */}
      {printingJob && createPortal(
        <div className="traveler-print-wrapper" style={{ display: 'none' }}>
          <div 
            className="bg-white text-zinc-900 p-12 font-sans mx-auto max-w-[800px] h-[10.2in] flex flex-col justify-between"
          >
            {/* Top border decor */}
            <div className="border-b-4 border-indigo-900 pb-6 flex justify-between items-start">
              <div>
                <span className="text-[10px] font-black tracking-widest text-indigo-650 uppercase bg-indigo-50 px-2.5 py-1 rounded-md">Job Card</span>
                <h1 className="text-3xl sm:text-4xl font-black text-indigo-950 mt-3 tracking-tight">JOB #{printingJob.jobNumber || 'N/A'}</h1>
                {printingJob.title && printingJob.title !== printingJob.jobNumber && (
                  <p className="text-base sm:text-lg font-bold text-zinc-700 mt-1">{printingJob.title}</p>
                )}
                <p className="text-sm sm:text-base font-extrabold text-indigo-900 mt-2 uppercase tracking-wide">Customer: {printingJob.customerName || 'No Customer Assigned'}</p>
                <p className="text-sm sm:text-base font-extrabold text-zinc-800 mt-1 uppercase tracking-wide">Vehicle: {(() => {
                  const vehicle = printingJob.vehicleId ? vehiclesList.find(v => v.vin === printingJob.vehicleId || v.id === printingJob.vehicleId) : null;
                  return vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}` : 'No Vehicle Assigned';
                })()}</p>
                {printingJob.vehicleId && (
                  <p className="text-sm text-zinc-550 font-mono mt-0.5 font-bold">VIN: {printingJob.vehicleId}</p>
                )}
              </div>
            </div>            {/* Middle Section: Big QR Code */}
            <div className="flex flex-col items-center justify-center my-auto py-8">
              <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm">
                <LogoQRCode 
                  value={`${window.location.origin}/business/${tenantId}/job/${printingJob.id}`}
                  size={220}
                  logoUrl={businessLogo}
                  businessName={businessName}
                  type="general"
                />
              </div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-4">Scan QR to open job details instantly</p>
            </div>

            {/* Bottom Section: Customer, CompanyCam, and Vehicle Info */}
            {(() => {
              const companyCamVal = printingJob.companyCamId || printingJob.companyCamProjectId || '';
              return companyCamVal ? (
                <div className="border-t-2 border-zinc-200 pt-6 bg-zinc-50 p-6 rounded-xl text-left">
                  <div className="flex items-center gap-4">
                    <div className="p-1.5 bg-white border border-zinc-200 rounded-lg shadow-sm shrink-0">
                      <LogoQRCode 
                        value={companyCamVal.startsWith('http') ? companyCamVal : `https://app.companycam.com/projects/${companyCamVal}`}
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

            {/* Footer */}
            <div className="border-t border-zinc-150 pt-4 flex justify-between items-center text-[9px] text-zinc-400 font-black uppercase tracking-wider mt-4">
              <span>{businessName} &bull; UpfitterOS</span>
              <span>Printed: {new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
