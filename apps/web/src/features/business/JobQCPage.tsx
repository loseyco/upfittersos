import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  doc, onSnapshot, collection, query, where, updateDoc, 
  getDoc, getDocs, serverTimestamp 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../../lib/firebase/config';
import { 
  ArrowLeft, CheckCircle2, XCircle, Camera, Trash2, 
  ClipboardCheck, MessageSquare, Clock, 
  User, Image as ImageIcon, Loader2,
  Maximize2, X
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth/store';
import { assignQCStaffToJob } from '../../lib/auth/qcAssignment';
import { useJobClock } from '../timeclock/useJobClock';

interface TaskNote {
  id: string;
  message: string;
  images: string[];
  createdAt: string;
  createdByUid: string;
  createdByName: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  taskGroup?: string;
  bookTime?: string;
  description?: string;
  canComplete?: boolean;
  completedAt?: string;
  completedBy?: string;
  completedByStaffId?: string;
  completedByStaffName?: string;
  qcCompletedAt?: string;
  qcCompletedBy?: string;
  qcFailedAt?: string;
  qcFailedBy?: string;
  assignedStaffIds?: string[];
  assignedStaff?: any[];
  assignedTechId?: string;
  assignedTechName?: string;
  assignedTo?: string;
  task_notes?: TaskNote[];
}

interface Job {
  id: string;
  jobNumber?: string;
  title?: string;
  status?: string;
  customerName?: string;
  vehicleId?: string;
  companyCamId?: string;
  companyCamProjectId?: string;
}

interface Vehicle {
  id: string;
  year?: string;
  make?: string;
  model?: string;
  vin?: string;
}

const isGeneralTask = (taskOrTitle?: any) => {
  if (!taskOrTitle) return false;
  if (typeof taskOrTitle === 'object') {
    const t = (taskOrTitle.title || '').toLowerCase().trim();
    const g = (taskOrTitle.taskGroup || '').toLowerCase().trim();
    return (t === 'general' || t === 'general labor') && g === 'general';
  }
  const t = taskOrTitle.toLowerCase().trim();
  return t === 'general' || t === 'general labor';
};

export function JobQCPage({ 
  tenantId, 
  setDynamicTitle 
}: { 
  tenantId: string; 
  setDynamicTitle: (title: string | null) => void; 
}) {
  const params = useParams();
  const splat = params['*'] || '';
  const pathParts = splat.split('/').filter(Boolean);
  const jobId = pathParts[1];

  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { clockOutOfJob } = useJobClock(tenantId);

  if (!jobId) {
    return (
      <div className="p-6 text-center text-zinc-500">
        No Job ID specified.
      </div>
    );
  }

  const [job, setJob] = useState<Job | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // QC Input States
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteImages, setNoteImages] = useState<{ file: File; preview: string }[]>([]);
  const [filter, setFilter] = useState<'all' | 'unfinished' | 'pending' | 'verified' | 'rework'>('pending');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'details'>('list');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevTasksStateRef = useRef<string | null>(null);

  // Set page title
  useEffect(() => {
    setDynamicTitle('Quality Control Inspection');
    return () => setDynamicTitle(null);
  }, [setDynamicTitle]);

  // Scroll to top of scrollable main dashboard container when task changes (helpful for mobile scroll reset)
  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [selectedTaskId]);

  // Subscribe to Job
  useEffect(() => {
    if (!tenantId || !jobId) return;

    const unsub = onSnapshot(doc(db, `businesses/${tenantId}/jobs`, jobId), (snap) => {
      if (snap.exists()) {
        setJob({ id: snap.id, ...snap.data() });
      } else {
        toast.error('Job not found');
        navigate(`/business/${tenantId}/jobs`);
      }
    }, (err) => {
      console.error("Job listener error:", err);
      toast.error("You don't have permission to view this job.");
    });

    return () => unsub();
  }, [jobId, tenantId, navigate]);

  // Subscribe to Tasks
  useEffect(() => {
    if (!tenantId || !jobId) return;

    const unsub = onSnapshot(collection(db, `businesses/${tenantId}/jobs/${jobId}/tasks`), (snap) => {
      const taskList: Task[] = [];
      snap.forEach((d) => {
        taskList.push({ id: d.id, ...d.data() } as Task);
      });
      setTasks(taskList);
      setLoading(false);
    }, (err) => {
      console.error("Tasks listener error:", err);
      toast.error("Failed to load tasks.");
      setLoading(false);
    });

    return () => unsub();
  }, [jobId, tenantId]);

  // Fetch Vehicle details
  useEffect(() => {
    if (!tenantId || !job?.vehicleId) {
      setVehicle(null);
      return;
    }

    let active = true;
    const fetchVehicle = async () => {
      try {
        const vId = job.vehicleId;
        if (!vId) return;
        
        const directRef = doc(db, `businesses/${tenantId}/vehicles`, vId);
        const directSnap = await getDoc(directRef);
        if (directSnap.exists() && active) {
          setVehicle({ id: directSnap.id, ...directSnap.data() } as Vehicle);
          return;
        }

        const qVin = query(
          collection(db, `businesses/${tenantId}/vehicles`),
          where('vin', '==', vId.toUpperCase())
        );
        const snapVin = await getDocs(qVin);
        if (!snapVin.empty && active) {
          setVehicle({ id: snapVin.docs[0].id, ...snapVin.docs[0].data() } as Vehicle);
          return;
        }

        if (active) {
          setVehicle(null);
        }
      } catch (e) {
        console.error("Error fetching vehicle details:", e);
        if (active) setVehicle(null);
      }
    };

    fetchVehicle();
    return () => {
      active = false;
    };
  }, [tenantId, job?.vehicleId]);

  // Select the first task that needs QC if none is selected
  useEffect(() => {
    if (tasks.length > 0 && !selectedTaskId) {
      const firstQCTask = tasks.find(t => t.status === 'QC');
      if (firstQCTask) {
        setSelectedTaskId(firstQCTask.id);
      } else {
        const firstIncomplete = tasks.find(t => t.status !== 'QC Complete');
        if (firstIncomplete) {
          setSelectedTaskId(firstIncomplete.id);
        } else {
          setSelectedTaskId(tasks[0].id);
        }
      }
    }
  }, [tasks, selectedTaskId]);

  // Auto progression/regression of Job Status based on Tasks
  useEffect(() => {
    if (!job || tasks.length === 0) return;

    const nonGeneralTasks = tasks.filter(t => !isGeneralTask(t));
    if (nonGeneralTasks.length === 0) return;

    const allQCReady = nonGeneralTasks.every(t => t.status === 'QC' || t.status === 'QC Complete');
    const allQCComplete = nonGeneralTasks.every(t => t.status === 'QC Complete');

    // Check if tasks actually changed
    const currentTasksState = nonGeneralTasks.map(t => `${t.id}:${t.status}`).join(',');
    if (prevTasksStateRef.current === currentTasksState) return;
    prevTasksStateRef.current = currentTasksState;

    const updateJobStatus = async (newStatus: string, msg: string, isReversion = false) => {
      if (job.status === newStatus) return;
      try {
        const updateData: any = {
          status: newStatus,
          updatedAt: new Date()
        };
        if (newStatus === 'Ready for Customer') {
          updateData.readyForCustomerAt = new Date();
          updateData.readyForCustomerBy = user?.displayName || user?.email;
          updateData.readyForCustomerById = user?.uid;
        } else if (['Active', 'Open', 'Ready for QC'].includes(newStatus)) {
          updateData.readyForCustomerAt = null;
        }
        await updateDoc(doc(db, `businesses/${tenantId}/jobs`, jobId), updateData);
        if (isReversion) {
          toast.error(msg);
        } else {
          toast.success(msg);
        }

        if (newStatus === 'Ready for QC') {
          await assignQCStaffToJob(tenantId, jobId!);
        }
      } catch (e) {
        console.error("Auto-progression/regression error:", e);
      }
    };

    if (['Active', 'Open', 'Ready for QC'].includes(job.status || '')) {
      if (allQCComplete) {
        updateJobStatus('Ready for Customer', 'All tasks QC completed! Job status set to Ready for Customer.');
      } else if (allQCReady) {
        updateJobStatus('Ready for QC', 'All tasks ready for QC. Job status set to Ready for QC.');
      }
    }

    if (['Ready for Customer', 'Ready for QC'].includes(job.status || '')) {
      if (!allQCReady) {
        updateJobStatus('Active', 'Tasks sent to rework: Job status reverted to Active.', true);
      } else if (job.status === 'Ready for Customer' && !allQCComplete) {
        updateJobStatus('Ready for QC', 'QC tasks pending: Job status reverted to Ready for QC.', true);
      }
    }
  }, [tasks, job, tenantId, jobId]);

  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    setNoteImages(prev => [...prev, ...newImages]);
  };

  const handleRemoveImage = (index: number) => {
    setNoteImages(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleQCAction = async (action: 'pass' | 'fail') => {
    if (!selectedTaskId || !selectedTask || !job) return;

    setSubmitting(true);
    const nextStatus = action === 'pass' ? 'QC Complete' : 'Rework';

    try {
      // 1. Upload photos if any
      const uploadedUrls: string[] = [];
      for (const img of noteImages) {
        const storageRef = ref(
          storage, 
          `businesses/${tenantId}/tasks/${selectedTaskId}/qc_${Date.now()}_${img.file.name}`
        );
        const snapshot = await uploadBytes(storageRef, img.file);
        const url = await getDownloadURL(snapshot.ref);
        uploadedUrls.push(url);
      }

      // 2. Prepare task updates
      const updateData: any = {
        status: nextStatus,
        updatedAt: new Date().toISOString()
      };

      if (nextStatus === 'QC Complete') {
        updateData.qcCompletedAt = new Date().toISOString();
        updateData.qcCompletedBy = user?.displayName || user?.email || 'QC Inspector';
        // If task didn't already have completedByStaffId, credit the assigned technician, NEVER the QC Inspector!
        if (!selectedTask.completedByStaffId) {
          const assignedId = (Array.isArray(selectedTask.assignedStaffIds) && selectedTask.assignedStaffIds.length > 0)
            ? selectedTask.assignedStaffIds[0]
            : (selectedTask.assignedTechId || (Array.isArray(selectedTask.assignedStaff) && selectedTask.assignedStaff[0]?.id) || selectedTask.assignedTo);
          
          if (assignedId) {
            updateData.completedByStaffId = assignedId;
            updateData.completedByStaffName = selectedTask.assignedTechName || (Array.isArray(selectedTask.assignedStaff) && selectedTask.assignedStaff[0]?.name) || 'Technician';
            updateData.completedBy = updateData.completedByStaffName;
          }
        }
      } else {
        updateData.qcFailedAt = new Date().toISOString();
        updateData.qcFailedBy = user?.displayName || user?.email || 'QC Inspector';
      }

      // 3. Prepare QC note if note text or images exist
      if (noteText.trim() || uploadedUrls.length > 0) {
        const newNoteObj: TaskNote = {
          id: crypto.randomUUID(),
          message: `[QC ${action === 'pass' ? 'VERIFIED' : 'FAILED'}] ${noteText.trim()}`,
          images: uploadedUrls,
          createdAt: new Date().toISOString(),
          createdByUid: user?.uid || '',
          createdByName: user?.displayName || user?.email || 'QC Inspector'
        };
        updateData.task_notes = [...(selectedTask.task_notes || []), newNoteObj];
      }

      // 4. Update task in Firestore
      const taskRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/tasks`, selectedTaskId);
      await updateDoc(taskRef, updateData);

      // 5. Auto clock out anyone on this task
      await clockOutOfJob(jobId!, selectedTaskId);

      // Double check active time clock sessions
      const q = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where("status", "==", "active")
      );
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(async (sessionDoc) => {
        const data = sessionDoc.data();
        const jobsList = data.jobs || [];
        let updated = false;
        const updatedJobs = jobsList.map((j: any) => {
          if (!j.end && j.id === jobId && j.taskId === selectedTaskId) {
            updated = true;
            return { ...j, end: new Date() };
          }
          return j;
        });
        if (updated) {
          await updateDoc(sessionDoc.ref, {
            jobs: updatedJobs,
            jobIds: Array.from(new Set(updatedJobs.map((j: any) => j.id))),
            updatedAt: serverTimestamp()
          });
        }
      }));

      // 6. Sync note photos to CompanyCam if enabled
      const ccProjectId = job.companyCamId || job.companyCamProjectId;
      if (ccProjectId && uploadedUrls.length > 0) {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const apiBase = isLocal 
          ? 'http://localhost:5001/saegroup-c6487/us-central1/api'
          : 'https://us-central1-saegroup-c6487.cloudfunctions.net/api';

        auth.currentUser?.getIdToken().then(token => {
          fetch(`${apiBase}/jobs/${jobId}/companycam-photos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'x-tenant-id': tenantId
            },
            body: JSON.stringify({ urls: uploadedUrls })
          }).catch(err => console.error("CompanyCam upload error:", err));
        });
      }

      toast.success(`Task "${selectedTask.title}" marked as ${action === 'pass' ? 'Passed' : 'Failed (Rework)'}`);
      
      // Reset input states
      setNoteText('');
      setNoteImages([]);

      // 7. Auto-advance to the next pending QC task
      const pendingTasks = tasks.filter(t => t.status === 'QC' && t.id !== selectedTaskId);
      if (pendingTasks.length > 0) {
        setSelectedTaskId(pendingTasks[0].id);
      } else {
        // If no pending QC, select the next incomplete task
        const incompleteTasks = tasks.filter(t => t.status !== 'QC Complete' && t.id !== selectedTaskId);
        if (incompleteTasks.length > 0) {
          setSelectedTaskId(incompleteTasks[0].id);
        } else {
          // If all tasks are QC Complete, return to list view on mobile
          setMobileView('list');
        }
      }

    } catch (err) {
      console.error(err);
      toast.error('Failed to submit Quality Control status.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-zinc-500 text-sm font-medium">Loading Quality Control Dashboard...</p>
      </div>
    );
  }

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    if (filter === 'pending') return t.status === 'QC';
    if (filter === 'verified') return t.status === 'QC Complete';
    if (filter === 'rework') return t.status === 'Rework';
    if (filter === 'unfinished') return t.status !== 'QC' && t.status !== 'QC Complete' && t.status !== 'Rework';
    return true;
  });

  const totalTasks = tasks.length;
  const qcCompleteCount = tasks.filter(t => t.status === 'QC Complete').length;
  const qcPendingCount = tasks.filter(t => t.status === 'QC').length;
  const reworkCount = tasks.filter(t => t.status === 'Rework').length;
  const unfinishedCount = tasks.filter(t => t.status !== 'QC' && t.status !== 'QC Complete' && t.status !== 'Rework').length;
  const completionPercentage = totalTasks > 0 ? Math.round((qcCompleteCount / totalTasks) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      {/* Back to Job and Job Header Info */}
      <div className="flex flex-col gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => navigate(`/business/${tenantId}/job/${jobId}`)}
            className="flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Job Details
          </button>

          <span className={cn(
            "px-3 py-1 rounded-full text-xs font-black uppercase border tracking-wider",
            job.status === 'Ready for Customer' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25" :
            job.status === 'Ready for QC' ? "bg-amber-500/10 text-amber-600 border-amber-500/25" :
            job.status === 'Active' ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/25" :
            "bg-zinc-500/10 text-zinc-600 border-zinc-500/25"
          )}>
            Job: {job.status}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-center">
          <div className="space-y-1 md:col-span-2">
            <h1 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex items-baseline gap-2">
              {job.jobNumber && <span className="text-indigo-600 dark:text-indigo-400">#{job.jobNumber}</span>}
              <span>{job.title}</span>
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
              Customer: <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{job.customerName || 'N/A'}</span>
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Vehicle Details</p>
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'No Details' : 'Loading vehicle...'}
            </p>
            {vehicle?.vin && (
              <p className="text-xs text-zinc-500 dark:text-zinc-500 font-mono select-all">
                VIN: {vehicle.vin}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-baseline text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              <span>QC PROGRESS</span>
              <span className="text-zinc-800 dark:text-zinc-200">{qcCompleteCount} / {totalTasks} Tasks</span>
            </div>
            <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Split Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column - Task List */}
        <div className={cn(
          "lg:col-span-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-sm",
          mobileView === 'details' ? "hidden lg:block" : "block"
        )}>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-zinc-900 dark:text-white">Tasks List</h3>
            <span className="text-xs font-bold px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-md">
              {filteredTasks.length}
            </span>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-1 p-1 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-150 dark:border-zinc-850">
            <button
              onClick={() => setFilter('all')}
              className={cn(
                "flex-1 text-center py-1.5 px-2 text-xs font-bold rounded-lg transition-all",
                filter === 'all' 
                  ? "bg-white dark:bg-zinc-850 text-zinc-950 dark:text-white shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unfinished')}
              className={cn(
                "flex-1 text-center py-1.5 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1",
                filter === 'unfinished' 
                  ? "bg-white dark:bg-zinc-850 text-zinc-950 dark:text-white shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              Not Finished
              {unfinishedCount > 0 && (
                <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 rounded-full">
                  {unfinishedCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={cn(
                "flex-1 text-center py-1.5 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1",
                filter === 'pending' 
                  ? "bg-white dark:bg-zinc-850 text-zinc-950 dark:text-white shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              Pending
              {qcPendingCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setFilter('verified')}
              className={cn(
                "flex-1 text-center py-1.5 px-2 text-xs font-bold rounded-lg transition-all",
                filter === 'verified' 
                  ? "bg-white dark:bg-zinc-850 text-zinc-950 dark:text-white shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              Verified
            </button>
            <button
              onClick={() => setFilter('rework')}
              className={cn(
                "flex-1 text-center py-1.5 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1",
                filter === 'rework' 
                  ? "bg-white dark:bg-zinc-850 text-zinc-950 dark:text-white shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              Rework
              {reworkCount > 0 && (
                <span className="text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1.5 rounded-full">
                  {reworkCount}
                </span>
              )}
            </button>
          </div>

          {/* Scrollable Tasks */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredTasks.length === 0 ? (
              <div className="text-center py-8 text-zinc-400 text-xs">
                No tasks match this filter.
              </div>
            ) : (
              filteredTasks.map((t) => {
                const isSelected = t.id === selectedTaskId;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTaskId(t.id);
                      setNoteText('');
                      setNoteImages([]);
                      setMobileView('details');
                    }}
                    className={cn(
                      "w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-1.5",
                      isSelected 
                        ? "bg-indigo-50/55 dark:bg-indigo-950/20 border-indigo-500/30 dark:border-indigo-500/40 ring-1 ring-indigo-500/20" 
                        : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-850 hover:border-zinc-300 dark:hover:border-zinc-700"
                    )}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-sm text-zinc-900 dark:text-white line-clamp-2">
                        {t.title}
                      </span>
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-black uppercase border tracking-wider flex-shrink-0",
                        t.status === 'QC' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25" :
                        t.status === 'QC Complete' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25" :
                        t.status === 'Rework' ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25" :
                        "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/25"
                      )}>
                        {t.status === 'QC' ? 'Pending QC' : t.status === 'QC Complete' ? 'Verified' : t.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                      <span>{t.taskGroup || 'General'}</span>
                      {t.bookTime && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {t.bookTime} hrs
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column - QC Workspace */}
        <div className={cn(
          "lg:col-span-8 space-y-6",
          mobileView === 'list' ? "hidden lg:block" : "block"
        )}>
          {selectedTask && (
            <button 
              onClick={() => setMobileView('list')}
              className="lg:hidden flex items-center gap-2 px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-bold bg-zinc-50 dark:bg-zinc-950 w-full justify-center shadow-sm transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Tasks List
            </button>
          )}

          {!selectedTask ? (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-12 text-center shadow-sm flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 mb-4">
                <ClipboardCheck className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg text-zinc-900 dark:text-white mb-1">Select a Task</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
                Choose a task from the list on the left to begin quality control inspection.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Task Details Card */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-sm">
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                      {selectedTask.taskGroup || 'General Labor'}
                    </span>
                    <h2 className="text-xl font-black text-zinc-900 dark:text-white leading-snug">
                      {selectedTask.title}
                    </h2>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {selectedTask.bookTime && (
                      <div className="flex items-center gap-1 text-xs font-bold bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-xl text-zinc-600 dark:text-zinc-300">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{selectedTask.bookTime} Hours</span>
                      </div>
                    )}
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-black uppercase border tracking-wider",
                      selectedTask.status === 'QC' ? "bg-amber-500/10 text-amber-600 border-amber-500/25" :
                      selectedTask.status === 'QC Complete' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25" :
                      selectedTask.status === 'Rework' ? "bg-rose-500/10 text-rose-600 border-rose-500/25" :
                      "bg-zinc-500/10 text-zinc-600 border-zinc-500/25"
                    )}>
                      {selectedTask.status === 'QC' ? 'Pending QC' : selectedTask.status === 'QC Complete' ? 'Verified' : selectedTask.status}
                    </span>
                  </div>
                </div>

                {selectedTask.description && (
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-850 text-sm text-zinc-600 dark:text-zinc-400">
                    <p className="font-bold text-zinc-800 dark:text-zinc-200 mb-1 text-xs uppercase tracking-wider">Instructions</p>
                    <p className="whitespace-pre-line">{selectedTask.description}</p>
                  </div>
                )}

                {/* Assigned Technicians */}
                {(selectedTask.completedBy || selectedTask.completedByStaffName) && (
                  <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                    <User className="w-4 h-4 text-indigo-500" />
                    <span>Completed by:</span>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                      {selectedTask.completedByStaffName || selectedTask.completedBy}
                    </span>
                    {selectedTask.completedAt && (
                      <span className="text-zinc-400">
                        on {new Date(selectedTask.completedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Task History (Previous Notes & Photos) */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-sm">
                <h3 className="font-bold text-zinc-900 dark:text-white flex items-center justify-between gap-2 w-full">
                  <span className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-500" />
                    Staff Notes & Photos
                  </span>
                  {selectedTask.task_notes && selectedTask.task_notes.length > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-355 rounded-md">
                      {selectedTask.task_notes.length}
                    </span>
                  )}
                </h3>

                {(!selectedTask.task_notes || selectedTask.task_notes.length === 0) ? (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 italic py-2">
                    No notes or photos have been logged on this task yet.
                  </p>
                ) : (
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                    {selectedTask.task_notes.map((note) => {
                      const msg = typeof note?.message === 'string' ? note.message : (typeof (note as any)?.note === 'string' ? (note as any).note : '');
                      const isFail = msg.startsWith('[QC FAILED]');
                      const isPass = msg.startsWith('[QC VERIFIED]');
                      
                      return (
                        <div 
                          key={note.id} 
                          className={cn(
                            "p-4 rounded-xl border text-sm space-y-2",
                            isPass ? "bg-emerald-500/5 border-emerald-500/10" :
                            isFail ? "bg-rose-500/5 border-rose-500/10" :
                            "bg-zinc-50 dark:bg-zinc-950 border-zinc-100 dark:border-zinc-850"
                          )}
                        >
                          <div className="flex justify-between items-center text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="font-bold text-zinc-800 dark:text-zinc-200">
                              {note.createdByName}
                            </span>
                            <span>
                              {new Date(note.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                            {note.message}
                          </p>

                          {note.images && note.images.length > 0 && (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-2">
                              {note.images.map((imgUrl, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setLightboxImage(imgUrl)}
                                  className="relative aspect-square rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 group hover:ring-2 hover:ring-indigo-500 transition-all"
                                >
                                  <img 
                                    src={imgUrl} 
                                    alt="Task attachment" 
                                    className="object-cover w-full h-full"
                                  />
                                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                                    <Maximize2 className="w-4 h-4 text-white" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Perform Quality Control Inspection Form */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-6 shadow-sm">
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white">Quality Control Inspection</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Verify this task has been completed correctly, or fail it to request rework.
                  </p>
                </div>

                {/* Note Area */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Inspection Notes / Feedback
                  </label>
                  <textarea
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Enter any feedback or notes. Recommended if failing the task."
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-zinc-800 dark:text-zinc-100"
                  />
                </div>

                {/* Photo Uploader */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
                    Attach Photo
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Upload Dropzone */}
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 dark:hover:border-indigo-500/50 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all bg-zinc-50/50 dark:bg-zinc-950/20 group"
                    >
                      <div className="w-10 h-10 bg-white dark:bg-zinc-900 rounded-full flex items-center justify-center text-zinc-400 group-hover:text-indigo-500 transition-all shadow-sm border border-zinc-100 dark:border-zinc-800">
                        <Camera className="w-5 h-5" />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          Take Photo or Upload
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          Camera, PNG, JPG up to 10MB
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                    </div>

                    {/* Preview Area */}
                    {noteImages.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 border border-zinc-150 dark:border-zinc-850 p-2 rounded-xl bg-zinc-50/30 dark:bg-zinc-950/10">
                        {noteImages.map((img, idx) => (
                          <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 group">
                            <img 
                              src={img.preview} 
                              alt="preview" 
                              className="object-cover w-full h-full"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(idx)}
                              className="absolute top-1 right-1 bg-red-650 hover:bg-red-700 text-white p-1.5 rounded-md opacity-90 hover:opacity-100 shadow-sm transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center text-center bg-zinc-50/20 dark:bg-zinc-950/5 text-zinc-400">
                        <ImageIcon className="w-5 h-5 opacity-60 mb-1" />
                        <span className="text-[10px] font-medium">No photos attached</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    disabled={submitting}
                    onClick={() => handleQCAction('fail')}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3.5 px-6 rounded-xl font-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-600/10 disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                    <span>Fail & Send to Rework</span>
                  </button>

                  <button
                    disabled={submitting}
                    onClick={() => handleQCAction('pass')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 px-6 rounded-xl font-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10 disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                    <span>Verify & Pass</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <button 
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full transition-all"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-4xl max-h-[85vh] overflow-hidden rounded-xl border border-white/10 shadow-2xl">
            <img 
              src={lightboxImage} 
              alt="Enlarged view" 
              className="object-contain max-w-full max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
