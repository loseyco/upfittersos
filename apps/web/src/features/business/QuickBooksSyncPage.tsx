import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, getCountFromServer, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase/config';
import { 
  Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw, XCircle, Play, 
  Database, Users, UserCircle, Truck, Package, FileText, ShoppingCart,
  Download, Copy, ChevronDown, ChevronUp, Eye, Trash2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth/store';

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
  const { permissions, isSuperAdmin } = useAuthStore();
  const canManageSync = isSuperAdmin || permissions['sync.manage'];

  const [isForceSyncing, setIsForceSyncing] = useState(false);
  const [queue, setQueue] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  // Setup & Provisioning states
  const [customConnectorName, setCustomConnectorName] = useState('');
  const [activeStep, setActiveStep] = useState<number>(0);

  // Inspector & filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [inspectingLog, setInspectingLog] = useState<any | null>(null);

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
      const apiBase = 'https://us-central1-saegroup-c6487.cloudfunctions.net/api';
      const res = await fetch(`${apiBase}/qbwc/force-sync?tenantId=${tenantId}`);
      if (!res.ok) throw new Error('Failed to trigger sync');
      toast.success('Force sync triggered successfully. The queue has been rebuilt.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to trigger force sync.');
    } finally {
      setIsForceSyncing(false);
    }
  };

  const handleDownloadQwc = async (customName?: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast.error('Session expired. Please log in again.');
        return;
      }

      const apiBase = 'https://us-central1-saegroup-c6487.cloudfunctions.net/api';
      let url = `${apiBase}/qbwc/config?tenantId=${tenantId}&token=${encodeURIComponent(token)}`;
      
      if (customName && customName.trim()) {
        url += `&customName=${encodeURIComponent(customName.trim())}`;
      }
      
      window.open(url, '_blank');
      toast.success(`Downloading Web Connector configuration ${customName ? `"${customName}"` : ''}...`);
      if (customName) setCustomConnectorName('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate secure download.');
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${field} to clipboard!`);
  };

  const handleRequeue = async (item: any) => {
    try {
      const docRef = doc(db, 'qbwc_queue', item.id);
      await updateDoc(docRef, {
        status: 'pending',
        error: null,
        response: null,
        ticketId: null,
        processingStartedAt: null,
        createdAt: new Date().toISOString()
      });
      toast.success(`Successfully re-queued ${item.action}!`);
      if (inspectingLog?.id === item.id) {
        setInspectingLog(null);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to re-queue job.');
    }
  };

  const handleDeleteQueueItem = async (itemId: string, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this queue item?')) return;
    try {
      await deleteDoc(doc(db, 'qbwc_queue', itemId));
      toast.success('Successfully deleted queue item.');
      if (inspectingLog?.id === itemId) {
        setInspectingLog(null);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete queue item.');
    }
  };

  // Stats
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

  // In-memory sorting and filtering for Queue History
  const filteredQueue = queue
    .filter(item => {
      // Search filter
      const matchesSearch = 
        item.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.error && item.error.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // Status filter
      if (statusFilter === 'all') return matchesSearch;
      return item.status === statusFilter && matchesSearch;
    })
    .sort((a, b) => {
      const getMs = (item: any) => {
        const completed = item.completedAt;
        if (completed) {
          if (typeof completed.toDate === 'function') return completed.toDate().getTime();
          if (completed.seconds) return completed.seconds * 1000;
          const parsed = new Date(completed).getTime();
          if (!isNaN(parsed)) return parsed;
        }
        
        // Fallback to createdAt or processingStartedAt for pending/active items
        const fallback = item.processingStartedAt || item.createdAt;
        if (fallback) {
          if (typeof fallback.toDate === 'function') return fallback.toDate().getTime();
          if (fallback.seconds) return fallback.seconds * 1000;
          const parsed = new Date(fallback).getTime();
          if (!isNaN(parsed)) return parsed;
        }
        return 0;
      };
      return getMs(b) - getMs(a);
    });

  // Action Badge Colors mapping
  const getActionColor = (action: string) => {
    if (action.includes('Customer')) return 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400 border border-sky-200 dark:border-sky-800/40';
    if (action.includes('Item')) return 'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-400 border border-violet-200 dark:border-violet-800/40';
    if (action.includes('Invoice')) return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40';
    if (action.includes('PurchaseOrder')) return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40';
    if (action.includes('TimeTracking')) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40';
    if (action.includes('Vendor')) return 'bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-400 border border-pink-200 dark:border-pink-800/40';
    if (action.includes('Employee')) return 'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-400 border border-teal-200 dark:border-teal-800/40';
    return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/50';
  };

  const steps = [
    {
      title: 'Download the configuration file',
      desc: 'Enter an optional name on the left (e.g. "Office Laptop") to identify this machine, then click the download button to save your QuickBooks Web Connector (.qwc) file.'
    },
    {
      title: 'Add to QuickBooks Web Connector',
      desc: 'Ensure your QuickBooks Desktop company file is open. Launch the QuickBooks Web Connector application on your computer, click the "Add an Application" button at the bottom-right, and select the downloaded .qwc file. Confirm the security prompt in QuickBooks.'
    },
    {
      title: 'Type any password & start syncing',
      desc: 'The Username column is pre-filled automatically from the file. In the Password column, simply type any value you like (e.g. "123" or "password") since our secure system automatically bypasses verification. Check the box next to the new application, and click "Update Selected" at the top to start syncing!'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
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
          className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm uppercase tracking-wider rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/20 whitespace-nowrap active:scale-95"
        >
          {isForceSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Force Full Sync
        </button>
      </div>

      <QbCollectionStats tenantId={tenantId} />

      {/* NEW SECTION: Web Connector Provisioning & Setup Guide */}
      {canManageSync && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Provisioning Card */}
          <div className="lg:col-span-5 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
            <div className="flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4 text-indigo-500">
                  <Download className="w-5 h-5" />
                  <h3 className="font-bold uppercase tracking-wider text-sm">Download Web Connector</h3>
                </div>
                
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
                  Generate and download your QuickBooks Web Connector (.qwc) file. The credentials are pre-packaged securely within the file, allowing you to load and run it instantly.
                </p>

                {/* Custom Name Generator */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">
                      Connector Name / Identifier
                    </label>
                    <input
                      type="text"
                      value={customConnectorName}
                      onChange={(e) => setCustomConnectorName(e.target.value)}
                      placeholder="e.g. Eric's Laptop, Main Office (Optional)"
                      className="w-full px-4 py-3 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-zinc-900 dark:text-white placeholder-zinc-450 dark:placeholder-zinc-600"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-zinc-150 dark:border-zinc-800/80">
                <button
                  onClick={() => handleDownloadQwc(customConnectorName)}
                  className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  Download Connector File (.qwc)
                </button>

                <div className="mt-3 flex items-start gap-2 bg-zinc-50 dark:bg-zinc-950/40 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/40">
                  <AlertTriangle className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-zinc-450 dark:text-zinc-400 leading-normal">
                    <strong>Security Note:</strong> The generated link is authorized with a secure, temporary cryptographic session token that automatically expires in 1 hour.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Setup Guide Card */}
          <div className="lg:col-span-7 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4 text-emerald-500">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="font-bold uppercase tracking-wider text-sm">Installation & Setup Guide</h3>
              </div>

              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                Follow these simple steps to configure QuickBooks Web Connector. Click on any step to expand details.
              </p>

              <div className="space-y-3">
                {steps.map((step, idx) => {
                  const isOpen = activeStep === idx;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "border rounded-xl transition-all duration-200 overflow-hidden",
                        isOpen 
                          ? "border-emerald-500 bg-emerald-500/[0.01] dark:bg-emerald-500/[0.02]" 
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                      )}
                    >
                      <button
                        onClick={() => setActiveStep(idx)}
                        className="w-full flex items-center justify-between p-4 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-colors",
                            isOpen 
                              ? "bg-emerald-500 text-white" 
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                          )}>
                            {idx + 1}
                          </span>
                          <span className={cn(
                            "font-bold text-sm",
                            isOpen ? "text-zinc-950 dark:text-white" : "text-zinc-650 dark:text-zinc-300"
                          )}>
                            {step.title}
                          </span>
                        </div>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 pl-13 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800/40 pt-3">
                          {step.desc}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

      {/* REAL-TIME FEEDBACK: Sync Queue & Payload Inspector */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-500" />
              Sync Queue & Payload Inspector
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">Inspect raw QBXML payloads, re-queue failed operations, and track active sessions</p>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search actions or errors..."
              className="px-3 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-zinc-900 dark:text-white"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-zinc-700 dark:text-zinc-300"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="error">Errors</option>
            </select>
          </div>
        </div>

        {/* Table / List */}
        <div className="overflow-x-auto">
          {filteredQueue.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 dark:text-zinc-650 flex flex-col items-center justify-center space-y-2">
              <Database className="w-8 h-8 opacity-25 text-zinc-400" />
              <p className="text-sm font-bold uppercase tracking-wider">No matching sync records found</p>
              <p className="text-xs opacity-80">Make sure your Web Connector client is configured and running</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50/50 dark:bg-zinc-950/20 border-b border-zinc-150 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Created At</th>
                  <th className="py-3.5 px-4">Completed At</th>
                  <th className="py-3.5 px-4">Summary</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredQueue.slice(0, 50).map((item) => {
                  const hasError = item.status === 'error';
                  const isProcessing = item.status === 'processing';
                  const isCompleted = item.status === 'completed';
                  const isPending = item.status === 'pending';

                  return (
                    <tr 
                      key={item.id} 
                      onClick={() => setInspectingLog(item)}
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-950/30 cursor-pointer transition-colors group"
                    >
                      <td className="py-3 px-4 font-bold text-zinc-800 dark:text-zinc-200">
                        <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider", getActionColor(item.action))}>
                          {item.action || 'Unknown'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn(
                          "inline-flex items-center gap-1 font-bold rounded-lg px-2 py-0.5",
                          isCompleted && "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
                          hasError && "text-rose-600 dark:text-rose-400 bg-rose-500/10",
                          isProcessing && "text-blue-600 dark:text-blue-400 bg-blue-500/10",
                          isPending && "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                        )}>
                          {isProcessing && <RefreshCw className="w-3 h-3 animate-spin" />}
                          {isCompleted && <CheckCircle2 className="w-3 h-3" />}
                          {hasError && <XCircle className="w-3 h-3" />}
                          {isPending && <Clock className="w-3 h-3" />}
                          <span className="uppercase tracking-widest text-[9px]">{item.status}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-500 font-medium">
                        {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-zinc-500 font-medium">
                        {item.completedAt ? (item.completedAt.toDate ? item.completedAt.toDate() : new Date(item.completedAt)).toLocaleString() : '-'}
                      </td>
                      <td className="py-3 px-4 max-w-[240px] truncate text-zinc-400 dark:text-zinc-550 font-medium">
                        {hasError ? (
                          <span className="text-rose-500/95 font-semibold text-xs truncate block">{item.error}</span>
                        ) : (
                          <code className="text-[10px] text-zinc-500 font-mono block max-w-xs truncate">{item.qbxml || 'No payload'}</code>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setInspectingLog(item)}
                            className="p-1.5 text-zinc-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                            title="Inspect Payload XML"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          
                          {(isCompleted || hasError) && (
                            <button
                              onClick={() => handleRequeue(item)}
                              className="p-1.5 text-zinc-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                              title="Re-queue sync job"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={(e) => handleDeleteQueueItem(item.id, e)}
                            className="p-1.5 text-zinc-400 hover:text-rose-500 dark:hover:text-rose-450 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                            title="Delete queue item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {filteredQueue.length > 50 && (
          <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            Showing latest 50 logs. Use filters above to locate older transactions.
          </div>
        )}
      </div>

      {/* Two Column Section: Recent Activity & Error Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col h-[500px]">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 rounded-t-2xl">
            <h3 className="font-bold uppercase tracking-wider text-zinc-500 text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Recent Activity Feed
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
              Active System Errors
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {errors.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-20" />
                <p className="text-sm font-bold uppercase tracking-widest">No active errors</p>
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

      {/* INSPECTOR DETAILS MODAL */}
      {inspectingLog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-start bg-zinc-50 dark:bg-zinc-950/20">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-black text-zinc-900 dark:text-white">QBXML Payload Inspector</h3>
                  <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider", getActionColor(inspectingLog.action))}>
                    {inspectingLog.action}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">ID: <code className="font-mono bg-zinc-100 dark:bg-zinc-850 px-1 py-0.2 rounded text-[10px]">{inspectingLog.id}</code> | Created: {new Date(inspectingLog.createdAt).toLocaleString()}</p>
              </div>
              <button 
                onClick={() => setInspectingLog(null)}
                className="text-zinc-400 hover:text-zinc-550 dark:hover:text-zinc-200 p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl transition-all"
              >
                <ChevronDown className="w-5 h-5 rotate-90" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Status Banner */}
              <div className={cn(
                "p-4 rounded-xl border flex items-center justify-between gap-4",
                inspectingLog.status === 'completed' && "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-450",
                inspectingLog.status === 'error' && "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/50 dark:border-rose-900/30 text-rose-800 dark:text-rose-450",
                inspectingLog.status === 'processing' && "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50 dark:border-blue-900/30 text-blue-800 dark:text-blue-450",
                inspectingLog.status === 'pending' && "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-900/30 text-amber-800 dark:text-amber-450"
              )}>
                <div className="flex items-center gap-2.5 text-sm font-bold">
                  {inspectingLog.status === 'completed' && <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />}
                  {inspectingLog.status === 'error' && <XCircle className="w-5 h-5 shrink-0 text-rose-500" />}
                  {inspectingLog.status === 'processing' && <RefreshCw className="w-5 h-5 shrink-0 text-blue-500 animate-spin" />}
                  {inspectingLog.status === 'pending' && <Clock className="w-5 h-5 shrink-0 text-amber-500" />}
                  <span className="uppercase tracking-widest">Job Status: {inspectingLog.status}</span>
                </div>
                {inspectingLog.completedAt && (
                  <span className="text-xs opacity-80 font-medium">Completed: {new Date(inspectingLog.completedAt.toDate ? inspectingLog.completedAt.toDate() : inspectingLog.completedAt).toLocaleString()}</span>
                )}
              </div>

              {/* Error Detail */}
              {inspectingLog.status === 'error' && (
                <div className="bg-rose-50/50 dark:bg-rose-950/10 border border-rose-200/30 dark:border-rose-900/20 rounded-xl p-4 space-y-1">
                  <h4 className="text-xs font-black text-rose-800 dark:text-rose-450 uppercase tracking-widest flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Error Description
                  </h4>
                  <p className="text-xs text-rose-700 dark:text-rose-300 font-medium leading-relaxed font-mono whitespace-pre-wrap">{inspectingLog.error || 'Unknown Error Details'}</p>
                </div>
              )}

              {/* Request Payload */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Outbound QBXML Request</h4>
                  <button
                    onClick={() => copyToClipboard(inspectingLog.qbxml || '', 'Request XML')}
                    className="text-xs text-indigo-500 hover:text-indigo-600 font-bold transition-all flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Request XML
                  </button>
                </div>
                <pre className="bg-zinc-950 text-emerald-400 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-[220px] custom-scrollbar border border-zinc-900 select-all leading-normal whitespace-pre">
                  {inspectingLog.qbxml || '<!-- No request XML payload -->'}
                </pre>
              </div>

              {/* Response Payload */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Inbound QuickBooks Response XML</h4>
                  {inspectingLog.response && (
                    <button
                      onClick={() => copyToClipboard(inspectingLog.response || '', 'Response XML')}
                      className="text-xs text-indigo-500 hover:text-indigo-600 font-bold transition-all flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Response XML
                    </button>
                  )}
                </div>
                {inspectingLog.response ? (
                  <pre className="bg-zinc-950 text-sky-400 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-[260px] custom-scrollbar border border-zinc-900 select-all leading-normal whitespace-pre">
                    {inspectingLog.response}
                  </pre>
                ) : (
                  <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-950 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-450 text-xs">
                    <Clock className="w-6 h-6 mx-auto mb-2 opacity-30 text-zinc-450" />
                    No QuickBooks response received yet. Job is currently {inspectingLog.status}.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/20 flex flex-col sm:flex-row gap-2 justify-between sm:items-center">
              <div className="flex gap-2">
                {(inspectingLog.status === 'completed' || inspectingLog.status === 'error') && (
                  <button
                    onClick={() => handleRequeue(inspectingLog)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md shadow-emerald-500/10"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Re-queue Sync Job
                  </button>
                )}
                <button
                  onClick={() => handleDeleteQueueItem(inspectingLog.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600/10 text-rose-600 dark:text-rose-400 hover:bg-rose-600/15 font-bold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Job
                </button>
              </div>
              <button
                onClick={() => setInspectingLog(null)}
                className="px-5 py-2 border border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
