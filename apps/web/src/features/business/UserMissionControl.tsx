import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc, collectionGroup } from 'firebase/firestore';
import { Clock, Briefcase, ArrowRight, Package, AlertTriangle, Wrench, CarFront, Timer, Search, Command, Maximize, Minimize, MapPin } from 'lucide-react';
import { ZoneDetailsModal } from './ZoneModals';
import { PackageIntakeModal } from './PackageIntakeModal';
import { FeedbackModal } from '../../components/FeedbackModal';
import { PartFormModal } from './PartFormModal';
import { VehicleIntakeModal } from './VehicleIntakeModal';
import { toast, Toaster } from 'sonner';
import { useWakeLock } from '../../hooks/useWakeLock';
import { cn } from '../../lib/utils';
import { useJobClock } from '../timeclock/useJobClock';
import { useTimeclockStore } from '../../lib/store/timeclockStore';
import { useSearchStore } from '../../lib/store/searchStore';
import { DeviceSettings } from '../../components/DeviceSettings';

export function UserMissionControl({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const { user, impersonatedStaff } = useAuthStore();
  const effectiveUserId = impersonatedStaff?.id || user?.uid;
  const { activeSessionId } = useTimeclockStore();
  const { open: openSearch } = useSearchStore();
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
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  
  const [allActiveJobs, setAllActiveJobs] = useState<any[]>([]);
  const [allZones, setAllZones] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [sessionJobIds, setSessionJobIds] = useState<string[]>([]);
  
  // const [selectedJob, setSelectedJob] = useState<any>(null);
  const [selectedZone, setSelectedZone] = useState<any>(null);
  const [taskJobIds, setTaskJobIds] = useState<string[]>([]);

  // Track jobs where the user is assigned to specific tasks
  useEffect(() => {
    if (!effectiveUserId || !tenantId) return;
    const q = query(
      collectionGroup(db, 'tasks'),
      where('tenantId', '==', tenantId),
      where('assignedStaffIds', 'array-contains', effectiveUserId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const ids = snap.docs
        .filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`))
        .map(doc => doc.ref.path.split('/')[3]);
      setTaskJobIds([...new Set(ids)]);
    }, (err) => {
      console.error("Task assignment listener error:", err);
    });
    return () => unsub();
  }, [effectiveUserId, tenantId]);

  // Modal States
  const [isIntakeOpen, setIsIntakeOpen] = useState(false);
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [isPartRequestOpen, setIsPartRequestOpen] = useState(false);
  const [isVehicleIntakeOpen, setIsVehicleIntakeOpen] = useState(false);

  const { clockOutOfJob, isProcessing } = useJobClock(tenantId);

  const handleAssignVehicle = async (zoneId: string, vin: string, actionType: 'assign' | 'clear' | 'remove' | 'remove_job' = 'assign', jobId?: string) => {
    try {
      const trimmedVin = vin?.trim().toUpperCase();
      const zone = allZones.find(z => z.id === zoneId);
      const previousVin = zone?.currentVehicleVin || null;
      const previousJobId = zone?.currentJobId || null;

      // AUTO-MOVE: If this VIN or Job is already in another zone, clear it from there first
      if (actionType === 'assign' && (trimmedVin || jobId)) {
        const otherZones = allZones.filter(z => z.id !== zoneId);
        for (const oz of otherZones) {
          let needsClear = false;
          if (trimmedVin && oz.currentVehicleVin === trimmedVin) needsClear = true;
          else if (jobId && oz.currentJobId === jobId) needsClear = true;
          else if (trimmedVin && oz.currentVehicleVins?.includes(trimmedVin)) needsClear = true;
          
          if (needsClear) {
            await updateDoc(doc(db, `businesses/${tenantId}/zones`, oz.id), { 
              currentVehicleVin: null, 
              currentJobId: null,
              currentVehicleVins: (oz.currentVehicleVins || []).filter((v: string) => v !== trimmedVin)
            });
          }
        }
      }

      if (zone?.allowMultiple) {
        let newVins = [...(zone.currentVehicleVins || [])];
        if (actionType === 'assign' && trimmedVin) {
          if (!newVins.includes(trimmedVin)) newVins.push(trimmedVin);
        } else if (actionType === 'remove' && trimmedVin) {
          newVins = newVins.filter(v => v !== trimmedVin);
        } else if (actionType === 'clear') {
          newVins = [];
        }
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), { 
          currentVehicleVins: newVins,
          lastAssignedAt: new Date() 
        });
      } else {
        await updateDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), {
          currentVehicleVin: actionType === 'clear' ? null : trimmedVin || previousVin,
          currentJobId: actionType === 'clear' || actionType === 'remove_job' ? null : jobId || previousJobId,
          lastAssignedAt: new Date()
        });
      }
      toast.success(actionType === 'clear' ? 'Zone cleared' : 'Update successful');
    } catch (e) {
      console.error(e);
      toast.error('Failed to update zone');
    }
  };

  useEffect(() => {
    if (!tenantId || !effectiveUserId) return;

    // Fetch All Jobs to allow deriving both direct and zone-based assignments
    // Sorted by lastWorkedAt to show most recently worked on at the top
    const jobsQ = query(
      collection(db, `businesses/${tenantId}/jobs`)
    );
    const unsubJobs = onSnapshot(jobsQ, (snap) => {
      const active = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((j: any) => !['Ready for Customer', 'Completed', 'Closed'].includes(j.status))
        .sort((a: any, b: any) => {
          const getTs = (item: any) => item.lastWorkedAt?.seconds ? item.lastWorkedAt.seconds * 1000 : new Date(item.lastWorkedAt || 0).getTime();
          return getTs(b) - getTs(a);
        });
      setAllActiveJobs(active);
      setLastUpdated(new Date());
    }, (err) => {
      // Fallback if index isn't created yet or other error
      console.error("Jobs query error (likely missing index):", err);
      const fallbackQ = query(collection(db, `businesses/${tenantId}/jobs`));
      onSnapshot(fallbackQ, (snap) => {
        const active = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((j: any) => !['Ready for Customer', 'Completed', 'Closed'].includes(j.status))
          .sort((a: any, b: any) => {
            const getTs = (item: any) => item.lastWorkedAt?.seconds ? item.lastWorkedAt.seconds * 1000 : new Date(item.lastWorkedAt || 0).getTime();
            return getTs(b) - getTs(a);
          });
        setAllActiveJobs(active);
      });
    });

    // Fetch ALL Zones (Bays) so we can see where any job is
    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      setAllZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Zones listener error:", err));

    // Fetch vehicles for display context
    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), (snap) => {
      setVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Vehicles listener error:", err));

    return () => {
      unsubJobs();
      unsubZones();
      unsubVehicles();
    };
  }, [tenantId, effectiveUserId]);

  useEffect(() => {
    if (!tenantId || !activeSessionId) {
      setActiveJobId(null);
      return;
    }
    const unsub = onSnapshot(doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const jobs = data.jobs || [];
        const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
        
        // Track all jobs worked in this session for "Recent" visibility
        const uniqueJobIds = Array.from(new Set(jobs.map((j: any) => j.id))) as string[];
        setSessionJobIds(uniqueJobIds);

        if (lastJob && !lastJob.end) {
          setActiveJobId(lastJob.id);
        } else {
          setActiveJobId(null);
        }
      } else {
        setActiveJobId(null);
      }
    });
    return () => unsub();
  }, [tenantId, activeSessionId]);

  const myZones = allZones.filter(z => z.assignedStaffIds?.includes(effectiveUserId));

  // Derive my jobs: explicitly assigned OR implicitly assigned via my zones OR clocked in OR recently worked
  const myJobs = allActiveJobs.filter(job => {
    const explicitlyAssigned = job.assignedStaffIds?.includes(effectiveUserId);
    const implicitlyAssigned = myZones.some(z => z.currentJobId === job.id);
    const isClockedIn = job.id === activeJobId;
    const workedRecently = sessionJobIds.includes(job.id);
    const taskAssigned = taskJobIds.includes(job.id);
    
    return explicitlyAssigned || implicitlyAssigned || isClockedIn || workedRecently || taskAssigned;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'Blocked': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      case 'On Hold': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      default: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    }
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "max-w-7xl mx-auto animate-in fade-in duration-500",
        isFullscreen ? "p-2 space-y-2 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar" : "space-y-4 md:space-y-8"
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
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live Mission Control</span>
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
      {/* Compact Ultimate Search Bar */}
      <div className="relative group max-w-4xl">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
        </div>
        <input
          type="text"
          placeholder="Quick search customers, vehicles, bays, or staff..."
          onFocus={() => openSearch()}
          onChange={(e) => openSearch(e.target.value)}
          className={cn(
            "w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl md:rounded-2xl pl-12 pr-24 shadow-sm hover:border-indigo-500/50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400 text-sm md:text-base font-medium",
            isFullscreen ? "py-2" : "py-3 md:py-4"
          )}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <Command className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] font-black text-zinc-500">F</span>
          </div>
        </div>
      </div>
 
      {/* Quick Actions Row */}
      <div className={cn(
        "grid grid-cols-4 gap-2 md:gap-4 max-w-4xl",
        isFullscreen ? "mb-2" : "mb-4 md:mb-8"
      )}>
        <button 
          onClick={() => setIsIntakeOpen(true)}
          className="flex flex-col items-center justify-center gap-1.5 md:gap-3 p-2 md:p-4 bg-white dark:bg-zinc-900 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-500/30 rounded-2xl md:rounded-3xl transition-all group shadow-sm"
        >
          <div className="p-2 md:p-3 bg-indigo-500/10 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform">
            <Package className="w-4 h-4 md:w-6 md:h-6 text-indigo-500" />
          </div>
          <span className="font-bold text-[10px] md:text-sm text-zinc-900 dark:text-white text-center leading-tight">Receive<br className="md:hidden" /> Package</span>
        </button>

        <button 
          onClick={() => setIsIssueOpen(true)}
          className="flex flex-col items-center justify-center gap-1.5 md:gap-3 p-2 md:p-4 bg-white dark:bg-zinc-900 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-rose-200 dark:hover:border-rose-500/30 rounded-2xl md:rounded-3xl transition-all group shadow-sm"
        >
          <div className="p-2 md:p-3 bg-rose-500/10 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform">
            <AlertTriangle className="w-4 h-4 md:w-6 md:h-6 text-rose-500" />
          </div>
          <span className="font-bold text-[10px] md:text-sm text-zinc-900 dark:text-white text-center leading-tight">Log<br className="md:hidden" /> Issue</span>
        </button>

        <button 
          onClick={() => setIsPartRequestOpen(true)}
          className="flex flex-col items-center justify-center gap-1.5 md:gap-3 p-2 md:p-4 bg-white dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-amber-200 dark:hover:border-amber-500/30 rounded-2xl md:rounded-3xl transition-all group shadow-sm"
        >
          <div className="p-2 md:p-3 bg-amber-500/10 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform">
            <Wrench className="w-4 h-4 md:w-6 md:h-6 text-amber-500" />
          </div>
          <span className="font-bold text-[10px] md:text-sm text-zinc-900 dark:text-white text-center leading-tight">Request<br className="md:hidden" /> Part</span>
        </button>

        <button 
          onClick={() => setIsVehicleIntakeOpen(true)}
          className="flex flex-col items-center justify-center gap-1.5 md:gap-3 p-2 md:p-4 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-200 dark:hover:border-emerald-500/30 rounded-2xl md:rounded-3xl transition-all group shadow-sm"
        >
          <div className="p-2 md:p-3 bg-emerald-500/10 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform">
            <CarFront className="w-4 h-4 md:w-6 md:h-6 text-emerald-500" />
          </div>
          <span className="font-bold text-[10px] md:text-sm text-zinc-900 dark:text-white text-center leading-tight">Vehicle<br className="md:hidden" /> Intake</span>
        </button>
      </div>

      <div className="max-w-4xl">
        {/* My Jobs */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 md:mb-6">
            <div className="p-2 md:p-2.5 bg-indigo-500/10 rounded-xl">
              <Briefcase className="w-5 h-5 md:w-6 md:h-6 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">My Active Jobs</h2>
              <p className="text-xs text-zinc-500 font-medium">Jobs currently assigned to you or your shop area</p>
            </div>
          </div>

          <div className="space-y-3">
            {myJobs.length === 0 ? (
              <div className="p-12 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800/50">
                <Briefcase className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-bold text-zinc-500">You have no active job assignments.</p>
              </div>
            ) : (
              myJobs.map(job => (
                <div 
                  key={job.id}
                  onClick={() => {
                    const zone = allZones.find(z => z.currentJobId === job.id);
                    const vehicle = vehicles.find(v => v.vin === zone?.currentVehicleVin);
                    const jobId = job.id || zone?.currentJobId || vehicle?.jobId;
                    if (jobId) {
                      navigate(`/business/${tenantId}/job/${jobId}`);
                    }
                  }}
                  className="w-full cursor-pointer text-left bg-zinc-50 dark:bg-zinc-950 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-500/30 rounded-2xl p-4 transition-all group flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">{job.jobNumber ? `#${job.jobNumber}` : 'JOB'}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                      {activeJobId === job.id && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse">
                          Clocked In
                        </span>
                      )}
                      {(!job.assignedStaffIds?.includes(effectiveUserId) && !allZones.some(z => z.currentJobId === job.id) && sessionJobIds.includes(job.id) && activeJobId !== job.id) && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
                          Recent Activity
                        </span>
                      )}
                    </div>
                    <h3 className="font-black text-zinc-900 dark:text-white text-lg leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{job.title}</h3>
                    {job.customerName && (
                      <p className="text-sm font-bold text-zinc-500 mt-1">{job.customerName}</p>
                    )}
                    {job.scheduledArrivalTime && (
                      <p className="text-[10px] font-bold text-indigo-500 mt-1.5 flex items-center gap-1 uppercase tracking-widest">
                        <Clock className="w-3 h-3" />
                        ETA: {(() => {
                          const date = typeof job.scheduledArrivalTime?.toDate === 'function' 
                            ? job.scheduledArrivalTime.toDate() 
                            : new Date(job.scheduledArrivalTime);
                          return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                        })()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-end gap-1.5">
                      {activeJobId === job.id && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); clockOutOfJob(); }}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                        >
                          <Timer className="w-3.5 h-3.5" />
                          Clock Out
                        </button>
                      )}
                      
                      {(() => {
                        const zone = allZones.find(z => z.currentJobId === job.id);
                        const vehicle = (job.vehicleId && job.vehicleId !== 'N/A') 
                          ? vehicles.find(v => v.id === job.vehicleId || v.vin === job.vehicleId)
                          : null;
                        
                        const locationLabel = zone?.name || job.location || job.department || (vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : null);
                        
                        if (!locationLabel) return null;
                        
                        return (
                          <span className="text-[9px] font-black uppercase tracking-tighter text-zinc-400 flex items-center gap-1">
                            {zone ? <MapPin className="w-2.5 h-2.5" /> : (vehicle ? <CarFront className="w-2.5 h-2.5" /> : <Briefcase className="w-2.5 h-2.5" />)}
                            {locationLabel}
                          </span>
                        );
                      })()}
                    </div>
                    <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-700 group-hover:text-indigo-500 transition-colors" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Device Settings */}
        <div className="mt-8">
          <DeviceSettings tenantId={tenantId} />
        </div>
      </div>

      {/* Modals */}
      <PackageIntakeModal 
        isOpen={isIntakeOpen}
        onClose={() => setIsIntakeOpen(false)}
        onSuccess={() => {}}
        zones={allZones}
      />

      <FeedbackModal 
        isOpen={isIssueOpen}
        onClose={() => setIsIssueOpen(false)}
      />

      {isPartRequestOpen && (
        <PartFormModal 
          tenantId={tenantId}
          user={user}
          onClose={() => setIsPartRequestOpen(false)}
          onSuccess={() => {}}
        />
      )}

      <VehicleIntakeModal 
        isOpen={isVehicleIntakeOpen}
        onClose={() => setIsVehicleIntakeOpen(false)}
        tenantId={tenantId}
      />



      {selectedZone && (
        <ZoneDetailsModal
          zone={selectedZone}
          tenantId={tenantId}
          vehicles={vehicles}
          jobs={allActiveJobs}
          onClose={() => setSelectedZone(null)}
          onAssign={(vin: string, jobId?: string) => handleAssignVehicle(selectedZone.id, vin, 'assign', jobId)}
          onClear={() => handleAssignVehicle(selectedZone.id, '', 'clear')}
          onRemoveVehicle={(vin: string) => handleAssignVehicle(selectedZone.id, vin, 'remove')}
          onRemoveJob={() => handleAssignVehicle(selectedZone.id, '', 'remove_job')}
          onQuickAddRequest={() => {}}
          onQuickAddJobRequest={() => {}}
          onOpenVehicle={() => {}}
          onDelete={() => {}}
        />
      )}
    </div>
  );
}
