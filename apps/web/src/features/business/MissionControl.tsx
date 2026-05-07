import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  CheckSquare, TrendingUp, 
  Clock, AlertCircle, ArrowRight, Car, Warehouse, Truck, Search, Command, Package, FileText
} from 'lucide-react';
import { 
  collection, getDocs, limit, query, orderBy,
  getCountFromServer, onSnapshot, doc, updateDoc, 
  addDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { useSearchStore } from '../../lib/store/searchStore';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { ShopFloorActivity } from './ShopFloorActivity';
import { ZoneDetailsModal } from './ZoneModals';
import { QuickAddVehicleModal } from './VehicleSelector';
import { VehicleDetailsModal } from './VehiclesManager';
import { QuickAddJobModal } from './JobSelectionComponents';
import { ConfirmModal } from '../../components/ConfirmModal';

interface MissionControlProps {
  tenantId: string;
  onTabChange: (tabId: string) => void;
}

export function MissionControl({ tenantId, onTabChange }: MissionControlProps) {
  const { open: openSearch } = useSearchStore();
  // Stats fetching
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['mission-control-stats', tenantId],
    queryFn: async () => {
      const collections = ['customers', 'jobs', 'inventory_items', 'tasks', 'vehicles'];
      const results = await Promise.all(
        collections.map(async (col) => {
          const coll = collection(db, `businesses/${tenantId}/${col}`);
          const snapshot = await getCountFromServer(coll);
          return { name: col, count: snapshot.data().count };
        })
      );
      return results.reduce((acc, curr) => ({ ...acc, [curr.name]: curr.count }), {} as Record<string, number>);
    }
  });

  // Recent activity fetching
  const { data: recentJobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['mission-control-recent-jobs', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/jobs`),
        orderBy('updatedAt', 'desc'),
        limit(5)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });

  const [zones, setZones] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const selectedZone = selectedZoneId ? zones.find(z => z.id === selectedZoneId) : null;
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [quickAddVin, setQuickAddVin] = useState<{zoneId: string, vin: string} | null>(null);
  const [quickAddJob, setQuickAddJob] = useState<{zoneId: string, title: string, vin: string | null} | null>(null);
  const { user } = useAuthStore();

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
              currentVehicleVins: (oz.currentVehicleVins || []).filter((v: string) => v !== trimmedVin)
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
          lastAssignedAt: serverTimestamp() 
        });
      } else {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), {
          currentVehicleVin: actionType === 'clear' ? null : trimmedVin || previousVin,
          currentJobId: actionType === 'clear' || actionType === 'remove_job' ? null : jobId || previousJobId,
          lastAssignedAt: serverTimestamp()
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

      toast.success(actionType === 'clear' ? 'Zone cleared' : 'Vehicle assigned');
    } catch (err) {
      console.error(err);
      toast.error("Operation failed");
    }
  };

  // Real-time Listeners
  useEffect(() => {
    if (!tenantId) return;
    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), snap => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), snap => {
      setVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), snap => {
      setAllJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubParts = onSnapshot(collection(db, `businesses/${tenantId}/parts_requests`), snap => {
      setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => {
      unsubZones();
      unsubVehicles();
      unsubJobs();
      unsubParts();
    };
  }, [tenantId]);

  const zonesLoading = zones.length === 0 && !tenantId;

  // Shipments Fetching
  const { data: shipments, isLoading: shipmentsLoading } = useQuery({
    queryKey: ['mission-control-shipments', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/shipments`),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });



  const activeShipments = shipments?.filter((s: any) => s.status !== 'delivered') || [];
  const activeShipmentsCount = activeShipments.length;
  const bays = zones?.filter((z: any) => z.type === 'bay') || [];
  const totalBays = bays.length;
  const occupiedBaysList = bays.filter((z: any) => !!z.currentVehicleVin);
  const occupiedBays = occupiedBaysList.length;
  const parkingZones = zones?.filter((z: any) => z.type === 'lot' || z.type === 'parking') || [];
  const totalParking = parkingZones.length;
  const occupiedParkingList = parkingZones.filter((z: any) => !!z.currentVehicleVin);
  const occupiedParking = occupiedParkingList.length;

  const sortByRecent = (a: any, b: any) => {
    const timeA = (a.lastAssignedAt?.seconds || a.updatedAt?.seconds || 0);
    const timeB = (b.lastAssignedAt?.seconds || b.updatedAt?.seconds || 0);
    return timeB - timeA;
  };

  const sortedBays = [...occupiedBaysList].sort(sortByRecent);
  const sortedParking = [...occupiedParkingList].sort(sortByRecent);

  const blockedJobsCount = allJobs?.filter((j: any) => j.status === 'Blocked').length || 0;
  const activeJobsCount = allJobs?.filter((j: any) => j.status !== 'Closed' && j.status !== 'Completed' && j.status !== 'Blocked').length || 0;
  const vehiclesOnSiteCount = zones?.reduce((acc: number, z: any) => {
    if (z.allowMultiple && z.currentVehicleVins) return acc + z.currentVehicleVins.length;
    if (z.currentVehicleVin) return acc + 1;
    return acc;
  }, 0) || 0;

  const jobsMissingPartsCount = new Set(
    partsRequests?.filter((pr: any) => pr.jobId && ['pending', 'ordered', 'requested'].includes((pr.status || 'pending').toLowerCase()))
      .map((pr: any) => pr.jobId)
  ).size;

  const kpis = [
    { label: 'Active Jobs', value: activeJobsCount, icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-500/10', tab: 'jobs', loading: statsLoading },
    { label: 'Missing Parts', value: jobsMissingPartsCount, icon: Package, color: 'text-amber-500', bg: 'bg-amber-500/10', tab: 'parts', loading: false },
    { label: 'Blocked Jobs', value: blockedJobsCount, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10', tab: 'jobs', loading: statsLoading },
    { label: 'Pending Tasks', value: stats?.tasks ?? 0, icon: CheckSquare, color: 'text-purple-500', bg: 'bg-purple-500/10', tab: 'tasks', loading: statsLoading },
    { label: 'Active Shipments', value: activeShipmentsCount, icon: Truck, color: 'text-orange-500', bg: 'bg-orange-500/10', tab: 'shipments', loading: shipmentsLoading },
    { label: 'Vehicles On Site', value: vehiclesOnSiteCount, icon: Car, color: 'text-indigo-500', bg: 'bg-indigo-500/10', tab: 'vehicles', loading: statsLoading },
  ];



  const calculateDuration = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 0) return '0m';
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  // Generate Actionable Alerts
  const alerts: any[] = [];
  
  // 1. Shipment Exceptions
  shipments?.forEach((s: any) => {
    if (s.status === 'exception') {
      alerts.push({
        id: `ship-${s.id}`,
        title: `Shipment Issue: ${s.carrier} ${s.trackingNumber}`,
        description: s.description || 'Action required to resolve shipment.',
        type: 'danger',
        icon: AlertCircle,
        onClick: () => onTabChange('shipments')
      });
    }
  });

  // 2. Parts Requested (Not yet ordered)
  partsRequests?.forEach((pr: any) => {
    const status = (pr.status || 'pending').toLowerCase();
    if (status === 'pending' || status === 'requested') {
      alerts.push({
        id: `part-${pr.id}`,
        title: `Part Requested: ${pr.partName || 'Unknown Part'}`,
        description: `Requested by ${pr.createdByName || pr.requestedBy || 'Staff'}${pr.jobId ? ' for a job' : ''}`,
        type: pr.urgency === 'urgent' ? 'danger' : 'warning',
        icon: Package,
        onClick: () => {
          if (pr.jobId) onTabChange(`jobs/${pr.jobId}`);
          else onTabChange('parts');
        }
      });
    }
  });

  // 3. Inactive Jobs
  recentJobs?.forEach((job: any) => {
    if (job.status !== 'Closed' && job.status !== 'Completed' && job.updatedAt) {
      const updatedTime = new Date(job.updatedAt.seconds ? job.updatedAt.seconds * 1000 : job.updatedAt).getTime();
      const days = (Date.now() - updatedTime) / (1000 * 60 * 60 * 24);
      if (days > 7 && job.status !== 'Blocked') {
        alerts.push({
          id: `job-${job.id}`,
          title: `Inactive Job: ${job.title || 'Untitled'}`,
          description: `No updates in ${Math.floor(days)} days. Status: ${job.status || 'Unknown'}`,
          type: 'warning',
          icon: Clock,
          onClick: () => onTabChange(`jobs/${job.id}`)
        });
      }
    }
  });

  // 4. Overdue Jobs
  allJobs?.forEach((job: any) => {
    if (job.status !== 'Closed' && job.status !== 'Completed' && (job.expectedFinishTime || job.eta)) {
      const eta = job.expectedFinishTime || job.eta;
      const etaTime = typeof eta?.toDate === 'function' ? eta.toDate().getTime() : new Date(eta).getTime();
      if (etaTime && etaTime < Date.now()) {
        alerts.push({
          id: `overdue-job-${job.id}`,
          title: `Overdue Job: ${job.jobNumber ? `#${job.jobNumber} ` : ''}${job.title || 'Untitled'}`,
          description: `ETA was ${new Date(etaTime).toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${new Date(etaTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
          type: 'danger',
          icon: Clock,
          onClick: () => onTabChange(`jobs/${job.id}`)
        });
      }
    }
  });

  // 5. Blocked Jobs
  allJobs?.forEach((job: any) => {
    if (job.status === 'Blocked') {
      const legacyBlocker = job.blocker ? [{ message: job.blocker, status: 'active' }] : [];
      const activeBlockers = (job.blockers || legacyBlocker).filter((b: any) => b.status === 'active');
      alerts.push({
        id: `blocked-job-${job.id}`,
        title: `Job Blocked: ${job.jobNumber ? `#${job.jobNumber} ` : ''}${job.title || 'Untitled'}`,
        description: activeBlockers.length > 0 
          ? activeBlockers.map((b: any) => b.message).join(' | ') 
          : 'Job marked as blocked',
        type: 'danger',
        icon: AlertCircle,
        onClick: () => onTabChange(`jobs/${job.id}`)
      });
    }
  });

  const handleGenerateReport = () => {
    const today = new Date().toLocaleDateString();
    
    let report = `Daily Shop Report - ${today}\n\n`;
    report += `📊 KEY METRICS:\n`;
    kpis.forEach(kpi => {
      report += `- ${kpi.label}: ${kpi.value}\n`;
    });
    
    report += `\n🚨 ACTION REQUIRED:\n`;
    if (alerts.length === 0) {
      report += `- All clear!\n`;
    } else {
      alerts.forEach(alert => {
        report += `- ${alert.title} | ${alert.description}\n`;
      });
    }

    report += `\n🔧 SHOP FLOOR:\n`;
    report += `- Full Bays: ${sortedBays.length}\n`;
    report += `- Full Parking Spots: ${sortedParking.length}\n`;

    const subject = encodeURIComponent(`Daily Shop Report - ${today}`);
    const body = encodeURIComponent(report);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="space-y-4 sm:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white hidden md:block">Mission Control</h1>
        <button 
          onClick={handleGenerateReport}
          className="w-full md:w-auto px-4 py-2 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <FileText className="w-4 h-4" />
          Email Daily Report
        </button>
      </div>

      {/* Compact Ultimate Search Bar */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
        </div>
        <input
          type="text"
          placeholder="Quick search customers, vehicles, bays, or staff..."
          onFocus={() => openSearch()}
          onChange={(e) => openSearch(e.target.value)}
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl py-4 pl-12 pr-24 shadow-sm hover:border-indigo-500/50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400 font-medium"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <Command className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] font-black text-zinc-500">F</span>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-3 md:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            onClick={() => onTabChange(kpi.tab)}
            className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-6 shadow-sm hover:border-indigo-500/50 transition-all text-left active:scale-[0.98]"
          >
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <div className={`p-2 sm:p-3 rounded-xl ${kpi.bg}`}>
                <kpi.icon className={`w-4 h-4 sm:w-6 sm:h-6 ${kpi.color}`} />
              </div>
              <TrendingUp className="hidden sm:block w-4 h-4 text-zinc-300 dark:text-zinc-700" />
            </div>
            <div className="space-y-0.5 sm:space-y-1">
              <h3 className="text-[10px] sm:text-sm font-medium text-zinc-500 dark:text-zinc-400 truncate">{kpi.label}</h3>
              <p className="text-xl sm:text-3xl font-bold text-zinc-900 dark:text-white">
                {kpi.loading ? '...' : kpi.value}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* Action Required */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className={`w-4 h-4 sm:w-5 sm:h-5 ${alerts.length > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
                <h2 className="font-bold text-base sm:text-lg dark:text-white">Action Required</h2>
                {alerts.length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {alerts.length}
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {jobsLoading || zonesLoading || shipmentsLoading ? (
                <div className="p-12 text-center text-zinc-400 animate-pulse">Scanning for action items...</div>
              ) : alerts.length > 0 ? (
                alerts.map((alert: any) => (
                  <button key={alert.id} onClick={alert.onClick} className="w-full text-left p-3 sm:p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <div className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${
                        alert.type === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        <alert.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-semibold text-sm sm:text-base text-zinc-900 dark:text-white truncate">{alert.title}</p>
                        <p className="text-[10px] sm:text-xs text-zinc-500 truncate">{alert.description}</p>
                      </div>
                    </div>
                    <ArrowRight className="hidden sm:block shrink-0 w-4 h-4 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))
              ) : (
                <div className="p-4 sm:p-6 text-center flex items-center justify-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <CheckSquare className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm text-zinc-900 dark:text-white">All Clear!</p>
                    <p className="text-[10px] sm:text-xs text-zinc-500">No action items or urgent alerts required.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Utilization Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="flex flex-col p-4 sm:p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-900 dark:text-white shadow-sm transition-colors group relative overflow-hidden">
              <button 
                onClick={() => onTabChange('zones')}
                className="absolute inset-0 z-0 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-all active:scale-[0.98] border border-transparent hover:border-indigo-500/50"
              />
              <div className="relative z-10 pointer-events-none w-full">
              <div className="flex items-center justify-between w-full mb-3 sm:mb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-xl">
                    <Warehouse className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
                  </div>
                  <p className="font-bold text-sm sm:text-base">Bay Utilization</p>
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-zinc-500">{occupiedBays} / {totalBays}</span>
              </div>
              
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 mb-1 overflow-hidden">
                <div 
                  className={`h-2 rounded-full ${totalBays > 0 && occupiedBays / totalBays > 0.8 ? 'bg-red-500' : 'bg-indigo-500'}`}
                  style={{ width: `${totalBays > 0 ? (occupiedBays / totalBays) * 100 : 0}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-zinc-400 mt-2 text-left">
                {totalBays > 0 && occupiedBays / totalBays > 0.8 ? 'Approaching max capacity!' : 'Healthy capacity.'}
              </p>

                {sortedBays.length > 0 && (
                  <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5 sm:space-y-2 w-full">
                    {sortedBays.map((bay: any) => {
                      const vehicle = vehicles?.find((v: any) => v.vin === bay.currentVehicleVin) as any;
                      const jobId = bay.currentJobId || vehicle?.jobId;
                      const job = allJobs?.find((j: any) => j.id === jobId) as any;
                      const customerName = bay.customerName || vehicle?.customerName || job?.customerName;
                      const assignedStaff = job?.assignedStaff || bay.assignedStaff;
                      const assignedStaffDisplay = assignedStaff?.length > 0 ? assignedStaff.map((s: any) => s.name).join(', ') : null;
                      
                      const vehicleDisplay = vehicle 
                        ? (`${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || `VIN: ${bay.currentVehicleVin}`) 
                        : (bay.currentVehicleVin ? `VIN: ${bay.currentVehicleVin}` : 'Unlinked');
                      const timestamp = bay.lastAssignedAt || bay.updatedAt;

                      return (
                        <div key={bay.id} className="relative group/item pointer-events-auto">
                          <div className="flex items-center justify-between py-1 border-b border-zinc-50/50 dark:border-zinc-800/50 last:border-0">
                            <div className="flex flex-col min-w-0 flex-1 mr-2 text-left">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-zinc-400 dark:text-zinc-500 w-24 truncate shrink-0 text-sm">{bay.name}</span>
                                <span className="text-zinc-900 dark:text-white truncate font-bold text-base">
                                  {vehicleDisplay}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 pl-[104px] text-xs text-zinc-400 truncate">
                                {job ? (
                                  <span className="text-emerald-500 font-bold uppercase tracking-tight">
                                    {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title}
                                  </span>
                                ) : (
                                  <span className="text-red-500 font-black uppercase tracking-[0.1em] animate-blink text-[10px]">
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
                                    <span className="text-red-500 font-black uppercase tracking-[0.1em] animate-blink text-[10px]">
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
                            </div>
                            {(() => {
                              if (!timestamp) return <span className="text-zinc-400 font-mono font-bold whitespace-nowrap text-sm">---</span>;
                              
                              // Arrival time for duration calculation
                              const arrivalTime = timestamp.seconds ? timestamp.seconds * 1000 : new Date(timestamp).getTime();
                              
                              // Last activity time for the label (always use updatedAt if available)
                              const activityTs = bay.updatedAt || timestamp;
                              const activityTime = activityTs.seconds ? activityTs.seconds * 1000 : new Date(activityTs).getTime();
                              
                              const hours = (Date.now() - arrivalTime) / (1000 * 60 * 60);
                              const colorClass = hours >= 48 ? 'text-red-500' : hours >= 24 ? 'text-amber-500' : 'text-emerald-500';
                              
                              return (
                                <div className="flex flex-col items-end shrink-0">
                                  <span className={`${colorClass} font-mono font-bold whitespace-nowrap text-sm`}>
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
                                        isOverdue ? "bg-red-500 text-white animate-pulse" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                      )}>
                                        {isOverdue ? `Overdue ${label}` : `Due in ${label}`}
                                      </span>
                                    );
                                  })()}
                                  <span className={`text-[10px] font-medium uppercase tracking-tighter mt-0.5 ${hours >= 24 ? 'text-amber-500' : 'text-zinc-400'}`}>
                                    UPD: {new Date(activityTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedZoneId(bay.id); }}
                            className="absolute inset-0 w-full h-full bg-indigo-500/0 hover:bg-indigo-500/5 transition-colors rounded-lg z-10"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col p-4 sm:p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-900 dark:text-white shadow-sm transition-colors group relative overflow-hidden">
              <button 
                onClick={() => onTabChange('zones?type=parking&occupancy=occupied')}
                className="absolute inset-0 z-0 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-all active:scale-[0.98] border border-transparent hover:border-indigo-500/50"
              />
              <div className="relative z-10 pointer-events-none w-full">
                <div className="flex items-center justify-between w-full mb-3 sm:mb-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-xl">
                      <Car className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
                    </div>
                    <p className="font-bold text-sm sm:text-base">Parking Lot</p>
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold text-zinc-500">{occupiedParking} / {totalParking}</span>
                </div>
                
                <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 mb-1 overflow-hidden">
                  <div 
                    className={`h-2 rounded-full ${totalParking > 0 && occupiedParking / totalParking > 0.8 ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${totalParking > 0 ? (occupiedParking / totalParking) * 100 : 0}%` }}
                  ></div>
                </div>
                <p className="text-[10px] text-zinc-400 mt-2 text-left">
                  {totalParking > 0 && occupiedParking / totalParking > 0.8 ? 'Lot is nearly full!' : 'Parking available.'}
                </p>

                {sortedParking.length > 0 && (
                  <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5 sm:space-y-2 w-full">
                    {sortedParking.map((zone: any) => {
                      const vehicle = vehicles?.find((v: any) => v.vin === zone.currentVehicleVin) as any;
                      const jobId = zone.currentJobId || vehicle?.jobId;
                      const job = allJobs?.find((j: any) => j.id === jobId) as any;
                      const customerName = zone.customerName || vehicle?.customerName || job?.customerName;
                      const assignedStaff = job?.assignedStaff || zone.assignedStaff;
                      const assignedStaffDisplay = assignedStaff?.length > 0 ? assignedStaff.map((s: any) => s.name).join(', ') : null;
                      
                      const vehicleDisplay = vehicle 
                        ? (`${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || `VIN: ${zone.currentVehicleVin}`) 
                        : (zone.currentVehicleVin ? `VIN: ${zone.currentVehicleVin}` : 'Unlinked');
                      const timestamp = zone.lastAssignedAt || zone.updatedAt;

                      return (
                        <div key={zone.id} className="relative group/item pointer-events-auto">
                          <div className="flex items-center justify-between py-1 border-b border-zinc-50/50 dark:border-zinc-800/50 last:border-0">
                            <div className="flex flex-col min-w-0 flex-1 mr-2 text-left">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-zinc-400 dark:text-zinc-500 w-24 truncate shrink-0 text-sm">{zone.name}</span>
                                <span className="text-zinc-900 dark:text-white truncate font-bold text-base">
                                  {vehicleDisplay}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 pl-[104px] text-xs text-zinc-400 truncate">
                                {job ? (
                                  <span className="text-emerald-500 font-bold uppercase tracking-tight">
                                    {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title}
                                  </span>
                                ) : (
                                  <span className="text-red-500 font-black uppercase tracking-[0.1em] animate-blink text-[10px]">
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
                                    <span className="text-red-500 font-black uppercase tracking-[0.1em] animate-blink text-[10px]">
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
                            </div>
                            {(() => {
                              if (!timestamp) return <span className="text-zinc-400 font-mono font-bold whitespace-nowrap text-sm">---</span>;
                              const assignedTime = timestamp.seconds ? timestamp.seconds * 1000 : new Date(timestamp).getTime();
                              const hours = (Date.now() - assignedTime) / (1000 * 60 * 60);
                              // Parking rules: 1 week (168h), 2 weeks (336h)
                              const colorClass = hours >= 336 ? 'text-red-500' : hours >= 168 ? 'text-amber-500' : 'text-emerald-500';
                              return (
                                <div className="flex flex-col items-end shrink-0">
                                  <span className={`${colorClass} font-mono font-bold whitespace-nowrap text-sm`}>
                                    {calculateDuration(timestamp)}
                                  </span>
                                  <span className={`text-[10px] font-medium uppercase tracking-tighter ${hours >= 168 ? 'text-amber-500' : 'text-zinc-400'}`}>
                                    Updated: {new Date(assignedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedZoneId(zone.id); }}
                            className="absolute inset-0 w-full h-full bg-indigo-500/0 hover:bg-indigo-500/5 transition-colors rounded-lg z-10"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="lg:col-span-1 h-[600px] lg:h-auto">
          <ShopFloorActivity tenantId={tenantId} />
        </div>
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
          onDelete={() => {}} // Archiving disabled from dashboard for safety
          onQuickAddRequest={(vin: string) => setQuickAddVin({ zoneId: selectedZone.id, vin })}
          onQuickAddJobRequest={(title: string) => setQuickAddJob({ zoneId: selectedZone.id, title, vin: selectedZone.currentVehicleVin })}
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

      {quickAddVin && (
        <QuickAddVehicleModal
          tenantId={tenantId}
          initialVin={quickAddVin.vin}
          onClose={() => setQuickAddVin(null)}
          onAssign={(vin) => handleAssignVehicle(quickAddVin.zoneId, vin)}
        />
      )}

      {quickAddJob && (
        <QuickAddJobModal 
          tenantId={tenantId}
          initialTitle={quickAddJob.title}
          initialVin={quickAddJob.vin || undefined}
          onClose={() => setQuickAddJob(null)}
          onSuccess={(jobId) => {
            handleAssignVehicle(quickAddJob.zoneId, quickAddJob.vin || '', 'assign', jobId);
            setQuickAddJob(null);
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
