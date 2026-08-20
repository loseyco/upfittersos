import { useState, useEffect, useRef } from 'react';
import { 
  query, where, updateDoc, doc, serverTimestamp, addDoc, collection, onSnapshot 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Search, Car, Clock, ArrowRight, User,
  Package, CheckCircle, MapPin, FileText, ShoppingCart,
  Maximize, Minimize, CheckSquare
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import { PackageIntakeModal } from './PackageIntakeModal';
import { useAuthStore } from '../../lib/auth/store';
import { ItemDetailsModal } from './ItemDetailsModal';
import { toast, Toaster } from 'sonner';
import { useWakeLock } from '../../hooks/useWakeLock';

interface OfficeDashboardProps {
  tenantId: string;
}

export function OfficeDashboard({ tenantId }: OfficeDashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useWakeLock(isFullscreen);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        toast.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      toast.success("Optimized Mode Active", {
        description: "Keep Screen Awake is now active for this board.",
        duration: 5000,
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);
  const [jobs, setJobs] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  // const [searchParams, setSearchParams] = useSearchParams();
  const [shipments, setShipments] = useState<any[]>([]);
  const [receivedParts, setReceivedParts] = useState<any[]>([]);
  const [isIntakeOpen, setIsIntakeOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<{id: string, type: 'shipment' | 'part'} | null>(null);
  
  // Filtering & Pagination
  const [activeFilter, setActiveFilter] = useState<'all' | 'arriving' | 'received' | 'delivered'>('received');
  const [packageSearchQuery, setPackageSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(10);

  useEffect(() => {
    if (!tenantId) return;
    
    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), snap => {
      setJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Jobs listener error:", err));

    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), snap => {
      setVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Vehicles listener error:", err));

    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), snap => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Zones listener error:", err));

    const qShipments = query(
      collection(db, `businesses/${tenantId}/shipments`),
      where('status', 'in', ['ordered', 'received', 'delivered'])
    );
    const unsubShipments = onSnapshot(qShipments, snap => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setShipments(data);
      setLastUpdated(new Date());
    }, (err) => console.error("Shipments listener error:", err));

    const qReceivedParts = query(
      collection(db, `businesses/${tenantId}/parts_requests`),
      where('status', 'in', ['ordered', 'received', 'fulfilled', 'delivered', 'inventoried'])
    );
    const unsubReceivedParts = onSnapshot(qReceivedParts, snap => {
      setReceivedParts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Received parts listener error:", err));

    return () => {
      unsubJobs();
      unsubVehicles();
      unsubZones();
      unsubShipments();
      unsubReceivedParts();
    };
  }, [tenantId]);

  const matchesSearch = (job: any, vehicle: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (job.title?.toLowerCase().includes(q)) return true;
    if (job.jobNumber?.toLowerCase().includes(q)) return true;
    if (job.customerName?.toLowerCase().includes(q)) return true;
    if (vehicle?.vin?.toLowerCase().includes(q)) return true;
    if (vehicle?.make?.toLowerCase().includes(q)) return true;
    if (vehicle?.model?.toLowerCase().includes(q)) return true;
    return false;
  };

  const getJobEta = (job: any) => {
    const zone = zones.find(z => z.currentJobId === job.id);
    return zone?.eta || job.expectedFinishTime || job.eta;
  };

  // 1. Jobs Flagged as Ready for QC
  const readyForQcJobs = jobs.filter(job => 
    ['ready for qc', 'qc', 'ready_for_qc'].includes((job.status || '').toLowerCase().trim())
  ).filter(job => {
    const vehicle = job.vehicleId ? vehicles.find(v => v.vin === job.vehicleId) : null;
    return matchesSearch(job, vehicle);
  }).sort((a, b) => {
    // Sort by expectedFinishTime/due date ascending, then updatedAt descending
    const timeA = a.expectedFinishTime ? (typeof a.expectedFinishTime.toDate === 'function' ? a.expectedFinishTime.toDate().getTime() : new Date(a.expectedFinishTime).getTime()) : 0;
    const timeB = b.expectedFinishTime ? (typeof b.expectedFinishTime.toDate === 'function' ? b.expectedFinishTime.toDate().getTime() : new Date(b.expectedFinishTime).getTime()) : 0;
    if (timeA && timeB) return timeA - timeB;
    if (timeA) return -1;
    if (timeB) return 1;

    const updateA = (a.updatedAt?.seconds || a.createdAt?.seconds || 0);
    const updateB = (b.updatedAt?.seconds || b.createdAt?.seconds || 0);
    return updateB - updateA; // Newest update first if no due date
  });

  // 2. Jobs Marked as Ready for Customer
  const readyForCustomerJobs = jobs.filter(job => 
    job.status === 'Ready for Customer'
  ).filter(job => {
    const vehicle = job.vehicleId ? vehicles.find(v => v.vin === job.vehicleId) : null;
    return matchesSearch(job, vehicle);
  }).sort((a, b) => {
    // Sort by expectedFinishTime/due date ascending, then updatedAt descending
    const timeA = a.expectedFinishTime ? (typeof a.expectedFinishTime.toDate === 'function' ? a.expectedFinishTime.toDate().getTime() : new Date(a.expectedFinishTime).getTime()) : 0;
    const timeB = b.expectedFinishTime ? (typeof b.expectedFinishTime.toDate === 'function' ? b.expectedFinishTime.toDate().getTime() : new Date(b.expectedFinishTime).getTime()) : 0;
    if (timeA && timeB) return timeA - timeB;
    if (timeA) return -1;
    if (timeB) return 1;

    const updateA = (a.updatedAt?.seconds || a.createdAt?.seconds || 0);
    const updateB = (b.updatedAt?.seconds || b.createdAt?.seconds || 0);
    return updateB - updateA;
  });

  // Merged Recently Received (Shipments + Received Parts Requests)
  const baseReceived = [
    ...shipments.map(s => ({ ...s, type: 'shipment' })),
    ...receivedParts.map(p => ({ ...p, type: 'part', description: p.partName }))
  ].filter(item => {
    const q = packageSearchQuery.toLowerCase().trim();
    if (!q) return true;
    const fields = [
      item.trackingNumber,
      item.description,
      item.partName,
      item.location,
      item.notes,
      item.jobTitle,
      item.jobId,
      item.receivedBy,
      item.requestedBy,
      item.carrier,
      item.shipper,
      item.vendorName,
      item.status,
      item.id
    ].map(f => String(f || '').toLowerCase());
    return fields.some(f => f.includes(q));
  });

  const counts = {
    arriving: baseReceived.filter(i => i.status === 'ordered').length,
    received: baseReceived.filter(i => i.status === 'received').length,
    delivered: baseReceived.filter(i => i.status === 'delivered' || i.status === 'fulfilled' || i.status === 'inventoried').length,
  };

  const allReceived = baseReceived.filter(item => {
    if (activeFilter === 'arriving' && item.status !== 'ordered') return false;
    if (activeFilter === 'received' && item.status !== 'received') return false;
    if (activeFilter === 'delivered' && !(item.status === 'delivered' || item.status === 'fulfilled' || item.status === 'inventoried')) return false;
    
    return true;
  }).sort((a, b) => {
    const timeA = a.createdAt?.seconds || a.statusChangedAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || b.statusChangedAt?.seconds || 0;
    return timeB - timeA;
  });

  const displayItems = allReceived.slice(0, displayLimit);
  const hasMore = allReceived.length > displayLimit;

  const renderJobCard = (job: any, type: 'qc' | 'customer') => {
    const vehicle = job.vehicleId ? vehicles.find(v => v.vin === job.vehicleId) : null;
    const vehicleDisplay = vehicle 
      ? (`${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || `VIN: ${job.vehicleId}`) 
      : (job.vehicleId ? `VIN: ${job.vehicleId}` : 'No Vehicle Assigned');
      
    const etaRaw = getJobEta(job);
    let etaLabel = null;
    let etaColor = 'text-zinc-500';
    let isOverdue = false;

    if (etaRaw) {
      const etaDate = typeof etaRaw.toDate === 'function' ? etaRaw.toDate() : new Date(etaRaw);
      const diffMs = etaDate.getTime() - Date.now();
      isOverdue = diffMs < 0;
      const absDiff = Math.abs(diffMs);
      const d = Math.floor(absDiff / 86400000);
      const h = Math.floor((absDiff % 86400000) / 3600000);
      const m = Math.floor((absDiff % 3600000) / 60000);
      
      let timeStr = '';
      if (d > 0) timeStr = `${d}d ${h}h`;
      else if (h > 0) timeStr = `${h}h ${m}m`;
      else timeStr = `${m}m`;

      etaLabel = isOverdue ? `ETA: Overdue ${timeStr}` : `ETA in ${timeStr}`;
      etaColor = isOverdue ? 'text-red-500 bg-red-500/10' : 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400';
    }

    let dueDateLabel = null;
    if (job.expectedFinishTime) {
      const dueDate = typeof job.expectedFinishTime.toDate === 'function' ? job.expectedFinishTime.toDate() : new Date(job.expectedFinishTime);
      dueDateLabel = `Due: ${dueDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    }

    return (
      <div 
        key={job.id} 
        onClick={() => {
          navigate(`/business/${tenantId}/job/${job.id}`);
        }}
        className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-indigo-500/50 transition-all cursor-pointer relative overflow-hidden"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2.5 rounded-xl shrink-0",
              type === 'customer' ? "bg-emerald-500/10 text-emerald-500" : "bg-indigo-500/10 text-indigo-500"
            )}>
              {type === 'customer' ? <CheckCircle className="w-5 h-5" /> : <CheckSquare className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-black text-zinc-900 dark:text-white text-base sm:text-lg line-clamp-1">
                {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title || 'Untitled Job'}
              </h3>
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-500 mt-1">
                <span className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {job.customerName || 'No Customer'}
                </span>
                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                <span className={cn(
                  "uppercase tracking-wider text-xs font-black px-2 py-0.5 rounded",
                  type === 'customer' 
                    ? 'text-emerald-500 bg-emerald-500/10' 
                    : 'text-indigo-500 bg-indigo-500/10'
                )}>{job.status}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
            {etaLabel && (
              <div className={cn("px-2 py-1 rounded text-[10px] sm:text-xs font-bold uppercase tracking-tighter", etaColor)}>
                {etaLabel}
              </div>
            )}
            {dueDateLabel && (
              <div className="px-2 py-1 rounded text-[10px] sm:text-xs font-bold uppercase tracking-tighter text-zinc-500 bg-zinc-100 dark:bg-zinc-800">
                {dueDateLabel}
              </div>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 truncate">
              {vehicleDisplay}
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mr-1" />
        </div>
      </div>
    );
  };

  const handleUpdateStatus = async (item: any, newStatus: string) => {
    if (!tenantId) return;
    try {
      const collectionName = item.type === 'shipment' ? 'shipments' : 'parts_requests';
      const updateData: any = {
        status: newStatus,
        statusChangedAt: serverTimestamp()
      };
      
      // Special fields for specific statuses
      if (newStatus === 'delivered' && item.type === 'shipment') {
        updateData.putAwayAt = serverTimestamp();
      }
      if (newStatus === 'received' && item.type === 'shipment') {
        updateData.deliveredAt = serverTimestamp();
      }

      await updateDoc(doc(db, `businesses/${tenantId}/${collectionName}`, item.id), updateData);
      toast.success(`Item marked as ${newStatus}`);
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update status');
    }
  };


  const handleCreateQuickPart = async () => {
    if (!tenantId) return;
    try {
      const docRef = await addDoc(collection(db, `businesses/${tenantId}/parts_requests`), {
        partName: "New Part Request",
        status: "ordered",
        requestedBy: user?.email || 'Office',
        createdAt: serverTimestamp(),
        statusChangedAt: serverTimestamp()
      });
      setSelectedItemId({ id: docRef.id, type: 'part' });
      toast.success("Created new part record");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create part record");
    }
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-4 duration-500",
        isFullscreen ? "p-2 space-y-2 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar" : "space-y-6 sm:space-y-8"
      )}
    >
      <Toaster position="top-right" richColors theme="system" closeButton />
      <PackageIntakeModal 
        isOpen={isIntakeOpen}
        onClose={() => setIsIntakeOpen(false)}
        onSuccess={() => {}}
        zones={zones}
      />

      <ItemDetailsModal 
        isOpen={!!selectedItemId}
        onClose={() => setSelectedItemId(null)}
        itemId={selectedItemId?.id || null}
        type={selectedItemId?.type || 'shipment'}
        zones={zones}
        onOpenIntake={() => {
          setSelectedItemId(null);
          setIsIntakeOpen(true);
        }}
      />
      
      {/* Header Actions */}
      {isFullscreen && (
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 w-full relative z-10">
          <div className="mr-auto flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Office Dashboard</span>
            <span className="text-[10px] font-bold text-zinc-500">• Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
          <button 
            onClick={toggleFullscreen}
            className="hidden sm:flex w-full sm:w-auto px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-lg transition-all items-center justify-center gap-2 cursor-pointer"
          >
            <Minimize className="w-4 h-4" />
            Exit Full Screen
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Office Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage completed jobs, QC checks, and inbound packages.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto shrink-0">
          {!isFullscreen && (
            <button 
              onClick={toggleFullscreen}
              className="hidden sm:flex w-full sm:w-auto px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2 cursor-pointer h-10 shrink-0"
            >
              <Maximize className="w-4 h-4" />
              Full Screen
            </button>
          )}
          <button 
            onClick={() => navigate(`/business/${tenantId}/jobs_overview`)}
            className="w-full sm:w-auto px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 border border-zinc-700 shadow-sm h-10 shrink-0 text-sm cursor-pointer"
          >
            <FileText className="w-4 h-4 text-indigo-400" />
            JOBS OVERVIEW SHEET
          </button>
          <button 
            onClick={handleCreateQuickPart}
            className="w-full sm:w-auto px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl transition-all flex items-center justify-center gap-2 border border-indigo-500/20 shadow-sm h-10 shrink-0 text-sm cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            REQUEST PART
          </button>
          <button 
            onClick={() => setIsIntakeOpen(true)}
            className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 group active:scale-95 h-10 shrink-0 text-sm cursor-pointer"
          >
            <Package className="w-4 h-4 group-hover:rotate-12 transition-transform" />
            RECEIVE PACKAGE
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-zinc-400 focus-within:text-indigo-500 transition-colors" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter by VIN, Job #, Customer, or Title..."
          className={cn(
            "w-full pl-12 pr-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm hover:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400 font-medium",
            isFullscreen ? "py-2" : "py-4"
          )}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">

        {/* Jobs Marked as Ready for Customer */}
        <section className="flex flex-col">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              Ready for Customer
            </h2>
            <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
              {readyForCustomerJobs.length} Jobs
            </span>
          </div>
          
          <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-inner">
            {readyForCustomerJobs.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-zinc-500 italic text-center">
                <CheckCircle className="w-8 h-8 mb-3 opacity-20 text-emerald-500" />
                <p>No jobs marked as ready for customer.</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {readyForCustomerJobs.map(job => renderJobCard(job, 'customer'))}
              </div>
            )}
          </div>
        </section>

        {/* Jobs Flagged as Ready for QC */}
        <section className="flex flex-col">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
              <CheckSquare className="w-5 h-5 text-indigo-500" />
              Ready for QC
            </h2>
            <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
              {readyForQcJobs.length} Jobs
            </span>
          </div>
          
          <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-inner">
            {readyForQcJobs.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-zinc-500 italic text-center">
                <CheckSquare className="w-8 h-8 mb-3 opacity-20 text-indigo-500" />
                <p>No jobs flagged as ready for QC.</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {readyForQcJobs.map(job => renderJobCard(job, 'qc'))}
              </div>
            )}
          </div>
        </section>

        {/* Packages to Put Away */}
        <section className="flex flex-col lg:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
              <Package className="w-5 h-5 text-emerald-500" />
              Recently Received
            </h2>
            <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
              {allReceived.length} Items
            </span>
          </div>

          {/* Package Search Box */}
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-zinc-400" />
            </div>
            <input
              type="text"
              value={packageSearchQuery}
              onChange={(e) => setPackageSearchQuery(e.target.value)}
              placeholder="Search packages (tracking, notes, location)..."
              className="w-full pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium shadow-sm hover:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400"
            />
            {packageSearchQuery && (
              <button 
                onClick={() => setPackageSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-bold"
              >
                Clear
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl mb-4">
            {(['arriving', 'received', 'delivered'] as const).map(f => (
              <button
                key={f}
                onClick={() => {
                  setActiveFilter(f);
                  setDisplayLimit(10);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  activeFilter === f 
                    ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}
              >
                {f === 'delivered' ? 'Put Away' : f}
                {counts[f] > 0 && (
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-[8px] font-bold min-w-[1.25rem] text-center",
                    activeFilter === f 
                      ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" 
                      : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500"
                  )}>
                    {counts[f]}
                  </span>
                )}
              </button>
            ))}
          </div>
          
          <div className="flex-1 bg-emerald-50/30 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10 rounded-3xl p-4 sm:p-6 shadow-inner min-h-[300px]">
            {displayItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 italic text-center p-8">
                <CheckCircle className="w-8 h-8 mb-3 opacity-20 text-emerald-500" />
                <p>No {activeFilter} items found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {displayItems.map(item => (
                  <div key={item.id} className={cn(
                    "bg-white dark:bg-zinc-900 border rounded-2xl p-4 shadow-sm hover:border-emerald-500 transition-all group relative",
                    item.type === 'part' ? "border-indigo-500/20" : "border-emerald-500/20"
                  )}>
                    <div 
                      className="absolute inset-0 z-0 cursor-pointer" 
                      onClick={() => {
                        if (item.jobId) {
                          navigate(`/business/${tenantId}/job/${item.jobId}`);
                        } else {
                          setSelectedItemId({ id: item.id, type: item.type });
                        }
                      }}
                    />
                    <div className="flex items-start justify-between mb-2 relative z-10 pointer-events-none">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {item.type === 'part' ? (
                            <ShoppingCart className="w-3 h-3 text-indigo-500 shrink-0" />
                          ) : (
                            <Package className="w-3 h-3 text-emerald-500 shrink-0" />
                          )}
                          <h4 className="font-bold text-zinc-900 dark:text-white truncate">{item.description || 'Item'}</h4>
                        </div>
                        <p className="text-[10px] font-mono text-zinc-400 truncate">
                          {item.trackingNumber || (item.type === 'part' ? 'INTERNAL REQUEST' : 'NO TRACKING')}
                        </p>
                      </div>
                      
                      {/* Contextual Action Button */}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextStatus = item.status === 'ordered' ? 'received' : 
                                           item.status === 'received' ? 'delivered' : 'received';
                          handleUpdateStatus(item, nextStatus);
                        }}
                        className={cn(
                          "shrink-0 p-2 text-white rounded-xl transition-all shadow-lg active:scale-95 pointer-events-auto",
                          item.status === 'ordered' ? "bg-amber-500 shadow-amber-500/20 hover:bg-amber-600" :
                          item.status === 'received' ? "bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600" :
                          "bg-zinc-500 shadow-zinc-500/20 hover:bg-zinc-600"
                        )}
                        title={item.status === 'ordered' ? 'Mark Received' : 
                               item.status === 'received' ? 'Mark Processed' : 'Revert to Received'}
                      >
                        {item.status === 'ordered' ? <MapPin className="w-4 h-4" /> :
                         item.status === 'received' ? <CheckCircle className="w-4 h-4" /> :
                         <Clock className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="space-y-2 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 relative z-10 pointer-events-none">
                      <div className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                        {item.location || (item.type === 'part' ? 'DELIVER TO SHOP' : 'OFFICE STAGING')}
                      </div>
                      {(item.notes || item.jobTitle) && (
                        <div className="flex flex-col gap-1 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                          {item.jobTitle && (
                            <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-tight">
                              FOR: {item.jobTitle}
                            </div>
                          )}
                          {item.notes && (
                            <div className="text-[10px] text-zinc-500 italic flex items-start gap-1">
                              <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                              {item.notes}
                            </div>
                          )}
                        </div>
                      )}
                      {((item.images && item.images.length > 0) || item.imageUrl || item.photoUrl || item.partImageUrl) && (
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 mt-2 custom-scrollbar">
                          {(item.images?.length > 0 ? item.images : [item.imageUrl || item.photoUrl || item.partImageUrl].filter(Boolean)).map((img: string, i: number) => (
                            <div key={i} className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 border border-zinc-200 dark:border-zinc-700 shadow-sm relative group/img">
                              <img src={img} alt={`Item ${i+1}`} className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-300" />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1 mt-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                          <User className="w-3 h-3" />
                          {item.receivedBy || item.requestedBy || 'Staff'}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-medium">
                          {item.type === 'part' ? 'Part Arrived' : 'Package Arrived'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {hasMore && (
                  <button 
                    onClick={() => setDisplayLimit(prev => prev + 10)}
                    className="w-full py-3 mt-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-indigo-500 transition-colors"
                  >
                    Load More Items ({allReceived.length - displayLimit} remaining)
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
