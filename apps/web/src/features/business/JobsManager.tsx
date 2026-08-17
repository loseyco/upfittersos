import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp, onSnapshot, collectionGroup, where } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../../lib/firebase/config';
import { 
  Briefcase, Search, Plus, 
  Car, X, User, MapPin
} from 'lucide-react';
import { GenericDataGrid } from './GenericDataGrid';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { VinSelector, QuickAddVehicleModal } from './VehicleSelector';
import type { Vehicle } from './VehicleSelector';
import { CustomerSelector, QuickAddCustomerModal } from './CustomerSelectionComponents';
import { useAuthStore } from '../../lib/auth/store';
import { SearchableSelect } from './SearchableSelect';

interface JobsManagerProps {
  tenantId: string;
  jobId?: string | null;
}

export function JobsManager({ tenantId, jobId }: JobsManagerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);

  // Real-time listener for active timeclock sessions
  React.useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('status', '==', 'active')
    );
    const unsub = onSnapshot(q, (snap) => {
      setActiveSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Active sessions listener error:", err));
    return () => unsub();
  }, [tenantId]);

  // Compute active job ids and which staff are working on them
  const activeJobStaffMap = React.useMemo(() => {
    const map = new Map<string, Array<{ staffId: string, staffName: string, isCurrentUser: boolean }>>();
    const currentUserId = useAuthStore.getState().user?.uid;

    activeSessions.forEach(s => {
      if (s.jobs) {
        s.jobs.forEach((j: any) => {
          if (!j.end) {
            const list = map.get(j.id) || [];
            if (!list.some(item => item.staffId === s.userId)) {
              list.push({
                staffId: s.userId,
                staffName: s.userName || s.staffName || 'Technician',
                isCurrentUser: s.userId === currentUserId
              });
              map.set(j.id, list);
            }
          }
        });
      }
    });
    return map;
  }, [activeSessions]);

  
  const queryParams = new URLSearchParams(location.search);
  const initialStatus = queryParams.get('status') || 'all';
  const [statusFilter, setStatusFilter] = useState(initialStatus);

  React.useEffect(() => {
    const status = new URLSearchParams(location.search).get('status');
    if (status) {
      setStatusFilter(status);
    }
  }, [location.search]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [zones, setZones] = useState<any[]>([]);

  // Real-time listener for zones
  React.useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/zones`));
    const unsub = onSnapshot(q, (snap) => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Zones listener error:", err));
    return () => unsub();
  }, [tenantId]);

  // Real-time listener for vehicles
  React.useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/vehicles`), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data: Vehicle[] = [];
      const seen = new Set();
      snap.forEach(doc => {
        const v = { id: doc.id, ...doc.data() } as Vehicle;
        const key = (v.vin || v.id).toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          data.push(v);
        }
      });
      setVehicles(data);
    }, (err) => console.error("Vehicles listener error:", err));
    return () => unsub();
  }, [tenantId]);

  // Fetch Jobs
  const { refetch } = useQuery({
    queryKey: ['jobs-list', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/jobs`),
        orderBy('updatedAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });

  // Handle jobId from URL - Standardized to navigate to full page
  React.useEffect(() => {
    if (jobId) {
      navigate(`/business/${tenantId}/job/${jobId}`, { replace: true });
    }
  }, [jobId, tenantId, navigate]);

  const [tasks, setTasks] = useState<any[]>([]);

  // Real-time listener for tasks via collectionGroup
  React.useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collectionGroup(db, 'tasks'),
      where('tenantId', '==', tenantId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const filteredDocs = snap.docs.filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`));
      setTasks(filteredDocs.map(doc => ({
        id: doc.id,
        jobId: doc.ref.path.split('/')[3],
        ...doc.data()
      })));
    }, (err) => console.error("Tasks collectionGroup listener error in JobsManager:", err));
    return () => unsub();
  }, [tenantId]);

  const jobColumns = [
    { 
      key: 'jobNumber', 
      label: 'Job #',
      format: (val: any) => val ? (
        <span className="font-mono font-bold text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
          {val}
        </span>
      ) : <span className="text-zinc-400 italic">--</span>
    },
    { 
      key: 'title', 
      label: 'Job Title',
      format: (val: any, row: any) => {
        const activeStaff = activeJobStaffMap.get(row.id) || [];
        const hasCurrentUser = activeStaff.some(item => item.isCurrentUser);
        const otherStaffNames = activeStaff.filter(item => !item.isCurrentUser).map(item => item.staffName).join(', ');

        return (
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-black text-zinc-900 dark:text-white text-base">{val}</span>
              {hasCurrentUser && (
                <span className="animate-pulse bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm shadow-emerald-500/35 border border-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" /> Working
                </span>
              )}
              {!hasCurrentUser && activeStaff.length > 0 && (
                <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full" title={`Being worked on by: ${otherStaffNames}`}>
                  Active Now ({activeStaff.length})
                </span>
              )}
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">{row.id.substring(0, 8)}</span>
          </div>
        );
      }
    },
    { 
      key: 'status', 
      label: 'Status',
      format: (val: any) => (
        <span className={cn(
          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
          val === 'Active' || val === 'Open' ? "bg-emerald-500/10 text-emerald-600" :
          val === 'Almost Ready' ? "bg-amber-500/10 text-amber-600" :
          val === 'Completed' || val === 'Closed' ? "bg-zinc-100 text-zinc-500" :
          "bg-amber-500/10 text-amber-600"
        )}>
          {val || 'Unknown'}
        </span>
      )
    },
    {
      key: 'updatedAt',
      label: 'Last Modified',
      format: (val: any) => {
        if (!val) return <span className="text-zinc-400 italic">Not Set</span>;
        const date = new Date(val?.seconds ? val.seconds * 1000 : val);
        if (isNaN(date.getTime())) return <span className="text-zinc-400 italic">Not Set</span>;
        return (
          <div className="flex flex-col">
            <span className="text-zinc-900 dark:text-white font-bold">
              {date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        );
      }
    },
    {
      key: 'tasks',
      label: 'Tasks',
      format: (_: any, row: any) => {
        const jobTasks = tasks.filter(t => t.jobId === row.id);
        const totalTasks = jobTasks.length;
        const completedTasks = jobTasks.filter(t => 
          ['completed', 'qc', 'qc complete'].includes((t.status || '').toLowerCase())
        ).length;

        if (totalTasks === 0) {
          return <span className="text-[10px] text-zinc-400 italic">No Tasks</span>;
        }

        return (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
            completedTasks === totalTasks 
              ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20" 
              : "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"
          )}>
            {completedTasks}/{totalTasks} Tasks
          </span>
        );
      }
    },
    { 
      key: 'customerName', 
      label: 'Customer',
      format: (val: any, row: any) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-zinc-900 dark:text-white font-black text-sm">
            <User className="w-4 h-4 text-zinc-400" />
            {val || 'Walk-in'}
          </div>
          {row.customerId && <span className="text-[10px] text-zinc-500 font-mono pl-5">ID: {row.customerId.substring(0, 8)}</span>}
        </div>
      )
    },
    { 
      key: 'vehicleId', 
      label: 'Vehicle',
      format: (val: any) => {
        const v = vehicles.find(veh => veh.vin === val);
        if (!val) return <span className="text-zinc-400 italic">Unlinked</span>;
        return (
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-black">
              <Car className="w-4 h-4" />
              {v ? `${v.year} ${v.make} ${v.model}` : 'Unknown Vehicle'}
            </div>
            <span className="text-[10px] text-zinc-500 font-mono pl-5">{val}</span>
          </div>
        );
      }
    },
    {
      key: 'location',
      label: 'Location',
      format: (_: any, row: any) => {
        const zone = zones.find(z => 
          (row.vehicleId && z.currentVehicleVin === row.vehicleId) || 
          (row.id && z.currentJobId === row.id) || 
          (row.vehicleId && z.currentVehicleVins?.includes(row.vehicleId))
        );
        if (!zone) return <span className="text-zinc-400 italic">Off-site</span>;
        return (
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
            <MapPin className="w-3.5 h-3.5" />
            {zone.name}
          </div>
        );
      }
    },
    {
      key: 'source',
      label: 'Source',
      format: (val: any) => (
        <span className={cn(
          "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter",
          val === 'QuickBooks' ? "bg-blue-600 text-white" : "bg-zinc-900 text-white dark:bg-white dark:text-black"
        )}>
          {val || 'Native'}
        </span>
      )
    }
  ];

  const customSort = React.useCallback((a: any, b: any) => {
    const aStaff = activeJobStaffMap.get(a.id) || [];
    const bStaff = activeJobStaffMap.get(b.id) || [];
    
    const aHasCurrentUser = aStaff.some(item => item.isCurrentUser);
    const bHasCurrentUser = bStaff.some(item => item.isCurrentUser);

    if (aHasCurrentUser && !bHasCurrentUser) return -1;
    if (!aHasCurrentUser && bHasCurrentUser) return 1;

    const aHasOtherActive = aStaff.length > 0;
    const bHasOtherActive = bStaff.length > 0;

    if (aHasOtherActive && !bHasOtherActive) return -1;
    if (!aHasOtherActive && bHasOtherActive) return 1;

    const getMs = (val: any) => {
      if (!val) return 0;
      if (typeof val === 'number') return val;
      if (typeof val.toDate === 'function') {
        try {
          return val.toDate().getTime();
        } catch (e) {}
      }
      if (typeof val === 'object') {
        if ('seconds' in val) return val.seconds * 1000;
        if ('_seconds' in val) return val._seconds * 1000;
      }
      const ms = Date.parse(val);
      return isNaN(ms) ? 0 : ms;
    };

    const timeA = getMs(a.updatedAt || a.TimeModified || a.createdAt || a.TimeCreated);
    const timeB = getMs(b.updatedAt || b.TimeModified || b.createdAt || b.TimeCreated);

    return timeB - timeA;
  }, [activeJobStaffMap]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-xl">
            <Briefcase className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Job Management</h2>
            <p className="text-xs text-zinc-500">Manage work orders and vehicle associations</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search jobs, customers, VINs..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all w-full md:w-64"
            />
          </div>

          <SearchableSelect
            className="w-full md:w-48"
            options={['all', 'Open', 'Active', 'Almost Ready', 'Blocked', 'On Hold', 'Ready for QC', 'Ready for Customer', 'Completed', 'Closed']}
            value={statusFilter}
            onChange={(val) => {
              const newVal = val || 'all';
              setStatusFilter(newVal);
              navigate(newVal === 'all' ? `/business/${tenantId}/jobs` : `/business/${tenantId}/jobs?status=${encodeURIComponent(newVal)}`, { replace: true });
            }}
            getLabel={s => s === 'all' ? 'All Statuses' : s}
            getValue={s => s}
            theme="indigo"
          />
          
          <button 
            onClick={() => navigate(`/business/${tenantId}/job/create`)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Job
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <GenericDataGrid 
        collectionPath={`businesses/${tenantId}/jobs`}
        title="Jobs"
        columns={jobColumns}
        dbOrderBy={{ field: 'updatedAt', direction: 'desc' }}
        hideSearch={true}
        customSort={customSort}
        localFilter={(job) => {
          const vehicle = job.vehicleId ? vehicles.find(v => v.vin === job.vehicleId) : null;
          const vehicleLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'No Vehicle Assigned';
          const matchesSearch = 
            (job.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (job.customerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (job.vehicleId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            vehicleLabel.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
          return matchesSearch && matchesStatus;
        }}
        onRowClick={(row) => navigate(`/business/${tenantId}/job/${row.id}`)}
      />

      {isAddModalOpen && (
        <AddJobModal 
          tenantId={tenantId} 
          vehicles={vehicles}
          onClose={() => setIsAddModalOpen(false)} 
          onSuccess={() => {
            setIsAddModalOpen(false);
            refetch();
          }} 
        />
      )}


    </div>
  );
}

function AddJobModal({ tenantId, vehicles, onClose, onSuccess }: { tenantId: string, vehicles: Vehicle[], onClose: () => void, onSuccess: () => void }) {
  const [title, setTitle] = useState('');
  const [jobNumber, setJobNumber] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickAddVin, setQuickAddVin] = useState<string | null>(null);
  const [quickAddCustomer, setQuickAddCustomer] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const finalTitle = title.trim() || (jobNumber ? `Job #${jobNumber}` : 'Untitled Job');
      await addDoc(collection(db, `businesses/${tenantId}/jobs`), {
        title: finalTitle,
        jobNumber: jobNumber.trim(),
        customerId: customerId,
        customerName: customerName.trim(),
        vehicleId: vehicleId.trim().toUpperCase() || null,
        status: 'Open',
        source: 'Native',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: useAuthStore.getState().user?.uid || 'system',
        createdByStaffId: useAuthStore.getState().user?.uid || 'system',
        createdByUserId: useAuthStore.getState().user?.uid || 'system',
        createdByStaffName: useAuthStore.getState().user?.displayName || useAuthStore.getState().user?.email?.split('@')[0] || 'Staff',
        createdByName: useAuthStore.getState().user?.displayName || useAuthStore.getState().user?.email?.split('@')[0] || null,
        createdByEmail: useAuthStore.getState().user?.email || null,
        tags: ['Native']
      });
      toast.success('Job created successfully');
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md shadow-xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-500" />
              Create Native Job
            </h3>
            <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><X className="w-5 h-5"/></button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Job #</label>
                <input 
                  type="text" 
                  value={jobNumber} 
                  onChange={e => setJobNumber(e.target.value)} 
                  placeholder="e.g. 10254" 
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono" 
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Job Title</label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  placeholder="e.g. 2024 Ford Raptor Upfit" 
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Customer</label>
              <CustomerSelector 
                tenantId={tenantId}
                customerId={customerId}
                onAssign={(id, name) => { setCustomerId(id); setCustomerName(name); }}
                onClear={() => { setCustomerId(null); setCustomerName(''); }}
                onCreateNewRequest={(name) => setQuickAddCustomer(name || '')}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Vehicle (VIN)</label>
              <VinSelector 
                vin={vehicleId}
                vehicles={vehicles}
                onAssign={(vin) => setVehicleId(vin)}
                onClear={() => setVehicleId('')}
                onQuickAddRequest={(vin) => setQuickAddVin(vin)}
                placeholder="Search or scan vehicle..."
                clearLabel="Unlink Vehicle"
              />
            </div>

            <div className="pt-4">
              <button disabled={isSubmitting} type="submit" className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-2">
                {isSubmitting ? 'Creating...' : 'Create Job'}
              </button>
            </div>
          </form>
          
          {quickAddVin && (
            <QuickAddVehicleModal 
              tenantId={tenantId}
              initialVin={quickAddVin}
              onClose={() => setQuickAddVin(null)}
              onAssign={(vin) => {
                setVehicleId(vin);
                setQuickAddVin(null);
              }}
            />
          )}
        </div>
      </div>

      {quickAddCustomer !== null && (
        <QuickAddCustomerModal 
          tenantId={tenantId}
          initialName={quickAddCustomer}
          onClose={() => setQuickAddCustomer(null)}
          onSuccess={(id, name) => {
            setCustomerId(id);
            setCustomerName(name);
            setQuickAddCustomer(null);
          }}
        />
      )}
    </>
  );
}

