import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Hammer, Package, Clock, Filter, AlertCircle, Car, Warehouse, ListChecks, User, Palette, Wrench,
  Maximize, Minimize
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { cn } from '../../lib/utils';
import { toast, Toaster } from 'sonner';
import { useWakeLock } from '../../hooks/useWakeLock';

interface DepartmentDashboardProps {
  tenantId: string;
  departmentName: string;
  tagFilter: string;
}

export function DepartmentDashboard({ tenantId, departmentName, tagFilter }: DepartmentDashboardProps) {
  const navigate = useNavigate();
  const [] = useSearchParams();
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
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    
    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), snap => {
      setVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Vehicles listener error:", err));

    const unsubJobs = onSnapshot(collection(db, `businesses/${tenantId}/jobs`), snap => {
      setAllJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Jobs listener error:", err));

    const unsubParts = onSnapshot(collection(db, `businesses/${tenantId}/parts_requests`), snap => {
      setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Parts listener error:", err));

    return () => {
      unsubVehicles();
      unsubJobs();
      unsubParts();
    };
  }, [tenantId]);

  const calculateDuration = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 0) return 'Just now';
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  // Filter jobs by department tag or if the department name is in the title/status (fallback)
  const departmentJobs = allJobs.filter(j => 
    j.tags?.some((t: string) => t.toLowerCase() === tagFilter.toLowerCase()) ||
    j.title?.toLowerCase().includes(tagFilter.toLowerCase()) ||
    j.notes?.toLowerCase().includes(tagFilter.toLowerCase())
  ).filter(j => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return j.title?.toLowerCase().includes(q) || j.jobNumber?.toLowerCase().includes(q) || j.customerName?.toLowerCase().includes(q);
  });

  const activeJobs = departmentJobs.filter(j => !['Closed', 'Completed', 'Cancelled'].includes(j.status));
  const blockedJobs = activeJobs.filter(j => j.status === 'Blocked' || (j.blockers || []).some((b: any) => b.status === 'active'));
  
  const pendingParts = partsRequests.filter(pr => 
    activeJobs.some(j => j.id === pr.jobId) && 
    (pr.status === 'pending' || pr.status === 'ordered')
  );

  return (
    <div 
      ref={containerRef}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-4 duration-500",
        isFullscreen ? "p-2 space-y-2 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar" : "space-y-8"
      )}
    >
      <Toaster position="top-right" richColors theme="system" closeButton />
      <div className={cn(
        "flex flex-col sm:flex-row items-center justify-end gap-3 w-full relative z-10",
        !isFullscreen && "sm:-mt-20"
      )}>
        {isFullscreen && (
          <div className="mr-auto flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live {departmentName} Dashboard</span>
            <span className="text-[10px] font-bold text-zinc-500">• Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        )}
        <button 
          onClick={toggleFullscreen}
          className="hidden sm:flex w-full sm:w-auto px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-lg transition-all items-center justify-center gap-2"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
        </button>
      </div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
            {departmentName.includes('Fabrication') ? (
              <Hammer className="w-6 h-6 text-indigo-500" />
            ) : departmentName.includes('Graphics') ? (
              <Palette className="w-6 h-6 text-indigo-500" />
            ) : departmentName.includes('F.A.S.T') ? (
              <Wrench className="w-6 h-6 text-indigo-500" />
            ) : (
              <Warehouse className="w-6 h-6 text-indigo-500" />
            )}
            {departmentName} Control Board
          </h1>
          <p className="text-sm text-zinc-500">Managing active units and production flow for {departmentName}.</p>
        </div>
        
        <div className="relative w-full md:w-96">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input 
            type="text"
            placeholder="Search active jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-zinc-900 dark:text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              {departmentName.includes('Fabrication') ? (
                <Hammer className="w-4 h-4 text-indigo-500" />
              ) : departmentName.includes('Graphics') ? (
                <Palette className="w-4 h-4 text-indigo-500" />
              ) : departmentName.includes('F.A.S.T') ? (
                <Wrench className="w-4 h-4 text-indigo-500" />
              ) : (
                <Warehouse className="w-4 h-4 text-indigo-500" />
              )}
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Active Units</p>
          </div>
          <p className="text-3xl font-black text-zinc-900 dark:text-white">{activeJobs.length}</p>
        </div>
        
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-500/10 rounded-lg"><AlertCircle className="w-4 h-4 text-red-500" /></div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Blockers</p>
          </div>
          <p className="text-3xl font-black text-zinc-900 dark:text-white">{blockedJobs.length}</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500/10 rounded-lg"><Package className="w-4 h-4 text-amber-500" /></div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Parts Needed</p>
          </div>
          <p className="text-3xl font-black text-zinc-900 dark:text-white">{pendingParts.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-indigo-500" />
            Active Production Queue
          </h2>
          <div className="grid gap-4">
            {activeJobs.length === 0 ? (
              <div className="p-12 text-center bg-zinc-50 dark:bg-zinc-950 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
                <p className="text-zinc-500 italic">No active jobs found for {departmentName}.</p>
              </div>
            ) : (
              activeJobs.map(job => {
                const vehicle = vehicles.find(v => v.vin === job.vehicleId);
                const vehicleDisplay = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : job.vehicleId;
                const isBlocked = job.status === 'Blocked' || (job.blockers || []).some((b: any) => b.status === 'active');
                
                return (
                  <div 
                    key={job.id}
                    onClick={() => {
                      navigate(`/business/${tenantId}/job/${job.id}`);
                    }}
                    className={cn(
                      "p-5 bg-white dark:bg-zinc-900 border rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer group",
                      isBlocked ? "border-red-200 dark:border-red-900/30" : "border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50"
                    )}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-zinc-900 dark:text-white group-hover:text-indigo-500 transition-colors">
                          {job.jobNumber ? `#${job.jobNumber} ` : ''}{job.title}
                        </h3>
                        <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-1">
                          <User className="w-3 h-3" />
                          {job.customerName || 'No Customer'}
                        </p>
                      </div>
                      <span className={cn(
                        "px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest",
                        isBlocked ? "bg-red-500 text-white" : "bg-indigo-500/10 text-indigo-600"
                      )}>
                        {job.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        <Car className="w-3.5 h-3.5" />
                        {vehicleDisplay}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400">
                        <Clock className="w-3 h-3" />
                        {calculateDuration(job.updatedAt)} ago
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-500" />
            Parts & Blockers
          </h2>
          <div className="space-y-4">
            {blockedJobs.map(job => (
              <div 
                key={job.id} 
                onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}
                className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl cursor-pointer hover:border-red-500/50 transition-colors"
              >
                <p className="text-xs font-black text-red-600 uppercase tracking-widest mb-1">Production Blocked</p>
                <h4 className="font-bold text-sm text-zinc-900 dark:text-white mb-2">{job.title}</h4>
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-red-100 dark:border-red-900/20 text-xs text-red-600 font-medium">
                  {job.blocker || job.blockers?.find((b: any) => b.status === 'active')?.message || 'Job marked as blocked.'}
                </div>
              </div>
            ))}

            {pendingParts.map(part => (
              <div 
                key={part.id} 
                onClick={() => {
                  if (part.jobId) {
                    navigate(`/business/${tenantId}/job/${part.jobId}`);
                  }
                }}
                className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-2xl cursor-pointer hover:border-amber-500/50 transition-colors"
              >
                <p className="text-xs font-black text-amber-600 uppercase tracking-widest mb-1">Part Awaiting • Qty: {part.quantity || 1}</p>
                <h4 className="font-bold text-sm text-zinc-900 dark:text-white mb-1">{part.partName}</h4>
                <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase">
                  <span>Job: {allJobs.find(j => j.id === part.jobId)?.title}</span>
                  <span className="text-amber-600">{part.status}</span>
                </div>
              </div>
            ))}

            {blockedJobs.length === 0 && pendingParts.length === 0 && (
              <div className="p-12 text-center bg-emerald-50 dark:bg-emerald-950/20 rounded-3xl border border-dashed border-emerald-200 dark:border-emerald-800/30">
                <p className="text-emerald-600 dark:text-emerald-400 italic">No pending parts or blockers!</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
