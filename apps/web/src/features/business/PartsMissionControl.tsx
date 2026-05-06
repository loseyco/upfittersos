import React, { useState } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  serverTimestamp, getDocs, limit, where, getCountFromServer 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Truck, Plus, ExternalLink, 
  Clock, Box, Wrench, User, Search, Package, Info, Calendar, AlertCircle,
  Trash2, CheckCircle, ShoppingCart, MoreHorizontal
} from 'lucide-react';
import { toast } from 'sonner';

type RequestStatus = 'pending' | 'ordered' | 'received' | 'cancelled';
type ShipmentStatus = 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';

interface PartsRequest {
  id: string;
  partName: string;
  partNumber?: string;
  jobId?: string;
  requestedBy: string;
  urgency: 'normal' | 'urgent';
  status: RequestStatus;
  notes?: string;
  createdAt: any;
}

interface Shipment {
  id: string;
  trackingNumber: string;
  carrier: string;
  description: string;
  status: ShipmentStatus;
  eta: string | null;
  jobId?: string;
  createdAt: any;
}

interface Job {
  id: string;
  title: string;
}

export function PartsMissionControl() {
  const { tenantId, user } = useAuthStore();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Parts Request Form State
  const [partName, setPartName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [reqJobId, setReqJobId] = useState('');
  const [urgency, setUrgency] = useState<'normal' | 'urgent'>('normal');
  const [notes, setNotes] = useState('');

  // Shipment Form State
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('UPS');
  const [shipDescription, setShipDescription] = useState('');
  const [shipJobId, setShipJobId] = useState('');

  // Data State
  const [requests, setRequests] = useState<PartsRequest[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  // Real-time listener for Parts Requests
  React.useEffect(() => {
    if (!tenantId || tenantId === 'GLOBAL') return;
    const q = query(
      collection(db, `businesses/${tenantId}/parts_requests`),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const data: PartsRequest[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as PartsRequest);
      });
      setRequests(data);
    });

    const fetchJobs = async () => {
      try {
        const jobsSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs`));
        const jobsData: Job[] = [];
        jobsSnap.forEach(doc => {
          const data = doc.data();
          if (data.status !== 'Closed' && data.status !== 'Completed') {
            jobsData.push({ id: doc.id, title: data.title || 'Untitled Job' });
          }
        });
        setJobs(jobsData.sort((a, b) => a.title.localeCompare(b.title)));
      } catch (e) {
        console.error('Failed to fetch jobs', e);
      }
    };
    fetchJobs();

    return () => unsubscribe();
  }, [tenantId]);

  // Fetch Stats
  const { data: stats } = useQuery({
    queryKey: ['parts-stats', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      
      const requestsCol = collection(db, `businesses/${tenantId}/parts_requests`);
      const shipmentsCol = collection(db, `businesses/${tenantId}/shipments`);
      const inventoryCol = collection(db, `businesses/${tenantId}/inventory_items`);

      const [pendingReqs, activeShipments, totalInv] = await Promise.all([
        getCountFromServer(query(requestsCol, where('status', '==', 'pending'))),
        getCountFromServer(query(shipmentsCol, where('status', '!=', 'delivered'))),
        getCountFromServer(inventoryCol)
      ]);

      return {
        pendingRequests: pendingReqs.data().count,
        activeShipments: activeShipments.data().count,
        inventoryItems: totalInv.data().count
      };
    },
    enabled: !!tenantId
  });

  // Fetch Shipments
  const { data: shipments } = useQuery({
    queryKey: ['parts-shipments', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/shipments`),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shipment));
    },
    enabled: !!tenantId
  });

  // Fetch Inventory (QuickBooks Items)
  const { data: inventory } = useQuery({
    queryKey: ['parts-inventory', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/inventory_items`),
        orderBy('quantityOnHand', 'asc'),
        limit(10)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: !!tenantId
  });

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

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !partName.trim()) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, `businesses/${tenantId}/parts_requests`), {
        partName: partName.trim(),
        partNumber: partNumber.trim() || null,
        jobId: reqJobId || null,
        requestedBy: user?.displayName || user?.email || 'Unknown',
        urgency,
        status: 'pending',
        notes: notes.trim() || null,
        createdAt: serverTimestamp(),
      });
      
      setPartName('');
      setPartNumber('');
      setReqJobId('');
      setUrgency('normal');
      setNotes('');
      toast.success('Parts request submitted successfully');
      queryClient.invalidateQueries({ queryKey: ['parts-stats'] });
    } catch (err) {
      console.error('Error adding parts request:', err);
      toast.error('Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !trackingNumber.trim()) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, `businesses/${tenantId}/shipments`), {
        trackingNumber: trackingNumber.trim(),
        carrier,
        description: shipDescription.trim(),
        jobId: shipJobId || null,
        status: 'pending',
        eta: null,
        createdAt: serverTimestamp(),
      });
      setTrackingNumber('');
      setShipDescription('');
      setShipJobId('');
      toast.success('Shipment added to tracking');
      queryClient.invalidateQueries({ queryKey: ['parts-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['parts-stats'] });
    } catch (err) {
      console.error('Error adding shipment:', err);
      toast.error('Failed to add shipment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (requestId: string, newStatus: RequestStatus) => {
    if (!tenantId) return;
    try {
      const { updateDoc, doc } = await import('firebase/firestore');
      await updateDoc(doc(db, `businesses/${tenantId}/parts_requests`, requestId), {
        status: newStatus
      });
      toast.success(`Request marked as ${newStatus}`);
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update status');
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!tenantId || !confirm('Are you sure you want to delete this request?')) return;
    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      await deleteDoc(doc(db, `businesses/${tenantId}/parts_requests`, requestId));
      toast.success('Request deleted');
      queryClient.invalidateQueries({ queryKey: ['parts-stats'] });
    } catch (err) {
      console.error('Error deleting request:', err);
      toast.error('Failed to delete request');
    }
  };

  const getStatusColor = (status: RequestStatus | ShipmentStatus) => {
    switch (status) {
      case 'received':
      case 'delivered': return 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20';
      case 'ordered':
      case 'in_transit':
      case 'out_for_delivery': return 'bg-blue-500/10 text-blue-600 ring-blue-500/20';
      case 'cancelled':
      case 'exception': return 'bg-red-500/10 text-red-600 ring-red-500/20';
      default: return 'bg-amber-500/10 text-amber-600 ring-amber-500/20';
    }
  };

  const activeShipments = shipments?.filter(s => s.status !== 'delivered') || [];
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* KPI Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-xl">
              <Clock className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">Pending Requests</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">{stats?.pendingRequests ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-xl">
              <Truck className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">Active Shipments</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">{stats?.activeShipments ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 rounded-xl">
              <Box className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">Inventory Items</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">{stats?.inventoryItems ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Left Column: Requests and Shipments Forms */}
        <div className="space-y-8">
          {/* Parts Request Form */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-zinc-900 dark:text-white">
              <Wrench className="w-5 h-5 text-indigo-500" />
              New Parts Request
            </h2>
            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Part Name / Description</label>
                  <input 
                    type="text" 
                    required
                    value={partName}
                    onChange={(e) => setPartName(e.target.value)}
                    placeholder="e.g. Brake Pads"
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Part Number (Optional)</label>
                  <input 
                    type="text" 
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                    placeholder="e.g. PN-12345"
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Link to Job</label>
                  <select 
                    value={reqJobId}
                    onChange={(e) => setReqJobId(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">No Job Linked</option>
                    {jobs.map(job => (
                      <option key={job.id} value={job.id}>{job.title}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Urgency</label>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setUrgency('normal')}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                        urgency === 'normal' 
                          ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white' 
                          : 'border-transparent text-zinc-500'
                      }`}
                    >
                      Normal
                    </button>
                    <button 
                      type="button"
                      onClick={() => setUrgency('urgent')}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                        urgency === 'urgent' 
                          ? 'bg-red-500/10 border-red-500/20 text-red-600' 
                          : 'border-transparent text-zinc-500'
                      }`}
                    >
                      Urgent
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Notes</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional details..."
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-20"
                />
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting || !partName.trim()}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <Plus className="w-5 h-5" />
                Submit Request
              </button>
            </form>
          </div>

          {/* Incoming Shipment Form */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-zinc-900 dark:text-white">
              <Truck className="w-5 h-5 text-indigo-500" />
              Track Incoming Shipment
            </h2>
            <form onSubmit={handleSubmitShipment} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tracking Number</label>
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
                      className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Carrier</label>
                  <select 
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
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
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Description / PO</label>
                  <input 
                    type="text" 
                    value={shipDescription}
                    onChange={(e) => setShipDescription(e.target.value)}
                    placeholder="e.g. Parts for Smith Job"
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Link to Job</label>
                  <select 
                    value={shipJobId}
                    onChange={(e) => setShipJobId(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
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
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <Truck className="w-5 h-5" />
                Track Shipment
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Feeds */}
        <div className="space-y-8">
          {/* Parts Request List */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Parts Requests
            </h3>
            {requests.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                No parts requests found.
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map(request => (
                  <div key={request.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm hover:border-indigo-500/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${request.urgency === 'urgent' ? 'bg-red-500 animate-pulse' : 'bg-zinc-300'}`} />
                        <span className="font-bold text-zinc-900 dark:text-white">{request.partName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider ring-1 ${getStatusColor(request.status)}`}>
                          {request.status.toUpperCase()}
                        </span>
                        <button 
                          onClick={() => handleDeleteRequest(request.id)}
                          className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500 mb-3">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        {request.requestedBy}
                      </div>
                      <div className="flex items-center gap-1.5 justify-end">
                        <Clock className="w-3.5 h-3.5" />
                        {request.createdAt?.toDate ? request.createdAt.toDate().toLocaleDateString() : 'Just now'}
                      </div>
                    </div>

                    {request.jobId && (
                      <p className="text-xs font-semibold text-indigo-500 mb-3">
                        Job: {jobs.find(j => j.id === request.jobId)?.title || request.jobId}
                      </p>
                    )}

                    {/* Status Management Actions */}
                    <div className="flex items-center gap-1 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      {request.status === 'pending' && (
                        <button 
                          onClick={() => handleUpdateStatus(request.id, 'ordered')}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-all"
                        >
                          <ShoppingCart className="w-3 h-3" />
                          MARK ORDERED
                        </button>
                      )}
                      {request.status === 'ordered' && (
                        <button 
                          onClick={() => handleUpdateStatus(request.id, 'received')}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-all"
                        >
                          <CheckCircle className="w-3 h-3" />
                          MARK RECEIVED
                        </button>
                      )}
                      {(request.status === 'pending' || request.status === 'ordered') && (
                        <button 
                          onClick={() => handleUpdateStatus(request.id, 'cancelled')}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                        >
                          CANCEL
                        </button>
                      )}
                      {request.status === 'received' && (
                        <div className="flex-1 text-center text-[10px] font-bold text-emerald-600/50 py-1.5">
                          ✓ COMPLETED
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Shipments */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4" />
              Inbound Shipments
            </h3>
            {activeShipments.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                No active shipments.
              </div>
            ) : (
              <div className="space-y-3">
                {activeShipments.map(shipment => (
                  <div key={shipment.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 shadow-sm hover:border-indigo-500/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900 dark:text-white">{shipment.carrier}</span>
                        <span className="text-[10px] font-mono text-zinc-400 truncate">{shipment.trackingNumber}</span>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider ring-1 ${getStatusColor(shipment.status)}`}>
                        {shipment.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>
                    
                    <p className="text-xs text-zinc-500">{shipment.description || 'No description'}</p>
                    
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
                      <a 
                        href={`https://parcelsapp.com/en/tracking/${shipment.trackingNumber}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-1.5 text-zinc-400 hover:text-indigo-500 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stock Alerts */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Stock Alert (QuickBooks)
            </h3>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {inventory?.map((item: any) => (
                  <div key={item.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{item.name}</p>
                      <p className="text-[10px] text-zinc-400 uppercase tracking-tighter">SKU: {item.sku || 'N/A'}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${Number(item.quantityOnHand) <= 0 ? 'text-red-500' : 'text-zinc-900 dark:text-white'}`}>
                        {item.quantityOnHand ?? 0}
                      </p>
                      <p className="text-[10px] text-zinc-400 uppercase">On Hand</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Missing imports to add at top: AlertCircle
