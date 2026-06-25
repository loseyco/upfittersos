import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  where 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Briefcase, 
  FileText, 
  ShoppingCart, 
  Calendar, 
  ChevronRight, 
  Info, 
  Package, 
  Search, 
  Layers
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

interface QBJobDetailsPlaceholderProps {
  tenantId: string;
}

export function QBJobDetailsPlaceholder({ tenantId }: QBJobDetailsPlaceholderProps) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isLoadingTxns, setIsLoadingTxns] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'estimates' | 'invoices' | 'purchaseOrders'>('estimates');

  // Fetch the latest 20 jobs
  useEffect(() => {
    async function fetchJobs() {
      setIsLoadingJobs(true);
      try {
        const jobsRef = collection(db, `businesses/${tenantId}/jobs`);
        const q = query(jobsRef, orderBy('createdAt', 'desc'), limit(20));
        const snap = await getDocs(q);
        const fetchedJobs = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setJobs(fetchedJobs);
        if (fetchedJobs.length > 0) {
          setSelectedJob(fetchedJobs[0]);
        }
      } catch (err) {
        console.error('Error fetching jobs:', err);
        toast.error('Failed to load recent jobs.');
      } finally {
        setIsLoadingJobs(false);
      }
    }
    fetchJobs();
  }, [tenantId]);

  // Fetch transactions for the selected job
  useEffect(() => {
    if (!selectedJob) return;

    async function fetchTransactions() {
      setIsLoadingTxns(true);
      setEstimates([]);
      setInvoices([]);
      setPurchaseOrders([]);

      const jobQbId = selectedJob.quickbooksId || selectedJob.id;

      try {
        // 1. Fetch Estimates for this Job
        const estRef = collection(db, `businesses/${tenantId}/qb_estimates`);
        const estQuery = query(estRef, where('customerRef', '==', jobQbId));
        const estSnap = await getDocs(estQuery);
        const estList = estSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setEstimates(estList);

        // 2. Fetch Invoices for this Job
        const invRef = collection(db, `businesses/${tenantId}/qb_invoices`);
        const invQuery = query(invRef, where('customerRef', '==', jobQbId));
        const invSnap = await getDocs(invQuery);
        const invList = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setInvoices(invList);

        // 3. Fetch Purchase Orders
        // Since POs in QuickBooks don't always have a top-level customerRef,
        // we fetch the 150 most recent POs and check if either their top-level customerRef or
        // any of their line items (PurchaseOrderLineRet) reference this Job's QB ID.
        const poRef = collection(db, `businesses/${tenantId}/qb_purchase_orders`);
        const poQuery = query(poRef, orderBy('txnDate', 'desc'), limit(150));
        const poSnap = await getDocs(poQuery);
        const allPos = poSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const matchedPos = allPos.filter((po: any) => {
          // Check top-level ref
          if (po.customerRef === jobQbId || po.CustomerRef?.ListID === jobQbId) {
            return true;
          }
          // Check line-item level refs
          const lines = getLineItems(po, 'purchaseOrder');
          return lines.some((line: any) => 
            line.CustomerRef?.ListID === jobQbId || 
            line.CustomerRef?.FullName === selectedJob.title
          );
        });
        setPurchaseOrders(matchedPos);

      } catch (err) {
        console.error('Error fetching transactions:', err);
        toast.error('Failed to load QuickBooks transactions.');
      } finally {
        setIsLoadingTxns(false);
      }
    }

    fetchTransactions();
  }, [selectedJob, tenantId]);

  // Helper to extract line items defensively from parsed xml/json structure
  function getLineItems(txn: any, type: 'estimate' | 'invoice' | 'purchaseOrder'): any[] {
    let linesSource: any = null;

    if (type === 'estimate') {
      linesSource = txn.EstimateLineRet || txn.estimateLineRet;
    } else if (type === 'invoice') {
      linesSource = txn.InvoiceLineRet || txn.invoiceLineRet;
    } else if (type === 'purchaseOrder') {
      linesSource = txn.PurchaseOrderLineRet || txn.purchaseOrderLineRet;
    }

    if (!linesSource) return [];
    return Array.isArray(linesSource) ? linesSource : [linesSource];
  }

  // Helper to format currency
  function formatCurrency(amount: any) {
    const val = Number(amount);
    if (isNaN(val)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  }

  // Filter jobs based on search query
  const filteredJobs = jobs.filter(job => {
    const term = searchQuery.toLowerCase();
    return (
      (job.title || '').toLowerCase().includes(term) ||
      (job.jobNumber || '').toLowerCase().includes(term) ||
      (job.customerName || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-zinc-950 text-white overflow-hidden">
      {/* Sidebar List of Jobs */}
      <div className="w-80 border-r border-zinc-800 bg-zinc-900/40 flex flex-col shrink-0">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/60">
          <h2 className="text-lg font-bold tracking-tight mb-3 flex items-center gap-2 text-indigo-400">
            <Briefcase className="w-5 h-5 text-indigo-400" />
            Recent Jobs
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-zinc-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoadingJobs ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-505">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mb-2"></div>
              <p className="text-sm text-zinc-500">Loading jobs...</p>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500">No jobs found</div>
          ) : (
            filteredJobs.map((job) => {
              const isSelected = selectedJob?.id === job.id;
              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group",
                    isSelected 
                      ? "bg-indigo-600/10 border border-indigo-500 text-white" 
                      : "hover:bg-zinc-800/60 border border-transparent text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-semibold text-sm truncate text-zinc-100 group-hover:text-white">
                        {job.title}
                      </span>
                      {job.jobNumber && (
                        <span className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded-full font-mono shrink-0">
                          #{job.jobNumber}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 truncate">{job.customerName || 'No customer'}</p>
                  </div>
                  <ChevronRight className={cn("w-4 h-4 text-zinc-650 transition-transform group-hover:translate-x-0.5", isSelected && "text-indigo-400")} />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
        {selectedJob ? (
          <>
            {/* Header info */}
            <div className="p-6 border-b border-zinc-800 bg-zinc-900/20 shrink-0">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <h1 className="text-2xl font-bold tracking-tight text-white">{selectedJob.title}</h1>
                    {selectedJob.jobNumber && (
                      <span className="bg-indigo-900/40 text-indigo-300 border border-indigo-850 px-2.5 py-0.5 rounded-full text-xs font-mono">
                        Job #{selectedJob.jobNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400">
                    Customer: <span className="text-zinc-200 font-medium">{selectedJob.customerName || 'N/A'}</span>
                  </p>
                </div>
                
                {selectedJob.quickbooksId && (
                  <div className="bg-zinc-900 border border-zinc-800 p-2 px-3.5 rounded-xl flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-xs font-mono text-zinc-450">QB ListID: {selectedJob.quickbooksId}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="px-6 border-b border-zinc-800 bg-zinc-900/10 shrink-0 flex">
              <button
                onClick={() => setActiveTab('estimates')}
                className={cn(
                  "py-4 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2",
                  activeTab === 'estimates' 
                    ? "border-indigo-500 text-indigo-400" 
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Layers className="w-4 h-4" />
                Estimates
                <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full text-xs font-mono">
                  {estimates.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('invoices')}
                className={cn(
                  "py-4 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2",
                  activeTab === 'invoices' 
                    ? "border-indigo-500 text-indigo-400" 
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                )}
              >
                <FileText className="w-4 h-4" />
                Invoices
                <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full text-xs font-mono">
                  {invoices.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('purchaseOrders')}
                className={cn(
                  "py-4 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2",
                  activeTab === 'purchaseOrders' 
                    ? "border-indigo-500 text-indigo-400" 
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                )}
              >
                <ShoppingCart className="w-4 h-4" />
                Purchase Orders
                <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full text-xs font-mono">
                  {purchaseOrders.length}
                </span>
              </button>
            </div>

            {/* List and Line Items */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoadingTxns ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-2"></div>
                  <p className="text-sm text-zinc-400">Fetching QuickBooks details...</p>
                </div>
              ) : (
                <>
                  {activeTab === 'estimates' && (
                    estimates.length === 0 ? (
                      <EmptyState message="No synced Estimates found for this Job." icon={Layers} />
                    ) : (
                      estimates.map((est) => (
                        <TransactionCard 
                          key={est.id}
                          title={`Estimate #${est.refNumber || 'Draft'}`}
                          date={est.txnDate}
                          amount={est.totalAmount}
                          status={est.isStale ? 'Closed/Stale' : 'Active'}
                          statusType={est.isStale ? 'warning' : 'success'}
                          lines={getLineItems(est, 'estimate')}
                          formatCurrency={formatCurrency}
                        />
                      ))
                    )
                  )}

                  {activeTab === 'invoices' && (
                    invoices.length === 0 ? (
                      <EmptyState message="No synced Invoices found for this Job." icon={FileText} />
                    ) : (
                      invoices.map((inv) => (
                        <TransactionCard 
                          key={inv.id}
                          title={`Invoice #${inv.refNumber || 'Draft'}`}
                          date={inv.txnDate}
                          amount={inv.subtotal}
                          status={inv.isPaid ? 'Paid' : `Balance Remaining: ${formatCurrency(inv.balanceRemaining)}`}
                          statusType={inv.isPaid ? 'success' : 'error'}
                          lines={getLineItems(inv, 'invoice')}
                          formatCurrency={formatCurrency}
                        />
                      ))
                    )
                  )}

                  {activeTab === 'purchaseOrders' && (
                    purchaseOrders.length === 0 ? (
                      <EmptyState message="No synced Purchase Orders found for this Job." icon={ShoppingCart} />
                    ) : (
                      purchaseOrders.map((po) => (
                        <TransactionCard 
                          key={po.id}
                          title={`Purchase Order #${po.refNumber || 'Draft'}`}
                          date={po.txnDate}
                          amount={po.totalAmount}
                          status={po.isFullyReceived ? 'Fully Received' : 'Pending/Partial'}
                          statusType={po.isFullyReceived ? 'success' : 'warning'}
                          lines={getLineItems(po, 'purchaseOrder')}
                          formatCurrency={formatCurrency}
                          extraDetails={
                            <p className="text-xs text-zinc-400 mt-1">
                              Vendor: <span className="text-zinc-200 font-medium">{po.vendorName || 'N/A'}</span>
                            </p>
                          }
                        />
                      ))
                    )
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-zinc-500">
            <Briefcase className="w-12 h-12 text-zinc-650 mb-3" />
            <p className="text-sm">Select a job from the sidebar to inspect its QuickBooks transactions.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Transaction Card component with line items table
function TransactionCard({ 
  title, 
  date, 
  amount, 
  status, 
  statusType, 
  lines, 
  formatCurrency,
  extraDetails 
}: { 
  title: string;
  date: string;
  amount: number;
  status: string;
  statusType: 'success' | 'warning' | 'error' | 'info';
  lines: any[];
  formatCurrency: (amount: any) => string;
  extraDetails?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg hover:border-zinc-700/60 transition-colors">
      {/* Top summary row */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/60 cursor-pointer select-none border-b border-zinc-850 hover:bg-zinc-900/80 transition-colors"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-base text-white">{title}</h3>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-semibold border",
              statusType === 'success' && "bg-emerald-950/40 text-emerald-450 border-emerald-900/50",
              statusType === 'warning' && "bg-amber-950/40 text-amber-450 border-amber-900/50",
              statusType === 'error' && "bg-rose-950/40 text-rose-450 border-rose-900/50",
              statusType === 'info' && "bg-blue-950/40 text-blue-450 border-blue-900/50"
            )}>
              {status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-400">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-zinc-550" />
              {date || 'No Date'}
            </span>
            <span className="text-zinc-650">•</span>
            <span className="flex items-center gap-1 font-semibold text-zinc-300">
              Total: {formatCurrency(amount)}
            </span>
            <span className="text-zinc-650">•</span>
            <span>{lines.length} Line Items</span>
          </div>
          {extraDetails}
        </div>

        <button 
          className="text-zinc-400 hover:text-white text-xs font-semibold shrink-0 border border-zinc-800 hover:border-zinc-700 bg-zinc-950 px-3 py-1.5 rounded-lg transition-all"
        >
          {isOpen ? 'Collapse Lines' : 'Expand Lines'}
        </button>
      </div>

      {/* Line Items Table */}
      {isOpen && (
        <div className="overflow-x-auto">
          {lines.length === 0 ? (
            <div className="p-5 text-center text-xs text-zinc-550 flex items-center justify-center gap-1.5">
              <Info className="w-4 h-4 text-zinc-600" /> No individual line items returned.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-850 bg-zinc-950 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-5">Item / Part</th>
                  <th className="py-2.5 px-5">Description</th>
                  <th className="py-2.5 px-5 text-center w-20">Qty</th>
                  <th className="py-2.5 px-5 text-right w-28">Rate</th>
                  <th className="py-2.5 px-5 text-right w-32">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850">
                {lines.map((line, idx) => {
                  const itemName = line.ItemRef?.FullName || 'Unknown Item';
                  const desc = line.Desc || line.Description || '';
                  const qty = line.Quantity ?? '';
                  const rate = line.Rate ?? line.Cost ?? '';
                  const amount = line.Amount ?? '';

                  return (
                    <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="py-3 px-5 font-semibold text-zinc-150 align-top">
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-zinc-550 shrink-0" />
                          <span className="truncate max-w-[180px]">{itemName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-5 text-zinc-400 whitespace-pre-line max-w-sm align-top leading-relaxed">
                        {desc}
                      </td>
                      <td className="py-3 px-5 text-center text-zinc-300 align-top font-mono">
                        {qty}
                      </td>
                      <td className="py-3 px-5 text-right text-zinc-300 align-top font-mono">
                        {rate !== '' ? formatCurrency(rate) : ''}
                      </td>
                      <td className="py-3 px-5 text-right font-bold text-zinc-100 align-top font-mono">
                        {amount !== '' ? formatCurrency(amount) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// Simple empty state helper
function EmptyState({ message, icon: Icon }: { message: string; icon: any }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 border border-dashed border-zinc-850 rounded-2xl bg-zinc-950/40">
      <Icon className="w-9 h-9 text-zinc-650 mb-2.5" />
      <p className="text-sm text-zinc-400">{message}</p>
    </div>
  );
}
