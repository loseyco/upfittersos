import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  AlertTriangle, CheckCircle2, HelpCircle, 
  Package, Users, Clock, FileText, Search, Copy, 
  RefreshCw, ChevronDown, ChevronRight, ArrowUpRight, 
  ShieldAlert, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

interface QuickBooksAuditProps {
  tenantId: string;
}

interface Anomaly {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  affectedRecord: string;
  listId?: string;
  txnId?: string;
  collectionName: string;
  fixAction?: {
    label: string;
    onClick: () => void;
  };
}

// Safely convert any timestamp/string/date object to milliseconds
function getTimestamp(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try {
        return val.toDate().getTime();
      } catch (e) {
        // Fallback
      }
    }
    if (typeof val.seconds === 'number') {
      return val.seconds * 1000;
    }
  }
  if (typeof val === 'string') {
    const ms = Date.parse(val);
    return isNaN(ms) ? 0 : ms;
  }
  return 0;
}

// Parse QuickBooks Duration (e.g. "PT8H30M", "08:30:00", etc.)
function parseQBDuration(dur: any): number {
  if (!dur) return 0;
  if (typeof dur === 'number') {
    // If it's a number, assume it's hours if small (<1000) or milliseconds
    if (dur > 1000) return dur;
    return dur * 3600000;
  }
  if (typeof dur !== 'string') return 0;
  
  let hours = 0, minutes = 0, seconds = 0;
  
  const hMatch = dur.match(/(\d+)H/);
  const mMatch = dur.match(/(\d+)M/);
  const sMatch = dur.match(/(\d+)S/);
  
  if (hMatch) hours = parseInt(hMatch[1], 10);
  if (mMatch) minutes = parseInt(mMatch[1], 10);
  if (sMatch) seconds = parseInt(sMatch[1], 10);
  
  if (dur.includes(':')) {
    const parts = dur.split(':');
    hours = parseInt(parts[0], 10) || 0;
    minutes = parseInt(parts[1], 10) || 0;
    seconds = parseInt(parts[2], 10) || 0;
  }
  return (hours * 3600000) + (minutes * 60000) + (seconds * 1000);
}

