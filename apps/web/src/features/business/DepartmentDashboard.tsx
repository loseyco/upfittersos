import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Hammer, Clock, Filter, Car, Warehouse, User, Palette, Wrench,
  Maximize, Minimize, MapPin
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
  const [zones, setZones] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [jobsTasks, setJobsTasks] = useState<Record<string, any[]>>({});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<'all' | 'bay' | 'parking' | 'unassigned'>('all');

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

    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), snap => {
      setZones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Zones listener error:", err));

    const unsubDepts = onSnapshot(collection(db, `businesses/${tenantId}/departments`), snap => {
      setDepartments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLastUpdated(new Date());
    }, (err) => console.error("Departments listener error:", err));

    return () => {
      unsubVehicles();
      unsubJobs();
      unsubZones();
      unsubDepts();
    };
  }, [tenantId]);

  const activeAllJobs = allJobs.filter(j => !['Closed', 'Completed', 'Cancelled'].includes(j.status));

  // Subscribe to tasks for each active job shop-wide
  const activeJobIdsStr = activeAllJobs
    .map(j => j.id)
    .filter(Boolean)
    .sort()
    .join(',');

  useEffect(() => {
    if (!tenantId) return;
    const activeJobIds = activeJobIdsStr ? activeJobIdsStr.split(',') : [];
    if (activeJobIds.length === 0) {
      setJobsTasks({});
      return;
    }

    const unsubscribers: (() => void)[] = [];

    activeJobIds.forEach(jobId => {
      const q = collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`);
      const unsub = onSnapshot(q, (snap) => {
        const tasksList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setJobsTasks(prev => ({
          ...prev,
          [jobId]: tasksList
        }));
      }, (err) => {
        console.error(`Could not subscribe to tasks for job ${jobId}:`, err);
      });
      unsubscribers.push(unsub);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [tenantId, activeJobIdsStr]);

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

  const formatEstCompletion = (date: Date) => {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    
    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    
    if (isToday) {
      return `Today at ${timeStr}`;
    } else if (isTomorrow) {
      return `Tomorrow at ${timeStr}`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${timeStr}`;
    }
  };

  // Find the Graphics department in the fetched departments list
  const graphicsDept = departments.find(d => d.name?.toLowerCase() === 'graphics' || d.name?.toLowerCase().includes('graphics'));
  const graphicsDeptId = graphicsDept?.id;

  // Filter active jobs that have at least one task assigned to the Graphics department
  const jobsWithGraphicsTasks = activeAllJobs.map(job => {
    const jobTasks = jobsTasks[job.id] || [];
    const graphicsTasks = jobTasks.filter((t: any) => {
      if (graphicsDeptId) {
        return t.departmentId === graphicsDeptId;
      }
      // Fallback check: task departmentId, title, or description matches tagFilter case-insensitively
      const filterLower = tagFilter.toLowerCase();
      return t.departmentId === tagFilter || 
             t.title?.toLowerCase().includes(filterLower) || 
             t.description?.toLowerCase().includes(filterLower);
    });

    const upstreamTasks = jobTasks.filter((t: any) => {
      if (graphicsDeptId) {
        return t.departmentId !== graphicsDeptId;
      }
      // Fallback check: task departmentId, title, or description does not match tagFilter
      const filterLower = tagFilter.toLowerCase();
      return t.departmentId !== tagFilter && 
             !t.title?.toLowerCase().includes(filterLower) && 
             !t.description?.toLowerCase().includes(filterLower);
    });

    return {
      ...job,
      graphicsTasks,
      upstreamTasks
    };
  }).filter(job => job.graphicsTasks.length > 0);

  // Apply location filter and search query filter
  const filteredJobs = jobsWithGraphicsTasks.filter(job => {
    const jobZone = zones.find(z => z.currentJobId === job.id);
    
    // Location Filter
    if (locationFilter === 'bay' && (!jobZone || jobZone.type !== 'bay')) return false;
    if (locationFilter === 'parking' && (!jobZone || jobZone.type !== 'parking')) return false;
    if (locationFilter === 'unassigned' && jobZone) return false;

    // Search Filter
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const vehicle = job.vehicleId ? vehicles.find(v => v.vin === job.vehicleId) : null;
    const vehicleStr = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.vin}`.toLowerCase() : '';
    return (
      job.title?.toLowerCase().includes(q) ||
      job.jobNumber?.toLowerCase().includes(q) ||
      job.customerName?.toLowerCase().includes(q) ||
      (jobZone?.name || '').toLowerCase().includes(q) ||
      vehicleStr.includes(q)
    );
  });

  // Sort by next ready (upstream work completion):
  // 1. Jobs with uncompleted Graphics tasks go first, sorted by remaining upstream hours (non-Graphics uncompleted tasks bookTime) ascending.
  // 2. Jobs with all Graphics tasks completed go last.
  const sortedJobs = [...filteredJobs].sort((a, b) => {
    const aGraphicsRemaining = a.graphicsTasks.filter((t: any) => t.status !== 'completed').length;
    const bGraphicsRemaining = b.graphicsTasks.filter((t: any) => t.status !== 'completed').length;

    if (aGraphicsRemaining === 0 && bGraphicsRemaining > 0) return 1; // Completed Graphics goes last
    if (aGraphicsRemaining > 0 && bGraphicsRemaining === 0) return -1; // Completed Graphics goes last
    if (aGraphicsRemaining === 0 && bGraphicsRemaining === 0) return 0;
    
    const aUpstreamHours = a.upstreamTasks.filter((t: any) => t.status !== 'completed').reduce((sum: number, t: any) => sum + (parseFloat(t.bookTime) || 0), 0);
    const bUpstreamHours = b.upstreamTasks.filter((t: any) => t.status !== 'completed').reduce((sum: number, t: any) => sum + (parseFloat(t.bookTime) || 0), 0);

    return aUpstreamHours - bUpstreamHours;
  });

  return (
    <div 
      ref={containerRef}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-4 duration-500",
        isFullscreen ? "p-2 space-y-2 bg-zinc-50 dark:bg-zinc-950 h-full w-full overflow-y-auto custom-scrollbar" : "space-y-8"
      )}
    >
      <Toaster position="top-right" richColors theme="system" closeButton />
      {isFullscreen && (
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 w-full relative z-10">
          <div className="mr-auto flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live {departmentName} Dashboard</span>
            <span className="text-[10px] font-bold text-zinc-500">• Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
          <button 
            onClick={toggleFullscreen}
            className="hidden sm:flex w-full sm:w-auto px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-lg transition-all items-center justify-center gap-2"
          >
            <Minimize className="w-4 h-4" />
            Exit Full Screen
          </button>
        </div>
      )}
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
            {departmentName} Tasks Location Board
          </h1>
          <p className="text-sm text-zinc-500">Track and manage jobs with {departmentName} tasks assigned and their current shop bay/parking locations.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto shrink-0">
          {!isFullscreen && (
            <button 
              onClick={toggleFullscreen}
              className="hidden sm:flex px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-xl shadow-sm transition-all items-center justify-center gap-2 cursor-pointer h-[38px] shrink-0"
            >
              <Maximize className="w-4 h-4" />
              Full Screen
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'bay', 'parking', 'unassigned'] as const).map(f => (
              <button
                key={f}
                onClick={() => setLocationFilter(f)}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer",
                  locationFilter === f
                    ? "bg-indigo-500 border-indigo-500 text-white shadow-sm shadow-indigo-500/20"
                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                )}
              >
                {f === 'all' && 'All Locations'}
                {f === 'bay' && '⚡ In Bay'}
                {f === 'parking' && '🅿️ In Parking'}
                {f === 'unassigned' && '⚪ Unassigned'}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text"
              placeholder="Search jobs / locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs transition-all text-zinc-900 dark:text-white font-medium"
            />
          </div>
        </div>

        {sortedJobs.length === 0 ? (
          <div className="p-16 text-center bg-zinc-50 dark:bg-zinc-950 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
            <MapPin className="w-8 h-8 text-zinc-400 mx-auto mb-3" />
            <p className="text-zinc-500 italic font-medium">No active jobs with {departmentName} tasks matching current filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {sortedJobs.map(job => {
              const jobZone = zones.find(z => z.currentJobId === job.id);
              const tasks = job.graphicsTasks;
              const completedTasks = tasks.filter((t: any) => t.status === 'completed').length;
              const totalTasks = tasks.length;
              const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
              const vehicle = job.vehicleId ? vehicles.find(v => v.vin === job.vehicleId) : null;
              const vehicleDisplay = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : (job.vehicleId || 'No Vehicle Assigned');
              
              const stayStart = jobZone ? (jobZone.type === 'bay' ? (job.currentBaySessionStart || jobZone.lastAssignedAt) : (job.currentParkingSessionStart || jobZone.lastAssignedAt)) : null;
              const durationStr = stayStart ? calculateDuration(stayStart) : null;

              const todoUpstreamTasks = job.upstreamTasks.filter((t: any) => t.status !== 'completed');
              const remainingUpstreamHours = todoUpstreamTasks.reduce((sum: number, t: any) => sum + (parseFloat(t.bookTime) || 0), 0);
              const estReadyDate = remainingUpstreamHours > 0 
                ? new Date(Date.now() + remainingUpstreamHours * 3600000) 
                : null;

              return (
                <div 
                  key={job.id}
                  onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden hover:shadow-xl hover:border-indigo-500/30 transition-all duration-300 flex flex-col group cursor-pointer"
                >
                  {/* Location Stay Banner */}
                  {jobZone ? (
                    <div className={cn(
                      "px-5 py-3 border-b flex items-center justify-between text-xs font-bold",
                      jobZone.type === 'bay'
                        ? "bg-gradient-to-r from-amber-500/10 to-orange-500/10 dark:from-amber-500/5 dark:to-orange-500/5 text-amber-600 dark:text-amber-400 border-amber-500/20"
                        : "bg-gradient-to-r from-cyan-500/10 to-blue-500/10 dark:from-cyan-500/5 dark:to-blue-500/5 text-cyan-600 dark:text-cyan-400 border-cyan-500/20"
                    )}>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-indigo-500" />
                        <span>{jobZone.type === 'bay' ? 'Production Bay' : 'Parking Lot'}: {jobZone.name}</span>
                      </div>
                      {durationStr && (
                        <div className="flex items-center gap-1 bg-white/60 dark:bg-black/20 px-2 py-0.5 rounded-full text-[10px]">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          <span>Here: {durationStr}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500 font-bold">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-zinc-400" />
                        <span>No Location Assigned</span>
                      </div>
                    </div>
                  )}

                  {/* Card Content */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    {/* Job Details */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                          {job.jobNumber ? `#${job.jobNumber}` : 'No Job #'}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                          ['Closed', 'Completed', 'Cancelled'].includes(job.status)
                            ? "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                            : job.status === 'Blocked' || (job.blockers || []).some((b: any) => b.status === 'active')
                            ? "bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/5"
                            : "bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:bg-indigo-500/5 dark:text-indigo-400"
                        )}>
                          {job.status}
                        </span>
                      </div>
                      <h3 className="font-black text-base text-zinc-900 dark:text-white group-hover:text-indigo-500 transition-colors line-clamp-1">
                        {job.title}
                      </h3>
                      <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        {job.customerName || 'No Customer'}
                      </p>
                    </div>

                    {/* Vehicle & Est Completion */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 rounded-xl border border-zinc-100 dark:border-zinc-800/40">
                        <Car className="w-4 h-4 shrink-0 text-zinc-400" />
                        <span className="line-clamp-1">{vehicleDisplay}</span>
                      </div>
                      
                      <div className={cn(
                        "flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-xl border",
                        remainingUpstreamHours > 0
                          ? "bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border-indigo-100/60 dark:border-indigo-900/30 animate-pulse"
                          : "bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100/60 dark:border-emerald-900/30"
                      )}>
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {remainingUpstreamHours > 0 && estReadyDate
                            ? `Est. Ready: ${formatEstCompletion(estReadyDate)}`
                            : '✅ Ready for Graphics'}
                        </span>
                      </div>
                    </div>

                    {/* Task Progress Bar */}
                    {totalTasks > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500">
                          <span>Task Progress</span>
                          <span>{completedTasks}/{totalTasks} ({completionPercent}%)</span>
                        </div>
                        <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-indigo-500 h-full transition-all duration-300"
                            style={{ width: `${completionPercent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Tasks List */}
                    {totalTasks > 0 ? (
                      <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-3 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Tasks</p>
                        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                          {tasks.map((task: any) => {
                            const isTaskActive = task.status === 'active' || task.status === 'in-progress';
                            const isTaskCompleted = task.status === 'completed';
                            
                            return (
                              <div 
                                key={task.id}
                                className={cn(
                                  "p-2 rounded-xl flex items-center justify-between text-xs transition-colors border",
                                  isTaskActive
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-500/5"
                                    : isTaskCompleted
                                    ? "bg-zinc-50 dark:bg-zinc-950/40 border-zinc-100 dark:border-zinc-800/40 text-zinc-400 dark:text-zinc-500 line-through"
                                    : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {isTaskActive && (
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                  )}
                                  <span className="font-bold truncate">{task.title}</span>
                                </div>
                                {task.bookTime > 0 && (
                                  <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-md font-bold shrink-0">
                                    {task.bookTime} hrs
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-3 text-center">
                        <span className="text-[10px] text-zinc-400 italic">No tasks created for this job yet</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
