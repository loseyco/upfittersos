import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  serverTimestamp, limit 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Truck, Plus, ExternalLink, 
  Clock, Box, User, Search, Package, Calendar, AlertCircle,
  Trash2, CheckCircle, ShoppingCart, Hash, FileText, MapPin, Briefcase, CarFront,
  Maximize, Minimize
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useWakeLock } from '../../hooks/useWakeLock';
import { cn } from '../../lib/utils';
import { ConfirmModal } from '../../components/ConfirmModal';
import { PackageIntakeModal } from './PackageIntakeModal';
import { ItemDetailsModal } from './ItemDetailsModal';
import { useNavigate } from 'react-router-dom';
import { StaffLink } from './StaffPerformance';
import { motion, AnimatePresence } from 'framer-motion';

type RequestStatus = 'pending' | 'ordered' | 'received' | 'fulfilled' | 'cancelled';
type ShipmentStatus = 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'received';

interface QuickBooksPO {
  id: string;
  refNumber: string;
  vendorName: string;
  totalAmount: number;
  txnDate: string;
  isFullyReceived: boolean;
  trackingNumber?: string;
}

interface Zone {
  id: string;
  name: string;
  type: string;
  currentJobId?: string;
  currentVehicleVin?: string;
}

interface PartsRequest {
  id: string;
  partName: string;
  partNumber?: string;
  jobId?: string;
  taskId?: string;
  requestedBy: string;
  urgency: 'normal' | 'urgent';
  status: RequestStatus;
  notes?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdAt: any;
  zoneId?: string;
  vin?: string;
  quantity?: number;
}

interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  quantityOnHand?: number;
}

interface Shipment {
  id: string;
  trackingNumber: string;
  carrier: string;
  description: string;
  status: ShipmentStatus;
  location?: string;
  notes?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deliveredAt?: any;
  receivedBy?: string;
  eta: string | null;
  jobId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdAt: any;
  isIntake?: boolean;
}

interface Job {
  id: string;
  title: string;
  jobNumber?: string;
  vehicleId?: string;
}

interface Vehicle {
  vin: string;
  year?: string;
  make?: string;
  model?: string;
}

