import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  CheckSquare, TrendingUp, 
  Clock, AlertCircle, ArrowRight, Car, Warehouse, Truck, Search, Command, Package, FileText, Copy, X,
  Maximize, Minimize, ShoppingCart
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
import { toast, Toaster } from 'sonner';
import { useWakeLock } from '../../hooks/useWakeLock';
import { ShopFloorActivity } from './ShopFloorActivity';
import { ZoneDetailsModal } from './ZoneModals';
import { QuickAddVehicleModal } from './VehicleSelector';
import { VehicleDetailsModal } from './VehiclesManager';
import { QuickAddJobModal } from './JobSelectionComponents';
import { ConfirmModal } from '../../components/ConfirmModal';

interface MissionControlProps {
  tenantId: string;
  onTabChange: (tabId: string, state?: any) => void;
}

export function MissionControl({ tenantId, onTabChange }: MissionControlProps) {
  const navigate = useNavigate();
  // const [searchParams, setSearchParams] = useSearchParams();
  const { open: openSearch } = useSearchStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

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
  // Stats fetching
  const { isLoading: statsLoading } = useQuery({
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

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportContent, setReportContent] = useState('');

  const handleAssignVehicle = async (zoneId: string, vin: string, actionType: 'assign' | 'clear' | 'remove' | 'remove_job' = 'assign', jobId?: string) => {
    try {
      const trimmedVin = vin?.trim().toUpperCase();
      const zone = zones.find(z => z.id === zoneId);
      const previousVin = zone?.currentVehicleVin || null;
      const previousJobId = zone?.currentJobId || null;
      
      const targetJobId = jobId || previousJobId;
      const job = allJobs.find(j => j.id === targetJobId);
      const now = new Date();

      // AUTO-MOVE: If this VIN or Job is already in another zone, clear it from there first
      if (actionType === 'assign' && (trimmedVin || targetJobId)) {
        const otherZones = zones.filter(z => z.id !== zoneId);
        for (const oz of otherZones) {
          let needsClear = false;
          if (trimmedVin && oz.currentVehicleVin === trimmedVin) needsClear = true;
          else if (targetJobId && oz.currentJobId === targetJobId) needsClear = true;
          else if (trimmedVin && oz.currentVehicleVins?.includes(trimmedVin)) needsClear = true;
          
          if (needsClear) {
            // If leaving a bay or parking spot, update total time
            const isBay = oz.type === 'bay';
            const isParking = oz.type === 'parking' || oz.type === 'lot';

            if ((isBay || isParking) && targetJobId && job) {
              const lastAssigned = oz.lastAssignedAt?.seconds ? oz.lastAssignedAt.seconds * 1000 : (oz.lastAssignedAt || oz.updatedAt || Date.now());
              const durationSeconds = Math.max(0, Math.floor((now.getTime() - new Date(lastAssigned).getTime()) / 1000));
              
              const updateData: any = {
                updatedAt: serverTimestamp()
              };

              if (isBay) {
                updateData.totalBayTimeSeconds = (job.totalBayTimeSeconds || 0) + durationSeconds;
                updateData.currentBaySessionStart = null;
              } else if (isParking) {
                updateData.totalParkingTimeSeconds = (job.totalParkingTimeSeconds || 0) + durationSeconds;
                updateData.currentParkingSessionStart = null;
              }

              await updateDoc(doc(db, `businesses/${tenantId}/jobs`, targetJobId), updateData);
            }

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
        // Handle leaving the current zone
        if (actionType === 'clear' || actionType === 'remove_job') {
          const isBay = zone?.type === 'bay';
          const isParking = zone?.type === 'parking' || zone?.type === 'lot';

          if ((isBay || isParking) && targetJobId && job) {
            const lastAssigned = zone.lastAssignedAt?.seconds ? zone.lastAssignedAt.seconds * 1000 : (zone.lastAssignedAt || zone.updatedAt || Date.now());
            const durationSeconds = Math.max(0, Math.floor((now.getTime() - new Date(lastAssigned).getTime()) / 1000));
            
            const updateData: any = {
              updatedAt: serverTimestamp()
            };

            if (isBay) {
              updateData.totalBayTimeSeconds = (job.totalBayTimeSeconds || 0) + durationSeconds;
              updateData.currentBaySessionStart = null;
            } else if (isParking) {
              updateData.totalParkingTimeSeconds = (job.totalParkingTimeSeconds || 0) + durationSeconds;
              updateData.currentParkingSessionStart = null;
            }

            await updateDoc(doc(db, `businesses/${tenantId}/jobs`, targetJobId), updateData);
          }
        }

        // Handle entering a new zone
        if (actionType === 'assign' && targetJobId) {
          const isBay = zone?.type === 'bay';
          const isParking = zone?.type === 'parking' || zone?.type === 'lot';

          const jobUpdate: any = {
            updatedAt: serverTimestamp()
          };

          if (isBay) {
            jobUpdate.currentBaySessionStart = serverTimestamp();
            jobUpdate.currentParkingSessionStart = null;
          } else if (isParking) {
            jobUpdate.currentParkingSessionStart = serverTimestamp();
            jobUpdate.currentBaySessionStart = null;
          } else {
            jobUpdate.currentBaySessionStart = null;
            jobUpdate.currentParkingSessionStart = null;
          }

          await updateDoc(doc(db, `businesses/${tenantId}/jobs`, targetJobId), jobUpdate);
        }

        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), {
          currentVehicleVin: actionType === 'clear' ? null : trimmedVin || previousVin,
          currentJobId: actionType === 'clear' || actionType === 'remove_job' ? null : targetJobId,
          lastAssignedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
        zoneId,
        zoneName: zone?.name || 'Unknown',
        vin: trimmedVin || null,
        jobId: targetJobId || null,
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
      setLastUpdated(new Date());
    }, (err) => console.error("Zones listener error:", err));

    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), snap => {
      setVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Vehicles listener error:", err));

    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), snap => {
      setAllJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Jobs listener error:", err));

    const unsubParts = onSnapshot(collection(db, `businesses/${tenantId}/parts_requests`), snap => {
      setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Parts listener error:", err));

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

  const sortByOldest = (a: any, b: any) => {
    const timeA1 = a.lastAssignedAt?.seconds || 0;
    const timeA2 = a.updatedAt?.seconds || 0;
    const timeB1 = b.lastAssignedAt?.seconds || 0;
    const timeB2 = b.updatedAt?.seconds || 0;
    const timeA = Math.max(timeA1, timeA2);
    const timeB = Math.max(timeB1, timeB2);
    return timeA - timeB; // Oldest first
  };

  const sortedBays = [...occupiedBaysList].sort(sortByOldest);
  const sortedParking = [...occupiedParkingList].sort(sortByOldest);

  const blockedJobsCount = allJobs?.filter((j: any) => j.status === 'Blocked').length || 0;
  const activeJobsCount = allJobs?.filter((j: any) => !['Closed', 'Completed', 'Blocked', 'Ready for Customer', 'Ready for QA'].includes(j.status)).length || 0;
  const vehiclesOnSiteCount = zones?.reduce((acc: number, z: any) => {
    if (z.allowMultiple && z.currentVehicleVins) return acc + z.currentVehicleVins.length;
    if (z.currentVehicleVin) return acc + 1;
    return acc;
  }, 0) || 0;

  const missingPartsCount = partsRequests?.filter((pr: any) => 
    ['pending', 'ordered', 'requested'].includes((pr.status || 'pending').toLowerCase())
  ).length || 0;

  const readyForQACount = allJobs?.filter((j: any) => j.status === 'Ready for QA').length || 0;

  const kpis = [
    { label: 'Active Jobs', value: activeJobsCount, icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-500/10', tab: 'jobs', loading: statsLoading },
    { label: 'Bay Capacity', value: `${occupiedBays}/${totalBays}`, icon: Warehouse, color: 'text-indigo-500', bg: 'bg-indigo-500/10', tab: 'zones?type=bay', loading: false },
    { label: 'Parking Lot', value: `${occupiedParking}/${totalParking}`, icon: Car, color: 'text-emerald-500', bg: 'bg-emerald-500/10', tab: 'zones?type=parking', loading: false },
    { label: 'Missing Parts', value: missingPartsCount, icon: Package, color: 'text-amber-500', bg: 'bg-amber-500/10', tab: 'parts', loading: false },
    { label: 'Blocked Jobs', value: blockedJobsCount, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10', tab: 'jobs?status=Blocked', loading: statsLoading },
    { label: 'Ready for QA', value: readyForQACount, icon: CheckSquare, color: 'text-cyan-500', bg: 'bg-cyan-500/10', tab: 'jobs?status=Ready+for+QA', loading: statsLoading },
    { label: 'Shipments', value: activeShipmentsCount, icon: Truck, color: 'text-orange-500', bg: 'bg-orange-500/10', tab: 'shipments', loading: false },
    { label: 'On Site', value: vehiclesOnSiteCount, icon: Car, color: 'text-indigo-500', bg: 'bg-indigo-500/10', tab: 'vehicles', loading: statsLoading },
  ];



  const formatSmartDuration = (seconds: number, includeSeconds: boolean = false) => {
    if (seconds <= 0) return '0m';
    const years = Math.floor(seconds / 31536000);
    const months = Math.floor((seconds % 31536000) / 2592000);
    const days = Math.floor((seconds % 2592000) / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (years > 0) return `${years}y ${months}mo`;
    if (months > 0) return `${months}mo ${days}d`;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (includeSeconds && seconds < 3600) return `${minutes}m ${secs}s`;
    return `${minutes}m`;
  };

  const calculateDuration = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    const diff = Math.max(0, Math.floor((now - date.getTime()) / 1000));
    return formatSmartDuration(diff, true);
  };

  const calculateTotalDuration = (totalSeconds: number, sessionStart: any) => {
    let total = totalSeconds || 0;
    if (sessionStart) {
      const start = sessionStart.seconds ? sessionStart.seconds * 1000 : new Date(sessionStart).getTime();
      total += Math.max(0, Math.floor((now - start) / 1000));
    }
    if (total === 0) return null;
    return formatSmartDuration(total);
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
          if (pr.jobId) {
            navigate(`/business/${tenantId}/job/${pr.jobId}`);
          } else {
            onTabChange('parts');
          }
        }
      });
    } else if (status === 'ordered') {
      // Potentially missing or received but not checked in
      const timeRef = pr.statusChangedAt || pr.createdAt;
      if (timeRef) {
        const timeValue = timeRef.seconds ? timeRef.seconds * 1000 : new Date(timeRef).getTime();
        const days = (Date.now() - timeValue) / (1000 * 60 * 60 * 24);
        if (days >= 3) {
          alerts.push({
            id: `missing-part-${pr.id}`,
            title: `Check In Required: ${pr.partName || 'Unknown Part'}`,
            description: `Ordered ${Math.floor(days)} days ago but not marked received.`,
            type: 'danger',
            icon: Package,
            onClick: () => {
            if (pr.jobId) {
              navigate(`/business/${tenantId}/job/${pr.jobId}`);
            } else {
                onTabChange('parts');
              }
            }
          });
        }
      }
    }
  });

  // 3. Inactive Jobs
  recentJobs?.forEach((job: any) => {
    if (!['Closed', 'Completed', 'Ready for Customer', 'Ready for QA'].includes(job.status) && job.updatedAt) {
      const updatedTime = new Date(job.updatedAt.seconds ? job.updatedAt.seconds * 1000 : job.updatedAt).getTime();
      const days = (Date.now() - updatedTime) / (1000 * 60 * 60 * 24);
      if (days > 7 && job.status !== 'Blocked') {
        alerts.push({
          id: `job-${job.id}`,
          title: `Inactive Job: ${job.title || 'Untitled'}`,
          description: `No updates in ${Math.floor(days)} days. Status: ${job.status || 'Unknown'}`,
          type: 'warning',
          icon: Clock,
          onClick: () => {
            navigate(`/business/${tenantId}/job/${job.id}`);
          }
        });
      }
    }
  });

  // 4. Overdue Jobs
  allJobs?.forEach((job: any) => {
    if (!['Closed', 'Completed', 'Ready for Customer', 'Ready for QA'].includes(job.status) && (job.eta || job.expectedFinishTime)) {
      const targetTimeRaw = job.eta || job.expectedFinishTime;
      const targetTime = typeof targetTimeRaw?.toDate === 'function' ? targetTimeRaw.toDate().getTime() : new Date(targetTimeRaw).getTime();
      
      if (targetTime && targetTime < Date.now()) {
        const isEta = !!job.eta;
        let desc = `${isEta ? 'ETA' : 'Due'} was ${new Date(targetTime).toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${new Date(targetTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
        
        if (job.eta && job.expectedFinishTime) {
          const dueDate = typeof job.expectedFinishTime?.toDate === 'function' ? job.expectedFinishTime.toDate() : new Date(job.expectedFinishTime);
          desc += ` (Due: ${dueDate.toLocaleDateString([], { month: 'short', day: 'numeric' })})`;
        }

        alerts.push({
          id: `overdue-job-${job.id}`,
          title: `Overdue Job: ${job.jobNumber ? `#${job.jobNumber} ` : ''}${job.title || 'Untitled'}`,
          description: desc,
          type: 'danger',
          icon: Clock,
          onClick: () => {
            navigate(`/business/${tenantId}/job/${job.id}`);
          }
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
        onClick: () => {
          navigate(`/business/${tenantId}/job/${job.id}`);
        }
      });
    }
  });

  const handleGenerateReport = async () => {
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

    // Fetch Today's Activity
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [actSnap, zoneSnap] = await Promise.all([
        getDocs(query(collection(db, `businesses/${tenantId}/activity_feed`), orderBy('timestamp', 'desc'), limit(100))),
        getDocs(query(collection(db, `businesses/${tenantId}/zone_assignments`), orderBy('assignedAt', 'desc'), limit(100)))
      ]);

      const logs: { time: Date, msg: string }[] = [];

      actSnap.forEach(d => {
        const data = d.data();
        if (!data.timestamp) return;
        const time = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
        if (time >= todayStart) {
          logs.push({ time, msg: `[Activity] ${data.title || 'Update'}: ${data.message} (by ${data.author || 'System'})` });
        }
      });

      zoneSnap.forEach(d => {
        const data = d.data();
        if (!data.assignedAt) return;
        const time = data.assignedAt.toDate ? data.assignedAt.toDate() : new Date(data.assignedAt);
        if (time >= todayStart) {
          const action = data.action === 'cleared' ? 'Cleared' : 'Assigned';
          logs.push({ time, msg: `[Zone Move] ${action} ${data.vin || 'Bay'} in ${data.zoneName} (by ${data.assignedByName || 'System'})` });
        }
      });

      logs.sort((a, b) => b.time.getTime() - a.time.getTime()); // Newest first

      report += `\n📋 TODAY'S ACTIVITY LOG:\n`;
      if (logs.length === 0) {
        report += `- No activity logged today.\n`;
      } else {
        logs.forEach(log => {
          report += `- [${log.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] ${log.msg}\n`;
        });
      }
    } catch (e) {
      console.error("Failed to fetch activity logs for report:", e);
      report += `\n📋 TODAY'S ACTIVITY LOG:\n- Failed to load activity logs.\n`;
    }

    setReportContent(report);
    setShowReportModal(true);
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "animate-in fade-in duration-500",
        isFullscreen ? "p-2 space-y-2 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar" : "p-0 space-y-4 sm:space-y-8"
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
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Mission Control</span>
            <span className="text-[10px] font-bold text-zinc-500">• Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        )}
        <button 
          onClick={toggleFullscreen}
          className="hidden md:flex w-full md:w-auto px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-lg transition-all items-center justify-center gap-2"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
        </button>
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
          className={cn(
            "w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-12 pr-24 shadow-sm hover:border-indigo-500/50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400 font-medium",
            isFullscreen ? "py-2" : "py-4"
          )}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <Command className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] font-black text-zinc-500">F</span>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className={cn(
        "grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8",
        isFullscreen ? "gap-1.5" : "gap-2 sm:gap-3"
      )}>
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            onClick={() => onTabChange(kpi.tab)}
            className={cn(
              "group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm hover:border-indigo-500/50 transition-all text-left active:scale-[0.98]",
              isFullscreen ? "p-2" : "p-2.5 sm:p-3.5"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`p-1.5 sm:p-2 rounded-xl ${kpi.bg}`}>
                <kpi.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${kpi.color}`} />
              </div>
              <TrendingUp className="hidden sm:block w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-[9px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">{kpi.label}</h3>
              <p className="text-lg sm:text-2xl font-bold text-zinc-900 dark:text-white">
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

                      const target = job || bay;
                      const legacyBlocker = target?.blocker ? [{ message: target.blocker, status: 'active' }] : [];
                      const activeBlockers = (target?.blockers || legacyBlocker).filter((b: any) => b.status === 'active');
                      const isBlocked = activeBlockers.length > 0;

                      const currentVin = job?.vehicleVin || bay?.currentVehicleVin;
                      const relevantParts = partsRequests.filter((pr: any) => {
                        const prStatus = (pr.status || '').toLowerCase();
                        if (!['pending', 'received', 'ordered'].includes(prStatus)) return false;
                        if (job?.id && pr.jobId === job.id) return true;
                        if (bay?.id && pr.zoneId === bay.id) return true;
                        if (currentVin && pr.vin === currentVin) return true;
                        return false;
                      });

                      const reqCount = relevantParts.filter(pr => (pr.status || '').toLowerCase() === 'pending').length;
                      const ordCount = relevantParts.filter(pr => (pr.status || '').toLowerCase() === 'ordered').length;
                      const recCount = relevantParts.filter(pr => (pr.status || '').toLowerCase() === 'received').length;
                      const hasParts = reqCount + ordCount + recCount > 0;
                      const partsArrived = relevantParts.some(pr => (pr.status || '').toLowerCase() === 'received');
                      const isPartsMissing = reqCount > 0;
                      const isPartsOrderedOrReceived = ordCount > 0 || recCount > 0;

                      const etaRaw = job?.expectedFinishTime || job?.eta || bay.eta;
                      let isOverdue = false;
                      if (etaRaw) {
                        const etaDate = typeof etaRaw.toDate === 'function' ? etaRaw.toDate() : new Date(etaRaw);
                        if (etaDate.getTime() - Date.now() < 0) isOverdue = true;
                      }

                      let customStyle = "hover:bg-zinc-50 dark:hover:bg-zinc-800/30 border-transparent";
                      if (isBlocked) {
                        customStyle = "bg-red-500/20 border-red-500 hover:bg-red-500/30 dark:bg-red-900/40";
                      } else if (isPartsMissing) {
                        customStyle = "bg-amber-500/20 border-amber-500 hover:bg-amber-500/30 dark:bg-amber-900/40";
                      } else if (isOverdue) {
                        customStyle = "border-red-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30";
                      } else if (isPartsOrderedOrReceived) {
                        customStyle = "border-amber-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30";
                      }

                      return (
                        <div 
                          key={bay.id} 
                          onClick={() => {
                            const vehicle = vehicles?.find((v: any) => v.vin === bay.currentVehicleVin);
                            const jobId = bay.currentJobId || vehicle?.jobId;
                            if (jobId) {
                              navigate(`/business/${tenantId}/job/${jobId}`);
                            } else {
                              setSelectedZoneId(bay.id);
                            }
                          }}
                          className={cn(
                            "relative group/item cursor-pointer transition-colors rounded-xl px-2 -mx-2 pointer-events-auto border",
                            customStyle
                          )}
                        >
                          <div className="flex items-center justify-between py-1 border-b border-zinc-50/50 dark:border-zinc-800/50 last:border-0 group-hover/item:border-transparent">
                            <div className="flex flex-col min-w-0 flex-1 mr-2 text-left">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-zinc-400 dark:text-zinc-500 w-24 truncate shrink-0 text-sm">{bay.name}</span>
                                <span className="truncate font-bold text-base text-zinc-900 dark:text-white">
                                  {vehicleDisplay}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 pl-[104px] text-xs text-zinc-400 truncate">
                                {job ? (
                                  <span className="text-emerald-500 font-bold uppercase tracking-tight">
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
                                {(() => {
                                  if (!isBlocked && !hasParts) return null;

                                  return (
                                    <div className="flex items-center gap-2 mt-1 w-full">
                                      {isBlocked && (
                                        <div className="bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse border border-red-200 dark:border-red-900/50">
                                          <AlertCircle className="w-3 h-3" />
                                          <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                                            {activeBlockers.length > 1 ? `${activeBlockers.length} Blockers` : 'Blocked'}
                                          </span>
                                        </div>
                                      )}
                                      {hasParts && (
                                        <div className={cn(
                                          "px-1.5 py-0.5 rounded flex items-center gap-1 border",
                                          partsArrived 
                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50" 
                                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50"
                                        )}>
                                          <ShoppingCart className="w-3 h-3" />
                                          <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                                            Parts {reqCount}/{ordCount}/{recCount}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
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
                                  <span className={`${colorClass} font-mono font-bold whitespace-nowrap text-[10px] sm:text-xs leading-none`}>
                                    <span className="text-[9px] uppercase tracking-tighter opacity-70 mr-1">SESSION:</span>
                                    {calculateDuration(timestamp)}
                                  </span>
                                  {job && (calculateTotalDuration(job.totalBayTimeSeconds, job.currentBaySessionStart)) && (
                                    <span className="text-indigo-500 font-mono font-bold whitespace-nowrap text-[10px] sm:text-xs leading-none mt-0.5">
                                      <span className="text-[9px] uppercase tracking-tighter opacity-70 mr-1">TOTAL BAY:</span>
                                      {calculateTotalDuration(job.totalBayTimeSeconds, job.currentBaySessionStart)}
                                    </span>
                                  )}
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
                                  <span className={`text-[10px] font-medium uppercase tracking-tighter mt-0.5 ${hours >= 24 ? 'text-amber-500' : 'text-zinc-400'}`}>
                                    UPD: {new Date(activityTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
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
                      const vinsToRender = (zone.allowMultiple && zone.currentVehicleVins && zone.currentVehicleVins.length > 0)
                        ? zone.currentVehicleVins
                        : [zone.currentVehicleVin].filter(Boolean);

                      if (vinsToRender.length === 0) return null;

                      return vinsToRender.map((vin: string, index: number) => {
                        const vehicle = vehicles?.find((v: any) => v.vin === vin) as any;
                        const jobId = (zone.currentJobId && index === 0 && !vehicle?.jobId) ? zone.currentJobId : vehicle?.jobId;
                        const job = allJobs?.find((j: any) => j.id === jobId) as any;
                        const customerName = (index === 0 && zone.customerName && !vehicle?.customerName && !job?.customerName) ? zone.customerName : (vehicle?.customerName || job?.customerName);
                        const assignedStaff = job?.assignedStaff || (index === 0 ? zone.assignedStaff : null);
                        const assignedStaffDisplay = assignedStaff?.length > 0 ? assignedStaff.map((s: any) => s.name).join(', ') : null;
                        
                        const vehicleDisplay = vehicle 
                          ? (`${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || `VIN: ${vin}`) 
                          : (vin ? `VIN: ${vin}` : 'Unlinked');
                        
                        const timestamp = zone.lastAssignedAt || zone.updatedAt;
                        const itemKey = `${zone.id}-${vin}-${index}`;

                        return (
                          <div 
                            key={itemKey} 
                            onClick={() => {
                              const vehicle = vehicles?.find((v: any) => v.vin === vin);
                              const jobId = (zone.currentJobId && index === 0 && !vehicle?.jobId) ? zone.currentJobId : vehicle?.jobId;
                              if (jobId) {
                                navigate(`/business/${tenantId}/job/${jobId}`);
                              } else {
                                setSelectedZoneId(zone.id);
                              }
                            }}
                            className="relative group/item cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors rounded-xl px-2 -mx-2 pointer-events-auto"
                          >
                          <div className="flex items-center justify-between py-1 border-b border-zinc-50/50 dark:border-zinc-800/50 last:border-0 group-hover/item:border-transparent">
                            <div className="flex flex-col min-w-0 flex-1 mr-2 text-left">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-zinc-400 dark:text-zinc-500 w-24 truncate shrink-0 text-sm sm:text-base">{zone.name}</span>
                                <span className="truncate font-black text-lg sm:text-xl text-zinc-900 dark:text-white">
                                  {vehicleDisplay}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 pl-[104px] text-sm sm:text-base text-zinc-400 truncate">
                                {job ? (
                                  <span className="text-emerald-500 font-black uppercase tracking-tight">
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
                                {(() => {
                                  const target = job || zone;
                                  const legacyBlocker = target?.blocker ? [{ message: target.blocker, status: 'active' }] : [];
                                  const activeBlockers = (target?.blockers || legacyBlocker).filter((b: any) => b.status === 'active');
                                  const isBlocked = activeBlockers.length > 0;

                                  const currentVin = job?.vehicleVin || vin;
                                  const relevantParts = partsRequests.filter((pr: any) => {
                                    const prStatus = (pr.status || '').toLowerCase();
                                    const isActive = ['pending', 'received', 'ordered'].includes(prStatus);
                                    if (!isActive) return false;
                                    // Strictly tie parts to the Job ID if it exists
                                    if (job?.id && pr.jobId === job.id) return true;
                                    
                                    // Fallback to VIN only if there is NO job assigned
                                    if (!job?.id && currentVin && pr.vin === currentVin) return true;
                                    
                                    return false;
                                  });

                                  const reqCount = relevantParts.filter(pr => (pr.status || '').toLowerCase() === 'pending').length;
                                  const ordCount = relevantParts.filter(pr => (pr.status || '').toLowerCase() === 'ordered').length;
                                  const recCount = relevantParts.filter(pr => (pr.status || '').toLowerCase() === 'received').length;
                                  const hasParts = reqCount + ordCount + recCount > 0;
                                  const partsArrived = relevantParts.some(pr => (pr.status || '').toLowerCase() === 'received');

                                  if (!isBlocked && !hasParts) return null;

                                  return (
                                    <div className="flex items-center gap-2 mt-1 w-full">
                                      {isBlocked && (
                                        <div className="bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse border border-red-200 dark:border-red-900/50">
                                          <AlertCircle className="w-3 h-3" />
                                          <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                                            {activeBlockers.length > 1 ? `${activeBlockers.length} Blockers` : 'Blocked'}
                                          </span>
                                        </div>
                                      )}
                                      {hasParts && (
                                        <div className={cn(
                                          "px-1.5 py-0.5 rounded flex items-center gap-1 border",
                                          partsArrived 
                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50" 
                                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50"
                                        )}>
                                          <ShoppingCart className="w-3 h-3" />
                                          <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                                            Parts {reqCount}/{ordCount}/{recCount}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
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
                                  <span className={`${colorClass} font-mono font-bold whitespace-nowrap text-[10px] sm:text-xs leading-none`}>
                                    <span className="text-[9px] uppercase tracking-tighter opacity-70 mr-1">SESSION:</span>
                                    {calculateDuration(timestamp)}
                                  </span>
                                  {job && (calculateTotalDuration(job.totalParkingTimeSeconds, job.currentParkingSessionStart)) && (
                                    <span className="text-zinc-500 font-mono font-bold whitespace-nowrap text-[10px] sm:text-xs leading-none mt-0.5">
                                      <span className="text-[9px] uppercase tracking-tighter opacity-70 mr-1">TOTAL LOT:</span>
                                      {calculateTotalDuration(job.totalParkingTimeSeconds, job.currentParkingSessionStart)}
                                    </span>
                                  )}
                                  <span className={`text-[10px] font-medium uppercase tracking-tighter mt-0.5 ${hours >= 168 ? 'text-amber-500' : 'text-zinc-400'}`}>
                                    Updated: {new Date(assignedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        );
                      });
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

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950">
              <h2 className="text-xl font-black text-zinc-900 dark:text-white flex items-center gap-2">
                <FileText className="w-6 h-6 text-indigo-500" />
                Daily Shop Report
              </h2>
              <button 
                onClick={() => setShowReportModal(false)}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-zinc-500" />
              </button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-800 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                {reportContent}
              </pre>
            </div>
            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-950">
              <button
                onClick={() => setShowReportModal(false)}
                className="px-6 py-2.5 rounded-xl font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(reportContent);
                  toast.success('Report copied to clipboard!');
                }}
                className="px-6 py-2.5 rounded-xl font-bold bg-indigo-500 hover:bg-indigo-600 text-white transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
