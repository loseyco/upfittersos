import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Search, Car, Clock, Calendar, AlertCircle, ArrowRight, User
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSearchParams } from 'react-router-dom';

interface OfficeDashboardProps {
  tenantId: string;
}

export function OfficeDashboard({ tenantId }: OfficeDashboardProps) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!tenantId) return;
    
    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), snap => {
      setJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), snap => {
      setVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), snap => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubJobs();
      unsubVehicles();
      unsubZones();
    };
  }, [tenantId]);

  const matchesSearch = (job: any, vehicle: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (job.title?.toLowerCase().includes(q)) return true;
    if (job.jobNumber?.toLowerCase().includes(q)) return true;
    if (job.customerName?.toLowerCase().includes(q)) return true;
    if (vehicle?.vin?.toLowerCase().includes(q)) return true;
    if (vehicle?.make?.toLowerCase().includes(q)) return true;
    if (vehicle?.model?.toLowerCase().includes(q)) return true;
    return false;
  };

  const getJobEta = (job: any) => {
    const zone = zones.find(z => z.currentJobId === job.id);
    return zone?.eta || job.expectedFinishTime || job.eta;
  };

  // 1. Incoming Vehicles
  // Jobs that are 'Open' or 'Scheduled' and not yet in 'Active', 'Completed', etc.
  const incomingJobs = jobs.filter(job => 
    ['Open', 'Scheduled'].includes(job.status) &&
    !['Closed', 'Completed', 'Ready for Customer', 'Ready for QA', 'Blocked'].includes(job.status)
  ).filter(job => {
    const vehicle = vehicles.find(v => v.vin === job.vehicleId);
    return matchesSearch(job, vehicle);
  }).sort((a, b) => {
    const timeA = (a.createdAt?.seconds || 0);
    const timeB = (b.createdAt?.seconds || 0);
    return timeB - timeA; // Newest first
  });

  // 2. Vehicles Expected Done Next
  // Jobs that are active/in progress with an ETA, sorted by ETA ascending
  const activeJobs = jobs.filter(job => 
    !['Closed', 'Completed', 'Ready for Customer', 'Ready for QA'].includes(job.status)
  ).map(job => ({
    ...job,
    etaRaw: getJobEta(job)
  })).filter(job => job.etaRaw).filter(job => {
    const vehicle = vehicles.find(v => v.vin === job.vehicleId);
    return matchesSearch(job, vehicle);
  }).sort((a, b) => {
    const timeA = typeof a.etaRaw.toDate === 'function' ? a.etaRaw.toDate().getTime() : new Date(a.etaRaw).getTime();
    const timeB = typeof b.etaRaw.toDate === 'function' ? b.etaRaw.toDate().getTime() : new Date(b.etaRaw).getTime();
    return timeA - timeB; // Earliest first
  });

  const renderJobCard = (job: any, isNextUp = false) => {
    const vehicle = vehicles.find(v => v.vin === job.vehicleId);
    const vehicleDisplay = vehicle 
      ? (`${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || `VIN: ${job.vehicleId}`) 
      : (job.vehicleId ? `VIN: ${job.vehicleId}` : 'Unlinked');
      
    const etaRaw = getJobEta(job);
    let etaLabel = null;
    let etaColor = 'text-zinc-500';
    let isOverdue = false;

    if (etaRaw) {
      const etaDate = typeof etaRaw.toDate === 'function' ? etaRaw.toDate() : new Date(etaRaw);
      const diffMs = etaDate.getTime() - Date.now();
      isOverdue = diffMs < 0;
      const absDiff = Math.abs(diffMs);
      const d = Math.floor(absDiff / 86400000);
      const h = Math.floor((absDiff % 86400000) / 3600000);
      const m = Math.floor((absDiff % 3600000) / 60000);
      
      let timeStr = '';
      if (d > 0) timeStr = `${d}d ${h}h`;
      else if (h > 0) timeStr = `${h}h ${m}m`;
      else timeStr = `${m}m`;

      etaLabel = isOverdue ? `ETA: Overdue ${timeStr}` : `ETA in ${timeStr}`;
      etaColor = isOverdue ? 'text-red-500 bg-red-500/10' : 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400';
    }

    let dueDateLabel = null;
    if (job.expectedFinishTime) {
      const dueDate = typeof job.expectedFinishTime.toDate === 'function' ? job.expectedFinishTime.toDate() : new Date(job.expectedFinishTime);
      dueDateLabel = `Due: ${dueDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    }

    return (
      <div 
        key={job.id} 
        onClick={() => {
          searchParams.set('jobId', job.id);
          setSearchParams(searchParams);
        }}
        className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-indigo-500/50 transition-all cursor-pointer relative overflow-hidden"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2.5 rounded-xl shrink-0",
              isNextUp ? "bg-amber-500/10 text-amber-500" : "bg-indigo-500/10 text-indigo-500"
            )}>
              {isNextUp ? <Clock className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-white text-sm sm:text-base line-clamp-1">
                {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title || 'Untitled Job'}
              </h3>
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mt-0.5">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {job.customerName || 'No Customer'}
                </span>
                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                <span className={cn(
                  "uppercase tracking-wider",
                  job.status === 'Active' ? 'text-emerald-500' : 'text-zinc-500'
                )}>{job.status}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
            {etaLabel && (
              <div className={cn("px-2 py-1 rounded text-[10px] sm:text-xs font-bold uppercase tracking-tighter", etaColor)}>
                {etaLabel}
              </div>
            )}
            {dueDateLabel && (
              <div className="px-2 py-1 rounded text-[10px] sm:text-xs font-bold uppercase tracking-tighter text-zinc-500 bg-zinc-100 dark:bg-zinc-800">
                {dueDateLabel}
              </div>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 truncate">
              {vehicleDisplay}
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mr-1" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-zinc-400 focus-within:text-indigo-500 transition-colors" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter by VIN, Job #, Customer, or Title..."
          className="w-full pl-12 pr-4 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm hover:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400 font-medium"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        
        {/* Expected Incoming Vehicles */}
        <section className="flex flex-col">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
              <Calendar className="w-5 h-5 text-indigo-500" />
              Expected Incoming
            </h2>
            <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
              {incomingJobs.length} Jobs
            </span>
          </div>
          
          <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-inner">
            {incomingJobs.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-zinc-500 italic text-center">
                <Car className="w-8 h-8 mb-3 opacity-20" />
                <p>No incoming vehicles expected.</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {incomingJobs.map(job => renderJobCard(job, false))}
              </div>
            )}
          </div>
        </section>

        {/* Vehicles Done Next */}
        <section className="flex flex-col">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
              <Clock className="w-5 h-5 text-amber-500" />
              Finishing Soon
            </h2>
            <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
              {activeJobs.length} Jobs
            </span>
          </div>
          
          <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-inner">
            {activeJobs.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-zinc-500 italic text-center">
                <AlertCircle className="w-8 h-8 mb-3 opacity-20" />
                <p>No active jobs with ETAs set.</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {activeJobs.map(job => renderJobCard(job, true))}
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
