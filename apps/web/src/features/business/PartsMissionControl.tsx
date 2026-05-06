import React, { useState } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { useQuery } from '@tanstack/react-query';
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  serverTimestamp, getDocs, limit, where, getCountFromServer 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Package, Truck, Plus, Search, ExternalLink, 
  AlertCircle, Clock, CheckCircle2, Box, Wrench,
  TrendingUp, ArrowRight, User
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

type RequestStatus = 'pending' | 'ordered' | 'received' | 'cancelled';

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
  status: string;
  eta: string | null;
  createdAt: any;
}

interface Job {
  id: string;
  title: string;
}

export function PartsMissionControl() {
  const { tenantId, user } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [partName, setPartName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [urgency, setUrgency] = useState<'normal' | 'urgent'>('normal');
  const [notes, setNotes] = useState('');

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

  // Fetch Inbound Shipments
  const { data: shipments } = useQuery({
    queryKey: ['parts-shipments', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/shipments`),
        where('status', '!=', 'delivered'),
        orderBy('createdAt', 'desc'),
        limit(10)
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

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !partName.trim()) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, `businesses/${tenantId}/parts_requests`), {
        partName: partName.trim(),
        partNumber: partNumber.trim() || null,
        jobId: selectedJobId || null,
        requestedBy: user?.displayName || user?.email || 'Unknown',
        urgency,
        status: 'pending',
        notes: notes.trim() || null,
        createdAt: serverTimestamp(),
      });
      
      setPartName('');
      setPartNumber('');
      setSelectedJobId('');
      setUrgency('normal');
      setNotes('');
      toast.success('Parts request submitted successfully');
    } catch (err) {
      console.error('Error adding parts request:', err);
      toast.error('Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: RequestStatus) => {
    switch (status) {
      case 'received': return 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20';
      case 'ordered': return 'bg-blue-500/10 text-blue-600 ring-blue-500/20';
      case 'cancelled': return 'bg-red-500/10 text-red-600 ring-red-500/20';
      default: return 'bg-amber-500/10 text-amber-600 ring-amber-500/20';
    }
  };

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
        {/* Left Column: Form and Requests */}
        <div className="space-y-8">
          {/* Parts Request Form */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
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
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Part Number (Optional)</label>
                  <input 
                    type="text" 
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                    placeholder="e.g. PN-12345"
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Link to Job</label>
                  <select 
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
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

          {/* Parts Request List */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Recent Requests
            </h3>
            {requests.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
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
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider ring-1 ${getStatusColor(request.status)}`}>
                        {request.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        {request.requestedBy}
                      </div>
                      <div className="flex items-center gap-1.5 justify-end">
                        <Clock className="w-3.5 h-3.5" />
                        {request.createdAt?.toDate ? request.createdAt.toDate().toLocaleDateString() : 'Just now'}
                      </div>
                    </div>
                    {request.partNumber && (
                      <p className="mt-2 text-xs font-mono text-zinc-400 bg-zinc-50 dark:bg-zinc-950 px-2 py-1 rounded inline-block">
                        PN: {request.partNumber}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Shipments and Inventory */}
        <div className="space-y-8">
          {/* Active Shipments */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Inbound Shipments
            </h3>
            {shipments?.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                No active shipments.
              </div>
            ) : (
              <div className="space-y-3">
                {shipments?.map(shipment => (
                  <div key={shipment.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm">{shipment.carrier}</span>
                        <span className="text-[10px] font-mono text-zinc-400 truncate">{shipment.trackingNumber}</span>
                      </div>
                      <p className="text-xs text-zinc-500 truncate">{shipment.description}</p>
                    </div>
                    <a 
                      href={`https://parcelsapp.com/en/tracking/${shipment.trackingNumber}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 text-zinc-400 hover:text-indigo-500 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                ))}
                <button className="w-full py-2 text-xs font-bold text-indigo-500 hover:text-indigo-600 transition-colors">
                  View All Shipments
                </button>
              </div>
            )}
          </div>

          {/* Inventory Overview */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <Box className="w-4 h-4" />
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
            <button className="w-full py-2 text-xs font-bold text-indigo-500 hover:text-indigo-600 transition-colors">
              Full Inventory Management
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
