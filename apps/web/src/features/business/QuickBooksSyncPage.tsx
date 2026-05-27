import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, getCountFromServer } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw, XCircle, Play, Database, Users, UserCircle, Truck, Package, FileText, ShoppingCart } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

function QbCollectionStats({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const collections = [
    { id: 'qb_customers', path: 'qb_jobs', name: 'Customers & Jobs', icon: Users },
    { id: 'qb_employees', path: 'qb_employees', name: 'Employees', icon: UserCircle },
    { id: 'qb_vendors', path: 'qb_vendors', name: 'Vendors', icon: Truck },
    { id: 'qb_items', path: 'qb_items', name: 'Items & Services', icon: Package },
    { id: 'qb_invoices', path: 'qb_invoices', name: 'Invoices', icon: FileText },
    { id: 'qb_pos', path: 'qb_purchase_orders', name: 'Purchase Orders', icon: ShoppingCart },
    { id: 'qb_time_tracking', path: 'qb_time_tracking', name: 'Time Tracking', icon: Clock }
  ];

  useEffect(() => {
    async function fetchCounts() {
      setLoading(true);
      const newCounts: Record<string, number> = {};
      try {
        await Promise.all(collections.map(async (col) => {
          const collRef = collection(db, `businesses/${tenantId}/${col.path}`);
          const snapshot = await getCountFromServer(collRef);
          newCounts[col.id] = snapshot.data().count;
        }));
        setCounts(newCounts);
      } catch (err) {
        console.error('Error fetching counts', err);
      } finally {
        setLoading(false);
      }
    }
    fetchCounts();
  }, [tenantId]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {collections.map(col => (
        <button
          key={col.id}
          onClick={() => navigate(`/business/${tenantId}/${col.id}`)}
          className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col items-start hover:border-indigo-500 hover:shadow-md transition-all text-left group"
        >
          <div className="flex items-center justify-between w-full mb-2">
            <div className="flex items-center gap-2 text-indigo-500 group-hover:text-indigo-600 transition-colors">
              <col.icon className="w-5 h-5" />
              <h3 className="font-bold text-sm text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{col.name}</h3>
            </div>
            <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all -mr-1">
              <Database className="w-3 h-3 text-zinc-500" />
            </div>
          </div>
          {loading ? (
            <div className="w-16 h-8 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded mt-1" />
          ) : (
            <p className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
              {counts[col.id]?.toLocaleString() || 0}
            </p>
          )}
          <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-widest mt-1">Raw Records</p>
        </button>
      ))}
    </div>
  );
}

export function QuickBooksSyncPage({ tenantId }: { tenantId: string }) {
  const [isForceSyncing, setIsForceSyncing] = useState(false);
  const [queue, setQueue] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  // Listen to queue changes
  useEffect(() => {
    if (!tenantId || tenantId === 'GLOBAL') return;
    
    const q = query(
      collection(db, 'qbwc_queue'),
      where('tenantId', '==', tenantId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setQueue(records);
    });

    return () => unsubscribe();
  }, [tenantId]);

  // Listen to activity feed
  useEffect(() => {
    if (!tenantId || tenantId === 'GLOBAL') return;
    
    const q = query(
      collection(db, 'businesses', tenantId, 'activity_feed'),
      where('type', '==', 'qbwc_sync'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setActivities(records);
    });

    return () => unsubscribe();
  }, [tenantId]);

  const [now, setNow] = useState(Date.now());

  // Update timer every second for processing duration
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleForceSync = async () => {
    if (!window.confirm('Are you sure you want to force a full historical sync? This will queue up all records to be downloaded again and may take a while to complete.')) {
      return;
    }

    try {
      setIsForceSyncing(true);
      const res = await fetch(`https://us-central1-saegroup-c6487.cloudfunctions.net/api/qbwc/force-sync?tenantId=${tenantId}`);
      if (!res.ok) throw new Error('Failed to trigger sync');
      toast.success('Force sync triggered successfully. The queue has been rebuilt.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to trigger force sync.');
    } finally {
      setIsForceSyncing(false);
    }
  };

  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const processingCount = queue.filter(q => q.status === 'processing').length;
  const errorCount = queue.filter(q => q.status === 'error').length;
  const completedCount = queue.filter(q => q.status === 'completed').length;
  
  const processingItem = queue.find(q => q.status === 'processing');
  const errors = queue.filter(q => q.status === 'error').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const getProcessingTime = () => {
    if (!processingItem) return '';
    const startTimeStr = processingItem.processingStartedAt || processingItem.createdAt;
    if (!startTimeStr) return '';
    const startTime = new Date(startTimeStr).getTime();
    if (isNaN(startTime)) return '';
    
    const diffSeconds = Math.floor((now - startTime) / 1000);
    if (diffSeconds < 0) return 'Just started';
    
    const m = Math.floor(diffSeconds / 60);
    const s = diffSeconds % 60;
    
    if (m > 60) {
      const h = Math.floor(m / 60);
      return `${h}h ${m % 60}m processing`;
    }
    
    return `${m}m ${s}s processing`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center">
            <Database className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">Live Sync Monitor</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Track real-time data flow from QuickBooks Web Connector</p>
          </div>
        </div>
        
        <button
          onClick={handleForceSync}
          disabled={isForceSyncing}
          className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm uppercase tracking-wider rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/20 whitespace-nowrap"
        >
          {isForceSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Force Full Sync
        </button>
      </div>

      <QbCollectionStats tenantId={tenantId} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col relative overflow-hidden">
          {processingItem && (
            <div className="absolute inset-0 bg-blue-500/5 animate-pulse" />
          )}
          <div className="flex items-center gap-2 mb-2 text-blue-500 relative z-10">
            <RefreshCw className={cn("w-5 h-5", processingItem ? "animate-spin" : "")} />
            <h3 className="font-bold uppercase tracking-wider text-sm">Processing</h3>
          </div>
          <p className="text-3xl font-black text-zinc-900 dark:text-white relative z-10">{processingCount}</p>
          {processingItem && (
            <div className="mt-2 relative z-10 flex flex-col gap-0.5">
              <p className="text-xs text-zinc-500 font-bold truncate">Current: {processingItem.action}</p>
              <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">{getProcessingTime()}</p>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-2 text-amber-500">
            <Clock className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-sm">Pending</h3>
          </div>
          <p className="text-3xl font-black text-zinc-900 dark:text-white">{pendingCount}</p>
          <p className="text-xs text-zinc-500 font-bold mt-2">Batches waiting in queue</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-2 text-red-500">
            <XCircle className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-sm">Errors</h3>
          </div>
          <p className="text-3xl font-black text-zinc-900 dark:text-white">{errorCount}</p>
          <p className="text-xs text-zinc-500 font-bold mt-2">Requires attention</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-2 text-emerald-500">
            <CheckCircle2 className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-sm">Completed</h3>
          </div>
          <p className="text-3xl font-black text-zinc-900 dark:text-white">{completedCount}</p>
          <p className="text-xs text-zinc-500 font-bold mt-2">Since last wipe</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col h-[500px]">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 rounded-t-2xl">
            <h3 className="font-bold uppercase tracking-wider text-zinc-500 text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Recent Activity
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {activities.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2">
                <Activity className="w-8 h-8 opacity-20" />
                <p className="text-sm font-bold uppercase tracking-widest">No recent activity</p>
              </div>
            ) : (
              activities.map(activity => (
                <div key={activity.id} className="flex gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800">
                  <div className="shrink-0 mt-1">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{activity.title}</h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">{activity.message}</p>
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-2">
                      {new Date(activity.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-red-200 dark:border-red-900/30 shadow-sm flex flex-col h-[500px]">
          <div className="p-4 border-b border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 rounded-t-2xl">
            <h3 className="font-bold uppercase tracking-wider text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Error Log
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {errors.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-20" />
                <p className="text-sm font-bold uppercase tracking-widest">No recent errors</p>
              </div>
            ) : (
              errors.map(error => (
                <div key={error.id} className="flex gap-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
                  <div className="shrink-0 mt-1">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-red-800 dark:text-red-400 uppercase tracking-wider">{error.action} Failed</h4>
                    <p className="text-sm text-red-600 dark:text-red-300 mt-1 break-words font-mono text-xs">{error.error || 'Unknown Error'}</p>
                    <p className="text-xs font-bold text-red-500/70 uppercase tracking-widest mt-2">
                      {new Date(error.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
