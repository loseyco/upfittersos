import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  AlertTriangle, Package, MapPin, Clock, ChevronRight, Filter, AlertCircle, Car, Warehouse, ListChecks,
  Maximize, Minimize
} from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { cn } from '../../lib/utils';
import { toast, Toaster } from 'sonner';
import { useWakeLock } from '../../hooks/useWakeLock';
import { ZoneDetailsModal } from './ZoneModals';
import { useAuthStore } from '../../lib/auth/store';
import { VehicleDetailsModal } from './VehiclesManager';
import { ConfirmModal } from '../../components/ConfirmModal';

export function ForemanDashboard({ tenantId, onTabChange }: { tenantId: string, onTabChange: (tabId: string, state?: any) => void }) {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [zones, setZones] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const selectedZone = selectedZoneId ? zones.find(z => z.id === selectedZoneId) : null;
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  useEffect(() => {
    if (!tenantId) return;
    
    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), snap => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    });
    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), snap => {
      setVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    });
    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), snap => {
      setAllJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    });
    const unsubParts = onSnapshot(collection(db, `businesses/${tenantId}/parts_requests`), snap => {
      setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    });

    return () => {
      unsubZones();
      unsubVehicles();
      unsubJobs();
      unsubParts();
    };
  }, [tenantId]);

  const [searchQuery, setSearchQuery] = useState('');

  const calculateDuration = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 0) return 'Just now';
    
    const months = Math.floor(diff / (86400 * 30));
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    
    if (months > 0) return `${months} month${months > 1 ? 's' : ''}`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
    if (mins > 0) return `${mins} min${mins > 1 ? 's' : ''}`;
    return 'Just now';
  };

  const matchesSearch = (zone: any, job: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (zone.name?.toLowerCase().includes(q)) return true;
    if (zone.currentVehicleVin?.toLowerCase().includes(q)) return true;
    if (job?.title?.toLowerCase().includes(q)) return true;
    if (job?.jobNumber?.toLowerCase().includes(q)) return true;
    if (zone.currentVehicleVins?.some((v: string) => v.toLowerCase().includes(q))) return true;
    return false;
  };

  // 1. Bays & Parking Spots (Sorted by oldest update)
  const sortByOldest = (a: any, b: any) => {
    const timeA1 = a.lastAssignedAt?.seconds || 0;
    const timeA2 = a.updatedAt?.seconds || 0;
    const timeB1 = b.lastAssignedAt?.seconds || 0;
    const timeB2 = b.updatedAt?.seconds || 0;
    const timeA = Math.max(timeA1, timeA2);
    const timeB = Math.max(timeB1, timeB2);
    return timeA - timeB; // Oldest first (needs update the most)
  };

  const occupiedBays = zones.filter(z => z.type === 'bay' && !!z.currentVehicleVin);
  const totalBays = zones.filter(z => z.type === 'bay').length;

  const occupiedParking = zones.filter(z => (z.type === 'lot' || z.type === 'parking') && (!!z.currentVehicleVin || (z.currentVehicleVins && z.currentVehicleVins.length > 0)));
  const totalParking = zones.filter(z => z.type === 'lot' || z.type === 'parking').length;

  // List arrays
  const displayedBays = zones.filter(z => z.type === 'bay')
    .filter(z => matchesSearch(z, allJobs.find(j => j.id === z.currentJobId)))
    .sort(sortByOldest);

  const displayedParking = zones.filter(z => (z.type === 'lot' || z.type === 'parking'))
    .filter(z => matchesSearch(z, allJobs.find(j => j.id === z.currentJobId)))
    .sort(sortByOldest);

  // 2. Active Blockers
  const activeBlockers = allJobs.filter(j => 
    j.status === 'Blocked' || 
    (j.blockers || []).some((b: any) => b.status === 'active') ||
    j.blocker
  );

  // 3. Due Soon / Overdue
  let dueSoonCount = 0;
  let overdueCount = 0;
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;

  allJobs.forEach(j => {
    if (['Closed', 'Completed', 'Ready for Customer', 'Ready for QA'].includes(j.status)) return;
    
    // Check zones for this job's ETA first, fallback to job's ETA
    const zone = zones.find(z => z.currentJobId === j.id);
    const etaRaw = zone?.eta || j.expectedFinishTime || j.eta;
    
    if (!etaRaw) return;
    const etaDate = typeof etaRaw.toDate === 'function' ? etaRaw.toDate() : new Date(etaRaw);
    const diffMs = etaDate.getTime() - now;
    
    if (diffMs < 0) {
      overdueCount++;
    } else if (diffMs < twentyFourHours) {
      dueSoonCount++;
    }
  });

  // 4. Pending Parts
  const pendingParts = partsRequests.filter(pr => 
    pr.status === 'pending' || pr.status === 'ordered'
  );

  // Pending Tasks section removed as it's no longer used in the UI

  // Automated To-Do List Generator
  const automatedTodos: {
    id: string;
    type: 'blocker' | 'part_needed' | 'stale_bay' | 'overdue_job' | 'missing_info';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    zoneId?: string;
    timestamp?: any;
    jobId?: string;
  }[] = [];

  // 1. Blockers (High)
  activeBlockers.forEach(job => {
    const zone = zones.find(z => z.currentJobId === job.id);
    const blockerMsg = (job.blockers?.find((b: any) => b.status === 'active')?.message) || job.blocker || 'Blocked';
    automatedTodos.push({
      id: `blocker-${job.id}`,
      type: 'blocker',
      priority: 'high',
      title: `Blocked: ${job.title}`,
      description: blockerMsg,
      zoneId: zone?.id,
      timestamp: job.updatedAt,
      jobId: job.id
    });
  });

  // 2. Overdue Jobs (High)
  allJobs.forEach(job => {
    if (['Closed', 'Completed', 'Ready for Customer', 'Ready for QA'].includes(job.status)) return;
    const zone = zones.find(z => z.currentJobId === job.id);
    const etaRaw = zone?.eta || job.expectedFinishTime || job.eta;
    if (!etaRaw) return;
    const etaDate = typeof etaRaw.toDate === 'function' ? etaRaw.toDate() : new Date(etaRaw);
    if (etaDate.getTime() < now) {
      automatedTodos.push({
        id: `overdue-${job.id}`,
        type: 'overdue_job',
        priority: 'high',
        title: `Overdue: ${job.title}`,
        description: `Passed ETA. Needs status check.`,
        zoneId: zone?.id,
        timestamp: etaRaw,
        jobId: job.id
      });
    }
  });

  // 3. Stale Bays & Missing Info
  occupiedBays.forEach(bay => {
    const ts = bay.updatedAt || bay.lastAssignedAt;
    if (ts) {
      const time = ts.seconds ? ts.seconds * 1000 : new Date(ts).getTime();
      if (now - time > 14400000) { // 4 hours
        automatedTodos.push({
          id: `stale-${bay.id}`,
          type: 'stale_bay',
          priority: 'medium',
          title: `Check Bay: ${bay.name}`,
          description: `No updates in over 4 hours.`,
          zoneId: bay.id,
          timestamp: ts
        });
      }
    }
    
    // Missing Job/Customer
    if (!bay.currentJobId) {
      automatedTodos.push({
        id: `missing-job-${bay.id}`,
        type: 'missing_info',
        priority: 'low',
        title: `Missing Info: ${bay.name}`,
        description: `Vehicle is in bay without an assigned job.`,
        zoneId: bay.id,
        timestamp: ts
      });
    }
  });

  // 4. Pending Parts (Medium/High)
  pendingParts.forEach(part => {
    const job = allJobs.find(j => j.id === part.jobId);
    automatedTodos.push({
      id: `part-${part.id}`,
      type: 'part_needed',
      priority: part.status === 'pending' ? 'high' : 'medium',
      title: part.status === 'pending' ? `Order Part: ${part.partName}` : `Awaiting Part: ${part.partName}`,
      description: job ? `For Job: ${job.title}` : `Requested by ${part.requestedByName}`,
      zoneId: part.zoneId,
      timestamp: part.createdAt
    });
  });

  // Sort: High -> Medium -> Low
  const priorityWeight = { high: 3, medium: 2, low: 1 };
  automatedTodos.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

  const handleAssignVehicle = async (zoneId: string, vin: string, actionType: 'assign' | 'clear' | 'remove' | 'remove_job' = 'assign', jobId?: string) => {
    try {
      const trimmedVin = vin?.trim().toUpperCase();
      const zone = zones.find(z => z.id === zoneId);
      const previousVin = zone?.currentVehicleVin || null;
      const previousJobId = zone?.currentJobId || null;

      // AUTO-MOVE: If this VIN or Job is already in another zone, clear it from there first
      if (actionType === 'assign' && (trimmedVin || jobId)) {
        const otherZones = zones.filter(z => z.id !== zoneId);
        for (const oz of otherZones) {
          let needsClear = false;
          if (trimmedVin && oz.currentVehicleVin === trimmedVin) needsClear = true;
          else if (jobId && oz.currentJobId === jobId) needsClear = true;
          else if (trimmedVin && oz.currentVehicleVins?.includes(trimmedVin)) needsClear = true;
          
          if (needsClear) {
            await updateDoc(doc(db, `businesses/${tenantId}/zones`, oz.id), { 
              currentVehicleVin: null, 
              currentJobId: null,
              currentVehicleVins: (oz.currentVehicleVins || []).filter((v: string) => v !== trimmedVin),
              updatedAt: serverTimestamp()
            });
          }
        }
      }

      if (zone?.allowMultiple) {
        let newVins = [...(zone.currentVehicleVins || [])];
        if (actionType === 'assign' && trimmedVin) {
          if (!newVins.includes(trimmedVin)) newVins.push(trimmedVin);
        } else if (actionType === 'remove' && trimmedVin) {
          newVins = newVins.filter(v => v !== trimmedVin);
        } else if (actionType === 'clear') {
          newVins = [];
        }
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), { 
          currentVehicleVins: newVins,
          lastAssignedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), {
          currentVehicleVin: actionType === 'clear' ? null : trimmedVin || previousVin,
          currentJobId: actionType === 'clear' || actionType === 'remove_job' ? null : jobId || previousJobId,
          lastAssignedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
        zoneId,
        zoneName: zone?.name || 'Unknown',
        vin: trimmedVin || null,
        jobId: jobId || null,
        action: actionType === 'clear' ? 'cleared' : 'assigned',
        assignedAt: serverTimestamp(),
        assignedBy: user?.uid || 'system',
        assignedByName: user?.displayName || user?.email || 'Staff'
      });

      toast.success(actionType === 'clear' ? 'Zone cleared' : 'Update successful');
    } catch (e) {
      console.error(e);
      toast.error('Failed to update zone');
    }
  };

  const renderZoneCard = (bay: any) => {
    const vinsToRender = (bay.allowMultiple && bay.currentVehicleVins && bay.currentVehicleVins.length > 0)
      ? bay.currentVehicleVins
      : [bay.currentVehicleVin].filter(Boolean);

    if (vinsToRender.length === 0) return null;

    return vinsToRender.map((vin: string, index: number) => {
      const vehicle = vehicles?.find((v: any) => v.vin === vin) as any;
      const jobId = (bay.currentJobId && index === 0 && !vehicle?.jobId) ? bay.currentJobId : vehicle?.jobId;
      const job = allJobs?.find((j: any) => j.id === jobId) as any;
      const customerName = (index === 0 && bay.customerName && !vehicle?.customerName && !job?.customerName) ? bay.customerName : (vehicle?.customerName || job?.customerName);
      const assignedStaff = job?.assignedStaff || (index === 0 ? bay.assignedStaff : null);
      const assignedStaffDisplay = assignedStaff?.length > 0 ? assignedStaff.map((s: any) => s.name).join(', ') : null;
      
      const vehicleDisplay = vehicle 
        ? (`${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || `VIN: ${vin}`) 
        : (vin ? `VIN: ${vin}` : 'Unlinked');
      const timestamp = bay.lastAssignedAt || bay.updatedAt;
      const hasVehicle = true; // since vin exists

      const itemKey = `${bay.id}-${vin}-${index}`;

      return (
        <div 
          key={itemKey} 
          onClick={() => setSelectedZoneId(bay.id)}
          className="relative group/item cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors rounded-xl px-2 -mx-2"
        >
          <div className="flex items-center justify-between py-2 border-b border-zinc-200 dark:border-zinc-800/50 last:border-0 group-hover/item:border-transparent">
          <div className="flex flex-col min-w-0 flex-1 mr-2 text-left">
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-400 dark:text-zinc-500 w-20 sm:w-24 truncate shrink-0 text-xs sm:text-sm">{bay.name}</span>
              <span 
                className={cn("truncate font-bold text-sm sm:text-base transition-colors", vehicle ? "text-zinc-900 dark:text-white hover:text-indigo-500" : "text-zinc-900 dark:text-white")}
                onClick={(e) => {
                  if (vehicle) {
                    e.stopPropagation();
                    setSelectedVehicle(vehicle);
                  }
                }}
              >
                {vehicleDisplay}
              </span>
            </div>
            {hasVehicle && (
              <div className="flex flex-wrap items-center gap-1.5 pl-[88px] sm:pl-[104px] text-[10px] sm:text-xs text-zinc-400 truncate">
                {job ? (
                  <span 
                    className="text-emerald-500 font-bold uppercase tracking-tight hover:text-emerald-400 transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (jobId) {
                        searchParams.set('jobId', jobId);
                        setSearchParams(searchParams);
                      }
                    }}
                  >
                    {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title}
                  </span>
                ) : (
                  <span className="text-red-500 font-black uppercase tracking-[0.1em] text-[10px]">
                    Missing Job
                  </span>
                )}
                {customerName ? (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-700">•</span>
                    <span className="truncate">{customerName}</span>
                  </>
                ) : !job && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-700">•</span>
                    <span className="text-red-500 font-black uppercase tracking-[0.1em] text-[10px]">
                      Missing Customer
                    </span>
                  </>
                )}
                {assignedStaffDisplay && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-700">•</span>
                    <span className="truncate text-indigo-500 font-bold">{assignedStaffDisplay}</span>
                  </>
                )}
              </div>
            )}
          </div>
          {(() => {
            if (!timestamp) return <span className="text-zinc-400 font-mono font-bold whitespace-nowrap text-sm">---</span>;
            
            // Arrival time for duration calculation
            const arrivalTime = timestamp.seconds ? timestamp.seconds * 1000 : new Date(timestamp).getTime();
            const arrivalHours = (Date.now() - arrivalTime) / (1000 * 60 * 60);
            const colorClass = arrivalHours >= 48 ? 'text-red-500' : arrivalHours >= 24 ? 'text-amber-500' : 'text-emerald-500';
            
            // Last activity time for the label (always use updatedAt if available)
            const activityTs = bay.updatedAt || timestamp;
            const activityTime = activityTs.seconds ? activityTs.seconds * 1000 : new Date(activityTs).getTime();
            const updateHours = (Date.now() - activityTime) / (1000 * 60 * 60);
            const updColorClass = updateHours >= 4 ? 'text-red-500' : updateHours >= 2 ? 'text-amber-500' : 'text-emerald-500';
            
            return (
              <div className="flex flex-col items-end shrink-0">
                <span className={`${colorClass} font-mono font-bold whitespace-nowrap text-xs sm:text-sm`}>
                  <span className="text-[9px] uppercase tracking-tighter opacity-70 mr-1">{bay.type === 'bay' ? 'IN BAY:' : 'PARKED:'}</span>
                  {calculateDuration(timestamp)}
                </span>
                {(() => {
                  const etaRaw = job?.expectedFinishTime || job?.eta || bay.eta;
                  if (!etaRaw) return (
                    <span className="text-[8px] font-medium uppercase tracking-tighter text-zinc-400">
                      No ETA
                    </span>
                  );
                  const etaDate = typeof etaRaw.toDate === 'function' ? etaRaw.toDate() : new Date(etaRaw);
                  const diffMs = etaDate.getTime() - Date.now();
                  const isOverdue = diffMs < 0;
                  const absDiff = Math.abs(diffMs);
                  const h = Math.floor(absDiff / 3600000);
                  const m = Math.floor((absDiff % 3600000) / 60000);
                  const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
                  
                  return (
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-tighter px-1.5 py-0.5 rounded-sm mt-0.5",
                      isOverdue ? "bg-red-500 text-white animate-blink" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    )}>
                      {isOverdue ? `Overdue ${label}` : `Due in ${label}`}
                    </span>
                  );
                })()}
                <span className={`text-[9px] sm:text-[10px] font-medium uppercase tracking-tighter mt-0.5 ${updColorClass}`}>
                  UPD: {calculateDuration(activityTs)}{calculateDuration(activityTs) === 'Just now' ? '' : ' ago'}
                </span>
              </div>
            );
          })()}
        </div>
      </div>
      );
    });
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-4 duration-500",
        isFullscreen ? "p-2 space-y-2 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar" : "space-y-8"
      )}
    >
      <Toaster position="top-right" richColors theme="system" closeButton />
      <div className={cn(
        "flex flex-col sm:flex-row items-center justify-end gap-3 w-full relative z-10",
        !isFullscreen && "sm:-mt-20"
      )}>
        {isFullscreen && (
          <div className="mr-auto flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Foreman Dashboard</span>
            <span className="text-[10px] font-bold text-zinc-500">• Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        )}
        <button 
          onClick={toggleFullscreen}
          className="w-full sm:w-auto px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Filter className="w-5 h-5 text-zinc-400" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter bays by VIN, Job #, or Bay Name..."
          className={cn(
            "w-full pl-12 pr-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white",
            isFullscreen ? "py-1.5" : "py-3"
          )}
        />
      </div>

      {/* KPIs Header */}
      <div className={cn(
        "grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
        isFullscreen ? "gap-2" : "gap-4"
      )}>
        <div className={cn(
          "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col justify-between",
          isFullscreen ? "p-2" : "p-4"
        )}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-500/10 rounded-lg"><AlertTriangle className="w-4 h-4 text-red-500" /></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 line-clamp-1">Blockers</p>
          </div>
          <p className="text-2xl font-black text-zinc-900 dark:text-white">{activeBlockers.length}</p>
        </div>
        
        <div className={cn(
          "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col justify-between",
          isFullscreen ? "p-2" : "p-4"
        )}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-500/10 rounded-lg"><Warehouse className="w-4 h-4 text-indigo-500" /></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 line-clamp-1">Bays</p>
          </div>
          <p className="text-2xl font-black text-zinc-900 dark:text-white">
            {occupiedBays.length} <span className="text-sm font-bold text-zinc-400">/ {totalBays}</span>
          </p>
        </div>

        <div className={cn(
          "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col justify-between",
          isFullscreen ? "p-2" : "p-4"
        )}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-500/10 rounded-lg"><Car className="w-4 h-4 text-emerald-500" /></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 line-clamp-1">Parking</p>
          </div>
          <p className="text-2xl font-black text-zinc-900 dark:text-white">
            {occupiedParking.length} <span className="text-sm font-bold text-zinc-400">/ {totalParking}</span>
          </p>
        </div>

        <div className={cn(
          "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col justify-between",
          isFullscreen ? "p-2" : "p-4"
        )}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500/10 rounded-lg"><Clock className="w-4 h-4 text-amber-500" /></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 line-clamp-1">Due {'<'} 24h</p>
          </div>
          <p className="text-2xl font-black text-zinc-900 dark:text-white">{dueSoonCount}</p>
        </div>

        <div className={cn(
          "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col justify-between",
          isFullscreen ? "p-2" : "p-4"
        )}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-500/10 rounded-lg"><AlertCircle className="w-4 h-4 text-red-500" /></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 line-clamp-1">Overdue</p>
          </div>
          <p className="text-2xl font-black text-zinc-900 dark:text-white">{overdueCount}</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500/10 rounded-lg"><Package className="w-4 h-4 text-amber-500" /></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 line-clamp-1">Parts</p>
          </div>
          <p className="text-2xl font-black text-zinc-900 dark:text-white">{pendingParts.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Priority 1: Automated To-Do List */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-indigo-500" /> 
              Automated To-Do List
            </h2>
            <span className="px-2 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-full">{automatedTodos.length} Items</span>
          </div>
          <div className="flex-1 space-y-3">
            {automatedTodos.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 italic p-8">
                <ListChecks className="w-8 h-8 mb-2 opacity-20" />
                <p>All clear! No automated items.</p>
              </div>
            ) : (
              automatedTodos.map(todo => {
                let icon;
                let bgClass = "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300";
                let textClass = "text-zinc-600 dark:text-zinc-400";
                
                if (todo.priority === 'high') {
                  bgClass = "bg-red-500/5 border-red-500/20 hover:bg-red-500/10";
                  textClass = "text-red-600 dark:text-red-400";
                } else if (todo.priority === 'medium') {
                  bgClass = "bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10";
                  textClass = "text-amber-600 dark:text-amber-400";
                }

                switch (todo.type) {
                  case 'blocker': icon = <AlertTriangle className="w-3.5 h-3.5 shrink-0" />; break;
                  case 'part_needed': icon = <Package className="w-3.5 h-3.5 shrink-0" />; break;
                  case 'overdue_job': icon = <AlertCircle className="w-3.5 h-3.5 shrink-0" />; break;
                  case 'stale_bay': icon = <Clock className="w-3.5 h-3.5 shrink-0" />; break;
                  case 'missing_info': icon = <MapPin className="w-3.5 h-3.5 shrink-0" />; break;
                }

                return (
                  <div 
                    key={todo.id} 
                    onClick={() => {
                      if (todo.jobId && (todo.type === 'overdue_job' || todo.type === 'blocker')) {
                        searchParams.set('jobId', todo.jobId);
                        setSearchParams(searchParams);
                      } else if (todo.zoneId) {
                        setSelectedZoneId(todo.zoneId);
                      }
                    }} 
                    className={cn("p-4 border rounded-xl transition-all", (todo.zoneId || todo.jobId) && "cursor-pointer hover:shadow-md", bgClass)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <span className={textClass}>{icon}</span>
                        {todo.title}
                      </h4>
                      {todo.priority === 'high' && <span className="text-[9px] font-black uppercase bg-red-500/10 text-red-600 px-1.5 py-0.5 rounded">High</span>}
                    </div>
                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{todo.description}</p>
                    {todo.timestamp && (
                      <div className="mt-3 text-[10px] text-zinc-500 font-mono">
                        {calculateDuration(todo.timestamp)} ago
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Priority 2: Bays Needing Updates */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-500" /> 
              Bays (Needs Update First)
            </h2>
          </div>
          <div className="flex-1 space-y-3">
            {displayedBays.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 italic p-8">
                <p>No bays match.</p>
              </div>
            ) : (
              displayedBays.map(renderZoneCard)
            )}
          </div>
        </section>

        {/* Priority 3: Parking Spots */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <MapPin className="w-5 h-5 text-slate-500" /> 
              Parking Spots
            </h2>
          </div>
          <div className="flex-1 space-y-3">
            {displayedParking.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 italic p-8">
                <p>No parking matches.</p>
              </div>
            ) : (
              displayedParking.map(renderZoneCard)
            )}
          </div>
        </section>

        {/* Priority 3: Pending Parts */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" /> 
              Pending Parts Requests
            </h2>
            <button onClick={() => onTabChange('parts')} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Go to Parts Dept <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pendingParts.length === 0 ? (
              <p className="text-zinc-500 italic p-4 md:col-span-2 xl:col-span-3 text-center bg-zinc-50 dark:bg-zinc-950 rounded-xl">All parts requests fulfilled.</p>
            ) : (
              pendingParts.map(part => {
                const job = allJobs.find(j => j.id === part.jobId);
                const zone = zones.find(z => z.id === part.zoneId);
                return (
                  <div key={part.id} className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-bold text-sm text-zinc-900 dark:text-white line-clamp-2">{part.partName}</p>
                      <span className={cn("px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ml-2 shrink-0", 
                        part.status === 'ordered' ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600"
                      )}>{part.status || 'Pending'}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800/50 flex justify-between items-end">
                      <div>
                        {job && <p className="text-[10px] font-bold text-zinc-500 uppercase truncate max-w-[150px]">Job: {job.title}</p>}
                        {zone && <p className="text-[10px] font-bold text-indigo-500 uppercase">{zone.name}</p>}
                      </div>
                      <p className="text-[10px] text-zinc-400">By {part.requestedByName?.split(' ')[0]}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

      </div>

      {selectedZone && (
        <ZoneDetailsModal
          zone={selectedZone}
          tenantId={tenantId}
          vehicles={vehicles}
          jobs={allJobs}
          partsRequests={partsRequests}
          onClose={() => setSelectedZoneId(null)}
          onAssign={(vin: string, jobId?: string) => handleAssignVehicle(selectedZone.id, vin, 'assign', jobId)}
          onClear={() => handleAssignVehicle(selectedZone.id, '', 'clear')}
          onRemoveVehicle={(vin: string) => handleAssignVehicle(selectedZone.id, vin, 'remove')}
          onRemoveJob={() => handleAssignVehicle(selectedZone.id, selectedZone.currentVehicleVin || '', 'remove_job')}
          onDelete={() => {}}
          onQuickAddRequest={() => {}}
          onQuickAddJobRequest={() => {}}
          onOpenVehicle={(vin: string) => {
            const v = vehicles.find(veh => veh.vin === vin);
            if (v) setSelectedVehicle(v);
          }}
        />
      )}

      {selectedVehicle && (
        <VehicleDetailsModal
          tenantId={tenantId}
          vehicle={selectedVehicle}
          onClose={() => setSelectedVehicle(null)}
          onConfirmAction={setConfirmConfig}
          onEdit={() => {}} 
          getSource={(row: any) => {
            const isQB = row.tags?.includes('QuickBooks') || row.notes?.includes('Imported via QBWC') || !!row.ListID || !!row.qb_ListID || !!row.quickbooksId;
            return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${isQB ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20'}`}>{isQB ? 'QuickBooks' : 'Native'}</span>;
          }}
        />
      )}

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
