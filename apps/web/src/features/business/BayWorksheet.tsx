import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, query, orderBy, limit, doc, getDoc, updateDoc, serverTimestamp, onSnapshot 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Search, Building2, ExternalLink, ChevronDown, Clock, MapPin, X
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';
import { cn } from '../../lib/utils';

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  userId?: string;
  techNumber?: string;
  isArchived?: boolean;
  fireDate?: any;
  departmentId?: string;
}

interface TimeSession {
  id: string;
  userId: string;
  userName?: string;
  clockIn: { timestamp: any; location?: string; onSite?: boolean; };
  clockOut?: { timestamp: any; location?: string; onSite?: boolean; };
  breaks: Array<{ type: 'lunch' | 'normal'; start: any; end?: any; isPaid: boolean; }>;
  jobs?: Array<{ id: string; name: string; start: any; end?: any; taskId?: string; taskName?: string; }>;
  status: string;
}

interface Zone {
  id: string;
  name: string;
  type: string;
  currentJobId?: string;
  currentVehicleVin?: string;
  lastAssignedAt?: any;
  isArchived?: boolean;
}

export function BayWorksheet({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const { permissions, isSuperAdmin } = useAuthStore();
  const canManage = isSuperAdmin || permissions['timeclock.manage'] || permissions['staff.manage'];

  const [searchTerm, setSearchTerm] = useState('');
  const [now, setNow] = useState(Date.now());
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  // Live Subscription Data
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [jobsList, setJobsList] = useState<any[]>([]);
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [vehiclesList, setVehiclesList] = useState<any[]>([]);
  const [tasksMap, setTasksMap] = useState<Record<string, any[]>>({});
  
  // Excel Column Resizing State
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    bayName: 140,
    activeJob: 240,
    vehicle: 160,
    crew: 240,
    activeTask: 200,
    hours: 100,
    timeInBay: 110
  });

  const startColResizing = (e: React.PointerEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[colKey];

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setColWidths(prev => ({
        ...prev,
        [colKey]: Math.max(60, startWidth + deltaX)
      }));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const renderResizeHandle = (colKey: string) => (
    <div
      onPointerDown={(e) => startColResizing(e, colKey)}
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors z-35 select-none"
      style={{ touchAction: 'none' }}
    />
  );

  // Subscriptions setup
  useEffect(() => {
    if (!tenantId) return;

    // 1. Listen to staff
    const unsubStaff = onSnapshot(query(collection(db, `businesses/${tenantId}/staff`)), (snap) => {
      const activeStaff = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as StaffMember))
        .filter(s => !s.isArchived && !s.fireDate && s.departmentId);
      setStaffList(activeStaff);
    });

    // 2. Listen to jobs
    const unsubJobs = onSnapshot(query(collection(db, `businesses/${tenantId}/jobs`)), (snap) => {
      setJobsList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    // 3. Listen to zones
    const unsubZones = onSnapshot(query(collection(db, `businesses/${tenantId}/zones`)), (snap) => {
      setZonesList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    // 4. Listen to timeclock sessions for today
    const qSessions = query(collection(db, `businesses/${tenantId}/time_sessions`), orderBy('clockIn.timestamp', 'desc'), limit(200));
    const unsubSessions = onSnapshot(qSessions, (snap) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allSessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeSession));
      const todaySessions = allSessions.filter(s => {
        if (!s.clockIn?.timestamp) return false;
        const date = s.clockIn.timestamp.toDate ? s.clockIn.timestamp.toDate() : new Date(s.clockIn.timestamp);
        return date >= today || s.status !== 'completed';
      });
      setSessions(todaySessions);
    });

    // 5. Listen to vehicles
    const unsubVehicles = onSnapshot(query(collection(db, `businesses/${tenantId}/vehicles`), limit(1000)), (snap) => {
      setVehiclesList(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    return () => {
      unsubStaff();
      unsubJobs();
      unsubSessions();
      unsubZones();
      unsubVehicles();
    };
  }, [tenantId]);

  // Active Job IDs that we need tasks for
  const activeJobIds = useMemo(() => {
    const ids = new Set<string>();
    zonesList.forEach(z => {
      if ((z.type === 'bay' || z.type === 'parking' || z.type === 'lot') && !z.isArchived) {
        const activeJob = jobsList.find(j => 
          j.id === z.currentJobId || 
          (j.bayId && (j.bayId === z.id || j.bayId === z.name))
        );
        if (activeJob) {
          ids.add(activeJob.id);
        }
      }
    });
    return Array.from(ids);
  }, [zonesList, jobsList]);

  // Subscribe to tasks for each active jobId
  useEffect(() => {
    if (!tenantId || activeJobIds.length === 0) {
      setTasksMap({});
      return;
    }

    const unsubs = activeJobIds.map(jobId => {
      const q = query(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`));
      return onSnapshot(q, (snap) => {
        const jobTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setTasksMap(prev => ({
          ...prev,
          [jobId]: jobTasks
        }));
      }, (err) => {
        console.warn(`Could not subscribe to tasks for job ${jobId}:`, err);
      });
    });

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [tenantId, activeJobIds]);

  // Keep live time ticking every minute
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Helper calculation functions
  const calculateDuration = (start: any, end: any) => {
    if (!start) return 0;
    const s = start.toDate ? start.toDate().getTime() : new Date(start).getTime();
    const e = end ? (end.toDate ? end.toDate().getTime() : new Date(end).getTime()) : now;
    return Math.max(0, e - s);
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const formatBayDuration = (ms: number) => {
    if (ms <= 0) return '';
    const totalMinutes = Math.floor(ms / 60000);
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    
    if (days > 0) {
      const remainingHours = totalHours % 24;
      return `${days}d ${remainingHours}h`;
    }
    
    const minutes = totalMinutes % 60;
    if (totalHours > 0) {
      return `${totalHours}h ${minutes}m`;
    }
    
    return `${minutes}m`;
  };

  // Filtered and naturally sorted Bays list
  const filteredBays = useMemo(() => {
    return zonesList.filter(z => {
      if (z.isArchived || z.type !== 'bay') return false;
      
      const bayName = (z.name || '').toLowerCase();
      
      // Find active job if any
      const activeJobDoc = jobsList.find(j => 
        j.id === z.currentJobId || 
        (j.bayId && (j.bayId === z.id || j.bayId === z.name))
      );
      const jobTitle = activeJobDoc ? (activeJobDoc.jobNumber ? `#${activeJobDoc.jobNumber} - ${activeJobDoc.title}` : activeJobDoc.title).toLowerCase() : '';
      
      const isBayEmpty = !activeJobDoc;
      const matchesEmptySearch = isBayEmpty && 'empty'.includes(searchTerm.toLowerCase());
      
      // Vehicle details matching
      const vehicleDoc = vehiclesList.find(v => v.vin === z.currentVehicleVin);
      const vehicleStr = vehicleDoc ? `${vehicleDoc.year || ''} ${vehicleDoc.make || ''} ${vehicleDoc.model || ''} ${vehicleDoc.vin || ''}`.toLowerCase() : '';
      
      return bayName.includes(searchTerm.toLowerCase()) || 
             jobTitle.includes(searchTerm.toLowerCase()) ||
             vehicleStr.includes(searchTerm.toLowerCase()) ||
             matchesEmptySearch;
    }).sort((a, b) => 
      (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [zonesList, jobsList, vehiclesList, searchTerm]);

  // Filtered and naturally sorted Parking Spots list
  const filteredParking = useMemo(() => {
    return zonesList.filter(z => {
      if (z.isArchived || (z.type !== 'parking' && z.type !== 'lot')) return false;
      
      const spotName = (z.name || '').toLowerCase();
      
      // Find active job if any
      const activeJobDoc = jobsList.find(j => 
        j.id === z.currentJobId || 
        (j.bayId && (j.bayId === z.id || j.bayId === z.name))
      );
      const jobTitle = activeJobDoc ? (activeJobDoc.jobNumber ? `#${activeJobDoc.jobNumber} - ${activeJobDoc.title}` : activeJobDoc.title).toLowerCase() : '';
      
      const isSpotEmpty = !activeJobDoc;
      const matchesEmptySearch = isSpotEmpty && 'empty'.includes(searchTerm.toLowerCase());
      
      // Vehicle details matching
      const vehicleDoc = vehiclesList.find(v => v.vin === z.currentVehicleVin);
      const vehicleStr = vehicleDoc ? `${vehicleDoc.year || ''} ${vehicleDoc.make || ''} ${vehicleDoc.model || ''} ${vehicleDoc.vin || ''}`.toLowerCase() : '';
      
      return spotName.includes(searchTerm.toLowerCase()) || 
             jobTitle.includes(searchTerm.toLowerCase()) ||
             vehicleStr.includes(searchTerm.toLowerCase()) ||
             matchesEmptySearch;
    }).sort((a, b) => 
      (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [zonesList, jobsList, vehiclesList, searchTerm]);

  // Zero-Save Live Database Updates for Bay Job Assignments
  const handleBayJobChange = async (zoneId: string, newJobId: string) => {
    if (!canManage) return;
    setIsUpdating(zoneId);
    try {
      const zoneRef = doc(db, `businesses/${tenantId}/zones`, zoneId);
      const zoneDoc = zonesList.find(z => z.id === zoneId);
      const zoneName = zoneDoc?.name;

      // 1. Update the zone document
      await updateDoc(zoneRef, {
        currentJobId: newJobId === 'none' ? null : newJobId,
        lastAssignedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 2. Find and clear bayId from any jobs currently linked to this bay
      const linkedJobs = jobsList.filter(j => 
        j.bayId === zoneId || 
        (zoneName && j.bayId === zoneName)
      );

      await Promise.all(linkedJobs.map(async (job) => {
        if (job.id !== newJobId) {
          const jobRef = doc(db, `businesses/${tenantId}/jobs`, job.id);
          await updateDoc(jobRef, {
            bayId: null,
            updatedAt: serverTimestamp()
          }).catch(err => console.warn(`Failed to clear bayId for job ${job.id}:`, err));
        }
      }));

      // 3. Set bayId on the new job document
      if (newJobId && newJobId !== 'none') {
        const newJobRef = doc(db, `businesses/${tenantId}/jobs`, newJobId);
        await updateDoc(newJobRef, {
          bayId: zoneId,
          lastWorkedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        toast.success(`Assigned job to ${zoneDoc?.type === 'parking' ? 'parking spot' : 'bay'}.`);
      } else {
        toast.success(`Cleared job from ${zoneDoc?.type === 'parking' ? 'parking spot' : 'bay'}.`);
      }
    } catch (err: any) {
      toast.error(`Assignment failed: ${err.message}`);
    } finally {
      setIsUpdating(null);
    }
  };

  // Switch task name inline for all technicians active in this bay
  const handleBayTaskChangeSelect = async (jobId: string, taskId: string, taskName: string) => {
    if (!canManage || jobId === 'none') return;
    try {
      const activeJobSessions = sessions.filter(s => {
        if (s.status === 'completed') return false;
        return s.jobs?.some((j: any) => !j.end && j.id === jobId);
      });

      if (activeJobSessions.length === 0) {
        toast.info('No technicians are currently clocked into this job to update.');
        return;
      }

      let bookTime = 0;
      if (taskId && taskId !== 'none') {
        try {
          const taskSnap = await getDoc(doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, taskId));
          if (taskSnap.exists()) {
            bookTime = parseFloat(taskSnap.data().bookTime) || 0;
          }
        } catch (err) {
          console.warn('Could not fetch task bookTime:', err);
        }
      }

      await Promise.all(activeJobSessions.map(async (sess) => {
        const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, sess.id);
        const sessionSnap = await getDoc(sessionRef);
        if (!sessionSnap.exists()) return;

        const sessionData = sessionSnap.data();
        const jobs = [...(sessionData.jobs || [])];
        const activeJob = jobs.find((j: any) => !j.end && j.id === jobId);
        if (!activeJob) return;

        activeJob.taskId = taskId === 'none' ? null : taskId;
        activeJob.taskName = taskName || null;
        activeJob.bookTime = bookTime;

        await updateDoc(sessionRef, {
          jobs,
          updatedAt: serverTimestamp()
        });
      }));

      toast.success(`Active task updated for crew in the bay.`);
    } catch (err: any) {
      toast.error(`Task update failed: ${err.message}`);
    }
  };

  const handleRemoveFromTask = async (sessionId: string, jobId: string, techName: string) => {
    if (!canManage) return;
    
    const confirmRemove = window.confirm(`Are you sure you want to take ${techName} off this job/task?`);
    if (!confirmRemove) return;

    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, sessionId);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists()) {
        toast.error('Time session not found.');
        return;
      }

      const sessionData = sessionSnap.data();
      const jobs = [...(sessionData.jobs || [])];
      
      let closedCount = 0;
      jobs.forEach((j: any) => {
        if (!j.end && j.id === jobId) {
          j.end = new Date();
          closedCount++;
        }
      });

      if (closedCount > 0) {
        await updateDoc(sessionRef, {
          jobs,
          jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
          updatedAt: serverTimestamp()
        });
        toast.success(`Took ${techName} off the task.`);
      } else {
        toast.info(`${techName} is not active on this job.`);
      }
    } catch (err: any) {
      toast.error(`Failed to remove technician: ${err.message}`);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950 font-sans text-xs select-none">
      
      {/* ----------------------------------------------------
          TOP WORKBOARD HEADER
      ---------------------------------------------------- */}
      <div className="flex flex-col gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:py-5 sm:px-6 rounded-2xl shadow-sm mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-500" />
              Bay Worksheet
            </h2>
            <p className="text-sm text-zinc-500 mt-1">Excel-style live manager worksheet. Manage jobs and crew tasks directly by bay or parking location.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Connected
            </div>
          </div>
        </div>

        {/* Filters and Inputs Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full border-t border-zinc-100 dark:border-zinc-800 pt-3">
          
          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search bays, spots, jobs, vin..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 transition dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Mobile Swipe Hint */}
      <div className="md:hidden flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl mb-3 font-bold text-[10px] uppercase tracking-wider animate-pulse border border-indigo-500/15">
        <span>↔ Swipe table horizontally to view all columns</span>
      </div>

      {/* ----------------------------------------------------
          SPREADSHEET GRID VIEW CONTAINER
      ---------------------------------------------------- */}
      <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-2xl shadow-sm relative no-scrollbar min-h-[500px]">
        <table className="w-full text-left border-collapse table-fixed">
          
          {/* Header Row */}
          <thead>
            <tr className="bg-zinc-150 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-extrabold uppercase select-none sticky top-0 z-40">
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.bayName }}>
                Bay / Spot Name {renderResizeHandle('bayName')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.activeJob }}>
                Active Job Assignment {renderResizeHandle('activeJob')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.vehicle }}>
                Vehicle {renderResizeHandle('vehicle')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.crew }}>
                Active Crew {renderResizeHandle('crew')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle" style={{ width: colWidths.activeTask }}>
                Active Task {renderResizeHandle('activeTask')}
              </th>
              <th className="p-2.5 border-r border-zinc-200 dark:border-zinc-800 relative align-middle text-center" style={{ width: colWidths.hours }}>
                Hours Today {renderResizeHandle('hours')}
              </th>
              <th className="p-2.5 relative align-middle text-center" style={{ width: colWidths.timeInBay }}>
                Time in Bay/Spot {renderResizeHandle('timeInBay')}
              </th>
            </tr>
          </thead>

          {/* Grid Rows */}
          <tbody>
            
            {/* ==================== SERVICE BAYS SECTION ==================== */}
            <tr className="bg-zinc-100 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400 font-bold border-b border-zinc-200 dark:border-zinc-800 select-none">
              <td colSpan={7} className="p-3 font-extrabold text-xs tracking-wider uppercase bg-zinc-100 dark:bg-zinc-900/60 pl-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>Service Bays ({filteredBays.length})</span>
                </div>
              </td>
            </tr>

            {filteredBays.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-400 dark:text-zinc-500 font-medium italic">
                  No service bays match the selected filter configuration.
                </td>
              </tr>
            ) : (
              filteredBays.map((zone) => {
                // Find active job if any
                const activeJobDoc = jobsList.find(j => 
                  j.id === zone.currentJobId || 
                  (j.bayId && (j.bayId === zone.id || j.bayId === zone.name))
                );
                const currentJobId = activeJobDoc?.id || 'none';

                // Find active crew in this bay (any technician clocked into this job)
                const activeTechs = sessions.filter(s => {
                  if (s.status === 'completed') return false;
                  return s.jobs?.some((j: any) => !j.end && j.id === currentJobId);
                });

                // Get first technician's active job segment for current task select representation in this bay
                const primaryTechSession = activeTechs[0];
                const activeJobSegment = primaryTechSession?.jobs?.find((j: any) => !j.end && j.id === currentJobId);
                const activeTaskId = activeJobSegment?.taskId || 'none';
                const currentTaskName = activeJobSegment?.taskName || '';

                // Aggregate today's work hours on this job
                let totalWorkMs = 0;
                sessions.forEach(sess => {
                  const jobSegments = sess.jobs?.filter(j => j.id === currentJobId) || [];
                  jobSegments.forEach(seg => {
                    totalWorkMs += calculateDuration(seg.start, seg.end);
                  });
                });

                return (
                  <tr 
                    key={zone.id} 
                    className={cn(
                      "border-b border-zinc-200 dark:border-zinc-800/80 transition-colors font-medium text-zinc-800 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/40",
                      isUpdating === zone.id && "opacity-60 pointer-events-none"
                    )}
                  >
                    {/* 1. Bay Name */}
                    <td className="p-2 border-r border-zinc-200 dark:border-zinc-800 align-middle font-black text-xs uppercase tracking-wider text-zinc-900 dark:text-white bg-zinc-50/50 dark:bg-zinc-900/20 truncate">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="truncate">{zone.name}</span>
                      </div>
                    </td>

                    {/* 2. Active Job Assignment */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      <div className="flex items-center gap-1 w-full">
                        <div className="flex-1 min-w-0">
                          <div className="h-7">
                            <ExcelSearchableSelect
                              options={[
                                { id: 'none', title: 'Empty' },
                                ...jobsList.filter(j => j.status !== 'Closed' && j.status !== 'Completed')
                              ]}
                              value={currentJobId}
                              onChange={(val) => handleBayJobChange(zone.id, val)}
                              getLabel={(j) => j.id === 'none' ? j.title : (j.jobNumber ? `#${j.jobNumber} - ${j.title}` : j.title)}
                              getValue={(j) => j.id}
                              placeholder="Choose Job..."
                              disabled={!canManage}
                            />
                          </div>
                        </div>
                        {currentJobId && currentJobId !== 'none' && (
                          <button
                            onClick={() => navigate(`/business/${tenantId}/job/${currentJobId}`)}
                            className="p-1 text-zinc-400 hover:text-indigo-500 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0"
                            title="View Job Details"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 2b. Vehicle Column */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      {(() => {
                        const vehicleVin = activeJobDoc?.vehicleId || zone.currentVehicleVin;
                        if (!vehicleVin) {
                          return <span className="text-[10px] text-zinc-400 dark:text-zinc-650 px-2 italic">No Vehicle Assigned</span>;
                        }
                        const vehicle = vehiclesList.find(v => v.vin === vehicleVin);
                        const label = vehicle 
                          ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || `VIN: ${vehicleVin.slice(-8)}`
                          : `VIN: ${vehicleVin.slice(-8)}`;
                        return (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-zinc-700 dark:text-zinc-300 truncate">
                            <span>🚙 {label}</span>
                            {vehicle?.id && (
                              <button
                                onClick={() => navigate(`/business/${tenantId}/vehicle/${vehicle.id}`)}
                                className="p-0.5 text-zinc-400 hover:text-indigo-500 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0 ml-auto no-print"
                                title="View Vehicle Details"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 3. Active Crew */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      <div className="flex flex-wrap gap-1.5 items-center px-1">
                        {activeTechs.length === 0 ? (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-650 italic">No crew clocked in</span>
                        ) : (
                          activeTechs.map(session => {
                            const staff = staffList.find(s => s.userId === session.userId || s.id === session.userId);
                            const fullName = staff ? `${staff.firstName || ''} ${staff.lastName || ''}`.trim() : session.userName || 'Technician';
                            const isBreak = session.status === 'on_break';
                            
                            return (
                              <div 
                                key={session.id} 
                                className={cn(
                                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 group/badge relative transition-all duration-200",
                                  isBreak 
                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:text-amber-400 hover:pr-5" 
                                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:text-emerald-450 hover:pr-5"
                                )}
                                title={fullName}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />
                                <span className="truncate max-w-[80px]">
                                  <Link 
                                    to={staff?.id ? `/business/${tenantId}/staff/${staff.id}` : `/business/${tenantId}/performance?staffName=${encodeURIComponent(fullName)}`}
                                    className="hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {fullName.split(' ')[0]}
                                  </Link>
                                </span>
                                {isBreak && <span className="text-[8px] font-black uppercase text-amber-500 ml-1 shrink-0">(Break)</span>}
                                {canManage && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveFromTask(session.id, currentJobId, fullName.split(' ')[0]);
                                    }}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/badge:opacity-100 transition-opacity duration-150 p-0.5 hover:bg-red-500 hover:text-white rounded-full text-zinc-450 dark:text-zinc-500 shrink-0"
                                    title={`Remove ${fullName.split(' ')[0]} from task`}
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </td>

                    {/* 4. Active Task selector for the job */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      {currentJobId === 'none' ? (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-650 px-2 italic">--</span>
                      ) : activeTechs.length === 0 ? (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-600 px-2 italic">No active task</span>
                      ) : (
                        (() => {
                          const assignedTasks = tasksMap[currentJobId] || [];

                          return (
                            <div className="flex items-center gap-1 w-full">
                              <select
                                value={activeTaskId}
                                onChange={(e) => {
                                  const selectedId = e.target.value;
                                  if (selectedId === 'none') {
                                    handleBayTaskChangeSelect(currentJobId, 'none', 'General');
                                  } else {
                                    const selectedTask = assignedTasks.find(t => t.id === selectedId);
                                    handleBayTaskChangeSelect(currentJobId, selectedId, selectedTask?.title || 'Task');
                                  }
                                }}
                                disabled={!canManage}
                                className="flex-1 bg-transparent border-none outline-none focus:ring-0 focus:border-0 font-bold p-1 text-xs text-zinc-850 dark:text-zinc-350 dark:bg-zinc-900 rounded cursor-pointer truncate"
                              >
                                <option value="none">General / Unassigned</option>
                                {assignedTasks.map(t => (
                                  <option key={t.id} value={t.id}>
                                    {t.title}
                                  </option>
                                ))}
                                {activeTaskId !== 'none' && !assignedTasks.some(t => t.id === activeTaskId) && (
                                  <option value={activeTaskId}>
                                    {currentTaskName || 'Active Task'}
                                  </option>
                                )}
                              </select>
                              {activeTaskId && activeTaskId !== 'none' && (
                                <button
                                  onClick={() => navigate(`/business/${tenantId}/task/${currentJobId}/${activeTaskId}`)}
                                  className="p-1 text-zinc-400 hover:text-indigo-500 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0"
                                  title="View Task Details"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </td>

                    {/* 5. Labor Hours Today */}
                    <td className="p-1.5 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center font-mono text-xs font-bold text-zinc-650 dark:text-zinc-400">
                      {totalWorkMs === 0 ? '--' : (
                        <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
                          {formatDuration(totalWorkMs)}
                        </span>
                      )}
                    </td>

                    {/* 6. Time in Bay */}
                    <td className="p-1 align-middle text-center">
                      {!zone.lastAssignedAt ? (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-650 italic">--</span>
                      ) : (
                        (() => {
                          const durationMs = calculateDuration(zone.lastAssignedAt, null);
                          const durationStr = formatBayDuration(durationMs);
                          const isEmpty = currentJobId === 'none';
                          
                          return (
                            <div className="flex items-center justify-center gap-1 px-2 py-1">
                              <div className={cn(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0",
                                isEmpty 
                                  ? "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 dark:text-zinc-400"
                                  : "bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:text-indigo-400"
                              )}>
                                <Clock className={cn("w-3.5 h-3.5 shrink-0", !isEmpty && "text-indigo-500 animate-pulse")} />
                                <span>{durationStr}</span>
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </td>
                  </tr>
                );
              })
            )}

            {/* ==================== PARKING SPOTS SECTION ==================== */}
            <tr className="bg-zinc-100 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400 font-bold border-t border-b border-zinc-200 dark:border-zinc-800 select-none">
              <td colSpan={7} className="p-3 font-extrabold text-xs tracking-wider uppercase bg-zinc-100 dark:bg-zinc-900/60 pl-4">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>Parking Spots ({filteredParking.length})</span>
                </div>
              </td>
            </tr>

            {filteredParking.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-400 dark:text-zinc-500 font-medium italic">
                  No parking spots match the selected filter configuration.
                </td>
              </tr>
            ) : (
              filteredParking.map((zone) => {
                // Find active job if any
                const activeJobDoc = jobsList.find(j => 
                  j.id === zone.currentJobId || 
                  (j.bayId && (j.bayId === zone.id || j.bayId === zone.name))
                );
                const currentJobId = activeJobDoc?.id || 'none';

                // Find active crew in this spot (any technician clocked into this job)
                const activeTechs = sessions.filter(s => {
                  if (s.status === 'completed') return false;
                  return s.jobs?.some((j: any) => !j.end && j.id === currentJobId);
                });

                // Get first technician's active job segment for current task select representation in this spot
                const primaryTechSession = activeTechs[0];
                const activeJobSegment = primaryTechSession?.jobs?.find((j: any) => !j.end && j.id === currentJobId);
                const activeTaskId = activeJobSegment?.taskId || 'none';
                const currentTaskName = activeJobSegment?.taskName || '';

                // Aggregate today's work hours on this job
                let totalWorkMs = 0;
                sessions.forEach(sess => {
                  const jobSegments = sess.jobs?.filter(j => j.id === currentJobId) || [];
                  jobSegments.forEach(seg => {
                    totalWorkMs += calculateDuration(seg.start, seg.end);
                  });
                });

                return (
                  <tr 
                    key={zone.id} 
                    className={cn(
                      "border-b border-zinc-200 dark:border-zinc-800/80 transition-colors font-medium text-zinc-800 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/40",
                      isUpdating === zone.id && "opacity-60 pointer-events-none"
                    )}
                  >
                    {/* 1. Spot Name */}
                    <td className="p-2 border-r border-zinc-200 dark:border-zinc-800 align-middle font-black text-xs uppercase tracking-wider text-zinc-900 dark:text-white bg-zinc-50/50 dark:bg-zinc-900/20 truncate">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="truncate">{zone.name}</span>
                      </div>
                    </td>

                    {/* 2. Active Job Assignment */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      <div className="flex items-center gap-1 w-full">
                        <div className="flex-1 min-w-0">
                          <div className="h-7">
                            <ExcelSearchableSelect
                              options={[
                                { id: 'none', title: 'Empty' },
                                ...jobsList.filter(j => j.status !== 'Closed' && j.status !== 'Completed')
                              ]}
                              value={currentJobId}
                              onChange={(val) => handleBayJobChange(zone.id, val)}
                              getLabel={(j) => j.id === 'none' ? j.title : (j.jobNumber ? `#${j.jobNumber} - ${j.title}` : j.title)}
                              getValue={(j) => j.id}
                              placeholder="Choose Job..."
                              disabled={!canManage}
                            />
                          </div>
                        </div>
                        {currentJobId && currentJobId !== 'none' && (
                          <button
                            onClick={() => navigate(`/business/${tenantId}/job/${currentJobId}`)}
                            className="p-1 text-zinc-400 hover:text-indigo-500 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0"
                            title="View Job Details"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 2b. Vehicle Column */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      {(() => {
                        const vehicleVin = activeJobDoc?.vehicleId || zone.currentVehicleVin;
                        if (!vehicleVin) {
                          return <span className="text-[10px] text-zinc-400 dark:text-zinc-650 px-2 italic">No Vehicle Assigned</span>;
                        }
                        const vehicle = vehiclesList.find(v => v.vin === vehicleVin);
                        const label = vehicle 
                          ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || `VIN: ${vehicleVin.slice(-8)}`
                          : `VIN: ${vehicleVin.slice(-8)}`;
                        return (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-zinc-700 dark:text-zinc-300 truncate">
                            <span>🚙 {label}</span>
                            {vehicle?.id && (
                              <button
                                onClick={() => navigate(`/business/${tenantId}/vehicle/${vehicle.id}`)}
                                className="p-0.5 text-zinc-400 hover:text-indigo-500 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0 ml-auto no-print"
                                title="View Vehicle Details"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* 3. Active Crew */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      <div className="flex flex-wrap gap-1.5 items-center px-1">
                        {activeTechs.length === 0 ? (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-650 italic">No crew clocked in</span>
                        ) : (
                          activeTechs.map(session => {
                            const staff = staffList.find(s => s.userId === session.userId || s.id === session.userId);
                            const fullName = staff ? `${staff.firstName || ''} ${staff.lastName || ''}`.trim() : session.userName || 'Technician';
                            const isBreak = session.status === 'on_break';
                            
                            return (
                              <div 
                                key={session.id} 
                                className={cn(
                                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 group/badge relative transition-all duration-200",
                                  isBreak 
                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:text-amber-400 hover:pr-5" 
                                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:text-emerald-450 hover:pr-5"
                                )}
                                title={fullName}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />
                                <span className="truncate max-w-[80px]">
                                  <Link 
                                    to={staff?.id ? `/business/${tenantId}/staff/${staff.id}` : `/business/${tenantId}/performance?staffName=${encodeURIComponent(fullName)}`}
                                    className="hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {fullName.split(' ')[0]}
                                  </Link>
                                </span>
                                {isBreak && <span className="text-[8px] font-black uppercase text-amber-500 ml-1 shrink-0">(Break)</span>}
                                {canManage && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveFromTask(session.id, currentJobId, fullName.split(' ')[0]);
                                    }}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/badge:opacity-100 transition-opacity duration-150 p-0.5 hover:bg-red-500 hover:text-white rounded-full text-zinc-450 dark:text-zinc-500 shrink-0"
                                    title={`Remove ${fullName.split(' ')[0]} from task`}
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </td>

                    {/* 4. Active Task selector for the job */}
                    <td className="p-1 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                      {currentJobId === 'none' ? (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-650 px-2 italic">--</span>
                      ) : activeTechs.length === 0 ? (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-600 px-2 italic">No active task</span>
                      ) : (
                        (() => {
                          const assignedTasks = tasksMap[currentJobId] || [];

                          return (
                            <div className="flex items-center gap-1 w-full">
                              <select
                                value={activeTaskId}
                                onChange={(e) => {
                                  const selectedId = e.target.value;
                                  if (selectedId === 'none') {
                                    handleBayTaskChangeSelect(currentJobId, 'none', 'General');
                                  } else {
                                    const selectedTask = assignedTasks.find(t => t.id === selectedId);
                                    handleBayTaskChangeSelect(currentJobId, selectedId, selectedTask?.title || 'Task');
                                  }
                                }}
                                disabled={!canManage}
                                className="flex-1 bg-transparent border-none outline-none focus:ring-0 focus:border-0 font-bold p-1 text-xs text-zinc-850 dark:text-zinc-350 dark:bg-zinc-900 rounded cursor-pointer truncate"
                              >
                                <option value="none">General / Unassigned</option>
                                {assignedTasks.map(t => (
                                  <option key={t.id} value={t.id}>
                                    {t.title}
                                  </option>
                                ))}
                                {activeTaskId !== 'none' && !assignedTasks.some(t => t.id === activeTaskId) && (
                                  <option value={activeTaskId}>
                                    {currentTaskName || 'Active Task'}
                                  </option>
                                )}
                              </select>
                              {activeTaskId && activeTaskId !== 'none' && (
                                <button
                                  onClick={() => navigate(`/business/${tenantId}/task/${currentJobId}/${activeTaskId}`)}
                                  className="p-1 text-zinc-400 hover:text-indigo-500 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0"
                                  title="View Task Details"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </td>

                    {/* 5. Labor Hours Today */}
                    <td className="p-1.5 border-r border-zinc-200 dark:border-zinc-800 align-middle text-center font-mono text-xs font-bold text-zinc-650 dark:text-zinc-400">
                      {totalWorkMs === 0 ? '--' : (
                        <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
                          {formatDuration(totalWorkMs)}
                        </span>
                      )}
                    </td>

                    {/* 6. Time in Spot */}
                    <td className="p-1 align-middle text-center">
                      {!zone.lastAssignedAt ? (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-650 italic">--</span>
                      ) : (
                        (() => {
                          const durationMs = calculateDuration(zone.lastAssignedAt, null);
                          const durationStr = formatBayDuration(durationMs);
                          const isEmpty = currentJobId === 'none';
                          
                          return (
                            <div className="flex items-center justify-center gap-1 px-2 py-1">
                              <div className={cn(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0",
                                isEmpty 
                                  ? "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 dark:text-zinc-400"
                                  : "bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:text-indigo-400"
                              )}>
                                <Clock className={cn("w-3.5 h-3.5 shrink-0", !isEmpty && "text-indigo-500 animate-pulse")} />
                                <span>{durationStr}</span>
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ExcelSearchableSelectProps<T> {
  options: T[];
  value: string;
  onChange: (value: string) => void;
  getLabel: (option: T) => string;
  getValue: (option: T) => string;
  placeholder?: string;
  disabled?: boolean;
}

function ExcelSearchableSelect<T>({
  options,
  value,
  onChange,
  getLabel,
  getValue,
  placeholder = 'Select...',
  disabled = false
}: ExcelSearchableSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => getValue(o) === value);
  const filteredOptions = options.filter(o => {
    const label = getLabel(o);
    if (label && label.toLowerCase().includes(search.toLowerCase())) return true;
    
    // Deep search for Job objects
    if (o && typeof o === 'object') {
      const obj = o as any;
      const searchStr = search.toLowerCase();
      
      if (obj.customerName && String(obj.customerName).toLowerCase().includes(searchStr)) return true;
      if (obj.vin && String(obj.vin).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleVin && String(obj.vehicleVin).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleName && String(obj.vehicleName).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleMake && String(obj.vehicleMake).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleModel && String(obj.vehicleModel).toLowerCase().includes(searchStr)) return true;
      if (obj.vehicleYear && String(obj.vehicleYear).toLowerCase().includes(searchStr)) return true;
      if (obj.jobNumber && String(obj.jobNumber).toLowerCase().includes(searchStr)) return true;
      if (obj.title && String(obj.title).toLowerCase().includes(searchStr)) return true;
    }
    
    return false;
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        onChange(getValue(filteredOptions[0]));
      }
      setIsOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full font-sans select-none">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setSearch('');
          }
        }}
        className={cn(
          "w-full h-full text-left px-2 py-1 text-xs font-bold bg-transparent border-none outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800/60 rounded flex items-center justify-between cursor-pointer group",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span className={cn(
          "truncate pr-2 dark:text-zinc-350",
          value === 'none' && "text-zinc-400 dark:text-zinc-650 font-semibold italic"
        )}>
          {selectedOption ? (getLabel(selectedOption) || '') : placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[240px] max-w-[320px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-[150] overflow-hidden">
          <div className="p-1.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by Job, Cust, Veh, VIN..."
              className="w-full bg-transparent border-none outline-none text-xs dark:text-white placeholder-zinc-400"
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const optVal = getValue(option);
                const isSelected = optVal === value;
                return (
                  <button
                    key={optVal}
                    type="button"
                    onClick={() => {
                      onChange(optVal);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={cn(
                      "w-full px-2 py-1.5 text-left text-xs font-semibold rounded-lg transition-colors",
                      isSelected 
                        ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400" 
                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850"
                    )}
                  >
                    <div className="flex flex-col min-w-0 text-left w-full">
                      <span className={cn(
                        "truncate text-xs font-bold leading-tight",
                        optVal === 'none' && "text-zinc-400 dark:text-zinc-500 font-semibold italic"
                      )}>{getLabel(option) || ''}</span>
                      {option && typeof option === 'object' && ('customerName' in option || 'vehicleName' in option || 'vin' in option || 'vehicleVin' in option) && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] font-medium text-zinc-400 dark:text-zinc-500 mt-1 max-w-full leading-none">
                          {(option as any).customerName && (
                            <span className="truncate max-w-[130px] bg-zinc-100 dark:bg-zinc-800/80 px-1 py-0.5 rounded text-[8px] font-bold">Cust: {(option as any).customerName}</span>
                          )}
                          {((option as any).vehicleName || (option as any).vehicleMake) && (
                            <span className="truncate max-w-[130px]">Veh: {((option as any).vehicleName || `${(option as any).vehicleYear || ''} ${(option as any).vehicleMake || ''} ${(option as any).vehicleModel || ''}`).trim()}</span>
                          )}
                          {((option as any).vin || (option as any).vehicleVin) && (
                            <span className="shrink-0 font-mono text-[8px] uppercase">VIN: {String((option as any).vin || (option as any).vehicleVin).slice(-8)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center text-[10px] text-zinc-400 italic">No matches found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
