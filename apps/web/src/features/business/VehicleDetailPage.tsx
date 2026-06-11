import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, CarFront, ShieldCheck, Archive, Edit2, Clock, LogIn, LogOut, MapPin, Loader2, FileText, ChevronRight, Activity, Tag
} from 'lucide-react';
import { doc, updateDoc, collection, getDocs, getDoc, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../lib/auth/store';
import { ConfirmModal } from '../../components/ConfirmModal';
import { LogoQRCode } from '../../components/LogoQRCode';
import { EditVehicleModal } from './VehiclesManager';

function formatDuration(startMs: number, endMs: number) {
  const diffMs = Math.max(0, endMs - startMs);
  const diffMins = Math.floor(diffMs / 60000);
  const days = Math.floor(diffMins / 1440);
  const hours = Math.floor((diffMins % 1440) / 60);
  const mins = diffMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function LiveDuration({ startSeconds, endSeconds }: { startSeconds?: number, endSeconds?: number }) {
  const [now, setNow] = useState(Date.now());
  
  useEffect(() => {
    if (endSeconds) return; // Static if it has an end time
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [endSeconds]);

  if (!startSeconds) return <span>--</span>;
  const startMs = startSeconds * 1000;
  const endMs = endSeconds ? endSeconds * 1000 : now;
  return <span>{formatDuration(startMs, endMs)}</span>;
}

interface Zone {
  id: string;
  name?: string;
  type?: string;
  currentVehicleVin?: string | null;
}

export function VehicleDetailPage({ 
  tenantId, 
  setDynamicTitle 
}: { 
  tenantId: string; 
  setDynamicTitle: (title: string | null) => void; 
}) {
  const { '*': splat } = useParams();
  const pathParts = (splat || '').split('/').filter(Boolean);
  const vehicleId = pathParts[1];

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { permissions, isSuperAdmin } = useAuthStore();
  const canManage = isSuperAdmin || permissions['vehicles.manage'];

  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
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

  // 1. Fetch Vehicle details
  const { data: vehicle, isLoading: loadingVehicle } = useQuery<any>({
    queryKey: ['vehicle-details', tenantId, vehicleId],
    queryFn: async () => {
      if (!tenantId || !vehicleId) return null;
      
      // Try doc ID lookup
      const directRef = doc(db, `businesses/${tenantId}/vehicles`, vehicleId);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        return { id: directSnap.id, ...directSnap.data() };
      }
      
      // Query VIN field
      const qVin = query(
        collection(db, `businesses/${tenantId}/vehicles`),
        where('vin', '==', vehicleId.toUpperCase())
      );
      const snapVin = await getDocs(qVin);
      if (!snapVin.empty) {
        return { id: snapVin.docs[0].id, ...snapVin.docs[0].data() };
      }
      
      // Query qrStickerId field
      const qSticker = query(
        collection(db, `businesses/${tenantId}/vehicles`),
        where('qrStickerId', '==', vehicleId)
      );
      const snapSticker = await getDocs(qSticker);
      if (!snapSticker.empty) {
        return { id: snapSticker.docs[0].id, ...snapSticker.docs[0].data() };
      }
      
      return null;
    },
    enabled: !!tenantId && !!vehicleId
  });

  // Set Dynamic Page Title
  useEffect(() => {
    if (!vehicle) return;
    const vehicleName = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Vehicle';
    const vinPart = vehicle.vin ? `VIN: ${vehicle.vin}` : '';
    const customerPart = vehicle.customerName ? `Customer: ${vehicle.customerName}` : '';
    const pageTitle = [vehicleName, vinPart, customerPart].filter(Boolean).join(' - ');
    if (pageTitle) {
      setDynamicTitle(pageTitle);
    }
  }, [vehicle, setDynamicTitle]);

  // 2. Fetch Zones
  const { data: zones = [], isLoading: loadingZones } = useQuery<Zone[]>({
    queryKey: ['zones-selector', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const snap = await getDocs(collection(db, `businesses/${tenantId}/zones`));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Zone));
    },
    enabled: !!tenantId
  });

  // 3. Fetch Business details for QR code brandings
  const { data: business } = useQuery({
    queryKey: ['business-details', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const snap = await getDocs(collection(db, 'businesses'));
      const doc = snap.docs.find(d => d.id === tenantId);
      return doc ? { id: doc.id, ...doc.data() as any } : null;
    }
  });

  // 4. Fetch Vehicle Location Move logs
  const { data: locationLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['vehicle-location-logs', tenantId, vehicle?.vin],
    queryFn: async () => {
      if (!vehicle?.vin) return [];
      const q = query(
        collection(db, `businesses/${tenantId}/zone_assignments`),
        where('vin', '==', vehicle.vin)
      );
      const snap = await getDocs(q);
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      // Sort newest first
      return logs.sort((a, b) => {
        const timeA = a.assignedAt?.seconds || 0;
        const timeB = b.assignedAt?.seconds || 0;
        return timeB - timeA;
      });
    },
    enabled: !!tenantId && !!vehicle?.vin
  });

  // 5. Fetch linked Jobs
  const { data: linkedJobs = [], isLoading: loadingJobs } = useQuery({
    queryKey: ['vehicle-linked-jobs', tenantId, vehicle?.vin, vehicle?.id],
    queryFn: async () => {
      if (!vehicle) return [];
      const jobs: any[] = [];
      
      const qId = query(
        collection(db, `businesses/${tenantId}/jobs`),
        where('vehicleId', '==', vehicle.id)
      );
      const snapId = await getDocs(qId);
      snapId.forEach(d => jobs.push({ id: d.id, ...d.data() }));
      
      if (vehicle.vin) {
        const qVin = query(
          collection(db, `businesses/${tenantId}/jobs`),
          where('vehicleVin', '==', vehicle.vin)
        );
        const snapVin = await getDocs(qVin);
        snapVin.forEach(d => {
          if (!jobs.some(j => j.id === d.id)) {
            jobs.push({ id: d.id, ...d.data() });
          }
        });
      }
      
      return jobs.sort((a, b) => {
        const timeA = a.createdAt?.seconds || new Date(a.createdAt || 0).getTime() / 1000;
        const timeB = b.createdAt?.seconds || new Date(b.createdAt || 0).getTime() / 1000;
        return timeB - timeA;
      });
    },
    enabled: !!tenantId && !!vehicle
  });

  const currentZone = zones?.find(z => vehicle?.vin && z.currentVehicleVin === vehicle.vin);

  const getSource = (row: any) => {
    const isQB = row.tags?.includes('QuickBooks') || 
                 row.notes?.includes('Imported via QBWC') || 
                 !!row.ListID || !!row.qb_ListID || 
                 !!row.quickbooksId;
    return (
      <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
        isQB ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20'
      }`}>
        {isQB ? 'QuickBooks' : 'Native'}
      </span>
    );
  };

  const handleIntake = async () => {
    if (!vehicle) return;
    setIsUpdatingStatus(true);
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/vehicles`, vehicle.id), {
        arrivedAt: serverTimestamp(),
        isWithCustomer: false
      });
      toast.success("Vehicle marked as arrived");
      queryClient.invalidateQueries({ queryKey: ['vehicle-details', tenantId, vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/vehicles`] });
    } catch (err) {
      toast.error("Failed to mark as arrived");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleWithCustomer = async (status: boolean) => {
    if (!vehicle) return;
    setIsUpdatingStatus(true);
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/vehicles`, vehicle.id), {
        isWithCustomer: status
      });
      toast.success(status ? "Marked as with customer" : "Returned to Shop floor");
      queryClient.invalidateQueries({ queryKey: ['vehicle-details', tenantId, vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/vehicles`] });
    } catch (err) {
      toast.error("Failed to update status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleRelease = async () => {
    if (!vehicle) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Release Vehicle',
      message: 'Are you sure you want to release this vehicle? It will be unassigned from its current zone and marked as departed.',
      onConfirm: async () => {
        setIsUpdatingStatus(true);
        try {
          const batchUpdates = [];
          batchUpdates.push(updateDoc(doc(db, `businesses/${tenantId}/vehicles`, vehicle.id), {
            departedAt: serverTimestamp()
          }));
          
          if (currentZone?.id) {
            batchUpdates.push(updateDoc(doc(db, `businesses/${tenantId}/zones`, currentZone.id), { currentVehicleVin: null }));
            batchUpdates.push(addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
              zoneId: currentZone.id,
              zoneName: currentZone.name || 'Unknown Zone',
              vin: null,
              assignedAt: serverTimestamp(),
              assignedBy: 'system',
              action: 'cleared (released)'
            }));
          }
          
          await Promise.all(batchUpdates);
          toast.success("Vehicle released");
          queryClient.invalidateQueries({ queryKey: ['vehicle-details', tenantId, vehicleId] });
          queryClient.invalidateQueries({ queryKey: ['vehicle-location-logs', tenantId, vehicle.vin] });
          queryClient.invalidateQueries({ queryKey: ['zones-selector', tenantId] });
        } catch (err) {
          toast.error("Failed to release vehicle");
        } finally {
          setIsUpdatingStatus(false);
        }
      }
    });
  };

  const handleZoneChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!vehicle) return;
    const newZoneId = e.target.value;
    const oldZoneId = currentZone?.id;
    if (newZoneId === oldZoneId) return;

    if (newZoneId) {
      const targetZone = zones?.find(z => z.id === newZoneId);
      if (targetZone && targetZone.currentVehicleVin) {
        setConfirmConfig({
          isOpen: true,
          title: 'Zone Occupied',
          message: `This zone is currently occupied by vehicle VIN: ${targetZone.currentVehicleVin}. Continuing will unassign that vehicle. Proceed?`,
          onConfirm: () => performZoneChange(newZoneId, oldZoneId)
        });
        return;
      }
    }

    performZoneChange(newZoneId, oldZoneId);
  };

  const performZoneChange = async (newZoneId: string, oldZoneId?: string) => {
    if (!vehicle) return;
    try {
      if (oldZoneId) {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, oldZoneId), { currentVehicleVin: null });
        await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
          zoneId: oldZoneId,
          zoneName: zones?.find(z => z.id === oldZoneId)?.name || 'Unknown Zone',
          vin: null,
          assignedAt: serverTimestamp(),
          assignedBy: 'system',
          action: 'cleared'
        });
      }

      if (newZoneId) {
        const payload: any = { 
          currentVehicleVin: vehicle.vin,
          lastAssignedAt: serverTimestamp()
        };
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, newZoneId), payload);
        
        if (!vehicle.arrivedAt && !vehicle.departedAt) {
          await updateDoc(doc(db, `businesses/${tenantId}/vehicles`, vehicle.id), {
            arrivedAt: serverTimestamp()
          });
        }

        await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
          zoneId: newZoneId,
          zoneName: zones?.find(z => z.id === newZoneId)?.name || 'Unknown Zone',
          vin: vehicle.vin,
          assignedAt: serverTimestamp(),
          assignedBy: 'system',
          action: 'assigned'
        });
      }
      toast.success("Vehicle location updated");
      queryClient.invalidateQueries({ queryKey: ['vehicle-details', tenantId, vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-location-logs', tenantId, vehicle.vin] });
      queryClient.invalidateQueries({ queryKey: ['zones-selector', tenantId] });
    } catch (err) {
      toast.error("Failed to update location");
      console.error(err);
    }
  };

  const handleArchive = async () => {
    if (!vehicle) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Archive Vehicle',
      message: `Are you sure you want to archive this ${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}? This will hide it from active lists.`,
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, `businesses/${tenantId}/vehicles`, vehicle.id), { isArchived: true });
          toast.success("Vehicle archived");
          queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/vehicles`] });
          queryClient.invalidateQueries({ queryKey: ['global-search-index', tenantId] });
          navigate(`/business/${tenantId}/vehicles`);
        } catch (e) {
          toast.error("Failed to archive vehicle");
        }
      }
    });
  };

  if (loadingVehicle) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-zinc-500 text-sm font-semibold">Loading vehicle details...</p>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="p-8 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-lg mx-auto mt-12 flex flex-col items-center justify-center gap-4">
        <CarFront className="w-12 h-12 text-zinc-400" />
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Vehicle Not Found</h3>
        <p className="text-sm text-zinc-500">The vehicle with VIN or ID "{vehicleId}" could not be located in your database.</p>
        <button 
          onClick={() => navigate(`/business/${tenantId}/vehicles`)}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-bold shadow-md transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Vehicles
        </button>
      </div>
    );
  }

  const isQB = vehicle.tags?.includes('QuickBooks') || 
               vehicle.notes?.includes('Imported via QBWC') || 
               !!vehicle.ListID || !!vehicle.qb_ListID || 
               !!vehicle.quickbooksId;

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex flex-col gap-2">
          <button 
            onClick={() => navigate(`/business/${tenantId}/vehicles`)}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-indigo-500 transition-colors text-xs font-black uppercase tracking-wider"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Vehicles
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight leading-none">
              {vehicle.year || ''} {vehicle.make || ''} {vehicle.model || 'Unknown Vehicle'}
            </h1>
            {vehicle.apiVerified && (
              <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3" /> API Verified
              </span>
            )}
            {getSource(vehicle)}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {canManage && (
            <button 
              onClick={() => setEditingVehicle(vehicle)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-sm font-bold rounded-xl transition-all shadow-sm"
              title="Edit Vehicle Details"
            >
              <Edit2 className="w-4 h-4" /> Edit Specs
            </button>
          )}
          {canManage && !isQB && (
            <button 
              onClick={handleArchive}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-sm font-bold rounded-xl transition-all shadow-sm"
              title="Archive Vehicle"
            >
              <Archive className="w-4 h-4" /> Archive
            </button>
          )}
        </div>
      </div>

      {/* 2. Page Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Specs & Interactive Actions */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Primary Details Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-1.5">
              <CarFront className="w-4 h-4 text-zinc-400" /> Vehicle Profile
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Customer / Owner</p>
                <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{vehicle.customerName || <span className="text-zinc-500 italic">None</span>}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">VIN (Vehicle Identification Number)</p>
                <p className="text-sm font-mono font-semibold text-zinc-950 dark:text-zinc-100 tracking-wide">{vehicle.vin || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Body Class</p>
                <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{vehicle.bodyClass || <span className="text-zinc-400">--</span>}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Drive Type</p>
                <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{vehicle.driveType || <span className="text-zinc-400">--</span>}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">GVWR Class</p>
                <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{vehicle.gvwr || <span className="text-zinc-400">--</span>}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">QR Sticker ID</p>
                <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{vehicle.qrStickerId || <span className="text-zinc-500 italic">Unassigned</span>}</p>
              </div>
              
              {vehicle.notes && (
                <div className="col-span-2 border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-2">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Internal Notes</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed italic bg-zinc-50 dark:bg-zinc-950 p-3.5 rounded-xl border border-zinc-200/50 dark:border-zinc-800">
                    "{vehicle.notes}"
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Connected Jobs timeline / feed */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-zinc-400" /> Connected Work Orders & Jobs
            </h3>
            
            {loadingJobs ? (
              <p className="text-sm text-zinc-400 animate-pulse py-4">Scanning jobs database...</p>
            ) : linkedJobs.length > 0 ? (
              <div className="space-y-3">
                {linkedJobs.map((job: any) => (
                  <div 
                    key={job.id}
                    onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}
                    className="p-4 bg-zinc-50 dark:bg-zinc-950 hover:bg-indigo-50/20 dark:hover:bg-indigo-500/5 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition-all group"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {job.jobNumber && (
                          <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300 rounded text-[10px] font-bold">
                            Job #{job.jobNumber}
                          </span>
                        )}
                        <h4 className="font-bold text-sm text-zinc-950 dark:text-zinc-100 truncate max-w-sm sm:max-w-md group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {job.title}
                        </h4>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Status: <span className="font-bold text-indigo-500 uppercase tracking-tight">{job.status || 'Pending'}</span> • Customer: {job.customerName || 'N/A'}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                <FileText className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-zinc-500 italic">No work orders linked to this vehicle yet.</p>
              </div>
            )}
          </div>

          {/* Facility Location Moves logs */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-zinc-400" /> Location Movement Log
            </h3>

            {loadingLogs ? (
              <p className="text-sm text-zinc-400 animate-pulse py-4">Generating timeline...</p>
            ) : locationLogs.length > 0 ? (
              <div className="relative pl-6 border-l-2 border-zinc-100 dark:border-zinc-800 space-y-6">
                {locationLogs.slice(0, 8).map((log: any) => {
                  const logDate = log.assignedAt?.toDate ? log.assignedAt.toDate() : (log.assignedAt?.seconds ? new Date(log.assignedAt.seconds * 1000) : new Date(log.assignedAt));
                  const isClear = log.action === 'cleared' || log.action === 'cleared (released)';
                  
                  return (
                    <div key={log.id} className="relative group/timeline">
                      {/* Timeline dot */}
                      <span className={`absolute -left-[31px] top-1.5 w-3 h-3 rounded-full border-2 bg-white dark:bg-zinc-900 transition-colors ${
                        isClear ? 'border-rose-400 group-hover/timeline:bg-rose-500' : 'border-indigo-400 group-hover/timeline:bg-indigo-500'
                      }`} />
                      
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white">
                            {isClear ? 'Cleared Location' : `Assigned to ${log.zoneName}`}
                          </span>
                          {log.notes && (
                            <span className="text-[9px] font-medium bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded uppercase">
                              {log.notes}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                          <Clock className="w-3 h-3" /> 
                          {logDate.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          <span>•</span>
                          <span>By {log.assignedByName || log.assignedBy || 'system'}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
                {locationLogs.length > 8 && (
                  <p className="text-xs text-zinc-400 italic pt-2">Showing latest 8 locations moves.</p>
                )}
              </div>
            ) : (
              <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                <MapPin className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-zinc-500 italic">No facility movement logs recorded.</p>
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Location & Live Status Tracking */}
        <div className="space-y-6">
          
          {/* Site Status Dashboard Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-zinc-400" /> Live Site Tracking
            </h3>

            {!vehicle.arrivedAt && !vehicle.departedAt ? (
              <div className="flex flex-col gap-4 bg-zinc-50 dark:bg-zinc-950 p-5 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                <p className="text-sm text-zinc-500 leading-relaxed text-center">
                  {vehicle.isWithCustomer ? "Vehicle is currently with the customer." : "Vehicle has not arrived at the facility yet."}
                </p>
                {canManage && (
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => handleWithCustomer(!vehicle.isWithCustomer)} 
                      disabled={isUpdatingStatus}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-bold rounded-xl transition-all shadow-sm disabled:opacity-50"
                    >
                      {vehicle.isWithCustomer ? "Return to Shop Floor" : "Mark as with Customer"}
                    </button>
                    <button 
                      onClick={handleIntake} 
                      disabled={isUpdatingStatus}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm disabled:opacity-50"
                    >
                      <LogIn className="w-4 h-4" /> Intake Vehicle
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Duration on Site</p>
                  <p className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-white flex items-center gap-2 mt-1">
                    <LiveDuration startSeconds={vehicle.arrivedAt?._seconds} endSeconds={vehicle.departedAt?._seconds} />
                    {vehicle.departedAt && <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2.5 py-0.5 rounded-full font-bold">DEPARTED</span>}
                    {!vehicle.departedAt && <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full font-bold animate-pulse">ACTIVE</span>}
                    {vehicle.isWithCustomer && <span className="text-[10px] bg-blue-500/10 text-blue-600 px-2.5 py-0.5 rounded-full font-bold">WITH CUSTOMER</span>}
                  </p>
                </div>
                
                {!vehicle.departedAt && canManage && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleWithCustomer(!vehicle.isWithCustomer)} 
                      disabled={isUpdatingStatus}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50"
                    >
                      {vehicle.isWithCustomer ? "Return to Shop" : "To Customer"}
                    </button>
                    <button 
                      onClick={handleRelease} 
                      disabled={isUpdatingStatus}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-400 text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Release Vehicle
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Current Location Zone Dropdown */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-zinc-400" /> Current Shop Location
            </h3>

            {loadingZones ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading zones...
              </div>
            ) : (
              <div className="space-y-3">
                <select
                  value={currentZone?.id || ""}
                  onChange={handleZoneChange}
                  disabled={!canManage}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  <option value="">Unassigned / Off-site</option>
                  {(zones || []).filter(z => z.type === 'bay').length > 0 && (
                    <optgroup label="Service Bays">
                      {(zones || []).filter(z => z.type === 'bay').map(z => (
                        <option key={z.id} value={z.id}>{z.name} {z.currentVehicleVin && z.currentVehicleVin !== vehicle.vin ? '(Occupied)' : ''}</option>
                      ))}
                    </optgroup>
                  )}
                  {(zones || []).filter(z => z.type === 'parking' || z.type === 'lot').length > 0 && (
                    <optgroup label="Parking lots">
                      {(zones || []).filter(z => z.type === 'parking' || z.type === 'lot').map(z => (
                        <option key={z.id} value={z.id}>{z.name} {z.currentVehicleVin && z.currentVehicleVin !== vehicle.vin ? '(Occupied)' : ''}</option>
                      ))}
                    </optgroup>
                  )}
                  {(zones || []).filter(z => z.type !== 'bay' && z.type !== 'parking' && z.type !== 'lot').length > 0 && (
                    <optgroup label="Other Zones">
                      {(zones || []).filter(z => z.type !== 'bay' && z.type !== 'parking' && z.type !== 'lot').map(z => (
                        <option key={z.id} value={z.id}>{z.name} {z.currentVehicleVin && z.currentVehicleVin !== vehicle.vin ? '(Occupied)' : ''}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-relaxed font-semibold">
                  * Assigning this vehicle to a zone automatically removes and logs any previous vehicle at that location.
                </p>
              </div>
            )}
          </div>

          {/* QR Code stickers download & visualization */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col items-center gap-4 text-center">
            <h3 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] w-full text-left flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-zinc-400" /> Vehicle Intake QR Code
            </h3>
            
            <div id={`qr-wrap-${vehicle.vin || vehicle.id}`} className="bg-white p-3 rounded-2xl shadow-inner border border-zinc-100 dark:border-zinc-800/10">
              <LogoQRCode 
                value={`${window.location.origin}/qr?t=${tenantId}&v=${encodeURIComponent(vehicle.vin || vehicle.id)}`} 
                size={140} 
                logoUrl={business?.rawData?.logoUrl || business?.logoUrl || ''} 
                businessName={business?.name || 'UpfittersOS'}
                type="vehicle"
              />
            </div>
            
            <div className="space-y-1">
              <p className="text-sm font-bold text-zinc-900 dark:text-white">Active Sticker QR Code</p>
              <p className="text-xs text-zinc-500 leading-normal">Download and print this sticker to label the vehicle's key tags or windshield.</p>
            </div>
            
            <button 
              onClick={() => {
                const wrap = document.getElementById(`qr-wrap-${vehicle.vin || vehicle.id}`);
                const svg = wrap?.querySelector('svg');
                if (!svg) return;
                const svgData = new XMLSerializer().serializeToString(svg);
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                const img = new Image();
                img.onload = () => {
                  canvas.width = img.width + 40;
                  canvas.height = img.height + 40;
                  if(ctx) {
                    ctx.fillStyle = "white";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 20, 20);
                  }
                  const pngFile = canvas.toDataURL("image/png");
                  const downloadLink = document.createElement("a");
                  downloadLink.download = `QR-${vehicle.vin || vehicle.id}.png`;
                  downloadLink.href = `${pngFile}`;
                  downloadLink.click();
                };
                img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
              }}
              className="w-full px-4 py-2.5 text-xs font-bold bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-700 dark:text-zinc-300 transition-colors shadow-sm"
            >
              Download PNG Sticker
            </button>
          </div>

        </div>

      </div>

      {/* 3. Confirm Modal Overlay */}
      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={() => {
          confirmConfig.onConfirm();
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />

      {/* 4. Edit Specs Modal */}
      {editingVehicle && (
        <EditVehicleModal
          tenantId={tenantId}
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['vehicle-details', tenantId, vehicleId] });
            queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/vehicles`] });
            queryClient.invalidateQueries({ queryKey: ['global-search-index', tenantId] });
            setEditingVehicle(null);
          }}
        />
      )}
    </div>
  );
}
