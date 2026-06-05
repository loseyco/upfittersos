import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, updateDoc, doc, serverTimestamp, onSnapshot, writeBatch, orderBy, limit, collectionGroup, deleteField } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Calendar as CalendarIcon, Car, AlertCircle, GripHorizontal, RefreshCw, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize, X, Search, Edit2, MapPin } from 'lucide-react';
import { useJobPartsStatus } from './hooks/useJobPartsStatus';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth/store';
import { getDocs } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { StaffLink } from './StaffPerformance';


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

export function isJobTrackedByBay(bay: any, job: any) {
  if (bay.currentJobId === job.id) return true;
  
  // Check if the job's bayId matches this bay (case-insensitively)
  if (job.bayId) {
    const jBay = String(job.bayId).toLowerCase().trim();
    const bId = String(bay.id).toLowerCase().trim();
    const bName = String(bay.name || '').toLowerCase().trim();
    if (jBay === bId || jBay === bName) return true;
  }
  
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
}

interface ScheduleBoardProps {
  tenantId: string;
}

function TimelineJobBlock({ job, tenantId, staffList, zones, sessions, viewMode, timelineStart, zoomLevel, schedule, onDragStart, onUnschedule, monitorSettings, partsRequests, now }: { job: any, tenantId: string, staffList: any[], zones: any[], sessions: any[], viewMode: 'bays' | 'staff', timelineStart: Date, zoomLevel: number, schedule: WorkSchedule, onDragStart: (e: React.DragEvent, job: any) => void, onUnschedule: (jobId: string, staffId?: string) => void, monitorSettings: any, partsRequests: any[], now: Date }) {
  const navigate = useNavigate();
  const { data: partsInfo } = useJobPartsStatus(tenantId, job.id);
  
  const handleEditHours = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const input = window.prompt("Enter scheduled hours override for this job:", job.scheduledHours || job.estimatedHours || "");
    if (input === null) return;
    
    const parsed = parseFloat(input);
    if (isNaN(parsed) || parsed <= 0) {
      // Clear override
      try {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, job.id), {
          scheduledHours: null,
          updatedAt: serverTimestamp()
        });
        toast.success("Cleared scheduled hours override");
      } catch (err) {
        toast.error("Failed to clear override");
      }
    } else {
      try {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, job.id), {
          scheduledHours: parsed,
          updatedAt: serverTimestamp()
        });
        toast.success(`Set scheduled hours to ${parsed}h`);
      } catch (err) {
        toast.error("Failed to set override");
      }
    }
  };

  const currentZone = zones?.find(z => isJobTrackedByBay(z, job));
  
  const getRowActualTimeInfo = () => {
    let ms = 0;
    let isActive = false;
    
    if (!sessions) return { ms, isActive };
    
    sessions.forEach(session => {
      if (viewMode === 'staff' && job._renderedRowKey && job._renderedRowKey !== 'unassigned') {
        if (session.userId !== job._renderedRowKey) return;
      }
      
      const taskSegments = (session.jobs || []).filter((j: any) => j.id === job.id);
      taskSegments.forEach((seg: any) => {
        const startVal = seg.start?.toDate ? seg.start.toDate().getTime() : new Date(seg.start).getTime();
        
        let endVal = now.getTime();
        let isSegActive = false;
        
        if (seg.end) {
          endVal = seg.end.toDate ? seg.end.toDate().getTime() : new Date(seg.end).getTime();
        } else if (session.status === 'active' || session.status === 'on_break') {
          endVal = now.getTime();
          isSegActive = true;
        } else {
          const clockOutVal = session.clockOut?.timestamp;
          if (clockOutVal) {
            endVal = clockOutVal.toDate ? clockOutVal.toDate().getTime() : new Date(clockOutVal).getTime();
          } else {
            const updatedVal = session.updatedAt || session.createdAt;
            endVal = updatedVal?.toDate ? updatedVal.toDate().getTime() : new Date(updatedVal || startVal).getTime();
          }
        }
        
        if (isSegActive) {
          isActive = true;
        }
        
        ms += Math.max(0, endVal - startVal);
      });
    });
    
    return { ms, isActive };
  };

  const formatActualTime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const actualTimeInfo = getRowActualTimeInfo();
  
  const hasPartsConflict = (partsInfo?.status === 'Blocked' || partsInfo?.status === 'Pending with ETA');
  
  const startMs = job._visualStartMs || (job.scheduledStartDate ? new Date(job.scheduledStartDate).getTime() : null);
  const endMs = job._visualEndMs || null;
  const estimatedHours = job._rowEstimatedHours || parseFloat(job.scheduledHours || job.estimatedHours) || 1; // Default to 1 hour if not set
  
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

  const isFinished = ['Ready for QC', 'Ready for Customer', 'Completed'].includes(job?.status || '');
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
                           <h4 className="font-bold text-xs text-white truncate">
                            {job.jobNumber ? `#${job.jobNumber} - ` : ''}{job.title || 'Untitled'}
                          </h4>
                          {job.vehicleId && (
                            <div className="flex items-center gap-1 text-[9px] text-white/60 font-medium mt-1">
                              <Car className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{job.vehicleId}</span>
                            </div>
                          )}
                          {currentZone && (
                            <div className="flex items-center gap-1 text-[9px] text-white/80 font-black uppercase tracking-wider mt-1.5 bg-black/25 px-1.5 py-0.5 rounded w-fit border border-white/5">
                              <MapPin className="w-2.5 h-2.5 shrink-0 text-white" />
                              <span className="truncate">{currentZone.name}</span>
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
                                <div 
                                  key={staffId} 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/business/${tenantId}/staff/${staffId}`);
                                  }}
                                  className="w-4 h-4 rounded-full bg-black/20 border border-white/10 flex items-center justify-center text-[7px] font-black text-white shadow-sm hover:bg-indigo-600 hover:scale-110 cursor-pointer transition-all" 
                                  title={`${staff.firstName} ${staff.lastName}`}
                                >
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
                        onUnschedule(job.id, job._renderedRowKey);
                      }}
                      className="absolute top-0 right-0 p-1 bg-black/20 hover:bg-red-500 text-white/50 hover:text-white rounded-bl-lg rounded-tr-xl opacity-0 group-hover:opacity-100 transition-colors z-20 pointer-events-auto"
                      title="Unschedule Job"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5 mt-2">
                    <div className="flex items-center justify-between text-[9px] font-bold">
                      <span 
                        onClick={handleEditHours}
                        className="text-white hover:text-indigo-200 cursor-pointer flex items-center gap-1 bg-black/20 hover:bg-black/40 px-1.5 py-0.5 rounded transition-all pointer-events-auto shadow-sm border border-white/5"
                        title="Click to set custom scheduled hours override"
                      >
                        <Edit2 className="w-2.5 h-2.5 shrink-0 text-white/70" />
                        {estimatedHours}h {job.scheduledHours ? 'Override' : 'Book Time'}
                      </span>
                      {partsInfo && partsInfo.status !== 'No Parts Needed' && (
                        <span className={hasPartsConflict ? 'text-red-500 font-black' : 'text-emerald-400 font-black'}>
                          {partsInfo.status === 'Ready' ? 'Parts Ready' : 'Parts Conflict'}
                        </span>
                      )}
                    </div>
                    {actualTimeInfo.ms > 0 && (
                      <div className="flex items-center justify-between text-[9px] font-bold pointer-events-none">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded border flex items-center gap-1 text-[8px] font-black uppercase tracking-wider",
                          actualTimeInfo.isActive 
                            ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/40 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]" 
                            : "bg-black/25 text-white/70 border-white/5"
                        )}>
                          <span className={cn(
                            "w-1 h-1 rounded-full shrink-0",
                            actualTimeInfo.isActive ? "bg-emerald-400 animate-pulse" : "bg-white/40"
                          )} />
                          {actualTimeInfo.isActive ? 'Clocked In: ' : 'Logged Work: '}
                          {formatActualTime(actualTimeInfo.ms)}
                        </span>
                      </div>
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
  const [zones, setZones] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [zoomLevel, setZoomLevel] = useState(60); // px per hour
  const [now, setNow] = useState(new Date());
  const [timelineStart, setTimelineStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [monitorSettings, setMonitorSettings] = useState<any>(null);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [unscheduledSearch, setUnscheduledSearch] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewMode: any = 'staff';



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

    // Fetch Bays and Zones (Bays, Lot, Parking)
    const unsubZones = onSnapshot(collection(db, `businesses/${tenantId}/zones`), (snap) => {
      const allZones = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(z => !z.isArchived);
      
      setZones(allZones);

      const bayData = allZones.filter(z => z.type === 'bay');
      bayData.sort((a: any, b: any) => 
        (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
      );
      setBays(bayData);
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

    // Fetch Timeclock Sessions exactly like the Bay Worksheet
    const qSessions = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      orderBy('clockIn.timestamp', 'desc'),
      limit(200)
    );
    const unsubSessions = onSnapshot(qSessions, (snap) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allSessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const todaySessions = allSessions.filter(s => {
        if (!s.clockIn?.timestamp) return false;
        const date = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
        return date >= today || s.status !== 'completed';
      });
      setSessions(todaySessions);
    });

    return () => {
      unsubJobs();
      unsubZones();
      unsubDepts();
      unsubSettings();
      unsubParts();
      unsubSessions();
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const qTasks = query(
      collectionGroup(db, 'tasks'),
      where('tenantId', '==', tenantId)
    );
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      setTasks(snap.docs.map(doc => {
        const parts = doc.ref.path.split('/');
        const jobId = parts[parts.indexOf('jobs') + 1];
        return { id: doc.id, jobId, ...doc.data() };
      }));
    });
    return () => unsubTasks();
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

  const handlePrevDay = () => {
    setTimelineStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  };

  const handleNextDay = () => {
    setTimelineStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  };

  const handleToday = () => {
    setTimelineStart(() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
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



  let unscheduledJobs = jobs.filter(j => {
    const isTrackedByBay = bays.some(b => isJobTrackedByBay(b, j));
    
    // If the user is actively searching, bypass the "scheduled" filter so they can find ANY active job!
    const isSearching = !!unscheduledSearch.trim();

    if (!isSearching) {
      if (viewMode === 'bays') {
        if ((j.bayId && j.scheduledStartDate) || isTrackedByBay) return false;
      } else {
        const staffIds = j.assignedStaffIds || [];
        const hasUnscheduledStaff = staffIds.some((staffId: string) => {
          if (j.staffSchedules) {
            return !j.staffSchedules[staffId];
          }
          return !j.scheduledStartDate;
        });
        if (staffIds.length > 0 && !hasUnscheduledStaff) return false;
      }
    }
    
    const isFinished = ['Completed', 'Closed'].includes(j.status || '');
    if (isFinished) return false;
    if (j.isArchived) return false;

    // Hard filter: MUST have at least one active (incomplete) task,
    // UNLESS it is currently in a bay!
    const isInBay = !!(j.currentBaySessionStart || isTrackedByBay);

    const jobTasks = tasks.filter(t => t.jobId === j.id);
    const incompleteCount = jobTasks.filter(t => !t.completedAt).length;
    if (incompleteCount === 0 && !isInBay) return false;

    // Bypasses priority filter if user is actively searching
    if (unscheduledSearch.trim()) return true;

    // Prioritized backlog filter
    const hasEta = !!(j.eta || j.expectedFinishTime || j.scheduledEndDate);
    const hasBookTime = parseFloat(j.scheduledHours || j.estimatedHours || '0') > 0;
    const hasStaff = j.assignedStaffIds && j.assignedStaffIds.length > 0;

    return hasEta || hasBookTime || hasStaff;
  });
  
  if (unscheduledSearch.trim()) {
    const q = unscheduledSearch.toLowerCase().trim();
    unscheduledJobs = unscheduledJobs.filter(j => {
      const matchTitle = (j.title || '').toLowerCase().includes(q);
      const matchCust = (j.customerName || '').toLowerCase().includes(q);
      const matchVin = (j.vehicleVin || '').toLowerCase().includes(q);
      const matchVeh = (j.vehicleName || '').toLowerCase().includes(q) || 
                       `${j.vehicleYear || ''} ${j.vehicleMake || ''} ${j.vehicleModel || ''}`.toLowerCase().includes(q);
      const matchJobNum = j.jobNumber ? String(j.jobNumber).toLowerCase().includes(q) : false;
      const matchId = String(j.id || '').toLowerCase().includes(q);
      const matchVehId = (j.vehicleId || '').toLowerCase().includes(q);
      
      const matchStaff = (j.assignedStaffIds || []).some((staffId: string) => {
        const staff = staffList.find(s => s.id === staffId);
        if (!staff) return false;
        return `${staff.firstName || ''} ${staff.lastName || ''}`.toLowerCase().includes(q);
      });

      return matchTitle || matchCust || matchVin || matchVeh || matchJobNum || matchId || matchVehId || matchStaff;
    });
  }

  // Helper to determine sorting group and value for backlog prioritization
  const getUnscheduledPriority = (j: any) => {
    const etaRaw = j.expectedFinishTime || j.eta || j.scheduledEndDate;
    const hasEta = !!etaRaw;
    const etaMs = hasEta ? new Date(etaRaw).getTime() : null;
    const isOverdue = etaMs && etaMs < now.getTime();
    const isNextDue = etaMs && etaMs >= now.getTime();
    
    const hasDatesAssigned = !!(j.scheduledStartDate || j.scheduledEndDate);
    const hasBookTime = parseFloat(j.scheduledHours || j.estimatedHours || '0') > 0;
    
    const arrivalRaw = j.scheduledArrivalTime;
    const isOnSite = arrivalRaw && new Date(arrivalRaw).getTime() <= now.getTime();

    if (isOverdue) return { group: 1, val: etaMs }; // 1. Overdue (earliest first)
    if (isNextDue) return { group: 2, val: etaMs }; // 2. Next due (earliest first)
    if (hasDatesAssigned) {
      const startMs = j.scheduledStartDate ? new Date(j.scheduledStartDate).getTime() : Infinity;
      return { group: 3, val: startMs }; // 3. Dates Assigned (earliest first)
    }
    if (hasBookTime) return { group: 4, val: -parseFloat(j.scheduledHours || j.estimatedHours) }; // 4. Booked Tasks (highest book time first)
    if (isOnSite) {
      const arrMs = new Date(arrivalRaw).getTime();
      return { group: 5, val: arrMs }; // 5. On Site (earliest arrival first)
    }
    return { group: 6, val: j.jobNumber || j.title || '' }; // 6. Rest of shop
  };

  // Sort according to user requested priority
  unscheduledJobs.sort((a, b) => {
    const pA = getUnscheduledPriority(a);
    const pB = getUnscheduledPriority(b);
    
    if (pA.group !== pB.group) {
      return pA.group - pB.group;
    }
    
    if (typeof pA.val === 'number' && typeof pB.val === 'number') {
      return pA.val - pB.val;
    }
    return String(pA.val).localeCompare(String(pB.val));
  });
  
  const displayedUnscheduled = unscheduledJobs.slice(0, 50);

  const scheduledJobs = jobs.filter(j => {
    if (viewMode === 'bays') {
      const isTrackedByBay = bays.some(b => isJobTrackedByBay(b, j));
      return (j.bayId && (j.scheduledStartDate || true)) || isTrackedByBay;
    } else {
      const hasLegacyGlobal = !j.staffSchedules && j.scheduledStartDate && j.assignedStaffIds && j.assignedStaffIds.length > 0;
      const hasStaffSchedules = j.staffSchedules && Object.keys(j.staffSchedules).length > 0;
      return hasLegacyGlobal || hasStaffSchedules;
    }
  });

  const activeStaff = useMemo(() => {
    const scheduledStaffIds = new Set(
      scheduledJobs.flatMap(j => j.assignedStaffIds || [])
    );

    return staffList
      .map(s => {
        const dept = departments.find(d => d.id === s.departmentId);
        const staffSession = sessions.find(sess => sess.userId === s.id || sess.userId === s.userId);
        const isClockedIn = staffSession && staffSession.status !== 'completed';
        
        return {
          ...s,
          name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
          deptName: dept ? dept.name : 'Unassigned',
          isScheduled: scheduledStaffIds.has(s.id),
          isClockedIn: !!isClockedIn
        };
      })
      .filter((s: any) => !s.isArchived && !s.fireDate)
      .sort((a, b) => {
        // Tier 1: Scheduled on the active timeline (isScheduled)
        if (a.isScheduled !== b.isScheduled) {
          return a.isScheduled ? -1 : 1;
        }
        
        // Tier 2: Clocked in today (isClockedIn)
        if (a.isClockedIn !== b.isClockedIn) {
          return a.isClockedIn ? -1 : 1;
        }
        
        // Tier 3: Sort by department name
        if (a.deptName !== b.deptName) {
          if (a.deptName === 'Unassigned') return 1;
          if (b.deptName === 'Unassigned') return -1;
          return a.deptName.localeCompare(b.deptName);
        }
        // Tier 4: Sort alphabetically by name
        return a.name.localeCompare(b.name);
      });
  }, [staffList, departments, scheduledJobs, sessions]);

  const handleDragStart = (e: React.DragEvent, job: any) => {
    e.dataTransfer.setData('jobId', job.id);
    e.dataTransfer.setData('offsetX', e.nativeEvent.offsetX.toString());
    if (job._renderedRowKey) {
      e.dataTransfer.setData('fromStaffId', job._renderedRowKey);
    }
  };

  const handleDropOnGrid = async (e: React.DragEvent, rowId: string) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('jobId');
    const dragOffsetX = parseFloat(e.dataTransfer.getData('offsetX') || '0');
    const fromStaffId = e.dataTransfer.getData('fromStaffId');
    
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
    let estimatedHours = parseFloat(job?.scheduledHours || job?.estimatedHours || '1');
    
    if (viewMode === 'staff' && rowId !== 'unassigned') {
      const staffTasks = tasks.filter(t => t.jobId === jobId && t.assignedStaffIds?.includes(rowId));
      const staffBookTime = staffTasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);
      if (staffBookTime > 0) {
        estimatedHours = staffBookTime;
      } else {
        estimatedHours = 1;
      }
    }
    
    let dept;
    let staffObj: any;
    if (viewMode === 'bays') {
      const bayObj = [...bays, { id: 'unassigned', name: 'Unassigned / Mobile' }].find(r => r.id === rowId || r.name === rowId);
      dept = departments.find(d => d.id === bayObj?.departmentId);
    } else {
      staffObj = activeStaff.find(s => s.id === rowId);
      dept = departments.find(d => d.id === staffObj?.departmentId);
    }
    
    let schedule = dept?.defaultSchedule ? { ...dept.defaultSchedule } : { days: [1,2,3,4,5], startTime: '08:00', endTime: '17:00' };
    
    // If staff member is clocked in today, treat today as a working day for them!
    if (staffObj?.isClockedIn) {
      const todayDay = new Date().getDay();
      const smDay = todayDay === 0 ? 7 : todayDay;
      if (!schedule.days.includes(smDay)) {
        schedule.days = [...schedule.days, smDay];
      }
    }
    
    const endDate = projectWorkingHours(snappedDate, estimatedHours, schedule);

    try {
      const batch = writeBatch(db);
      const droppedJobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
      
      let newStaffIds = [...(job?.assignedStaffIds || [])];
      let currentSchedules = { ...(job?.staffSchedules || {}) };
      
      if (viewMode === 'bays') {
        batch.update(droppedJobRef, {
          scheduledStartDate: snappedDate.toISOString(),
          scheduledEndDate: endDate.toISOString(),
          bayId: rowId, // Associate with the bay row dropped into
          updatedAt: serverTimestamp()
        });
      } else {
        if (fromStaffId && fromStaffId !== rowId) {
          // Relocate: delete schedule for the old staff member
          delete currentSchedules[fromStaffId];
          newStaffIds = newStaffIds.filter(id => id !== fromStaffId);
        }
        
        // Add/update schedule for the new staff member
        currentSchedules[rowId] = {
          scheduledStartDate: snappedDate.toISOString(),
          scheduledEndDate: endDate.toISOString()
        };
        if (!newStaffIds.includes(rowId)) {
          newStaffIds.push(rowId);
        }
        
        batch.update(droppedJobRef, {
          scheduledStartDate: snappedDate.toISOString(), // Global fallback
          scheduledEndDate: endDate.toISOString(), // Global fallback
          assignedStaffIds: newStaffIds,
          staffSchedules: currentSchedules,
          updatedAt: serverTimestamp()
        });
      }

      // --- Cascade Logic ---
      // Get all OTHER jobs in this row that are scheduled to start AT or AFTER the dropped job's start time
      const droppedStartTime = snappedDate.getTime();
      
      const otherJobsInRow = jobs.filter(j => {
        if (j.id === jobId) return false;
        
        if (viewMode === 'bays') {
          if (!j.scheduledStartDate) return false;
          if (parseFloat(j.scheduledHours || j.estimatedHours || '0') <= 0) return false;
          if (new Date(j.scheduledStartDate).getTime() < droppedStartTime) return false;
          return j.bayId === rowId;
        } else {
          const startStr = j.staffSchedules?.[rowId]?.scheduledStartDate || (!j.staffSchedules ? j.scheduledStartDate : null);
          if (!startStr) return false;
          
          let estHours = parseFloat(j.scheduledHours || j.estimatedHours);
          const staffTasks = tasks.filter(t => t.jobId === j.id && t.assignedStaffIds?.includes(rowId));
          const staffBookTime = staffTasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);
          if (staffBookTime > 0) {
            estHours = staffBookTime;
          } else if (isNaN(estHours) || estHours <= 0) {
            estHours = 1;
          }
          
          if (estHours <= 0) return false;
          if (new Date(startStr).getTime() < droppedStartTime) return false;
          return j.assignedStaffIds?.includes(rowId);
        }
      });

      // Sort them chronologically by start date
      otherJobsInRow.sort((a, b) => {
        const timeA = viewMode === 'bays' 
          ? new Date(a.scheduledStartDate).getTime() 
          : new Date(a.staffSchedules?.[rowId]?.scheduledStartDate || a.scheduledStartDate).getTime();
        const timeB = viewMode === 'bays' 
          ? new Date(b.scheduledStartDate).getTime() 
          : new Date(b.staffSchedules?.[rowId]?.scheduledStartDate || b.scheduledStartDate).getTime();
        return timeA - timeB;
      });

      let currentEndTime = endDate;

      for (const otherJob of otherJobsInRow) {
        // Calculate the 10-minute buffer start time (respecting working hours)
        const bufferStart = currentEndTime;
        const gapEnd = projectWorkingHours(bufferStart, 10 / 60, schedule);
        
        let otherEstHours = parseFloat(otherJob.scheduledHours || otherJob.estimatedHours) || 1;
        if (viewMode === 'staff') {
          const staffTasks = tasks.filter(t => t.jobId === otherJob.id && t.assignedStaffIds?.includes(rowId));
          const staffBookTime = staffTasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);
          if (staffBookTime > 0) {
            otherEstHours = staffBookTime;
          }
        }
        
        const otherNewEnd = projectWorkingHours(gapEnd, otherEstHours, schedule);
        const otherJobRef = doc(db, `businesses/${tenantId}/jobs`, otherJob.id);
        
        if (viewMode === 'bays') {
          batch.update(otherJobRef, {
            scheduledStartDate: gapEnd.toISOString(),
            scheduledEndDate: otherNewEnd.toISOString(),
            updatedAt: serverTimestamp()
          });
        } else {
          const otherSchedules = { ...(otherJob.staffSchedules || {}) };
          otherSchedules[rowId] = {
            scheduledStartDate: gapEnd.toISOString(),
            scheduledEndDate: otherNewEnd.toISOString()
          };
          batch.update(otherJobRef, {
            scheduledStartDate: gapEnd.toISOString(), // Global fallback
            scheduledEndDate: otherNewEnd.toISOString(), // Global fallback
            staffSchedules: otherSchedules,
            updatedAt: serverTimestamp()
          });
        }
        
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

  const handleUnschedule = async (jobId: string, staffId?: string) => {
    try {
      if (viewMode === 'bays') {
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
          scheduledStartDate: null,
          scheduledEndDate: null,
          bayId: null,
          updatedAt: serverTimestamp()
        });
      } else {
        const job = jobs.find(j => j.id === jobId);
        if (staffId) {
          const currentSchedules = { ...(job?.staffSchedules || {}) };
          delete currentSchedules[staffId];
          const newStaffIds = (job?.assignedStaffIds || []).filter((id: string) => id !== staffId);
          
          const updateData: any = {
            staffSchedules: currentSchedules,
            assignedStaffIds: newStaffIds,
            updatedAt: serverTimestamp()
          };
          
          if (Object.keys(currentSchedules).length === 0) {
            updateData.scheduledStartDate = null;
            updateData.scheduledEndDate = null;
            updateData.staffSchedules = deleteField(); // fully remove field from db if empty
          } else {
            const firstStaff = Object.keys(currentSchedules)[0];
            updateData.scheduledStartDate = currentSchedules[firstStaff].scheduledStartDate;
            updateData.scheduledEndDate = currentSchedules[firstStaff].scheduledEndDate;
          }
          
          await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), updateData);
        } else {
          await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), {
            scheduledStartDate: null,
            scheduledEndDate: null,
            staffSchedules: deleteField(),
            assignedStaffIds: [], // Clear all staff assignments
            updatedAt: serverTimestamp()
          });
        }
      }
      toast.success('Job unscheduled');
    } catch (err) {
      console.error(err);
      toast.error('Failed to unschedule job');
    }
  };

  const handleDropOnSidebar = async (e: React.DragEvent) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('jobId');
    const fromStaffId = e.dataTransfer.getData('fromStaffId');
    if (!jobId) return;
    await handleUnschedule(jobId, fromStaffId || undefined);
  };


  // Live Timeline Projection Engine
  const visualCascadedJobs = useMemo(() => {
    const result: any[] = [];
    const jobsByRow: Record<string, any[]> = {};
    
    if (viewMode === 'bays') {
      // Group scheduled jobs by bay ID (normalizing name/ID mismatches)
      scheduledJobs.forEach(job => {
        let bayKey = job.bayId;
        const matchedBay = bays.find(b => {
          const bId = String(b.id).toLowerCase().trim();
          const bName = String(b.name || '').toLowerCase().trim();
          const jBay = String(bayKey || '').toLowerCase().trim();
          return bId === jBay || bName === jBay || isJobTrackedByBay(b, job);
        });
        bayKey = matchedBay ? matchedBay.id : 'unassigned';
        
        if (!jobsByRow[bayKey]) jobsByRow[bayKey] = [];
        jobsByRow[bayKey].push(job);
      });
    } else {
      // Group scheduled jobs by staff member
      scheduledJobs.forEach(job => {
        const staffIds = job.assignedStaffIds || [];
        if (staffIds.length === 0) {
          const staffKey = 'unassigned';
          if (!jobsByRow[staffKey]) jobsByRow[staffKey] = [];
          jobsByRow[staffKey].push({ ...job });
        } else {
          staffIds.forEach((staffId: string) => {
            const hasStaffSchedule = job.staffSchedules && job.staffSchedules[staffId];
            const hasLegacyGlobalSchedule = !job.staffSchedules && job.scheduledStartDate;
            
            if (hasStaffSchedule || hasLegacyGlobalSchedule) {
              if (!jobsByRow[staffId]) jobsByRow[staffId] = [];
              const staffSpecificJob = { ...job };
              if (hasStaffSchedule) {
                staffSpecificJob.scheduledStartDate = job.staffSchedules[staffId].scheduledStartDate;
                staffSpecificJob.scheduledEndDate = job.staffSchedules[staffId].scheduledEndDate;
              }
              jobsByRow[staffId].push(staffSpecificJob);
            }
          });
        }
      });
    }
    
    Object.keys(jobsByRow).forEach(rowKey => {
      const rowJobs = jobsByRow[rowKey];
      // Sort by planned start date
      rowJobs.sort((a, b) => {
        if (viewMode === 'bays') {
          // Is actively tracked by this bay via Bay Monitor?
          const aActive = bays.some(bay => 
            (bay.id === rowKey || bay.name === rowKey) && isJobTrackedByBay(bay, a)
          );
          const bActive = bays.some(bay => 
            (bay.id === rowKey || bay.name === rowKey) && isJobTrackedByBay(bay, b)
          );
          
          if (aActive && !bActive) return -1;
          if (!aActive && bActive) return 1;
        }

        const timeA = a.scheduledStartDate ? new Date(a.scheduledStartDate).getTime() : now.getTime();
        const timeB = b.scheduledStartDate ? new Date(b.scheduledStartDate).getTime() : now.getTime();
        return timeA - timeB;
      });
      
      let previousVisualEndMs = 0;
      
      rowJobs.forEach(job => {
        const originalStartMs = job.scheduledStartDate ? new Date(job.scheduledStartDate).getTime() : now.getTime();
        
        let estimatedHours = parseFloat(job.scheduledHours || job.estimatedHours);
        let isZeroBookTime = false;
        
        if (viewMode === 'staff' && rowKey !== 'unassigned') {
          const staffTasks = tasks.filter(t => t.jobId === job.id && t.assignedStaffIds?.includes(rowKey));
          const staffBookTime = staffTasks.reduce((sum, t) => sum + (parseFloat(t.bookTime) || 0), 0);
          if (staffBookTime > 0) {
            estimatedHours = staffBookTime;
          } else {
            isZeroBookTime = true;
            estimatedHours = 1; // Default to 1 hr if they have no tasks assigned yet but the job is scheduled on their row
          }
        } else {
          if (isNaN(estimatedHours) || estimatedHours <= 0) {
            isZeroBookTime = true;
            estimatedHours = 1; // Default to 1 hr if no book time and no ETA
          }
        }
        
        const etaRaw = job.expectedFinishTime || job.eta;
        let etaMs: number | null = null;
        if (etaRaw) {
          etaMs = typeof etaRaw.toDate === 'function' ? etaRaw.toDate().getTime() : new Date(etaRaw).getTime();
        }
        
        let schedule;
        if (viewMode === 'bays') {
          let dept = departments.find(d => bays.find(b => (b.name === rowKey || b.id === rowKey))?.departmentId === d.id);
          schedule = dept?.defaultSchedule ? { ...dept.defaultSchedule } : { days: [1,2,3,4,5], startTime: '08:00', endTime: '17:00' };
        } else {
          const staffObj = activeStaff.find(s => s.id === rowKey);
          let dept = departments.find(d => staffObj?.departmentId === d.id);
          schedule = dept?.defaultSchedule ? { ...dept.defaultSchedule } : { days: [1,2,3,4,5], startTime: '08:00', endTime: '17:00' };
          
          // If staff member is currently clocked in today, treat today as a working day for them!
          if (staffObj?.isClockedIn) {
            const todayDay = new Date().getDay();
            const smDay = todayDay === 0 ? 7 : todayDay;
            if (!schedule.days.includes(smDay)) {
              schedule.days = [...schedule.days, smDay];
            }
          }
        }
        
        // 1. Calculate visual start (cascading from previous job's visual end + 10 mins buffer)
        let visualStartMs = originalStartMs;
        if (previousVisualEndMs > 0) {
          const bufferSegments = calculateJobSegments(new Date(previousVisualEndMs), 0.1333, schedule as any);
          const bufferEndMs = bufferSegments.length > 0 ? bufferSegments[bufferSegments.length - 1].end.getTime() : previousVisualEndMs + (10 * 60000);
          visualStartMs = Math.max(originalStartMs, bufferEndMs);
        }
        
        // Live Push: Conveyor Belt Logic
        const isFinished = ['Ready for QC', 'Ready for Customer', 'Completed', 'Closed'].includes(job.status || '');
        const hasTimeLogged = (job.totalBayTimeSeconds > 0) || (job.totalParkingTimeSeconds > 0) || !!job.currentBaySessionStart || !!job.currentParkingSessionStart;
        const isStarted = isFinished || hasTimeLogged;
        
        // 2. Calculate visual end
        let visualEndMs;
        let visualFinishedAtMs: number | null = null;
        
        if (isFinished) {
          const finishedAtRaw = job.updatedAt || job.scheduledEndDate;
          const finishedAt = finishedAtRaw ? (typeof finishedAtRaw.toDate === 'function' ? finishedAtRaw.toDate().getTime() : new Date(finishedAtRaw).getTime()) : visualStartMs;
          
          visualFinishedAtMs = finishedAt;
          visualEndMs = Math.max(visualStartMs + (15 * 60000), finishedAt);
          
          // Stretch to now if physically in bay (only in bays mode)
          if (viewMode === 'bays') {
            const isPhysicallyInBay = bays.some(b => (b.id === rowKey || b.name === rowKey) && isJobTrackedByBay(b, job));
            if (isPhysicallyInBay && now.getTime() > visualEndMs) {
              visualEndMs = now.getTime();
            }
          }
        } else {
          const startDay = new Date(visualStartMs);
          startDay.setHours(0,0,0,0);
          const todayDay = new Date(now);
          todayDay.setHours(0,0,0,0);
          const isPriorDay = startDay.getTime() < todayDay.getTime();

          // Only automatically push unstarted jobs to "now" if they are from a prior day,
          // allowing manual scheduling at earlier times on the current day!
          if (!isStarted && isPriorDay && now.getTime() > visualStartMs) {
            const segmentsFromNow = calculateJobSegments(now, estimatedHours, schedule as any);
            visualEndMs = segmentsFromNow.length > 0 ? segmentsFromNow[segmentsFromNow.length - 1].end.getTime() : now.getTime();
          } else {
            const segments = calculateJobSegments(new Date(visualStartMs), estimatedHours, schedule as any);
            visualEndMs = segments.length > 0 ? segments[segments.length - 1].end.getTime() : visualStartMs;
          }
          
          if (isStarted && now.getTime() > visualEndMs) {
            visualEndMs = now.getTime();
          }
          
          if (isZeroBookTime && etaMs && etaMs > visualStartMs) {
            visualEndMs = etaMs;
          }
        }
        
        result.push({
          ...job,
          _visualStartMs: visualStartMs,
          _visualEndMs: Math.max(visualStartMs + (15 * 60000), visualEndMs),
          _visualFinishedAtMs: visualFinishedAtMs,
          _renderedRowKey: rowKey,
          _rowEstimatedHours: estimatedHours
        });
        
        previousVisualEndMs = visualEndMs;
      });
    });
    
    return result;
  }, [scheduledJobs, now, bays, activeStaff, departments, viewMode, tasks]);

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

  // Dynamic rows based on the selected viewMode
  const allRows = viewMode === 'bays' ? bays : activeStaff;

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
            <button onClick={handlePrevDay} className="p-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={handleToday} className="px-3 py-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-sm font-bold text-zinc-700 dark:text-zinc-300 transition-colors">
              Today
            </button>
            <button onClick={handleNextDay} className="p-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors">
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
            {displayedUnscheduled.map(job => {
              const priority = getUnscheduledPriority(job);
              const jobTasks = tasks.filter(t => t.jobId === job.id);
              const incompleteCount = jobTasks.filter(t => !t.completedAt).length;

              // Calculate unique staff members assigned to the tasks of this job, along with their assigned task hours
              const taskStaffSummary: { id: string, name: string, initials: string, hours: number }[] = [];
              jobTasks.forEach(t => {
                if (t.assignedStaffIds && t.assignedStaffIds.length > 0) {
                  t.assignedStaffIds.forEach((staffId: string) => {
                    const staff = staffList.find(s => s.id === staffId);
                    if (!staff) return;
                    const hours = parseFloat(t.bookTime) || 0;
                    const existing = taskStaffSummary.find(item => item.id === staffId);
                    if (existing) {
                      existing.hours += hours;
                    } else {
                      taskStaffSummary.push({
                        id: staffId,
                        name: `${staff.firstName || ''} ${staff.lastName || ''}`,
                        initials: `${staff.firstName?.[0] || ''}${staff.lastName?.[0] || ''}`.toUpperCase(),
                        hours: hours
                      });
                    }
                  });
                }
              });

              const etaRaw = job.expectedFinishTime || job.eta || job.scheduledEndDate;
              let deadlineLabel = null;
              if (etaRaw) {
                const parsedDate = typeof etaRaw.toDate === 'function' ? etaRaw.toDate() : new Date(etaRaw);
                deadlineLabel = parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              }
              
              let priorityBadge = null;
              
              if (priority.group === 1) {
                priorityBadge = (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse shrink-0">
                    Overdue
                  </span>
                );
              } else if (priority.group === 2) {
                priorityBadge = (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-amber-550/10 text-amber-500 border border-amber-500/20 shrink-0">
                    Next Due
                  </span>
                );
              } else if (priority.group === 3) {
                priorityBadge = (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0">
                    Dates Set
                  </span>
                );
              } else if (priority.group === 4) {
                priorityBadge = (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0">
                    Has Task
                  </span>
                );
              } else if (priority.group === 5) {
                priorityBadge = (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                    On Site
                  </span>
                );
              }

              return (
                <div 
                  key={job.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, job)}
                  className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 shadow-sm cursor-grab hover:border-indigo-500/50 transition-colors group"
                >
                  <div className="flex flex-col gap-1.5 mb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <GripHorizontal className="w-3 h-3 text-zinc-300 shrink-0" />
                        <h4 className="font-bold text-xs text-zinc-900 dark:text-white truncate">
                          {job.jobNumber ? `#${job.jobNumber} - ` : ''}{job.title || 'Untitled'}
                        </h4>
                      </div>
                      {priorityBadge}
                    </div>
                    {(() => {
                      const currentZone = zones.find(z => isJobTrackedByBay(z, job));
                      const hasDetails = job.customerName || job.vehicleName || job.vehicleVin || incompleteCount > 0 || deadlineLabel || currentZone;
                      if (!hasDetails) return null;
                      return (
                        <div className="pl-5 text-[10px] text-zinc-500 truncate space-y-0.5">
                          {job.customerName && <div className="font-bold text-zinc-700 dark:text-zinc-300 truncate">{job.customerName}</div>}
                          {(job.vehicleName || job.vehicleVin) && (
                            <div className="truncate">
                              <Car className="w-2.5 h-2.5 inline-block mr-1 opacity-70" />
                              {job.vehicleName} {job.vehicleVin ? `(${job.vehicleVin.slice(-6)})` : ''}
                            </div>
                          )}
                          {currentZone && (
                            <div className={`flex items-center gap-1 mt-1 text-[9px] font-black uppercase tracking-wider ${currentZone.type === 'bay' ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-650 dark:text-indigo-400'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${currentZone.type === 'bay' ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                              {currentZone.type === 'bay' ? `In Bay: ${currentZone.name}` : `Spot: ${currentZone.name}`}
                            </div>
                          )}
                          
                          {/* Task Count & Deadline */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[9px] font-black uppercase tracking-wider">
                            {incompleteCount > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500">
                                {incompleteCount} active task{incompleteCount > 1 ? 's' : ''}
                              </span>
                            )}
                            {deadlineLabel && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500">
                                Due {deadlineLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold pl-5">
                    <div className="flex flex-wrap gap-1 items-center shrink-0">
                      {taskStaffSummary.length > 0 ? (
                        taskStaffSummary.map((ts) => {
                          const isStaffScheduled = job.staffSchedules && job.staffSchedules[ts.id];
                          return (
                            <div 
                              key={ts.id} 
                              className={`px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-wider flex items-center gap-0.5 shadow-sm ${
                                isStaffScheduled
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-550/20"
                                  : "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
                              }`}
                              title={`${ts.name}: ${ts.hours}h of assigned tasks (${isStaffScheduled ? 'Scheduled' : 'Unscheduled'})`}
                            >
                              <span className={`w-1 h-1 rounded-full shrink-0 ${isStaffScheduled ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                              {ts.initials} ({ts.hours}h)
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
            );
          })}
          </div>
        </div>

        {/* Timeline Grid */}
        <div className="flex-1 overflow-auto custom-scrollbar relative bg-white dark:bg-zinc-950" ref={scrollRef}>
          <div className="w-max min-w-full min-h-full flex flex-col">
            {/* Header Row (Time) */}
            <div className="sticky top-0 z-30 flex bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 shadow-sm shrink-0">
            {/* Corner Cell */}
            <div className="w-48 shrink-0 border-r border-zinc-200 dark:border-zinc-800 p-4 flex items-end sticky left-0 z-40 bg-white dark:bg-zinc-950">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                {viewMode === 'bays' ? 'Bay' : 'Staff Member'}
              </span>
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
                style={{ left: `${currentTimePx + 192}px` }} // +192px for the row column width
              >
                <div className="absolute -top-3 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full z-20">
                  NOW
                </div>
              </div>
            )}

            {/* Rows */}
            {allRows.map((row) => {
              let dept = departments.find(dept => dept.id === row.departmentId);
              let schedule = dept?.defaultSchedule ? { ...dept.defaultSchedule } : { days: [1,2,3,4,5], startTime: '08:00', endTime: '17:00' };
              
              if (viewMode === 'staff' && row.isClockedIn) {
                const todayDay = new Date().getDay();
                const smDay = todayDay === 0 ? 7 : todayDay;
                if (!schedule.days.includes(smDay)) {
                  schedule.days = [...schedule.days, smDay];
                }
              }
              
              // If staff view mode, evaluate their live timeclock and schedule status
              let liveStatusNode = null;
              if (viewMode === 'staff') {
                const staffSession = sessions.find(s => s.userId === row.id || s.userId === row.userId);
                const activeJobSegment = staffSession?.jobs?.find((j: any) => !j.end);
                
                const scheduledNow = visualCascadedJobs.find(j => 
                  j._renderedRowKey === row.id &&
                  j._visualStartMs <= now.getTime() &&
                  j._visualEndMs >= now.getTime()
                );
                
                if (staffSession && staffSession.status !== 'completed') {
                  const isBreak = staffSession.status === 'on_break';
                  const clockedJobId = activeJobSegment?.id;
                  
                  if (isBreak) {
                    liveStatusNode = (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase tracking-wider animate-pulse shrink-0">
                        Break
                      </span>
                    );
                  } else if (clockedJobId) {
                    const clockedJob = jobs.find(j => j.id === clockedJobId);
                    const clockedJobNum = clockedJob?.jobNumber ? `#${clockedJob.jobNumber}` : 'Job';
                    
                    if (scheduledNow && scheduledNow.id === clockedJobId) {
                      liveStatusNode = (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-wider shrink-0" title="Clocked into scheduled job">
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                          On Schedule
                        </span>
                      );
                    } else if (scheduledNow) {
                      const scheduledJobNum = scheduledNow.jobNumber ? `#${scheduledNow.jobNumber}` : scheduledNow.title;
                      liveStatusNode = (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 text-[8px] font-black uppercase tracking-wider animate-pulse border border-orange-500/25 shrink-0" title={`Scheduled on ${scheduledJobNum}, but clocked into ${clockedJobNum} instead!`}>
                          <span className="w-1 h-1 rounded-full bg-orange-500" />
                          Off Sched: {clockedJobNum}
                        </span>
                      );
                    } else {
                      liveStatusNode = (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 text-[8px] font-black uppercase tracking-wider shrink-0" title={`Clocked into ${clockedJobNum} (unscheduled)`}>
                          Working: {clockedJobNum}
                        </span>
                      );
                    }
                  } else {
                    liveStatusNode = (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-500 text-[8px] font-black uppercase tracking-wider shrink-0">
                        Clocked In
                      </span>
                    );
                  }
                } else {
                  liveStatusNode = (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 text-[8px] font-bold uppercase tracking-wider shrink-0">
                      Clocked Out
                    </span>
                  );
                }
              }
              
              return (
              <div key={row.id} className="flex border-b border-zinc-100 dark:border-zinc-800/50 group h-24 relative hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors">
                {/* Left Fixed Column: Row Info */}
                <div className="w-48 shrink-0 border-r border-zinc-200 dark:border-zinc-800 p-4 sticky left-0 z-20 bg-white dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900/80 transition-colors flex items-center gap-3 justify-between">
                  {viewMode === 'bays' ? (
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-white truncate">{row.name || row.id}</h3>
                  ) : (
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center font-black text-indigo-500 dark:text-indigo-400 text-[10px] shrink-0">
                        {row.firstName?.[0] || ''}{row.lastName?.[0] || ''}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 justify-between">
                          <StaffLink 
                            name={row.name} 
                            tenantId={tenantId} 
                            staffId={row.id} 
                            className="font-bold text-xs text-zinc-900 dark:text-white hover:text-indigo-650 dark:hover:text-indigo-400 hover:underline truncate max-w-[80px]" 
                          />
                          {liveStatusNode}
                        </div>
                        {dept && (
                          <p className="text-[8px] text-zinc-400 font-bold uppercase tracking-wider truncate">
                            {dept.name}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Scrollable Timeline Track */}
                <div 
                  className="relative flex-1"
                  style={{ width: `${dynamicTotalHours * zoomLevel}px`, minWidth: `${dynamicTotalHours * zoomLevel}px` }}
                  onDrop={(e) => handleDropOnGrid(e, row.id)}
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

                  {/* Render Jobs for this Row */}
                  {visualCascadedJobs
                    .filter((j: any) => {
                      return j._renderedRowKey === row.id || (row.id === 'unassigned' && j._renderedRowKey === 'unassigned');
                    })
                    .map((job: any) => (
                      <TimelineJobBlock 
                        key={job.id} 
                        job={job} 
                        tenantId={tenantId}
                        staffList={staffList}
                        zones={zones}
                        sessions={sessions}
                        viewMode={viewMode}
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
