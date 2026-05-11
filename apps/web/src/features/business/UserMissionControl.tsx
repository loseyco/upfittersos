import { useState, useEffect } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { db } from '../../lib/firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Clock, Briefcase, Warehouse, ArrowRight, Package, AlertTriangle, Wrench, CarFront, Timer } from 'lucide-react';
import { TimeClockHistory } from '../timeclock/TimeClockHistory';
import { JobDetailsModal } from './JobDetailsModal';
import { ZoneDetailsModal } from './ZoneModals';
import { toast } from 'sonner';
import { useJobClock } from '../timeclock/useJobClock';
import { useTimeclockStore } from '../../lib/store/timeclockStore';

export function UserMissionControl({ tenantId }: { tenantId: string }) {
  const { user } = useAuthStore();
  const { activeSessionId } = useTimeclockStore();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  
  const [allActiveJobs, setAllActiveJobs] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [selectedZone, setSelectedZone] = useState<any>(null);

  const { clockIntoJob, clockOutOfJob, isProcessing } = useJobClock(tenantId);

  const handleAssignVehicle = async (zoneId: string, vin: string, actionType: 'assign' | 'clear' | 'remove' | 'remove_job' = 'assign', jobId?: string) => {
    try {
      const trimmedVin = vin?.trim().toUpperCase();
      const zone = zones.find(z => z.id === zoneId);
      const previousVin = zone?.currentVehicleVin || null;
      const previousJobId = zone?.currentJobId || null;

      // AUTO-MOVE: If this VIN or Job is already in another zone, clear it from there first
      if (actionType === 'assign' && (trimmedVin || jobId)) {
        const otherZones = zones.filter(z => z.id !== zoneId);
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
    if (!tenantId || !user?.uid) return;

    // Fetch All Jobs to allow deriving both direct and zone-based assignments
    const jobsQ = query(collection(db, `businesses/${tenantId}/jobs`));
    const unsubJobs = onSnapshot(jobsQ, (snap) => {
      const active = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((j: any) => !['Completed', 'Closed'].includes(j.status));
      setAllActiveJobs(active);
    });

    // Fetch My Zones
    const zonesQ = query(
      collection(db, `businesses/${tenantId}/zones`),
      where('assignedStaffIds', 'array-contains', user.uid)
    );
    const unsubZones = onSnapshot(zonesQ, (snap) => {
      setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch vehicles for display context
    const unsubVehicles = onSnapshot(collection(db, `businesses/${tenantId}/vehicles`), (snap) => {
      setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubJobs();
      unsubZones();
      unsubVehicles();
    };
  }, [tenantId, user?.uid]);

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

  // Derive my jobs: explicitly assigned OR implicitly assigned via my zones
  const myJobs = allActiveJobs.filter(job => {
    const explicitlyAssigned = job.assignedStaffIds?.includes(user?.uid);
    const implicitlyAssigned = zones.some(z => z.currentJobId === job.id);
    return explicitlyAssigned || implicitlyAssigned;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'Blocked': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      case 'On Hold': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      default: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    }
  };

  const handleQuickAction = (action: string) => {
    toast.info(`${action} workflow coming soon.`);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">My Dashboard</h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium mt-1">Welcome back, {user?.displayName || 'Staff'}. Here's your active workflow.</p>
        </div>
      </div>

      {/* Quick Actions Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <button 
          onClick={() => handleQuickAction('Receive Package')}
          className="flex flex-col items-center justify-center gap-3 p-4 bg-white dark:bg-zinc-900 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-500/30 rounded-3xl transition-all group shadow-sm"
        >
          <div className="p-3 bg-indigo-500/10 rounded-2xl group-hover:scale-110 transition-transform">
            <Package className="w-6 h-6 text-indigo-500" />
          </div>
          <span className="font-bold text-sm text-zinc-900 dark:text-white">Receive Package</span>
        </button>

        <button 
          onClick={() => handleQuickAction('Log Issue')}
          className="flex flex-col items-center justify-center gap-3 p-4 bg-white dark:bg-zinc-900 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-rose-200 dark:hover:border-rose-500/30 rounded-3xl transition-all group shadow-sm"
        >
          <div className="p-3 bg-rose-500/10 rounded-2xl group-hover:scale-110 transition-transform">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
          </div>
          <span className="font-bold text-sm text-zinc-900 dark:text-white">Log Issue</span>
        </button>

        <button 
          onClick={() => handleQuickAction('Request Part')}
          className="flex flex-col items-center justify-center gap-3 p-4 bg-white dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-amber-200 dark:hover:border-amber-500/30 rounded-3xl transition-all group shadow-sm"
        >
          <div className="p-3 bg-amber-500/10 rounded-2xl group-hover:scale-110 transition-transform">
            <Wrench className="w-6 h-6 text-amber-500" />
          </div>
          <span className="font-bold text-sm text-zinc-900 dark:text-white">Request Part</span>
        </button>

        <button 
          onClick={() => handleQuickAction('Vehicle Intake')}
          className="flex flex-col items-center justify-center gap-3 p-4 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-200 dark:hover:border-emerald-500/30 rounded-3xl transition-all group shadow-sm"
        >
          <div className="p-3 bg-emerald-500/10 rounded-2xl group-hover:scale-110 transition-transform">
            <CarFront className="w-6 h-6 text-emerald-500" />
          </div>
          <span className="font-bold text-sm text-zinc-900 dark:text-white">Vehicle Intake</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Active Assignments */}
        <div className="space-y-8">
          
          {/* My Jobs */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                <Briefcase className="w-6 h-6 text-indigo-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">My Active Jobs</h2>
                <p className="text-xs text-zinc-500 font-medium">Jobs currently assigned to you</p>
              </div>
            </div>

            <div className="space-y-3">
              {myJobs.length === 0 ? (
                <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-zinc-100 dark:border-zinc-800/50">
                  <p className="text-sm font-bold text-zinc-500">You have no active job assignments.</p>
                </div>
              ) : (
                myJobs.map(job => (
                  <div 
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className="w-full cursor-pointer text-left bg-zinc-50 dark:bg-zinc-950 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-500/30 rounded-2xl p-4 transition-all group flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">{job.jobNumber ? `#${job.jobNumber}` : 'JOB'}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                      <h3 className="font-bold text-zinc-900 dark:text-white text-base leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{job.title}</h3>
                      {job.customerName && (
                        <p className="text-xs font-medium text-zinc-500 mt-1">{job.customerName}</p>
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
                      {activeJobId === job.id ? (
                        <button 
                          onClick={(e) => { e.stopPropagation(); clockOutOfJob(); }}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                        >
                          <Timer className="w-3.5 h-3.5" />
                          Clock Out
                        </button>
                      ) : (
                        <button 
                          onClick={(e) => { e.stopPropagation(); clockIntoJob(job.id, job.title); }}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                        >
                          <Timer className="w-3.5 h-3.5" />
                          Clock In
                        </button>
                      )}
                      <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-700 group-hover:text-indigo-500 transition-colors" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* My Bays */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-emerald-500/10 rounded-xl">
                <Warehouse className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">My Shop Areas</h2>
                <p className="text-xs text-zinc-500 font-medium">Bays or zones directly assigned to you</p>
              </div>
            </div>

            <div className="space-y-3">
              {zones.length === 0 ? (
                <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-zinc-100 dark:border-zinc-800/50">
                  <p className="text-sm font-bold text-zinc-500">You are not assigned to any specific shop areas.</p>
                </div>
              ) : (
                zones.map(zone => (
                  <button 
                    key={zone.id}
                    onClick={() => setSelectedZone(zone)}
                    className="w-full text-left bg-zinc-50 dark:bg-zinc-950 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-200 dark:hover:border-emerald-500/30 rounded-2xl p-4 transition-all group flex items-center justify-between"
                  >
                    <div>
                      <h3 className="font-bold text-zinc-900 dark:text-white text-base group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{zone.name}</h3>
                      <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mt-1">{zone.type}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-700 group-hover:text-emerald-500 transition-colors" />
                  </button>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Timeclock */}
        <div className="space-y-8">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col h-full min-h-[500px]">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-blue-500/10 rounded-xl">
                <Clock className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Timeclock</h2>
                <p className="text-xs text-zinc-500 font-medium">Your live shift and recent activity</p>
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col relative rounded-2xl border border-zinc-100 dark:border-zinc-800/50">
              <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-1">
                <TimeClockHistory tenantId={tenantId} />
              </div>
            </div>
          </div>
        </div>

      </div>

      {selectedJob && (
        <JobDetailsModal
          tenantId={tenantId}
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onUpdate={() => {}}
        />
      )}

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