export function PartsMissionControl() {
  const navigate = useNavigate();
  const { tenantId, user, permissions, isSuperAdmin } = useAuthStore();
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const canManage = isSuperAdmin || permissions['parts.manage'];
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

  // Shipment Form State
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('UPS');
  const [shipDescription, setShipDescription] = useState('');
  const [shipJobId, setShipJobId] = useState('');

  // Data State
  const [requests, setRequests] = useState<PartsRequest[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [isIntakeOpen, setIsIntakeOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);

  // M1 states for real-time Firestore synchronization
  const [qbPOs, setQbPOs] = useState<QuickBooksPO[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryCount, setInventoryCount] = useState<number>(0);


  // Real-time listener for Zones
  React.useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/zones`), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Zone)));
      setLastUpdated(new Date());
    }, (err) => console.error("Zones listener error:", err));
    return () => unsub();
  }, [tenantId]);

  // Real-time listeners for Parts Requests, Jobs, Vehicles, Shipments, QuickBooks POs, and Inventory
  React.useEffect(() => {
    if (!tenantId || tenantId === 'GLOBAL') return;
    const q = query(
      collection(db, `businesses/${tenantId}/parts_requests`),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const data: PartsRequest[] = [];
      snap.docs.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as PartsRequest);
      });
      setRequests(data);
    }, (err) => {
      console.error("Parts Requests listener error:", err);
    });

    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), (snap) => {
      setJobs(snap.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          title: data.title || 'Untitled Job',
          jobNumber: data.jobNumber,
          vehicleId: data.vehicleId
        } as Job;
      }));
    }, (err) => console.error("Jobs listener error:", err));

    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), (snap) => {
      setVehicles(snap.docs.map(doc => ({ ...doc.data(), vin: doc.id } as Vehicle)));
    }, (err) => console.error("Vehicles listener error:", err));

    const qShipments = query(
      collection(db, `businesses/${tenantId}/shipments`),
      orderBy('createdAt', 'desc')
    );
    const unsubShipments = onSnapshot(qShipments, (snap) => {
      setShipments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shipment)));
    }, (err) => {
      console.error("Shipments listener error:", err);
    });

    // M1: Real-time listener for QuickBooks Purchase Orders
    const qPOs = query(
      collection(db, `businesses/${tenantId}/qb_purchase_orders`),
      orderBy('txnDate', 'desc'),
      limit(20)
    );
    const unsubPOs = onSnapshot(qPOs, (snap) => {
      setQbPOs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuickBooksPO)));
    }, (err) => {
      console.error("POs listener error:", err);
    });

    // M1: Real-time listener for Inventory Items
    const qInventory = query(
      collection(db, `businesses/${tenantId}/inventory_items`),
      orderBy('quantityOnHand', 'asc')
    );
    const unsubInventory = onSnapshot(qInventory, (snap) => {
      const allItems = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInventory(allItems.slice(0, 10) as InventoryItem[]);
      setInventoryCount(snap.size);
    }, (err) => {
      console.error("Inventory listener error:", err);
    });

    return () => {
      unsubscribe();
      unsubJobs();
      unsubVehicles();
      unsubShipments();
      unsubPOs();
      unsubInventory();
    };
  }, [tenantId]);

  // Calculate stats reactively in memory - completely eliminating query-client invalidations (M1)
  const stats = React.useMemo(() => {
    return {
      pendingRequests: requests.filter(r => r.status === 'pending').length,
      activeShipments: shipments.filter(s => s.status !== 'delivered').length,
      inventoryItems: inventoryCount
    };
  }, [requests, shipments, inventoryCount]);

  const handleAddTrackingToPO = async (po: QuickBooksPO) => {
    const tracking = prompt(`Enter tracking number for PO #${po.refNumber}:`);
    if (!tracking || !tenantId) return;

    const carrier = detectCarrier(tracking);
    
    try {
      // 1. Create a shipment record
      await addDoc(collection(db, `businesses/${tenantId}/shipments`), {
        trackingNumber: tracking.trim(),
        carrier,
        description: `PO #${po.refNumber} - ${po.vendorName}`,
        status: 'pending',
        eta: null,
        poId: po.id,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || 'system',
        createdByName: user?.displayName || user?.email?.split('@')[0] || null,
        createdByEmail: user?.email || null,
      });

      // 2. Update the PO record with the tracking number (for local reference)
      const { updateDoc, doc } = await import('firebase/firestore');
      await updateDoc(doc(db, `businesses/${tenantId}/qb_purchase_orders`, po.id), {
        trackingNumber: tracking.trim()
      });

      toast.success('Tracking added and shipment created');
    } catch (err) {
      console.error('Error adding tracking to PO:', err);
      toast.error('Failed to add tracking');
    }
  };

  const handleMarkPutAway = async (shipmentId: string) => {
    if (!tenantId) return;
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, `businesses/${tenantId}/shipments`, shipmentId), {
        status: 'delivered',
        putAwayAt: serverTimestamp()
      });
      toast.success('Package marked as put away');
    } catch (err) {
      console.error('Error marking as put away:', err);
      toast.error('Failed to update status');
    }
  };

  const detectCarrier = (tracking: string) => {
    const t = tracking.toUpperCase().replace(/\s/g, '');
    if (t.startsWith('1Z')) return 'UPS';
    if (t.length === 12 || t.length === 15 || t.length === 20) return 'FedEx';
    if (t.startsWith('TBA')) return 'Amazon';
    if (t.length >= 22) return 'USPS';
    return 'Other';
  };

  const handleTrackingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTrackingNumber(val);
    if (val.length > 5) {
      setCarrier(detectCarrier(val));
    }
  };

  const handleAddTrackingToRequest = async (request: PartsRequest) => {
    const tracking = prompt(`Enter tracking number for ${request.partName}:`);
    if (!tracking || !tenantId) return;

    const carrier = detectCarrier(tracking);
    
    try {
      // 1. Create a shipment record
      await addDoc(collection(db, `businesses/${tenantId}/shipments`), {
        trackingNumber: tracking.trim(),
        carrier,
        description: `Part Order: ${request.partName}`,
        status: 'pending',
        eta: null,
        requestId: request.id,
        jobId: request.jobId || null,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || 'system',
        createdByName: user?.displayName || user?.email?.split('@')[0] || null,
        createdByEmail: user?.email || null,
      });

      // 2. Update the request status to 'ordered'
      const { updateDoc, doc } = await import('firebase/firestore');
      await updateDoc(doc(db, `businesses/${tenantId}/parts_requests`, request.id), {
        status: 'ordered',
        trackingNumber: tracking.trim(),
        statusChangedAt: serverTimestamp()
      });

      toast.success('Tracking linked and request marked as ordered');
    } catch (err) {
      console.error('Error linking tracking to request:', err);
      toast.error('Failed to link tracking');
    }
  };

  const handleSubmitShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !trackingNumber.trim()) return;
    
    setIsSubmitting(true);
    const promise = addDoc(collection(db, `businesses/${tenantId}/shipments`), {
      trackingNumber: trackingNumber.trim(),
      carrier,
      description: shipDescription.trim(),
      jobId: shipJobId || null,
      status: 'pending',
      eta: null,
      createdAt: serverTimestamp(),
      createdBy: user?.uid || 'system',
      createdByName: user?.displayName || user?.email?.split('@')[0] || null,
      createdByEmail: user?.email || null,
    });

    toast.promise(promise, {
      loading: 'Adding shipment to tracking...',
      success: () => {
        setTrackingNumber('');
        setShipDescription('');
        setShipJobId('');
        setIsSubmitting(false);
        return 'Shipment added to tracking';
      },
      error: () => {
        setIsSubmitting(false);
        return 'Failed to add shipment';
      }
    });
  };

  const handleUpdateStatus = async (requestId: string, newStatus: RequestStatus) => {
    if (!tenantId) return;
    try {
      const { updateDoc, doc, addDoc, collection } = await import('firebase/firestore');
      await updateDoc(doc(db, `businesses/${tenantId}/parts_requests`, requestId), {
        status: newStatus,
        statusChangedAt: serverTimestamp()
      });
      
      const partReq = requests.find(r => r.id === requestId);
      if (partReq) {
        await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
          type: 'parts',
          title: `Part Status: ${newStatus.toUpperCase()}`,
          message: `${partReq.partName} was marked as ${newStatus}`,
          timestamp: serverTimestamp(),
          severity: newStatus === 'received' || newStatus === 'fulfilled' ? 'success' : 'info',
          author: user?.displayName || user?.email?.split('@')[0] || 'System'
        });
      }
      
      toast.success(`Request marked as ${newStatus}`);
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update status');
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!tenantId) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Parts Request',
      message: 'Are you sure you want to delete this parts request? This action cannot be undone.',
      onConfirm: async () => {
        try {
          const { deleteDoc, doc } = await import('firebase/firestore');
          await deleteDoc(doc(db, `businesses/${tenantId}/parts_requests`, requestId));
          toast.success('Request deleted');
        } catch (err) {
          console.error('Error deleting request:', err);
          toast.error('Failed to delete request');
        }
      }
    });
  };

  // M2 badge coloring with cohesive, high-contrast themes using HSL variables
  const getCarrierBadgeStyles = (carrier: string) => {
    const c = carrier.toUpperCase();
    if (c === 'UPS') return 'bg-[hsl(35,85%,35%)]/15 text-[hsl(35,85%,45%)] border border-[hsl(35,85%,35%)]/30';
    if (c === 'FEDEX') return 'bg-[hsl(263,70%,50%)]/15 text-[hsl(263,70%,60%)] border border-[hsl(263,70%,50%)]/30';
    if (c === 'USPS') return 'bg-[hsl(215,80%,50%)]/15 text-[hsl(215,80%,60%)] border border-[hsl(215,80%,50%)]/30';
    if (c === 'AMAZON') return 'bg-[hsl(30,100%,50%)]/15 text-[hsl(30,100%,50%)] border border-[hsl(30,100%,50%)]/30';
    return 'bg-[hsl(160,84%,40%)]/15 text-[hsl(160,84%,50%)] border border-[hsl(160,84%,40%)]/30';
  };

  const getUrgencyBadgeStyles = (urgency: string) => {
    return urgency === 'urgent' 
      ? 'bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)] border border-[hsl(0,84%,60%)]/30 animate-pulse'
      : 'bg-[hsl(220,14%,60%)]/15 text-[hsl(220,14%,60%)] border border-[hsl(220,14%,60%)]/30';
  };

  const getStatusColor = (status: RequestStatus | ShipmentStatus) => {
    switch (status) {
      case 'fulfilled':
      case 'received':
      case 'delivered': return 'bg-[hsl(142,76%,36%)]/15 text-[hsl(142,70%,45%)] ring-1 ring-[hsl(142,76%,36%)]/30';
      case 'ordered':
      case 'in_transit':
      case 'out_for_delivery': return 'bg-[hsl(217,91%,60%)]/15 text-[hsl(217,91%,65%)] ring-1 ring-[hsl(217,91%,60%)]/30';
      case 'cancelled':
      case 'exception': return 'bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,65%)] ring-1 ring-[hsl(0,84%,60%)]/30';
      default: return 'bg-[hsl(35,92%,50%)]/15 text-[hsl(35,92%,55%)] ring-1 ring-[hsl(35,92%,50%)]/30';
    }
  };

  const activeShipments = shipments?.filter(s => s.status !== 'delivered') || [];
  const recentReceived = shipments?.filter(s => s.status === 'delivered').slice(0, 10) || [];

  return (
    <div 
      ref={containerRef}
      className={cn(
        "animate-in fade-in duration-500",
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
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Parts Mission Control</span>
            <span className="text-[10px] font-bold text-zinc-500">• Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        )}
        <button 
          onClick={toggleFullscreen}
          className="hidden sm:flex w-full sm:w-auto px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-lg transition-all items-center justify-center gap-2 cursor-pointer"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
        </button>
        <button 
          onClick={() => setIsIntakeOpen(true)}
          className="w-full sm:w-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group active:scale-95 cursor-pointer"
        >
          <Package className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          RECEIVE PACKAGE
        </button>
      </div>

      <PackageIntakeModal 
        isOpen={isIntakeOpen}
        onClose={() => setIsIntakeOpen(false)}
        onSuccess={() => {}}
        zones={zones}
      />
      <ItemDetailsModal 
        isOpen={!!selectedPartId || !!selectedShipmentId}
        onClose={() => {
          setSelectedPartId(null);
          setSelectedShipmentId(null);
        }}
        itemId={selectedPartId || selectedShipmentId}
        type={selectedPartId ? 'part' : 'shipment'}
        zones={zones}
      />
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Parts Mission Control</h1>
          <p className="text-zinc-500 text-sm mt-1">Manage requests, track shipments, and intake packages.</p>
        </div>
      </div>

      {/* KPI Header - updated with M2 Dark Glassmorphic visual theme */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={cn(
          "bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl",
          isFullscreen ? "p-3" : "p-6"
        )}>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-xl">
              <Clock className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">Pending Requests</p>
              <p className="text-2xl font-bold text-white">{stats?.pendingRequests ?? 0}</p>
            </div>
          </div>
        </div>
        <div className={cn(
          "bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl",
          isFullscreen ? "p-3" : "p-6"
        )}>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-xl">
              <Truck className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">Active Shipments</p>
              <p className="text-2xl font-bold text-white">{stats?.activeShipments ?? 0}</p>
            </div>
          </div>
        </div>
        <div className={cn(
          "bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl",
          isFullscreen ? "p-3" : "p-6"
        )}>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 rounded-xl">
              <Box className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">Inventory Items</p>
              <p className="text-2xl font-bold text-white">{stats?.inventoryItems ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Left Column: Requests and Shipments Forms */}
        {canManage ? (
          <div className="space-y-8">
            {/* Incoming Shipment Form - dark glassmorphic styling */}
            <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-white">
                <Truck className="w-5 h-5 text-indigo-500" />
                Track Incoming Shipment
              </h2>
              <form onSubmit={handleSubmitShipment} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Tracking Number</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-zinc-400" />
                      </div>
                      <input 
                        type="text" 
                        required
                        value={trackingNumber}
                        onChange={handleTrackingChange}
                        placeholder="Paste tracking number..."
                        className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-zinc-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Carrier</label>
                    <select 
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-zinc-900 dark:text-white"
                    >
                      <option value="UPS">UPS</option>
                      <option value="FedEx">FedEx</option>
                      <option value="USPS">USPS</option>
                      <option value="Amazon">Amazon</option>
                      <option value="DHL">DHL</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Description / PO</label>
                    <input 
                      type="text" 
                      value={shipDescription}
                      onChange={(e) => setShipDescription(e.target.value)}
                      placeholder="e.g. Parts for Smith Job"
                      className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-zinc-900 dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Link to Job</label>
                    <select 
                      value={shipJobId}
                      onChange={(e) => setShipJobId(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-zinc-900 dark:text-white"
                    >
                      <option value="">No Job Linked</option>
                      {jobs.map(job => (
                        <option key={job.id} value={job.id}>{job.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting || !trackingNumber.trim()}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Truck className="w-5 h-5" />
                  Track Shipment
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl p-8 flex flex-col items-center justify-center text-center">
            <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-4">
              <AlertCircle className="w-8 h-8 text-zinc-400" />
            </div>
            <h3 className="font-bold text-white mb-2">Restricted Access</h3>
            <p className="text-sm text-zinc-400 max-w-xs">
              You do not have the required permissions to create parts requests or track shipments. 
              Please contact an administrator if you believe this is an error.
            </p>
          </div>
        )}

        {/* Right Column: Feeds */}
        <div className="space-y-8">
          {/* Parts Request List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {showHistory ? 'Request History' : 'Active Requests'}
              </h3>
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                  showHistory 
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border-zinc-200 dark:border-zinc-700' 
                    : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
                }`}
              >
                {showHistory ? 'View Active' : 'View History'}
              </button>
            </div>
            {(() => {
              const filteredRequests = requests.filter(r => 
                showHistory 
                  ? (r.status === 'fulfilled' || r.status === 'cancelled')
                  : (r.status !== 'fulfilled' && r.status !== 'cancelled')
              );

              if (filteredRequests.length === 0) {
                return (
                  <div className="p-8 text-center text-zinc-400 bg-zinc-900/60 backdrop-blur-xl border border-dashed border-white/[0.08] rounded-2xl">
                    {showHistory ? 'No request history found.' : 'No active parts requests.'}
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    {filteredRequests.map(request => {
                      const job = jobs.find(j => j.id === request.jobId);
                      const currentVin = (request.vin || job?.vehicleId || '').trim();
                      const vehicle = currentVin ? vehicles.find(v => v.vin === currentVin) : null;
                      
                      // Try to find current zone first, then fall back to requested zoneId
                      const currentZone = zones.find(z => 
                        (request.jobId && z.currentJobId === request.jobId) || 
                        (currentVin && z.currentVehicleVin === currentVin)
                      );
                      const requestedZone = zones.find(z => z.id === request.zoneId);
                      const zone = currentZone || requestedZone;

                      return (
                        <motion.div 
                          key={request.id} 
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 350, damping: 25 }}
                          whileHover={{ scale: 1.02, y: -4 }}
                          onClick={() => {
                            if (request.jobId && request.taskId) {
                              navigate(`/business/${tenantId}/task/${request.jobId}/${request.taskId}`);
                            } else if (request.jobId) {
                              navigate(`/business/${tenantId}/job/${request.jobId}`);
                            } else {
                              setSelectedPartId(request.id);
                            }
                          }}
                          className="bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl p-4 hover:border-indigo-500/50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getUrgencyBadgeStyles(request.urgency)}`}>
                                  {request.urgency}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 dark:bg-indigo-500/20 uppercase tracking-widest">
                                  Qty: {request.quantity || 1}
                                </span>
                                <h4 className="font-bold text-white truncate">{request.partName}</h4>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                                <div className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  <StaffLink name={request.requestedBy} tenantId={tenantId!} />
                                </div>
                                <span>•</span>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {request.createdAt?.toDate ? request.createdAt.toDate().toLocaleDateString() : 'Just now'}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-tight ring-1 ${getStatusColor(request.status)}`}>
                                {request.status === 'fulfilled' ? 'WITH VEHICLE' : request.status.toUpperCase()}
                              </span>
                              {canManage && request.status === 'pending' && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddTrackingToRequest(request);
                                  }}
                                  className="p-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg shadow-sm transition-all active:scale-95 flex items-center gap-1 group cursor-pointer"
                                  title="Add Tracking & Mark Ordered"
                                >
                                  <Truck className="w-3 h-3" />
                                  <span className="text-[8px] font-black uppercase tracking-widest hidden group-hover:block">Add Tracking</span>
                                </button>
                              )}
                              {canManage && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteRequest(request.id);
                                  }}
                                  className="p-1 text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          <div className="bg-zinc-50 dark:bg-zinc-950/50 rounded-xl p-3 border border-zinc-100 dark:border-zinc-800 space-y-2 mb-3">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                                <span className="font-bold text-white">
                                  {job?.title || (currentVin ? 'Vehicle Request' : 'Unknown Job')}
                                </span>
                                {job?.jobNumber && <span className="text-zinc-400 font-mono">#{job.jobNumber}</span>}
                              </div>
                              {zone && (
                                <div className={cn(
                                  "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase",
                                  currentZone 
                                    ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" 
                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                                )}>
                                  <MapPin className="w-2.5 h-2.5" />
                                  {zone.name}
                                  {!currentZone && <span className="ml-1 text-[8px] opacity-60">(Requested)</span>}
                                </div>
                              )}
                            </div>
                            
                            {(vehicle || currentVin) && (
                              <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-medium">
                                <CarFront className="w-3.5 h-3.5 text-zinc-500" />
                                {vehicle ? (
                                  <span>{vehicle.year} {vehicle.make} {vehicle.model}</span>
                                ) : (
                                  <span>Unknown Vehicle</span>
                                )}
                                <span className="text-zinc-400 dark:text-zinc-600 font-mono text-[10px]">{currentVin}</span>
                              </div>
                            )}
                          </div>

                        {request.notes && (
                          <div className="mb-3 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg text-xs text-zinc-400 italic">
                            <span className="font-bold not-italic mr-1 text-amber-600">Note:</span>
                            {request.notes}
                          </div>
                        )}

                        {/* Status Management Actions */}
                        {canManage && (
                          <div className="flex items-center gap-1 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                            {request.status === 'pending' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(request.id, 'ordered'); }}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-all cursor-pointer"
                              >
                                <ShoppingCart className="w-3 h-3" />
                                MARK ORDERED
                              </button>
                            )}
                            {request.status === 'ordered' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(request.id, 'received'); }}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-all cursor-pointer"
                              >
                                <CheckCircle className="w-3 h-3" />
                                MARK RECEIVED
                              </button>
                            )}
                            {request.status === 'received' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(request.id, 'fulfilled'); }}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 transition-all cursor-pointer"
                              >
                                <CheckCircle className="w-3 h-3" />
                                MARK WITH VEHICLE
                              </button>
                            )}
                            {request.status === 'fulfilled' && (
                              <div className="flex-1 text-center text-[10px] font-bold text-emerald-600/50 py-1.5">
                                ✓ WITH VEHICLE
                              </div>
                            )}
                            {(request.status === 'pending' || request.status === 'ordered') && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(request.id, 'cancelled'); }}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer"
                              >
                                CANCEL
                              </button>
                            )}
                          </div>
                        )}
                      </motion.div>
                    );})}
                  </AnimatePresence>
                </div>
              );
            })()}
          </div>

          {/* Recently Arrived Packages */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              Recently Arrived
            </h3>
            {recentReceived.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 bg-zinc-900/60 backdrop-blur-xl border border-dashed border-white/[0.08] rounded-2xl">
                No recent arrivals.
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {recentReceived.map(shipment => (
                    <motion.div 
                      key={shipment.id} 
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      whileHover={{ scale: 1.02, y: -4 }}
                      onClick={() => setSelectedShipmentId(shipment.id)}
                      className="bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl p-4 flex flex-col gap-3 hover:border-emerald-500/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center justify-between pointer-events-none">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white truncate max-w-[150px]">{shipment.description || 'Arrived Package'}</span>
                          <span className="text-[10px] font-mono text-zinc-400 truncate">{shipment.trackingNumber}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">
                          RECEIVED
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <div className="flex flex-col gap-1 flex-1">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                            <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                            {shipment.location || 'Unknown Location'}
                          </div>
                          {shipment.notes && (
                            <div className="flex items-start gap-1.5 text-[10px] text-zinc-400 bg-zinc-50 dark:bg-zinc-800/55 p-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                              <FileText className="w-3 h-3 mt-0.5 text-zinc-400 shrink-0" />
                              <span className="italic">"{shipment.notes}"</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                            <User className="w-3.5 h-3.5" />
                            Received by <StaffLink name={shipment.receivedBy || 'Staff'} tenantId={tenantId!} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 text-right">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkPutAway(shipment.id);
                            }}
                            className="p-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 pointer-events-auto flex items-center gap-2 group/btn cursor-pointer"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-wider hidden group-hover/btn:block">Mark Processed</span>
                          </button>
                          <div className="text-[10px] text-zinc-400 flex flex-col items-end opacity-60">
                            <span className="font-bold">{shipment.deliveredAt?.toDate ? shipment.deliveredAt.toDate().toLocaleDateString() : 'Today'}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Inbound Shipments */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4" />
              Inbound Shipments
            </h3>
            {activeShipments.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 bg-zinc-900/60 backdrop-blur-xl border border-dashed border-white/[0.08] rounded-2xl">
                No active shipments.
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {activeShipments.map(shipment => {
                    const isLocalIntake = shipment.isIntake;
                    return (
                      <motion.div 
                        key={shipment.id} 
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        whileHover={{ scale: 1.02, y: -4 }}
                        onClick={() => setSelectedShipmentId(shipment.id)}
                        className={`bg-zinc-900/60 backdrop-blur-xl border ${isLocalIntake ? 'border-emerald-500/30' : 'border-white/[0.08]'} shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl p-4 flex flex-col gap-3 hover:border-indigo-500/50 transition-colors cursor-pointer group`}
                      >
                        <div className="flex items-center justify-between pointer-events-none">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${isLocalIntake ? 'bg-emerald-500 text-white' : getCarrierBadgeStyles(shipment.carrier)}`}>
                              {isLocalIntake ? 'LOCAL INTAKE' : 'SHIPMENT'}
                            </span>
                            <span className="font-bold text-white">
                              {isLocalIntake ? 'Package Received' : shipment.carrier}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[100px]">
                              {shipment.trackingNumber}
                            </span>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider ring-1 ${getStatusColor(shipment.status)}`}>
                            {shipment.status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </div>
                        
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold text-zinc-300">
                            {shipment.description || 'No description'}
                          </p>
                          {shipment.location && (
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                              <MapPin className="w-3 h-3 text-emerald-500" />
                              Stored at: <span className="font-bold text-zinc-300">{shipment.location}</span>
                            </div>
                          )}
                          {shipment.notes && (
                            <p className="text-[10px] text-zinc-400 italic mt-1 line-clamp-2">"{shipment.notes}"</p>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center gap-3">
                            {shipment.eta && (
                              <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                                <Calendar className="w-3 h-3" /> {shipment.eta}
                              </div>
                            )}
                            {shipment.jobId && (
                              <div className="text-[10px] font-semibold text-indigo-500">
                                Job: {jobs.find(j => j.id === shipment.jobId)?.title || 'Linked'}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-right">
                            {isLocalIntake && shipment.status === 'received' && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkPutAway(shipment.id);
                                }}
                                className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle className="w-3 h-3" />
                                MARK PUT AWAY
                              </button>
                            )}
                            {!isLocalIntake && (
                              <a 
                                href={`https://parcelsapp.com/en/tracking/${shipment.trackingNumber}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 text-zinc-400 hover:text-indigo-500 transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* QuickBooks Purchase Orders */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" />
              QuickBooks Purchase Orders
            </h3>
            {!qbPOs || qbPOs.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 bg-zinc-900/60 backdrop-blur-xl border border-dashed border-white/[0.08] rounded-2xl">
                No recent POs from QuickBooks.
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {qbPOs.map(po => (
                    <motion.div 
                      key={po.id} 
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      whileHover={{ scale: 1.02, y: -4 }}
                      className="bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl p-4 hover:border-indigo-500/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Hash className="w-4 h-4 text-zinc-400" />
                          <span className="font-bold text-white">PO #{po.refNumber}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${po.isFullyReceived ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                          {po.isFullyReceived ? 'RECEIVED' : 'OPEN'}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-end">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-zinc-300">{po.vendorName}</p>
                          <p className="text-[10px] text-zinc-400">Total: ${po.totalAmount.toLocaleString()}</p>
                        </div>
                        
                        {po.trackingNumber ? (
                          <div className="flex items-center gap-1.5 text-xs font-mono text-indigo-500 bg-indigo-500/5 px-2 py-1 rounded-lg">
                            <Truck className="w-3.5 h-3.5" />
                            {po.trackingNumber}
                          </div>
                        ) : (
                          canManage && (
                            <button 
                              onClick={() => handleAddTrackingToPO(po)}
                              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 px-2 py-1 bg-indigo-500/10 rounded-lg transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              ADD TRACKING
                            </button>
                          )
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Stock Alerts */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Stock Alert (QuickBooks)
            </h3>
            <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl overflow-hidden">
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                <AnimatePresence mode="popLayout">
                  {inventory?.map((item: InventoryItem) => (
                    <motion.div 
                      key={item.id} 
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      whileHover={{ scale: 1.01 }}
                      onClick={() => setSelectedPartId(item.id)}
                      className="p-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                    >
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="text-sm font-semibold text-white truncate group-hover:text-indigo-600 transition-colors">{item.name}</p>
                        <p className="text-[10px] text-zinc-400 uppercase tracking-tighter">SKU: {item.sku || 'N/A'}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${Number(item.quantityOnHand) <= 0 ? 'text-red-500' : 'text-white'}`}>
                          {item.quantityOnHand ?? 0}
                        </p>
                        <p className="text-[10px] text-zinc-400 uppercase">On Hand</p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
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
