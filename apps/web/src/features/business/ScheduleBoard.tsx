import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, updateDoc, doc, serverTimestamp, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Calendar as CalendarIcon, Car, AlertCircle, GripHorizontal, RefreshCw, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize, X, Search } from 'lucide-react';
import { useJobPartsStatus } from './hooks/useJobPartsStatus';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth/store';
import { getDocs } from 'firebase/firestore';



interface WorkSchedule {
  days: number[]; // 1=Mon, ..., 7=Sun
  startTime: string; // "08:00"
  endTime: string; // "17:00"
}

export function isWorkingDay(date: Date, schedule: WorkSchedule) {
  let jsDay = date.getDay(); // 0=Sun, 1=Mon
  let smDay = jsDay === 0 ? 7 : jsDay;
  return schedule.days.includes(smDay);
}

export function projectWorkingHours(startDate: Date, estimatedHours: number, schedule?: WorkSchedule): Date {
  if (!schedule) {
    schedule = { days: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '17:00' };
  }
  
  let current = new Date(startDate);
  // Apply 80% efficiency to book time
  const realTimeHours = estimatedHours / 0.8;
  let remainingMs = realTimeHours * 60 * 60 * 1000;
  
  const [startH, startM] = schedule.startTime.split(':').map(Number);
  const [endH, endM] = schedule.endTime.split(':').map(Number);
  
  let loopCount = 0;
  while (remainingMs > 0 && loopCount < 365) {
    loopCount++;
    
    if (!isWorkingDay(current, schedule)) {
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }
    
    let workStart = new Date(current);
    workStart.setHours(startH, startM, 0, 0);
    
    let workEnd = new Date(current);
    workEnd.setHours(endH, endM, 0, 0);
    
    if (current.getTime() < workStart.getTime()) {
      current = new Date(workStart);
    }
    
    if (current.getTime() >= workEnd.getTime()) {
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }
    
    let timeAvailableMs = workEnd.getTime() - current.getTime();
    
    if (remainingMs <= timeAvailableMs) {
      current.setTime(current.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= timeAvailableMs;
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
    }
  }
  
  return current;
}

export function calculateJobSegments(startDate: Date, estimatedHours: number, schedule: WorkSchedule) {
  let segments: { start: Date, end: Date, isFirst: boolean, isLast: boolean }[] = [];
  let current = new Date(startDate);
  // Apply 80% efficiency to book time
  const realTimeHours = estimatedHours / 0.8;
  let remainingMs = realTimeHours * 60 * 60 * 1000;
  
  const [startH, startM] = schedule.startTime.split(':').map(Number);
  const [endH, endM] = schedule.endTime.split(':').map(Number);
  
  let loopCount = 0;
  while (remainingMs > 0 && loopCount < 365) {
    loopCount++;
    
    if (!isWorkingDay(current, schedule)) {
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }
    
    let workStart = new Date(current);
    workStart.setHours(startH, startM, 0, 0);
    
    let workEnd = new Date(current);
    workEnd.setHours(endH, endM, 0, 0);
    
    if (current.getTime() < workStart.getTime()) {
      current = new Date(workStart);
    }
    
    if (current.getTime() >= workEnd.getTime()) {
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }
    
    let timeAvailableMs = workEnd.getTime() - current.getTime();
    
    if (remainingMs <= timeAvailableMs) {
      segments.push({
        start: new Date(current),
        end: new Date(current.getTime() + remainingMs),
        isFirst: segments.length === 0,
        isLast: true
      });
      remainingMs = 0;
    } else {
      segments.push({
        start: new Date(current),
        end: new Date(workEnd),
        isFirst: segments.length === 0,
        isLast: false
      });
      remainingMs -= timeAvailableMs;
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
    }
  }
  
  return segments;
}

export function calculateJobSegmentsToDate(startDate: Date, endDate: Date, schedule: WorkSchedule) {
  let segments: { start: Date, end: Date, isFirst: boolean, isLast: boolean }[] = [];
  let current = new Date(startDate);
  
  const [startH, startM] = schedule.startTime.split(':').map(Number);
  const [endH, endM] = schedule.endTime.split(':').map(Number);
  
  let loopCount = 0;
  while (current.getTime() < endDate.getTime() && loopCount < 365) {
    loopCount++;
    
    if (!isWorkingDay(current, schedule)) {
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }
    
    let workStart = new Date(current);
    workStart.setHours(startH, startM, 0, 0);
    
    let workEnd = new Date(current);
    workEnd.setHours(endH, endM, 0, 0);
    
    if (current.getTime() < workStart.getTime()) {
      current = new Date(workStart);
    }
    
    if (current.getTime() >= workEnd.getTime()) {
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      continue;
    }
    
    let timeAvailableMs = workEnd.getTime() - current.getTime();
    let remainingMs = endDate.getTime() - current.getTime();
    
    if (remainingMs <= timeAvailableMs) {
      segments.push({
        start: new Date(current),
        end: new Date(endDate),
        isFirst: segments.length === 0,
        isLast: true
      });
      break;
    } else {
      segments.push({
        start: new Date(current),
        end: new Date(workEnd),
        isFirst: segments.length === 0,
        isLast: false
      });
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
    }
  }
  
  if (segments.length > 0) {
    segments[segments.length - 1].isLast = true;
  }
  
  return segments;
}

interface ScheduleBoardProps {
  tenantId: string;
}

function TimelineJobBlock({ job, tenantId, staffList, timelineStart, zoomLevel, schedule, onDragStart, onUnschedule, monitorSettings, partsRequests, now }: { job: any, tenantId: string, staffList: any[], timelineStart: Date, zoomLevel: number, schedule: WorkSchedule, onDragStart: (e: React.DragEvent, job: any) => void, onUnschedule: (jobId: string) => void, monitorSettings: any, partsRequests: any[], now: Date }) {
  const navigate = useNavigate();
  const { data: partsInfo } = useJobPartsStatus(tenantId, job.id);
  
  const hasPartsConflict = (partsInfo?.status === 'Blocked' || partsInfo?.status === 'Pending with ETA');
  
  const startMs = job._visualStartMs || (job.scheduledStartDate ? new Date(job.scheduledStartDate).getTime() : null);
  const endMs = job._visualEndMs || null;
  const estimatedHours = parseFloat(job.estimatedHours) || 1; // Default to 1 hour if not set
  
  if (!startMs) return null;

  const start = new Date(startMs);
  const segments = endMs ? calculateJobSegmentsToDate(start, new Date(endMs), schedule) : calculateJobSegments(start, estimatedHours, schedule);

  const colors = {
    blocked: monitorSettings?.monitorColorBlocked || '#b91c1c', // red-700
    urgent: monitorSettings?.monitorColorUrgent || '#d97706', // amber-600
    overdue: monitorSettings?.monitorColorOverdue || '#b91c1c', // red-700
    active: monitorSettings?.monitorColorActive || '#1d4ed8', // blue-700
    empty: monitorSettings?.monitorColorEmpty || '#27272a' // zinc-800
  };

  const currentVin = job?.vehicleVin;
  const relevantParts = partsRequests.filter((pr: any) => {
    const prStatus = (pr.status || '').toLowerCase();
    const isActive = ['pending', 'received', 'ordered'].includes(prStatus);
    if (!isActive) return false;
    if (job?.id && pr.jobId === job.id) return true;
    if (!job?.id && currentVin && pr.vin === currentVin) return true;
    return false;
  });
  
  const requestedCount = relevantParts.filter(pr => (pr.status || '').toLowerCase() === 'pending').length;
  const orderedCount = relevantParts.filter(pr => (pr.status || '').toLowerCase() === 'ordered').length;
  const receivedCount = relevantParts.filter(pr => (pr.status || '').toLowerCase() === 'received').length;

  const legacyBlocker = job?.blocker ? [{ message: job.blocker, status: 'active' }] : [];
  const activeBlockers = (job?.blockers || legacyBlocker).filter((b: any) => b.status === 'active');
  const isBlocked = activeBlockers.length > 0 || job?.status === 'Blocked';
  
  const isPartsMissing = requestedCount > 0;
  const isPartsOrderedOrReceived = orderedCount > 0 || receivedCount > 0;
  
  // Also consider overdue ETA
  const etaRaw = job?.expectedFinishTime || job?.eta;
  let isOverdue = false;
  if (etaRaw) {
    const parsedDate = typeof etaRaw.toDate === 'function' ? etaRaw.toDate() : new Date(etaRaw);
    isOverdue = (parsedDate.getTime() - now.getTime()) < 0;
  }

  const isFinished = ['Ready for QA', 'Ready for Customer', 'Completed'].includes(job?.status || '');
  let customBgStyle: React.CSSProperties = {};
  
  if (isBlocked) {
    customBgStyle = { backgroundColor: colors.blocked, borderColor: `${colors.blocked}ff`, borderWidth: '2px', borderStyle: 'solid' };
  } else if (isPartsMissing) {
    customBgStyle = { backgroundColor: colors.urgent, borderColor: `${colors.urgent}ff`, borderWidth: '2px', borderStyle: 'solid' };
  } else if (isOverdue) {
    customBgStyle = { backgroundColor: colors.active, borderColor: colors.overdue, borderWidth: '2px', borderStyle: 'solid' };
  } else if (isPartsOrderedOrReceived) {
    customBgStyle = { backgroundColor: colors.active, borderColor: colors.urgent, borderWidth: '2px', borderStyle: 'solid' };
  } else {
    customBgStyle = { backgroundColor: colors.active, borderColor: `${colors.active}ff`, borderWidth: '2px', borderStyle: 'solid' };
  }
  
  const originalBgColor = customBgStyle.backgroundColor;
  if (isFinished && !job._visualFinishedAtMs) {
    customBgStyle = { backgroundColor: '#10b981', borderColor: '#059669', borderWidth: '2px', borderStyle: 'solid' }; // emerald-500
  } else if (isFinished) {
    // If we have a split, we base the border on the finished color (emerald), but background will be a gradient
    customBgStyle.borderColor = '#059669'; // emerald-600 border
  }

  return (
    <>
      {segments.map((segment, idx) => {
        const segmentStart = segment.start.getTime();
        const segmentEnd = segment.end.getTime();
        
        let segmentBgStyle = { ...customBgStyle };
        if (isFinished && job._visualFinishedAtMs) {
          const finishedAt = job._visualFinishedAtMs;
          if (segmentEnd <= finishedAt) {
             // 100% original color
             segmentBgStyle.backgroundColor = originalBgColor;
             segmentBgStyle.background = undefined;
          } else if (segmentStart >= finishedAt) {
             // 100% green
             segmentBgStyle.backgroundColor = '#10b981'; // emerald-500
             segmentBgStyle.background = undefined;
          } else {
             // Gradient split
             const totalDuration = segmentEnd - segmentStart;
             const blueDuration = finishedAt - segmentStart;
             const percentage = Math.max(0, Math.min(100, (blueDuration / totalDuration) * 100));
             segmentBgStyle.background = `linear-gradient(to right, ${originalBgColor} ${percentage}%, #10b981 ${percentage}%)`;
             segmentBgStyle.backgroundColor = undefined;
          }
        }
        
        const diffMs = segmentStart - timelineStart.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        const leftPx = diffHours * zoomLevel;
        
        const durationMs = segmentEnd - segmentStart;
        const widthPx = Math.max((durationMs / (1000 * 60 * 60)) * zoomLevel, 10);
        
        return (
          <React.Fragment key={`${job.id}-${idx}`}>
            <div 
              draggable={segment.isFirst} // Only allow dragging from the first segment to keep logic simple
            onDragStart={(e) => {
              if (segment.isFirst) {
                onDragStart(e, job);
              }
            }}
            onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}
            style={{ left: `${leftPx}px`, width: `${widthPx}px`, ...segmentBgStyle }}
            className={`absolute top-2 bottom-2 shadow-sm ${segment.isFirst ? 'cursor-grab' : 'cursor-pointer opacity-80'} hover:shadow-md transition-all group overflow-hidden ${segment.isFirst ? (segment.isLast ? 'rounded-xl' : 'rounded-l-xl border-r-0') : (segment.isLast ? 'rounded-r-xl border-l-0' : 'border-x-0')}`}
          >
            {/* Progress Background */}
            <div className="absolute inset-0 bg-white/5 z-0 pointer-events-none" />
            
            <>
              <div className="relative z-10 flex flex-col h-full justify-between pointer-events-none p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          {job.customerName && (
                            <p className="text-[9px] text-white/70 font-black uppercase tracking-tight truncate mb-0.5">{job.customerName}</p>
                          )}
                          <h4 className="font-bold text-xs text-white truncate">{job.title || 'Untitled'}</h4>
                          {job.vehicleId && (
                            <div className="flex items-center gap-1 text-[9px] text-white/60 font-medium mt-1">
                              <Car className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{job.vehicleId}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Staff Avatars */}
                        {job.assignedStaffIds && job.assignedStaffIds.length > 0 && (
                          <div className="flex -space-x-1 shrink-0 mt-0.5 mr-1">
                            {job.assignedStaffIds.slice(0, 3).map((staffId: string) => {
                              const staff = staffList.find(s => s.id === staffId);
                              if (!staff) return null;
                              return (
                                <div key={staffId} className="w-4 h-4 rounded-full bg-black/20 border border-white/10 flex items-center justify-center text-[7px] font-black text-white shadow-sm" title={`${staff.firstName} ${staff.lastName}`}>
                                  {staff.firstName?.[0] || ''}{staff.lastName?.[0] || ''}
                                </div>
                              );
                            })}
                            {job.assignedStaffIds.length > 3 && (
                              <div className="w-4 h-4 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-[7px] font-black text-white/60 shadow-sm">
                                +{job.assignedStaffIds.length - 3}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {segment.isFirst && (
                      <GripHorizontal className="w-3 h-3 text-white/30 cursor-grab shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnschedule(job.id);
                      }}
                      className="absolute top-0 right-0 p-1 bg-black/20 hover:bg-red-500 text-white/50 hover:text-white rounded-bl-lg rounded-tr-xl opacity-0 group-hover:opacity-100 transition-colors z-20 pointer-events-auto"
                      title="Unschedule Job"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-bold mt-2">
                    <span className="text-indigo-600 dark:text-indigo-400">{estimatedHours}h Book Time</span>
                    {partsInfo && partsInfo.status !== 'No Parts Needed' && (
                      <span className={hasPartsConflict ? 'text-red-500' : 'text-emerald-500'}>
                        {partsInfo.status === 'Ready' ? 'Parts Ready' : 'Parts Conflict'}
                      </span>
                    )}
                  </div>
                </div>
                {hasPartsConflict && partsInfo?.latestEta && start.getTime() < partsInfo.latestEta.getTime() && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm" title={`Scheduled before parts ETA (${partsInfo.latestEta.toLocaleDateString()})`}>
                    <AlertCircle className="w-3 h-3" />
                  </div>
                )}
                {job.scheduledArrivalTime && start.getTime() < new Date(job.scheduledArrivalTime).getTime() && (
                  <div className="absolute top-4 -right-1 bg-orange-500 text-white rounded-full p-0.5 shadow-sm" title={`Vehicle Not Arrived Yet (${new Date(job.scheduledArrivalTime).toLocaleDateString()})`}>
                    <AlertCircle className="w-3 h-3" />
                  </div>
                )}
              </>
            </div>
            
            {/* Visual Buffer Block */}
          {segment.isLast && (
            <div
              className="absolute top-2 bottom-2 border border-amber-500/20 bg-amber-500/10 rounded-lg pointer-events-none z-0"
              style={{
                left: `${leftPx + widthPx + 4}px`, // 4px gap from job end
                width: `${Math.max((10 / 60) * zoomLevel, 6)}px`, // 10 minutes width
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(245, 158, 11, 0.2) 5px, rgba(245, 158, 11, 0.2) 10px)'
              }}
              title="10-minute cleanup buffer"
            />
          )}
        </React.Fragment>
        );
      })}
    </>
  );
}

export function ScheduleBoard({ tenantId }: ScheduleBoardProps) {
  const { isSuperAdmin } = useAuthStore();
  const [jobs, setJobs] = useState<any[]>([]);
  const [bays, setBays] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [zoomLevel, setZoomLevel] = useState(60); // px per hour
  const [now, setNow] = useState(new Date());
  const [timelineStart, setTimelineStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // Start on Sunday
    return d;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [monitorSettings, setMonitorSettings] = useState<any>(null);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [unscheduledSearch, setUnscheduledSearch] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000); // Update every minute for the red line
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/staff`), (snap) => {
      setStaffList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    
    // Fetch active Jobs
    const qJobs = query(
      collection(db, `businesses/${tenantId}/jobs`),
      where('status', 'not-in', ['Closed', 'Completed'])
    );
    const unsubJobs = onSnapshot(qJobs, (snap) => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch Bays (Zones of type bay)
    const qZones = query(
      collection(db, `businesses/${tenantId}/zones`),
      where('type', '==', 'bay')
    );
    const unsubZones = onSnapshot(qZones, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      setBays(data);
    });

    // Fetch Departments
    const qDepts = query(collection(db, `businesses/${tenantId}/departments`));
    const unsubDepts = onSnapshot(qDepts, (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch Business Settings
    const unsubSettings = onSnapshot(doc(db, `businesses/${tenantId}`), (snap) => {
      if (snap.exists()) setMonitorSettings(snap.data());
    });

    // Fetch Parts Requests
    const qParts = query(
      collection(db, `businesses/${tenantId}/parts_requests`),
      where('status', 'in', ['pending', 'ordered', 'received'])
    );
    const unsubParts = onSnapshot(qParts, (snap) => {
      setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubJobs();
      unsubZones();
      unsubDepts();
      unsubSettings();
      unsubParts();
    };
  }, [tenantId]);

  const handleSyncDepartments = async () => {
    if (!confirm('This will backfill department tags on all active jobs based on their current tasks. This may take a minute.')) return;
    setIsSyncing(true);
    let count = 0;
    try {
      for (const job of jobs) {
        if (!job.id) continue;
        const taskSnap = await getDocs(collection(db, `businesses/${tenantId}/jobs/${job.id}/tasks`));
        const tasks = taskSnap.docs.map(d => d.data());
        const deptIds = Array.from(new Set(tasks.map(t => t.departmentId).filter(Boolean)));
        
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, job.id), {
          departmentIds: deptIds,
          updatedAt: serverTimestamp()
        });
        count++;
      }
      toast.success(`Successfully backfilled departments on ${count} active jobs!`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to sync some jobs.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Center the timeline on current time on initial load
  useEffect(() => {
    if (scrollRef.current) {
      const currentDiffHours = (now.getTime() - timelineStart.getTime()) / (1000 * 60 * 60);
      const scrollX = Math.max(0, (currentDiffHours * zoomLevel) - 300); // 300px offset for better visibility
      scrollRef.current.scrollLeft = scrollX;
    }
  }, [timelineStart, zoomLevel]); // Re-center slightly or just apply on load?
  // We'll leave it in the effect, so it re-centers when date changes, but we might not want it to re-center when zooming. 
  // Actually, we'll keep it simple for now.

  const handlePrevWeek = () => {
    setTimelineStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const handleNextWeek = () => {
    setTimelineStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const handleToday = () => {
    setTimelineStart(() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay()); // Go to Sunday
      return d;
    });
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 20, 200));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 20, 20));

  const handleWheel = (e: React.WheelEvent) => {
    // Only zoom if pressing ctrl or alt, otherwise let them scroll normally
    if (e.ctrlKey || e.altKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY > 0) {
        handleZoomOut();
      } else {
        handleZoomIn();
      }
    }
  };

  // Calculate current time line offset
  const currentDiffHours = (now.getTime() - timelineStart.getTime()) / (1000 * 60 * 60);
  const currentTimePx = currentDiffHours * zoomLevel;

  const isJobTrackedByBay = (bay: any, job: any) => {
    if (bay.currentJobId === job.id) return true;
    if (!bay.currentVehicleVin) return false;
    
    const bayVin = String(bay.currentVehicleVin).toLowerCase().trim();
    const jobVin = String(job.vehicleVin || '').toLowerCase().trim();
    const jobTitle = String(job.title || '').toLowerCase().trim();
    const jobVehId = String(job.vehicleId || '').toLowerCase().trim();
    
    if (jobVin && bayVin === jobVin) return true;
    if (jobTitle && bayVin === jobTitle) return true;
    if (jobVehId && bayVin === jobVehId) return true;
    if (jobVin && bayVin.includes(jobVin) && jobVin.length >= 5) return true;
    if (jobVehId && bayVin.includes(jobVehId) && jobVehId.length >= 5) return true;
    if (jobTitle && bayVin.includes(jobTitle) && jobTitle.length >= 5) return true;

    return false;
  };

  let unscheduledJobs = jobs.filter(j => {
    const isTrackedByBay = bays.some(b => isJobTrackedByBay(b, j));
    if ((j.bayId && j.scheduledStartDate) || isTrackedByBay) return false;
    
    const hasEta = !!(j.eta || j.expectedFinishTime || j.scheduledEndDate);
    const hasBookTime = parseFloat(j.estimatedHours || '0') > 0;
    const isFinishedOrQC = ['Ready for QA', 'Ready for Customer'].includes(j.status || '');
    return hasEta || (hasBookTime && !isFinishedOrQC);
  });
  
  if (unscheduledSearch.trim()) {
    const q = unscheduledSearch.toLowerCase();
    unscheduledJobs = unscheduledJobs.filter(j => 
      (j.title || '').toLowerCase().includes(q) ||
      (j.customerName || '').toLowerCase().includes(q) ||
      (j.vehicleName || '').toLowerCase().includes(q) ||
      (j.vehicleVin || '').toLowerCase().includes(q)
    );
  }
  
  const displayedUnscheduled = unscheduledJobs.slice(0, 50);

  const scheduledJobs = jobs.filter(j => {
    const isTrackedByBay = bays.some(b => isJobTrackedByBay(b, j));
    return (j.bayId && (j.scheduledStartDate || true)) || isTrackedByBay;
  });

  const handleDragStart = (e: React.DragEvent, job: any) => {
    e.dataTransfer.setData('jobId', job.id);
    e.dataTransfer.setData('offsetX', e.nativeEvent.offsetX.toString());
  };

  const handleDropOnGrid = async (e: React.DragEvent, bayId: string) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('jobId');
    const dragOffsetX = parseFloat(e.dataTransfer.getData('offsetX') || '0');
    
    if (!jobId) return;

    // Calculate dropped time based on X coordinate
    const containerRect = e.currentTarget.getBoundingClientRect();
    const dropX = e.clientX - containerRect.left;
    
    // We adjust by dragOffsetX so the start of the block lands where the mouse grabbed it
    const adjustedX = Math.max(0, dropX - dragOffsetX);
    
    const hoursFromStart = adjustedX / zoomLevel;
    
    const newStartDate = new Date(timelineStart);
    newStartDate.setTime(newStartDate.getTime() + (hoursFromStart * 60 * 60 * 1000));
    
    // Snap to nearest 15 minutes
    const ms = 1000 * 60 * 15;
    const snappedDate = new Date(Math.round(newStartDate.getTime() / ms) * ms);

    const job = jobs.find(j => j.id === jobId);
    const estimatedHours = parseFloat(job?.estimatedHours) || 1;
    
    // Get the bay's department schedule
    const bayObj = [...bays, { id: 'unassigned', name: 'Unassigned / Mobile' }].find(r => r.id === bayId || r.name === bayId);
    const dept = departments.find(d => d.id === bayObj?.departmentId);
    
    const endDate = projectWorkingHours(snappedDate, estimatedHours, dept?.defaultSchedule);

    try {
      const batch = writeBatch(db);
      const droppedJobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      batch.update(droppedJobRef, {
        scheduledStartDate: snappedDate.toISOString(),
        scheduledEndDate: endDate.toISOString(),
        bayId: bayId, // Associate with the bay row dropped into
        updatedAt: serverTimestamp()
      });

      // --- Cascade Logic ---
      // Get all OTHER jobs in this bay that are scheduled to start AT or AFTER the dropped job's start time
      const droppedStartTime = snappedDate.getTime();
      
      const otherJobsInBay = jobs.filter(
        j => j.bayId === bayId && 
             j.id !== jobId && 
             j.scheduledStartDate && 
             new Date(j.scheduledStartDate).getTime() >= droppedStartTime &&
             parseFloat(j.estimatedHours || '0') > 0
      );

      // Sort them chronologically by start date
      otherJobsInBay.sort((a, b) => new Date(a.scheduledStartDate).getTime() - new Date(b.scheduledStartDate).getTime());

      let currentEndTime = endDate;

      for (const otherJob of otherJobsInBay) {
        // Calculate the 10-minute buffer start time (respecting working hours)
        const bufferStart = currentEndTime;
        const gapEnd = projectWorkingHours(bufferStart, 10 / 60, dept?.defaultSchedule);
        
        const otherEstHours = parseFloat(otherJob.estimatedHours) || 1;
        const otherNewEnd = projectWorkingHours(gapEnd, otherEstHours, dept?.defaultSchedule);
        
        const otherJobRef = doc(db, `businesses/${tenantId}/jobs`, otherJob.id);
        batch.update(otherJobRef, {
          scheduledStartDate: gapEnd.toISOString(),
          scheduledEndDate: otherNewEnd.toISOString(),
          updatedAt: serverTimestamp()
        });
        
        currentEndTime = otherNewEnd;
      }
      
      await batch.commit();
      toast.success('Schedule updated');
    } catch (err) {
      console.error(err);
      toast.error('Failed to update schedule');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleUnschedule = async (jobId: string) => {
    try {
      await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
        scheduledStartDate: null,
        scheduledEndDate: null,
        bayId: null,
        updatedAt: serverTimestamp()
      });
      toast.success('Job unscheduled');
    } catch (err) {
      console.error(err);
      toast.error('Failed to unschedule job');
    }
  };

  const handleDropOnSidebar = async (e: React.DragEvent) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('jobId');
    if (!jobId) return;
    await handleUnschedule(jobId);
  };


  // Live Timeline Projection Engine
  const visualCascadedJobs = useMemo(() => {
    const result: any[] = [];
    const jobsByBay: Record<string, any[]> = {};
    
    // Group scheduled jobs by bay
    scheduledJobs.forEach(job => {
      let bayKey = job.bayId;
      if (!bayKey) {
        // Find which bay is tracking it
        const trackingBay = bays.find(b => isJobTrackedByBay(b, job));
        if (trackingBay) bayKey = trackingBay.id; // Or trackingBay.name, but ScheduleBoard prefers ID for matching rows if possible, or name if ID misses.
      }
      bayKey = bayKey || 'unassigned';
      
      if (!jobsByBay[bayKey]) jobsByBay[bayKey] = [];
      jobsByBay[bayKey].push(job);
    });
    
    Object.keys(jobsByBay).forEach(bayKey => {
      const bayJobs = jobsByBay[bayKey];
      // Sort by planned start date
      bayJobs.sort((a, b) => {
        // Is actively tracked by this bay via Bay Monitor?
        const aActive = bays.some(bay => 
          (bay.id === bayKey || bay.name === bayKey) && isJobTrackedByBay(bay, a)
        );
        const bActive = bays.some(bay => 
          (bay.id === bayKey || bay.name === bayKey) && isJobTrackedByBay(bay, b)
        );
        
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;

        const timeA = a.scheduledStartDate ? new Date(a.scheduledStartDate).getTime() : now.getTime();
        const timeB = b.scheduledStartDate ? new Date(b.scheduledStartDate).getTime() : now.getTime();
        return timeA - timeB;
      });
      
      let previousVisualEndMs = 0;
      
      bayJobs.forEach(job => {
        const originalStartMs = job.scheduledStartDate ? new Date(job.scheduledStartDate).getTime() : now.getTime();
        
        let estimatedHours = parseFloat(job.estimatedHours);
        let isZeroBookTime = false;
        if (isNaN(estimatedHours) || estimatedHours <= 0) {
          isZeroBookTime = true;
          estimatedHours = 1; // Default to 1 hr if no book time and no ETA
        }
        
        const etaRaw = job.expectedFinishTime || job.eta;
        let etaMs: number | null = null;
        if (etaRaw) {
          etaMs = typeof etaRaw.toDate === 'function' ? etaRaw.toDate().getTime() : new Date(etaRaw).getTime();
        }
        
        let dept = departments.find(d => bays.find(b => (b.name === bayKey || b.id === bayKey))?.departmentId === d.id);
        let schedule = dept?.defaultSchedule || { days: [1,2,3,4,5], startTime: '08:00', endTime: '17:00' };
        
        // 1. Calculate visual start (cascading from previous job's visual end + 10 mins buffer)
        // Ensure buffer pushes correctly by projecting 10 real-time minutes (0.1333 book hours)
        let visualStartMs = originalStartMs;
        if (previousVisualEndMs > 0) {
          const bufferSegments = calculateJobSegments(new Date(previousVisualEndMs), 0.1333, schedule as any);
          const bufferEndMs = bufferSegments.length > 0 ? bufferSegments[bufferSegments.length - 1].end.getTime() : previousVisualEndMs + (10 * 60000);
          visualStartMs = Math.max(originalStartMs, bufferEndMs);
        }
        
        // Live Push: Conveyor Belt Logic
        // If a job hasn't officially started, its start time slides forward against the NOW line
        const isFinished = ['Ready for QA', 'Ready for Customer', 'Completed', 'Closed'].includes(job.status || '');
        const hasTimeLogged = (job.totalBayTimeSeconds > 0) || (job.totalParkingTimeSeconds > 0) || !!job.currentBaySessionStart || !!job.currentParkingSessionStart;
        const isStarted = isFinished || hasTimeLogged;
        // 2. Calculate visual end
        let visualEndMs;
        let visualFinishedAtMs: number | null = null;
        
        if (isFinished) {
          // If finished, ignore estimated book time. Shrink to when it was actually completed (updatedAt as proxy).
          const finishedAtRaw = job.updatedAt || job.scheduledEndDate;
          const finishedAt = finishedAtRaw ? (typeof finishedAtRaw.toDate === 'function' ? finishedAtRaw.toDate().getTime() : new Date(finishedAtRaw).getTime()) : visualStartMs;
          
          visualFinishedAtMs = finishedAt;
          visualEndMs = Math.max(visualStartMs + (15 * 60000), finishedAt);
          
          // But if it is STILL physically taking up space in the bay, it should stretch to NOW in green status
          const isPhysicallyInBay = bays.some(b => (b.id === bayKey || b.name === bayKey) && isJobTrackedByBay(b, job));
          if (isPhysicallyInBay && now.getTime() > visualEndMs) {
            visualEndMs = now.getTime();
          }
        } else {
          // Normal logic for active/pending jobs
          if (!isStarted && now.getTime() > visualStartMs) {
            // If not started AND we are late, DO NOT slide the start time.
            // Instead, stretch the end time by projecting the remaining hours from NOW.
            // This causes the job to expand (e.g. a 4 hour job becomes 5 hours if 1 hour late).
            const segmentsFromNow = calculateJobSegments(now, estimatedHours, schedule as any);
            visualEndMs = segmentsFromNow.length > 0 ? segmentsFromNow[segmentsFromNow.length - 1].end.getTime() : now.getTime();
          } else {
            // Normal projection from visualStartMs
            const segments = calculateJobSegments(new Date(visualStartMs), estimatedHours, schedule as any);
            visualEndMs = segments.length > 0 ? segments[segments.length - 1].end.getTime() : visualStartMs;
          }
          
          // Live Expansion: Stretch Logic
          // If an active job has blown past its expected end time, stretch its end to now!
          if (isStarted && now.getTime() > visualEndMs) {
            visualEndMs = now.getTime();
          }
          
          // Zero Book Time Override
          // If it has no book time but DOES have an ETA, stretch the visual block to the ETA!
          if (isZeroBookTime && etaMs && etaMs > visualStartMs) {
            visualEndMs = etaMs;
          }
        }
        
        result.push({
          ...job,
          _visualStartMs: visualStartMs,
          _visualEndMs: Math.max(visualStartMs + (15 * 60000), visualEndMs), // Ensure at least 15 min block
          _visualFinishedAtMs: visualFinishedAtMs,
          _renderedBayKey: bayKey
        });
        
        previousVisualEndMs = visualEndMs;
      });
    });
    
    return result;
  }, [scheduledJobs, now, bays, departments]);

  // Calculate dynamic total hours based on the longest job
  const dynamicTotalHours = useMemo(() => {
    let maxEndMs = timelineStart.getTime() + (168 * 60 * 60 * 1000); // Minimum 7 days (168 hours)
    visualCascadedJobs.forEach((job: any) => {
      if (job._visualEndMs > maxEndMs) {
        maxEndMs = job._visualEndMs;
      }
    });
    // Add 24 hours of padding space at the end of the timeline
    maxEndMs += (24 * 60 * 60 * 1000);
    return Math.max(168, Math.ceil((maxEndMs - timelineStart.getTime()) / (60 * 60 * 1000)));
  }, [visualCascadedJobs, timelineStart]);

  // Generate timeline headers
  const timeHeaders = useMemo(() => {
    return Array.from({ length: dynamicTotalHours }).map((_, i) => {
      const d = new Date(timelineStart);
      d.setHours(d.getHours() + i);
      return {
        label: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        isNewDay: d.getHours() === 0,
        dayLabel: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
      };
    });
  }, [dynamicTotalHours, timelineStart]);

  // If a job has no bay, it now correctly returns to the Unscheduled sidebar.
  const allRows = [...bays];

  return (
    <div id="schedule-board-container" className="h-[calc(100vh-140px)] flex flex-col animate-in fade-in duration-500 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-6 shrink-0 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 rounded-xl">
            <CalendarIcon className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Schedule</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-xl">
            <button onClick={handlePrevWeek} className="p-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={handleToday} className="px-3 py-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-sm font-bold text-zinc-700 dark:text-zinc-300 transition-colors">
              Today
            </button>
            <button onClick={handleNextWeek} className="p-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-xl">
            <button onClick={handleZoomOut} className="p-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors">
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="px-2 text-xs font-bold text-zinc-500 min-w-[3rem] text-center">
              {Math.round((zoomLevel / 60) * 100)}%
            </div>
            <button onClick={handleZoomIn} className="p-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={() => {
              const elem = document.getElementById('schedule-board-container');
              if (elem) {
                if (!document.fullscreenElement) {
                  elem.requestFullscreen().catch(err => console.log(err));
                } else {
                  document.exitFullscreen();
                }
              }
            }}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold transition-all"
            title={isFullscreen ? "Exit Full Screen" : "Toggle Full Screen"}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span className="hidden lg:inline text-sm">{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
          </button>
          
          {isSuperAdmin && (
            <button
              onClick={handleSyncDepartments}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-xl font-bold transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Departments'}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Unscheduled Backlog */}
        <div 
          className="w-72 bg-zinc-50 dark:bg-zinc-900/50 border-r border-zinc-200 dark:border-zinc-800 flex flex-col"
          onDrop={handleDropOnSidebar}
          onDragOver={handleDragOver}
        >
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm uppercase tracking-wider text-zinc-900 dark:text-white flex items-center gap-2">
                Unscheduled
                <span className="bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] px-2 py-0.5 rounded-full">
                  {unscheduledJobs.length}
                </span>
              </h3>
            </div>
            <div className="relative mb-2">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-zinc-400" />
              </div>
              <input
                type="text"
                placeholder="Search jobs..."
                value={unscheduledSearch}
                onChange={(e) => setUnscheduledSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-zinc-500"
              />
            </div>
            <p className="text-[10px] text-zinc-500">Drag to timeline to schedule. Showing top 50.</p>
          </div>
          <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
            {displayedUnscheduled.map(job => (
              <div 
                key={job.id}
                draggable
                onDragStart={(e) => handleDragStart(e, job)}
                className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 shadow-sm cursor-grab hover:border-indigo-500/50 transition-colors group"
              >
                <div className="flex flex-col gap-1.5 mb-2">
                  <div className="flex items-center gap-2">
                    <GripHorizontal className="w-3 h-3 text-zinc-300 shrink-0" />
                    <h4 className="font-bold text-xs text-zinc-900 dark:text-white truncate">{job.title || 'Untitled'}</h4>
                  </div>
                  {(job.customerName || job.vehicleName || job.vehicleVin) && (
                    <div className="pl-5 text-[10px] text-zinc-500 truncate space-y-0.5">
                      {job.customerName && <div className="font-bold text-zinc-700 dark:text-zinc-300 truncate">{job.customerName}</div>}
                      {(job.vehicleName || job.vehicleVin) && (
                        <div className="truncate">
                          <Car className="w-2.5 h-2.5 inline-block mr-1 opacity-70" />
                          {job.vehicleName} {job.vehicleVin ? `(${job.vehicleVin.slice(-6)})` : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] font-bold pl-5">
                  <div className="flex -space-x-1 shrink-0">
                    {job.assignedStaffIds && job.assignedStaffIds.length > 0 ? (
                      job.assignedStaffIds.slice(0, 3).map((staffId: string) => {
                        const staff = staffList.find(s => s.id === staffId);
                        if (!staff) return null;
                        return (
                          <div key={staffId} className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-white dark:border-zinc-950 flex items-center justify-center text-[7px] font-black text-zinc-600 dark:text-zinc-400 shadow-sm" title={`${staff.firstName} ${staff.lastName}`}>
                            {staff.firstName?.[0] || ''}{staff.lastName?.[0] || ''}
                          </div>
                        );
                      })
                    ) : (
                      <span className="text-zinc-400 italic">Unassigned</span>
                    )}
                  </div>
                  <span className="text-zinc-500">{job.estimatedHours || 0}h Book Time</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline Grid */}
        <div className="flex-1 overflow-auto custom-scrollbar relative bg-white dark:bg-zinc-950" ref={scrollRef}>
          <div className="w-max min-w-full min-h-full flex flex-col">
            {/* Header Row (Time) */}
            <div className="sticky top-0 z-30 flex bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 shadow-sm shrink-0">
            {/* Corner Cell */}
            <div className="w-48 shrink-0 border-r border-zinc-200 dark:border-zinc-800 p-4 flex items-end sticky left-0 z-40 bg-white dark:bg-zinc-950">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Bay / Upfitter</span>
            </div>
            
            {/* Time Ticks */}
            <div className="flex relative" style={{ width: `${dynamicTotalHours * zoomLevel}px` }}>
              {timeHeaders.map((header, i) => (
                <div 
                  key={i} 
                  className="shrink-0 border-r border-zinc-100 dark:border-zinc-800/50 p-2 relative flex flex-col justify-end"
                  style={{ width: `${zoomLevel}px` }}
                >
                  {header.isNewDay && (
                    <div className="absolute top-1 left-1 text-[10px] font-black uppercase text-indigo-500 tracking-wider whitespace-nowrap bg-white dark:bg-zinc-950 z-10 px-1 rounded shadow-sm border border-indigo-100 dark:border-indigo-900/30">
                      {header.dayLabel}
                    </div>
                  )}
                  <span className="text-[10px] font-bold text-zinc-500">{header.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline Body Container */}
          <div className="relative flex-1" onWheel={handleWheel}>
            {/* Current Time Indicator Line */}
            {currentTimePx > 0 && currentTimePx < (dynamicTotalHours * zoomLevel) && (
              <div 
                className="absolute top-0 bottom-0 w-px bg-red-500 z-20 shadow-[0_0_8px_rgba(239,68,68,0.6)] pointer-events-none"
                style={{ left: `${currentTimePx + 192}px` }} // +192px for the Bay column width
              >
                <div className="absolute -top-3 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full z-20">
                  NOW
                </div>
              </div>
            )}

            {/* Rows */}
            {allRows.map((bay) => {
              let dept = departments.find(dept => dept.id === bay.departmentId);
              let schedule = dept?.defaultSchedule;
              if (!schedule) {
                schedule = { days: [1,2,3,4,5], startTime: '08:00', endTime: '17:00' };
              }
              
              return (
              <div key={bay.id} className="flex border-b border-zinc-100 dark:border-zinc-800/50 group h-24 relative hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors">
                {/* Left Fixed Column: Bay Info */}
                <div className="w-48 shrink-0 border-r border-zinc-200 dark:border-zinc-800 p-4 sticky left-0 z-20 bg-white dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900/80 transition-colors flex items-center justify-between">
                  <h3 className="font-bold text-sm text-zinc-900 dark:text-white truncate">{bay.name || bay.id}</h3>
                </div>
                
                {/* Scrollable Timeline Track */}
                <div 
                  className="relative flex-1"
                  style={{ width: `${dynamicTotalHours * zoomLevel}px`, minWidth: `${dynamicTotalHours * zoomLevel}px` }}
                  onDrop={(e) => handleDropOnGrid(e, bay.name || bay.id)}
                  onDragOver={handleDragOver}
                >
                  {/* Grid Lines */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {Array.from({ length: dynamicTotalHours }).map((_, i) => {
                      const d = new Date(timelineStart);
                      d.setHours(d.getHours() + i);
                      
                      let isWorkingHour = true;
                      if (!isWorkingDay(d, schedule)) {
                        isWorkingHour = false;
                      } else {
                        const startH = parseInt(schedule.startTime.split(':')[0], 10);
                        const endH = parseInt(schedule.endTime.split(':')[0], 10);
                        if (d.getHours() < startH || d.getHours() >= endH) {
                          isWorkingHour = false;
                        }
                      }

                      return (
                        <div 
                          key={i} 
                          className={`border-r border-zinc-200 dark:border-zinc-800 h-full ${!isWorkingHour ? 'bg-zinc-100/50 dark:bg-zinc-900/50' : ''}`} 
                          style={{ 
                            width: `${zoomLevel}px`,
                            backgroundImage: !isWorkingHour ? 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.02) 10px, rgba(0,0,0,0.02) 20px)' : 'none'
                          }} 
                        />
                      );
                    })}
                  </div>

                  {/* Render Jobs for this Bay */}
                  {visualCascadedJobs
                    .filter((j: any) => (j._renderedBayKey === bay.name || j._renderedBayKey === bay.id) || (bay.id === 'unassigned' && j._renderedBayKey === 'unassigned'))
                    .map((job: any) => (
                      <TimelineJobBlock 
                        key={job.id} 
                        job={job} 
                        tenantId={tenantId}
                        staffList={staffList}
                        timelineStart={timelineStart}
                        zoomLevel={zoomLevel}
                        schedule={schedule}
                        onDragStart={handleDragStart}
                        onUnschedule={handleUnschedule}
                        monitorSettings={monitorSettings}
                        partsRequests={partsRequests}
                        now={now}
                      />
                  ))}
                </div>
              </div>
            )})}
          </div>
         </div>
        </div>
      </div>
    </div>
  );
}
