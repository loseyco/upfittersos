import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase/config';
import { 
  collection, onSnapshot, doc, updateDoc, collectionGroup, query, where 
} from 'firebase/firestore';
import { 
  Users, ClipboardList, Search, Clock, Award, 
  TrendingUp, UserPlus, Info, Briefcase, CheckCircle2,
  ChevronUp, ChevronDown, ChevronsUp
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import { StaffLink } from './StaffPerformance';

export function ControlBoard({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBacklog, setShowBacklog] = useState(true);
  const [dragOverStaffId, setDragOverStaffId] = useState<string | null>(null);
  const [dragOverJobId, setDragOverJobId] = useState<string | null>(null);
  const [draggedJob, setDraggedJob] = useState<any | null>(null);
  const [draggedSourceStaffId, setDraggedSourceStaffId] = useState<string | null>(null);
  const [dragOverJobIndex, setDragOverJobIndex] = useState<number | null>(null);

  // Real-time Firestore Listeners
  useEffect(() => {
    if (!tenantId) return;

    // 1. Fetch Departments
    const unsubDepts = onSnapshot(
      collection(db, `businesses/${tenantId}/departments`),
      (snap) => {
        setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error("Error fetching departments:", err)
    );

    // 2. Fetch Staff
    const unsubStaff = onSnapshot(
      collection(db, `businesses/${tenantId}/staff`),
      (snap) => {
        const activeStaff = snap.docs
          .map(d => ({ 
            id: d.id, 
            ...d.data(),
            name: `${d.data().firstName || ''} ${d.data().lastName || ''}`.trim()
          }))
          .filter((s: any) => !s.isArchived && !s.fireDate && s.departmentId);
        setStaffList(activeStaff);
      },
      (err) => console.error("Error fetching staff:", err)
    );

    // 3. Fetch Jobs
    const unsubJobs = onSnapshot(
      collection(db, `businesses/${tenantId}/jobs`),
      (snap) => {
        setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error("Error fetching jobs:", err)
    );

    // 4. Fetch all tasks via collectionGroup for in-memory mapping
    const qTasks = query(
      collectionGroup(db, 'tasks'),
      where('tenantId', '==', tenantId)
    );
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      const filteredDocs = snap.docs.filter(doc => doc.ref.path.startsWith(`businesses/${tenantId}/`));
      setTasks(filteredDocs.map(doc => ({
        id: doc.id,
        jobId: doc.ref.path.split('/')[3],
        ...doc.data()
      })));
    }, (err) => {
      console.error("Error fetching tasks via collectionGroup:", err);
    });

    return () => {
      unsubDepts();
      unsubStaff();
      unsubJobs();
      unsubTasks();
    };
  }, [tenantId]);

  // Active Jobs Filter: status is not completed/closed AND has at least one task that needs to be done / not complete
  const activeJobs = jobs.filter(j => {
    if (['Ready for Customer', 'Completed', 'Closed'].includes(j.status)) return false;
    const jobTasks = tasks.filter(t => t.jobId === j.id);
    return jobTasks.some(t => t.status !== 'completed' && t.status !== 'QC Complete');
  });

  // Backlog: active jobs with NO assigned staff
  const backlogJobs = activeJobs.filter(j => !j.assignedStaffIds || j.assignedStaffIds.length === 0);

  // Search & Filter Backlog
  const filteredBacklog = backlogJobs.filter(j => {
    const queryStr = searchQuery.toLowerCase();
    return (
      j.title?.toLowerCase().includes(queryStr) ||
      j.jobNumber?.toString().includes(queryStr) ||
      j.customerName?.toLowerCase().includes(queryStr)
    );
  });

  // Calculate stats
  const totalBacklogHours = tasks
    .filter(t => t.status !== 'completed' && t.status !== 'QC Complete')
    .reduce((sum, t) => sum + (Number(t.bookTime) || 0), 0);
    
  const activeStaffCount = staffList.filter(s => 
    activeJobs.some(j => j.assignedStaffIds?.includes(s.id))
  ).length;

  const avgWorkload = activeStaffCount > 0 ? (totalBacklogHours / activeStaffCount) : 0;
  
  const completedTasksCount = tasks.filter(t => t.status === 'completed' || t.status === 'QC Complete').length;
  const completionRate = tasks.length > 0 ? (completedTasksCount / tasks.length) * 100 : 0;

  // HTML5 Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, job: any, sourceStaffId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({
      jobId: job.id,
      sourceStaffId
    }));
    setDraggedJob(job);
    setDraggedSourceStaffId(sourceStaffId);
  };

  const handleDragEnd = () => {
    setDraggedJob(null);
    setDraggedSourceStaffId(null);
    setDragOverStaffId(null);
    setDragOverJobIndex(null);
    setDragOverJobId(null);
  };

  const handleJobDragOver = (e: React.DragEvent, staffId: string, jobId: string, index: number) => {
    e.preventDefault();
    if (draggedJob) {
      if (draggedJob.id !== jobId) {
        if (dragOverStaffId !== staffId || dragOverJobIndex !== index) {
          setDragOverStaffId(staffId);
          setDragOverJobIndex(index);
          setDragOverJobId(jobId);
        }
      }
    } else {
      if (dragOverStaffId !== staffId) {
        setDragOverStaffId(staffId);
      }
    }
  };

  const handleLaneDragOver = (e: React.DragEvent, staffId: string) => {
    e.preventDefault();
    if (dragOverStaffId !== staffId) {
      setDragOverStaffId(staffId);
      setDragOverJobIndex(null);
      setDragOverJobId(null);
    }
  };

  const handleDragLeave = () => {
    // Managed via dragEnd / hover outside
  };

  const handleDrop = async (e: React.DragEvent, targetStaffId: string, targetJobIndex?: number) => {
    e.preventDefault();
    
    let sourceStaffId = draggedSourceStaffId;
    let jobId = draggedJob?.id;

    if (!jobId) {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (dataStr) {
        try {
          const parsed = JSON.parse(dataStr);
          jobId = parsed.jobId;
          sourceStaffId = parsed.sourceStaffId;
        } catch (err) {
          console.error("Parse dataTransfer error inside drop:", err);
        }
      }
    }

    handleDragEnd();

    if (!jobId) {
      console.warn("Drop rejected: No jobId found in state or dataTransfer.");
      return;
    }

    try {
      const isBacklog = targetStaffId === 'backlog';

      // 1. Update Job document's assignedStaffIds in Firestore
      if (sourceStaffId !== targetStaffId) {
        const jobRef = doc(db, `businesses/${tenantId}/jobs/${jobId}`);
        await updateDoc(jobRef, {
          assignedStaffIds: isBacklog ? [] : [targetStaffId],
          updatedAt: new Date().toISOString()
        });
        toast.success(isBacklog ? 'Job moved back to Backlog' : 'Job assigned successfully!');
      }

      // 2. Remove from source staff jobPriorityOrder
      if (sourceStaffId && sourceStaffId !== 'backlog') {
        const sourceStaff = staffList.find(s => s.id === sourceStaffId);
        if (sourceStaff) {
          const currentOrder = sourceStaff.jobPriorityOrder || [];
          const updatedOrder = currentOrder.filter((id: string) => id !== jobId);
          const sourceRef = doc(db, `businesses/${tenantId}/staff/${sourceStaffId}`);
          await updateDoc(sourceRef, { jobPriorityOrder: updatedOrder });
        }
      }

      // 3. Add & order in target staff jobPriorityOrder
      if (targetStaffId && targetStaffId !== 'backlog') {
        const targetStaff = staffList.find(s => s.id === targetStaffId);
        if (targetStaff) {
          const currentOrder = (targetStaff.jobPriorityOrder || []).filter((id: string) => id !== jobId);
          let updatedOrder = [...currentOrder];

          if (targetJobIndex !== undefined && targetJobIndex !== null) {
            updatedOrder.splice(targetJobIndex, 0, jobId);
          } else {
            updatedOrder.push(jobId);
          }

          const targetRef = doc(db, `businesses/${tenantId}/staff/${targetStaffId}`);
          await updateDoc(targetRef, { jobPriorityOrder: updatedOrder });
        }
      }
    } catch (err) {
      console.error("Drop error details:", err);
      toast.error("Failed to update job assignment.");
    }
  };

  // Helper to get visually sorted jobs for a lane in real-time while dragging
  const getVisualJobs = (laneId: string, initialJobs: any[]) => {
    let list = [...initialJobs];

    if (draggedJob) {
      // If this is the source lane and we are dragging over a DIFFERENT lane, remove the dragged job
      if (draggedSourceStaffId === laneId && dragOverStaffId && dragOverStaffId !== laneId) {
        list = list.filter(j => j.id !== draggedJob.id);
      }

      // If this is the target lane, ensure the dragged job is in it, placed at the dragOverJobIndex
      if (dragOverStaffId === laneId) {
        // Remove it from its current position in this list if it's already there
        list = list.filter(j => j.id !== draggedJob.id);
        
        // Insert it at the drag-over index
        if (dragOverJobIndex !== null && dragOverJobIndex !== undefined) {
          list.splice(dragOverJobIndex, 0, draggedJob);
        } else {
          list.push(draggedJob);
        }
      }
    }

    return list;
  };

  // Reordering Action functions
  const handleMoveToTop = async (staffId: string, jobId: string) => {
    try {
      const staff = staffList.find(s => s.id === staffId);
      if (!staff) return;

      const currentOrder = staff.jobPriorityOrder || [];
      const filtered = currentOrder.filter((id: string) => id !== jobId);
      const updatedOrder = [jobId, ...filtered];

      const staffRef = doc(db, `businesses/${tenantId}/staff/${staffId}`);
      await updateDoc(staffRef, { jobPriorityOrder: updatedOrder });
      toast.success("Job moved to top of queue");
    } catch (err) {
      console.error("Error moving job to top:", err);
      toast.error("Failed to reorder job.");
    }
  };

  const handleMoveUp = async (staffId: string, jobId: string) => {
    try {
      const staff = staffList.find(s => s.id === staffId);
      if (!staff) return;

      const staffJobs = activeJobs.filter(j => j.assignedStaffIds?.includes(staffId));
      const priorityMap = staff.jobPriorityOrder || [];
      const sortedJobs = [...staffJobs].sort((a, b) => {
        const idxA = priorityMap.indexOf(a.id);
        const idxB = priorityMap.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });

      const idx = sortedJobs.findIndex(j => j.id === jobId);
      if (idx <= 0) return; // Already at the top or not found

      const newJobs = [...sortedJobs];
      const temp = newJobs[idx];
      newJobs[idx] = newJobs[idx - 1];
      newJobs[idx - 1] = temp;

      const updatedOrder = newJobs.map(j => j.id);

      const staffRef = doc(db, `businesses/${tenantId}/staff/${staffId}`);
      await updateDoc(staffRef, { jobPriorityOrder: updatedOrder });
    } catch (err) {
      console.error("Error moving job up:", err);
      toast.error("Failed to reorder job.");
    }
  };

  const handleMoveDown = async (staffId: string, jobId: string) => {
    try {
      const staff = staffList.find(s => s.id === staffId);
      if (!staff) return;

      const staffJobs = activeJobs.filter(j => j.assignedStaffIds?.includes(staffId));
      const priorityMap = staff.jobPriorityOrder || [];
      const sortedJobs = [...staffJobs].sort((a, b) => {
        const idxA = priorityMap.indexOf(a.id);
        const idxB = priorityMap.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });

      const idx = sortedJobs.findIndex(j => j.id === jobId);
      if (idx === -1 || idx >= sortedJobs.length - 1) return; // Already at the bottom or not found

      const newJobs = [...sortedJobs];
      const temp = newJobs[idx];
      newJobs[idx] = newJobs[idx + 1];
      newJobs[idx + 1] = temp;

      const updatedOrder = newJobs.map(j => j.id);

      const staffRef = doc(db, `businesses/${tenantId}/staff/${staffId}`);
      await updateDoc(staffRef, { jobPriorityOrder: updatedOrder });
    } catch (err) {
      console.error("Error moving job down:", err);
      toast.error("Failed to reorder job.");
    }
  };

  // Render a Job Card
  const renderJobCard = (job: any, sourceStaffId: string, index: number, totalCount?: number) => {
    // In-memory aggregates
    const jobTasks = tasks.filter(t => t.jobId === job.id);
    const totalJobHours = jobTasks.reduce((sum, t) => sum + (Number(t.bookTime) || 0), 0);
    const completedTasks = jobTasks.filter(t => t.status === 'completed' || t.status === 'QC Complete');
    const isBlocked = job.status === 'Blocked' || job.isBlocked;
    const isClockedIn = jobTasks.some(t => t.status === 'in_progress');
    const isCurrentlyDragged = draggedJob?.id === job.id;

    return (
      <div
        key={job.id}
        draggable
        onDragStart={(e) => handleDragStart(e, job, sourceStaffId)}
        onDragOver={(e) => handleJobDragOver(e, sourceStaffId, job.id, index)}
        onDragEnd={handleDragEnd}
        onDrop={(e) => handleDrop(e, sourceStaffId, index)}
        onClick={() => navigate(`/business/${tenantId}/job/${job.id}`)}
        className={cn(
          "p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95 cursor-grab space-y-2 group relative overflow-hidden",
          isBlocked && "border-l-4 border-l-rose-500",
          isClockedIn && "border-l-4 border-l-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10",
          isCurrentlyDragged && "opacity-45 border-dashed border-indigo-400 bg-indigo-50/5 dark:bg-indigo-500/5",
          dragOverJobId === job.id && !isCurrentlyDragged && "border-t-2 border-t-indigo-500 pt-5"
        )}
      >
        {/* Hover Action Buttons for Reordering */}
        {sourceStaffId !== 'backlog' && !isCurrentlyDragged && (
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="absolute right-2 top-2 hidden group-hover:flex items-center gap-0.5 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-md p-1 rounded-lg border border-zinc-200/80 dark:border-zinc-800 shadow-lg z-[20] animate-in fade-in zoom-in-95 duration-100"
          >
            {index > 0 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveToTop(sourceStaffId, job.id);
                  }}
                  title="Move to Top"
                  className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-indigo-500 transition-colors"
                >
                  <ChevronsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveUp(sourceStaffId, job.id);
                  }}
                  title="Move Up"
                  className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-indigo-500 transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {totalCount !== undefined && index < totalCount - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMoveDown(sourceStaffId, job.id);
                }}
                title="Move Down"
                className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-indigo-500 transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
            {job.jobNumber ? `#${job.jobNumber}` : 'JOB'}
          </span>
          <div className="flex items-center gap-1 group-hover:opacity-0 transition-opacity">
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider",
              job.priority === 'urgent' ? 'bg-rose-500/10 text-rose-500 animate-pulse' :
              job.priority === 'high' ? 'bg-amber-500/10 text-amber-500' :
              'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
            )}>
              {job.priority || 'medium'}
            </span>
            {totalJobHours > 0 && (
              <span className="font-mono text-[10px] font-black text-zinc-500 bg-zinc-50 dark:bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-200/40 dark:border-zinc-800/40">
                {totalJobHours.toFixed(1)}h
              </span>
            )}
          </div>
        </div>

        <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 leading-snug truncate group-hover:text-indigo-500 transition-colors pr-10">
          {job.title || 'Untitled Job'}
        </h4>

        {job.customerName && (
          <p className="text-[10px] text-zinc-500 font-semibold truncate flex items-center gap-1">
            <Briefcase className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            {job.customerName}
          </p>
        )}

        <div className="flex items-center justify-between pt-2 text-[9px] text-zinc-400 font-bold border-t border-zinc-100 dark:border-zinc-850">
          <span className="capitalize">{job.status || 'pending'}</span>
          {jobTasks.length > 0 && (
            <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              {completedTasks.length}/{jobTasks.length} Tasks
            </span>
          )}
        </div>
      </div>
    );
  };

  const visualBacklog = getVisualJobs('backlog', filteredBacklog);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500 pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Workload Control Board</h1>
          <p className="text-sm text-zinc-500">Drag, drop, and prioritize active job orders across your shop departments in real-time.</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search backlog..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-55/10 min-w-[200px]"
            />
          </div>

          <button
            onClick={() => setShowBacklog(!showBacklog)}
            className={cn(
              "px-4 py-2 border rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all",
              showBacklog 
                ? "bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400"
                : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300"
            )}
          >
            <ClipboardList className="w-4 h-4" />
            {showBacklog ? 'Hide Backlog' : 'Show Backlog'}
            {backlogJobs.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-black">
                {backlogJobs.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total Backlog Load</span>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
          <span className="text-2xl font-black text-zinc-900 dark:text-white font-mono">{totalBacklogHours.toFixed(1)}h</span>
          <p className="text-[10px] text-zinc-400 font-semibold mt-1">Active scheduled tasks hours</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Active Staff</span>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>
          <span className="text-2xl font-black text-zinc-900 dark:text-white font-mono">{activeStaffCount} / {staffList.length}</span>
          <p className="text-[10px] text-zinc-400 font-semibold mt-1">Staff with loaded jobs</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-550/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Avg Workload</span>
            <TrendingUp className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-2xl font-black text-zinc-900 dark:text-white font-mono">{avgWorkload.toFixed(1)}h</span>
          <p className="text-[10px] text-zinc-400 font-semibold mt-1">Average hours per loaded tech</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Global Progress</span>
            <Award className="w-4 h-4 text-indigo-500" />
          </div>
          <span className="text-2xl font-black text-zinc-900 dark:text-white font-mono">{completionRate.toFixed(0)}%</span>
          <div className="w-full bg-zinc-100 dark:bg-zinc-850 rounded-full h-1 mt-2 overflow-hidden">
            <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${completionRate}%` }} />
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex items-start gap-6 relative min-h-[600px]">
        {/* Left Side: Unassigned Backlog Panel */}
        {showBacklog && (
          <aside 
            onDragOver={(e) => handleLaneDragOver(e, 'backlog')}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'backlog')}
            className={cn(
              "w-80 shrink-0 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col h-[750px] sticky top-4 overflow-hidden transition-all shadow-sm",
              dragOverStaffId === 'backlog' && "ring-2 ring-indigo-500 ring-offset-2"
            )}
          >
            {/* Backlog Header */}
            <div className="p-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                  <ClipboardList className="w-4 h-4 text-indigo-500" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900 dark:text-white">Unassigned Backlog</h3>
                  <p className="text-[10px] text-zinc-400">Drag to technicians to schedule</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-full text-xs font-black">
                {backlogJobs.length}
              </span>
            </div>

            {/* Backlog List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {visualBacklog.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-white/50 dark:bg-zinc-900/10">
                  <Info className="w-6 h-6 text-zinc-300 dark:text-zinc-750 mb-2" />
                  <p className="text-xs font-bold text-zinc-400">No unassigned active jobs.</p>
                </div>
              ) : (
                visualBacklog.map((job, idx) => renderJobCard(job, 'backlog', idx, visualBacklog.length))
              )}
            </div>
          </aside>
        )}

        {/* Right Side: Columns grouped by Department */}
        <div className="flex-1 space-y-8 min-w-0">
          {departments.length === 0 ? (
            <div className="text-center p-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl">
              <Users className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-zinc-800 dark:text-white mb-1">No Departments Found</h3>
              <p className="text-sm text-zinc-500">Add departments in Configuration to organize staff lanes.</p>
            </div>
          ) : (
            departments.map(dept => {
              // Get staff in this department
              const deptStaff = staffList.filter(s => s.departmentId === dept.id);
              if (deptStaff.length === 0) return null; // Skip if no staff in department

              return (
                <section key={dept.id} className="bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-200/60 dark:border-zinc-900/40 rounded-3xl p-6 space-y-4">
                  {/* Department Title */}
                  <div className="flex items-center gap-3 pb-3 border-b border-zinc-200/50 dark:border-zinc-800/50">
                    <div className="w-2.5 h-6 bg-indigo-500 rounded-full" />
                    <div>
                      <h2 className="text-lg font-black text-zinc-900 dark:text-white tracking-tight">{dept.name} Department</h2>
                      <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">{deptStaff.length} Team Members</p>
                    </div>
                  </div>

                  {/* Horizontal lane flex scroll for staff in department */}
                  <div className="flex flex-row gap-6 overflow-x-auto pb-4 custom-scrollbar select-none">
                    {deptStaff.map(staff => {
                      // Get jobs assigned to this staff member
                      const staffJobs = activeJobs.filter(j => j.assignedStaffIds?.includes(staff.id));
                      
                      // Sort according to priority array
                      const priorityMap = staff.jobPriorityOrder || [];
                      const sortedJobs = [...staffJobs].sort((a, b) => {
                        const idxA = priorityMap.indexOf(a.id);
                        const idxB = priorityMap.indexOf(b.id);
                        
                        if (idxA === -1 && idxB === -1) return 0;
                        if (idxA === -1) return 1;
                        if (idxB === -1) return -1;
                        return idxA - idxB;
                      });

                      // In-memory sum of book time hours assigned to this staff across their jobs
                      const totalStaffHours = staffJobs.reduce((sum, j) => {
                        const jobTasks = tasks.filter(t => t.jobId === j.id && t.status !== 'completed' && t.status !== 'QC Complete');
                        return sum + jobTasks.reduce((sumT, t) => sumT + (Number(t.bookTime) || 0), 0);
                      }, 0);

                      const visualStaffJobs = getVisualJobs(staff.id, sortedJobs);

                      return (
                        <div
                          key={staff.id}
                          onDragOver={(e) => handleLaneDragOver(e, staff.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, staff.id)}
                          className={cn(
                            "w-80 shrink-0 flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl h-[650px] overflow-hidden transition-all shadow-sm",
                            dragOverStaffId === staff.id && "ring-2 ring-indigo-500 ring-offset-2 bg-indigo-50/5 dark:bg-indigo-500/5 border-indigo-400"
                          )}
                        >
                          {/* Staff Lane Header */}
                          <div className="p-4 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-150 dark:border-zinc-850 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center font-black text-indigo-500 text-xs shadow-sm">
                                {staff.firstName?.[0] || ''}{staff.lastName?.[0] || ''}
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-black text-sm text-zinc-900 dark:text-white truncate max-w-[120px]">
                                  <StaffLink 
                                    name={staff.name} 
                                    tenantId={tenantId} 
                                    staffId={staff.id} 
                                    className="hover:text-indigo-500 hover:underline text-zinc-900 dark:text-white" 
                                  />
                                </h3>
                                <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider capitalize">{staff.payType?.replace('_', ' ') || 'hourly'}</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="font-mono text-sm font-black text-zinc-800 dark:text-zinc-200">
                                {totalStaffHours.toFixed(1)}h
                              </span>
                              <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Active load</span>
                            </div>
                          </div>

                          {/* Staff Jobs list */}
                          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {visualStaffJobs.length === 0 ? (
                              <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-zinc-150 dark:border-zinc-850 rounded-xl bg-zinc-50/20 dark:bg-zinc-900/10">
                                <UserPlus className="w-6 h-6 text-zinc-300 dark:text-zinc-750 mb-2" />
                                <p className="text-[10px] font-bold text-zinc-400">Queue is empty</p>
                                <p className="text-[9px] text-zinc-400 leading-tight">Drag a job here to assign and queue it</p>
                              </div>
                            ) : (
                              visualStaffJobs.map((job, idx) => renderJobCard(job, staff.id, idx, visualStaffJobs.length))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
