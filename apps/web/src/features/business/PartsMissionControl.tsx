import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  serverTimestamp, limit 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Truck, Plus, 
  Clock, Box, User, Search, Package, AlertCircle,
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

type RequestStatus = 'pending' | 'ordered' | 'received' | 'fulfilled' | 'cancelled' | 'inventoried';
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

  // Dropdown search state
  const [isJobDropdownOpen, setIsJobDropdownOpen] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isPoDropdownOpen, setIsPoDropdownOpen] = useState(false);
  const [poSearchQuery, setPoSearchQuery] = useState('');
  const poDropdownRef = useRef<HTMLDivElement>(null);

  // Recently received states
  const [activeFilter, setActiveFilter] = useState<'all' | 'arriving' | 'received' | 'delivered'>('received');
  const [packageSearchQuery, setPackageSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(10);

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

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsJobDropdownOpen(false);
      }
      if (poDropdownRef.current && !poDropdownRef.current.contains(event.target as Node)) {
        setIsPoDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered QuickBooks POs for searchable dropdown
  const filteredPOsForSelect = React.useMemo(() => {
    const q = poSearchQuery.toLowerCase().trim();
    if (!q) return qbPOs;
    return qbPOs.filter(po => 
      po.refNumber?.toLowerCase().includes(q) || 
      po.vendorName?.toLowerCase().includes(q)
    );
  }, [qbPOs, poSearchQuery]);

  // Filtered jobs for searchable dropdown
  const filteredJobsForSelect = React.useMemo(() => {
    const q = jobSearchQuery.toLowerCase().trim();
    if (!q) return jobs;
    return jobs.filter(j => 
      j.title?.toLowerCase().includes(q) || 
      j.jobNumber?.toLowerCase().includes(q)
    );
  }, [jobs, jobSearchQuery]);

  // Merged Recently Received (Shipments + Parts Requests)
  const baseReceived = React.useMemo(() => {
    return [
      ...shipments.map(s => ({ ...s, type: 'shipment' })),
      ...requests.map(p => ({ ...p, type: 'part', description: p.partName, status: p.status }))
    ].filter((item: any) => {
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
  }, [shipments, requests, packageSearchQuery]);

  const counts = React.useMemo(() => {
    return {
      arriving: baseReceived.filter((i: any) => i.status === 'ordered' || i.status === 'in_transit' || i.status === 'out_for_delivery' || i.status === 'pending').length,
      received: baseReceived.filter((i: any) => i.status === 'received').length,
      delivered: baseReceived.filter((i: any) => i.status === 'delivered' || i.status === 'fulfilled').length,
    };
  }, [baseReceived]);

  const allReceived = React.useMemo(() => {
    return baseReceived.filter((item: any) => {
      if (activeFilter === 'arriving' && !(item.status === 'ordered' || item.status === 'in_transit' || item.status === 'out_for_delivery' || item.status === 'pending')) return false;
      if (activeFilter === 'received' && item.status !== 'received') return false;
      if (activeFilter === 'delivered' && !(item.status === 'delivered' || item.status === 'fulfilled')) return false;
      
      return true;
    }).sort((a: any, b: any) => {
      const timeA = a.createdAt?.seconds || a.statusChangedAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || b.statusChangedAt?.seconds || 0;
      return timeB - timeA;
    });
  }, [baseReceived, activeFilter]);

  const displayItems = React.useMemo(() => {
    return allReceived.slice(0, displayLimit);
  }, [allReceived, displayLimit]);

  const hasMore = allReceived.length > displayLimit;

  const handleUpdateStatusPackage = async (item: any, newStatus: string) => {
    if (!tenantId) return;
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const collectionName = item.type === 'shipment' ? 'shipments' : 'parts_requests';
      const updateData: any = {
        status: newStatus,
        statusChangedAt: serverTimestamp(),
        statusChangedBy: user?.uid || '',
        statusChangedByName: user?.displayName || user?.email || 'Parts Dept',
        updatedBy: user?.uid || '',
        updatedByName: user?.displayName || user?.email || 'Parts Dept'
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
      const { updateDoc, doc, addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      const userName = user?.displayName || user?.email?.split('@')[0] || 'Staff';
      const userId = user?.uid || null;

      const updateFields: any = {
        status: newStatus,
        statusChangedAt: serverTimestamp(),
        statusChangedBy: userId,
        statusChangedByName: userName,
        updatedBy: userId,
        updatedByName: userName
      };

      if (newStatus === 'received') {
        updateFields.receivedAt = serverTimestamp();
        updateFields.receivedBy = userName;
        updateFields.receivedByName = userName;
        updateFields.receivedByStaffId = userId;
      } else if (newStatus === 'ordered') {
        updateFields.orderedAt = serverTimestamp();
        updateFields.orderedBy = userName;
        updateFields.orderedByName = userName;
        updateFields.orderedByStaffId = userId;
      }

      await updateDoc(doc(db, `businesses/${tenantId}/parts_requests`, requestId), updateFields);
      
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
      case 'inventoried': return 'bg-[hsl(260,80%,55%)]/15 text-[hsl(260,80%,60%)] ring-1 ring-[hsl(260,80%,55%)]/30';
      case 'ordered':
      case 'in_transit':
      case 'out_for_delivery': return 'bg-[hsl(217,91%,60%)]/15 text-[hsl(217,91%,65%)] ring-1 ring-[hsl(217,91%,60%)]/30';
      case 'cancelled':
      case 'exception': return 'bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,65%)] ring-1 ring-[hsl(0,84%,60%)]/30';
      default: return 'bg-[hsl(35,92%,50%)]/15 text-[hsl(35,92%,55%)] ring-1 ring-[hsl(35,92%,50%)]/30';
    }
  };



  return (
    <div 
      ref={containerRef}
      className={cn(
        "animate-in fade-in duration-500",
        isFullscreen ? "p-2 space-y-2 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar" : "space-y-8"
      )}
    >
      <Toaster position="top-right" richColors theme="system" closeButton />
      {isFullscreen && (
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 w-full relative z-10">
          <div className="mr-auto flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Parts Mission Control</span>
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
        {!isFullscreen && (
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto shrink-0">
            <button 
              onClick={toggleFullscreen}
              className="hidden sm:flex w-full sm:w-auto px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2 cursor-pointer"
            >
              <Maximize className="w-4 h-4" />
              Full Screen
            </button>
            <button 
              onClick={() => setIsIntakeOpen(true)}
              className="w-full sm:w-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group active:scale-95 cursor-pointer"
            >
              <Package className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              RECEIVE PACKAGE
            </button>
          </div>
        )}
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
            <div className={cn(
              "bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl p-6 relative",
              (isJobDropdownOpen || isPoDropdownOpen) ? "z-20 animate-none" : "z-10"
            )}>
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
                  <div className="space-y-1 relative" ref={poDropdownRef}>
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Description / PO</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={shipDescription}
                        onChange={(e) => {
                          setShipDescription(e.target.value);
                          setPoSearchQuery(e.target.value);
                          setIsPoDropdownOpen(true);
                        }}
                        onFocus={() => {
                          setPoSearchQuery(shipDescription);
                          setIsPoDropdownOpen(true);
                        }}
                        placeholder="e.g. Parts for Smith Job"
                        className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-zinc-900 dark:text-white font-medium placeholder:text-zinc-500"
                      />
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />

                      {isPoDropdownOpen && (
                        <div className="absolute left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 shadow-2xl rounded-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1 space-y-1">
                            <div className="px-3 py-1.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-850 mb-1">
                              QuickBooks Purchase Orders
                            </div>
                            {filteredPOsForSelect.map(po => {
                              const displayText = `PO #${po.refNumber} - ${po.vendorName}`;
                              return (
                                <button
                                  key={po.id}
                                  type="button"
                                  onClick={() => {
                                    setShipDescription(displayText);
                                    setIsPoDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all flex items-center justify-between cursor-pointer"
                                >
                                  <span className="truncate">{displayText}</span>
                                  <span className="text-[10px] text-zinc-500 font-mono">${po.totalAmount.toLocaleString()}</span>
                                </button>
                              );
                            })}
                            {filteredPOsForSelect.length === 0 && (
                              <div className="p-3 text-center text-zinc-500 text-xs italic">
                                No matching QuickBooks POs found
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1 relative" ref={dropdownRef}>
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Link to Job</label>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsJobDropdownOpen(!isJobDropdownOpen);
                          setJobSearchQuery('');
                        }}
                        className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-zinc-900 dark:text-white flex items-center justify-between font-medium cursor-pointer"
                      >
                        <span className="truncate">
                          {shipJobId 
                            ? (jobs.find(j => j.id === shipJobId) ? (() => {
                                const matched = jobs.find(j => j.id === shipJobId);
                                return matched ? `${matched.jobNumber ? `#${matched.jobNumber} ` : ''}${matched.title}` : 'Linked Job';
                              })() : 'Linked Job')
                            : 'No Job Linked'}
                        </span>
                        <Search className="w-4 h-4 text-zinc-400" />
                      </button>

                      {isJobDropdownOpen && (
                        <div className="absolute left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 shadow-2xl rounded-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="p-2 border-b border-zinc-800">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                              <input
                                type="text"
                                value={jobSearchQuery}
                                onChange={(e) => setJobSearchQuery(e.target.value)}
                                placeholder="Search jobs by title or number..."
                                className="w-full pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs outline-none text-white focus:border-indigo-500"
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1 space-y-1">
                            <button
                              type="button"
                              onClick={() => {
                                setShipJobId('');
                                setIsJobDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                                !shipJobId ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                              )}
                            >
                              No Job Linked
                            </button>
                            {filteredJobsForSelect.map(job => {
                              const isSelected = shipJobId === job.id;
                              return (
                                <button
                                  key={job.id}
                                  type="button"
                                  onClick={() => {
                                    setShipJobId(job.id);
                                    setIsJobDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-between cursor-pointer",
                                    isSelected ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                                  )}
                                >
                                  <span className="truncate">
                                    {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title}
                                  </span>
                                </button>
                              );
                            })}
                            {filteredJobsForSelect.length === 0 && (
                              <div className="p-3 text-center text-zinc-500 text-xs italic">
                                No matching jobs found
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
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

            {/* Recently Received panel matching the office dashboard */}
            <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                  <Package className="w-5 h-5 text-emerald-500" />
                  Recently Received
                </h2>
                <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                  {allReceived.length} Items
                </span>
              </div>

              {/* Package Search Box */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-zinc-400" />
                </div>
                <input
                  type="text"
                  value={packageSearchQuery}
                  onChange={(e) => setPackageSearchQuery(e.target.value)}
                  placeholder="Search packages (tracking, notes, location)..."
                  className="w-full pl-9 pr-8 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-medium outline-none text-white focus:border-indigo-500 placeholder:text-zinc-500"
                />
                {packageSearchQuery && (
                  <button 
                    onClick={() => setPackageSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-white text-xs font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-1 p-1 bg-zinc-955 rounded-xl border border-zinc-800/40">
                {(['arriving', 'received', 'delivered'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => {
                      setActiveFilter(f);
                      setDisplayLimit(10);
                    }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                      activeFilter === f 
                        ? "bg-zinc-800 text-indigo-400 shadow-sm" 
                        : "text-zinc-500 hover:text-zinc-200"
                    )}
                  >
                    {f === 'delivered' ? 'Put Away' : f}
                    {counts[f] > 0 && (
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-full text-[8px] font-bold min-w-[1.25rem] text-center",
                        activeFilter === f 
                          ? "bg-indigo-500/20 text-indigo-400" 
                          : "bg-zinc-800 text-zinc-500"
                      )}>
                        {counts[f]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="bg-zinc-950/40 rounded-2xl p-4 shadow-inner min-h-[300px] border border-zinc-800/40">
                {displayItems.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-zinc-500 italic text-center p-8">
                    <CheckCircle className="w-8 h-8 mb-3 opacity-20 text-emerald-500" />
                    <p>No {activeFilter} items found.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {displayItems.map((item: any) => {
                      const matchedJob = jobs.find(j => j.id === item.jobId);
                      return (
                        <div key={item.id} className={cn(
                          "bg-zinc-900/60 border rounded-2xl p-4 shadow-sm hover:border-emerald-500 transition-all group relative",
                          item.type === 'part' ? "border-indigo-500/20" : "border-emerald-500/20"
                        )}>
                          <div 
                            className="absolute inset-0 z-0 cursor-pointer" 
                            onClick={() => {
                              if (item.jobId) {
                                navigate(`/business/${tenantId}/job/${item.jobId}`);
                              } else if (item.type === 'part') {
                                setSelectedPartId(item.id);
                              } else {
                                setSelectedShipmentId(item.id);
                              }
                            }}
                          />
                          <div className="flex items-start justify-between mb-2 relative z-10 pointer-events-none">
                            <div className="flex-1 min-w-0 pr-2">
                              <div className="flex items-center gap-2 mb-1">
                                {item.type === 'part' ? (
                                  <ShoppingCart className="w-3 h-3 text-indigo-500 shrink-0" />
                                ) : (
                                  <Package className="w-3 h-3 text-emerald-500 shrink-0" />
                                )}
                                <h4 className="font-bold text-white truncate">{item.description || 'Item'}</h4>
                                {item.type === 'shipment' && item.carrier && (
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter shrink-0 ${getCarrierBadgeStyles(item.carrier)}`}>
                                    {item.carrier}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] font-mono text-zinc-400 truncate">
                                {item.trackingNumber || (item.type === 'part' ? 'INTERNAL REQUEST' : 'NO TRACKING')}
                              </p>
                            </div>
                            
                            {/* Contextual Action Button */}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextStatus = item.status === 'ordered' || item.status === 'pending' || item.status === 'in_transit' || item.status === 'out_for_delivery' ? 'received' : 
                                                 item.status === 'received' ? 'delivered' : 'received';
                                handleUpdateStatusPackage(item, nextStatus);
                              }}
                              className={cn(
                                "shrink-0 p-2 text-white rounded-xl transition-all shadow-lg active:scale-95 pointer-events-auto cursor-pointer",
                                item.status === 'ordered' || item.status === 'pending' || item.status === 'in_transit' || item.status === 'out_for_delivery' ? "bg-amber-500 shadow-amber-500/20 hover:bg-amber-600" :
                                item.status === 'received' ? "bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600" :
                                "bg-zinc-500 shadow-zinc-500/20 hover:bg-zinc-600"
                              )}
                              title={item.status === 'ordered' || item.status === 'pending' || item.status === 'in_transit' || item.status === 'out_for_delivery' ? 'Mark Received' : 
                                     item.status === 'received' ? 'Mark Processed' : 'Revert to Received'}
                            >
                              {item.status === 'ordered' || item.status === 'pending' || item.status === 'in_transit' || item.status === 'out_for_delivery' ? <MapPin className="w-4 h-4" /> :
                               item.status === 'received' ? <CheckCircle className="w-4 h-4" /> :
                               <Clock className="w-4 h-4" />}
                            </button>
                          </div>

                          <div className="space-y-2 mt-3 pt-3 border-t border-zinc-800/60 relative z-10 pointer-events-none">
                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
                              <MapPin className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                              {item.location || (item.type === 'part' ? 'DELIVER TO SHOP' : 'OFFICE STAGING')}
                            </div>
                            {(item.notes || matchedJob?.title) && (
                              <div className="flex flex-col gap-1 p-2 bg-zinc-950 rounded-lg">
                                {matchedJob?.title && (
                                  <div className="text-[10px] font-black text-indigo-400 uppercase tracking-tight">
                                    FOR: {matchedJob.title}
                                  </div>
                                )}
                                {item.notes && (
                                  <div className="text-[10px] text-zinc-400 italic flex items-start gap-1">
                                    <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                                    {item.notes}
                                  </div>
                                )}
                              </div>
                            )}
                            {((item.images && item.images.length > 0) || item.imageUrl || item.photoUrl || item.partImageUrl) && (
                              <div className="flex items-center gap-2 overflow-x-auto pb-1 mt-2 custom-scrollbar">
                                {(item.images?.length > 0 ? item.images : [item.imageUrl || item.photoUrl || item.partImageUrl].filter(Boolean)).map((img: string, i: number) => (
                                  <div key={i} className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-zinc-850 shrink-0 border border-zinc-800 shadow-sm relative group/img">
                                    <img src={img} alt={`Item ${i+1}`} className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-300" />
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center justify-between pt-1 mt-1">
                              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                                <User className="w-3 h-3" />
                                {item.receivedBy || item.requestedBy || 'Staff'}
                              </div>
                              <div className="text-[10px] text-zinc-500 font-medium">
                                {item.type === 'part' ? 'Part Arrived' : 'Package Arrived'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {hasMore && (
                      <button 
                        onClick={() => setDisplayLimit(prev => prev + 10)}
                        className="w-full py-3 mt-4 text-[10px] font-black uppercase tracking-widest text-zinc-550 hover:text-indigo-400 transition-colors cursor-pointer"
                      >
                        Load More Items ({allReceived.length - displayLimit} remaining)
                      </button>
                    )}
                  </div>
                )}
              </div>
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
                  ? (r.status === 'fulfilled' || r.status === 'cancelled' || r.status === 'inventoried')
                  : (r.status !== 'fulfilled' && r.status !== 'cancelled' && r.status !== 'inventoried')
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
                              <div className="flex-1 flex gap-1.5">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleUpdateStatus(request.id, 'fulfilled'); }}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 transition-all cursor-pointer"
                                >
                                  <CheckCircle className="w-3 h-3" />
                                  MARK WITH VEHICLE
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleUpdateStatus(request.id, 'inventoried'); }}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 transition-all cursor-pointer"
                                >
                                  <Package className="w-3.5 h-3.5" />
                                  MARK INVENTORIED
                                </button>
                              </div>
                            )}
                            {request.status === 'fulfilled' && (
                              <div className="flex-1 text-center text-[10px] font-bold text-emerald-600/50 py-1.5">
                                ✓ WITH VEHICLE
                              </div>
                            )}
                            {request.status === 'inventoried' && (
                              <div className="flex-1 text-center text-[10px] font-bold text-purple-600/50 py-1.5">
                                ✓ INVENTORIED
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
