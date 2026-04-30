import React, { useState } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Package, Truck, Calendar, Clock, Plus, ExternalLink, Search, Info } from 'lucide-react';

type ShipmentStatus = 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';

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

export function ShipmentsTracker() {
  const { tenantId } = useAuthStore();
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('UPS');
  const [description, setDescription] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  // Real-time listener for shipments
  React.useEffect(() => {
    if (!tenantId || tenantId === 'GLOBAL') return;
    const q = query(
      collection(db, `businesses/${tenantId}/shipments`),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const data: Shipment[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as Shipment);
      });
      setShipments(data);
    });

    // Fetch active jobs for the dropdown
    const fetchJobs = async () => {
      try {
        const { getDocs } = await import('firebase/firestore');
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

  const detectCarrier = (tracking: string) => {
    // Simple basic detection
    const t = tracking.toUpperCase().replace(/\s/g, '');
    if (t.startsWith('1Z')) return 'UPS';
    if (t.length === 12 || t.length === 15 || t.length === 20) return 'FedEx'; // Simplified
    if (t.startsWith('TBA')) return 'Amazon';
    if (t.length >= 22) return 'USPS'; // Simplified
    return 'Other';
  };

  const handleTrackingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTrackingNumber(val);
    if (val.length > 5) {
      setCarrier(detectCarrier(val));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !trackingNumber.trim()) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, `businesses/${tenantId}/shipments`), {
        trackingNumber: trackingNumber.trim(),
        carrier,
        description: description.trim(),
        jobId: selectedJobId || null,
        status: 'pending',
        eta: null,
        createdAt: serverTimestamp(),
      });
      setTrackingNumber('');
      setDescription('');
      setSelectedJobId('');
    } catch (err) {
      console.error('Error adding shipment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: ShipmentStatus) => {
    switch (status) {
      case 'delivered': return 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20';
      case 'out_for_delivery': return 'bg-blue-500/10 text-blue-600 ring-blue-500/20';
      case 'in_transit': return 'bg-indigo-500/10 text-indigo-600 ring-indigo-500/20';
      case 'exception': return 'bg-red-500/10 text-red-600 ring-red-500/20';
      default: return 'bg-zinc-500/10 text-zinc-600 ring-zinc-500/20';
    }
  };

  const getStatusText = (status: ShipmentStatus) => {
    return status.replace(/_/g, ' ').toUpperCase();
  };

  const activeShipments = shipments.filter(s => s.status !== 'delivered');
  const recentShipments = shipments.filter(s => s.status === 'delivered').slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Truck className="w-5 h-5 text-indigo-500" />
          Track Incoming Shipment
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full space-y-1">
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
                className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
          </div>
          
          <div className="w-full md:w-32 space-y-1">
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

          <div className="flex-1 w-full space-y-1">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Description / PO</label>
            <input 
              type="text" 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Parts for Smith Job"
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="flex-1 w-full space-y-1">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Link to Job (Optional)</label>
            <select 
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">None</option>
              {jobs.map(job => (
                <option key={job.id} value={job.id}>{job.title}</option>
              ))}
            </select>
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting || !trackingNumber.trim()}
            className="w-full md:w-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Track
          </button>
        </form>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-xl p-4 flex gap-3 text-blue-700 dark:text-blue-400">
        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm">
          <strong>Note:</strong> Auto-updating shipment statuses is currently disabled. 
          Tracking numbers are saved here for reference, but you must click the external tracking link to see the live status until an API key is connected.
        </p>
      </div>

      {/* Lists Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Active Shipments */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
            <Package className="w-4 h-4" />
            Inbound ({activeShipments.length})
          </h3>
          
          {activeShipments.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
              No active shipments.
            </div>
          ) : (
            <div className="space-y-3">
              {activeShipments.map(shipment => (
                <div key={shipment.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-indigo-500/50 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{shipment.carrier}</span>
                      <span className="text-zinc-500 font-mono text-sm">{shipment.trackingNumber}</span>
                    </div>
                    {shipment.description && (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">{shipment.description}</p>
                    )}
                    {shipment.jobId && (
                      <p className="text-xs font-semibold text-indigo-500">
                        Linked Job: {jobs.find(j => j.id === shipment.jobId)?.title || shipment.jobId}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider ring-1 ${getStatusColor(shipment.status)}`}>
                        {getStatusText(shipment.status)}
                      </span>
                      {shipment.eta && (
                        <div className="text-xs text-zinc-500 mt-2 flex items-center justify-end gap-1">
                          <Calendar className="w-3 h-3" /> ETA: {shipment.eta}
                        </div>
                      )}
                    </div>
                    
                    <a 
                      href={`https://parcelsapp.com/en/tracking/${shipment.trackingNumber}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors"
                      title="Track Package"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recently Arrived */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Recently Arrived
          </h3>
          
          {recentShipments.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
              No recent deliveries.
            </div>
          ) : (
            <div className="space-y-3">
              {recentShipments.map(shipment => (
                <div key={shipment.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm opacity-75 hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{shipment.carrier}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ring-1 ${getStatusColor(shipment.status)}`}>
                      {getStatusText(shipment.status)}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-zinc-500 mb-1">{shipment.trackingNumber}</p>
                  {shipment.description && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1">{shipment.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