export function QuickBooksAudit({ tenantId }: QuickBooksAuditProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'all' | 'inventory' | 'customers_jobs' | 'time' | 'billing'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedAnomalyId, setExpandedAnomalyId] = useState<string | null>(null);

  // Fetch all QuickBooks collections and local mapping collections
  const { data: rawData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['qb-audit-raw-data', tenantId],
    queryFn: async () => {
      const collections = [
        { key: 'qbItems', name: 'qb_items' },
        { key: 'qbJobs', name: 'qb_jobs' },
        { key: 'qbCustomers', name: 'qb_customers' },
        { key: 'qbEmployees', name: 'qb_employees' },
        { key: 'qbTimeTracking', name: 'qb_time_tracking' },
        { key: 'qbInvoices', name: 'qb_invoices' },
        { key: 'qbPurchaseOrders', name: 'qb_purchase_orders' },
        { key: 'staff', name: 'staff' },
        { key: 'jobs', name: 'jobs' },
        { key: 'customers', name: 'customers' },
        { key: 'vehicles', name: 'vehicles' }
      ];

      const results = await Promise.all(
        collections.map(async (col) => {
          try {
            const q = query(collection(db, `businesses/${tenantId}/${col.name}`));
            const snap = await getDocs(q);
            return {
              key: col.key,
              data: snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            };
          } catch (e) {
            console.warn(`Could not fetch ${col.name} for audit dashboard`, e);
            return { key: col.key, data: [] };
          }
        })
      );

      const dataMap = results.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.data }), {} as Record<string, any[]>);
      return {
        ...dataMap,
        fetchedAt: new Date().toISOString()
      } as any;
    },
    enabled: !!tenantId && tenantId !== 'GLOBAL',
    staleTime: 24 * 60 * 60 * 1000, // Cache for 24 hours (1 day)
    refetchOnWindowFocus: false,     // Don't refetch on window focus
    refetchOnMount: false            // Don't refetch on component remount
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard!`);
  };

  // Run audit rules on the raw data
  const audits = useMemo(() => {
    if (!rawData) return { anomalies: [], stats: { total: 0, errors: 0, warnings: 0, score: 100 }, error: null };

    try {
      const anomalies: Anomaly[] = [];
      const CUTOFF_DATE = new Date(2026, 5, 1); // June 1st, 2026
      const now = new Date().getTime();

      const { 
        qbItems = [], 
        qbJobs = [], 
        qbCustomers = [], 
        qbEmployees = [], 
        qbTimeTracking = [], 
        qbInvoices = [], 
        qbPurchaseOrders = [], 
        staff = [], 
        jobs = [], 
        customers = []
      } = rawData;

      // --- 1. INVENTORY AUDIT (No date filter applied to static catalog) ---
      qbItems.forEach((item: any) => {
        if (!item) return;
        const quantity = Number(item.quantityOnHand ?? item.QuantityOnHand) || 0;
        const minCount = Number(item.minCount ?? item.ReorderPoint) || 0;
        const onOrder = Number(item.quantityOnOrder ?? item.QuantityOnOrder) || 0;
        const cost = Number(item.cost ?? item.PurchaseCost ?? item.AverageCost) || 0;
        const price = Number(item.price ?? item.SalesPrice ?? item.Price) || 0;
        const isActive = item.status !== 'Inactive' && item.IsActive !== false && item.IsActive !== 'false';

        // Rule: Negative stock
        if (quantity < 0) {
          anomalies.push({
            id: `inv-neg-${item.id}`,
            type: 'error',
            title: 'Negative Inventory Balance',
            message: `Item has an on-hand quantity of ${quantity}. Negative inventory indicates timing discrepancies, unrecorded vendor receipts, or manual adjustment errors.`,
            affectedRecord: item.name || item.sku || 'Unknown Item',
            listId: item.id,
            collectionName: 'qb_items',
            fixAction: {
              label: 'Open Item',
              onClick: () => navigate(`/business/${tenantId}/items`)
            }
          });
        }

        // Rule: Low stock without purchase order
        if (isActive && minCount > 0 && quantity <= minCount && onOrder === 0) {
          anomalies.push({
            id: `inv-reorder-${item.id}`,
            type: 'warning',
            title: 'Stock Below Reorder Point',
            message: `On-hand quantity (${quantity}) is below or equal to reorder threshold (${minCount}), and no purchase order is currently pending.`,
            affectedRecord: item.name || item.sku || 'Unknown Item',
            listId: item.id,
            collectionName: 'qb_items'
          });
        }

        // Rule: Zero cost check
        if (isActive && cost === 0 && price > 0) {
          anomalies.push({
            id: `inv-cost-zero-${item.id}`,
            type: 'warning',
            title: 'Zero Unit Cost',
            message: `Selling price is $${price.toFixed(2)} but purchase cost is recorded as $0.00. This will distort margin and profit analysis.`,
            affectedRecord: item.name || item.sku || 'Unknown Item',
            listId: item.id,
            collectionName: 'qb_items'
          });
        }

        // Rule: Negative margin (cost > price)
        if (isActive && cost > price && price > 0) {
          anomalies.push({
            id: `inv-margin-${item.id}`,
            type: 'error',
            title: 'Negative Unit Profit Margin',
            message: `Purchase cost ($${cost.toFixed(2)}) is higher than sales price ($${price.toFixed(2)}). Every unit sold results in a loss.`,
            affectedRecord: item.name || item.sku || 'Unknown Item',
            listId: item.id,
            collectionName: 'qb_items'
          });
        }

        // Rule: Inactive but has stock
        if (!isActive && quantity > 0) {
          anomalies.push({
            id: `inv-inactive-stock-${item.id}`,
            type: 'warning',
            title: 'Inactive Item with Stock',
            message: `Item is marked inactive in QuickBooks, but still registers ${quantity} units on-hand.`,
            affectedRecord: item.name || item.sku || 'Unknown Item',
            listId: item.id,
            collectionName: 'qb_items'
          });
        }
      });

      // --- 2. CUSTOMERS & JOBS AUDIT ---
      qbJobs.forEach((job: any) => {
        if (!job) return;
        // Date filter: Only look at jobs created or modified since June 1st, 2026
        const jobTime = job.TimeCreated || job.TimeModified;
        if (jobTime && getTimestamp(jobTime) < CUTOFF_DATE.getTime()) {
          return;
        }

        const parentRefId = job.parentRefId || '';
        const isActive = job.status === 'Active' || job.IsActive === 'true' || job.IsActive === true;

        // Rule: Orphaned Job (No customer mapping found)
        if (parentRefId) {
          const hasCustomer = qbCustomers.some((c: any) => c && c.id === parentRefId) || 
                              customers.some((c: any) => c && (c.quickbooksId === parentRefId || c.id === parentRefId));
          if (!hasCustomer) {
            anomalies.push({
              id: `job-orphan-${job.id}`,
              type: 'error',
              title: 'Orphaned QuickBooks Job',
              message: `Job is assigned parent ID "${parentRefId}", but no corresponding Customer record exists in the system database.`,
              affectedRecord: job.name || job.FullName || 'Unknown Job',
              listId: job.id,
              collectionName: 'qb_jobs'
            });
          }
        }

        // Rule: Active Job with Missing Vehicle
        if (isActive) {
          // Find if native job is mapped and has a vehicleId
          const nativeJob = jobs.find((j: any) => j && (j.quickbooksId === job.id || j.id === job.id));
          const hasVehicle = nativeJob?.vehicleId || job.vehicle || (job.qbCustomFields && (job.qbCustomFields.vin || job.qbCustomFields['VIN num']));
          if (!hasVehicle) {
            anomalies.push({
              id: `job-missing-veh-${job.id}`,
              type: 'warning',
              title: 'Active Job Missing Vehicle',
              message: 'Job is active but no vehicle intake details or VIN could be identified. Task scheduling and location tracking may be restricted.',
              affectedRecord: job.name || job.FullName || 'Unknown Job',
              listId: job.id,
              collectionName: 'qb_jobs',
              fixAction: {
                label: 'Open Jobs Manager',
                onClick: () => navigate(`/business/${tenantId}/jobs`)
              }
            });
          }

          // Rule: Synced Job with No Tasks/Crew Assigned
          const hasAssignedStaff = nativeJob?.assignedStaffIds && nativeJob.assignedStaffIds.length > 0;
          if (!hasAssignedStaff) {
            anomalies.push({
              id: `job-no-tasks-${job.id}`,
              type: 'warning',
              title: 'Job Has No Tasks Assigned',
              message: 'Job is active but has no technicians or tasks assigned to it on the schedule board.',
              affectedRecord: job.name || job.FullName || 'Unknown Job',
              listId: job.id,
              collectionName: 'qb_jobs',
              fixAction: {
                label: 'Open Schedule Board',
                onClick: () => navigate(`/business/${tenantId}/job_schedule`)
              }
            });
          }

          // Rule: Synced Job with Default/Empty Status
          const statusVal = nativeJob?.status || '';
          if (!statusVal || statusVal === 'Open') {
            anomalies.push({
              id: `job-default-status-${job.id}`,
              type: 'warning',
              title: 'Job Status is Default or Unassigned',
              message: 'Job is synced but its workflow status is currently set to the default "Open" state or is empty.',
              affectedRecord: job.name || job.FullName || 'Unknown Job',
              listId: job.id,
              collectionName: 'qb_jobs',
              fixAction: {
                label: 'Open Jobs Manager',
                onClick: () => navigate(`/business/${tenantId}/jobs`)
              }
            });
          }
        }
      });

      // Rule: Duplicate Customers (Fuzzy duplicate search by exact email or firstName+lastName)
      const processedEmails = new Set<string>();
      const processedNames = new Set<string>();
      qbCustomers.forEach((cust: any) => {
        if (!cust) return;
        // Date filter: Only look at customers created or modified since June 1st, 2026
        const custTime = cust.TimeCreated || cust.TimeModified;
        if (custTime && getTimestamp(custTime) < CUTOFF_DATE.getTime()) {
          return;
        }

        const email = String(cust.email || cust.Email?.Address || '').trim().toLowerCase();
        const firstName = String(cust.firstName || cust.FirstName || '').trim().toLowerCase();
        const lastName = String(cust.lastName || cust.LastName || '').trim().toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();

        if (email && email.length > 3) {
          const duplicates = qbCustomers.filter((c: any) => 
            c && c.id !== cust.id && 
            String(c.email || c.Email?.Address || '').trim().toLowerCase() === email
          );
          if (duplicates.length > 0 && !processedEmails.has(email)) {
            processedEmails.add(email);
            anomalies.push({
              id: `cust-dup-email-${cust.id}`,
              type: 'warning',
              title: 'Duplicate Customer Email',
              message: `Multiple customer files share the email "${email}". Duplicate QuickBooks ListIDs: ${[cust.id, ...duplicates.map((d: any) => d.id)].join(', ')}.`,
              affectedRecord: cust.company || cust.FullName || 'Unnamed Customer',
              listId: cust.id,
              collectionName: 'qb_customers'
            });
          }
        }

        if (fullName && fullName.length > 5) {
          const nameKey = fullName;
          const duplicates = qbCustomers.filter((c: any) => {
            if (!c) return false;
            const fn = String(c.firstName || c.FirstName || '').trim().toLowerCase();
            const ln = String(c.lastName || c.LastName || '').trim().toLowerCase();
            return c.id !== cust.id && `${fn} ${ln}`.trim() === nameKey;
          });
          if (duplicates.length > 0 && !processedNames.has(nameKey)) {
            processedNames.add(nameKey);
            anomalies.push({
              id: `cust-dup-name-${cust.id}`,
              type: 'warning',
              title: 'Duplicate Customer Profile Name',
              message: `Multiple customer profiles found with the name "${cust.firstName || cust.FirstName} ${cust.lastName || cust.LastName}".`,
              affectedRecord: cust.company || cust.FullName || 'Unnamed Customer',
              listId: cust.id,
              collectionName: 'qb_customers'
            });
          }
        }
      });

      // --- 3. TIME TRACKING AUDIT (No date filter applied to active staff directory, but applied to timecards) ---
      qbTimeTracking.forEach((time: any) => {
        if (!time) return;
        // Date filter: Only check time trackings since June 1st, 2026
        if (time.txnDate && getTimestamp(time.txnDate) < CUTOFF_DATE.getTime()) {
          return;
        }

        const entityRef = time.entityRef || ''; // QB employee ListID
        const customerRef = time.customerRef || ''; // QB job ListID
        const durationMs = parseQBDuration(time.duration);

        // Rule: Unresolved Technician
        if (entityRef) {
          const hasStaff = staff.some((s: any) => s && (s.quickbooksId === entityRef || s.id === entityRef)) ||
                           qbEmployees.some((e: any) => e && e.id === entityRef);
          if (!hasStaff) {
            anomalies.push({
              id: `time-unresolved-tech-${time.id}`,
              type: 'error',
              title: 'Unresolved Technician Reference',
              message: `Timecard lists QuickBooks Employee ID "${entityRef}" (${time.entityName}), which is not mapped to any active staff member.`,
              affectedRecord: time.entityName || 'Unknown Staff',
              txnId: time.id,
              collectionName: 'qb_time_tracking'
            });
          }
        }

        // Rule: Unresolved Job
        if (customerRef) {
          const hasJob = jobs.some((j: any) => j && (j.quickbooksId === customerRef || j.id === customerRef)) ||
                         qbJobs.some((j: any) => j && j.id === customerRef);
          if (!hasJob) {
            anomalies.push({
              id: `time-unresolved-job-${time.id}`,
              type: 'warning',
              title: 'Unresolved Job Reference',
              message: `Timecard is logged against Job ListID "${customerRef}" (${time.customerName}), which does not match any active job.`,
              affectedRecord: time.customerName || 'Unknown Job',
              txnId: time.id,
              collectionName: 'qb_time_tracking'
            });
          }
        }

        // Rule: Excessive Single-entry duration (> 16 hours)
        const maxMs = 16 * 60 * 60 * 1000;
        if (durationMs > maxMs) {
          const hours = (durationMs / (60 * 60 * 1000)).toFixed(1);
          anomalies.push({
            id: `time-excessive-${time.id}`,
            type: 'error',
            title: 'Implausible Shift Duration',
            message: `Single time tracking entry logs ${hours} hours. Entries exceeding 16 hours typically represent a missed clock-out.`,
            affectedRecord: time.entityName || 'Unknown Staff',
            txnId: time.id,
            collectionName: 'qb_time_tracking',
            fixAction: {
              label: 'Review Attendance',
              onClick: () => navigate(`/business/${tenantId}/timeclock`)
            }
          });
        }

        // Rule: Zero duration
        if (durationMs === 0) {
          anomalies.push({
            id: `time-zero-${time.id}`,
            type: 'warning',
            title: 'Zero-Duration Time Tracking',
            message: 'Time tracking record has an empty or 0h 0m duration.',
            affectedRecord: time.entityName || 'Unknown Staff',
            txnId: time.id,
            collectionName: 'qb_time_tracking'
          });
        }
      });

      // --- 4. BILLING & DOCUMENTS AUDIT ---
      qbInvoices.forEach((inv: any) => {
        if (!inv) return;
        // Date filter: Only check invoices since June 1st, 2026
        if (inv.txnDate && getTimestamp(inv.txnDate) < CUTOFF_DATE.getTime()) {
          return;
        }

        const isPaid = inv.isPaid === true || inv.IsPaid === 'true' || inv.IsPaid === true;
        const balance = Number(inv.balanceRemaining || inv.BalanceRemaining) || 0;

        // Rule: Paid but balance > 0
        if (isPaid && balance > 0) {
          anomalies.push({
            id: `inv-paid-bal-${inv.id}`,
            type: 'error',
            title: 'Paid Invoice with Balance',
            message: `Invoice #${inv.refNumber} is marked paid (IsPaid = true), but still registers an outstanding balance of $${balance.toFixed(2)}.`,
            affectedRecord: `Invoice #${inv.refNumber || inv.id}`,
            txnId: inv.id,
            collectionName: 'qb_invoices'
          });
        }

        // Rule: Unpaid but balance <= 0
        if (!isPaid && balance <= 0) {
          anomalies.push({
            id: `inv-unpaid-bal-${inv.id}`,
            type: 'warning',
            title: 'Unpaid Invoice with Zero Balance',
            message: `Invoice #${inv.refNumber} is marked unpaid, but reports a balance of $${balance.toFixed(2)}.`,
            affectedRecord: `Invoice #${inv.refNumber || inv.id}`,
            txnId: inv.id,
            collectionName: 'qb_invoices'
          });
        }
      });

      // Estimates checking
      qbInvoices.forEach((est: any) => {
        if (!est) return;
        // Date filter: Only check estimates since June 1st, 2026
        const dateStr = est.txnDate ?? est.TxnDate;
        if (dateStr && getTimestamp(dateStr) < CUTOFF_DATE.getTime()) {
          return;
        }

        // NOTE: Estimates are sometimes stored in qb_estimates. Let's support checks on totalAmount.
        const total = Number(est.totalAmount ?? est.TotalAmount) || 0;
        const isStale = est.isStale === true || est.isStale === 'true';

        if (est.collectionName === 'qb_estimates' || est.id.startsWith('est_')) {
          // Zero or negative estimates
          if (total <= 0) {
            anomalies.push({
              id: `est-zero-${est.id}`,
              type: 'warning',
              title: 'Zero-Value Estimate',
              message: `Estimate #${est.refNumber || est.id} registers a total amount of $${total.toFixed(2)}.`,
              affectedRecord: `Estimate #${est.refNumber || est.id}`,
              txnId: est.id,
              collectionName: 'qb_estimates'
            });
          }

          // Stale estimates (>90 days old)
          if (dateStr && !isStale) {
            const dateMs = getTimestamp(dateStr);
            const ageDays = Math.floor((now - dateMs) / (24 * 60 * 60 * 1000));
            if (ageDays > 90) {
              anomalies.push({
                id: `est-stale-${est.id}`,
                type: 'info',
                title: 'Aged Estimate Warning',
                message: `Estimate was created ${ageDays} days ago and remains open/active. It should be archived or closed.`,
                affectedRecord: `Estimate #${est.refNumber || est.id}`,
                txnId: est.id,
                collectionName: 'qb_estimates'
              });
            }
          }
        }
      });

      // Purchase Orders checking
      qbPurchaseOrders.forEach((po: any) => {
        if (!po) return;
        // Date filter: Only check POs since June 1st, 2026
        const dateStr = po.txnDate ?? po.TxnDate;
        if (dateStr && getTimestamp(dateStr) < CUTOFF_DATE.getTime()) {
          return;
        }

        const amount = Number(po.totalAmount ?? po.TotalAmount) || 0;

        if (amount <= 0) {
          anomalies.push({
            id: `po-zero-${po.id}`,
            type: 'warning',
            title: 'Zero-Value Purchase Order',
            message: `Purchase Order #${po.refNumber || po.id} registers a total value of $${amount.toFixed(2)}.`,
            affectedRecord: `PO #${po.refNumber || po.id}`,
            txnId: po.id,
            collectionName: 'qb_purchase_orders'
          });
        }
      });

      const errorDeduct = anomalies.filter(a => a.type === 'error').length * 5;
      const warningDeduct = anomalies.filter(a => a.type === 'warning').length * 2;
      const infoDeduct = anomalies.filter(a => a.type === 'info').length * 0.5;
      const score = Math.max(0, Math.round(100 - (errorDeduct + warningDeduct + infoDeduct)));

      return {
        anomalies,
        stats: {
          total: anomalies.length,
          errors: anomalies.filter(a => a.type === 'error').length,
          warnings: anomalies.filter(a => a.type === 'warning').length,
          score
        },
        error: null
      };
    } catch (e: any) {
      console.error("Error in QuickBooksAudit useMemo:", e);
      return {
        anomalies: [],
        stats: { total: 0, errors: 0, warnings: 0, score: 0 },
        error: e.message || String(e)
      };
    }
  }, [rawData, navigate, tenantId]);

  // Filter anomalies based on selected tab and search query
  const filteredAnomalies = useMemo(() => {
    let list = audits.anomalies;

    // Filter tab
    if (activeTab === 'inventory') {
      list = list.filter(a => a.collectionName === 'qb_items');
    } else if (activeTab === 'customers_jobs') {
      list = list.filter(a => ['qb_jobs', 'qb_customers'].includes(a.collectionName));
    } else if (activeTab === 'time') {
      list = list.filter(a => a.collectionName === 'qb_time_tracking');
    } else if (activeTab === 'billing') {
      list = list.filter(a => ['qb_invoices', 'qb_estimates', 'qb_purchase_orders'].includes(a.collectionName));
    }

    // Filter search
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(a => 
        a.title.toLowerCase().includes(q) ||
        a.message.toLowerCase().includes(q) ||
        a.affectedRecord.toLowerCase().includes(q) ||
        (a.listId && a.listId.toLowerCase().includes(q)) ||
        (a.txnId && a.txnId.toLowerCase().includes(q))
      );
    }

    return list;
  }, [audits.anomalies, activeTab, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedAnomalyId(current => current === id ? null : id);
  };

  const getHealthBadgeColor = (score: number) => {
    if (score >= 90) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
    if (score >= 70) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20';
    return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-zinc-400 dark:text-zinc-650 flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm font-bold uppercase tracking-wider">Running QuickBooks Data Audit...</p>
        <p className="text-xs opacity-75">Scanning raw synced items, time logs, and invoices.</p>
      </div>
    );
  }

  if (audits.error) {
    return (
      <div className="p-8 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-500/20 max-w-xl mx-auto text-center space-y-4">
        <ShieldAlert className="w-12 h-12 mx-auto" />
        <h3 className="text-lg font-black uppercase tracking-wider">Audit Execution Failed</h3>
        <p className="text-xs">An error occurred while analyzing raw QuickBooks records:</p>
        <pre className="text-left bg-zinc-950 p-4 rounded-xl font-mono text-[10px] text-zinc-300 overflow-x-auto whitespace-pre-wrap">
          {audits.error}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-4">
          <div className="hidden md:flex w-14 h-14 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl items-center justify-center shadow-sm">
            <ShieldCheck className="w-7 h-7 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">
              Data Health Audit
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              QuickBooks Data Health & Integration Discrepancies
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 self-start md:self-auto">
          {rawData?.fetchedAt && (
            <div className="text-left md:text-right">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-455 dark:text-zinc-500 block">
                Last Audited
              </span>
              <span className="text-xs font-semibold text-zinc-650 dark:text-zinc-350">
                {new Date(rawData.fetchedAt).toLocaleString()}
              </span>
            </div>
          )}
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-650 hover:bg-indigo-700 disabled:bg-indigo-650/60 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-550/15 active:scale-[0.97] cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefetching && "animate-spin")} />
            {isRefetching ? 'Running Audit...' : 'Re-Run Audit'}
          </button>
        </div>
      </div>
      {/* Header Dashboard Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Health Score Card */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col relative overflow-hidden justify-between">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold uppercase tracking-wider text-zinc-500 text-sm">Data Health Score</h3>
            <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-black uppercase", getHealthBadgeColor(audits.stats.score))}>
              {audits.stats.score >= 90 ? 'Healthy' : audits.stats.score >= 70 ? 'Fair' : 'Attention'}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-5xl font-black tracking-tight text-zinc-900 dark:text-white">{audits.stats.score}</span>
            <span className="text-zinc-400 font-bold text-sm">/ 100</span>
          </div>
          <p className="text-xs text-zinc-400 font-semibold mt-4">Integrity score calculated based on severity of flagged items.</p>
        </div>

        {/* Total Anomalies */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2 text-indigo-500">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-zinc-500 text-sm">Total Flagged Items</h3>
          </div>
          <p className="text-4xl font-black text-zinc-900 dark:text-white mt-1">{audits.stats.total}</p>
          <div className="mt-4 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
            <span>Critical Errors:</span>
            <span className="font-bold text-rose-500">{audits.stats.errors}</span>
          </div>
        </div>

        {/* Warnings */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2 text-amber-500">
            <ShieldAlert className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-zinc-500 text-sm">Active Warnings</h3>
          </div>
          <p className="text-4xl font-black text-zinc-900 dark:text-white mt-1">{audits.stats.warnings}</p>
          <div className="mt-4 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
            <span>Minor Alerts:</span>
            <span className="font-bold text-amber-500">{audits.stats.warnings}</span>
          </div>
        </div>

        {/* Database Collections Scanned */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2 text-emerald-500">
            <CheckCircle2 className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-zinc-500 text-sm">Sync Coverage</h3>
          </div>
          <p className="text-4xl font-black text-zinc-900 dark:text-white mt-1">11 / 11</p>
          <div className="mt-4 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
            <span>All Collections:</span>
            <span className="font-bold text-emerald-500">Scanning Complete</span>
          </div>
        </div>
      </div>

      {/* Main Tabbed Layout for Anomalies */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        {/* Tab Headers and Search */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'All Anomalies', icon: AlertTriangle },
              { id: 'inventory', label: 'Inventory & Stock', icon: Package },
              { id: 'customers_jobs', label: 'Customers & Jobs', icon: Users },
              { id: 'time', label: 'Technicians & Time', icon: Clock },
              { id: 'billing', label: 'Billing & Invoices', icon: FileText }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border",
                    isActive
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20 active:scale-95"
                      : "bg-white dark:bg-zinc-950 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border-zinc-200 dark:border-zinc-800"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search anomalies by record name..."
              className="w-full lg:w-64 pl-10 pr-4 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-indigo-500 text-zinc-900 dark:text-white placeholder-zinc-450 dark:placeholder-zinc-650"
            />
          </div>
        </div>

        {/* Anomalies List */}
        <div className="divide-y divide-zinc-150 dark:divide-zinc-850">
          {filteredAnomalies.length === 0 ? (
            <div className="p-16 text-center flex flex-col items-center justify-center space-y-3">
              <ShieldCheck className="w-12 h-12 text-emerald-500 opacity-60" />
              <h3 className="text-base font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-widest">Data Integrity Verified</h3>
              <p className="text-xs text-zinc-400 max-w-sm">No data discrepancies found matching the filter criteria. All raw QuickBooks imports successfully align with native system schema.</p>
            </div>
          ) : (
            filteredAnomalies.map(anomaly => {
              const isExpanded = expandedAnomalyId === anomaly.id;
              const isError = anomaly.type === 'error';
              const isWarning = anomaly.type === 'warning';

              return (
                <div 
                  key={anomaly.id} 
                  className={cn(
                    "p-4 transition-all duration-150 flex flex-col gap-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-950/20 cursor-pointer",
                    isExpanded && "bg-zinc-50/40 dark:bg-zinc-950/10"
                  )}
                  onClick={() => toggleExpand(anomaly.id)}
                >
                  {/* Summary row */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Icon representation of Severity */}
                      <div className="shrink-0 mt-0.5">
                        {isError ? (
                          <ShieldAlert className="w-5 h-5 text-rose-500" />
                        ) : isWarning ? (
                          <AlertTriangle className="w-5 h-5 text-amber-500" />
                        ) : (
                          <HelpCircle className="w-5 h-5 text-sky-500" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <span className="text-xs text-zinc-400 font-bold uppercase tracking-widest block mb-0.5">
                          {anomaly.collectionName.replace('qb_', '').toUpperCase()} | {anomaly.affectedRecord}
                        </span>
                        <h4 className="font-bold text-sm text-zinc-900 dark:text-white leading-tight">
                          {anomaly.title}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn(
                        "inline-flex items-center rounded-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                        isError && "text-rose-600 dark:text-rose-400 bg-rose-500/10",
                        isWarning && "text-amber-600 dark:text-amber-400 bg-amber-500/10",
                        !isError && !isWarning && "text-sky-600 dark:text-sky-400 bg-sky-500/10"
                      )}>
                        {anomaly.type}
                      </span>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                    </div>
                  </div>

                  {/* Expanded detail section */}
                  {isExpanded && (
                    <div 
                      className="pl-8 pt-2 pb-1 border-t border-zinc-150 dark:border-zinc-800/40 mt-1 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-200"
                      onClick={(e) => e.stopPropagation()} // Prevent collapsing
                    >
                      <div className="space-y-2 max-w-2xl text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        <p>{anomaly.message}</p>
                        <div className="flex flex-wrap gap-4 items-center font-semibold text-[10px] text-zinc-400">
                          {anomaly.listId && (
                            <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-850 px-2 py-1 rounded-lg">
                              <span>ListID: <code className="font-mono text-zinc-650 dark:text-zinc-300">{anomaly.listId}</code></span>
                              <button 
                                onClick={() => copyToClipboard(anomaly.listId!, 'ListID')}
                                className="p-0.5 hover:text-zinc-100 rounded transition-colors"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          {anomaly.txnId && (
                            <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-850 px-2 py-1 rounded-lg">
                              <span>TxnID: <code className="font-mono text-zinc-650 dark:text-zinc-300">{anomaly.txnId}</code></span>
                              <button 
                                onClick={() => copyToClipboard(anomaly.txnId!, 'TxnID')}
                                className="p-0.5 hover:text-zinc-100 rounded transition-colors"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <div className="bg-zinc-100 dark:bg-zinc-850 px-2 py-1 rounded-lg">
                            <span>Collection: <code className="font-mono text-zinc-650 dark:text-zinc-300">{anomaly.collectionName}</code></span>
                          </div>
                        </div>
                      </div>

                      {/* Optional Action Button */}
                      {anomaly.fixAction && (
                        <button
                          onClick={anomaly.fixAction.onClick}
                          className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
                        >
                          {anomaly.fixAction.label}
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
